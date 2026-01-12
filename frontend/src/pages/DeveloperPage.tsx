import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, limit as firestoreLimit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Terminal, Search, AlertCircle, RefreshCw, List as ListIcon, MapPin, Layers, Database, CloudLightning, Tag, CheckCircle } from 'lucide-react';

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
    const [activeTab, setActiveTab] = useState<'console' | 'algolia' | 'maintenance'>('console');
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

    if (loadingProfile || isAuthorized === null) {
        return <div className="min-h-screen pt-40 text-center text-gray-500">Verificando permisos...</div>;
    }

    if (!isAuthorized) {
        return (
            <div className="min-h-screen pt-40 text-center text-red-500">
                <AlertCircle className="w-16 h-16 mx-auto mb-4" />
                <h1 className="text-2xl font-bold">Acceso Denegado</h1>
                <p>No tienes permisos de administrador.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0b1021] pt-24 px-4 pb-20">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8 flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                        <Terminal className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Panel de Desarrollador</h1>
                        <p className="text-gray-400">Herramientas de administración y depuración</p>
                    </div>
                </header>

                {/* Tabs */}
            </div>
            <div className="flex gap-4 border-b border-white/10 mb-8">
                <button
                    onClick={() => setActiveTab('console')}
                    className={`pb-4 px-4 font-bold flex items-center gap-2 transition-colors relative ${activeTab === 'console' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <Database className="w-4 h-4" /> Data Viewer
                    {activeTab === 'console' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('maintenance')}
                    className={`pb-4 px-4 font-bold flex items-center gap-2 transition-colors relative ${activeTab === 'maintenance' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <ListIcon className="w-4 h-4" /> Mantenimiento
                    {activeTab === 'maintenance' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('algolia')}
                    className={`pb-4 px-4 font-bold flex items-center gap-2 transition-colors relative ${activeTab === 'algolia' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <CloudLightning className="w-4 h-4" /> Algolia Sync
                    {activeTab === 'algolia' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                </button>
            </div>

            {/* Content */}
            {activeTab === 'console' && (
                <div className="space-y-6">
                    {/* Search Bar */}
                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6">
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
        </div>
    );
};
