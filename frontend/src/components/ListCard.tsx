import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageSquare } from 'lucide-react';
import { type ListEntity } from '../hooks/useLists';
import { useLike } from '../hooks/useLike';

interface ListCardProps {
    list: ListEntity;
}

export const ListCard: React.FC<ListCardProps> = ({ list }) => {
    const { isLiked, likeCount, toggleLike } = useLike(list.id, list.likes || 0);

    // Dynamic Color for Score
    const getScoreColor = (score: number) => {
        if (score >= 9) return 'bg-emerald-500 shadow-emerald-500/50';
        if (score >= 7) return 'bg-indigo-500 shadow-indigo-500/50';
        if (score >= 5) return 'bg-yellow-500 shadow-yellow-500/50';
        return 'bg-red-500 shadow-red-500/50';
    };

    return (
        <div className="group relative bg-[#151b2e] rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/50 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 h-full flex flex-col">
            <Link to={`/list/${list.id}`} className="block h-40 w-full bg-gray-800 relative overflow-hidden">
                {list.photoUrl ? (
                    <img src={list.photoUrl} alt={list.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
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

                {/* Footer Info */}
                <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/30">
                            {list.authorName?.[0] || "?"}
                        </div>
                        <span className="truncate max-w-[80px]">{list.authorName}</span>
                    </div>

                    <div className="flex items-center gap-3 text-gray-400 text-xs">
                        <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {list.itemCount || 0}
                        </span>
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
        </div>
    );
};
