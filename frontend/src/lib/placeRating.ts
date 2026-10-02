/**
 * Nota pública de un sitio, calculada en el servidor
 * (functions/modules/lib/place-rating.js): solo valoraciones públicas, sin
 * bots; la de críticos verificados va aparte y nunca se mezcla con la general.
 */

/** Por debajo de esto, la nota de críticos se muestra como provisional (igual que el servidor). */
export const CRITIC_MIN_SAMPLE = 3;

export interface PlaceRatingFields {
    averageRating?: unknown;
    reviewsCount?: unknown;
    criticRating?: unknown;
    criticReviewsCount?: unknown;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export interface PlaceRating {
    average: number | null;
    count: number;
    critic: { average: number; count: number; provisional: boolean } | null;
}

export function placeRating(place: PlaceRatingFields | null | undefined): PlaceRating {
    const count = num(place?.reviewsCount) ?? 0;
    const criticCount = num(place?.criticReviewsCount) ?? 0;
    const criticAverage = num(place?.criticRating);
    return {
        average: count > 0 ? num(place?.averageRating) : null,
        count,
        critic: criticCount > 0 && criticAverage !== null
            ? { average: criticAverage, count: criticCount, provisional: criticCount < CRITIC_MIN_SAMPLE }
            : null,
    };
}
