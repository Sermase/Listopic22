window.ListopicApp = window.ListopicApp || {};

ListopicApp.placesService = (() => {
    async function fetchPlaceDetails(placeId) {
        const functionUrl = ListopicApp.config.FUNCTION_URLS.getPlaceDetailsFromGoogle;
        if (!functionUrl || functionUrl.includes("xxxxxxxxxx")) {
            console.error("URL de la función getPlaceDetailsFromGoogle no configurada o es un placeholder.");
            ListopicApp.services.showNotification("Error de configuración: URL de servicio no disponible.", 'error');
            return null;
        }

        const fetchUrl = `${functionUrl}?placeid=${placeId}`;
        console.log('[placesService] Fetching Place Details URL:', fetchUrl);

        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Error HTTP ${response.status}: ${response.statusText}` }));
                throw new Error(errorData.message);
            }
            return await response.json();
        } catch (error) {
            console.error("Error fetching place details:", error);
            ListopicApp.services.showNotification(`Error al obtener detalles del lugar: ${error.message}`, 'error');
            return null;
        }
    }

    function displayPlaceSuggestions(places, suggestionsBox) {
        suggestionsBox.innerHTML = '';

        if (places && places.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'suggestions-list';
            places.forEach(place => {
                const li = document.createElement('li');
                const addressInfo = place.vicinity || place.formatted_address || 'Información de dirección no disponible';
                li.textContent = `${place.name} (${addressInfo})`;
                li.style.cursor = 'pointer';
                li.onclick = async () => {
                    suggestionsBox.innerHTML = `<p>Obteniendo detalles de ${place.name}...</p>`;
                    const detailedPlace = await fetchPlaceDetails(place.place_id);
                    if (!detailedPlace) {
                        suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">No se pudieron obtener los detalles. Inténtalo de nuevo.</p>`;
                        return;
                    }

                    if (window.ListopicApp && window.ListopicApp.state) {
                        const placeDetails = {
                            placeId: detailedPlace.place_id,
                            name: detailedPlace.name,
                            addressFormatted: detailedPlace.formatted_address || detailedPlace.vicinity,
                            latitude: detailedPlace.geometry?.location?.lat || null,
                            longitude: detailedPlace.geometry?.location?.lng || null,
                            mapsUrl: detailedPlace.url,
                            googleMapsUrl: detailedPlace.url,
                            priceLevel: detailedPlace.price_level,
                            photos: detailedPlace.photos, // Array of photo objects
                            website: detailedPlace.website,
                            phone: detailedPlace.international_phone_number,

                            // Inicializar componentes de dirección
                            streetAddress: '',
                            city: '',
                            postalCode: '',
                            region: '', // Para provincia/estado
                            country: ''
                        };

                        if (detailedPlace.address_components) {
                            for (const component of detailedPlace.address_components) {
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
                                    placeDetails.region = component.long_name;
                                }
                                if (component.types.includes('country')) {
                                    placeDetails.country = component.long_name;
                                }
                                if (component.types.includes('postal_code')) {
                                    placeDetails.postalCode = component.long_name;
                                }
                            }
                        }
                        if (!placeDetails.streetAddress && placeDetails.addressFormatted) {
                            placeDetails.streetAddress = placeDetails.addressFormatted.split(',')[0];
                        }

                        window.ListopicApp.state.currentSelectedPlaceInfo = placeDetails;
                        console.log("placesService: currentSelectedPlaceInfo actualizado con detalles completos:", window.ListopicApp.state.currentSelectedPlaceInfo);

                        // Actualizar los campos del formulario en review-form.html
                        const establishmentNameInput = document.getElementById('restaurant-name-search-input');
                        const establishmentNameHidden = document.getElementById('establishment-name');
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
                        if (establishmentNameHidden) establishmentNameHidden.value = placeDetails.name;
                        if (locationDisplayNameInput) locationDisplayNameInput.value = placeDetails.name;
                        if (locationAddressManualInput) locationAddressManualInput.value = placeDetails.addressFormatted || placeDetails.streetAddress;
                        if (locationRegionManualInput) locationRegionManualInput.value = placeDetails.region;
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
        if (!functionUrl || functionUrl.includes("xxxxxxxxxx")) {
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
        if (!functionUrl || functionUrl.includes("xxxxxxxxxx")) {
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
        fetchPlaceDetails,
        fetchNearbyRestaurantsWithContext,
        searchRestaurantsByName
    };
})();