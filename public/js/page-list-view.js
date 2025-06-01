// En page-list-view.js
window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListView = (() => {
    function init() {
        console.log('Initializing List View page logic...');
        
        // Ya no se usa API_BASE_URL para esta función si tienes la URL completa
        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const state = ListopicApp.state;
        const uiUtils = ListopicApp.uiUtils;

        const listTitleElement = document.getElementById('list-title');
        // ... (otras definiciones de elementos)

        if (state.currentListId) { // state.currentListId se obtiene de los parámetros de la URL de la página
            // ... (código para configurar botones de añadir reseña y editar lista) ...

            auth.currentUser?.getIdToken().then(idToken => {
                const headers = idToken ? { 'Authorization': `Bearer ${idToken}`, 'Accept': 'application/json' } : {'Accept': 'application/json'};
                
                // CONSTRUIR LA URL PARA EL FETCH USANDO LA CONFIGURACIÓN
                const functionUrl = ListopicApp.config.FUNCTION_URLS.groupedReviews;
                const fetchUrl = `${functionUrl}?listId=${state.currentListId}`; 
                
                console.log('Fetching grouped reviews from (Cloud Function v2 URL):', fetchUrl);
                return fetch(fetchUrl, { headers: headers });
            })
            .then(async res => {
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error("Raw error response from CF:", errorText);
                    // Intenta parsear el error si es JSON
                    let detail = errorText.substring(0, 200); // Fallback
                    try {
                        const errorJson = JSON.parse(errorText);
                        if (errorJson && errorJson.error) {
                            detail = errorJson.error.message || errorJson.error;
                        } else if (errorJson) {
                            detail = JSON.stringify(errorJson).substring(0,200);
                        }
                    } catch (e) { /* no era JSON */ }
                    throw new Error(`Error HTTP ${res.status} al obtener reseñas agrupadas: ${detail}`);
                }
                return res.json();
            })
            .then(responsePayload => {
                listTitleElement.textContent = responsePayload.listName || "Ranking Agrupado";
                state.currentListAvailableTags = responsePayload.tags || [];
                state.currentListCriteriaDefinitions = responsePayload.criteria || {}; 
                // ... (resto de la lógica para renderizar la tabla y filtros) ...
                // currentListIconClass = getListIconClass_ListView(responsePayload.listName); // Asegúrate que esta función esté definida o úsala correctamente
                
                renderTableHeaders_ListView_Grouped(); 
                renderTagFilters_ListView();

                state.allGroupedItems = responsePayload.groupedReviews || [];
                if (!Array.isArray(state.allGroupedItems)) {
                     console.error("Formato de reseñas agrupadas inesperado:", state.allGroupedItems);
                     state.allGroupedItems = [];
                     // rankingTbody.innerHTML = ... (manejo de error en la tabla)
                } else {
                    applyFiltersAndSort_ListView_Grouped();
                }
            })
            .catch(error => {
                console.error("LIST-VIEW (Agrupada): Error en fetch o procesamiento:", error);
                if(listTitleElement) listTitleElement.textContent = "Error al cargar lista";
                // if(rankingTbody) rankingTbody.innerHTML = ... (manejo de error en la tabla)
                ListopicApp.services.showNotification(`Error al cargar la lista: ${error.message}`, "error");
            });
        } else {
            if(listTitleElement) listTitleElement.textContent = "Error: Lista no especificada";
            // if(rankingTbody) rankingTbody.innerHTML = ...
            ListopicApp.services.showNotification("ID de lista no especificado en la URL.", "error");
        }

        // Aquí deben estar definidas o importadas las funciones como:
        // getListIconClass_ListView, renderTableHeaders_ListView_Grouped, 
        // renderTagFilters_ListView, applyFiltersAndSort_ListView_Grouped,
        // updateSortIndicators_ListView_Grouped, handleSort_ListView_Grouped,
        // toggleTagFilter_ListView_Grouped
        // ... (el resto de la función init y las funciones auxiliares que ya tenías en page-list-view.js) ...
    } // Cierre de init

    // Definición de funciones auxiliares que estaban dentro de init o en el scope del IIFE
    // (ej. getListIconClass_ListView, renderTableHeaders_ListView_Grouped, etc.)
    // Debes asegurarte de que estas funciones estén definidas aquí si no están en init.
    // Por ejemplo:
    function getListIconClass_ListView(listName) { /* ... tu lógica ... */ return 'fa-solid fa-list'; }
    function renderTableHeaders_ListView_Grouped() { /* ... tu lógica ... */ }
    function renderTagFilters_ListView() { /* ... tu lógica ... */ }
    function applyFiltersAndSort_ListView_Grouped() { /* ... tu lógica ... */ }
    // etc.

    return {
        init
    };
})();