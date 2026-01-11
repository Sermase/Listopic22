export interface ParsedQuery {
    cleanedQuery: string;
    typeHint: 'users' | 'lists' | 'places' | 'items' | null;
    filters: Record<string, string[]>; // key -> values[]
}

export const SearchQueryParser = {
    parse(rawQuery: string): ParsedQuery {
        const tokens = rawQuery.match(/"[^"]+"|\S+/g) || [];
        const searchTokens: string[] = [];
        const parsed: ParsedQuery = {
            cleanedQuery: "",
            typeHint: null,
            filters: {}
        };

        const addFilter = (key: string, value: string) => {
            if (!parsed.filters[key]) {
                parsed.filters[key] = [];
            }
            parsed.filters[key].push(value);
        };

        tokens.forEach(token => {
            if (!token) return;

            // 1. User Mention (@user)
            if (token.startsWith("@") && token.length > 1) {
                parsed.typeHint = "users";
                // Add explicit username filter if needed, or just add to query?
                // Legacy added to query text.
                searchTokens.push(token.slice(1));
                return;
            }

            // 2. Hashtag (#tag) -> Usually implies Items or Lists
            if (token.startsWith("#") && token.length > 1) {
                parsed.typeHint = parsed.typeHint || "items"; // Default to items if # used
                // Treat as text query OR tag filter? Legacy added to query text.
                searchTokens.push(token.slice(1));
                return;
            }

            // 3. Facets (key:value)
            const separatorIndex = token.indexOf(":");
            if (separatorIndex === -1) {
                // Check if it's a known category alias (omitted for now due to lack of dictionary)
                searchTokens.push(token);
                return;
            }

            const rawKey = token.slice(0, separatorIndex).toLowerCase();
            const rawValue = token.slice(separatorIndex + 1).replace(/^"|"$/g, ""); // Remove quotes

            if (!rawKey || !rawValue) {
                searchTokens.push(token);
                return;
            }

            // Map keys
            switch (rawKey) {
                case 'city':
                case 'ciudad':
                    addFilter('city', rawValue);
                    break;
                case 'type':
                case 'tipo':
                    // Type might be a hint (place, user...) or a filter (restaurant, bar)
                    if (['user', 'usuario', 'users'].includes(rawValue)) parsed.typeHint = 'users';
                    else if (['list', 'lista', 'lists'].includes(rawValue)) parsed.typeHint = 'lists';
                    else if (['place', 'lugar', 'places'].includes(rawValue)) parsed.typeHint = 'places';
                    else if (['item', 'elemento', 'items'].includes(rawValue)) parsed.typeHint = 'items';
                    else addFilter('type', rawValue);
                    break;
                case 'price':
                case 'precio':
                    addFilter('priceLevel', rawValue);
                    break;
                case 'service':
                case 'servicio':
                    addFilter('serviceOptions', rawValue);
                    break;
                case 'category':
                case 'categoria':
                    addFilter('category', rawValue);
                    break;
                default:
                    searchTokens.push(token);
            }
        });

        parsed.cleanedQuery = searchTokens.join(" ").trim();
        return parsed;
    }
};
