window.ListopicApp = window.ListopicApp || {};

ListopicApp.placesService = (() => {

    async function fetchAndCachePlaceDetails(placeId) {
        try {
            // Preparamos la llamada a la función callable
            const functions = firebase.functions();
            const getDetails = functions.httpsCallable('getAndCachePlaceDetails');
            
            ListopicApp.services.showNotification('Obteniendo detalles del lugar...', 'info');

            const result = await getDetails({ placeId: placeId });
            
            if (result.data.place) {
                ListopicApp.services.showNotification('¡Detalles cargados!', 'success');
                return result.data.place; // Devolvemos el objeto completo del lugar
            } else {
                throw new Error("La función no devolvió datos del lugar.");
            }
        } catch (error) {
            console.error("Error en fetchAndCachePlaceDetails:", error);
            ListopicApp.services.showNotification(`Error al obtener detalles: ${error.message}`, 'error');
            return null;
        }
    }


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
                // --- ¡CAMBIO IMPORTANTE AQUÍ! ---
                li.onclick = async () => {
                    // 1. Damos feedback al usuario de que algo está pasando.
                    suggestionsBox.innerHTML = '<p>Obteniendo detalles completos...</p>';
                
                    const basicPlaceId = place.place_id;
                    if (!basicPlaceId) {
                        ListopicApp.services.showNotification("Este lugar no tiene un ID de Google válido.", "error");
                        suggestionsBox.innerHTML = ''; // Limpiamos
                        return;
                    }
                
                    // 2. Llamamos a nuestra función que contacta con el backend.
                    // La respuesta (si todo va bien) es el objeto completo y enriquecido del lugar.
                    const detailedPlace = await fetchAndCachePlaceDetails(basicPlaceId);
                
                    if (!detailedPlace) {
                        suggestionsBox.innerHTML = '<p style="color:var(--danger-color);">No se pudieron cargar los detalles del lugar.</p>';
                        return;
                    }
                    
                    // 3. ¡LA PARTE CLAVE! Usamos el objeto "detailedPlace" para rellenar el formulario.
                    if (window.ListopicApp && window.ListopicApp.state) {
                        // Guardamos el objeto completo en el estado global de la app
                        window.ListopicApp.state.currentSelectedPlaceInfo = detailedPlace;
                        console.log("placesService: currentSelectedPlaceInfo actualizado:", detailedPlace);
                
                        // --- REFERENCIAS A LOS CAMPOS DEL FORMULARIO (review-form.html) ---
                
                        // Campos visibles
                        const establishmentNameInput = document.getElementById('restaurant-name-search-input');
                        const locationAddressManualInput = document.getElementById('location-address-manual');
                        const locationRegionManualInput = document.getElementById('location-region-manual');
                        const locationGoogleMapsUrlManualInput = document.getElementById('location-google-maps-url-manual');
                
                        // Campos ocultos para datos básicos
                        const locationPlaceIdInput = document.getElementById('location-googlePlaceId');
                        const locationLatInput = document.getElementById('location-latitude');
                        const locationLonInput = document.getElementById('location-longitude');
                        const locationCityInput = document.getElementById('location-city');
                        const locationPostalCodeInput = document.getElementById('location-postalCode');
                        
                        // Campos ocultos para los NUEVOS datos enriquecidos
                        const locationPriceLevelInput = document.getElementById('location-priceLevel');
                        const locationGoogleRatingInput = document.getElementById('location-googleRating');
                        const locationTypesInput = document.getElementById('location-types');
                
                        // --- RELLENAR LOS CAMPOS USANDO "detailedPlace" ---
                
                        if (establishmentNameInput) establishmentNameInput.value = detailedPlace.name || '';
                        if (locationAddressManualInput) locationAddressManualInput.value = detailedPlace.addressFormatted || '';
                        if (locationRegionManualInput) locationRegionManualInput.value = detailedPlace.region || '';
                        if (locationGoogleMapsUrlManualInput && detailedPlace.googlePlaceId) {
                            locationGoogleMapsUrlManualInput.value = `https://www.google.com/maps/search/?api=1&query_place_id=CHJ...1`;
                        }
                        
                        // Rellenar campos ocultos
                        if (locationPlaceIdInput) locationPlaceIdInput.value = detailedPlace.googlePlaceId || '';
                        if (locationLatInput) locationLatInput.value = detailedPlace.location?.latitude || '';
                        if (locationLonInput) locationLonInput.value = detailedPlace.location?.longitude || '';
                        if (locationCityInput) locationCityInput.value = detailedPlace.city || '';
                        if (locationPostalCodeInput) locationPostalCodeInput.value = detailedPlace.postalCode || '';
                        
                        // Rellenar NUEVOS campos ocultos
                        if (locationPriceLevelInput) locationPriceLevelInput.value = detailedPlace.priceLevel ?? ''; // '??' maneja bien el valor 0
                        if (locationGoogleRatingInput) locationGoogleRatingInput.value = detailedPlace.googleRating || '';
                        if (locationTypesInput && detailedPlace.types) {
                            // Guardamos el array de tipos como un string JSON
                            locationTypesInput.value = JSON.stringify(detailedPlace.types);
                        }
                
                        // 4. Limpiamos y ocultamos la caja de sugerencias. ¡Misión cumplida!
                        suggestionsBox.innerHTML = '';
                        suggestionsBox.style.display = 'none';
                
                    } else {
                        console.warn("ListopicApp.state no está definido. No se pudo actualizar el estado.");
                    }
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

        // let searchKeywords = "";
        // if (currentListNameForSearch) {
        //     const baseKeywordsForHmm = "restaurante bar pub comida";
        //     searchKeywords = `${currentListNameForSearch.toLowerCase()} ${baseKeywordsForHmm}`;
        //     searchKeywords = [...new Set(searchKeywords.split(' '))].join(' ');
        // }

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