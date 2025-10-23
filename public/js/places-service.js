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

        // Requerir usuario autenticado y adjuntar ID token como Authorization Bearer
        const currentUser = ListopicApp.services.auth.currentUser;
        if (!currentUser) {
            throw new Error("Usuario no autenticado. No se puede realizar la llamada a Places.");
        }

        const paramsWithUser = Object.assign({}, params || {}, { userId: (params && params.userId) ? params.userId : currentUser.uid });
        const queryString = new URLSearchParams(paramsWithUser).toString();
        const fullUrl = `${effectiveUrl}?${queryString}`;

        console.log(`[placesService] Calling function '${functionName}' with URL: ${fullUrl}`);

        try {
            const idToken = await currentUser.getIdToken();
            const response = await fetch(fullUrl, {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });
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

    function escapeHtml(text) {
        const uiUtils = window.ListopicApp?.uiUtils;
        if (uiUtils && typeof uiUtils.escapeHtml === 'function') {
            return uiUtils.escapeHtml(String(text ?? ''));
        }
        return String(text ?? '');
    }

    function setStatus(type, message, options) {
        const uiUtils = window.ListopicApp?.uiUtils;
        if (uiUtils && typeof uiUtils.setPlaceSelectionStatus === 'function') {
            uiUtils.setPlaceSelectionStatus(type, message, options);
        }
    }

    function resetPlaceIndicator() {
        const input = document.getElementById('restaurant-name-search-input');
        if (input) {
            delete input.dataset.placeSelected;
            const group = input.closest('.form-group');
            if (group) {
                group.classList.remove('place-found', 'place-status-loading', 'place-status-success', 'place-status-error', 'place-status-info');
            }
        }
    }

    // Obtener detalles completos del lugar
    async function fetchPlaceDetails(placeId) {
        return await callPlaceFunction('getPlaceDetailsFromGoogle', { placeid: placeId });
    }

    // Pintar sugerencias
    async function displayPlaceSuggestions(places, suggestionsBox) {
        suggestionsBox.innerHTML = '';
        suggestionsBox.classList.add('is-visible');
        if (!places || places.length === 0) {
            suggestionsBox.innerHTML = '<p><i class="fas fa-circle-info"></i> No se encontraron lugares que coincidan.</p>';
            setStatus('info', 'No encontramos resultados con esos datos.');
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'suggestions-list';
        places.forEach(place => {
            const li = document.createElement('li');
            li.className = 'suggestion-item';
            const addressInfo = place.vicinity || place.formatted_address || 'Dirección no disponible';
            const safeName = escapeHtml(place.name || 'Lugar sin nombre');
            const safeAddress = escapeHtml(addressInfo);
            li.innerHTML = `
                <div class="suggestion-item__text">
                    <span class="suggestion-item__title">${safeName}</span>
                    <span class="suggestion-item__subtitle">${safeAddress}</span>
                </div>
                <span class="suggestion-item__icon"><i class="fas fa-circle-plus" aria-hidden="true"></i></span>
            `;

            li.onclick = async () => {
                const currentUser = ListopicApp.services.auth.currentUser;
                if (!currentUser) {
                    console.error("Usuario no autenticado, no se pueden obtener detalles del lugar.");
                    suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">Error: Debes estar conectado para ver los detalles.</p>`;
                    return;
                }

                const loadingName = escapeHtml(place.name || 'Lugar');
                suggestionsBox.innerHTML = `<p><span class="loading-pill"><i class="fas fa-spinner fa-spin"></i> Obteniendo detalles de "${loadingName}"...</span></p>`;
                suggestionsBox.classList.add('is-visible');
                setStatus('loading', 'Cargando detalles del lugar...', { highlight: place.name || '' });

                try {
                    const detailedPlace = await fetchPlaceDetails(place.place_id);

                    if (detailedPlace && window.ListopicApp.uiUtils && window.ListopicApp.uiUtils.updateReviewFormWithPlace) {
                        window.ListopicApp.uiUtils.updateReviewFormWithPlace(detailedPlace);
                    } else {
                        console.error("No se pudieron obtener detalles o la función uiUtils.updateReviewFormWithPlace no está definida.");
                        suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">No se pudieron obtener los detalles completos.</p>`;
                        setStatus('error', 'No se pudieron obtener los detalles del lugar.');
                    }
                } catch (error) {
                    console.error("Error final al obtener detalles del lugar:", error);
                    suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">${escapeHtml(error.message)}</p>`;
                    setStatus('error', error.message);
                } finally {
                   setTimeout(() => {
                       suggestionsBox.innerHTML = '';
                       suggestionsBox.classList.remove('is-visible');
                   }, 2000);
                }
            };
            ul.appendChild(li);
        });
        suggestionsBox.appendChild(ul);
        setStatus('info', 'Selecciona un resultado para completar los datos.');
    }

    // Buscar cercanos con geolocalización del usuario y categoría de la lista
    async function fetchNearbyRestaurantsWithContext() {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;

        resetPlaceIndicator();

        const state = window.ListopicApp.state || {};
        suggestionsBox.innerHTML = '<p><span class="loading-pill"><i class="fas fa-location-crosshairs"></i> Obteniendo tu ubicación...</span></p>';
        suggestionsBox.classList.add('is-visible');
        setStatus('loading', 'Obteniendo tu ubicación actual...');

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
            suggestionsBox.innerHTML = `<p style=\"color:var(--danger-color);\">No se pudo obtener la ubicación: ${escapeHtml(error.message)}.</p>`;
            setStatus('error', `No se pudo obtener la ubicación: ${error.message}`);
            return;
        }

        suggestionsBox.innerHTML = `<p><span class="loading-pill"><i class="fas fa-spinner fa-spin"></i> Buscando lugares cercanos...</span></p>`;
        setStatus('loading', 'Buscando lugares cercanos a ti...');
        const listId = state.currentListId;
        if (!listId) {
            suggestionsBox.innerHTML = '<p style="color:var(--danger-color);">Error: No se pudo identificar la lista actual.</p>';
            setStatus('error', 'No se pudo identificar la lista actual.');
            return;
        }

        let categoryId = typeof state.currentListCategoryId === 'string' ? state.currentListCategoryId : null;
        let categoryTypes = Array.isArray(state.currentListCategoryGoogleTypes)
            ? state.currentListCategoryGoogleTypes.filter(type => typeof type === 'string' && type.trim())
            : [];

        if (!categoryId) {
            try {
                const listDoc = await ListopicApp.services.db.collection('lists').doc(listId).get();
                if (listDoc.exists) {
                    const listData = listDoc.data() || {};
                    if (typeof listData.categoryId === 'string') {
                        categoryId = listData.categoryId;
                        state.currentListCategoryId = categoryId;
                    }
                    const listCategoryTypes = Array.isArray(listData.categoryGooglePlaceTypes)
                        ? listData.categoryGooglePlaceTypes
                        : Array.isArray(listData.categoryGoogleTypes)
                            ? listData.categoryGoogleTypes
                            : null;
                    const singleType = typeof listData.categoryGooglePlaceType === 'string'
                        ? listData.categoryGooglePlaceType
                        : null;
                    const sanitizedTypes = Array.isArray(listCategoryTypes)
                        ? listCategoryTypes.filter(type => typeof type === 'string' && type.trim())
                        : [];
                    if (sanitizedTypes.length) {
                        categoryTypes = sanitizedTypes;
                        state.currentListCategoryGoogleTypes = sanitizedTypes;
                    } else if (singleType && singleType.trim()) {
                        categoryTypes = [singleType.trim()];
                        state.currentListCategoryGoogleTypes = categoryTypes;
                    }
                }
            } catch (error) {
                suggestionsBox.innerHTML = '<p style="color:var(--danger-color);">Error al cargar datos de la lista.</p>';
                setStatus('error', 'Error al cargar datos de la lista.');
                return;
            }
        }

        if (!categoryId) {
            suggestionsBox.innerHTML = '<p style="color:var(--warning-color);">Esta lista no tiene una categoría para la búsqueda.</p>';
            setStatus('info', 'Esta lista no tiene categoría para buscar lugares cercanos.');
            return;
        }

        try {
            const params = {
                latitude: state.userLatitude,
                longitude: state.userLongitude,
                categoryId: categoryId
            };
            if (categoryTypes.length) {
                params.categoryTypes = categoryTypes.join(',');
            }
            const places = await callPlaceFunction('placesNearbyRestaurants', params);
            displayPlaceSuggestions(places, suggestionsBox);
        } catch (error) {
            suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">${escapeHtml(error.message)}</p>`;
            setStatus('error', error.message);
        }
    }

    // Búsqueda por nombre + ubicación si disponible
    async function searchRestaurantsByName(query) {
        const suggestionsBox = document.getElementById('restaurant-suggestions');
        if (!suggestionsBox) return;
        resetPlaceIndicator();
        const trimmedQuery = query ? query.trim() : '';
        if (!query || query.trim() === "") {
            suggestionsBox.innerHTML = '';
            suggestionsBox.classList.remove('is-visible');
            setStatus('info', 'Introduce un nombre para buscar.');
            return;
        }
        const safeQuery = escapeHtml(trimmedQuery);
        suggestionsBox.innerHTML = `<p><span class="loading-pill"><i class="fas fa-spinner fa-spin"></i> Buscando "${safeQuery}"...</span></p>`;
        suggestionsBox.classList.add('is-visible');
        setStatus('loading', `Buscando lugares llamados ${trimmedQuery}...`, { highlight: trimmedQuery });

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

        if (typeof state.currentListCategoryId === 'string' && state.currentListCategoryId) {
            params.categoryId = state.currentListCategoryId;
        }
        const categoryTypes = Array.isArray(state.currentListCategoryGoogleTypes)
            ? state.currentListCategoryGoogleTypes.filter(type => typeof type === 'string' && type.trim())
            : [];
        if (categoryTypes.length) {
            params.categoryTypes = categoryTypes.join(',');
        }

        try {
            const places = await callPlaceFunction('placesTextSearch', params);
            displayPlaceSuggestions(places, suggestionsBox);
        } catch (error) {
            suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">${escapeHtml(error.message)}</p>`;
            setStatus('error', error.message);
        }
    }

    return {
        fetchNearbyRestaurantsWithContext,
        searchRestaurantsByName
    };
})();

// Compatibilidad: exponer alias global esperado por page-review-form.js
try {
    window.placesService = window.ListopicApp && ListopicApp.placesService;
} catch (_) {}
