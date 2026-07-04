import { db } from '../firebase';
import { doc, deleteDoc, getDoc, updateDoc, setDoc, increment, serverTimestamp, type DocumentData, type DocumentReference } from 'firebase/firestore';
import type { QueryClient } from '@tanstack/react-query';

interface ReviewCachePage {
    reviews?: Array<{ id?: string }>;
    [key: string]: unknown;
}

interface ReviewInfiniteCache {
    pages?: ReviewCachePage[];
    [key: string]: unknown;
}

const asReviewData = (value: unknown): Record<string, unknown> => {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
};

export const ReviewService = {
    /**
     * Deletes a review from a specific list.
     * Note: Backend triggers (functions/index.js) will automatically 
     * update aggregate counts (reviewsCount, etc.) on the list, place, and user.
     */
    deleteReview: async (listId: string | undefined | null, reviewId: string, queryClient?: QueryClient): Promise<void> => {
        if (!reviewId) {
            throw new Error("Missing reviewId for deletion");
        }

        try {
            // Las reseñas viven únicamente en lists/{listId}/reviews
            // (la colección raíz legacy está vacía — ver docs/REVIEWS-MIGRATION.md).
            if (!listId) {
                console.warn(`[deleteReview] Missing listId for review ${reviewId}, nothing to delete.`);
                return;
            }

            const canonicalRef: DocumentReference<DocumentData> = doc(db, 'lists', listId, 'reviews', reviewId);
            const canonicalSnap = await getDoc(canonicalRef);
            if (!canonicalSnap.exists()) {
                console.warn(`Review ${reviewId} not found for deletion.`);
                return;
            }

            const resolvedReviewData = asReviewData(canonicalSnap.data());
            await deleteDoc(canonicalRef);

            // Update Counters (Best effort)
            const updates = [];

            // Resolve List ID
            const finalListId = listId || (typeof resolvedReviewData.listId === 'string' ? resolvedReviewData.listId : undefined);
            const sublistId = typeof resolvedReviewData.sublistId === 'string' ? resolvedReviewData.sublistId : null;

            // 1. List Counters
            if (finalListId) {
                const listRef = doc(db, 'lists', finalListId);
                updates.push(updateDoc(listRef, {
                    reviewCount: increment(-1),
                    itemCount: increment(-1),
                    updatedAt: serverTimestamp()
                }).catch(e => console.warn("Failed to decrement list counters", e)));
            }
            if (sublistId && sublistId !== finalListId) {
                const sublistRef = doc(db, 'lists', sublistId);
                updates.push(updateDoc(sublistRef, {
                    reviewCount: increment(-1),
                    itemCount: increment(-1),
                    updatedAt: serverTimestamp()
                }).catch(e => console.warn("Failed to decrement sublist counters", e)));
            }

            // 2. User Counters
            const userId = typeof resolvedReviewData.userId === 'string'
                ? resolvedReviewData.userId
                : (typeof resolvedReviewData.authorId === 'string' ? resolvedReviewData.authorId : undefined);
            if (userId) {
                const userRef = doc(db, 'users', userId);
                updates.push(updateDoc(userRef, {
                    reviewsCount: increment(-1)
                }).catch(e => console.warn("Failed to decrement user counters", e)));
            }

            // 3. Place Counters
            const placeId = typeof resolvedReviewData.placeId === 'string' ? resolvedReviewData.placeId : undefined;
            if (placeId) {
                const placeRef = doc(db, 'places', placeId);
                updates.push(updateDoc(placeRef, {
                    reviewsCount: increment(-1)
                }).catch(e => console.warn("Failed to decrement place counters", e)));
            }

            await Promise.all(updates);

            if (queryClient) {
                // Remove the deleted review from all cached review pages immediately
                // (avoids refetch race with Firestore cache returning stale data)
                queryClient.setQueriesData({ queryKey: ['reviews'] }, (old: unknown) => {
                    const cache = old as ReviewInfiniteCache | undefined;
                    if (!cache?.pages) return old;
                    return {
                        ...cache,
                        pages: cache.pages.map((page) => ({
                            ...page,
                            reviews: (page.reviews || []).filter((review) => review.id !== reviewId),
                        })),
                    };
                });
                // Mark list/place details as stale — they'll refetch on next access
                if (finalListId) queryClient.invalidateQueries({ queryKey: ['listDetails', finalListId], refetchType: 'none' });
                if (placeId) queryClient.invalidateQueries({ queryKey: ['placeDetails', placeId], refetchType: 'none' });
                if (finalListId) queryClient.invalidateQueries({ queryKey: ['doc', 'lists', finalListId], refetchType: 'none' });
            }

        } catch (error) {
            console.error("Error in deleteReview service:", error);
            throw error;
        }
    },

    /**
     * Toggles a reaction (like) for a review.
     * Writes to: reviews/{reviewId}/reactions/{userId}
     * Structure: { reaction: 'like', userId: string, createdAt: timestamp }
     */
    toggleReaction: async (listId: string, reviewId: string, userId: string): Promise<boolean> => {
        if (!listId || !reviewId || !userId) throw new Error("Missing params");

        const reactionRef = doc(db, 'lists', listId, 'reviews', reviewId, 'reactions', userId);
        const reactionSnap = await getDoc(reactionRef);

        if (reactionSnap.exists()) {
            await deleteDoc(reactionRef);
            return false; // Removed
        } else {
            await setDoc(reactionRef, {
                reaction: 'like',
                userId,
                createdAt: serverTimestamp()
            });
            return true; // Added
        }
    }
};
