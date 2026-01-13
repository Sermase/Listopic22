import { useState, useEffect } from 'react';
import { doc, getDoc, collectionGroup, query, where, orderBy, getDocs, Timestamp, collection } from 'firebase/firestore';
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
    updatedAt?: Timestamp; // Added field
    // Dynamic criteria scores
    scores?: Record<string, number>;
    lat?: number;
    lng?: number;
    // Aggregates
    reactionCounts?: {
        like?: number;
        love?: number;
        useful?: number;
        dislike?: number;
    };
    commentCount?: number; // Added for UI
    // Enriched Data
    listName?: string;
    placeName?: string;
    placeAddress?: string;
    placeCity?: string;
    placeMainImage?: string;
    placeAverageRating?: number;
    criteriaDefinition?: Record<string, { label: string; min?: number; max?: number; step?: number; ponderable?: boolean }>;
    authorId?: string; // Legacy compatibility
    tags?: string[];
}

export const useListDetails = (listId: string | undefined) => {
    const [list, setList] = useState<ListEntity | null>(null);
    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [sublists, setSublists] = useState<ListEntity[]>([]);
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
                const listData = listSnap.data();

                // 1.1 Fetch Parent List Name if applicable
                if (listData?.parentListId) {
                    try {
                        const parentSnap = await getDoc(doc(db, 'lists', listData.parentListId));
                        if (parentSnap.exists()) {
                            (listData as any).parentListName = parentSnap.data().name;
                            // Update the state as well
                            setList(prev => prev ? ({ ...prev, parentListName: parentSnap.data().name }) : null);
                        }
                    } catch (e) {
                        console.warn("Failed to fetch parent list name", e);
                    }
                }

                // 2. Fetch List Items (Reviews)
                const reviewsRef = collectionGroup(db, 'reviews');
                let rawReviews: ReviewEntity[] = [];

                if (listData?.parentListId) {
                    // Sublist Case: Fetch reviews where sublistId == this list's ID
                    const q = query(
                        reviewsRef,
                        where('sublistId', '==', listId),
                        orderBy('createdAt', 'desc')
                    );
                    const snap = await getDocs(q);
                    rawReviews = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ReviewEntity[];
                } else {
                    // Main List Case: Fetch reviews where listId == this list's ID
                    // Since we now save ParentID as listId even for sublist items, this query automatically gets EVERYTHING.
                    const q = query(
                        reviewsRef,
                        where('listId', '==', listId),
                        orderBy('createdAt', 'desc')
                    );
                    const snap = await getDocs(q);
                    rawReviews = snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter((r: any) => r.visibility !== 'private') as ReviewEntity[];
                }

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
                        } catch (e: any) {
                            if (e.code !== 'permission-denied') {
                                console.warn(`Failed to fetch ${collectionName} ${id}`, e);
                            }
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

                        placeMainImage: place?.mainImageUrl || place?.photos?.[0],
                        placeAverageRating: place?.rating || place?.avgScore,

                        authorName: user?.displayName || user?.name || user?.username || review.authorName,
                        authorPhoto: user?.photoUrl || user?.photoURL || review.authorPhoto,

                        // Attach Location Data (Map Support)
                        lat: place?.location?.latitude || legacyReview.lat || review.lat,
                        lng: place?.location?.longitude || legacyReview.lng || review.lng,

                        // Tags
                        tags: legacyReview.userTags || review.tags || [],
                    };
                });

                setReviews(enrichedReviews);

                // 3. Fetch Sublists
                // Wrap in try/catch to avoid blocking main content if permissions fail (e.g. public list but restrictive list-query rules)
                try {
                    const listsRef = collection(db, 'lists');
                    // Note: If this query fails due to rules, we just show no sublists.
                    // For public lists to show sublists, the rules must allow 'list' on 'lists' collection given the query constraints.
                    const sublistsQ = query(listsRef, where('parentListId', '==', listId));
                    const sublistsSnap = await getDocs(sublistsQ);
                    const sublistsData = sublistsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ListEntity[];
                    setSublists(sublistsData);
                } catch (subErr: any) {
                    console.warn("Could not fetch sublists (likely permission issue):", subErr.code);
                    setSublists([]);
                }

            } catch (err: any) {
                if (err.code === 'permission-denied') {
                    console.debug("Permission denied for list", listId); // Debug level
                    setError('private'); // Specific error code
                } else {
                    console.error("Error fetching list details:", err);
                    setError(err.message);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [listId]);

    return { list, reviews, sublists, loading, error };
};