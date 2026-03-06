import React, { useState, useEffect } from 'react';
import { useArchives, type SavedItemEntity } from '../hooks/useArchives';
import { Folder, Check, Plus, X } from 'lucide-react';

interface SaveToArchiveModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: Omit<SavedItemEntity, 'savedAt' | 'id'>; // ID isn't needed for input, we generate it or ignore it
}

export const SaveToArchiveModal: React.FC<SaveToArchiveModalProps> = ({ isOpen, onClose, item }) => {
    const { archives, fetchArchives, createArchive, checkItemSavedStatus, toggleItemInArchive } = useArchives();
    const [initialSelectedIds, setInitialSelectedIds] = useState<string[]>([]);
    const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newArchiveName, setNewArchiveName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            init();
        } else {
            // Reset states on close
            setTempSelectedIds([]);
            setInitialSelectedIds([]);
            setNewArchiveName('');
            setSaving(false);
        }
    }, [isOpen]);

    const init = async () => {
        setLoading(true);
        // Refresh archives to be sure we have the latest list
        await fetchArchives();
        // Check where it is currently saved
        const savedIds = await checkItemSavedStatus(item.itemId);
        setInitialSelectedIds(savedIds);
        setTempSelectedIds(savedIds);
        setLoading(false);
    };

    const handleToggle = (archiveId: string) => {
        setTempSelectedIds(prev => {
            if (prev.includes(archiveId)) {
                return prev.filter(id => id !== archiveId);
            } else {
                return [...prev, archiveId];
            }
        });
    };

    const handleCreate = async () => {
        if (!newArchiveName.trim()) return;
        setIsCreating(true);
        try {
            const newId = await createArchive(newArchiveName);
            if (newId) {
                // Auto select the new archive
                setTempSelectedIds(prev => [...prev, newId]);
                setNewArchiveName('');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsCreating(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Calculate diffs
            const toAdd = tempSelectedIds.filter(id => !initialSelectedIds.includes(id));
            const toRemove = initialSelectedIds.filter(id => !tempSelectedIds.includes(id));

            // Execute in parallel
            await Promise.all([
                ...toAdd.map(id => toggleItemInArchive(id, { ...item, id: '', savedAt: null }, true)),
                ...toRemove.map(id => toggleItemInArchive(id, { ...item, id: '', savedAt: null }, false))
            ]);

            onClose();
        } catch (e) {
            console.error("Error saving archives:", e);
            alert("Hubo un error al guardar los cambios.");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div
                className="bg-[#151b2e] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                onClick={e => e.stopPropagation()}
            >

                {/* Header */}
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0b1021]/50">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Folder className="w-5 h-5 text-indigo-400" />
                        Guardar en...
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    {loading ? (
                        <div className="py-10 text-center text-gray-500">Cargando...</div>
                    ) : (
                        <div className="space-y-1">
                            {archives.map(arch => {
                                const isSelected = tempSelectedIds.includes(arch.id);
                                return (
                                    <button
                                        key={arch.id}
                                        onClick={() => handleToggle(arch.id)}
                                        className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all group ${isSelected ? 'bg-indigo-500/10 border border-indigo-500/50' : 'hover:bg-white/5 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-500 group-hover:text-gray-300'
                                                }`}>
                                                <Folder className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className={`font-bold ${isSelected ? 'text-indigo-300' : 'text-gray-300'}`}>{arch.name}</div>
                                                <div className="text-[10px] text-gray-500">
                                                    {arch.itemCount !== undefined ? `${arch.itemCount} items` : 'Colección'}
                                                </div>
                                            </div>
                                        </div>
                                        {isSelected && <Check className="w-5 h-5 text-indigo-400" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Create New */}
                <div className="p-4 border-t border-white/5 bg-[#0b1021]/30">
                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            placeholder="Nueva colección..."
                            value={newArchiveName}
                            onChange={(e) => setNewArchiveName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
                        />
                        <button
                            onClick={handleCreate}
                            disabled={!newArchiveName.trim() || isCreating}
                            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
                        >
                            {isCreating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Actions */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-wait text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        {saving ? 'Guardando...' : 'Hecho'}
                    </button>
                </div>

            </div>
        </div>
    );
};
