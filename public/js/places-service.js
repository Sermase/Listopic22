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

    // Busca lugares cercanos, obteniendo la ubicación automáticamente
    async function fetchNearbyRestaurantsWithContext() {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;

        const state = window.ListopicApp.state || {};
        suggestionsBox.innerHTML = '<p>Obteniendo tu ubicación...</p>';

        try {
            const position = await new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    return reject(new Error("La geolocalización no es soportada."));
                }
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
            state.userLatitude = position.coords.latitude;
            state.userLongitude = position.coords.longitude;
        } catch (error) {
            console.error("Error obteniendo ubicación:", error);
            suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">No se pudo obtener la ubicación: ${error.message}.</p>`;
            return;
        }

        suggestionsBox.innerHTML = `<p>Buscando lugares cercanos...</p>`;
        const listId = state.currentListId;
        if (!listId) {
            suggestionsBox.innerHTML = '<p style="color:var(--danger-color);">Error: No se pudo identificar la lista actual.</p>';
            return;
        }

        let categoryId;
        try {
            const listDoc = await ListopicApp.services.db.collection('lists').doc(listId).get();
            categoryId = listDoc.exists ? listDoc.data().categoryId : null;
        } catch (error) {
            suggestionsBox.innerHTML = '<p style="color:var(--danger-color);">Error al cargar datos de la lista.</p>';
            return;
        }

        if (!categoryId) {
            suggestionsBox.innerHTML = '<p style="color:var(--warning-color);">Esta lista no tiene una categoría para la búsqueda.</p>';
            return;
        }

        try {
            const places = await callPlaceFunction('placesNearbyRestaurants', {
                latitude: state.userLatitude,
                longitude: state.userLongitude,
                categoryId: categoryId
            });
            displayPlaceSuggestions(places, suggestionsBox);
        } catch (error) {
            suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">${error.message}</p>`;
        }
    }

    // Busca lugares por nombre, obteniendo la ubicación automáticamente
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

        if (!state.userLatitude || !state.userLongitude) {
            try {
                const position = await new Promise((resolve, reject) => {
                    if (!navigator.geolocation) return resolve(null);
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                if (position) {
                    state.userLatitude = position.coords.latitude;
                    state.userLongitude = position.coords.longitude;
                }
            } catch (error) {
                console.warn("No se pudo obtener la ubicación para la búsqueda de texto:", error.message);
            }
        }

        if (state.userLatitude && state.userLongitude) {
            params.latitude = state.userLatitude;
            params.longitude = state.userLongitude;
        }

        try {
            const places = await callPlaceFunction('placesTextSearch', params);
            displayPlaceSuggestions(places, suggestionsBox);
        } catch (error) {
            suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">${error.message}</p>`;
        }
    }

    return {
        fetchNearbyRestaurantsWithContext,
        searchRestaurantsByName
    };
})();