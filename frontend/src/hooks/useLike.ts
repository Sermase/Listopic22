import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export const useLike = (listId: string, initialCount: number = 0) => {
    const { user } = useAuth();
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(initialCount);
    const [loading, setLoading] = useState(false);

    // Check if user has liked this list
    useEffect(() => {
        if (!user || !listId) {
            setIsLiked(false);
            return;
        }

        const checkLike = async () => {
            try {
                // Attempt to use root collection 'list_likes' pattern: list_likes/{listId}_{userId}
                const docRef = doc(db, 'list_likes', `${listId}_${user.uid}`);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setIsLiked(true);
                }
            } catch (err: any) {
                if (err.code === 'permission-denied') {
                    // Silent fail or warning for permission issues (common if rules are strict)
                    // Silent fail for permission issues to avoid console spam
                    // console.debug(`Permission denied checking like status for list ${listId}.`);
                } else {
                    console.error("Error checking like status:", err);
                }
            }
        };

        checkLike();
    }, [listId, user]);

    const toggleLike = async () => {
        if (!user) return; // Or show login prompt

        // Optimistic update
        const previousState = isLiked;
        const previousCount = likeCount;

        setIsLiked(!isLiked);
        setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
        setLoading(true);

        try {
            // Use root collection 'list_likes' pattern
            const likeRef = doc(db, 'list_likes', `${listId}_${user.uid}`);
            const listRef = doc(db, 'lists', listId);

            if (previousState) {
                // Unlike
                await deleteDoc(likeRef);
                await updateDoc(listRef, { likes: increment(-1) });
            } else {
                // Like
                await setDoc(likeRef, {
                    listId, // Store listId for querying likes by list if needed
                    userId: user.uid,
                    createdAt: serverTimestamp()
                });
                await updateDoc(listRef, { likes: increment(1) });
            }
        } catch (err) {
            console.error("Error toggling like:", err);
            // Revert on error
            setIsLiked(previousState);
            setLikeCount(previousCount);
        } finally {
            setLoading(false);
        }
    };

    return { isLiked, likeCount, toggleLike, loading };
};
