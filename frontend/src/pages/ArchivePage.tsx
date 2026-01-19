import React, { useState, useEffect } from 'react';
import { useArchives, type ArchiveEntity, type SavedItemEntity } from '../hooks/useArchives';
import { Folder, ChevronDown, ChevronRight, MapPin, MessageSquare, List as ListIcon, Trash2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

export const ArchivePage: React.FC = () => {
    const { user } = useAuth();
    const { archives, fetchArchives, toggleItemInArchive, createArchive, deleteArchive } = useArchives();
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [archiveItems, setArchiveItems] = useState<Record<string, SavedItemEntity[]>>({});
    const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
    const [filterType, setFilterType] = useState<'all' | 'place' | 'list' | 'review' | 'group'>('all');

    useEffect(() => {
        fetchArchives();
    }, [fetchArchives]);

    // Auto-expand first archive if exists
    useEffect(() => {
        if (archives.length > 0 && expandedIds.length === 0) {
            setExpandedIds([archives[0].id]);
        }
    }, [archives]);

    // Fetch items when expanding
    useEffect(() => {
        expandedIds.forEach(id => {
            if (!archiveItems[id] && !loadingItems[id]) {
                fetchItemsForArchive(id);
            }
        });
    }, [expandedIds]);

    const toggleExpand = (archiveId: string) => {
        setExpandedIds(prev =>
            prev.includes(archiveId) ? prev.filter(id => id !== archiveId) : [...prev, archiveId]
        );
    };

    const fetchItemsForArchive = async (archiveId: string) => {
        if (!user) return;
        setLoadingItems(prev => ({ ...prev, [archiveId]: true }));
        try {
            const q = query(collection(db, 'users', user.uid, 'archives', archiveId, 'items'), orderBy('savedAt', 'desc'));
            const snap = await getDocs(q);
            const items = snap.docs.map(iDoc => {
                const data = iDoc.data();
                let route = data.route;
                if (!route) {
                    const type = (data.entityType || '').toLowerCase();
                    if (type === 'place' && data.placeId) route = `/place/${data.placeId}`;
                    else if (type === 'group' && data.placeId && data.itemName) route = `/group/${data.placeId}/${encodeURIComponent(data.itemName)}`;
                    else if (type === 'review' && data.placeId) route = `/place/${data.placeId}`;
                }

                return {
                    id: iDoc.id,
                    itemId: data.itemId || iDoc.id,
                    type: data.type || data.entityType || 'other',
                    name: data.name || data.title || data.itemName || 'Sin nombre',
                    subtitle: data.subtitle,
                    photoUrl: data.photoUrl || data.imageUrl,
                    route: route || '#',
                    placeId: data.placeId,
                    listId: data.listId,
                    savedAt: data.savedAt || data.createdAt
                } as SavedItemEntity;
            });
            setArchiveItems(prev => ({ ...prev, [archiveId]: items }));
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingItems(prev => ({ ...prev, [archiveId]: false }));
        }
    };

    const handleDragStart = (e: React.DragEvent, item: SavedItemEntity, sourceArchiveId: string) => {
        e.dataTransfer.setData('json/item', JSON.stringify(item));
        e.dataTransfer.setData('text/sourceArchiveId', sourceArchiveId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetArchiveId: string) => {
        e.preventDefault();
        const itemJson = e.dataTransfer.getData('json/item');
        const sourceArchiveId = e.dataTransfer.getData('text/sourceArchiveId');

        if (!itemJson || !sourceArchiveId) return;
        if (sourceArchiveId === targetArchiveId) return;

        const item = JSON.parse(itemJson) as SavedItemEntity;

        try {
            await toggleItemInArchive(targetArchiveId, { ...item, id: '', savedAt: null }, true);
            await toggleItemInArchive(sourceArchiveId, item, false);
            await fetchItemsForArchive(targetArchiveId);
            await fetchItemsForArchive(sourceArchiveId);

            if (!expandedIds.includes(targetArchiveId)) {
                setExpandedIds(prev => [...prev, targetArchiveId]);
            }
        } catch (err) {
            console.error("Move failed:", err);
            alert("Error moviendo el elemento.");
        }
    };

    const handleRemoveItem = async (archiveId: string, item: SavedItemEntity) => {
        if (!confirm("¿Quitar este elemento de la colección?")) return;
        await toggleItemInArchive(archiveId, item, false);
        await fetchItemsForArchive(archiveId);
    };

    const handleCreateArchive = async () => {
        const name = prompt("Nombre de la nueva colección:");
        if (name && name.trim()) {
            try {
                await createArchive(name.trim());
            } catch (e) {
                alert("Error al crear la colección.");
            }
        }
    };

    const handleDeleteArchive = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (confirm(`¿Eliminar la colección "${name}"? Esta acción no se puede deshacer.`)) {
            try {
                await deleteArchive(id);
            } catch (error) {
                alert("Error al eliminar.");
            }
        }
    };

    const getFilteredItems = (items: SavedItemEntity[]) => {
        if (filterType === 'all') return items;
        return items.filter(i => i.type === filterType);
    };

    if (!user) return <div className="pt-32 text-center text-gray-500">Inicia sesión para ver tu archivo.</div>;

    return (
        <div className="min-h-screen bg-[#0b1021] pt-24 pb-20 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-4">Mi Archivo</h1>
                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                            {[
                                { id: 'all', label: 'Todo' },
                                { id: 'place', label: 'Lugares' },
                                { id: 'list', label: 'Listas' },
                                { id: 'group', label: 'Elementos' },
                                { id: 'review', label: 'Reseñas' },
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setFilterType(f.id as any)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors border ${filterType === f.id
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'bg-[#151b2e] border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                                        }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={handleCreateArchive}
                        className="mb-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl border border-white/10 transition-colors"
                    >
                        + Nueva
                    </button>
                </header>

                <div className="space-y-4">
                    {archives.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl">
                            <Folder className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-500">No tienes colecciones aún.</p>
                            <p className="text-xs text-gray-600 mt-2">Guarda cosas pulsando el botón <span className="inline-block border border-gray-600 px-1 rounded">Guardar</span> en cualquier tarjeta.</p>
                        </div>
                    ) : (
                        archives.map(arch => (
                            <div
                                key={arch.id}
                                className="bg-[#151b2e] rounded-xl border border-white/10 overflow-hidden transition-colors relative group/archive"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, arch.id)}
                            >
                                <button
                                    onClick={() => toggleExpand(arch.id)}
                                    className={`w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors ${expandedIds.includes(arch.id) ? 'bg-white/[0.02]' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${expandedIds.includes(arch.id) ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-500'}`}>
                                            <Folder className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <h3 className="text-white font-bold">{arch.name}</h3>
                                            <div className="flex gap-2 text-xs text-gray-500">
                                                <span>{arch.itemCount || 0} elementos</span>
                                                {archiveItems[arch.id] && (
                                                    <span>({getFilteredItems(archiveItems[arch.id]).length} visibles)</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {expandedIds.includes(arch.id) ? <ChevronDown className="text-gray-500" /> : <ChevronRight className="text-gray-500" />}
                                </button>

                                {/* Delete Archive Button */}
                                <button
                                    onClick={(e) => handleDeleteArchive(e, arch.id, arch.name)}
                                    className="absolute top-4 right-12 p-2 text-gray-600 hover:text-red-500 opacity-0 group-hover/archive:opacity-100 transition-opacity"
                                    title="Eliminar colección"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>

                                {expandedIds.includes(arch.id) && (
                                    <div className="border-t border-white/5 bg-black/20 p-4 min-h-[100px]">
                                        {loadingItems[arch.id] ? (
                                            <div className="text-center py-4 text-gray-500 text-xs">Cargando elementos...</div>
                                        ) : (
                                            <>
                                                {getFilteredItems(archiveItems[arch.id] || []).length === 0 ? (
                                                    <div className="text-center py-8 text-gray-500 italic text-sm">
                                                        {archiveItems[arch.id]?.length ? 'No hay items de este tipo.' : 'Arrastra elementos aquí para moverlos.'}
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {getFilteredItems(archiveItems[arch.id]).map(item => (
                                                            <div
                                                                key={item.itemId}
                                                                className="flex bg-[#1f2937] rounded-lg overflow-hidden border border-white/5 hover:border-indigo-500/30 transition-colors group relative cursor-grab active:cursor-grabbing"
                                                                draggable="true"
                                                                onDragStart={(e) => handleDragStart(e, item, arch.id)}
                                                            >
                                                                <div className="w-20 h-auto bg-gray-800 shrink-0">
                                                                    {item.photoUrl ? (
                                                                        <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                                                                            <Folder className="w-6 h-6 opacity-30" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="p-3 flex-1 min-w-0 flex flex-col justify-center">
                                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">
                                                                        {item.type === 'place' && <><MapPin className="w-3 h-3" /> Lugar</>}
                                                                        {item.type === 'review' && <><MessageSquare className="w-3 h-3" /> Reseña</>}
                                                                        {item.type === 'group' && <><ListIcon className="w-3 h-3" /> Plato</>}
                                                                        {item.type === 'list' && <><Folder className="w-3 h-3" /> Lista</>}
                                                                    </div>
                                                                    <h4 className="text-white font-bold text-sm truncate">{item.name}</h4>
                                                                    {item.subtitle && <p className="text-indigo-400 text-xs truncate">{item.subtitle}</p>}
                                                                    <div className="mt-2 flex gap-2">
                                                                        <Link to={item.route} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-colors flex items-center gap-1">
                                                                            Ver <ExternalLink className="w-3 h-3" />
                                                                        </Link>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleRemoveItem(arch.id, item)}
                                                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-gray-400 hover:text-red-400 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all"
                                                                    title="Quitar"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
