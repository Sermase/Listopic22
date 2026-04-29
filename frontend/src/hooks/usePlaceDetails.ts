/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, doc, getDoc, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { type ReviewEntity } from './useListDetails';
import { firstUsablePlaceImage } from '../utils/placeImages';

export interface PlacePhoto {
    id: string;
    url: string;
    caption?: string;
    userId?: string;
    userName?: string;
    userPhoto?: string;
    createdAt?: unknown;
}

export interface PlaceDetails {
    placeId: string;
    name: string;
    photoUrl?: string;
    address?: string;
    city?: string;
    avgScore: number;
    reviewCount: number;
    reviews: ReviewEntity[];
    relatedLists: { id: string; name: string; authorName?: string; parentListId?: string; photoUrl?: string; }[];
    coords?: { lat: number; lng: number };
    googleRating?: number;
    googleUserRatingCount?: number;
    website?: string;
    phone?: string;
    priceLevel?: number;
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
    openingHours?: string[];
    category?: string;
    closedStatus?: string;
    googleBusinessStatus?: string;
    placePhotos?: PlacePhoto[];
}

const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    return 0;
};

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
    const placeDocSnap = await getDoc(doc(db, 'places', placeId));
    const placeData = placeDocSnap.exists() ? placeDocSnap.data() : null;
    const placePhotosSnapPromise = getDocs(
        query(collection(db, 'places', placeId, 'photos'), orderBy('createdAt', 'desc'), limit(40))
    ).catch(e => {
        console.warn('Failed to fetch place photos', e);
        return { docs: [] };
    });

    const { getAuth } = await import('firebase/auth');
    const currentUser = getAuth().currentUser;

    const [publicListsSnap, followingListsSnap, ownListsSnap] = await Promise.all([
        getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(60))),
        currentUser ? getDocs(query(collection(db, 'users', currentUser.uid, 'followingLists'), limit(60))) : Promise.resolve(null),
        currentUser ? getDocs(query(collection(db, 'lists'), where('userId', '==', currentUser.uid), limit(40))) : Promise.resolve(null),
    ]);

    const candidateListIds = Array.from(new Set([
        ...publicListsSnap.docs.map(d => d.id),
        ...(followingListsSnap ? followingListsSnap.docs.map(d => d.id) : []),
        ...(ownListsSnap ? ownListsSnap.docs.map(d => d.id) : []),
    ])).slice(0, 80);

    const reviewsByList = await Promise.all(candidateListIds.map(async (listId) => {
        try {
            const snap = await getDocs(query(collection(db, 'lists', listId, 'reviews'), where('placeId', '==', placeId), limit(20)));
            return snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>), listId } as ReviewEntity));
        } catch (e: any) {
            if (e?.code !== 'permission-denied') console.warn(`Failed loading place reviews for list ${listId}`, e);
            return [] as ReviewEntity[];
        }
    }));

    const globalReviewsSnap = await getDocs(
        query(collection(db, 'reviews'), where('placeId', '==', placeId), limit(50))
    ).catch(e => { console.warn('Failed to fetch global reviews for place', e); return { docs: [] }; });
    const placePhotosSnap = await placePhotosSnapPromise;

    reviewsByList.push(
        globalReviewsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as ReviewEntity))
    );

    const reviewMap = new Map<string, ReviewEntity>();
    for (const listReviews of reviewsByList) {
        for (const review of listReviews) {
            reviewMap.set(`${review.listId || 'unknown'}:${review.id}`, review);
        }
    }

    const reviews = Array.from(reviewMap.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    const placePhotos = placePhotosSnap.docs
        .map((photoDoc): PlacePhoto | null => {
            const data = photoDoc.data() as Record<string, unknown>;
            const url = firstUsablePlaceImage(data.url);
            if (!url) return null;
            return {
                id: photoDoc.id,
                url,
                caption: typeof data.caption === 'string' ? data.caption : undefined,
                userId: typeof data.userId === 'string' ? data.userId : undefined,
                userName: typeof data.userName === 'string' ? data.userName : undefined,
                userPhoto: typeof data.userPhoto === 'string' ? data.userPhoto : undefined,
                createdAt: data.createdAt,
            };
        })
        .filter((photo): photo is PlacePhoto => photo !== null);

    if (reviews.length === 0 && !placeData) {
        throw new Error('No se encontraron datos para este lugar.');
    }

    const userIds = [...new Set(reviews.map(r => r.userId || r.authorId).filter(Boolean))] as string[];
    const usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
        await Promise.all(userIds.slice(0, 20).map(async (uid) => {
            try {
                const snap = await getDoc(doc(db, 'users', uid));
                if (snap.exists()) usersMap[uid] = snap.data();
            } catch { /* no-op */ }
        }));
    }

    const listIds = [...new Set(reviews.map(r => r.listId).filter(Boolean))] as string[];
    const listsMap: Record<string, any> = {};
    const relatedLists: PlaceDetails['relatedLists'] = [];
    if (listIds.length > 0) {
        await Promise.all(listIds.slice(0, 20).map(async (lid) => {
            try {
                const snap = await getDoc(doc(db, 'lists', lid));
                if (snap.exists()) {
                    const d = snap.data();
                    listsMap[lid] = d;
                    if (relatedLists.length < 10) {
                        relatedLists.push({
                            id: lid,
                            name: d.name,
                            authorName: d.authorName,
                            parentListId: d.parentListId,
                            photoUrl: d.photoUrl || d.mainImageUrl || d.thumbnailUrl || d.coverUrl || d.imageUrl || undefined,
                        });
                    }
                }
            } catch { /* no-op */ }
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
            listName: listData?.name || r.listName,
            criteriaDefinition: listData?.criteriaDefinition || r.criteriaDefinition,
            placeMainImage: firstUsablePlaceImage(placeData?.userPhotoUrl, placePhotos[0]?.url, placeData?.mainImageUrl, placeData?.photos),
            placeName: placeData?.name || r.placeName,
            placeCity: placeData?.city || r.placeCity,
            placeClosedStatus: placeData?.closedStatus || null,
        };
    });

    const avgScore = reviews.length
        ? reviews.reduce((sum, r) => sum + (r.overallRating || 0), 0) / reviews.length
        : (placeData?.rating || placeData?.avgScore || 0);

    let coords: PlaceDetails['coords'];
    if (placeData?.location) {
        coords = { lat: placeData.location.latitude, lng: placeData.location.longitude };
    } else {
        const rWithCoords = reviews.find(r => r.lat && r.lng);
        if (rWithCoords) coords = { lat: rWithCoords.lat!, lng: rWithCoords.lng! };
    }

    const optsSrc = placeData?.serviceOptions || placeData;

    return {
        placeId,
        name: placeData?.name || reviews[0]?.itemName || 'Lugar',
        photoUrl: firstUsablePlaceImage(
            placeData?.userPhotoUrl,
            placePhotos[0]?.url,
            reviews.find(r => r.photoUrl)?.photoUrl,
            placeData?.mainImageUrl,
            placeData?.photos
        ),
        address: placeData?.formattedAddress || placeData?.address,
        city: placeData?.city || reviews.find(r => r.placeCity)?.placeCity,
        avgScore,
        reviewCount: reviews.length,
        reviews: enrichedReviews,
        relatedLists,
        coords,
        website: placeData?.websiteUri || placeData?.website,
        phone: placeData?.formattedPhoneNumber || placeData?.internationalPhoneNumber,
        priceLevel: placeData?.priceLevel,
        googleMapsUri: placeData?.googleMapsUrl || placeData?.googleMapsUri,
        accessibility: placeData?.accessibilityOptions ? {
            wheelchairAccessibleEntrance: placeData.accessibilityOptions.wheelchairAccessibleEntrance,
            wheelchairAccessibleRestroom: placeData.accessibilityOptions.wheelchairAccessibleRestroom,
        } : placeData?.accessibility,
        options: {
            delivery: optsSrc?.delivery,
            takeout: optsSrc?.takeout,
            dineIn: optsSrc?.dineIn || optsSrc?.dine_in,
            reservable: optsSrc?.reservable,
            servesBeer: optsSrc?.servesBeer || optsSrc?.serves_beer,
            servesWine: optsSrc?.servesWine || optsSrc?.serves_wine,
            servesBreakfast: optsSrc?.servesBreakfast || optsSrc?.serves_breakfast,
            servesLunch: optsSrc?.servesLunch || optsSrc?.serves_lunch,
            servesDinner: optsSrc?.servesDinner || optsSrc?.serves_dinner,
        },
        openingHours: placeData?.currentOpeningHours?.weekdayDescriptions || placeData?.openingHours,
        googleRating: placeData?.googleRating || placeData?.rating,
        googleUserRatingCount: placeData?.userRatingCount || placeData?.user_ratings_total,
        category: placeData?.category || placeData?.types?.[0],
        closedStatus: placeData?.closedStatus || undefined,
        googleBusinessStatus: placeData?.googleBusinessStatus || undefined,
        placePhotos,
    };
}

export const usePlaceDetails = (placeId: string | undefined) => {
    const qc = useQueryClient();
    const q = useQuery({
        queryKey: ['placeDetails', placeId],
        enabled: !!placeId,
        queryFn: () => fetchPlaceDetails(placeId!),
    });

    return {
        place: q.data ?? null,
        loading: q.isLoading,
        error: q.error ? (q.error as Error).message : null,
        refresh: () => qc.invalidateQueries({ queryKey: ['placeDetails', placeId] }),
    };
};
