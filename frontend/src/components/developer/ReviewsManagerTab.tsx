import React, { useState, useMemo } from 'react';
import { db } from '../../firebase';
import {
    collection, collectionGroup, query, where, getDocs,
    limit as firestoreLimit, deleteDoc, doc, updateDoc, documentId
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import {
    RefreshCw, Trash2, ChevronUp, ChevronDown, ArrowUpDown,
    ExternalLink, Star, User, MapPin, FileText, X, Save, AlertCircle, ChevronRight
} from 'lucide-react';

type SortField = 'createdAt' | 'overallRating' | 'authorName' | 'placeName';
type FilterMode = 'all' | 'no-place' | 'no-author' | 'no-list' | 'no-rating';

const formatDate = (review: any): string => {
    const ts = review.createdAt || review.updatedAt;
    if (!ts?.seconds) return '-';
    return new Date(ts.seconds * 1000).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: '2-digit'
    });
};

const FILTER_LABELS: Record<FilterMode, string> = {
    all: 'Todos',
    'no-place': 'Sin lugar',
    'no-author': 'Sin autor',
    'no-list': 'Sin lista',
    'no-rating': 'Sin nota',
};

// ─── Inline Edit Modal ─────────────────────────────────────────────────────────

interface ReviewEditModalProps {
    review: any;
    onClose: () => void;
    onSaved: () => void;
}

