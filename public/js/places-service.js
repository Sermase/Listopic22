// Contenido completo para public/js/places-service.js
window.ListopicApp = window.ListopicApp || {};

ListopicApp.placesService = (() => {

    // ESTA ES LA MAGIA: Una única función para hablar con nuestro backend
    async function callPlaceFunction(functionName, params) {
        const functionUrl = ListopicApp.config.FUNCTION_URLS[functionName];
        const suggestionsBox = document.getElementById('restaurant-suggestions');

        if (!functionUrl) {
            const errorMsg = `Error de configuración: URL para '${functionName}' no encontrada.`;
            console.error(errorMsg);
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">${errorMsg}</p>`;
            return null;
        }

        const url = new URL(functionUrl);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

        console.log(`[placesService] Calling function '${functionName}' with URL:`, url.toString());

        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Error HTTP ${response.status}: ${response.statusText}` }));
                throw new Error(errorData.message || `Error del servidor al llamar a ${functionName}.`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error en placesService al llamar a ${functionName}:`, error);
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error al buscar: ${error.message}</p>`;
            ListopicApp.services.showNotification(`Error en el servicio de lugares: ${error.message}`, 'error');
            return null;
        }
    }
    
    // En public/js/places-service.js

    // Función para obtener detalles completos de un lugar
    async function fetchPlaceDetails(placeId, userId) {
        // Le pasamos el placeid y AHORA TAMBIÉN el userId
        return await callPlaceFunction('getPlaceDetailsFromGoogle', { placeid: placeId, userId: userId });
    }

    // Muestra las sugerencias en la UI (Esta parte es más compleja, la simplificamos)
    async function displayPlaceSuggestions(places, suggestionsBox) {
        suggestionsBox.innerHTML = '';
        if (!places || places.length === 0) {
            suggestionsBox.innerHTML = '<p>No se encontraron lugares que coincidan.</p>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'suggestions-list';
        places.forEach(place => {
            const li = document.createElement('li');
            const addressInfo = place.vicinity || place.formatted_address || 'Dirección no disponible';
            li.textContent = `${place.name} (${addressInfo})`;
            li.style.cursor = 'pointer';

            li.onclick = async () => {
                suggestionsBox.innerHTML = `<p>Obteniendo detalles de "${place.name}"...</p>`;
                const detailedPlace = await fetchPlaceDetails(place.place_id);

                if (detailedPlace && window.ListopicApp.uiUtils && window.ListopicApp.uiUtils.updateReviewFormWithPlace) {
                     window.ListopicApp.uiUtils.updateReviewFormWithPlace(detailedPlace);
                } else {
                    console.error("No se pudieron obtener detalles o la función uiUtils.updateReviewFormWithPlace no está definida.");
                    suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">No se pudieron obtener los detalles completos.</p>`;
                }
                suggestionsBox.innerHTML = ''; // Limpiar al final
            };
            ul.appendChild(li);
        });
        suggestionsBox.appendChild(ul);
    }

    // Busca lugares cercanos
    async function fetchNearbyRestaurantsWithContext() {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;

        const state = window.ListopicApp.state || {};
        if (!state.userLatitude || !state.userLongitude) {
            suggestionsBox.innerHTML = '<p style="color:var(--warning-color);">Por favor, pulsa "Ubicarme" primero.</p>';
            return;
        }

        let searchKeywords = state.currentListNameForSearch ? `${state.currentListNameForSearch.toLowerCase()} restaurante bar pub comida` : "restaurante bar pub comida";
        searchKeywords = [...new Set(searchKeywords.split(' '))].join(' ');
        suggestionsBox.innerHTML = `<p>Buscando lugares cercanos...</p>`;

        // Solo le pide las cosas al "Jefe de Camareros"
        const places = await callPlaceFunction('placesNearbyRestaurants', {
            latitude: state.userLatitude,
            longitude: state.userLongitude,
            keywords: searchKeywords
        });

        if (places) {
            displayPlaceSuggestions(places, suggestionsBox);
        }
    }

    // Busca lugares por nombre
    async function searchRestaurantsByName(query) {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;
        if (!query || query.trim() === "") {
            suggestionsBox.innerHTML = '<p>Introduce un término de búsqueda.</p>';
            return;
        }
        suggestionsBox.innerHTML = `<p>Buscando "${query}"...</p>`;
        
        const state = window.ListopicApp.state || {};
        const params = { query: query };
        if (state.userLatitude && state.userLongitude) {
            params.latitude = state.userLatitude;
            params.longitude = state.userLongitude;
        }

        // De nuevo, solo una simple petición al "Jefe de Camareros"
        const places = await callPlaceFunction('placesTextSearch', params);
        
        if (places) {
            displayPlaceSuggestions(places, suggestionsBox);
        }
    }

    return {
        fetchNearbyRestaurantsWithContext,
        searchRestaurantsByName
    };
})();