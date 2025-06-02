window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageReviewForm = (() => {
    // Nueva función auxiliar dentro del IIFE de pageReviewForm
    async function findOrCreatePlace(placeDataFromGoogle, manualPlaceData, currentUserId) {
        const db = ListopicApp.services.db; // Acceder a db
        let placeId = null;
        let placeDocData = {};

        if (placeDataFromGoogle && placeDataFromGoogle.placeId) {
            // Intento 1: Buscar por Google Place ID
            const querySnapshot = await db.collection('places')
                                        .where('googlePlaceId', '==', placeDataFromGoogle.placeId)
                                        .limit(1)
                                        .get();
            if (!querySnapshot.empty) {
                const placeDoc = querySnapshot.docs[0];
                placeId = placeDoc.id;
                console.log("Lugar encontrado por Google Place ID:", placeId, placeDoc.data());
                // Opcional: Actualizar el lugar con datos frescos de Google si es necesario
                // await placeDoc.ref.update({ ...datos frescos ..., updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                return placeId;
            } else {
                // No encontrado por googlePlaceId, preparar para crear
                placeDocData = {
                    name: placeDataFromGoogle.name || "Establecimiento Desconocido",
                    address: placeDataFromGoogle.address || null,
                    location: { // Firestore geopoint
                        latitude: placeDataFromGoogle.latitude || null,
                        longitude: placeDataFromGoogle.longitude || null,
                    },
                    googlePlaceId: placeDataFromGoogle.placeId,
                    googleMapsUrl: placeDataFromGoogle.mapsUrl || null,
                };
            }
        } else if (manualPlaceData && manualPlaceData.name) {
            console.warn("Creando lugar basado en entrada manual. Podría generar duplicados si no se maneja con cuidado.");
            placeDocData = {
                name: manualPlaceData.name,
                address: manualPlaceData.address || null,
                location: { // Firestore geopoint
                    latitude: manualPlaceData.latitude || null,
                    longitude: manualPlaceData.longitude || null,
                },
            };
        } else {
            throw new Error("No hay suficiente información para encontrar o crear un lugar.");
        }

        placeDocData.aggregatedOverallRating = 0;
        placeDocData.totalReviews = 0;
        placeDocData.mainImageUrl = null;
        placeDocData.createdByUserId = currentUserId;
        placeDocData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        placeDocData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

        if(manualPlaceData) { // Añadir campos opcionales si existen en manualPlaceData
            if(manualPlaceData.region) placeDocData.region = manualPlaceData.region;
            // ... otros campos como city, postalCode, country si los capturas
        }

        const placeRef = await db.collection('places').add(placeDocData);
        console.log("Nuevo lugar creado con ID:", placeRef.id);
        return placeRef.id;
    }

    function init() {
        console.log('Initializing Review Form page logic with actual code...');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        const storage = ListopicApp.services.storage;
        const uiUtils = ListopicApp.uiUtils;
        const placesService = ListopicApp.placesService;
        const state = ListopicApp.state;

        const reviewForm = document.getElementById('review-form');
        
        if (reviewForm) { // <-- INICIO DEL BLOQUE if (reviewForm)
            const urlParams = new URLSearchParams(window.location.search);
            const reviewIdToEdit = urlParams.get('editId');
            const listId = urlParams.get('listId');
            state.currentListId = listId; 

            const hiddenListIdInput = document.getElementById('review-form-listId');
            const criteriaContainer = document.getElementById('dynamic-rating-criteria');
            const formTitle = reviewForm.parentElement.querySelector('h2');
            const dynamicTagContainer = document.getElementById('dynamic-tag-selection');
            const imagePreviewContainerReview = reviewForm.querySelector('.image-preview'); // Ahora dentro del if
            const photoUrlInputReview = document.getElementById('photo-url');
            const photoFileInputReview = document.getElementById('photo-file');
            const backButtonReview = reviewForm.parentElement.querySelector('a.back-button');
            
            const establishmentNameSearchInput = document.getElementById('restaurant-name-search-input');
            const establishmentNameHiddenInput = document.getElementById('establishment-name'); 
            const itemNameInput = document.getElementById('item-name'); 

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
                });
            }

            if (browseGalleryBtn && photoFileInputReview) {
                browseGalleryBtn.addEventListener('click', () => {
                    photoFileInputReview.removeAttribute('capture'); photoFileInputReview.click();
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
                                .then(reviewDoc => {
                                    if (!reviewDoc.exists) throw new Error("Reseña para editar no encontrada.");
                                    const reviewData = reviewDoc.data();

                                    // Cargar datos del lugar desde la colección 'places'
                                    if (reviewData.placeId) {
                                        db.collection('places').doc(reviewData.placeId).get()
                                            .then(placeDoc => {
                                                if (placeDoc.exists) {
                                                    const placeData = placeDoc.data();
                                                    if (establishmentNameSearchInput) establishmentNameSearchInput.value = placeData.name || '';
                                                    if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = placeData.name || '';
                                                    
                                                    const locationTextManualInput = document.getElementById('location-text-manual');
                                                    if (locationTextManualInput) locationTextManualInput.value = placeData.address || '';
                                                    
                                                    const locationGoogleMapsUrlManualInput = document.getElementById('location-google-maps-url-manual');
                                                    if (locationGoogleMapsUrlManualInput) locationGoogleMapsUrlManualInput.value = placeData.googleMapsUrl || '';

                                                    // Podrías rellenar otros campos de ubicación manual si los tienes y están en placeData
                                                } else {
                                                    console.warn("REVIEW-FORM: Documento de lugar no encontrado para placeId:", reviewData.placeId);
                                                     if (establishmentNameSearchInput) establishmentNameSearchInput.value = reviewData.establishmentName || 'Lugar no encontrado'; // Fallback a antiguo campo si existe
                                                     if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = reviewData.establishmentName || 'Lugar no encontrado';
                                                }
                                            })
                                            .catch(err => {
                                                console.error("REVIEW-FORM: Error al cargar datos del lugar para editar:", err);
                                                ListopicApp.services.showNotification(`Error al cargar detalles del lugar: ${err.message}`, 'error');
                                            });
                                    } else if (reviewData.establishmentName) { // Fallback para reseñas antiguas sin placeId
                                         if (establishmentNameSearchInput) establishmentNameSearchInput.value = reviewData.establishmentName || '';
                                         if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = reviewData.establishmentName || '';
                                         if (reviewData.location && document.getElementById('location-text-manual')) document.getElementById('location-text-manual').value = reviewData.location.text || '';
                                    }
                                    if (itemNameInput) itemNameInput.value = reviewData.itemName || '';

                                    if (reviewData.photoUrl) {
                                        uiUtils.showPreviewGlobal(reviewData.photoUrl, imagePreviewContainerReview);
                                        if (!reviewData.photoUrl.startsWith('data:image')) {
                                            photoUrlInputReview.value = reviewData.photoUrl;
                                        }
                                    }
                                    document.getElementById('comment').value = reviewData.comment || '';

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
                const establishmentNameFromSearch = establishmentNameHiddenInput.value;
                const itemNameValue = itemNameInput.value;
                const manualLocationText = document.getElementById('location-text-manual')?.value.trim(); // Asumiendo que este input existe

                if (!establishmentNameFromSearch && (!manualLocationText || manualLocationText === '')) {
                    ListopicApp.services.showNotification("El nombre del establecimiento es obligatorio.", 'error');
                    if (submitButton) submitButton.disabled = false;
                    return;
                }

                let placeIdToSave;

                try {
                    if (state.currentSelectedPlaceInfo) {
                        // Se usó Google Places
                        placeIdToSave = await findOrCreatePlace(state.currentSelectedPlaceInfo, null, currentUser.uid);
                        
                        // Poblar campos manuales con la info de Google Places y limpiar estado
                        const locationTextManualInput = document.getElementById('location-text-manual');
                        if (locationTextManualInput) locationTextManualInput.value = state.currentSelectedPlaceInfo.address || state.currentSelectedPlaceInfo.name;
                        
                        const locationGoogleMapsUrlManualInput = document.getElementById('location-google-maps-url-manual');
                        if (locationGoogleMapsUrlManualInput) locationGoogleMapsUrlManualInput.value = state.currentSelectedPlaceInfo.mapsUrl || '';
                        
                        // Limpiar el input de búsqueda visible si se usó Google Places para evitar confusión
                        // if (establishmentNameSearchInput) establishmentNameSearchInput.value = state.currentSelectedPlaceInfo.name;
                        // if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = state.currentSelectedPlaceInfo.name;

                        state.currentSelectedPlaceInfo = null;
                        document.getElementById('restaurant-suggestions').innerHTML = ''; // Limpiar sugerencias

                    } else {
                        // Entrada manual del lugar
                        const manualPlaceData = {
                            name: establishmentNameFromSearch || manualLocationText, // Usar el del input de búsqueda si está, sino el manual
                            address: manualLocationText, // O un campo de dirección manual más específico
                            // latitude: ..., // Si capturas lat/lon manual
                            // longitude: ...,
                            // region: ..., // Si capturas region manual
                        };
                        placeIdToSave = await findOrCreatePlace(null, manualPlaceData, currentUser.uid);
                    }

                    if (!placeIdToSave) {
                        throw new Error("No se pudo obtener o crear un ID de lugar.");
                    }

                    const reviewDataPayload = {
                        userId: currentUser.uid,
                        listId: listId,
                        placeId: placeIdToSave, // <--- GUARDAR EL placeId
                        itemName: itemNameValue,
                        comment: formData.get('comment'),
                        scores: {},
                        userTags: formData.getAll('tags'),
                    };

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
                    if (currentUser) {
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
                        }
                    } else {
                        ListopicApp.services.showNotification('User not authenticated, cannot upload image.', 'error');
                        if (submitButton) submitButton.disabled = false;
                        return;
                    }
                }

                if (finalImageUrl && finalImageUrl !== '') {
                    reviewDataPayload.photoUrl = finalImageUrl;
                } else if (reviewIdToEdit && imagePreviewContainerReview.querySelector('img') && !state.selectedFileForUpload && (!photoUrlInputReview || photoUrlInputReview.value.trim() === '')) {
                    reviewDataPayload.photoUrl = firebase.firestore.FieldValue.delete();
                } else {
                    delete reviewDataPayload.photoUrl;
                }

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

                } catch (error) {
                    console.error('Error al guardar la reseña (con lógica de places):', error);
                    ListopicApp.services.showNotification(`No se pudo guardar la reseña: ${error.message}`, 'error');
                } finally {
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