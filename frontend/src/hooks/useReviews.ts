/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { collection, collectionGroup, query, orderBy, limit, getDocs, where, startAfter } from 'firebase/firestore';
import { db } from '../firebase';
import { type ReviewEntity } from './useListDetails';
import { queryCache, getCachedDoc } from '../lib/queryCache';

// Helper to dedup IDs
const uniqueIds = (ids: (string | undefined)[]) => [...new Set(ids.filter((id): id is string => !!id))];

// Simplified batch fetcher
const fetchDocsBatch = async (collectionName: string, ids: string[]) => {
    if (!ids.length) return {};
    const docsMap: Record<string, any> = {};
    await Promise.all(ids.map(async (id) => {
        const data = await getCachedDoc(collectionName, id);
        if (data) docsMap[id] = data;
    }));
    return docsMap;
};

const enrichRawReviews = async (rawReviews: ReviewEntity[]): Promise<ReviewEntity[]> => {
    if (!rawReviews.length) return [];
    const listIds = uniqueIds(rawReviews.map(r => r.listId));
    const placeIds = uniqueIds(rawReviews.map(r => r.placeId));
    const userIds = uniqueIds(rawReviews.map(r => (r as any).userId as string || (r as any).authorId as string)); // 'authorId' legacy fallback

    const [listsMap, placesMap, usersMap] = await Promise.all([
        fetchDocsBatch('lists', listIds),
        fetchDocsBatch('places', placeIds),
        fetchDocsBatch('users', userIds)
    ]);

    return rawReviews.map(review => {
        const list = review.listId ? listsMap[review.listId] : null;
        const place = review.placeId ? placesMap[review.placeId] : null;
        const reviewAny = review as any;
        const userId = reviewAny.userId || reviewAny.authorId;
        const user = userId && usersMap[userId] ? usersMap[userId] : null;

        // Cast as any to access legacy 'establishmentName' if it exists on the record but not on the type yet
        const legacyReview = review as any;

        return {
            ...review,
            listName: list?.name,
            criteriaDefinition: list?.criteriaDefinition, // Critical for charts
            placeName: place?.name || legacyReview.establishmentName, // Legacy fallback
            placeMainImage: place?.mainImageUrl || place?.photos?.[0],
            placeAverageRating: place?.averageRating,
            placeAddress: place?.address,
            authorName: user?.username || user?.displayName || user?.name || legacyReview.authorName,
            authorPhoto: user?.photoUrl || user?.photoURL || legacyReview.authorPhoto,
            placeLat: place?.location?.latitude || place?.lat || place?.latitude || legacyReview.lat || legacyReview.placeLat,
            placeLng: place?.location?.longitude || place?.lng || place?.longitude || legacyReview.lng || legacyReview.placeLng,
            placeCity: place?.city || (place?.address ? place.address.split(',').pop()?.trim() : '')
        };
    }) as ReviewEntity[];
};

const fetchPublicReviewsFromListSubcollections = async (
    type: 'recent' | 'trending' | 'following',
    options: {
        pageLimit: number;
        followingIds?: string[];
    }
) => {
    const { pageLimit, followingIds } = options;

    let publicListIds: string[] = [];

    if (type === 'following' && Array.isArray(followingIds) && followingIds.length > 0) {
        // Fetching directly by 'in' chunks fails on this DB structure/rules.
        // Emulate the robust strategy from useFollowingFeed: gather a broad pool of candidate lists.
        const [publicListsSnap, followingListsSnap] = await Promise.all([
            getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(100))),
            // We use options.userId if available to fetch followingLists, else fallback to 0
            // Here we assume if followingIds is passed, the user is logged in, but we don't have user.uid directly here unless we pass it.
            // Let's rely mainly on a larger public lists snapshot and filtering.
            getDocs(query(collection(db, 'lists'), orderBy('createdAt', 'desc'), limit(150)))
        ]);

        const candidateDocs = [...publicListsSnap.docs, ...followingListsSnap.docs];
        // Dedup list docs
        const uniqueDocs = new Map();
        candidateDocs.forEach(d => uniqueDocs.set(d.id, d));

        publicListIds = Array.from(uniqueDocs.values())
            .filter(doc => {
                const data = doc.data();
                // Include lists owned by followed users OR lists where followed users are editors
                const isOwned = data.userId && followingIds.includes(data.userId);
                const isEdited = Array.isArray(data.editors) && data.editors.some((ed: string) => followingIds.includes(ed));
                // Ensure it's public unless the current user is checking (but we don't have currentUser auth context here easily)
                const isPubliclyVisible = data.isPublic !== false;

                return (isOwned || isEdited) && isPubliclyVisible;
            })
            .map(doc => doc.id);

        console.log(`[fetchPublic] Found ${publicListIds.length} candidate lists for followed users out of ${uniqueDocs.size} global.`);
    } else {
        const publicListsSnapshot = await getDocs(
            query(collection(db, 'lists'), where('isPublic', '==', true), limit(40))
        );
        publicListIds = publicListsSnapshot.docs.map((listDoc) => listDoc.id);
    }

    if (publicListIds.length === 0) {
        return [] as ReviewEntity[];
    }

    // Keep per-list reads bounded to avoid large fan-out on first paint.
    const perListLimit = type === 'following' ? 10 : 4;
    const listReviewSnapshots = await Promise.all(
        publicListIds.map((listId) =>
            getDocs(
                query(
                    collection(db, 'lists', listId, 'reviews'),
                    orderBy('createdAt', 'desc'),
                    limit(perListLimit)
                )
            ).then((snapshot) => ({ listId, snapshot }))
        )
    );

    let rawReviews = listReviewSnapshots.flatMap(({ listId, snapshot }) =>
        snapshot.docs.map((reviewDoc) => ({
            id: reviewDoc.id,
            ...(reviewDoc.data() as any),
            listId
        } as ReviewEntity))
    );

    if (type === 'following' && Array.isArray(followingIds) && followingIds.length > 0) {
        const followingSet = new Set(followingIds);
        rawReviews = rawReviews.filter((review) => {
            const authorId = (review as any).userId || (review as any).authorId || '';
            // Just double check that the review author is actually followed
            return typeof authorId === 'string' && followingSet.has(authorId);
        });
    }

    rawReviews.sort((a, b) => {

        const tA = (a.createdAt as any)?.seconds || 0;

        const tB = (b.createdAt as any)?.seconds || 0;
        return tB - tA;
    });

    if (type === 'trending') {
        rawReviews.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
    }

    return rawReviews.slice(0, pageLimit);
};

