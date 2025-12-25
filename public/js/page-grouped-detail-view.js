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
        // Añadimos/quitamos una clase para poder ocultar las flechas con CSS
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

    async function ensureChartJs() {
        if (window.Chart) return window.Chart;
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.defer = true;
            script.onload = () => resolve(window.Chart);
            script.onerror = reject;
            document.head.appendChild(script);
        });
        return window.Chart;
    }

    async function computeListCriteriaAverages(listId) {
        const db = ListopicApp.services?.db;
        if (!db || !listId) {
            return { criteria: {}, overall: 0 };
        }

        const totals = {};
        const counts = {};
        let overallSum = 0;
        let overallCount = 0;

        const snapshot = await db.collection('lists').doc(listId).collection('reviews').get();
        snapshot.forEach((doc) => {
            const data = doc.data() || {};
            const overall = data.overallRating;
            if (typeof overall === 'number' && Number.isFinite(overall)) {
                overallSum += overall;
                overallCount += 1;
            }
            const scores = data.scores || {};
            Object.entries(scores).forEach(([key, value]) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    totals[key] = (totals[key] || 0) + value;
                    counts[key] = (counts[key] || 0) + 1;
                }
            });
        });

        const avgCriteria = {};
        Object.keys(totals).forEach((key) => {
            const count = counts[key] || 0;
            avgCriteria[key] = count > 0 ? (totals[key] / count) : 0;
        });

        const overall = overallCount > 0 ? (overallSum / overallCount) : 0;
        return { criteria: avgCriteria, overall };
    }

    function renderCriteriaRadar({
        container,
        canvas,
        averages,
        criteriaDefinition = {},
        chartsRegistry = {},
        criteriaOrder = [],
        referenceAverages = null,
        referenceLabel = 'Media de la lista',
        fallbackReference = 0
    }) {
        if (!container) return;
        if (!canvas) {
            container.innerHTML = '<p class="loading-placeholder">Sin datos de criterios.</p>';
            return;
        }

        const hasData = averages && Object.keys(averages).length > 0;
        if (!hasData) {
            container.innerHTML = '<p class="loading-placeholder">Sin datos de criterios.</p>';
            return;
        }

        container.querySelector('.loading-placeholder')?.remove();

        const keys = (Array.isArray(criteriaOrder) && criteriaOrder.length)
            ? criteriaOrder
            : (Object.keys(criteriaDefinition).length ? Object.keys(criteriaDefinition) : Object.keys(averages));
        const labels = keys.map(k => criteriaDefinition[k]?.label || k);
        const values = keys.map(k => Number(averages[k] || 0));
        const reference = keys.map((k) => {
            if (referenceAverages && typeof referenceAverages === 'object' && Object.prototype.hasOwnProperty.call(referenceAverages, k)) {
                return Number(referenceAverages[k] || 0);
            }
            return Number(fallbackReference || 0);
        });
        const gridColor = (getComputedStyle(document.body).getPropertyValue('--chart-grid-color') || 'rgba(255,255,255,0.08)').trim();

        // Cleanup previous chart
        if (chartsRegistry.criteriaRadar) {
            chartsRegistry.criteriaRadar.destroy();
        }

        ensureChartJs().then((Chart) => {
            const datasetColors = {
                current: 'rgba(92, 124, 250, 0.9)',
                currentFill: 'rgba(92, 124, 250, 0.20)',
                reference: 'rgba(61, 213, 152, 0.9)'
            };

            chartsRegistry.criteriaRadar = new Chart(canvas.getContext('2d'), {
                type: 'radar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Este elemento',
                            data: values,
                            fill: true,
                            backgroundColor: datasetColors.currentFill,
                            borderColor: datasetColors.current,
                            pointBackgroundColor: datasetColors.current,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        },
                        {
                            label: referenceLabel,
                            data: reference,
                            fill: false,
                            borderColor: datasetColors.reference,
                            pointBackgroundColor: datasetColors.reference,
                            borderDash: [6, 6],
                            pointRadius: 3,
                            pointHoverRadius: 5
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            displayColors: true,
                            usePointStyle: true,
                            callbacks: {
                                title: (items) => {
                                    const first = items?.[0];
                                    return first ? (first.label || '') : '';
                                },
                                label: (ctx) => {
                                    const val = ctx.parsed.r ?? ctx.raw;
                                    if (ctx.datasetIndex === 0) {
                                        return `Puntuación: ${Number(val).toFixed(1)}`;
                                    }
                                    const ref = reference?.[ctx.dataIndex] ?? val;
                                    return `${referenceLabel}: ${Number(ref).toFixed(1)}`;
                                },
                                labelColor: (ctx) => {
                                    const color = ctx.datasetIndex === 0 ? datasetColors.current : datasetColors.reference;
                                    return {
                                        borderColor: color,
                                        backgroundColor: color
                                    };
                                }
                            }
                        }
                    },
                    scales: {
                        r: {
                            min: 0,
                            max: 10,
                            ticks: {
                                backdropColor: 'transparent',
                                stepSize: 2,
                                color: 'transparent',
                                display: false
                            },
                            grid: {
                                color: gridColor
                            },
                            angleLines: {
                                color: gridColor
                            },
                            pointLabels: {
                                color: 'transparent',
                                font: {
                                    size: 0,
                                    weight: '600'
                                }
                            }
                        }
                    },
                    elements: {
                        line: {
                            borderWidth: 2,
                            tension: 0.25
                        }
                    }
                }
            });
        }).catch(() => {
            container.innerHTML = '<p class="loading-placeholder">No se pudo cargar el gráfico.</p>';
        });
    }
    
    async function initializeGroupedDetailView() {
        const state = ListopicApp.state;
        const db = ListopicApp.services.db;
        const uiUtils = ListopicApp.uiUtils;
        const chartsRegistry = window.ListopicApp._charts = window.ListopicApp._charts || {};

        const urlParams = new URLSearchParams(window.location.search);
        state.currentGroupDetailListId = urlParams.get('listId');
        const placeIdFromUrl = urlParams.get('placeId');
        state.currentGroupDetailItem = decodeURIComponent(urlParams.get('item') || '');

        // --- Elementos del DOM (NUEVOS y ANTIGUOS) ---
        const groupTitleTagEl = document.getElementById('group-title-tag');
        const groupItemTitleEl = document.getElementById('group-item-title');
        const listNameSubheaderEl = document.getElementById('list-name-subheader');
        const placeDetailLinkEl = document.getElementById('place-detail-link');
        const groupPlaceNameEl = document.getElementById('group-place-name');
        const groupPlaceImageEl = document.getElementById('group-place-image');
        const listopicRatingEl = document.getElementById('group-listopic-rating');
        const googleRatingChipEl = document.getElementById('group-google-rating-chip');
        const googleRatingValueEl = document.getElementById('group-google-rating');
        const gmapsLinkEl = document.getElementById('gmaps-link');
        const groupReviewPillEl = document.getElementById('group-review-pill');
        const groupPlaceCardEl = document.getElementById('group-place-card');
        const avgCriteriaBarsEl = document.getElementById('group-avg-criteria-bars');
        const criteriaRadarCanvas = document.getElementById('group-criteria-radar');
        const groupScoreChipEl = document.getElementById('group-score-chip');
        const groupImageGalleryEl = document.getElementById('group-image-gallery');
        const individualReviewsListEl = document.getElementById('individual-reviews-list');
        const saveToArchiveBtn = document.getElementById('group-save-to-archive-btn');
        const backToListButton = document.getElementById('back-to-list-view');
        const addGroupReviewBtn = document.getElementById('add-group-review-btn');
        let heroImageUrl = null;

        if (backToListButton) backToListButton.href = `list-view.html?listId=${state.currentGroupDetailListId || ''}`;


        if (!state.currentGroupDetailListId || !placeIdFromUrl) {
            const errorMsg = "Error: Faltan parámetros para cargar el detalle.";
            if (groupItemTitleEl) groupItemTitleEl.textContent = errorMsg;
            if (groupTitleTagEl) groupTitleTagEl.textContent = "Error";
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = `<p>${errorMsg}</p>`;
            ListopicApp.services.showNotification(errorMsg, "error");
            return;
        }

        try {
            // 1. Obtener datos de la lista y del lugar (en paralelo para más velocidad)
            const listPromise = db.collection('lists').doc(state.currentGroupDetailListId).get();
            const placePromise = db.collection('places').doc(placeIdFromUrl).get();
            const [listDoc, placeDoc] = await Promise.all([listPromise, placePromise]);

            if (!listDoc.exists) throw new Error("Lista de origen no encontrada.");
            if (!placeDoc.exists) throw new Error(`Lugar con ID ${placeIdFromUrl} no encontrado.`);

        const listData = listDoc.data();
        const placeData = { id: placeDoc.id, ...placeDoc.data() };
        
        state.currentGroupDetailListName = listData.name || 'Desconocida';

        // Normalizar definición de criterios y orden estable
        const rawCriteriaDef = listData.criteriaDefinition || {};
        let normalizedCriteriaDef = {};
        let criteriaOrder = [];
        if (Array.isArray(rawCriteriaDef)) {
            rawCriteriaDef.forEach((crit, idx) => {
                const key = crit?.key || crit?.id || `crit_${idx}`;
                if (!key) return;
                criteriaOrder.push(key);
                normalizedCriteriaDef[key] = {
                    label: crit?.label || key,
                    ...crit
                };
            });
        } else {
            const entries = Object.entries(rawCriteriaDef);
            if (entries.length) {
                entries.sort((a, b) => {
                    const orderA = typeof a[1]?.order === 'number' ? a[1].order : Number.MAX_SAFE_INTEGER;
                    const orderB = typeof b[1]?.order === 'number' ? b[1].order : Number.MAX_SAFE_INTEGER;
                    if (orderA !== orderB) return orderA - orderB;
                    return a[0].localeCompare(b[0]);
                });
                entries.forEach(([key, value]) => {
                    criteriaOrder.push(key);
                    normalizedCriteriaDef[key] = { label: value?.label || key, ...value };
                });
            }
        }
        if (!criteriaOrder.length && Object.keys(normalizedCriteriaDef).length) {
            criteriaOrder = Object.keys(normalizedCriteriaDef).sort();
        }
        state.currentGroupDetailCriteriaDefinition = normalizedCriteriaDef;
        state.currentGroupCriteriaOrder = criteriaOrder;

        const listCriteriaAveragesFromDoc = listData.criteriaAverages || {};
        let listCriteriaAverages = (listCriteriaAveragesFromDoc && typeof listCriteriaAveragesFromDoc === 'object')
            ? listCriteriaAveragesFromDoc
            : {};
        let listOverallAverage = Number.isFinite(listData.averageRating) ? listData.averageRating : 0;

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
                            labelEl.textContent = isSaved ? 'Archivo' : 'Guardar';
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
            const itemTitle = state.currentGroupDetailItem
                ? uiUtils.escapeHtml(state.currentGroupDetailItem)
                : uiUtils.escapeHtml(placeData.name || 'Elemento sin nombre');

            if (groupTitleTagEl) {
                const listName = state.currentGroupDetailListName || 'Grupo';
                groupTitleTagEl.textContent = listName;

                if (state.currentGroupDetailListId) {
                    const listHref = `list-view.html?listId=${encodeURIComponent(state.currentGroupDetailListId)}`;
                    groupTitleTagEl.href = listHref;
                    groupTitleTagEl.classList.remove('is-disabled');
                    groupTitleTagEl.setAttribute('title', `Ir a la lista ${listName}`);
                    groupTitleTagEl.setAttribute('aria-label', `Ir a la lista ${listName}`);
                } else {
                    groupTitleTagEl.removeAttribute('href');
                    groupTitleTagEl.classList.add('is-disabled');
                    groupTitleTagEl.removeAttribute('title');
                    groupTitleTagEl.removeAttribute('aria-label');
                }
            }
            if (groupItemTitleEl) {
                groupItemTitleEl.textContent = itemTitle;
            }
            if (listNameSubheaderEl) {
                listNameSubheaderEl.textContent = '';
            }
            if (addGroupReviewBtn && state.currentGroupDetailListId && placeData.id) {
                const href = `review-form.html?listId=${encodeURIComponent(state.currentGroupDetailListId)}&placeId=${encodeURIComponent(placeData.id)}&item=${encodeURIComponent(state.currentGroupDetailItem || placeData.name || '')}`;
                addGroupReviewBtn.href = href;
                addGroupReviewBtn.style.display = 'inline-flex';
            }

            if (placeDetailLinkEl) {
                if (placeData.id) {
                    placeDetailLinkEl.href = `place-detail.html?placeId=${placeData.id}`;
                    placeDetailLinkEl.classList.remove('is-disabled');
                } else {
                    placeDetailLinkEl.href = '#';
                    placeDetailLinkEl.classList.add('is-disabled');
                }
            }
            if (groupPlaceNameEl) {
                groupPlaceNameEl.textContent = placeData.name || 'Lugar no disponible';
            }
            if (groupPlaceCardEl && placeDetailLinkEl?.href) {
                const goToPlace = () => window.location.href = placeDetailLinkEl.href;
                groupPlaceCardEl.setAttribute('role', 'link');
                groupPlaceCardEl.setAttribute('tabindex', '0');
                groupPlaceCardEl.addEventListener('click', goToPlace);
                groupPlaceCardEl.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        goToPlace();
                    }
                });
            }
            if (groupPlaceImageEl) {
                const candidatePhotos = Array.isArray(placeData.photos) ? placeData.photos : [];
                let primaryImage = placeData.mainImageUrl || candidatePhotos[0] || 'img/listopic-logo.png';
                const hasGoogleId = placeData.googlePlaceId || placeData.placeId || placeData.google_place_id;
                if (hasGoogleId && uiUtils && typeof uiUtils.refreshPlacePhotoIfNeeded === 'function' &&
                    (!placeData.mainImageUrl || uiUtils.isLegacyGooglePhotoUrl(placeData.mainImageUrl))) {
                    try {
                        const refreshed = await uiUtils.refreshPlacePhotoIfNeeded({
                            ...placeData,
                            id: placeDoc.id || placeIdFromUrl
                        });
                        if (refreshed) {
                            primaryImage = refreshed;
                        }
                    } catch (error) {
                        console.warn('page-grouped-detail-view: no se pudo refrescar la imagen del lugar.', error);
                    }
                }
                groupPlaceImageEl.src = primaryImage;
                groupPlaceImageEl.alt = `Foto de ${placeData.name || 'lugar'}`;
                heroImageUrl = primaryImage;
            }
            if (gmapsLinkEl) {
                if (placeData.googleMapsUrl) {
                    gmapsLinkEl.href = placeData.googleMapsUrl;
                    gmapsLinkEl.style.display = 'inline-flex';
                } else {
                    gmapsLinkEl.style.display = 'none';
                }
            }
            const googleRating = typeof placeData.googleRating === 'number'
                ? placeData.googleRating
                : (typeof placeData.rating === 'number' ? placeData.rating : null);
            if (googleRatingValueEl && googleRatingChipEl) {
                if (Number.isFinite(googleRating)) {
                    googleRatingValueEl.textContent = googleRating.toFixed(1);
                    googleRatingChipEl.style.display = 'inline-flex';
                } else {
                    googleRatingChipEl.style.display = 'none';
                }
            }
            if (listopicRatingEl) {
                const initialListopic = Number.isFinite(placeData.averageRating) ? placeData.averageRating.toFixed(1) : '—';
                listopicRatingEl.textContent = initialListopic;
            }

            // 3. Obtener y enriquecer reseñas
            const reviewsSnapshot = await db
                .collection('lists')
                .doc(state.currentGroupDetailListId)
                .collection('reviews')
                .where('placeId', '==', placeIdFromUrl)
                .orderBy('createdAt', 'desc')
                .get();
            const targetItemName = (state.currentGroupDetailItem || '').trim();
            const normalizedTarget = targetItemName.toLowerCase();
            const isGeneralTarget = !targetItemName || normalizedTarget === 'general';
            const allEnrichedReviews = await uiUtils.enrichReviews(reviewsSnapshot.docs);
            const filterByItem = (reviews, { allowGeneralOnly } = {}) => reviews.filter(review => {
                const reviewItemName = (review.itemName || '').trim();
                const normalizedReviewItem = reviewItemName.toLowerCase();
                if (!allowGeneralOnly) {
                    return normalizedReviewItem === normalizedTarget;
                }
                return reviewItemName === '' || normalizedReviewItem === 'general';
            });

            let enrichedReviews = isGeneralTarget
                ? filterByItem(allEnrichedReviews, { allowGeneralOnly: true })
                : filterByItem(allEnrichedReviews);

            if (!enrichedReviews.length && targetItemName) {
                const placeName = typeof placeData.name === 'string' ? placeData.name.trim() : '';
                if (placeName && placeName.toLowerCase() === normalizedTarget) {
                    enrichedReviews = filterByItem(allEnrichedReviews, { allowGeneralOnly: true });
                }
            }

            // 4. Calcular estadísticas y medias de criterios
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
            if (heroImageUrl) {
                if (!state.lightboxImageUrls.includes(heroImageUrl)) {
                    state.lightboxImageUrls.unshift(heroImageUrl);
                }
                if (groupPlaceImageEl && !groupPlaceImageEl.dataset.lightboxBound) {
                    const openHeroLightbox = () => {
                        const currentIndex = state.lightboxImageUrls.indexOf(heroImageUrl);
                        if (currentIndex >= 0) {
                            openLightbox(currentIndex);
                        } else {
                            state.lightboxImageUrls.unshift(heroImageUrl);
                            openLightbox(0);
                        }
                    };

                    groupPlaceImageEl.dataset.lightboxBound = 'true';
                    groupPlaceImageEl.classList.add('is-clickable-lightbox');
                    groupPlaceImageEl.setAttribute('tabindex', '0');
                    groupPlaceImageEl.setAttribute('role', 'button');
                    groupPlaceImageEl.title = 'Ampliar imagen';
                    groupPlaceImageEl.setAttribute('aria-label', 'Ampliar imagen del lugar');
                    groupPlaceImageEl.addEventListener('click', openHeroLightbox);
                    groupPlaceImageEl.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                            event.preventDefault();
                            openHeroLightbox();
                        }
                    });
                }
            }
            
            // Renderizar estadísticas principales
            const groupAvgScore = enrichedReviews.length > 0 ? (totalOverallScoreSum / enrichedReviews.length) : 0;
            const avgScoreStr = groupAvgScore.toFixed(1);
            if (groupScoreChipEl) {
                const bubbleValueEl = groupScoreChipEl.querySelector('.score-value');
                if (bubbleValueEl) bubbleValueEl.textContent = avgScoreStr;
                groupScoreChipEl.classList.remove('is-good', 'is-mid', 'is-bad');
                const scoreNum = Number(groupAvgScore) || 0;
                if (scoreNum >= 8.5) {
                    groupScoreChipEl.classList.add('is-good');
                } else if (scoreNum >= 6) {
                    groupScoreChipEl.classList.add('is-mid');
                } else {
                    groupScoreChipEl.classList.add('is-bad');
                }
            }
            if (listopicRatingEl && enrichedReviews.length > 0) {
                listopicRatingEl.textContent = avgScoreStr;
            }
            if (groupReviewPillEl) {
                const countEl = groupReviewPillEl.querySelector('.count-value');
                const labelEl = groupReviewPillEl.querySelector('.label');
                if (countEl) countEl.textContent = enrichedReviews.length;
                if (labelEl) labelEl.textContent = enrichedReviews.length === 1 ? 'Reseña' : 'Reseñas';
            }

            const needsComputedAverages = !listCriteriaAverages || Object.keys(listCriteriaAverages).length === 0;
            if (needsComputedAverages) {
                try {
                    const { criteria = {}, overall = 0 } = await computeListCriteriaAverages(state.currentGroupDetailListId);
                    listCriteriaAverages = criteria;
                    if (!Number.isFinite(listOverallAverage) || listOverallAverage === 0) {
                        listOverallAverage = overall;
                    }
                } catch (error) {
                    console.warn('page-grouped-detail-view: no se pudieron calcular las medias de la lista', error);
                }
            }
            state.currentListCriteriaAverages = listCriteriaAverages;
            state.currentListOverallAverage = listOverallAverage;

            // 5. Renderizar RADAR DE CRITERIOS PROMEDIADAS
            if (avgCriteriaBarsEl) {
                const avgScores = {};
                const criteriaOrder = Array.isArray(state.currentGroupCriteriaOrder) && state.currentGroupCriteriaOrder.length
                    ? state.currentGroupCriteriaOrder
                    : Object.keys(state.currentGroupDetailCriteriaDefinition || {}).sort();
                criteriaOrder.forEach((key) => {
                    const total = criteriaTotals[key] || 0;
                    const count = criteriaCounts[key] || 0;
                    avgScores[key] = count > 0 ? (total / count) : 0;
                });
                state.currentGroupCriteriaOrder = criteriaOrder;
                state._lastGroupAvgScores = avgScores;
                state._lastGroupAvgScore = groupAvgScore;
                renderCriteriaRadar({
                    container: avgCriteriaBarsEl,
                    canvas: criteriaRadarCanvas,
                    averages: avgScores,
                    criteriaDefinition: state.currentGroupDetailCriteriaDefinition,
                    chartsRegistry,
                    criteriaOrder,
                    referenceAverages: state.currentListCriteriaAverages,
                    fallbackReference: state.currentListOverallAverage || groupAvgScore
                });
            }
            

            // ***** ¡AQUÍ ESTÁ EL CÓDIGO QUE FALTABA! *****
            // Renderizamos la galería Y AÑADIMOS LOS EVENT LISTENERS
            if (groupImageGalleryEl) {
                if (state.lightboxImageUrls.length > 0) {
                    // 1. Creamos el HTML para cada imagen
                    groupImageGalleryEl.innerHTML = state.lightboxImageUrls.map((url, index) =>
                        `<img src="${uiUtils.escapeHtml(url)}" alt="Imagen de ${uiUtils.escapeHtml(placeData.name)}" class="gallery-thumbnail" data-lightbox-index="${index}">`
                    ).join('');
                    
                    // 2. AÑADIMOS EL "PEGAMENTO": Buscamos cada imagen y le decimos que abra el lightbox al hacer clic
                    groupImageGalleryEl.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                        thumb.addEventListener('click', (e) => {
                            const index = parseInt(e.target.dataset.lightboxIndex, 10);
                            if (!isNaN(index)) {
                                openLightbox(index);
                            }
                        });
                    });
                } else {
                    groupImageGalleryEl.innerHTML = '<p>No hay imágenes en este grupo.</p>';
                }
            }
            // ***********************************************

            if (individualReviewsListEl) {
                if (enrichedReviews.length > 0) {
                    const reviewQueue = enrichedReviews.slice();
                    uiUtils.setupLazyReviewList({
                        container: individualReviewsListEl,
                        batchSize: 5,
                        emptyMessage: '<p>No hay reseñas individuales para este ítem.</p>',
                        renderItem: (review) => uiUtils.renderReviewSuperCard(review),
                        loadBatch: async ({ batchSize }) => {
                            const chunk = reviewQueue.splice(0, batchSize);
                            return {
                                items: chunk,
                                hasMore: reviewQueue.length > 0
                            };
                        }
                    });
                } else {
                    individualReviewsListEl.innerHTML = '<p>No hay reseñas individuales para este ítem.</p>';
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



