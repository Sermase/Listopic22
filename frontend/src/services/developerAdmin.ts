// Developer (solo jefe): valoraciones y usuarios por el servidor
// (functions/modules/admin/admin-reviews.js). No dependen de las reglas de Firestore.
import { getFunctions, httpsCallable } from 'firebase/functions';

const call = async <T,>(name: string, data: Record<string, unknown>): Promise<T> => {
    const fn = httpsCallable(getFunctions(undefined, 'europe-west1'), name);
    return (await fn(data)).data as T;
};

export interface AdminReviewRow {
    path: string;
    id: string;
    legacy: boolean;
    listId: string | null;
    listName: string | null;
    sublistId: string | null;
    sublistName: string | null;
    userId: string | null;
    authorName: string | null;
    authorIsBot: boolean;
    authorUserType: string[];
    itemName: string | null;
    placeId: string | null;
    placeName: string | null;
    overallRating: number | null;
    visibility: 'public' | 'private';
    comment: string;
    tags: string[];
    photos: string[];
    createdAtMs: number | null;
    updatedAtMs: number | null;
}

export interface AdminReviewSearch {
    userId?: string;
    placeId?: string;
    listId?: string;
    text?: string;
    visibility?: '' | 'public' | 'private';
    limit?: number;
    /** Además del resumen, el documento entero (la auditoría de Reseñas mira campos antiguos). */
    full?: boolean;
}

export const adminSearchReviews = (params: AdminReviewSearch) =>
    call<{ reviews: Array<AdminReviewRow & Record<string, unknown>>; total: number; scanned: number; truncated: boolean }>('adminSearchReviews', { ...params });

export interface AdminCriterion { id: string; label?: string; order?: number; ponderable?: boolean; isPonderable?: boolean; weight?: number }

export interface AdminReviewDetail {
    review: Record<string, unknown> & { path: string; id: string };
    list: { id: string; name: string; visibility: string; parentListId: string | null; userId: string | null } | null;
    sublist: { id: string; name: string; visibility: string; parentListId: string | null } | null;
    place: { id: string; name: string | null; city: string | null; address: string | null } | null;
    author: { uid: string; name: string | null; photoUrl: string | null; userType: string[] | string } | null;
    scoring: { criteria: AdminCriterion[]; weights: Record<string, number> | null };
}

export const adminGetReview = (path: string) => call<AdminReviewDetail>('adminGetReview', { path });

export interface AdminReviewChanges {
    itemName?: string;
    comment?: string;
    tags?: string[];
    scores?: Record<string, number | null>;
    overallRating?: number;
    authorUid?: string;
}

export const adminUpdateReview = (path: string, changes: AdminReviewChanges, reason: string) =>
    call<{ changed: string[]; recounted: Array<{ uid: string; reviewsCount: number; photosCount: number }>; review: AdminReviewRow }>(
        'adminUpdateReview', { path, changes: { ...changes }, reason },
    );

export interface AdminUserRow {
    uid: string;
    username: string | null;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
    userType: string[];
    reviewsCount: number;
    level: number;
}

export const adminSearchUsers = (q: string, limit = 20) => call<{ users: AdminUserRow[] }>('adminSearchUsers', { q, limit });

export interface AdminUserOverview {
    user: Record<string, unknown> & { uid: string };
    publicProfile: Record<string, unknown> | null;
    stats: {
        reviews: number; publicReviews: number; privateReviews: number; withPhotos: number;
        averageRating: number | null; places: number; lists: number; minilists: number;
        followers: number | null; following: number | null; followingLists: number | null;
        placePhotos: number | null; storedReviewsCount: number; storedPhotosCount: number;
    };
    reviews: AdminReviewRow[];
    lists: Array<{ id: string; name: string; visibility: string; parentListId: string | null; reviewCount: number; itemCount: number; followersCount: number }>;
    placePhotos: Array<Record<string, unknown> & { path: string }>;
    businessPlaces: Array<{ id: string; name: string }>;
}

export const adminUserOverview = (uid: string) => call<AdminUserOverview>('adminUserOverview', { uid });

export const formatAdminDate = (ms: number | null | undefined): string => (ms
    ? new Date(ms).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—');

export const userLabel = (u: { username?: string | null; displayName?: string | null; email?: string | null; uid: string }) =>
    u.username || u.displayName || u.email || u.uid;
