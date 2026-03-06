import { algoliasearch } from 'algoliasearch';

const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
const apiKey = import.meta.env.VITE_ALGOLIA_SEARCH_KEY;

type LegacySearchRequest = {
    indexName: string;
    params?: Record<string, unknown>;
    query?: string;
};

type ObjectSearchRequest = {
    requests?: LegacySearchRequest[];
};

type SearchInput = LegacySearchRequest[] | ObjectSearchRequest;

const buildEmptyResults = (requests: LegacySearchRequest[] = []) =>
    requests.map((request) => ({
        // InstantSearch can send facet-style searches through `search`.
        ...(request as { type?: string }).type === 'facet'
            ? {
                facetHits: [],
                exhaustiveFacetsCount: true,
            }
            : {},
        hits: [],
        nbHits: 0,
        page: 0,
        nbPages: 0,
        hitsPerPage: 20,
        processingTimeMS: 0,
        exhaustiveNbHits: false,
        query: request.query || '',
        params: ''
    }));

const disabledAlgoliaClient = {
    search: async (input: SearchInput) => {
        const requests = Array.isArray(input) ? input : (input.requests || []);
        return { results: buildEmptyResults(requests) };
    },
    searchForFacetValues: async (request: unknown) => {
        if (Array.isArray(request)) {
            return request.map(() => ({
                facetHits: [],
                exhaustiveFacetsCount: true,
                processingTimeMS: 0
            }));
        }
        return {
            facetHits: [],
            exhaustiveFacetsCount: true,
            processingTimeMS: 0
        };
    },
    searchForFacets: async () => {
        return {
            facetHits: [],
            exhaustiveFacetsCount: true,
            processingTimeMS: 0
        };
    },
    addAlgoliaAgent: () => {
        // no-op: keeps compatibility with InstantSearch client expectations
    }
};

export const isAlgoliaEnabled = Boolean(appId && apiKey);

if (!isAlgoliaEnabled) {
    console.warn('[Algolia] Credenciales no configuradas. La búsqueda en Algolia quedará desactivada.');
}

export const algoliaClient: ReturnType<typeof algoliasearch> = isAlgoliaEnabled
    ? algoliasearch(appId as string, apiKey as string)
    : (disabledAlgoliaClient as unknown as ReturnType<typeof algoliasearch>);

export const INDEX_NAMES = {
    lists: "lists",
    places: "places",
    users: "users",
    items: "grouped_items"
};
