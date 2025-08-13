window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageReviewForm = (() => {

    // Las funciones de creación de lugares (findOrCreatePlace, etc.) han sido eliminadas.
    // La lógica ahora reside en el backend.

    // Se mantiene la función para renderizar etiquetas.
    function renderTags(availableTags = [], selectedTags = [], fixedTags = []) {
        const container = document.getElementById('dynamic-tag-selection');
        if (!container) return;
        container.innerHTML = '';

        const createTagCheckbox = (tag, isFixed) => {
            const label = document.createElement('label');
            label.className = 'tag-checkbox';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'tags';
            input.value = tag;
            input.checked = isFixed || selectedTags.includes(tag);
            input.disabled = isFixed;

            const span = document.createElement('span');
            span.textContent = tag;

            if(isFixed) {
                label.title = "Etiqueta fija de la categoría";
            }

            label.appendChild(input);
            label.appendChild(span);
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
        console.log('Initializing Review Form page logic - FINAL CORRECTED VERSION');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        const storage = ListopicApp.services.storage;
        const uiUtils = ListopicApp.uiUtils;
        const placesService = ListopicApp.placesService;
        const state = ListopicApp.state;
        const urlParams = new URLSearchParams(window.location.search);
        const listId = urlParams.get('listId');
        const reviewIdToEdit = urlParams.get('editId');

        // --- CORRECCIÓN CLAVE: Guardar el ID de la lista en el estado global ---
        if (listId) {
            state.currentListId = listId;
        } else {
            console.error("FATAL: listId no encontrado en la URL. El formulario no puede funcionar.");
            // Aquí podrías mostrar un mensaje de error al usuario en el DOM
            return;
        }

        const reviewForm = document.getElementById('review-form');
        
        if (reviewForm) {
            const formTitle = reviewForm.parentElement.querySelector('h2');
            const criteriaContainer = document.getElementById('dynamic-rating-criteria');
            const dynamicTagContainer = document.getElementById('dynamic-tag-selection');
            const imagePreviewContainerReview = reviewForm.querySelector('.image-preview');
            const photoUrlInputReview = document.getElementById('photo-url');
            const photoFileInputReview = document.getElementById('photo-file');
            const establishmentNameSearchInput = document.getElementById('restaurant-name-search-input');
            const itemNameInput = document.getElementById('item-name');
            const backButtonReview = reviewForm.parentElement.querySelector('a.back-button');

            // --- CORRECCIÓN CLAVE: Configurar el botón de "Volver" ---
            if (backButtonReview) {
                const fromGrouped = urlParams.get('fromGrouped');
                const fromEstablishment = urlParams.get('fromEstablishment');
                const fromItem = urlParams.get('fromItem');
                if (fromGrouped === 'true' && fromEstablishment) {
                    backButtonReview.href = `grouped-detail-view.html?listId=${listId}&establishment=${encodeURIComponent(fromEstablishment)}&item=${encodeURIComponent(fromItem || '')}`;
                } else {
                    backButtonReview.href = `list-view.html?listId=${listId}`;
                }
            }

            const findNearbyBtn = document.getElementById('find-nearby-btn');
            const searchByNameBtn = document.getElementById('search-by-name-btn');

            if (findNearbyBtn) {
                findNearbyBtn.addEventListener('click', () => placesService.fetchNearbyRestaurantsWithContext());
            }
            if (searchByNameBtn && establishmentNameSearchInput) {
                searchByNameBtn.addEventListener('click', () => placesService.searchRestaurantsByName(establishmentNameSearchInput.value));
                establishmentNameSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        placesService.searchRestaurantsByName(establishmentNameSearchInput.value);
                    }
                });
            }

            // Lógica de carga de datos de la lista y reseña
            db.collection('lists').doc(listId).get().then(doc => {
                if (!doc.exists) throw new Error("Datos de la lista no encontrados.");
                const listData = doc.data();
                state.currentListNameForSearch = listData.name || '';
                state.currentListCriteriaDefinitions = listData.criteriaDefinition || {};

                if (formTitle) formTitle.textContent = reviewIdToEdit ? `Editar Reseña para ${listData.name}` : `Añadir Nueva Reseña a ${listData.name}`;

                if (reviewIdToEdit) {
                    db.collection('lists').doc(listId).collection('reviews').doc(reviewIdToEdit).get().then(async reviewDoc => {
                        if (!reviewDoc.exists) throw new Error("Reseña para editar no encontrada.");
                        const reviewData = reviewDoc.data();
                        if (reviewData.placeId) {
                            const placeDoc = await db.collection('places').doc(reviewData.placeId).get();
                            if (placeDoc.exists) {
                                uiUtils.updateReviewFormWithPlace(placeDoc.data());
                            }
                        }
                        if (itemNameInput) itemNameInput.value = reviewData.itemName || '';
                        if (reviewData.photoUrl) {
                            uiUtils.showPreviewGlobal(reviewData.photoUrl, imagePreviewContainerReview);
                            if (photoUrlInputReview) photoUrlInputReview.value = reviewData.photoUrl;
                        }
                        const commentEl = document.getElementById('comment');
                        if(commentEl) commentEl.value = reviewData.comment || '';
                        uiUtils.renderCriteriaSliders(criteriaContainer, reviewData.scores || {}, state.currentListCriteriaDefinitions);
                        renderTags(listData.availableTags || [], reviewData.userTags || [], listData.fixedTags || []);
                    }).catch(error => console.error("Error al cargar la reseña para editar:", error));
                } else {
                    uiUtils.renderCriteriaSliders(criteriaContainer, {}, state.currentListCriteriaDefinitions);
                    renderTags(listData.availableTags || [], [], listData.fixedTags || []);
                }
            }).catch(error => {
                console.error("Error al cargar datos de la lista:", error);
                if(formTitle) formTitle.textContent = "Error al cargar formulario";
            });

            // Lógica de guardado simplificada
            reviewForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = reviewForm.querySelector('.submit-button');
                if (submitButton) submitButton.disabled = true;
                
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    ListopicApp.services.showNotification("Debes estar autenticado.", 'error');
                    if (submitButton) submitButton.disabled = false;
                    return;
                }

                try {
                    const placeIdToSave = document.getElementById('location-googlePlaceId').value;
                    if (!placeIdToSave) {
                        ListopicApp.services.showNotification("Error: Debes buscar y seleccionar un lugar válido.", 'error');
                        if (submitButton) submitButton.disabled = false;
                        return;
                    }

                    const formData = new FormData(reviewForm);
                    const reviewDataPayload = {
                        userId: currentUser.uid,
                        listId: listId,
                        placeId: placeIdToSave, 
                        itemName: document.getElementById('item-name').value,
                        comment: formData.get('comment'),
                        scores: {},
                        userTags: formData.getAll('tags'),
                    };

                    for (const [key, value] of formData.entries()) {
                        if (key.startsWith('ratings[')) {
                            reviewDataPayload.scores[key.substring(8, key.length - 1)] = parseFloat(value);
                        }
                    }
                    
                    let totalWeightedScore = 0;
                    let ponderableCriteriaCount = 0;
                    if (typeof state.currentListCriteriaDefinitions === 'object' && Object.keys(state.currentListCriteriaDefinitions).length > 0) {
                        for (const scoreKey in reviewDataPayload.scores) {
                            if (state.currentListCriteriaDefinitions[scoreKey]?.ponderable !== false) {
                                totalWeightedScore += reviewDataPayload.scores[scoreKey];
                                ponderableCriteriaCount++;
                            }
                        }
                    }
                    reviewDataPayload.overallRating = ponderableCriteriaCount > 0 ? parseFloat((totalWeightedScore / ponderableCriteriaCount).toFixed(2)) : 0;

                    let finalImageUrl = document.getElementById('photo-url').value.trim();
                    if (state.selectedFileForUpload && storage) {
                        const fileName = `${Date.now()}-${state.selectedFileForUpload.name}`;
                        const storagePath = `reviews/${currentUser.uid}/${listId}/${fileName}`;
                        const storageRef = storage.ref(storagePath);
                        finalImageUrl = await (await storageRef.put(state.selectedFileForUpload)).ref.getDownloadURL();
                    }

                    if (finalImageUrl) {
                        reviewDataPayload.photoUrl = finalImageUrl;
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
                    window.location.href = `list-view.html?listId=${listId}`;

                } catch (error) {
                    console.error('Error al guardar la reseña:', error);
                    ListopicApp.services.showNotification(`No se pudo guardar: ${error.message}`, 'error');
                    if (submitButton) submitButton.disabled = false;
                }
            });
        }
    }

    return {
        init
    };
})();
