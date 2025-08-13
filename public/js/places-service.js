// Contenido completo para public/js/places-service.js
window.ListopicApp = window.ListopicApp || {};

ListopicApp.placesService = (() => {

    // ESTA ES LA MAGIA: Una única función para hablar con nuestro backend
    async function callPlaceFunction(functionName, params) {
        const functionUrl = ListopicApp.config.FUNCTION_URLS[functionName];
        if (!functionUrl) {
            throw new Error(`URL para la función '${functionName}' no está configurada.`);
        }
        
        // --- INICIO DE LA CORRECCIÓN ---
        // Obtenemos el usuario actual para sacar su ID
        const currentUser = ListopicApp.services.auth.currentUser;
        if (!currentUser) {
            throw new Error("Usuario no autenticado. No se puede realizar la llamada a Places.");
        }
        // Añadimos el userId a los parámetros de la petición
        params.userId = currentUser.uid;
        // --- FIN DE LA CORRECCIÓN ---

        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${functionUrl}?${queryString}`;

        console.log(`[placesService] Calling function '${functionName}' with URL: ${fullUrl}`);

        try {
            const response = await fetch(fullUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Error HTTP ${response.status}` }));
                throw new Error(errorData.message || `Error ${response.status} en el servicio de Places.`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error en placesService al llamar a ${functionName}:`, error);
            throw error; // Re-lanzamos para que el llamador lo gestione
        }
    }

    // En public/js/places-service.js

    // Función para obtener detalles completos de un lugar
    async function fetchPlaceDetails(placeId, userId) {
        // Le pasamos el placeid y AHORA TAMBIÉN el userId
        return await callPlaceFunction('getPlaceDetailsFromGoogle', { placeid: placeId, userId: userId });
    }

    // Muestra las sugerencias en la UI (Esta parte es más compleja, la simplificamos)
    function displayPlaceSuggestions(places, suggestionsBox) {
        suggestionsBox.innerHTML = '';
        if (!places || places.length === 0) {
            suggestionsBox.innerHTML = '<p>No se encontraron lugares que coincidan.</p>';
            return;
        }

        const ul = document.createElement('ul');
        places.forEach(place => {
            const li = document.createElement('li');
            li.textContent = `${place.name} (${place.formatted_address || place.vicinity})`;
            li.dataset.placeId = place.place_id;
            li.onclick = async () => {
                suggestionsBox.innerHTML = '<p>Obteniendo detalles...</p>';
                const details = await fetchPlaceDetails(place.place_id);
                if (details && typeof ListopicApp.uiUtils.updateReviewFormWithPlace === 'function') {
                    // La función `updateReviewFormWithPlace` se encargará de rellenar el formulario
                    ListopicApp.uiUtils.updateReviewFormWithPlace(details);
                    suggestionsBox.innerHTML = ''; // Limpiar al seleccionar
                } else {
                    console.error("No se pudieron obtener detalles o la función uiUtils.updateReviewFormWithPlace no está definida.");
                    suggestionsBox.innerHTML = `<p style="color:var(--danger-color)">Error al cargar detalles del lugar.</p>`;
                }
            };
            ul.appendChild(li);
        });
        suggestionsBox.appendChild(ul);
    }

    // Busca lugares cercanos
    async function fetchNearbyRestaurantsWithContext() {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;

        suggestionsBox.innerHTML = '<p>Obteniendo ubicación...</p>';
        try {
            const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
            state.userLatitude = position.coords.latitude;
            state.userLongitude = position.coords.longitude;
            
            const keywords = state.currentListNameForSearch || '';
            suggestionsBox.innerHTML = `<p>Buscando lugares cercanos relacionados con "${keywords}"...</p>`;
            
            const places = await callPlaceFunction('placesNearbyRestaurants', {
                latitude: state.userLatitude,
                longitude: state.userLongitude,
                keywords: keywords
            });
            displayPlaceSuggestions(places, suggestionsBox);

        } catch (error) {
            suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error: ${error.message}</p>`;
            ListopicApp.services.showNotification(error.message, 'error');
        }
    }

    async function searchRestaurantsByName(query) {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;
        if (!query || query.trim() === "") {
            suggestionsBox.innerHTML = '<p>Introduce un término de búsqueda.</p>';
            return;
        }
        
        suggestionsBox.innerHTML = `<p>Buscando "${query}"...</p>`;
        const params = { query: query };
        if (state.userLatitude && state.userLongitude) {
            params.latitude = state.userLatitude;
            params.longitude = state.userLongitude;
        }

        try {
            const places = await callPlaceFunction('placesTextSearch', params);
            displayPlaceSuggestions(places, suggestionsBox);
        } catch (error) {
             suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error en la búsqueda: ${error.message}</p>`;
             ListopicApp.services.showNotification(error.message, 'error');
        }
    }

    return {
        fetchNearbyRestaurantsWithContext,
        searchRestaurantsByName
    };
})();