import React, { useState, useEffect } from 'react';
import { useArchives, type SavedItemEntity } from '../hooks/useArchives';
import { Folder, MapPin, MessageSquare, List as ListIcon, Trash2, Map as MapIcon, X, Filter, Edit2, Search, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, getDocs, orderBy, query, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MapView } from '../components/MapView';
import type { MapItem } from '../components/MapView';

const COLOR_OPTIONS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
    '#14b8a6', '#f97316', '#84cc16', '#64748b',
    '#a855f7', '#e11d48', '#0ea5e9', '#22c55e',
];

const EMOJI_OPTIONS = [
    '📍', '📁', '❤️', '⭐', '🔥', '✈️',
    '🍔', '🌮', '🍝', '🍜', '🍣', '🍕',
    '☕', '🍷', '🍺', '🥂', '🍦', '🧃',
    '🏔️', '🏖️', '🏨', '🏛️', '🌆', '🗺️',
    '🛍️', '🎨', '🎵', '🎭', '📸', '💼',
    '🌿', '🐾', '🏋️', '🎯', '🚀', '💎',
];

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    place: {
        label: 'Lugar',
        color: 'text-blue-300',
        bg: 'bg-blue-500/20',
        icon: <MapPin className="w-3 h-3" />,
    },
    review: {
        label: 'Reseña',
        color: 'text-[var(--lt-accent-2)]',
        bg: 'bg-[var(--lt-accent-soft)]',
        icon: <MessageSquare className="w-3 h-3" />,
    },
    group: {
        label: 'Plato',
        color: 'text-amber-300',
        bg: 'bg-amber-500/20',
        icon: <ListIcon className="w-3 h-3" />,
    },
    list: {
        label: 'Lista',
        color: 'text-cyan-300',
        bg: 'bg-cyan-500/20',
        icon: <Folder className="w-3 h-3" />,
    },
};

// Lee las coordenadas de un doc de Firestore intentando todos los campos posibles
function extractCoords(data: Record<string, any>): { lat: number; lng: number } | null {
    if (data.coords?.lat && data.coords?.lng) return { lat: data.coords.lat, lng: data.coords.lng };
    if (data.coordinates?.latitude && data.coordinates?.longitude) return { lat: data.coordinates.latitude, lng: data.coordinates.longitude };
    if (data.location?.latitude && data.location?.longitude) return { lat: data.location.latitude, lng: data.location.longitude };
    if (data.latitude && data.longitude) return { lat: data.latitude, lng: data.longitude };
    if (data.lat && data.lng) return { lat: data.lat, lng: data.lng };
    return null;
}

