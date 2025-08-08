window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageReviewForm = (() => {
    // En page-review-form.js

async function findOrCreatePlace(placeDataFromGoogle, manualPlaceData, currentUserId) {
    const db = ListopicApp.services.db;
    const placesRef = db.collection('places');

    console.log('findOrCreatePlace llamada con:', {
        hasGoogleData: !!placeDataFromGoogle,
        hasManualData: !!manualPlaceData,
        googlePlaceId: placeDataFromGoogle?.placeId,
        manualName: manualPlaceData?.name
    });

    // --- 1. Buscar por el ID de Google Place (el más fiable) ---
    if (placeDataFromGoogle && placeDataFromGoogle.placeId) {
        console.log(`Buscando lugar por Google Place ID: ${placeDataFromGoogle.placeId}`);
        const querySnapshot = await placesRef.where('googlePlaceId', '==', placeDataFromGoogle.placeId).limit(1).get();

        if (!querySnapshot.empty) {
            const existingPlaceDoc = querySnapshot.docs[0];
            const existingData = existingPlaceDoc.data();
            console.log(`Lugar encontrado por Google Place ID. ID existente: ${existingPlaceDoc.id}`);

            // ACTUALIZAR el lugar existente con datos frescos de Google
            const updatedData = buildGooglePlaceData(placeDataFromGoogle, currentUserId, false);
            // Mantener algunos campos del lugar existente
            updatedData.createdByUserId = existingData.createdByUserId;
            updatedData.createdAt = existingData.createdAt;
            updatedData.reviewsCount = existingData.reviewsCount || 0;
            updatedData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

            await existingPlaceDoc.ref.update(updatedData);
            console.log(`Lugar actualizado con datos frescos de Google: ${existingPlaceDoc.id}`);

            return existingPlaceDoc.id;
        }
    }

    // --- 2. Si no se encuentra, buscar por coincidencia de Nombre y Dirección ---
    const searchName = (placeDataFromGoogle?.name) || (manualPlaceData?.name);
    const searchAddress = (placeDataFromGoogle?.addressFormatted) || (manualPlaceData?.address);

    if (searchName && searchAddress) {
        console.log(`Buscando lugar por Nombre: "${searchName}" y Dirección: "${searchAddress}"`);
        const querySnapshot = await placesRef
                                .where('name_normalized', '==', searchName.toLowerCase())
                                .where('address_normalized', '==', searchAddress.toLowerCase())
                                .limit(1).get();

        if (!querySnapshot.empty) {
            const existingPlaceDoc = querySnapshot.docs[0];
            const existingData = existingPlaceDoc.data();
            console.log(`Lugar encontrado por Nombre y Dirección. ID existente: ${existingPlaceDoc.id}`);

            // Si encontramos un lugar manual y ahora tenemos datos de Google, actualizarlo
            if (placeDataFromGoogle?.placeId && !existingData.googlePlaceId) {
                console.log(`Actualizando lugar manual con datos completos de Google`);
                const updatedData = buildGooglePlaceData(placeDataFromGoogle, currentUserId, false);
                // Mantener algunos campos del lugar existente
                updatedData.createdByUserId = existingData.createdByUserId;
                updatedData.createdAt = existingData.createdAt;
                updatedData.reviewsCount = existingData.reviewsCount || 0;
                updatedData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

                await existingPlaceDoc.ref.update(updatedData);
                console.log(`Lugar manual actualizado con datos de Google: ${existingPlaceDoc.id}`);
            } else if (placeDataFromGoogle && existingData.googlePlaceId) {
                // Actualizar con datos frescos de Google
                const updatedData = buildGooglePlaceData(placeDataFromGoogle, currentUserId, false);
                updatedData.createdByUserId = existingData.createdByUserId;
                updatedData.createdAt = existingData.createdAt;
                updatedData.reviewsCount = existingData.reviewsCount || 0;
                updatedData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

                await existingPlaceDoc.ref.update(updatedData);
                console.log(`Lugar actualizado con datos frescos: ${existingPlaceDoc.id}`);
            }

            return existingPlaceDoc.id;
        }
    }

    // --- 3. Si no se encuentra de ninguna forma, CREAR un nuevo lugar ---
    console.log("No se encontró ningún lugar existente. Creando uno nuevo...");

    let dataToSave;
    if (placeDataFromGoogle) {
        dataToSave = buildGooglePlaceData(placeDataFromGoogle, currentUserId, true);
    } else if (manualPlaceData) {
        dataToSave = buildManualPlaceData(manualPlaceData, currentUserId);
    } else {
        throw new Error("No hay suficientes datos para crear un nuevo lugar.");
    }

    const newPlaceRef = await placesRef.add(dataToSave);
    console.log(`Nuevo lugar creado con ID: ${newPlaceRef.id}`);
    return newPlaceRef.id;
}

// Función auxiliar para construir datos de lugar desde Google
function buildGooglePlaceData(placeData, userId, isNew = true) {
    const data = {
        // Datos básicos
        name: placeData.name || "Establecimiento Desconocido",
        name_normalized: (placeData.name || "").toLowerCase(),
        address: placeData.addressFormatted || null,
        address_normalized: (placeData.addressFormatted || "").toLowerCase(),

        // Coordenadas (estructura consistente)
        coordinates: placeData.latitude && placeData.longitude
            ? new firebase.firestore.GeoPoint(placeData.latitude, placeData.longitude)
            : null,
        location: placeData.latitude && placeData.longitude ? {
            latitude: placeData.latitude,
            longitude: placeData.longitude
        } : null,

        // Datos de Google Places
        googlePlaceId: placeData.placeId || null,
        googleRating: placeData.rating || 0,
        googleUserRatingsTotal: placeData.user_ratings_total || 0,
        googleUrl: placeData.url || null,
        googleMapsUrl: placeData.googleMapsUrl || null,

        // Información de contacto
        phone: placeData.formatted_phone_number || placeData.international_phone_number || null,
        website: placeData.website || null,

        // Información del negocio
        types: placeData.types || [],
        priceLevel: placeData.price_level !== undefined ? placeData.price_level : null,
        businessStatus: placeData.business_status || null,
        permanentlyClosed: placeData.permanently_closed || false,

        // Horarios
        openingHours: placeData.opening_hours ? {
            open_now: placeData.opening_hours.open_now || false,
            weekday_text: placeData.opening_hours.weekday_text || []
        } : null,

        // Información geográfica detallada
        city: placeData.city || null,
        region: placeData.region || placeData.state || null,
        province: placeData.province || null,
        country: placeData.country || null,
        postalCode: placeData.postalCode || null,
        streetNumber: placeData.streetNumber || null,
        route: placeData.route || null,

        // URLs de imágenes
        mainImageUrl: null, // Se procesará después si hay fotos
        imageUrls: [],

        // Información de geometría completa
        geometry: placeData.geometry || (placeData.latitude && placeData.longitude ? {
            location: {
                lat: placeData.latitude,
                lng: placeData.longitude
            },
            viewport: placeData.viewport || null
        } : null),

        // Otros datos útiles
        utcOffset: placeData.utc_offset || null
    };

    // Procesar fotos si existen
    if (placeData.photos && placeData.photos.length > 0) {
        try {
            data.mainImageUrl = placeData.photos[0].getUrl({ maxWidth: 800, maxHeight: 600 });
            data.imageUrls = placeData.photos.slice(0, 5).map(photo =>
                photo.getUrl({ maxWidth: 800, maxHeight: 600 })
            );
        } catch (error) {
            console.warn('Error procesando fotos del lugar:', error);
        }
    }

    // Campos de auditoría
    if (isNew) {
        data.createdByUserId = userId;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        data.reviewsCount = 0;
    }
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    return data;
}

// Función auxiliar para construir datos de lugar manual
function buildManualPlaceData(placeData, userId) {
    return {
        // Datos básicos
        name: placeData.name,
        name_normalized: (placeData.name || "").toLowerCase(),
        address: placeData.address || null,
        address_normalized: (placeData.address || "").toLowerCase(),

        // Coordenadas (estructura consistente)
        location: placeData.latitude && placeData.longitude
            ? new firebase.firestore.GeoPoint(placeData.latitude, placeData.longitude)
            : null,
        coordinates: placeData.latitude && placeData.longitude ? {
            lat: placeData.latitude,
            lng: placeData.longitude
        } : null,

        // Información geográfica
        city: placeData.city || null,
        region: placeData.region || null,
        country: placeData.country || null,
        postalCode: placeData.postalCode || null,

        // URLs
        googleMapsUrl: placeData.googleMapsUrl || null,
        website: placeData.website || null,
        phone: placeData.phone || null,

        // Información de geometría
        geometry: placeData.latitude && placeData.longitude ? {
            location: {
                lat: placeData.latitude,
                lng: placeData.longitude
            }
        } : null,

        // Campos de auditoría
        createdByUserId: userId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewsCount: 0,

        // Indicar que es manual
        isManualEntry: true
    };
}

// NUEVA FUNCIÓN para renderizar las etiquetas
function renderTags(availableTags = [], selectedTags = [], fixedTags = []) {
    const container = document.getElementById('dynamic-tag-selection');
    if (!container) return;
    container.innerHTML = '';
    
    const createTagCheckbox = (tag, isFixed) => {
        const label = document.createElement('label');
        label.className = 'tag-checkbox';
        if (isFixed || selectedTags.includes(tag)) {
            label.classList.add('selected');
        }
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'tags';
        input.value = tag;
        input.checked = isFixed || selectedTags.includes(tag);
        input.disabled = isFixed;
        if(isFixed) {
            label.title = "Etiqueta fija de la categoría";
        }
        input.addEventListener('change', () => label.classList.toggle('selected', input.checked));
        label.appendChild(input);
        label.appendChild(document.createTextNode(` ${tag}`));
        return label;
    };

    if (fixedTags.length > 0) {
        const fixedContainer = document.createElement('div');
        fixedContainer.className = 'fixed-tags-container';
        fixedContainer.innerHTML = '<h5>Etiquetas Fijas:</h5>';
        fixedTags.forEach(tag => fixedContainer.appendChild(createTagCheckbox(tag, true)));
        container.appendChild(fixedContainer);
    }

    const userTags = availableTags.filter(tag => !fixedTags.includes(tag));
    if (userTags.length > 0) {
        const userContainer = document.createElement('div');
        userContainer.className = 'user-tags-container';
        userContainer.innerHTML = '<h5>Otras Etiquetas:</h5>';
        userTags.forEach(tag => userContainer.appendChild(createTagCheckbox(tag, false)));
        container.appendChild(userContainer);
    }

    if (fixedTags.length === 0 && userTags.length === 0) {
        container.innerHTML = '<p>No hay etiquetas disponibles para esta lista.</p>';
    }
}

    function init() {
        console.log('Initializing Review Form page logic with actual code...');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        const storage = ListopicApp.services.storage;
        const uiUtils = ListopicApp.uiUtils;
        const placesService = ListopicApp.placesService;
        const state = ListopicApp.state;
        const urlParams = new URLSearchParams(window.location.search);
        const listId = urlParams.get('listId');
        const reviewIdToEdit = urlParams.get('editReviewId');

        const reviewForm = document.getElementById('review-form');
        
        if (reviewForm) { // <-- INICIO DEL BLOQUE if (reviewForm)
            const urlParams = new URLSearchParams(window.location.search);
            const reviewIdToEdit = urlParams.get('editId');
            const listId = urlParams.get('listId');
            state.currentListId = listId; 

            const hiddenListIdInput = document.getElementById('review-form-listId');
            const criteriaContainer = document.getElementById('dynamic-rating-criteria');
            if (criteriaContainer) {
                criteriaContainer.addEventListener('input', (event) => {
                    if (event.target.classList.contains('rating-slider')) {
                        const valueDisplay = event.target.previousElementSibling.querySelector('.slider-value-display');
                        if (valueDisplay) {
                            valueDisplay.textContent = parseFloat(event.target.value).toFixed(1);
    
                            // --- ¡AQUÍ ESTÁ LA MAGIA! ---
                            // Quitamos el foco para evitar el auto-scroll en móviles.
                            if (document.activeElement) {
                                document.activeElement.blur();
                            }
                        }
                    }
                });
            }
    
            const formTitle = reviewForm.parentElement.querySelector('h2');
            const dynamicTagContainer = document.getElementById('dynamic-tag-selection');
            const imagePreviewContainerReview = reviewForm.querySelector('.image-preview'); // Ahora dentro del if
            const photoUrlInputReview = document.getElementById('photo-url');
            const photoFileInputReview = document.getElementById('photo-file');
            const backButtonReview = reviewForm.parentElement.querySelector('a.back-button');
            
            const establishmentNameSearchInput = document.getElementById('restaurant-name-search-input');
            const establishmentNameHiddenInput = document.getElementById('establishment-name'); 
            const itemNameInput = document.getElementById('item-name'); 

            // Botón y contenedor para campos de ubicación manual
            const toggleManualLocationBtn = document.getElementById('toggle-manual-location-btn');
            const manualLocationFieldsDiv = document.getElementById('manual-location-fields');
            const getCurrentAddressBtn = document.getElementById('get-current-address-btn'); // NUEVO BOTÓN
            const locationAddressManualInput = document.getElementById('location-address-manual'); // Input de dirección manual
            const locationRegionManualInput = document.getElementById('location-region-manual'); // Input de región manual (para autocompletar)
            // ... otros inputs de ubicación si quieres autocompletarlos (ciudad, código postal)

            // LOGS DE DEPURACIÓN:
            if (!toggleManualLocationBtn) {
                console.error("page-review-form.js: Botón #toggle-manual-location-btn NO ENCONTRADO.");
            } else {
                console.log("page-review-form.js: Botón #toggle-manual-location-btn ENCONTRADO.", toggleManualLocationBtn);
            }

            if (!manualLocationFieldsDiv) {
                console.error("page-review-form.js: Div #manual-location-fields NO ENCONTRADO.");
            } else {
                console.log("page-review-form.js: Div #manual-location-fields ENCONTRADO.", manualLocationFieldsDiv);
            }

            if (toggleManualLocationBtn && manualLocationFieldsDiv) {
                toggleManualLocationBtn.addEventListener('click', () => {
                    // LOG DE DEPURACIÓN AL HACER CLIC:
                    console.log("page-review-form.js: Botón toggleManualLocationBtn clickeado.");
                    const isHidden = manualLocationFieldsDiv.style.display === 'none';
                    manualLocationFieldsDiv.style.display = isHidden ? 'block' : 'none';
                    toggleManualLocationBtn.innerHTML = isHidden ?
                        '<i class="fas fa-chevron-up"></i> Ocultar Detalles de Ubicación Manual' :
                        '<i class="fas fa-chevron-down"></i> Añadir/Editar Detalles de Ubicación Manualmente';
                });
            }

            // LÓGICA PARA EL NUEVO BOTÓN DE OBTENER DIRECCIÓN
            if (getCurrentAddressBtn && locationAddressManualInput) {
                getCurrentAddressBtn.addEventListener('click', async () => {
                    if (!navigator.geolocation) {
                        ListopicApp.services.showNotification("La geolocalización no es soportada por este navegador.", "warn");
                        return;
                    }

                    getCurrentAddressBtn.disabled = true;
                    getCurrentAddressBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Feedback visual

                    try {
                        const position = await new Promise((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
                        });

                        const { latitude, longitude } = position.coords;
                        console.log("Geolocalización obtenida:", latitude, longitude);

                        // Llamar a la Cloud Function para geocodificación inversa
                        const functionUrl = ListopicApp.config.FUNCTION_URLS.reverseGeocode; // Necesitaremos añadir esto a config.js
                        if (!functionUrl || functionUrl.includes("xxxxxxxxxx")) {
                            throw new Error("URL de la función reverseGeocode no configurada.");
                        }

                        const response = await fetch(`${functionUrl}?lat=${latitude}&lon=${longitude}`);
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ message: `Error HTTP ${response.status}`}));
                            throw new Error(errorData.message || `Error ${response.status} del servicio de geocodificación.`);
                        }

                        const data = await response.json();
                        if (data.address) {
                            locationAddressManualInput.value = data.address; // Dirección formateada completa
                            if (data.region && locationRegionManualInput) {
                                locationRegionManualInput.value = data.region;
                            }
                            ListopicApp.services.showNotification("Dirección obtenida.", "success");
                        } else {
                            throw new Error("No se pudo obtener una dirección para la ubicación.");
                        }

                    } catch (error) {
                        console.error("Error obteniendo dirección actual:", error);
                        ListopicApp.services.showNotification(`Error al obtener dirección: ${error.message}`, "error");
                    } finally {
                        getCurrentAddressBtn.disabled = false;
                        getCurrentAddressBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
                    }
                });
            }

            if (backButtonReview && listId) {
                const fromGrouped = urlParams.get('fromGrouped');
                const fromEstablishment = urlParams.get('fromEstablishment');
                const fromItem = urlParams.get('fromItem');
                if (fromGrouped === 'true' && fromEstablishment) {
                    backButtonReview.href = `grouped-detail-view.html?listId=${listId}&establishment=${fromEstablishment}&item=${fromItem || ''}`;
                } else {
                    backButtonReview.href = `list-view.html?listId=${listId}`;
                }
            }
            if (hiddenListIdInput && listId) {
                hiddenListIdInput.value = listId;
            } else if (!listId) {
                console.error("REVIEW-FORM: listId no encontrado en la URL.");
                if (formTitle) formTitle.textContent = "Error: Falta ID de lista";
                ListopicApp.services.showNotification("Error: Falta el ID de la lista en la URL.", "error");
                return; // Salir si no hay listId
            }

            // Lógica de carga de imágenes y geolocalización MOVIDA AQUÍ DENTRO
            const imageDropArea = document.getElementById('image-drop-area');
            const browseGalleryBtn = document.getElementById('browse-gallery-btn');
            const useCameraBtn = document.getElementById('use-camera-btn');

            if (imageDropArea && photoFileInputReview && imagePreviewContainerReview) {
                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                    imageDropArea.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
                });
                ['dragenter', 'dragover'].forEach(eventName => {
                    imageDropArea.addEventListener(eventName, () => imageDropArea.classList.add('drag-over'), false);
                });
                ['dragleave', 'drop'].forEach(eventName => {
                    imageDropArea.addEventListener(eventName, () => imageDropArea.classList.remove('drag-over'), false);
                });
                imageDropArea.addEventListener('drop', (e) => {
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        state.selectedFileForUpload = files[0]; 
                        if(photoUrlInputReview) photoUrlInputReview.value = '';
                        const reader = new FileReader();
                        reader.onload = (event) => uiUtils.showPreviewGlobal(event.target.result, imagePreviewContainerReview);
                        reader.readAsDataURL(state.selectedFileForUpload);
                    }
                });
                imageDropArea.addEventListener('click', () => photoFileInputReview.click());
                
                photoFileInputReview.addEventListener('change', function () {
                    if (this.files && this.files[0]) {
                        state.selectedFileForUpload = this.files[0];
                        if(photoUrlInputReview) photoUrlInputReview.value = '';
                        const reader = new FileReader();
                        reader.onload = (event) => uiUtils.showPreviewGlobal(event.target.result, imagePreviewContainerReview);
                        reader.readAsDataURL(state.selectedFileForUpload);
                    }
                    this.value = null; 
                });
            }

            if (browseGalleryBtn && photoFileInputReview) {
                browseGalleryBtn.addEventListener('click', () => {
                    photoFileInputReview.removeAttribute('capture'); photoFileInputReview.click();
                    this.value = null; 
                });
            }
            if (useCameraBtn && photoFileInputReview) {
                useCameraBtn.addEventListener('click', () => {
                    photoFileInputReview.setAttribute('capture', 'environment'); photoFileInputReview.click();
                });
            }
            if (photoUrlInputReview && imagePreviewContainerReview) {
                photoUrlInputReview.addEventListener('input', function () {
                    if (this.value) {
                        uiUtils.showPreviewGlobal(this.value, imagePreviewContainerReview);
                        state.selectedFileForUpload = null; 
                        if (photoFileInputReview) photoFileInputReview.value = null;
                    } else {
                        if (!state.selectedFileForUpload) { 
                            uiUtils.clearPreviewGlobal(imagePreviewContainerReview);
                        }
                    }
                });
            }

            const findNearbyBtn = document.getElementById('find-nearby-btn');
            const searchByNameBtn = document.getElementById('search-by-name-btn');
            // establishmentNameSearchInput ya está definido arriba

            if (findNearbyBtn) {
                findNearbyBtn.addEventListener('click', () => {
                    if (navigator.geolocation) {
                        const suggestionsBox = document.getElementById('restaurant-suggestions');
                        if (suggestionsBox) suggestionsBox.innerHTML = '<p>Obteniendo tu ubicación...</p>';
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                state.userLatitude = position.coords.latitude; 
                                state.userLongitude = position.coords.longitude;
                                placesService.fetchNearbyRestaurantsWithContext();
                            },
                            (error) => {
                                console.error("Error obteniendo ubicación:", error);
                                state.userLatitude = null; 
                                state.userLongitude = null;
                                if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">No se pudo obtener la ubicación: ${error.message}.</p>`;
                            }
                        );
                    } else {
                        ListopicApp.services.showNotification("La geolocalización no es soportada por este navegador.", "warn");
                    }
                });
            }

            if (searchByNameBtn && establishmentNameSearchInput) {
                searchByNameBtn.addEventListener('click', () => {
                    const query = establishmentNameSearchInput.value;
                    placesService.searchRestaurantsByName(query);
                });
                establishmentNameSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const query = establishmentNameSearchInput.value;
                        placesService.searchRestaurantsByName(query);
                    }
                });
            }
            // FIN DE LÓGICA MOVIDA

            if (listId) { // Este if ya estaba, la lógica de carga de datos de lista y reseña va aquí
                db.collection('lists').doc(listId).get()
                    .then(doc => {
                        if (!doc.exists) {
                            throw new Error("Datos de la lista no encontrados.");
                        }
                        const listData = doc.data();
                        state.currentListNameForSearch = listData.name || '';
                        state.currentListCriteriaDefinitions = listData.criteriaDefinition || {}; 

                        const pageTitleText = reviewIdToEdit ? `Editar Reseña para ${state.currentListNameForSearch}` : `Añadir Nueva Reseña a ${state.currentListNameForSearch}`;
                        if (formTitle) formTitle.textContent = pageTitleText;

                        if (reviewIdToEdit) {
                            db.collection('lists').doc(listId).collection('reviews').doc(reviewIdToEdit).get()
                                .then(async reviewDoc => { // Marcar como async para usar await dentro
                                    if (!reviewDoc.exists) throw new Error("Reseña para editar no encontrada.");
                                    const reviewData = reviewDoc.data();

                                    // Cargar datos del lugar desde la colección 'places'
                                    if (reviewData.placeId) {
                                        // Usar await aquí para asegurar que placeData esté disponible antes de continuar
                                        const placeDoc = await db.collection('places').doc(reviewData.placeId).get();
                                        if (placeDoc.exists) {
                                            const placeData = placeDoc.data();
                                            if (establishmentNameSearchInput) establishmentNameSearchInput.value = placeData.name || '';
                                            if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = placeData.name || '';
                                            
                                            const locationDisplayNameInput = document.getElementById('location-display-name');
                                            if(locationDisplayNameInput) locationDisplayNameInput.value = placeData.name || '';
                                            
                                            const locationAddressManualInput = document.getElementById('location-address-manual');
                                            if(locationAddressManualInput) locationAddressManualInput.value = placeData.address || '';

                                            const locationRegionManualInput = document.getElementById('location-region-manual');
                                            if(locationRegionManualInput) locationRegionManualInput.value = placeData.region || '';
                                            
                                            const locationGoogleMapsUrlManualInput = document.getElementById('location-google-maps-url-manual');
                                            if(locationGoogleMapsUrlManualInput) locationGoogleMapsUrlManualInput.value = placeData.googleMapsUrl || '';

                                            // Rellenar campos ocultos para mantener la info
                                            const locationLatInput = document.getElementById('location-latitude');
                                            if(locationLatInput && placeData.location) locationLatInput.value = placeData.location.latitude || '';
                                            const locationLonInput = document.getElementById('location-longitude');
                                            if(locationLonInput && placeData.location) locationLonInput.value = placeData.location.longitude || '';
                                            const locationPlaceIdInput = document.getElementById('location-googlePlaceId');
                                            if(locationPlaceIdInput) locationPlaceIdInput.value = placeData.googlePlaceId || '';
                                            // Podrías rellenar city-g, postalCode-g, country-g si los guardas en placeData y los tienes en el form

                                            // Si hay datos de ubicación, mostrar los campos manuales para posible edición
                                            if (manualLocationFieldsDiv && (placeData.name || placeData.address)) {
                                                manualLocationFieldsDiv.style.display = 'block';
                                                if(toggleManualLocationBtn) toggleManualLocationBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Ocultar Detalles de Ubicación Manual';
                                            }

                                        } else {
                                            console.warn(`Al editar reseña, no se encontró el lugar con placeId: ${reviewData.placeId}`);
                                            // Fallback a antiguos campos si placeId no resuelve
                                             if (establishmentNameSearchInput) establishmentNameSearchInput.value = reviewData.establishmentName || 'Lugar no encontrado';
                                             if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = reviewData.establishmentName || 'Lugar no encontrado';
                                        }
                                    } else if (reviewData.establishmentName) { // Fallback para reseñas antiguas sin placeId
                                         if (establishmentNameSearchInput) establishmentNameSearchInput.value = reviewData.establishmentName || '';
                                         if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = reviewData.establishmentName || '';
                                         // Para el fallback, podrías intentar rellenar location-display-name y location-address-manual
                                         const locationDisplayNameInput = document.getElementById('location-display-name');
                                         if(locationDisplayNameInput) locationDisplayNameInput.value = reviewData.establishmentName || '';
                                         // No hay mucho más que rellenar de forma fiable desde la estructura antigua
                                    }
                                    if (itemNameInput) itemNameInput.value = reviewData.itemName || '';

                                    if (reviewData.photoUrl) {
                                        uiUtils.showPreviewGlobal(reviewData.photoUrl, imagePreviewContainerReview);
                                        if (!reviewData.photoUrl.startsWith('data:image')) { // No rellenar si es data URL
                                            if(photoUrlInputReview) photoUrlInputReview.value = reviewData.photoUrl;
                                        }
                                    }
                                    const commentEl = document.getElementById('comment');
                                    if(commentEl) commentEl.value = reviewData.comment || '';

                                    uiUtils.renderCriteriaSliders(criteriaContainer, reviewData.scores || {}, state.currentListCriteriaDefinitions);
                                    uiUtils.renderTagCheckboxes(dynamicTagContainer, listData.availableTags || [], reviewData.userTags || []);
                                })
                                .catch(error => {
                                    console.error("REVIEW-FORM: Error al cargar datos de la reseña para editar:", error);
                                    ListopicApp.services.showNotification(`Error al cargar la reseña para editar: ${error.message}`, 'error');
                                });
                        } else {
                            uiUtils.renderCriteriaSliders(criteriaContainer, {}, state.currentListCriteriaDefinitions);
                            uiUtils.renderTagCheckboxes(dynamicTagContainer, listData.availableTags || [], []);
                            uiUtils.clearPreviewGlobal(imagePreviewContainerReview, photoUrlInputReview, photoFileInputReview);
                            state.selectedFileForUpload = null;
                            state.currentSelectedPlaceInfo = null;

                            // PRE-RELLENAR item-name con el nombre de la lista
                            if (itemNameInput && state.currentListNameForSearch) {
                                itemNameInput.value = state.currentListNameForSearch;
                                console.log(`Pre-rellenado itemName con el nombre de la lista: "${state.currentListNameForSearch}"`);
                            }
                            if (manualLocationFieldsDiv) manualLocationFieldsDiv.style.display = 'none';
                            if (toggleManualLocationBtn) toggleManualLocationBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Añadir/Editar Detalles de Ubicación Manualmente';
                        }
                    })
                    .catch(error => {
                        console.error("REVIEW-FORM: Error al cargar datos de la lista (Firestore):", error);
                        if (formTitle) formTitle.textContent = "Error al cargar formulario";
                        ListopicApp.services.showNotification("Error al cargar la definición de la lista.", "error");
                    });
            }

            reviewForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = reviewForm.querySelector('.submit-button');
                if (submitButton) submitButton.disabled = true;
                
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    ListopicApp.services.showNotification("Debes estar autenticado para guardar una reseña.", 'error');
                    if (submitButton) submitButton.disabled = false;
                    return;
                }

                const formData = new FormData(reviewForm);
                // Obtener datos del formulario
                const establishmentNameFromSearchOrHidden = establishmentNameHiddenInput.value; // De Google Places o búsqueda
                const itemNameValue = itemNameInput.value;
                
                // Datos manuales de ubicación (pueden estar vacíos si se usó Google Places)
                const locationDisplayName = document.getElementById('location-display-name').value.trim();
                const manualAddress = document.getElementById('location-address-manual').value.trim();
                const manualRegion = document.getElementById('location-region-manual').value.trim();
                const manualGoogleMapsUrl = document.getElementById('location-google-maps-url-manual').value.trim();
                // Datos de los inputs ocultos
                const manualLat = parseFloat(document.getElementById('location-latitude').value);
                const manualLon = parseFloat(document.getElementById('location-longitude').value);
                const manualGooglePlaceId = document.getElementById('location-googlePlaceId').value.trim();


                // Determinar el nombre del establecimiento a usar para crear el lugar
                const finalEstablishmentName = establishmentNameFromSearchOrHidden || locationDisplayName;

                if (!finalEstablishmentName) {
                    ListopicApp.services.showNotification("El nombre del establecimiento/lugar es obligatorio.", 'error');
                    if (submitButton) submitButton.disabled = false;
                    return;
                }
                
                let placeIdToSave;

                try {
                    let placeToProcess;
                    if (state.currentSelectedPlaceInfo) {
                        // Se usó Google Places
                        placeToProcess = state.currentSelectedPlaceInfo; // Este ya tiene name, addressFormatted, lat, lon, etc.
                        // Asegurarse de que el nombre principal para buscar/crear sea el del input oculto (que viene de place.name)
                        placeToProcess.name = establishmentNameFromSearchOrHidden || placeToProcess.name;
                        // Añadir region manual si el usuario la especificó y Google no la dio
                        if (manualRegion && !placeToProcess.region) {
                             placeToProcess.region = manualRegion;
                        }
                        placeIdToSave = await findOrCreatePlace(placeToProcess, null, currentUser.uid);
                        state.currentSelectedPlaceInfo = null; // Limpiar estado
                        document.getElementById('restaurant-suggestions').innerHTML = ''; // Limpiar sugerencias

                    } else {
                        // Entrada manual del lugar
                        const manualPlaceData = {
                            name: finalEstablishmentName,
                            address: manualAddress,
                            region: manualRegion,
                            googleMapsUrl: manualGoogleMapsUrl,
                            // Aquí podrías añadir city, postalCode, country si los capturas en el form
                            latitude: !isNaN(manualLat) ? manualLat : null,
                            longitude: !isNaN(manualLon) ? manualLon : null,
                            googlePlaceId: manualGooglePlaceId || null // Si el usuario pegó un placeId
                        };
                        placeIdToSave = await findOrCreatePlace(null, manualPlaceData, currentUser.uid);
                    }

                    if (!placeIdToSave) {
                        throw new Error("No se pudo obtener o crear un ID de lugar.");
                    }

                    const reviewDataPayload = {
                        userId: currentUser.uid,
                        listId: listId,
                        placeId: placeIdToSave, 
                        itemName: itemNameValue,
                        // Ya no guardamos establishmentName ni el objeto location aquí directamente
                        comment: formData.get('comment'),
                        scores: {},
                        userTags: formData.getAll('tags'),
                    }; // ... (scores, overallRating, photoUrl, userTags, timestamps como antes) ...

                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('ratings[')) {
                        const criterionKey = key.substring(8, key.length - 1);
                        reviewDataPayload.scores[criterionKey] = parseFloat(value);
                    }
                }
                
                let totalWeightedScore = 0;
                let ponderableCriteriaCount = 0;
                if (typeof state.currentListCriteriaDefinitions === 'object' && Object.keys(state.currentListCriteriaDefinitions).length > 0) {
                    for (const scoreKey in reviewDataPayload.scores) {
                        if (state.currentListCriteriaDefinitions[scoreKey] && state.currentListCriteriaDefinitions[scoreKey].ponderable !== false) {
                            totalWeightedScore += reviewDataPayload.scores[scoreKey];
                            ponderableCriteriaCount++;
                        }
                    }
                }
                reviewDataPayload.overallRating = ponderableCriteriaCount > 0 ? parseFloat((totalWeightedScore / ponderableCriteriaCount).toFixed(2)) : 0;

                let finalImageUrl = photoUrlInputReview.value.trim();

                if (state.selectedFileForUpload && storage) {
                    if (currentUser) { // currentUser ya está verificado arriba
                        const fileName = `${Date.now()}-${state.selectedFileForUpload.name}`;
                        const storagePath = `reviews/${currentUser.uid}/${listId}/${fileName}`;
                        const storageRef = storage.ref(storagePath);
                        try {
                            const uploadTaskSnapshot = await storageRef.put(state.selectedFileForUpload);
                            finalImageUrl = await uploadTaskSnapshot.ref.getDownloadURL();
                        } catch (error) {
                            console.error('Error uploading image to Firebase Storage:', error);
                            ListopicApp.services.showNotification(`Error uploading image: ${error.message}`, 'error');
                            if (submitButton) submitButton.disabled = false;
                            return;
                        } // Cierre del catch de subida de imagen
                    } else {
                        ListopicApp.services.showNotification('User not authenticated, cannot upload image.', 'error');
                        if (submitButton) submitButton.disabled = false;
                        return;
                    }
                }

                if (finalImageUrl && finalImageUrl !== '') { // Si finalImageUrl tiene valor (de URL o de subida)
                    reviewDataPayload.photoUrl = finalImageUrl;
                } else if (reviewIdToEdit && imagePreviewContainerReview.querySelector('img') && !state.selectedFileForUpload && (!photoUrlInputReview || photoUrlInputReview.value.trim() === '')) { // Borrar imagen existente
                    reviewDataPayload.photoUrl = firebase.firestore.FieldValue.delete();
                } else { // No hay URL, no hay subida, no es edición para borrar -> no incluir photoUrl
                    delete reviewDataPayload.photoUrl;
                }

                // Guardar la reseña
                const listRef = db.collection('lists').doc(listId);
                    if (reviewIdToEdit) {
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await listRef.collection('reviews').doc(reviewIdToEdit).update(reviewDataPayload);
                    } else {
                        reviewDataPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await listRef.collection('reviews').add(reviewDataPayload);
                    }

                    ListopicApp.services.showNotification(`Reseña ${reviewIdToEdit ? 'actualizada' : 'guardada'} con éxito!`, 'success');
                    
                    // IMPORTANTE: Aquí es donde idealmente se llamaría a una Cloud Function
                    // para actualizar los agregados en el documento /places/{placeIdToSave}
                    // y el reviewCount en /lists/{listId}
                    // Ejemplo: updatePlaceAggregates(placeIdToSave); updateListReviewCount(listId, !reviewIdToEdit);


                    const fromGrouped = urlParams.get('fromGrouped');
                    const fromEstablishment = urlParams.get('fromEstablishment');
                    const fromItem = urlParams.get('fromItem'); // Puede ser null o vacío
                    if (fromGrouped === 'true' && fromEstablishment) {
                        window.location.href = `grouped-detail-view.html?listId=${listId}&establishment=${encodeURIComponent(fromEstablishment)}&item=${encodeURIComponent(fromItem || '')}`;
                    } else {
                        window.location.href = `list-view.html?listId=${listId}`;
                    }
                    // ... (Lógica de redirección) ...

                } catch (error) {
                    console.error('Error al guardar la reseña (con lógica de places):', error);
                    ListopicApp.services.showNotification(`No se pudo guardar la reseña: ${error.message}`, 'error');
                } finally { // Reactivar botón si no está ya
                    if (submitButton) submitButton.disabled = false;
                }
            });
        // FIN DEL BLOQUE if (reviewForm)
        } else { 
            console.warn("REVIEW-FORM: reviewForm element (#review-form) not found on this page.");
        }
    } // Fin de la función init

    return {
        init
    };
})();