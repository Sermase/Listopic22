window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageSearch = (() => {
    const state = {
        currentSearchQuery: '',
        currentEntityType: 'all', // 'all', 'items', 'lists', 'places', 'users'
        advancedFilters: {} // { location: '', badge: '', category: '', tag: '' }
    };

    // Elementos del DOM (se cachean en init)
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
        entityTypeButtons.forEach(btn => btn.classList.remove('active')); // o 'selected'
        selectedButton.classList.add('active');
        state.currentEntityType = selectedButton.dataset.type;
        console.log("Tipo de entidad seleccionado:", state.currentEntityType);
        // Al cambiar el tipo, actualizar el contenido del modal de filtros avanzados
        populateAdvancedFiltersModal();
        // Opcional: ejecutar búsqueda inmediatamente o esperar al botón/enter
        // performSearch(); 
    }

    function populateAdvancedFiltersModal() {
        if (!advancedFiltersContentEl) return;
        advancedFiltersContentEl.innerHTML = ''; // Limpiar filtros anteriores

        // Lógica para añadir campos de filtro según state.currentEntityType
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
            case 'items': // Reseñas/Elementos
                advancedFiltersContentEl.innerHTML = `
                    <div class="form-group">
                        <label for="filter-item-tag">Etiqueta del Elemento:</label>
                        <input type="text" id="filter-item-tag" class="form-input" placeholder="Ej: sin gluten, vegetariano">
                    </div>`;
                break;
            default: // 'all' o desconocido
                advancedFiltersContentEl.innerHTML = '<p>No hay filtros avanzados para esta selección.</p>';
                break;
        }
    }
    
    function openModal() {
        if (advancedFiltersModal) advancedFiltersModal.style.display = 'flex';
        populateAdvancedFiltersModal(); // Poblar con los filtros correctos al abrir
    }
    function closeModal() {
        if (advancedFiltersModal) advancedFiltersModal.style.display = 'none';
    }

    function applyFiltersFromModal() {
        state.advancedFilters = {}; // Reset
        switch (state.currentEntityType) {
            case 'places':
                const locInput = document.getElementById('filter-location');
                if (locInput && locInput.value.trim()) state.advancedFilters.location = locInput.value.trim();
                break;
            case 'users':
                const badgeSelect = document.getElementById('filter-badge');
                if (badgeSelect && badgeSelect.value) state.advancedFilters.badge = badgeSelect.value;
                break;
            case 'lists':
                const catSelect = document.getElementById('filter-category');
                if (catSelect && catSelect.value) state.advancedFilters.category = catSelect.value;
                break;
            case 'items':
                const itemTagInput = document.getElementById('filter-item-tag');
                if (itemTagInput && itemTagInput.value.trim()) state.advancedFilters.tag = itemTagInput.value.trim();
                break;
        }
        console.log("Filtros avanzados aplicados:", state.advancedFilters);
        closeModal();
        performSearch(); // Realizar búsqueda con los nuevos filtros
    }

    async function performSearch() {
        if (!searchResultsAreaEl || !ListopicApp.services.db) return;
        
        state.currentSearchQuery = mainSearchInput ? mainSearchInput.value.trim().toLowerCase() : '';
        searchResultsAreaEl.innerHTML = '<p class="search-placeholder">Buscando...</p>';
        console.log("Realizando búsqueda con:", state);

        const db = ListopicApp.services.db;
        let results = [];
        let queryDescription = `Resultados para "${state.currentSearchQuery}"`;

        // Aquí vendría la lógica de consulta a Firestore
        // Esta parte es compleja y necesitará índices adecuados en Firestore.
        // Ejemplo MUY simplificado:
        try {
            if (state.currentEntityType === 'lists' || state.currentEntityType === 'all') {
                queryDescription += " en Listas";
                let query = db.collection('lists').where('isPublic', '==', true);
                if (state.currentSearchQuery) {
                    // Firestore no soporta búsqueda de subcadenas nativa.
                    // Necesitarías un where >= y where <= para simular startsWith,
                    // o usar Algolia/Typesense para búsqueda de texto completo.
                    // Por ahora, un filtro simple si el nombre es exacto o empieza por:
                    query = query.orderBy('name').startAt(state.currentSearchQuery).endAt(state.currentSearchQuery + '\uf8ff');
                }
                if (state.advancedFilters.category) {
                    query = query.where('categoryId', '==', state.advancedFilters.category);
                    queryDescription += ` (categoría: ${state.advancedFilters.category})`;
                }
                const snapshot = await query.limit(10).get();
                snapshot.forEach(doc => results.push({id: doc.id, type: 'list', ...doc.data()}));
            }
            // ... Añadir lógica similar para 'items', 'places', 'users' ...
            // Para 'items' (reseñas), probablemente usarías collectionGroup('reviews')
            // y tendrías que filtrar por listas públicas.

            renderResults(results, queryDescription);

        } catch (error) {
            console.error("Error durante la búsqueda:", error);
            searchResultsAreaEl.innerHTML = `<p class="search-placeholder error-placeholder">Error al realizar la búsqueda: ${error.message}</p>`;
        }
    }
    
    function renderResults(results, description) {
        if (!searchResultsAreaEl) return;
        searchResultsAreaEl.innerHTML = '';

        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'search-results-description';
        descriptionEl.textContent = description || `Mostrando ${results.length} resultados.`;
        searchResultsAreaEl.appendChild(descriptionEl);

        if (results.length === 0) {
            searchResultsAreaEl.innerHTML += '<p class="search-placeholder">No se encontraron resultados.</p>';
            return;
        }

        results.forEach(item => {
            const card = document.createElement('div');
            card.className = 'search-result-card'; // Necesitarás estilos para esto
            // Adaptar el contenido de la tarjeta según el item.type
            if (item.type === 'list') {
                card.innerHTML = `
                    <h4><a href="list-view.html?listId=${item.id}">${ListopicApp.uiUtils.escapeHtml(item.name)}</a></h4>
                    <p>Categoría: ${ListopicApp.uiUtils.escapeHtml(item.categoryId || 'N/A')}</p>
                    <p>${item.reviewCount || 0} reseñas</p>
                `;
            } 
            // ... Añadir renderizado para otros tipos (items, places, users) ...
            else {
                card.innerHTML = `<h4>${ListopicApp.uiUtils.escapeHtml(item.name || 'Elemento sin nombre')} (${item.type})</h4>`;
            }
            searchResultsAreaEl.appendChild(card);
        });
    }


    function init() {
        console.log('Initializing Search page logic...');
        cacheDOMElements();

        // Actualizar header dinámico para la página de búsqueda
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
        if (advancedFiltersModal) { // Cerrar modal si se hace clic fuera del contenido
            advancedFiltersModal.addEventListener('click', (event) => {
                if (event.target === advancedFiltersModal) closeModal();
            });
        }
        if (applyAdvancedFiltersBtn) applyAdvancedFiltersBtn.addEventListener('click', applyFiltersFromModal);

        populateAdvancedFiltersModal(); // Poblar al inicio con "Todo" seleccionado
    }

    // En page-search.js

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
            
            // Usamos un switch para construir la tarjeta según el tipo de resultado
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
                        </a>
                    `;
                    break;
                
                case 'user': // Suponiendo que los resultados de usuario tengan esta estructura
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
                        </a>
                    `;
                    break;
                
                // Aquí puedes añadir casos para 'place' e 'item' cuando implementes su búsqueda
                case 'place':
                     // ... estructura para un lugar ...
                     break;

                case 'item': // Un "item" es una reseña
                     // ... estructura para una reseña ...
                     break;

                default:
                    // Fallback por si llega un tipo desconocido
                    cardHtml = `<div class="search-card"><p>Resultado desconocido: ${uiUtils.escapeHtml(item.name || 'Sin nombre')}</p></div>`;
            }
            
            // Usamos insertAdjacentHTML que es eficiente para añadir bloques de HTML
            searchResultsAreaEl.insertAdjacentHTML('beforeend', cardHtml);
        });
    }

    return {
        init
    };
})();
