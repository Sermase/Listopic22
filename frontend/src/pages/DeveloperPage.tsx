import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { BrandingManager } from '../components/developer/BrandingManager';
import { ListsManagerTab } from '../components/developer/ListsManagerTab';
import { PlacesManagerTab } from '../components/developer/PlacesManagerTab';
import { ReviewsManagerTab } from '../components/developer/ReviewsManagerTab';
import { TagsManagerTab } from '../components/developer/TagsManagerTab';
import { UsersManagerTab } from '../components/developer/UsersManagerTab';
import { PlaceService } from '../services/PlaceService';
import { BADGE_PRESET_PACKS } from '../config/badgePresets';
import { db, functions, storage } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, limit as firestoreLimit, setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Terminal, Search, AlertCircle, RefreshCw, List as ListIcon, MapPin, Layers, Database, CloudLightning, Tag, CheckCircle, X, Upload, Flag, MessageSquare, Palette, Users, SlidersHorizontal, ExternalLink, RefreshCcw } from 'lucide-react';
import { DeveloperItemModal } from '../components/developer/DeveloperItemModal';

const FUNCTIONS_REGION = 'europe-west1';

interface ConsoleSearchParams {
    collection: string;
    id?: string;
    user?: string;
    nameContains?: string;
    googleId?: string;
    limit: number;
}

