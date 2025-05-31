window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListView = (() => {
    // Dependencies:
    // ListopicApp.config.API_BASE_URL
    // ListopicApp.services.auth
    // ListopicApp.state (for currentListId, allGroupedItems, currentListAvailableTags)
    // ListopicApp.uiUtils (potentially, if any common UI functions are used)

    function init() {
        console.log('Initializing List View page logic with actual code...');
        
        const API_BASE_URL = ListopicApp.config.API_BASE_URL;
        const auth = ListopicApp.services.auth;
        const state = ListopicApp.state;

        // --- Start of code moved from app.js's list-view.html block ---
        const listTitleElement = document.getElementById('list-title');
        const rankingTbody = document.getElementById('ranking-tbody');
        const searchInput = document.querySelector('.search-input');
        const tagFilterContainer = document.querySelector('.tag-filter-container');
        const rankingTable = document.querySelector('.ranking-table');

        let currentListIconClass = 'fa-solid fa-list'; // This can remain local to this module's scope
        // 'allGroupedItems' and 'currentListAvailableTags' will be managed via ListopicApp.state if they need to persist
        // or be accessed by other modules. For now, assume they are fetched and used within this scope.
        // Let's define them here if they are primarily managed by this page's logic.
        state.allGroupedItems = state.allGroupedItems || [];
        state.currentListAvailableTags = state.currentListAvailableTags || [];


        if (listTitleElement && rankingTbody && searchInput && tagFilterContainer && rankingTable) {
            let currentSortColumn = 'avgGeneralScore'; // local state for sorting
            let currentSortDirection = 'desc'; // local state for sorting
            let activeTagFilters = new Set(); // local state for filtering

            const urlParamsList = new URLSearchParams(window.location.search);
            const currentListIdFromURL = urlParamsList.get('listId');
            state.currentListId = currentListIdFromURL; // Update shared state

            function getListIconClass_ListView(listName) {
                if (!listName) return 'fa-solid fa-list';
                const listNameLower = listName.toLowerCase();
                if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) return 'fa-solid fa-birthday-cake';
                if (listNameLower.includes('pizza')) return 'fa-solid fa-pizza-slice';
                if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) return 'fa-solid fa-hamburger';
                if (listNameLower.includes('taco') || listNameLower.includes('mexican') || listNameLower.includes('nacho')) return 'fa-solid fa-pepper-hot';
                if (listNameLower.includes('café') || listNameLower.includes('coffee')) return 'fa-solid fa-coffee';
                if (listNameLower.includes('sushi') || listNameLower.includes('japo')) return 'fa-solid fa-fish';
                if (listNameLower.includes('helado') || listNameLower.includes('ice cream')) return 'fa-solid fa-ice-cream';
                return 'fa-solid fa-list';
            }

            if (state.currentListId) {
                const addBtnList = document.querySelector('.add-review-button');
                if (addBtnList) addBtnList.href = `review-form.html?listId=${state.currentListId}`;

                const editListLink = document.getElementById('edit-list-link');
                if (editListLink) {
                    editListLink.href = `list-form.html?editListId=${state.currentListId}`;
                }

                console.log('Fetching from URL:', `${API_BASE_URL}/lists/${state.currentListId}/grouped-reviews`);
                
                // Wait for the auth service to be available
                const checkAuthService = () => {
                    return new Promise((resolve, reject) => {
                        const check = () => {
                            if (ListopicApp.authService && 
                                typeof ListopicApp.authService.onAuthStateChangedPromise === 'function') {
                                resolve();
                            } else if (Date.now() - startTime > 5000) { // 5 second timeout
                                reject(new Error('Auth service not available after timeout'));
                            } else {
                                setTimeout(check, 100);
                            }
                        };
                        const startTime = Date.now();
                        check();
                    });
                };

                return checkAuthService()
                    .then(() => {
                        // Now that we're sure authService is available, get the current user
                        return ListopicApp.authService.onAuthStateChangedPromise();
                    })
                    .then(user => {
                        if (!user) {
                            throw new Error('No user is currently signed in');
                        }
                        return user.getIdToken();
                    })
                    .then(idToken => {
                        return fetch(`${API_BASE_URL}/lists/${state.currentListId}/grouped-reviews`, {
                            headers: {
                                'Authorization': `Bearer ${idToken}`
                            }
                        });
                    })
                    .then(async res => {
                        const responseText = await res.text();
                        console.log('Response status:', res.status, res.statusText);
                        console.log('Response headers:', [...res.headers.entries()]);
                        console.log('Response text:', responseText);
                        
                        if (!res.ok) {
                            throw new Error(`HTTP error! status: ${res.status} - ${responseText}`);
                        }
                        
                        try {
                            return JSON.parse(responseText);
                        } catch (e) {
                            console.error('Failed to parse JSON:', e);
                            throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
                        }
                    })
                    .then(groupedDataResponse => {
                        listTitleElement.textContent = groupedDataResponse.listName || "Ranking Agrupado";
                        state.currentListAvailableTags = groupedDataResponse.tags || []; // Update shared state
                        currentListIconClass = getListIconClass_ListView(groupedDataResponse.listName);

                        state.allGroupedItems = groupedDataResponse.groupedReviews || []; // Update shared state
                        if (!Array.isArray(state.allGroupedItems)) {
                            console.error("Formato de reseñas agrupadas inesperado:", state.allGroupedItems);
                            state.allGroupedItems = [];
                            rankingTbody.innerHTML = `<tr><td colspan="100%">Formato de datos agrupados inesperado.</td></tr>`;
                        } else {
                            renderTableHeaders_ListView_Grouped();
                            renderTagFilters_ListView();
                            applyFiltersAndSort_ListView_Grouped();
                        }
                    })
                    .catch(error => {
                        console.error("LIST-VIEW (Agrupada): Error en fetch:", error);
                        listTitleElement.textContent = "Error al cargar lista";
                        rankingTbody.innerHTML = `<tr><td colspan="100%" style="color:var(--danger-color);">${error.message}</td></tr>`;
                    });

            } else {
                listTitleElement.textContent = "Error: Lista no especificada";
                rankingTbody.innerHTML = `<tr><td colspan="100%">Selecciona una lista válida.</td></tr>`;
            }

            function renderTableHeaders_ListView_Grouped() {
                const tableHeadRow = rankingTable.querySelector('thead tr');
                if (!tableHeadRow) return;
                tableHeadRow.innerHTML = '';

                const headers = [
                    { text: 'Foto', class: 'col-image', sortable: false },
                    { text: 'Elemento (Restaurante/Plato)', class: 'sortable col-element', 'data-column': 'restaurant', sortable: true },
                    { text: 'Nº Reseñas', class: 'sortable score-col', 'data-column': 'itemCount', sortable: true },
                    { text: 'Media General', class: 'sortable score-col col-general', 'data-column': 'avgGeneralScore', sortable: true }
                ];

                headers.forEach(headerConfig => {
                    const th = document.createElement('th');
                    th.textContent = headerConfig.text || '';
                    th.className = headerConfig.class || '';
                    th.scope = 'col';
                    if (headerConfig.sortable) {
                        th.dataset.column = headerConfig['data-column'];
                        th.addEventListener('click', () => handleSort_ListView_Grouped(headerConfig['data-column']));
                    }
                    tableHeadRow.appendChild(th);
                });
                updateSortIndicators_ListView_Grouped();
            }

            function renderTagFilters_ListView() {
                if (!tagFilterContainer) return;
                tagFilterContainer.innerHTML = '';
                if (state.currentListAvailableTags.length > 0) { // Use shared state
                    state.currentListAvailableTags.forEach(tag => {
                        const button = document.createElement('button');
                        button.className = 'tag-filter-button';
                        button.textContent = ListopicApp.uiUtils.escapeHtml(tag);
                        button.dataset.tag = tag;
                        button.addEventListener('click', toggleTagFilter_ListView_Grouped);
                        tagFilterContainer.appendChild(button);
                    });
                } else {
                    tagFilterContainer.innerHTML = '<p>No hay etiquetas para filtrar en esta lista.</p>';
                }
            }

            function applyFiltersAndSort_ListView_Grouped() {
                let filteredItems = [...state.allGroupedItems]; // Use shared state
                const searchTerm = searchInput.value.toLowerCase();

                if (searchTerm) {
                    filteredItems = filteredItems.filter(group =>
                        (group.restaurant && group.restaurant.toLowerCase().includes(searchTerm)) ||
                        (group.dish && group.dish.toLowerCase().includes(searchTerm))
                    );
                }

                if (activeTagFilters.size > 0) {
                    filteredItems = filteredItems.filter(group => {
                        if (!group.groupTags || group.groupTags.length === 0) {
                            return false;
                        }
                        return [...activeTagFilters].every(filterTag => group.groupTags.includes(filterTag));
                    });
                }

                filteredItems.sort((a, b) => {
                    let valA, valB;
                    if (currentSortColumn === 'avgGeneralScore') { valA = a.avgGeneralScore; valB = b.avgGeneralScore; }
                    else if (currentSortColumn === 'restaurant') { valA = a.restaurant?.toLowerCase() || ''; valB = b.restaurant?.toLowerCase() || ''; }
                    else if (currentSortColumn === 'itemCount') { valA = a.itemCount; valB = b.itemCount; }
                    else { valA = a[currentSortColumn]; valB = b[currentSortColumn]; }

                    if (typeof valA === 'string' && typeof valB === 'string') {
                        return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    }
                    return currentSortDirection === 'asc' ? valA - valB : valB - valA;
                });
                renderTable_ListView_Grouped(filteredItems);
                updateSortIndicators_ListView_Grouped();
            }

            function renderTable_ListView_Grouped(groupedItemsToRender) {
                rankingTbody.innerHTML = '';
                const numCols = rankingTable.querySelector('thead tr')?.children.length || 4;
                if (groupedItemsToRender.length === 0) {
                    rankingTbody.innerHTML = `<tr><td colspan="${numCols}">No hay elementos que coincidan.</td></tr>`;
                    return;
                }
                groupedItemsToRender.forEach(group => {
                    const row = rankingTbody.insertRow();
                    row.className = 'ranking-row';
                    row.dataset.listId = group.listId;
                    row.dataset.restaurant = group.restaurant;
                    row.dataset.dish = group.dish || "";

                    const imageCell = row.insertCell();
                    imageCell.classList.add('col-image');
                    if (group.thumbnailUrl) {
                        imageCell.innerHTML = `<img src="${ListopicApp.uiUtils.escapeHtml(group.thumbnailUrl)}" alt="${ListopicApp.uiUtils.escapeHtml(group.dish || group.restaurant)}" class="ranking-item-image">`;
                    } else {
                        imageCell.innerHTML = `<div class="ranking-item-icon-placeholder"><i class="${currentListIconClass}"></i></div>`;
                    }

                    const elementCell = row.insertCell();
                    elementCell.classList.add('col-element');
                    const dishText = group.dish ? ` - ${ListopicApp.uiUtils.escapeHtml(group.dish)}` : '';
                    elementCell.innerHTML = `<span class="restaurant-name">${ListopicApp.uiUtils.escapeHtml(group.restaurant) || 'N/A'}</span><span class="dish-name-sub">${dishText}</span>`;

                    const itemCountCell = row.insertCell();
                    itemCountCell.classList.add('score-col');
                    itemCountCell.textContent = group.itemCount;

                    const avgGeneralScoreCell = row.insertCell();
                    avgGeneralScoreCell.classList.add('score-col', 'col-general');
                    avgGeneralScoreCell.innerHTML = `<span class="overall-score">${group.avgGeneralScore.toFixed(1)}</span>`;
                });
            }

            function updateSortIndicators_ListView_Grouped() {
                rankingTable.querySelectorAll('thead th.sortable').forEach(th => {
                    th.classList.remove('sorted-asc', 'sorted-desc');
                    if (th.dataset.column === currentSortColumn) {
                        th.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
                    }
                });
            }

            function handleSort_ListView_Grouped(columnKey) {
                if (currentSortColumn === columnKey) {
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSortColumn = columnKey;
                    currentSortDirection = (columnKey === 'restaurant') ? 'asc' : 'desc';
                }
                applyFiltersAndSort_ListView_Grouped();
            }

            function toggleTagFilter_ListView_Grouped(event) {
                const clickedTag = event.target.dataset.tag;
                if (!clickedTag) return;

                if (activeTagFilters.has(clickedTag)) {
                    activeTagFilters.delete(clickedTag);
                    event.target.classList.remove('selected');
                } else {
                    activeTagFilters.add(clickedTag);
                    event.target.classList.add('selected');
                }
                console.log("Filtros de etiquetas activos:", activeTagFilters);
                applyFiltersAndSort_ListView_Grouped();
            }

            rankingTbody.addEventListener('click', (event) => {
                const row = event.target.closest('.ranking-row');
                if (row && row.dataset.listId && row.dataset.restaurant !== undefined) {
                    const listId = row.dataset.listId;
                    const restaurant = encodeURIComponent(row.dataset.restaurant);
                    const dish = encodeURIComponent(row.dataset.dish);
                    window.location.href = `grouped-detail-view.html?listId=${listId}&restaurant=${restaurant}&dish=${dish}`;
                }
            });

            searchInput.addEventListener('input', applyFiltersAndSort_ListView_Grouped);

            const deleteListBtn = document.getElementById('delete-list-button');
            if (deleteListBtn) {
                deleteListBtn.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar "${listTitleElement.textContent || 'esta lista'}" y todas sus reseñas?`)) {
                        const idToken = await auth.currentUser?.getIdToken(true);
                        const headers = {};
                        if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
                        
                        try {
                            const response = await fetch(`${API_BASE_URL}/lists/${state.currentListId}`, { 
                                method: 'DELETE',
                                headers: headers 
                            });
                            
                            if (!response.ok && response.status !== 204) { // 204 No Content is a success for DELETE
                                throw new Error(`HTTP error: ${response.status}`);
                            }
                            
                            alert('¡Lista eliminada!');
                            window.location.href = 'index.html';
                        } catch (error) {
                            console.error('Error deleting list:', error);
                            alert('Error al eliminar la lista. Por favor, inténtalo de nuevo.');
                        }
                    }
                });
            }
        } else {
            console.warn("LIST-VIEW (Agrupada): Faltan elementos esenciales del DOM.");
        }
        // --- End of code moved from app.js ---

        // Logic for '.add-review-button' specific to list-view.html (if any beyond href)
        const addReviewBtnPage = document.querySelector('.add-review-button'); // Ensure this is specific enough or use ID
        if (addReviewBtnPage && addReviewBtnPage.closest('main').querySelector('#list-title')) { // Check if it's on list-view page
            addReviewBtnPage.addEventListener('click', (e) => {
                if (state.currentListId) { // currentListId should be set when list-view loads
                    e.preventDefault();
                    window.location.href = `review-form.html?listId=${state.currentListId}`;
                } else if (!addReviewBtnPage.href.includes('listId=')) { // If href not already set by fetch
                     e.preventDefault();
                     console.warn("List ID not available for Add Review button on List View.");
                     alert("Por favor, espera a que la lista se cargue completamente o vuelve a intentarlo.");
                }
                // If href already contains listId (set by fetch), default action is fine.
            });
        }
    }

    return {
        init
    };
})();
