window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListView = (() => {
    // Variables para mantener el estado de la ordenación y filtros (locales al módulo)
    let currentSortColumn = 'avgGeneralScore';
    let currentSortDirection = 'desc';
    let activeTagFilters = new Set();
    let currentListIconClass = 'fa-solid fa-list'; // Icono por defecto

    // Elementos del DOM (se asignarán en init)
    let listTitleElement, rankingTbody, searchInput, tagFilterContainer, rankingTable, 
        addReviewButton, editListLink, deleteListButton;

    // Funciones auxiliares (definidas fuera de init para que estén disponibles)
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

    function renderTableHeaders_ListView_Grouped() {
        const tableHeadRow = rankingTable.querySelector('thead tr');
        if (!tableHeadRow) return;
        tableHeadRow.innerHTML = '';

        const baseHeaders = [
            { text: 'Foto', class: 'col-image', sortable: false },
            { text: 'Elemento', class: 'sortable col-element', 'data-column': 'establishmentName', sortable: true },
            { text: 'Nº Reseñas', class: 'sortable score-col', 'data-column': 'itemCount', sortable: true },
            { text: 'Media General', class: 'sortable score-col col-general', 'data-column': 'avgGeneralScore', sortable: true }
        ];
        
        // Podrías añadir aquí las cabeceras de criterios dinámicos si ListopicApp.state.currentListCriteriaDefinitions está poblado
        // y tu Cloud Function devuelve las medias por criterio. Por ahora, usamos las base.

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
        const uiUtils = ListopicApp.uiUtils; // Asegurar acceso a uiUtils
        if (!tagFilterContainer) return;
        tagFilterContainer.innerHTML = '';
        if (ListopicApp.state.currentListAvailableTags && ListopicApp.state.currentListAvailableTags.length > 0) { 
            ListopicApp.state.currentListAvailableTags.forEach(tag => {
                const button = document.createElement('button');
                button.className = 'tag-filter-button';
                button.textContent = uiUtils.escapeHtml(tag); // Usar uiUtils para escapar
                button.dataset.tag = tag;
                button.addEventListener('click', toggleTagFilter_ListView_Grouped);
                tagFilterContainer.appendChild(button);
            });
        } else {
            tagFilterContainer.innerHTML = '<p>No hay etiquetas para filtrar en esta lista.</p>';
        }
    }
    
    function renderTable_ListView_Grouped(groupedItemsToRender) {
        const uiUtils = ListopicApp.uiUtils; // Asegurar acceso a uiUtils
        rankingTbody.innerHTML = '';
        const numCols = rankingTable.querySelector('thead tr')?.children.length || 4;
        if (groupedItemsToRender.length === 0) {
            rankingTbody.innerHTML = `<tr><td colspan="${numCols}">No hay elementos que coincidan.</td></tr>`;
            return;
        }
        groupedItemsToRender.forEach(group => {
            const row = rankingTbody.insertRow();
            row.className = 'ranking-row';
            row.dataset.listId = group.listId || ListopicApp.state.currentListId; 
            row.dataset.placeId = group.placeId; // CAMBIO: Añadir data-place-id. La CF groupedReviews debe devolverlo.
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
            const itemText = group.itemName ? ` - ${uiUtils.escapeHtml(group.itemName)}` : '';
            elementCell.innerHTML = `<span class="restaurant-name">${uiUtils.escapeHtml(group.establishmentName) || 'N/A'}</span><span class="dish-name-sub">${itemText}</span>`;

            const itemCountCell = row.insertCell();
            itemCountCell.classList.add('score-col');
            itemCountCell.textContent = group.itemCount;

            const avgGeneralScoreCell = row.insertCell();
            avgGeneralScoreCell.classList.add('score-col', 'col-general');
            avgGeneralScoreCell.innerHTML = `<span class="overall-score">${(group.avgGeneralScore !== undefined ? group.avgGeneralScore : 0).toFixed(1)}</span>`;
        });
    }

    function applyFiltersAndSort_ListView_Grouped() {
        let filteredItems = [...ListopicApp.state.allGroupedItems]; 
        const searchTerm = searchInput.value.toLowerCase();

        if (searchTerm) {
            filteredItems = filteredItems.filter(group =>
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

    function updateSortIndicators_ListView_Grouped() {
        if (!rankingTable) return;
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
            currentSortDirection = (columnKey === 'establishmentName') ? 'asc' : 'desc';
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

    function init() {
        console.log('Initializing List View page logic...');
        
        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db; // Necesario para eliminar lista
        const state = ListopicApp.state;
        // uiUtils ya está en el scope global de ListopicApp.uiUtils si es necesario

        // Asignar elementos del DOM a las variables del módulo
        listTitleElement = document.getElementById('list-title');
        rankingTbody = document.getElementById('ranking-tbody');
        searchInput = document.querySelector('.search-input');
        tagFilterContainer = document.querySelector('.tag-filter-container');
        rankingTable = document.querySelector('.ranking-table');
        addReviewButton = document.querySelector('.add-review-button');
        editListLink = document.getElementById('edit-list-link');
        deleteListButton = document.getElementById('delete-list-button');
        
        // Reiniciar estado para esta página
        state.allGroupedItems = []; 
        state.currentListAvailableTags = [];
        activeTagFilters = new Set(); // Reiniciar filtros activos
        currentSortColumn = 'avgGeneralScore'; // Restablecer ordenación por defecto
        currentSortDirection = 'desc';


        const urlParamsList = new URLSearchParams(window.location.search);
        const currentListIdFromURL = urlParamsList.get('listId');
        state.currentListId = currentListIdFromURL; 

        // Logs para depuración
        console.log("PAGE-LIST-VIEW: Raw window.location.search:", window.location.search);
        console.log("PAGE-LIST-VIEW: Parsed listId from URL:", currentListIdFromURL);
        console.log("PAGE-LIST-VIEW: state.currentListId set to:", state.currentListId);

        if (listTitleElement && rankingTbody && searchInput && tagFilterContainer && rankingTable) {
            if (state.currentListId) {
                if (addReviewButton) addReviewButton.href = `review-form.html?listId=${state.currentListId}`;
                if (editListLink) editListLink.href = `list-form.html?editListId=${state.currentListId}`;

                auth.currentUser?.getIdToken(true) // Forzar refresco del token por si acaso
                .then(idToken => {
                    // Si tu función no requiere autenticación, puedes omitir el envío del token.
                    // Si SÍ requiere, asegúrate de que la función lo verifique.
                    const headers = idToken ? { 'Authorization': `Bearer ${idToken}`, 'Accept': 'application/json' } : {'Accept': 'application/json'};
                    
                    const functionUrl = ListopicApp.config.FUNCTION_URLS.groupedReviews;
                    if (!functionUrl) {
                        throw new Error("URL de la función groupedReviews no configurada en ListopicApp.config.FUNCTION_URLS");
                    }
                    const fetchUrl = `${functionUrl}?listId=${state.currentListId}`; 
                    
                    console.log('Fetching grouped reviews from (Cloud Function v2 URL):', fetchUrl);
                    return fetch(fetchUrl, { headers: headers });
                })
                .then(async res => {
                    if (!res.ok) {
                        const errorText = await res.text();
                        console.error("Raw error response from CF:", errorText);
                        let detail = errorText.substring(0, 200); 
                        try {
                            const errorJson = JSON.parse(errorText);
                            if (errorJson && errorJson.error) {
                                detail = typeof errorJson.error === 'string' ? errorJson.error : (errorJson.error.message || JSON.stringify(errorJson.error));
                            } else if (errorJson) {
                                detail = JSON.stringify(errorJson).substring(0,200);
                            }
                        } catch (e) { /* no era JSON */ }
                        throw new Error(`Error HTTP ${res.status} al obtener reseñas agrupadas: ${detail}`);
                    }
                    return res.json();
                })
                .then(responsePayload => {
                    const listName = responsePayload.listName || "Nombre de Lista Desconocido";
                    // Asumimos que tu Cloud Function 'groupedReviews' ahora devuelve el categoryId de la lista
                    const category = responsePayload.categoryId || "Hmm..."; 
                    ListopicApp.uiUtils.updatePageHeaderInfo(category, listName);
                    
                    if (!responsePayload || typeof responsePayload !== 'object') {
                        throw new Error("Respuesta inesperada o vacía de la Cloud Function.");
                    }
                    listTitleElement.textContent = responsePayload.listName || "Ranking Agrupado";
                    state.currentListAvailableTags = responsePayload.tags || [];
                    state.currentListCriteriaDefinitions = responsePayload.criteria || {}; 
                    currentListIconClass = getListIconClass_ListView(responsePayload.listName);
                    
                    renderTableHeaders_ListView_Grouped(); 
                    renderTagFilters_ListView();

                    state.allGroupedItems = responsePayload.groupedReviews || [];
                    if (!Array.isArray(state.allGroupedItems)) {
                         console.error("Formato de reseñas agrupadas inesperado:", state.allGroupedItems);
                         state.allGroupedItems = [];
                         if(rankingTbody) rankingTbody.innerHTML = `<tr><td colspan="${rankingTable.querySelector('thead tr')?.children.length || 4}">Formato de datos agrupados inesperado.</td></tr>`;
                    } else {
                        applyFiltersAndSort_ListView_Grouped();
                    }
                })
                .catch(error => {
                    console.error("LIST-VIEW (Agrupada): Error en fetch o procesamiento:", error);
                    if(listTitleElement) listTitleElement.textContent = "Error al cargar lista";
                    if(rankingTbody) rankingTbody.innerHTML = `<tr><td colspan="${rankingTable?.querySelector('thead tr')?.children.length || 4}" style="color:var(--danger-color);">${error.message}</td></tr>`;
                    ListopicApp.services.showNotification(`Error al cargar la lista: ${error.message}`, "error");
                });
            } else {
                if(listTitleElement) listTitleElement.textContent = "Error: Lista no especificada";
                if(rankingTbody) rankingTbody.innerHTML = `<tr><td colspan="4">ID de lista no especificado en la URL.</td></tr>`;
                ListopicApp.services.showNotification("ID de lista no especificado en la URL.", "error");
            }

            // Listeners de UI (solo si los elementos existen)
            if (rankingTbody) {
                rankingTbody.addEventListener('click', (event) => {
                    const row = event.target.closest('.ranking-row');
                    if (row && row.dataset.listId && row.dataset.placeId !== undefined) { // CAMBIO: Esperar data-place-id
                        const listId = row.dataset.listId;
                        const placeId = row.dataset.placeId; // CAMBIO: Usar placeId
                        const item = encodeURIComponent(row.dataset.item);

                        // CAMBIO: Pasar placeId en lugar de establishment
                        window.location.href = `grouped-detail-view.html?listId=${listId}&placeId=${placeId}&item=${item}`;
                    } else if (row) { // Log si falta algo
                        console.warn("Clic en fila, pero faltan data-attributes:", row.dataset);
                    }
                });
            }
            if(searchInput) searchInput.addEventListener('input', applyFiltersAndSort_ListView_Grouped);

            if (deleteListButton) {
                deleteListButton.addEventListener('click', async () => {
                    if (!state.currentListId) {
                         ListopicApp.services.showNotification("ID de lista no disponible para eliminar.", "error");
                         return;
                    }
                    if (confirm(`¿Eliminar "${listTitleElement.textContent || 'esta lista'}" y todas sus reseñas? Esta acción no se puede deshacer.`)) {
                        try {
                            ListopicApp.services.showNotification("Eliminando lista y su contenido...", "info");

                            // Asumimos que tienes una Cloud Function Callable llamada 'deleteListAndContent'
                            // Esta función se encargaría de borrar la lista y todas sus subcolecciones (reviews)
                            const deleteListFunction = firebase.functions().httpsCallable('deleteListAndContent');
                            
                            // Llamar a la función con el listId
                            const result = await deleteListFunction({ listId: state.currentListId });

                            // La función podría devolver un mensaje de éxito o simplemente completarse
                            if (result && result.data && result.data.message) {
                                ListopicApp.services.showNotification(result.data.message, 'success');
                            } else {
                                ListopicApp.services.showNotification('¡Lista eliminada con éxito!', 'success');
                            }
                            
                            window.location.href = 'index.html';
                        } catch (error) {
                            console.error('Error llamando a la función de eliminar lista:', error);
                            // El 'error.message' contendrá el mensaje que enviaste desde la HttpsError
                            ListopicApp.services.showNotification(`Error al eliminar la lista: ${error.message || 'Error desconocido.'}`, 'error');
                        }
                    }
                });
            }
        } else { // Fin de if (elementos principales del DOM existen)
            console.warn("LIST-VIEW (Agrupada): Faltan elementos esenciales del DOM para inicializar la página (ej. #list-title, #ranking-tbody).");
        }
    } // Cierre de init

    return {
        init
    };
})();