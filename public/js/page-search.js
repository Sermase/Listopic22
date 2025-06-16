window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageSearch = (() => {
    const state = {
        currentSearchQuery: '',
        currentEntityType: 'all',
        advancedFilters: {},
        isSearching: false // Prevenir búsquedas múltiples simultáneas
    };

    let mainSearchInput, executeSearchBtn, entityTypeButtons,
        openFiltersModalBtn, advancedFiltersModal, closeFiltersModalBtn,
        advancedFiltersContentEl, applyAdvancedFiltersBtn, searchResultsAreaEl;

    function cacheDOMElements() {
        mainSearchInput = document.getElementById('main-search-input');
        executeSearchBtn = document.getElementById('execute-search-btn');
        entityTypeButtons = document.querySelectorAll('.entity-type-btn');
        openFiltersModalBtn = document.getElementById('open-advanced-filters-modal-btn');
        advancedFiltersModal = document.getElementById('advanced-filters-modal');
        closeFiltersModalBtn = document.getElementById('close-advanced-filters-modal-btn');
        advancedFiltersContentEl = document.getElementById('advanced-filters-content');
        applyAdvancedFiltersBtn = document.getElementById('apply-advanced-filters-btn');
        searchResultsAreaEl = document.getElementById('search-results-area');
    }

    function updateEntityTypeSelection(selectedButton) {
        entityTypeButtons.forEach(btn => btn.classList.remove('active'));
        selectedButton.classList.add('active');
        state.currentEntityType = selectedButton.dataset.type;
        console.log("Tipo de entidad seleccionado:", state.currentEntityType);
        populateAdvancedFiltersModal();
    }

    function populateAdvancedFiltersModal() {
        if (!advancedFiltersContentEl) return;
        advancedFiltersContentEl.innerHTML = '';

        switch (state.currentEntityType) {
            case 'places':
                advancedFiltersContentEl.innerHTML = `
                    <div class="form-group">
                        <label for="filter-location">Ubicación (Ciudad, Región):</label>
                        <input type="text" id="filter-location" class="form-input" placeholder="Ej: Madrid">
                    </div>`;
                break;
            case 'users':
                advancedFiltersContentEl.innerHTML = `
                    <div class="form-group">
                        <label for="filter-badge">Insignia:</label>
                        <select id="filter-badge" class="form-input">
                            <option value="">Cualquiera</option>
                            <option value="experto_cafes">Experto en Cafés</option>
                            <option value="foodie_pro">Foodie Pro</option>
                        </select>
                    </div>`;
                break;
            case 'lists':
                advancedFiltersContentEl.innerHTML = `
                    <div class="form-group">
                        <label for="filter-category">Categoría:</label>
                        <select id="filter-category" class="form-input">
                            <option value="">Cualquiera</option>
                            <option value="Hmm...">Hmm...</option> 
                        </select>
                    </div>`;
                break;
            case 'items':
                advancedFiltersContentEl.innerHTML = `
                    <div class="form-group">
                        <label for="filter-item-tag">Etiqueta del Elemento:</label>
                        <input type="text" id="filter-item-tag" class="form-input" placeholder="Ej: sin gluten, vegetariano">
                    </div>`;
                break;
            default:
                advancedFiltersContentEl.innerHTML = '<p>No hay filtros avanzados para esta selección.</p>';
                break;
        }
    }
    
    function openModal() {
        if (advancedFiltersModal) advancedFiltersModal.style.display = 'flex';
        populateAdvancedFiltersModal();
    }

    function closeModal() {
        if (advancedFiltersModal) advancedFiltersModal.style.display = 'none';
    }

    function applyFiltersFromModal() {
        state.advancedFilters = {};
        
        switch (state.currentEntityType) {
            case 'places':
                const locInput = document.getElementById('filter-location');
                if (locInput && locInput.value.trim()) {
                    state.advancedFilters.location = locInput.value.trim();
                }
                break;
            case 'users':
                const badgeSelect = document.getElementById('filter-badge');
                if (badgeSelect && badgeSelect.value) {
                    state.advancedFilters.badge = badgeSelect.value;
                }
                break;
            case 'lists':
                const catSelect = document.getElementById('filter-category');
                if (catSelect && catSelect.value) {
                    state.advancedFilters.category = catSelect.value;
                }
                break;
            case 'items':
                const itemTagInput = document.getElementById('filter-item-tag');
                if (itemTagInput && itemTagInput.value.trim()) {
                    state.advancedFilters.tag = itemTagInput.value.trim();
                }
                break;
        }
        
        console.log("Filtros avanzados aplicados:", state.advancedFilters);
        closeModal();
        performSearch();
    }

    async function performSearch() {
        if (!searchResultsAreaEl || !ListopicApp.services.db || state.isSearching) return;
        
        state.isSearching = true;
        state.currentSearchQuery = mainSearchInput ? mainSearchInput.value.trim().toLowerCase() : '';
        searchResultsAreaEl.innerHTML = '<p class="search-placeholder">Buscando...</p>';
        
        // Deshabilitar botón de búsqueda
        if (executeSearchBtn) executeSearchBtn.disabled = true;
        
        console.log("Realizando búsqueda con:", state);

        const db = ListopicApp.services.db;
        let results = [];
        let queryDescription = `Resultados para "${state.currentSearchQuery}"`;

        try {
            // Búsqueda en listas
            if (state.currentEntityType === 'lists' || state.currentEntityType === 'all') {
                const listResults = await searchLists(db, state.currentSearchQuery, state.advancedFilters);
                results.push(...listResults);
            }

            // Búsqueda en usuarios
            if (state.currentEntityType === 'users' || state.currentEntityType === 'all') {
                const userResults = await searchUsers(db, state.currentSearchQuery, state.advancedFilters);
                results.push(...userResults);
            }

            // Búsqueda en lugares
            if (state.currentEntityType === 'places' || state.currentEntityType === 'all') {
                const placeResults = await searchPlaces(db, state.currentSearchQuery, state.advancedFilters);
                results.push(...placeResults);
            }

            // Búsqueda en elementos/reseñas
            if (state.currentEntityType === 'items' || state.currentEntityType === 'all') {
                const itemResults = await searchItems(db, state.currentSearchQuery, state.advancedFilters);
                results.push(...itemResults);
            }

            renderResults(results, queryDescription);

        } catch (error) {
            console.error("Error durante la búsqueda:", error);
            searchResultsAreaEl.innerHTML = `<p class="search-placeholder error-placeholder">Error al realizar la búsqueda: ${error.message}</p>`;
        } finally {
            state.isSearching = false;
            if (executeSearchBtn) executeSearchBtn.disabled = false;
        }
    }

    // Funciones de búsqueda específicas
    async function searchLists(db, query, filters) {
        let listQuery = db.collection('lists').where('isPublic', '==', true);
        
        if (filters.category) {
            listQuery = listQuery.where('categoryId', '==', filters.category);
        }
        
        // Para búsqueda de texto, necesitarías implementar un índice de búsqueda
        // o usar un servicio como Algolia
        if (query) {
            listQuery = listQuery.orderBy('name').startAt(query).endAt(query + '\uf8ff');
        }
        
        const snapshot = await listQuery.limit(10).get();
        const results = [];
        snapshot.forEach(doc => {
            results.push({id: doc.id, type: 'list', ...doc.data()});
        });
        
        return results;
    }

    async function searchUsers(db, query, filters) {
        let userQuery = db.collection('users');
        
        if (filters.badge) {
            userQuery = userQuery.where('badges', 'array-contains', filters.badge);
        }
        
        if (query) {
            userQuery = userQuery.orderBy('displayName').startAt(query).endAt(query + '\uf8ff');
        }
        
        const snapshot = await userQuery.limit(10).get();
        const results = [];
        snapshot.forEach(doc => {
            results.push({id: doc.id, type: 'user', ...doc.data()});
        });
        
        return results;
    }

    async function searchPlaces(db, query, filters) {
        let placeQuery = db.collection('places');
        
        if (filters.location) {
            // Implementar búsqueda por ubicación
            placeQuery = placeQuery.where('city', '==', filters.location);
        }
        
        if (query) {
            placeQuery = placeQuery.orderBy('name').startAt(query).endAt(query + '\uf8ff');
        }
        
        const snapshot = await placeQuery.limit(10).get();
        const results = [];
        snapshot.forEach(doc => {
            results.push({id: doc.id, type: 'place', ...doc.data()});
        });
        
        return results;
    }

    async function searchItems(db, query, filters) {
        // Usar collectionGroup para buscar en todas las reseñas
        let itemQuery = db.collectionGroup('reviews');
        
        if (filters.tag) {
            itemQuery = itemQuery.where('userTags', 'array-contains', filters.tag);
        }
        
        if (query) {
            itemQuery = itemQuery.where('itemName', '>=', query).where('itemName', '<=', query + '\uf8ff');
        }
        
        const snapshot = await itemQuery.limit(10).get();
        const results = [];
        snapshot.forEach(doc => {
            results.push({id: doc.id, type: 'item', ...doc.data()});
        });
        
        return results;
    }

    function renderResults(results, description) {
        if (!searchResultsAreaEl) return;
        searchResultsAreaEl.innerHTML = '';

        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'search-results-description';
        descriptionEl.textContent = description || `Mostrando ${results.length} resultados.`;
        searchResultsAreaEl.appendChild(descriptionEl);

        if (results.length === 0) {
            searchResultsAreaEl.innerHTML += '<p class="search-placeholder">No se encontraron resultados que coincidan con tu búsqueda.</p>';
            return;
        }

        results.forEach(item => {
            const uiUtils = ListopicApp.uiUtils;
            let cardHtml = '';
            
            switch (item.type) {
                case 'list':
                    cardHtml = `
                        <a href="list-view.html?listId=${item.id}" class="search-card">
                            <div class="search-card__icon-container">
                                <i class="fas fa-list-alt"></i>
                            </div>
                            <div class="search-card__content">
                                <h4 class="search-card__title">${uiUtils.escapeHtml(item.name)}</h4>
                                <div class="search-card__tags">
                                    <span class="info-tag info-tag--list"><i class="fas fa-stream"></i> Lista</span>
                                    <span class="info-tag"><i class="fas fa-coffee"></i> ${uiUtils.escapeHtml(item.categoryId || 'General')}</span>
                                    <span class="info-tag"><i class="fas fa-pencil-alt"></i> ${item.reviewCount || 0} reseñas</span>
                                </div>
                            </div>
                        </a>`;
                    break;
                
                case 'user':
                    cardHtml = `
                        <a href="profile.html?viewUserId=${item.id}" class="search-card">
                            <div class="search-card__icon-container">
                                ${item.photoUrl ? `<img src="${uiUtils.escapeHtml(item.photoUrl)}" alt="Avatar">` : '<i class="fas fa-user"></i>'}
                            </div>
                            <div class="search-card__content">
                                <h4 class="search-card__title">${uiUtils.escapeHtml(item.displayName || item.username)}</h4>
                                <div class="search-card__tags">
                                    <span class="info-tag info-tag--user"><i class="fas fa-user"></i> Usuario</span>
                                    <span class="info-tag"><i class="fas fa-user-friends"></i> ${item.followersCount || 0} seguidores</span>
                                </div>
                            </div>
                        </a>`;
                    break;
                
                case 'place':
                    cardHtml = `
                        <div class="search-card">
                            <div class="search-card__icon-container">
                                ${item.mainImageUrl ? `<img src="${uiUtils.escapeHtml(item.mainImageUrl)}" alt="Lugar">` : '<i class="fas fa-map-marker-alt"></i>'}
                            </div>
                            <div class="search-card__content">
                                <h4 class="search-card__title">${uiUtils.escapeHtml(item.name)}</h4>
                                <div class="search-card__tags">
                                    <span class="info-tag info-tag--place"><i class="fas fa-map-marker-alt"></i> Lugar</span>
                                    ${item.city ? `<span class="info-tag"><i class="fas fa-city"></i> ${uiUtils.escapeHtml(item.city)}</span>` : ''}
                                </div>
                            </div>
                        </div>`;
                    break;

                case 'item':
                    cardHtml = `
                        <div class="search-card">
                            <div class="search-card__icon-container">
                                ${item.photoUrl ? `<img src="${uiUtils.escapeHtml(item.photoUrl)}" alt="Item">` : '<i class="fas fa-star"></i>'}
                            </div>
                            <div class="search-card__content">
                                <h4 class="search-card__title">${uiUtils.escapeHtml(item.itemName || 'Elemento')}</h4>
                                <div class="search-card__tags">
                                    <span class="info-tag info-tag--item"><i class="fas fa-star"></i> Reseña</span>
                                    <span class="info-tag"><i class="fas fa-star-half-alt"></i> ${item.overallRating || 0}/5</span>
                                </div>
                            </div>
                        </div>`;
                    break;

                default:
                    cardHtml = `<div class="search-card"><p>Resultado desconocido: ${uiUtils.escapeHtml(item.name || 'Sin nombre')}</p></div>`;
            }
            
            searchResultsAreaEl.insertAdjacentHTML('beforeend', cardHtml);
        });
    }

    function init() {
        console.log('Initializing Search page logic...');
        cacheDOMElements();

        if (ListopicApp.uiUtils && ListopicApp.uiUtils.updatePageHeaderInfo) {
            ListopicApp.uiUtils.updatePageHeaderInfo("Búsqueda");
        }

        if (executeSearchBtn) {
            executeSearchBtn.addEventListener('click', performSearch);
        }
        
        if (mainSearchInput) {
            mainSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch();
            });
        }

        entityTypeButtons.forEach(button => {
            button.addEventListener('click', () => updateEntityTypeSelection(button));
        });
        
        if (openFiltersModalBtn) openFiltersModalBtn.addEventListener('click', openModal);
        if (closeFiltersModalBtn) closeFiltersModalBtn.addEventListener('click', closeModal);
        
        if (advancedFiltersModal) {
            advancedFiltersModal.addEventListener('click', (event) => {
                if (event.target === advancedFiltersModal) closeModal();
            });
        }
        
        if (applyAdvancedFiltersBtn) applyAdvancedFiltersBtn.addEventListener('click', applyFiltersFromModal);

        populateAdvancedFiltersModal();
    }

    return {
        init
    };
})();