import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, Timestamp, where } from 'firebase/firestore';
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

export const useLists = (filter: 'recent' | 'top_rated' = 'recent', userId?: string) => {
    const [lists, setLists] = useState<ListEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLists = async () => {
            setLoading(true); // Reset loading on filter change
            try {
                let q;
                const listsRef = collection(db, 'lists');

                if (userId) {
                    // Fetch lists for specific user
                    // Note: This requires composite index (userId + createdAt) usually, 
                    // but for now simple eq + sort might fail without index. 
                    // We'll try simple where(userId) and let client sort if index missing, 
                    // or just use the index link if Firestore complains.
                    q = query(
                        listsRef,
                        where('userId', '==', userId),
                        orderBy('createdAt', 'desc')
                    );
                } else if (filter === 'top_rated') {
                    q = query(
                        listsRef,
                        orderBy('avgScore', 'desc'),
                        limit(10)
                    );
                } else {
                    // Default: Recent
                    q = query(
                        listsRef,
                        orderBy('createdAt', 'desc'),
                        limit(10)
                    );
                }

                const querySnapshot = await getDocs(q);
                const fetchedLists = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ListEntity[];

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
