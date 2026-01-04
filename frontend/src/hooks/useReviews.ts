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
    type?: 'recent' | 'trending';
    userId?: string;
    listId?: string;
}

export const useReviews = (options: UseReviewsOptions | 'recent' | 'trending' = 'recent') => {
    // Normalize options
    const { type = 'recent', userId, listId } = typeof options === 'string' ? { type: options } : options;

    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchReviews = async () => {
            setLoading(true);
            try {
                // Use collectionGroup to query all 'reviews' collections
                const reviewsRef = collectionGroup(db, 'reviews');
                let q;

                // Build constraints
                const constraints = [];

                if (userId) constraints.push(where('userId', '==', userId));
                if (listId) constraints.push(where('listId', '==', listId));

                // Note: Compound queries with orderBy often need indexes.
                // We prioritize filtering over precise sorting if index missing, 
                // but ideally we ask for both.
                if (type === 'trending') {
                    // Safe Sort Strategy: Fetch recent (indexed) then sort by rating in memory
                    // Avoids index issues with 'overallRating'
                    constraints.push(orderBy('createdAt', 'desc'));
                    constraints.push(limit(50)); // Fetch larger batch for sorting
                } else {
                    constraints.push(orderBy('createdAt', 'desc'));
                    constraints.push(limit(20));
                }

                q = query(reviewsRef, ...constraints);

                const snapshot = await getDocs(q);
                const rawReviews = snapshot.docs.map(doc => {
                    const data = doc.data();
                    // Fix parent list ID for subcollections logic if missing
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
                        placeLng: place?.location?.longitude || place?.lng || place?.longitude || legacyReview.lng || legacyReview.placeLng
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
    }, [type, userId, listId]);

    return { reviews, loading, error };
};
