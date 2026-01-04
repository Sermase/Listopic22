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

        const reviewRef = doc(db, 'lists', listId, 'reviews', reviewId);
        await deleteDoc(reviewRef);
    }
};
