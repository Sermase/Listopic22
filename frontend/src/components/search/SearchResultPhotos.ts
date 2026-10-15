import { useEffect, useMemo, useState } from 'react';
import { collectionGroup, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { firstUsablePlaceImage } from '../../utils/placeImages';

/**
 * Sitios de Buscar sin foto propia pero con platos fotografiados (hasPhoto): hasta que
 * el índice traiga esa foto (functions/modules/algolia.js), se busca una aquí. Solo
 * valoraciones públicas, pocas lecturas por sitio, y solo para lo que se ve.
 */

export interface PlaceHitLike {
    objectID: string;
    hasPhoto?: boolean;
    thumbnailUrl?: string;
    mainImageUrl?: string;
    photoUrl?: string;
    coverUrl?: string;
    imageUrl?: string;
}

export interface ReviewPhotoSource {
    visibility?: unknown;
    overallRating?: unknown;
    photoUrl?: unknown;
    photoUrls?: unknown;
}

/** Máximo de sitios que se consultan de una vez (cada uno, como mucho REVIEWS_PER_PLACE lecturas). */
export const MAX_LOOKUPS_PER_BATCH = 12;
const REVIEWS_PER_PLACE = 6;

export function hitPhoto(hit: PlaceHitLike): string | null {
    return hit.thumbnailUrl ?? hit.mainImageUrl ?? hit.photoUrl ?? hit.coverUrl ?? hit.imageUrl ?? null;
}

/** La foto de la valoración pública con mejor nota (nunca una privada ni una de Google). */
export function pickReviewPhoto(reviews: ReviewPhotoSource[]): string | null {
    let best: string | null = null;
    let bestRating = -Infinity;
    for (const review of reviews) {
        if (review.visibility !== 'public') continue;
        const url = firstUsablePlaceImage(review.photoUrls, review.photoUrl);
        if (!url) continue;
        const rating = typeof review.overallRating === 'number' && Number.isFinite(review.overallRating) ? review.overallRating : 0;
        if (rating > bestRating) {
            best = url;
            bestRating = rating;
        }
    }
    return best;
}

/** Sitios visibles que necesitan foto y que aún no se han consultado. */
export function placesNeedingPhoto(hits: PlaceHitLike[], known: ReadonlyMap<string, unknown>, max = MAX_LOOKUPS_PER_BATCH): string[] {
    const ids: string[] = [];
    for (const hit of hits) {
        if (ids.length >= max) break;
        if (hit.hasPhoto !== true || hitPhoto(hit) || known.has(hit.objectID) || ids.includes(hit.objectID)) continue;
        ids.push(hit.objectID);
    }
    return ids;
}

// Caché de la sesión: placeId → foto (o null si no hay ninguna utilizable).
const photoCache = new Map<string, Promise<string | null> | string | null>();

async function fetchPlaceReviewPhoto(placeId: string): Promise<string | null> {
    try {
        const snap = await getDocs(query(
            collectionGroup(db, 'reviews'),
            where('placeId', '==', placeId),
            where('visibility', '==', 'public'),
            limit(REVIEWS_PER_PLACE),
        ));
        return pickReviewPhoto(snap.docs.map((d) => d.data() as ReviewPhotoSource));
    } catch {
        return null;
    }
}

function lookup(placeId: string): Promise<string | null> {
    const cached = photoCache.get(placeId);
    if (cached instanceof Promise) return cached;
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = fetchPlaceReviewPhoto(placeId).then((url) => {
        photoCache.set(placeId, url);
        return url;
    });
    photoCache.set(placeId, pending);
    return pending;
}

/** placeId → foto de respaldo, para los sitios visibles que no traen foto. */
export function usePlaceHitPhotos(hits: PlaceHitLike[]): Record<string, string> {
    const [photos, setPhotos] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        photoCache.forEach((value, key) => { if (typeof value === 'string') initial[key] = value; });
        return initial;
    });

    const idsKey = useMemo(() => {
        const settled = new Map<string, unknown>();
        photoCache.forEach((value, key) => { if (!(value instanceof Promise)) settled.set(key, value); });
        return placesNeedingPhoto(hits, settled).join('|');
    }, [hits]);

    useEffect(() => {
        if (!idsKey) return;
        // Sin cancelar: lo encontrado sirve igual aunque cambien los resultados.
        const ids = idsKey.split('|');
        void Promise.all(ids.map(async (id) => [id, await lookup(id)] as const)).then((entries) => {
            const found = entries.filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string');
            if (found.length === 0) return;
            setPhotos((prev) => {
                const next = { ...prev };
                found.forEach(([id, url]) => { next[id] = url; });
                return next;
            });
        });
    }, [idsKey]);

    return photos;
}
