import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Share2, MapPin, ThumbsUp, ThumbsDown, Bookmark, MoreHorizontal, Edit, Trash2, User, Heart, MessageSquare, Flag } from 'lucide-react';
import { ReviewComments } from './ReviewComments';
import { doc, setDoc, deleteDoc, getDoc, collection, onSnapshot, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { type ReviewEntity } from '../hooks/useListDetails';
import { useAuth } from '../context/AuthContext';
import { ShareModal } from './ShareModal';
import { SaveToArchiveModal } from './SaveToArchiveModal';
import { ReviewService } from '../services/ReviewService';
import { ReportModal } from './ReportModal';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { db } from '../firebase';

interface ReviewCardProps {
    review: ReviewEntity;
    onDelete?: (id: string) => void;
    onEdit?: (review: ReviewEntity) => void;
    reactionConfig?: { like?: string; dislike?: string }; // Text for animation (e.g. "ñam!")
}


export const ReviewCard: React.FC<ReviewCardProps> = ({ review, onDelete, onEdit, reactionConfig }) => {
    const { user } = useAuth();
    const navigate = useNavigate();

    // Visual States
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(review.reactionCounts?.like || 0); // Placeholder count
    const [showComments, setShowComments] = useState(false);
    const [showAnimation, setShowAnimation] = useState(false); // For "ñam!" animation

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);

    // Derived States
    const isOwner = user?.uid && (user.uid === review.userId || user.uid === review.authorId);

    // Config Defaults
    const likeText = reactionConfig?.like || "¡Me gusta!";

    // ... (Score Logic Omitted for Brevity - keeping existing) ...
    const getScoreColor = (score: number) => {
        if (score >= 9) return 'from-emerald-400 to-teal-500 shadow-emerald-500/50';
        if (score >= 7) return 'from-indigo-400 to-blue-500 shadow-indigo-500/50';
        if (score >= 5) return 'from-yellow-400 to-amber-500 shadow-amber-500/50';
        return 'from-red-400 to-rose-500 shadow-red-500/50';
    };

    const bubbleColor = review.overallRating && review.overallRating >= 7 ? 'from-emerald-500 to-teal-500' :
        review.overallRating && review.overallRating >= 5 ? 'from-yellow-400 to-orange-500' :
            'from-red-500 to-pink-500';

    // Extract Criteria for Visualization
    const criteriaList = review.criteriaDefinition && review.scores
        ? Object.entries(review.criteriaDefinition).map(([key, def]) => ({ label: def.label, score: review.scores?.[key] || 0 }))
        : [];

    // Check if Liked (Graceful Error Handling)
    useEffect(() => {
        if (!user || !review.id || !review.listId) return;
        const checkLike = async () => {
            try {
                // Correct path: lists/{listId}/reviews/{reviewId}/reactions/{userId}
                const reactionRef = doc(db, 'lists', review.listId, 'reviews', review.id, 'reactions', user.uid);
                const reactionSnap = await getDoc(reactionRef);
                if (reactionSnap.exists()) {
                    setLiked(true);
                }
            } catch (e: any) {
                // Ignore permission errors to prevent console spam
                if (e.code !== 'permission-denied') {
                    console.warn("Error checking like status:", e);
                }
            }
        };
        checkLike();
    }, [user, review.id, review.listId]);

    // Close menu on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isMenuOpen]);

    const handleCardClick = () => {
        if (review.placeId && review.itemName) {
            navigate(`/group/${review.placeId}/${encodeURIComponent(review.itemName)}`);
        }
    };

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || !review.id || !review.listId) return;

        const newLiked = !liked;

        // Optimistic UI
        setLiked(newLiked);
        setLikeCount(prev => newLiked ? prev + 1 : prev - 1);

        if (newLiked) {
            setShowAnimation(true);
            setTimeout(() => setShowAnimation(false), 2000);
        }

        try {
            await ReviewService.toggleReaction(review.listId, review.id, user.uid);
        } catch (error) {
            console.error("Failed to toggle reaction", error);
            setLiked(!newLiked); // Revert
            setLikeCount(prev => !newLiked ? prev + 1 : prev - 1);
        }
    };

    const handleShareClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsShareOpen(true);
        setIsMenuOpen(false);
    };

    const handleSaveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSaveModalOpen(true);
        setIsMenuOpen(false);
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onEdit) onEdit(review);
        setIsMenuOpen(false);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("¿Eliminar reseña?")) {
            setIsDeleting(true);
            try {
                await ReviewService.deleteReview(review.listId, review.id);
                if (onDelete) onDelete(review.id);
            } catch (error) {
                console.error(error);
                setIsDeleting(false);
            }
        }
    };

    const handleReportClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowReportModal(true);
        setIsMenuOpen(false);
    };

    const handleCommentToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowComments(!showComments);
    };

    if (isDeleting) {
        return <div className="animate-pulse bg-[#151b2e] h-64 rounded-3xl border border-white/5 mx-auto w-full"></div>;
    }

    // Local count for optimistic updates
    const [commentCount, setCommentCount] = useState(review.commentCount || 0);

    // Sync state with props if they change (e.g. after a fresh fetch)
    useEffect(() => {
        setCommentCount(review.commentCount || 0);
    }, [review.commentCount]);

    const handleCommentChange = (increment: number) => {
        setCommentCount(prev => Math.max(0, prev + increment));
    };

    return (
        <>
            <article
                onClick={handleCardClick}
                className="bg-[#101628] border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col hover:border-white/10 transition-all duration-300 cursor-pointer group hover:shadow-indigo-500/10 relative"
            >
                {/* 1. Header: User, Context, Menu */}
                {/* ... (Header code unchanged) ... */}
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
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                            <User className="w-5 h-5" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Link>

                        <div className="flex flex-col leading-tight z-10 max-w-[150px] sm:max-w-none">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                <Link
                                    to={review.userId ? `/profile/${review.userId}` : '#'}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-bold text-sm text-gray-100 hover:underline cursor-pointer truncate"
                                >
                                    {review.authorName || 'Anónimo'}
                                </Link>
                                {(review.listName || review.placeName) && (
                                    <span className="text-sm text-gray-400 flex items-center gap-1 truncate max-w-full">
                                        en <Link
                                            to={review.listId ? `/list/${review.listId}` : '#'}
                                            onClick={(e) => e.stopPropagation()}
                                            className="font-semibold text-gray-200 hover:text-indigo-400 transition-colors truncate"
                                        >
                                            {review.listName || review.placeName}
                                        </Link>
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-gray-500">
                                {(() => {
                                    const date = review.createdAt;
                                    let dateObj: Date | null = null;
                                    if (date && typeof date.toDate === 'function') dateObj = date.toDate();
                                    else if (date instanceof Date) dateObj = date;
                                    else if (typeof date === 'string' || typeof date === 'number') dateObj = new Date(date);
                                    return dateObj ? formatDistanceToNow(dateObj, { locale: es }) : 'Reciente';
                                })()}
                            </span>
                        </div>
                    </div>

                    <div className="relative z-20" ref={menuRef}>
                        <button
                            className="text-gray-500 hover:text-white transition-colors p-1"
                            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                        >
                            <MoreHorizontal className="w-5 h-5" />
                        </button>

                        {isMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden animate-fade-in origin-top-right z-50">
                                <button
                                    onClick={handleSaveClick}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                                >
                                    <Bookmark className="w-4 h-4" /> Guardar
                                </button>
                                <button
                                    onClick={handleShareClick}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                                >
                                    <Share2 className="w-4 h-4" /> Compartir
                                </button>

                                {isOwner ? (
                                    <>
                                        <div className="h-px bg-white/10 my-1"></div>
                                        <button
                                            onClick={handleEdit}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                                        >
                                            <Edit className="w-4 h-4" /> Editar
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="w-full text-left px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" /> Eliminar
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="h-px bg-white/10 my-1"></div>
                                        <button
                                            onClick={handleReportClick}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                                        >
                                            <Flag className="w-4 h-4" /> Reportar
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Main Visual: Large Image with Overlay Bubble (Also for fallback) */}
                <div className={`relative w-full bg-gray-900 overflow-hidden ${review.photoUrl ? 'aspect-[4/3]' : 'h-32 sm:h-40'}`}>

                    {/* "Ñam!" Animation Overlay */}
                    {showAnimation && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/20 shadow-2xl animate-bounce-in">
                                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 drop-shadow-sm filter">
                                    {likeText}
                                </span>
                            </div>
                        </div>
                    )}

                    {review.photoUrl ? (
                        <img src={review.photoUrl} alt={review.itemName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                        review.placeMainImage ? (
                            <img src={review.placeMainImage} alt={review.placeName} className="w-full h-full object-cover object-center opacity-60 group-hover:scale-105 transition-transform duration-700" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 bg-gray-800/10">
                                <MapPin className="w-8 h-8 mb-1 opacity-20" />
                            </div>
                        )
                    )}

                    {/* Overlay Bubbles Container - Always visible now if we have fallback image or legitimate image */}
                    <div className={`absolute ${review.photoUrl ? 'top-4 right-4 flex-col items-end gap-2' : 'top-1/2 -translate-y-1/2 right-4 flex-row items-center gap-3'} flex z-10`}>

                        {/* City Bubble (Overlay) */}
                        {(review as any).placeCity && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-md shadow-lg transform transition-transform group-hover:scale-105">
                                <MapPin className="w-3.5 h-3.5 text-white/90" />
                                <span className="text-white font-bold text-xs uppercase tracking-wide">{(review as any).placeCity}</span>
                            </div>
                        )}

                        {/* The "Living" Score Bubble */}
                        <div className={`relative w-16 h-16 flex items-center justify-center animate-blob transition-all duration-500 group-hover:scale-110`}>
                            {/* Inner Gradient Blob */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${bubbleColor} opacity-90 blur-sm rounded-full`} />
                            {/* Core Bubble */}
                            <div className={`relative w-full h-full bg-gradient-to-br ${bubbleColor} flex items-center justify-center shadow-lg border-2 border-white/10 backdrop-blur-sm rounded-full`}>
                                <span className="text-white font-display font-bold text-2xl drop-shadow-md">
                                    {review.overallRating?.toFixed(1) || '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Content Body */}
                <div className="p-4 pt-3 space-y-3 flex-1">
                    {/* Title & Item */}
                    <div>
                        {review.placeName && (
                            <Link
                                to={`/place/${review.placeId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block font-display font-bold text-lg sm:text-xl text-gray-100 hover:text-indigo-400 transition-colors leading-tight mb-1"
                            >
                                {review.placeName}
                            </Link>
                        )}
                        <h3 className="text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                            {review.itemName}
                        </h3>
                    </div>

                    {/* Criteria Bars */}
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

                    {/* Tags (Restored below comment) */}
                    {review.tags && review.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {review.tags.map((tag, i) => (
                                <span key={i} className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                    #{tag}
                                </span>
                            ))}
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
                            <span className="text-sm font-semibold">{likeCount > 0 ? likeCount : ''}</span>
                        </button>
                        <button
                            className={`flex items-center gap-1.5 transition-colors group/btn ${showComments ? 'text-indigo-400' : 'text-gray-400 hover:text-indigo-400'}`}
                            onClick={handleCommentToggle}
                        >
                            <MessageCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform stroke-[1.5]" />
                            <span className="text-sm font-semibold">{commentCount > 0 ? commentCount : ''}</span>
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

                {/* Inline Comments Section */}
                {showComments && review.listId && review.id && (
                    <div className="border-t border-white/10 bg-[#0b1021]/50 p-4" onClick={e => e.stopPropagation()}>
                        <ReviewComments
                            listId={review.listId}
                            reviewId={review.id}
                            onCommentChange={handleCommentChange}
                        />
                    </div>
                )}
            </article>

            {/* Modals */}
            <SaveToArchiveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                item={{
                    itemId: review.id || '',
                    placeId: review.placeId || '',
                    name: review.itemName || review.placeName || '',
                    type: 'review',
                    route: review.placeId && review.itemName ? `/group/${review.placeId}/${encodeURIComponent(review.itemName)}` : '',
                    photoUrl: review.photoUrl
                }}
            />

            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                title={`Compartir Reseña`}
                url={`${window.location.origin}/group/${review.placeId}/${encodeURIComponent(review.itemName || '')}`}
                text={`¡Mira esta reseña de ${review.itemName} en ${review.placeName}!`}
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetId={review.id || ''}
                targetName={review.itemName || 'Reseña'}
                itemName={review.placeName}
                targetType="review"
            />
        </>
    );
};
