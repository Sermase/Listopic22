window.ListopicApp = window.ListopicApp || {};

ListopicApp.placesService = (() => {
    // Dependencies:
    // ListopicApp.config.API_BASE_URL
    // Global state (currently in app.js, to be managed by main.js or a state module):
    // - userLatitude, userLongitude, currentListNameForSearch, currentSelectedPlaceInfo
    // DOM elements are accessed directly by ID (e.g., 'restaurant-suggestions')

    function displayPlaceSuggestions(places, suggestionsBox) {
        // This function relies on currentSelectedPlaceInfo being a global or accessible variable.
        // And it directly manipulates DOM elements by ID.
        suggestionsBox.innerHTML = '';
        // currentSelectedPlaceInfo = null; // This was a global state modification

        if (places && places.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'suggestions-list';
            places.forEach(place => {
                const li = document.createElement('li');
                const addressInfo = place.vicinity || place.formatted_address || 'Información de dirección no disponible';
                li.textContent = `${place.name} (${addressInfo})`;
                li.style.cursor = 'pointer';
                li.onclick = () => {
                    document.getElementById('restaurant-name-search-input').value = place.name;
                    document.getElementById('restaurant-name').value = place.name;

                    const locationUrlInput = document.getElementById('location-url');
                    if (locationUrlInput) {
                        locationUrlInput.value = `https://maps.google.com/?q=place_id:${place.place_id}`;
                    }
                    const locationTextInput = document.getElementById('location-text');
                    if (locationTextInput) {
                        locationTextInput.value = addressInfo;
                    }
                    // Update a shared state instead of a global variable directly
                    if (window.ListopicApp && window.ListopicApp.state) {
                        window.ListopicApp.state.currentSelectedPlaceInfo = {
                            placeId: place.place_id,
                            name: place.name,
                            address: addressInfo,
                            latitude: place.geometry && place.geometry.location ? place.geometry.location.lat : null,
                            longitude: place.geometry && place.geometry.location ? place.geometry.location.lng : null
                        };
                    } else {
                        // Fallback or error if state module isn't defined
                        console.warn("ListopicApp.state not defined, currentSelectedPlaceInfo not updated in placesService.");
                    }
                    suggestionsBox.innerHTML = '';
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

        // Access global state variables - these will need to be managed by main.js or a state module
        const state = window.ListopicApp.state || {};
        const userLatitude = state.userLatitude;
        const userLongitude = state.userLongitude;
        const currentListNameForSearch = state.currentListNameForSearch;
        const API_BASE_URL = ListopicApp.config.API_BASE_URL;


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

        let fetchUrl = `${API_BASE_URL}/places/nearby-restaurants?latitude=${userLatitude}&longitude=${userLongitude}`;
        if (searchKeywords) {
             fetchUrl += `&keywords=${encodeURIComponent(searchKeywords)}`;
        }
        console.log('[placesService] Fetching URL:', fetchUrl);

        try {
            const response = await fetch(fetchUrl);
            console.log('[placesService] Response status:', response.status, response.statusText);

            if (!response.ok) {
                const contentType = response.headers.get("content-type");
                let errorDataMessage = `Error HTTP: ${response.status} ${response.statusText}`;
                if (contentType && contentType.includes("application/json")) {
                    const errorData = await response.json().catch(() => null);
                    if (errorData && errorData.message) {
                        errorDataMessage = errorData.message;
                    }
                } else {
                    const errorText = await response.text();
                    console.error('[placesService] Non-JSON error response text:', errorText.substring(0, 500));
                    errorDataMessage = `Error del servidor (no JSON): ${response.status}. Respuesta: ${errorText.substring(0,100)}...`;
                }
                throw new Error(errorDataMessage);
            }

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const places = await response.json();
                displayPlaceSuggestions(places, suggestionsBox);
            } else {
                const responseText = await response.text();
                console.error('[placesService] Expected JSON but received:', contentType, responseText.substring(0, 500));
                throw new Error(`Respuesta inesperada del servidor. Se esperaba JSON pero se recibió ${contentType}.`);
            }
        } catch (error) {
            console.error("Error fetching nearby restaurants with context:", error);
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error al buscar: ${error.message}</p>`;
        }
    }

    async function searchRestaurantsByName(query) {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;

        // Access global state variables
        const state = window.ListopicApp.state || {};
        const userLatitude = state.userLatitude;
        const userLongitude = state.userLongitude;
        const API_BASE_URL = ListopicApp.config.API_BASE_URL;

        if (!query || query.trim() === "") {
            suggestionsBox.innerHTML = '<p>Introduce un término de búsqueda.</p>';
            return;
        }
        suggestionsBox.innerHTML = `<p>Buscando "${query}"...</p>`;

        let url = `${API_BASE_URL}/places/text-search?query=${encodeURIComponent(query)}`;
        if (userLatitude && userLongitude) {
            url += `&latitude=${userLatitude}&longitude=${userLongitude}`;
        }
        console.log('[placesService] Fetching URL (searchRestaurantsByName):', url);

        try {
            const response = await fetch(url);
            console.log('[placesService] Response status (searchRestaurantsByName):', response.status, response.statusText);

            if (!response.ok) {
                const contentType = response.headers.get("content-type");
                let errorDataMessage = `Error HTTP: ${response.status} ${response.statusText}`;
                if (contentType && contentType.includes("application/json")) {
                    const errorData = await response.json().catch(() => null);
                    if (errorData && errorData.message) {
                        errorDataMessage = errorData.message;
                    }
                } else {
                    const errorText = await response.text();
                    console.error('[placesService] Non-JSON error response text (searchRestaurantsByName):', errorText.substring(0, 500));
                    errorDataMessage = `Error del servidor (no JSON): ${response.status}. Respuesta: ${errorText.substring(0,100)}...`;
                }
                throw new Error(errorDataMessage);
            }
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const places = await response.json();
                displayPlaceSuggestions(places, suggestionsBox);
            } else {
                const responseText = await response.text();
                console.error('[placesService] Expected JSON but received (searchRestaurantsByName):', contentType, responseText.substring(0, 500));
                throw new Error(`Respuesta inesperada del servidor. Se esperaba JSON pero se recibió ${contentType}.`);
            }
        } catch (error) {
            console.error("Error searching restaurants by name:", error);
            if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error en búsqueda por nombre: ${error.message}</p>`;
        }
    }

    return {
        displayPlaceSuggestions,
        fetchNearbyRestaurantsWithContext,
        searchRestaurantsByName
    };
})();
