import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import { HIDE_BOT_ONLY } from '../components/search/botOnlyFilter';
import { dishFromHit, type DishRef } from './chatExtras';

export const OPEN_ITEMS_FILTER = [
    'NOT placeClosedStatus:permanently_closed',
    'NOT placeClosedStatus:temporarily_closed',
    'NOT placeClosedStatus:CLOSED_PERMANENTLY',
    'NOT placeClosedStatus:CLOSED_TEMPORARILY',
    'NOT placeGoogleBusinessStatus:CLOSED_PERMANENTLY',
    'NOT placeGoogleBusinessStatus:CLOSED_TEMPORARILY',
    HIDE_BOT_ONLY,
].join(' AND ');

/** Busca platos de Listopic, primero los de cerca. */
export async function searchDishes(
    query: string,
    location: { latitude: number; longitude: number } | null,
    extra: { hitsPerPage?: number; aroundRadius?: number; minScore?: number } = {},
): Promise<DishRef[]> {
    const filters = extra.minScore ? `${OPEN_ITEMS_FILTER} AND avgGeneralScore >= ${extra.minScore}` : OPEN_ITEMS_FILTER;
    const geo = location
        ? { aroundLatLng: `${location.latitude}, ${location.longitude}` }
        : { aroundLatLngViaIP: true };
    const response = await algoliaClient.search({
        requests: [{
            indexName: INDEX_NAMES.items,
            query,
            hitsPerPage: extra.hitsPerPage ?? 6,
            filters,
            ...geo,
            aroundRadius: extra.aroundRadius ?? 'all',
        } as never],
    });
    const hits = ((response.results[0] as { hits?: Array<Record<string, unknown>> }).hits) || [];
    return hits.map(dishFromHit).filter((d): d is DishRef => d !== null);
}
