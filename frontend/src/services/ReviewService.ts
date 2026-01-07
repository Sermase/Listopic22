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

        const rootRef = doc(db, 'reviews', reviewId);
        const rootSnap = await import('firebase/firestore').then(m => m.getDoc(rootRef));

        if (rootSnap.exists()) {
            await deleteDoc(rootRef);
        } else {
            // Fallback: Delete from legacy subcollection
            const subRef = doc(db, 'lists', listId, 'reviews', reviewId);
            await deleteDoc(subRef);
        }
    }
};
