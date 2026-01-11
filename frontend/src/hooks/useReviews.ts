import { useState, useEffect } from 'react';
import { collectionGroup, query, orderBy, limit, getDocs, doc, getDoc, where } from 'firebase/firestore';
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
        } catch (e) {
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
}

export const useReviews = (options: UseReviewsOptions | 'recent' | 'trending' | 'following' = 'recent') => {
    // Normalize options
    const { type = 'recent', userId, listId, followingIds } = typeof options === 'string' ? { type: options } : options;

    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchReviews = async () => {
            setLoading(true);
            try {
                // Pre-check for following
                if (type === 'following') {
                    if (!followingIds || followingIds.length === 0) {
                        setReviews([]);
                        setLoading(false);
                        return;
                    }
                }

                let rawReviews: ReviewEntity[] = [];

                if (type === 'following' && followingIds && followingIds.length > 0) {
                    // Legacy-style Chunking (Firestore 'in' limit 10)
                    const chunks = [];
                    for (let i = 0; i < followingIds.length; i += 10) {
                        chunks.push(followingIds.slice(i, i + 10));
                    }

                    const promises = chunks.map(chunk => {
                        const q = query(
                            collectionGroup(db, 'reviews'),
                            where('userId', 'in', chunk),
                            orderBy('createdAt', 'desc'),
                            limit(20) // Fetch top 20 per chunk
                        );
                        return getDocs(q);
                    });

                    const snapshots = await Promise.all(promises);
                    const allDocs = snapshots.flatMap(s => s.docs);

                    rawReviews = allDocs.map(doc => {
                        const data = doc.data();
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

                } else {
                    // Standard Logic (Recent / Trending)
                    const reviewsRef = collectionGroup(db, 'reviews');
                    const constraints = [];

                    if (userId) constraints.push(where('userId', '==', userId));
                    if (listId) constraints.push(where('listId', '==', listId));

                    if (type === 'trending') {
                        constraints.push(orderBy('createdAt', 'desc'));
                        constraints.push(limit(50));
                    } else {
                        constraints.push(orderBy('createdAt', 'desc'));
                        constraints.push(limit(30));
                    }

                    const q = query(reviewsRef, ...constraints);
                    const snapshot = await getDocs(q);
                    rawReviews = snapshot.docs.map(doc => {
                        const data = doc.data();
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
                        placeMainImage: place?.mainImageUrl,
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

                setReviews(enrichedReviews);
            } catch (err: any) {
                console.error("Error fetching reviews:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchReviews();
    }, [type, userId, listId, followingIds]);

    return { reviews, loading, error };
};
