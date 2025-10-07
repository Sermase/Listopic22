window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageReviewForm = (() => {

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

    function setupPhotoHandling() {
        const reviewForm = document.getElementById('review-form');
        if (!reviewForm) return;

        const photoFileInput = document.getElementById('photo-file');
        const imagePreviewContainer = reviewForm.querySelector('.image-preview');
        const photoUrlInput = document.getElementById('photo-url');
        const uploadArea = reviewForm.querySelector('.image-upload-area');
        const galleryButton = document.getElementById('browse-gallery-btn');
        const state = ListopicApp.state;
        const uiUtils = ListopicApp.uiUtils;

        if (!photoFileInput || !imagePreviewContainer || !photoUrlInput || !uploadArea) {
            console.warn("Faltan elementos de la UI para la subida de fotos.");
            return;
        }

        // Hacemos que el área principal de subida sea clickeable
        uploadArea.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && e.target.parentElement.tagName !== 'BUTTON') {
                photoFileInput.click();
            }
        });

        // Hacemos que el botón específico "Desde Galería" también funcione
        if (galleryButton) {
            galleryButton.addEventListener('click', () => {
                photoFileInput.click();
            });
        }

        const handleImageFile = async (file) => {
            if (!file) return;

            if (!file.type || !file.type.startsWith('image/')) {
                ListopicApp.services.showNotification('El archivo seleccionado no es una imagen válida.', 'error');
                return;
            }

            photoUrlInput.value = '';

            try {
                console.log(`📸 Imagen original: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

                imagePreviewContainer.innerHTML = '<p class="loading-placeholder">Comprimiendo imagen...</p>';

                const compressedFile = await uiUtils.compressImage(file, {
                    maxWidth: 1280,
                    maxHeight: 1280,
                    quality: 0.7
                });

                console.log(`✅ Imagen comprimida: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

                state.selectedFileForUpload = compressedFile;

                const previewUrl = URL.createObjectURL(compressedFile);
                uiUtils.showPreviewGlobal(previewUrl, imagePreviewContainer);

            } catch (error) {
                console.error("Error al comprimir la imagen:", error);
                ListopicApp.services.showNotification("Error al procesar la imagen.", 'error');
                if (uiUtils.clearPreviewGlobal) {
                    uiUtils.clearPreviewGlobal(imagePreviewContainer, photoUrlInput, photoFileInput);
                } else {
                    imagePreviewContainer.innerHTML = '';
                }
            }
        };

        const syncInputFiles = (file) => {
            if (!window.DataTransfer) return;
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            photoFileInput.files = dataTransfer.files;
        };

        // Gestionamos la selección del archivo y la compresión
        photoFileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            await handleImageFile(file);
        });

        const preventDragDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        ['dragenter', 'dragover'].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => {
                preventDragDefaults(event);
                uploadArea.classList.add('drag-over');
            });
        });

        ['dragleave', 'dragend'].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => {
                preventDragDefaults(event);
                uploadArea.classList.remove('drag-over');
            });
        });

        uploadArea.addEventListener('drop', async (event) => {
            preventDragDefaults(event);
            uploadArea.classList.remove('drag-over');

            const files = Array.from(event.dataTransfer?.files || []);
            const file = files.find((candidate) => candidate.type && candidate.type.startsWith('image/'));

            if (!file) {
                if (files.length) {
                    ListopicApp.services.showNotification('Solo se admiten imágenes en este apartado.', 'error');
                }
                return;
            }

            syncInputFiles(file);
            await handleImageFile(file);
        });

        // Gestionamos la entrada de URL
        photoUrlInput.addEventListener('input', () => {
            if (photoUrlInput.value.trim() !== '') {
                state.selectedFileForUpload = null;
                if (photoFileInput) photoFileInput.value = null;
                uiUtils.showPreviewGlobal(photoUrlInput.value.trim(), imagePreviewContainer);
            }
        });
    }

    function setupHelpModal() {
        const modal = document.getElementById('tips-modal');
        const openButton = document.getElementById('open-help-modal');
        if (!modal || !openButton) return;

        const closeButton = document.getElementById('close-help-modal');
        const overlay = modal.querySelector('[data-modal-dismiss]');
        let previouslyFocused = null;

        openButton.setAttribute('aria-expanded', 'false');

        const getFocusableElements = () => {
            return Array.from(modal.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
                .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
        };

        const closeModal = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            openButton.setAttribute('aria-expanded', 'false');
            document.removeEventListener('keydown', handleKeydown);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus({ preventScroll: true });
            }
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
                return;
            }
            if (event.key === 'Tab') {
                const focusable = getFocusableElements();
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey) {
                    if (document.activeElement === first || !modal.contains(document.activeElement)) {
                        event.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                }
            }
        };

        const openModal = () => {
            previouslyFocused = document.activeElement;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            openButton.setAttribute('aria-expanded', 'true');
            document.addEventListener('keydown', handleKeydown);
            const focusable = getFocusableElements();
            const target = focusable[0] || closeButton || modal;
            setTimeout(() => target.focus({ preventScroll: true }), 0);
        };

        openButton.addEventListener('click', () => {
            if (modal.classList.contains('is-open')) {
                closeModal();
            } else {
                openModal();
            }
        });

        if (closeButton) {
            closeButton.addEventListener('click', closeModal);
        }
        if (overlay) {
            overlay.addEventListener('click', closeModal);
        }
    }

    function setupMissingItemNameConfirmation() {
        const modal = document.getElementById('missing-item-modal');
        if (!modal) {
            return { confirm: async () => true };
        }

        const overlay = modal.querySelector('.confirm-modal__overlay');
        const cancelBtn = document.getElementById('missing-item-cancel');
        const confirmBtn = document.getElementById('missing-item-confirm');
        let resolver = null;
        let previouslyFocused = null;

        const getFocusableElements = () => {
            return Array.from(modal.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
        };

        const closeModal = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.removeEventListener('keydown', handleKeydown);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus({ preventScroll: true });
            }
        };

        const resolveAndClose = (value) => {
            if (resolver) {
                const currentResolver = resolver;
                resolver = null;
                currentResolver(!!value);
            }
            closeModal();
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                resolveAndClose(false);
                return;
            }
            if (event.key === 'Tab') {
                const focusable = getFocusableElements();
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey) {
                    if (document.activeElement === first || !modal.contains(document.activeElement)) {
                        event.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                }
            }
        };

        const openModal = () => {
            return new Promise(resolve => {
                resolver = resolve;
                previouslyFocused = document.activeElement;
                modal.classList.add('is-open');
                modal.setAttribute('aria-hidden', 'false');
                document.addEventListener('keydown', handleKeydown);
                const focusable = getFocusableElements();
                const target = confirmBtn || focusable[0] || cancelBtn || modal;
                if (target && typeof target.focus === 'function') {
                    setTimeout(() => target.focus({ preventScroll: true }), 0);
                }
            });
        };

        if (overlay) {
            overlay.addEventListener('click', () => resolveAndClose(false));
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (event) => {
                event.preventDefault();
                resolveAndClose(false);
            });
        }
        if (confirmBtn) {
            confirmBtn.addEventListener('click', (event) => {
                event.preventDefault();
                resolveAndClose(true);
            });
        }

        return {
            confirm: () => {
                if (resolver) {
                    return Promise.resolve(false);
                }
                return openModal();
            }
        };
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
        const prefillPlaceId = urlParams.get('placeId');
        const prefillItemName = urlParams.get('itemName');
        const reviewIdToEdit = urlParams.get('editId');

        if (listId) {
            state.currentListId = listId;
        } else {
            console.error("FATAL: listId no encontrado en la URL. El formulario no puede funcionar.");
            return;
        }

        const reviewForm = document.getElementById('review-form');
        
        if (reviewForm) {
            const missingItemConfirm = setupMissingItemNameConfirmation();
            const formTitle = reviewForm.parentElement.querySelector('h2');
            const criteriaContainer = document.getElementById('dynamic-rating-criteria');
            const establishmentNameSearchInput = document.getElementById('restaurant-name-search-input');
            const itemNameInput = document.getElementById('item-name');
            const backButtonReview = reviewForm.parentElement.querySelector('a.back-button');

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
            const toggleManualLocationBtn = document.getElementById('toggle-manual-location-btn');

            // Prefill desde URL: lugar e item
            if (prefillItemName && itemNameInput) {
                itemNameInput.value = prefillItemName;
            }
            if (prefillPlaceId && ListopicApp.services?.db) {
                try {
                    ListopicApp.services.db.collection('places').doc(prefillPlaceId).get()
                        .then(placeDoc => {
                            if (placeDoc.exists) {
                                const placeDataWithId = { id: placeDoc.id, ...placeDoc.data() };
                                uiUtils.updateReviewFormWithPlace(placeDataWithId);
                            }
                        })
                        .catch(e => console.warn('No se pudo precargar el lugar en el formulario', e));
                } catch (e) {
                    console.warn('No se pudo precargar el lugar en el formulario', e);
                }
            }

            if (toggleManualLocationBtn) {
                toggleManualLocationBtn.addEventListener('click', () => {
                    const manualFields = document.getElementById('manual-location-fields');
                    if (manualFields) {
                        const isVisible = manualFields.style.display === 'block';
                        manualFields.style.display = isVisible ? 'none' : 'block';
                        toggleManualLocationBtn.querySelector('i').classList.toggle('fa-chevron-down', isVisible);
                        toggleManualLocationBtn.querySelector('i').classList.toggle('fa-chevron-up', !isVisible);
                    }
                });
            }

            if (findNearbyBtn) {
                findNearbyBtn.addEventListener('click', () => {
                    const ps = window.ListopicApp?.placesService;
                    if (!ps) return console.error('placesService no disponible');
                    ps.fetchNearbyRestaurantsWithContext();
                });
            }
            if (searchByNameBtn && establishmentNameSearchInput) {
                searchByNameBtn.addEventListener('click', () => {
                    const ps = window.ListopicApp?.placesService;
                    if (!ps) return console.error('placesService no disponible');
                    ps.searchRestaurantsByName(establishmentNameSearchInput.value);
                });
                establishmentNameSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const ps = window.ListopicApp?.placesService;
                        if (!ps) return console.error('placesService no disponible');
                        ps.searchRestaurantsByName(establishmentNameSearchInput.value);
                    }
                });
                establishmentNameSearchInput.addEventListener('input', () => {
                    delete establishmentNameSearchInput.dataset.placeSelected;
                    const searchGroup = establishmentNameSearchInput.closest('.form-group');
                    if (searchGroup) {
                        searchGroup.classList.remove('place-found', 'place-status-loading', 'place-status-success', 'place-status-error', 'place-status-info');
                    }
                    const uiUtils = window.ListopicApp?.uiUtils;
                    if (uiUtils && typeof uiUtils.setPlaceSelectionStatus === 'function') {
                        uiUtils.setPlaceSelectionStatus('info', '');
                    }
                });
            }

            setupPhotoHandling();
            setupHelpModal();
            if (window.ListopicApp?.uiUtils && typeof window.ListopicApp.uiUtils.setPlaceSelectionStatus === 'function') {
                window.ListopicApp.uiUtils.setPlaceSelectionStatus('info', '');
            }

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
                                const placeDataWithId = { id: placeDoc.id, ...placeDoc.data() };
                                uiUtils.updateReviewFormWithPlace(placeDataWithId);
                            }
                        }
                        if (itemNameInput) itemNameInput.value = reviewData.itemName || '';
                        if (reviewData.photoUrl) {
                            uiUtils.showPreviewGlobal(reviewData.photoUrl, reviewForm.querySelector('.image-preview'));
                            const photoUrlInputReview = document.getElementById('photo-url');
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

            reviewForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = reviewForm.querySelector('.submit-button');
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.classList.add('is-loading');
                }

                const currentUser = auth.currentUser;
                if (!currentUser) {
                    ListopicApp.services.showNotification("Debes estar autenticado.", 'error');
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.classList.remove('is-loading');
                    }
                    return;
                }

                const itemNameValue = itemNameInput ? itemNameInput.value.trim() : '';
                if (!itemNameValue) {
                    const proceedWithoutName = await missingItemConfirm.confirm();
                    if (!proceedWithoutName) {
                        if (submitButton) {
                            submitButton.disabled = false;
                            submitButton.classList.remove('is-loading');
                        }
                        return;
                    }
                }

                try {
                    const placeIdToSave = document.getElementById('location-googlePlaceId').value;
                    const reviewIdToUse = urlParams.get('editId');

                    if (!placeIdToSave) {
                        ListopicApp.services.showNotification("Error: Debes buscar y seleccionar un lugar válido.", 'error');
                        if (submitButton) {
                            submitButton.disabled = false;
                            submitButton.classList.remove('is-loading');
                        }
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
                    if (reviewIdToUse) {
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await listRef.collection('reviews').doc(reviewIdToUse).update(reviewDataPayload);
                    } else {
                        reviewDataPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        reviewDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await listRef.collection('reviews').add(reviewDataPayload);
                    }

                    ListopicApp.services.showNotification(`Reseña ${reviewIdToUse ? 'actualizada' : 'guardada'} con éxito!`, 'success');
                    window.location.href = `list-view.html?listId=${listId}`;

                } catch (error) {
                    console.error('Error al guardar la reseña:', error);
                    ListopicApp.services.showNotification(`No se pudo guardar: ${error.message}`, 'error');
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.classList.remove('is-loading');
                    }
                }
            });
        }
    }

    return {
        init
    };
})();
