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

    const FILTER_DEFINITIONS = {
        lists: [
            { id: "categories", label: "Categorias", type: "facet", attribute: "categoryId", stateKey: "categories" },
            { id: "tags", label: "Etiquetas", type: "facet", attribute: "availableTags", stateKey: "tags" },
            {
                id: "reviews",
                label: "Resenas minimas",
                type: "numeric",
                attribute: "reviewCount",
                stateKey: "minReviews",
                options: [
                    { value: 10, label: "10+" },
                    { value: 25, label: "25+" },
                    { value: 50, label: "50+" }
                ]
            }
        ],
        places: [
            { id: "cities", label: "Ciudad", type: "facet", attribute: "city", stateKey: "cities" },
            { id: "provinces", label: "Provincia", type: "facet", attribute: "province", stateKey: "provinces" },
            { id: "services", label: "Servicios", type: "facet", attribute: "serviceOptions", stateKey: "services" },
            { id: "accessibility", label: "Accesibilidad", type: "facet", attribute: "accessibility", stateKey: "accessibility" },
            {
                id: "rating",
                label: "Valoracion minima",
                type: "numeric",
                attribute: "averageRating",
                stateKey: "minRating",
                options: [
                    { value: 4, label: "4+" },
                    { value: 3.5, label: "3.5+" },
                    { value: 3, label: "3+" }
                ]
            }
        ],
        items: [
            { id: "lists", label: "Listas", type: "facet", attribute: "listName", stateKey: "lists" },
            { id: "tags", label: "Tags", type: "facet", attribute: "groupTags", stateKey: "tags" },
            { id: "cities", label: "Ciudad", type: "facet", attribute: "placeCity", stateKey: "cities" },
            {
                id: "rating",
                label: "Valoracion minima",
                type: "numeric",
                attribute: "avgGeneralScore",
                stateKey: "minRating",
                options: [
                    { value: 4, label: "4+" },
                    { value: 3.5, label: "3.5+" },
                    { value: 3, label: "3+" }
                ]
            }
        ],
        users: [
            { id: "userType", label: "Tipo de usuario", type: "facet", attribute: "userType", stateKey: "userTypes" },
            { id: "residence", label: "Residencia", type: "facet", attribute: "residence", stateKey: "residences" },
            { id: "badges", label: "Insignias", type: "facet", attribute: "badges", stateKey: "badges" },
            {
                id: "followers",
                label: "Seguidores minimos",
                type: "numeric",
                attribute: "followersCount",
                stateKey: "minFollowers",
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
                tags: new Set(),
                minReviews: null
            },
            places: {
                cities: new Set(),
                provinces: new Set(),
                services: new Set(),
                accessibility: new Set(),
                minRating: null
            },
            items: {
                lists: new Set(),
                tags: new Set(),
                cities: new Set(),
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
        currentEntityType: "all",
        isSearching: false,
        filters: createInitialFilters(),
        facetCache: {}
    };

    const searchClient = algoliasearch(ListopicApp.config.ALGOLIA_APP_ID, ListopicApp.config.ALGOLIA_SEARCH_KEY);

    let mainSearchInput;
    let entityTypeButtons;
    let searchResultsAreaEl;
    let executeSearchBtn;
    let filtersPanelEl;
    let clearFiltersBtn;
    let filtersHeaderLabel;
    let debouncedSearch;

    function cacheDOMElements() {
        mainSearchInput = document.getElementById("main-search-input");
        entityTypeButtons = document.querySelectorAll(".entity-type-btn");
        searchResultsAreaEl = document.getElementById("search-results-area");
        executeSearchBtn = document.getElementById("execute-search-btn");
        filtersPanelEl = document.getElementById("filters-panel-content");
        clearFiltersBtn = document.getElementById("clear-filters-btn");
        filtersHeaderLabel = document.getElementById("filters-header-label");
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

    function updateEntityTypeSelection(button) {
        if (!button) {
            return;
        }
        entityTypeButtons.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        state.currentEntityType = button.dataset.type;
        renderFiltersPanel(state.currentEntityType);
        performSearch();
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
            if (definition.type !== "facet") {
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
            if (definition.type !== "numeric") {
                return;
            }
            const selectedValue = state.filters[type][definition.stateKey];
            if (selectedValue !== null && selectedValue !== undefined) {
                expressions.push(`${definition.attribute} >= ${Number(selectedValue)}`);
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
            facets
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
            if (definition.type === "facet" && value instanceof Set) {
                total += value.size;
            } else if (definition.type === "numeric" && value !== null && value !== undefined) {
                total += 1;
            }
        });
        return total;
    }

    async function performSearch() {
        if (state.isSearching) {
            return;
        }
        state.isSearching = true;
        if (executeSearchBtn) {
            executeSearchBtn.disabled = true;
        }

        const query = (mainSearchInput?.value || "").trim();
        state.currentSearchQuery = query;
        const currentType = state.currentEntityType;

        if (!query) {
            if (searchResultsAreaEl) {
                searchResultsAreaEl.innerHTML = '<p class="search-placeholder">Introduce tu busqueda para ver resultados.</p>';
            }
            if (currentType !== "all") {
                state.facetCache[currentType] = {};
                renderFiltersPanel(currentType);
            }
            state.isSearching = false;
            if (executeSearchBtn) {
                executeSearchBtn.disabled = false;
            }
            return;
        }

        if (searchResultsAreaEl) {
            searchResultsAreaEl.innerHTML = '<p class="search-placeholder"><i class="fas fa-spinner fa-spin"></i> Buscando...</p>';
        }

        try {
            if (currentType === "all") {
                const queries = [
                    { indexName: INDEX_NAME_BY_ENTITY.lists, query, params: { hitsPerPage: 5 } },
                    { indexName: INDEX_NAME_BY_ENTITY.users, query, params: { hitsPerPage: 5 } },
                    { indexName: INDEX_NAME_BY_ENTITY.places, query, params: { hitsPerPage: 5 } },
                    { indexName: INDEX_NAME_BY_ENTITY.items, query, params: { hitsPerPage: 5 } }
                ];
                const { results } = await searchClient.multipleQueries(queries);
                const order = ["lists", "users", "places", "items"];
                const aggregated = [];
                results.forEach((result, index) => {
                    const entityKey = order[index] || "lists";
                    const resultType = RESULT_TYPE_BY_ENTITY[entityKey] || "list";
                    result.hits.forEach((hit) => {
                        aggregated.push({ ...hit, type: resultType });
                    });
                });
                renderResults(aggregated);
            } else {
                const indexName = INDEX_NAME_BY_ENTITY[currentType];
                const index = searchClient.initIndex(indexName);
                const params = getSearchParams(currentType);
                const response = await index.search(query, params);
                state.facetCache[currentType] = response.facets || {};
                renderFiltersPanel(currentType);
                const resultType = RESULT_TYPE_BY_ENTITY[currentType];
                const hits = (response.hits || []).map((hit) => ({ ...hit, type: resultType }));
                renderResults(hits);
            }
        } catch (error) {
            console.error("Error en la busqueda con Algolia:", error);
            if (searchResultsAreaEl) {
                searchResultsAreaEl.innerHTML = '<p class="search-placeholder error-placeholder">Vaya, algo ha fallado al buscar.</p>';
            }
        } finally {
            state.isSearching = false;
            if (executeSearchBtn) {
                executeSearchBtn.disabled = false;
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
        if (filtersHeaderLabel) {
            const activeCount = countActiveFilters(type);
            filtersHeaderLabel.textContent = activeCount > 0 ? `Filtros (${activeCount})` : "Filtros";
        }
        if (clearFiltersBtn) {
            const hasFilters = countActiveFilters(type) > 0;
            clearFiltersBtn.disabled = type === "all" || !hasFilters;
        }
        if (type === "all") {
            filtersPanelEl.innerHTML = '<p class="filters-placeholder">Selecciona un tipo de contenido para ver filtros.</p>';
            return;
        }
        const facetData = state.facetCache[type];
        const definitions = FILTER_DEFINITIONS[type] || [];
        if (!facetData || Object.keys(facetData).length === 0) {
            filtersPanelEl.innerHTML = '<p class="filters-placeholder">Realiza una busqueda para cargar filtros.</p>';
            return;
        }
        if (definitions.length === 0) {
            filtersPanelEl.innerHTML = '<p class="filters-placeholder">No hay filtros disponibles para este tipo.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        definitions.forEach((definition) => {
            if (definition.type === "facet") {
                const section = createFacetSection(type, definition, facetData[definition.attribute] || {});
                fragment.appendChild(section);
            } else if (definition.type === "numeric") {
                fragment.appendChild(createNumericSection(type, definition));
            }
        });
        filtersPanelEl.innerHTML = "";
        filtersPanelEl.appendChild(fragment);
    }

    function createFacetSection(type, definition, facetValues) {
        const container = document.createElement("div");
        container.className = "filter-block";

        const title = document.createElement("h3");
        title.className = "filter-block__title";
        title.textContent = definition.label;
        container.appendChild(title);

        const entries = Object.entries(facetValues || {});
        if (entries.length === 0) {
            const empty = document.createElement("p");
            empty.className = "filter-block__empty";
            empty.textContent = "Sin opciones disponibles";
            container.appendChild(empty);
            return container;
        }

        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "filter-block__options";
        const selectedSet = state.filters[type][definition.stateKey];

        entries
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .forEach(([value, count]) => {
                const option = document.createElement("label");
                option.className = "filter-option";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = value;
                checkbox.checked = selectedSet.has(value);
                checkbox.addEventListener("change", () => {
                    if (checkbox.checked) {
                        selectedSet.add(value);
                    } else {
                        selectedSet.delete(value);
                    }
                    performSearch();
                });

                const labelSpan = document.createElement("span");
                labelSpan.className = "filter-option__label";
                labelSpan.textContent = value;

                const countSpan = document.createElement("span");
                countSpan.className = "filter-option__count";
                countSpan.textContent = count;

                option.appendChild(checkbox);
                option.appendChild(labelSpan);
                option.appendChild(countSpan);
                optionsWrapper.appendChild(option);
            });

        container.appendChild(optionsWrapper);
        return container;
    }

    function createNumericSection(type, definition) {
        const container = document.createElement("div");
        container.className = "filter-block";

        const title = document.createElement("h3");
        title.className = "filter-block__title";
        title.textContent = definition.label;
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
            performSearch();
        });
        const anyLabel = document.createElement("span");
        anyLabel.className = "filter-option__label";
        anyLabel.textContent = "Cualquiera";
        anyOption.appendChild(anyInput);
        anyOption.appendChild(anyLabel);
        optionsWrapper.appendChild(anyOption);

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
                performSearch();
            });
            const labelText = document.createElement("span");
            labelText.className = "filter-option__label";
            labelText.textContent = option.label;
            optionLabel.appendChild(radio);
            optionLabel.appendChild(labelText);
            optionsWrapper.appendChild(optionLabel);
        });

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
        performSearch();
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
    }

    function init() {
        console.log("Initializing Search page logic with Algolia filters...");
        cacheDOMElements();
        debouncedSearch = debounce(performSearch, 300);
        initEventListeners();
        renderFiltersPanel(state.currentEntityType);
        loadInitialQueryFromUrl();
    }

    return {
        init
    };
})();
