window.ListopicApp = window.ListopicApp || {};
ListopicApp.state = ListopicApp.state || {};

ListopicApp.pageReviewForm = (() => {
    const state = ListopicApp.state;

    function getServices() {
        return window.ListopicApp?.services || {};
    }

    function notify(message, type = 'info') {
        const services = getServices();
        if (typeof services.showNotification === 'function') {
            services.showNotification(message, type);
        } else {
            const logger = type === 'error' ? console.error : console.log;
            logger(`[ReviewForm] ${message}`);
        }
    }

    function setPlaceStatus(type, message, options = {}) {
        const uiUtils = window.ListopicApp?.uiUtils;
        if (uiUtils && typeof uiUtils.setPlaceSelectionStatus === 'function') {
            uiUtils.setPlaceSelectionStatus(type, message, options);
        }
    }

    function clearPlaceSelectionIndicators() {
        const input = document.getElementById('restaurant-name-search-input');
        if (input) {
            delete input.dataset.placeSelected;
            const group = input.closest('.form-group');
            if (group) {
                group.classList.remove(
                    'place-found',
                    'place-status-loading',
                    'place-status-success',
                    'place-status-error',
                    'place-status-info'
                );
            }
        }
        setPlaceStatus('info', '');
    }

    function renderTags(availableTags = [], selectedTags = [], fixedTags = []) {
        const container = document.getElementById('dynamic-tag-selection');
        if (!container) {
            console.warn('[ReviewForm] Contenedor de etiquetas no encontrado.');
            return;
        }

        container.innerHTML = '';

        const normalize = (tags) => Array.isArray(tags) ? [...new Set(tags.map(tag => String(tag)))] : [];
        const fixed = normalize(fixedTags);
        const userTags = normalize(availableTags).filter(tag => !fixed.includes(tag));
        const selected = normalize(selectedTags);

        const createTagCheckbox = (tag, { disabled = false } = {}) => {
            const label = document.createElement('label');
            label.className = 'tag-checkbox';
            if (disabled) {
                label.classList.add('tag-checkbox--fixed');
                label.title = 'Etiqueta fija de la categoría';
            }

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'tags';
            input.value = tag;
            input.checked = disabled || selected.includes(tag);
            input.disabled = disabled;

            const span = document.createElement('span');
            span.textContent = tag;

            input.addEventListener('change', () => {
                label.classList.toggle('selected', input.checked);
            });

            label.classList.toggle('selected', input.checked);
            label.append(input, span);
            return label;
        };

        if (fixed.length > 0) {
            const fixedContainer = document.createElement('div');
            fixedContainer.className = 'fixed-tags-container';
            fixedContainer.innerHTML = '<h5>Etiquetas fijas</h5>';
            fixed.forEach(tag => fixedContainer.appendChild(createTagCheckbox(tag, { disabled: true })));
            container.appendChild(fixedContainer);
        }

        if (userTags.length > 0) {
            const userContainer = document.createElement('div');
            userContainer.className = 'user-tags-container';
            userContainer.innerHTML = '<h5>Elige tus etiquetas</h5>';
            userTags.forEach(tag => userContainer.appendChild(createTagCheckbox(tag)));
            container.appendChild(userContainer);
        }

        if (!fixed.length && !userTags.length) {
            container.innerHTML = '<p class="helper-text subtle">No hay etiquetas disponibles para esta lista.</p>';
        }
    }

    function setupHelpModal() {
        const modal = document.getElementById('tips-modal');
        const openButton = document.getElementById('open-help-modal');
        const closeButton = document.getElementById('close-help-modal');
        const overlay = modal?.querySelector('[data-modal-dismiss]');
        if (!modal || !openButton) {
            return;
        }

        const openModal = () => {
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
        };

        const closeModal = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        };

        openButton.addEventListener('click', (event) => {
            event.preventDefault();
            openModal();
        });

        [closeButton, overlay].forEach((element) => {
            element?.addEventListener('click', (event) => {
                event.preventDefault();
                closeModal();
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) {
                closeModal();
            }
        });
    }

    function setupManualLocationToggle() {
        const toggleBtn = document.getElementById('toggle-manual-location-btn');
        const manualFields = document.getElementById('manual-location-fields');
        if (!toggleBtn || !manualFields) {
            return;
        }

        const icon = toggleBtn.querySelector('.toggle-icon i') || toggleBtn.querySelector('i');

        const setExpanded = (expanded) => {
            if (expanded) {
                manualFields.removeAttribute('hidden');
            } else {
                manualFields.setAttribute('hidden', '');
            }
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            if (icon) {
                icon.classList.toggle('fa-chevron-up', expanded);
                icon.classList.toggle('fa-chevron-down', !expanded);
            }
        };

        setExpanded(false);

        toggleBtn.addEventListener('click', (event) => {
            event.preventDefault();
            const isHidden = manualFields.hasAttribute('hidden');
            setExpanded(isHidden);
            if (isHidden) {
                manualFields.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        const addressBtn = document.getElementById('get-current-address-btn');
        if (addressBtn) {
            addressBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                if (!navigator.geolocation) {
                    notify('La geolocalización no está disponible en tu dispositivo.', 'warning');
                    return;
                }

                addressBtn.disabled = true;
                addressBtn.classList.add('is-loading');
                setPlaceStatus('loading', 'Obteniendo tu ubicación actual...');

                try {
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
                    });
                    const { latitude, longitude } = position.coords;
                    const latInput = document.getElementById('location-latitude');
                    const lonInput = document.getElementById('location-longitude');
                    if (latInput) latInput.value = latitude;
                    if (lonInput) lonInput.value = longitude;
                    notify('Coordenadas añadidas al formulario.', 'success');
                    setPlaceStatus('success', 'Coordenadas actuales añadidas.');
                } catch (error) {
                    console.error('[ReviewForm] Error obteniendo ubicación manual:', error);
                    notify('No se pudo obtener tu ubicación.', 'error');
                    setPlaceStatus('error', 'No se pudo obtener tu ubicación.');
                } finally {
                    addressBtn.disabled = false;
                    addressBtn.classList.remove('is-loading');
                }
            });
        }
    }

    function setupPlaceSearch() {
        const input = document.getElementById('restaurant-name-search-input');
        const searchBtn = document.getElementById('search-by-name-btn');
        const findNearbyBtn = document.getElementById('find-nearby-btn');
        const suggestionsBox = document.getElementById('restaurant-suggestions');

        if (input) {
            input.addEventListener('input', () => {
                clearPlaceSelectionIndicators();
                if (input.value.trim() === '' && suggestionsBox) {
                    suggestionsBox.innerHTML = '';
                    suggestionsBox.classList.remove('is-visible');
                }
            });

            input.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    searchBtn?.click();
                }
            });

            input.addEventListener('focus', () => {
                if (!input.dataset.placeSelected) {
                    setPlaceStatus('info', 'Busca un establecimiento o utiliza las acciones rápidas.');
                }
            });
        }

        if (searchBtn && input) {
            searchBtn.addEventListener('click', () => {
                const placesService = window.ListopicApp?.placesService;
                if (!placesService || typeof placesService.searchRestaurantsByName !== 'function') {
                    notify('El servicio de lugares no está disponible en este momento.', 'error');
                    return;
                }
                placesService.searchRestaurantsByName(input.value);
            });
        }

        if (findNearbyBtn) {
            findNearbyBtn.addEventListener('click', () => {
                const placesService = window.ListopicApp?.placesService;
                if (!placesService || typeof placesService.fetchNearbyRestaurantsWithContext !== 'function') {
                    notify('No pudimos iniciar la búsqueda de lugares cercanos.', 'error');
                    return;
                }
                placesService.fetchNearbyRestaurantsWithContext();
            });
        }
    }

    function setupUrlPreview(previewContainer, photoUrlInput, photoFileInput) {
        if (!photoUrlInput || !previewContainer) {
            return;
        }

        const renderImageFromUrl = (url) => {
            previewContainer.innerHTML = '';
            if (!url) {
                return;
            }
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Previsualización';
            img.onerror = () => {
                previewContainer.innerHTML = '<p class="loading-placeholder">No se pudo cargar la imagen desde la URL proporcionada.</p>';
            };
            previewContainer.appendChild(img);
        };

        photoUrlInput.addEventListener('input', () => {
            const value = photoUrlInput.value.trim();
            state.selectedFileForUpload = null;
            if (photoFileInput) {
                photoFileInput.value = '';
            }
            if (!value) {
                previewContainer.innerHTML = '';
                return;
            }
            renderImageFromUrl(value);
        });
    }

    function setupPhotoHandling() {
        const reviewForm = document.getElementById('review-form');
        if (!reviewForm) {
            return;
        }

        const photoFileInput = document.getElementById('photo-file');
        const imagePreviewContainer = reviewForm.querySelector('.image-preview');
        const photoUrlInput = document.getElementById('photo-url');
        const uploadArea = document.getElementById('image-drop-area');
        const galleryButton = document.getElementById('browse-gallery-btn');
        const useCameraButton = document.getElementById('use-camera-btn');
        const cameraCaptureInput = document.getElementById('photo-camera-capture');
        const uiUtils = window.ListopicApp?.uiUtils || {};

        if (!photoFileInput || !imagePreviewContainer || !photoUrlInput || !uploadArea) {
            console.warn('[ReviewForm] Elementos necesarios para la subida de imágenes no encontrados.');
            return;
        }

        const syncInputWithFile = (file) => {
            if (!window.DataTransfer || !file) {
                return;
            }
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            photoFileInput.files = dataTransfer.files;
        };

        const handleImageFile = async (file) => {
            if (!file) {
                return;
            }

            if (!file.type || !file.type.startsWith('image/')) {
                notify('El archivo seleccionado no es una imagen válida.', 'error');
                return;
            }

            try {
                imagePreviewContainer.innerHTML = '<p class="loading-placeholder">Comprimiendo imagen...</p>';
                const compressedFile = typeof uiUtils.compressImage === 'function'
                    ? await uiUtils.compressImage(file, {
                        maxWidth: 1600,
                        maxHeight: 1600,
                        quality: 0.72
                    })
                    : file;

                state.selectedFileForUpload = compressedFile;
                syncInputWithFile(compressedFile);
                const previewUrl = URL.createObjectURL(compressedFile);
                if (typeof uiUtils.showPreviewGlobal === 'function') {
                    uiUtils.showPreviewGlobal(previewUrl, imagePreviewContainer);
                } else {
                    imagePreviewContainer.innerHTML = `<img src="${previewUrl}" alt="Previsualización">`;
                }
                if (photoUrlInput) {
                    photoUrlInput.value = '';
                }
            } catch (error) {
                console.error('[ReviewForm] Error al procesar la imagen seleccionada:', error);
                notify('No se pudo procesar la imagen seleccionada.', 'error');
                imagePreviewContainer.innerHTML = '';
                state.selectedFileForUpload = null;
                if (photoFileInput) {
                    photoFileInput.value = '';
                }
            }
        };

        uploadArea.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('button')) {
                return;
            }
            photoFileInput.removeAttribute('capture');
            photoFileInput.click();
        });

        photoFileInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            handleImageFile(file);
        });

        cameraCaptureInput?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            handleImageFile(file);
            if (cameraCaptureInput) {
                cameraCaptureInput.value = '';
            }
        });

        const preventDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        ['dragenter', 'dragover'].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => {
                preventDefaults(event);
                uploadArea.classList.add('drag-over');
            });
        });

        ['dragleave', 'dragend'].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => {
                preventDefaults(event);
                uploadArea.classList.remove('drag-over');
            });
        });

        uploadArea.addEventListener('drop', (event) => {
            preventDefaults(event);
            uploadArea.classList.remove('drag-over');
            const files = Array.from(event.dataTransfer?.files || []);
            const file = files.find(candidate => candidate.type && candidate.type.startsWith('image/'));
            if (!file) {
                if (files.length) {
                    notify('Solo puedes arrastrar archivos de imagen en este espacio.', 'warning');
                }
                return;
            }
            handleImageFile(file);
        });

        setupUrlPreview(imagePreviewContainer, photoUrlInput, photoFileInput);

        galleryButton?.addEventListener('click', (event) => {
            event.preventDefault();
            if (!photoFileInput) {
                notify('No se pudo abrir el selector de imágenes.', 'error');
                return;
            }
            photoFileInput.removeAttribute('capture');
            photoFileInput.value = '';
            photoFileInput.click();
        });

        useCameraButton?.addEventListener('click', (event) => {
            event.preventDefault();

            const triggerStandaloneCaptureInput = () => {
                if (!cameraCaptureInput) {
                    return false;
                }
                cameraCaptureInput.value = '';
                cameraCaptureInput.click();
                return true;
            };

            if (triggerStandaloneCaptureInput()) {
                return;
            }

            if (photoFileInput) {
                const restoreCaptureAttribute = () => {
                    photoFileInput.removeAttribute('capture');
                    photoFileInput.removeEventListener('change', restoreCaptureAttribute);
                };

                photoFileInput.setAttribute('capture', 'environment');
                photoFileInput.addEventListener('change', restoreCaptureAttribute, { once: true });
                setTimeout(() => {
                    photoFileInput.removeAttribute('capture');
                }, 2000);

                photoFileInput.click();
                return;
            }

            if (navigator.mediaDevices?.getUserMedia) {
                notify('No pudimos abrir directamente la cámara. Concede permisos al navegador o usa la subida de archivos.', 'warning');
            } else {
                notify('Este dispositivo no permite acceder a la cámara desde el navegador.', 'error');
            }
        });
    }

    function setupMissingItemNameConfirmation() {
        const modal = document.getElementById('missing-item-modal');
        if (!modal) {
            return {
                confirm: () => Promise.resolve(true)
            };
        }

        const overlay = modal.querySelector('[data-missing-item-dismiss]');
        const cancelBtn = document.getElementById('missing-item-cancel');
        const confirmBtn = document.getElementById('missing-item-confirm');
        let resolver = null;

        const closeModal = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            resolver = null;
        };

        const openModal = () => {
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
        };

        const handleResult = (value) => {
            if (resolver) {
                resolver(value);
            }
            closeModal();
        };

        cancelBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            handleResult(false);
        });

        confirmBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            handleResult(true);
        });

        overlay?.addEventListener('click', (event) => {
            event.preventDefault();
            handleResult(false);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) {
                handleResult(false);
            }
        });

        return {
            confirm: () => {
                if (resolver) {
                    return Promise.resolve(false);
                }
                return new Promise((resolve) => {
                    resolver = resolve;
                    openModal();
                });
            }
        };
    }

    async function prefillPlaceFromId(placeId) {
        if (!placeId) {
            return;
        }
        const services = getServices();
        const db = services.db;
        const uiUtils = window.ListopicApp?.uiUtils;
        if (!db || !uiUtils || typeof uiUtils.updateReviewFormWithPlace !== 'function') {
            return;
        }
        try {
            const placeDoc = await db.collection('places').doc(placeId).get();
            if (placeDoc.exists) {
                const placeDataWithId = { id: placeDoc.id, ...placeDoc.data() };
                uiUtils.updateReviewFormWithPlace(placeDataWithId);
            }
        } catch (error) {
            console.warn('[ReviewForm] No se pudo precargar la información del lugar:', error);
        }
    }

    async function hydrateForm({ listId, reviewId, prefillPlaceId, prefillItemName }) {
        const services = getServices();
        const db = services.db;
        const uiUtils = window.ListopicApp?.uiUtils;
        const reviewForm = document.getElementById('review-form');
        if (!db || !reviewForm) {
            return;
        }

        const formTitle = reviewForm.parentElement?.querySelector('h1');
        const itemNameInput = document.getElementById('item-name');
        const criteriaContainer = document.getElementById('dynamic-rating-criteria');

        try {
            const listRef = db.collection('lists').doc(listId);
            const listPromise = listRef.get();
            const reviewPromise = reviewId ? listRef.collection('reviews').doc(reviewId).get() : Promise.resolve(null);

            const [listSnap, reviewSnap] = await Promise.all([listPromise, reviewPromise]);
            if (!listSnap.exists) {
                throw new Error('Datos de la lista no encontrados.');
            }

            const listData = listSnap.data() || {};
            state.currentListCategoryId = typeof listData.categoryId === 'string' ? listData.categoryId : null;
            const listCategoryTypes = Array.isArray(listData.categoryGooglePlaceTypes)
                ? listData.categoryGooglePlaceTypes
                : Array.isArray(listData.categoryGoogleTypes)
                    ? listData.categoryGoogleTypes
                    : null;
            const singleCategoryType = typeof listData.categoryGooglePlaceType === 'string'
                ? listData.categoryGooglePlaceType
                : null;
            const sanitizedCategoryTypes = Array.isArray(listCategoryTypes)
                ? listCategoryTypes.filter(type => typeof type === 'string' && type.trim())
                : [];
            if (sanitizedCategoryTypes.length) {
                state.currentListCategoryGoogleTypes = sanitizedCategoryTypes;
            } else if (singleCategoryType && singleCategoryType.trim()) {
                state.currentListCategoryGoogleTypes = [singleCategoryType.trim()];
            } else {
                state.currentListCategoryGoogleTypes = null;
            }
            state.currentListNameForSearch = listData.name || '';
            state.currentListCriteriaDefinitions = listData.criteriaDefinition || {};

            if (formTitle) {
                formTitle.textContent = reviewId
                    ? `Editar Reseña para ${listData.name || ''}`
                    : `Añadir Nueva Reseña a ${listData.name || ''}`;
            }

            if (prefillItemName && itemNameInput && !reviewId) {
                itemNameInput.value = prefillItemName;
            }

            if (prefillPlaceId && !reviewId) {
                await prefillPlaceFromId(prefillPlaceId);
            }

            const availableTags = Array.isArray(listData.availableTags)
                ? listData.availableTags
                : Array.isArray(listData.tagsDefinition?.userAvailable)
                    ? listData.tagsDefinition.userAvailable
                    : [];
            const fixedTags = Array.isArray(listData.fixedTags)
                ? listData.fixedTags
                : Array.isArray(listData.tagsDefinition?.fixed)
                    ? listData.tagsDefinition.fixed
                    : [];

            let reviewData = null;
            if (reviewSnap && reviewSnap.exists) {
                reviewData = reviewSnap.data();
            } else if (reviewId) {
                notify('No se encontró la reseña que intentas editar.', 'error');
            }

            if (criteriaContainer && uiUtils && typeof uiUtils.renderCriteriaSliders === 'function') {
                uiUtils.renderCriteriaSliders(criteriaContainer, reviewData?.scores || {}, state.currentListCriteriaDefinitions);
            } else if (criteriaContainer) {
                criteriaContainer.innerHTML = '<p class="helper-text subtle">No hay criterios definidos para esta lista.</p>';
            }

            renderTags(availableTags, reviewData?.userTags || [], fixedTags);

            if (reviewData) {
                if (itemNameInput) {
                    itemNameInput.value = reviewData.itemName || '';
                }
                const commentInput = document.getElementById('comment');
                if (commentInput) {
                    commentInput.value = reviewData.comment || '';
                }
                const photoUrlInput = document.getElementById('photo-url');
                const preview = reviewForm.querySelector('.image-preview');
                if (reviewData.photoUrl && photoUrlInput) {
                    photoUrlInput.value = reviewData.photoUrl;
                    if (uiUtils && typeof uiUtils.showPreviewGlobal === 'function') {
                        uiUtils.showPreviewGlobal(reviewData.photoUrl, preview);
                    }
                }
                if (reviewData.placeId) {
                    await prefillPlaceFromId(reviewData.placeId);
                }
            } else {
                setPlaceStatus('info', 'Selecciona un lugar para comenzar a valorar.');
            }
        } catch (error) {
            console.error('[ReviewForm] Error cargando datos del formulario:', error);
            notify('No se pudo cargar la información de la lista.', 'error');
            if (formTitle) {
                formTitle.textContent = 'Error al cargar formulario';
            }
        }
    }

    function setupFormSubmission({ listId, reviewId, missingItemConfirm }) {
        const reviewForm = document.getElementById('review-form');
        if (!reviewForm) {
            return;
        }

        const services = getServices();
        const db = services.db;
        const auth = services.auth;
        const storage = services.storage;
        const uiUtils = window.ListopicApp?.uiUtils;

        reviewForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = reviewForm.querySelector('.submit-button');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.classList.add('is-loading');
            }

            try {
                const currentUser = auth?.currentUser;
                if (!currentUser) {
                    throw new Error('Debes iniciar sesión para guardar tu reseña.');
                }

                const itemNameInput = document.getElementById('item-name');
                const itemNameValue = itemNameInput ? itemNameInput.value.trim() : '';
                if (!itemNameValue) {
                    const proceed = await missingItemConfirm.confirm();
                    if (!proceed) {
                        throw new Error('Necesitas indicar qué estás valorando.');
                    }
                }

                const placeIdInput = document.getElementById('location-googlePlaceId');
                const placeIdValue = placeIdInput?.value || '';
                if (!placeIdValue) {
                    setPlaceStatus('error', 'Selecciona un establecimiento válido antes de guardar.');
                    throw new Error('Debes seleccionar un lugar válido antes de guardar.');
                }

                if (itemNameInput && itemNameInput.value !== itemNameValue) {
                    itemNameInput.value = itemNameValue;
                }

                const formData = new FormData(reviewForm);
                const reviewPayload = {
                    userId: currentUser.uid,
                    listId,
                    placeId: placeIdValue,
                    itemName: itemNameValue,
                    comment: formData.get('comment') || '',
                    scores: {},
                    userTags: formData.getAll('tags') || []
                };

                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('ratings[')) {
                        const ratingKey = key.substring(8, key.length - 1);
                        reviewPayload.scores[ratingKey] = parseFloat(value);
                    }
                }

                let totalWeightedScore = 0;
                let ponderableCriteriaCount = 0;
                if (uiUtils && state.currentListCriteriaDefinitions && typeof state.currentListCriteriaDefinitions === 'object') {
                    Object.entries(reviewPayload.scores).forEach(([criteriaKey, scoreValue]) => {
                        const definition = state.currentListCriteriaDefinitions[criteriaKey];
                        if (!definition || definition.ponderable === false) {
                            return;
                        }
                        totalWeightedScore += Number(scoreValue) || 0;
                        ponderableCriteriaCount += 1;
                    });
                }
                reviewPayload.overallRating = ponderableCriteriaCount > 0
                    ? parseFloat((totalWeightedScore / ponderableCriteriaCount).toFixed(2))
                    : 0;

                let finalImageUrl = (document.getElementById('photo-url')?.value || '').trim();
                if (state.selectedFileForUpload && storage?.ref) {
                    const file = state.selectedFileForUpload;
                    const fileName = `${Date.now()}-${file.name}`;
                    const storagePath = `reviews/${currentUser.uid}/${listId}/${fileName}`;
                    const storageRef = storage.ref(storagePath);
                    const uploadSnapshot = await storageRef.put(file);
                    finalImageUrl = await uploadSnapshot.ref.getDownloadURL();
                }

                if (finalImageUrl) {
                    reviewPayload.photoUrl = finalImageUrl;
                }

                const listRef = db.collection('lists').doc(listId);
                if (reviewId) {
                    reviewPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                    await listRef.collection('reviews').doc(reviewId).update(reviewPayload);
                    notify('Reseña actualizada con éxito.', 'success');
                } else {
                    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
                    reviewPayload.createdAt = timestamp;
                    reviewPayload.updatedAt = timestamp;
                    const newReviewRef = await listRef.collection('reviews').add(reviewPayload);
                    notify('Reseña guardada con éxito.', 'success');
                    if (window.ListopicApp?.archiveService?.handleReviewSubmission) {
                        const placeNameInputEl = document.getElementById('restaurant-name-search-input');
                        const placeNameValue = placeNameInputEl ? placeNameInputEl.value.trim() : '';
                        try {
                            await window.ListopicApp.archiveService.handleReviewSubmission({
                                userId: currentUser.uid,
                                listId,
                                listName: state.currentListNameForSearch || '',
                                placeId: placeIdValue,
                                placeName: placeNameValue,
                                placeImageUrl: reviewPayload.photoUrl || '',
                                itemName: reviewPayload.itemName || '',
                                reviewId: newReviewRef.id,
                                createdAt: Date.now()
                            });
                        } catch (archiveError) {
                            console.warn('[ReviewForm] No se pudo actualizar los archivos automáticamente:', archiveError);
                        }
                    }
                }

                window.location.href = `list-view.html?listId=${encodeURIComponent(listId)}`;
            } catch (error) {
                console.error('[ReviewForm] Error al guardar la reseña:', error);
                notify(error.message || 'No se pudo guardar la reseña.', 'error');
            } finally {
                const submitButton = reviewForm.querySelector('.submit-button');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.classList.remove('is-loading');
                }
            }
        });
    }

    function configureBackButton(listId, urlParams) {
        const backButton = document.querySelector('.form-card-header .back-button');
        if (!backButton) {
            return;
        }
        const fromGrouped = urlParams.get('fromGrouped');
        const fromEstablishment = urlParams.get('fromEstablishment');
        const fromItem = urlParams.get('fromItem');
        if (fromGrouped === 'true' && fromEstablishment) {
            const targetUrl = new URL('grouped-detail-view.html', window.location.origin);
            targetUrl.searchParams.set('listId', listId);
            targetUrl.searchParams.set('establishment', fromEstablishment);
            if (fromItem) {
                targetUrl.searchParams.set('item', fromItem);
            }
            backButton.href = `${targetUrl.pathname}${targetUrl.search}`;
        } else {
            backButton.href = `list-view.html?listId=${encodeURIComponent(listId)}`;
        }
    }

    function init() {
        console.log('[ReviewForm] Iniciando página de formulario de reseñas.');
        const services = getServices();
        if (!services.db || !services.auth) {
            console.error('[ReviewForm] Servicios esenciales no disponibles.');
            return;
        }

        const reviewForm = document.getElementById('review-form');
        if (!reviewForm) {
            console.error('[ReviewForm] Formulario principal no encontrado.');
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const listId = urlParams.get('listId');
        const prefillPlaceId = urlParams.get('placeId');
        const prefillItemName = urlParams.get('itemName');
        const reviewId = urlParams.get('editId');

        if (!listId) {
            notify('No se indicó la lista a la que pertenece la reseña.', 'error');
            console.error('[ReviewForm] listId no encontrado en la URL.');
            return;
        }

        state.currentListId = listId;
        state.selectedFileForUpload = null;
        state.currentListCategoryId = null;
        state.currentListCategoryGoogleTypes = null;

        const listIdInput = document.getElementById('review-form-listId');
        if (listIdInput) {
            listIdInput.value = listId;
        }

        configureBackButton(listId, urlParams);
        setupHelpModal();
        setupManualLocationToggle();
        setupPlaceSearch();
        setupPhotoHandling();
        const missingItemConfirm = setupMissingItemNameConfirmation();
        setPlaceStatus('info', 'Busca un establecimiento o utiliza las acciones rápidas.');

        hydrateForm({ listId, reviewId, prefillPlaceId, prefillItemName });
        setupFormSubmission({ listId, reviewId, missingItemConfirm });
    }

    return {
        init
    };
})();
