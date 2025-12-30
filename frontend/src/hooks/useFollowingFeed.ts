import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, limit, collectionGroup, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import type { ReviewEntity } from './useListDetails';

// Helper to chunk array
const chunkArray = (arr: string[], size: number) => {
    const res = [];
    for (let i = 0; i < arr.length; i += size) {
        res.push(arr.slice(i, i + size));
    }
    return res;
};

export const useFollowingFeed = () => {
    const { user } = useAuth();
    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [empty, setEmpty] = useState(false);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            setReviews([]);
            return;
        }

        const fetchFeed = async () => {
            setLoading(true);
            try {
                // 1. Get Following IDs
                const followingRef = collection(db, 'users', user.uid, 'following');
                const followingSnap = await getDocs(followingRef);

                const followedIds = followingSnap.docs.map(doc => doc.id);

                if (followedIds.length === 0) {
                    setEmpty(true);
                    setReviews([]);
                    setLoading(false);
                    return;
                }

                // 2. Chunk queries (Firestore 'in' limit 10)
                const chunks = chunkArray(followedIds, 10);
                const queries = chunks.map(chunk =>
                    query(collectionGroup(db, 'reviews'), where('userId', 'in', chunk), limit(20)) // Limit per chunk
                );

                const snapshots = await Promise.all(queries.map(q => getDocs(q)));

                let allReviews = snapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as ReviewEntity)));

                // 4. Enrich Data (Fetch Users, Lists, and Places)
                const userIds = Array.from(new Set(allReviews.map(r => r.userId).filter(Boolean))) as string[];
                const listIds = Array.from(new Set(allReviews.map(r => r.listId).filter(Boolean))) as string[];
                const placeIds = Array.from(new Set(allReviews.map(r => r.placeId).filter(Boolean))) as string[];

                const [userSnaps, listSnaps, placeSnaps] = await Promise.all([
                    Promise.all(userIds.map(uid => getDoc(doc(db, 'users', uid)))),
                    Promise.all(listIds.map(lid => getDoc(doc(db, 'lists', lid)))),
                    Promise.all(placeIds.map(pid => getDoc(doc(db, 'places', pid))))
                ]);

                const userMap = new Map(userSnaps.map(s => [s.id, s.data() as any]));
                const listMap = new Map(listSnaps.map(s => [s.id, s.data() as any]));
                const placeMap = new Map(placeSnaps.map(s => [s.id, s.data() as any]));

                const enrichedReviews = allReviews.map(r => {
                    const u = r.userId ? userMap.get(r.userId) : null;
                    const l = r.listId ? listMap.get(r.listId) : null;
                    const p = r.placeId ? placeMap.get(r.placeId) : null;
                    return {
                        ...r,
                        authorName: u?.displayName || u?.username || r.authorName || 'Usuario',
                        authorPhoto: u?.photoUrl || r.authorPhoto,
                        criteriaDefinition: l?.criteriaDefinition || r.criteriaDefinition,
                        listName: l?.name || r.listName,
                        placeName: p?.name || r.placeName || 'Lugar desconocido'
                    };
                });

                // 3. Sort by createdAt desc (Moved after enrichment or before, doesn't matter, but let's keep logic)
                enrichedReviews.sort((a: any, b: any) => {
                    const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                    const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                    return tB - tA;
                });

                setReviews(enrichedReviews.slice(0, 50)); // Global limit
                setEmpty(enrichedReviews.length === 0);

            } catch (error) {
                console.error("Error fetching following feed:", error);
                setReviews([]);
            } finally {
                setLoading(false);
            }
        };

        fetchFeed();
    }, [user]);

    return { reviews, loading, empty };
};
