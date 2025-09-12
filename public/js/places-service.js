// Contenido completo para public/js/places-service.js
window.ListopicApp = window.ListopicApp || {};

ListopicApp.placesService = (() => {

    // Puerta única para llamar a funciones HTTP (Cloud Run/HTTPS)
    async function callPlaceFunction(functionName, params) {
        const effectiveUrl = (ListopicApp.config.FUNCTION_URLS && (
            ListopicApp.config.FUNCTION_URLS[functionName]
            || (functionName === 'getPlaceDetailsFromGoogle' ? ListopicApp.config.FUNCTION_URLS['getPlaceDetails'] : undefined)
        ));
        if (!effectiveUrl) {
            throw new Error(`URL para la función '${functionName}' no está configurada.`);
        }

        // Adjuntar userId del usuario autenticado
        const currentUser = ListopicApp.services.auth.currentUser;
        if (!currentUser) {
            throw new Error("Usuario no autenticado. No se puede realizar la llamada a Places.");
        }
        params.userId = currentUser.uid;

        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${effectiveUrl}?${queryString}`;

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
            throw error;
        }
    }
    
    // Obtener detalles completos del lugar
    async function fetchPlaceDetails(placeId, userId) {
        return await callPlaceFunction('getPlaceDetailsFromGoogle', { placeid: placeId, userId: userId });
    }

    // Pintar sugerencias
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
                const currentUser = ListopicApp.services.auth.currentUser;
                if (!currentUser) {
                    console.error("Usuario no autenticado, no se pueden obtener detalles del lugar.");
                    suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error: Debes estar conectado para ver los detalles.</p>`;
                    return;
                }

                suggestionsBox.innerHTML = `<p>Obteniendo detalles de "${place.name}"...</p>`;
                
                try {
                    const detailedPlace = await fetchPlaceDetails(place.place_id, currentUser.uid);

                    if (detailedPlace && window.ListopicApp.uiUtils && window.ListopicApp.uiUtils.updateReviewFormWithPlace) {
                        window.ListopicApp.uiUtils.updateReviewFormWithPlace(detailedPlace);
                    } else {
                        console.error("No se pudieron obtener detalles o la función uiUtils.updateReviewFormWithPlace no está definida.");
                        suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">No se pudieron obtener los detalles completos.</p>`;
                    }
                } catch (error) {
                    console.error("Error final al obtener detalles del lugar:", error);
                    suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">${error.message}</p>`;
                } finally {
                   setTimeout(() => { suggestionsBox.innerHTML = ''; }, 2000);
                }
            };
            ul.appendChild(li);
        });
        suggestionsBox.appendChild(ul);
    }

    // Buscar cercanos con geolocalización del usuario y categoría de la lista
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
            suggestionsBox.innerHTML = `<p style=\"color:var(--danger-color);\">No se pudo obtener la ubicación: ${error.message}.</p>`;
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

    // Búsqueda por nombre + ubicación si disponible
    async function searchRestaurantsByName(query) {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;
        if (!query || query.trim() === "") {
            suggestionsBox.innerHTML = '<p>Introduce tu búsqueda.</p>';
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

