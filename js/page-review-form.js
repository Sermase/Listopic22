window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageReviewForm = (() => {
    // Dependencies:
    // ListopicApp.services.db (Firestore instance)
    // ListopicApp.services.auth, ListopicApp.services.storage
    // ListopicApp.uiUtils.*
    // ListopicApp.placesService.*
    // ListopicApp.state.* (for currentListId, selectedFileForUpload, etc.)
    // firebase.firestore.FieldValue for timestamps

    function init() {
        console.log('Initializing Review Form page logic with actual code...');
        
        // Access shared services and config
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        const storage = ListopicApp.services.storage;
        const uiUtils = ListopicApp.uiUtils;
        const placesService = ListopicApp.placesService;
        const state = ListopicApp.state; // Access shared state

        // --- Start of code moved from app.js's review-form.html block ---
        const reviewForm = document.getElementById('review-form');
        
        if (reviewForm) {
            const urlParams = new URLSearchParams(window.location.search);
            const reviewIdToEdit = urlParams.get('editId');
            const listId = urlParams.get('listId');
            state.currentListId = listId; // Update shared state

            const hiddenListIdInput = document.getElementById('review-form-listId');
            const criteriaContainer = document.getElementById('dynamic-rating-criteria');
            const formTitle = reviewForm.parentElement.querySelector('h2');
            const dynamicTagContainer = document.getElementById('dynamic-tag-selection');
            const imagePreviewContainerReview = reviewForm.querySelector('.image-preview');
            const photoUrlInputReview = document.getElementById('photo-url');
            const photoFileInputReview = document.getElementById('photo-file');
            const backButtonReview = reviewForm.parentElement.querySelector('a.back-button');
            const restaurantNameSearchInput = document.getElementById('restaurant-name-search-input');
            const restaurantNameHiddenInput = document.getElementById('restaurant-name');

            if (backButtonReview && listId) {
                const fromGrouped = urlParams.get('fromGrouped');
                const fromRestaurant = urlParams.get('fromRestaurant');
                const fromDish = urlParams.get('fromDish');
                if (fromGrouped === 'true' && fromRestaurant) {
                    backButtonReview.href = `grouped-detail-view.html?listId=${listId}&restaurant=${fromRestaurant}&dish=${fromDish || ''}`;
                } else {
                    backButtonReview.href = `list-view.html?listId=${listId}`;
                }
            }
            if (hiddenListIdInput && listId) {
                hiddenListIdInput.value = listId;
            } else if (!listId) {
                console.error("REVIEW-FORM: listId no encontrado en la URL.");
                if (formTitle) formTitle.textContent = "Error: Falta ID de lista";
                return;
            }

            const imageDropArea = document.getElementById('image-drop-area');
            const browseGalleryBtn = document.getElementById('browse-gallery-btn');
            const useCameraBtn = document.getElementById('use-camera-btn');

            if (imageDropArea && photoFileInputReview) {
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
                        state.selectedFileForUpload = files[0]; // Update shared state
                        photoUrlInputReview.value = '';
                        const reader = new FileReader();
                        reader.onload = (event) => uiUtils.showPreviewGlobal(event.target.result, imagePreviewContainerReview);
                        reader.readAsDataURL(state.selectedFileForUpload);
                    }
                });
                imageDropArea.addEventListener('click', () => photoFileInputReview.click());
                photoFileInputReview.addEventListener('change', function () {
                    if (this.files && this.files[0]) {
                        state.selectedFileForUpload = this.files[0]; // Update shared state
                        photoUrlInputReview.value = '';
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
            if (photoUrlInputReview) {
                photoUrlInputReview.addEventListener('input', function () {
                    if (this.value) {
                        uiUtils.showPreviewGlobal(this.value, imagePreviewContainerReview);
                        state.selectedFileForUpload = null; // Update shared state
                        if (photoFileInputReview) photoFileInputReview.value = null;
                    } else {
                        if (!state.selectedFileForUpload) { // Check shared state
                            uiUtils.clearPreviewGlobal(imagePreviewContainerReview); // uiUtils.clearPreviewGlobal no longer clears selectedFileForUpload itself
                        }
                    }
                });
            }

            const findNearbyBtn = document.getElementById('find-nearby-btn');
            const searchByNameBtn = document.getElementById('search-by-name-btn');

            if (findNearbyBtn) {
                findNearbyBtn.addEventListener('click', () => {
                    if (navigator.geolocation) {
                        const suggestionsBox = document.getElementById('restaurant-suggestions');
                        if (suggestionsBox) suggestionsBox.innerHTML = '<p>Obteniendo tu ubicación...</p>';
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                state.userLatitude = position.coords.latitude; // Update shared state
                                state.userLongitude = position.coords.longitude; // Update shared state
                                placesService.fetchNearbyRestaurantsWithContext();
                            },
                            (error) => {
                                console.error("Error obteniendo ubicación:", error);
                                state.userLatitude = null; // Update shared state
                                state.userLongitude = null; // Update shared state
                                if (suggestionsBox) suggestionsBox.innerHTML = `<p style="color:var(--danger-color);">No se pudo obtener la ubicación: ${error.message}.</p>`;
                            }
                        );
                    } else {
                        alert("La geolocalización no es soportada por este navegador.");
                    }
                });
            }

            if (searchByNameBtn && restaurantNameSearchInput) {
                searchByNameBtn.addEventListener('click', () => {
                    const query = restaurantNameSearchInput.value;
                    placesService.searchRestaurantsByName(query);
                });
                restaurantNameSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const query = restaurantNameSearchInput.value;
                        placesService.searchRestaurantsByName(query);
                    }
                });
            }

            if (listId) {
                db.collection('lists').doc(listId).get()
                    .then(doc => {
                        if (!doc.exists) {
                            throw new Error("Datos de la lista no encontrados.");
                        }
                        const listData = doc.data();
                        state.currentListNameForSearch = listData.name || ''; // Update shared state
                        // The new model has criteriaDefinition as a map
                        state.currentListCriteriaDefinitions = listData.criteriaDefinition || {}; // Update shared state

                        const pageTitleText = reviewIdToEdit ? `Editar Reseña para ${state.currentListNameForSearch}` : `Añadir Nueva Reseña a ${state.currentListNameForSearch}`;
                        if (formTitle) formTitle.textContent = pageTitleText;

                        if (reviewIdToEdit) {
                            db.collection('lists').doc(listId).collection('reviews').doc(reviewIdToEdit).get()
                                .then(reviewDoc => {
                                    if (!reviewDoc.exists) throw new Error("Reseña para editar no encontrada.");
                                    const reviewData = reviewDoc.data();
                                    // Populate form with reviewData
                                    restaurantNameSearchInput.value = reviewData.restaurant || ''; // This might map to item.name or business.name
                                    restaurantNameHiddenInput.value = reviewData.restaurant || '';
                                    document.getElementById('dish-name').value = reviewData.dish || ''; // This might also be part of item.name

                                    // Location handling - remains similar, ensure googlePlaceInfo is handled
                                    if (reviewData.location) { // Assuming location is still {url, text} if not using googlePlaceId
                                        document.getElementById('location-url').value = reviewData.location.url || '';
                                        document.getElementById('location-text').value = reviewData.location.text || '';
                                    }
                                    if (reviewData.googlePlaceId && reviewData.businessId) { // Assuming you might store googlePlaceId on business
                                        // You'd fetch business details if needed, or construct maps link
                                        // For now, if reviewData has direct place info:
                                        // document.getElementById('location-url').value = `https://maps.google.com/?q=place_id:${reviewData.googlePlaceId}`;
                                        // state.currentSelectedPlaceInfo = { placeId: reviewData.googlePlaceId, ... };
                                    }

                                    if (reviewData.photoUrl) {
                                        uiUtils.showPreviewGlobal(reviewData.photoUrl, imagePreviewContainerReview);
                                        if (!reviewData.photoUrl.startsWith('data:image')) {
                                            photoUrlInputReview.value = reviewData.photoUrl;
                                        }
                                    }
                                    document.getElementById('comment').value = reviewData.comment || '';

                                    // Render criteria sliders based on listData.criteriaDefinition and reviewData.scores
                                    uiUtils.renderCriteriaSliders(criteriaContainer, reviewData.scores || {}, state.currentListCriteriaDefinitions);
                                    // Render tags based on listData.availableTags and reviewData.userTags / structuredTags
                                    uiUtils.renderTagCheckboxes(dynamicTagContainer, listData.availableTags || [], reviewData.userTags || []);
                                })
                                .catch(error => {
                                    console.error("REVIEW-FORM: Error al cargar datos de la reseña para editar:", error);
                                    alert(`Error al cargar la reseña para editar: ${error.message}`);
                                });
                        } else {
                            // New review: render sliders based on list's criteriaDefinition
                            uiUtils.renderCriteriaSliders(criteriaContainer, {}, state.currentListCriteriaDefinitions);
                            // Render tags based on list's availableTags
                            uiUtils.renderTagCheckboxes(dynamicTagContainer, listData.availableTags || [], []);
                            uiUtils.clearPreviewGlobal(imagePreviewContainerReview, photoUrlInputReview, photoFileInputReview);
                            state.selectedFileForUpload = null;
                            state.currentSelectedPlaceInfo = null;
                        }
                    })
                    .catch(error => {
                        console.error("REVIEW-FORM: Error al cargar datos de la lista (Firestore):", error);
                        if (formTitle) formTitle.textContent = "Error al cargar formulario";
                    });
            }

            reviewForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = reviewForm.querySelector('.submit-button');
                if (submitButton) submitButton.disabled = true;
                
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    alert("Debes estar autenticado para guardar una reseña.");
                    if (submitButton) submitButton.disabled = false;
                    return;
                }

                const formData = new FormData(reviewForm);
                const reviewDataPayload = {
                    userId: currentUser.uid,
                    // itemId: Reference (items/{itemId}) // Needs to be determined from form (restaurant/dish)
                    // businessId: Reference (businesses/{businessId}) // Needs to be determined
                    // For now, let's keep restaurant/dish as text, but ideally they link to items/businesses
                    // restaurant: restaurantNameHiddenInput.value, (No longer in review model, should be part of item/business)
                    // dish: formData.get('dish'), (No longer in review model, should be part of item)
                    comment: formData.get('comment'),
                    scores: {},
                    // structuredTags: Array<String> // From listCategory.fixedStructuredTags or commonCriteria
                    userTags: formData.getAll('tags'), // From user selection
                    userTypeAtReview: "basico", // Get from user profile
                    likesCount: 0,
                    commentsCount: 0,
                    // overallRating will be calculated
                };

                // Populate scores based on form inputs (sliders)
                // The input names are like 'ratings[criterionKey]' from renderCriteriaSliders
                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('ratings[')) {
                        const criterionKey = key.substring(8, key.length - 1);
                        reviewDataPayload.scores[criterionKey] = parseFloat(value);
                    }
                }

                // Calculate overallRating based on ponderable scores from list's criteriaDefinition
                let totalWeightedScore = 0;
                let ponderableCriteriaCount = 0;
                for (const critKey in reviewDataPayload.scores) {
                    if (state.currentListCriteriaDefinitions[critKey]?.ponderable) {
                        totalWeightedScore += reviewDataPayload.scores[critKey];
                        ponderableCriteriaCount++;
                    }
                }
                reviewDataPayload.overallRating = ponderableCriteriaCount > 0 ? (totalWeightedScore / ponderableCriteriaCount) : 0;

                let finalImageUrl = photoUrlInputReview.value;

                if (state.selectedFileForUpload && storage) { // Use shared state & ListopicApp.services.storage
                    const user = auth.currentUser; // Use ListopicApp.services.auth
                    if (user) {
                        const fileName = `${Date.now()}-${state.selectedFileForUpload.name}`;
                        const storagePath = `reviews/${user.uid}/${fileName}`;
                        const storageRef = storage.ref(storagePath);
                        try {
                            const uploadTaskSnapshot = await storageRef.put(state.selectedFileForUpload);
                            finalImageUrl = await uploadTaskSnapshot.ref.getDownloadURL();
                        } catch (error) {
                            console.error('Error uploading image to Firebase Storage:', error);
                            alert(`Error uploading image: ${error.message}`);
                            if (submitButton) submitButton.disabled = false;
                            return; 
                        }
                    } else {
                        alert('User not authenticated, cannot upload image.');
                        if (submitButton) submitButton.disabled = false;
                        return;
                    }
                } else if (state.selectedFileForUpload) { // Fallback for local processing if storage not available (should not happen if firebaseService loaded)
                     try {
                        finalImageUrl = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = (e) => resolve(e.target.result);
                            reader.onerror = (e) => reject(new Error("Error al leer el archivo de imagen."));
                            reader.readAsDataURL(state.selectedFileForUpload);
                        });
                    } catch (imgError) {
                        console.error("Error procesando imagen a Data URL:", imgError);
                        alert(`Error al procesar la imagen: ${imgError.message}`);
                        if (submitButton) submitButton.disabled = false;
                        return;
                    }
                }
                
                if (finalImageUrl !== undefined) { // Check if finalImageUrl has a value (could be empty string from URL input)
                    reviewDataPayload.photoUrl = finalImageUrl;
                } else if (reviewIdToEdit && imagePreviewContainerReview.querySelector('img') && !state.selectedFileForUpload && !photoUrlInputReview.value) {
                    reviewDataPayload.photoUrl = firebase.firestore.FieldValue.delete(); // Remove the field
                }

                try {
                    const listRef = db.collection('lists').doc(listId);
                    let reviewListId = listId; // To be used in redirection

                    if (reviewIdToEdit) {
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await listRef.collection('reviews').doc(reviewIdToEdit).update(reviewDataPayload);
                    } else {
                        reviewDataPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await listRef.collection('reviews').add(reviewDataPayload);
                        // Optionally, update reviewCount on the list (better with Cloud Function)
                        // await listRef.update({ reviewCount: firebase.firestore.FieldValue.increment(1) });
                    }

                    alert(`Reseña ${reviewIdToEdit ? 'actualizada' : 'guardada'} con éxito!`);

                    // Update aggregated data on the 'item' object (Cloud Function candidate)
                    // For example, if you determine an itemId:
                    // const itemId = determineItemId(restaurantNameHiddenInput.value, formData.get('dish'));
                    // if (itemId) {
                    //   const itemRef = db.collection('items').doc(itemId);
                    //   // Cloud function would listen to review changes and update:
                    //   // itemRef.update({
                    //   //   averageOverallRating: newAverage,
                    //   //   reviewCount: firebase.firestore.FieldValue.increment(1),
                    //   //   averageScores: newAverageScoresMap,
                    //   //   popularTags: updatedPopularTagsArray
                    //   // });
                    // }

                    const fromGrouped = urlParams.get('fromGrouped');
                    const fromRestaurant = urlParams.get('fromRestaurant');
                    const fromDish = urlParams.get('fromDish');
                    if (fromGrouped === 'true' && fromRestaurant) {
                        window.location.href = `grouped-detail-view.html?listId=${reviewListId}&restaurant=${fromRestaurant}&dish=${fromDish || ''}`;
                    } else {
                        window.location.href = `list-view.html?listId=${reviewListId}`;
                    }

                } catch (error) {
                    console.error('Error al guardar la reseña:', error);
                    alert(`No se pudo guardar la reseña: ${error.message}`);
                } finally {
                    if (submitButton) submitButton.disabled = false;
                }
            });
        } else {
            console.warn("REVIEW-FORM: reviewForm element not found.");
        }
        // --- End of code moved from app.js ---
    }

    return {
        init
    };
})();
