/**
 * Orden de las reseñas de un sitio o plato: primero las que la gente ha marcado
 * como útiles y tienen texto; a igualdad, la más reciente.
 */
interface OrderableReview {
    comment?: string;
    reactionCounts?: { like?: number };
}

export const usefulScore = (review: OrderableReview): number =>
    (review.comment?.trim() ? review.reactionCounts?.like ?? 0 : 0);

export function compareByUseful<T extends OrderableReview>(toMillis: (r: T) => number) {
    return (a: T, b: T): number => (usefulScore(b) - usefulScore(a)) || (toMillis(b) - toMillis(a));
}
