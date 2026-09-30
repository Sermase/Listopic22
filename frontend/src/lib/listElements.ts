/**
 * Elementos de una Lista y sus puestos, calculados igual en la página de la
 * Lista y en la ficha del sitio (misma agrupación, mismos filtros por defecto,
 * misma fórmula de ranking).
 */
import { isClosedPlaceStatus } from '../utils/placeStatus';
import { contextualRanks, type ContextRank, type GeoFields } from './geoAreas';
import { compareByRank, reviewScoreForList, type CriteriaInput, type ReviewLike } from './scoring';

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

/** Clave de agrupación: la misma que usa la página de la Lista. */
export function elementKey(review: Pick<ListReviewForRanking, 'placeId' | 'itemName'>, grouping: ListGrouping): string {
    const item = (review.itemName || '').trim().toLowerCase();
    if (grouping === 'dish') return review.placeId ? `${review.placeId}_${item}` : item;
    return review.placeId || item || 'unknown';
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
        const key = elementKey(review, grouping);
        const score = reviewScoreForList(review, list).score ?? 0;
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
    })).sort(compareByRank);

    const contexts = contextualRanks(elements);
    return elements.map((element, index) => ({
        ...element,
        rank: index + 1,
        contextRanks: contexts.get(element.id) ?? [],
    }));
}
