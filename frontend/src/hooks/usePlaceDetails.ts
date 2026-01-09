import { useState, useEffect } from 'react';
import { collection, collectionGroup, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
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
    relatedLists: { id: string; name: string; authorName?: string; }[];
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
}

export const usePlaceDetails = (placeId: string | undefined) => {
    const [place, setPlace] = useState<PlaceDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!placeId) {
            setLoading(false);
            return;
        }

        const fetchPlaceDetails = async () => {
            setLoading(true);
            try {
                // 1. Fetch detailed Place info from 'places' collection
                const placeDocRef = doc(db, 'places', placeId);
                const placeDocSnap = await getDoc(placeDocRef);
                const placeData = placeDocSnap.exists() ? placeDocSnap.data() : null;

                // 2. Query reviews
                const reviewsQ = query(
                    collectionGroup(db, 'reviews'),
                    where('placeId', '==', placeId),
                    orderBy('createdAt', 'desc')
                );

                const reviewsSnap = await getDocs(reviewsQ);
                const reviews = reviewsSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ReviewEntity[];

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
                        } catch (e) { console.warn("Failed fetch user", uid); }
                    }));
                }

                // 3. Fetch List Info for Context (Fix for missing List Name)
                const listIds = [...new Set(reviews.map(r => r.listId).filter(Boolean))] as string[];
                const listsMap: Record<string, string> = {};
                const relatedLists: { id: string; name: string; authorName?: string }[] = [];

                if (listIds.length > 0) {
                    await Promise.all(listIds.slice(0, 20).map(async (lid) => {
                        try {
                            const listSnap = await getDoc(doc(db, 'lists', lid));
                            if (listSnap.exists()) {
                                const d = listSnap.data();
                                listsMap[lid] = d.name;
                                if (relatedLists.length < 10) {
                                    relatedLists.push({ id: lid, name: d.name, authorName: d.authorName });
                                }
                            }
                        } catch (e) { console.warn("Failed fetch list", lid); }
                    }));
                }

                const enrichedReviews = reviews.map(r => {
                    const uid = r.userId || r.authorId;
                    const user = uid ? usersMap[uid] : null;
                    const lName = r.listId ? listsMap[r.listId] : undefined;

                    return {
                        ...r,
                        authorName: user?.displayName || user?.name || user?.username || r.authorName || 'Anónimo',
                        authorPhoto: user?.photoUrl || user?.photoURL || r.authorPhoto,
                        listName: lName || r.listName // Enrich list name
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
                    googleUserRatingCount
                });

            } catch (err: any) {
                console.error("Error fetching place details:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPlaceDetails();
    }, [placeId]);

    return { place, loading, error };
};
