window.ListopicApp = window.ListopicApp || {};

ListopicApp.placesService = (() => {
    function displayPlaceSuggestions(places, suggestionsBox) {
        suggestionsBox.innerHTML = '';
        // currentSelectedPlaceInfo se maneja a través de ListopicApp.state

        if (places && places.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'suggestions-list';
            places.forEach(place => {
                const li = document.createElement('li');
                const addressInfo = place.vicinity || place.formatted_address || 'Información de dirección no disponible';
                li.textContent = `${place.name} (${addressInfo})`;
                li.style.cursor = 'pointer';
                li.onclick = () => {
                    document.getElementById('restaurant-name-search-input').value = place.name; // Input visible
                    // MODIFICADO: Actualizar el input oculto correcto
                    document.getElementById('establishment-name').value = place.name; // Input oculto con el nuevo ID

                    const locationUrlInput = document.getElementById('location-url');
                    if (locationUrlInput) {
                        // Esta URL es un placeholder, se debería construir mejor si se usa directamente un placeId
                        // o si tu API de Places devuelve una URL directa.
                        locationUrlInput.value = place.place_id ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${place.place_id}` : '';
                    }
                    const locationTextInput = document.getElementById('location-text');
                    if (locationTextInput) {
                        locationTextInput.value = addressInfo;
                    }
                    
                    if (window.ListopicApp && window.ListopicApp.state) {
                        window.ListopicApp.state.currentSelectedPlaceInfo = {
                            placeId: place.place_id,
                            name: place.name,
                            address: addressInfo,
                            latitude: place.geometry && place.geometry.location ? place.geometry.location.lat : null,
                            longitude: place.geometry && place.geometry.location ? place.geometry.location.lng : null,
                            // Podrías añadir la URL de Google Maps aquí si la construyes
                            mapsUrl: place.place_id ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${place.place_id}` : ''
                        };
                    } else {
                        console.warn("ListopicApp.state not defined, currentSelectedPlaceInfo not updated in placesService.");
                    }
                    suggestionsBox.innerHTML = ''; // Limpiar sugerencias después de seleccionar
                };
                ul.appendChild(li);
            });
            suggestionsBox.appendChild(ul);
        } else {
            suggestionsBox.innerHTML = '<p>No se encontraron lugares que coincidan.</p>';
        }
    }

    async function fetchNearbyRestaurantsWithContext() {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;

        const state = window.ListopicApp.state || {};
        const userLatitude = state.userLatitude;
        const userLongitude = state.userLongitude;
        const currentListNameForSearch = state.currentListNameForSearch;
        
        const functionUrl = ListopicApp.config.FUNCTION_URLS.placesNearbyRestaurants;
        if (!functionUrl || functionUrl.includes("xxxxxxxxxx")) { // Chequeo adicional por si la URL no está bien configurada
            console.error("URL de la función placesNearbyRestaurants no configurada o es un placeholder.");
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error de configuración: URL de servicio no disponible.</p>`;
            return;
        }

        if (!userLatitude || !userLongitude) {
             suggestionsBox.innerHTML = '<p style="color:var(--warning-color);">Por favor, pulsa "Ubicarme" primero.</p>';
             return;
        }

        let searchKeywords = "";
        if (currentListNameForSearch) {
            const baseKeywordsForHmm = "restaurante bar pub comida";
            searchKeywords = `${currentListNameForSearch.toLowerCase()} ${baseKeywordsForHmm}`;
            searchKeywords = [...new Set(searchKeywords.split(' '))].join(' ');
        }

        suggestionsBox.innerHTML = `<p>Buscando lugares cercanos ${searchKeywords ? 'relacionados con "' + searchKeywords + '"': ''}...</p>`;

        let fetchUrl = `${functionUrl}?latitude=${userLatitude}&longitude=${userLongitude}`;
        if (searchKeywords) {
             fetchUrl += `&keywords=${encodeURIComponent(searchKeywords)}`;
        }
        console.log('[placesService] Fetching URL:', fetchUrl);

        try {
            // Aquí se asume que la Cloud Function ya no necesitará un token de Firebase Auth
            // porque la clave de Google Places está en el backend. Si la Cloud Function sí
            // requiere autenticación del usuario por alguna razón, se debería añadir el token.
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Error HTTP ${response.status}: ${response.statusText}` }));
                throw new Error(errorData.message);
            }
            const places = await response.json();
            displayPlaceSuggestions(places, suggestionsBox);
        } catch (error) {
            console.error("Error fetching nearby restaurants with context:", error);
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error al buscar: ${error.message}</p>`;
            ListopicApp.services.showNotification(`Error al buscar lugares cercanos: ${error.message}`, 'error');
        }
    }

    async function searchRestaurantsByName(query) {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;

        const state = window.ListopicApp.state || {};
        const userLatitude = state.userLatitude;
        const userLongitude = state.userLongitude;
        
        const functionUrl = ListopicApp.config.FUNCTION_URLS.placesTextSearch;
        if (!functionUrl || functionUrl.includes("xxxxxxxxxx")) { // Chequeo adicional
            console.error("URL de la función placesTextSearch no configurada o es un placeholder.");
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error de configuración: URL de servicio no disponible.</p>`;
            return;
        }

        if (!query || query.trim() === "") {
            suggestionsBox.innerHTML = '<p>Introduce un término de búsqueda.</p>';
            return;
        }
        suggestionsBox.innerHTML = `<p>Buscando "${query}"...</p>`;

        let url = `${functionUrl}?query=${encodeURIComponent(query)}`;
        if (userLatitude && userLongitude) {
            url += `&latitude=${userLatitude}&longitude=${userLongitude}`;
        }
        console.log('[placesService] Fetching URL (searchRestaurantsByName):', url);

        try {
            const response = await fetch(url);
             if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Error HTTP ${response.status}: ${response.statusText}` }));
                throw new Error(errorData.message);
            }
            const places = await response.json();
            displayPlaceSuggestions(places, suggestionsBox);
        } catch (error) {
            console.error("Error searching restaurants by name:", error);
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error en búsqueda por nombre: ${error.message}</p>`;
            ListopicApp.services.showNotification(`Error en búsqueda por nombre: ${error.message}`, 'error');
        }
    }

    return {
        // displayPlaceSuggestions no necesita ser exportada si solo se usa internamente
        fetchNearbyRestaurantsWithContext,
        searchRestaurantsByName
    };
})();