window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListView = (() => {
    function init() {
        console.log('Initializing List View page logic...');
        
        // API_BASE_URL apuntará a Cloud Functions para grouped-reviews
        const API_BASE_URL = ListopicApp.config.API_BASE_URL_FUNCTIONS || ListopicApp.config.API_BASE_URL;
        const auth = ListopicApp.services.auth; // Necesario para obtener el idToken
        const db = ListopicApp.services.db; // Para obtener datos de la lista directamente
        const state = ListopicApp.state;
        const uiUtils = ListopicApp.uiUtils;

        const listTitleElement = document.getElementById('list-title');
        const rankingTbody = document.getElementById('ranking-tbody');
        const searchInput = document.querySelector('.search-input');
        const tagFilterContainer = document.querySelector('.tag-filter-container');
        const rankingTable = document.querySelector('.ranking-table');
        const addReviewButton = document.querySelector('.add-review-button');
        const editListLink = document.getElementById('edit-list-link');
        const deleteListButton = document.getElementById('delete-list-button');


        let currentListIconClass = 'fa-solid fa-list'; 
        state.allGroupedItems = []; // Reiniciar para la lista actual
        state.currentListAvailableTags = []; // Reiniciar para la lista actual

        if (listTitleElement && rankingTbody && searchInput && tagFilterContainer && rankingTable) {
            let currentSortColumn = 'avgGeneralScore'; 
            let currentSortDirection = 'desc'; 
            let activeTagFilters = new Set(); 

            const urlParamsList = new URLSearchParams(window.location.search);
            const currentListIdFromURL = urlParamsList.get('listId');
            state.currentListId = currentListIdFromURL; 

            function getListIconClass_ListView(listName) {
                if (!listName) return 'fa-solid fa-list';
                const listNameLower = listName.toLowerCase();
                if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) return 'fa-solid fa-birthday-cake';
                if (listNameLower.includes('pizza')) return 'fa-solid fa-pizza-slice';
                if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) return 'fa-solid fa-hamburger';
                // ... (más iconos)
                return 'fa-solid fa-list';
            }

            if (state.currentListId) {
                if (addReviewButton) addReviewButton.href = `review-form.html?listId=${state.currentListId}`;
                if (editListLink) editListLink.href = `list-form.html?editListId=${state.currentListId}`;

                // Primero, obtener los datos de la lista (nombre, tags, criterios) directamente de Firestore
                db.collection('lists').doc(state.currentListId).get()
                    .then(listDoc => {
                        if (!listDoc.exists) {
                            throw new Error("Lista no encontrada.");
                        }
                        const listData = listDoc.data();
                        listTitleElement.textContent = listData.name || "Ranking Agrupado";
                        state.currentListAvailableTags = listData.availableTags || [];
                        state.currentListCriteriaDefinitions = listData.criteriaDefinition || {}; // Guardar criterios para la cabecera
                        currentListIconClass = getListIconClass_ListView(listData.name);
                        
                        renderTableHeaders_ListView_Grouped(); // Renderizar cabeceras con criterios dinámicos
                        renderTagFilters_ListView();

                        // Luego, obtener las reseñas agrupadas (idealmente de una Cloud Function)
                        return auth.currentUser?.getIdToken();
                    })
                    .then(idToken => {
                        if (!idToken && API_BASE_URL.includes('cloudfunctions.net')) { // Solo si es una CF protegida
                             console.warn("No hay token de usuario, pero se intentará llamar a la función (podría fallar si está protegida).");
                             // throw new Error("Usuario no autenticado, no se puede obtener el token.");
                        }
                        const headers = idToken ? { 'Authorization': `Bearer ${idToken}`, 'Accept': 'application/json' } : {'Accept': 'application/json'};
                        
                        // MODIFICADO: Este endpoint ahora debe ser una Cloud Function
                        // La Cloud Function deberá devolver establishmentName e itemName
                        const fetchUrl = `${API_BASE_URL}/groupedReviews?listId=${state.currentListId}`; 
                        // o `${API_BASE_URL}/lists/${state.currentListId}/groupedReviews` si mantienes la estructura de path.
                        // El nombre de la función sería "groupedReviews" o similar.
                        console.log('Fetching grouped reviews from (Cloud Function expected):', fetchUrl);
                        return fetch(fetchUrl, { headers: headers });
                    })
                    .then(async res => {
                        if (!res.ok) {
                            const errorText = await res.text();
                            throw new Error(`Error HTTP ${res.status} al obtener reseñas agrupadas: ${errorText}`);
                        }
                        return res.json();
                    })
                    .then(groupedDataResponse => { // Asumimos que la CF devuelve { groupedReviews: [...] }
                        state.allGroupedItems = groupedDataResponse.groupedReviews || [];
                        if (!Array.isArray(state.allGroupedItems)) {
                            console.error("Formato de reseñas agrupadas inesperado:", state.allGroupedItems);
                            state.allGroupedItems = [];
                            rankingTbody.innerHTML = `<tr><td colspan="${rankingTable.querySelector('thead tr')?.children.length || 4}">Formato de datos inesperado.</td></tr>`;
                        } else {
                            applyFiltersAndSort_ListView_Grouped();
                        }
                    })
                    .catch(error => {
                        console.error("LIST-VIEW (Agrupada): Error en fetch o procesamiento:", error);
                        listTitleElement.textContent = "Error al cargar lista";
                        rankingTbody.innerHTML = `<tr><td colspan="${rankingTable.querySelector('thead tr')?.children.length || 4}" style="color:var(--danger-color);">${error.message}</td></tr>`;
                        ListopicApp.services.showNotification(`Error al cargar la lista: ${error.message}`, "error");
                    });

            } else {
                listTitleElement.textContent = "Error: Lista no especificada";
                rankingTbody.innerHTML = `<tr><td colspan="4">Selecciona una lista válida.</td></tr>`;
                 ListopicApp.services.showNotification("ID de lista no especificado en la URL.", "error");
            }

            function renderTableHeaders_ListView_Grouped() {
                const tableHeadRow = rankingTable.querySelector('thead tr');
                if (!tableHeadRow) return;
                tableHeadRow.innerHTML = ''; // Limpiar cabeceras existentes

                const baseHeaders = [
                    { text: 'Foto', class: 'col-image', sortable: false },
                    { text: 'Elemento', class: 'sortable col-element', 'data-column': 'establishmentName', sortable: true }, // MODIFICADO: data-column
                    { text: 'Nº Reseñas', class: 'sortable score-col', 'data-column': 'itemCount', sortable: true },
                    { text: 'Media General', class: 'sortable score-col col-general', 'data-column': 'avgGeneralScore', sortable: true }
                ];
                
                // Añadir cabeceras para criterios ponderables (si existen y se quieren mostrar)
                // Esto es opcional, ya que la vista agrupada principal suele mostrar solo la media general.
                // Si se quisieran mostrar medias por criterio, la Cloud Function debería calcularlas y devolverlas.
                // Por ahora, nos quedamos con las cabeceras base.

                baseHeaders.forEach(headerConfig => {
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
                if (state.currentListAvailableTags.length > 0) { 
                    state.currentListAvailableTags.forEach(tag => {
                        const button = document.createElement('button');
                        button.className = 'tag-filter-button';
                        button.textContent = uiUtils.escapeHtml(tag);
                        button.dataset.tag = tag;
                        button.addEventListener('click', toggleTagFilter_ListView_Grouped);
                        tagFilterContainer.appendChild(button);
                    });
                } else {
                    tagFilterContainer.innerHTML = '<p>No hay etiquetas para filtrar en esta lista.</p>';
                }
            }

            function applyFiltersAndSort_ListView_Grouped() {
                let filteredItems = [...state.allGroupedItems]; 
                const searchTerm = searchInput.value.toLowerCase();

                if (searchTerm) {
                    filteredItems = filteredItems.filter(group =>
                        // MODIFICADO: Buscar en establishmentName e itemName
                        (group.establishmentName && group.establishmentName.toLowerCase().includes(searchTerm)) ||
                        (group.itemName && group.itemName.toLowerCase().includes(searchTerm))
                    );
                }

                if (activeTagFilters.size > 0) {
                    filteredItems = filteredItems.filter(group => {
                        if (!group.groupTags || group.groupTags.length === 0) return false;
                        return [...activeTagFilters].every(filterTag => group.groupTags.includes(filterTag));
                    });
                }

                filteredItems.sort((a, b) => {
                    let valA, valB;
                    // MODIFICADO: Ordenar por establishmentName
                    if (currentSortColumn === 'establishmentName') { valA = a.establishmentName?.toLowerCase() || ''; valB = b.establishmentName?.toLowerCase() || ''; }
                    else if (currentSortColumn === 'avgGeneralScore') { valA = a.avgGeneralScore; valB = b.avgGeneralScore; }
                    else if (currentSortColumn === 'itemCount') { valA = a.itemCount; valB = b.itemCount; }
                    else { valA = a[currentSortColumn]; valB = b[currentSortColumn]; }

                    if (typeof valA === 'string' && typeof valB === 'string') {
                        return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    }
                    return currentSortDirection === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
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
                    // MODIFICADO: data-attributes y parámetros de URL
                    row.dataset.listId = group.listId || state.currentListId; // group.listId si la CF lo devuelve, sino el de la página
                    row.dataset.establishment = group.establishmentName;
                    row.dataset.item = group.itemName || "";

                    const imageCell = row.insertCell();
                    imageCell.classList.add('col-image');
                    if (group.thumbnailUrl) {
                        imageCell.innerHTML = `<img src="${uiUtils.escapeHtml(group.thumbnailUrl)}" alt="${uiUtils.escapeHtml(group.itemName || group.establishmentName)}" class="ranking-item-image">`;
                    } else {
                        imageCell.innerHTML = `<div class="ranking-item-icon-placeholder"><i class="${currentListIconClass}"></i></div>`;
                    }

                    const elementCell = row.insertCell();
                    elementCell.classList.add('col-element');
                    // MODIFICADO: Mostrar establishmentName e itemName
                    const itemText = group.itemName ? ` - ${uiUtils.escapeHtml(group.itemName)}` : '';
                    elementCell.innerHTML = `<span class="restaurant-name">${uiUtils.escapeHtml(group.establishmentName) || 'N/A'}</span><span class="dish-name-sub">${itemText}</span>`;

                    const itemCountCell = row.insertCell();
                    itemCountCell.classList.add('score-col');
                    itemCountCell.textContent = group.itemCount;

                    const avgGeneralScoreCell = row.insertCell();
                    avgGeneralScoreCell.classList.add('score-col', 'col-general');
                    avgGeneralScoreCell.innerHTML = `<span class="overall-score">${(group.avgGeneralScore !== undefined ? group.avgGeneralScore : 0).toFixed(1)}</span>`;
                    
                    // Aquí irían las celdas para las medias de criterios si se implementa
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
                    currentSortDirection = (columnKey === 'establishmentName') ? 'asc' : 'desc'; // MODIFICADO
                }
                applyFiltersAndSort_ListView_Grouped();
            }

            function toggleTagFilter_ListView_Grouped(event) {
                const clickedTag = event.target.dataset.tag;
                if (!clickedTag) return;
                if (activeTagFilters.has(clickedTag)) activeTagFilters.delete(clickedTag);
                else activeTagFilters.add(clickedTag);
                event.target.classList.toggle('selected');
                applyFiltersAndSort_ListView_Grouped();
            }

            rankingTbody.addEventListener('click', (event) => {
                const row = event.target.closest('.ranking-row');
                if (row && row.dataset.listId && row.dataset.establishment !== undefined) {
                    const listId = row.dataset.listId;
                    // MODIFICADO: Usar los nuevos data-attributes para los parámetros
                    const establishment = encodeURIComponent(row.dataset.establishment);
                    const item = encodeURIComponent(row.dataset.item);
                    window.location.href = `grouped-detail-view.html?listId=${listId}&establishment=${establishment}&item=${item}`;
                }
            });

            searchInput.addEventListener('input', applyFiltersAndSort_ListView_Grouped);

            if (deleteListButton) {
                deleteListButton.addEventListener('click', async () => {
                    if (!state.currentListId) {
                         ListopicApp.services.showNotification("ID de lista no disponible para eliminar.", "error");
                         return;
                    }
                    if (confirm(`¿Eliminar "${listTitleElement.textContent || 'esta lista'}" y todas sus reseñas? Esta acción no se puede deshacer.`)) {
                        // Idealmente, esto llamaría a una Cloud Function que borra la lista Y su subcolección de reseñas
                        try {
                            ListopicApp.services.showNotification("Eliminando lista...", "info");
                            // Para eliminar la lista y sus subcolecciones, se recomienda una Cloud Function.
                            // Si se hace desde el cliente, primero hay que borrar todas las reseñas.
                            const reviewsSnapshot = await db.collection('lists').doc(state.currentListId).collection('reviews').get();
                            const batch = db.batch();
                            reviewsSnapshot.forEach(doc => {
                                batch.delete(doc.ref);
                            });
                            await batch.commit(); // Borrar reseñas
                            await db.collection('lists').doc(state.currentListId).delete(); // Borrar lista
                            
                            ListopicApp.services.showNotification('¡Lista eliminada!', 'success');
                            window.location.href = 'index.html';
                        } catch (error) {
                            console.error('Error deleting list:', error);
                            ListopicApp.services.showNotification(`Error al eliminar la lista: ${error.message}`, 'error');
                        }
                    }
                });
            }
        } else {
            console.warn("LIST-VIEW (Agrupada): Faltan elementos esenciales del DOM.");
        }
    }

    return {
        init
    };
})();