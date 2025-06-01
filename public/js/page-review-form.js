window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageReviewForm = (() => {
    function init() {
        console.log('Initializing Review Form page logic with actual code...');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        const storage = ListopicApp.services.storage;
        const uiUtils = ListopicApp.uiUtils;
        const placesService = ListopicApp.placesService;
        const state = ListopicApp.state;

        const reviewForm = document.getElementById('review-form');
        
        if (reviewForm) {
            const urlParams = new URLSearchParams(window.location.search);
            const reviewIdToEdit = urlParams.get('editId');
            const listId = urlParams.get('listId');
            state.currentListId = listId; 

            const hiddenListIdInput = document.getElementById('review-form-listId');
            const criteriaContainer = document.getElementById('dynamic-rating-criteria');
            const formTitle = reviewForm.parentElement.querySelector('h2');
            const dynamicTagContainer = document.getElementById('dynamic-tag-selection');
            const imagePreviewContainerReview = reviewForm.querySelector('.image-preview');
            const photoUrlInputReview = document.getElementById('photo-url');
            const photoFileInputReview = document.getElementById('photo-file');
            const backButtonReview = reviewForm.parentElement.querySelector('a.back-button');
            
            // MODIFICADO: IDs para los nuevos nombres de campo
            const establishmentNameSearchInput = document.getElementById('restaurant-name-search-input'); // Este es el de búsqueda, el ID puede quedar
            const establishmentNameHiddenInput = document.getElementById('establishment-name'); // Input oculto
            const itemNameInput = document.getElementById('item-name'); // Input para el producto/plato

            if (backButtonReview && listId) {
                const fromGrouped = urlParams.get('fromGrouped');
                // MODIFICADO: Esperar fromEstablishment y fromItem en lugar de fromRestaurant y fromDish
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
                return;
            }

            // ... (resto del código de manejo de imágenes, geolocalización, etc., que no cambia directamente por 1.a o 1.b) ...
            // Mantengo la lógica de imageDropArea, browseGalleryBtn, useCameraBtn, photoUrlInput, findNearbyBtn, searchByNameBtn.

            if (listId) {
                db.collection('lists').doc(listId).get()
                    .then(doc => {
                        if (!doc.exists) {
                            throw new Error("Datos de la lista no encontrados.");
                        }
                        const listData = doc.data();
                        state.currentListNameForSearch = listData.name || '';
                        // MODIFICADO: criteriaDefinition ya es un mapa de Firestore
                        state.currentListCriteriaDefinitions = listData.criteriaDefinition || {}; 

                        const pageTitleText = reviewIdToEdit ? `Editar Reseña para ${state.currentListNameForSearch}` : `Añadir Nueva Reseña a ${state.currentListNameForSearch}`;
                        if (formTitle) formTitle.textContent = pageTitleText;

                        if (reviewIdToEdit) {
                            // Asumiendo que las reseñas están en una subcolección 'reviews' bajo cada lista
                            db.collection('lists').doc(listId).collection('reviews').doc(reviewIdToEdit).get()
                                .then(reviewDoc => {
                                    if (!reviewDoc.exists) throw new Error("Reseña para editar no encontrada.");
                                    const reviewData = reviewDoc.data();
                                    
                                    // MODIFICADO: Poblar formulario con establishmentName e itemName
                                    if (establishmentNameSearchInput) establishmentNameSearchInput.value = reviewData.establishmentName || '';
                                    if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = reviewData.establishmentName || '';
                                    if (itemNameInput) itemNameInput.value = reviewData.itemName || '';
                                    
                                    // Location handling (se revisará en punto 1.c)
                                    if (reviewData.location) { 
                                        document.getElementById('location-url').value = reviewData.location.url || '';
                                        document.getElementById('location-text').value = reviewData.location.text || '';
                                    }
                                    // Si tienes googlePlaceId directamente en reviewData y quieres usarlo:
                                    // else if (reviewData.googlePlaceId && reviewData.businessId) { ... }


                                    if (reviewData.photoUrl) {
                                        uiUtils.showPreviewGlobal(reviewData.photoUrl, imagePreviewContainerReview);
                                        if (!reviewData.photoUrl.startsWith('data:image')) {
                                            photoUrlInputReview.value = reviewData.photoUrl;
                                        }
                                    }
                                    document.getElementById('comment').value = reviewData.comment || '';

                                    // Render criteria sliders - uiUtils.renderCriteriaSliders ya espera un mapa
                                    uiUtils.renderCriteriaSliders(criteriaContainer, reviewData.scores || {}, state.currentListCriteriaDefinitions);
                                    uiUtils.renderTagCheckboxes(dynamicTagContainer, listData.availableTags || [], reviewData.userTags || []);
                                })
                                .catch(error => {
                                    console.error("REVIEW-FORM: Error al cargar datos de la reseña para editar:", error);
                                    ListopicApp.services.showNotification(`Error al cargar la reseña para editar: ${error.message}`, 'error');
                                });
                        } else {
                            // Nueva reseña: uiUtils.renderCriteriaSliders ya espera un mapa
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

                const formData = new FormData(reviewForm); // formData sigue siendo útil para otros campos como 'comment' y 'tags'
                
                // MODIFICADO: Obtener establishmentName e itemName de los inputs correctos
                const establishmentNameValue = establishmentNameHiddenInput.value; // Del input oculto
                const itemNameValue = itemNameInput.value;

                if (!establishmentNameValue) {
                    ListopicApp.services.showNotification("El nombre del establecimiento es obligatorio.", 'error');
                    if (submitButton) submitButton.disabled = false;
                    return;
                }

                const reviewDataPayload = {
                    userId: currentUser.uid,
                    listId: listId, // Asegurarse de que el listId está en el payload para Firestore
                    establishmentName: establishmentNameValue,
                    itemName: itemNameValue,
                    comment: formData.get('comment'),
                    scores: {}, // Se rellena después
                    userTags: formData.getAll('tags'), 
                    // userTypeAtReview: "basico", // Obtener de perfil de usuario si es necesario
                    // likesCount: 0,
                    // commentsCount: 0,
                };

                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('ratings[')) {
                        const criterionKey = key.substring(8, key.length - 1);
                        reviewDataPayload.scores[criterionKey] = parseFloat(value);
                    }
                }
                
                // MODIFICADO: Cálculo de overallRating usando el mapa criteriaDefinition
                let totalWeightedScore = 0;
                let ponderableCriteriaCount = 0;
                // state.currentListCriteriaDefinitions es el mapa { critKey: {label, ponderable, ...} }
                if (typeof state.currentListCriteriaDefinitions === 'object' && Object.keys(state.currentListCriteriaDefinitions).length > 0) {
                    for (const scoreKey in reviewDataPayload.scores) {
                        // scoreKey debe coincidir con una clave en state.currentListCriteriaDefinitions
                        if (state.currentListCriteriaDefinitions[scoreKey] && state.currentListCriteriaDefinitions[scoreKey].ponderable !== false) {
                            totalWeightedScore += reviewDataPayload.scores[scoreKey];
                            ponderableCriteriaCount++;
                        }
                    }
                }
                reviewDataPayload.overallRating = ponderableCriteriaCount > 0 ? parseFloat((totalWeightedScore / ponderableCriteriaCount).toFixed(2)) : 0;


                let finalImageUrl = photoUrlInputReview.value;
                if (state.selectedFileForUpload && storage) {
                    const user = auth.currentUser;
                    if (user) {
                        const fileName = `${Date.now()}-${state.selectedFileForUpload.name}`;
                        const storagePath = `reviews/${user.uid}/${listId}/${fileName}`; // Añadir listId al path
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
                // ... (lógica de fallback para imagen si storage no está disponible, aunque debería estarlo) ...
                
                if (finalImageUrl !== undefined && finalImageUrl.trim() !== '') {
                    reviewDataPayload.photoUrl = finalImageUrl;
                } else if (reviewIdToEdit && imagePreviewContainerReview.querySelector('img') && !state.selectedFileForUpload && !photoUrlInputReview.value) {
                    // Si se está editando, no hay nuevo archivo, no hay URL y había una imagen antes, se borra el campo
                    reviewDataPayload.photoUrl = firebase.firestore.FieldValue.delete();
                } else {
                    // No hay imagen nueva ni existente que mantener, asegurar que no se envíe un string vacío si no se quiere
                    delete reviewDataPayload.photoUrl;
                }
                
                // ... (Manejo de location (se verá en 1.c))

                try {
                    const listRef = db.collection('lists').doc(listId);
                    
                    if (reviewIdToEdit) {
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await listRef.collection('reviews').doc(reviewIdToEdit).update(reviewDataPayload);
                    } else {
                        reviewDataPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        // No es necesario añadir listName al payload si no lo vas a usar/denormalizar aquí.
                        // La consulta al listDoc ya la hicimos antes para obtener los criterios.
                        await listRef.collection('reviews').add(reviewDataPayload);
                        // Considerar una Cloud Function para actualizar reviewCount en la lista
                    }

                    ListopicApp.services.showNotification(`Reseña ${reviewIdToEdit ? 'actualizada' : 'guardada'} con éxito!`, 'success');
                    
                    // Redirección
                    const fromGrouped = urlParams.get('fromGrouped');
                    // MODIFICADO: Usar los nuevos nombres de parámetros para la redirección
                    const fromEstablishment = urlParams.get('fromEstablishment'); 
                    const fromItem = urlParams.get('fromItem');
                    if (fromGrouped === 'true' && fromEstablishment) {
                        window.location.href = `grouped-detail-view.html?listId=${listId}&establishment=${encodeURIComponent(fromEstablishment)}&item=${encodeURIComponent(fromItem || '')}`;
                    } else {
                        window.location.href = `list-view.html?listId=${listId}`;
                    }

                } catch (error) {
                    console.error('Error al guardar la reseña:', error);
                    ListopicApp.services.showNotification(`No se pudo guardar la reseña: ${error.message}`, 'error');
                } finally {
                    if (submitButton) submitButton.disabled = false;
                }
            });
        } else {
            console.warn("REVIEW-FORM: reviewForm element not found.");
        }
    }

    // Image and geolocation logic from original file (imageDropArea, browseGalleryBtn, etc.) should be here
    // Ensure they are within the init function or accessible to it. For brevity, not repeating them fully here.
    // Example snippet for imageDropArea setup within init():
    const imageDropArea = document.getElementById('image-drop-area');
    const browseGalleryBtn = document.getElementById('browse-gallery-btn');
    const useCameraBtn = document.getElementById('use-camera-btn');
    const photoUrlInputReview = document.getElementById('photo-url'); // ensure this is defined if used here
    const photoFileInputReview = document.getElementById('photo-file'); // ensure this is defined
    const imagePreviewContainerReview = reviewForm?.querySelector('.image-preview'); // ensure reviewForm is defined

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
        imageDropArea.addEventListener('click', () => photoFileInputReview.click()); // Permitir click para seleccionar archivo
        
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
    const establishmentNameSearchInput = document.getElementById('restaurant-name-search-input'); // Re-get for this scope if needed

    if (findNearbyBtn) {
        findNearbyBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                const suggestionsBox = document.getElementById('restaurant-suggestions');
                if (suggestionsBox) suggestionsBox.innerHTML = '<p>Obteniendo tu ubicación...</p>';
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        state.userLatitude = position.coords.latitude; 
                        state.userLongitude = position.coords.longitude;
                        placesService.fetchNearbyRestaurantsWithContext(); // fetchNearbyRestaurantsWithContext is in placesService
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
            placesService.searchRestaurantsByName(query); // searchRestaurantsByName is in placesService
        });
        establishmentNameSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = establishmentNameSearchInput.value;
                placesService.searchRestaurantsByName(query);
            }
        });
    }


    return {
        init
    };
})();