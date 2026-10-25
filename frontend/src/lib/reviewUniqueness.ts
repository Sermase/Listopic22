/**
 * Una persona, una reseña por elemento (sitio + plato) en cada lista.
 * Las públicas (lista y Minilistas públicas) cuentan juntas en el ranking, así
 * que comparten hueco; cada Minilista privada es un hueco aparte.
 * Espejo de functions/modules/lib/review-uniqueness.js.
 */
import { normalizeItemName } from './listElements';

export interface ReviewForUniqueness {
    userId?: unknown;
    listId?: unknown;
    sublistId?: unknown;
    visibility?: unknown;
    placeId?: unknown;
    itemName?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Clave del hueco de una reseña; null si le falta autor, lista, sitio o plato. */
export function reviewSlotKey(review: ReviewForUniqueness): string | null {
    const userId = text(review.userId);
    const listId = text(review.listId);
    const placeId = text(review.placeId);
    const item = normalizeItemName(review.itemName);
    if (!userId || !listId || !placeId || placeId === 'unknown' || !item) return null;
    const scope = review.visibility === 'private' ? `private:${text(review.sublistId) || listId}` : 'public';
    return `${userId}|${listId}|${scope}|${placeId}|${item}`;
}

/** Reseña propia que ya ocupa el hueco de `candidate` (sin contar la que se edita). */
export function findSameElementReview<T extends ReviewForUniqueness & { id: string }>(
    candidate: ReviewForUniqueness,
    ownReviews: readonly T[],
    excludeId?: string | null,
): T | null {
    const key = reviewSlotKey(candidate);
    if (!key) return null;
    return ownReviews.find((review) => review.id !== excludeId && reviewSlotKey(review) === key) ?? null;
}

export interface DuplicateGroup<T> {
    key: string;
    reviews: T[];
}

/** Grupos con más de una reseña en el mismo hueco (para Developer). */
export function groupDuplicateReviews<T extends ReviewForUniqueness>(reviews: readonly T[]): DuplicateGroup<T>[] {
    const groups = new Map<string, T[]>();
    reviews.forEach((review) => {
        const key = reviewSlotKey(review);
        if (!key) return;
        const list = groups.get(key) ?? [];
        list.push(review);
        groups.set(key, list);
    });
    return Array.from(groups.entries())
        .filter(([, list]) => list.length > 1)
        .map(([key, list]) => ({ key, reviews: list }));
}
