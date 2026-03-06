import { algoliasearch } from 'algoliasearch';

const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
const apiKey = import.meta.env.VITE_ALGOLIA_SEARCH_KEY;

if (!appId || !apiKey) {
    console.error("Algolia credentials missing in environment variables.");
}

export const algoliaClient = algoliasearch(appId || '', apiKey || '');

export const INDEX_NAMES = {
    lists: "lists",
    places: "places",
    users: "users",
    items: "grouped_items"
};
