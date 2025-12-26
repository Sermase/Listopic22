window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageSearch = (() => {
    const INDEX_NAME_BY_ENTITY = {
        lists: "lists",
        places: "places",
        users: "users",
        items: "grouped_items"
    };

    const RESULT_TYPE_BY_ENTITY = {
        lists: "list",
        places: "place",
        users: "user",
        items: "item"
    };

    const ENTITY_TYPES = ["all", ...Object.keys(INDEX_NAME_BY_ENTITY)];

    const FILTER_DEFINITIONS = {
        lists: [
            { id: "categories", label: "Categorias", type: "facet", attribute: "categoryId", stateKey: "categories", formatValue: formatCategoryLabel, sortByLabel: true, icon: "fas fa-layer-group" },
            {
                id: "reviews",
                label: "Resenas minimas",
                type: "numeric",
                attribute: "reviewCount",
                stateKey: "minReviews",
                icon: "fas fa-star",
                options: [
                    { value: 10, label: "10+" },
                    { value: 25, label: "25+" },
                    { value: 50, label: "50+" }
                ]
            },
            {
                id: "followers",
                label: "Seguidores minimos",
                type: "numeric",
                attribute: "followersCount",
                stateKey: "minFollowers",
                icon: "fas fa-users",
                options: [
                    { value: 100, label: "100+" },
                    { value: 250, label: "250+" },
                    { value: 500, label: "500+" }
                ]
            }
        ],
        places: [
            { id: "cities", label: "Ciudad", type: "facet", attribute: "city", stateKey: "cities", icon: "fas fa-city" },
            { id: "provinces", label: "Provincia", type: "facet", attribute: "province", stateKey: "provinces", icon: "fas fa-map" },
            { id: "services", label: "Servicios", type: "facet", attribute: "serviceOptions", stateKey: "services", icon: "fas fa-concierge-bell" },
            { id: "accessibility", label: "Accesibilidad", type: "facet", attribute: "accessibility", stateKey: "accessibility", icon: "fas fa-universal-access" },
            { id: "priceLevel", label: "Nivel de precios", type: "facet", attribute: "priceLevel", stateKey: "priceLevels", icon: "fas fa-wallet" },
            { id: "placeType", label: "Tipo de lugar", type: "facet", attribute: "types", stateKey: "placeTypes", icon: "fas fa-store" },
            {
                id: "rating",
                label: "Valoracion minima",
                type: "range",
                attribute: "averageRating",
                stateKey: "minRating",
                icon: "fas fa-star",
                min: 0,
                max: 10,
                step: 0.5,
                displaySuffix: "/10"
            }
        ],
        items: [
            { id: "categories", label: "Categoria", type: "facet", attribute: "listCategoryId", stateKey: "categories", formatValue: formatCategoryLabel, sortByLabel: true, icon: "fas fa-tags" },
            { id: "lists", label: "Listas", type: "listSelector", attribute: "listId", stateKey: "lists", icon: "fas fa-list" },
            { id: "baseTags", label: "Etiquetas base", type: "categoryTags", attribute: "listAvailableTags", stateKey: "baseTags", icon: "fas fa-hashtag" },
            { id: "cities", label: "Ciudad", type: "facet", attribute: "placeCity", stateKey: "cities", icon: "fas fa-city" },
            { id: "provinces", label: "Provincia", type: "facet", attribute: "placeProvince", stateKey: "provinces", icon: "fas fa-map" },
            {
                id: "rating",
                label: "Valoracion minima",
                type: "range",
                attribute: "avgGeneralScore",
                stateKey: "minRating",
                icon: "fas fa-star",
                min: 0,
                max: 10,
                step: 0.5,
                displaySuffix: "/10"
            }
        ],
        users: [
            { id: "userType", label: "Tipo de usuario", type: "facet", attribute: "userType", stateKey: "userTypes", icon: "fas fa-id-badge" },
            { id: "residence", label: "Residencia", type: "facet", attribute: "residence", stateKey: "residences", icon: "fas fa-house" },
            { id: "badges", label: "Insignias", type: "facet", attribute: "badges", stateKey: "badges", icon: "fas fa-award" },
            {
                id: "followers",
                label: "Seguidores minimos",
                type: "numeric",
                attribute: "followersCount",
                stateKey: "minFollowers",
                icon: "fas fa-users",
                options: [
                    { value: 10, label: "10+" },
                    { value: 50, label: "50+" },
                    { value: 100, label: "100+" }
                ]
            }
        ]
    };

    function createInitialFilters() {
        return {
            lists: {
                categories: new Set(),
                minReviews: null,
                minFollowers: null
            },
            places: {
                cities: new Set(),
                provinces: new Set(),
                services: new Set(),
                accessibility: new Set(),
                priceLevels: new Set(),
                placeTypes: new Set(),
                minRating: null
            },
            items: {
                lists: new Set(),
                categories: new Set(),
                baseTags: new Set(),
                cities: new Set(),
                provinces: new Set(),
                minRating: null
            },
            users: {
                userTypes: new Set(),
                residences: new Set(),
                badges: new Set(),
                minFollowers: null
            }
        };
    }

    const state = {
        currentSearchQuery: "",
        currentSearchRaw: "",
        currentEntityType: "all",
        isSearching: false,
        searchRequestId: 0,
        smartAppliedFilters: [],
        isFiltersPanelOpen: false,
        filters: createInitialFilters(),
        facetCache: {},
        lastFacetQueryByType: {},
        categoriesLoaded: false,
        categoriesLoadingPromise: null,
        listsCacheByCategory: {},
        listsLoadingByCategory: {},
        listNameById: {}
    };

    const searchClient = algoliasearch(ListopicApp.config.ALGOLIA_APP_ID, ListopicApp.config.ALGOLIA_SEARCH_KEY);

    let mainSearchInput;
    let entityTypeButtons;
    let searchResultsAreaEl;
    let executeSearchBtn;
    let filtersPanelWrapper;
    let filtersPanelEl;
    let clearFiltersBtn;
    let filtersHeaderLabel;
    let filtersToggleBtn;
    let filtersBackdrop;
    let closeFiltersBtn;
    let activeFiltersBarEl;
    let activeFiltersChipsEl;
    let activeFiltersClearBtn;
    let searchResultsMetaEl;
    let debouncedSearch;

    function cacheDOMElements() {
        mainSearchInput = document.getElementById("main-search-input");
        entityTypeButtons = document.querySelectorAll(".entity-type-btn");
        searchResultsAreaEl = document.getElementById("search-results-area");
        executeSearchBtn = document.getElementById("execute-search-btn");
        filtersPanelWrapper = document.getElementById("search-filters-panel");
        filtersPanelEl = document.getElementById("filters-panel-content");
        clearFiltersBtn = document.getElementById("clear-filters-btn");
        filtersHeaderLabel = document.getElementById("filters-header-label");
        filtersToggleBtn = document.getElementById("filters-toggle-btn");
        filtersBackdrop = document.getElementById("filters-backdrop");
        closeFiltersBtn = document.getElementById("close-filters-btn");
        activeFiltersBarEl = document.getElementById("active-filters-bar");
        activeFiltersChipsEl = document.getElementById("active-filters-chips");
        activeFiltersClearBtn = document.getElementById("active-filters-clear");
        searchResultsMetaEl = document.getElementById("search-results-meta");
    }

    function debounce(func, delay) {
        let timeout;
        return function debounced(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function escapeHtml(value) {
        if (typeof value !== "string") {
            return value;
        }
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizeSmartToken(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function parseSmartNumber(value) {
        if (value === null || value === undefined) {
            return null;
        }
        const cleaned = String(value).replace(",", ".").match(/-?\d+(\.\d+)?/);
        if (!cleaned) {
            return null;
        }
        const numericValue = Number(cleaned[0]);
        return Number.isNaN(numericValue) ? null : numericValue;
    }

    function getBaseSearchParams() {
        return {
            typoTolerance: true,
            removeWordsIfNoResults: "allOptional",
            ignorePlurals: true,
            queryType: "prefixLast"
        };
    }

    function getCategoryCache() {
        ListopicApp.state = ListopicApp.state || {};
        ListopicApp.state.categoryCache = ListopicApp.state.categoryCache || {};
        return ListopicApp.state.categoryCache;
    }

    function formatCategoryLabel(categoryId) {
        if (!categoryId) {
            return categoryId;
        }
        const cache = getCategoryCache();
        const entry = cache[categoryId];
        if (!entry) {
            return categoryId;
        }
        const label = [entry.name, entry.displayname, entry.displayName, entry.title, entry.label]
            .find((value) => typeof value === "string" && value.trim());
        return label ? label.trim() : categoryId;
    }

    function extractBaseTagsFromCategory(categoryData) {
        if (!categoryData) {
            return [];
        }
        const raw = categoryData["fixed-tags"] ?? categoryData.fixedTags ?? categoryData.fixed_tags ?? [];
        if (!Array.isArray(raw)) {
            return [];
        }
        const normalized = raw
            .map((tag) => String(tag).trim())
            .filter((tag) => tag.length > 0);
        return Array.from(new Set(normalized));
    }

    async function ensureCategoriesLoaded() {
        const cache = getCategoryCache();
        if (Object.keys(cache).length > 0) {
            state.categoriesLoaded = true;
            return;
        }
        if (state.categoriesLoadingPromise) {
            try {
                await state.categoriesLoadingPromise;
            } catch (_) {
                // Ignorar errores previos
            }
            return;
        }
        const db = ListopicApp.services?.db;
        if (!db) {
            console.warn("page-search: Firestore no disponible para categorias.");
            return;
        }
        state.categoriesLoadingPromise = db.collection("categories").get()
            .then((snapshot) => {
                snapshot.forEach((doc) => {
                    const data = doc.data() || {};
                    const normalizedTags = extractBaseTagsFromCategory(data);
                    cache[doc.id] = { id: doc.id, ...data, _baseTags: normalizedTags };
                });
                state.categoriesLoaded = true;
            })
            .catch((error) => {
                console.warn("page-search: no se pudieron cargar las categorias.", error);
            })
            .finally(() => {
                state.categoriesLoadingPromise = null;
            });
        await state.categoriesLoadingPromise;
    }

    function getBaseTagsForSelectedCategories() {
        const selected = state.filters?.items?.categories;
        if (!(selected instanceof Set) || selected.size === 0) {
            return [];
        }
        const cache = getCategoryCache();
        const tagSet = new Set();
        selected.forEach((categoryId) => {
            const entry = cache[categoryId];
            if (!entry) {
                return;
            }
            const tags = Array.isArray(entry._baseTags) ? entry._baseTags : extractBaseTagsFromCategory(entry);
            tags.forEach((tag) => {
                if (tag) {
                    tagSet.add(tag);
                }
            });
        });
        return Array.from(tagSet).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    }

    function sanitizeItemBaseTags() {
        const baseTagsSet = state.filters?.items?.baseTags;
        if (!(baseTagsSet instanceof Set)) {
            return;
        }
        const selectedCategories = state.filters?.items?.categories;
        if (!(selectedCategories instanceof Set) || selectedCategories.size === 0) {
            if (baseTagsSet.size > 0) {
                baseTagsSet.clear();
            }
            return;
        }
        const allowed = new Set(getBaseTagsForSelectedCategories());
        Array.from(baseTagsSet).forEach((tag) => {
            if (!allowed.has(tag)) {
                baseTagsSet.delete(tag);
            }
        });
    }

    function sanitizeItemLists() {
        const listSet = state.filters?.items?.lists;
        if (!(listSet instanceof Set)) {
            return;
        }
        const categorySet = state.filters?.items?.categories;
        if (!(categorySet instanceof Set) || categorySet.size === 0) {
            if (listSet.size > 0) {
                listSet.clear();
            }
            return;
        }
        const categories = Array.from(categorySet);
        const hasCachedLists = categories.some((categoryId) => Array.isArray(state.listsCacheByCategory[categoryId]));
        if (!hasCachedLists) {
            return;
        }
        const allowed = new Set();
        categories.forEach((categoryId) => {
            const cached = state.listsCacheByCategory[categoryId];
            if (Array.isArray(cached)) {
                cached.forEach((list) => {
                    if (list && list.id) {
                        allowed.add(list.id);
                    }
                });
            }
        });
        if (allowed.size === 0) {
            return;
        }
        Array.from(listSet).forEach((listId) => {
            if (!allowed.has(listId)) {
                listSet.delete(listId);
            }
        });
    }


    function getSelectedItemCategoryIds() {
        const categorySet = state.filters?.items?.categories;
        if (!(categorySet instanceof Set) || categorySet.size === 0) {
            return [];
        }
        return Array.from(categorySet);
    }

    function isLoadingListsForCategories(categoryIds) {
        if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
            return false;
        }
        return categoryIds.some((categoryId) => Boolean(state.listsLoadingByCategory[categoryId]));
    }

    async function ensureListsForCategories(categoryIds) {
        if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
            return;
        }
        const db = ListopicApp.services?.db;
        if (!db) {
            console.warn("page-search: Firestore no disponible para cargar listas por categoría.");
            return;
        }
        const pendingPromises = categoryIds.map((categoryId) => {
            if (Array.isArray(state.listsCacheByCategory[categoryId])) {
                return null;
            }
            if (state.listsLoadingByCategory[categoryId]) {
                return state.listsLoadingByCategory[categoryId];
            }
            const query = db
                .collection("lists")
                .where("categoryId", "==", categoryId)
                .where("isPublic", "==", true)
                .orderBy("followersCount", "desc")
                .limit(50)
                .get()
                .then((snapshot) => {
                    const lists = [];
                    snapshot.forEach((doc) => {
                        const data = doc.data() || {};
                        const entry = {
                            id: doc.id,
                            name: data.name || "Lista sin nombre",
                            followersCount: typeof data.followersCount === "number" ? data.followersCount : 0,
                            reviewCount: typeof data.reviewCount === "number" ? data.reviewCount : 0,
                            categoryId
                        };
                        state.listNameById[doc.id] = entry.name;
                        lists.push(entry);
                    });
                    state.listsCacheByCategory[categoryId] = lists;
                })
                .catch((error) => {
                    console.warn(`page-search: no se pudieron cargar las listas para la categoría ${categoryId}.`, error);
                    state.listsCacheByCategory[categoryId] = [];
                })
                .finally(() => {
                    delete state.listsLoadingByCategory[categoryId];
                });
            state.listsLoadingByCategory[categoryId] = query;
            return query;
        }).filter(Boolean);
        if (pendingPromises.length === 0) {
            return;
        }
        await Promise.allSettled(pendingPromises);
    }

    function getListsForSelectedCategories() {
        const categories = getSelectedItemCategoryIds();
        if (categories.length === 0) {
            return [];
        }
        const listMap = new Map();
        categories.forEach((categoryId) => {
            const cached = state.listsCacheByCategory[categoryId];
            if (!Array.isArray(cached)) {
                return;
            }
            cached.forEach((list) => {
                if (list && list.id && !listMap.has(list.id)) {
                    listMap.set(list.id, list);
                }
            });
        });
        return Array.from(listMap.values()).sort((a, b) => {
            const followersA = typeof a.followersCount === "number" ? a.followersCount : 0;
            const followersB = typeof b.followersCount === "number" ? b.followersCount : 0;
            if (followersA === followersB) {
                return (b.reviewCount || 0) - (a.reviewCount || 0);
            }
            return followersB - followersA;
        });
    }

    function resolveTypeAlias(value) {
        const normalized = normalizeSmartToken(value);
        if (["usuario", "usuarios", "user", "users"].includes(normalized)) {
            return "users";
        }
        if (["lista", "listas", "list", "lists"].includes(normalized)) {
            return "lists";
        }
        if (["lugar", "lugares", "place", "places", "sitio", "sitios"].includes(normalized)) {
            return "places";
        }
        if (["elemento", "elementos", "item", "items"].includes(normalized)) {
            return "items";
        }
        return null;
    }

    function parseSmartQuery(rawQuery) {
        const tokens = typeof rawQuery === "string" ? rawQuery.match(/"[^"]+"|\S+/g) : null;
        const searchTokens = [];
        const parsed = {
            cleanedQuery: "",
            typeHint: null,
            filterTokens: []
        };

        if (!Array.isArray(tokens)) {
            parsed.cleanedQuery = rawQuery || "";
            return parsed;
        }

        tokens.forEach((token) => {
            if (!token) {
                return;
            }
            if (token.startsWith("@") && token.length > 1) {
                parsed.typeHint = "users";
                searchTokens.push(token.slice(1));
                return;
            }
            if (token.startsWith("#") && token.length > 1) {
                parsed.typeHint = parsed.typeHint || "items";
                searchTokens.push(token.slice(1));
                return;
            }
            const separatorIndex = token.indexOf(":");
            if (separatorIndex === -1) {
                searchTokens.push(token);
                return;
            }
            const rawKey = token.slice(0, separatorIndex);
            const rawValue = token.slice(separatorIndex + 1);
            if (!rawKey || !rawValue) {
                searchTokens.push(token);
                return;
            }
            const key = normalizeSmartToken(rawKey);
            const cleanedValue = rawValue.replace(/^\"|\"$/g, "");
            if (!cleanedValue) {
                searchTokens.push(token);
                return;
            }

            const typeAlias = resolveTypeAlias(key);
            if (typeAlias) {
                parsed.typeHint = typeAlias;
                searchTokens.push(cleanedValue);
                return;
            }
            if (key === "tipo" || key === "type") {
                const typeFromValue = resolveTypeAlias(cleanedValue);
                if (typeFromValue) {
                    parsed.typeHint = typeFromValue;
                    return;
                }
                parsed.filterTokens.push({ key: "placeType", value: cleanedValue });
                return;
            }

            if (["ciudad", "city"].includes(key)) {
                parsed.filterTokens.push({ key: "city", value: cleanedValue });
                return;
            }
            if (["provincia", "province", "region"].includes(key)) {
                parsed.filterTokens.push({ key: "province", value: cleanedValue });
                return;
            }
            if (["precio", "price", "precios", "pricelevel"].includes(key)) {
                parsed.filterTokens.push({ key: "price", value: cleanedValue });
                return;
            }
            if (["servicio", "servicios", "service", "services"].includes(key)) {
                parsed.filterTokens.push({ key: "service", value: cleanedValue });
                return;
            }
            if (["acceso", "accesibilidad", "access", "accessibility"].includes(key)) {
                parsed.filterTokens.push({ key: "accessibility", value: cleanedValue });
                return;
            }
            if (["rating", "valoracion", "puntuacion", "nota", "score"].includes(key)) {
                parsed.filterTokens.push({ key: "rating", value: cleanedValue });
                return;
            }
            if (["seguidores", "followers"].includes(key)) {
                parsed.filterTokens.push({ key: "followers", value: cleanedValue });
                return;
            }
            if (["resenas", "resena", "reviews"].includes(key)) {
                parsed.filterTokens.push({ key: "reviews", value: cleanedValue });
                return;
            }
            if (["insignia", "insignias", "badge", "badges"].includes(key)) {
                parsed.filterTokens.push({ key: "badges", value: cleanedValue });
                return;
            }
            if (["residencia", "residence"].includes(key)) {
                parsed.filterTokens.push({ key: "residence", value: cleanedValue });
                return;
            }
            if (["tipousuario", "tipo-usuario", "usertype"].includes(key)) {
                parsed.filterTokens.push({ key: "userType", value: cleanedValue });
                return;
            }

            searchTokens.push(token);
        });

        parsed.cleanedQuery = searchTokens.join(" ").trim();
        return parsed;
    }

    function resolveSmartType(parsed, currentType) {
        if (parsed?.typeHint && ENTITY_TYPES.includes(parsed.typeHint)) {
            return parsed.typeHint;
        }
        if (currentType && currentType !== "all") {
            return currentType;
        }
        const filterKeys = (parsed?.filterTokens || []).map((token) => token.key);
        const placeSignals = ["city", "province", "price", "service", "accessibility", "placeType", "rating"];
        if (filterKeys.some((key) => placeSignals.includes(key))) {
            return "places";
        }
        const userSignals = ["badges", "residence", "userType"];
        if (filterKeys.some((key) => userSignals.includes(key))) {
            return "users";
        }
        if (filterKeys.includes("reviews")) {
            return "lists";
        }
        if (filterKeys.includes("followers")) {
            return "users";
        }
        return "all";
    }

    function clearSmartAppliedFilters() {
        if (!Array.isArray(state.smartAppliedFilters) || state.smartAppliedFilters.length === 0) {
            return;
        }
        state.smartAppliedFilters.forEach(({ type, stateKey, value, kind }) => {
            const target = state.filters[type];
            if (!target) {
                return;
            }
            if (kind === "set") {
                const setValue = target[stateKey];
                if (setValue instanceof Set) {
                    setValue.delete(value);
                }
            } else if (kind === "numeric") {
                if (target[stateKey] === value) {
                    target[stateKey] = null;
                }
            }
        });
        state.smartAppliedFilters = [];
    }

    function applySmartFilters(targetType, filterTokens) {
        if (!targetType || targetType === "all") {
            return;
        }
        const targetFilters = state.filters[targetType];
        if (!targetFilters || !Array.isArray(filterTokens) || filterTokens.length === 0) {
            return;
        }

        const addSetValue = (stateKey, value) => {
            if (!value) {
                return;
            }
            const setValue = targetFilters[stateKey] instanceof Set ? targetFilters[stateKey] : new Set();
            targetFilters[stateKey] = setValue;
            setValue.add(value);
            state.smartAppliedFilters.push({ type: targetType, stateKey, value, kind: "set" });
        };

        const setNumericValue = (stateKey, value) => {
            const numericValue = parseSmartNumber(value);
            if (numericValue === null) {
                return;
            }
            const definition = getDefinitionByStateKey(targetType, stateKey);
            let clampedValue = numericValue;
            if (definition && definition.type === "range") {
                const min = Number(definition.min ?? 0);
                const max = Number(definition.max ?? numericValue);
                clampedValue = Math.min(Math.max(numericValue, min), max);
            }
            targetFilters[stateKey] = clampedValue;
            state.smartAppliedFilters.push({ type: targetType, stateKey, value: clampedValue, kind: "numeric" });
        };

        filterTokens.forEach((token) => {
            switch (token.key) {
                case "city":
                    if ("cities" in targetFilters) {
                        addSetValue("cities", token.value);
                    }
                    break;
                case "province":
                    if ("provinces" in targetFilters) {
                        addSetValue("provinces", token.value);
                    }
                    break;
                case "price":
                    if ("priceLevels" in targetFilters) {
                        addSetValue("priceLevels", token.value);
                    }
                    break;
                case "service":
                    if ("services" in targetFilters) {
                        addSetValue("services", token.value);
                    }
                    break;
                case "accessibility":
                    if ("accessibility" in targetFilters) {
                        addSetValue("accessibility", token.value);
                    }
                    break;
                case "placeType":
                    if ("placeTypes" in targetFilters) {
                        addSetValue("placeTypes", token.value);
                    }
                    break;
                case "rating":
                    if ("minRating" in targetFilters) {
                        setNumericValue("minRating", token.value);
                    }
                    break;
                case "followers":
                    if ("minFollowers" in targetFilters) {
                        setNumericValue("minFollowers", token.value);
                    }
                    break;
                case "reviews":
                    if ("minReviews" in targetFilters) {
                        setNumericValue("minReviews", token.value);
                    }
                    break;
                case "badges":
                    if ("badges" in targetFilters) {
                        addSetValue("badges", token.value);
                    }
                    break;
                case "residence":
                    if ("residences" in targetFilters) {
                        addSetValue("residences", token.value);
                    }
                    break;
                case "userType":
                    if ("userTypes" in targetFilters) {
                        addSetValue("userTypes", token.value);
                    }
                    break;
                default:
                    break;
            }
        });
    }

    function applySmartQueryHints(rawQuery) {
        const parsed = parseSmartQuery(rawQuery);
        const resolvedType = resolveSmartType(parsed, state.currentEntityType);
        if (resolvedType && resolvedType !== state.currentEntityType) {
            setEntityType(resolvedType, { skipSearch: true, skipPanelClose: true });
        }
        clearSmartAppliedFilters();
        if (resolvedType && resolvedType !== "all") {
            applySmartFilters(resolvedType, parsed.filterTokens);
        }
        return {
            query: parsed.cleanedQuery,
            resolvedType
        };
    }

    function getDefinitionByStateKey(type, stateKey) {
        return (FILTER_DEFINITIONS[type] || []).find((definition) => definition.stateKey === stateKey);
    }

    function removeFilterValue(type, stateKey, rawValue) {
        if (!type || type === "all") {
            return;
        }
        const definition = getDefinitionByStateKey(type, stateKey);
        const targetFilters = state.filters[type];
        if (!definition || !targetFilters) {
            return;
        }
        if (definition.type === "numeric" || definition.type === "range") {
            targetFilters[stateKey] = null;
        } else {
            const setValue = targetFilters[stateKey];
            if (setValue instanceof Set) {
                setValue.delete(rawValue);
            }
        }
        performSearch();
    }

    function renderActiveFilters(type) {
        if (!activeFiltersBarEl || !activeFiltersChipsEl) {
            return;
        }
        if (type === "all") {
            activeFiltersBarEl.hidden = true;
            activeFiltersChipsEl.innerHTML = "";
            return;
        }

        const definitions = FILTER_DEFINITIONS[type] || [];
        const fragment = document.createDocumentFragment();
        let totalActive = 0;

        const buildChip = (definition, value, label) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "active-filter-chip";
            chip.dataset.filterType = type;
            chip.dataset.stateKey = definition.stateKey;
            chip.dataset.filterValue = value !== undefined && value !== null ? String(value) : "";
            const icon = document.createElement("i");
            icon.className = definition.icon || "fas fa-filter";
            const text = document.createElement("span");
            text.textContent = label;
            const closeIcon = document.createElement("i");
            closeIcon.className = "fas fa-times";
            chip.appendChild(icon);
            chip.appendChild(text);
            chip.appendChild(closeIcon);
            chip.setAttribute("aria-label", `Quitar filtro ${label}`);
            fragment.appendChild(chip);
        };

        definitions.forEach((definition) => {
            const currentValue = state.filters[type][definition.stateKey];
            if ((definition.type === "facet" || definition.type === "categoryTags" || definition.type === "listSelector") && currentValue instanceof Set) {
                currentValue.forEach((value) => {
                    const displayValue = definition.type === "listSelector"
                        ? (state.listNameById[value] || value)
                        : (typeof definition.formatValue === "function" ? definition.formatValue(value) : value);
                    const label = `${definition.label}: ${displayValue}`;
                    buildChip(definition, value, label);
                    totalActive += 1;
                });
            } else if (definition.type === "numeric" && currentValue !== null && currentValue !== undefined) {
                const option = (definition.options || []).find((entry) => Number(entry.value) === Number(currentValue));
                const displayValue = option ? option.label : currentValue;
                const label = `${definition.label}: ${displayValue}`;
                buildChip(definition, currentValue, label);
                totalActive += 1;
            } else if (definition.type === "range" && typeof currentValue === "number" && !Number.isNaN(currentValue)) {
                const label = `${definition.label}: ${formatRangeValue(currentValue, definition)}`;
                buildChip(definition, currentValue, label);
                totalActive += 1;
            }
        });

        if (totalActive === 0) {
            activeFiltersBarEl.hidden = true;
            activeFiltersChipsEl.innerHTML = "";
            return;
        }

        activeFiltersBarEl.hidden = false;
        activeFiltersChipsEl.innerHTML = "";
        activeFiltersChipsEl.appendChild(fragment);
    }

    function updateResultsMeta(meta) {
        if (!searchResultsMetaEl) {
            return;
        }
        if (!meta || typeof meta.total !== "number") {
            searchResultsMetaEl.innerHTML = "";
            return;
        }

        const fragment = document.createDocumentFragment();
        const makeChip = (iconClass, text) => {
            const chip = document.createElement("span");
            chip.className = "results-meta-chip";
            const icon = document.createElement("i");
            icon.className = iconClass;
            const label = document.createElement("span");
            label.textContent = text;
            chip.appendChild(icon);
            chip.appendChild(label);
            fragment.appendChild(chip);
        };

        const totalLabel = meta.total === 1 ? "resultado" : "resultados";
        makeChip("fas fa-layer-group", `${meta.total} ${totalLabel}`);

        if (state.currentSearchRaw) {
            makeChip("fas fa-search", state.currentSearchRaw);
        }

        const activeCount = countActiveFilters(state.currentEntityType);
        if (state.currentEntityType !== "all" && activeCount > 0) {
            makeChip("fas fa-filter", `${activeCount} filtros`);
        }

        if (meta.byType && state.currentEntityType === "all") {
            const typeMeta = [
                { key: "lists", label: "Listas", icon: "fas fa-list-alt" },
                { key: "users", label: "Usuarios", icon: "fas fa-user" },
                { key: "places", label: "Lugares", icon: "fas fa-map-marker-alt" },
                { key: "items", label: "Elementos", icon: "fas fa-star" }
            ];
            typeMeta.forEach((entry) => {
                const count = meta.byType[entry.key];
                if (typeof count === "number" && count > 0) {
                    makeChip(entry.icon, `${entry.label}: ${count}`);
                }
            });
        }

        searchResultsMetaEl.innerHTML = "";
        searchResultsMetaEl.appendChild(fragment);
    }

    function isStaleSearch(requestId) {
        return requestId !== state.searchRequestId;
    }


    function shouldUseMobileFilters() {
        if (typeof window.matchMedia === "function") {
            return window.matchMedia("(max-width: 1024px)").matches;
        }
        return window.innerWidth <= 1024;
    }

    function openFiltersPanel() {
        if (!filtersPanelWrapper || !shouldUseMobileFilters()) {
            return;
        }
        filtersPanelWrapper.classList.add("is-open");
        filtersPanelWrapper.setAttribute("aria-hidden", "false");
        if (filtersBackdrop) {
            filtersBackdrop.classList.add("is-visible");
            filtersBackdrop.removeAttribute("hidden");
        }
        if (filtersToggleBtn) {
            filtersToggleBtn.setAttribute("aria-expanded", "true");
        }
        if (document.body) {
            document.body.classList.add("filters-panel-open");
        }
        state.isFiltersPanelOpen = true;
    }

    function closeFiltersPanel(options = {}) {
        if (!filtersPanelWrapper) {
            return;
        }
        const { skipFocus = false } = options;
        const isMobile = shouldUseMobileFilters();

        filtersPanelWrapper.classList.remove("is-open");
        if (isMobile) {
            filtersPanelWrapper.setAttribute("aria-hidden", "true");
        } else {
            filtersPanelWrapper.removeAttribute("aria-hidden");
        }

        if (filtersBackdrop) {
            filtersBackdrop.classList.remove("is-visible");
            if (!filtersBackdrop.hasAttribute("hidden")) {
                filtersBackdrop.setAttribute("hidden", "");
            }
        }

        if (filtersToggleBtn) {
            filtersToggleBtn.setAttribute("aria-expanded", "false");
        }

        if (document.body) {
            document.body.classList.remove("filters-panel-open");
        }
        state.isFiltersPanelOpen = false;

        if (!skipFocus && filtersToggleBtn && isMobile) {
            filtersToggleBtn.focus();
        }
    }

    function toggleFiltersPanel() {
        if (state.isFiltersPanelOpen) {
            closeFiltersPanel();
        } else {
            openFiltersPanel();
        }
    }

    function handleFiltersKeydown(event) {
        if (event.key === "Escape" && state.isFiltersPanelOpen && shouldUseMobileFilters()) {
            closeFiltersPanel();
        }
    }

    function handleResponsiveFilters() {
        const isMobile = shouldUseMobileFilters();

        if (filtersToggleBtn) {
            filtersToggleBtn.hidden = !isMobile;
            filtersToggleBtn.setAttribute("aria-expanded", state.isFiltersPanelOpen ? "true" : "false");
        }

        if (filtersPanelWrapper) {
            if (isMobile) {
                filtersPanelWrapper.setAttribute("aria-hidden", state.isFiltersPanelOpen ? "false" : "true");
            } else {
                filtersPanelWrapper.classList.remove("is-open");
                filtersPanelWrapper.removeAttribute("aria-hidden");
            }
        }

        if (!isMobile) {
            if (filtersBackdrop) {
                filtersBackdrop.classList.remove("is-visible");
                if (!filtersBackdrop.hasAttribute("hidden")) {
                    filtersBackdrop.setAttribute("hidden", "");
                }
            }
            if (document.body) {
                document.body.classList.remove("filters-panel-open");
            }
            state.isFiltersPanelOpen = false;
        }
    }

    function createFilterTitle(definition) {
        const title = document.createElement("h3");
        title.className = "filter-block__title";
        if (definition?.icon) {
            const icon = document.createElement("i");
            icon.className = definition.icon;
            title.appendChild(icon);
        }
        const textNode = document.createTextNode(definition?.label || "");
        title.appendChild(textNode);
        return title;
    }

    function formatRangeValue(value, definition) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return "Cualquiera";
        }
        const numericValue = Number(value);
        const step = Number(definition?.step ?? 1);
        const decimals = Number.isInteger(step) ? 0 : 1;
        const formatted = decimals > 0 ? numericValue.toFixed(decimals) : String(Math.round(numericValue));
        const suffix = definition?.displaySuffix || "";
        return `${formatted}${suffix}`;
    }

    function createRangeSection(type, definition) {
        const container = document.createElement("div");
        container.className = "filter-block filter-block--range";

        const header = document.createElement("div");
        header.className = "filter-range__header";

        const title = createFilterTitle(definition);
        header.appendChild(title);

        const valueLabel = document.createElement("span");
        valueLabel.className = "filter-range__value";
        const currentValue = state.filters[type][definition.stateKey];
        valueLabel.textContent = formatRangeValue(currentValue, definition);
        header.appendChild(valueLabel);

        container.appendChild(header);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "filter-range__slider";
        const sliderMin = Number(definition.min ?? 0);
        slider.min = String(sliderMin);
        slider.max = String(Number(definition.max ?? 10));
        slider.step = String(Number(definition.step ?? 1));
        const storedValue = typeof currentValue === "number" ? currentValue : sliderMin;
        slider.value = String(storedValue);
        slider.setAttribute("aria-label", definition.label);

        slider.addEventListener("input", () => {
            const numericValue = Number(slider.value);
            const epsilon = Math.max(Number(definition.step ?? 1) / 2, 0.05);
            const isAtMin = Math.abs(numericValue - sliderMin) <= epsilon;
            state.filters[type][definition.stateKey] = isAtMin ? null : numericValue;
            valueLabel.textContent = isAtMin ? "Cualquiera" : formatRangeValue(numericValue, definition);
        });

        slider.addEventListener("change", () => {
            performSearch();
        });

        container.appendChild(slider);

        const actions = document.createElement("div");
        actions.className = "filter-range__actions";

        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "filter-range__reset";
        resetBtn.textContent = "Restablecer";
        resetBtn.addEventListener("click", () => {
            slider.value = String(sliderMin);
            state.filters[type][definition.stateKey] = null;
            valueLabel.textContent = "Cualquiera";
            performSearch();
        });

        actions.appendChild(resetBtn);
        container.appendChild(actions);

        return container;
    }

    function setEntityType(nextType, options = {}) {
        if (!nextType || !ENTITY_TYPES.includes(nextType)) {
            return;
        }
        const { skipSearch = false, skipPanelClose = false } = options;
        const buttons = Array.from(entityTypeButtons || []);
        buttons.forEach((btn) => btn.classList.remove("active"));
        const targetButton = buttons.find((btn) => btn.dataset.type === nextType);
        if (targetButton) {
            targetButton.classList.add("active");
        }
        state.currentEntityType = nextType;
        if (state.currentEntityType === "lists" || state.currentEntityType === "items") {
            ensureCategoriesLoaded().catch(() => {});
        }
        renderFiltersPanel(state.currentEntityType);
        if (!skipSearch) {
            performSearch();
        }
        if (shouldUseMobileFilters() && state.isFiltersPanelOpen && !skipPanelClose) {
            closeFiltersPanel({ skipFocus: true });
        }
        handleResponsiveFilters();
    }

    function updateEntityTypeSelection(button) {
        if (!button) {
            return;
        }
        setEntityType(button.dataset.type);
    }

    function buildFacetFilter(attribute, value) {
        const text = String(value);
        const needsQuotes = /[^A-Za-z0-9_-]/.test(text);
        const escaped = text.replace(/"/g, '\\"');
        return needsQuotes ? `${attribute}:"${escaped}"` : `${attribute}:${escaped}`;
    }

    function buildFacetFilters(type) {
        if (type === "all") {
            return undefined;
        }
        const definitions = FILTER_DEFINITIONS[type] || [];
        const facetFilters = [];
        definitions.forEach((definition) => {
            if (definition.type !== "facet" && definition.type !== "categoryTags" && definition.type !== "listSelector") {
                return;
            }
            const selected = state.filters[type][definition.stateKey];
            if (!(selected instanceof Set) || selected.size === 0) {
                return;
            }
            const values = Array.from(selected).map((value) => buildFacetFilter(definition.attribute, value));
            if (values.length === 1) {
                facetFilters.push(values[0]);
            } else if (values.length > 1) {
                facetFilters.push(values);
            }
        });
        return facetFilters.length > 0 ? facetFilters : undefined;
    }

    function buildNumericFilterString(type) {
        if (type === "all") {
            return undefined;
        }
        const definitions = FILTER_DEFINITIONS[type] || [];
        const expressions = [];
        definitions.forEach((definition) => {
            const selectedValue = state.filters[type][definition.stateKey];
            if (definition.type === "numeric") {
                if (selectedValue !== null && selectedValue !== undefined) {
                    expressions.push(`${definition.attribute} >= ${Number(selectedValue)}`);
                }
            } else if (definition.type === "range") {
                if (typeof selectedValue === "number" && !Number.isNaN(selectedValue)) {
                    expressions.push(`${definition.attribute} >= ${Number(selectedValue)}`);
                }
            }
        });
        return expressions.length > 0 ? expressions.join(" AND ") : undefined;
    }

    function getSearchParams(type) {
        if (type === "all") {
            return {};
        }
        const definitions = FILTER_DEFINITIONS[type] || [];
        const facets = definitions
            .filter((definition) => definition.type === "facet")
            .map((definition) => definition.attribute);
        const params = {
            hitsPerPage: 20,
            facets,
            ...getBaseSearchParams()
        };
        const facetFilters = buildFacetFilters(type);
        if (facetFilters) {
            params.facetFilters = facetFilters;
        }
        const numericFilters = buildNumericFilterString(type);
        if (numericFilters) {
            params.filters = numericFilters;
        }
        return params;
    }

    function countActiveFilters(type) {
        if (type === "all") {
            return 0;
        }
        const definitions = FILTER_DEFINITIONS[type] || [];
        let total = 0;
        definitions.forEach((definition) => {
            const value = state.filters[type][definition.stateKey];
            if ((definition.type === "facet" || definition.type === "categoryTags" || definition.type === "listSelector") && value instanceof Set) {
                total += value.size;
            } else if (definition.type === "numeric" && value !== null && value !== undefined) {
                total += 1;
            } else if (definition.type === "range" && typeof value === "number" && !Number.isNaN(value)) {
                total += 1;
            }
        });
        return total;
    }


    async function ensureFacetData(type, query, requestId) {
        if (type === "all") {
            return;
        }
        const normalizedQuery = query || "";
        if (
            state.facetCache[type] &&
            Object.keys(state.facetCache[type]).length > 0 &&
            state.lastFacetQueryByType[type] === normalizedQuery
        ) {
            return;
        }
        const indexName = INDEX_NAME_BY_ENTITY[type];
        if (!indexName) {
            return;
        }
        try {
            const index = searchClient.initIndex(indexName);
            const params = { ...getSearchParams(type), hitsPerPage: 0 };
            const response = await index.search(normalizedQuery, params);
            if (requestId && isStaleSearch(requestId)) {
                return;
            }
            state.facetCache[type] = response.facets || {};
            state.lastFacetQueryByType[type] = normalizedQuery;
        } catch (error) {
            console.warn("page-search: no se pudieron precargar los filtros.", error);
        }
    }

    async function performSearch() {
        const requestId = ++state.searchRequestId;
        state.isSearching = true;
        if (executeSearchBtn) {
            executeSearchBtn.disabled = true;
        }

        const rawQuery = (mainSearchInput?.value || "").trim();
        state.currentSearchRaw = rawQuery;
        const smartResult = applySmartQueryHints(rawQuery);
        const query = smartResult.query;
        state.currentSearchQuery = query;
        const currentType = state.currentEntityType;

        if (currentType === "items" || currentType === "lists") {
            try {
                await ensureCategoriesLoaded();
            } catch (_) {
                // Ignorar fallos al precargar categorias
            }
        }
        if (currentType === "items") {
            sanitizeItemBaseTags();
            sanitizeItemLists();
            const selectedCategories = getSelectedItemCategoryIds();
            if (selectedCategories.length > 0) {
                try {
                    await ensureListsForCategories(selectedCategories);
                    sanitizeItemLists();
                } catch (error) {
                    console.warn("page-search: no se pudieron preparar las listas para los filtros.", error);
                }
            }
        }

        const hasActiveFilters = currentType !== "all" && countActiveFilters(currentType) > 0;

        if (!query && !hasActiveFilters && currentType === "all") {
            if (searchResultsAreaEl) {
                searchResultsAreaEl.innerHTML = '<p class="search-placeholder">Introduce tu busqueda para ver resultados.</p>';
            }
            renderFiltersPanel(currentType);
            updateResultsMeta(null);
            if (!isStaleSearch(requestId)) {
                state.isSearching = false;
                if (executeSearchBtn) {
                    executeSearchBtn.disabled = false;
                }
            }
            return;
        }

        if (currentType !== "all") {
            await ensureFacetData(currentType, query, requestId);
            if (isStaleSearch(requestId)) {
                return;
            }
            renderFiltersPanel(currentType);
        }

        if (searchResultsAreaEl) {
            searchResultsAreaEl.innerHTML = '<p class="search-placeholder"><i class="fas fa-spinner fa-spin"></i> Buscando...</p>';
        }

        try {
            if (currentType === "all") {
                const baseParams = getBaseSearchParams();
                const queries = [
                    { indexName: INDEX_NAME_BY_ENTITY.lists, query, params: { hitsPerPage: 5, ...baseParams } },
                    { indexName: INDEX_NAME_BY_ENTITY.users, query, params: { hitsPerPage: 5, ...baseParams } },
                    { indexName: INDEX_NAME_BY_ENTITY.places, query, params: { hitsPerPage: 5, ...baseParams } },
                    { indexName: INDEX_NAME_BY_ENTITY.items, query, params: { hitsPerPage: 5, ...baseParams } }
                ];
                const { results } = await searchClient.multipleQueries(queries);
                if (isStaleSearch(requestId)) {
                    return;
                }
                const order = ["lists", "users", "places", "items"];
                const aggregated = [];
                const byType = {};
                let totalHits = 0;
                results.forEach((result, index) => {
                    const entityKey = order[index] || "lists";
                    const resultType = RESULT_TYPE_BY_ENTITY[entityKey] || "list";
                    const hits = Array.isArray(result.hits) ? result.hits : [];
                    hits.forEach((hit) => {
                        aggregated.push({ ...hit, type: resultType });
                    });
                    const count = typeof result.nbHits === "number" ? result.nbHits : hits.length;
                    byType[entityKey] = count;
                    totalHits += count;
                });
                renderResults(aggregated);
                updateResultsMeta({ total: totalHits, byType });
            } else {
                const indexName = INDEX_NAME_BY_ENTITY[currentType];
                const index = searchClient.initIndex(indexName);
                const params = getSearchParams(currentType);
                const response = await index.search(query, params);
                if (isStaleSearch(requestId)) {
                    return;
                }
                state.facetCache[currentType] = response.facets || {};
                state.lastFacetQueryByType[currentType] = query || "";
                renderFiltersPanel(currentType);
                const resultType = RESULT_TYPE_BY_ENTITY[currentType];
                const hits = (response.hits || []).map((hit) => ({ ...hit, type: resultType }));
                renderResults(hits);
                const totalHits = typeof response.nbHits === "number" ? response.nbHits : hits.length;
                updateResultsMeta({ total: totalHits });
            }
        } catch (error) {
            console.error("Error en la busqueda con Algolia:", error);
            if (!isStaleSearch(requestId)) {
                updateResultsMeta({ total: 0 });
                if (searchResultsAreaEl) {
                    searchResultsAreaEl.innerHTML = '<p class="search-placeholder error-placeholder">Vaya, algo ha fallado al buscar.</p>';
                }
            }
        } finally {
            if (!isStaleSearch(requestId)) {
                state.isSearching = false;
                if (executeSearchBtn) {
                    executeSearchBtn.disabled = false;
                }
            }
        }
    }

    function renderResults(results) {
        if (!searchResultsAreaEl) {
            return;
        }
        if (!Array.isArray(results) || results.length === 0) {
            searchResultsAreaEl.innerHTML = '<p class="search-placeholder">No hemos encontrado nada. Prueba con otras palabras.</p>';
            return;
        }

        const groupedResults = results.reduce((acc, item) => {
            const type = item.type || "unknown";
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(item);
            return acc;
        }, {});

        const uiUtils = ListopicApp.uiUtils;
        const typeTitles = { list: "Listas", user: "Usuarios", place: "Lugares", item: "Elementos" };
        let finalHtml = "";

        Object.entries(typeTitles).forEach(([type, title]) => {
            const items = groupedResults[type];
            if (!items || items.length === 0) {
                return;
            }
            finalHtml += `<h3 class="search-section-title">${escapeHtml(title)}</h3>`;
            const sectionHtml = items.map((item) => {
                const id = item.objectID || item.id;
                switch (type) {
                    case "list":
                        return uiUtils && uiUtils.createListCard ? uiUtils.createListCard(item, id) : "";
                    case "user":
                        return uiUtils && uiUtils.createUserCard ? uiUtils.createUserCard(item, id) : "";
                    case "place":
                        return uiUtils && uiUtils.createPlaceCard ? uiUtils.createPlaceCard(item, id) : "";
                    case "item":
                        return uiUtils && uiUtils.createGroupedItemCard ? uiUtils.createGroupedItemCard(item) : "";
                    default:
                        return "";
                }
            }).join("");
            finalHtml += sectionHtml;
        });

        searchResultsAreaEl.innerHTML = finalHtml || '<p class="search-placeholder">No hemos encontrado nada. Prueba con otras palabras.</p>';
    }

    function renderFiltersPanel(type) {
        if (!filtersPanelEl) {
            return;
        }
        const activeCount = countActiveFilters(type);
        if (filtersHeaderLabel) {
            filtersHeaderLabel.textContent = activeCount > 0 ? `Filtros (${activeCount})` : "Filtros";
        }
        if (clearFiltersBtn) {
            clearFiltersBtn.disabled = type === "all" || activeCount === 0;
        }
        if (type === "all") {
            filtersPanelEl.innerHTML = '<p class="filters-placeholder">Selecciona un tipo de contenido para ver filtros.</p>';
            renderActiveFilters(type);
            return;
        }
        const facetData = state.facetCache[type] || {};
        const definitions = FILTER_DEFINITIONS[type] || [];
        if (definitions.length === 0) {
            filtersPanelEl.innerHTML = '<p class="filters-placeholder">No hay filtros disponibles para este tipo.</p>';
            renderActiveFilters(type);
            return;
        }

        const fragment = document.createDocumentFragment();
        definitions.forEach((definition) => {
            if (definition.type === "facet") {
                const section = createFacetSection(type, definition, facetData[definition.attribute] || {});
                fragment.appendChild(section);
            } else if (definition.type === "numeric") {
                fragment.appendChild(createNumericSection(type, definition));
            } else if (definition.type === "categoryTags") {
                fragment.appendChild(createCategoryTagsSection(type, definition));
            } else if (definition.type === "listSelector") {
                fragment.appendChild(createListSelectorSection(type, definition));
            } else if (definition.type === "range") {
                fragment.appendChild(createRangeSection(type, definition));
            }
        });
        filtersPanelEl.innerHTML = "";
        filtersPanelEl.appendChild(fragment);
        renderActiveFilters(type);
    }

    function createFacetSection(type, definition, facetValues) {
        const container = document.createElement("div");
        container.className = "filter-block";

        const title = createFilterTitle(definition);
        container.appendChild(title);

        if (type === "items" && definition.attribute === "listName") {
            sanitizeItemLists();
            const categorySet = state.filters?.items?.categories;
            if (!(categorySet instanceof Set) || categorySet.size === 0) {
                const empty = document.createElement("p");
                empty.className = "filter-block__empty";
                empty.textContent = "Selecciona una categoria para ver sus listas.";
                container.appendChild(empty);
                return container;
            }
        }

        let entries = Object.entries(facetValues || {});
        if (entries.length === 0 && (definition.attribute === "categoryId" || definition.attribute === "listCategoryId")) {
            const cache = getCategoryCache();
            entries = Object.keys(cache).map((categoryId) => [categoryId, 0]);
        }

        if (entries.length === 0) {
            const empty = document.createElement("p");
            empty.className = "filter-block__empty";
            empty.textContent = "Sin opciones disponibles";
            container.appendChild(empty);
            return container;
        }

        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "filter-block__options";
        let selectedSet = state.filters[type][definition.stateKey];
        if (!(selectedSet instanceof Set)) {
            selectedSet = new Set();
            state.filters[type][definition.stateKey] = selectedSet;
        }

        const sortedEntries = entries.slice();
        if (definition.sortByLabel) {
            sortedEntries.sort((a, b) => {
                const labelA = typeof definition.formatValue === "function" ? definition.formatValue(a[0]) : a[0];
                const labelB = typeof definition.formatValue === "function" ? definition.formatValue(b[0]) : b[0];
                return String(labelA).localeCompare(String(labelB), "es", { sensitivity: "base" });
            });
        } else {
            sortedEntries.sort((a, b) => b[1] - a[1]);
        }

        sortedEntries.slice(0, 30).forEach(([value, count]) => {
            const option = document.createElement("label");
            option.className = "filter-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = value;
            checkbox.checked = selectedSet.has(value);
            option.classList.toggle("filter-option--selected", checkbox.checked);
            checkbox.addEventListener("change", async () => {
                if (checkbox.checked) {
                    selectedSet.add(value);
                } else {
                    selectedSet.delete(value);
                }
                option.classList.toggle("filter-option--selected", checkbox.checked);
                if (type === "items") {
                    if (definition.attribute === "listCategoryId") {
                        sanitizeItemBaseTags();
                        try {
                            const categoriesToLoad = getSelectedItemCategoryIds();
                            if (categoriesToLoad.length > 0) {
                                await ensureListsForCategories(categoriesToLoad);
                            }
                        } catch (error) {
                            console.warn("page-search: no se pudieron actualizar las listas para las categorías seleccionadas.", error);
                        }
                        sanitizeItemLists();
                    } else if (definition.attribute === "listName") {
                        sanitizeItemLists();
                    }
                }
                performSearch();
            });

            const labelSpan = document.createElement("span");
            labelSpan.className = "filter-option__label";
            const displayValue = typeof definition.formatValue === "function" ? definition.formatValue(value) : value;
            labelSpan.textContent = displayValue;
            if (displayValue !== value) {
                labelSpan.title = value;
            }

            const countSpan = document.createElement("span");
            countSpan.className = "filter-option__count";
            countSpan.textContent = typeof count === "number" ? count : 0;

            option.appendChild(checkbox);
            option.appendChild(labelSpan);
            option.appendChild(countSpan);
            optionsWrapper.appendChild(option);
        });

        container.appendChild(optionsWrapper);
        return container;
    }

    function createCategoryTagsSection(type, definition) {
        const container = document.createElement("div");
        container.className = "filter-block";

        const title = createFilterTitle(definition);
        container.appendChild(title);

        sanitizeItemBaseTags();

        const categorySet = state.filters[type]?.categories;
        if (!(categorySet instanceof Set) || categorySet.size === 0) {
            const empty = document.createElement("p");
            empty.className = "filter-block__empty";
            empty.textContent = "Selecciona una categoria para ver etiquetas.";
            container.appendChild(empty);
            return container;
        }

        const baseTags = getBaseTagsForSelectedCategories();
        let selectedSet = state.filters[type][definition.stateKey];
        if (!(selectedSet instanceof Set)) {
            selectedSet = new Set();
            state.filters[type][definition.stateKey] = selectedSet;
        }

        if (baseTags.length === 0) {
            const empty = document.createElement("p");
            empty.className = "filter-block__empty";
            empty.textContent = "Las categorias seleccionadas no tienen etiquetas base.";
            container.appendChild(empty);
            return container;
        }

        const allowedSet = new Set(baseTags);
        Array.from(selectedSet).forEach((tag) => {
            if (!allowedSet.has(tag)) {
                selectedSet.delete(tag);
            }
        });

        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "filter-block__options";
        container.appendChild(optionsWrapper);

        baseTags.forEach((tag) => {
            const option = document.createElement("label");
            option.className = "filter-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = tag;
            checkbox.checked = selectedSet.has(tag);
            option.classList.toggle("filter-option--selected", checkbox.checked);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selectedSet.add(tag);
                } else {
                    selectedSet.delete(tag);
                }
                option.classList.toggle("filter-option--selected", checkbox.checked);
                performSearch();
            });

            const labelSpan = document.createElement("span");
            labelSpan.className = "filter-option__label";
            labelSpan.textContent = tag;

            option.appendChild(checkbox);
            option.appendChild(labelSpan);
            optionsWrapper.appendChild(option);
        });

        return container;
    }

    function createListSelectorSection(type, definition) {
        const container = document.createElement("div");
        container.className = "filter-block";

        const title = createFilterTitle(definition);
        container.appendChild(title);

        const categories = getSelectedItemCategoryIds();
        if (categories.length === 0) {
            const empty = document.createElement("p");
            empty.className = "filter-block__empty";
            empty.textContent = "Selecciona una categoría para elegir sus listas destacadas.";
            container.appendChild(empty);
            return container;
        }

        const pending = categories.filter((categoryId) => !Array.isArray(state.listsCacheByCategory[categoryId]));
        if (pending.length > 0) {
            ensureListsForCategories(pending)
                .then(() => {
                    if (state.currentEntityType === type) {
                        renderFiltersPanel(type);
                    }
                })
                .catch((error) => {
                    console.warn("page-search: error al cargar las listas para los filtros de items.", error);
                });
        }

        if (pending.length > 0 && isLoadingListsForCategories(pending)) {
            const loading = document.createElement("p");
            loading.className = "filter-block__empty";
            loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando listas disponibles...';
            container.appendChild(loading);
            return container;
        }

        const availableLists = getListsForSelectedCategories();
        if (availableLists.length === 0) {
            const empty = document.createElement("p");
            empty.className = "filter-block__empty";
            empty.textContent = "Todavía no hay listas públicas en las categorías seleccionadas.";
            container.appendChild(empty);
            return container;
        }

        let selectedSet = state.filters[type][definition.stateKey];
        if (!(selectedSet instanceof Set)) {
            selectedSet = new Set();
            state.filters[type][definition.stateKey] = selectedSet;
        }

        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "filter-block__options";
        container.appendChild(optionsWrapper);

        availableLists.slice(0, 40).forEach((list) => {
            const option = document.createElement("label");
            option.className = "filter-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = list.id;
            checkbox.checked = selectedSet.has(list.id);
            option.classList.toggle("filter-option--selected", checkbox.checked);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selectedSet.add(list.id);
                } else {
                    selectedSet.delete(list.id);
                }
                option.classList.toggle("filter-option--selected", checkbox.checked);
                performSearch();
            });

            const labelSpan = document.createElement("span");
            labelSpan.className = "filter-option__label";
            const listName = list.name || state.listNameById[list.id] || "Lista sin nombre";
            labelSpan.textContent = listName;
            labelSpan.title = listName;

            const countSpan = document.createElement("span");
            countSpan.className = "filter-option__count";
            const followers = typeof list.followersCount === "number" ? list.followersCount : 0;
            countSpan.textContent = followers > 0 ? followers.toLocaleString("es-ES") : "—";

            option.appendChild(checkbox);
            option.appendChild(labelSpan);
            option.appendChild(countSpan);
            optionsWrapper.appendChild(option);
        });

        return container;
    }

    function createNumericSection(type, definition) {
        const container = document.createElement("div");
        container.className = "filter-block";

        const title = createFilterTitle(definition);
        container.appendChild(title);

        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "filter-block__options filter-block__options--inline";
        const radioName = `filter-${type}-${definition.stateKey}`;
        const currentValue = state.filters[type][definition.stateKey];

        const anyOption = document.createElement("label");
        anyOption.className = "filter-option filter-option--radio";
        const anyInput = document.createElement("input");
        anyInput.type = "radio";
        anyInput.name = radioName;
        anyInput.value = "";
        anyInput.checked = currentValue === null || currentValue === undefined;
        anyInput.addEventListener("change", () => {
            state.filters[type][definition.stateKey] = null;
            updateRadioSelection();
            performSearch();
        });
        const anyLabel = document.createElement("span");
        anyLabel.className = "filter-option__label";
        anyLabel.textContent = "Cualquiera";
        anyOption.appendChild(anyInput);
        anyOption.appendChild(anyLabel);
        optionsWrapper.appendChild(anyOption);

        const updateRadioSelection = () => {
            const optionLabels = optionsWrapper.querySelectorAll(".filter-option--radio");
            optionLabels.forEach((labelEl) => {
                const inputEl = labelEl.querySelector("input");
                const isSelected = Boolean(inputEl && inputEl.checked);
                labelEl.classList.toggle("filter-option--selected", isSelected);
            });
        };

        (definition.options || []).forEach((option) => {
            const optionLabel = document.createElement("label");
            optionLabel.className = "filter-option filter-option--radio";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = radioName;
            radio.value = option.value;
            radio.checked = Number(currentValue ?? NaN) === Number(option.value);
            radio.addEventListener("change", () => {
                state.filters[type][definition.stateKey] = Number(option.value);
                updateRadioSelection();
                performSearch();
            });
            const labelText = document.createElement("span");
            labelText.className = "filter-option__label";
            labelText.textContent = option.label;
            optionLabel.appendChild(radio);
            optionLabel.appendChild(labelText);
            optionsWrapper.appendChild(optionLabel);
        });

        updateRadioSelection();

        container.appendChild(optionsWrapper);
        return container;
    }

    function resetFiltersForCurrentType() {
        const type = state.currentEntityType;
        if (type === "all") {
            return;
        }
        const freshFilters = createInitialFilters();
        state.filters[type] = freshFilters[type];
        state.facetCache[type] = {};
        state.lastFacetQueryByType[type] = undefined;
        performSearch();
    }

    function getInitialEntityTypeFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const typeParam = params.get("type");
            if (typeParam && ENTITY_TYPES.includes(typeParam)) {
                return typeParam;
            }
        } catch (error) {
            console.warn("page-search: no se pudo leer el tipo desde la URL.", error);
        }
        return null;
    }

    function loadInitialQueryFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const qParam = params.get("q") || params.get("tag");
            if (qParam && mainSearchInput) {
                mainSearchInput.value = qParam;
                performSearch();
            }
        } catch (error) {
            console.warn("page-search: no se pudo leer los parametros de busqueda.", error);
        }
    }

    function initEventListeners() {
        if (mainSearchInput) {
            mainSearchInput.addEventListener("input", debouncedSearch);
            mainSearchInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    performSearch();
                }
            });
        }
        if (executeSearchBtn) {
            executeSearchBtn.addEventListener("click", performSearch);
        }
        entityTypeButtons.forEach((button) => {
            button.addEventListener("click", () => updateEntityTypeSelection(button));
        });
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener("click", resetFiltersForCurrentType);
        }
        if (activeFiltersClearBtn) {
            activeFiltersClearBtn.addEventListener("click", resetFiltersForCurrentType);
        }
        if (activeFiltersBarEl) {
            activeFiltersBarEl.addEventListener("click", (event) => {
                const chip = event.target.closest(".active-filter-chip");
                if (!chip) {
                    return;
                }
                const type = chip.dataset.filterType;
                const stateKey = chip.dataset.stateKey;
                const value = chip.dataset.filterValue;
                removeFilterValue(type, stateKey, value);
            });
        }
        if (filtersToggleBtn) {
            filtersToggleBtn.addEventListener("click", toggleFiltersPanel);
        }
        if (filtersBackdrop) {
            filtersBackdrop.addEventListener("click", () => closeFiltersPanel());
        }
        if (closeFiltersBtn) {
            closeFiltersBtn.addEventListener("click", () => closeFiltersPanel());
        }
        document.addEventListener("click", (event) => {
            const hintEl = event.target.closest("[data-search-hint]");
            if (!hintEl || !mainSearchInput) {
                return;
            }
            const hintValue = hintEl.dataset.searchHint;
            if (!hintValue) {
                return;
            }
            mainSearchInput.value = hintValue;
            mainSearchInput.focus();
            performSearch();
        });
        document.addEventListener("keydown", handleFiltersKeydown);
    }

    function init() {
        console.log("Initializing Search page logic with Algolia filters...");
        cacheDOMElements();
        debouncedSearch = debounce(performSearch, 300);
        initEventListeners();
        ensureCategoriesLoaded().catch(() => {});
        handleResponsiveFilters();
        window.addEventListener("resize", handleResponsiveFilters);
        const initialTypeFromUrl = getInitialEntityTypeFromUrl();
        const targetType = initialTypeFromUrl || state.currentEntityType;
        const typeButtonArray = Array.from(entityTypeButtons || []);
        const defaultButton = typeButtonArray.find((button) => button.dataset.type === targetType);
        if (defaultButton) {
            updateEntityTypeSelection(defaultButton);
        } else {
            state.currentEntityType = targetType;
            renderFiltersPanel(state.currentEntityType);
            performSearch();
        }
        loadInitialQueryFromUrl();
    }

    return {
        init
    };
})();
