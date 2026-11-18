import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, ChevronRight, Layers, Search } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { listDetailsQueryKey } from '../hooks/useListDetails';
import { CreateListForm } from './CreateListForm';
import { type ListEntity } from '../hooks/useLists';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { MinilistCard } from './MinilistCard';
import { arrangeMinilists, toMinilistCard, type MinilistTab } from '../lib/minilists';

const PAGE = 20;
const TABS: { id: MinilistTab; label: string }[] = [
    { id: 'top', label: 'Destacadas' },
    { id: 'recent', label: 'Recientes' },
    { id: 'mine', label: 'Las mías' },
];

interface SublistsModalProps {
    listId: string;
    listName: string;
    isOpen: boolean;
    onClose: () => void;
    sublists?: ListEntity[] | null;
    parentCriteria?: Record<string, any>; // Criteria from parent list
    parentScoringWeights?: Record<string, number>;
    /** Si la madre es privada, la Minilista solo puede ser privada. */
    parentIsPublic?: boolean;
    parentTags?: string[]; // Tags from parent list
    parentCategoryId?: string;
}

export const SublistsModal: React.FC<SublistsModalProps> = ({ listId, listName, isOpen, onClose, sublists: initialSublists, parentCriteria, parentScoringWeights, parentTags, parentCategoryId, parentIsPublic = true }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [view, setView] = useState<'list' | 'create'>('list');
    const [sublists, setSublists] = useState<ListEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<MinilistTab>('top');
    const [search, setSearch] = useState('');
    const [shown, setShown] = useState(PAGE);
    const arranged = useMemo(
        () => arrangeMinilists(sublists.map((l) => toMinilistCard(l as unknown as Record<string, unknown> & { id: string })), tab, { uid: user?.uid, query: search }),
        [sublists, tab, user?.uid, search],
    );
    useBodyScrollLock(isOpen);
    const panelRef = useSheetDismiss(onClose, isOpen);

    // Fetch Sublists
    const fetchSublists = async () => {
        try {
            // Las reglas solo dejan consultar las públicas o las propias: dos consultas
            // (antes una sin filtro fallaba y la Minilista recién creada no aparecía).
            const lists = collection(db, 'lists');
            const snaps = await Promise.all([
                getDocs(query(lists, where('parentListId', '==', listId), where('isPublic', '==', true))),
                user ? getDocs(query(lists, where('parentListId', '==', listId), where('userId', '==', user.uid))) : null,
            ]);
            const byId = new Map<string, ListEntity>();
            snaps.forEach((snap) => snap?.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as ListEntity)));
            const millis = (l: ListEntity) => (l.createdAt && typeof l.createdAt.toMillis === 'function' ? l.createdAt.toMillis() : 0);
            setSublists([...byId.values()].sort((a, b) => millis(b) - millis(a)));
        } catch (error) {
            console.error("Error fetching sublists:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            // Se pinta lo precargado (públicas) y se completa con las propias, también privadas.
            if (initialSublists && initialSublists.length > 0) {
                setSublists(initialSublists);
                setLoading(false);
            }
            fetchSublists();
            setView('list'); // Reset view on open
        }
    }, [isOpen, listId, initialSublists]);

    // Al crearla se va directa a la Minilista; en modo concurso, con la ventana de aspirantes abierta.
    const handleCreateSuccess = (newListId: string, options?: { contest: boolean }) => {
        void queryClient.invalidateQueries({ queryKey: listDetailsQueryKey(listId) });
        onClose();
        navigate(`/list/${newListId}${options?.contest ? '?aspirantes=1' : ''}`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={panelRef} className="bg-[var(--lt-card-strong)] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col lt-mobile-modal-panel sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[var(--lt-bg)]">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {view === 'create' && (
                            <button onClick={() => setView('list')} className="mr-2 hover:bg-white/10 p-1 rounded-full transition-colors">
                                <ChevronRight className="w-5 h-5 rotate-180" />
                            </button>
                        )}
                        <Layers className="w-5 h-5 text-[var(--lt-accent)]" />
                        {view === 'create' ? 'Nueva Minilista' : `Minilistas de ${listName}`}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {view === 'list' ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lt-text-muted)]" />
                                    <input
                                        type="search"
                                        value={search}
                                        onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }}
                                        placeholder="Buscar minilista"
                                        aria-label="Buscar minilista"
                                        className="w-full rounded-xl border border-[var(--lt-border)] bg-[var(--lt-bg)] py-2 pl-9 pr-3 text-sm text-[var(--lt-text)] focus:border-[var(--lt-accent-border)] focus:outline-none"
                                    />
                                </div>
                                <button
                                    onClick={() => setView('create')}
                                    aria-label="Crear Minilista"
                                    className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-3 py-2 text-sm font-bold text-[var(--lt-accent)]"
                                >
                                    <Plus className="h-4 w-4" /> Nueva
                                </button>
                            </div>
                            <div role="tablist" aria-label="Ordenar minilistas" className="flex gap-1.5">
                                {TABS.filter((t) => t.id !== 'mine' || user).map((t) => (
                                    <button
                                        key={t.id}
                                        role="tab"
                                        aria-selected={tab === t.id}
                                        onClick={() => { setTab(t.id); setShown(PAGE); }}
                                        className={`rounded-full px-3 py-1 text-xs font-bold border transition-colors ${tab === t.id ? 'border-transparent lt-on-accent' : 'border-[var(--lt-border)] bg-[var(--lt-card)] text-[var(--lt-text-muted)]'}`}
                                        style={tab === t.id ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-28 bg-white/5 rounded-2xl animate-pulse" />
                                    ))}
                                </div>
                            ) : arranged.length > 0 ? (
                                <div className="grid gap-3">
                                    {arranged.slice(0, shown).map(card => (
                                        <MinilistCard key={card.id} card={card} onNavigate={onClose} />
                                    ))}
                                    {arranged.length > shown && (
                                        <button onClick={() => setShown((n) => n + PAGE)} className="w-full rounded-xl border border-[var(--lt-border)] py-2 text-sm font-bold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                                            Ver más ({arranged.length - shown})
                                        </button>
                                    )}
                                </div>
                            ) : sublists.length > 0 ? (
                                <p className="py-8 text-center text-sm text-[var(--lt-text-muted)]">{tab === 'mine' && !search ? 'Todavía no tienes minilistas aquí.' : 'Ninguna minilista con ese nombre.'}</p>
                            ) : (
                                <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-xl">
                                    <Layers className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                    <p className="text-gray-400">No hay minilistas todavía.</p>
                                    <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Una minilista es un ranking con su gente dentro de esta lista: un concurso, tu barrio, tu grupo de amigos…</p>
                                    <button
                                        onClick={() => setView('create')}
                                        className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] text-sm font-bold mt-2"
                                    >
                                        Crear la primera
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <CreateListForm
                            parentListId={listId}
                            parentListName={listName}
                            parentCriteria={parentCriteria}
                            parentScoringWeights={parentScoringWeights}
                            parentIsPublic={parentIsPublic}
                            parentTags={parentTags}
                            parentCategoryId={parentCategoryId}
                            onSuccess={handleCreateSuccess}
                            onCancel={() => setView('list')}
                            initialData={{
                                name: `${listName} (Minilista)`
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
