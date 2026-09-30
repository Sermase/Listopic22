import { algoliasearch } from 'algoliasearch';

const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
const apiKey = import.meta.env.VITE_ALGOLIA_SEARCH_KEY;

export const isAlgoliaConfigured = Boolean(appId && apiKey);

// Sin credenciales, algoliasearch() lanza una excepción al importarse y tumbaba
// cualquier página que lo usara (la Home incluida). Con este cliente de
// reserva las búsquedas fallan de forma controlada y la interfaz lo explica.
const unavailable = () => Promise.reject(new Error('La búsqueda no está disponible (faltan credenciales de Algolia).'));

if (!isAlgoliaConfigured) {
    console.error("Algolia credentials missing in environment variables.");
}

export const algoliaClient = isAlgoliaConfigured
    ? algoliasearch(appId, apiKey)
    : ({ search: unavailable, searchForHits: unavailable, searchForFacets: unavailable } as unknown as ReturnType<typeof algoliasearch>);

export const INDEX_NAMES = {
    lists: "lists",
    places: "places",
    users: "users",
    items: "grouped_items"
};
