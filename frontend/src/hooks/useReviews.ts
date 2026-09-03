/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { collection, collectionGroup, query, orderBy, limit, getDocs, where, startAfter, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { type ReviewEntity } from './useListDetails';
import { firstUsablePlaceImage } from '../utils/placeImages';
import { getCachedDocs } from '../lib/queryCache';
import { fetchUserReviewsFromAccessibleLists } from '../lib/reviewFallbacks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uniqueIds = (ids: (string | undefined)[]) => [...new Set(ids.filter((id): id is string => !!id))];

const fetchDocsBatch = async (collectionName: string, ids: string[]) => {
    if (!ids.length) return {};
    return getCachedDocs(collectionName, ids, {
        warnLabel: `useReviews: failed loading ${collectionName} batch`,
    }) as Promise<Record<string, any>>;
};

const enrichRawReviews = async (rawReviews: ReviewEntity[]): Promise<ReviewEntity[]> => {
    if (!rawReviews.length) return [];
    const listIds = uniqueIds(rawReviews.map(r => r.listId));
    const placeIds = uniqueIds(rawReviews.map(r => r.placeId));
    const userIds = uniqueIds(rawReviews.map(r => (r as any).userId || (r as any).authorId));

    const [listsMap, placesMap, usersMap] = await Promise.all([
        fetchDocsBatch('lists', listIds),
        fetchDocsBatch('places', placeIds),
        fetchDocsBatch('publicProfiles', userIds),
    ]);

    return rawReviews.map(review => {
        const list = review.listId ? listsMap[review.listId] : null;
        const place = review.placeId ? placesMap[review.placeId] : null;
        const reviewAny = review as any;
        const userId = reviewAny.userId || reviewAny.authorId;
        const user = userId && usersMap[userId] ? usersMap[userId] : null;

        return {
            ...review,
            listName: list?.name,
            categoryId: reviewAny.categoryId || list?.categoryId,
            criteriaDefinition: list?.criteriaDefinition,
            placeName: place?.name || reviewAny.establishmentName,
            placeMainImage: firstUsablePlaceImage(place?.userPhotoUrl, place?.mainImageUrl, place?.photos),
            placeAverageRating: place?.averageRating,
            placeAddress: place?.address,
            authorName: user?.username || user?.displayName || user?.name || reviewAny.authorName,
            authorPhoto: user?.photoUrl || user?.photoURL || reviewAny.authorPhoto,
            placeLat: place?.location?.latitude || place?.lat || reviewAny.lat || reviewAny.placeLat,
            placeLng: place?.location?.longitude || place?.lng || reviewAny.lng || reviewAny.placeLng,
            placeCity: place?.city || (place?.address ? place.address.split(',').pop()?.trim() : ''),
        };
    }) as ReviewEntity[];
};

const fetchPublicReviewsFromListSubcollections = async (
    type: 'recent' | 'trending' | 'following',
    options: { pageLimit: number; followingIds?: string[]; userId?: string; listId?: string }
) => {
    const { pageLimit, followingIds, userId, listId } = options;
    let publicListIds: string[] = [];

    if (listId) {
        publicListIds = [listId];
    } else if (type === 'following' && Array.isArray(followingIds) && followingIds.length > 0) {
        const [publicListsSnap, recentListsSnap] = await Promise.all([
            getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(100))),
            getDocs(query(collection(db, 'lists'), orderBy('createdAt', 'desc'), limit(150))),
        ]);
        const uniqueDocs = new Map();
        [...publicListsSnap.docs, ...recentListsSnap.docs].forEach(d => uniqueDocs.set(d.id, d));
        publicListIds = Array.from(uniqueDocs.values())
            .filter(d => {
                const data = d.data();
                const isOwned = data.userId && followingIds.includes(data.userId);
                const isEdited = Array.isArray(data.editors) && data.editors.some((ed: string) => followingIds.includes(ed));
                return (isOwned || isEdited) && data.isPublic !== false;
            })
            .map(d => d.id);
    } else if (userId) {
        const [ownedPublicSnap, broadPublicSnap] = await Promise.all([
            getDocs(query(collection(db, 'lists'), where('userId', '==', userId), where('isPublic', '==', true), limit(120))),
            getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(220))),
        ]);
        const uniqueDocs = new Map<string, unknown>();
        [...ownedPublicSnap.docs, ...broadPublicSnap.docs].forEach(d => uniqueDocs.set(d.id, d));
        publicListIds = Array.from(uniqueDocs.keys());
    } else {
        const snap = await getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(40)));
        publicListIds = snap.docs.map(d => d.id);
    }

    if (publicListIds.length === 0) return [] as ReviewEntity[];

    const perListLimit = userId ? 30 : type === 'following' ? 10 : 4;
    const listReviewSnaps = await Promise.all(
        publicListIds.map(listId =>
            getDocs(query(
                collection(db, 'lists', listId, 'reviews'),
                where('visibility', '==', 'public'),
                orderBy('createdAt', 'desc'),
                limit(perListLimit),
            ))
                .then(snapshot => ({ listId, snapshot }))
        )
    );

    let rawReviews = listReviewSnaps.flatMap(({ listId, snapshot }) =>
        snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any), listId } as ReviewEntity))
    );

    if (userId) {
        rawReviews = rawReviews.filter((r: any) => r.userId === userId || r.authorId === userId);
    }

    if (type === 'following' && Array.isArray(followingIds) && followingIds.length > 0) {
        const followingSet = new Set(followingIds);
        rawReviews = rawReviews.filter(r => {
            const authorId = (r as any).userId || (r as any).authorId || '';
            return typeof authorId === 'string' && followingSet.has(authorId);
        });
    }

    rawReviews.sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
    if (type === 'trending') rawReviews.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));

    return rawReviews.slice(0, pageLimit);
};

