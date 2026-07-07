// Match de sabor: % de afinidad entre dos usuarios basado SOLO en coincidencias
// reales — mismos lugares (y mejor aún, mismos platos) valorados por ambos.
//
// Reglas del algoritmo (deliberadas):
// 1. Sin lugares en común NO hay porcentaje (se devuelve null). Que alguien
//    reseñe mucho, tenga seguidores o comparta "categoría" no es afinidad.
// 2. La base del % es la similitud de notas en los lugares comunes:
//    sim = 1 - |diferencia| / 5 (diferencias de 5+ puntos = 0 similitud).
// 3. La confianza crece con la evidencia: 1 solo lugar común no puede dar un
//    porcentaje alto por sí solo (factor 0.5 → 1 según nº de coincidencias).
// 4. Coincidir en el MISMO plato del mismo sitio suma un plus.

export interface TasteReview {
    placeId?: string;
    itemName?: string;
    overallRating?: number;
}

export interface TasteMatchResult {
    score: number;
    sharedPlaces: number;
    sharedItems: number;
    avgSimilarity: number;
    reason: string;
}

const normalizeName = (value: string): string => value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ratingOf = (review: TasteReview): number | null =>
    typeof review.overallRating === 'number' && Number.isFinite(review.overallRating)
        ? review.overallRating
        : null;

export const computeTasteMatch = (
    ownReviews: TasteReview[],
    otherReviews: TasteReview[],
): TasteMatchResult | null => {
    if (ownReviews.length === 0 || otherReviews.length === 0) return null;

    // Nota media propia por lugar y set de platos propios (lugar + nombre).
    const ownByPlace = new Map<string, { total: number; count: number }>();
    const ownItems = new Set<string>();
    ownReviews.forEach((review) => {
        if (!review.placeId) return;
        const rating = ratingOf(review);
        if (rating !== null) {
            const bucket = ownByPlace.get(review.placeId) || { total: 0, count: 0 };
            bucket.total += rating;
            bucket.count += 1;
            ownByPlace.set(review.placeId, bucket);
        }
        if (review.itemName) ownItems.add(`${review.placeId}::${normalizeName(review.itemName)}`);
    });

    if (ownByPlace.size === 0) return null;

    const otherByPlace = new Map<string, { total: number; count: number }>();
    const sharedItems = new Set<string>();
    otherReviews.forEach((review) => {
        if (!review.placeId) return;
        const rating = ratingOf(review);
        if (rating !== null && ownByPlace.has(review.placeId)) {
            const bucket = otherByPlace.get(review.placeId) || { total: 0, count: 0 };
            bucket.total += rating;
            bucket.count += 1;
            otherByPlace.set(review.placeId, bucket);
        }
        if (review.itemName) {
            const key = `${review.placeId}::${normalizeName(review.itemName)}`;
            if (ownItems.has(key)) sharedItems.add(key);
        }
    });

    const sharedPlaceIds = Array.from(otherByPlace.keys());
    if (sharedPlaceIds.length === 0) return null;

    // Similitud media de notas en los lugares comunes.
    let similarityTotal = 0;
    sharedPlaceIds.forEach((placeId) => {
        const own = ownByPlace.get(placeId)!;
        const other = otherByPlace.get(placeId)!;
        const diff = Math.abs(own.total / own.count - other.total / other.count);
        similarityTotal += Math.max(0, 1 - diff / 5);
    });
    const avgSimilarity = similarityTotal / sharedPlaceIds.length;

    // Confianza: con 1 lugar común el máximo es ~55%; con 4+ se libera el 100%.
    const confidence = 0.5 + 0.5 * Math.min(1, sharedPlaceIds.length / 4);
    const itemBonus = Math.min(15, sharedItems.size * 5);
    const score = Math.min(100, Math.round(100 * avgSimilarity * confidence + itemBonus));

    if (score <= 0) return null;

    const similarityLabel = avgSimilarity >= 0.8 ? 'notas muy parecidas'
        : avgSimilarity >= 0.55 ? 'notas parecidas'
            : 'gustos distintos en lo común';
    const reasons = [
        `${sharedPlaceIds.length} sitio${sharedPlaceIds.length === 1 ? '' : 's'} en común`,
        sharedItems.size > 0 ? `${sharedItems.size} plato${sharedItems.size === 1 ? '' : 's'} compartido${sharedItems.size === 1 ? '' : 's'}` : '',
        similarityLabel,
    ].filter(Boolean);

    return {
        score,
        sharedPlaces: sharedPlaceIds.length,
        sharedItems: sharedItems.size,
        avgSimilarity,
        reason: reasons.slice(0, 2).join(' · '),
    };
};
