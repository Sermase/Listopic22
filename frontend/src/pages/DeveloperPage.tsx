import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useJefeClaim } from '../hooks/useJefeClaim';
import { useUserProfile } from '../hooks/useUserProfile';
import { PlaceService } from '../services/PlaceService';
import { BADGE_PRESET_PACKS } from '../config/badgePresets';
import { db, functions, storage } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, getDocFromServer, limit as firestoreLimit, setDoc, deleteDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useQueryClient } from '@tanstack/react-query';
import { Terminal, Search, AlertCircle, RefreshCw, List as ListIcon, MapPin, Layers, Database, CloudLightning, Tag, CheckCircle, X, Upload, Palette, Users, SlidersHorizontal, ClipboardList } from 'lucide-react';
import { invalidateDoc } from '../lib/queryCache';
import { useDeveloperPendingCounts } from '../hooks/useDeveloperInbox';
import { DeveloperSidebar } from '../components/developer/DeveloperSidebar';
import { developerTabLabel } from '../components/developer/developerNav';
import {
    buildTabSearchParams,
    mergeNavigateParams,
    parseDeveloperTab,
    readDeveloperUrlState,
    type DeveloperNavigateParams,
    type DeveloperTabProps,
    type GoToTab,
} from '../components/developer/developerTabs';

const FUNCTIONS_REGION = 'europe-west1';

const BrandingManager = React.lazy(() => import('../components/developer/BrandingManager').then(module => ({ default: module.BrandingManager })));
const ListsManagerTab = React.lazy(() => import('../components/developer/ListsManagerTab').then(module => ({ default: module.ListsManagerTab })));
const PlacesManagerTab = React.lazy(() => import('../components/developer/PlacesManagerTab').then(module => ({ default: module.PlacesManagerTab })));
const ReviewsManagerTab = React.lazy(() => import('../components/developer/ReviewsManagerTab').then(module => ({ default: module.ReviewsManagerTab })));
const TagsManagerTab = React.lazy(() => import('../components/developer/TagsManagerTab').then(module => ({ default: module.TagsManagerTab })));
const UsersManagerTab = React.lazy(() => import('../components/developer/UsersManagerTab').then(module => ({ default: module.UsersManagerTab })));
const DeveloperItemModal = React.lazy(() => import('../components/developer/DeveloperItemModal').then(module => ({ default: module.DeveloperItemModal })));
const UserDataExportTab = React.lazy(() => import('../components/developer/UserDataExportTab').then(module => ({ default: module.UserDataExportTab })));
const ApiUsageTab = React.lazy(() => import('../components/developer/ApiUsageTab').then(module => ({ default: module.ApiUsageTab })));
const PageAnalyticsTab = React.lazy(() => import('../components/developer/PageAnalyticsTab').then(module => ({ default: module.PageAnalyticsTab })));
const GeoAnalyticsTab = React.lazy(() => import('../components/developer/GeoAnalyticsTab').then(module => ({ default: module.GeoAnalyticsTab })));
const PendingInboxTab = React.lazy(() => import('../components/developer/PendingInboxTab').then(module => ({ default: module.PendingInboxTab })));
const ReportsTab = React.lazy(() => import('../components/developer/ReportsTab').then(module => ({ default: module.ReportsTab })));
const BusinessClaimsManagerTab = React.lazy(() => import('../components/developer/BusinessClaimsManagerTab').then(module => ({ default: module.BusinessClaimsManagerTab })));
const BusinessManagersTab = React.lazy(() => import('../components/developer/BusinessManagersTab').then(module => ({ default: module.BusinessManagersTab })));
const PlansManagerTab = React.lazy(() => import('../components/developer/PlansManagerTab').then(module => ({ default: module.PlansManagerTab })));
const ProProposalsTab = React.lazy(() => import('../components/developer/ProProposalsTab').then(module => ({ default: module.ProProposalsTab })));
const BackupsTab = React.lazy(() => import('../components/developer/BackupsTab').then(module => ({ default: module.BackupsTab })));
const ReviewsConsolidationCard = React.lazy(() => import('../components/developer/ReviewsConsolidationCard').then(module => ({ default: module.ReviewsConsolidationCard })));

const DeveloperTabFallback: React.FC = () => (
    <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)]/60 p-8 text-center text-sm text-gray-400">
        Cargando herramienta...
    </div>
);

const DeveloperLazyPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <React.Suspense fallback={<DeveloperTabFallback />}>
        {children}
    </React.Suspense>
);

interface ConsoleSearchParams {
    collection: string;
    id?: string;
    user?: string;
    nameContains?: string;
    googleId?: string;
    limit: number;
}

