import React from 'react';
import { MessageCircle, Share2, MapPin, ThumbsUp, ThumbsDown, Bookmark } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { type ReviewEntity } from '../hooks/useListDetails';

import { ShareModal } from './ShareModal';
import { SaveToArchiveModal } from './SaveToArchiveModal';

interface ReviewCardProps {
    review: ReviewEntity;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
    // Legacy Score Bubble Colors
    const getScoreColor = (score: number) => {
        if (score >= 9) return 'from-emerald-400 to-teal-500 shadow-emerald-500/50';
        if (score >= 7) return 'from-indigo-400 to-blue-500 shadow-indigo-500/50';
        if (score >= 5) return 'from-yellow-400 to-amber-500 shadow-amber-500/50';
        return 'from-red-400 to-rose-500 shadow-red-500/50';
    };

    const bubbleColor = getScoreColor(review.overallRating || 0);

    // Extract Criteria for Visualization
    const criteriaList = review.criteriaDefinition && review.scores
        ? Object.entries(review.criteriaDefinition).map(([key, def]) => ({
            label: def.label,
            score: review.scores?.[key] || 0
        })).filter(c => c.score > 0)
        : [];


    // Local Interaction State
    const [liked, setLiked] = React.useState(false);
    const [disliked, setDisliked] = React.useState(false);
    const [likeCount, setLikeCount] = React.useState(review.reactionCounts?.like || 0);
    const [isShareOpen, setIsShareOpen] = React.useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = React.useState(false);

    const navigate = useNavigate();

    const handleCardClick = () => {
        if (review.placeId && review.itemName) {
            navigate(`/group/${review.placeId}/${encodeURIComponent(review.itemName)}`);
        }
    };

