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
                                    
                                    if (establishmentNameSearchInput) establishmentNameSearchInput.value = reviewData.establishmentName || '';
                                    if (establishmentNameHiddenInput) establishmentNameHiddenInput.value = reviewData.establishmentName || '';
                                    if (itemNameInput) itemNameInput.value = reviewData.itemName || '';
                                    
                                    if (reviewData.location) { 
                                        document.getElementById('location-url').value = reviewData.location.url || '';
                                        document.getElementById('location-text').value = reviewData.location.text || '';
                                    }

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
                
                const establishmentNameValue = establishmentNameHiddenInput.value; 
                const itemNameValue = itemNameInput.value;

                if (!establishmentNameValue) {
                    ListopicApp.services.showNotification("El nombre del establecimiento es obligatorio.", 'error');
                    if (submitButton) submitButton.disabled = false;
                    return;
                }

                const reviewDataPayload = {
                    userId: currentUser.uid,
                    listId: listId, 
                    establishmentName: establishmentNameValue,
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

                let finalImageUrl = photoUrlInputReview.value;
                if (state.selectedFileForUpload && storage) {
                    const user = auth.currentUser;
                    if (user) {
                        const fileName = `${Date.now()}-${state.selectedFileForUpload.name}`;
                        const storagePath = `reviews/${user.uid}/${listId}/${fileName}`;
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
                
                if (finalImageUrl !== undefined && finalImageUrl.trim() !== '') {
                    reviewDataPayload.photoUrl = finalImageUrl;
                } else if (reviewIdToEdit && imagePreviewContainerReview.querySelector('img') && !state.selectedFileForUpload && !photoUrlInputReview.value) {
                    reviewDataPayload.photoUrl = firebase.firestore.FieldValue.delete();
                } else {
                    delete reviewDataPayload.photoUrl;
                }
                
                try {
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
                    
                    const fromGrouped = urlParams.get('fromGrouped');
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
        // FIN DEL BLOQUE if (reviewForm)
        } else { 
            console.warn("REVIEW-FORM: reviewForm element (#review-form) not found on this page.");
        }
    } // Fin de la función init

    return {
        init
    };
})();