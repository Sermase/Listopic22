/**
 * Elementos de una Lista y sus puestos, calculados igual en la página de la
 * Lista, la ficha del sitio y Buscar (misma agrupación, mismos filtros por
 * defecto, misma fórmula de ranking).
 * Espejo en functions/modules/lib/list-elements.js; los dos pasan los mismos
 * vectores (listElements.vectors.json).
 */
import { isClosedPlaceStatus, resolveClosedStatus } from '../utils/placeStatus';
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
    /** El sitio ya no sirve este plato (places.unavailableItems). */
    itemUnavailable?: boolean;
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
    /** Platos que el sitio ya no sirve (nombres tal cual se reportaron). */
    unavailableItems?: unknown;
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

/** Estado de cierre de un sitio, solo si está cerrado (Google pone «OPERATIONAL» a los abiertos). */
export function placeClosedStatus(place: PlaceDocLike | null | undefined): string | null {
    const text = (value: unknown) => (typeof value === 'string' ? value : null);
    return resolveClosedStatus(text(place?.closedStatus), text(place?.googleBusinessStatus), text(place?.businessStatus));
}

/** El sitio ya no sirve este plato: se compara por nombre normalizado («Pincho» = «pincho»). */
export function isItemUnavailable(place: PlaceDocLike | null | undefined, itemName: unknown): boolean {
    const list = place?.unavailableItems;
    if (!Array.isArray(list) || list.length === 0) return false;
    const key = normalizeItemName(itemName);
    return Boolean(key) && list.some((name) => normalizeItemName(name) === key);
}

/** Fuera de la vista por defecto: sitio cerrado o plato que ya no sirven. */
export function isUnavailableEntry(entry: { placeClosedStatus?: string | null; itemUnavailable?: boolean } | null | undefined): boolean {
    return Boolean(entry && (entry.itemUnavailable === true || isClosedPlaceStatus(entry.placeClosedStatus)));
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
 * Agrupa las reseñas visibles en elementos, calcula su nota (media de las
 * notas de la gente, con la regla madre/Minilista) y los ordena con la fórmula
 * única. Por defecto, igual que la Lista: sin bots y sin sitios cerrados.
 * Las reseñas deben llegar ya filtradas por visibilidad (en una Lista
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
        if (!options.includeClosed && isUnavailableEntry(review)) return;
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

/** Un elemento del resumen de puestos que guardan las Functions (listRankings/{listId}). */
export interface StoredRankingElement {
    id: string;
    placeId?: string;
    itemName?: string;
    average: number;
    count: number;
    city?: string;
    province?: string;
    region?: string;
    country?: string;
}

/**
 * Puestos a partir del resumen ya ordenado (functions/modules/lib/list-ranking.js):
 * mismo resultado que rankListElements con la Lista entera, leyendo 1 documento.
 */
export function rankedElementsFromRanking(elements: ReadonlyArray<StoredRankingElement>): RankedElement[] {
    const base = elements.map((e) => ({
        id: e.id,
        placeId: e.placeId,
        itemName: e.itemName ?? '',
        average: e.average,
        count: e.count,
        city: e.city,
        province: e.province,
        region: e.region,
        country: e.country,
    }));
    const contexts = contextualRanks(base);
    return base.map((element, index) => ({ ...element, rank: index + 1, contextRanks: contexts.get(element.id) ?? [] }));
}
