/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, query, where, getDocs, Timestamp, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { firstUsablePlaceImage } from '../utils/placeImages';
import { type ListEntity } from './useLists';

export interface ReviewEntity {
    id: string;
    listId: string;
    placeId: string;
    itemName: string;
    comment: string;
    overallRating: number;
    photoUrl?: string;
    photoUrls?: string[];
    userId: string;
    authorName?: string;
    authorPhoto?: string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
    scores?: Record<string, number>;
    lat?: number;
    lng?: number;
    reactionCounts?: {
        like?: number;
        love?: number;
        useful?: number;
        dislike?: number;
    };
    commentCount?: number;
    categoryId?: string;
    listName?: string;
    placeName?: string;
    placeAddress?: string;
    placeCity?: string;
    placeMainImage?: string;
    placeClosedStatus?: string | null;
    accessibilityOptions?: Record<string, unknown> | string[];
    accessibility?: Record<string, unknown> | string[];
    placeAccessibilityOptions?: Record<string, unknown> | string[];
    placeAccessibility?: Record<string, unknown> | string[];
    petOptions?: Record<string, unknown> | string[];
    pets?: Record<string, unknown> | string[];
    placePetOptions?: Record<string, unknown> | string[];
    placePets?: Record<string, unknown> | string[];
    placeAverageRating?: number;
    criteriaDefinition?: Record<string, { label: string; min?: number; max?: number; step?: number; ponderable?: boolean }>;
    authorId?: string;
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

async function fetchListDetails(listId: string): Promise<{ list: ListEntity; reviews: ReviewEntity[]; sublists: ListEntity[] }> {
    const listRef = doc(db, 'lists', listId);
    const listSnap = await getDoc(listRef);

    if (!listSnap.exists()) throw new Error('Lista no encontrada');

    const listData = listSnap.data();
    let finalList: ListEntity = { id: listSnap.id, ...listData } as ListEntity;

    const { getAuth } = await import('firebase/auth');
    const currentUser = getAuth().currentUser;
    const isOwner = !!(currentUser && listData.userId === currentUser.uid);
    const listReviewVisibility = listData.isPublic === true || listData.visibility === 'public'
        ? 'public'
        : 'private';
    const listReviewConstraints = [where('visibility', '==', listReviewVisibility)];

    if (listData?.parentListId) {
        try {
            const parentSnap = await getDoc(doc(db, 'lists', listData.parentListId));
            if (parentSnap.exists()) {
                finalList = { ...finalList, parentListName: parentSnap.data().name };
            }
        } catch { /* no-op */ }
    }

    const safeGetDocs = async (load: () => Promise<any>) => {
        try { return await load(); } catch (e: any) {
            if (e?.code !== 'permission-denied') console.warn('Failed to load reviews', e);
            return null;
        }
    };

    const reviewMap = new Map<string, ReviewEntity>();
    const appendSnapshot = (snap: any, fallbackListId: string) => {
        if (!snap) return;
        snap.docs.forEach((reviewDoc: any) => {
            const data = reviewDoc.data() as any;
            const resolvedListId = typeof data.listId === 'string' && data.listId.trim().length > 0
                ? data.listId : fallbackListId;
            reviewMap.set(reviewDoc.id, { id: reviewDoc.id, ...data, listId: resolvedListId } as ReviewEntity);
        });
    };

    const canViewReview = (review: any) => {
        if (isOwner) return true;
        if (review.visibility !== 'private') return true;
        if (!currentUser) return false;
        return review.userId === currentUser.uid || review.authorId === currentUser.uid;
    };

    // Las reseñas viven solo en lists/{listId}/reviews (la colección raíz
    // legacy reviews/ está vacía y ya no se consulta — ver docs/REVIEWS-MIGRATION.md).
    if (listData?.parentListId) {
        const parentListId = listData.parentListId;
        const [nestedParent, nestedLegacyOwn] = await Promise.all([
            safeGetDocs(() => getDocs(query(
                collection(db, 'lists', parentListId, 'reviews'),
                where('sublistId', '==', listId),
                ...listReviewConstraints,
            ))),
            safeGetDocs(() => getDocs(query(
                collection(db, 'lists', listId, 'reviews'),
                ...listReviewConstraints,
            ))),
        ]);
        appendSnapshot(nestedLegacyOwn, listId);
        appendSnapshot(nestedParent, parentListId);
    } else {
        const nestedMain = await safeGetDocs(() => getDocs(query(
            collection(db, 'lists', listId, 'reviews'),
            ...listReviewConstraints,
        )));
        appendSnapshot(nestedMain, listId);
    }

    const rawReviews = Array.from(reviewMap.values())
        .filter(canViewReview)
        .sort((a: any, b: any) => toMillis(b.createdAt) - toMillis(a.createdAt));

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
                if (e.code !== 'permission-denied') console.warn(`Failed to fetch ${collectionName} ${id}`, e);
            }
        }));
        return map;
    };

    const [placesMap, usersMap] = await Promise.all([
        fetchDocsMap('places', placeIds),
        fetchDocsMap('publicProfiles', userIds),
    ]);

    const enrichedReviews = rawReviews.map(review => {
        const place = review.placeId ? placesMap[review.placeId] : null;
        const userId = review.userId || review.authorId;
        const user = userId ? usersMap[userId] : null;
        const legacyReview = review as any;

        let city = place?.city;
        if (!city && place?.addressComponents) {
            const locality = place.addressComponents.find((c: any) => c.types.includes('locality'));
            if (locality) city = locality.long_name;
        }

        return {
            ...review,
            listName: (listSnap.data() as ListEntity).name,
            categoryId: legacyReview.categoryId || (listSnap.data() as ListEntity).categoryId,
            criteriaDefinition: (listSnap.data() as ListEntity).criteriaDefinition,
            placeName: place?.name || legacyReview.establishmentName || review.placeName,
            placeAddress: place?.address || place?.formattedAddress || place?.vicinity,
            placeCity: city,
            placeMainImage: firstUsablePlaceImage(place?.userPhotoUrl, place?.mainImageUrl, place?.photos),
            placeAverageRating: place?.rating || place?.avgScore,
            placeClosedStatus: place?.closedStatus || place?.googleBusinessStatus || place?.businessStatus || null,
            placePetOptions: place?.businessPetOptions || place?.petOptions || place?.pets,
            authorName: user?.username || user?.displayName || user?.name || review.authorName,
            authorPhoto: user?.photoUrl || user?.photoURL || review.authorPhoto,
            lat: place?.location?.latitude || legacyReview.lat || review.lat,
            lng: place?.location?.longitude || legacyReview.lng || review.lng,
            tags: legacyReview.userTags || review.tags || [],
        };
    });

    let sublists: ListEntity[] = [];
    try {
        const listsRef = collection(db, 'lists');
        const sublistsQ = isOwner
            ? query(listsRef, where('parentListId', '==', listId))
            : query(listsRef, where('parentListId', '==', listId), where('isPublic', '==', true));
        const sublistsSnap = await getDocs(sublistsQ);
        sublists = sublistsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ListEntity[];
    } catch (subErr: any) {
        if (subErr.code !== 'permission-denied' && subErr.code !== 'failed-precondition') {
            console.warn('Could not fetch sublists:', subErr);
        }
    }

    return { list: finalList, reviews: enrichedReviews, sublists };
}

export const useListDetails = (listId: string | undefined) => {
    const q = useQuery({
        queryKey: ['listDetails', listId],
        enabled: !!listId,
        queryFn: () => fetchListDetails(listId!),
        retry: (failureCount, error: any) => error?.code === 'permission-denied' ? false : failureCount < 1,
    });

    const errorMsg = q.error
        ? ((q.error as any)?.code === 'permission-denied' ? 'private' : (q.error as Error).message)
        : null;

    return {
        list: q.data?.list ?? null,
        reviews: q.data?.reviews ?? [],
        sublists: q.data?.sublists ?? [],
        loading: q.isLoading,
        error: errorMsg,
    };
};