// ---------------------------------------------------------------------------
// Core fetch function (one page)
// ---------------------------------------------------------------------------

interface FetchPageResult {
    reviews: ReviewEntity[];
    nextLastDoc: any;
    hasMore: boolean;
}

async function fetchReviewsPage(
    type: 'recent' | 'trending' | 'following',
    opts: { userId?: string; listId?: string; followingIds?: string[]; customLimit?: number; sinceDate?: Date },
    lastDoc: any,
): Promise<FetchPageResult> {
    const { userId, listId, followingIds, customLimit, sinceDate } = opts;

    let rawReviews: ReviewEntity[] = [];
    let nextLastDoc: any = null;
    let hasMore = false;

    try {
        if (type === 'following' && followingIds && followingIds.length > 0) {
            const chunkSize = 30;
            const chunks: string[][] = [];
            for (let i = 0; i < followingIds.length; i += chunkSize) chunks.push(followingIds.slice(i, i + chunkSize));

            const reviewsGrpRef = collectionGroup(db, 'reviews');
            const snapshots = await Promise.all(chunks.map(chunk => {
                const constraints: any[] = [
                    where('visibility', '==', 'public'),
                    where('userId', 'in', chunk),
                    orderBy('createdAt', 'desc'),
                ];
                if (lastDoc) constraints.push(startAfter(lastDoc));
                constraints.push(limit(customLimit || 10));
                return getDocs(query(reviewsGrpRef, ...constraints));
            }));

            let combined: { review: ReviewEntity; docSnap: any }[] = [];
            snapshots.forEach(snap => snap.docs.forEach(d => {
                const data = d.data() as Record<string, unknown>;
                const resolvedListId = (data.listId as string) || d.ref.parent.parent?.id;
                combined.push({ review: { id: d.id, ...data, listId: resolvedListId } as ReviewEntity, docSnap: d });
            }));

            combined.sort((a, b) => ((b.review.createdAt as any)?.seconds || 0) - ((a.review.createdAt as any)?.seconds || 0));

            const uniqueRefs = new Map<string, { review: ReviewEntity; docSnap: any }>();
            combined.forEach(r => uniqueRefs.set(r.review.id, r));
            combined = Array.from(uniqueRefs.values());

            const pageSize = customLimit || 10;
            const paged = combined.slice(0, pageSize);
            rawReviews = paged.map(item => item.review);
            if (paged.length > 0) nextLastDoc = paged[paged.length - 1].docSnap;
            hasMore = paged.length >= pageSize;

        } else if (!userId && !listId) {
            const constraints: Parameters<typeof query>[1][] = [
                where('visibility', '==', 'public'),
                orderBy('createdAt', 'desc'),
            ];
            if (sinceDate) {
                constraints.push(where('createdAt', '>=', Timestamp.fromDate(sinceDate)));
            }
            constraints.push(limit(Math.min(customLimit || (sinceDate ? 100 : 20), 100)));
            const snap = await getDocs(query(collectionGroup(db, 'reviews'), ...constraints));
            rawReviews = snap.docs.map(d => {
                const data = d.data() as any;
                return { id: d.id, ...data, listId: data.listId || d.ref.parent.parent?.id } as ReviewEntity;
            });
            hasMore = false;

        } else {
            const constraints: any[] = [where('visibility', '==', 'public')];
            if (userId) constraints.push(where('userId', '==', userId));
            if (listId) constraints.push(where('listId', '==', listId));
            constraints.push(orderBy('createdAt', 'desc'));
            if (lastDoc) constraints.push(startAfter(lastDoc));
            const pageSize = customLimit || 6;
            constraints.push(limit(pageSize));

            const snap = await getDocs(query(collectionGroup(db, 'reviews'), ...constraints));
            hasMore = snap.docs.length >= pageSize;
            if (snap.docs.length > 0) nextLastDoc = snap.docs[snap.docs.length - 1];

            rawReviews = snap.docs.map(d => {
                const data = d.data() as any;
                return { id: d.id, ...data, listId: data.listId || d.ref.parent.parent?.id } as ReviewEntity;
            });
        }
    } catch (err: any) {
        if (err?.code === 'permission-denied') {
            const fallback = userId && !listId && type === 'recent'
                ? await fetchUserReviewsFromAccessibleLists(userId, customLimit || 20)
                : await fetchPublicReviewsFromListSubcollections(type, {
                    pageLimit: customLimit || 20,
                    followingIds,
                    userId,
                    listId,
                });
            rawReviews = fallback;
            hasMore = false;
        } else {
            throw err;
        }
    }

    const enriched = await enrichRawReviews(rawReviews);
    if (type === 'trending') enriched.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));

    return { reviews: enriched, nextLastDoc, hasMore };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseReviewsOptions {
    type?: 'recent' | 'trending' | 'following';
    userId?: string;
    listId?: string;
    followingIds?: string[];
    limit?: number;
    sinceDate?: Date;
}

