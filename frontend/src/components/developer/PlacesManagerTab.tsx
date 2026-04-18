import React, { useState, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, query, getDocs, limit as firestoreLimit, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { PlaceService } from '../../services/PlaceService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    Search, RefreshCw, AlertTriangle, CheckSquare, Square, MapPin,
    RefreshCcw, Trash2, ChevronUp, ChevronDown, ArrowUpDown, Copy, GitMerge, ExternalLink
} from 'lucide-react';

const FUNCTIONS_REGION = 'europe-west1';
import { DeveloperItemModal } from './DeveloperItemModal';

type FilterMode = 'all' | 'corrupt' | 'no-image' | 'no-coords' | 'no-google-id' | 'duplicate' | 'wrong-id' | 'closed';
type SortField = 'name' | 'reviewsCount' | 'updatedAt';

interface PlaceIssues {
    noImage: boolean;
    noCoords: boolean;
    noGoogleId: boolean;
    noName: boolean;
}

const getIssues = (place: any): PlaceIssues => ({
    noImage: !place.mainImageUrl,
    noCoords: !place.coordinates && !place.location,
    noGoogleId: !place.googlePlaceId,
    noName: !place.name,
});

const hasIssues = (issues: PlaceIssues) => Object.values(issues).some(Boolean);

const formatDate = (place: any): string => {
    const ts = place.updatedAt || place.lastGoogleSync;
    if (!ts?.seconds) return '-';
    return new Date(ts.seconds * 1000).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: '2-digit'
    });
};

const FILTER_LABELS: Record<FilterMode, string> = {
    all: 'Todos',
    corrupt: 'Corruptos',
    'no-image': 'Sin imagen',
    'no-coords': 'Sin coords',
    'no-google-id': 'Sin Google ID',
    duplicate: 'Duplicados',
    'wrong-id': 'ID incorrecto',
    closed: 'Cerrados',
};

const getClosedLabel = (place: any): { label: string; color: string } | null => {
    const s = place.closedStatus || place.googleBusinessStatus;
    if (s === 'permanently_closed' || s === 'CLOSED_PERMANENTLY')
        return { label: 'Cerrado perm.', color: 'bg-red-500/20 text-red-400' };
    if (s === 'temporarily_closed' || s === 'CLOSED_TEMPORARILY')
        return { label: 'Cerrado temp.', color: 'bg-amber-500/20 text-amber-400' };
    return null;
};

