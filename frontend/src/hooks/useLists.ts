import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, Timestamp, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface ListEntity {
    id: string;
    name: string;
    description?: string;
    userId: string;
    authorName?: string;
    photoUrl?: string; // List cover or icon
    mainImageUrl?: string; // Legacy/DB field
    createdAt: Timestamp;
    updatedAt?: Timestamp;

    // Visibility
    isPublic: boolean;

    // Counters
    itemCount?: number; // Keep for compatibility if needed
    groupedItemsCount: number;
    viewCount?: number;
    likes?: number;
    followersCount: number;
    commentsCount: number;
    reviewCount: number;

    averageRating: number;
    avgScore?: number; // Legacy or alternative name

    // Location for filtering
    lat?: number;
    lng?: number;

    // Configuration
    availableTags: string[];
    fixedTags?: string[];
    criteriaDefinition?: Record<string, {
        label: string;
        labelMin?: string;
        labelMax?: string;
        min: number;
        max: number;
        step: number;
        type: string;
        ponderable: boolean;
    }>;

    // Stats
    criteriaAverages: Record<string, number>;
    criteriaAveragesUpdatedAt?: Timestamp;
    reactions: Record<string, any>;
}

export const useLists = (filter: 'recent' | 'top_rated' | 'liked' = 'recent', userId?: string) => {
    const [lists, setLists] = useState<ListEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLists = async () => {
            setLoading(true);
            try {
                let q;
                const listsRef = collection(db, 'lists');

                // Case: Fetch Liked/Followed Lists
                if (filter === 'liked' && userId) {
                    const likesRef = collection(db, 'list_likes');
                    // Query likes by this user
                    const likesQ = query(likesRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
                    const likesSnap = await getDocs(likesQ);

                    if (likesSnap.empty) {
                        setLists([]);
                        setLoading(false);
                        return;
                    }

                    const listIds = likesSnap.docs.map(d => d.data().listId);

                    // Fetch lists in parallel with error handling
                    const listPromises = listIds.map(async (id) => {
                        try {
                            const snap = await getDoc(doc(db, 'lists', id));
                            return snap;
                        } catch (e) {
                            console.warn(`Failed to fetch liked list ${id}`, e);
                            return null;
                        }
                    });
                    const listSnaps = await Promise.all(listPromises);

                    const fetchedLists = listSnaps
                        .filter(snap => snap.exists())
                        .map(snap => ({ id: snap.id, ...snap.data() })) as ListEntity[];

                    setLists(fetchedLists);
                    return; // Done
                }

                // Normal Cases
                // Strategy: Fetch a safe batch ordered by createdAt (indexed), then filter/sort in memory.
                // This avoids "Missing Index" errors for avgScore/averageRating and ensures data visibility.
                if (userId) {
                    q = query(listsRef, where('userId', '==', userId), where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(50));
                } else {
                    q = query(listsRef, where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(50));
                }

                const querySnapshot = await getDocs(q);
                let fetchedLists = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ListEntity[];

                // Client-side Sort for 'top_rated'
                if (filter === 'top_rated') {
                    fetchedLists.sort((a, b) => {
                        const scoreA = a.averageRating || (a as any).avgScore || 0;
                        const scoreB = b.averageRating || (b as any).avgScore || 0;
                        return scoreB - scoreA;
                    });
                }

                setLists(fetchedLists);
            } catch (err: any) {
                console.error("Error fetching lists:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchLists();
    }, [filter, userId]);

    return { lists, loading, error };
};
