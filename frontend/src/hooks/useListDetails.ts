/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { doc, getDoc, query, where, getDocs, Timestamp, collection } from 'firebase/firestore';
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
    userTags?: string[];
    visibility?: string;
}

const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    return 0;
};

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
                const { getAuth } = await import('firebase/auth');
                const currentUser = getAuth().currentUser;
                const isOwner = !!(currentUser && listData.userId === currentUser.uid);

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

                // 2. Fetch List Reviews from canonical path + root legacy fallback
                const safeGetDocs = async (load: () => Promise<any>, label: string) => {
                    try {
                        return await load();
                    } catch (e: any) {
                        if (e?.code !== 'permission-denied') {
                            console.warn(`Failed to load reviews (${label})`, e);
                        }
                        return null;
                    }
                };

                const reviewMap = new Map<string, ReviewEntity>();
                const appendSnapshot = (snap: any, fallbackListId: string) => {
                    if (!snap) return;
                    snap.docs.forEach((reviewDoc: any) => {
                        const data = reviewDoc.data() as any;
                        const resolvedListId = typeof data.listId === 'string' && data.listId.trim().length > 0
                            ? data.listId
                            : fallbackListId;
                        const review = {
                            id: reviewDoc.id,
                            ...data,
                            listId: resolvedListId
                        } as ReviewEntity;
                        reviewMap.set(reviewDoc.id, review);
                    });
                };

                const canViewReview = (review: any) => {
                    if (isOwner) return true;
                    if (review.visibility !== 'private') return true;
                    if (!currentUser) return false;
                    return review.userId === currentUser.uid || review.authorId === currentUser.uid;
                };

                if (listData?.parentListId) {
                    const parentListId = listData.parentListId;
                    const [rootBySublist, rootByList, nestedParent, nestedLegacyOwn] = await Promise.all([
                        safeGetDocs(
                            () => getDocs(query(collection(db, 'reviews'), where('sublistId', '==', listId))),
                            'root by sublistId'
                        ),
                        safeGetDocs(
                            () => getDocs(query(collection(db, 'reviews'), where('listId', '==', listId))),
                            'root by listId (legacy sublist)'
                        ),
                        safeGetDocs(
                            () => getDocs(query(collection(db, 'lists', parentListId, 'reviews'), where('sublistId', '==', listId))),
                            'nested parent list filtered by sublistId'
                        ),
                        safeGetDocs(
                            () => getDocs(collection(db, 'lists', listId, 'reviews')),
                            'nested legacy sublist path'
                        )
                    ]);

                    appendSnapshot(rootBySublist, parentListId);
                    appendSnapshot(rootByList, parentListId);
                    appendSnapshot(nestedLegacyOwn, listId);
                    appendSnapshot(nestedParent, parentListId);
                } else {
                    const [rootByList, rootByParentList, nestedMain] = await Promise.all([
                        safeGetDocs(
                            () => getDocs(query(collection(db, 'reviews'), where('listId', '==', listId))),
                            'root by listId'
                        ),
                        safeGetDocs(
                            () => getDocs(query(collection(db, 'reviews'), where('parentListId', '==', listId))),
                            'root by parentListId'
                        ),
                        safeGetDocs(
                            () => getDocs(collection(db, 'lists', listId, 'reviews')),
                            'nested main list'
                        )
                    ]);

                    appendSnapshot(rootByList, listId);
                    appendSnapshot(rootByParentList, listId);
                    appendSnapshot(nestedMain, listId);
                }

                const rawReviews = Array.from(reviewMap.values())
                    .filter(canViewReview)
                    .sort((a: any, b: any) => toMillis(b.createdAt) - toMillis(a.createdAt));

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
                        placeClosedStatus: place?.closedStatus || null,

                        authorName: user?.username || user?.displayName || user?.name || review.authorName,
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
                    let sublistsQ;
                    if (isOwner) {
                        sublistsQ = query(listsRef, where('parentListId', '==', listId));
                    } else {
                        // Non-owners can only see public sublists. 
                        // Note: This requires index on parentListId + isPublic usually, but let's try.
                        // If it fails with index error, it's better than permission error (and we catch it).
                        sublistsQ = query(listsRef, where('parentListId', '==', listId), where('isPublic', '==', true));
                    }

                    const sublistsSnap = await getDocs(sublistsQ);
                    const sublistsData = sublistsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ListEntity[];
                    setSublists(sublistsData);
                } catch (subErr: any) {
                    if (subErr.code === 'permission-denied') {
                        console.warn("Could not fetch sublists: Permission denied. (Private sublists hidden)");
                    } else if (subErr.code === 'failed-precondition') {
                        console.warn("Could not fetch sublists: Missing Index for parentListId + isPublic query.");
                    } else {
                        console.warn("Could not fetch sublists:", subErr);
                    }
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
