window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageSearch = (() => {
    const state = {
        currentSearchQuery: '',
        selectedEntityTypes: [], // Cambio: array para selección múltiple
        advancedFilters: {},
        isSearching: false,
        searchCache: new Map(),
        searchHistory: []
    };

    // Cache para etiquetas de categorías (se cargan dinámicamente)
    const CATEGORY_TAGS_CACHE = new Map();

    // Función para obtener etiquetas de una categoría desde Firestore
    async function getCategoryTags(categoryName) {
        // Si ya están en cache, devolverlas
        if (CATEGORY_TAGS_CACHE.has(categoryName)) {
            return CATEGORY_TAGS_CACHE.get(categoryName);
        }

        try {
            // Mapear nombres de categorías a IDs de documentos
            const categoryMapping = {
                'Hmm...': 'comida_hmm',
                'Restaurantes': 'restaurantes', // Ajustar según tus datos
                'Cafeterías': 'cafeterias' // Ajustar según tus datos
            };

            const categoryId = categoryMapping[categoryName];
            if (!categoryId) {
                console.warn(`No se encontró mapeo para la categoría: ${categoryName}`);
                const defaultTags = getDefaultTagsForCategory(categoryName);
                CATEGORY_TAGS_CACHE.set(categoryName, defaultTags);
                return defaultTags;
            }

            // Obtener la categoría por ID de documento
            const categoryDoc = await ListopicApp.services.db.collection('categories').doc(categoryId).get();

            let tags = [];
            if (categoryDoc.exists) {
                const categoryData = categoryDoc.data();
                // Usar fixed-tags en lugar de tags
                tags = categoryData['fixed-tags'] || [];
                console.log(`Etiquetas cargadas para ${categoryName}:`, tags);
            }

            // Si no se encontraron etiquetas en Firestore, usar etiquetas por defecto
            if (tags.length === 0) {
                tags = getDefaultTagsForCategory(categoryName);
            }

            // Guardar en cache
            CATEGORY_TAGS_CACHE.set(categoryName, tags);
            return tags;
        } catch (error) {
            console.error('Error al obtener etiquetas de la categoría:', error);
            // En caso de error, usar etiquetas por defecto
            const defaultTags = getDefaultTagsForCategory(categoryName);
            CATEGORY_TAGS_CACHE.set(categoryName, defaultTags);
            return defaultTags;
        }
    }

    // Función de respaldo con etiquetas por defecto
    function getDefaultTagsForCategory(categoryName) {
        const defaultTags = {
            'Hmm...': [
                'sin gluten', 'vegetariano', 'vegano', 'sin lactosa',
                'picante', 'dulce', 'salado', 'amargo',
                'casero', 'gourmet', 'tradicional', 'fusion',
                'económico', 'premium', 'familiar', 'romántico',
                'rápido', 'lento', 'caliente', 'frío'
            ],
            'Restaurantes': [
                'italiano', 'japonés', 'mexicano', 'chino', 'indio',
                'mediterráneo', 'asiático', 'americano', 'francés',
                'terraza', 'interior', 'vista', 'música en vivo',
                'reserva necesaria', 'sin reserva', 'grupo grande'
            ],
            'Cafeterías': [
                'café especialidad', 'té premium', 'repostería casera',
                'wifi gratis', 'trabajo', 'estudio', 'reuniones',
                'desayuno', 'merienda', 'brunch', 'takeaway',
                'ambiente tranquilo', 'ambiente animado'
            ]
        };
        return defaultTags[categoryName] || [];
    }

    let mainSearchInput, executeSearchBtn, entityTypeButtons,
        openFiltersModalBtn, advancedFiltersModal, closeFiltersModalBtn,
        advancedFiltersContentEl, applyAdvancedFiltersBtn, searchResultsAreaEl;

    let searchTimeout;

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
        const type = selectedButton.dataset.type;
        
        // Toggle selección múltiple
        if (state.selectedEntityTypes.includes(type)) {
            // Deseleccionar
            state.selectedEntityTypes = state.selectedEntityTypes.filter(t => t !== type);
            selectedButton.classList.remove('active');
        } else {
            // Seleccionar
            state.selectedEntityTypes.push(type);
            selectedButton.classList.add('active');
        }
        
        console.log("Tipos de entidad seleccionados:", state.selectedEntityTypes);

        // Actualizar filtros avanzados de forma asíncrona
        populateAdvancedFiltersModal().catch(error => {
            console.error('Error actualizando filtros avanzados:', error);
        });

        // Realizar búsqueda automática si hay texto
        if (mainSearchInput && mainSearchInput.value.trim()) {
            debouncedSearch();
        }
    }

    async function populateAdvancedFiltersModal() {
        if (!advancedFiltersContentEl) return;

        advancedFiltersContentEl.innerHTML = '';

        // Cargar categorías dinámicamente desde Firestore
        let categories = [];
        try {
            const categoriesSnapshot = await ListopicApp.services.db.collection('categories').get();
            categories = categoriesSnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || doc.id
            }));
        } catch (error) {
            console.error('Error cargando categorías:', error);
            // Fallback a categorías hardcodeadas
            categories = [
                { id: 'comida_hmm', name: 'Hmm...' },
                { id: 'restaurantes', name: 'Restaurantes' },
                { id: 'cafeterias', name: 'Cafeterías' }
            ];
        }

        state.selectedEntityTypes.forEach(type => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'filter-section';
            let sectionHTML = '';

            switch (type) {
                case 'lists':
                    const listCategoryOptions = categories.map(cat =>
                        `<option value="${cat.name}">${cat.name}</option>`
                    ).join('');

                    sectionHTML = `
                        <h3 class="filter-category-title">
                            <i class="fas fa-list-alt"></i> Filtros para Listas
                        </h3>
                        <div class="form-group">
                            <label for="filter-list-category">Categoría:</label>
                            <select id="filter-list-category" class="form-input">
                                <option value="">Cualquiera</option>
                                ${listCategoryOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="filter-min-list-reviews">Mínimo de reseñas:</label>
                            <input type="number" id="filter-min-list-reviews" class="form-input" min="0" placeholder="0">
                        </div>`;
                    break;

                case 'items':
                    const itemCategoryOptions = categories.map(cat =>
                        `<option value="${cat.name}">${cat.name}</option>`
                    ).join('');

                    sectionHTML = `
                        <h3 class="filter-category-title">
                            <i class="fas fa-star"></i> Filtros para Elementos
                        </h3>
                        <div class="form-group">
                            <label for="filter-item-category">Categoría de la lista:</label>
                            <select id="filter-item-category" class="form-input" onchange="updateItemTagsForCategory(this.value)">
                                <option value="">Cualquiera</option>
                                ${itemCategoryOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Etiquetas:</label>
                            <div id="item-tags-container" class="category-tags-container">
                                <p class="text-secondary">Selecciona una categoría para ver las etiquetas disponibles</p>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="filter-min-rating">Puntuación mínima:</label>
                            <select id="filter-min-rating" class="form-input">
                                <option value="">Cualquiera</option>
                                <option value="1">1+ estrellas</option>
                                <option value="2">2+ estrellas</option>
                                <option value="3">3+ estrellas</option>
                                <option value="4">4+ estrellas</option>
                                <option value="5">5 estrellas</option>
                            </select>
                        </div>`;
                    break;

                case 'places':
                    sectionHTML = `
                        <h3 class="filter-category-title">
                            <i class="fas fa-map-marker-alt"></i> Filtros para Lugares
                        </h3>
                        <div class="form-group">
                            <label for="filter-location">Ubicación (Ciudad, Región):</label>
                            <input type="text" id="filter-location" class="form-input" placeholder="Ej: Madrid">
                        </div>
                        <div class="form-group">
                            <label for="filter-place-type">Tipo de lugar:</label>
                            <select id="filter-place-type" class="form-input">
                                <option value="">Cualquiera</option>
                                <option value="restaurant">Restaurante</option>
                                <option value="cafe">Café</option>
                                <option value="bar">Bar</option>
                                <option value="bakery">Panadería</option>
                                <option value="food">Comida</option>
                                <option value="meal_takeaway">Para llevar</option>
                                <option value="meal_delivery">Delivery</option>
                            </select>
                        </div>`;
                    break;

                case 'users':
                    sectionHTML = `
                        <h3 class="filter-category-title">
                            <i class="fas fa-user"></i> Filtros para Usuarios
                        </h3>
                        <div class="form-group">
                            <label for="filter-min-user-reviews">Mínimo de reseñas:</label>
                            <input type="number" id="filter-min-user-reviews" class="form-input" min="0" placeholder="0">
                        </div>
                        <div class="form-group">
                            <label for="filter-min-user-lists">Mínimo de listas:</label>
                            <input type="number" id="filter-min-user-lists" class="form-input" min="0" placeholder="0">
                        </div>`;
                    break;
            }

            sectionEl.innerHTML = sectionHTML;
            advancedFiltersContentEl.appendChild(sectionEl);
        });
    }

    // Función global para actualizar etiquetas de items según categoría
    window.updateItemTagsForCategory = async function(category) {
        const container = document.getElementById('item-tags-container');
        if (!container) return;

        try {
            // Obtener etiquetas dinámicamente
            const tags = await getCategoryTags(category);

            container.innerHTML = '';

            if (tags.length === 0) {
                container.innerHTML = '<p class="text-secondary">No hay etiquetas disponibles para esta categoría</p>';
                return;
            }

            tags.forEach(tag => {
                const tagButton = document.createElement('button');
                tagButton.type = 'button';
                tagButton.className = 'category-tag-button';
                tagButton.textContent = tag;
                tagButton.dataset.tag = tag;

                tagButton.addEventListener('click', function() {
                    this.classList.toggle('active');
                });

                container.appendChild(tagButton);
            });
        } catch (error) {
            console.error('Error al cargar etiquetas:', error);
            container.innerHTML = '<p class="text-secondary text-error">Error al cargar etiquetas. Inténtalo de nuevo.</p>';
        }
    };
    
    function openModal() {
        if (advancedFiltersModal) advancedFiltersModal.style.display = 'flex';
        populateAdvancedFiltersModal();
    }

    function closeModal() {
        if (advancedFiltersModal) advancedFiltersModal.style.display = 'none';
    }

    function applyFiltersFromModal() {
        state.advancedFilters = {};
        
        // Aplicar filtros según los tipos seleccionados
        state.selectedEntityTypes.forEach(type => {
            switch (type) {
                case 'lists':
                    const listCatSelect = document.getElementById('filter-list-category');
                    const minListReviewsInput = document.getElementById('filter-min-list-reviews');
                    
                    if (listCatSelect && listCatSelect.value) {
                        state.advancedFilters.listCategory = listCatSelect.value;
                    }
                    if (minListReviewsInput && minListReviewsInput.value) {
                        state.advancedFilters.minListReviews = parseInt(minListReviewsInput.value);
                    }
                    break;

                case 'items':
                    const itemCatSelect = document.getElementById('filter-item-category');
                    const minRatingSelect = document.getElementById('filter-min-rating');
                    const selectedTags = document.querySelectorAll('#item-tags-container .category-tag-button.active');
                    
                    if (itemCatSelect && itemCatSelect.value) {
                        state.advancedFilters.itemCategory = itemCatSelect.value;
                    }
                    if (minRatingSelect && minRatingSelect.value) {
                        state.advancedFilters.minRating = parseInt(minRatingSelect.value);
                    }
                    if (selectedTags.length > 0) {
                        state.advancedFilters.selectedTags = Array.from(selectedTags).map(btn => btn.dataset.tag);
                    }
                    break;

                case 'places':
                    const locInput = document.getElementById('filter-location');
                    const placeTypeSelect = document.getElementById('filter-place-type');
                    
                    if (locInput && locInput.value.trim()) {
                        state.advancedFilters.location = locInput.value.trim();
                    }
                    if (placeTypeSelect && placeTypeSelect.value) {
                        state.advancedFilters.placeType = placeTypeSelect.value;
                    }
                    break;

                case 'users':
                    const badgeSelect = document.getElementById('filter-badge');
                    const minUserReviewsInput = document.getElementById('filter-min-user-reviews');
                    
                    if (badgeSelect && badgeSelect.value) {
                        state.advancedFilters.badge = badgeSelect.value;
                    }
                    if (minUserReviewsInput && minUserReviewsInput.value) {
                        state.advancedFilters.minUserReviews = parseInt(minUserReviewsInput.value);
                    }
                    break;
            }
        });
        
        console.log("Filtros avanzados aplicados:", state.advancedFilters);
        closeModal();
        performSearch();
    }

    function debouncedSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performSearch, 300);
    }

    async function performSearch() {
        if (!searchResultsAreaEl || !ListopicApp.services.db || state.isSearching) return;
        
        state.isSearching = true;
        state.currentSearchQuery = mainSearchInput ? mainSearchInput.value.trim() : '';
        
        // Si no hay tipos seleccionados, buscar en todos
        const searchTypes = state.selectedEntityTypes.length > 0 ? 
            state.selectedEntityTypes : 
            ['lists', 'items', 'places', 'users'];
        
        const cacheKey = `${state.currentSearchQuery}-${searchTypes.join(',')}-${JSON.stringify(state.advancedFilters)}`;
        if (state.searchCache.has(cacheKey)) {
            const cachedResults = state.searchCache.get(cacheKey);
            renderResults(cachedResults.results, cachedResults.description);
            state.isSearching = false;
            return;
        }

        searchResultsAreaEl.innerHTML = '<p class="search-placeholder">Buscando...</p>';
        
        if (executeSearchBtn) executeSearchBtn.disabled = true;
        
        console.log("Realizando búsqueda con:", { query: state.currentSearchQuery, types: searchTypes, filters: state.advancedFilters });

        const db = ListopicApp.services.db;
        let results = [];
        let queryDescription = state.currentSearchQuery ? 
            `Resultados para "${state.currentSearchQuery}"` : 
            'Explorando contenido';

        try {
            const searchPromises = [];

            if (searchTypes.includes('lists')) {
                searchPromises.push(searchLists(db, state.currentSearchQuery, state.advancedFilters));
            }

            if (searchTypes.includes('users')) {
                searchPromises.push(searchUsers(db, state.currentSearchQuery, state.advancedFilters));
            }

            if (searchTypes.includes('places')) {
                searchPromises.push(searchPlaces(db, state.currentSearchQuery, state.advancedFilters));
            }

            if (searchTypes.includes('items')) {
                searchPromises.push(searchItems(db, state.currentSearchQuery, state.advancedFilters));
            }

            const searchResults = await Promise.all(searchPromises);
            results = searchResults.flat();

            results = sortResultsByRelevance(results, state.currentSearchQuery);

            state.searchCache.set(cacheKey, { results, description: queryDescription });
            
            if (state.searchCache.size > 50) {
                const firstKey = state.searchCache.keys().next().value;
                state.searchCache.delete(firstKey);
            }

            renderResults(results, queryDescription);

            if (state.currentSearchQuery && !state.searchHistory.includes(state.currentSearchQuery)) {
                state.searchHistory.unshift(state.currentSearchQuery);
                if (state.searchHistory.length > 10) {
                    state.searchHistory.pop();
                }
            }

        } catch (error) {
            console.error("Error durante la búsqueda:", error);
            searchResultsAreaEl.innerHTML = `<p class="search-placeholder error-placeholder">Error al realizar la búsqueda: ${error.message}</p>`;
        } finally {
            state.isSearching = false;
            if (executeSearchBtn) executeSearchBtn.disabled = false;
        }
    }

    // Actualizar función searchItems para usar filtros de etiquetas
    async function searchItems(db, query, filters) {
        console.log('Buscando items con query:', query, 'filters:', filters);
        
        try {
            let listsQuery = db.collection('lists').where('isPublic', '==', true);
            
            // Filtrar por categoría de lista si se especifica
            if (filters.itemCategory) {
                listsQuery = listsQuery.where('categoryId', '==', filters.itemCategory);
            }
            
            const listsSnapshot = await listsQuery.limit(20).get();
            const results = [];
            
            for (const listDoc of listsSnapshot.docs) {
                const listData = listDoc.data();
                let reviewsQuery = listDoc.ref.collection('reviews');
                
                if (filters.minRating) {
                    reviewsQuery = reviewsQuery.where('overallRating', '>=', filters.minRating);
                }
                
                const reviewsSnapshot = await reviewsQuery.limit(10).get();
                
                reviewsSnapshot.forEach(doc => {
                    const data = doc.data();
                    
                    // Filtrar por texto
                    if (query && !isTextMatch(data.itemName, query)) {
                        return;
                    }
                    
                    // Filtrar por etiquetas seleccionadas
                    if (filters.selectedTags && filters.selectedTags.length > 0) {
                        const itemTags = data.userTags || [];
                        const hasMatchingTag = filters.selectedTags.some(tag => 
                            itemTags.some(itemTag => 
                                itemTag.toLowerCase().includes(tag.toLowerCase())
                            )
                        );
                        if (!hasMatchingTag) return;
                    }
                    
                    results.push({
                        id: doc.id, 
                        type: 'item', 
                        listId: listDoc.id,
                        listName: listData.name,
                        ...data
                    });
                });
            }
            
            console.log(`Encontrados ${results.length} items`);
            return results.slice(0, 20);
            
        } catch (error) {
            console.error('Error buscando items:', error);
            return [];
        }
    }

    // Actualizar función searchLists para usar filtros
    async function searchLists(db, query, filters) {
        console.log('Buscando listas con query:', query, 'filters:', filters);
        
        try {
            let listQuery = db.collection('lists').where('isPublic', '==', true);
            
            if (filters.listCategory) {
                listQuery = listQuery.where('categoryId', '==', filters.listCategory);
            }
            
            if (filters.minListReviews) {
                listQuery = listQuery.where('reviewCount', '>=', filters.minListReviews);
            }
            
            const snapshot = await listQuery.limit(50).get();
            const results = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                
                if (!query || isTextMatch(data.name, query)) {
                    results.push({id: doc.id, type: 'list', ...data});
                }
            });
            
            console.log(`Encontradas ${results.length} listas`);
            return results.slice(0, 20);
            
        } catch (error) {
            console.error('Error buscando listas:', error);
            return [];
        }
    }

    // Resto de funciones permanecen igual...
    function sortResultsByRelevance(results, query) {
        if (!query) return results;

        return results.sort((a, b) => {
            const aScore = calculateRelevanceScore(a, query);
            const bScore = calculateRelevanceScore(b, query);
            return bScore - aScore;
        });
    }

    function calculateRelevanceScore(item, query) {
        let score = 0;
        const queryLower = query.toLowerCase();
        
        const name = (item.name || item.displayName || item.itemName || '').toLowerCase();
        if (name === queryLower) score += 100;
        else if (name.startsWith(queryLower)) score += 50;
        else if (name.includes(queryLower)) score += 25;

        switch (item.type) {
            case 'list':
                score += (item.reviewCount || 0) * 2;
                break;
            case 'user':
                score += (item.followersCount || 0);
                break;
            case 'place':
                score += (item.reviewsCount || 0);
                break;
            case 'item':
                score += (item.overallRating || 0) * 10;
                break;
        }

        return score;
    }

    async function searchUsers(db, query, filters) {
        console.log('Buscando usuarios con query:', query, 'filters:', filters);
        
        try {
            let userQuery = db.collection('users');
            
            if (filters.badge) {
                userQuery = userQuery.where('badges', 'array-contains', filters.badge);
            }
            
            if (filters.minUserReviews) {
                userQuery = userQuery.where('reviewsCount', '>=', filters.minUserReviews);
            }
            
            const snapshot = await userQuery.limit(50).get();
            const results = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                
                if (!query || isTextMatch(data.displayName || data.username, query)) {
                    results.push({id: doc.id, type: 'user', ...data});
                }
            });
            
            console.log(`Encontrados ${results.length} usuarios`);
            return results.slice(0, 20);
            
        } catch (error) {
            console.error('Error buscando usuarios:', error);
            return [];
        }
    }

    async function searchPlaces(db, query, filters) {
        console.log('Buscando lugares con query:', query, 'filters:', filters);
        
        try {
            let placeQuery = db.collection('places');
            
            if (filters.location) {
                placeQuery = placeQuery.where('city', '==', filters.location);
            }
            
            if (filters.placeType) {
                placeQuery = placeQuery.where('types', 'array-contains', filters.placeType);
            }
            
            const snapshot = await placeQuery.limit(50).get();
            const results = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                
                if (!query || isTextMatch(data.name, query)) {
                    results.push({id: doc.id, type: 'place', ...data});
                }
            });
            
            console.log(`Encontrados ${results.length} lugares`);
            return results.slice(0, 20);
            
        } catch (error) {
            console.error('Error buscando lugares:', error);
            return [];
        }
    }

    function isTextMatch(text, query) {
        if (!text || !query) return true;
        
        const textLower = text.toLowerCase();
        const queryLower = query.toLowerCase();
        
        if (textLower.includes(queryLower)) return true;
        
        const queryWords = queryLower.split(' ').filter(word => word.length > 0);
        const textWords = textLower.split(' ');
        
        return queryWords.every(queryWord => 
            textWords.some(textWord => 
                textWord.includes(queryWord) || queryWord.includes(textWord)
            )
        );
    }

    // Funciones de renderizado permanecen igual que en la versión anterior...
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

        const groupedResults = groupResultsByType(results);
        
        Object.entries(groupedResults).forEach(([type, items]) => {
            if (items.length === 0) return;
            
            const sectionTitle = document.createElement('h3');
            sectionTitle.className = 'search-section-title';
            sectionTitle.textContent = getTypeName(type);
            searchResultsAreaEl.appendChild(sectionTitle);
            
            items.forEach(item => {
                const cardHtml = createResultCard(item);
                searchResultsAreaEl.insertAdjacentHTML('beforeend', cardHtml);
            });
        });
    }

    function groupResultsByType(results) {
        return results.reduce((groups, item) => {
            const type = item.type || 'unknown';
            if (!groups[type]) groups[type] = [];
            groups[type].push(item);
            return groups;
        }, {});
    }

    function getTypeName(type) {
        const typeNames = {
            'list': 'Listas',
            'user': 'Usuarios',
            'place': 'Lugares',
            'item': 'Elementos',
            'unknown': 'Otros'
        };
        return typeNames[type] || 'Otros';
    }

    // Usar la función createResultCard mejorada de la versión anterior...
    function createResultCard(item) {
        const uiUtils = ListopicApp.uiUtils;
        
        switch (item.type) {
            case 'list':
                return `
                    <a href="list-view.html?listId=${item.id}" class="search-card">
                        <div class="search-card__icon-container">
                            <i class="fas fa-list-alt search-card__icon"></i>
                        </div>
                        <div class="search-card__content">
                            <h4 class="search-card__title">${uiUtils.escapeHtml(item.name)}</h4>
                            <p class="search-card__description">
                                ${item.description ? uiUtils.escapeHtml(item.description.substring(0, 100)) + '...' : 'Lista de valoraciones'}
                            </p>
                            <div class="search-card__tags">
                                <span class="info-tag info-tag--list">
                                    <i class="fas fa-stream"></i> Lista
                                </span>
                                <span class="info-tag info-tag--category">
                                    <i class="fas fa-folder"></i> ${uiUtils.escapeHtml(item.categoryId || 'General')}
                                </span>
                                <span class="info-tag info-tag--count">
                                    <i class="fas fa-star"></i> ${item.reviewCount || 0} reseñas
                                </span>
                                ${item.isPublic ? 
                                    '<span class="info-tag info-tag--public"><i class="fas fa-globe"></i> Pública</span>' : 
                                    '<span class="info-tag info-tag--private"><i class="fas fa-lock"></i> Privada</span>'
                                }
                            </div>
                            <div class="search-card__meta">
                                <span class="search-card__date">
                                    <i class="fas fa-calendar-alt"></i> 
                                    ${item.createdAt ? formatDate(item.createdAt) : 'Fecha desconocida'}
                                </span>
                            </div>
                        </div>
                    </a>`;
            
            case 'user':
                return `
                    <a href="profile.html?viewUserId=${item.id}" class="search-card">
                        <div class="search-card__icon-container">
                            ${item.photoUrl ? 
                                `<img src="${uiUtils.escapeHtml(item.photoUrl)}" alt="Avatar" class="search-card__avatar">` : 
                                '<i class="fas fa-user-circle search-card__icon"></i>'
                            }
                        </div>
                        <div class="search-card__content">
                            <h4 class="search-card__title">${uiUtils.escapeHtml(item.displayName || item.username || 'Usuario')}</h4>
                            <p class="search-card__description">
                                ${item.bio ? uiUtils.escapeHtml(item.bio.substring(0, 100)) + '...' : 'Miembro de la comunidad Listopic'}
                            </p>
                            <div class="search-card__tags">
                                <span class="info-tag info-tag--user">
                                    <i class="fas fa-user"></i> Usuario
                                </span>
                                <span class="info-tag info-tag--followers">
                                    <i class="fas fa-users"></i> ${item.followersCount || 0} seguidores
                                </span>
                                <span class="info-tag info-tag--reviews">
                                    <i class="fas fa-star"></i> ${item.reviewsCount || 0} reseñas
                                </span>
                                <span class="info-tag info-tag--lists">
                                    <i class="fas fa-list"></i> ${(item.publicListsCount || 0) + (item.privateListsCount || 0)} listas
                                </span>
                            </div>
                            ${item.badges && item.badges.length > 0 ? `
                                <div class="search-card__badges">
                                    ${item.badges.slice(0, 3).map(badge => 
                                        `<span class="badge badge--${badge}">
                                            <i class="fas fa-award"></i> ${getBadgeName(badge)}
                                        </span>`
                                    ).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </a>`;
            
            case 'place':
                return `
                    <div class="search-card" onclick="showPlaceDetails('${item.id}')">
                        <div class="search-card__icon-container">
                            ${item.mainImageUrl ? 
                                `<img src="${uiUtils.escapeHtml(item.mainImageUrl)}" alt="Lugar" class="search-card__image">` : 
                                '<i class="fas fa-map-marker-alt search-card__icon"></i>'
                            }
                        </div>
                        <div class="search-card__content">
                            <h4 class="search-card__title">${uiUtils.escapeHtml(item.name)}</h4>
                            <p class="search-card__description">
                                ${item.address ? uiUtils.escapeHtml(item.address) : 'Ubicación en el mapa'}
                            </p>
                            <div class="search-card__tags">
                                <span class="info-tag info-tag--place">
                                    <i class="fas fa-map-marker-alt"></i> Lugar
                                </span>
                                ${item.city ? `
                                    <span class="info-tag info-tag--location">
                                        <i class="fas fa-city"></i> ${uiUtils.escapeHtml(item.city)}
                                    </span>
                                ` : ''}
                                ${item.region ? `
                                    <span class="info-tag info-tag--region">
                                        <i class="fas fa-map"></i> ${uiUtils.escapeHtml(item.region)}
                                    </span>
                                ` : ''}
                                <span class="info-tag info-tag--reviews">
                                    <i class="fas fa-star"></i> ${item.reviewsCount || 0} reseñas
                                </span>
                            </div>
                            ${item.types && item.types.length > 0 ? `
                                <div class="search-card__place-types">
                                    ${item.types.slice(0, 3).map(type => 
                                        `<span class="place-type-tag">
                                            <i class="fas fa-tag"></i> ${getPlaceTypeName(type)}
                                        </span>`
                                    ).join('')}
                                </div>
                            ` : ''}
                            ${item.rating ? `
                                <div class="search-card__rating">
                                    <span class="rating-stars">
                                        ${generateStars(item.rating)}
                                    </span>
                                    <span class="rating-text">${item.rating}/5</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>`;

            case 'item':
                return `
                    <div class="search-card search-card--item" onclick="showItemDetails('${item.id}', '${item.listId}')">
                        <div class="search-card__icon-container">
                            ${item.photoUrl ?
                                `<img src="${uiUtils.escapeHtml(item.photoUrl)}" alt="Item" class="search-card__image">` :
                                '<i class="fas fa-utensils search-card__icon"></i>'
                            }
                        </div>
                        <div class="search-card__content">
                            <div class="search-card__header">
                                <h4 class="search-card__title">${uiUtils.escapeHtml(item.itemName || 'Elemento')}</h4>
                                ${item.placeName ? `
                                    <p class="search-card__restaurant">
                                        <i class="fas fa-map-marker-alt"></i> ${uiUtils.escapeHtml(item.placeName)}
                                    </p>
                                ` : ''}
                            </div>

                            <div class="search-card__summary">
                                <div class="overall-rating">
                                    <span class="rating-value">${(item.overallRating || 0).toFixed(1)}</span>
                                    <div class="rating-stars">${generateStars(item.overallRating || 0)}</div>
                                </div>
                                ${item.price ? `
                                    <span class="price-tag">
                                        <i class="fas fa-dollar-sign"></i> ${getPriceRange(item.price)}
                                    </span>
                                ` : ''}
                            </div>

                            ${item.criteriaRatings && Object.keys(item.criteriaRatings).length > 0 ? `
                                <div class="search-card__rating-breakdown">
                                    ${Object.entries(item.criteriaRatings).slice(0, 3).map(([criteria, rating]) =>
                                        `<div class="criteria-rating">
                                            <span class="criteria-label">${uiUtils.escapeHtml(criteria)}</span>
                                            <div class="criteria-progress">
                                                <div class="criteria-fill" style="width: ${(rating / 10) * 100}%"></div>
                                            </div>
                                            <span class="criteria-value">${rating.toFixed(1)}</span>
                                        </div>`
                                    ).join('')}
                                </div>
                            ` : ''}

                            ${item.userTags && item.userTags.length > 0 ? `
                                <div class="search-card__tags">
                                    ${item.userTags.slice(0, 3).map(tag =>
                                        `<span class="tag-pill">${uiUtils.escapeHtml(tag)}</span>`
                                    ).join('')}
                                </div>
                            ` : ''}

                            <div class="search-card__meta">
                                <span class="meta-item">
                                    <i class="fas fa-list"></i> ${uiUtils.escapeHtml(item.listName || 'Lista')}
                                </span>
                                ${item.notes ? `
                                    <span class="meta-item notes-preview">
                                        <i class="fas fa-comment"></i> ${uiUtils.escapeHtml(item.notes.substring(0, 50))}${item.notes.length > 50 ? '...' : ''}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>`;

            default:
                return `
                    <div class="search-card">
                        <div class="search-card__icon-container">
                            <i class="fas fa-question-circle search-card__icon"></i>
                        </div>
                        <div class="search-card__content">
                            <h4 class="search-card__title">Resultado desconocido</h4>
                            <p class="search-card__description">${uiUtils.escapeHtml(item.name || 'Sin nombre')}</p>
                            <div class="search-card__tags">
                                <span class="info-tag info-tag--unknown">
                                    <i class="fas fa-question"></i> Desconocido
                                </span>
                            </div>
                        </div>
                    </div>`;
        }
    }

    // Funciones auxiliares
    function formatDate(timestamp) {
        if (!timestamp) return 'Fecha desconocida';
        
        let date;
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            date = new Date(timestamp);
        }
        
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function getBadgeName(badgeId) {
        const badgeNames = {
            'experto_cafes': 'Experto en Cafés',
            'foodie_pro': 'Foodie Pro',
            'critico_gourmet': 'Crítico Gourmet',
            'explorador_urbano': 'Explorador Urbano'
        };
        return badgeNames[badgeId] || badgeId;
    }

    function getPlaceTypeName(type) {
        const typeNames = {
            'restaurant': 'Restaurante',
            'cafe': 'Café',
            'bar': 'Bar',
            'bakery': 'Panadería',
            'meal_takeaway': 'Comida para llevar',
            'food': 'Comida',
            'point_of_interest': 'Punto de interés'
        };
        return typeNames[type] || type;
    }

    function getPriceRange(price) {
        if (price <= 1) return '€';
        if (price <= 2) return '€€';
        if (price <= 3) return '€€€';
        return '€€€€';
    }

    function generateStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        let stars = '';
        
        for (let i = 0; i < fullStars; i++) {
            stars += '<i class="fas fa-star star-filled"></i>';
        }
        
        if (hasHalfStar) {
            stars += '<i class="fas fa-star-half-alt star-half"></i>';
        }
        
        for (let i = 0; i < emptyStars; i++) {
            stars += '<i class="far fa-star star-empty"></i>';
        }
        
        return stars;
    }

    window.showPlaceDetails = function(placeId) {
        console.log('Mostrar detalles del lugar:', placeId);
    };

    window.showItemDetails = function(itemId, listId) {
        window.location.href = `detail-view.html?listId=${listId}&reviewId=${itemId}`;
    };

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
            
            mainSearchInput.addEventListener('input', debouncedSearch);
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

        // Inicializar filtros avanzados de forma asíncrona
        populateAdvancedFiltersModal().catch(error => {
            console.error('Error inicializando filtros avanzados:', error);
        });

        performSearch();
    }

    // Función para limpiar el cache de etiquetas (útil para desarrollo)
    function clearTagsCache() {
        CATEGORY_TAGS_CACHE.clear();
        console.log('Cache de etiquetas de categorías limpiado');
    }

    return {
        init,
        clearTagsCache
    };
})();