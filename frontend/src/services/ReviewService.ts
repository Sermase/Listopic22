import { db } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';

export const ReviewService = {
    /**
     * Deletes a review from a specific list.
     * Note: Backend triggers (functions/index.js) will automatically 
     * update aggregate counts (reviewsCount, etc.) on the list, place, and user.
     */
    deleteReview: async (listId: string | undefined | null, reviewId: string): Promise<void> => {
        if (!reviewId) {
            throw new Error("Missing reviewId for deletion");
        }

        try {
            const { getDoc, updateDoc, increment, serverTimestamp } = await import('firebase/firestore');
            const refsToDelete: any[] = [];
            let reviewData: any = null;

            if (listId) {
                const canonicalRef = doc(db, 'lists', listId, 'reviews', reviewId);
                const canonicalSnap = await getDoc(canonicalRef);
                if (canonicalSnap.exists()) {
                    refsToDelete.push(canonicalRef);
                    reviewData = canonicalSnap.data();
                }
            }

            const rootRef = doc(db, 'reviews', reviewId);
            const rootSnap = await getDoc(rootRef);
            if (rootSnap.exists()) {
                refsToDelete.push(rootRef);
                if (!reviewData) reviewData = rootSnap.data();

                const rootListId = rootSnap.data().listId;
                if (rootListId && (!listId || rootListId !== listId)) {
                    const movedCanonicalRef = doc(db, 'lists', rootListId, 'reviews', reviewId);
                    const movedCanonicalSnap = await getDoc(movedCanonicalRef);
                    if (movedCanonicalSnap.exists()) {
                        refsToDelete.push(movedCanonicalRef);
                        reviewData = movedCanonicalSnap.data();
                    }
                }
            }

            if (refsToDelete.length === 0) {
                console.warn(`Review ${reviewId} not found for deletion.`);
                return;
            }

            const uniqueRefs = Array.from(new Map(refsToDelete.map((ref) => [ref.path, ref])).values());
            await Promise.all(uniqueRefs.map((ref) => deleteDoc(ref)));
            const resolvedReviewData = reviewData || {};

            // Update Counters (Best effort)
            const updates = [];

            // Resolve List ID
            const finalListId = listId || resolvedReviewData.listId;
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
            const userId = resolvedReviewData.userId || resolvedReviewData.authorId;
            if (userId) {
                const userRef = doc(db, 'users', userId);
                updates.push(updateDoc(userRef, {
                    reviewsCount: increment(-1)
                }).catch(e => console.warn("Failed to decrement user counters", e)));
            }

            // 3. Place Counters
            const placeId = resolvedReviewData.placeId;
            if (placeId) {
                const placeRef = doc(db, 'places', placeId);
                updates.push(updateDoc(placeRef, {
                    reviewsCount: increment(-1)
                }).catch(e => console.warn("Failed to decrement place counters", e)));
            }

            await Promise.all(updates);

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
        const reactionSnap = await import('firebase/firestore').then(m => m.getDoc(reactionRef));

        if (reactionSnap.exists()) {
            await deleteDoc(reactionRef);
            return false; // Removed
        } else {
            const { setDoc, serverTimestamp } = await import('firebase/firestore');
            await setDoc(reactionRef, {
                reaction: 'like',
                userId,
                createdAt: serverTimestamp()
            });
            return true; // Added
        }
    }
};
