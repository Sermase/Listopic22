/**
 * Elementos de una Lista y sus puestos, calculados igual en la página de la
 * Lista, la ficha del sitio y Buscar (misma agrupación, mismos filtros por
 * defecto, misma fórmula de ranking).
 * Espejo en functions/modules/lib/list-elements.js; los dos pasan los mismos
 * vectores (listElements.vectors.json).
 */
import { isClosedPlaceStatus } from '../utils/placeStatus';
import { contextualRanks, normalizeCcaa, normalizeCountry, type ContextRank, type GeoFields } from './geoAreas';
import { compareElementsByRank, reviewScoreForList, type CriteriaInput, type ReviewLike } from './scoring';

export type ListGrouping = 'dish' | 'place';

export interface ListReviewForRanking extends ReviewLike {
    placeId?: string;
    itemName?: string;
    placeName?: string;
    placeCity?: string;
    placeProvince?: string;
    placeRegion?: string;
    placeCountry?: string;
    placeClosedStatus?: string | null;
    userId?: string;
    authorId?: string;
}

export interface ListForRanking {
    criteriaDefinition?: CriteriaInput;
    parentListId?: unknown;
    scoringWeights?: Readonly<Record<string, unknown>> | null;
}

/** Nombre de elemento comparable: sin tildes, mayúsculas ni signos («Bravás!» = «bravas»). */
export function normalizeItemName(name: unknown): string {
    return String(name ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Clave de agrupación: sitio + nombre normalizado (dos locales de una cadena son dos elementos). */
export function elementKey(review: Pick<ListReviewForRanking, 'placeId' | 'itemName'>, grouping: ListGrouping): string {
    const item = normalizeItemName(review.itemName);
    if (grouping === 'dish') return review.placeId ? `${review.placeId}_${item}` : item;
    return review.placeId || item || 'unknown';
}

/** Lo que se usa de un documento `places/{id}`. */
export interface PlaceDocLike {
    city?: unknown;
    province?: unknown;
    region?: unknown;
    country?: unknown;
    addressComponents?: unknown;
    closedStatus?: unknown;
    googleBusinessStatus?: unknown;
    businessStatus?: unknown;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Zona de un sitio: la ciudad cae a la «locality» de Google; CCAA y país, normalizados. */
export function placeGeoFields(place: PlaceDocLike | null | undefined): { city: string; province: string; region: string; country: string } {
    let city = text(place?.city);
    if (!city && Array.isArray(place?.addressComponents)) {
        const locality = (place.addressComponents as Array<{ long_name?: unknown; types?: unknown }>)
            .find((c) => Array.isArray(c?.types) && c.types.includes('locality'));
        city = text(locality?.long_name);
    }
    return { city, province: text(place?.province), region: normalizeCcaa(place?.region), country: normalizeCountry(place?.country) };
}

/** Estado de cierre de un sitio (el primero que haya). */
export function placeClosedStatus(place: PlaceDocLike | null | undefined): string | null {
    const status = place?.closedStatus || place?.googleBusinessStatus || place?.businessStatus;
    return typeof status === 'string' && status ? status : null;
}

export interface RankedElement extends GeoFields {
    id: string;
    placeId?: string;
    itemName: string;
    average: number;
    count: number;
    /** Puesto en toda la Lista (sin filtrar por zona). */
    rank: number;
    contextRanks: ContextRank[];
}

/**
 * Agrupa las valoraciones visibles en elementos, calcula su nota (media de las
 * notas de la gente, con la regla madre/Minilista) y los ordena con la fórmula
 * única. Por defecto, igual que la Lista: sin bots y sin sitios cerrados.
 * Las valoraciones deben llegar ya filtradas por visibilidad (en una Lista
 * pública, solo las públicas: una Minilista privada no cuenta en la madre).
 */
export function rankListElements(
    reviews: ReadonlyArray<ListReviewForRanking>,
    list: ListForRanking | null | undefined,
    options: { grouping?: ListGrouping; excludeAuthorIds?: ReadonlySet<string>; includeClosed?: boolean } = {},
): RankedElement[] {
    const grouping = options.grouping ?? 'dish';
    const groups = new Map<string, { total: number; count: number; first: ListReviewForRanking }>();
    reviews.forEach((review) => {
        const author = review.userId || review.authorId;
        if (author && options.excludeAuthorIds?.has(author)) return;
        if (!options.includeClosed && isClosedPlaceStatus(review.placeClosedStatus)) return;
        // Sin nota no puntúa ni cuenta (antes contaba como un 0).
        const score = reviewScoreForList(review, list).score;
        if (score === null) return;
        const key = elementKey(review, grouping);
        const group = groups.get(key);
        if (group) {
            group.total += score;
            group.count += 1;
        } else {
            groups.set(key, { total: score, count: 1, first: review });
        }
    });

    const elements = [...groups.entries()].map(([id, g]) => ({
        id,
        placeId: g.first.placeId,
        itemName: grouping === 'dish' ? (g.first.itemName || g.first.placeName || '') : (g.first.placeName || g.first.itemName || ''),
        average: g.total / g.count,
        count: g.count,
        city: g.first.placeCity,
        province: g.first.placeProvince,
        region: g.first.placeRegion,
        country: g.first.placeCountry,
    })).sort(compareElementsByRank);

    const contexts = contextualRanks(elements);
    return elements.map((element, index) => ({
        ...element,
        rank: index + 1,
        contextRanks: contexts.get(element.id) ?? [],
    }));
}
