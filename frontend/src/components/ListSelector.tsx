import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { X, List as ListIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export const ListSelector = ({ onSelect, onCancel, preselectedId }: { onSelect: (listId: string) => void, onCancel: () => void, preselectedId?: string | null }) => {
    const { user } = useAuth();
    const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLists = async () => {
            if (!user) return;
            try {
                const q = query(
                    collection(db, 'lists'),
                    where('ownerId', '==', user.uid)
                );
                const snap = await getDocs(q);
                // Filter for root lists in memory to avoid missing composite index error
                const userLists = snap.docs
                    .filter(d => !d.data().parentListId)
                    .map(d => ({ id: d.id, name: d.data().name }));
                setLists(userLists);

                // Auto-select logic
                if (preselectedId && userLists.find(l => l.id === preselectedId)) {
                    // If the user specifically came from this list context and they own it
                    onSelect(preselectedId);
                    return;
                }

                if (userLists.length === 1) {
                    onSelect(userLists[0].id);
                }
            } catch (e) {
                console.error("Error fetching user lists", e);
            } finally {
                setLoading(false);
            }
        };
        fetchLists();
    }, [user, preselectedId]);

    if (loading) return <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/50 backdrop-blur-sm"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>;

    // If auto-selected (length === 1 or preselect), we return null while parent handles it
    if ((lists.length === 1 && !preselectedId) || (preselectedId && lists.find(l => l.id === preselectedId))) return null;

    return (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#151b2e] rounded-xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0b1021]/50">
                    <h3 className="font-bold text-white">Guardar en Lista</h3>
                    <button onClick={onCancel}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-2 overflow-y-auto max-h-60 custom-scrollbar">
                    {lists.length > 0 ? lists.map(list => (
                        <button
                            key={list.id}
                            onClick={() => onSelect(list.id)}
                            className="w-full text-left p-3 hover:bg-white/5 rounded-lg text-gray-300 hover:text-white transition-colors flex items-center gap-3"
                        >
                            <div className="w-8 h-8 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                <ListIcon className="w-4 h-4" />
                            </div>
                            <span className="font-bold truncate">{list.name}</span>
                        </button>
                    )) : (
                        <div className="p-8 flex flex-col items-center justify-center gap-3">
                            <Link
                                to="/create"
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                            >
                                <ListIcon className="w-4 h-4" />
                                Crear Nueva Lista
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
