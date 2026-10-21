import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Share2, Bookmark, ThumbsUp, ChevronDown } from 'lucide-react';
import { ReviewComments } from './ReviewComments';
import { UserAvatar } from './UserAvatar';
import { ReviewCardMenu } from './ReviewCardMenu';
import { doc, getDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { type ReviewEntity } from '../hooks/useListDetails';
import { useAuth } from '../context/AuthContext';
import { LazyShareModal as ShareModal } from './lazy';
import { SaveToArchiveModal } from './SaveToArchiveModal';
import { ReviewService } from '../services/ReviewService';
import { ReportModal } from './ReportModal';
import { Lightbox } from './Lightbox';
import { ProgressiveImage } from './ProgressiveImage';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { db } from '../firebase';
import { buildShareCriteriaGroups } from '../utils/shareCriteria';
import { buildPublicRouteUrl } from '../utils/publicUrl';
import { CategoryService } from '../services/CategoryService';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { scoreBadgeStyle, scoreTextColor } from '../lib/scoreScale';
import { closedStatusKind } from '../utils/placeStatus';
import { MarqueeText } from './ui/MarqueeText';
import { ExpandableText } from './ui/ExpandableText';

interface ReviewCardListProps {
    review: ReviewEntity;
    onDelete?: (id: string) => void;
    onEdit?: (review: ReviewEntity) => void;
    reactionConfig?: { like?: string; dislike?: string };
    placeClosedStatus?: string | null;
    /** Cuando la lista ya muestra el contexto del lugar (PlacePage), oculta nombre del lugar */
    hidePlaceName?: boolean;
}

const formatScore = (score: number | undefined) => {
    if (score === undefined || score === null) return '-';
    const rounded = Math.round(score * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

export const ReviewCardList: React.FC<ReviewCardListProps> = ({ review, onDelete, onEdit, reactionConfig, placeClosedStatus: placeClosedStatusProp, hidePlaceName }) => {
    const listNameRepeatsItem = Boolean(review.listName && review.itemName
        && review.listName.trim().toLowerCase() === review.itemName.trim().toLowerCase());
    const { showToast } = useToast();
    const confirm = useConfirm();
    // El estado del sitio en vivo manda sobre la copia guardada en la reseña.
    const closedKind = closedStatusKind(placeClosedStatusProp !== undefined ? placeClosedStatusProp : (review as any).placeClosedStatus);
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(review.reactionCounts?.like || 0);
    const [showComments, setShowComments] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [commentCount, setCommentCount] = useState(review.commentCount || 0);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [reactionAnimationText, setReactionAnimationText] = useState('');
    const [reactionAnimationTone, setReactionAnimationTone] = useState<'like' | 'dislike'>('like');
    const [showAnimation, setShowAnimation] = useState(false);

    useEffect(() => {
        setCommentCount(review.commentCount || 0);
    }, [review.commentCount]);

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

    const resolvedReactionConfig = reactionConfig || loadedReactionConfig || undefined;
    const likeText = resolvedReactionConfig?.like || '¡Me gusta!';
    const dislikeText = resolvedReactionConfig?.dislike || 'No me gusta';

    // Top criterios ponderables (3 mejores)
    const topCriteria = React.useMemo(() => {
        const defAny = review.criteriaDefinition as any;
        const scores = review.scores || {};
        const entries: Array<{ key: string; label: string; score: number; isPonderable: boolean }> = [];
        const getLabel = (key: string) => {
            if (Array.isArray(defAny)) {
                const found = defAny.find((d: any) => d?.id === key);
                return found?.label || key;
            }
            if (defAny && typeof defAny === 'object') return defAny[key]?.label || key;
            return key;
        };
        Object.keys(scores).forEach((key) => {
            const def = Array.isArray(defAny)
                ? defAny.find((entry: any) => entry?.id === key)
                : (defAny && typeof defAny === 'object' ? defAny[key] : null);
            const isPonderable = def ? (def.ponderable !== false && def.isPonderable !== false) : true;
            entries.push({ key, label: getLabel(key), score: Number(scores[key]) || 0, isPonderable });
        });
        return entries
            .filter((c) => c.isPonderable)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
    }, [review.criteriaDefinition, review.scores]);

    useEffect(() => {
        if (!user || !review.id || !review.listId) return;
        const checkLike = async () => {
            try {
                const reactionRef = doc(db, 'lists', review.listId, 'reviews', review.id, 'reactions', user.uid);
                const reactionSnap = await getDoc(reactionRef);
                if (reactionSnap.exists()) setLiked(true);
            } catch (e: any) {
                if (e.code !== 'permission-denied') {
                    console.warn('Error checking like status:', e);
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
        setLiked(newLiked);
        setLikeCount((prev) => Math.max(0, newLiked ? prev + 1 : prev - 1));
        setReactionAnimationText(newLiked ? likeText : dislikeText);
        setReactionAnimationTone(newLiked ? 'like' : 'dislike');
        setShowAnimation(false);
        window.setTimeout(() => setShowAnimation(true), 0);
        window.setTimeout(() => setShowAnimation(false), 1200);
        try {
            await ReviewService.toggleReaction(review.listId, review.id, user.uid);
        } catch (error) {
            console.error('Failed to toggle reaction', error);
            setLiked(!newLiked);
            setLikeCount((prev) => Math.max(0, !newLiked ? prev + 1 : prev - 1));
        }
    };

    const handleShareClick = (e: React.MouseEvent) => { e.stopPropagation(); setIsShareOpen(true); };
    const handleSaveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) {
            openAuthPrompt('guardar esta reseña');
            return;
        }
        setIsSaveModalOpen(true);
    };
    const handleEdit = (e: React.MouseEvent) => { e.stopPropagation(); if (onEdit) onEdit(review); };
    const handleReportClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) {
            openAuthPrompt('reportar esta reseña');
            return;
        }
        setShowReportModal(true);
    };
    const handleCommentToggle = (e: React.MouseEvent) => { e.stopPropagation(); setShowComments(!showComments); };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (await confirm({ title: '¿Eliminar esta reseña?', message: 'No se puede deshacer.', confirmLabel: 'Eliminar', destructive: true })) {
            setIsDeleting(true);
            try {
                await ReviewService.deleteReview(review.listId, review.id, queryClient);
                if (onDelete) onDelete(review.id);
            } catch (error) {
                console.error(error);
                showToast({ variant: 'error', message: 'No se pudo eliminar la reseña.' });
                setIsDeleting(false);
            }
        }
    };

    const handleCommentChange = (increment: number) => {
        setCommentCount((prev) => Math.max(0, prev + increment));
    };

    if (isDeleting) {
        return <div className="animate-pulse bg-[var(--lt-glass)] h-24 rounded-2xl border border-[var(--lt-border)]"></div>;
    }

    const photoUrls = (review.photoUrls && review.photoUrls.length > 0)
        ? review.photoUrls
        : (review.photoUrl ? [review.photoUrl] : []);
    const firstPhoto = photoUrls[0];
    const extraPhotos = photoUrls.length - 1;

    const formattedDate = (() => {
        const date = review.createdAt as any;
        let dateObj: Date | null = null;
        if (date && typeof date.toDate === 'function') dateObj = date.toDate();
        else if (date instanceof Date) dateObj = date;
        else if (typeof date === 'string' || typeof date === 'number') dateObj = new Date(date);
        return dateObj ? formatDistanceToNow(dateObj, { locale: es, addSuffix: false }) : 'Reciente';
    })();

    const reviewRoute = review.placeId && review.itemName
        ? `/group/${review.placeId}/${encodeURIComponent(review.itemName)}`
        : '/';
    const reviewShareUrl = buildPublicRouteUrl(reviewRoute);

    return (
        <>
            <article
                onClick={handleCardClick}
                className="group rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3.5 sm:p-4 cursor-pointer transition-colors hover:border-[var(--lt-accent-border)]"
            >
                {/* Header: avatar + nombre + contexto + fecha + menú */}
                <div className="flex items-center gap-3">
                    <Link
                        to={review.userId ? `/profile/${review.userId}` : '#'}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                    >
                        <UserAvatar
                            photoUrl={review.authorPhoto}
                            displayName={review.authorName}
                            userType={(review as any).authorUserType}
                            size="sm"
                        />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <Link
                                to={review.userId ? `/profile/${review.userId}` : '#'}
                                onClick={(e) => e.stopPropagation()}
                                className="min-w-0 text-sm font-bold text-[var(--lt-text)] hover:text-[var(--lt-accent)] transition-colors"
                            >
                                <MarqueeText text={review.authorName || 'Anónimo'} />
                            </Link>
                            <span className="shrink-0 text-[11px] text-[var(--lt-text-muted)]">· hace {formattedDate}</span>
                            {closedKind && (
                                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${closedKind === 'permanent'
                                    ? 'bg-[var(--lt-danger-soft)] border-[var(--lt-danger)]/30 text-[var(--lt-danger)]'
                                    : 'bg-[var(--lt-warning-soft)] border-[var(--lt-warning)]/30 text-[var(--lt-warning)]'
                                    }`}>
                                    {closedKind === 'permanent' ? 'Cerrado' : 'Cerrado temp.'}
                                </span>
                            )}
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--lt-text-muted)] truncate">
                            {/* «Patatas bravas · Patatas bravas»: si el elemento se llama como la Lista, una vez (con el enlace a la Lista). */}
                            {!listNameRepeatsItem && <span className="font-semibold text-[var(--lt-text)] truncate">{review.itemName}</span>}
                            {!hidePlaceName && review.placeName && (
                                <>
                                    {!listNameRepeatsItem && <span>·</span>}
                                    <Link
                                        to={`/place/${review.placeId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="hover:text-[var(--lt-accent)] truncate"
                                    >
                                        {review.placeName}
                                    </Link>
                                </>
                            )}
                            {review.listName && (
                                <>
                                    {(!listNameRepeatsItem || (!hidePlaceName && review.placeName)) && <span>·</span>}
                                    <Link
                                        to={review.listId ? `/list/${review.listId}` : '#'}
                                        onClick={(e) => e.stopPropagation()}
                                        className={`hover:text-[var(--lt-accent)] truncate ${listNameRepeatsItem ? 'font-semibold text-[var(--lt-text)]' : ''}`}
                                    >
                                        {review.listName}
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                    {review.overallRating !== undefined && (
                        <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 font-display text-sm font-bold shadow-lg"
                            style={scoreBadgeStyle(review.overallRating)}
                            aria-label={`Nota ${formatScore(review.overallRating)}`}
                        >
                            {formatScore(review.overallRating)}
                        </span>
                    )}
                    <ReviewCardMenu
                        isOwner={!!isOwner}
                        onShare={handleShareClick}
                        onSave={handleSaveClick}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onReport={handleReportClick}
                    />
                </div>

                {/* Cuerpo: foto + comentario */}
                {(firstPhoto || review.comment) && (
                    <div className="mt-3 flex gap-3">
                        {firstPhoto && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setLightboxIndex(0); }}
                                className="relative shrink-0 w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-[var(--lt-border)] bg-[var(--lt-card-strong)]"
                            >
                                <ProgressiveImage
                                    src={firstPhoto}
                                    alt={review.itemName || 'Foto'}
                                    containerClassName="absolute inset-0"
                                    className="w-full h-full object-cover"
                                />
                                {extraPhotos > 0 && (
                                    <span className="absolute bottom-1 right-1 rounded-md bg-black/65 text-[#fff] text-[10px] font-black px-1.5 py-0.5">
                                        +{extraPhotos}
                                    </span>
                                )}
                            </button>
                        )}
                        {review.comment && (
                            <ExpandableText text={review.comment} lines={4} className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--lt-text)]" />
                        )}
                    </div>
                )}

                {/* Notas: global + criterios resumidos */}
                {(topCriteria.length > 0 || review.tags?.length || review.userTags?.length) ? (
                    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                        {topCriteria.map((crit) => (
                            <span
                                key={crit.key}
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--lt-border)] bg-[var(--lt-card-strong-alpha)] px-2.5 py-1 text-[11px] font-semibold text-[var(--lt-text-muted)]"
                            >
                                <span className="truncate max-w-[7rem]">{crit.label}</span>
                                <span className="font-bold" style={{ color: scoreTextColor(crit.score) }}>{formatScore(crit.score)}</span>
                            </span>
                        ))}
                        {(review.tags?.length || review.userTags?.length) ? (
                            <span className="inline-flex items-center rounded-full bg-[var(--lt-accent-soft)] px-2 py-1 text-[10px] font-bold text-[var(--lt-accent)]">
                                #{[...(review.tags || []), ...(review.userTags || [])][0]}
                                {([...(review.tags || []), ...(review.userTags || [])].length > 1) ? ` +${[...(review.tags || []), ...(review.userTags || [])].length - 1}` : ''}
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {/* Footer: acciones */}
                <div className="mt-3 pt-3 border-t border-[var(--lt-border)] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleLike}
                            className={`relative inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${liked ? 'text-pink-500' : 'text-[var(--lt-text-muted)] hover:text-pink-500'}`}
                        >
                            <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                            {likeCount > 0 && <span>{likeCount}</span>}
                            {showAnimation && (
                                <span className={`absolute -top-6 left-1/2 -translate-x-1/2 font-extrabold text-xs whitespace-nowrap pointer-events-none drop-shadow-md animate-[float-up_0.8s_cubic-bezier(0.2,0.8,0.2,1)_forwards] ${reactionAnimationTone === 'like' ? 'text-pink-500' : 'text-gray-400'}`}>
                                    {reactionAnimationText}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={handleCommentToggle}
                            className={`inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${showComments ? 'text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-accent)]'}`}
                        >
                            <MessageCircle className="w-4 h-4" />
                            {commentCount > 0 && <span>{commentCount}</span>}
                            <ChevronDown className={`w-3 h-3 transition-transform ${showComments ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            aria-label="Guardar en una colección"
                            onClick={handleSaveClick}
                            className="text-[var(--lt-text-muted)] hover:text-[var(--lt-accent)] transition-colors p-1"
                        >
                            <Bookmark className="w-4 h-4" />
                        </button>
                        <button
                            aria-label="Compartir reseña"
                            onClick={handleShareClick}
                            className="text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] transition-colors p-1"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {showComments && review.listId && review.id && (
                    <div className="mt-3 border-t border-[var(--lt-border)] pt-3" onClick={(e) => e.stopPropagation()}>
                        <ReviewComments
                            listId={review.listId}
                            reviewId={review.id}
                            onCommentChange={handleCommentChange}
                        />
                    </div>
                )}
            </article>

            {/* Lightbox para fotos */}
            {photoUrls.length > 0 && (
                <Lightbox
                    isOpen={lightboxIndex !== null}
                    images={photoUrls}
                    initialIndex={lightboxIndex ?? 0}
                    onClose={() => setLightboxIndex(null)}
                />
            )}

            {/* Modales */}
            <SaveToArchiveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                item={{
                    itemId: review.id || '',
                    placeId: review.placeId || '',
                    name: review.itemName || review.placeName || '',
                    type: 'review',
                    route: review.placeId && review.itemName ? `/group/${review.placeId}/${encodeURIComponent(review.itemName)}` : '',
                    photoUrl: review.photoUrl,
                }}
            />

            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                title={`Compartir reseña`}
                url={reviewShareUrl}
                text={`¡Mira esta reseña de ${review.itemName} en ${review.placeName}!`}
                review={review}
                shareEntity={(() => {
                    const shareCriteria = buildShareCriteriaGroups(review.scores, review.criteriaDefinition);
                    return {
                    type: 'review',
                    id: review.id,
                    title: review.itemName || 'Reseña',
                    subtitle: review.placeName || 'Lugar',
                    description: review.comment,
                    route: review.placeId && review.itemName ? reviewRoute : undefined,
                    shareRoute: review.listId && review.id ? `/review/${review.listId}/${review.id}` : undefined,
                    url: reviewShareUrl,
                    imageUrl: review.photoUrl || review.placeMainImage,
                    imageUrls: [...(review.photoUrls || []), review.photoUrl, review.placeMainImage]
                        .filter((value): value is string => Boolean(value)),
                    badgeLabel: review.listName,
                    score: review.overallRating,
                    authorId: review.userId || review.authorId,
                    authorName: review.authorName,
                    authorPhoto: review.authorPhoto,
                    city: review.placeCity,
                    criteriaStats: shareCriteria.ponderable,
                    nonPonderableStats: shareCriteria.nonPonderable,
                    tags: review.userTags || review.tags,
                    };
                })()}
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
