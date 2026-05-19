/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, doc, getDoc, getDocFromServer, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { type ReviewEntity } from './useListDetails';
import { firstUsablePlaceImage } from '../utils/placeImages';
import { getCachedDocs } from '../lib/queryCache';
import type { BusinessHoursInfo, BusinessWeeklyHours, ResolvedBusinessInfo } from '../types/businessInfo';

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
    email?: string;
    instagram?: string;
    priceLevel?: number;
    googleMapsUri?: string;
    accessibility?: {
        wheelchairAccessibleEntrance?: boolean;
        wheelchairAccessibleRestroom?: boolean;
        wheelchairAccessibleSeating?: boolean;
        wheelchairAccessibleParking?: boolean;
        hearingLoop?: boolean;
    };
    petOptions?: {
        petFriendly?: boolean;
        allowsDogs?: boolean;
        allowsCats?: boolean;
        terraceOnly?: boolean;
        indoorAllowed?: boolean;
        assistanceDogsOnly?: boolean;
        waterBowls?: boolean;
        treatsAvailable?: boolean;
        petMenu?: boolean;
        sizeRestrictions?: boolean;
        requiresLeash?: boolean;
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
    businessOpenStatus?: {
        isOpen: boolean;
        label: string;
        detail?: string;
    };
    businessDescription?: string;
    resolvedBusinessInfo?: ResolvedBusinessInfo;
    category?: string;
    closedStatus?: string;
    googleBusinessStatus?: string;
    businessVerified?: boolean;
    businessClaimId?: string;
    businessOwnerUserId?: string;
    businessManagerIds?: string[];
    placePhotos?: PlacePhoto[];
}

const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    return 0;
};

const localized = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value || undefined;
    if (value && typeof value === 'object') {
        const text = value as { es?: unknown; en?: unknown };
        return typeof text.es === 'string' && text.es ? text.es : typeof text.en === 'string' && text.en ? text.en : undefined;
    }
    return undefined;
};

const businessDayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const parseBusinessDay = (value: unknown, fallbackIndex: number): number => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) return value;
    if (typeof value === 'string') {
        const numeric = Number(value);
        if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) return numeric;
        const normalized = value.toLowerCase();
        const namedIndex = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].indexOf(normalized);
        if (namedIndex >= 0) return namedIndex;
    }
    return fallbackIndex >= 0 && fallbackIndex <= 6 ? fallbackIndex : 0;
};

const normalizeBusinessWeeklyHours = (hours: BusinessHoursInfo | undefined): BusinessWeeklyHours[] => {
    if (!hours?.weeklySchedule?.length) return [];
    return hours.weeklySchedule
        .map((day, index) => ({
            ...day,
            day: parseBusinessDay(day.day, index),
            periods: day.periods || [],
        }))
        .filter((day) => day.closed === true || Boolean(day.periods?.length))
        .sort((a, b) => a.day - b.day);
};

const timeToMinutes = (value: string | undefined): number | null => {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
};

const formatBusinessHours = (hours: BusinessHoursInfo | undefined): string[] | undefined => {
    const weeklySchedule = normalizeBusinessWeeklyHours(hours);
    if (!weeklySchedule.length) return undefined;
    const lines = weeklySchedule
        .map((day) => {
            if (day.closed) return `${businessDayNames[day.day] || 'Día'}: Cerrado`;
            const periods = (day.periods || []).map((period) => `${period.open} - ${period.close}`).join(', ');
            return periods ? `${businessDayNames[day.day] || 'Día'}: ${periods}` : '';
        })
        .filter(Boolean);
    return lines.length ? lines : undefined;
};

