import { useState, useEffect } from 'react';
import { doc, getDoc, collectionGroup, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { type ListEntity } from './useLists';

export interface ReviewEntity {
    id: string;
    listId: string;
    placeId: string; // The "Item" being reviewed
    itemName: string; // Redundant but useful
    comment: string;
    overallRating: number;
    photoUrl?: string;
    userId: string;
    authorName?: string;
    authorPhoto?: string;
    createdAt: Timestamp;
    // Dynamic criteria scores
    scores?: Record<string, number>;
    lat?: number;
    lng?: number;
    // Enriched Data
    listName?: string;
    placeName?: string;
    placeAddress?: string;
    placeCity?: string;
    placeMainImage?: string;
    criteriaDefinition?: Record<string, { label: string; min?: number; max?: number; step?: number; ponderable?: boolean }>;
    reactionCounts?: { like?: number; dislike?: number };
    authorId?: string; // Legacy compatibility
}

export const useListDetails = (listId: string | undefined) => {
    const [list, setList] = useState<ListEntity | null>(null);
    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!listId) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch List Metadata
                const listRef = doc(db, 'lists', listId);
                const listSnap = await getDoc(listRef);

                if (!listSnap.exists()) {
                    setError('Lista no encontrada');
                    setLoading(false);
                    return;
                }

                setList({ id: listSnap.id, ...listSnap.data() } as ListEntity);

                // 2. Fetch List Items (Reviews)
                const reviewsRef = collectionGroup(db, 'reviews');

                // Fetch ALL list reviews once, ordered by creation (newest first default)
                // Sorting will be handled client-side to allow instant switching without re-fetch.
                const q = query(
                    reviewsRef,
                    where('listId', '==', listId),
                    orderBy('createdAt', 'desc')
                );

                const reviewsSnap = await getDocs(q);
                const rawReviews = reviewsSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    listId: listId // Ensure listId is present
                })) as ReviewEntity[];

                // --- Enrich Data ---
                // We need Places and Users. Lists are not needed as we have the parent list.
                const placeIds = [...new Set(rawReviews.map(r => r.placeId).filter((id): id is string => !!id))];
                const userIds = [...new Set(rawReviews.map(r => r.userId || r.authorId).filter((id): id is string => !!id))];

                const fetchDocsMap = async (collectionName: string, ids: string[]) => {
                    if (!ids.length) return {};
                    const map: Record<string, any> = {};
                    await Promise.all(ids.map(async (id) => {
                        try {
                            const snap = await getDoc(doc(db, collectionName, id));
                            if (snap.exists()) map[id] = snap.data();
                        } catch (e) {
                            console.warn(`Failed to fetch ${collectionName} ${id}`, e);
                        }
                    }));
                    return map;
                };

                const [placesMap, usersMap] = await Promise.all([
                    fetchDocsMap('places', placeIds),
                    fetchDocsMap('users', userIds)
                ]);

                const enrichedReviews = rawReviews.map(review => {
                    const place = review.placeId ? placesMap[review.placeId] : null;
                    const userId = review.userId || review.authorId;
                    const user = userId ? usersMap[userId] : null;

                    // Support legacy establishmentName if place fetch fails or is missing
                    const legacyReview = review as any;
                    const listData = listSnap.data() as ListEntity;

                    // Address Fallback Logic
                    // 1. place.address (string)
                    // 2. place.city (string)
                    // 3. place.address_components (array) -> find locality
                    let city = place?.city;
                    if (!city && place?.addressComponents) {
                        const locality = place.addressComponents.find((c: any) => c.types.includes('locality'));
                        if (locality) city = locality.long_name;
                    }

                    return {
                        ...review,
                        // Attach List Context
                        listName: listData.name,
                        criteriaDefinition: listData.criteriaDefinition,

                        // Attach Enriched Data
                        placeName: place?.name || legacyReview.establishmentName || review.placeName,
                        placeAddress: place?.address || place?.formattedAddress || place?.vicinity,
                        placeCity: city,

                        authorName: user?.displayName || user?.username || review.authorName,
                        authorPhoto: user?.photoUrl || review.authorPhoto,

                        // Attach Location Data (Map Support)
                        lat: place?.location?.latitude || legacyReview.lat || review.lat,
                        lng: place?.location?.longitude || legacyReview.lng || review.lng,
                    };
                });

                setReviews(enrichedReviews);
            } catch (err: any) {
                console.error("Error fetching list details:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [listId]);

    return { list, reviews, loading, error };
};