import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Share2, MapPin, ThumbsUp, ThumbsDown, Bookmark, User, Heart, MessageSquare } from 'lucide-react';
import { ReviewComments } from './ReviewComments';
import { UserAvatar } from './UserAvatar';
import { ReviewPhotoCarousel } from './ReviewPhotoCarousel';
import { ReviewCardMenu } from './ReviewCardMenu';
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
import { NonPonderableGauge } from './NonPonderableGauge';
import { buildCriteriaStats } from '../utils/shareCriteria';
import { buildPublicRouteUrl } from '../utils/publicUrl';
import { CategoryService } from '../services/CategoryService';
import { useAuthPrompt } from '../context/AuthPromptContext';

interface ReviewCardProps {
    review: ReviewEntity;
    onDelete?: (id: string) => void;
    onEdit?: (review: ReviewEntity) => void;
    reactionConfig?: { like?: string; dislike?: string }; // Text for animation (e.g. "ñam!")
    placeClosedStatus?: string;
}


export const ReviewCard: React.FC<ReviewCardProps> = ({ review, onDelete, onEdit, reactionConfig, placeClosedStatus: placeClosedStatusProp }) => {
    const placeClosedStatus = placeClosedStatusProp || (review as any).placeClosedStatus || undefined;
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Visual States
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(review.reactionCounts?.like || 0); // Placeholder count
    const [showComments, setShowComments] = useState(false);
    const [reactionAnimationText, setReactionAnimationText] = useState('');
    const [reactionAnimationTone, setReactionAnimationTone] = useState<'like' | 'dislike'>('like');
    const [showAnimation, setShowAnimation] = useState(false); // For "ñam!" animation

    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Local count for optimistic updates
    const [commentCount, setCommentCount] = useState(review.commentCount || 0);

    // Sync state with props if they change (e.g. after a fresh fetch)
    useEffect(() => {
        setCommentCount(review.commentCount || 0);
    }, [review.commentCount]);

    // Derived States
    const isOwner = user?.uid && (user.uid === review.userId || user.uid === review.authorId);

    const reviewCategoryId = typeof review.categoryId === 'string' && review.categoryId.trim()
        ? review.categoryId.trim()
        : (typeof (review as any).category === 'string' ? (review as any).category.trim() : '');

    const { data: loadedReactionConfig } = useQuery({
        queryKey: ['reviewReactionConfig', reactionConfig ? 'provided' : reviewCategoryId || review.listId || 'none'],
        enabled: !reactionConfig && Boolean(reviewCategoryId || review.listId),
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        queryFn: async () => {
            let categoryId = reviewCategoryId;
            if (!categoryId && review.listId) {
                const listSnap = await getDoc(doc(db, 'lists', review.listId));
                const listData = listSnap.exists() ? listSnap.data() : null;
                categoryId = typeof listData?.categoryId === 'string'
                    ? listData.categoryId
                    : (typeof listData?.category === 'string' ? listData.category : '');
            }
            if (!categoryId) return null;
            const category = await CategoryService.getCategory(categoryId);
            return CategoryService.getReactionConfig(category);
        },
    });

    // Config Defaults
    const resolvedReactionConfig = reactionConfig || loadedReactionConfig || undefined;
    const likeText = resolvedReactionConfig?.like || "¡Me gusta!";
    const dislikeText = resolvedReactionConfig?.dislike || "No me gusta";

    // ... (Score Logic Omitted for Brevity - keeping existing) ...
    const getScoreColor = (score: number) => {
        if (score >= 9) return 'from-emerald-400 to-teal-500 shadow-emerald-500/50';
        if (score >= 7) return 'from-indigo-400 to-blue-500 shadow-[var(--lt-accent-shadow)]';
        if (score >= 5) return 'from-yellow-400 to-amber-500 shadow-amber-500/50';
        return 'from-red-400 to-rose-500 shadow-red-500/50';
    };

    // Extract Criteria for Visualization
    const { ponderable, nonPonderable } = React.useMemo(() => {
        const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
        const defAny = review.criteriaDefinition as any;
        const scores = review.scores || {};
        const scoreKeys = Object.keys(scores);
        const scoreKeySet = new Set(scoreKeys);
        const orderedKeys: string[] = [];

        const getLabel = (key: string) => {
            if (Array.isArray(defAny)) {
                const found = defAny.find((d: any) => d?.id === key);
                return found?.label || key;
            }
            if (defAny && typeof defAny === 'object') {
                return defAny[key]?.label || key;
            }
            return key;
        };

        if (Array.isArray(defAny)) {
            defAny.forEach((def: any) => {
                if (typeof def?.id === 'string' && scoreKeySet.has(def.id)) {
                    orderedKeys.push(def.id);
                }
            });
        } else if (defAny && typeof defAny === 'object') {
            orderedKeys.push(
                ...Object.keys(defAny)
                    .filter((key) => scoreKeySet.has(key))
                    .sort((a, b) => collator.compare(getLabel(a), getLabel(b)))
            );
        }

        const used = new Set(orderedKeys);
        const remaining = scoreKeys
            .filter((key) => !used.has(key))
            .sort((a, b) => collator.compare(getLabel(a), getLabel(b)));

        const finalKeys = [...orderedKeys, ...remaining];

        const allCriteria = finalKeys.map((key) => {
            const def = Array.isArray(defAny)
                ? defAny.find((entry: any) => entry?.id === key)
                : (defAny && typeof defAny === 'object' ? defAny[key] : null);

            return {
                key,
                label: getLabel(key),
                score: scores[key] || 0,
                isPonderable: def ? (def.ponderable !== false && def.isPonderable !== false) : true
            };
        });

        return {
            ponderable: allCriteria.filter(c => c.isPonderable),
            nonPonderable: allCriteria.filter(c => !c.isPonderable)
        };
    }, [review.criteriaDefinition, review.scores]);


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

    const handleCardClick = () => {
        if (review.placeId && review.itemName) {
            navigate(`/group/${review.placeId}/${encodeURIComponent(review.itemName)}`);
        }
    };

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) {
            openAuthPrompt('indicar que te gusta esta reseña');
            return;
        }
        if (!review.id || !review.listId) return;

        const newLiked = !liked;

        // Optimistic UI
        setLiked(newLiked);
        setLikeCount(prev => Math.max(0, newLiked ? prev + 1 : prev - 1));
        setReactionAnimationText(newLiked ? likeText : dislikeText);
        setReactionAnimationTone(newLiked ? 'like' : 'dislike');
        setShowAnimation(false);
        window.setTimeout(() => setShowAnimation(true), 0);
        window.setTimeout(() => setShowAnimation(false), 1200);

        try {
            await ReviewService.toggleReaction(review.listId, review.id, user.uid);
        } catch (error) {
            console.error("Failed to toggle reaction", error);
            setLiked(!newLiked); // Revert
            setLikeCount(prev => Math.max(0, !newLiked ? prev + 1 : prev - 1));
        }
    };

    const handleShareClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsShareOpen(true);
    };

    const handleSaveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) {
            openAuthPrompt('guardar esta reseña');
            return;
        }
        setIsSaveModalOpen(true);
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onEdit) onEdit(review);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("¿Eliminar reseña?")) {
            setIsDeleting(true);
            try {
                await ReviewService.deleteReview(review.listId, review.id, queryClient);
                if (onDelete) onDelete(review.id);
            } catch (error) {
                console.error(error);
                setIsDeleting(false);
            }
        }
    };

    const handleReportClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) {
            openAuthPrompt('reportar esta reseña');
            return;
        }
        setShowReportModal(true);
    };

    const handleCommentToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowComments(!showComments);
    };

    if (isDeleting) {
        return <div className="animate-pulse bg-[var(--lt-card-strong)] h-64 rounded-3xl border border-white/5 mx-auto w-full"></div>;
    }



    const handleCommentChange = (increment: number) => {
        setCommentCount(prev => Math.max(0, prev + increment));
    };

    const reviewRoute = review.placeId && review.itemName
        ? `/group/${review.placeId}/${encodeURIComponent(review.itemName)}`
        : '/';
    const reviewShareUrl = buildPublicRouteUrl(reviewRoute);

    return (
        <>
            <article
                onClick={handleCardClick}
                style={{ willChange: 'transform' }} // Optimize for GPU
                className="glass-card sm:rounded-3xl cursor-pointer group relative -mx-4 sm:mx-0 w-[calc(100%+2rem)] sm:w-full flex-col flex"
            >
                {/* 1. Header: User, Context, Menu */}
                {/* ... (Header code unchanged) ... */}
                <div className="px-4 py-3 flex items-center justify-center">
                    <div className="flex items-center gap-3 w-full">
                        {/* Living Avatar Ring */}
                        <Link
                            to={review.userId ? `/profile/${review.userId}` : '#'}
                            onClick={(e) => e.stopPropagation()}
                            className="block z-10 shrink-0"
                        >
                            <UserAvatar
                                photoUrl={review.authorPhoto}
                                displayName={review.authorName}
                                userType={(review as any).authorUserType}
                                size="md"
                            />
                        </Link>

                        <div className="flex flex-col leading-tight z-10 min-w-0 flex-1">
                            <div className="flex items-start justify-between w-full">
                                <div className="flex flex-col">
                                    <Link
                                        to={review.userId ? `/profile/${review.userId}` : '#'}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-bold text-sm text-gray-100 hover:underline cursor-pointer truncate"
                                    >
                                        {review.authorName || 'Anónimo'}
                                    </Link>
                                    {(review.listName || review.placeName) && (
                                        <span className="text-sm text-gray-400 truncate w-full">
                                            en <Link
                                                to={review.listId ? `/list/${review.listId}` : '#'}
                                                onClick={(e) => e.stopPropagation()}
                                                className="font-semibold text-gray-200 hover:text-[var(--lt-accent)] transition-colors"
                                            >
                                                {review.listName || review.placeName}
                                            </Link>
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
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

                        <ReviewCardMenu
                            isOwner={!!isOwner}
                            onShare={handleShareClick}
                            onSave={handleSaveClick}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onReport={handleReportClick}
                        />
                    </div>
                </div>

                {/* 2. Main Visual: Photo Carousel with Score Bubble */}
                <ReviewPhotoCarousel
                    photoUrls={review.photoUrls}
                    photoUrl={review.photoUrl}
                    placeMainImage={review.placeMainImage}
                    itemName={review.itemName}
                    placeName={review.placeName}
                    overallRating={review.overallRating}
                    placeCity={(review as any).placeCity}
                />

                {/* 3. Content Body */}
                <div className="p-4 pt-3 space-y-3 flex-1">
                    {/* Title & Item */}
                    <div>
                        {review.placeName && (
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <Link
                                    to={`/place/${review.placeId}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-display font-bold text-lg sm:text-xl text-gray-100 hover:text-[var(--lt-accent)] transition-colors leading-tight"
                                >
                                    {review.placeName}
                                </Link>
                                {placeClosedStatus && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${placeClosedStatus === 'permanently_closed'
                                        ? 'bg-red-500/15 border-red-500/30 text-red-400'
                                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                        }`}>
                                        {placeClosedStatus === 'permanently_closed' ? '🔒 Cerrado' : '⏰ Cerrado temp.'}
                                    </span>
                                )}
                            </div>
                        )}
                        <h3 className="text-sm font-medium text-[var(--lt-accent)] group-hover:text-[var(--lt-accent)] transition-colors">
                            {review.itemName}
                        </h3>
                    </div>

                    {/* Criteria Bars (Grouped) */}
                    {(ponderable.length > 0 || nonPonderable.length > 0) && (
                        <div className="py-2 space-y-3">

                            {/* Ponderable (Standard) - Grid */}
                            {ponderable.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                                    {ponderable.map((crit, idx) => {
                                        const barColor = `bg-gradient-to-r ${getScoreColor(crit.score).split(' ')[0]} ${getScoreColor(crit.score).split(' ')[1]}`;
                                        const scoreColor = crit.score >= 8 ? 'text-emerald-400' : crit.score >= 5 ? 'text-[var(--lt-accent)]' : 'text-rose-400';

                                        return (
                                            <div key={idx} className="flex flex-col">
                                                <div className="flex justify-between items-end text-xs mb-1">
                                                    <span className="text-gray-400 font-medium truncate opacity-90">{crit.label}</span>
                                                    <span className={`font-mono font-bold ${scoreColor}`}>
                                                        {crit.score.toFixed(1)}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${barColor}`}
                                                        style={{ width: `${crit.score * 10}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Non-Ponderable (Extras) - Gauges Grid */}
                            {nonPonderable.length > 0 && (
                                <div className="pt-2 border-t border-white/5">
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                        {nonPonderable.map((crit, idx) => (
                                            <NonPonderableGauge key={idx} score={crit.score} label={crit.label} size={60} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Review Text */}
                    {review.comment && (
                        <div className="pl-3 border-l-2 border-white/10 mt-2">
                            <p className="text-gray-300 text-sm leading-relaxed italic line-clamp-3">
                                "{review.comment}"
                            </p>
                        </div>
                    )}

                    {/* Tags */}
                    {(review.tags && review.tags.length > 0) || (review.userTags && review.userTags.length > 0) ? (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {[...(review.tags || []), ...(review.userTags || [])].filter((t, i, a) => a.indexOf(t) === i).map((tag, i) => (
                                <span key={i} className="text-[10px] sm:text-xs font-bold text-[var(--lt-accent)] bg-[var(--lt-accent-soft)] px-2.5 py-1 rounded-lg border border-[var(--lt-accent-border)]">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>

                {/* 4. Footer: Interactive Bar */}
                <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between mt-auto relative z-10">
                    <div className="flex items-center gap-4">
                        <button
                            className={`flex items-center gap-1.5 transition-all group/btn ${liked ? 'text-pink-500 scale-105' : 'text-gray-400 hover:text-pink-500'} relative`}
                            onClick={handleLike}
                        >
                            <ThumbsUp className={`w-5 h-5 group-hover/btn:scale-110 transition-transform stroke-[1.5] ${liked ? 'fill-current' : ''}`} />
                            <span className="text-sm font-semibold relative overflow-hidden h-5 min-w-[12px] flex items-center justify-center">
                                {showAnimation ? (
                                    <span className="animate-[fade-in_0.3s_ease-out_forwards]">{likeCount > 0 ? likeCount : ''}</span>
                                ) : (
                                    <span>{likeCount > 0 ? likeCount : ''}</span>
                                )}
                            </span>
                            {showAnimation && (
                                <span className={`absolute -top-7 left-1/2 -translate-x-1/2 font-extrabold text-xs whitespace-nowrap pointer-events-none drop-shadow-md animate-[float-up_0.8s_cubic-bezier(0.2,0.8,0.2,1)_forwards] ${reactionAnimationTone === 'like' ? 'text-pink-500' : 'text-gray-400'}`}>
                                    {reactionAnimationText}
                                </span>
                            )}
                        </button>
                        <button
                            className={`flex items-center gap-1.5 transition-colors group/btn ${showComments ? 'text-[var(--lt-accent)]' : 'text-gray-400 hover:text-[var(--lt-accent)]'}`}
                            onClick={handleCommentToggle}
                        >
                            <MessageCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform stroke-[1.5]" />
                            <span className="text-sm font-semibold">{commentCount > 0 ? commentCount : ''}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            aria-label="Guardar en archivo"
                            className="text-gray-500 hover:text-[var(--lt-accent)] transition-colors p-1"
                            onClick={handleSaveClick}
                        >
                            <Bookmark className="w-5 h-5 stroke-[1.5]" />
                        </button>
                        <button
                            aria-label="Compartir reseña"
                            className="text-gray-500 hover:text-white transition-colors p-1"
                            onClick={handleShareClick}
                        >
                            <Share2 className="w-5 h-5 stroke-[1.5]" />
                        </button>
                    </div>
                </div>

                {/* Inline Comments Section */}
                {showComments && review.listId && review.id && (
                    <div className="border-t border-white/10 bg-[var(--lt-bg)]/50 p-4" onClick={e => e.stopPropagation()}>
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
                url={reviewShareUrl}
                text={`¡Mira esta reseña de ${review.itemName} en ${review.placeName}!`}
                review={review}
                shareEntity={{
                    type: 'review',
                    id: review.id,
                    title: review.itemName || 'Reseña',
                    subtitle: review.placeName || 'Lugar',
                    route: review.placeId && review.itemName ? reviewRoute : undefined,
                    url: reviewShareUrl,
                    imageUrl: review.photoUrl || review.placeMainImage,
                    badgeLabel: review.listName,
                    score: review.overallRating,
                    authorName: review.authorName,
                    authorPhoto: review.authorPhoto,
                    criteriaStats: buildCriteriaStats(review.scores, review.criteriaDefinition),
                    tags: review.userTags || review.tags,
                }}
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetId={review.id || ''}
                targetName={review.itemName || 'Reseña'}
                itemName={review.placeName}
                targetType="review"
                targetOwnerId={review.userId || review.authorId}
            />
        </>
    );
};