    const handleLike = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (liked) {
            setLiked(false);
            setLikeCount(prev => prev - 1);
        } else {
            setLiked(true);
            if (disliked) setDisliked(false);
            setLikeCount(prev => prev + 1);
        }
    };

    const handleDislike = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDisliked(!disliked);
        if (!disliked && liked) {
            setLiked(false);
            setLikeCount(prev => prev - 1);
        }
    };

    const handleShareClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsShareOpen(true);
    };

    return (
        <>
            <article
                onClick={handleCardClick}
                className="bg-[#101628] border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col hover:border-white/10 transition-all duration-300 cursor-pointer group hover:shadow-indigo-500/10"
            >
                {/* 1. Header: User, Context, Menu */}
                <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Living Avatar Ring */}
                        <Link
                            to={review.userId ? `/profile/${review.userId}` : '#'}
                            onClick={(e) => e.stopPropagation()}
                            className="block relative group/avatar z-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-full blur-[2px] opacity-70 group-hover/avatar:opacity-100 transition-opacity" />
                            <div className="relative w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500">
                                <div className="w-full h-full rounded-full border-2 border-[#0b1021] overflow-hidden bg-gray-800">
                                    {review.authorPhoto ? (
                                        <img src={review.authorPhoto} alt="User" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">?</div>
                                    )}
                                </div>
                            </div>
                        </Link>

                        <div className="flex flex-col leading-tight z-10">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                <Link
                                    to={review.userId ? `/profile/${review.userId}` : '#'}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-bold text-sm text-gray-100 hover:underline cursor-pointer"
                                >
                                    {review.authorName || 'Usuario'}
                                </Link>
                                {review.listName && (
                                    <span className="text-sm text-gray-400 flex items-center gap-1">
                                        en <Link
                                            to={review.listId ? `/list/${review.listId}` : '#'}
                                            onClick={(e) => e.stopPropagation()}
                                            className="font-semibold text-gray-200 hover:text-indigo-400 transition-colors"
                                        >
                                            {review.listName}
                                        </Link>
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-gray-500">
                                {review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                            </span>
                        </div>
                    </div>

                    <button className="text-gray-500 hover:text-white transition-colors z-10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                            <div className="w-1 h-1 rounded-full bg-current"></div>
                        </div>
                    </button>
                </div>

                {/* 2. Main Visual: Large Image with Overlay Bubble */}
                <div className="relative aspect-[4/3] w-full bg-gray-900 overflow-hidden">
                    {review.photoUrl ? (
                        <img src={review.photoUrl} alt={review.itemName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 bg-gray-800/10">
                            <MapPin className="w-12 h-12 mb-2 opacity-20" />
                            <span className="text-sm opacity-50">Sin foto</span>
                        </div>
                    )}

                    {/* The "Living" Bubble - Top Right Overlay */}
                    <div className={`absolute top-4 right-4 w-16 h-16 flex items-center justify-center z-10 animate-blob transition-all duration-500 group-hover:scale-110`}>
                        {/* Inner Gradient Blob */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${bubbleColor} opacity-90 blur-sm rounded-full`} />
                        {/* Core Bubble */}
                        <div className={`relative w-full h-full bg-gradient-to-br ${bubbleColor} flex items-center justify-center shadow-lg border-2 border-white/10 backdrop-blur-sm`} style={{ borderRadius: 'inherit' }}>
                            <span className="text-white font-display font-bold text-2xl drop-shadow-md">
                                {review.overallRating?.toFixed(1) || '-'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 3. Content Body */}
                <div className="p-4 pt-3 space-y-3 flex-1">

                    {/* Location & Title */}
                    <div>
                        {review.placeName && (
                            <Link
                                to={`/place/${review.placeId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block font-display font-bold text-xl text-gray-100 hover:text-indigo-400 transition-colors leading-tight mb-1"
                            >
                                {review.placeName}
                            </Link>
                        )}
                        <h3 className="text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                            {review.itemName}
                        </h3>
                    </div>

                    {/* Criteria Bars (The "Superetiquetas") Used for Novedades too */}
                    {criteriaList.length > 0 && (
                        <div className="py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                            {criteriaList.map((crit, idx) => (
                                <div key={idx} className="flex flex-col">
                                    <div className="flex justify-between items-end text-[10px] mb-0.5">
                                        <span className="text-gray-400 font-medium truncate opacity-80">{crit.label}</span>
                                        <span className={`font-mono font-bold ${crit.score >= 8 ? 'text-emerald-400' : crit.score >= 5 ? 'text-indigo-400' : 'text-rose-400'}`}>
                                            {crit.score.toFixed(1)}
                                        </span>
                                    </div>
                                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full bg-gradient-to-r ${getScoreColor(crit.score).split(' ')[0]} ${getScoreColor(crit.score).split(' ')[1]}`}
                                            style={{ width: `${crit.score * 10}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Review Text */}
                    {review.comment && (
                        <div className="pl-3 border-l-2 border-white/10">
                            <p className="text-gray-300 text-sm leading-relaxed italic line-clamp-3">
                                "{review.comment}"
                            </p>
                        </div>
                    )}
                </div>

                {/* 4. Footer: Interactive Bar */}
                <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between mt-auto relative z-10">
                    <div className="flex items-center gap-4">
                        <button
                            className={`flex items-center gap-1.5 transition-all group/btn ${liked ? 'text-pink-500 scale-105' : 'text-gray-400 hover:text-pink-500'}`}
                            onClick={handleLike}
                        >
                            <ThumbsUp className={`w-5 h-5 group-hover/btn:scale-110 transition-transform stroke-[1.5] ${liked ? 'fill-current' : ''}`} />
                            <span className="text-sm font-semibold">{likeCount}</span>
                        </button>
                        <button className="flex items-center gap-1.5 text-gray-400 hover:text-indigo-400 transition-colors group/btn" onClick={(e) => e.stopPropagation()}>
                            <MessageCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform stroke-[1.5]" />
                            <span className="text-sm font-semibold">0</span>
                        </button>
                        <button
                            className={`flex items-center gap-1.5 transition-colors group/btn ${disliked ? 'text-rose-500' : 'text-gray-400 hover:text-rose-400'}`}
                            onClick={handleDislike}
                        >
                            <ThumbsDown className={`w-5 h-5 group-hover/btn:scale-110 transition-transform stroke-[1.5] ${disliked ? 'fill-current' : ''}`} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            className="text-gray-500 hover:text-indigo-400 transition-colors p-1"
                            onClick={(e) => { e.stopPropagation(); setIsSaveModalOpen(true); }}
                            title="Guardar"
                        >
                            <Bookmark className="w-5 h-5 stroke-[1.5]" />
                        </button>
                        <button
                            className="text-gray-500 hover:text-white transition-colors p-1"
                            onClick={handleShareClick}
                            title="Compartir"
                        >
                            <Share2 className="w-5 h-5 stroke-[1.5]" />
                        </button>
                    </div>
                </div>
            </article>

            <SaveToArchiveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                item={{
                    itemId: review.id,
                    type: 'review',
                    name: review.itemName,
                    subtitle: review.placeName,
                    route: `/group/${review.placeId}/${encodeURIComponent(review.itemName)}`,
                    photoUrl: review.photoUrl,
                    placeId: review.placeId
                }}
            />

            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                title={`Compartir Reseña`}
                url={`${window.location.origin}/group/${review.placeId}/${encodeURIComponent(review.itemName || '')}`}
                text={`¡Mira esta reseña de ${review.itemName} en ${review.placeName}!`}
            />
        </>
    );
};