export const DeveloperPage: React.FC = () => {
    const { user } = useAuth();
    const { profile, loading: loadingProfile } = useUserProfile(user?.uid);
    const [activeTab, setActiveTab] = useState<'console' | 'algolia' | 'maintenance' | 'gamification' | 'reports' | 'branding' | 'others' | 'lists' | 'places' | 'reviews' | 'tags' | 'usuarios'>('console');
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    // Other Settings State
    const [otherSettings, setOtherSettings] = useState({
        showRandomChoiceButton: true,
        showProfileFavoriteBadge: true,
        homeReviewsMonths: 12,
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

    // Reports State
    const [reports, setReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'rejected'>('pending');
    const [reportStats, setReportStats] = useState({ pending: 0, resolved: 0, rejected: 0, total: 0 });
    const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
    const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
    const [syncingPlaceId, setSyncingPlaceId] = useState<string | null>(null);
    const [syncResults, setSyncResults] = useState<Record<string, string>>({});
    const [markingUnavailable, setMarkingUnavailable] = useState<Record<string, boolean>>({});

    // Algolia State
    const [algoliaLog, setAlgoliaLog] = useState<string[]>([]);
    const [processingAlgolia, setProcessingAlgolia] = useState(false);

    // Maintenance State
    const [targetListId, setTargetListId] = useState('');
    const [targetPlaceId, setTargetPlaceId] = useState('');
    const [maintenanceLog, setMaintenanceLog] = useState<string[]>([]);
    const [processingMaintenance, setProcessingMaintenance] = useState(false);

    // Reports State Removed (Duplicate)

    // Badge Management State
    const [badges, setBadges] = useState<any[]>([]);
    const [loadingBadges, setLoadingBadges] = useState(false);
    const [editingBadge, setEditingBadge] = useState<any | null>(null);
    const [badgeModalOpen, setBadgeModalOpen] = useState(false);
    const [importingBadgePackId, setImportingBadgePackId] = useState<string | null>(null);


    useEffect(() => {
        if (!loadingProfile && profile) {
            const isJefe = (Array.isArray(profile.userType) && profile.userType.includes('jefe')) || profile.userType === 'jefe';
            setIsAuthorized(isJefe);
        }
    }, [profile, loadingProfile]);

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

    const handleRecalculateList = async () => {
        if (!targetListId) return;
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando recálculo para lista: ${targetListId}...`, ...prev]);

        try {
            const functions = getFunctions(undefined, FUNCTIONS_REGION);
            // Call both to be safe: averages and aggregates
            const recalculateAverages = httpsCallable(functions, 'adminRecalculateListAverages');
            const updateAggregates = httpsCallable(functions, 'adminUpdateSingleListAggregates');

            setMaintenanceLog(prev => [`... Llamando adminRecalculateListAverages...`, ...prev]);
            const res1: any = await recalculateAverages({ listId: targetListId });
            setMaintenanceLog(prev => [`✅ Averages: ${JSON.stringify(res1.data)}`, ...prev]);

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

    const handleRecalculateEverything = async () => {
        if (!confirm("¿Estás seguro de que quieres recalcular TODO (Listas, Lugares y Usuarios)? Esto puede tardar un rato.")) return;

        // Chain them sequentially
        await handleGlobalRecalculate('lists');
        await handleGlobalRecalculate('places');
        await handleGlobalRecalculate('users');

        setMaintenanceLog(prev => [`🎉🎉 MANTENIMIENTO TOTAL COMPLETADO 🎉🎉`, ...prev]);
    };



    const handleBackfillAuthorUserType = async () => {
        if (!confirm('¿Seguro? Esto iterará TODAS las reseñas de todas las listas y puede tardar varios minutos.')) return;
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando backfill de authorUserType...`, ...prev]);
        try {
            // Build uid -> userType map from all users
            const usersSnap = await getDocs(collection(db, 'users'));
            const userTypeMap = new Map<string, any>();
            usersSnap.docs.forEach(d => userTypeMap.set(d.id, d.data().userType ?? []));
            setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] ${usersSnap.size} usuarios cargados.`, ...prev]);

            const listsSnap = await getDocs(collection(db, 'lists'));
            let total = 0, updated = 0;
            for (const listDoc of listsSnap.docs) {
                const reviewsSnap = await getDocs(collection(db, 'lists', listDoc.id, 'reviews'));
                for (const reviewDoc of reviewsSnap.docs) {
                    total++;
                    const data = reviewDoc.data();
                    const uid = data.userId || data.authorId;
                    if (!uid) continue;
                    const userType = userTypeMap.get(uid);
                    if (userType === undefined) continue;
                    await updateDoc(doc(db, 'lists', listDoc.id, 'reviews', reviewDoc.id), { authorUserType: userType });
                    updated++;
                }
            }
            setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] ✅ Backfill completado: ${updated}/${total} reseñas actualizadas.`, ...prev]);
        } catch (err: any) {
            setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] ❌ Error: ${err.message}`, ...prev]);
        } finally {
            setProcessingMaintenance(false);
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

    // --- Reports Functions ---
    const fetchReports = async () => {
        setLoadingReports(true);
        try {
            const constraints: any[] = [firestoreLimit(100)];
            if (reportFilter !== 'all') {
                constraints.push(where('status', '==', reportFilter));
            }
            const snap = await getDocs(query(collection(db, 'reports'), ...constraints));
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setReports(docs);

            // Fetch overall stats
            const allSnap = await getDocs(query(collection(db, 'reports'), firestoreLimit(500)));
            const allDocs = allSnap.docs.map(d => d.data());
            setReportStats({
                pending: allDocs.filter(d => !d.status || d.status === 'pending').length,
                resolved: allDocs.filter(d => d.status === 'resolved').length,
                rejected: allDocs.filter(d => d.status === 'rejected').length,
                total: allDocs.length,
            });
        } catch (error) {
            console.error("Error fetching reports:", error);
        } finally {
            setLoadingReports(false);
        }
    };

    const handleUpdateReportStatus = async (reportId: string, newStatus: string, closedStatus?: string) => {
        try {
            const notes = adminNotes[reportId] || '';
            await updateDoc(doc(db, 'reports', reportId), {
                status: newStatus,
                resolvedAt: new Date(),
                resolvedBy: user?.uid || 'admin',
                ...(notes ? { adminNotes: notes } : {}),
                ...(closedStatus ? { resolvedClosedStatus: closedStatus } : {}),
            });

            // If resolving a place closure report, update the place document + batch-update reviews
            if (newStatus === 'resolved' && closedStatus) {
                const report = reports.find(r => r.id === reportId);
                if (report?.targetType === 'place' && report.targetId) {
                    const placeTargetId = report.targetId;
                    await updateDoc(doc(db, 'places', placeTargetId), {
                        closedStatus,
                        closedStatusUpdatedAt: new Date(),
                    });

                    // Batch-update root reviews so ReviewCard shows closed status everywhere
                    try {
                        const reviewsSnap = await getDocs(
                            query(collection(db, 'reviews'), where('placeId', '==', placeTargetId), firestoreLimit(400))
                        );
                        const batch = writeBatch(db);
                        reviewsSnap.docs.forEach(d => {
                            batch.update(d.ref, { placeClosedStatus: closedStatus });
                        });
                        if (reviewsSnap.docs.length > 0) await batch.commit();
                    } catch (batchErr) {
                        console.warn('Could not batch-update reviews with closedStatus:', batchErr);
                    }
                }
            }

            fetchReports();
        } catch (error) {
            console.error("Error updating report:", error);
        }
    };

    const handleSyncPlaceStatus = async (placeId: string) => {
        setSyncingPlaceId(placeId);
        try {
            const { getFunctions: getF, httpsCallable: hc } = await import('firebase/functions');
            const { getApp } = await import('firebase/app');
            const fns = getF(getApp(), 'europe-west1');
            const syncFn = hc(fns, 'syncPlaceStatusFromGoogle');
            const result: any = await syncFn({ placeId });
            const { businessStatus, closedStatus } = result.data;
            const label = closedStatus === 'permanently_closed'
                ? '🔒 Cerrado permanentemente'
                : closedStatus === 'temporarily_closed'
                    ? '⏰ Cerrado temporalmente'
                    : `✅ Operativo (${businessStatus})`;
            setSyncResults(prev => ({ ...prev, [placeId]: label }));
        } catch (err: any) {
            setSyncResults(prev => ({ ...prev, [placeId]: `Error: ${err.message}` }));
        } finally {
            setSyncingPlaceId(null);
        }
    };

    // Parse placeId from a group report targetId (format: "{placeId}_{elementName}")
    const groupReportPlaceId = (targetId: string) => {
        const idx = targetId.indexOf('_');
        return idx > 0 ? targetId.substring(0, idx) : targetId;
    };

    const handleMarkItemUnavailable = async (report: any) => {
        const placeId = groupReportPlaceId(report.targetId);
        const elementName = report.targetName;
        if (!placeId || !elementName) return;
        setMarkingUnavailable(prev => ({ ...prev, [report.id]: true }));
        try {
            await updateDoc(doc(db, 'places', placeId), {
                unavailableItems: arrayUnion(elementName)
            });
            await handleUpdateReportStatus(report.id, 'resolved');
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setMarkingUnavailable(prev => ({ ...prev, [report.id]: false }));
        }
    };

    const handleUpdatePlaceFromGoogle = async () => {
        if (!selectedItem || !user) throw new Error('Sin datos de lugar o autenticación');
        const idToken = await user.getIdToken();
        const googleId = selectedItem.googlePlaceId || selectedItem.id;
        await PlaceService.ensurePlaceSyncedWithBackend(googleId, idToken);
        // Refresh the selected item from Firestore
        const snap = await getDoc(doc(db, 'places', selectedItem.id));
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
                homeReviewsMonths: typeof data.homeReviewsMonths === 'number' ? data.homeReviewsMonths : 12,
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
                homeReviewsMonths: otherSettings.homeReviewsMonths,
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
        if (activeTab === 'reports') fetchReports();
        if (activeTab === 'others') fetchOtherSettings();
    }, [activeTab, reportFilter]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        if (!isAuthorized && !loadingProfile) {
            // Optional: redirect or just show the unauthorized message
        }
    }, [isAuthorized, loadingProfile]);

    // Update active tab logic if needed

    if (loadingProfile || isAuthorized === null) {
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
                <div className="flex h-screen overflow-hidden pt-16"> {/* Added pt-16 for header spacing */}
                    {/* Mobile Sidebar Toggle */}
                    <button
                        className="fixed top-20 left-4 z-50 p-2 bg-[#151b2e] border border-white/10 rounded-lg text-white md:hidden shadow-xl"
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    >
                        {isSidebarOpen ? <X className="w-6 h-6" /> : <ListIcon className="w-6 h-6" />}
                    </button>

                    {/* Sidebar Nav */}
                    <nav className={`
                        fixed md:static inset-y-0 left-0 z-40 w-64 bg-[#121624] border-r border-white/5 flex flex-col pt-20 md:pt-6 shrink-0 transition-transform duration-300 ease-in-out
                        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    `}>
                        <div className="px-6 mb-6 md:hidden">
                            <h2 className="text-xl font-bold text-white">Menú Dev</h2>
                        </div>

                        <button
                            onClick={() => { setActiveTab('console'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'console' ? 'border-indigo-500 bg-indigo-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Database className="w-5 h-5" /> Consola de Datos
                        </button>
                        <button
                            onClick={() => { setActiveTab('algolia'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'algolia' ? 'border-cyan-500 bg-cyan-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <CloudLightning className="w-5 h-5" /> Algolia Sync
                        </button>
                        <button
                            onClick={() => { setActiveTab('maintenance'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'maintenance' ? 'border-emerald-500 bg-emerald-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <RefreshCw className="w-5 h-5" /> Mantenimiento
                        </button>
                        <button
                            onClick={() => { setActiveTab('gamification'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'gamification' ? 'border-amber-500 bg-amber-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Tag className="w-5 h-5" /> Gamificación
                        </button>
                        <button
                            onClick={() => { setActiveTab('reports'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'reports' ? 'border-red-500 bg-red-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Flag className="w-5 h-5" /> Reportes
                        </button>
                        <button
                            onClick={() => { setActiveTab('branding'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'branding' ? 'border-indigo-500 bg-indigo-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Palette className="w-5 h-5" /> Marca & SEO
                        </button>
                        <button
                            onClick={() => { setActiveTab('others'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'others' ? 'border-amber-500 bg-amber-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <SlidersHorizontal className="w-5 h-5" /> OTROS
                        </button>
                        <button
                            onClick={() => { setActiveTab('lists'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'lists' ? 'border-indigo-400 bg-indigo-400/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <ListIcon className="w-5 h-5" /> Listas
                        </button>
                        <button
                            onClick={() => { setActiveTab('places'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'places' ? 'border-green-500 bg-green-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <MapPin className="w-5 h-5" /> Lugares
                        </button>
                        <button
                            onClick={() => { setActiveTab('reviews'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'reviews' ? 'border-amber-500 bg-amber-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <MessageSquare className="w-5 h-5" /> Reseñas
                        </button>
                        <button
                            onClick={() => { setActiveTab('tags'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'tags' ? 'border-pink-500 bg-pink-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Tag className="w-5 h-5" /> Etiquetas
                        </button>
                        <button
                            onClick={() => { setActiveTab('usuarios'); setIsSidebarOpen(false); }}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'usuarios' ? 'border-indigo-500 bg-indigo-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Users className="w-5 h-5" /> Usuarios
                        </button>
                    </nav>

                    {/* Main Content */}
                    <main className="flex-1 overflow-y-auto bg-[#0a0c10] p-8">

                        {activeTab === 'console' && (
                            <div className="space-y-6">
                                {/* Search Bar */}
                                <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6 shadow-xl">
                                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <Search className="w-5 h-5 text-indigo-400" /> Explorador de Firestore
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Colección</label>
                                            <select
                                                value={consoleParams.collection}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, collection: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
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
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User ID / Email</label>
                                            <input
                                                placeholder="Owner ID"
                                                value={consoleParams.user || ''}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, user: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre (Contiene)</label>
                                            <input
                                                placeholder="Client Filter"
                                                value={consoleParams.nameContains || ''}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, nameContains: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Google Place ID</label>
                                            <input
                                                placeholder="ChIJ..."
                                                value={consoleParams.googleId || ''}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, googleId: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Límite</label>
                                            <input
                                                type="number"
                                                value={consoleParams.limit}
                                                onChange={(e) => setConsoleParams({ ...consoleParams, limit: parseInt(e.target.value) || 50 })}
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
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
                                            className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors flex items-center gap-2"
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
                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden overflow-x-auto">
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
                                                        <td className="p-4 font-mono text-xs text-indigo-400">{item.id}</td>
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
                                                                className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/30"
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

                                <DeveloperItemModal
                                    isOpen={isModalOpen}
                                    onClose={() => setIsModalOpen(false)}
                                    collectionName={consoleParams.collection}
                                    item={selectedItem}
                                    onSaved={handleConsoleSearch}
                                    onUpdateFromGoogle={consoleParams.collection === 'places' ? handleUpdatePlaceFromGoogle : undefined}
                                />
                            </div >
                        )}

                        {
                            activeTab === 'algolia' && (
                                <div className="space-y-6">
                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                            <CloudLightning className="w-5 h-5 text-yellow-400" /> Sincronización Manual
                                        </h3>
                                        <p className="text-gray-400 mb-6">Fuerza la re-indexación de datos en Algolia. Úsalo con precaución.</p>

                                        <div className="flex flex-wrap gap-4">
                                            <button
                                                onClick={() => runAlgoliaSync(null)}
                                                disabled={processingAlgolia}
                                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2"
                                            >
                                                Sincronizar TODO
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
                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                            <ListIcon className="w-5 h-5 text-purple-400" /> Mantenimiento de Listas
                                        </h3>
                                        <p className="text-gray-400 mb-6">Herramientas para recalcular contadores y estadísticas de listas desincronizadas.</p>

                                        {/* Global Maintenance */}
                                        <div className="mb-8 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                                            <h4 className="text-sm font-bold text-indigo-300 uppercase mb-3 flex items-center gap-2">
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
                                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
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
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500 font-mono"
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
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500 font-mono"
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

                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6">
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

                                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-xs h-96 overflow-y-auto">
                                        <div className="text-gray-500 mb-2 border-b border-white/5 pb-2">Logs de mantenimiento...</div>
                                        {maintenanceLog.map((log, i) => (
                                            <div key={i} className="text-gray-300 py-1">{log}</div>
                                        ))}
                                    </div>
                                </div>
                            )
                        }

                        {activeTab === 'branding' && <BrandingManager />}

                        {activeTab === 'others' && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6">
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
                                                    className="bg-[#0b1021] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-indigo-500 shrink-0"
                                                >
                                                    <option value={1}>1 mes</option>
                                                    <option value={3}>3 meses</option>
                                                    <option value={6}>6 meses</option>
                                                    <option value={12}>12 meses</option>
                                                    <option value={24}>24 meses</option>
                                                    <option value={0}>Sin límite</option>
                                                </select>
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
                                                className={`rounded-2xl border border-white/10 bg-gradient-to-br ${pack.theme} bg-[#151b2e] p-5`}
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
                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6 mb-8 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-5">
                                            <CheckCircle className="w-32 h-32 text-indigo-500" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-4 relative z-10 flex items-center gap-2">
                                            <CheckCircle className="w-5 h-5 text-indigo-400" /> Asignación Manual
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10 items-end">
                                            <div className="col-span-1">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User ID</label>
                                                <input
                                                    id="manualAssignUserId"
                                                    placeholder="User UID"
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Badge ID</label>
                                                <select
                                                    id="manualAssignBadgeId"
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
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
                                            <div key={badge.id} className="bg-[#151b2e] border border-white/10 rounded-xl p-6 relative group hover:border-amber-500/50 transition-all">
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
                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6 opacity-60 hover:opacity-100 transition-opacity">
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
                                            <div className="bg-[#151b2e] rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
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

                                                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-[#151b2e]">
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

                        {
                            activeTab === 'reports' && (
                                <div className="max-w-6xl mx-auto space-y-6">
                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                            <Flag className="w-6 h-6 text-red-500" /> Centro de Moderación
                                        </h2>
                                        <button onClick={fetchReports} className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white">
                                            <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>

                                    {/* Stats Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Pendientes', value: reportStats.pending, color: 'yellow', filter: 'pending' as const },
                                            { label: 'Resueltos', value: reportStats.resolved, color: 'emerald', filter: 'resolved' as const },
                                            { label: 'Rechazados', value: reportStats.rejected, color: 'red', filter: 'rejected' as const },
                                            { label: 'Total', value: reportStats.total, color: 'indigo', filter: 'all' as const },
                                        ].map(stat => (
                                            <button
                                                key={stat.label}
                                                onClick={() => setReportFilter(stat.filter)}
                                                className={`rounded-xl border p-4 text-left transition-all ${reportFilter === stat.filter
                                                    ? `border-${stat.color}-500/40 bg-${stat.color}-500/10`
                                                    : 'border-white/10 bg-[#151b2e]/60 hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{stat.label}</div>
                                                <div className={`text-2xl font-black mt-1 text-${stat.color}-400`}>{stat.value}</div>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Filter Tabs */}
                                    <div className="flex gap-2 overflow-x-auto">
                                        {(['pending', 'resolved', 'rejected', 'all'] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => setReportFilter(f)}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${reportFilter === f
                                                    ? 'bg-white/10 text-white border border-white/20'
                                                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                                                    }`}
                                            >
                                                {f === 'all' ? 'Todos' : f === 'pending' ? '⏳ Pendientes' : f === 'resolved' ? '✅ Resueltos' : '❌ Rechazados'}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Report Cards */}
                                    <div className="space-y-3">
                                        {loadingReports && (
                                            <div className="flex items-center justify-center py-12">
                                                <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
                                            </div>
                                        )}

                                        {!loadingReports && reports.map(report => {
                                            const isExpanded = expandedReportId === report.id;
                                            const statusColor = report.status === 'resolved' ? 'emerald' : report.status === 'rejected' ? 'red' : 'yellow';
                                            const typeIcons: Record<string, string> = { review: '📝', user: '👤', place: '📍', group: '👥' };

                                            return (
                                                <div
                                                    key={report.id}
                                                    className={`rounded-xl border overflow-hidden transition-all ${isExpanded ? 'border-white/20 bg-[#151b2e]' : 'border-white/10 bg-[#151b2e]/60 hover:border-white/15'
                                                        }`}
                                                >
                                                    {/* Row summary */}
                                                    <button
                                                        onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                                                        className="w-full text-left p-4 flex items-center gap-4"
                                                    >
                                                        {/* Status badge */}
                                                        <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-${statusColor}-500/15 text-${statusColor}-400 border border-${statusColor}-500/20`}>
                                                            {report.status || 'pending'}
                                                        </span>

                                                        {/* Type icon */}
                                                        <span className="text-lg shrink-0">{typeIcons[report.targetType] || '⚠️'}</span>

                                                        {/* Main info */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-white truncate">{report.targetName || report.targetId}</span>
                                                                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 uppercase font-bold shrink-0">
                                                                    {report.targetType}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                                                                {report.issueType} · {report.description || 'Sin descripción'}
                                                            </div>
                                                        </div>

                                                        {/* Date */}
                                                        <span className="text-[11px] text-gray-500 shrink-0 hidden md:block">
                                                            {report.createdAt?.seconds ? new Date(report.createdAt.seconds * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}
                                                        </span>

                                                        {/* Expand chevron */}
                                                        <svg className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>

                                                    {/* Expanded detail */}
                                                    {isExpanded && (
                                                        <div className="border-t border-white/10 p-5 space-y-4 bg-black/20">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Target ID</div>
                                                                    <div className="text-xs font-mono text-indigo-400 select-all break-all flex items-center gap-1.5">
                                                                        <span>{report.targetId}</span>
                                                                        {(() => {
                                                                            const linkMap: Record<string, string> = {
                                                                                place: `/place/${report.targetId}`,
                                                                                user: `/profile/${report.targetId}`,
                                                                                list: `/list/${report.targetId}`,
                                                                            };
                                                                            const href = linkMap[report.targetType];
                                                                            return href ? (
                                                                                <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-indigo-400 hover:text-indigo-200 transition-colors">
                                                                                    <ExternalLink className="w-3 h-3" />
                                                                                </a>
                                                                            ) : null;
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Tipo de Problema</div>
                                                                    <div className="text-sm text-white capitalize">{report.issueType}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Reportado por</div>
                                                                    <div className="text-xs text-gray-300 flex items-center gap-1.5">
                                                                        <a href={`/profile/${report.userId || report.reportedByUserId}`} target="_blank" rel="noopener noreferrer" className="font-mono text-gray-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                                                                            <span className="select-all">{report.userId || report.reportedByUserId}</span>
                                                                            <ExternalLink className="w-3 h-3 shrink-0" />
                                                                        </a>
                                                                        {(report.userName || report.reportedByName) && <span className="text-indigo-300">({report.userName || report.reportedByName})</span>}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Fecha</div>
                                                                    <div className="text-sm text-gray-300">
                                                                        {report.createdAt?.seconds
                                                                            ? new Date(report.createdAt.seconds * 1000).toLocaleString('es-ES')
                                                                            : '-'}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {report.description && (
                                                                <div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Descripción del Reporter</div>
                                                                    <div className="text-sm text-gray-200 bg-black/30 rounded-lg p-3 border border-white/5">
                                                                        {report.description}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Admin notes */}
                                                            {(!report.status || report.status === 'pending') && (
                                                                <div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Notas del Admin (opcional)</div>
                                                                    <textarea
                                                                        value={adminNotes[report.id] || ''}
                                                                        onChange={(e) => setAdminNotes(prev => ({ ...prev, [report.id]: e.target.value }))}
                                                                        placeholder="Razón de la resolución, acciones tomadas..."
                                                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 h-16 resize-none"
                                                                    />
                                                                </div>
                                                            )}

                                                            {report.adminNotes && (
                                                                <div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Notas del Admin</div>
                                                                    <div className="text-sm text-amber-200 bg-amber-500/5 rounded-lg p-3 border border-amber-500/10">
                                                                        {report.adminNotes}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Google Maps Sync (solo para lugares) */}
                                                            {report.targetType === 'place' && (
                                                                <div className="flex flex-col gap-2">
                                                                    <div className="flex items-center gap-3">
                                                                        <button
                                                                            onClick={() => handleSyncPlaceStatus(report.targetId)}
                                                                            disabled={syncingPlaceId === report.targetId}
                                                                            className="px-4 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-xs font-bold rounded-lg flex items-center gap-2 transition-colors border border-blue-500/30 disabled:opacity-50"
                                                                        >
                                                                            <RefreshCcw className={`w-3.5 h-3.5 ${syncingPlaceId === report.targetId ? 'animate-spin' : ''}`} />
                                                                            Sync Google Maps
                                                                        </button>
                                                                        {syncResults[report.targetId] && (
                                                                            <span className="text-xs text-gray-300">{syncResults[report.targetId]}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Acciones específicas para grupos (elemento/lugar) */}
                                                            {report.targetType === 'group' && (() => {
                                                                const placeId = groupReportPlaceId(report.targetId);
                                                                return (
                                                                    <div className="flex flex-col gap-2 p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                                                                        <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Acciones sobre el elemento</p>
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <a
                                                                                href={`/place/${placeId}`}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-white/10"
                                                                            >
                                                                                <ExternalLink className="w-3.5 h-3.5" /> Ver lugar
                                                                            </a>
                                                                            {(report.issueType === 'item_not_available' || report.issueType === 'incorrect_info') && report.status !== 'resolved' && (
                                                                                <button
                                                                                    onClick={() => handleMarkItemUnavailable(report)}
                                                                                    disabled={markingUnavailable[report.id]}
                                                                                    className="px-3 py-1.5 bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-orange-500/30 disabled:opacity-50"
                                                                                >
                                                                                    {markingUnavailable[report.id] ? 'Marcando...' : `Marcar "${report.targetName}" no disponible`}
                                                                                </button>
                                                                            )}
                                                                            {report.issueType === 'place_closed' && (
                                                                                <button
                                                                                    onClick={() => handleSyncPlaceStatus(placeId)}
                                                                                    disabled={syncingPlaceId === placeId}
                                                                                    className="px-3 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-blue-500/30 disabled:opacity-50"
                                                                                >
                                                                                    <RefreshCcw className={`w-3.5 h-3.5 ${syncingPlaceId === placeId ? 'animate-spin' : ''}`} />
                                                                                    Sync lugar desde Google
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Actions */}
                                                            <div className="flex flex-wrap gap-3 pt-2">
                                                                {/* Place closure reports: show specific close buttons */}
                                                                {report.status !== 'resolved' && report.issueType === 'place_closed' && report.targetType === 'place' ? (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleUpdateReportStatus(report.id, 'resolved', 'permanently_closed')}
                                                                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                                                        >
                                                                            <CheckCircle className="w-4 h-4" /> Cerrado permanentemente
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUpdateReportStatus(report.id, 'resolved', 'temporarily_closed')}
                                                                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                                                        >
                                                                            <CheckCircle className="w-4 h-4" /> Cerrado temporalmente
                                                                        </button>
                                                                    </>
                                                                ) : report.status !== 'resolved' ? (
                                                                    <button
                                                                        onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                                                                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                                                                    >
                                                                        <CheckCircle className="w-4 h-4" /> Resolver
                                                                    </button>
                                                                ) : null}
                                                                {report.status !== 'rejected' && (
                                                                    <button
                                                                        onClick={() => handleUpdateReportStatus(report.id, 'rejected')}
                                                                        className="px-5 py-2 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors border border-red-500/30 hover:border-red-500"
                                                                    >
                                                                        <X className="w-4 h-4" /> Rechazar
                                                                    </button>
                                                                )}
                                                                {report.status && report.status !== 'pending' && (
                                                                    <button
                                                                        onClick={() => handleUpdateReportStatus(report.id, 'pending')}
                                                                        className="px-5 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors border border-white/10"
                                                                    >
                                                                        Reabrir
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {!loadingReports && reports.length === 0 && (
                                            <div className="rounded-xl border border-white/10 bg-[#151b2e]/60 p-12 text-center">
                                                <Flag className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                                                <p className="text-gray-500 font-bold">No hay reportes {reportFilter !== 'all' ? `con estado "${reportFilter}"` : ''}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        }

                        {activeTab === 'lists' && (
                            <ListsManagerTab />
                        )}

                        {activeTab === 'places' && (
                            <PlacesManagerTab />
                        )}

                        {activeTab === 'reviews' && (
                            <ReviewsManagerTab />
                        )}
                        {activeTab === 'tags' && (
                            <TagsManagerTab />
                        )}
                        {activeTab === 'usuarios' && (
                            <UsersManagerTab />
                        )}
                    </main >
                </div >
            )}
        </>
    );
};


