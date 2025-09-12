window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageSearch = (() => {
    const state = {
        currentSearchQuery: '',
        currentEntityType: 'all',
        isSearching: false,
    };

    const searchClient = algoliasearch(ListopicApp.config.ALGOLIA_APP_ID, ListopicApp.config.ALGOLIA_SEARCH_KEY);
    
    let mainSearchInput, entityTypeButtons, searchResultsAreaEl, executeSearchBtn;
    let debouncedSearch;

    function cacheDOMElements() {
        mainSearchInput = document.getElementById('main-search-input');
        entityTypeButtons = document.querySelectorAll('.entity-type-btn');
        searchResultsAreaEl = document.getElementById('search-results-area');
        executeSearchBtn = document.getElementById('execute-search-btn'); // El botón que hemos añadido
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function updateEntityTypeSelection(selectedButton) {
        entityTypeButtons.forEach(btn => btn.classList.remove('active'));
        selectedButton.classList.add('active');
        state.currentEntityType = selectedButton.dataset.type;
        performSearch(); // Búsqueda instantánea al cambiar de filtro
    }

    async function performSearch() {
        if (state.isSearching) return;
        state.isSearching = true;
        if (executeSearchBtn) executeSearchBtn.disabled = true;

        state.currentSearchQuery = mainSearchInput.value.trim();
        if (!state.currentSearchQuery) {
            searchResultsAreaEl.innerHTML = '<p class="search-placeholder">Introduce tu búsqueda para ver resultados.</p>';
            state.isSearching = false;
            if (executeSearchBtn) executeSearchBtn.disabled = false;
            return;
        }

        searchResultsAreaEl.innerHTML = '<p class="search-placeholder"><i class="fas fa-spinner fa-spin"></i> Buscando...</p>';

        try {
            let results = [];
            
            if (state.currentEntityType === 'all') {
                const queries = [
                    { indexName: 'lists', query: state.currentSearchQuery, params: { hitsPerPage: 5 } },
                    { indexName: 'users', query: state.currentSearchQuery, params: { hitsPerPage: 5 } },
                    { indexName: 'places', query: state.currentSearchQuery, params: { hitsPerPage: 5 } },
                    { indexName: 'grouped_items', query: state.currentSearchQuery, params: { hitsPerPage: 5 } }
                ];
                const { results: algoliaResults } = await searchClient.multipleQueries(queries);
                
                results = [
                    ...algoliaResults[0].hits.map(h => ({...h, type: 'list'})),
                    ...algoliaResults[1].hits.map(h => ({...h, type: 'user'})),
                    ...algoliaResults[2].hits.map(h => ({...h, type: 'place'})),
                    ...algoliaResults[3].hits.map(h => ({...h, type: 'item'}))
                ];
            } else {
                const indexName = state.currentEntityType === 'items' ? 'grouped_items' : state.currentEntityType;
                const index = searchClient.initIndex(indexName);
                const { hits } = await index.search(state.currentSearchQuery);
                results = hits.map(h => ({...h, type: state.currentEntityType.slice(0, -1)}));
            }
            
            renderResults(results);

        } catch (error) {
            console.error("Error en la búsqueda con Algolia:", error);
            searchResultsAreaEl.innerHTML = `<p class="search-placeholder error-placeholder">Vaya, algo ha fallado al buscar.</p>`;
        } finally {
            state.isSearching = false;
            if (executeSearchBtn) executeSearchBtn.disabled = false;
        }
    }
    
    function renderResults(results) {
        if (results.length === 0) {
            searchResultsAreaEl.innerHTML = '<p class="search-placeholder">No hemos encontrado nada. Prueba con otras palabras.</p>';
            return;
        }

        const uiUtils = ListopicApp.uiUtils;
        const groupedResults = results.reduce((acc, item) => {
            const type = item.type || 'unknown';
            if (!acc[type]) acc[type] = [];
            acc[type].push(item);
            return acc;
        }, {});

        let finalHtml = '';
        const typeTitles = { list: 'Listas', user: 'Usuarios', place: 'Lugares', item: 'Elementos' };

        for (const type in typeTitles) {
            if (groupedResults[type] && groupedResults[type].length > 0) {
                finalHtml += `<h3 class="search-section-title">${typeTitles[type]}</h3>`;
                finalHtml += groupedResults[type].map(item => {
                    const id = item.objectID;
                    switch (type) {
                        case 'list': return uiUtils.createListCard(item, id);
                        case 'user': return uiUtils.createUserCard(item, id);
                        case 'place': return uiUtils.createPlaceCard(item, id);
                        case 'item': return uiUtils.createGroupedItemCard(item);
                        default: return '';
                    }
                }).join('');
            }
        }
        
        searchResultsAreaEl.innerHTML = finalHtml;
    }

    function init() {
        console.log('Initializing Search page logic (con búsqueda en directo)...');
        cacheDOMElements();

        debouncedSearch = debounce(performSearch, 300);

        if (mainSearchInput) {
            mainSearchInput.addEventListener('input', debouncedSearch);
        }

        if (executeSearchBtn) {
            executeSearchBtn.addEventListener('click', performSearch);
        }

        entityTypeButtons.forEach(button => {
            button.addEventListener('click', () => updateEntityTypeSelection(button));
        });

        // Prefill from URL params (?q= or ?tag=) and auto-search
        try {
            const params = new URLSearchParams(window.location.search);
            const qParam = params.get('q') || params.get('tag');
            if (qParam && mainSearchInput) {
                mainSearchInput.value = qParam;
                performSearch();
            }
        } catch (e) {
            console.warn('page-search: no se pudo leer los parámetros de búsqueda.', e);
        }
    }

    return {
        init
    };
})();
