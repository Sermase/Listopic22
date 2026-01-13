import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { BrandingManager } from '../components/developer/BrandingManager';
import { db, functions, storage } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, limit as firestoreLimit, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Terminal, Search, AlertCircle, RefreshCw, List as ListIcon, MapPin, Layers, Database, CloudLightning, Tag, CheckCircle, X, Upload, Flag, MessageSquare, Palette } from 'lucide-react';

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
    const [activeTab, setActiveTab] = useState<'console' | 'algolia' | 'maintenance' | 'gamification' | 'reports' | 'branding'>('console');
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    // Console State
    const [consoleParams, setConsoleParams] = useState<ConsoleSearchParams>({
        collection: 'lists',
        limit: 100
    });
    const [consoleResults, setConsoleResults] = useState<any[]>([]);
    const [loadingConsole, setLoadingConsole] = useState(false);
    const [consoleError, setConsoleError] = useState<string | null>(null);

    // Algolia State
    const [algoliaLog, setAlgoliaLog] = useState<string[]>([]);
    const [processingAlgolia, setProcessingAlgolia] = useState(false);

    // Maintenance State
    const [targetListId, setTargetListId] = useState('');
    const [targetPlaceId, setTargetPlaceId] = useState('');
    const [maintenanceLog, setMaintenanceLog] = useState<string[]>([]);
    const [processingMaintenance, setProcessingMaintenance] = useState(false);

    // Reports State
    const [reports, setReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);

    // Badge Management State
    const [badges, setBadges] = useState<any[]>([]);
    const [loadingBadges, setLoadingBadges] = useState(false);
    const [editingBadge, setEditingBadge] = useState<any | null>(null);
    const [badgeModalOpen, setBadgeModalOpen] = useState(false);


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

    const handleGlobalRecalculate = async (type: 'lists' | 'places') => {
        setProcessingMaintenance(true);
        setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando recálculo GLOBAL para: ${type.toUpperCase()}...`, ...prev]);

        try {
            const functions = getFunctions(undefined, FUNCTIONS_REGION);
            // Decide function based on type
            const fnName = type === 'lists' ? 'adminRecalculateAllLists' : 'adminRecalculateAllPlaces';
            const bulkFn = httpsCallable(functions, fnName);

            setMaintenanceLog(prev => [`... Llamando ${fnName} ...`, ...prev]);
            const res: any = await bulkFn();
            setMaintenanceLog(prev => [`✅ Resultado Global: ${JSON.stringify(res.data)}`, ...prev]);
            setMaintenanceLog(prev => [`✨ MANTENIMIENTO GLOBAL COMPLETADO para ${type}`, ...prev]);

        } catch (error: any) {
            console.error(`Error filtering ${type}:`, error);
            setMaintenanceLog(prev => [`❌ Error Global: ${error.message}`, ...prev]);
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
            setBadges(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
                await setDoc(doc(db, 'badges', id), data, { merge: true });
            }
            fetchBadges();
            setBadgeModalOpen(false);
        } catch (error) {
            console.error("Error saving badge:", error);
            alert("Error saving badge");
        }
    };

    // --- Reports Functions ---
    const fetchReports = async () => {
        setLoadingReports(true);
        try {
            const snap = await getDocs(query(collection(db, 'reports'), firestoreLimit(50)));
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.createdAt?.seconds - a.createdAt?.seconds));
        } catch (error) {
            console.error("Error fetching reports:", error);
        } finally {
            setLoadingReports(false);
        }
    };

    const handleUpdateReportStatus = async (reportId: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'reports', reportId), { status: newStatus });
            fetchReports();
        } catch (error) {
            console.error("Error updating report:", error);
            alert("Error al actualizar reporte");
        }
    };

    useEffect(() => {
        if (activeTab === 'gamification') fetchBadges();
        if (activeTab === 'reports') fetchReports();
    }, [activeTab]);

    if (loadingProfile || isAuthorized === null) {
        return <div className="min-h-screen pt-40 text-center text-gray-500">Verificando permisos...</div>;
    }

    return (
        <>
            {!isAuthorized ? (
                <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] p-6 text-center">
                    <AlertCircle className="w-16 h-16 text-red-500 mb-4 opacity-80" />
                    <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
                    <p className="text-gray-500 max-w-md">Esta área es exclusiva para administradores del sistema.</p>
                </div>
            ) : (
                <div className="flex h-[calc(100vh-73px)] overflow-hidden">
                    {/* Sidebar Nav */}
                    <nav className="w-64 bg-[#121624] border-r border-white/5 flex flex-col pt-6 shrink-0">
                        <button
                            onClick={() => setActiveTab('console')}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'console' ? 'border-indigo-500 bg-indigo-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Database className="w-5 h-5" /> Consola de Datos
                        </button>
                        <button
                            onClick={() => setActiveTab('algolia')}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'algolia' ? 'border-cyan-500 bg-cyan-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <CloudLightning className="w-5 h-5" /> Algolia Sync
                        </button>
                        <button
                            onClick={() => setActiveTab('maintenance')}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'maintenance' ? 'border-emerald-500 bg-emerald-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <RefreshCw className="w-5 h-5" /> Mantenimiento
                        </button>
                        <button
                            onClick={() => setActiveTab('gamification')}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'gamification' ? 'border-amber-500 bg-amber-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Tag className="w-5 h-5" /> Gamificación
                        </button>
                        <button
                            onClick={() => setActiveTab('reports')}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'reports' ? 'border-red-500 bg-red-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Flag className="w-5 h-5" /> Reportes
                        </button>
                        <button
                            onClick={() => setActiveTab('branding')}
                            className={`flex items-center gap-3 px-6 py-3 border-l-2 transition-all ${activeTab === 'branding' ? 'border-indigo-500 bg-indigo-500/5 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        >
                            <Palette className="w-5 h-5" /> Marca & SEO
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
                                                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                                        <td className="p-4 font-mono text-xs text-indigo-400">{item.id}</td>
                                                        <td className="p-4 font-medium">{item.name || item.displayName || item.title || '-'}</td>
                                                        <td className="p-4 text-xs">{item.userId || item.ownerId || item.email || '-'}</td>
                                                        <td className="p-4 text-xs font-mono">
                                                            {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                                        </td>
                                                        <td className="p-4">
                                                            <button
                                                                onClick={() => {
                                                                    alert(JSON.stringify(item, null, 2));
                                                                }}
                                                                className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/30"
                                                            >
                                                                JSON
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
                            </div>
                        )}

                        {activeTab === 'algolia' && (
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
                        )}


                        {activeTab === 'maintenance' && (
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

                                <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-xs h-96 overflow-y-auto">
                                    <div className="text-gray-500 mb-2 border-b border-white/5 pb-2">Logs de mantenimiento...</div>
                                    {maintenanceLog.map((log, i) => (
                                        <div key={i} className="text-gray-300 py-1">{log}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'branding' && <BrandingManager />}

                        {activeTab === 'gamification' && (
                            <div className="max-w-6xl mx-auto">
                                <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
                                    <Tag className="w-6 h-6 text-amber-500" /> Gamificación Avanzada
                                </h2>

                                {/* --- BULK & GLOBAL OPERATIONS --- */}
                                <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6 mb-8 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <CloudLightning className="w-32 h-32 text-amber-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-4 relative z-10 flex items-center gap-2">
                                        <CloudLightning className="w-5 h-5 text-amber-400" /> Operaciones Globales
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                        {/* Global Recalc */}
                                        <div className="space-y-3">
                                            <p className="text-gray-400 text-sm">Recalcular estadísticas, medallas y niveles para <strong>TODOS</strong> los usuarios del sistema.</p>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm("⚠️ ¿Estás seguro? Esto recorrerá toda la base de datos de usuarios.")) return;
                                                    setLoadingBadges(true);
                                                    setMaintenanceLog(prev => [`[${new Date().toLocaleTimeString()}] Iniciando Recálculo Masivo de Gamificación...`, ...prev]);
                                                    try {
                                                        const functions = getFunctions(undefined, FUNCTIONS_REGION);
                                                        const bulkFn = httpsCallable(functions, 'adminRecalculateAllGamification');
                                                        const res: any = await bulkFn();
                                                        if (res.data.logs) {
                                                            setMaintenanceLog(prev => [...res.data.logs.reverse(), ...prev]);
                                                        }
                                                        setMaintenanceLog(prev => [`✅ Proceso masivo completado`, ...prev]);
                                                    } catch (e: any) {
                                                        console.error(e);
                                                        setMaintenanceLog(prev => [`❌ Error Backend: ${e.message}`, ...prev]);
                                                    } finally {
                                                        setLoadingBadges(false);
                                                    }
                                                }}
                                                disabled={loadingBadges}
                                                className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                                            >
                                                {loadingBadges ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />}
                                                Recalcular TODO (Niveles y Medallas)
                                            </button>
                                        </div>

                                        {/* Single User Tools */}
                                        <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                                            <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Herramientas por Usuario</h4>
                                            <div className="flex gap-2 mb-3">
                                                <input
                                                    type="text"
                                                    placeholder="ID de Usuario"
                                                    className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-1.5 text-sm text-white"
                                                    id="gamificationUserId" // Quick hook
                                                />
                                                <button
                                                    onClick={async () => {
                                                        const uid = (document.getElementById('gamificationUserId') as HTMLInputElement).value;
                                                        if (!uid) return alert("Pon un ID");
                                                        try {
                                                            const functions = getFunctions(undefined, FUNCTIONS_REGION);
                                                            const fn = httpsCallable(functions, 'adminRecalculateUserGamification');
                                                            setMaintenanceLog(prev => [`Recalculando usuario ${uid}...`, ...prev]);
                                                            await fn({ userId: uid });
                                                            setMaintenanceLog(prev => [`✅ Usuario ${uid} actualizado`, ...prev]);
                                                        } catch (e: any) {
                                                            alert(e.message);
                                                        }
                                                    }}
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-sm font-bold"
                                                >
                                                    Recalcular
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Log Output */}
                                    {maintenanceLog.length > 0 && activeTab === 'gamification' && (
                                        <div className="mt-6 bg-black/50 border border-white/10 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-emerald-300">
                                            {maintenanceLog.map((l, i) => <div key={i}>{l}</div>)}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-xl font-bold text-gray-400 flex items-center gap-2">
                                        <Database className="w-5 h-5" /> Definición de Medallas
                                    </h2>
                                    <button
                                        onClick={fetchBadges}
                                        className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loadingBadges ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {badges.map(badge => (
                                        <div key={badge.id} className="bg-[#151b2e] border border-white/10 rounded-xl p-6 relative group hover:border-amber-500/50 transition-all">
                                            <div className="absolute top-4 right-4 text-xs font-mono text-gray-500">{badge.id}</div>

                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-2xl shadow-lg">
                                                    {badge.icon || '🏅'}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white text-lg">{badge.name}</h3>
                                                    <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">{badge.category || 'GENERAL'}</span>
                                                </div>
                                            </div>
                                            <p className="text-gray-400 text-sm mb-4 line-clamp-2">{badge.description}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'reports' && (
                            <div className="max-w-6xl mx-auto space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                        <Flag className="w-6 h-6 text-red-500" /> Centro de Reportes
                                    </h2>
                                    <button onClick={fetchReports} className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white">
                                        <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>

                                <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-sm text-gray-300">
                                        <thead className="bg-white/5 text-gray-100 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="p-4">Estado</th>
                                                <th className="p-4">Tipo</th>
                                                <th className="p-4">Target</th>
                                                <th className="p-4">Mensaje</th>
                                                <th className="p-4">Reportado Por</th>
                                                <th className="p-4">Fecha</th>
                                                <th className="p-4">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {reports.map(report => (
                                                <tr key={report.id} className="hover:bg-white/5 transition-colors">
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${report.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400' :
                                                            report.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                                                'bg-yellow-500/20 text-yellow-400'
                                                            }`}>
                                                            {report.status || 'pending'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 capitalize text-white">{report.targetType} - {report.issueType}</td>
                                                    <td className="p-4 text-xs font-mono text-gray-500">
                                                        {report.targetId} <br />
                                                        <span className="text-indigo-400">{report.targetName}</span>
                                                    </td>
                                                    <td className="p-4 max-w-xs truncate" title={report.description}>{report.description || '-'}</td>
                                                    <td className="p-4 text-xs">{report.reportedByUserId}</td>
                                                    <td className="p-4 text-xs">{report.createdAt?.seconds ? new Date(report.createdAt.seconds * 1000).toLocaleDateString() : '-'}</td>
                                                    <td className="p-4 flex gap-2">
                                                        {report.status !== 'resolved' && (
                                                            <button
                                                                onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                                                                className="p-1 hover:bg-emerald-500/20 text-emerald-500 rounded" title="Resolver"
                                                            >
                                                                <CheckCircle className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {report.status !== 'rejected' && (
                                                            <button
                                                                onClick={() => handleUpdateReportStatus(report.id, 'rejected')}
                                                                className="p-1 hover:bg-red-500/20 text-red-500 rounded" title="Rechazar"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {reports.length === 0 && !loadingReports && (
                                                <tr>
                                                    <td colSpan={7} className="p-8 text-center text-gray-500">No hay reportes recientes.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            )}
        </>
    );
};
