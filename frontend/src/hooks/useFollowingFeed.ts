/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, limit, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import type { ReviewEntity } from './useListDetails';

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

                // 2. Build a bounded set of readable list IDs and query subcollections directly.
                const [publicListsSnap, followingListsSnap, ownListsSnap] = await Promise.all([
                    getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(50))),
                    getDocs(query(collection(db, 'users', user.uid, 'followingLists'), limit(50))),
                    getDocs(query(collection(db, 'lists'), where('userId', '==', user.uid), limit(30)))
                ]);

                const candidateListIds = Array.from(new Set([
                    ...publicListsSnap.docs.map((d) => d.id),
                    ...followingListsSnap.docs.map((d) => d.id),
                    ...ownListsSnap.docs.map((d) => d.id)
                ])).slice(0, 60);

                const followedSet = new Set(followedIds);
                const reviewsPerList = await Promise.all(candidateListIds.map(async (listId) => {
                    try {
                        const listReviewsSnap = await getDocs(
                            query(collection(db, 'lists', listId, 'reviews'), orderBy('createdAt', 'desc'), limit(10))
                        );
                        return listReviewsSnap.docs
                            .map((reviewDoc) => ({
                                id: reviewDoc.id,
                                ...(reviewDoc.data() as any),
                                listId
                            } as ReviewEntity))
                            .filter((review) => {
                                const authorId = review.userId || (review as any).authorId;
                                return typeof authorId === 'string' && followedSet.has(authorId);
                            });
                    } catch (error: any) {
                        if (error?.code !== 'permission-denied') {
                            console.warn(`Error loading following reviews for list ${listId}`, error);
                        }
                        return [] as ReviewEntity[];
                    }
                }));

                const dedupMap = new Map<string, ReviewEntity>();
                for (const listReviews of reviewsPerList) {
                    for (const review of listReviews) {
                        dedupMap.set(`${review.listId || 'unknown'}:${review.id}`, review);
                    }
                }
                const allReviews = Array.from(dedupMap.values());

                // 4. Enrich Data (Fetch Users, Lists, and Places)
                const userIds = Array.from(new Set(allReviews.map(r => r.userId).filter(Boolean))) as string[];
                const listIds = Array.from(new Set(allReviews.map(r => r.listId).filter(Boolean))) as string[];
                const placeIds = Array.from(new Set(allReviews.map(r => r.placeId).filter(Boolean))) as string[];

                const [userSnaps, listSnaps, placeSnaps] = await Promise.all([
                    Promise.all(userIds.map(async (uid) => {
                        try {
                            return await getDoc(doc(db, 'users', uid));
                        } catch {
                            return null;
                        }
                    })),
                    Promise.all(listIds.map(async (lid) => {
                        try {
                            return await getDoc(doc(db, 'lists', lid));
                        } catch {
                            return null;
                        }
                    })),
                    Promise.all(placeIds.map(async (pid) => {
                        try {
                            return await getDoc(doc(db, 'places', pid));
                        } catch {
                            return null;
                        }
                    }))
                ]);

                const userMap = new Map(userSnaps.filter((s): s is NonNullable<typeof s> => !!s).map(s => [s.id, s.data() as any]));
                const listMap = new Map(listSnaps.filter((s): s is NonNullable<typeof s> => !!s).map(s => [s.id, s.data() as any]));
                const placeMap = new Map(placeSnaps.filter((s): s is NonNullable<typeof s> => !!s).map(s => [s.id, s.data() as any]));

                const enrichedReviews = allReviews.map(r => {
                    const u = r.userId ? userMap.get(r.userId) : null;
                    const l = r.listId ? listMap.get(r.listId) : null;
                    const p = r.placeId ? placeMap.get(r.placeId) : null;
                    return {
                        ...r,
                        authorName: u?.username || u?.displayName || r.authorName || 'Usuario',
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
