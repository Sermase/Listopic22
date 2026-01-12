import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { db, functions, storage } from '../firebase'; // Ensure export in firebase.ts
import { collection, getDocs, doc, writeBatch, Timestamp, addDoc, serverTimestamp, setDoc, query, where, getDoc, limit as firestoreLimit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Terminal, Search, AlertCircle, RefreshCw, List as ListIcon, MapPin, Layers, Database, CloudLightning, Tag, CheckCircle, X, Upload } from 'lucide-react';

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
    const [activeTab, setActiveTab] = useState<'console' | 'algolia' | 'maintenance' | 'gamification'>('console');
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

    // --- Badge Management State ---
    const [badges, setBadges] = useState<any[]>([]);
    const [loadingBadges, setLoadingBadges] = useState(false);
    const [editingBadge, setEditingBadge] = useState<any | null>(null);
    const [badgeModalOpen, setBadgeModalOpen] = useState(false);

    // Fetch Badges
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

    useEffect(() => {
        if (activeTab === 'gamification') fetchBadges();
    }, [activeTab]);

    const handleSaveBadge = async (badgeData: any) => {
        try {
            const { id, ...data } = badgeData;
            if (id) {
                // Update or Create with specific ID
                await setDoc(doc(db, 'badges', id), data, { merge: true });
            } else {
                // Create new logic (auto id? or forced id?) - Let's force ID in modal
            }
            fetchBadges();
            setBadgeModalOpen(false);
        } catch (error) {
            console.error("Error saving badge:", error);
            alert("Error saving badge");
        }
    };

    if (loadingProfile || isAuthorized === null) {
        return <div className="min-h-screen pt-40 text-center text-gray-500">Verificando permisos...</div>;
    }

    return (
        <div className="min-h-screen bg-[#0f111a] text-gray-300 font-sans">
            {/* Header */}
            <header className="bg-[#151b2e] border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <Terminal className="text-indigo-400 w-6 h-6" />
                    <h1 className="text-xl font-bold text-white tracking-tight">Developer Console</h1>
                    <span className="px-2 py-0.5 rounded textxs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">v2.0</span>
                </div>
                {profile && (
                    <div className="flex items-center gap-3 bg-black/20 px-3 py-1.5 rounded-full border border-white/5">
                        <img src={profile.photoUrl || ''} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-sm font-medium text-gray-300">{profile.username}</span>
                        {isAuthorized && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                    </div>
                )}
            </header>

            {!isAuthorized ? (
                <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] p-6 text-center">
                    <AlertCircle className="w-16 h-16 text-red-500 mb-4 opacity-80" />
                    <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
                    <p className="text-gray-500 max-w-md">Esta área es exclusiva para administradores del sistema.</p>
                </div>
            ) : (
                <div className="flex h-[calc(100vh-73px)] overflow-hidden">
                    {/* Sidebar Nav */}
                    <nav className="w-64 bg-[#121624] border-r border-white/5 flex flex-col pt-6">
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
                    </nav>

                    {/* Main Content */}
                    <main className="flex-1 overflow-y-auto bg-[#0a0c10] p-8">

                        {/* --- CONSOLE TAB --- */}
                        {activeTab === 'console' && (
                            <div className="max-w-5xl mx-auto space-y-6">
                                <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6 shadow-xl">
                                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <Search className="w-5 h-5 text-indigo-400" /> Explorador de Firestore
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500 font-medium ml-1">Colección</label>
                                            <select
                                                className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                                value={consoleParams.collection}
                                                onChange={e => setConsoleParams({ ...consoleParams, collection: e.target.value })}
                                            >
                                                <option value="lists">Listas</option>
                                                <option value="places">Lugares</option>
                                                <option value="users">Usuarios</option>
                                                <option value="reviews">Reseñas</option>
                                                <option value="listForums">Foros</option>
                                                <option value="badges">Medallas (Badges)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500 font-medium ml-1">ID Documento</label>
                                            <input
                                                type="text"
                                                placeholder="Ej: place_123"
                                                className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 outline-none placeholder-gray-700"
                                                value={consoleParams.id || ''}
                                                onChange={e => setConsoleParams({ ...consoleParams, id: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500 font-medium ml-1">User ID / Email</label>
                                            <input
                                                type="text"
                                                placeholder="Filtrar por usuario..."
                                                className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 outline-none placeholder-gray-700"
                                                value={consoleParams.user || ''}
                                                onChange={e => setConsoleParams({ ...consoleParams, user: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500 font-medium ml-1">Límite</label>
                                            <input
                                                type="number"
                                                className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                                value={consoleParams.limit}
                                                onChange={e => setConsoleParams({ ...consoleParams, limit: parseInt(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleConsoleSearch}
                                            disabled={loadingConsole}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {loadingConsole ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            Ejecutar Consulta
                                        </button>
                                    </div>
                                </div>

                                {/* Results */}
                                {consoleResults.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-gray-400 text-sm font-medium">{consoleResults.length} resultados encontrados</h3>
                                        </div>
                                        {consoleResults.map((item, idx) => (
                                            <div key={item.id || idx} className="bg-[#151b2e] border border-white/5 rounded-xl overflow-hidden hover:border-indigo-500/30 transition-colors">
                                                <div className="bg-black/20 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-indigo-400 font-mono text-sm">{item.id}</span>
                                                        {item.name && <span className="text-gray-400 text-sm border-l border-white/10 pl-2 ml-2">{item.name}</span>}
                                                    </div>
                                                    <span className="text-xs text-gray-600 font-mono">JSON</span>
                                                </div>
                                                <div className="p-4 overflow-x-auto">
                                                    <pre className="text-xs text-gray-300 font-mono leading-relaxed">
                                                        {JSON.stringify(item, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    !loadingConsole && consoleError ? (
                                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                                            {consoleError}
                                        </div>
                                    ) : (
                                        !loadingConsole && (
                                            <div className="py-12 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center text-gray-600">
                                                <Database className="w-8 h-8 mb-2 opacity-50" />
                                                <p>Sin resultados recientes</p>
                                            </div>
                                        )
                                    )
                                )}
                            </div>
                        )}

                        {/* --- ALGOLIA TAB --- */}
                        {activeTab === 'algolia' && (
                            <div className="max-w-3xl mx-auto space-y-8">
                                <div className="bg-gradient-to-br from-cyan-900/20 to-blue-900/20 border border-cyan-500/20 rounded-2xl p-8 text-center relative overflow-hidden">
                                    <CloudLightning className="w-32 h-32 absolute -right-6 -bottom-6 text-cyan-500/10 rotate-12" />
                                    <h2 className="text-2xl font-bold text-white mb-4 relative z-10">Sincronización con Algolia</h2>
                                    <p className="text-gray-400 mb-8 max-w-lg mx-auto relative z-10">
                                        Herramientas para re-indexar manualmente las colecciones en el motor de búsqueda.
                                        Usar con precaución en producción.
                                    </p>

                                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto relative z-10">
                                        <button
                                            onClick={() => runAlgoliaSync('lists')}
                                            disabled={processingAlgolia}
                                            className="p-4 bg-[#151b2e] border border-white/10 rounded-xl hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all group"
                                        >
                                            <ListIcon className="w-6 h-6 text-cyan-400 mb-2 mx-auto group-hover:scale-110 transition-transform" />
                                            <span className="text-sm font-medium text-gray-300">Listas</span>
                                        </button>
                                        <button
                                            onClick={() => runAlgoliaSync('places')}
                                            disabled={processingAlgolia}
                                            className="p-4 bg-[#151b2e] border border-white/10 rounded-xl hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all group"
                                        >
                                            <MapPin className="w-6 h-6 text-cyan-400 mb-2 mx-auto group-hover:scale-110 transition-transform" />
                                            <span className="text-sm font-medium text-gray-300">Lugares</span>
                                        </button>
                                        <button
                                            onClick={() => runAlgoliaSync(null)}
                                            disabled={processingAlgolia}
                                            className="col-span-2 p-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2"
                                        >
                                            {processingAlgolia ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                            Sincronizar TODO
                                        </button>
                                    </div>
                                </div>

                                {/* Log Console */}
                                <div className="bg-black/50 border border-white/10 rounded-xl p-4 font-mono text-xs h-64 overflow-y-auto">
                                    {algoliaLog.length === 0 ? (
                                        <span className="text-gray-600">Logs de ejecución aparecerán aquí...</span>
                                    ) : (
                                        algoliaLog.map((line, i) => (
                                            <div key={i} className="mb-1 text-cyan-200/80 border-b border-white/5 pb-1 last:border-0">{line}</div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- MAINTENANCE TAB --- */}
                        {activeTab === 'maintenance' && (
                            <div className="max-w-4xl mx-auto space-y-8">
                                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                                    <RefreshCw className="w-6 h-6 text-emerald-500" /> Mantenimiento de Métricas
                                </h2>

                                {/* Single Recalc */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-lg font-bold text-white mb-4">Lista Individual</h3>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="ID de Lista"
                                                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500"
                                                value={targetListId}
                                                onChange={e => setTargetListId(e.target.value)}
                                            />
                                            <button
                                                onClick={handleRecalculateList}
                                                disabled={processingMaintenance || !targetListId}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold disabled:opacity-50"
                                            >
                                                <RefreshCw className={`w-5 h-5 ${processingMaintenance ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6">
                                        <h3 className="text-lg font-bold text-white mb-4">Lugar Individual</h3>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="ID de Lugar (PlaceId)"
                                                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500"
                                                value={targetPlaceId}
                                                onChange={e => setTargetPlaceId(e.target.value)}
                                            />
                                            <button
                                                onClick={handleRecalculatePlace}
                                                disabled={processingMaintenance || !targetPlaceId}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold disabled:opacity-50"
                                            >
                                                <RefreshCw className={`w-5 h-5 ${processingMaintenance ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-white/10 pt-8 mt-8">
                                    <h3 className="text-xl font-bold text-white mb-6">Operaciones Masivas (Peligroso ⚠️)</h3>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => {
                                                if (confirm("¿Seguro que quieres recalcular TODAS las listas? Esto puede tardar mucho."))
                                                    handleGlobalRecalculate('lists');
                                            }}
                                            disabled={processingMaintenance}
                                            className="px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-bold transition-all flex items-center gap-2"
                                        >
                                            <Layers className="w-5 h-5" /> Bulk Recalc Lists
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm("¿Seguro que quieres recalcular TODOS los lugares? Esto puede consumir mucha cuota de lectura."))
                                                    handleGlobalRecalculate('places');
                                            }}
                                            disabled={processingMaintenance}
                                            className="px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-bold transition-all flex items-center gap-2"
                                        >
                                            <MapPin className="w-5 h-5" /> Bulk Recalc Places
                                        </button>
                                    </div>
                                </div>

                                {/* Maintenance Log */}
                                <div className="bg-black/50 border border-white/10 rounded-xl p-4 font-mono text-xs h-64 overflow-y-auto mt-8">
                                    {maintenanceLog.length === 0 ? (
                                        <span className="text-gray-600">Logs de mantenimiento...</span>
                                    ) : (
                                        maintenanceLog.map((line, i) => (
                                            <div key={i} className="mb-1 text-emerald-200/80 border-b border-white/5 pb-1 last:border-0">{line}</div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- GAMIFICATION TAB --- */}
                        {activeTab === 'gamification' && (
                            <div className="max-w-6xl mx-auto">
                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                        <Tag className="w-6 h-6 text-amber-500" /> Gestión de Medallas
                                    </h2>
                                    <button
                                        onClick={() => {
                                            setEditingBadge({}); // Empty object for new
                                            setBadgeModalOpen(true);
                                        }}
                                        className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                                    >
                                        + Nueva Medalla
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!confirm("¿Crear medallas por defecto (Pionero, Crítico, Fotógrafo)?")) return;
                                            setLoadingBadges(true);
                                            try {
                                                const defaults = [
                                                    { id: 'PIONERO', name: 'Pionero', descriptionPublic: 'Uno de los primeros usuarios en escribir una reseña.', type: 'custom', active: true, imageUrl: 'https://cdn-icons-png.flaticon.com/512/2921/2921222.png', threshold: 1 },
                                                    { id: 'CRITIC_BRONZE', name: 'Crítico Novato', descriptionPublic: 'Has escrito tu primera reseña.', type: 'review_count', active: true, imageUrl: 'https://cdn-icons-png.flaticon.com/512/179/179249.png', threshold: 1 },
                                                    { id: 'CRITIC_SILVER', name: 'Crítico Experto', descriptionPublic: 'Has compartido 10 reseñas.', type: 'review_count', active: true, imageUrl: 'https://cdn-icons-png.flaticon.com/512/179/179251.png', threshold: 10 },
                                                    { id: 'CRITIC_GOLD', name: 'Crítico Maestro', descriptionPublic: '¡50 reseñas! Eres una leyenda local.', type: 'review_count', active: true, imageUrl: 'https://cdn-icons-png.flaticon.com/512/179/179250.png', threshold: 50 },
                                                    { id: 'PHOTOGRAPHER', name: 'Ojo Fotográfico', descriptionPublic: 'Has subido 10 fotos en tus reseñas.', type: 'photo_count', active: true, imageUrl: 'https://cdn-icons-png.flaticon.com/512/1042/1042339.png', threshold: 10 }
                                                ];

                                                for (const b of defaults) {
                                                    await setDoc(doc(db, 'badges', b.id), b);
                                                }
                                                fetchBadges();
                                                alert("Medallas creadas correctamente.");
                                            } catch (e) {
                                                console.error(e);
                                                alert("Error creando defaults.");
                                            } finally {
                                                setLoadingBadges(false);
                                            }
                                        }}
                                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 ml-3"
                                    >
                                        <Database className="w-4 h-4" /> Inicializar Defaults
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {badges.map(badge => (
                                        <div key={badge.id} className="bg-[#151b2e] border border-white/10 rounded-xl p-6 relative group hover:border-amber-500/50 transition-all">
                                            <div className="absolute top-4 right-4 text-xs font-mono text-gray-500">{badge.id}</div>

                                            <div className="flex items-center gap-4 mb-4">
                                                {badge.imageUrl ? (
                                                    <img src={badge.imageUrl} alt={badge.name} className="w-16 h-16 object-contain" />
                                                ) : (
                                                    <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
                                                        <Tag className="w-8 h-8 text-amber-500" />
                                                    </div>
                                                )}
                                                <div>
                                                    <h3 className="text-lg font-bold text-white leading-tight">{badge.name}</h3>
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${badge.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                        {badge.active ? 'Activa' : 'Inactiva'}
                                                    </span>
                                                </div>
                                            </div>

                                            <p className="text-sm text-gray-400 mb-4 line-clamp-2 min-h-[40px]">{badge.descriptionPublic}</p>

                                            <div className="bg-black/30 p-3 rounded-lg border border-white/5 mb-4">
                                                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Lógica Interna</div>
                                                <p className="text-xs text-amber-200/80 font-mono italic">{badge.descriptionLogic || 'Sin lógica definida'}</p>
                                            </div>

                                            <div className="flex items-center justify-between border-t border-white/10 pt-4">
                                                <div className="text-xs text-gray-500">
                                                    Tipo: <span className="text-white">{badge.type || 'Custom'}</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setEditingBadge(badge);
                                                        setBadgeModalOpen(true);
                                                    }}
                                                    className="text-amber-400 font-bold text-sm hover:underline"
                                                >
                                                    Editar
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Badge Modal */}
                                {badgeModalOpen && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                                        <div className="bg-[#1a202c] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in-up">
                                            <div className="bg-[#151b2e] px-6 py-4 border-b border-white/10 flex items-center justify-between">
                                                <h3 className="text-xl font-bold text-white">
                                                    {editingBadge?.id ? 'Editar Medalla' : 'Nueva Medalla'}
                                                </h3>
                                                <button onClick={() => setBadgeModalOpen(false)}><X className="text-gray-400 hover:text-white" /></button>
                                            </div>

                                            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                                {!editingBadge?.id && (
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">ID (Único)</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                            placeholder="ej. CRITIC_GOLD"
                                                            value={editingBadge?.id || ''}
                                                            onChange={e => setEditingBadge({ ...editingBadge, id: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                                                        />
                                                    </div>
                                                )}

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Nombre</label>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                        value={editingBadge?.name || ''}
                                                        onChange={e => setEditingBadge({ ...editingBadge, name: e.target.value })}
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descripción Pública</label>
                                                    <textarea
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500 h-20"
                                                        value={editingBadge?.descriptionPublic || ''}
                                                        onChange={e => setEditingBadge({ ...editingBadge, descriptionPublic: e.target.value })}
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descripción Lógica (Interna)</label>
                                                    <textarea
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-amber-200 outline-none focus:border-amber-500 h-20 font-mono text-sm"
                                                        value={editingBadge?.descriptionLogic || ''}
                                                        onChange={e => setEditingBadge({ ...editingBadge, descriptionLogic: e.target.value })}
                                                        placeholder="Explica cuándo se gana esta medalla..."
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tipo</label>
                                                        <select
                                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                            value={editingBadge?.type || 'custom'}
                                                            onChange={e => setEditingBadge({ ...editingBadge, type: e.target.value })}
                                                        >
                                                            <option value="custom">Custom</option>
                                                            <option value="review_count">Contador Reseñas</option>
                                                            <option value="place_count">Contador Lugares</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Umbral (Threshold)</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                            value={editingBadge?.threshold || 0}
                                                            onChange={e => setEditingBadge({ ...editingBadge, threshold: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Imagen URL</label>
                                                    <div className="flex gap-2 items-center">
                                                        <input
                                                            type="text"
                                                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                            value={editingBadge?.imageUrl || ''}
                                                            onChange={e => setEditingBadge({ ...editingBadge, imageUrl: e.target.value })}
                                                            placeholder="https://..."
                                                        />
                                                        {/* Upload Button */}
                                                        <label className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-colors" title="Subir Icono">
                                                            <Upload className="w-5 h-5 text-gray-400" />
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file && editingBadge?.id) {
                                                                        try {
                                                                            const storageRef = ref(storage, `badges/${editingBadge.id}/${Date.now()}_icon`);
                                                                            const snap = await uploadBytes(storageRef, file);
                                                                            const url = await getDownloadURL(snap.ref);
                                                                            setEditingBadge({ ...editingBadge, imageUrl: url });
                                                                        } catch (err) {
                                                                            console.error(err);
                                                                            alert("Error subiendo icono");
                                                                        }
                                                                    } else if (file) {
                                                                        alert("Primero define un ID para la medalla");
                                                                    }
                                                                }}
                                                            />
                                                        </label>

                                                        {editingBadge?.imageUrl && <img src={editingBadge.imageUrl} className="w-10 h-10 object-contain bg-white/5 rounded" />}
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
                                                    <label htmlFor="activeCheck" className="text-sm text-gray-300 select-none">Medalla Activa</label>
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
                                                    onClick={() => handleSaveBadge(editingBadge)}
                                                    className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all hover:scale-105"
                                                >
                                                    Guardar Medalla
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </main>
                </div>
            )}
        </div>
    );
};