export const ArchivePage: React.FC = () => {
    const { user } = useAuth();
    const { archives, fetchArchives, toggleItemInArchive, createArchive, updateArchive, deleteArchive } = useArchives();

    const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
    const [filterType, setFilterType] = useState<'all' | 'place' | 'list' | 'review' | 'group'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [archiveItems, setArchiveItems] = useState<Record<string, SavedItemEntity[]>>({});
    const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});

    // Mapa
    const [mapItems, setMapItems] = useState<MapItem[]>([]);
    const [loadingMap, setLoadingMap] = useState(false);
    const [showMapFilters, setShowMapFilters] = useState(false);
    const [mapSelectedArchives, setMapSelectedArchives] = useState<string[]>([]);

    // Modal edición/creación
    const [showEditModal, setShowEditModal] = useState(false);
    const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
    const [editId, setEditId] = useState('');
    const [editName, setEditName] = useState('');
    const [editEmoji, setEditEmoji] = useState('📍');
    const [editColor, setEditColor] = useState(COLOR_OPTIONS[0]);

    useEffect(() => { fetchArchives(); }, [fetchArchives]);

    useEffect(() => {
        if (archives.length > 0 && expandedIds.length === 0) {
            setExpandedIds([archives[0].id]);
        }
    }, [archives]);

    useEffect(() => {
        expandedIds.forEach(id => {
            if (!archiveItems[id] && !loadingItems[id]) fetchItemsForArchive(id);
        });
    }, [expandedIds]);

    const loadRawItems = async (archiveId: string): Promise<SavedItemEntity[]> => {
        if (!user) return [];
        const q = query(collection(db, 'users', user.uid, 'archives', archiveId, 'items'), orderBy('savedAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(iDoc => {
            const data = iDoc.data();
            let route = data.route;
            if (!route) {
                const type = (data.entityType || '').toLowerCase();
                if (type === 'place' && data.placeId) route = `/place/${data.placeId}`;
                else if (type === 'group' && data.placeId && data.itemName) route = `/group/${data.placeId}/${encodeURIComponent(data.itemName)}`;
                else if (type === 'review' && data.placeId) route = `/place/${data.placeId}`;
            }
            const coords = extractCoords(data);
            return {
                id: iDoc.id,
                itemId: data.itemId || iDoc.id,
                type: data.type || data.entityType || 'other',
                name: data.name || data.title || data.itemName || 'Sin nombre',
                subtitle: data.subtitle,
                photoUrl: data.thumbnailUrl || data.mainImageUrl || data.photoUrl || data.coverUrl || data.imageUrl,
                route: route || '#',
                placeId: data.placeId,
                listId: data.listId,
                lat: coords?.lat,
                lng: coords?.lng,
                savedAt: data.savedAt || data.createdAt,
            } as SavedItemEntity;
        });
    };

    const fetchItemsForArchive = async (archiveId: string) => {
        setLoadingItems(prev => ({ ...prev, [archiveId]: true }));
        try {
            const items = await loadRawItems(archiveId);
            setArchiveItems(prev => ({ ...prev, [archiveId]: items }));
        } catch (e) { console.error(e); }
        finally { setLoadingItems(prev => ({ ...prev, [archiveId]: false })); }
    };

    // Carga el mapa: busca coords en el item, si no las tiene las busca en places/
    useEffect(() => {
        if (viewMode !== 'map') return;
        const load = async () => {
            setLoadingMap(true);
            const activeIds = mapSelectedArchives.length > 0 ? mapSelectedArchives : archives.map(a => a.id);
            if (mapSelectedArchives.length === 0) setMapSelectedArchives(archives.map(a => a.id));

            const result: MapItem[] = [];
            for (const archId of activeIds) {
                const arch = archives.find(a => a.id === archId);
                const raw = archiveItems[archId] ?? await loadRawItems(archId);

                for (const item of raw) {
                    if (item.type !== 'place' && item.type !== 'review') continue;
                    let lat = item.lat;
                    let lng = item.lng;

                    if ((!lat || !lng) && item.placeId) {
                        try {
                            const snap = await getDoc(doc(db, 'places', item.placeId));
                            if (snap.exists()) {
                                const coords = extractCoords(snap.data() as Record<string, any>);
                                if (coords) { lat = coords.lat; lng = coords.lng; }
                            }
                        } catch { /* sin coords, se ignora */ }
                    }

                    if (lat && lng) {
                        result.push({
                            id: item.itemId,
                            placeId: item.placeId,
                            lat, lng,
                            name: item.name,
                            photoUrl: item.photoUrl,
                            emoji: arch?.emoji || '📍',
                            color: arch?.color || '#6366f1',
                        });
                    }
                }
            }
            setMapItems(result);
            setLoadingMap(false);
        };
        load();
    }, [viewMode, mapSelectedArchives, archives]);

    const handleDragStart = (e: React.DragEvent, item: SavedItemEntity, sourceId: string) => {
        e.dataTransfer.setData('json/item', JSON.stringify(item));
        e.dataTransfer.setData('text/sourceArchiveId', sourceId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const itemJson = e.dataTransfer.getData('json/item');
        const sourceId = e.dataTransfer.getData('text/sourceArchiveId');
        if (!itemJson || !sourceId || sourceId === targetId) return;
        const item = JSON.parse(itemJson) as SavedItemEntity;
        try {
            await toggleItemInArchive(targetId, { ...item, id: '', savedAt: null }, true);
            await toggleItemInArchive(sourceId, item, false);
            fetchItemsForArchive(targetId);
            fetchItemsForArchive(sourceId);
            if (!expandedIds.includes(targetId)) setExpandedIds(prev => [...prev, targetId]);
        } catch { alert('Error moviendo el elemento.'); }
    };

    const getFilteredItems = (items: SavedItemEntity[]) =>
        items.filter(i => {
            if (filterType !== 'all' && i.type !== filterType) return false;
            if (searchTerm && !i.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        });

    const openCreate = () => {
        setEditMode('create'); setEditId(''); setEditName('');
        setEditEmoji('📍'); setEditColor(COLOR_OPTIONS[0]);
        setShowEditModal(true);
    };

    const openEdit = (e: React.MouseEvent, arch: { id: string; name: string; emoji?: string; color?: string }) => {
        e.stopPropagation();
        setEditMode('edit'); setEditId(arch.id); setEditName(arch.name);
        setEditEmoji(arch.emoji || '📍'); setEditColor(arch.color || COLOR_OPTIONS[0]);
        setShowEditModal(true);
    };

    const saveEdit = async () => {
        if (!editName.trim()) return;
        try {
            if (editMode === 'create') await createArchive(editName.trim(), editEmoji, editColor);
            else await updateArchive(editId, { name: editName.trim(), emoji: editEmoji, color: editColor });
            setShowEditModal(false);
        } catch { alert('Error al guardar.'); }
    };

    if (!user) return <div className="pt-safe-32 text-center text-gray-500">Inicia sesión para ver tu archivo.</div>;

    // ── VISTA MAPA ────────────────────────────────────────────────────────────
    if (viewMode === 'map') {
        return (
            <div className="fixed inset-0 z-50 bg-[var(--lt-bg)] flex flex-col">
                {/* Header flotante */}
                <div className="absolute top-0 left-0 right-0 z-[1001] pt-safe-top">
                    <div className="flex items-center justify-between px-4 pb-3 pt-3 bg-gradient-to-b from-[var(--lt-bg)] to-transparent">
                        <button
                            onClick={() => setViewMode('grid')}
                            className="p-3 bg-black/60 backdrop-blur-md rounded-full text-white border border-white/10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <span className="text-white font-bold text-sm bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                            {mapItems.length} lugares
                        </span>
                        <button
                            onClick={() => setShowMapFilters(v => !v)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-bold backdrop-blur-md border transition-colors ${showMapFilters ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white' : 'bg-black/60 border-white/10 text-white'}`}
                        >
                            <Filter className="w-4 h-4" /> Colecciones
                        </button>
                    </div>
                </div>

                {/* Mapa sin botón de capas propio (ya está el del header) */}
                <div className="flex-1 w-full">
                    {loadingMap && (
                        <div className="absolute inset-0 z-10 bg-[var(--lt-bg)]/60 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]" />
                        </div>
                    )}
                    <MapView items={mapItems} mode="global" showLayerControl={false} />
                </div>

                {/* Panel de filtro de colecciones */}
                {showMapFilters && (
                    <div className="absolute bottom-6 left-4 right-4 z-[1001] bg-[var(--lt-card-strong)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[50vh] flex flex-col">
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <span className="text-white font-bold text-sm">Filtrar colecciones</span>
                            <button onClick={() => setShowMapFilters(false)} className="text-gray-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-2">
                            {archives.map(arch => {
                                const active = mapSelectedArchives.includes(arch.id);
                                return (
                                    <button
                                        key={arch.id}
                                        onClick={() => setMapSelectedArchives(prev =>
                                            active ? prev.filter(x => x !== arch.id) : [...prev, arch.id]
                                        )}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1 transition-colors ${active ? 'bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)]' : 'hover:bg-white/5 border border-transparent'}`}
                                    >
                                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0" style={{ backgroundColor: arch.color || '#6366f1' }}>
                                            {arch.emoji || '📍'}
                                        </div>
                                        <span className="flex-1 text-left text-sm font-medium text-gray-200">{arch.name}</span>
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${active ? 'bg-[var(--lt-accent)] border-indigo-600' : 'border-white/20'}`}>
                                            {active && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── VISTA GRID ────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[var(--lt-bg)] pt-safe-24 pb-20 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <header className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-3xl font-bold text-white">Mi Archivo</h1>
                        <button
                            onClick={() => setViewMode('map')}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white text-sm font-bold rounded-xl shadow-lg transition-colors"
                        >
                            <MapIcon className="w-4 h-4" /> Mapa
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Buscar en tus colecciones..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-[var(--lt-card-strong)] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors"
                            />
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto custom-scrollbar shrink-0">
                            {[
                                { id: 'all', label: 'Todo' },
                                { id: 'place', label: 'Lugares' },
                                { id: 'list', label: 'Listas' },
                                { id: 'group', label: 'Platos' },
                                { id: 'review', label: 'Reseñas' },
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setFilterType(f.id as any)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filterType === f.id
                                        ? 'bg-[var(--lt-accent)] text-white'
                                        : 'bg-[var(--lt-card-strong)] border border-white/10 text-gray-400 hover:text-white'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                {/* Colecciones */}
                {archives.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl">
                        <Folder className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 mb-4">No tienes colecciones aún.</p>
                        <button onClick={openCreate} className="px-5 py-2.5 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] rounded-xl text-white font-bold transition-colors">
                            Crear colección
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Botón nueva colección */}
                        <button
                            onClick={openCreate}
                            className="w-full py-3 border-2 border-dashed border-white/10 rounded-2xl text-gray-500 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all font-bold flex justify-center items-center gap-2 text-sm"
                        >
                            + Nueva colección
                        </button>

                        {archives.map(arch => {
                            const isExpanded = expandedIds.includes(arch.id);
                            const items = archiveItems[arch.id] || [];
                            const filtered = getFilteredItems(items);

                            return (
                                <div
                                    key={arch.id}
                                    className={`bg-[var(--lt-card-strong)] rounded-2xl border transition-all ${isExpanded ? 'border-white/20' : 'border-white/8 hover:border-white/15'}`}
                                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={e => handleDrop(e, arch.id)}
                                >
                                    {/* Cabecera de colección */}
                                    <div
                                        onClick={() => setExpandedIds(prev =>
                                            prev.includes(arch.id) ? prev.filter(i => i !== arch.id) : [...prev, arch.id]
                                        )}
                                        className="p-4 cursor-pointer flex items-center gap-3"
                                    >
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                                            style={{ backgroundColor: arch.color || '#6366f1' }}
                                        >
                                            {arch.emoji || '📁'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-bold truncate">{arch.name}</h3>
                                            <p className="text-xs text-gray-500">{arch.itemCount || 0} elementos</p>
                                        </div>
                                        <button
                                            onClick={e => openEdit(e, arch)}
                                            className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <div className="text-gray-600 pl-1">
                                            {isExpanded
                                                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                            }
                                        </div>
                                    </div>

                                    {/* Contenido expandido */}
                                    {isExpanded && (
                                        <div className="border-t border-white/5 bg-black/20 p-4 rounded-b-2xl">
                                            {loadingItems[arch.id] ? (
                                                <div className="flex items-center justify-center gap-2 py-8 text-gray-500 text-sm">
                                                    <div className="animate-spin w-4 h-4 border-2 border-[var(--lt-accent-border)] border-t-transparent rounded-full" />
                                                    Cargando...
                                                </div>
                                            ) : filtered.length === 0 ? (
                                                <p className="text-center py-8 text-gray-600 text-sm italic">
                                                    {items.length ? 'Nada coincide con el filtro.' : 'Arrastra elementos aquí o guárdalos desde la app.'}
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                                    {filtered.map(item => {
                                                        const tc = TYPE_CONFIG[item.type] || TYPE_CONFIG['place'];
                                                        return (
                                                            <div
                                                                key={item.itemId}
                                                                draggable
                                                                onDragStart={e => handleDragStart(e, item, arch.id)}
                                                                className="group relative rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all cursor-grab active:cursor-grabbing bg-[var(--lt-card)] flex flex-col"
                                                            >
                                                                {/* Imagen cuadrada */}
                                                                <div className="aspect-square bg-gray-800/60 relative">
                                                                    {item.photoUrl ? (
                                                                        <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-2xl">
                                                                            {arch.emoji || '📍'}
                                                                        </div>
                                                                    )}
                                                                    {/* Badge de tipo */}
                                                                    <span className={`absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${tc.bg} ${tc.color}`}>
                                                                        {tc.icon}{tc.label}
                                                                    </span>
                                                                    {/* Botón eliminar */}
                                                                    <button
                                                                        onClick={async e => {
                                                                            e.preventDefault();
                                                                            if (confirm('¿Quitar de la colección?')) {
                                                                                await toggleItemInArchive(arch.id, item, false);
                                                                                fetchItemsForArchive(arch.id);
                                                                            }
                                                                        }}
                                                                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>

                                                                {/* Nombre */}
                                                                <Link
                                                                    to={item.route}
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="p-2 flex-1 hover:bg-white/5 transition-colors"
                                                                >
                                                                    <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{item.name}</p>
                                                                    {item.subtitle && <p className="text-[var(--lt-accent)] text-[10px] truncate mt-0.5">{item.subtitle}</p>}
                                                                </Link>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`¿Eliminar la colección "${arch.name}"?`)) deleteArchive(arch.id);
                                                    }}
                                                    className="text-xs text-red-500/60 hover:text-red-400 flex items-center gap-1 transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" /> Eliminar colección
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal crear/editar colección */}
            {showEditModal && (
                <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
                    <div className="bg-[var(--lt-card-strong)] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-5 relative" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-bold text-white">
                                {editMode === 'create' ? 'Nueva colección' : 'Editar colección'}
                            </h2>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-5">
                            {/* Preview */}
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-all" style={{ backgroundColor: editColor }}>
                                    {editEmoji}
                                </div>
                                <input
                                    className="flex-1 bg-[var(--lt-card)] border border-white/10 rounded-xl px-4 py-3 text-[var(--lt-text)] focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors text-sm"
                                    value={editName}
                                    placeholder="Nombre de la colección..."
                                    onChange={e => setEditName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                    autoFocus
                                />
                            </div>

                            {/* Emojis */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Icono</label>
                                <div className="grid grid-cols-9 gap-1">
                                    {EMOJI_OPTIONS.map(em => (
                                        <button
                                            key={em}
                                            onClick={() => setEditEmoji(em)}
                                            className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${editEmoji === em ? 'bg-[var(--lt-accent-soft)] ring-2 ring-[var(--lt-accent)] scale-110' : 'bg-white/5 hover:bg-white/10'}`}
                                        >
                                            {em}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Colores */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Color</label>
                                <div className="grid grid-cols-8 gap-1.5">
                                    {COLOR_OPTIONS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setEditColor(color)}
                                            className={`w-8 h-8 rounded-lg transition-all ${editColor === color ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={saveEdit}
                                disabled={!editName.trim()}
                                className="w-full bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