export const PlacesManagerTab: React.FC = () => {
    const { user } = useAuth();

    // Data
    const [places, setPlaces] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Selection & filters
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filterMode, setFilterMode] = useState<FilterMode>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [fetchLimit, setFetchLimit] = useState(200);

    // Sort
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // Actions state
    const [log, setLog] = useState<string[]>([]);
    const [updating, setUpdating] = useState(false);
    const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [mergingIds, setMergingIds] = useState<Set<string>>(new Set());
    const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

    // Modal (embedded)
    const [modalOpen, setModalOpen] = useState(false);
    const [modalItem, setModalItem] = useState<any | null>(null);

    const addLog = (msg: string) =>
        setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    // ── Computed ──────────────────────────────────────────────────────────────

    const duplicateGoogleIds = useMemo(() => {
        const counts: Record<string, number> = {};
        places.forEach(p => {
            if (p.googlePlaceId) counts[p.googlePlaceId] = (counts[p.googlePlaceId] || 0) + 1;
        });
        return new Set(
            Object.entries(counts)
                .filter(([, c]) => c > 1)
                .map(([id]) => id)
        );
    }, [places]);

    const filteredPlaces = useMemo(() => {
        return places.filter(p => {
            if (searchTerm && !(p.name || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
            const issues = getIssues(p);
            const imageBroken = brokenImages.has(p.id);
            const isDuplicate = duplicateGoogleIds.has(p.googlePlaceId);
            if (filterMode === 'corrupt') return hasIssues(issues) || imageBroken;
            if (filterMode === 'no-image') return !p.mainImageUrl || imageBroken;
            if (filterMode === 'no-coords') return issues.noCoords;
            if (filterMode === 'no-google-id') return issues.noGoogleId;
            if (filterMode === 'duplicate') return isDuplicate;
            if (filterMode === 'wrong-id') return p.googlePlaceId && p.id !== p.googlePlaceId;
            if (filterMode === 'closed') return !!getClosedLabel(p);
            return true;
        });
    }, [places, searchTerm, filterMode, brokenImages, duplicateGoogleIds]);

    const sortedPlaces = useMemo(() => {
        return [...filteredPlaces].sort((a, b) => {
            let aVal: any, bVal: any;
            if (sortField === 'name') {
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
            } else if (sortField === 'reviewsCount') {
                aVal = a.reviewsCount || 0;
                bVal = b.reviewsCount || 0;
            } else if (sortField === 'updatedAt') {
                aVal = a.updatedAt?.seconds || a.lastGoogleSync?.seconds || 0;
                bVal = b.updatedAt?.seconds || b.lastGoogleSync?.seconds || 0;
            }
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredPlaces, sortField, sortDir]);

    const corruptCount = useMemo(
        () => places.filter(p => hasIssues(getIssues(p)) || brokenImages.has(p.id)).length,
        [places, brokenImages]
    );
    const duplicateCount = useMemo(
        () => places.filter(p => duplicateGoogleIds.has(p.googlePlaceId)).length,
        [places, duplicateGoogleIds]
    );
    const wrongIdCount = useMemo(
        () => places.filter(p => p.googlePlaceId && p.id !== p.googlePlaceId).length,
        [places]
    );
    const closedCount = useMemo(
        () => places.filter(p => !!getClosedLabel(p)).length,
        [places]
    );
    const allSortedSelected = sortedPlaces.length > 0 && sortedPlaces.every(p => selected.has(p.id));

    // ── Sort header helper ────────────────────────────────────────────────────

    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const SortHeader: React.FC<{ label: string; field: SortField }> = ({ label, field }) => (
        <button
            onClick={() => toggleSort(field)}
            className="flex items-center gap-1 hover:text-white transition-colors"
        >
            {label}
            {sortField === field
                ? sortDir === 'asc'
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                : <ArrowUpDown className="w-3 h-3 opacity-40" />}
        </button>
    );

    // ── Data fetch ────────────────────────────────────────────────────────────

    const fetchPlaces = async () => {
        setLoading(true);
        setBrokenImages(new Set());
        try {
            const q = query(collection(db, 'places'), firestoreLimit(fetchLimit));
            const snap = await getDocs(q);
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setPlaces(docs);
            setSelected(new Set());
            addLog(`Cargados ${docs.length} lugares`);
        } catch (err: any) {
            addLog(`Error al cargar: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ── Selection ─────────────────────────────────────────────────────────────

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (allSortedSelected) {
            setSelected(new Set());
        } else {
            setSelected(new Set(sortedPlaces.map(p => p.id)));
        }
    };

    const selectCorrupt = () => {
        const ids = places
            .filter(p => hasIssues(getIssues(p)) || brokenImages.has(p.id))
            .map(p => p.id);
        setSelected(new Set(ids));
        addLog(`Seleccionados ${ids.length} lugares con problemas`);
    };

    // ── Update from Google ────────────────────────────────────────────────────

    const doUpdate = async (place: any) => {
        if (!user) throw new Error('Sin autenticación');
        const idToken = await user.getIdToken();
        await PlaceService.ensurePlaceSyncedWithBackend(place.googlePlaceId || place.id, idToken);
    };

    const refreshPlaceInList = async (placeId: string) => {
        const snap = await getDoc(doc(db, 'places', placeId));
        if (snap.exists()) {
            const updated = { id: snap.id, ...snap.data() };
            setPlaces(prev => prev.map(p => p.id === placeId ? updated : p));
            return updated;
        }
        return null;
    };

    const handleUpdateSingle = async (place: any, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setUpdatingIds(prev => new Set([...prev, place.id]));
        addLog(`Actualizando ${place.name || place.id}...`);
        try {
            await doUpdate(place);
            await refreshPlaceInList(place.id);
            addLog(`✅ ${place.name || place.id} actualizado`);
            setBrokenImages(prev => { const next = new Set(prev); next.delete(place.id); return next; });
        } catch (err: any) {
            addLog(`❌ ${place.name || place.id}: ${err.message}`);
        } finally {
            setUpdatingIds(prev => { const next = new Set(prev); next.delete(place.id); return next; });
        }
    };

    const handleUpdateSelected = async () => {
        if (selected.size === 0) return;
        if (!confirm(`¿Actualizar ${selected.size} lugar(es) desde Google? Puede tardar un momento.`)) return;

        setUpdating(true);
        let success = 0;
        let errors = 0;

        for (const id of Array.from(selected)) {
            const place = places.find(p => p.id === id);
            if (!place) continue;
            setUpdatingIds(prev => new Set([...prev, id]));
            addLog(`Actualizando ${place.name || id}...`);
            try {
                await doUpdate(place);
                await refreshPlaceInList(id);
                addLog(`✅ ${place.name || id} actualizado`);
                success++;
                setBrokenImages(prev => { const next = new Set(prev); next.delete(id); return next; });
            } catch (err: any) {
                addLog(`❌ ${place.name || id}: ${err.message}`);
                errors++;
            } finally {
                setUpdatingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
            }
        }

        addLog(`Completado: ${success} éxitos, ${errors} errores`);
        setUpdating(false);
    };

    // ── Delete ────────────────────────────────────────────────────────────────

    const handleDeletePlace = async (place: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const isDuplicate = duplicateGoogleIds.has(place.googlePlaceId);
        const msg = isDuplicate
            ? `⚠️ Eliminar "${place.name || place.id}" (duplicado de Google ID: ${place.googlePlaceId})?\n\nEsto NO elimina reseñas ni referencias en listas.`
            : `⚠️ Eliminar PERMANENTEMENTE "${place.name || place.id}"?\n\nEsto NO elimina reseñas ni referencias en listas.`;
        if (!confirm(msg)) return;

        setDeletingIds(prev => new Set([...prev, place.id]));
        try {
            await deleteDoc(doc(db, 'places', place.id));
            addLog(`🗑️ Eliminado: ${place.name || place.id} (${place.id})`);
            setPlaces(prev => prev.filter(p => p.id !== place.id));
            setSelected(prev => { const next = new Set(prev); next.delete(place.id); return next; });
        } catch (err: any) {
            addLog(`❌ Error al eliminar: ${err.message}`);
        } finally {
            setDeletingIds(prev => { const next = new Set(prev); next.delete(place.id); return next; });
        }
    };

    // ── Merge duplicate → correct document ───────────────────────────────────

    const handleMergePlace = async (place: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const targetId = place.googlePlaceId;
        if (!targetId || targetId === place.id) return;

        // Dry run first to show summary
        setMergingIds(prev => new Set([...prev, place.id]));
        try {
            const fns = getFunctions(undefined, FUNCTIONS_REGION);
            const fixFn = httpsCallable(fns, 'adminFixPlaceDocument');

            const dryResult: any = await fixFn({ sourceId: place.id, targetId, dryRun: true });
            const s = dryResult.data.summary;

            const msg = [
                `Fusionar "${place.name || place.id}" al documento correcto:`,
                `  · Origen:  ${s.sourceId}`,
                `  · Destino: ${s.targetId}`,
                `  · Reseñas a mover: ${s.reviewsToUpdate}`,
                `  · Seguidores a mover: ${s.followersToMove}`,
                `  · El documento origen será eliminado.`,
                ``,
                `¿Confirmar?`
            ].join('\n');

            if (!confirm(msg)) return;

            await fixFn({ sourceId: place.id, targetId, dryRun: false });
            addLog(`✅ Fusionado: ${place.name || place.id} → ${targetId}`);
            setPlaces(prev => prev.filter(p => p.id !== place.id));
            setSelected(prev => { const next = new Set(prev); next.delete(place.id); return next; });
            // Refresh target doc in the list
            await refreshPlaceInList(targetId);
        } catch (err: any) {
            addLog(`❌ Error al fusionar: ${err.message}`);
        } finally {
            setMergingIds(prev => { const next = new Set(prev); next.delete(place.id); return next; });
        }
    };

    // ── Fix all wrong IDs ─────────────────────────────────────────────────────

    const [fixingAll, setFixingAll] = useState(false);

    const handleFixAllWrongIds = async () => {
        const wrongOnes = places.filter(p => p.googlePlaceId && p.id !== p.googlePlaceId);
        if (wrongOnes.length === 0) return;
        if (!confirm(`Fusionar ${wrongOnes.length} lugar(es) con ID incorrecto al documento correcto.\n\nEsto moverá reseñas y seguidores de cada uno. ¿Continuar?`)) return;

        setFixingAll(true);
        const fns = getFunctions(undefined, FUNCTIONS_REGION);
        const fixFn = httpsCallable(fns, 'adminFixPlaceDocument');
        let success = 0;
        let errors = 0;

        for (const place of wrongOnes) {
            addLog(`Procesando ${place.name || place.id}...`);
            setMergingIds(prev => new Set([...prev, place.id]));
            try {
                await fixFn({ sourceId: place.id, targetId: place.googlePlaceId, dryRun: false });
                addLog(`✅ ${place.name || place.id} → ${place.googlePlaceId}`);
                success++;
                setPlaces(prev => prev.filter(p => p.id !== place.id));
                await refreshPlaceInList(place.googlePlaceId);
            } catch (err: any) {
                addLog(`❌ ${place.name || place.id}: ${err.message}`);
                errors++;
            } finally {
                setMergingIds(prev => { const next = new Set(prev); next.delete(place.id); return next; });
            }
        }

        addLog(`Fix All completado: ${success} éxitos, ${errors} errores`);
        setFixingAll(false);
    };

    // ── Modal (embedded) ──────────────────────────────────────────────────────

    const openModal = (place: any, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setModalItem(place);
        setModalOpen(true);
    };

    const handleModalSaved = async () => {
        if (!modalItem) return;
        const updated = await refreshPlaceInList(modalItem.id);
        if (updated) setModalItem(updated);
    };

    const handleModalUpdateFromGoogle = async () => {
        if (!modalItem || !user) throw new Error('Sin autenticación');
        const idToken = await user.getIdToken();
        await PlaceService.ensurePlaceSyncedWithBackend(modalItem.googlePlaceId || modalItem.id, idToken);
        const updated = await refreshPlaceInList(modalItem.id);
        if (updated) {
            setModalItem(updated);
            setBrokenImages(prev => { const next = new Set(prev); next.delete(modalItem.id); return next; });
        }
        addLog(`✅ ${modalItem.name || modalItem.id} actualizado desde modal`);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-green-400" /> Gestión de Lugares
                </h2>

                <div className="flex flex-wrap gap-3 mb-4">
                    <input
                        type="number"
                        value={fetchLimit}
                        onChange={e => setFetchLimit(parseInt(e.target.value) || 200)}
                        className="w-24 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                        title="Límite de lugares a cargar"
                    />
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nombre..."
                        className="flex-1 min-w-[160px] bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <button
                        onClick={fetchPlaces}
                        disabled={loading}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Cargar
                    </button>
                </div>

                {places.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-gray-400 mr-1">
                            {places.length} total ·{' '}
                            <span className={corruptCount > 0 ? 'text-red-400' : 'text-green-400'}>
                                {corruptCount} con problemas
                            </span>
                            {duplicateCount > 0 && (
                                <> · <span className="text-amber-400">{duplicateCount} duplicados</span></>
                            )}
                            {wrongIdCount > 0 && (
                                <> · <span className="text-orange-400">{wrongIdCount} ID incorrecto</span></>
                            )}
                            {closedCount > 0 && (
                                <> · <span className="text-gray-400">{closedCount} cerrados</span></>
                            )}
                        </span>

                        {(['all', 'corrupt', 'duplicate', 'wrong-id', 'closed', 'no-image', 'no-coords', 'no-google-id'] as FilterMode[]).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilterMode(f)}
                                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors ${
                                    filterMode === f
                                        ? f === 'corrupt' ? 'bg-red-600 text-white'
                                        : f === 'duplicate' ? 'bg-amber-600 text-white'
                                        : f === 'wrong-id' ? 'bg-orange-600 text-white'
                                        : f === 'closed' ? 'bg-gray-600 text-white'
                                        : 'bg-indigo-600 text-white'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                }`}
                            >
                                {f === 'corrupt'
                                    ? `${FILTER_LABELS[f]} (${corruptCount})`
                                    : f === 'duplicate'
                                        ? `${FILTER_LABELS[f]} (${duplicateCount})`
                                        : f === 'wrong-id'
                                            ? `${FILTER_LABELS[f]} (${wrongIdCount})`
                                            : f === 'closed'
                                                ? `${FILTER_LABELS[f]} (${closedCount})`
                                                : FILTER_LABELS[f]}
                            </button>
                        ))}

                        <div className="flex gap-2 ml-auto flex-wrap justify-end">
                            <button
                                onClick={selectCorrupt}
                                disabled={corruptCount === 0}
                                className="px-3 py-1 text-xs rounded-lg font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-40 transition-colors"
                            >
                                Sel. corruptos
                            </button>
                            {wrongIdCount > 0 && (
                                <button
                                    onClick={handleFixAllWrongIds}
                                    disabled={fixingAll}
                                    className="px-4 py-2 text-sm rounded-lg font-bold bg-orange-600/80 hover:bg-orange-500 disabled:opacity-50 text-white flex items-center gap-2 transition-colors"
                                >
                                    {fixingAll
                                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                                        : <GitMerge className="w-4 h-4" />}
                                    Fix IDs ({wrongIdCount})
                                </button>
                            )}
                            <button
                                onClick={handleUpdateSelected}
                                disabled={selected.size === 0 || updating}
                                className="px-4 py-2 text-sm rounded-lg font-bold bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white flex items-center gap-2 transition-colors"
                            >
                                {updating
                                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                                    : <RefreshCcw className="w-4 h-4" />}
                                Actualizar{selected.size > 0 ? ` (${selected.size})` : ''}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Table */}
            {sortedPlaces.length > 0 && (
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="bg-white/5 text-gray-400 font-bold uppercase text-xs">
                                <tr>
                                    <th className="p-3 w-10">
                                        <button
                                            onClick={toggleAll}
                                            title={allSortedSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                        >
                                            {allSortedSelected
                                                ? <CheckSquare className="w-4 h-4 text-indigo-400" />
                                                : <Square className="w-4 h-4 text-gray-500" />}
                                        </button>
                                    </th>
                                    <th className="p-3 w-14">Img</th>
                                    <th className="p-3">
                                        <SortHeader label="Nombre" field="name" />
                                    </th>
                                    <th className="p-3">Google ID</th>
                                    <th className="p-3 text-center">
                                        <SortHeader label="Reseñas" field="reviewsCount" />
                                    </th>
                                    <th className="p-3">
                                        <SortHeader label="Actualizado" field="updatedAt" />
                                    </th>
                                    <th className="p-3">Problemas</th>
                                    <th className="p-3 w-28">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {sortedPlaces.map(place => {
                                    const issues = getIssues(place);
                                    const imageBroken = brokenImages.has(place.id);
                                    const isDuplicate = duplicateGoogleIds.has(place.googlePlaceId);
                                    const corrupt = hasIssues(issues) || imageBroken;
                                    const isUpdating = updatingIds.has(place.id);
                                    const isDeleting = deletingIds.has(place.id);
                                    const isMerging = mergingIds.has(place.id);
                                    const canMerge = place.googlePlaceId && place.id !== place.googlePlaceId;
                                    const closedInfo = getClosedLabel(place);

                                    return (
                                        <tr
                                            key={place.id}
                                            onClick={() => openModal(place)}
                                            className={`hover:bg-white/5 transition-colors cursor-pointer
                                                ${isDuplicate ? 'bg-amber-500/5' : corrupt ? 'bg-red-500/5' : closedInfo ? 'bg-white/[0.02]' : ''}`}
                                        >
                                            <td className="p-3" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => toggleSelect(place.id)}>
                                                    {selected.has(place.id)
                                                        ? <CheckSquare className="w-4 h-4 text-indigo-400" />
                                                        : <Square className="w-4 h-4 text-gray-500" />}
                                                </button>
                                            </td>
                                            <td className="p-3">
                                                {place.mainImageUrl ? (
                                                    <>
                                                        <img
                                                            src={place.mainImageUrl}
                                                            alt=""
                                                            className={`w-10 h-10 object-cover rounded ${imageBroken ? 'hidden' : ''}`}
                                                            onError={() => setBrokenImages(prev => new Set([...prev, place.id]))}
                                                        />
                                                        {imageBroken && (
                                                            <div className="w-10 h-10 bg-amber-500/10 rounded flex items-center justify-center">
                                                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="w-10 h-10 bg-red-500/10 rounded flex items-center justify-center">
                                                        <AlertTriangle className="w-4 h-4 text-red-400" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3 font-medium max-w-[200px]">
                                                <div className="truncate">
                                                    {place.name || <span className="text-red-400 text-xs">Sin nombre</span>}
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                    {closedInfo && (
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded ${closedInfo.color}`}>
                                                            {closedInfo.label}
                                                        </span>
                                                    )}
                                                    {isDuplicate && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
                                                            <Copy className="w-2.5 h-2.5" /> duplicado
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 font-mono text-xs text-indigo-400 max-w-[160px] truncate">
                                                {place.googlePlaceId || place.id}
                                            </td>
                                            <td className="p-3 text-center text-gray-300">
                                                {place.reviewsCount ?? '-'}
                                            </td>
                                            <td className="p-3 text-xs text-gray-400 whitespace-nowrap">
                                                {formatDate(place)}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {issues.noImage && !imageBroken && (
                                                        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">sin URL</span>
                                                    )}
                                                    {imageBroken && (
                                                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">img rota</span>
                                                    )}
                                                    {issues.noCoords && (
                                                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">sin coords</span>
                                                    )}
                                                    {issues.noGoogleId && (
                                                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">sin google id</span>
                                                    )}
                                                    {issues.noName && (
                                                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">sin nombre</span>
                                                    )}
                                                    {!corrupt && !isDuplicate && (
                                                        <span className="text-green-500 text-xs">✓</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-1">
                                                    <a
                                                        href={`/place/${place.id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title="Abrir lugar"
                                                        className="p-1.5 rounded bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                    {canMerge ? (
                                                        <button
                                                            onClick={e => handleMergePlace(place, e)}
                                                            disabled={isMerging || isDeleting}
                                                            title={`Fusionar al documento correcto (${place.googlePlaceId})`}
                                                            className="p-1.5 rounded bg-amber-500/30 text-amber-400 hover:bg-amber-500/50 disabled:opacity-50 transition-colors"
                                                        >
                                                            {isMerging
                                                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                : <GitMerge className="w-3.5 h-3.5" />}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={e => handleUpdateSingle(place, e)}
                                                            disabled={isUpdating || isDeleting}
                                                            title="Actualizar desde Google"
                                                            className="p-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50 transition-colors"
                                                        >
                                                            {isUpdating
                                                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                : <RefreshCcw className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={e => handleDeletePlace(place, e)}
                                                        disabled={isDeleting || isUpdating || isMerging}
                                                        title="Eliminar lugar"
                                                        className={`p-1.5 rounded transition-colors disabled:opacity-50
                                                            ${isDuplicate
                                                                ? 'bg-red-500/30 text-red-400 hover:bg-red-500/50'
                                                                : 'bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400'}`}
                                                    >
                                                        {isDeleting
                                                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                            : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-2 bg-black/20 text-xs text-gray-500 border-t border-white/5">
                        {sortedPlaces.length} mostrados · {selected.size} seleccionados
                    </div>
                </div>
            )}

            {places.length > 0 && sortedPlaces.length === 0 && (
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-8 text-center text-gray-500">
                    No hay lugares que coincidan con el filtro actual
                </div>
            )}

            {places.length === 0 && !loading && (
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-8 text-center text-gray-500">
                    Pulsa "Cargar" para obtener los lugares de Firestore
                </div>
            )}

            {/* Log */}
            {log.length > 0 && (
                <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-xs max-h-48 overflow-y-auto">
                    <div className="text-gray-500 mb-2 border-b border-white/5 pb-2">Log de actualizaciones</div>
                    {log.map((entry, i) => (
                        <div key={i} className="text-gray-300 py-0.5">{entry}</div>
                    ))}
                </div>
            )}

            {/* Embedded modal */}
            <DeveloperItemModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                collectionName="places"
                item={modalItem}
                onSaved={handleModalSaved}
                onUpdateFromGoogle={handleModalUpdateFromGoogle}
            />
        </div>
    );
};
