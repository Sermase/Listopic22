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
                    if (window.ListopicApp && window.ListopicApp.state) {
                        const placeDetails = { // Objeto para almacenar detalles del lugar
                            placeId: place.place_id,
                            name: place.name,
                            addressFormatted: place.formatted_address || place.vicinity, // Dirección formateada
                            latitude: place.geometry?.location?.lat ? place.geometry.location.lat() : (place.geometry?.location?.latitude || null),
                            longitude: place.geometry?.location?.lng ? place.geometry.location.lng() : (place.geometry?.location?.longitude || null),
                            mapsUrl: place.place_id ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${place.place_id}` : (place.geometry?.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.geometry.location.lat()},${place.geometry.location.lng()}` : ''),
                            // Inicializar componentes de dirección
                            streetAddress: '',
                            city: '',
                            postalCode: '',
                            region: '', // Para provincia/estado
                            country: ''
                        };

                        // Intentar extraer componentes de dirección si están disponibles (Google Places API detallada)
                        if (place.address_components) {
                            for (const component of place.address_components) {
                                if (component.types.includes('street_number')) {
                                    placeDetails.streetAddress = `${component.long_name} ${placeDetails.streetAddress}`;
                                }
                                if (component.types.includes('route')) {
                                    placeDetails.streetAddress = `${placeDetails.streetAddress} ${component.long_name}`.trim();
                                }
                                if (component.types.includes('locality') || component.types.includes('postal_town')) {
                                    placeDetails.city = component.long_name;
                                }
                                if (component.types.includes('administrative_area_level_2') && !placeDetails.region) { // Provincia en España
                                    placeDetails.region = component.long_name;
                                }
                                if (component.types.includes('administrative_area_level_1') && !placeDetails.region) { // Comunidad Autónoma en España o Estado
                                    placeDetails.region = component.long_name; // Usar esto si nivel 2 no está o se prefiere
                                }
                                if (component.types.includes('country')) {
                                    placeDetails.country = component.long_name;
                                }
                                if (component.types.includes('postal_code')) {
                                    placeDetails.postalCode = component.long_name;
                                }
                            }
                        }
                        // Si la dirección de la calle no se formó bien, usar la formateada como fallback
                        if (!placeDetails.streetAddress && placeDetails.addressFormatted) {
                            placeDetails.streetAddress = placeDetails.addressFormatted.split(',')[0]; // Intento simple
                        }

                        window.ListopicApp.state.currentSelectedPlaceInfo = placeDetails;
                        console.log("placesService: currentSelectedPlaceInfo actualizado:", window.ListopicApp.state.currentSelectedPlaceInfo);

                        // Actualizar los campos del formulario en review-form.html
                        const establishmentNameInput = document.getElementById('restaurant-name-search-input'); // El input visible
                        const establishmentNameHidden = document.getElementById('establishment-name');     // El oculto
                        const locationDisplayNameInput = document.getElementById('location-display-name');
                        const locationAddressManualInput = document.getElementById('location-address-manual');
                        const locationRegionManualInput = document.getElementById('location-region-manual');
                        const locationGoogleMapsUrlManualInput = document.getElementById('location-google-maps-url-manual');
                        // Campos ocultos
                        const locationLatInput = document.getElementById('location-latitude');
                        const locationLonInput = document.getElementById('location-longitude');
                        const locationPlaceIdInput = document.getElementById('location-googlePlaceId');
                        const locationCityGInput = document.getElementById('location-city-g');
                        const locationPostalCodeGInput = document.getElementById('location-postalCode-g');
                        const locationCountryGInput = document.getElementById('location-country-g');

                        if (establishmentNameInput) establishmentNameInput.value = placeDetails.name;
                        if (establishmentNameHidden) establishmentNameHidden.value = placeDetails.name; // Para la lógica de findOrCreatePlace
                        if (locationDisplayNameInput) locationDisplayNameInput.value = placeDetails.name; // Nombre del lugar para el usuario
                        if (locationAddressManualInput) locationAddressManualInput.value = placeDetails.addressFormatted || placeDetails.streetAddress; // Dirección completa o de calle
                        if (locationRegionManualInput) locationRegionManualInput.value = placeDetails.region; // Región/Provincia
                        if (locationGoogleMapsUrlManualInput) locationGoogleMapsUrlManualInput.value = placeDetails.mapsUrl;
                        
                        if(locationLatInput) locationLatInput.value = placeDetails.latitude || "";
                        if(locationLonInput) locationLonInput.value = placeDetails.longitude || "";
                        if(locationPlaceIdInput) locationPlaceIdInput.value = placeDetails.placeId || "";
                        if(locationCityGInput) locationCityGInput.value = placeDetails.city || "";
                        if(locationPostalCodeGInput) locationPostalCodeGInput.value = placeDetails.postalCode || "";
                        if(locationCountryGInput) locationCountryGInput.value = placeDetails.country || "";
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