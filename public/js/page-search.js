window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageSearch = (() => {
    const ENTITY_TYPES = [
        { id: "items", label: "Elementos", icon: "fas fa-star" },
        { id: "lists", label: "Listas", icon: "fas fa-list-alt" },
        { id: "places", label: "Lugares", icon: "fas fa-map-marker-alt" },
        { id: "users", label: "Usuarios", icon: "fas fa-user" },
        { id: "all", label: "Todo", icon: "fas fa-globe" }
    ];

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
    const MOBILE_BREAKPOINT = 960;

    const FILTER_DEFINITIONS = {
        lists: [
            { id: "categories", label: "Categorias", type: "facet", attribute: "categoryId", stateKey: "categories", sort: "alpha", maxOptions: 60 },
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
            { id: "provinces", label: "Provincia", type: "facet", attribute: "province", stateKey: "provinces", sort: "alpha", maxOptions: 80, collapsible: true },
            { id: "cities", label: "Localidad", type: "facet", attribute: "city", stateKey: "cities", sort: "alpha", maxOptions: 80, collapsible: true, defaultOpen: false },
            { id: "services", label: "Servicios", type: "facet", attribute: "serviceOptions", stateKey: "services", sort: "alpha", maxOptions: 60 },
            { id: "accessibility", label: "Accesibilidad", type: "facet", attribute: "accessibility", stateKey: "accessibility", sort: "alpha", maxOptions: 60 },
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
            { id: "categories", label: "Categorias", type: "facet", attribute: "listCategoryId", stateKey: "categories", sort: "alpha", maxOptions: 60 },
            { id: "lists", label: "Listas", type: "facet", attribute: "listName", stateKey: "lists", sort: "alpha", maxOptions: 60 },
            { id: "provinces", label: "Provincia", type: "facet", attribute: "placeProvince", stateKey: "provinces", sort: "alpha", maxOptions: 80 },
            { id: "cities", label: "Ciudad", type: "facet", attribute: "placeCity", stateKey: "cities", sort: "alpha", maxOptions: 80 },
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
            { id: "location", label: "Lugar", type: "facet", attribute: "residence", stateKey: "locations", sort: "alpha", maxOptions: 80 },
            { id: "badges", label: "Insignias", type: "facet", attribute: "badges", stateKey: "badges", sort: "alpha", maxOptions: 40 },
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
                minReviews: null
            },
            places: {
                provinces: new Set(),
                cities: new Set(),
                services: new Set(),
                accessibility: new Set(),
                minRating: null
            },
            items: {
                categories: new Set(),
                lists: new Set(),
                provinces: new Set(),
                cities: new Set(),
                minRating: null
            },
            users: {
                locations: new Set(),
                badges: new Set(),
                minFollowers: null
            }
        };
    }

    const state = {
        currentSearchQuery: "",
        currentEntityType: "items",
        isSearching: false,
        filters: createInitialFilters(),
        facetCache: {},
        collapsedFilters: {},
        isMobileFiltersOpen: false
    };

    const searchClient = algoliasearch(ListopicApp.config.ALGOLIA_APP_ID, ListopicApp.config.ALGOLIA_SEARCH_KEY);
    const numberFormatter = new Intl.NumberFormat("es-ES");

    let mainSearchInput;
    let entityTypeContainer;
    let entityTypeButtons = [];
    let searchResultsAreaEl;
    let executeSearchBtn;
    let filtersPanelEl;
    let clearFiltersBtn;
    let filtersHeaderLabel;
    let activeFiltersSummaryEl;
    let debouncedSearch;

    function cacheDOMElements() {
        mainSearchInput = document.getElementById("main-search-input");
        searchResultsAreaEl = document.getElementById("search-results-area");
        executeSearchBtn = document.getElementById("execute-search-btn");
        filtersPanelWrapper = document.getElementById("search-filters-panel");
        filtersPanelEl = document.getElementById("filters-panel-content");
        clearFiltersBtn = document.getElementById("clear-filters-btn");
        filtersHeaderLabel = document.getElementById("filters-header-label");
        activeFiltersSummaryEl = document.getElementById("active-filters-summary");
        filtersMobileToggleBtn = document.getElementById("filters-mobile-toggle");
        filtersMobileCloseBtn = document.getElementById("filters-mobile-close");
        filtersMobileOverlay = document.getElementById("filters-mobile-overlay");
        entityTypeContainer = document.getElementById("filters-entity-type") || document.querySelector(".entity-type-filters");
    }

    function renderEntityTypeControls() {
        if (!entityTypeContainer) {
            entityTypeButtons = Array.from(document.querySelectorAll(".entity-type-btn"));
            syncEntityTypeSelection();
            return;
        }
        entityTypeContainer.innerHTML = "";
        const fragment = document.createDocumentFragment();
        ENTITY_TYPES.forEach(({ id, label, icon }) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "entity-type-btn filter-pill";
            button.dataset.type = id;
            button.setAttribute("aria-pressed", "false");
            button.innerHTML = `<i class="${icon}"></i> ${label}`;
            fragment.appendChild(button);
        });
        entityTypeContainer.appendChild(fragment);
        entityTypeButtons = Array.from(entityTypeContainer.querySelectorAll(".entity-type-btn"));
        syncEntityTypeSelection();
    }

    function syncEntityTypeSelection() {
        entityTypeButtons.forEach((button) => {
            const isActive = button.dataset.type === state.currentEntityType;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function ensureCollapseRegistry(type) {
        if (!state.collapsedFilters[type]) {
            state.collapsedFilters[type] = {};
        }
        return state.collapsedFilters[type];
    }

    function ensureCollapseDefaults(type, definitions) {
        const registry = ensureCollapseRegistry(type);
        definitions.forEach((definition) => {
            if (definition.collapsible && typeof registry[definition.id] !== "boolean") {
                registry[definition.id] = definition.defaultOpen === false;
            }
        });
    }

    function isFilterCollapsed(type, definition) {
        const registry = ensureCollapseRegistry(type);
        if (typeof registry[definition.id] === "boolean") {
            return registry[definition.id];
        }
        return definition.defaultOpen === false;
    }

    function setFilterCollapsed(type, definitionId, isCollapsed) {
        const registry = ensureCollapseRegistry(type);
        registry[definitionId] = isCollapsed === true;
    }

    function isMobileViewport() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function syncMobileFiltersToggleState() {
        if (!filtersMobileToggleBtn) {
            return;
        }
        filtersMobileToggleBtn.setAttribute("aria-expanded", state.isMobileFiltersOpen ? "true" : "false");
    }

    function applyMobileFiltersVisibility() {
        if (!filtersPanelWrapper) {
            return;
        }
        if (!isMobileViewport()) {
            filtersPanelWrapper.classList.remove("is-mobile-open");
            filtersMobileOverlay?.classList.remove("is-active");
            document.body.classList.remove("filters-panel-open");
            syncMobileFiltersToggleState();
            return;
        }
        if (state.isMobileFiltersOpen) {
            filtersPanelWrapper.classList.add("is-mobile-open");
            filtersMobileOverlay?.classList.add("is-active");
            document.body.classList.add("filters-panel-open");
        } else {
            filtersPanelWrapper.classList.remove("is-mobile-open");
            filtersMobileOverlay?.classList.remove("is-active");
            document.body.classList.remove("filters-panel-open");
        }
        syncMobileFiltersToggleState();
    }

    function openMobileFiltersPanel() {
        if (!isMobileViewport()) {
            return;
        }
        state.isMobileFiltersOpen = true;
        applyMobileFiltersVisibility();
    }

    function closeMobileFiltersPanel() {
        state.isMobileFiltersOpen = false;
        applyMobileFiltersVisibility();
    }

    function toggleMobileFiltersPanel() {
        if (!isMobileViewport()) {
            return;
        }
        state.isMobileFiltersOpen = !state.isMobileFiltersOpen;
        applyMobileFiltersVisibility();
    }

    function handleViewportResize() {
        if (!isMobileViewport()) {
            closeMobileFiltersPanel();
            return;
        }
        applyMobileFiltersVisibility();
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

    function onEntityTypeButtonClick(event) {
        updateEntityTypeSelection(event.currentTarget);
    }

    function updateEntityTypeSelection(button) {
        if (!button) {
            return;
        }
        const newType = button.dataset.type;
        if (!newType || newType === state.currentEntityType) {
            return;
        }
        state.currentEntityType = newType;
        syncEntityTypeSelection();
        renderFiltersPanel(state.currentEntityType);
        if (isMobileViewport()) {
            openMobileFiltersPanel();
        }
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
            const selected = state.filters[type]?.[definition.stateKey];
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
            const selectedValue = state.filters[type]?.[definition.stateKey];
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
        const filterState = state.filters[type];
        if (!filterState) {
            return 0;
        }
        let total = 0;
        definitions.forEach((definition) => {
            const value = filterState[definition.stateKey];
            if (definition.type === "facet" && value instanceof Set) {
                total += value.size;
            } else if (definition.type === "numeric" && value !== null && value !== undefined) {
                total += 1;
            }
        });
        return total;
    }

    function getFilterDefinitionById(type, definitionId) {
        const definitions = FILTER_DEFINITIONS[type] || [];
        return definitions.find((definition) => definition.id === definitionId) || null;
    }

    function collectActiveFilters(type) {
        if (type === "all") {
            return [];
        }
        const definitions = FILTER_DEFINITIONS[type] || [];
        const filterState = state.filters[type];
        if (!filterState) {
            return [];
        }
        const active = [];
        definitions.forEach((definition) => {
            const value = filterState[definition.stateKey];
            if (definition.type === "facet" && value instanceof Set) {
                value.forEach((entry) => {
                    active.push({
                        id: definition.id,
                        type,
                        stateKey: definition.stateKey,
                        label: definition.label,
                        displayValue: entry,
                        rawValue: entry
                    });
                });
            } else if (definition.type === "numeric" && value !== null && value !== undefined) {
                const option = (definition.options || []).find((opt) => Number(opt.value) === Number(value));
                active.push({
                    id: definition.id,
                    type,
                    stateKey: definition.stateKey,
                    label: definition.label,
                    displayValue: option ? option.label : value,
                    rawValue: Number(value)
                });
            }
        });
        return active;
    }
    function renderActiveFiltersSummary(type) {
        if (!activeFiltersSummaryEl) {
            return;
        }
        activeFiltersSummaryEl.innerHTML = "";
        activeFiltersSummaryEl.classList.remove("is-visible");
        if (type === "all") {
            return;
        }
        const activeFilters = collectActiveFilters(type);
        if (activeFilters.length === 0) {
            return;
        }
        activeFiltersSummaryEl.classList.add("is-visible");

        const title = document.createElement("p");
        title.className = "active-filters-title";
        title.textContent = "Filtros activos";
        activeFiltersSummaryEl.appendChild(title);

        const chipsWrapper = document.createElement("div");
        chipsWrapper.className = "active-filters-chips";

        activeFilters.forEach((entry) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "active-filter-chip";
            chip.dataset.definitionId = entry.id;
            chip.dataset.stateKey = entry.stateKey;
            chip.dataset.filterValue = String(entry.rawValue);
            chip.innerHTML = `<span class="chip-label">${escapeHtml(entry.label)}</span>` +
                `<span class="chip-value">${escapeHtml(String(entry.displayValue))}</span>` +
                '<i class="fas fa-times" aria-hidden="true"></i>';
            chip.addEventListener("click", () => {
                const definition = getFilterDefinitionById(entry.type, entry.id);
                if (!definition) {
                    return;
                }
                if (definition.type === "facet") {
                    const selectedSet = state.filters[entry.type]?.[definition.stateKey];
                    if (selectedSet instanceof Set) {
                        selectedSet.delete(entry.rawValue);
                    }
                } else if (definition.type === "numeric") {
                    state.filters[entry.type][definition.stateKey] = null;
                }
                performSearch();
            });
            chipsWrapper.appendChild(chip);
        });

        activeFiltersSummaryEl.appendChild(chipsWrapper);
    }

    function getFacetEntries(definition, facetValues, selectedSet) {
        const entries = Object.entries(facetValues || {}).map(([value, count]) => ({
            value,
            count: Number(count) || 0
        }));
        if (selectedSet instanceof Set) {
            selectedSet.forEach((value) => {
                if (!entries.some((entry) => entry.value === value)) {
                    entries.push({ value, count: 0 });
                }
            });
        }
        const normalizedSet = selectedSet instanceof Set ? selectedSet : null;
        const sortMode = definition.sort === "alpha" ? "alpha" : "count";
        entries.sort((a, b) => {
            const aSelected = normalizedSet ? normalizedSet.has(a.value) : false;
            const bSelected = normalizedSet ? normalizedSet.has(b.value) : false;
            if (aSelected !== bSelected) {
                return aSelected ? -1 : 1;
            }
            if (sortMode === "alpha") {
                const comparison = a.value.localeCompare(b.value, "es", { sensitivity: "base" });
                if (comparison !== 0) {
                    return comparison;
                }
                return (b.count || 0) - (a.count || 0);
            }
            if ((b.count || 0) !== (a.count || 0)) {
                return (b.count || 0) - (a.count || 0);
            }
            return a.value.localeCompare(b.value, "es", { sensitivity: "base" });
        });
        const limit = definition.maxOptions ?? 60;
        return entries.slice(0, limit);
    }

    function createFacetSection(type, definition, facetValues) {
        const container = document.createElement("section");
        container.className = "filter-block";
        if (definition.collapsible) {
            container.classList.add("filter-block--collapsible");
        }

        const isCollapsed = definition.collapsible ? isFilterCollapsed(type, definition) : false;
        if (isCollapsed) {
            container.classList.add("filter-block--collapsed");
        }

        const headerRow = document.createElement("div");
        headerRow.className = "filter-block__title-row";

        const title = document.createElement("h3");
        title.className = "filter-block__title";
        title.textContent = definition.label;
        headerRow.appendChild(title);

        const headerActions = document.createElement("div");
        headerActions.className = "filter-block__actions";

        const selectedSet = state.filters[type]?.[definition.stateKey];
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "filter-block__clear";
        clearBtn.textContent = "Limpiar";
        clearBtn.disabled = !(selectedSet instanceof Set) || selectedSet.size === 0;
        clearBtn.addEventListener("click", () => {
            if (selectedSet instanceof Set) {
                selectedSet.clear();
                performSearch();
            }
        });
        headerActions.appendChild(clearBtn);

        if (definition.collapsible) {
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.className = "filter-block__toggle";
            toggleBtn.setAttribute("aria-expanded", (!isCollapsed).toString());
            toggleBtn.innerHTML = `<i class="fas ${isCollapsed ? "fa-chevron-down" : "fa-chevron-up"}"></i>`;
            toggleBtn.addEventListener("click", () => {
                setFilterCollapsed(type, definition.id, !isCollapsed);
                renderFiltersPanel(type);
                if (isMobileViewport()) {
                    applyMobileFiltersVisibility();
                }
            });
            headerActions.appendChild(toggleBtn);
        }

        headerRow.appendChild(headerActions);
        container.appendChild(headerRow);

        const isPlaceCityFacet = type === "places" && definition.id === "cities";
        const provincesSet = state.filters.places?.provinces;
        const provincesSelected = provincesSet instanceof Set && provincesSet.size > 0;
        const citiesSelected = selectedSet instanceof Set && selectedSet.size > 0;
        const gateCityFacet = isPlaceCityFacet && !provincesSelected && !citiesSelected;

        const entries = gateCityFacet ? [] : getFacetEntries(definition, facetValues, selectedSet);

        if (gateCityFacet) {
            const helper = document.createElement("p");
            helper.className = "filter-block__helper";
            helper.textContent = "Selecciona una provincia para ver localidades.";
            container.appendChild(helper);
        }

        if (!gateCityFacet && entries.length === 0) {
            const empty = document.createElement("p");
            empty.className = "filter-block__empty";
            empty.textContent = facetValues ? "Sin opciones disponibles" : "Empieza a buscar para ver opciones.";
            container.appendChild(empty);
        }

        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "filter-block__options filter-block__options--scroll";
        if (definition.collapsible && isCollapsed) {
            optionsWrapper.hidden = true;
        }

        if (entries.length > 0) {
            entries.forEach(({ value, count }) => {
                const option = document.createElement("label");
                option.className = "filter-option";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = value;
                checkbox.checked = selectedSet instanceof Set ? selectedSet.has(value) : false;
                checkbox.addEventListener("change", () => {
                    if (!(selectedSet instanceof Set)) {
                        return;
                    }
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
                countSpan.textContent = numberFormatter.format(count);

                option.appendChild(checkbox);
                option.appendChild(labelSpan);
                option.appendChild(countSpan);
                optionsWrapper.appendChild(option);
            });
            container.appendChild(optionsWrapper);
        } else if (!gateCityFacet) {
            container.appendChild(optionsWrapper);
        }

        return container;
    }
    function createNumericSection(type, definition) {
        const container = document.createElement("section");
        container.className = "filter-block";

        const headerRow = document.createElement("div");
        headerRow.className = "filter-block__title-row";

        const title = document.createElement("h3");
        title.className = "filter-block__title";
        title.textContent = definition.label;
        headerRow.appendChild(title);

        const headerActions = document.createElement("div");
        headerActions.className = "filter-block__actions";

        const currentValue = state.filters[type]?.[definition.stateKey];
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "filter-block__clear";
        clearBtn.textContent = "Limpiar";
        clearBtn.disabled = currentValue === null || currentValue === undefined;
        clearBtn.addEventListener("click", () => {
            state.filters[type][definition.stateKey] = null;
            performSearch();
        });
        headerActions.appendChild(clearBtn);

        headerRow.appendChild(headerActions);
        container.appendChild(headerRow);

        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "filter-block__options filter-block__options--inline";
        const radioName = `filter-${type}-${definition.stateKey}`;

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
    function renderFiltersPanel(type) {
        if (!filtersPanelEl) {
            return;
        }
        if (filtersHeaderLabel) {
            const activeCount = countActiveFilters(type);
            filtersHeaderLabel.textContent = activeCount > 0 ? "Filtros (" + activeCount + ")" : "Filtros";
        }
        if (clearFiltersBtn) {
            const hasFilters = countActiveFilters(type) > 0;
            clearFiltersBtn.disabled = type === "all" || !hasFilters;
        }

        renderActiveFiltersSummary(type);

        if (type === "all") {
            filtersPanelEl.innerHTML = '<p class="filters-placeholder">Selecciona un tipo de contenido para ver filtros.</p>';
            applyMobileFiltersVisibility();
            return;
        }

        const definitions = FILTER_DEFINITIONS[type] || [];
        if (definitions.length === 0) {
            filtersPanelEl.innerHTML = '<p class="filters-placeholder">No hay filtros disponibles para este tipo.</p>';
            applyMobileFiltersVisibility();
            return;
        }

        ensureCollapseDefaults(type, definitions);

        if (type === "places") {
            const provincesSet = state.filters.places?.provinces;
            const provincesSelected = provincesSet instanceof Set && provincesSet.size > 0;
            const citiesDefinition = definitions.find((definition) => definition.id === "cities");
            if (provincesSelected && citiesDefinition && isFilterCollapsed(type, citiesDefinition)) {
                setFilterCollapsed(type, citiesDefinition.id, false);
            }
        }

        const facetData = state.facetCache[type] || {};
        const fragment = document.createDocumentFragment();
        definitions.forEach((definition) => {
            if (definition.type === "facet") {
                fragment.appendChild(createFacetSection(type, definition, facetData[definition.attribute]));
            } else if (definition.type === "numeric") {
                fragment.appendChild(createNumericSection(type, definition));
            }
        });

        filtersPanelEl.innerHTML = "";
        filtersPanelEl.appendChild(fragment);
        applyMobileFiltersVisibility();
    }
    async function performSearch() {
        if (state.isSearching) {
            return;
        }
        const query = (mainSearchInput?.value || "").trim();
        state.currentSearchQuery = query;
        const currentType = state.currentEntityType;

        state.isSearching = true;
        if (executeSearchBtn) {
            executeSearchBtn.disabled = true;
        }

        renderFiltersPanel(currentType);

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
                    (result.hits || []).forEach((hit) => {
                        aggregated.push({ ...hit, type: resultType });
                    });
                });
                renderResults(aggregated);
            } else {
                const indexName = INDEX_NAME_BY_ENTITY[currentType];
                const index = searchClient.initIndex(indexName);
                const params = getSearchParams(currentType);
                const response = await index.search(query, params);
                const previousFacets = state.facetCache[currentType] || {};
                const newFacets = response.facets && Object.keys(response.facets).length > 0 ? response.facets : previousFacets;
                state.facetCache[currentType] = newFacets;
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

    function resetFiltersForCurrentType() {
        const type = state.currentEntityType;
        if (type === "all") {
            return;
        }
        const freshFilters = createInitialFilters();
        state.filters[type] = freshFilters[type];
        renderFiltersPanel(type);
        performSearch();
    }

    function loadInitialQueryFromUrl() {
        let hasPrefilledQuery = false;
        try {
            const params = new URLSearchParams(window.location.search);
            const qParam = params.get("q") || params.get("tag");
            const typeParam = params.get("type");
            if (typeParam && (typeParam === "all" || FILTER_DEFINITIONS[typeParam])) {
                state.currentEntityType = typeParam;
            }
            if (qParam && mainSearchInput) {
                mainSearchInput.value = qParam;
                hasPrefilledQuery = true;
            }
        } catch (error) {
            console.warn("page-search: no se pudo leer los parametros de busqueda.", error);
        }
        return hasPrefilledQuery;
    }

    function initEventListeners() {
        if (mainSearchInput) {
            mainSearchInput.addEventListener("input", debouncedSearch);
        }
        if (executeSearchBtn) {
            executeSearchBtn.addEventListener("click", performSearch);
        }
        entityTypeButtons.forEach((button) => {
            button.addEventListener("click", onEntityTypeButtonClick);
        });
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener("click", resetFiltersForCurrentType);
        }
    }

    function init() {
        console.log("Initializing Search page logic with Algolia filters...");
        cacheDOMElements();
        renderEntityTypeControls();
        handleViewportResize();
        debouncedSearch = debounce(performSearch, 300);
        loadInitialQueryFromUrl();
        syncEntityTypeSelection();
        renderFiltersPanel(state.currentEntityType);
        initEventListeners();
        performSearch();
    }

    return {
        init
    };
})();


