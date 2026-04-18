import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { X, List as ListIcon, Search, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export const ListSelector = ({ onSelect, onCancel, preselectedId }: { onSelect: (listId: string) => void, onCancel: () => void, preselectedId?: string | null }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [lists, setLists] = useState<{ id: string; name: string; parentListId?: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchLists = async () => {
            if (!user) return;
            try {
                // 1. Fetch Owned Lists
                const qOwned = query(
                    collection(db, 'lists'),
                    where('ownerId', '==', user.uid)
                );

                // 2. Fetch Edited Lists (handle missing index gracefully)
                const qEdited = query(
                    collection(db, 'lists'),
                    where('editors', 'array-contains', user.uid)
                );

                const [snapOwnedResult, snapEditedResult] = await Promise.allSettled([
                    getDocs(qOwned),
                    getDocs(qEdited)
                ]);

                const allDocs: any[] = [];

                if (snapOwnedResult.status === 'fulfilled') {
                    snapOwnedResult.value.docs.forEach(d => allDocs.push(d));
                }

                if (snapEditedResult.status === 'fulfilled') {
                    snapEditedResult.value.docs.forEach(d => allDocs.push(d));
                }

                const uniqueListsMap = new Map();

                allDocs.forEach(d => {
                    const data = d.data();
                    if (!uniqueListsMap.has(d.id)) {
                        uniqueListsMap.set(d.id, {
                            id: d.id,
                            name: data.name,
                            parentListId: data.parentListId
                        });
                    }
                });

                const finalLists = Array.from(uniqueListsMap.values());
                setLists(finalLists as any);

                // Auto-select logic:
                // Only auto-select if:
                // 1. We have NO preselectedId (user hasn't chosen one yet) AND there is exactly ONE list available.
                // 2. We DO NOT auto-select if preselectedId matches, because that prevents changing the selection (modal opens and closes instantly).
                if (!preselectedId && finalLists.length === 1) {
                    onSelect(finalLists[0].id);
                }

            } catch (e) {
                console.error("Error fetching user lists", e);
            } finally {
                setLoading(false);
            }
        };
        fetchLists();
    }, [user]); // Removed preselectedId from dependency to prevent re-runs on prop change if parent updates it

    const filteredLists = lists.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                <div className="text-white text-xs font-medium">Cargando listas...</div>
            </div>
        </div>
    );

    // If fetching finished and we auto-selected (handled in useEffect), we might render briefly.
    // Ideally we render unless filteredLists is empty AND we aren't searching.

    return (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => {
            if (e.target === e.currentTarget) onCancel();
        }}>
            <div className="bg-[var(--lt-card-strong)] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[var(--lt-bg)]/50 sticky top-0 z-10">
                    <h3 className="font-bold text-white text-lg">Seleccionar Lista</h3>
                    <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-white/5 bg-[var(--lt-card-strong)]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar lista..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-600"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {filteredLists.length > 0 ? (
                        <div className="space-y-1">
                            {filteredLists.map(list => {
                                const isSelected = list.id === preselectedId;
                                return (
                                    <button
                                        key={list.id}
                                        onClick={() => onSelect(list.id)}
                                        className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group ${isSelected
                                                ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50'
                                                : 'hover:bg-white/5'
                                            }`}
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-[#1e2538] text-gray-400 group-hover:text-white group-hover:bg-[#252b3d]'
                                            }`}>
                                            <ListIcon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className={`font-bold truncate ${isSelected ? 'text-indigo-200' : 'text-gray-200'}`}>
                                                {list.name}
                                            </div>
                                            {list.parentListId && (
                                                <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
                                                    Sublista
                                                </div>
                                            )}
                                        </div>
                                        {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-400 mr-2"></div>}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-0 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-forwards">
                            <div className="w-16 h-16 bg-[#1e2538] rounded-full flex items-center justify-center mb-4">
                                <ListIcon className="w-8 h-8 text-gray-600" />
                            </div>
                            <p className="text-gray-400 text-sm mb-6 max-w-[200px]">
                                {searchTerm ? 'No se encontraron listas con ese nombre.' : 'No tienes ninguna lista creada todavía.'}
                            </p>
                            {!searchTerm && (
                                <button
                                    onClick={() => {
                                        // Use navigation instead of Link to handle potential logic/warnings if needed
                                        onCancel(); // Close selector first
                                        navigate('/create');
                                    }}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 hover:scale-105 active:scale-95"
                                >
                                    <Plus className="w-5 h-5" />
                                    Crear Nueva Lista
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
