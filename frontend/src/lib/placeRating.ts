/**
 * Contadores y notas de un sitio, calculados en el servidor
 * (functions/modules/lib/place-rating.js):
 * - nota pública (`averageRating`, `publicHumanReviewsCount`): valoraciones públicas de
 *   personas, sin bots. Es la que se enseña y la única que ordena.
 * - actividad (`totalVisibleReviewsCount`, alias `reviewsCount`): públicas también de bots.
 *   Un sitio solo con bots existe y sale en Buscar, pero «Sin nota pública todavía».
 * - bots (`botAverageRating`, `publicBotReviewsCount`): solo con el filtro «Bots».
 * - críticos verificados: aparte, nunca mezclados con la general.
 * Los documentos anteriores al recálculo solo tienen reviewsCount/averageRating.
 */

/** Por debajo de esto, la nota de críticos se muestra como provisional (igual que el servidor). */
export const CRITIC_MIN_SAMPLE = 3;

export const NO_PUBLIC_RATING_LABEL = 'Sin nota pública todavía';

export interface PlaceRatingFields {
    averageRating?: unknown;
    reviewsCount?: unknown;
    publicHumanReviewsCount?: unknown;
    totalVisibleReviewsCount?: unknown;
    publicBotReviewsCount?: unknown;
    botAverageRating?: unknown;
    criticRating?: unknown;
    criticReviewsCount?: unknown;
    /** Solo en Algolia. */
    hasPublicRating?: unknown;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export interface PlaceRating {
    /** Nota pública (personas); null = «Sin nota pública todavía». */
    average: number | null;
    /** Nº de valoraciones públicas de personas (las de la nota). */
    count: number;
    /** Valoraciones públicas también de bots: el sitio tiene actividad. */
    visibleCount: number;
    bots: { average: number | null; count: number } | null;
    critic: { average: number; count: number; provisional: boolean } | null;
}

export function placeRating(place: PlaceRatingFields | null | undefined): PlaceRating {
    const legacy = num(place?.reviewsCount) ?? 0;
    const count = num(place?.publicHumanReviewsCount) ?? legacy;
    const visibleCount = num(place?.totalVisibleReviewsCount) ?? legacy;
    const average = count > 0 && place?.hasPublicRating !== false ? num(place?.averageRating) : null;
    const botCount = num(place?.publicBotReviewsCount) ?? 0;
    const criticCount = num(place?.criticReviewsCount) ?? 0;
    const criticAverage = num(place?.criticRating);
    return {
        average,
        count: average === null ? 0 : count,
        visibleCount,
        bots: botCount > 0 ? { average: num(place?.botAverageRating), count: botCount } : null,
        critic: criticCount > 0 && criticAverage !== null
            ? { average: criticAverage, count: criticCount, provisional: criticCount < CRITIC_MIN_SAMPLE }
            : null,
    };
}

/**
 * Qué enseña la tarjeta de un sitio en Buscar: la nota pública; si no hay, con el filtro
 * «Bots» la de bots (marcada como tal) y, si no, «Sin nota pública todavía» (null).
 */
export function placeCardScore(place: PlaceRatingFields | null | undefined, showBots: boolean): { avgRating: number | null; reviewCount: number; scoreKind?: 'bot' } {
    const rating = placeRating(place);
    if (rating.average !== null) return { avgRating: rating.average, reviewCount: rating.count };
    if (showBots && rating.bots && rating.bots.average !== null) {
        return { avgRating: rating.bots.average, reviewCount: rating.bots.count, scoreKind: 'bot' };
    }
    return { avgRating: null, reviewCount: 0 };
}
