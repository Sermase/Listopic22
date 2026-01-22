import { useState, useEffect } from 'react';
import { collection, collectionGroup, query, orderBy, limit, getDocs, doc, getDoc, where, startAfter } from 'firebase/firestore';
import { db } from '../firebase';
import { type ReviewEntity } from './useListDetails';

// Helper to dedup IDs
const uniqueIds = (ids: (string | undefined)[]) => [...new Set(ids.filter((id): id is string => !!id))];

// Simplified batch fetcher
const fetchDocsBatch = async (collectionName: string, ids: string[]) => {
    if (!ids.length) return {};
    // Firestore 'in' limit is 10, preventing simplified batching for large sets without chunking
    // For MVP, we'll fetch individually or use a simple loop if the set is small (20 reviews max means ~20 lists max)
    const docsMap: Record<string, any> = {};
    await Promise.all(ids.map(async (id) => {
        try {
            const snap = await getDoc(doc(db, collectionName, id));
            if (snap.exists()) docsMap[id] = snap.data();
        } catch (e: any) {
            // Ignore permission/not-found errors which are expected for private lists/items
            if (e.code === 'permission-denied' || e.code === 'not-found') {
                return;
            }
            console.warn(`Failed to fetch ${collectionName} ${id}`, e);
        }
    }));
    return docsMap;
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
                // Pagination for 'following' is complex due to 'in' query limitations and chunking. 
                // For now, we will NOT support pagination for 'following' feed in this iteration to avoid breaking complexity limits.
                // We will load a fixed amount.
                const chunks = [];
                for (let i = 0; i < followingIds.length; i += 10) {
                    chunks.push(followingIds.slice(i, i + 10));
                }

                const promises = chunks.map(chunk => {
                    const q = query(
                        collectionGroup(db, 'reviews'),
                        where('userId', 'in', chunk),
                        orderBy('createdAt', 'desc'),
                        limit(customLimit || 20) // Fetch top 20 per chunk (or custom)
                    );
                    return getDocs(q);
                });

                const snapshots = await Promise.all(promises);
                const allDocs = snapshots.flatMap(s => s.docs);

                rawReviews = allDocs.map(doc => {
                    const data = doc.data() as any;
                    let listId = data.listId;
                    if (!listId && doc.ref.parent.parent) {
                        listId = doc.ref.parent.parent.id;
                    }
                    return {
                        id: doc.id,
                        ...data,
                        listId
                    };
                }) as ReviewEntity[];

                // Sort combined results
                rawReviews.sort((a, b) => {
                    const tA = a.createdAt?.seconds || 0;
                    const tB = b.createdAt?.seconds || 0;
                    return tB - tA;
                });

                // Truncate to limit if needed, though we pulled by chunk.
                // No pagination state for following yet.
                setHasMore(false);

            } else {
                // Standard Logic (Recent / Trending)
                // Use collectionGroup to include legacy subcollection reviews + new root reviews
                // Note: This REQUIRES a composite index: userId + createdAt DESC (for Profile)
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

            // --- Enrich Data ---
            const listIds = uniqueIds(rawReviews.map(r => r.listId));
            const placeIds = uniqueIds(rawReviews.map(r => r.placeId));
            const userIds = uniqueIds(rawReviews.map(r => r.userId || r.authorId)); // 'authorId' legacy fallback

            const [listsMap, placesMap, usersMap] = await Promise.all([
                fetchDocsBatch('lists', listIds),
                fetchDocsBatch('places', placeIds),
                fetchDocsBatch('users', userIds)
            ]);

            const enrichedReviews = rawReviews.map(review => {
                const list = review.listId ? listsMap[review.listId] : null;
                const place = review.placeId ? placesMap[review.placeId] : null;
                const userId = review.userId || review.authorId;
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
                    authorName: user?.displayName || user?.name || user?.username || review.authorName,
                    authorPhoto: user?.photoUrl || user?.photoURL || review.authorPhoto,
                    placeLat: place?.location?.latitude || place?.lat || place?.latitude || legacyReview.lat || legacyReview.placeLat,
                    placeLng: place?.location?.longitude || place?.lng || place?.longitude || legacyReview.lng || legacyReview.placeLng,
                    placeCity: place?.city || (place?.address ? place.address.split(',').pop()?.trim() : '')
                };
            });

            if (type === 'trending') {
                enrichedReviews.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
            }

            if (isLoadMore) {
                setReviews(prev => [...prev, ...enrichedReviews]);
            } else {
                setReviews(enrichedReviews);
            }

        } catch (err: any) {
            console.error("Error fetching reviews:", err);
            setError(err.message);
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
