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

        console.log('[placesService] Fetching nearby restaurants from URL:', fetchUrl);
        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Error HTTP: ${response.status}`);
            }
            const places = await response.json();
            displayPlaceSuggestions(places, suggestionsBox);
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

        console.log('[placesService] Searching restaurants by name from URL:', url);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Error HTTP: ${response.status}`);
            }
            const places = await response.json();
            displayPlaceSuggestions(places, suggestionsBox);
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
