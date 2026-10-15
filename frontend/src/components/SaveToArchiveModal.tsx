import React, { useState, useEffect } from 'react';
import { useArchives, type SavedItemEntity } from '../hooks/useArchives';
import { Folder, Check, Plus, X } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { MarqueeText } from './ui/MarqueeText';
import { useToast } from '../context/ToastContext';

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
    const { showToast } = useToast();
    useBodyScrollLock(isOpen);

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
        try {
            // Se usa la lista recién leída: el estado de React todavía no se
            // ha actualizado y daría "no guardado" aunque lo esté.
            const freshArchives = await fetchArchives();
            const savedIds = await checkItemSavedStatus(item.itemId, freshArchives);
            setInitialSelectedIds(savedIds);
            setTempSelectedIds(savedIds);
        } catch (error) {
            console.error('Error loading collections:', error);
            showToast({ variant: 'error', message: 'No pudimos cargar tus colecciones.' });
        } finally {
            setLoading(false);
        }
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
            showToast({ variant: 'error', message: 'No se pudo crear la colección.' });
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

            if (toAdd.length > 0 || toRemove.length > 0) {
                const addedNames = archives.filter(a => toAdd.includes(a.id)).map(a => a.name);
                showToast({
                    variant: 'success',
                    message: addedNames.length > 0
                        ? `Guardado en ${addedNames.join(', ')}`
                        : 'Colecciones actualizadas',
                    durationMs: 2500,
                });
            }
            onClose();
        } catch (e) {
            console.error("Error saving archives:", e);
            showToast({ variant: 'error', title: 'No se pudo guardar', message: 'Revisa tu conexión e inténtalo otra vez.' });
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Guardar en una colección"
                className="bg-[var(--lt-card-strong)] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm border border-[var(--lt-border)] shadow-2xl overflow-hidden flex flex-col lt-mobile-modal-panel max-h-[85dvh] sm:max-h-[80vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Asa de la hoja (solo móvil) */}
                <div className="sm:hidden flex justify-center pt-2.5">
                    <span className="h-1 w-10 rounded-full bg-[var(--lt-border-strong)]" />
                </div>

                {/* Header */}
                <div className="px-4 pt-3 pb-3 sm:pt-4 flex justify-between items-start gap-3 border-b border-[var(--lt-border)]">
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-base font-display font-bold leading-tight text-[var(--lt-text)]">
                            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                <Folder className="w-3.5 h-3.5" />
                            </span>
                            Guardar en...
                        </h3>
                        {item.name && (
                            <MarqueeText text={item.name} className="mt-0.5 block text-xs font-medium text-[var(--lt-text-muted)]" />
                        )}
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-1.5 -mr-1 rounded-full text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-[var(--lt-card)] transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    {loading ? (
                        <div className="space-y-1.5 p-1" aria-label="Cargando colecciones">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="flex items-center gap-3 p-2">
                                    <div className="w-11 h-11 rounded-xl bg-[var(--lt-card)] animate-pulse" />
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-3 w-1/2 rounded bg-[var(--lt-card)] animate-pulse" />
                                        <div className="h-2.5 w-1/4 rounded bg-[var(--lt-card)] animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : archives.length === 0 ? (
                        <div className="py-8 px-4 text-center">
                            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--lt-accent-soft)] text-2xl">📁</div>
                            <p className="text-sm font-bold text-[var(--lt-text)]">Aún no tienes colecciones</p>
                            <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">Crea la primera aquí abajo.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {archives.map(arch => {
                                const isSelected = tempSelectedIds.includes(arch.id);
                                return (
                                    <button
                                        key={arch.id}
                                        onClick={() => handleToggle(arch.id)}
                                        aria-pressed={isSelected}
                                        className={`w-full text-left p-2 pr-3 rounded-2xl flex items-center gap-3 transition-all border ${isSelected ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)]' : 'border-transparent hover:bg-[var(--lt-card)]'}`}
                                    >
                                        <div
                                            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                                            style={{ backgroundColor: arch.color || 'var(--lt-card)' }}
                                        >
                                            {arch.emoji || <Folder className="w-5 h-5 text-[var(--lt-text-muted)]" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <MarqueeText
                                                text={arch.name}
                                                className={`block text-sm font-bold ${isSelected ? 'text-[var(--lt-accent)]' : 'text-[var(--lt-text)]'}`}
                                            />
                                            <div className="text-[11px] text-[var(--lt-text-muted)]">
                                                {arch.itemCount !== undefined ? `${arch.itemCount} ${arch.itemCount === 1 ? 'elemento' : 'elementos'}` : 'Colección'}
                                            </div>
                                        </div>
                                        <span
                                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-colors ${isSelected ? 'bg-[var(--lt-accent)] border-transparent lt-on-accent' : 'border-[var(--lt-border-strong)]'}`}
                                        >
                                            {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Create New */}
                <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 border-t border-[var(--lt-border)] bg-[var(--lt-bg)]/40">
                    <div className="flex gap-2 mb-3">
                        <input
                            type="text"
                            placeholder="Nueva colección..."
                            value={newArchiveName}
                            onChange={(e) => setNewArchiveName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            className="min-w-0 flex-1 bg-[var(--lt-card)] border border-[var(--lt-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--lt-text)] placeholder:text-[var(--lt-text-muted)] focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors"
                        />
                        <button
                            onClick={handleCreate}
                            disabled={!newArchiveName.trim() || isCreating}
                            aria-label="Crear colección"
                            className="shrink-0 w-11 flex items-center justify-center rounded-xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] hover:opacity-80 disabled:opacity-40 transition-opacity"
                        >
                            {isCreating ? <div className="w-5 h-5 border-2 border-[var(--lt-accent-border)] border-t-[var(--lt-accent)] rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Actions */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-3 disabled:opacity-50 disabled:cursor-wait lt-on-accent font-bold rounded-2xl transition-opacity hover:opacity-90 shadow-lg shadow-[var(--lt-accent-shadow)]"
                        style={{ background: 'var(--lt-accent-grad)' }}
                    >
                        {saving ? 'Guardando...' : 'Hecho'}
                    </button>
                </div>

            </div>
        </div>
    );
};
