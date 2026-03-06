import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export const useLike = (listId: string, initialCount: number = 0) => {
    const { user } = useAuth();
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(initialCount);
    const [loading, setLoading] = useState(false);

    // Check if user has liked (followed) this list
    useEffect(() => {
        if (!user || !listId) {
            setIsLiked(false);
            return;
        }

        const checkLike = async () => {
            try {
                // Now using 'followingLists' as the source of truth for "Liking/Following"
                const docRef = doc(db, 'users', user.uid, 'followingLists', listId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setIsLiked(true);
                }
            } catch (err: unknown) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((err as any).code !== 'permission-denied') {
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

        setIsLiked(!isLiked);
        setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
        setLoading(true);

        try {
            const listRef = doc(db, 'lists', listId); // Needed only for reading data if falling back
            const followingListRef = doc(db, 'users', user.uid, 'followingLists', listId);

            // Backend Trigger 'onListFollowingWrite' in 'social.js' handles:
            // 1. Updating user.followingListsCount
            // 2. Updating list.likes and list.followersCount

            if (previousState) {
                // Unlike (Unfollow)
                await deleteDoc(followingListRef);
            } else {
                // Like (Follow)
                // We need to fetch list basics to store in the following doc for the profile feed
                // Ideally this data is passed in, but fetching here is safe (public list read)
                const listSnap = await getDoc(listRef);
                const listData = listSnap.data() || {};

                await setDoc(followingListRef, {
                    listId,
                    name: listData.name || 'Lista sin nombre',
                    photoUrl: listData.photoUrl || '',
                    itemCount: listData.itemCount || 0,
                    ownerName: listData.ownerName || listData.authorName || 'Anónimo',
                    followedAt: serverTimestamp()
                });
            }
        } catch (err) {
            console.error("Error toggling like:", err);
            // Revert on error
            setIsLiked(previousState);
            setLikeCount(prev => previousState ? prev + 1 : prev - 1);
        } finally {
            setLoading(false);
        }
    };

    return { isLiked, likeCount, toggleLike, loading };
};