export interface UseReviewsOptions {
    type?: 'recent' | 'trending' | 'following';
    userId?: string;
    listId?: string;
    followingIds?: string[];
    limit?: number;
}

export const useReviews = (options: UseReviewsOptions | 'recent' | 'trending' | 'following' = 'recent') => {
    // Normalize options
    const { type = 'recent', userId, listId, followingIds, limit: customLimit } = typeof options === 'string' ? { type: options } : options;

    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const fetchReviews = async (isLoadMore = false) => {
        if (isLoadMore) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setReviews([]);
            setLastDoc(null);
            setHasMore(true);
        }

        console.log(`[useReviews] Fetching reviews. Type: ${type}, userId: ${userId}, listId: ${listId}, isLoadMore: ${isLoadMore}`);

        try {
            if (!isLoadMore && type !== 'following') {
                const cacheKey = `reviews:${type}:${userId || ''}:${listId || ''}`;
                const cached = queryCache.get<ReviewEntity[]>(cacheKey);
                if (cached) {
                    setReviews(cached);
                    setLoading(false);
                    setLoadingMore(false);
                    return;
                }
            }

            // Pre-check for following
            if (type === 'following') {
                if (!followingIds || followingIds.length === 0) {
                    setReviews([]);
                    setLoading(false);
                    setLoadingMore(false);
                    setHasMore(false);
                    return;
                }
            }

            let rawReviews: ReviewEntity[] = [];
            let newLastDoc = null;

            if (type === 'following' && followingIds && followingIds.length > 0) {
                // Use chunked collectionGroup queries directly.
                // Our new Firestore rules allow reading any review if resource.data.userId == auth.uid OR if the parent list is readable.
                // However, since we are querying for *other* users' reviews, the rule relies on `canReadListById(listId)`.
                // If a user's review is in a private list not shared with the current user, Firestore might block the ENTIRE query 
                // unless we filter by `isPublic` or something the rules can statically check. 
                // Since `isPublic` isn't on the review, the query might fail. Let's try it and catch errors.
                const chunkSize = 30;
                const chunks = [];
                for (let i = 0; i < followingIds.length; i += chunkSize) {
                    chunks.push(followingIds.slice(i, i + chunkSize));
                }

                const reviewsGrpRef = collectionGroup(db, 'reviews');

                const queryPromises = chunks.map(chunk => {
                    const constraints: any[] = [
                        where('userId', 'in', chunk),
                        orderBy('createdAt', 'desc')
                    ];

                    if (isLoadMore && lastDoc) {
                        constraints.push(startAfter(lastDoc));
                    }

                    constraints.push(limit(customLimit || 10)); // Fetch enough to fill the screen

                    return getDocs(query(reviewsGrpRef, ...constraints));
                });

                const snapshots = await Promise.all(queryPromises);

                let combinedReviewsWithDocs: { review: ReviewEntity, docSnap: any }[] = [];

                snapshots.forEach(span => {
                    span.docs.forEach(d => {
                        const data = d.data() as Record<string, unknown>;
                        let listId = data.listId as string;
                        if (!listId && d.ref.parent.parent) {
                            listId = d.ref.parent.parent.id;
                        }
                        combinedReviewsWithDocs.push({
                            review: { id: d.id, ...data, listId } as ReviewEntity,
                            docSnap: d
                        });
                    });
                });

                combinedReviewsWithDocs.sort((a, b) => {
                    const tA = (a.review.createdAt as any)?.seconds || 0;
                    const tB = (b.review.createdAt as any)?.seconds || 0;
                    return tB - tA;
                });

                // Deduping
                const uniqueRefs = new Map<string, { review: ReviewEntity, docSnap: any }>();
                combinedReviewsWithDocs.forEach(r => uniqueRefs.set(r.review.id, r));
                combinedReviewsWithDocs = Array.from(uniqueRefs.values());

                const pagedSlice = combinedReviewsWithDocs.slice(0, customLimit || 10);
                rawReviews = pagedSlice.map(item => item.review);

                if (pagedSlice.length > 0) {
                    setLastDoc(pagedSlice[pagedSlice.length - 1].docSnap);
                }

                setHasMore(pagedSlice.length >= (customLimit || 10));

            } else {
                if (!userId && !listId) {
                    // Explore/trending: single collectionGroup query, mucho más eficiente que fan-out.
                    // Requiere regla Firestore: allow read if resource.data.visibility == 'public'
                    const pageSize = customLimit || 20;
                    const snap = await getDocs(
                        query(
                            collectionGroup(db, 'reviews'),
                            where('visibility', '==', 'public'),
                            orderBy('createdAt', 'desc'),
                            limit(pageSize)
                        )
                    );
                    rawReviews = snap.docs.map(d => {
                        const data = d.data() as any;
                        const resolvedListId = data.listId || d.ref.parent.parent?.id;
                        return { id: d.id, ...data, listId: resolvedListId } as ReviewEntity;
                    });
                    setHasMore(false);
                } else {
                    // Standard Logic for filtered reads (profile/list specific).
                    // Use collectionGroup to include legacy subcollection reviews + new root reviews.
                    const reviewsRef = collectionGroup(db, 'reviews');

                    const constraints = [];

                    if (userId) constraints.push(where('userId', '==', userId));
                    if (listId) constraints.push(where('listId', '==', listId));

                    constraints.push(orderBy('createdAt', 'desc'));

                    // Pagination Logic
                    if (isLoadMore && lastDoc) {
                        constraints.push(startAfter(lastDoc));
                    }

                    // Initial request: customLimit or 6 items.
                    const pageSize = customLimit || 6;
                    constraints.push(limit(pageSize));

                    const q = query(reviewsRef, ...constraints);
                    const snapshot = await getDocs(q);

                    console.log(`[useReviews] Query success. Found ${snapshot.size} docs.`);

                    if (snapshot.docs.length < pageSize) {
                        setHasMore(false);
                    } else {
                        setHasMore(true);
                    }

                    if (snapshot.docs.length > 0) {
                        newLastDoc = snapshot.docs[snapshot.docs.length - 1];
                        setLastDoc(newLastDoc);
                    }

                    rawReviews = snapshot.docs.map(doc => {
                        const data = doc.data() as any;
                        let listId = data.listId;
                        // Fix: If listId is missing (legacy subcollection), retrieve from parent path
                        if (!listId && doc.ref.parent.parent) {
                            listId = doc.ref.parent.parent.id;
                        }
                        return {
                            id: doc.id,
                            ...data,
                            listId
                        };
                    }) as ReviewEntity[];
                }
            }

            // --- Enrich Data ---
            const enrichedReviews = await enrichRawReviews(rawReviews);

            if (type === 'trending') {
                enrichedReviews.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
            }

            if (!isLoadMore && type !== 'following') {
                const cacheKey = `reviews:${type}:${userId || ''}:${listId || ''}`;
                queryCache.set(cacheKey, enrichedReviews);
            }

            if (isLoadMore) {
                setReviews(prev => {
                    const existingIds = new Set(prev.map(r => r.id));
                    return [...prev, ...enrichedReviews.filter(r => !existingIds.has(r.id))];
                });
            } else {
                setReviews(enrichedReviews);
            }

        } catch (err: unknown) {
            console.error("Error fetching reviews:", err);

            if ((err as any)?.code === 'permission-denied') {
                try {
                    let fallbackReviews = await fetchPublicReviewsFromListSubcollections(type, {
                        pageLimit: customLimit || 20,
                        followingIds
                    });

                    if (userId) {
                        fallbackReviews = fallbackReviews.filter((review: any) =>
                            review.userId === userId || review.authorId === userId
                        );
                    }

                    if (listId) {
                        fallbackReviews = fallbackReviews.filter((review) => review.listId === listId);
                    }

                    const enrichedFallback = await enrichRawReviews(fallbackReviews);

                    if (type === 'trending') {
                        enrichedFallback.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
                    }

                    if (isLoadMore) {
                        setReviews(prev => {
                            const existingIds = new Set(prev.map(r => r.id));
                            return [...prev, ...enrichedFallback.filter(r => !existingIds.has(r.id))];
                        });
                    } else {
                        setReviews(enrichedFallback);
                    }

                    setHasMore(false);
                    setError(null);
                    return;
                } catch (fallbackError: unknown) {
                    console.error("Fallback fetching reviews failed:", fallbackError);
                }
            }

            setError((err as any)?.message || 'No se pudieron cargar las reseñas.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        // Reset and fetch when filters change
        fetchReviews(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, userId, listId, JSON.stringify(followingIds)]); // Deep compare followingIds

    return {
        reviews,
        loading,
        error,
        refresh: () => fetchReviews(false),
        fetchMore: () => fetchReviews(true),
        hasMore,
        loadingMore
    };
};