export const DeveloperPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { user, isJefe, loading: loadingAuth } = useAuth();
    useUserProfile(user?.uid);
    const [searchParams, setSearchParams] = useSearchParams();
    // La URL decide la pestaña en cada render (enlaces de emails y notificaciones,
    // también estando ya dentro de /developer). claimId = alias antiguo de focus.
    const { tab: activeTab, view: tabView, status: tabStatus, focus: tabFocus } = readDeveloperUrlState(searchParams);
    // Reactive: un usuario al que se le acaba de quitar el rol 'jefe' pierde
    // acceso inmediatamente sin recargar la página.
    const isAuthorized: boolean | null = loadingAuth ? null : isJefe;
    // Claim `admin` del token: sin él, las reglas no reconocen al jefe (ver hooks/useJefeClaim).
    const jefeClaim = useJefeClaim(user, Boolean(isJefe));
    // Contadores de la barra lateral: las reglas piden el claim admin, así que se espera a tenerlo.
    const pendingCounts = useDeveloperPendingCounts(jefeClaim.status === 'ready');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const mainRef = useRef<HTMLElement>(null);

    /** Cambia de pestaña (push): descarta view/status/focus/path de la anterior. */
    const goToTab = useCallback<GoToTab>((tab, params) => {
        // Volver a pulsar la pestaña actual la reinicia sin añadir otra entrada al historial.
        const sameTab = parseDeveloperTab(tab) === activeTab;
        setSearchParams((current) => buildTabSearchParams(current, tab, params), { replace: sameTab });
        setIsSidebarOpen(false);
    }, [setSearchParams, activeTab]);

    /** view/status/focus de la pestaña actual (replace: no llena el historial). */
    const navigateWithinTab = useCallback((params: DeveloperNavigateParams) => {
        setSearchParams((current) => mergeNavigateParams(current, params), { replace: true });
    }, [setSearchParams]);

    const tabContract = useMemo<DeveloperTabProps>(() => ({
        focusId: tabFocus,
        view: tabView,
        status: tabStatus,
        onNavigate: navigateWithinTab,
    }), [tabFocus, tabView, tabStatus, navigateWithinTab]);

    // Al cambiar de pestaña, el contenido empieza arriba.
    useEffect(() => {
        mainRef.current?.scrollTo?.({ top: 0 });
    }, [activeTab]);

    // Other Settings State
    const [otherSettings, setOtherSettings] = useState({
        showRandomChoiceButton: true,
        showProfileFavoriteBadge: true,
        showAffinityCarousel: true,
        showProfileAffinity: true,
        homeReviewsMonths: 12,
        showLab: false,
        showWeeklyDuel: false,
        showTastePassport: false,
        listTitlePlaceFirst: true,
    });
    const [otherSettingsLoading, setOtherSettingsLoading] = useState(false);
    const [otherSettingsSaving, setOtherSettingsSaving] = useState(false);
    const [otherSettingsMessage, setOtherSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Console State
    const [consoleParams, setConsoleParams] = useState<ConsoleSearchParams>({
        collection: 'lists',
        limit: 100
    });
    const [consoleResults, setConsoleResults] = useState<any[]>([]);
    const [loadingConsole, setLoadingConsole] = useState(false);
    const [consoleError, setConsoleError] = useState<string | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);


    // Audit Log State
    const [auditEntries, setAuditEntries] = useState<any[]>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);

    // Algolia State
    const [algoliaLog, setAlgoliaLog] = useState<string[]>([]);
    const [processingAlgolia, setProcessingAlgolia] = useState(false);

    // Maintenance State
    const [targetListId, setTargetListId] = useState('');
    const [targetPlaceId, setTargetPlaceId] = useState('');
    const [maintenanceLog, setMaintenanceLog] = useState<string[]>([]);
    const [processingMaintenance, setProcessingMaintenance] = useState(false);



    // Badge Management State
    const [badges, setBadges] = useState<any[]>([]);
    const [loadingBadges, setLoadingBadges] = useState(false);
    const [editingBadge, setEditingBadge] = useState<any | null>(null);
    const [badgeModalOpen, setBadgeModalOpen] = useState(false);
    const [importingBadgePackId, setImportingBadgePackId] = useState<string | null>(null);


    // isAuthorized ahora viene de AuthContext.isJefe (reactivo); el chequeo
    // anterior con profile one-shot se ha eliminado intencionadamente.

    const handleConsoleSearch = async () => {
        setLoadingConsole(true);
        setConsoleError(null);
        setConsoleResults([]);

        try {
            const { collection: colName, id, user: userId, nameContains, googleId, limit: limitVal } = consoleParams;

            if (id) {
                const docRef = doc(db, colName, id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setConsoleResults([{ id: docSnap.id, ...docSnap.data() }]);
                } else {
                    setConsoleResults([]);
                }
                setLoadingConsole(false);
                return;
            }

            let q = query(collection(db, colName));

            if (colName === 'places') {
                if (googleId) q = query(q, where('googlePlaceId', '==', googleId));
                if (userId) q = query(q, where('createdByUserId', '==', userId));
            } else if (colName === 'lists') {
                if (userId) q = query(q, where('userId', '==', userId));
            } else if (colName === 'users') {
                if (userId) q = query(q, where('emailLowerCase', '==', userId.toLowerCase())); // specific case from legacy
            } else if (colName === 'listForums') {
                if (userId) q = query(q, where('ownerId', '==', userId));
            }

            // Apply limit
            q = query(q, firestoreLimit(limitVal || 50));

            const snap = await getDocs(q);
            let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (nameContains) {
                const term = nameContains.toLowerCase();
                results = results.filter((r: any) => {
                    const name = (r.name || r.displayName || r.title || '').toLowerCase();
                    return name.includes(term);
                });
            }

            setConsoleResults(results);

        } catch (err: any) {
            console.error("Search error:", err);
            setConsoleError(err.message);
        } finally {
            setLoadingConsole(false);
        }
    };

    const runAlgoliaSync = async (target: string | null) => {
        const collections = target ? [target] : ['lists', 'places', 'users', 'grouped_items'];
        if (!window.confirm(`¿Estás seguro de que quieres sincronizar ${target || 'TODO (lists, places, users, grouped_items)'} con Algolia?`)) return;

        setProcessingAlgolia(true);
        const functions = getFunctions(undefined, FUNCTIONS_REGION);
        const adminBackfillAlgolia = httpsCallable(functions, 'adminBackfillAlgolia');

        try {
            for (const col of collections) {
                setAlgoliaLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando sync de ${col}...`, ...prev]);

                const result = await adminBackfillAlgolia({ collectionName: col });
                const data: any = result.data;

                setAlgoliaLog(prev => [`[${new Date().toLocaleTimeString()}] Éxito ${col}: ${JSON.stringify(data)}`, ...prev]);
            }
        } catch (err: any) {
            setAlgoliaLog(prev => [`[${new Date().toLocaleTimeString()}] Error: ${err.message}`, ...prev]);
        } finally {
            setProcessingAlgolia(false);
        }
    };

    const configureAlgoliaIndexes = async () => {
        if (!window.confirm('¿Configurar settings y réplicas de Algolia sin reindexar datos?')) return;

        setProcessingAlgolia(true);
        const functions = getFunctions(undefined, FUNCTIONS_REGION);
        const adminBackfillAlgolia = httpsCallable(functions, 'adminBackfillAlgolia');

        try {
            setAlgoliaLog(prev => [`[${new Date().toLocaleTimeString()}] Configurando settings y réplicas...`, ...prev]);
            const result = await adminBackfillAlgolia({ collectionName: '__settings' });
            const data: any = result.data;
            setAlgoliaLog(prev => [`[${new Date().toLocaleTimeString()}] Settings OK: ${JSON.stringify(data)}`, ...prev]);
        } catch (err: any) {
            const details = err?.details ? ` | ${JSON.stringify(err.details)}` : '';
            setAlgoliaLog(prev => [`[${new Date().toLocaleTimeString()}] Error settings: ${err.message}${details}`, ...prev]);
        } finally {
            setProcessingAlgolia(false);
        }
    };

    const handleRecalculateList = async () => {
        if (!targetListId) return;
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando recálculo para lista: ${targetListId}...`, ...prev]);

        try {
            const functions = getFunctions(undefined, FUNCTIONS_REGION);
            // Una sola llamada: adminUpdateSingleListAggregates ya recalcula medias,
            // criterios y contadores con el cálculo único (antes se llamaba también
            // a adminRecalculateListAverages, que repetía lo mismo).
            const updateAggregates = httpsCallable(functions, 'adminUpdateSingleListAggregates');

            setMaintenanceLog(prev => [`... Llamando adminUpdateSingleListAggregates...`, ...prev]);
            const res2: any = await updateAggregates({ listId: targetListId });
            setMaintenanceLog(prev => [`✅ Aggregates: ${JSON.stringify(res2.data)}`, ...prev]);

            setMaintenanceLog(prev => [`✨ COMPLETADO para ${targetListId}`, ...prev]);

        } catch (error: any) {
            console.error('Error recalculating list:', error);
            setMaintenanceLog(prev => [`❌ Error: ${error.message}`, ...prev]);
        } finally {
            setProcessingMaintenance(false);
        }
    };

    const handleRecalculatePlace = async () => {
        if (!targetPlaceId) return;
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando recálculo para lugar: ${targetPlaceId}...`, ...prev]);

        try {
            const functions = getFunctions(undefined, FUNCTIONS_REGION);
            const recalculatePlace = httpsCallable(functions, 'adminRecalculatePlaceStats');

            setMaintenanceLog(prev => [`... Llamando adminRecalculatePlaceStats...`, ...prev]);
            const res: any = await recalculatePlace({ placeId: targetPlaceId });
            setMaintenanceLog(prev => [`✅ Resultado: ${JSON.stringify(res.data)}`, ...prev]);
            setMaintenanceLog(prev => [`✨ COMPLETADO para lugar ${targetPlaceId}`, ...prev]);

        } catch (error: any) {
            console.error('Error recalculating place:', error);
            setMaintenanceLog(prev => [`❌ Error: ${error.message}`, ...prev]);
        } finally {
            setProcessingMaintenance(false);
        }
    };

    const handleGlobalRecalculate = async (type: 'lists' | 'places' | 'users') => {
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando recálculo GLOBAL para: ${type.toUpperCase()}...`, ...prev]);

        try {
            const functions = getFunctions(undefined, FUNCTIONS_REGION);
            // Decide function based on type
            let fnName = '';
            if (type === 'lists') fnName = 'adminRecalculateAllLists';
            else if (type === 'places') fnName = 'adminRecalculateAllPlaces';
            else if (type === 'users') fnName = 'adminRecalculateAllUsers';

            const bulkFn = httpsCallable(functions, fnName);

            setMaintenanceLog(prev => [`... Llamando ${fnName} ...`, ...prev]);
            const res: any = await bulkFn();
            setMaintenanceLog(prev => [`✅ Resultado Global (${type}): ${JSON.stringify(res.data)}`, ...prev]);
            setMaintenanceLog(prev => [`✨ MANTENIMIENTO GLOBAL COMPLETADO para ${type}`, ...prev]);

        } catch (error: any) {
            console.error(`Error filtering ${type}:`, error);
            setMaintenanceLog(prev => [`❌ Error Global: ${error.message}`, ...prev]);
        } finally {
            setProcessingMaintenance(false);
        }
    };

    const handleBackfillPublicProfiles = async () => {
        if (!confirm('¿Regenerar publicProfiles desde users para que vuelvan a cargar las páginas de usuarios?')) return;
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando backfill de publicProfiles...`, ...prev]);

        try {
            const fns = getFunctions(undefined, FUNCTIONS_REGION);
            const backfillFn = httpsCallable(fns, 'adminBackfillPublicProfiles');
            const res: any = await backfillFn();
            setMaintenanceLog(prev => [`✅ publicProfiles regenerados: ${JSON.stringify(res.data)}`, ...prev]);
        } catch (error: any) {
            console.error('Error backfilling public profiles:', error);
            setMaintenanceLog(prev => [`❌ Error publicProfiles: ${error.message}`, ...prev]);
        } finally {
            setProcessingMaintenance(false);
        }
    };

    const handleRecalculateEverything = async () => {
        if (!confirm("¿Estás seguro de que quieres recalcular TODO (Listas, Lugares y Usuarios)? Esto puede tardar un rato.")) return;

        // Chain them sequentially
        await handleGlobalRecalculate('lists');
        await handleGlobalRecalculate('places');
        await handleGlobalRecalculate('users');

        setMaintenanceLog(prev => [`🎉🎉 MANTENIMIENTO TOTAL COMPLETADO 🎉🎉`, ...prev]);
    };



    // Copia el rol (bot, crítico…) de cada persona a sus valoraciones. Lo hace el
    // servidor (propagateAuthorFieldsToReviews), una persona cada vez: antes el
    // navegador recorría y escribía todas las valoraciones una a una.
    const handleBackfillAuthorUserType = async () => {
        if (!confirm('¿Copiar el tipo de usuario de cada persona a sus valoraciones? Lo hace el servidor, persona a persona.')) return;
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando backfill de authorUserType...`, ...prev]);
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const propagate = httpsCallable<{ userId: string; fields: { authorUserType: unknown } }, { updated?: number }>(
                getFunctions(undefined, FUNCTIONS_REGION), 'propagateAuthorFieldsToReviews', { timeout: 540000 },
            );
            let users = 0, reviews = 0, failed = 0;
            for (const userDoc of usersSnap.docs) {
                const userType = userDoc.data().userType;
                if (userType === undefined) continue;
                try {
                    const res = await propagate({ userId: userDoc.id, fields: { authorUserType: userType } });
                    users++;
                    reviews += res.data?.updated || 0;
                } catch (err) {
                    failed++;
                    setMaintenanceLog(prev => [`⚠️ ${userDoc.id}: ${err instanceof Error ? err.message : String(err)}`, ...prev]);
                }
            }
            setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] ✅ Backfill completado: ${users} personas · ${reviews} valoraciones · ${failed} errores.`, ...prev]);
        } catch (err: any) {
            setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] ❌ Error: ${err.message}`, ...prev]);
        } finally {
            setProcessingMaintenance(false);
        }
    };

    // --- Provision Admin Claim ---
    const [provisioningClaim, setProvisioningClaim] = useState(false);
    const [provisionClaimMessage, setProvisionClaimMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleProvisionAdminClaim = async () => {
        if (!confirm('¿Provisionar el custom claim admin:true para tu usuario? Necesitarás hacerlo una sola vez para poder subir archivos a Storage.')) return;
        setProvisioningClaim(true);
        setProvisionClaimMessage(null);
        try {
            const fns = getFunctions(undefined, FUNCTIONS_REGION);
            const provisionFn = httpsCallable(fns, 'adminProvisionJefeClaim');
            await provisionFn();
            // Force token refresh so the new claim is included
            if (user) await user.getIdToken(true);
            setProvisionClaimMessage({ type: 'success', text: '✅ Claim admin:true establecido. El token se ha refrescado — ahora puedes subir archivos.' });
            setMaintenanceLog(prev => [`✅ adminProvisionJefeClaim: claim admin:true establecido y token refrescado`, ...prev]);
        } catch (error: any) {
            console.error('Error provisioning claim:', error);
            setProvisionClaimMessage({ type: 'error', text: `❌ Error: ${error.message}` });
            setMaintenanceLog(prev => [`❌ adminProvisionJefeClaim error: ${error.message}`, ...prev]);
        } finally {
            setProvisioningClaim(false);
        }
    };

    // --- Badge Management Functions ---
    const fetchBadges = async () => {
        setLoadingBadges(true);
        try {
            const q = query(collection(db, 'badges'));
            const snap = await getDocs(q);
            setBadges(
                snap.docs.map((d) => {
                    const data: any = d.data();
                    return {
                        id: d.id,
                        ...data,
                        description: data.description || data.descriptionPublic || '',
                        descriptionPublic: data.descriptionPublic || data.description || '',
                    };
                }),
            );
        } catch (error) {
            console.error("Error fetching badges:", error);
        } finally {
            setLoadingBadges(false);
        }
    };

    const handleSaveBadge = async (badgeData: any) => {
        try {
            const { id, ...data } = badgeData;
            if (id) {
                const normalizedData = {
                    ...data,
                    description: data.description || data.descriptionPublic || '',
                    descriptionPublic: data.descriptionPublic || data.description || '',
                };
                await setDoc(doc(db, 'badges', id), normalizedData, { merge: true });
            }
            fetchBadges();
            setBadgeModalOpen(false);
        } catch (error) {
            console.error("Error saving badge:", error);
            alert("Error saving badge");
        }
    };

    const handleImportBadgePack = async (packId: string) => {
        const pack = BADGE_PRESET_PACKS.find((item) => item.id === packId);
        if (!pack) return;

        if (!confirm(`Importar ${pack.badges.length} medallas del pack "${pack.name}"? Las existentes se actualizaran.`)) {
            return;
        }

        setImportingBadgePackId(packId);
        try {
            await Promise.all(
                pack.badges.map((badge) =>
                    setDoc(doc(db, 'badges', badge.id), badge, { merge: true }),
                ),
            );
            await fetchBadges();
            alert(`Pack "${pack.name}" importado.`);
        } catch (error: any) {
            console.error('Error importing badge pack:', error);
            alert(`Error importando pack: ${error?.message || 'desconocido'}`);
        } finally {
            setImportingBadgePackId(null);
        }
    };

    const handleManualBadgeAction = async (action: 'award' | 'revoke') => {
        const uid = (document.getElementById('manualAssignUserId') as HTMLInputElement | null)?.value?.trim();
        const badgeId = (document.getElementById('manualAssignBadgeId') as HTMLSelectElement | null)?.value?.trim();
        if (!uid || !badgeId) {
            alert('Faltan datos');
            return;
        }

        const verb = action === 'award' ? 'Asignar' : 'Revocar';
        if (!confirm(`¿${verb} ${badgeId} a ${uid}?`)) return;

        try {
            const adminManageBadge = httpsCallable(functions, 'adminManageBadge');
            await adminManageBadge({ userId: uid, badgeId, action });
            alert(action === 'award' ? '✅ Medalla asignada' : '🗑️ Medalla revocada');
        } catch (error: any) {
            console.error(`Error trying to ${action} badge`, error);
            alert(`Error: ${error?.message || 'desconocido'}`);
        }
    };


    const handleUpdatePlaceFromGoogle = async () => {
        if (!selectedItem || !user) throw new Error('Sin datos de lugar o autenticación');
        const idToken = await user.getIdToken();
        const googleId = selectedItem.googlePlaceId || selectedItem.id;
        // Manual desde Developer: siempre llama a Google (aunque tenga propietario o sea reciente).
        await PlaceService.ensurePlaceSyncedWithBackend(googleId, idToken, { force: true });
        invalidateDoc('places', selectedItem.id);
        queryClient.invalidateQueries({ queryKey: ['placeDetails', selectedItem.id] });
        queryClient.invalidateQueries({ queryKey: ['doc', 'places', selectedItem.id] });
        // Refresh the selected item from Firestore
        const placeRef = doc(db, 'places', selectedItem.id);
        const snap = await getDocFromServer(placeRef).catch(() => getDoc(placeRef));
        if (snap.exists()) setSelectedItem({ id: snap.id, ...snap.data() });
        handleConsoleSearch();
    };

    const fetchOtherSettings = async () => {
        setOtherSettingsLoading(true);
        setOtherSettingsMessage(null);
        try {
            const configSnap = await getDoc(doc(db, 'config', 'app'));
            const data = configSnap.exists() ? configSnap.data() : {};
            setOtherSettings({
                showRandomChoiceButton: typeof data.showRandomChoiceButton === 'boolean' ? data.showRandomChoiceButton : true,
                showProfileFavoriteBadge: typeof data.showProfileFavoriteBadge === 'boolean' ? data.showProfileFavoriteBadge : true,
                showAffinityCarousel: typeof data.showAffinityCarousel === 'boolean' ? data.showAffinityCarousel : true,
                showProfileAffinity: typeof data.showProfileAffinity === 'boolean' ? data.showProfileAffinity : true,
                homeReviewsMonths: typeof data.homeReviewsMonths === 'number' ? data.homeReviewsMonths : 12,
                showLab: typeof data.showLab === 'boolean' ? data.showLab : false,
                showWeeklyDuel: typeof data.showWeeklyDuel === 'boolean' ? data.showWeeklyDuel : false,
                showTastePassport: typeof data.showTastePassport === 'boolean' ? data.showTastePassport : false,
                listTitlePlaceFirst: typeof data.listTitlePlaceFirst === 'boolean' ? data.listTitlePlaceFirst : true,
            });
        } catch (error: any) {
            console.error('Error fetching other settings:', error);
            setOtherSettingsMessage({ type: 'error', text: error?.message || 'No se pudieron cargar los ajustes.' });
        } finally {
            setOtherSettingsLoading(false);
        }
    };

    const saveOtherSettings = async () => {
        setOtherSettingsSaving(true);
        setOtherSettingsMessage(null);
        try {
            await setDoc(doc(db, 'config', 'app'), {
                showRandomChoiceButton: otherSettings.showRandomChoiceButton,
                showProfileFavoriteBadge: otherSettings.showProfileFavoriteBadge,
                showAffinityCarousel: otherSettings.showAffinityCarousel,
                showProfileAffinity: otherSettings.showProfileAffinity,
                homeReviewsMonths: otherSettings.homeReviewsMonths,
                showLab: otherSettings.showLab,
                showWeeklyDuel: otherSettings.showWeeklyDuel,
                showTastePassport: otherSettings.showTastePassport,
                listTitlePlaceFirst: otherSettings.listTitlePlaceFirst,
                updatedAt: new Date(),
            }, { merge: true });
            setOtherSettingsMessage({ type: 'success', text: 'Ajustes guardados correctamente.' });
        } catch (error: any) {
            console.error('Error saving other settings:', error);
            setOtherSettingsMessage({ type: 'error', text: error?.message || 'No se pudieron guardar los ajustes.' });
        } finally {
            setOtherSettingsSaving(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'gamification') fetchBadges();
        if (activeTab === 'others') fetchOtherSettings();
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== 'audit') return;
        setLoadingAudit(true);
        const q = query(
            collection(db, 'adminAuditLog'),
            orderBy('createdAt', 'desc'),
            firestoreLimit(100)
        );
        const unsub = onSnapshot(q, (snap) => {
            setAuditEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoadingAudit(false);
        }, () => setLoadingAudit(false));
        return () => unsub();
    }, [activeTab]);

    useEffect(() => {
        if (!isAuthorized && !loadingAuth) {
            // Optional: redirect or just show the unauthorized message
        }
    }, [isAuthorized, loadingAuth]);

    // Update active tab logic if needed

    if (loadingAuth || isAuthorized === null) {
        return <div className="min-h-screen pt-safe-24 text-center text-gray-500">Verificando permisos...</div>;
    }

    return (
        <>
            {!isAuthorized ? (
                <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] p-6 text-center pt-safe-24">
                    <AlertCircle className="w-16 h-16 text-red-500 mb-4 opacity-80" />
                    <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
                    <p className="text-gray-500 max-w-md">Esta área es exclusiva para administradores del sistema.</p>
                </div>
            ) : (
                <div className="flex h-screen overflow-hidden pt-16"> {/* pt-16: bajo la Navbar global */}
                    <DeveloperSidebar
                        activeTab={activeTab}
                        onSelect={(tab) => goToTab(tab)}
                        open={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                        badges={pendingCounts.data?.badges}
                    />

                    {/* Main Content */}
                    <main ref={mainRef} className="flex-1 overflow-y-auto bg-[var(--lt-bg-deep)] p-4 md:p-8">
                        <div className="mb-4 flex items-center gap-3 md:hidden">
                            <button
                                type="button"
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="Abrir menú de Developer"
                                className="rounded-lg border border-white/10 bg-[var(--lt-card-strong)] p-2 text-white shadow-lg"
                            >
                                <ListIcon className="h-5 w-5" />
                            </button>
                            <span className="min-w-0 truncate text-sm font-bold text-white">{developerTabLabel(activeTab)}</span>
                            {(pendingCounts.data?.toReview ?? 0) > 0 && activeTab !== 'pending' && (
                                <button
                                    type="button"
                                    onClick={() => goToTab('pending')}
                                    className="ml-auto shrink-0 rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-2.5 py-1 text-xs font-bold text-white"
                                >
                                    📥 {pendingCounts.data?.toReview} pendientes
                                </button>
                            )}
                        </div>
                        {jefeClaim.status === 'checking' || jefeClaim.status === 'provisioning' ? (
                            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6 text-sm text-gray-300">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                {jefeClaim.status === 'provisioning' ? 'Activando tus permisos de Developer (solo la primera vez)…' : 'Comprobando permisos…'}
                            </div>
                        ) : (<>
                        {jefeClaim.status === 'error' && (
                            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                                No se pudieron activar los permisos de Developer ({jefeClaim.error}). Lo que lee Firestore directamente (Listas, Usuarios, Reportes…) puede fallar; Reseñas y la ficha de usuario van por el servidor y sí funcionan.
                            </div>
                        )}

                        {activeTab === 'console' && (
                            <div className="space-y-6">
                                {/* Search Bar */}
                                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 shadow-xl">
                                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <Search className="w-5 h-5 text-[var(--lt-accent)]" /> Explorador de Firestore
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Colección</label>
                                            <select
                                                value={consoleParams.collection}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, collection: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                            >
                                                <option value="lists">Listas</option>
                                                <option value="places">Lugares</option>
                                                <option value="users">Usuarios</option>
                                                <option value="categories">Categorías</option>
                                                <option value="listForums">Foros</option>
                                            </select>
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Doc ID</label>
                                            <input
                                                placeholder="Exact Match"
                                                value={consoleParams.id || ''}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, id: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User ID / Email</label>
                                            <input
                                                placeholder="Owner ID"
                                                value={consoleParams.user || ''}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, user: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre (Contiene)</label>
                                            <input
                                                placeholder="Client Filter"
                                                value={consoleParams.nameContains || ''}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, nameContains: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Google Place ID</label>
                                            <input
                                                placeholder="ChIJ..."
                                                value={consoleParams.googleId || ''}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, googleId: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Límite</label>
                                            <input
                                                type="number"
                                                value={consoleParams.limit}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, limit: parseInt(e.target.value) || 50 })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setConsoleParams({ collection: 'lists', limit: 100 })}
                                            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-bold transition-colors"
                                        >
                                            Limpiar
                                        </button>
                                        <button
                                            onClick={handleConsoleSearch}
                                            disabled={loadingConsole}
                                            className="px-6 py-2 rounded-lg bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white font-bold transition-colors flex items-center gap-2"
                                        >
                                            {loadingConsole ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            Buscar
                                        </button>
                                    </div>
                                </div>

                                {/* Results */}
                                {consoleError && (
                                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400">
                                        Error: {consoleError}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-4">
                                    <div className="flex justify-between items-center text-gray-400 text-sm">
                                        <span>Resultados: {consoleResults.length}</span>
                                    </div>
                                    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl overflow-hidden overflow-x-auto">
                                        <table className="w-full text-left text-sm text-gray-300">
                                            <thead className="bg-white/5 text-gray-100 font-bold uppercase text-xs">
                                                <tr>
                                                    <th className="p-4">ID</th>
                                                    <th className="p-4">Name / Title</th>
                                                    <th className="p-4">User</th>
                                                    <th className="p-4">Created</th>
                                                    <th className="p-4">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {consoleResults.map(item => (
                                                    <tr
                                                        key={item.id}
                                                        className="hover:bg-white/5 transition-colors cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedItem(item);
                                                            setIsModalOpen(true);
                                                        }}
                                                    >
                                                        <td className="p-4 font-mono text-xs text-[var(--lt-accent)]">{item.id}</td>
                                                        <td className="p-4 font-medium">{item.name || item.displayName || item.title || '-'}</td>
                                                        <td className="p-4 text-xs">{item.userId || item.ownerId || item.email || '-'}</td>
                                                        <td className="p-4 text-xs font-mono">
                                                            {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                                        </td>
                                                        <td className="p-4">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedItem(item);
                                                                    setIsModalOpen(true);
                                                                }}
                                                                className="text-xs bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] px-2 py-1 rounded hover:bg-[var(--lt-accent)]/30"
                                                            >
                                                                Editar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {consoleResults.length === 0 && !loadingConsole && (
                                                    <tr>
                                                        <td colSpan={5} className="p-8 text-center text-gray-500">
                                                            Sin resultados
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {isModalOpen && (
                                    <DeveloperLazyPanel>
                                        <DeveloperItemModal
                                            isOpen={isModalOpen}
                                            onClose={() => setIsModalOpen(false)}
                                            collectionName={consoleParams.collection}
                                            item={selectedItem}
                                            onSaved={handleConsoleSearch}
                                            onUpdateFromGoogle={consoleParams.collection === 'places' ? handleUpdatePlaceFromGoogle : undefined}
                                        />
                                    </DeveloperLazyPanel>
                                )}
                            </div >
                        )}

                        {
                            activeTab === 'algolia' && (
                                <div className="space-y-6">
                                    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                            <CloudLightning className="w-5 h-5 text-yellow-400" /> Sincronización Manual
                                        </h3>
                                        <p className="text-gray-400 mb-6">Fuerza la re-indexación de datos en Algolia. Úsalo con precaución.</p>

                                        <div className="flex flex-wrap gap-4">
                                            <button
                                                onClick={() => runAlgoliaSync(null)}
                                                disabled={processingAlgolia}
                                                className="px-6 py-3 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2"
                                            >
                                                Sincronizar TODO
                                            </button>
                                            <button
                                                onClick={configureAlgoliaIndexes}
                                                disabled={processingAlgolia}
                                                className="px-6 py-3 bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-50 text-yellow-200 font-bold rounded-lg border border-yellow-500/30 flex items-center gap-2"
                                            >
                                                Configurar índices/réplicas
                                            </button>
                                            <button
                                                onClick={() => runAlgoliaSync('lists')}
                                                disabled={processingAlgolia}
                                                className="px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-bold rounded-lg border border-white/10"
                                            >
                                                Sync Lists
                                            </button>
                                            <button
                                                onClick={() => runAlgoliaSync('places')}
                                                disabled={processingAlgolia}
                                                className="px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-bold rounded-lg border border-white/10"
                                            >
                                                Sync Places
                                            </button>
                                            <button
                                                onClick={() => runAlgoliaSync('users')}
                                                disabled={processingAlgolia}
                                                className="px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-bold rounded-lg border border-white/10"
                                            >
                                                Sync Users
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-xs h-96 overflow-y-auto">
                                        <div className="text-gray-500 mb-2 border-b border-white/5 pb-2">Logs de actividad...</div>
                                        {algoliaLog.map((log, i) => (
                                            <div key={i} className="text-gray-300 py-1">{log}</div>
                                        ))}
                                    </div>
                                </div>
                            )
                        }


                        {
                            activeTab === 'maintenance' && (
                                <div className="space-y-6">
                                    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                            <ListIcon className="w-5 h-5 text-[var(--lt-accent-2)]" /> Mantenimiento de Listas
                                        </h3>
                                        <p className="text-gray-400 mb-6">Herramientas para recalcular contadores y estadísticas de listas desincronizadas.</p>

                                        {/* Global Maintenance */}
                                        <div className="mb-8 p-4 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] rounded-xl">
                                            <h4 className="text-sm font-bold text-[var(--lt-accent)] uppercase mb-3 flex items-center gap-2">
                                                <Database className="w-4 h-4" /> Mantenimiento Global
                                            </h4>
                                            <div className="flex gap-4 flex-wrap">
                                                <button
                                                    onClick={handleRecalculateEverything}
                                                    disabled={processingMaintenance}
                                                    className="px-6 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-purple-900/40"
                                                >
                                                    {processingMaintenance ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CloudLightning className="w-5 h-5" />}
                                                    ACTUALIZAR TODO (MASTER)
                                                </button>
                                                <div className="w-full h-px bg-white/5 my-2"></div>
                                                <button
                                                    onClick={() => handleGlobalRecalculate('lists')}
                                                    disabled={processingMaintenance}
                                                    className="px-4 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                                >
                                                    {processingMaintenance ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                                                    Recalcular TODAS las Listas
                                                </button>
                                                <button
                                                    onClick={() => handleGlobalRecalculate('places')}
                                                    disabled={processingMaintenance}
                                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                                >
                                                    {processingMaintenance ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                                    Recalcular TODOS los Lugares
                                                </button>
                                                <button
                                                    onClick={() => handleGlobalRecalculate('users')}
                                                    disabled={processingMaintenance}
                                                    className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                                >
                                                    {processingMaintenance ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                                    Recalcular TODOS los Usuarios
                                                </button>
                                                <button
                                                    onClick={handleBackfillPublicProfiles}
                                                    disabled={processingMaintenance}
                                                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                                >
                                                    {processingMaintenance ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                                    Regenerar perfiles públicos
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">
                                                ⚠️ Estas operaciones pueden tardar varios minutos. No cierres la pestaña.
                                            </p>
                                        </div>

                                        <div className="flex gap-4 items-end max-w-2xl">
                                            <div className="flex-1">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">List ID</label>
                                                <input
                                                    type="text"
                                                    value={targetListId}
                                                    onChange={(e) => setTargetListId(e.target.value)}
                                                    placeholder="Paste List ID here..."
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)] font-mono"
                                                />
                                            </div>
                                            <button
                                                onClick={handleRecalculateList}
                                                disabled={processingMaintenance || !targetListId}
                                                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2"
                                            >
                                                {processingMaintenance ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                Recalcular Lista
                                            </button>
                                        </div>
                                        <div className="flex gap-4 items-end max-w-2xl mt-4 border-t border-white/5 pt-4">
                                            <div className="flex-1">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Place ID</label>
                                                <input
                                                    type="text"
                                                    value={targetPlaceId || ''}
                                                    onChange={(e) => setTargetPlaceId(e.target.value)}
                                                    placeholder="Paste Place ID here..."
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)] font-mono"
                                                />
                                            </div>
                                            <button
                                                onClick={handleRecalculatePlace}
                                                disabled={processingMaintenance || !targetPlaceId}
                                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2"
                                            >
                                                {processingMaintenance ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                Recalcular Lugar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                            <Users className="w-5 h-5 text-amber-400" /> Backfill de Tipos de Autor
                                        </h3>
                                        <p className="text-gray-400 mb-4 text-sm">Rellena el campo <code className="text-amber-300 bg-black/30 px-1 rounded">authorUserType</code> en todas las reseñas existentes consultando el <code className="text-amber-300 bg-black/30 px-1 rounded">userType</code> de cada autor. Puede tardar varios minutos.</p>
                                        <button
                                            onClick={handleBackfillAuthorUserType}
                                            disabled={processingMaintenance}
                                            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                        >
                                            {processingMaintenance ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                            Backfill authorUserType
                                        </button>
                                    </div>

                                    <React.Suspense fallback={<div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 text-gray-500 text-sm">Cargando consolidación de reseñas…</div>}>
                                        <ReviewsConsolidationCard />
                                    </React.Suspense>

                                    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                            <Terminal className="w-5 h-5 text-cyan-400" /> Provisionar Claim Admin
                                        </h3>
                                        <p className="text-gray-400 mb-4 text-sm">Establece el custom claim <code className="text-cyan-300 bg-black/30 px-1 rounded">admin:true</code> en tu token de Firebase Auth. Necesario para que las Storage Security Rules te autoricen a subir archivos. Solo hace falta hacerlo una vez.</p>
                                        <button
                                            onClick={handleProvisionAdminClaim}
                                            disabled={provisioningClaim}
                                            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                        >
                                            {provisioningClaim ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                                            Provisionar claim admin:true
                                        </button>
                                        {provisionClaimMessage && (
                                            <p className={`mt-3 text-sm font-medium ${provisionClaimMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {provisionClaimMessage.text}
                                            </p>
                                        )}
                                    </div>

                                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-xs h-96 overflow-y-auto">
                                        <div className="text-gray-500 mb-2 border-b border-white/5 pb-2">Logs de mantenimiento...</div>
                                        {maintenanceLog.map((log, i) => (
                                            <div key={i} className="text-gray-300 py-1">{log}</div>
                                        ))}
                                    </div>
                                </div>
                            )
                        }

                        {activeTab === 'branding' && (
                            <DeveloperLazyPanel>
                                <BrandingManager />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'proyectos' && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="text-2xl">🧪</span> Proyectos Internos
                                    </h2>
                                    <p className="text-gray-400 text-sm mb-6">
                                        Experimentos y herramientas de Istari Core. Accesibles siempre desde aquí; su visibilidad pública se controla en <strong>OTROS → Lab</strong>.
                                    </p>

                                    {/* Simulador Clínico */}
                                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
                                        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-indigo-900/30">
                                                🧠
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-bold text-white">El baile de los apegos</h3>
                                                <p className="text-sm text-gray-400 mt-1">
                                                    Simulación visual de dinámicas de apego ansioso-evitativo. Canvas interactivo con física de relatos, tensión corporal y corregulación emocional. Pantalla de bienvenida, háptica y ajustes persistentes.
                                                </p>
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/20">Canvas API</span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/20">Web Audio</span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">Fullscreen</span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/20">Psicología Clínica</span>
                                                </div>
                                            </div>
                                            <a
                                                href="/lab"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="shrink-0 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-indigo-900/30 flex items-center gap-2"
                                            >
                                                <span>Abrir</span>
                                                <span className="text-base">↗</span>
                                            </a>
                                        </div>
                                        <div className="border-t border-indigo-500/20 px-5 py-3 flex items-center justify-between">
                                            <span className="text-xs text-gray-500">
                                                Ruta: <code className="text-indigo-300">/lab</code> · Archivo: <code className="text-gray-400">public/lab/simulator.html</code>
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${otherSettings.showLab ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-500/20 text-gray-400'}`}>
                                                {otherSettings.showLab ? '🌐 Público' : '🔒 Solo admin'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'others' && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                                        <SlidersHorizontal className="w-6 h-6 text-amber-400" /> OTROS
                                    </h2>
                                    <p className="text-gray-400 text-sm mb-6">
                                        Ajustes visuales y de experiencia para activar/desactivar funciones puntuales en la app.
                                    </p>

                                    {otherSettingsMessage && (
                                        <div
                                            className={`mb-4 p-3 rounded-lg border text-sm ${otherSettingsMessage.type === 'success'
                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                                                : 'bg-red-500/10 border-red-500/20 text-red-300'
                                                }`}
                                        >
                                            {otherSettingsMessage.text}
                                        </div>
                                    )}

                                    {otherSettingsLoading ? (
                                        <div className="text-gray-400 text-sm">Cargando ajustes...</div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Botón aleatorio (Home)</div>
                                                    <div className="text-xs text-gray-400">
                                                        Muestra u oculta el botón “No sé qué elegir” en la página principal.
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, showRandomChoiceButton: !prev.showRandomChoiceButton }))}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${otherSettings.showRandomChoiceButton
                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}
                                                >
                                                    {otherSettings.showRandomChoiceButton ? 'ACTIVO' : 'INACTIVO'}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Duelo de la semana (Home)</div>
                                                    <div className="text-xs text-gray-400">
                                                        Banner con dos platos rivales y votación de la comunidad. Los duelos se crean en Propuestas Pro.
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, showWeeklyDuel: !prev.showWeeklyDuel }))}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${otherSettings.showWeeklyDuel
                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}
                                                >
                                                    {otherSettings.showWeeklyDuel ? 'ACTIVO' : 'INACTIVO'}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Título de los elementos (página de Lista)</div>
                                                    <div className="text-xs text-gray-400">
                                                        {otherSettings.listTitlePlaceFirst
                                                            ? 'Grande el sitio; debajo, el elemento.'
                                                            : 'Grande el elemento; debajo, el sitio.'}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, listTitlePlaceFirst: !prev.listTitlePlaceFirst }))}
                                                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                                >
                                                    {otherSettings.listTitlePlaceFirst ? 'SITIO PRIMERO' : 'ELEMENTO PRIMERO'}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Pasaporte de sabores (Perfil)</div>
                                                    <div className="text-xs text-gray-400">
                                                        Sellos por categoría según los sitios distintos reseñados. Solo en el perfil propio.
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, showTastePassport: !prev.showTastePassport }))}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${otherSettings.showTastePassport
                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}
                                                >
                                                    {otherSettings.showTastePassport ? 'ACTIVO' : 'INACTIVO'}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Carrusel Match de sabor (Home)</div>
                                                    <div className="text-xs text-gray-400">
                                                        Muestra perfiles con sitios valorados en común y notas parecidas (sin coincidencias reales no hay porcentaje).
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, showAffinityCarousel: !prev.showAffinityCarousel }))}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${otherSettings.showAffinityCarousel
                                                        ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                                                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}
                                                >
                                                    {otherSettings.showAffinityCarousel ? 'ACTIVO' : 'INACTIVO'}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Afinidad en perfiles</div>
                                                    <div className="text-xs text-gray-400">
                                                        Muestra un porcentaje sutil entre tu cuenta y el perfil visitado.
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, showProfileAffinity: !prev.showProfileAffinity }))}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${otherSettings.showProfileAffinity
                                                        ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                                                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}
                                                >
                                                    {otherSettings.showProfileAffinity ? 'ACTIVO' : 'INACTIVO'}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Sello favorito (Perfil)</div>
                                                    <div className="text-xs text-gray-400">
                                                        Muestra u oculta la tarjeta/sello de favorito en los perfiles.
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, showProfileFavoriteBadge: !prev.showProfileFavoriteBadge }))}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${otherSettings.showProfileFavoriteBadge
                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}
                                                >
                                                    {otherSettings.showProfileFavoriteBadge ? 'ACTIVO' : 'INACTIVO'}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white">Ventana temporal de reseñas (Home)</div>
                                                    <div className="text-xs text-gray-400">
                                                        Reseñas de los últimos N meses que se cargan en la página principal. 0 = sin límite (carga todo).
                                                    </div>
                                                </div>
                                                <select
                                                    value={otherSettings.homeReviewsMonths}
                                                    onChange={(e) => setOtherSettings((prev) => ({ ...prev, homeReviewsMonths: Number(e.target.value) }))}
                                                    className="bg-[var(--lt-bg)] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-[var(--lt-accent-border)] shrink-0"
                                                >
                                                    <option value={1}>1 mes</option>
                                                    <option value={3}>3 meses</option>
                                                    <option value={6}>6 meses</option>
                                                    <option value={12}>12 meses</option>
                                                    <option value={24}>24 meses</option>
                                                    <option value={0}>Sin límite</option>
                                                </select>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div>
                                                    <div className="text-sm font-bold text-white flex items-center gap-2">
                                                        <span>🧪</span> Lab / Proyectos internos
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        Activa el acceso público a <code className="text-indigo-300">/lab</code>. Cuando está inactivo, solo el admin puede acceder desde esta sección.
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setOtherSettings((prev) => ({ ...prev, showLab: !prev.showLab }))}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${otherSettings.showLab
                                                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}
                                                >
                                                    {otherSettings.showLab ? 'PÚBLICO' : 'OCULTO'}
                                                </button>
                                            </div>

                                            <div className="pt-2">
                                                <button
                                                    type="button"
                                                    onClick={saveOtherSettings}
                                                    disabled={otherSettingsSaving}
                                                    className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold disabled:opacity-60 inline-flex items-center gap-2"
                                                >
                                                    {otherSettingsSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                                                    Guardar ajustes
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {
                            activeTab === 'gamification' && (
                                <div className="max-w-6xl mx-auto">
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                            <Tag className="w-6 h-6 text-amber-500" /> Gamificación Avanzada
                                        </h2>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingBadge({}); // Empty object for new badge
                                                    setBadgeModalOpen(true);
                                                }}
                                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-amber-900/20"
                                            >
                                                <div className="text-lg leading-none">+</div> Nueva Medalla
                                            </button>
                                            <button
                                                onClick={fetchBadges}
                                                className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white"
                                            >
                                                <RefreshCw className={`w-4 h-4 ${loadingBadges ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                                        {BADGE_PRESET_PACKS.map((pack) => (
                                            <div
                                                key={pack.id}
                                                className={`rounded-2xl border border-white/10 bg-gradient-to-br ${pack.theme} bg-[var(--lt-card-strong)] p-5`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-[11px] uppercase tracking-[0.22em] text-amber-200/80 font-black">
                                                            Catalogo recomendado
                                                        </div>
                                                        <h3 className="mt-2 text-lg font-bold text-white">{pack.name}</h3>
                                                    </div>
                                                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-200">
                                                        {pack.badges.length} medallas
                                                    </span>
                                                </div>

                                                <p className="mt-3 text-sm text-gray-300 min-h-[60px]">
                                                    {pack.description}
                                                </p>

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {pack.badges.slice(0, 4).map((badge) => (
                                                        <span
                                                            key={badge.id}
                                                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-gray-100"
                                                        >
                                                            <span>{badge.icon}</span>
                                                            <span>{badge.name}</span>
                                                        </span>
                                                    ))}
                                                </div>

                                                <button
                                                    onClick={() => handleImportBadgePack(pack.id)}
                                                    disabled={importingBadgePackId === pack.id}
                                                    className="mt-5 w-full rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold py-2.5 transition-colors"
                                                >
                                                    {importingBadgePackId === pack.id ? 'Importando...' : `Importar ${pack.name}`}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {/* --- MANUAL ASSIGNMENT TOOL --- */}
                                    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 mb-8 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-5">
                                            <CheckCircle className="w-32 h-32 text-[var(--lt-accent)]" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-4 relative z-10 flex items-center gap-2">
                                            <CheckCircle className="w-5 h-5 text-[var(--lt-accent)]" /> Asignación Manual
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10 items-end">
                                            <div className="col-span-1">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User ID</label>
                                                <input
                                                    id="manualAssignUserId"
                                                    placeholder="User UID"
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Badge ID</label>
                                                <select
                                                    id="manualAssignBadgeId"
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-[var(--lt-accent-border)]"
                                                >
                                                    <option value="">Seleccionar Medalla...</option>
                                                    {badges.map(b => (
                                                        <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-1 flex gap-2">
                                                <button
                                                    onClick={() => handleManualBadgeAction('award')}
                                                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
                                                >
                                                    Asignar
                                                </button>
                                                <button
                                                    onClick={() => handleManualBadgeAction('revoke')}
                                                    className="px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white font-bold rounded-lg transition-colors border border-red-600/30"
                                                >
                                                    Revocar
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- BADGE LIST --- */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                                        {badges.map(badge => (
                                            <div key={badge.id} className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 relative group hover:border-amber-500/50 transition-all">
                                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => { setEditingBadge(badge); setBadgeModalOpen(true); }}
                                                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                                    >
                                                        <Palette className="w-4 h-4" /> {/* Edit Icon */}
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm(`¿ELIMINAR DEFINITIVAMENTE la medalla ${badge.name}? Esto no la quita de los usuarios que ya la tienen.`)) {
                                                                try {
                                                                    await deleteDoc(doc(db, 'badges', badge.id));
                                                                    fetchBadges();
                                                                } catch (e) { console.error(e); alert("Error eliminando"); }
                                                            }
                                                        }}
                                                        className="p-1 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-500"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="absolute top-4 left-4 text-xs font-mono text-gray-600 select-all">{badge.id}</div>

                                                <div className="flex items-center gap-4 mb-4 mt-6">
                                                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-3xl shadow-lg relative overflow-hidden">
                                                        {badge.imageUrl ? (
                                                            <img src={badge.imageUrl} alt={badge.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span>{badge.icon || '🏅'}</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-white text-lg leading-tight">{badge.name}</h3>
                                                        <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-wider">
                                                            {badge.category || 'GENERAL'}
                                                        </span>
                                                        {badge.active === false && <span className="ml-2 text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded border border-red-500/20 font-bold uppercase">INACTIVA</span>}
                                                    </div>
                                                </div>
                                                <p className="text-gray-400 text-sm mb-3 line-clamp-2 min-h-[40px]">
                                                    {badge.descriptionPublic || badge.description}
                                                </p>

                                                <div className="flex flex-wrap gap-2 text-xs font-mono text-gray-500">
                                                    <span className="bg-black/20 px-2 py-1 rounded border border-white/5">Type: {badge.type}</span>
                                                    {badge.threshold > 0 && <span className="bg-black/20 px-2 py-1 rounded border border-white/5">Thres: {badge.threshold}</span>}
                                                    {badge.xpReward > 0 && <span className="bg-black/20 px-2 py-1 rounded border border-white/5">XP: {badge.xpReward}</span>}
                                                    {badge.rarity && <span className="bg-black/20 px-2 py-1 rounded border border-white/5">Rareza: {badge.rarity}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* --- BULK OPERATIONS (Moved to bottom) --- */}
                                    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 opacity-60 hover:opacity-100 transition-opacity">
                                        <h3 className="text-sm font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                                            <CloudLightning className="w-4 h-4" /> Zona de Peligro / Global
                                        </h3>
                                        <div className="flex gap-4">
                                            <button
                                                onClick={async () => {
                                                    if (!confirm("⚠️ RECALCULAR GAMIFICACIÓN GLOBAL: ¿Estás seguro?")) return;
                                                    setLoadingBadges(true);
                                                    setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] GLOBAL SYNC START...`, ...prev]);
                                                    try {
                                                        const functions = getFunctions(undefined, FUNCTIONS_REGION);
                                                        const bulkFn = httpsCallable(functions, 'adminRecalculateAllGamification');
                                                        const res: any = await bulkFn();
                                                        if (res.data.logs) setMaintenanceLog(prev => [...res.data.logs.reverse(), ...prev]);
                                                        setMaintenanceLog(prev => [`✅ DONE`, ...prev]);
                                                    } catch (e: any) {
                                                        setMaintenanceLog(prev => [`❌ ERROR: ${e.message}`, ...prev]);
                                                    } finally {
                                                        setLoadingBadges(false);
                                                    }
                                                }}
                                                disabled={loadingBadges}
                                                className="px-4 py-2 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-xs font-bold transition-all"
                                            >
                                                Recalcular TODO
                                            </button>
                                        </div>
                                    </div>

                                    {/* --- EDIT MODAL --- */}
                                    {badgeModalOpen && (
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => setBadgeModalOpen(false)}>
                                            <div className="bg-[var(--lt-card-strong)] rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                                                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#1a2036]">
                                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                                        {editingBadge?.id ? <Palette className="w-5 h-5 text-amber-500" /> : <Tag className="w-5 h-5 text-green-500" />}
                                                        {editingBadge?.id ? 'Editar Medalla' : 'Nueva Medalla'}
                                                    </h3>
                                                    <button onClick={() => setBadgeModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
                                                </div>

                                                <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                                    <div className="space-y-5">

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">ID (Slug)</label>
                                                                <input
                                                                    disabled={!!editingBadge?.id} // Cannot change ID of existing
                                                                    className={`w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500 font-mono ${editingBadge?.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    value={editingBadge?.id || editingBadge?.newId || ''}
                                                                    onChange={e => !editingBadge?.id && setEditingBadge({ ...editingBadge, newId: e.target.value })}
                                                                    placeholder="ej: early_adopter"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Categoría</label>
                                                                <select
                                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                                    value={editingBadge?.category || 'GENERAL'}
                                                                    onChange={e => setEditingBadge({ ...editingBadge, category: e.target.value })}
                                                                >
                                                                    <option value="GENERAL">General</option>
                                                                    <option value="CORE">Core</option>
                                                                    <option value="EXPERT">Expert</option>
                                                                    <option value="SPECIAL">Special</option>
                                                                    <option value="FUNNY">Funny</option>
                                                                    <option value="HIDDEN">Hidden</option>
                                                                </select>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Nombre</label>
                                                            <input
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                                value={editingBadge?.name || ''}
                                                                onChange={e => setEditingBadge({ ...editingBadge, name: e.target.value })}
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descripción Pública</label>
                                                            <textarea
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500 h-20"
                                                                value={editingBadge?.description || ''}
                                                                onChange={e => setEditingBadge({ ...editingBadge, description: e.target.value })}
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Lógica (Interna/Notas)</label>
                                                            <textarea
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-amber-200 outline-none focus:border-amber-500 h-16 font-mono text-xs"
                                                                value={editingBadge?.logicNotes || ''}
                                                                onChange={e => setEditingBadge({ ...editingBadge, logicNotes: e.target.value })}
                                                                placeholder="Notas para devs sobre cómo se gana..."
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-4">
                                                            <div className="col-span-1">
                                                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tipo</label>
                                                                <select
                                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                                    value={editingBadge?.type || 'custom'}
                                                                    onChange={e => setEditingBadge({ ...editingBadge, type: e.target.value })}
                                                                >
                                                                    <option value="custom">Custom (Manual)</option>
                                                                    <option value="review_count">Contador Reseñas</option>
                                                                    <option value="photo_count">Contador Fotos</option>
                                                                    <option value="place_count">Contador Lugares</option>
                                                                    <option value="lists_count">Contador Listas</option>
                                                                    <option value="followers_count">Contador Seguidores</option>
                                                                    <option value="following_count">Contador Siguiendo</option>
                                                                    <option value="level_reached">Nivel Alcanzado</option>
                                                                </select>
                                                            </div>
                                                            <div className="col-span-1">
                                                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Umbral</label>
                                                                <input
                                                                    type="number"
                                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                                    value={editingBadge?.threshold || 0}
                                                                    onChange={e => setEditingBadge({ ...editingBadge, threshold: parseInt(e.target.value) })}
                                                                />
                                                            </div>
                                                            <div className="col-span-1">
                                                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Icono (Emoji)</label>
                                                                <input
                                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500 text-center"
                                                                    value={editingBadge?.icon || ''}
                                                                    onChange={e => setEditingBadge({ ...editingBadge, icon: e.target.value })}
                                                                    placeholder="🏆"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="max-w-[220px]">
                                                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">XP que aporta</label>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                                value={editingBadge?.xpReward || 50}
                                                                onChange={e => setEditingBadge({ ...editingBadge, xpReward: parseInt(e.target.value) || 0 })}
                                                            />
                                                            <p className="mt-2 text-[11px] text-gray-500">
                                                                Si no defines nada, el motor usa 50 XP por medalla.
                                                            </p>
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Imagen URL (Upload)</label>

                                                            <div className="flex flex-col gap-3">
                                                                {/* URL Input */}
                                                                <input
                                                                    type="text"
                                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500 text-xs font-mono"
                                                                    value={editingBadge?.imageUrl || ''}
                                                                    onChange={e => setEditingBadge({ ...editingBadge, imageUrl: e.target.value })}
                                                                    placeholder="https://..."
                                                                />

                                                                {/* Drag & Drop Zone */}
                                                                <div
                                                                    className="relative group border-2 border-dashed border-white/10 hover:border-amber-500/50 bg-black/20 hover:bg-black/30 rounded-xl p-6 transition-all cursor-pointer text-center"
                                                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                    onDrop={async (e) => {
                                                                        e.preventDefault(); e.stopPropagation();
                                                                        const file = e.dataTransfer.files?.[0];
                                                                        if (!file) return;

                                                                        // Reuse upload logic
                                                                        const badgeId = editingBadge?.id || editingBadge?.newId;
                                                                        if (!badgeId) return alert("Primero define un ID para la medalla");

                                                                        try {
                                                                            const { ref: sRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
                                                                            const storageRef = sRef(storage, `badges/${badgeId}/${Date.now()}_icon`);

                                                                            // Show temp loading state visually if needed, but for now just blocking
                                                                            const snap = await uploadBytes(storageRef, file);
                                                                            const url = await getDownloadURL(snap.ref);
                                                                            setEditingBadge((prev: any) => ({ ...prev, imageUrl: url }));
                                                                        } catch (err: any) {
                                                                            console.error(err);
                                                                            alert("Error subiendo icono: " + err.message);
                                                                        }
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="file"
                                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                        accept="image/*"
                                                                        onChange={async (e) => {
                                                                            const file = e.target.files?.[0];
                                                                            const badgeId = editingBadge?.id || editingBadge?.newId;
                                                                            if (file && badgeId) {
                                                                                try {
                                                                                    const { ref: sRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
                                                                                    const storageRef = sRef(storage, `badges/${badgeId}/${Date.now()}_icon`);
                                                                                    const snap = await uploadBytes(storageRef, file);
                                                                                    const url = await getDownloadURL(snap.ref);
                                                                                    setEditingBadge((prev: any) => ({ ...prev, imageUrl: url }));
                                                                                } catch (err: any) {
                                                                                    console.error(err);
                                                                                    alert("Error subiendo icono: " + err.message);
                                                                                }
                                                                            } else if (file) {
                                                                                alert("Primero define un ID para la medalla");
                                                                            }
                                                                        }}
                                                                    />

                                                                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                                                                        {editingBadge?.imageUrl ? (
                                                                            <img src={editingBadge.imageUrl} className="w-16 h-16 object-contain mb-2 rounded-lg bg-black/50" />
                                                                        ) : (
                                                                            <Upload className="w-8 h-8 text-gray-500 group-hover:text-amber-500 transition-colors" />
                                                                        )}
                                                                        <span className="text-sm font-bold text-gray-400 group-hover:text-white">
                                                                            {editingBadge?.imageUrl ? 'Arrastra para cambiar imagen' : 'Arrastra imagen o click para subir'}
                                                                        </span>
                                                                        <span className="text-xs text-gray-600">Max 2MB (PNG/JPG)</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 pt-2">
                                                            <input
                                                                type="checkbox"
                                                                id="activeCheck"
                                                                checked={editingBadge?.active !== false}
                                                                onChange={e => setEditingBadge({ ...editingBadge, active: e.target.checked })}
                                                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
                                                            />
                                                            <label htmlFor="activeCheck" className="text-sm text-gray-300 select-none font-bold">Medalla Activa</label>
                                                        </div>

                                                    </div>
                                                </div>

                                                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-[var(--lt-card-strong)]">
                                                    <button
                                                        onClick={() => setBadgeModalOpen(false)}
                                                        className="px-4 py-2 text-gray-400 hover:text-white font-bold transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const finalData = { ...editingBadge };
                                                            // Use newId if creating
                                                            if (!finalData.id && finalData.newId) {
                                                                finalData.id = finalData.newId;
                                                                delete finalData.newId;
                                                            }
                                                            if (!finalData.id) return alert("Falta ID");

                                                            handleSaveBadge(finalData);
                                                        }}
                                                        className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all hover:scale-105"
                                                    >
                                                        Guardar Medalla
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        {activeTab === 'pending' && (
                            <DeveloperLazyPanel>
                                <PendingInboxTab goToTab={goToTab} enabled={jefeClaim.status === 'ready'} />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'reports' && (
                            <DeveloperLazyPanel>
                                <ReportsTab {...tabContract} />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'businessClaims' && (
                            <DeveloperLazyPanel>
                                <BusinessClaimsManagerTab {...tabContract} />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'businessManagers' && (
                            <DeveloperLazyPanel>
                                <BusinessManagersTab {...tabContract} />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'plans' && (
                            <DeveloperLazyPanel>
                                <PlansManagerTab {...tabContract} />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'proProposals' && (
                            <DeveloperLazyPanel>
                                <ProProposalsTab {...tabContract} />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'backups' && (
                            <DeveloperLazyPanel>
                                <BackupsTab />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'lists' && (
                            <DeveloperLazyPanel>
                                <ListsManagerTab />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'places' && (
                            <DeveloperLazyPanel>
                                <PlacesManagerTab />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'reviews' && (
                            <DeveloperLazyPanel>
                                <ReviewsManagerTab />
                            </DeveloperLazyPanel>
                        )}
                        {activeTab === 'tags' && (
                            <DeveloperLazyPanel>
                                <TagsManagerTab />
                            </DeveloperLazyPanel>
                        )}
                        {activeTab === 'usuarios' && (
                            <DeveloperLazyPanel>
                                <UsersManagerTab />
                            </DeveloperLazyPanel>
                        )}
                        {activeTab === 'rgpd' && (
                            <DeveloperLazyPanel>
                                <UserDataExportTab />
                            </DeveloperLazyPanel>
                        )}

                        {activeTab === 'audit' && (
                            <div className="max-w-5xl mx-auto space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                        <ClipboardList className="w-6 h-6 text-rose-400" /> Audit Log Admin
                                    </h2>
                                    <span className="text-xs text-gray-500">Tiempo real · últimas 100 acciones</span>
                                </div>

                                {loadingAudit ? (
                                    <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
                                ) : auditEntries.length === 0 ? (
                                    <div className="text-gray-500 text-sm py-8 text-center">Sin entradas registradas todavía.</div>
                                ) : (
                                    <div className="overflow-x-auto rounded-xl border border-white/10">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-white/10 bg-[var(--lt-card-strong)]">
                                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Fecha</th>
                                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Acción</th>
                                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Admin UID</th>
                                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Detalles</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {auditEntries.map((entry) => (
                                                    <tr key={entry.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                                                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap font-mono">
                                                            {entry.createdAt?.seconds
                                                                ? new Date(entry.createdAt.seconds * 1000).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })
                                                                : '—'}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/20">
                                                                {entry.action || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-xs font-mono text-[var(--lt-accent)] truncate max-w-[160px]">
                                                            {entry.actorUid || '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-xs text-gray-400 font-mono truncate max-w-[260px]">
                                                            {entry.details && Object.keys(entry.details).length > 0
                                                                ? JSON.stringify(entry.details)
                                                                : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                        {activeTab === 'apiusage' && (
                            <div className="max-w-5xl mx-auto">
                                <DeveloperLazyPanel>
                                    <ApiUsageTab />
                                </DeveloperLazyPanel>
                            </div>
                        )}
                        {activeTab === 'analytics' && (
                            <DeveloperLazyPanel>
                                <PageAnalyticsTab />
                            </DeveloperLazyPanel>
                        )}
                        {activeTab === 'geoAnalytics' && (
                            <DeveloperLazyPanel>
                                <GeoAnalyticsTab />
                            </DeveloperLazyPanel>
                        )}
                        </>)}
                    </main >
                </div >
            )}
        </>
    );
};


