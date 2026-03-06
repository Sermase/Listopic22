/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { type ReviewEntity } from './useListDetails';

export interface PlaceDetails {
    placeId: string;
    name: string;
    photoUrl?: string;
    address?: string;
    avgScore: number;
    reviewCount: number;
    reviews: ReviewEntity[];
    relatedLists: { id: string; name: string; authorName?: string; parentListId?: string; photoUrl?: string; }[];
    coords?: { lat: number; lng: number };
    googleRating?: number;
    googleUserRatingCount?: number;
    // Rich Data Fields
    website?: string;
    phone?: string;
    priceLevel?: number; // 0-4
    googleMapsUri?: string;
    accessibility?: {
        wheelchairAccessibleEntrance?: boolean;
        wheelchairAccessibleRestroom?: boolean;
        wheelchairAccessibleSeating?: boolean;
    };
    options?: {
        delivery?: boolean;
        takeout?: boolean;
        dineIn?: boolean;
        reservable?: boolean;
        servesBeer?: boolean;
        servesWine?: boolean;
        servesBreakfast?: boolean;
        servesLunch?: boolean;
        servesDinner?: boolean;
    };
    openingHours?: string[]; // Array of strings if available
    category?: string;
}


const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    return 0;
};

export const usePlaceDetails = (placeId: string | undefined) => {
    const [place, setPlace] = useState<PlaceDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPlaceDetails = async () => {
        if (!placeId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // 1. Fetch detailed Place info from 'places' collection
            const placeDocRef = doc(db, 'places', placeId);
            const placeDocSnap = await getDoc(placeDocRef);
            const placeData = placeDocSnap.exists() ? placeDocSnap.data() : null;

            // 2. Build candidate readable lists and fetch place reviews from each subcollection.
            const { getAuth } = await import('firebase/auth');
            const currentUser = getAuth().currentUser;

            const [publicListsSnap, followingListsSnap, ownListsSnap] = await Promise.all([
                getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(60))),
                currentUser ? getDocs(query(collection(db, 'users', currentUser.uid, 'followingLists'), limit(60))) : Promise.resolve(null),
                currentUser ? getDocs(query(collection(db, 'lists'), where('userId', '==', currentUser.uid), limit(40))) : Promise.resolve(null)
            ]);

            const candidateListIds = Array.from(new Set([
                ...publicListsSnap.docs.map((d) => d.id),
                ...(followingListsSnap ? followingListsSnap.docs.map((d) => d.id) : []),
                ...(ownListsSnap ? ownListsSnap.docs.map((d) => d.id) : [])
            ])).slice(0, 80);

            const reviewsByList = await Promise.all(candidateListIds.map(async (listId) => {
                try {
                    const listReviewsSnap = await getDocs(
                        query(collection(db, 'lists', listId, 'reviews'), where('placeId', '==', placeId), limit(20))
                    );
                    return listReviewsSnap.docs.map((reviewDoc) => ({
                        id: reviewDoc.id,
                        ...(reviewDoc.data() as Record<string, unknown>),
                        listId
                    } as ReviewEntity));
                } catch (error: unknown) {

                    if ((error as any)?.code !== 'permission-denied') {
                        console.warn(`Failed loading place reviews for list ${listId}`, error);
                    }
                    return [] as ReviewEntity[];
                }
            }));

            // 2.2 Add Global Reviews fetch since new reviews are created in the root 'reviews' collection
            const globalReviewsSnap = await getDocs(
                query(collection(db, 'reviews'), where('placeId', '==', placeId), limit(50))
            ).catch(e => {
                console.warn('Failed to fetch global reviews for place', e);
                return { docs: [] };
            });

            const globalReviews = globalReviewsSnap.docs
                .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) } as ReviewEntity))
                .filter(r => {
                    // Show if: It's own review, or it's public, or its list is a candidate
                    return r.userId === currentUser?.uid || r.authorId === currentUser?.uid ||
                        r.visibility === 'public' ||
                        (r.listId && candidateListIds.includes(r.listId));
                });

            reviewsByList.push(globalReviews);

            const reviewMap = new Map<string, ReviewEntity>();
            for (const listReviews of reviewsByList) {
                for (const review of listReviews) {
                    reviewMap.set(`${review.listId || 'unknown'}:${review.id}`, review);
                }
            }

            const reviews = Array.from(reviewMap.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

            if (reviews.length === 0 && !placeData) {
                setError("No se encontraron datos para este lugar.");
                setLoading(false);
                return;
            }

            // 2.5 Enrich with Authors (Fix for missing authors)
            const userIds = [...new Set(reviews.map(r => r.userId || r.authorId).filter(Boolean))] as string[];
            const usersMap: Record<string, any> = {};

            if (userIds.length > 0) {
                await Promise.all(userIds.slice(0, 20).map(async (uid) => {
                    try {
                        const userSnap = await getDoc(doc(db, 'users', uid));
                        if (userSnap.exists()) {
                            usersMap[uid] = userSnap.data();
                        }
                    } catch { console.warn("Failed fetch user", uid); }
                }));
            }

            // 3. Fetch List Info for Context (Fix for missing List Name)
            // 3. Fetch List Info for Context (Fix for missing List Name & Criteria)
            const listIds = [...new Set(reviews.map(r => r.listId).filter(Boolean))] as string[];
            const listsMap: Record<string, any> = {}; // Store full list data
            const relatedLists: { id: string; name: string; authorName?: string; parentListId?: string; photoUrl?: string; }[] = [];

            if (listIds.length > 0) {
                await Promise.all(listIds.slice(0, 20).map(async (lid) => {
                    try {
                        const listSnap = await getDoc(doc(db, 'lists', lid));
                        if (listSnap.exists()) {
                            const d = listSnap.data();
                            listsMap[lid] = d; // Store full data
                            if (relatedLists.length < 10) {
                                relatedLists.push({
                                    id: lid,
                                    name: d.name,
                                    authorName: d.authorName,
                                    parentListId: d.parentListId,
                                    photoUrl: d.photoUrl
                                });
                            }
                        }
                    } catch { console.warn("Failed fetch list", lid); }
                }));
            }

            const enrichedReviews = reviews.map(r => {
                const uid = r.userId || r.authorId;
                const user = uid ? usersMap[uid] : null;
                const listData = r.listId ? listsMap[r.listId] : undefined;

                return {
                    ...r,
                    authorName: user?.username || user?.displayName || user?.name || r.authorName || 'Anónimo',
                    authorPhoto: user?.photoUrl || user?.photoURL || r.authorPhoto,
                    listName: listData?.name || r.listName, // Enrich list name
                    criteriaDefinition: listData?.criteriaDefinition || r.criteriaDefinition, // Enrich criteria for charts
                    // Enrich Place Data for ReviewCard fallback
                    placeMainImage: placeData?.mainImageUrl || placeData?.photos?.[0],
                    placeName: placeData?.name || r.placeName,
                    placeCity: placeData?.city || r.placeCity
                };
            });

            // Enrichment
            const avgScore = reviews.length
                ? reviews.reduce((sum, r) => sum + (r.overallRating || 0), 0) / reviews.length
                : (placeData?.rating || placeData?.avgScore || 0);

            const name = placeData?.name || reviews[0]?.itemName || "Lugar";
            const photoUrl = placeData?.mainImageUrl || placeData?.photos?.[0] || reviews.find(r => r.photoUrl)?.photoUrl;
            const address = placeData?.formattedAddress || placeData?.address;

            let coords = undefined;
            if (placeData?.location) {
                coords = { lat: placeData.location.latitude, lng: placeData.location.longitude };
            } else if (reviews.find(r => r.lat && r.lng)) {
                const r = reviews.find(r => r.lat && r.lng);
                coords = { lat: r!.lat!, lng: r!.lng! };
            }

            // Map Rich Data
            // Note: We safely access properties assuming standard Google Places Fields naming or custom internal naming
            const website = placeData?.websiteUri || placeData?.website;
            const phone = placeData?.formattedPhoneNumber || placeData?.internationalPhoneNumber;
            const priceLevel = placeData?.priceLevel; // e.g., PRICE_LEVEL_MODERATE or number
            const googleMapsUri = placeData?.googleMapsUrl || placeData?.googleMapsUri;

            const accessibility = placeData?.accessibilityOptions ? {
                wheelchairAccessibleEntrance: placeData.accessibilityOptions.wheelchairAccessibleEntrance,
                wheelchairAccessibleRestroom: placeData.accessibilityOptions.wheelchairAccessibleRestroom
            } : placeData?.accessibility; // Fallback to raw accessibility map if storing legacy structure

            // Map Service Options (from 'serviceOptions' map or root fields fallback)
            const optsSrc = placeData?.serviceOptions || placeData;
            const options = {
                delivery: optsSrc?.delivery,
                takeout: optsSrc?.takeout,
                dineIn: optsSrc?.dineIn || optsSrc?.dine_in,
                reservable: optsSrc?.reservable,
                servesBeer: optsSrc?.servesBeer || optsSrc?.serves_beer,
                servesWine: optsSrc?.servesWine || optsSrc?.serves_wine,
                servesBreakfast: optsSrc?.servesBreakfast || optsSrc?.serves_breakfast,
                servesLunch: optsSrc?.servesLunch || optsSrc?.serves_lunch,
                servesDinner: optsSrc?.servesDinner || optsSrc?.serves_dinner
            };

            const openingHours = placeData?.currentOpeningHours?.weekdayDescriptions || placeData?.openingHours;

            const googleRating = placeData?.googleRating || placeData?.rating;
            const googleUserRatingCount = placeData?.userRatingCount || placeData?.user_ratings_total;
            const category = placeData?.category || placeData?.types?.[0]; // Fallback to first type

            setPlace({
                placeId,
                name,
                photoUrl,
                address,
                avgScore,
                reviewCount: reviews.length,
                reviews: enrichedReviews,
                relatedLists,
                coords,
                website,
                phone,
                priceLevel,
                googleMapsUri,
                accessibility,
                options,
                openingHours,
                googleRating,
                googleUserRatingCount,
                category
            });

        } catch (err: unknown) {
            console.error("Error fetching place details:", err);

            setError((err as any).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlaceDetails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placeId]);

    return { place, loading, error, refresh: () => fetchPlaceDetails() };
};
