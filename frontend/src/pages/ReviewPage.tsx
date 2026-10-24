import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { db } from '../firebase';
import { ReviewCard } from '../components/ReviewCard';
import { Skeleton } from '../components/Skeleton';
import type { ReviewEntity } from '../hooks/useListDetails';

async function loadReview(listId: string, reviewId: string): Promise<ReviewEntity | null> {
    const [reviewSnap, listSnap] = await Promise.all([
        getDoc(doc(db, 'lists', listId, 'reviews', reviewId)),
        getDoc(doc(db, 'lists', listId)),
    ]);
    if (!reviewSnap.exists()) return null;
    const review = reviewSnap.data() as Omit<ReviewEntity, 'id' | 'listId'>;
    const list = listSnap.exists() ? listSnap.data() : {};
    const userId = review.userId || review.authorId;
    const [placeSnap, profileSnap] = await Promise.all([
        review.placeId ? getDoc(doc(db, 'places', review.placeId)).catch(() => null) : null,
        userId ? getDoc(doc(db, 'publicProfiles', userId)).catch(() => null) : null,
    ]);
    const place = placeSnap?.exists() ? placeSnap.data() : null;
    const profile = profileSnap?.exists() ? profileSnap.data() : null;
    return {
        ...review,
        id: reviewSnap.id,
        listId,
        listName: list.name,
        criteriaDefinition: list.criteriaDefinition,
        placeName: place?.name || review.placeName,
        placeMainImage: place?.userPhotoUrl || place?.mainImageUrl || undefined,
        authorName: profile?.username || profile?.displayName || review.authorName,
        authorPhoto: profile?.photoUrl || profile?.photoURL || review.authorPhoto,
    } as ReviewEntity;
}

/** Una reseña sola: texto entero, todas las notas y sus comentarios. */
export const ReviewPage: React.FC = () => {
    const { listId = '', reviewId = '' } = useParams<{ listId: string; reviewId: string }>();
    const navigate = useNavigate();
    const { data: review, isLoading, isError } = useQuery({
        queryKey: ['review-page', listId, reviewId],
        queryFn: () => loadReview(listId, reviewId),
        enabled: Boolean(listId && reviewId),
    });

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] px-4 pb-24 pt-safe-24">
            <div className="mx-auto max-w-xl space-y-4 pt-4">
                <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                    <ArrowLeft className="h-4 w-4" /> Volver
                </button>

                {isLoading && <Skeleton className="h-96 w-full rounded-3xl" />}

                {!isLoading && (isError || !review) && (
                    <div className="rounded-2xl border border-dashed border-[var(--lt-border-strong)] p-8 text-center">
                        <p className="text-sm font-bold text-[var(--lt-text)]">Esta reseña ya no está disponible</p>
                        <Link to="/" className="mt-3 inline-block text-sm font-bold text-[var(--lt-accent)]">Ir al inicio</Link>
                    </div>
                )}

                {review && (
                    <>
                        <ReviewCard review={review} expanded onDelete={() => navigate(-1)} />
                        {review.placeId && review.itemName && (
                            <Link
                                to={`/group/${review.placeId}/${encodeURIComponent(review.itemName)}`}
                                className="flex items-center justify-between rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-4 py-3 text-sm font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]"
                            >
                                Ver {review.itemName} y el resto de reseñas
                                <ChevronRight className="h-4 w-4 text-[var(--lt-text-muted)]" />
                            </Link>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
