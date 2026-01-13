import { db } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';

export const ReviewService = {
    /**
     * Deletes a review from a specific list.
     * Note: Backend triggers (functions/index.js) will automatically 
     * update aggregate counts (reviewsCount, etc.) on the list, place, and user.
     */
    deleteReview: async (listId: string, reviewId: string): Promise<void> => {
        if (!listId || !reviewId) {
            throw new Error("Missing listId or reviewId for deletion");
        }

        try {
            const rootRef = doc(db, 'reviews', reviewId);
            const rootSnap = await import('firebase/firestore').then(m => m.getDoc(rootRef));

            let reviewData: any = {};
            let refToDelete = rootRef;

            if (rootSnap.exists()) {
                reviewData = rootSnap.data();
            } else {
                // Fallback: Delete from legacy subcollection
                const subRef = doc(db, 'lists', listId, 'reviews', reviewId);
                const subSnap = await import('firebase/firestore').then(m => m.getDoc(subRef));
                if (subSnap.exists()) {
                    reviewData = subSnap.data();
                    refToDelete = subRef;
                } else {
                    console.warn(`Review ${reviewId} not found for deletion.`);
                    return;
                }
            }

            // Perform Deletion
            const { updateDoc, increment } = await import('firebase/firestore');
            await deleteDoc(refToDelete);

            // Update Counters (Best effort)
            const updates = [];

            // 1. List Counters
            if (listId) {
                const listRef = doc(db, 'lists', listId);
                updates.push(updateDoc(listRef, {
                    reviewCount: increment(-1),
                    itemCount: increment(-1),
                    updatedAt: new Date() // Use client date or serverTimestamp via import
                }).catch(e => console.warn("Failed to decrement list counters", e)));
            }

            // 2. User Counters
            const userId = reviewData.userId || reviewData.authorId;
            if (userId) {
                const userRef = doc(db, 'users', userId);
                updates.push(updateDoc(userRef, {
                    reviewsCount: increment(-1)
                }).catch(e => console.warn("Failed to decrement user counters", e)));
            }

            // 3. Place Counters
            const placeId = reviewData.placeId;
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