export const useReviews = (options: UseReviewsOptions | 'recent' | 'trending' | 'following' = 'recent') => {
    const { type = 'recent', userId, listId, followingIds, limit: customLimit, sinceDate } =
        typeof options === 'string' ? { type: options } : options;

    const qc = useQueryClient();

    const q = useInfiniteQuery({
        queryKey: ['reviews', type, {
            userId: userId ?? null,
            listId: listId ?? null,
            followingIds: (followingIds ?? []).join(','),
            sinceDate: sinceDate?.getTime() ?? null,
        }],
        enabled: !(type === 'following' && (!followingIds || followingIds.length === 0)),
        staleTime: type === 'following' ? 0 : 5 * 60 * 1000,
        gcTime: type === 'following' ? 0 : 10 * 60 * 1000,
        initialPageParam: null as any,
        queryFn: ({ pageParam }) =>
            fetchReviewsPage(type, { userId, listId, followingIds, customLimit, sinceDate }, pageParam),
        getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextLastDoc : undefined,
    });

    const deduped = useMemo(() => {
        const allReviews = (q.data?.pages ?? []).flatMap(p => p.reviews);
        return Array.from(new Map(allReviews.map(r => [r.id, r])).values());
    }, [q.data?.pages]);

    return {
        reviews: deduped,
        loading: q.isLoading,
        error: q.error ? (q.error as Error).message : null,
        refresh: () => qc.invalidateQueries({ queryKey: ['reviews', type] }),
        fetchMore: () => q.fetchNextPage(),
        hasMore: !!q.hasNextPage,
        loadingMore: q.isFetchingNextPage,
    };
};