const getBusinessOpenStatus = (hours: BusinessHoursInfo | undefined) => {
    const weeklySchedule = normalizeBusinessWeeklyHours(hours);
    if (!weeklySchedule.length) return undefined;

    const now = new Date();
    const todayIndex = (now.getDay() + 6) % 7;
    const today = weeklySchedule.find((day) => day.day === todayIndex);
    if (!today) return undefined;
    if (today.closed) return { isOpen: false, label: 'Cerrado ahora', detail: 'Hoy cerrado' };
    if (!today.periods?.length) return undefined;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const period of today.periods || []) {
        const open = timeToMinutes(period.open);
        const close = timeToMinutes(period.close);
        if (open === null || close === null) continue;
        const isOpen = close >= open
            ? nowMinutes >= open && nowMinutes < close
            : nowMinutes >= open || nowMinutes < close;
        if (isOpen) {
            return { isOpen: true, label: 'Abierto ahora', detail: `Hasta ${period.close}` };
        }
    }

    const nextPeriod = (today.periods || [])
        .map((period) => ({ period, open: timeToMinutes(period.open) }))
        .filter((item): item is { period: { open: string; close: string }; open: number } => item.open !== null && item.open > nowMinutes)
        .sort((a, b) => a.open - b.open)[0];

    return {
        isOpen: false,
        label: 'Cerrado ahora',
        detail: nextPeriod ? `Abre a las ${nextPeriod.period.open}` : undefined,
    };
};

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
    const placeRef = doc(db, 'places', placeId);
    const placeDocSnap = await getDocFromServer(placeRef).catch(() => getDoc(placeRef));
    const placeData = placeDocSnap.exists() ? placeDocSnap.data() : null;
    const resolvedBusinessSnapPromise = getDoc(doc(db, 'places', placeId, 'resolvedPublic', 'business')).catch(e => {
        if (e?.code !== 'permission-denied') console.warn('Failed to fetch resolved business info', e);
        return null;
    });
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
    ).catch(e => {
        if (e?.code !== 'permission-denied') console.warn('Failed to fetch global reviews for place', e);
        return { docs: [] };
    });
    const placePhotosSnap = await placePhotosSnapPromise;
    const resolvedBusinessSnap = await resolvedBusinessSnapPromise;
    const resolvedBusiness = resolvedBusinessSnap?.exists() ? resolvedBusinessSnap.data() as ResolvedBusinessInfo : undefined;
    const hiddenFields = resolvedBusiness?.hiddenFields || {};

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
    const usersMap = await getCachedDocs('publicProfiles', userIds.slice(0, 20), {
        warnLabel: 'usePlaceDetails: failed loading user profiles batch',
    }) as Record<string, any>;

    const listIds = [...new Set(reviews.map(r => r.listId).filter(Boolean))] as string[];
    const listsMap = await getCachedDocs('lists', listIds.slice(0, 20), {
        warnLabel: 'usePlaceDetails: failed loading lists batch',
    }) as Record<string, any>;
    const relatedLists: PlaceDetails['relatedLists'] = [];
    for (const lid of listIds.slice(0, 20)) {
        const d = listsMap[lid];
        if (d && relatedLists.length < 10) {
            relatedLists.push({
                id: lid,
                name: d.name,
                authorName: d.authorName,
                parentListId: d.parentListId,
                photoUrl: d.photoUrl || d.mainImageUrl || d.thumbnailUrl || d.coverUrl || d.imageUrl || undefined,
            });
        }
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
            categoryId: r.categoryId || listData?.categoryId,
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

    const businessName = localized(resolvedBusiness?.identity?.displayName);
    const businessDescription = localized(resolvedBusiness?.identity?.description);
    const businessHours = formatBusinessHours(resolvedBusiness?.hours);
    const hidesContact = (field: string) => Array.isArray(hiddenFields.contact) && hiddenFields.contact.includes(field);
    const businessAccessibility = resolvedBusiness?.accessibility;
    const hasBusinessAccessibility = Boolean(businessAccessibility && Object.keys(businessAccessibility).length > 0);
    const businessPets = resolvedBusiness?.pets;
    const hasBusinessPets = Boolean(businessPets && Object.keys(businessPets).length > 0);
    const googlePetOptions = placeData?.businessPetOptions || placeData?.petOptions || placeData?.pets;

    return {
        placeId,
        name: businessName || placeData?.name || reviews[0]?.itemName || 'Lugar',
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
        website: resolvedBusiness?.contact?.website || (hidesContact('website') ? undefined : placeData?.websiteUri || placeData?.website),
        phone: resolvedBusiness?.contact?.phone || (hidesContact('phone') ? undefined : placeData?.formattedPhoneNumber || placeData?.internationalPhoneNumber),
        email: resolvedBusiness?.contact?.email,
        instagram: resolvedBusiness?.contact?.instagram,
        priceLevel: placeData?.priceLevel,
        googleMapsUri: placeData?.googleMapsUrl || placeData?.googleMapsUri,
        accessibility: hasBusinessAccessibility ? {
            wheelchairAccessibleEntrance: businessAccessibility?.stepFreeEntrance,
            wheelchairAccessibleRestroom: businessAccessibility?.accessibleBathroom,
            wheelchairAccessibleSeating: businessAccessibility?.wheelchairFriendlyTables,
            wheelchairAccessibleParking: businessAccessibility?.accessibleParking,
            hearingLoop: businessAccessibility?.hearingLoop,
        } : placeData?.accessibilityOptions ? {
            wheelchairAccessibleEntrance: placeData.accessibilityOptions.wheelchairAccessibleEntrance,
            wheelchairAccessibleRestroom: placeData.accessibilityOptions.wheelchairAccessibleRestroom,
            wheelchairAccessibleSeating: placeData.accessibilityOptions.wheelchairAccessibleSeating,
            wheelchairAccessibleParking: placeData.accessibilityOptions.wheelchairAccessibleParking,
            hearingLoop: placeData.accessibilityOptions.hearingLoop,
        } : placeData?.accessibility,
        petOptions: hasBusinessPets ? {
            petFriendly: businessPets?.petFriendly || businessPets?.allowsDogs || businessPets?.allowsCats,
            allowsDogs: businessPets?.allowsDogs,
            allowsCats: businessPets?.allowsCats,
            terraceOnly: businessPets?.terraceOnly,
            indoorAllowed: businessPets?.indoorAllowed,
            assistanceDogsOnly: businessPets?.assistanceDogsOnly,
            waterBowls: businessPets?.waterBowls,
            treatsAvailable: businessPets?.treatsAvailable,
            petMenu: businessPets?.petMenu,
            sizeRestrictions: businessPets?.sizeRestrictions,
            requiresLeash: businessPets?.requiresLeash,
        } : googlePetOptions,
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
        openingHours: businessHours || placeData?.currentOpeningHours?.weekdayDescriptions || placeData?.openingHours,
        businessOpenStatus: getBusinessOpenStatus(resolvedBusiness?.hours),
        businessDescription,
        resolvedBusinessInfo: resolvedBusiness,
        googleRating: placeData?.googleRating || placeData?.rating,
        googleUserRatingCount: placeData?.userRatingCount || placeData?.user_ratings_total,
        category: placeData?.category || placeData?.types?.[0],
        closedStatus: placeData?.closedStatus || undefined,
        googleBusinessStatus: placeData?.googleBusinessStatus || undefined,
        businessVerified: placeData?.businessVerified === true,
        businessClaimId: typeof placeData?.businessClaimId === 'string' ? placeData.businessClaimId : undefined,
        businessOwnerUserId: typeof placeData?.businessOwnerUserId === 'string' ? placeData.businessOwnerUserId : undefined,
        businessManagerIds: Array.isArray(placeData?.businessManagerIds) ? placeData.businessManagerIds.filter((id: unknown) => typeof id === 'string') : undefined,
        placePhotos,
    };
}

export const usePlaceDetails = (placeId: string | undefined) => {
    const qc = useQueryClient();
    const q = useQuery({
        queryKey: ['placeDetails', placeId],
        enabled: !!placeId,
        queryFn: () => fetchPlaceDetails(placeId!),
        staleTime: 0,
        refetchOnMount: 'always',
    });

    return {
        place: q.data ?? null,
        loading: q.isLoading,
        error: q.error ? (q.error as Error).message : null,
        refresh: async () => {
            await qc.invalidateQueries({ queryKey: ['placeDetails', placeId] });
            return q.refetch();
        },
    };
};
