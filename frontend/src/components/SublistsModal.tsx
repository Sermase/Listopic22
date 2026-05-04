import React, { useState, useEffect } from 'react';
import { X, Plus, ChevronRight, Layers } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { CreateListForm } from './CreateListForm';
import { type ListEntity } from '../hooks/useLists';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface SublistsModalProps {
    listId: string;
    listName: string;
    isOpen: boolean;
    onClose: () => void;
    sublists?: ListEntity[] | null;
    parentCriteria?: Record<string, any>; // Criteria from parent list
    parentTags?: string[]; // Tags from parent list
}

export const SublistsModal: React.FC<SublistsModalProps> = ({ listId, listName, isOpen, onClose, sublists: initialSublists, parentCriteria, parentTags }) => {
    const [view, setView] = useState<'list' | 'create'>('list');
    const [sublists, setSublists] = useState<ListEntity[]>([]);
    const [loading, setLoading] = useState(true);
    useBodyScrollLock(isOpen);

    // Fetch Sublists
    const fetchSublists = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'lists'),
                where('parentListId', '==', listId),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ListEntity[];
            setSublists(data);
        } catch (error) {
            console.error("Error fetching sublists:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            if (initialSublists && initialSublists.length > 0) {
                setSublists(initialSublists);
                setLoading(false);
            } else {
                fetchSublists();
            }
            setView('list'); // Reset view on open
        }
    }, [isOpen, listId, initialSublists]);

    const handleCreateSuccess = (newListId: string) => {
        // Refresh list and go back to list view
        fetchSublists();
        setView('list');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[var(--lt-card-strong)] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col lt-mobile-modal-panel sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[var(--lt-bg)]">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {view === 'create' && (
                            <button onClick={() => setView('list')} className="mr-2 hover:bg-white/10 p-1 rounded-full transition-colors">
                                <ChevronRight className="w-5 h-5 rotate-180" />
                            </button>
                        )}
                        <Layers className="w-5 h-5 text-[var(--lt-accent)]" />
                        {view === 'create' ? 'Nueva Sublista' : `Sublistas de ${listName}`}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {view === 'list' ? (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-sm text-gray-400">
                                    Las sublistas heredan el contexto de la lista principal pero pueden tener sus propias reseñas.
                                </p>
                                <button
                                    onClick={() => setView('create')}
                                    className="flex items-center gap-2 px-4 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-[var(--lt-accent-shadow)]"
                                >
                                    <Plus className="w-4 h-4" />
                                    Crear Sublista
                                </button>
                            </div>

                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
                                    ))}
                                </div>
                            ) : sublists.length > 0 ? (
                                <div className="grid gap-3">
                                    {sublists.map(list => (
                                        <Link
                                            key={list.id}
                                            to={`/list/${list.id}`}
                                            className="flex items-center gap-4 p-3 rounded-xl bg-[var(--lt-bg)] border border-white/5 hover:border-[var(--lt-accent-border)] hover:bg-[var(--lt-card)] transition-all group"
                                        >
                                            <div className="w-12 h-12 rounded-lg bg-gray-800 flex-shrink-0 overflow-hidden">
                                                {list.mainImageUrl || list.photoUrl ? (
                                                    <img src={list.mainImageUrl || list.photoUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xl bg-[var(--lt-accent-soft)]">📃</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-white truncate group-hover:text-[var(--lt-accent)] transition-colors">{list.name}</h3>
                                                <p className="text-xs text-gray-500 truncate">{list.itemCount || 0} reseñas</p>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" />
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-xl">
                                    <Layers className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                    <p className="text-gray-400">No hay sublistas todavía.</p>
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
                            parentTags={parentTags}
                            onSuccess={handleCreateSuccess}
                            onCancel={() => setView('list')}
                            initialData={{
                                name: `${listName} (Sublista)`
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
