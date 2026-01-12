import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageSquare, Layers } from 'lucide-react';
import { type ListEntity } from '../hooks/useLists';
import { useLike } from '../hooks/useLike';
import { SublistsModal } from './SublistsModal';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';

interface ListCardProps {
    list: ListEntity;
}

export const ListCard: React.FC<ListCardProps> = ({ list }) => {
    const { isLiked, likeCount, toggleLike } = useLike(list.id, list.likes || 0);

    // Sublists Logic
    const [sublistCount, setSublistCount] = useState(0);
    const [isSublistsModalOpen, setIsSublistsModalOpen] = useState(false);

    useEffect(() => {
        // Fetch sublist count on mount
        // Only if it's not already on the list object (which it likely isn't fully synced yet)
        const fetchSublistCount = async () => {
            try {
                const q = query(collection(db, 'lists'), where('parentListId', '==', list.id));
                const snapshot = await getCountFromServer(q);
                setSublistCount(snapshot.data().count);
            } catch (e) {
                console.warn("Failed to fetch sublist count", e);
            }
        };
        fetchSublistCount();
    }, [list.id]);

    // Dynamic Color for Score
    const getScoreColor = (score: number) => {
        if (score >= 9) return 'bg-emerald-500 shadow-emerald-500/50';
        if (score >= 7) return 'bg-indigo-500 shadow-indigo-500/50';
        if (score >= 5) return 'bg-yellow-500 shadow-yellow-500/50';
        return 'bg-red-500 shadow-red-500/50';
    };

    return (
        <>
            <div className="group relative bg-[#151b2e] rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/50 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 h-full flex flex-col">
                <Link to={`/list/${list.id}`} className="block h-48 w-full bg-gray-800 relative overflow-hidden">
                    {(list.mainImageUrl || list.photoUrl) ? (
                        <img src={list.mainImageUrl || list.photoUrl} alt={list.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-900/50 to-purple-900/50 flex items-center justify-center">
                            <span className="text-4xl">📃</span>
                        </div>
                    )}

                    {/* Score Badge */}
                    {list.avgScore !== undefined && list.avgScore > 0 && (
                        <div className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${getScoreColor(list.avgScore)}`}>
                            {list.avgScore.toFixed(1)}
                        </div>
                    )}
                </Link>

                {/* Content */}
                <div className="p-4 flex flex-col flex-grow">
                    <Link to={`/list/${list.id}`} className="block flex-grow">
                        <h3 className="text-lg font-bold text-white mb-1 line-clamp-1 group-hover:text-indigo-400 transition-colors">
                            {list.name}
                        </h3>
                        <p className="text-sm text-gray-400 line-clamp-2 mb-4 h-10">
                            {list.description || "Sin descripción..."}
                        </p>
                    </Link>

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/30">
                            {list.authorName?.[0] || "?"}
                        </div>
                        <span className="truncate max-w-[80px]">{list.authorName}</span>
                    </div>

                    {/* Tags (if available) - Only top 2 */}
                    {list.availableTags && list.availableTags.length > 0 && (
                        <div className="flex gap-1 ml-2 overflow-hidden">
                            {list.availableTags.slice(0, 2).map(tag => (
                                <Link
                                    key={tag}
                                    to={`/search?q=${tag}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-gray-400 hover:bg-indigo-500/20 hover:text-indigo-300 hover:border-indigo-500/30 transition-colors whitespace-nowrap"
                                >
                                    #{tag}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">

                    <div className="flex items-center gap-3 text-gray-400 text-xs">
                        <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {list.itemCount || 0}
                        </span>

                        {/* Sublists Button */}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsSublistsModalOpen(true);
                            }}
                            className="flex items-center gap-1 hover:text-indigo-400 transition-colors"
                            title="Sublistas"
                        >
                            <Layers className="w-3 h-3" />
                            {sublistCount}
                        </button>

                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleLike();
                            }}
                            className={`flex items-center gap-1 transition-colors ${isLiked ? 'text-pink-500' : 'hover:text-pink-400'}`}
                        >
                            <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                            {likeCount}
                        </button>
                    </div>
                </div>
            </div>

            <SublistsModal
                listId={list.id}
                listName={list.name}
                isOpen={isSublistsModalOpen}
                onClose={() => setIsSublistsModalOpen(false)}
            />
        </>
    );
};
