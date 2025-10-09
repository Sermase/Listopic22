window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageGroupedDetailView = (() => {
    let currentLightboxImageIndex = 0;

    function openLightbox(index) {
        const lightboxModal = document.getElementById('image-lightbox');
        const lightboxImage = document.getElementById('lightbox-image');
        if (!lightboxModal || !lightboxImage || !ListopicApp.state.lightboxImageUrls || ListopicApp.state.lightboxImageUrls.length === 0) return;

        currentLightboxImageIndex = index;
        lightboxImage.src = ListopicApp.state.lightboxImageUrls[currentLightboxImageIndex];
        lightboxModal.style.display = 'flex';
        // AÃ±adimos/quitamos una clase para poder ocultar las flechas con CSS
        lightboxModal.classList.toggle('single-image', ListopicApp.state.lightboxImageUrls.length <= 1);
    }

    function closeLightbox() {
        const lightboxModal = document.getElementById('image-lightbox');
        if (lightboxModal) lightboxModal.style.display = 'none';
    }

    function changeLightboxImage(direction) {
        if (!ListopicApp.state.lightboxImageUrls || ListopicApp.state.lightboxImageUrls.length <= 1) return;
        currentLightboxImageIndex += direction;
        if (currentLightboxImageIndex >= ListopicApp.state.lightboxImageUrls.length) {
            currentLightboxImageIndex = 0;
        } else if (currentLightboxImageIndex < 0) {
            currentLightboxImageIndex = ListopicApp.state.lightboxImageUrls.length - 1;
        }
        const lightboxImage = document.getElementById('lightbox-image');
        if (lightboxImage) lightboxImage.src = ListopicApp.state.lightboxImageUrls[currentLightboxImageIndex];
    }
    
    async function initializeGroupedDetailView() {
        const state = ListopicApp.state;
        const db = ListopicApp.services.db;
        const uiUtils = ListopicApp.uiUtils;

        const urlParams = new URLSearchParams(window.location.search);
        state.currentGroupDetailListId = urlParams.get('listId');
        const placeIdFromUrl = urlParams.get('placeId');
        state.currentGroupDetailItem = decodeURIComponent(urlParams.get('item') || '');

        // --- Elementos del DOM (NUEVOS y ANTIGUOS) ---
        const groupTitleEl = document.getElementById('group-title');
        const listNameSubheaderEl = document.getElementById('list-name-subheader');
        const placeDetailLinkEl = document.getElementById('place-detail-link');
        const placeNameLinkTextEl = document.getElementById('place-name-link-text');
        const gmapsLinkEl = document.getElementById('gmaps-link');
        const groupAverageScoreEl = document.getElementById('group-average-score')?.querySelector('.score-value');
        const groupReviewCountEl = document.getElementById('group-review-count')?.querySelector('.count-value');
        const avgCriteriaBarsEl = document.getElementById('group-avg-criteria-bars');
        const groupImageGalleryEl = document.getElementById('group-image-gallery');
        const individualReviewsListEl = document.getElementById('individual-reviews-list');
        const saveToArchiveBtn = document.getElementById('group-save-to-archive-btn');
        const backToListButton = document.getElementById('back-to-list-view');

        if (backToListButton) backToListButton.href = `list-view.html?listId=${state.currentGroupDetailListId || ''}`;


        if (!state.currentGroupDetailListId || !placeIdFromUrl) {
            const errorMsg = "Error: Faltan parÃ¡metros para cargar el detalle.";
            if (groupTitleEl) groupTitleEl.textContent = errorMsg;
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = `<p>${errorMsg}</p>`;
            ListopicApp.services.showNotification(errorMsg, "error");
            return;
        }

        try {
            // 1. Obtener datos de la lista y del lugar (en paralelo para mÃ¡s velocidad)
            const listPromise = db.collection('lists').doc(state.currentGroupDetailListId).get();
            const placePromise = db.collection('places').doc(placeIdFromUrl).get();
            const [listDoc, placeDoc] = await Promise.all([listPromise, placePromise]);

            if (!listDoc.exists) throw new Error("Lista de origen no encontrada.");
            if (!placeDoc.exists) throw new Error(`Lugar con ID ${placeIdFromUrl} no encontrado.`);

            const listData = listDoc.data();
            const placeData = { id: placeDoc.id, ...placeDoc.data() };
            
            state.currentGroupDetailListName = listData.name || 'Desconocida';
            state.currentGroupDetailCriteriaDefinition = listData.criteriaDefinition || {};

            if (saveToArchiveBtn) {
                const archiveService = window.ListopicApp?.archiveService;
                if (archiveService && typeof archiveService.openSaveModal === 'function') {
                    const descriptor = {
                        entityType: 'group',
                        listId: state.currentGroupDetailListId,
                        placeId: placeData.id,
                        itemName: state.currentGroupDetailItem || placeData.name || 'Elemento',
                        title: state.currentGroupDetailItem || placeData.name || 'Elemento guardado',
                        subtitle: placeData.name || '',
                        imageUrl: placeData.mainImageUrl || '',
                        context: {
                            listName: state.currentGroupDetailListName || listData.name || '',
                            placeName: placeData.name || '',
                            placeId: placeData.id || null
                        }
                    };
                    const slugger = ListopicApp.uiUtils?.createAutomationSlug || ((value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '-'));
                    const itemSlug = slugger(descriptor.itemName || descriptor.title || '');
                    const entityKey = (descriptor.listId && descriptor.placeId && itemSlug)
                        ? `group:${descriptor.listId}:${descriptor.placeId}:${itemSlug}`
                        : null;
                    const iconEl = saveToArchiveBtn.querySelector('i');
                    const labelEl = saveToArchiveBtn.querySelector('span');
                    const applySavedState = (saved) => {
                        const isSaved = Boolean(saved);
                        saveToArchiveBtn.classList.toggle('is-archived', isSaved);
                        if (iconEl) {
                            iconEl.className = isSaved ? 'fas fa-check' : 'fas fa-bookmark';
                        }
                        if (labelEl) {
                            labelEl.textContent = isSaved ? 'Guardado' : 'Guardar';
                        }
                    };
                    applySavedState(false);
                    archiveService.isEntitySaved(descriptor).then(applySavedState).catch(() => applySavedState(false));
                    const appState = ListopicApp.state || {};
                    if (appState._groupArchiveEventHandler) {
                        window.removeEventListener('archive:updated', appState._groupArchiveEventHandler);
                    }
                    appState._groupArchiveEventHandler = (event) => {
                        if (!entityKey) {
                            return;
                        }
                        if (event.detail?.entityKey === entityKey) {
                            const ids = event.detail.archiveIds || [];
                            applySavedState(Array.isArray(ids) && ids.length > 0);
                        }
                    };
                    window.addEventListener('archive:updated', appState._groupArchiveEventHandler);
                    saveToArchiveBtn.style.display = 'inline-flex';
                    saveToArchiveBtn.onclick = () => {
                        try {
                            archiveService.openSaveModal({ ...descriptor });
                        } catch (error) {
                            console.error('[grouped-detail-view] Error al abrir El Archivo:', error);
                            window.ListopicApp?.services?.showNotification?.(error.message || 'No se pudo abrir El Archivo.', 'error');
                        }
                    };
                } else {
                    saveToArchiveBtn.style.display = 'none';
                }
            }

            // 2. Poblar la cabecera con datos del lugar y la lista
            let titleText = placeData.name || "Lugar Desconocido";
            if (state.currentGroupDetailItem) titleText += ` - ${uiUtils.escapeHtml(state.currentGroupDetailItem)}`;
            if (groupTitleEl) groupTitleEl.textContent = titleText;
            if (listNameSubheaderEl) listNameSubheaderEl.textContent = `En lista: ${uiUtils.escapeHtml(state.currentGroupDetailListName)}`;
            
            if (placeDetailLinkEl) {
                placeDetailLinkEl.href = `place-detail.html?placeId=${placeData.id}`;
                placeDetailLinkEl.style.display = 'inline-flex';
                if(placeNameLinkTextEl) placeNameLinkTextEl.textContent = `Ver pÃ¡gina de "${uiUtils.escapeHtml(placeData.name)}"`;
            }
            if (gmapsLinkEl && placeData.googleMapsUrl) {
                gmapsLinkEl.href = placeData.googleMapsUrl;
                gmapsLinkEl.style.display = 'inline-flex';
            }

            // 3. Obtener y enriquecer reseÃ±as (tu lÃ³gica anterior, que ya es correcta)
            let reviewsQuery = db.collection('lists').doc(state.currentGroupDetailListId).collection('reviews').where('placeId', '==', placeIdFromUrl);
            if (state.currentGroupDetailItem) {
                reviewsQuery = reviewsQuery.where('itemName', '==', state.currentGroupDetailItem);
            } else {
                reviewsQuery = reviewsQuery.where('itemName', 'in', ["", null]);
            }
            const reviewsSnapshot = await reviewsQuery.orderBy('createdAt', 'desc').get();
            const enrichedReviews = await uiUtils.enrichReviews(reviewsSnapshot.docs);

            // 4. Calcular estadÃ­sticas y medias de criterios
            let totalOverallScoreSum = 0;
            const criteriaTotals = {};
            const criteriaCounts = {};
            state.lightboxImageUrls = [];

            enrichedReviews.forEach(r => {
                totalOverallScoreSum += r.overallRating || 0;
                if (r.photoUrl) state.lightboxImageUrls.push(r.photoUrl);

                // Sumar puntuaciones de cada criterio
                for (const critKey in r.scores) {
                    criteriaTotals[critKey] = (criteriaTotals[critKey] || 0) + r.scores[critKey];
                    criteriaCounts[critKey] = (criteriaCounts[critKey] || 0) + 1;
                }
            });
            state.lightboxImageUrls = [...new Set(state.lightboxImageUrls)];
            
            // Renderizar estadÃ­sticas principales
            const groupAvgScore = enrichedReviews.length > 0 ? (totalOverallScoreSum / enrichedReviews.length) : 0;
            if (groupAverageScoreEl) groupAverageScoreEl.textContent = groupAvgScore.toFixed(1);
            if (groupReviewCountEl) groupReviewCountEl.textContent = enrichedReviews.length;

            // 5. Renderizar BARRAS DE CRITERIOS PROMEDIADAS
            if (avgCriteriaBarsEl) {
                const avgScores = {};
                for (const key in criteriaTotals) {
                    avgScores[key] = criteriaTotals[key] / criteriaCounts[key];
                }
                // Reutilizamos la lÃ³gica de renderizado de barras que ya tenemos en uiUtils
                avgCriteriaBarsEl.innerHTML = uiUtils.renderCriteriaBars(avgScores, state.currentGroupDetailCriteriaDefinition);
            }
            

            // ***** Â¡AQUÃ ESTÃ EL CÃ“DIGO QUE FALTABA! *****
            // Renderizamos la galerÃ­a Y AÃ‘ADIMOS LOS EVENT LISTENERS
            if (groupImageGalleryEl) {
                if (state.lightboxImageUrls.length > 0) {
                    // 1. Creamos el HTML para cada imagen
                    groupImageGalleryEl.innerHTML = state.lightboxImageUrls.map((url, index) =>
                        `<img src="${uiUtils.escapeHtml(url)}" alt="Imagen de ${uiUtils.escapeHtml(placeData.name)}" class="gallery-thumbnail" data-lightbox-index="${index}">`
                    ).join('');
                    
                    // 2. AÃ‘ADIMOS EL "PEGAMENTO": Buscamos cada imagen y le decimos que abra el lightbox al hacer clic
                    groupImageGalleryEl.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                        thumb.addEventListener('click', (e) => {
                            const index = parseInt(e.target.dataset.lightboxIndex, 10);
                            if (!isNaN(index)) {
                                openLightbox(index);
                            }
                        });
                    });
                } else {
                    groupImageGalleryEl.innerHTML = '<p>No hay imÃ¡genes en este grupo.</p>';
                }
            }
            // ***********************************************

            if (individualReviewsListEl) {
                if (enrichedReviews.length > 0) {
                    individualReviewsListEl.innerHTML = enrichedReviews.map(review => uiUtils.renderReviewSuperCard(review)).join('');
                } else {
                    individualReviewsListEl.innerHTML = '<p>No hay reseÃ±as individuales para este Ã­tem.</p>';
                }
            }

        } catch (error) {
            console.error("Error en initializeGroupedDetailView:", error);
            ListopicApp.services.showNotification(`Error al cargar detalles: ${error.message}`, "error");
        }
    }

    function init() {
        console.log('Initializing Grouped Detail View page logic...');
        initializeGroupedDetailView();

        // --- Event Listeners para el Lightbox ---
        const lightboxModal = document.getElementById('image-lightbox');
        if (lightboxModal) {
            lightboxModal.querySelector('.lightbox-close-button')?.addEventListener('click', closeLightbox);
            lightboxModal.querySelector('.lightbox-prev')?.addEventListener('click', () => changeLightboxImage(-1));
            lightboxModal.querySelector('.lightbox-next')?.addEventListener('click', () => changeLightboxImage(1));
            lightboxModal.addEventListener('click', (e) => {
                if (e.target === lightboxModal) closeLightbox();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === "Escape" && lightboxModal.style.display === 'flex') closeLightbox();
            });
        }
    }

    return {
        init
    };
})();