const ReviewEditModal: React.FC<ReviewEditModalProps> = ({ review, onClose, onSaved }) => {
    const [fields, setFields] = useState({
        userId: review.userId || '',
        authorId: review.authorId || '',
        authorName: review.authorName || '',
        placeId: review.placeId || '',
        placeName: review.placeName || '',
        listId: review.listId || '',
        itemName: review.itemName || '',
        comment: review.comment || '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [criteriaOpen, setCriteriaOpen] = useState(false);

    const set = (k: keyof typeof fields, v: string) =>
        setFields(prev => ({ ...prev, [k]: v }));

    const handleSave = async () => {
        if (!confirm(`¿Guardar cambios en la reseña ${review.id}?`)) return;
        setIsSaving(true);
        setError(null);
        try {
            let docRef;
            if (review._path) {
                docRef = doc(db, review._path);
            } else if (review.listId) {
                docRef = doc(db, 'lists', review.listId, 'reviews', review.id);
            } else {
                docRef = doc(db, 'reviews', review.id);
            }

            const patch: Record<string, any> = {};
            if (fields.userId) patch.userId = fields.userId;
            if (fields.authorId) patch.authorId = fields.authorId;
            if (fields.authorName) patch.authorName = fields.authorName;
            if (fields.placeId) patch.placeId = fields.placeId;
            if (fields.placeName) patch.placeName = fields.placeName;
            if (fields.listId) patch.listId = fields.listId;
            if (fields.itemName !== review.itemName) patch.itemName = fields.itemName;
            if (fields.comment !== review.comment) patch.comment = fields.comment;

            await updateDoc(docRef, patch);
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    const Field = ({ label, k, textarea }: { label: string; k: keyof typeof fields; textarea?: boolean }) => (
        <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase">{label}</label>
            {textarea ? (
                <textarea
                    value={fields[k]}
                    onChange={e => set(k, e.target.value)}
                    rows={3}
                    className="w-full bg-[#1e253c] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500 resize-y"
                />
            ) : (
                <input
                    value={fields[k]}
                    onChange={e => set(k, e.target.value)}
                    className="w-full bg-[#1e253c] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500"
                />
            )}
        </div>
    );

    // Parse criteria scores from the review
    const scores: Record<string, number> = review.scores || {};
    const criteriaDefinition: any[] = review.criteriaDefinition || [];
    const criteriaEntries = Object.entries(scores).map(([key, value]) => {
        const def = criteriaDefinition.find((c: any) => c.id === key);
        return {
            key,
            label: def?.label || key,
            value: value as number,
            isPonderable: def ? def.ponderable !== false && def.isPonderable !== false : true,
        };
    }).sort((a, b) => (b.isPonderable ? 1 : 0) - (a.isPonderable ? 1 : 0));

    const ratingColor = (v: number) =>
        v >= 8 ? 'text-emerald-400' : v >= 5 ? 'text-amber-400' : 'text-red-400';

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="bg-[#151b2e] border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white">Editar Reseña</h2>
                        <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-xs text-gray-400 font-mono">ID: {review.id}</p>
                            {review.overallRating != null && (
                                <span className={`text-xs font-bold flex items-center gap-1 ${ratingColor(review.overallRating)}`}>
                                    <Star className="w-3 h-3" />{review.overallRating} (calculado)
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400 text-sm">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="User ID (autor)" k="userId" />
                        <Field label="Author ID (legacy)" k="authorId" />
                        <Field label="Nombre del autor" k="authorName" />
                        <Field label="Place ID" k="placeId" />
                        <Field label="Nombre del lugar" k="placeName" />
                        <Field label="List ID" k="listId" />
                        <Field label="Elemento (itemName)" k="itemName" />
                    </div>
                    <Field label="Comentario" k="comment" textarea />

                    {/* Read-only info */}
                    <div className="bg-black/20 border border-white/5 rounded-lg p-3 space-y-1 text-xs text-gray-500">
                        <p><span className="text-gray-400">Fecha:</span> {formatDate(review)}</p>
                        <p><span className="text-gray-400">Ruta:</span> <span className="font-mono">{review._path || (review.listId ? `lists/${review.listId}/reviews/${review.id}` : `reviews/${review.id}`)}</span></p>
                        {review.photoUrl && (
                            <p><span className="text-gray-400">Foto:</span> <a href={review.photoUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate inline-block max-w-xs align-bottom">{review.photoUrl}</a></p>
                        )}
                    </div>

                    {/* Criteria scores collapsible */}
                    {criteriaEntries.length > 0 && (
                        <div className="border border-white/10 rounded-xl overflow-hidden">
                            <button
                                onClick={() => setCriteriaOpen(o => !o)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.05] transition-colors text-sm font-semibold text-gray-300"
                            >
                                <span className="flex items-center gap-2">
                                    <Star className="w-4 h-4 text-amber-400" />
                                    Puntuaciones por criterio ({criteriaEntries.length})
                                </span>
                                <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${criteriaOpen ? 'rotate-90' : ''}`} />
                            </button>

                            {criteriaOpen && (
                                <div className="p-4 space-y-2 bg-black/20">
                                    {criteriaEntries.map(({ key, label, value, isPonderable }) => (
                                        <div key={key} className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isPonderable ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/10 text-gray-400'}`}>
                                                    {isPonderable ? 'P' : 'NP'}
                                                </span>
                                                <span className="text-sm text-gray-300 truncate">{label}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                                                        style={{ width: `${Math.min(100, (value / 10) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className={`text-sm font-bold w-8 text-right ${ratingColor(value)}`}>{value}</span>
                                            </div>
                                        </div>
                                    ))}
                                    <p className="text-xs text-gray-600 pt-1">P = ponderable · NP = no ponderable. Solo lectura (calculado al guardar la reseña).</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-white/10 flex justify-end gap-3 shrink-0 bg-[#0a0c10]/50">
                    <button onClick={onClose} className="px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold transition-colors flex items-center gap-2"
                    >
                        {isSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Search Bar Component ──────────────────────────────────────────────────────

interface SearchFilters {
    author: string;
    place: string;
    list: string;
    item: string;
    id: string;
}

const SearchBar: React.FC<{ filters: SearchFilters; onChange: (f: SearchFilters) => void }> = ({ filters, onChange }) => {
    const set = (k: keyof SearchFilters, v: string) => onChange({ ...filters, [k]: v });
    const fields: { key: keyof SearchFilters; label: string; placeholder: string }[] = [
        { key: 'author', label: 'Autor', placeholder: 'Nombre o ID...' },
        { key: 'place', label: 'Lugar', placeholder: 'Nombre o Place ID...' },
        { key: 'list', label: 'Lista', placeholder: 'List ID...' },
        { key: 'item', label: 'Elemento', placeholder: 'itemName...' },
        { key: 'id', label: 'ID Reseña', placeholder: 'ID exacto...' },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {fields.map(f => (
                <div key={f.key} className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase px-1">{f.label}</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={filters[f.key]}
                            onChange={e => set(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            className="w-full bg-[#1e253c] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-indigo-500"
                        />
                        {filters[f.key] && (
                            <button
                                onClick={() => set(f.key, '')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── Main Tab ──────────────────────────────────────────────────────────────────

export const ReviewsManagerTab: React.FC = () => {
    const { user } = useAuth();

    const [reviews, setReviews] = useState<any[]>([]);
    const [listsCache, setListsCache] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [fetchLimit, setFetchLimit] = useState(200);
    const [searchFilters, setSearchFilters] = useState<SearchFilters>({ author: '', place: '', list: '', item: '', id: '' });
    const [filterMode, setFilterMode] = useState<FilterMode>('all');
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [log, setLog] = useState<string[]>([]);
    const [editingReview, setEditingReview] = useState<any | null>(null);

    const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);

    const loadReviews = async () => {
        setLoading(true);
        setLog([]);
        try {
            addLog(`Cargando hasta ${fetchLimit} reseñas desde colección raíz...`);

            const rootSnap = await getDocs(
                query(collection(db, 'reviews'), firestoreLimit(fetchLimit))
            );
            const rootReviews = rootSnap.docs.map(d => ({
                id: d.id,
                ...d.data(),
                _source: 'root',
                _path: `reviews/${d.id}`,
            }));
            addLog(`Raíz: ${rootReviews.length} reseñas.`);

            const subSnap = await getDocs(
                query(collectionGroup(db, 'reviews'), firestoreLimit(fetchLimit))
            ).catch(() => null);

            const subReviews: any[] = [];
            if (subSnap) {
                subSnap.docs.forEach(d => {
                    const path = d.ref.path;
                    if (!path.startsWith('reviews/')) {
                        subReviews.push({
                            id: d.id,
                            ...d.data(),
                            _source: 'subcollection',
                            _path: path,
                        });
                    }
                });
                addLog(`Subcolecciones: ${subReviews.length} reseñas.`);
            }

            const map = new Map<string, any>();
            [...subReviews, ...rootReviews].forEach(r => map.set(r.id, r));
            const all = Array.from(map.values());

            setReviews(all);
            addLog(`Total: ${all.length} reseñas cargadas.`);

            // Fetch list names for the unique listIds
            const listIds = [...new Set(all.map((r: any) => r.listId).filter(Boolean))] as string[];
            if (listIds.length > 0) {
                const cache: Record<string, string> = {};
                const chunks: string[][] = [];
                for (let i = 0; i < listIds.length; i += 10) chunks.push(listIds.slice(i, i + 10));
                await Promise.all(chunks.map(async chunk => {
                    try {
                        const snap = await getDocs(query(collection(db, 'lists'), where(documentId(), 'in', chunk)));
                        snap.docs.forEach(d => { cache[d.id] = (d.data().name as string) || d.id; });
                    } catch { /* silently skip */ }
                }));
                setListsCache(cache);
                addLog(`Nombres de ${Object.keys(cache).length} listas cargados.`);
            }
        } catch (err: any) {
            addLog(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (review: any) => {
        if (!confirm(`¿Borrar la reseña "${review.id}"?\nEsto no recalculará los contadores automáticamente.`)) return;
        try {
            let docRef;
            if (review._path) {
                docRef = doc(db, review._path);
            } else if (review.listId) {
                docRef = doc(db, 'lists', review.listId, 'reviews', review.id);
            } else {
                docRef = doc(db, 'reviews', review.id);
            }
            await deleteDoc(docRef);
            setReviews(prev => prev.filter(r => r.id !== review.id));
            addLog(`Borrada reseña ${review.id}`);
        } catch (err: any) {
            addLog(`Error borrando ${review.id}: ${err.message}`);
        }
    };

    const handleOpen = (review: any) => {
        if (review.placeId) window.open(`/place/${review.placeId}`, '_blank');
        else if (review.listId) window.open(`/list/${review.listId}`, '_blank');
    };

    // ── Filtering ──
    const filtered = useMemo(() => {
        let result = reviews;

        if (filterMode === 'no-place') result = result.filter(r => !r.placeId);
        if (filterMode === 'no-author') result = result.filter(r => !r.userId && !r.authorId);
        if (filterMode === 'no-list') result = result.filter(r => !r.listId);
        if (filterMode === 'no-rating') result = result.filter(r => r.overallRating == null);

        const { author, place, list, item, id } = searchFilters;
        if (author.trim()) {
            const q = author.toLowerCase();
            result = result.filter(r =>
                (r.authorName || '').toLowerCase().includes(q) ||
                (r.userId || '').toLowerCase().includes(q) ||
                (r.authorId || '').toLowerCase().includes(q)
            );
        }
        if (place.trim()) {
            const q = place.toLowerCase();
            result = result.filter(r =>
                (r.placeName || '').toLowerCase().includes(q) ||
                (r.placeId || '').toLowerCase().includes(q)
            );
        }
        if (list.trim()) {
            const q = list.toLowerCase();
            result = result.filter(r =>
                (r.listId || '').toLowerCase().includes(q) ||
                (listsCache[r.listId] || '').toLowerCase().includes(q)
            );
        }
        if (item.trim()) {
            const q = item.toLowerCase();
            result = result.filter(r => (r.itemName || '').toLowerCase().includes(q));
        }
        if (id.trim()) {
            const q = id.toLowerCase();
            result = result.filter(r => (r.id || '').toLowerCase().includes(q));
        }

        return result;
    }, [reviews, filterMode, searchFilters, listsCache]);

    // ── Sorting ──
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            let av: any, bv: any;
            if (sortField === 'createdAt') {
                av = a.createdAt?.seconds || 0;
                bv = b.createdAt?.seconds || 0;
            } else if (sortField === 'overallRating') {
                av = a.overallRating ?? -1;
                bv = b.overallRating ?? -1;
            } else if (sortField === 'authorName') {
                av = (a.authorName || '').toLowerCase();
                bv = (b.authorName || '').toLowerCase();
            } else {
                av = (a.placeName || '').toLowerCase();
                bv = (b.placeName || '').toLowerCase();
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filtered, sortField, sortDir]);

    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
        return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-400" /> : <ChevronDown className="w-3 h-3 text-indigo-400" />;
    };

    const ratingColor = (r: number) => r >= 8 ? 'text-emerald-400' : r >= 5 ? 'text-amber-400' : 'text-red-400';

    const filterCounts = useMemo(() => ({
        all: reviews.length,
        'no-place': reviews.filter(r => !r.placeId).length,
        'no-author': reviews.filter(r => !r.userId && !r.authorId).length,
        'no-list': reviews.filter(r => !r.listId).length,
        'no-rating': reviews.filter(r => r.overallRating == null).length,
    }), [reviews]);

    const hasActiveSearch = Object.values(searchFilters).some(v => v.trim() !== '');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Gestor de Reseñas</h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {reviews.length > 0 ? `${sorted.length} / ${reviews.length} reseñas` : 'Carga las reseñas para empezar'}
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <select
                        value={fetchLimit}
                        onChange={e => setFetchLimit(Number(e.target.value))}
                        className="bg-[#1e253c] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none"
                    >
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                    </select>
                    <button
                        onClick={loadReviews}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white font-bold text-sm transition-colors"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {loading ? 'Cargando...' : 'Cargar'}
                    </button>
                </div>
            </div>

            {/* Search & Filters */}
            {reviews.length > 0 && (
                <div className="space-y-3">
                    <SearchBar filters={searchFilters} onChange={setSearchFilters} />
                    {hasActiveSearch && (
                        <button
                            onClick={() => setSearchFilters({ author: '', place: '', list: '', item: '', id: '' })}
                            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                        >
                            <X className="w-3 h-3" /> Limpiar búsqueda
                        </button>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(FILTER_LABELS) as FilterMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setFilterMode(mode)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                    filterMode === mode
                                        ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                                }`}
                            >
                                {FILTER_LABELS[mode]}
                                {filterCounts[mode] > 0 && mode !== 'all' && (
                                    <span className="ml-1 opacity-60">({filterCounts[mode]})</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            {sorted.length > 0 && (
                <div className="bg-[#0f1525] border border-white/10 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/[0.02]">
                                    <th className="text-left px-4 py-3 text-gray-400 font-semibold w-28">
                                        <button onClick={() => toggleSort('createdAt')} className="flex items-center gap-1 hover:text-white">
                                            Fecha <SortIcon field="createdAt" />
                                        </button>
                                    </th>
                                    <th className="text-left px-4 py-3 text-gray-400 font-semibold">
                                        <button onClick={() => toggleSort('authorName')} className="flex items-center gap-1 hover:text-white">
                                            Autor <SortIcon field="authorName" />
                                        </button>
                                    </th>
                                    <th className="text-left px-4 py-3 text-gray-400 font-semibold">
                                        <button onClick={() => toggleSort('placeName')} className="flex items-center gap-1 hover:text-white">
                                            Lugar <SortIcon field="placeName" />
                                        </button>
                                    </th>
                                    <th className="text-left px-4 py-3 text-gray-400 font-semibold">Elemento</th>
                                    <th className="text-left px-4 py-3 text-gray-400 font-semibold w-20">
                                        <button onClick={() => toggleSort('overallRating')} className="flex items-center gap-1 hover:text-white">
                                            Nota <SortIcon field="overallRating" />
                                        </button>
                                    </th>
                                    <th className="text-left px-4 py-3 text-gray-400 font-semibold w-8">Src</th>
                                    <th className="px-4 py-3 text-right text-gray-400 font-semibold">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {sorted.map(review => {
                                    const hasIssue = !review.placeId || (!review.userId && !review.authorId) || !review.listId || review.overallRating == null;
                                    return (
                                        <tr key={review.id} className={`hover:bg-white/[0.02] transition-colors ${hasIssue ? 'bg-amber-500/5' : ''}`}>
                                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(review)}</td>

                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {review.authorPhoto ? (
                                                        <img src={review.authorPhoto} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                                            <User className="w-3 h-3 text-gray-500" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="text-gray-200 text-xs truncate max-w-[120px]">
                                                            {review.authorName || <span className="text-amber-400 italic">Sin autor</span>}
                                                        </div>
                                                        <div className="text-gray-600 font-mono text-[10px] truncate max-w-[120px]">
                                                            {review.userId || review.authorId || '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="min-w-0">
                                                    <div className="text-gray-200 text-xs truncate max-w-[150px] flex items-center gap-1">
                                                        <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                                                        {review.placeName || <span className="text-amber-400 italic">Sin lugar</span>}
                                                    </div>
                                                    <div className="text-gray-600 font-mono text-[10px] truncate max-w-[150px] pl-4">
                                                        {review.placeId || '—'}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="text-gray-300 text-xs truncate max-w-[120px] flex items-center gap-1">
                                                    {review.itemName ? (
                                                        <><FileText className="w-3 h-3 text-gray-500 shrink-0" />{review.itemName}</>
                                                    ) : (
                                                        <span className="text-gray-600 italic">—</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                {review.overallRating != null ? (
                                                    <div className={`flex items-center gap-1 font-bold text-sm ${ratingColor(review.overallRating)}`}>
                                                        <Star className="w-3 h-3" />{review.overallRating}
                                                    </div>
                                                ) : (
                                                    <span className="text-amber-400 italic text-xs">—</span>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                    review._source === 'root'
                                                        ? 'bg-blue-500/20 text-blue-400'
                                                        : 'bg-purple-500/20 text-purple-400'
                                                }`}>
                                                    {review._source === 'root' ? 'R' : 'S'}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 justify-end">
                                                    {(review.placeId || review.listId) && (
                                                        <button
                                                            onClick={() => handleOpen(review)}
                                                            title="Abrir lugar/lista"
                                                            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setEditingReview(review)}
                                                        title="Editar"
                                                        className="p-1.5 hover:bg-indigo-500/20 rounded-lg text-gray-400 hover:text-indigo-400 transition-colors"
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(review)}
                                                        title="Borrar"
                                                        className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loading && reviews.length === 0 && (
                <div className="text-center py-20 text-gray-600">
                    <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Pulsa "Cargar" para ver las reseñas</p>
                </div>
            )}

            {log.length > 0 && (
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-xs text-gray-500 max-h-40 overflow-y-auto space-y-1">
                    {log.map((line, i) => <p key={i}>{line}</p>)}
                </div>
            )}

            {reviews.length > 0 && (
                <p className="text-xs text-gray-600">
                    <span className="text-blue-400 font-bold">R</span> = colección raíz &nbsp;·&nbsp;
                    <span className="text-purple-400 font-bold">S</span> = subcolección de lista
                </p>
            )}

            {editingReview && (
                <ReviewEditModal
                    review={editingReview}
                    onClose={() => setEditingReview(null)}
                    onSaved={() => { loadReviews(); setEditingReview(null); }}
                />
            )}
        </div>
    );
};
