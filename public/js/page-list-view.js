window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListView = (() => {
    // Variables de estado
    let currentSortColumn = 'avgGeneralScore';
    let currentSortDirection = 'desc';
    let activeTagFilters = new Set();
    let currentListIconClass = 'fa-solid fa-list';
    let currentFilteredGroups = [];
    let renderedGroupCount = 0;
    const PAGE_SIZE = 24;
    let loadMoreObserver = null;
    let isRenderingPage = false;
    let searchDebounceTimer = null;
    let itemsViewMode = 'list';
    let modalTagFilters = new Set();
    let filterPreviewTimer = null;
    const SCORE_MIN_DEFAULT = 0;
    const SCORE_MAX_DEFAULT = 10;

    // Variables del DOM
    let listTitleElement, reviewsGridContainer, searchInput,
    listViewToggleButtons, listSortSelect,
    addReviewButton, editListLink, deleteListButton, showMapModalBtn,
    followListBtn,
    mapModal, closeMapModalBtn, mapContainer, mapFiltersBtn, mapCenterUserBtn, listMapInstance,
    listLoadMoreContainer, listLoadMoreBtn, listLoadMoreStatus, listLoadMoreSentinel,
    scoreMinInput, scoreMaxInput, scoreMinOutput, scoreMaxOutput, scoreRangeLabel,
    criteriaFiltersWeightedEl, criteriaFiltersNonWeightedEl, tagFilterModalContainer,
    listFiltersModal, listFiltersApplyBtn, listFiltersClearBtn, listFiltersClearInlineBtn,
    filtersPreviewCountEl, filtersActiveCountBadge, tagFiltersClearBtn,
    listFilterToggleButtons, listFiltersPresetButtons, listFiltersDismissButtons;
    let listDistanceSelect = null;
    let distanceFilterKm = 10;
    let distanceCircle = null;
    let hasWarnedMissingGeoForDistance = false;

    let markersMap = new Map();
    let basePlacesForMap = [];
    let filteredPlaceIdsForMap = new Set();
    let filteredGroupsForMap = [];
    let shouldShowAllPlacesOnMap = true;
    let userLocationMarker = null;
    const placeLatLngCache = new Map();
    let forumModal, closeModalForumBtn, forumListNameSpan, forumMessagesContainer,
        newForumMessageInput, sendForumMessageBtn, messagesCollectionRef;

    // Estado inicial del mapa si viene codificado en la URL
    let initialMapParams = null; // { open, lat, lng, zoom }
    let isFollowingList = false;

    function setMapParamsInUrl(open, center, zoom, push=false) {
        try {
            const params = new URLSearchParams(window.location.search);
            if (open) {
                params.set('map', '1');
                if (center) {
                    params.set('mlat', center.lat.toFixed(6));
                    params.set('mlng', center.lng.toFixed(6));
                }
                if (typeof zoom === 'number') params.set('mzoom', String(zoom));
            } else {
                params.delete('map');
                params.delete('mlat');
                params.delete('mlng');
                params.delete('mzoom');
            }
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            if (push) window.history.pushState(null, '', newUrl); else window.history.replaceState(null, '', newUrl);
        } catch (e) { /* noop */ }
    }

    function readMapParamsFromUrl() {
        const p = new URLSearchParams(window.location.search);
        const open = p.get('map') === '1';
        if (!open) return { open: false };
        const lat = parseFloat(p.get('mlat'));
        const lng = parseFloat(p.get('mlng'));
        const zoom = parseInt(p.get('mzoom') || '0', 10);
        return {
            open: true,
            lat: isFinite(lat) ? lat : null,
            lng: isFinite(lng) ? lng : null,
            zoom: isFinite(zoom) ? zoom : null
        };
    }

    // Filtros extra y mapa de opciones de lugares
    const extraFiltersState = {
        placeOptionsMap: new Map(),
        placeOptionsLoaded: false,
        placeOptionsLoadPromise: null,
        filters: {
            wheelchairEntrance: false,
            wheelchairSeating: false,
            outdoor: false,
            dinein: false,
            delivery: false,
            takeout: false,
            curbside: false
        }
    };
    const EXTRA_FILTER_KEYS = ['wheelchairEntrance', 'wheelchairSeating', 'outdoor', 'dinein', 'delivery', 'takeout', 'curbside'];

    const listFilterState = {
        scoreMin: null,
        scoreMax: null,
        criteriaMin: {}
    };

    function updateAddReviewButtonHref(listId, listName) {
        if (!addReviewButton || !listId) return;
        const params = new URLSearchParams({ listId });
        if (listName) {
            params.set('itemName', listName);
        }
        addReviewButton.href = `review-form.html?${params.toString()}`;
    }


    const tileLayers = {
        light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    };
    let currentTileLayer = null; // Para guardar la capa de mapa actual    

    // --- ICONOS SVG PERSONALIZADOS PARA EL MAPA (VERSIÓN MEJORADA Y ÚNICA) ---

    const userLocationIconSvg = `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="7" fill="#118AB2" stroke="white" stroke-width="2"/>
        <circle cx="24" cy="24" r="12" stroke="#118AB2" stroke-width="2" stroke-opacity="0.9">
          <animate attributeName="r" from="12" to="22" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="12; 22"/>
          <animate attributeName="stroke-opacity" from="0.9" to="0" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="0.9; 0"/>
        </circle>
      </svg>
    `;

    // En page-list-view.js, reemplaza la función existente por esta:

    const createPlaceIconSvg = (score, color = '#118AB2') => {
        const textColor = 'white'; 
        const scoreText = (score || 0).toFixed(1);
        
        // Creamos un ID único para el gradiente
        const uniqueGradientId = `pinGradient_${String(score).replace('.', 'p')}_${Math.random().toString(36).substr(2, 5)}`;
    
        // Esta es la versión corregida SIN los comentarios que daban error
        return `
            <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="${uniqueGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:${color}; stop-opacity:1" />
                        <stop offset="100%" style="stop-color:black; stop-opacity:0.4" />
                    </linearGradient>
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
                    </filter>
                </defs>
                <path d="M20 0C9.5 0 1 8.5 1 19C1 31.5 18.5 48.5 20 50C21.5 48.5 39 31.5 39 19C39 8.5 30.5 0 20 0Z" 
                      fill="url(#${uniqueGradientId})" 
                      stroke="rgba(255,255,255,0.5)" 
                      stroke-width="1.5"
                      filter="url(#shadow)"/>
                <circle cx="20" cy="19" r="14" fill="white" fill-opacity="0.2"/>
                <text x="50%" y="43%" 
                      dominant-baseline="middle" 
                      text-anchor="middle" 
                      font-family="'Poppins', sans-serif" 
                      font-size="14" 
                      font-weight="700" 
                      fill="${textColor}"
                      style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                      ${scoreText}
                </text>
            </svg>
        `;
    };

    // En /public/js/page-list-view.js, reemplaza la función getIconByScore

    function getIconByScore(score) {
        const scoreNum = parseFloat(score) || 0;
    
        // ¡La magia! Obtenemos el color HEX correcto desde nuestro nuevo centro de mando.
        const color = ListopicApp.uiUtils.getRatingHexColor(scoreNum);
    
        // Llamamos a la función que crea el SVG, pasándole el color que hemos calculado.
        // La función createPlaceIconSvg que ya tienes está bien, no hay que tocarla.
        return L.divIcon({
            html: createPlaceIconSvg(scoreNum, color),
            className: '', 
            iconSize: [40, 50],
            iconAnchor: [20, 50],
            popupAnchor: [0, -50]
        });
    }
    
    // --- FIN DE LA SECCIÓN DE ICONOS ---

    // El resto de funciones (getListIconClass_ListView, renderReviewCards, etc.) se mantienen como las tienes
    // ...
    function getListIconClass_ListView(listName) {
        if (!listName) return 'fa-solid fa-list';
        const listNameLower = listName.toLowerCase();
        if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) return 'fa-solid fa-birthday-cake';
        if (listNameLower.includes('pizza')) return 'fa-solid fa-pizza-slice';
        if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) return 'fa-solid fa-hamburger';
        return 'fa-solid fa-list';
    }

    function handleCardImageError(imgElement) {
        if (!imgElement || imgElement.dataset.fallbackApplied === '1') return;
        imgElement.dataset.fallbackApplied = '1';
        const container = imgElement.closest('.review-list-card__image-container, .review-list-row__image-container');
        if (!container) return;
        container.innerHTML = '';
        const placeholder = document.createElement('div');
        placeholder.className = container.classList.contains('review-list-row__image-container')
            ? 'review-list-row__icon-placeholder'
            : 'review-list-card__icon-placeholder';
        const icon = document.createElement('i');
        icon.className = currentListIconClass || 'fas fa-camera';
        placeholder.appendChild(icon);
        container.appendChild(placeholder);
    }

    function buildGroupListRow(group) {
        const ui = ListopicApp.uiUtils;
        const placeNameRaw = group.establishmentName || group.placeName || group.place?.name || '';
        const itemNameRaw = group.itemName || group.item || group.itemTitle || group.item_label || '';
        const detailItemName = itemNameRaw || group.establishmentName || group.placeName || '';
        const detailUrl = ui.escapeHtml(ui.buildGroupedDetailUrl({
            listId: group.listId,
            placeId: group.placeId,
            itemName: detailItemName
        }));
        const placeName = ui.escapeHtml(placeNameRaw || 'Lugar');
        const itemName = ui.escapeHtml(itemNameRaw || 'Elemento');
        const cityRaw = group.placeCity
            || group.place?.city
            || group.place?.locationCity
            || group.place?.addressCity
            || group.placeProvince
            || group.place?.province
            || '';
        const cityName = cityRaw ? ui.escapeHtml(cityRaw) : '';
        const cityHtml = cityName
            ? `<span class="review-list-row__city" title="${cityName}"><i class="fas fa-location-dot" aria-hidden="true"></i>${cityName}</span>`
            : '';
        const scoreNumeric = typeof group.avgGeneralScore === 'number'
            ? group.avgGeneralScore
            : (parseFloat(group.avgGeneralScore) || 0);
        const scoreValue = scoreNumeric.toFixed(1);
        const scoreColor = ui.getRatingHexColor ? ui.getRatingHexColor(scoreNumeric) : null;
        const countValue = typeof group.itemCount === 'number'
            ? group.itemCount
            : parseInt(group.itemCount, 10) || 0;
        const thumb = group.thumbnailUrl
            || group.thumbUrl
            || group.photoUrl
            || group.imageUrl
            || group.mainImageUrl
            || group.placePhotoUrl
            || group.place?.mainImageUrl
            || '';
        const imageHtml = thumb
            ? `<img src="${ui.escapeHtml(thumb)}" alt="" class="review-list-row__image">`
            : `<div class="review-list-row__icon-placeholder"><i class="${currentListIconClass || 'fas fa-camera'}"></i></div>`;
        const safeGroupId = ui.escapeHtml(String(group.groupId || `${group.listId || 'list'}-${group.placeId || 'place'}-${itemNameRaw || 'item'}`));
        const cardAutomationId = ui.generateAutomationId('list-view-row', group.listId || 'list', group.placeId || 'place', itemNameRaw || group.establishmentName || 'item');

        const mapQuery = [placeNameRaw || itemNameRaw || 'Lugar', cityRaw].filter(Boolean).join(' ');
        const mapCandidate = typeof group.googleMapsUrl === 'string' ? group.googleMapsUrl.trim() : '';
        const mapUrlRaw = mapCandidate && mapCandidate !== '#'
            ? mapCandidate
            : (mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : '');
        const mapUrl = mapUrlRaw ? ui.escapeHtml(mapUrlRaw) : '';

        const reviewParams = new URLSearchParams();
        if (group.listId) reviewParams.set('listId', group.listId);
        if (group.placeId) reviewParams.set('placeId', group.placeId);
        const reviewItemNameRaw = itemNameRaw || placeNameRaw || '';
        if (reviewItemNameRaw) reviewParams.set('itemName', reviewItemNameRaw);
        const reviewHref = reviewParams.toString() ? `review-form.html?${reviewParams.toString()}` : 'review-form.html';
        const reviewUrl = ui.escapeHtml(reviewHref);

        const scoreStyle = scoreColor ? ` style="--score-color: ${ui.escapeHtml(scoreColor)};"` : '';
        return `
            <article class="review-list-row" role="button" tabindex="0"${scoreStyle} data-testid="${cardAutomationId}" data-entity-type="grouped-item" data-entity-id="${safeGroupId}" data-list-id="${ui.escapeHtml(String(group.listId || ''))}" data-place-id="${ui.escapeHtml(String(group.placeId || ''))}" data-item-name="${ui.escapeHtml(String(group.itemName || group.establishmentName || ''))}" data-detail-url="${detailUrl}" onclick="window.location.href=this.dataset.detailUrl;" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.href=this.dataset.detailUrl;}">
                <div class="review-list-row__image-container">${imageHtml}</div>
                <div class="review-list-row__main">
                    <div class="review-list-row__place">
                        <span class="review-list-row__place-name">${placeName}</span>
                        ${cityHtml}
                    </div>
                    <span class="review-list-row__item">${itemName}</span>
                </div>
                <div class="review-list-row__meta">
                    <div class="review-list-row__stats">
                        <span class="review-list-row__score">${scoreValue}</span>
                        <span class="review-list-row__count">${countValue} reseña${countValue === 1 ? '' : 's'}</span>
                    </div>
                    <div class="review-list-row__actions">
                        <a class="review-list-row__action review-list-row__action--map" href="${mapUrl}" target="_blank" rel="noopener" title="Abrir en Google Maps" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
                            <i class="fas fa-map-marked-alt" aria-hidden="true"></i>
                            <span>Mapa</span>
                        </a>
                        <a class="review-list-row__action review-list-row__action--rate" href="${reviewUrl}" title="Valorar" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
                            <i class="fas fa-star" aria-hidden="true"></i>
                            <span>Valorar</span>
                        </a>
                    </div>
                </div>
            </article>
        `;
    }

    function renderReviewCards(groupedItemsToRender, { append = false } = {}) {
        if (!reviewsGridContainer) return;
        if (!append) {
            reviewsGridContainer.innerHTML = '';
        }
        if (!groupedItemsToRender || groupedItemsToRender.length === 0) {
            if (!append) {
                reviewsGridContainer.innerHTML = '<p class="no-reviews-message">No hay elementos que coincidan.</p>';
            }
            return;
        }
        const listData = { criteriaDefinition: ListopicApp.state.currentListCriteriaDefinitions };
        const cardsHtml = groupedItemsToRender
            .map(group => (
                itemsViewMode === 'list'
                    ? buildGroupListRow(group)
                    : ListopicApp.uiUtils.createListViewGroupCard(group, listData, currentListIconClass)
            ))
            .join('');
        if (append) {
            reviewsGridContainer.insertAdjacentHTML('beforeend', cardsHtml);
        } else {
            reviewsGridContainer.innerHTML = cardsHtml;
        }
        reviewsGridContainer.querySelectorAll('.review-list-card__image, .review-list-row__image').forEach(img => {
            if (img.dataset.errorHandlerAttached === '1') return;
            img.dataset.errorHandlerAttached = '1';
            img.addEventListener('error', () => handleCardImageError(img));
            if (img.complete && img.naturalWidth === 0) {
                handleCardImageError(img);
            }
        });
    }

    function formatTagCount(value) {
        const numberValue = Number(value);
        if (!isFinite(numberValue)) return '0';
        return numberValue.toLocaleString('es-ES');
    }

    function getListSortConfig(rawValue) {
        const fallback = { type: 'score', direction: 'desc' };
        if (!rawValue || typeof rawValue !== 'string') return fallback;
        if (rawValue.startsWith('crit:')) {
            const parts = rawValue.split(':');
            return {
                type: 'criterion',
                key: parts[1] || '',
                direction: (parts[2] || 'desc').toLowerCase()
            };
        }
        const [type, direction] = rawValue.split('-');
        return {
            type: type || fallback.type,
            direction: (direction || fallback.direction).toLowerCase()
        };
    }

    function refreshListSortOptions() {
        if (!listSortSelect) return;
        const definitions = ListopicApp.state.currentListCriteriaDefinitions || {};
        const options = [
            { value: 'score-desc', label: 'Mejor nota' },
            { value: 'score-asc', label: 'Peor nota' },
            { value: 'reviews-desc', label: 'Mas resenas' },
            { value: 'reviews-asc', label: 'Menos resenas' },
            { value: 'place-asc', label: 'Lugar A-Z' },
            { value: 'place-desc', label: 'Lugar Z-A' },
            { value: 'item-asc', label: 'Elemento A-Z' },
            { value: 'item-desc', label: 'Elemento Z-A' }
        ];
        Object.entries(definitions).forEach(([key, def]) => {
            const label = def && def.label ? def.label : key;
            options.push({ value: `crit:${key}:desc`, label: `Criterio ${label} (mejor)` });
            options.push({ value: `crit:${key}:asc`, label: `Criterio ${label} (peor)` });
        });

        const currentValue = listSortSelect.value;
        listSortSelect.innerHTML = options
            .map(option => `<option value="${option.value}">${option.label}</option>`)
            .join('');
        listSortSelect.value = options.find(opt => opt.value === currentValue)?.value || options[0].value;
    }

    function getActiveFiltersCount() {
        let count = 0;
        if (listFilterState.scoreMin != null || listFilterState.scoreMax != null) count += 1;
        const criteriaCount = listFilterState.criteriaMin ? Object.keys(listFilterState.criteriaMin).length : 0;
        count += criteriaCount;
        count += activeTagFilters.size;
        const extraActive = Object.values(extraFiltersState.filters || {}).filter(Boolean).length;
        count += extraActive;
        return count;
    }

    function updateFiltersActiveCount() {
        if (!filtersActiveCountBadge) return;
        const count = getActiveFiltersCount();
        filtersActiveCountBadge.textContent = String(count);
        filtersActiveCountBadge.hidden = count === 0;
    }

    function formatScoreValue(value) {
        if (!isFinite(value)) return '';
        return Number(value).toFixed(1).replace(/\.0$/, '');
    }

    function updateScoreRangeLabels() {
        if (!scoreMinInput || !scoreMaxInput) return;
        const minVal = parseFloat(scoreMinInput.value);
        const maxVal = parseFloat(scoreMaxInput.value);
        const minLabel = formatScoreValue(isFinite(minVal) ? minVal : SCORE_MIN_DEFAULT);
        const maxLabel = formatScoreValue(isFinite(maxVal) ? maxVal : SCORE_MAX_DEFAULT);
        if (scoreMinOutput) scoreMinOutput.textContent = minLabel || String(SCORE_MIN_DEFAULT);
        if (scoreMaxOutput) scoreMaxOutput.textContent = maxLabel || String(SCORE_MAX_DEFAULT);
        if (scoreRangeLabel) {
            let label = 'Cualquiera';
            const hasMin = isFinite(minVal) && minVal > SCORE_MIN_DEFAULT;
            const hasMax = isFinite(maxVal) && maxVal < SCORE_MAX_DEFAULT;
            if (hasMin && hasMax) {
                label = `De ${minLabel} a ${maxLabel}`;
            } else if (hasMin) {
                label = `Desde ${minLabel}`;
            } else if (hasMax) {
                label = `Hasta ${maxLabel}`;
            }
            scoreRangeLabel.textContent = label;
        }
    }

    function setScoreRangeInputs(minValue, maxValue) {
        if (!scoreMinInput || !scoreMaxInput) return;
        const safeMin = isFinite(minValue) ? minValue : SCORE_MIN_DEFAULT;
        const safeMax = isFinite(maxValue) ? maxValue : SCORE_MAX_DEFAULT;
        scoreMinInput.value = String(safeMin);
        scoreMaxInput.value = String(safeMax);
        updateScoreRangeLabels();
    }

    function syncScoreRangeInputs() {
        const minValue = listFilterState.scoreMin != null ? listFilterState.scoreMin : SCORE_MIN_DEFAULT;
        const maxValue = listFilterState.scoreMax != null ? listFilterState.scoreMax : SCORE_MAX_DEFAULT;
        setScoreRangeInputs(minValue, maxValue);
    }

    function handleScoreRangeInput(source) {
        if (!scoreMinInput || !scoreMaxInput) return;
        let minValue = parseFloat(scoreMinInput.value);
        let maxValue = parseFloat(scoreMaxInput.value);
        if (!isFinite(minValue)) minValue = SCORE_MIN_DEFAULT;
        if (!isFinite(maxValue)) maxValue = SCORE_MAX_DEFAULT;
        if (minValue > maxValue) {
            if (source === 'min') {
                maxValue = minValue;
                scoreMaxInput.value = String(maxValue);
            } else {
                minValue = maxValue;
                scoreMinInput.value = String(minValue);
            }
        }
        updateScoreRangeLabels();
        scheduleFiltersPreview();
    }

    function setItemsViewMode(mode) {
        itemsViewMode = mode === 'list' ? 'list' : 'grid';
        if (reviewsGridContainer) {
            reviewsGridContainer.classList.toggle('reviews-grid-container--list', itemsViewMode === 'list');
        }
        if (listViewToggleButtons && listViewToggleButtons.length) {
            listViewToggleButtons.forEach(btn => {
                const isActive = btn.dataset.listView === itemsViewMode;
                btn.classList.toggle('is-active', isActive);
            });
        }
        if (currentFilteredGroups.length) {
            if (renderedGroupCount === 0) {
                renderNextPage();
            } else {
                const slice = currentFilteredGroups.slice(0, renderedGroupCount);
                renderReviewCards(slice, { append: false });
            }
        }
    }


    function renderCriteriaFilterControls() {
        if (!criteriaFiltersWeightedEl || !criteriaFiltersNonWeightedEl) return;
        const definitions = ListopicApp.state.currentListCriteriaDefinitions || {};
        const entries = Object.entries(definitions);
        criteriaFiltersWeightedEl.innerHTML = '';
        criteriaFiltersNonWeightedEl.innerHTML = '';

        if (!entries.length) {
            criteriaFiltersWeightedEl.innerHTML = '<p class="no-reviews-message">No hay criterios definidos.</p>';
            return;
        }

        const buildRow = (key, def, container) => {
            const min = typeof def.min === 'number' ? def.min : 0;
            const max = typeof def.max === 'number' ? def.max : 10;
            const step = typeof def.step === 'number' ? def.step : 0.5;
            const label = def.label || key;
            const value = listFilterState.criteriaMin[key] != null ? listFilterState.criteriaMin[key] : min;

            const row = document.createElement('div');
            row.className = 'list-filters-criteria__row';
            row.innerHTML = `
                <span class="list-filters-criteria__label">${ListopicApp.uiUtils.escapeHtml(label)}</span>
                <div class="list-filters-criteria__control">
                    <input type="range" class="list-filters-criteria__slider" min="${min}" max="${max}" step="${step}" value="${value}" data-criterion-key="${ListopicApp.uiUtils.escapeHtml(key)}" data-criterion-min="${min}">
                    <span class="list-filters-criteria__value">Cualquiera</span>
                </div>
            `;
            const slider = row.querySelector('.list-filters-criteria__slider');
            const valueEl = row.querySelector('.list-filters-criteria__value');
            const refreshLabel = () => {
                const numericValue = parseFloat(slider.value);
                valueEl.textContent = numericValue <= min ? 'Cualquiera' : numericValue.toFixed(1);
            };
            refreshLabel();
            slider.addEventListener('input', () => {
                refreshLabel();
                scheduleFiltersPreview();
            });
            container.appendChild(row);
        };

        entries.forEach(([key, def]) => {
            if (def && def.ponderable === false) {
                buildRow(key, def, criteriaFiltersNonWeightedEl);
            } else {
                buildRow(key, def, criteriaFiltersWeightedEl);
            }
        });

        if (!criteriaFiltersWeightedEl.children.length) {
            criteriaFiltersWeightedEl.innerHTML = '<p class="no-reviews-message">No hay criterios ponderados.</p>';
        }
        if (!criteriaFiltersNonWeightedEl.children.length) {
            criteriaFiltersNonWeightedEl.innerHTML = '<p class="no-reviews-message">No hay criterios sin ponderar.</p>';
        }
    }

    function syncCriteriaFilterInputs() {
        if (!criteriaFiltersWeightedEl || !criteriaFiltersNonWeightedEl) return;
        [criteriaFiltersWeightedEl, criteriaFiltersNonWeightedEl].forEach(container => {
            container.querySelectorAll('.list-filters-criteria__slider').forEach(slider => {
                const key = slider.dataset.criterionKey;
                const minValue = parseFloat(slider.dataset.criterionMin) || 0;
                const stored = listFilterState.criteriaMin[key];
                slider.value = stored != null ? stored : minValue;
                const valueEl = slider.closest('.list-filters-criteria__control')?.querySelector('.list-filters-criteria__value');
                if (valueEl) {
                    valueEl.textContent = slider.value <= minValue ? 'Cualquiera' : parseFloat(slider.value).toFixed(1);
                }
            });
        });
    }

    function renderTagFiltersModal() {
        if (!tagFilterModalContainer) return;
        tagFilterModalContainer.innerHTML = '';
        const rawTags = ListopicApp.state.currentListAvailableTags || [];
        const tags = [...new Set(rawTags.map(tag => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean))];
        if (!tags.length) {
            tagFilterModalContainer.innerHTML = '<p class="no-reviews-message">No hay etiquetas definidas.</p>';
            return;
        }
        const counts = new Map();
        const groups = ListopicApp.state._allGroupedItemsBase || [];
        groups.forEach(group => {
            (group.groupTags || []).forEach(tag => {
                const cleaned = typeof tag === 'string' ? tag.trim() : '';
                if (!cleaned) return;
                counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
            });
        });
        tags.forEach(tag => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'list-filter-chip';
            button.dataset.tag = tag;
            const safeTag = ListopicApp.uiUtils.escapeHtml(tag);
            const count = counts.get(tag) || 0;
            button.innerHTML = `<span>#${safeTag}</span><span class="list-filter-chip__count">${formatTagCount(count)}</span>`;
            button.addEventListener('click', () => {
                if (modalTagFilters.has(tag)) {
                    modalTagFilters.delete(tag);
                } else {
                    modalTagFilters.add(tag);
                }
                syncTagModalSelection();
                scheduleFiltersPreview();
            });
            tagFilterModalContainer.appendChild(button);
        });
        syncTagModalSelection();
    }

    function syncTagModalSelection() {
        if (!tagFilterModalContainer) return;
        tagFilterModalContainer.querySelectorAll('.list-filter-chip').forEach(button => {
            const tag = button.dataset.tag || '';
            const selected = modalTagFilters.has(tag);
            button.classList.toggle('is-active', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    function readTagModalSelection() {
        return new Set(modalTagFilters);
    }

    function syncExtraFilterToggles(filters = extraFiltersState.filters) {
        if (!listFilterToggleButtons || !listFilterToggleButtons.length) return;
        listFilterToggleButtons.forEach(button => {
            const key = button.dataset.filterToggle;
            if (!key) return;
            const isActive = !!filters?.[key];
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function readExtraFilterToggles() {
        const filters = {};
        EXTRA_FILTER_KEYS.forEach(key => { filters[key] = false; });
        if (!listFilterToggleButtons || !listFilterToggleButtons.length) return filters;
        listFilterToggleButtons.forEach(button => {
            const key = button.dataset.filterToggle;
            if (!key || !(key in filters)) return;
            filters[key] = button.classList.contains('is-active');
        });
        return filters;
    }

    function resetCriteriaSlidersToMin(container) {
        if (!container) return;
        container.querySelectorAll('.list-filters-criteria__slider').forEach(slider => {
            const minValue = parseFloat(slider.dataset.criterionMin) || parseFloat(slider.min) || 0;
            slider.value = String(minValue);
            const valueEl = slider.closest('.list-filters-criteria__control')?.querySelector('.list-filters-criteria__value');
            if (valueEl) valueEl.textContent = 'Cualquiera';
        });
    }

    function resetFiltersModal() {
        modalTagFilters = new Set();
        setScoreRangeInputs(SCORE_MIN_DEFAULT, SCORE_MAX_DEFAULT);
        resetCriteriaSlidersToMin(criteriaFiltersWeightedEl);
        resetCriteriaSlidersToMin(criteriaFiltersNonWeightedEl);
        if (listFilterToggleButtons && listFilterToggleButtons.length) {
            listFilterToggleButtons.forEach(button => {
                button.classList.remove('is-active');
                button.setAttribute('aria-pressed', 'false');
            });
        }
        syncTagModalSelection();
        scheduleFiltersPreview();
    }

    function syncFiltersModalFromState() {
        modalTagFilters = new Set(activeTagFilters);
        syncScoreRangeInputs();
        syncCriteriaFilterInputs();
        syncTagModalSelection();
        syncExtraFilterToggles(extraFiltersState.filters);
        updateScoreRangeLabels();
    }

    function readModalFiltersSnapshot() {
        let minValue = parseFloat(scoreMinInput?.value);
        let maxValue = parseFloat(scoreMaxInput?.value);
        if (!isFinite(minValue)) minValue = SCORE_MIN_DEFAULT;
        if (!isFinite(maxValue)) maxValue = SCORE_MAX_DEFAULT;
        if (minValue > maxValue) {
            const temp = minValue;
            minValue = maxValue;
            maxValue = temp;
        }
        const scoreMin = minValue > SCORE_MIN_DEFAULT ? minValue : null;
        const scoreMax = maxValue < SCORE_MAX_DEFAULT ? maxValue : null;

        const criteriaMin = {};
        const readCriteriaContainer = (container) => {
            if (!container) return;
            container.querySelectorAll('.list-filters-criteria__slider').forEach(slider => {
                const key = slider.dataset.criterionKey;
                if (!key) return;
                const min = parseFloat(slider.dataset.criterionMin) || 0;
                const value = parseFloat(slider.value);
                if (isFinite(value) && value > min) {
                    criteriaMin[key] = value;
                }
            });
        };
        readCriteriaContainer(criteriaFiltersWeightedEl);
        readCriteriaContainer(criteriaFiltersNonWeightedEl);

        return {
            scoreMin,
            scoreMax,
            criteriaMin,
            tags: readTagModalSelection(),
            extraFilters: readExtraFilterToggles()
        };
    }

    function applyFiltersSnapshot(snapshot) {
        listFilterState.scoreMin = snapshot.scoreMin;
        listFilterState.scoreMax = snapshot.scoreMax;
        listFilterState.criteriaMin = snapshot.criteriaMin || {};
        activeTagFilters = new Set(snapshot.tags || []);
        Object.assign(extraFiltersState.filters, snapshot.extraFilters || {});
        updateFiltersActiveCount();
        const state = ListopicApp.state || {};
        state.allGroupedItems = applyExtraPlaceFilters(state._allGroupedItemsBase || [], extraFiltersState.filters);
        applyFiltersAndSort_ListView_Grouped();
    }

    function filterGroupsWithSnapshot(groups, snapshot) {
        let scopedItems = Array.isArray(groups) ? groups : [];
        const searchTerm = (searchInput?.value || '').toLowerCase();

        if (searchTerm) {
            scopedItems = scopedItems.filter(group =>
                (group.establishmentName && group.establishmentName.toLowerCase().includes(searchTerm)) ||
                (group.itemName && group.itemName.toLowerCase().includes(searchTerm))
            );
        }

        if (typeof distanceFilterKm === "number" && isFinite(distanceFilterKm) && distanceFilterKm > 0) {
            const state = ListopicApp.state || {};
            const lat = typeof state.userLatitude === "number" ? state.userLatitude : NaN;
            const lng = typeof state.userLongitude === "number" ? state.userLongitude : NaN;
            if (isFinite(lat) && isFinite(lng) && window.L && typeof L.latLng === "function") {
                const userLatLng = L.latLng(lat, lng);
                const maxMeters = distanceFilterKm * 1000;
                scopedItems = scopedItems.filter(group => {
                    const placeId = group.placeId;
                    if (!placeId) return false;
                    const loc = getPlaceLatLng(placeId);
                    if (!loc) return false;
                    const dist = userLatLng.distanceTo(loc);
                    return dist <= maxMeters;
                });
            }
        }

        if (snapshot.scoreMin != null || snapshot.scoreMax != null) {
            scopedItems = scopedItems.filter(group => {
                const score = parseFloat(group.avgGeneralScore) || 0;
                if (snapshot.scoreMin != null && score < snapshot.scoreMin) return false;
                if (snapshot.scoreMax != null && score > snapshot.scoreMax) return false;
                return true;
            });
        }

        const criteriaKeys = snapshot.criteriaMin ? Object.keys(snapshot.criteriaMin) : [];
        if (criteriaKeys.length) {
            scopedItems = scopedItems.filter(group => {
                const scores = group.avgScores || {};
                for (const key of criteriaKeys) {
                    const minValue = snapshot.criteriaMin[key];
                    if (minValue == null) continue;
                    const value = parseFloat(scores[key]) || 0;
                    if (value < minValue) return false;
                }
                return true;
            });
        }

        const tagSet = snapshot.tags || new Set();
        if (tagSet.size > 0) {
            scopedItems = scopedItems.filter(group => {
                if (!group.groupTags || group.groupTags.length === 0) return false;
                return [...tagSet].every(filterTag => group.groupTags.includes(filterTag));
            });
        }

        return scopedItems;
    }

    function updateFiltersPreview() {
        if (!filtersPreviewCountEl) return;
        if (!listFiltersModal || !listFiltersModal.classList.contains('is-open')) return;
        const snapshot = readModalFiltersSnapshot();
        const baseGroups = ListopicApp.state?._allGroupedItemsBase || [];
        const filteredByExtras = applyExtraPlaceFilters(baseGroups, snapshot.extraFilters);
        const previewItems = filterGroupsWithSnapshot(filteredByExtras, snapshot);
        const previewCount = previewItems.length;
        filtersPreviewCountEl.textContent = formatTagCount(previewCount);
        if (listFiltersApplyBtn) {
            listFiltersApplyBtn.textContent = previewCount > 0
                ? `Aplicar filtros (${formatTagCount(previewCount)})`
                : 'Aplicar filtros';
        }
    }

    function scheduleFiltersPreview() {
        if (!listFiltersModal || !listFiltersModal.classList.contains('is-open')) return;
        if (filterPreviewTimer) window.clearTimeout(filterPreviewTimer);
        filterPreviewTimer = window.setTimeout(updateFiltersPreview, 140);
    }

    function updateLoadMoreUI() {
        if (!listLoadMoreContainer) return;
        const total = currentFilteredGroups.length;
        if (total === 0) {
            listLoadMoreContainer.style.display = 'none';
            return;
        }
        listLoadMoreContainer.style.display = '';
        const shown = Math.min(renderedGroupCount, total);
        if (listLoadMoreStatus) {
            listLoadMoreStatus.textContent = `Mostrando ${formatTagCount(shown)} de ${formatTagCount(total)}`;
        }
        if (listLoadMoreBtn) {
            listLoadMoreBtn.style.display = shown < total ? 'inline-flex' : 'none';
        }
    }

    function renderNextPage() {
        if (!reviewsGridContainer || isRenderingPage) return;
        const total = currentFilteredGroups.length;
        if (total === 0) {
            renderReviewCards([], { append: false });
            updateLoadMoreUI();
            return;
        }
        if (renderedGroupCount >= total) {
            updateLoadMoreUI();
            return;
        }
        isRenderingPage = true;
        const nextItems = currentFilteredGroups.slice(renderedGroupCount, renderedGroupCount + PAGE_SIZE);
        renderReviewCards(nextItems, { append: renderedGroupCount > 0 });
        renderedGroupCount += nextItems.length;
        updateLoadMoreUI();
        isRenderingPage = false;
    }

    function setupLoadMoreObserver() {
        if (!listLoadMoreSentinel || !('IntersectionObserver' in window)) return;
        if (loadMoreObserver) loadMoreObserver.disconnect();
        loadMoreObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    renderNextPage();
                }
            });
        }, { rootMargin: '200px 0px' });
        loadMoreObserver.observe(listLoadMoreSentinel);
    }

    async function ensureUserCoordsForDistance({ recenter = false } = {}) {
        const state = ListopicApp.state || (ListopicApp.state = {});
        if (typeof state.userLatitude === "number" && typeof state.userLongitude === "number") {
            return [state.userLatitude, state.userLongitude];
        }
        if (!navigator.geolocation) return null;
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    state.userLatitude = pos.coords.latitude;
                    state.userLongitude = pos.coords.longitude;
                    try { setUserLocationMarker(pos.coords.latitude, pos.coords.longitude, { recenter }); } catch (e) {}
                    resolve([pos.coords.latitude, pos.coords.longitude]);
                },
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 8000 }
            );
        });
    }

    function getPlaceLatLng(placeId) {
        if (!placeId) return null;
        if (placeLatLngCache.has(placeId)) return placeLatLngCache.get(placeId);

        const placeData =
            extraFiltersState.placeOptionsMap.get(placeId) ||
            basePlacesForMap.find((p) => p && p.id === placeId) ||
            null;
        const loc = placeData && placeData.location ? placeData.location : null;

        if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number" && window.L && typeof L.latLng === "function") {
            const latLng = L.latLng(loc.latitude, loc.longitude);
            placeLatLngCache.set(placeId, latLng);
            return latLng;
        }

        placeLatLngCache.set(placeId, null);
        return null;
    }

    function applyFiltersAndSort_ListView_Grouped() {
        const sourceItems = Array.isArray(ListopicApp.state.allGroupedItems)
            ? [...ListopicApp.state.allGroupedItems]
            : [];
        const searchTerm = (searchInput?.value || '').toLowerCase();

        let scopedItems = sourceItems;
        if (searchTerm) {
            scopedItems = scopedItems.filter(group =>
                (group.establishmentName && group.establishmentName.toLowerCase().includes(searchTerm)) ||
                (group.itemName && group.itemName.toLowerCase().includes(searchTerm))
            );
        }

        if (typeof distanceFilterKm === "number" && isFinite(distanceFilterKm) && distanceFilterKm > 0) {
            const state = ListopicApp.state || {};
            const lat = typeof state.userLatitude === "number" ? state.userLatitude : NaN;
            const lng = typeof state.userLongitude === "number" ? state.userLongitude : NaN;
            if (isFinite(lat) && isFinite(lng) && window.L && typeof L.latLng === "function") {
                const userLatLng = L.latLng(lat, lng);
                const maxMeters = distanceFilterKm * 1000;
                scopedItems = scopedItems.filter(group => {
                    const placeId = group.placeId;
                    if (!placeId) return false;
                    const loc = getPlaceLatLng(placeId);
                    if (!loc) return false;
                    const dist = userLatLng.distanceTo(loc);
                    return dist <= maxMeters;
                });
            }
        }

        let filteredItems = scopedItems;

        const scoreMin = listFilterState.scoreMin;
        const scoreMax = listFilterState.scoreMax;
        if (scoreMin != null || scoreMax != null) {
            filteredItems = filteredItems.filter(group => {
                const score = parseFloat(group.avgGeneralScore) || 0;
                if (scoreMin != null && score < scoreMin) return false;
                if (scoreMax != null && score > scoreMax) return false;
                return true;
            });
        }

        const criteriaFilters = listFilterState.criteriaMin || {};
        const criteriaKeys = Object.keys(criteriaFilters);
        if (criteriaKeys.length) {
            filteredItems = filteredItems.filter(group => {
                const scores = group.avgScores || {};
                for (const key of criteriaKeys) {
                    const minValue = criteriaFilters[key];
                    if (minValue == null) continue;
                    const value = parseFloat(scores[key]) || 0;
                    if (value < minValue) return false;
                }
                return true;
            });
        }
        if (activeTagFilters.size > 0) {
            filteredItems = filteredItems.filter(group => {
                if (!group.groupTags || group.groupTags.length === 0) return false;
                return [...activeTagFilters].every(filterTag => group.groupTags.includes(filterTag));
            });
        }

        const sortConfig = getListSortConfig(listSortSelect?.value);
        const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;
        filteredItems.sort((a, b) => {
            if (sortConfig.type === 'place') {
                return (String(a.establishmentName || a.placeName || '')).localeCompare(
                    String(b.establishmentName || b.placeName || ''),
                    'es',
                    { sensitivity: 'base' }
                ) * directionMultiplier;
            }
            if (sortConfig.type === 'item') {
                return (String(a.itemName || a.item || '')).localeCompare(
                    String(b.itemName || b.item || ''),
                    'es',
                    { sensitivity: 'base' }
                ) * directionMultiplier;
            }
            let valA = 0;
            let valB = 0;
            if (sortConfig.type === 'reviews') {
                valA = parseFloat(a.itemCount) || 0;
                valB = parseFloat(b.itemCount) || 0;
            } else if (sortConfig.type === 'criterion') {
                valA = parseFloat(a.avgScores?.[sortConfig.key]) || 0;
                valB = parseFloat(b.avgScores?.[sortConfig.key]) || 0;
            } else {
                valA = parseFloat(a.avgGeneralScore) || 0;
                valB = parseFloat(b.avgGeneralScore) || 0;
            }
            if (valA === valB) return 0;
            return (valA - valB) * directionMultiplier;
        });

        currentFilteredGroups = filteredItems;
        renderedGroupCount = 0;
        renderNextPage();
        updateFilteredPlacesForMap(filteredItems);
        refreshMapMarkers().catch(error => console.error('LIST-VIEW: Error al refrescar el mapa tras filtros.', error));
    }
    
    function openMapModal() {
        if (!mapModal) return;
    
        // --- INICIO DE LA MODIFICACIÓN ---
        const mapTitleElement = document.getElementById('map-modal-title');
        // Obtenemos el nombre de la lista que ya tenemos guardado
        const listName = ListopicApp.state.currentListName || "la Lista"; 
    
        if (mapTitleElement) {
            // Actualizamos el texto del título
            mapTitleElement.textContent = `Mapa de ${listName}`;
        }
        // --- FIN DE LA MODIFICACIÓN ---
    
        mapModal.classList.add('active');
        setTimeout(() => {
            if (!listMapInstance) {
                initializeListMap();
            } else {
                listMapInstance.invalidateSize(); // recalcula el tamaño
            }
        }, 10);
        try {
            if (listMapInstance) setMapParamsInUrl(true, listMapInstance.getCenter(), listMapInstance.getZoom(), true);
            else setMapParamsInUrl(true, {lat:40.4167,lng:-3.703}, 6, true);
        } catch(e){}
    }

    function closeModal() {
        if (mapModal) mapModal.classList.remove('active');
        // Push state when closing
        setMapParamsInUrl(false, null, null, true);
    }

    function initializeListMap() {
        if (!mapContainer || listMapInstance) return;

        // Determinamos el tema INICIAL basándonos en la clase del body
        const initialTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        
        listMapInstance = L.map(mapContainer).setView([40.4167, -3.703], 6);
        
        // Creamos la capa de mapa con el tema inicial
        currentTileLayer = L.tileLayer(tileLayers[initialTheme], {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(listMapInstance);

        // El resto de la función se mantiene igual (geolocalización, etc.)
        recenterMapToUser({ silent: true });
        try { syncListMapDistanceCircle(); } catch (e) {}

        fetchPlacesForCurrentList();

        document.addEventListener('themeChanged', handleThemeChangeOnMap);

        // Sync map movements into URL without polluting history
        try {
            listMapInstance.on('moveend zoomend', () => {
                try {
                    setMapParamsInUrl(true, listMapInstance.getCenter(), listMapInstance.getZoom(), false);
                } catch(e){}
            });
        } catch(e){}

    }
    
    function handleThemeChangeOnMap(event) {
        if (!listMapInstance || !currentTileLayer) return;
        const newTheme = event.detail.theme; // 'light' o 'dark'

        // Cambiamos la URL de la capa del mapa actual. Es más eficiente que quitar y poner.
        currentTileLayer.setUrl(tileLayers[newTheme]);
    }

    function setUserLocationMarker(lat, lng, options = {}) {
        if (!listMapInstance || typeof lat !== 'number' || typeof lng !== 'number') return;
        const { recenter = false } = options;
        const userLatLng = [lat, lng];
        try {
            const state = ListopicApp.state || (ListopicApp.state = {});
            state.userLatitude = lat;
            state.userLongitude = lng;
        } catch (e) {}
        if (!userLocationMarker) {
            const userIcon = L.divIcon({ html: userLocationIconSvg, className: '', iconSize: [48, 48], iconAnchor: [24, 24] });
            userLocationMarker = L.marker(userLatLng, { icon: userIcon }).addTo(listMapInstance).bindPopup('¡Estás aquí!');
        } else {
            userLocationMarker.setLatLng(userLatLng);
        }
        try { syncListMapDistanceCircle(); } catch (e) {}
        if (recenter) {
            const currentZoom = listMapInstance.getZoom();
            const targetZoom = currentZoom < 13 ? 13 : currentZoom;
            listMapInstance.setView(userLatLng, targetZoom);
        }
    }

    function syncListMapDistanceCircle() {
        if (!listMapInstance || !window.L) return;
        const state = ListopicApp.state || {};
        const lat = typeof state.userLatitude === "number" ? state.userLatitude : NaN;
        const lng = typeof state.userLongitude === "number" ? state.userLongitude : NaN;
        const hasRange = typeof distanceFilterKm === "number" && isFinite(distanceFilterKm) && distanceFilterKm > 0;
        const hasUser = isFinite(lat) && isFinite(lng);

        if (!hasRange || !hasUser) {
            if (distanceCircle) {
                try { listMapInstance.removeLayer(distanceCircle); } catch (e) {}
                distanceCircle = null;
            }
            return;
        }

        const radius = distanceFilterKm * 1000;
        const center = L.latLng(lat, lng);
        if (!distanceCircle) {
            distanceCircle = L.circle(center, {
                radius,
                color: "rgba(92, 124, 250, 0.75)",
                weight: 2,
                fillColor: "rgba(124, 58, 237, 0.22)",
                fillOpacity: 0.22
            }).addTo(listMapInstance);
        } else {
            distanceCircle.setLatLng(center);
            distanceCircle.setRadius(radius);
            if (!listMapInstance.hasLayer(distanceCircle)) distanceCircle.addTo(listMapInstance);
        }
    }

    function recenterMapToUser({ silent = false } = {}) {
        if (!navigator.geolocation) {
            if (!silent) ListopicApp.services?.showNotification?.("Tu navegador no permite obtener tu ubicación automáticamente.", "warn");
            return;
        }
        navigator.geolocation.getCurrentPosition(pos => {
            setUserLocationMarker(pos.coords.latitude, pos.coords.longitude, { recenter: true });
        }, () => {
            if (!silent) ListopicApp.services?.showNotification?.("No se pudo obtener tu ubicación.", "warn");
        });
    }
    async function fetchPlacesForCurrentList() {
        const listId = ListopicApp.state.currentListId;
        if (!listId) return;
        try {
            const getPlacesForList = firebase.app().functions('europe-west1').httpsCallable('getPlacesForList');
            const result = await getPlacesForList({ listId });
            addPlacesToMap(result.data.places);
        } catch (error) {
            console.error("Error al obtener lugares para el mapa:", error);
            ListopicApp.services.showNotification(error.message, "error");
        }
    }

    // Devuelve top 3 elementos por lugar desde el estado si no vienen desde backend
    function topItemsFromState(placeId, options = {}) {
        const { limit = 3 } = options;
        try {
            const sources = [];
            if (Array.isArray(filteredGroupsForMap) && filteredGroupsForMap.length) {
                sources.push(filteredGroupsForMap);
            }
            sources.push(ListopicApp.state?._allGroupedItemsBase || []);

            for (const source of sources) {
                if (!Array.isArray(source) || source.length === 0) continue;
                const groups = source.filter(g => g.placeId === placeId);
                if (!groups.length) continue;
                return groups
                    .map(g => ({
                        name: g.itemName || 'General',
                        avg: typeof g.avgGeneralScore === 'number' ? g.avgGeneralScore : 0,
                        count: g.itemCount || 0
                    }))
                    .sort((a, b) => {
                        if ((b.avg || 0) === (a.avg || 0)) {
                            return (b.count || 0) - (a.count || 0);
                        }
                        return (b.avg || 0) - (a.avg || 0);
                    })
                    .slice(0, limit);
            }
        } catch(e) { /* noop */ }
        return [];
    }

    function updateFilteredPlacesForMap(filteredGroups) {
        filteredGroupsForMap = Array.isArray(filteredGroups) ? filteredGroups : [];
        const ids = filteredGroupsForMap
            .map(group => group.placeId)
            .filter(placeId => typeof placeId === 'string' && placeId);
        filteredPlaceIdsForMap = new Set(ids);
        const baseGroups = ListopicApp.state?._allGroupedItemsBase || [];
        shouldShowAllPlacesOnMap = filteredGroupsForMap.length === baseGroups.length;
        ListopicApp.state.currentFilteredGroupsForMap = filteredGroupsForMap;
    }

    function resolveItemsForPlace(place) {
        const fromState = topItemsFromState(place.id, { limit: 3 });
        if (fromState.length) return fromState;
        if (Array.isArray(place.topItems) && place.topItems.length) {
            return place.topItems
                .map(item => ({
                    name: item.name || 'General',
                    avg: typeof item.avgGeneralScore === 'number' ? item.avgGeneralScore : 0,
                    count: item.itemCount || 0
                }))
                .sort((a, b) => {
                    if ((b.avg || 0) === (a.avg || 0)) {
                        return (b.count || 0) - (a.count || 0);
                    }
                    return (b.avg || 0) - (a.avg || 0);
                })
                .slice(0, 3);
        }
        return [];
    }

    async function renderPlacesOnMap(places) {
        if (!listMapInstance || !Array.isArray(places)) return;

        markersMap.forEach(marker => marker.remove());
        markersMap.clear();

        if (places.length === 0) return;

        if (ListopicApp.uiUtils && typeof ListopicApp.uiUtils.refreshPlacePhotoIfNeeded === 'function') {
            const refreshTargets = places
                .filter(place => !place.mainImageUrl || ListopicApp.uiUtils.isLegacyGooglePhotoUrl(place.mainImageUrl))
                .slice(0, 10);
            if (refreshTargets.length) {
                await Promise.all(refreshTargets.map(place => ListopicApp.uiUtils.refreshPlacePhotoIfNeeded(place).catch(() => null)));
            }
        }

        const markers = [];
        places.forEach(place => {
            if (place.location?.latitude && place.location?.longitude) {
                const items = resolveItemsForPlace(place);
                const highestScore = items.length > 0
                    ? (items[0].avg || 0)
                    : (typeof place.bestItemScore === 'number' ? place.bestItemScore : (place.avgGeneralScore || 0));
                const customIcon = getIconByScore(highestScore);
                const marker = L.marker([place.location.latitude, place.location.longitude], { icon: customIcon });

                const itemsHtml = items.length ? `
                    <div class="popup-items">
                        ${items.map(it => `
                            <a class="popup-item__row" href="grouped-detail-view.html?listId=${ListopicApp.state.currentListId}&placeId=${place.id}&item=${encodeURIComponent(it.name)}">
                                <span class="popup-item__name">${ListopicApp.uiUtils.escapeHtml(it.name)}</span>
                                <span class="score-badge">${(it.avg || 0).toFixed(1)}</span>
                            </a>`).join('')}
                    </div>` : '';

                const popupContent = `
                <div class="listopic-map-popup">
                    ${place.mainImageUrl ? `<div class="popup-image" style="background-image: url('${ListopicApp.uiUtils.escapeHtml(place.mainImageUrl)}')"></div>` : ''}
                    <div class="popup-content">
                        <h5 class="popup-title">${ListopicApp.uiUtils.escapeHtml(place.name)}</h5>
                        ${itemsHtml}
                        <a href="place-detail.html?placeId=${place.id}" class="popup-link button submit-button">Ver lugar</a>
                    </div>
                </div>
                `;
                marker.bindPopup(popupContent);
                marker.on('click', () => {
                    try {
                        const center = listMapInstance.getCenter();
                        const zoom = listMapInstance.getZoom();
                        setMapParamsInUrl(true, center, zoom);
                    } catch(e) {}
                });
                marker.on('dblclick', () => { window.location.href = `place-detail.html?placeId=${place.id}`; });
                markers.push(marker);
                markersMap.set(place.id, marker);
            }
        });

        if (markers.length > 0) {
            const featureGroup = L.featureGroup(markers).addTo(listMapInstance);
            if (!navigator.geolocation) {
                 listMapInstance.fitBounds(featureGroup.getBounds()).pad(0.1);
            }
        }
    }

    async function refreshMapMarkers() {
        if (!listMapInstance) return;
        const places = shouldShowAllPlacesOnMap
            ? basePlacesForMap.slice()
            : basePlacesForMap.filter(place => filteredPlaceIdsForMap.has(place.id));
        await renderPlacesOnMap(places);
    }

    function addPlacesToMap(places) {
        basePlacesForMap = Array.isArray(places) ? places : [];
        placeLatLngCache.clear();
        refreshMapMarkers().catch(error => console.error('LIST-VIEW: Error al actualizar marcadores en el mapa.', error));
    }

    // En public/js/page-list-view.js

// En public/js/page-list-view.js



// Función auxiliar para mantener el código de fetch organizado
async function fetchGroupedReviews(listId) {
    const currentUser = ListopicApp.services.auth.currentUser;
    const idToken = currentUser ? await currentUser.getIdToken(true) : null;
    
    const headers = { 'Accept': 'application/json' };
    if(idToken) headers['Authorization'] = `Bearer ${idToken}`;
    
    const functionUrl = ListopicApp.config.FUNCTION_URLS.groupedReviews;
    if (!functionUrl) throw new Error("URL de la función groupedReviews no configurada.");
    
    const res = await fetch(`${functionUrl}?listId=${listId}`, { headers });
    if (!res.ok) {
        const errorText = await res.text();
        let detail = `Error HTTP ${res.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            detail = errorJson.error?.message || JSON.stringify(errorJson.error) || errorText;
        } catch(e) { detail = errorText; }
        throw new Error(detail.substring(0, 200));
    }
    return res.json();
}

// REEMPLAZA la antigua función renderTable_ListView_Grouped por esta:
function renderTable_ListView_Grouped(groupedItemsToRender) {
    const container = document.getElementById('reviews-container-grid'); // Usaremos un nuevo contenedor
    if (!container) return;

    container.innerHTML = ''; // Limpiamos el contenedor

    if (groupedItemsToRender.length === 0) {
        container.innerHTML = '<p class="no-reviews-message">No hay elementos que coincidan con los filtros seleccionados.</p>';
        return;
    }

    // Renderizamos cada grupo de reseñas usando nuestra nueva tarjeta
    groupedItemsToRender.forEach(group => {
        // Necesitamos los datos de la lista para los nombres de los criterios
        const listData = { criteriaDefinition: ListopicApp.state.currentListCriteriaDefinitions };
        
        const cardHtml = ListopicApp.uiUtils.createListViewGroupCard(group, listData, currentListIconClass);
        container.innerHTML += cardHtml;
    });
}

// ***-------------------------------------- ***
// *** SECCIÓN ÚNICA PARA LA LÓGICA DEL FORO ***
// ***-------------------------------------- ***

function initForumModal() {
    forumModal = document.getElementById('list-forum-modal');
    closeModalForumBtn = forumModal ? forumModal.querySelector('.close-modal') : null;
    forumListNameSpan = document.getElementById('forum-list-name');
    forumMessagesContainer = document.getElementById('forum-messages-container');
    newForumMessageInput = document.getElementById('new-forum-message');
    sendForumMessageBtn = document.getElementById('send-forum-message');
    const forumButton = document.getElementById('forum-button');

    if (!forumModal || !closeModalForumBtn || !forumMessagesContainer || !newForumMessageInput || !sendForumMessageBtn || !forumButton) {
        return false;
    }
    
    const listName = ListopicApp.state.currentListName || listTitleElement.textContent;
    if(forumListNameSpan) forumListNameSpan.textContent = listName;
    
    forumButton.addEventListener('click', openForumModal);
    closeModalForumBtn.addEventListener('click', closeForumModal);
    sendForumMessageBtn.addEventListener('click', sendForumMessage);

    initForumFirestoreRef();
    return true;
}

function initForumFirestoreRef() {
    const db = ListopicApp.services.db;
    const listId = ListopicApp.state.currentListId;

    messagesCollectionRef = db.collection('listForums').doc(listId).collection('messages');
    const messagesQuery = messagesCollectionRef.orderBy('timestamp', 'asc'); 
    
    messagesQuery.onSnapshot(snapshot => {
        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            time: formatTime(doc.data().timestamp?.toDate())
        }));
        renderForumMessages(messages);
    }, error => {
        console.error("Error cargando mensajes del foro:", error);
        ListopicApp.services.showNotification('Error cargando mensajes del foro', 'error');
    });
}

function openForumModal() {
    if(forumModal) forumModal.style.display = 'block';
    if(newForumMessageInput) newForumMessageInput.focus();
}

function closeForumModal() {
    if(forumModal) forumModal.style.display = 'none';
}

function formatTime(date) {
    if (!date) return 'justo ahora';
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / 60000);
    if (diffMinutes < 1) return 'justo ahora';
    if (diffMinutes < 60) return `hace ${diffMinutes} min`;
    if (diffMinutes < 1440) return `hace ${Math.floor(diffMinutes / 60)} h`;
    return date.toLocaleDateString('es-ES');
}

function renderForumMessages(messages) {
    if(!forumMessagesContainer) return;
    forumMessagesContainer.innerHTML = '';

    if (messages.length === 0) {
        forumMessagesContainer.innerHTML = '<p class="no-messages">¡Sé el primero en comentar!</p>';
        return;
    }
    
    const user = ListopicApp.services.auth.currentUser;
    
    messages.forEach(msg => {
        const messageEl = document.createElement('div');
        messageEl.className = 'forum-message';
        
        const canDelete = user && (user.uid === msg.userId || user.uid === "w4cCQoKBGOUtbEU2KXTnN69OmuA2");
        const deleteButtonHtml = canDelete ? `<button class="delete-message-btn" title="Eliminar mensaje" data-message-id="${msg.id}">❌</button>` : '';

        messageEl.innerHTML = `
            <div class="message-header">
                <strong>${msg.userName || 'Anónimo'}</strong>
                <span class="message-time">${msg.time}</span>
                ${deleteButtonHtml}
            </div>
            <p class="message-text">${ListopicApp.uiUtils.escapeHtml(msg.text)}</p>
        `;
        forumMessagesContainer.appendChild(messageEl);
    });

    forumMessagesContainer.querySelectorAll('.delete-message-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteForumMessage(e.target.dataset.messageId);
        });
    });
    
    forumMessagesContainer.scrollTop = forumMessagesContainer.scrollHeight;
}

async function deleteForumMessage(messageId) {
    if (!confirm("¿Eliminar este mensaje? Esta acción no se puede deshacer.")) return;
    try {
        await messagesCollectionRef.doc(messageId).delete();
        ListopicApp.services.showNotification('Mensaje eliminado.', 'success');
    } catch (error) {
        console.error('Error eliminando mensaje:', error);
        ListopicApp.services.showNotification('Error al eliminar el mensaje.', 'error');
    }
}

async function sendForumMessage() {
    const messageText = newForumMessageInput.value.trim();
    if (!messageText) return;

    const user = ListopicApp.services.auth.currentUser;
    if (!user) {
        ListopicApp.services.showNotification('Debes iniciar sesión para comentar.', 'error');
        return;
    }

    sendForumMessageBtn.disabled = true;
    try {
        await messagesCollectionRef.add({
            text: messageText,
            userId: user.uid,
            userName: user.displayName || user.email.split('@')[0],
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        newForumMessageInput.value = '';
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        ListopicApp.services.showNotification('No se pudo enviar el mensaje.', 'error');
    } finally {
        sendForumMessageBtn.disabled = false;
    }
}
// ***-------------------------------------- ***
// *** FIN DE SECCIÓN DEL FORO ***
// ***-------------------------------------- ***


function init() {
console.log('Initializing List View page logic...');
const state = ListopicApp.state;

// Cacheo de elementos del DOM (ya corregido)
listTitleElement = document.getElementById('list-title');
reviewsGridContainer = document.getElementById('reviews-grid-container'); // Apuntamos al nuevo div
searchInput = document.querySelector('.search-input');
listViewToggleButtons = document.querySelectorAll('.list-view-toggle__btn');
listSortSelect = document.getElementById('list-sort-select');
addReviewButton = document.querySelector('.add-review-button');
editListLink = document.getElementById('edit-list-link');
deleteListButton = document.getElementById('delete-list-button');
showMapModalBtn = document.getElementById('show-map-modal-btn');
mapModal = document.getElementById('list-map-modal');
closeMapModalBtn = document.getElementById('close-map-modal-btn');
mapContainer = document.getElementById('list-map-container');
mapFiltersBtn = document.getElementById('map-filters-btn');
mapCenterUserBtn = document.getElementById('map-center-user-btn');
listDistanceSelect = document.getElementById('list-distance-select');
listLoadMoreContainer = document.getElementById('list-load-more');
listLoadMoreBtn = document.getElementById('list-load-more-btn');
listLoadMoreStatus = document.getElementById('list-load-more-status');
listLoadMoreSentinel = document.getElementById('list-load-more-sentinel');
scoreMinInput = document.getElementById('filter-score-min');
scoreMaxInput = document.getElementById('filter-score-max');
scoreMinOutput = document.getElementById('filter-score-min-output');
scoreMaxOutput = document.getElementById('filter-score-max-output');
scoreRangeLabel = document.getElementById('filters-score-label');
criteriaFiltersWeightedEl = document.getElementById('criteria-filters-weighted');
criteriaFiltersNonWeightedEl = document.getElementById('criteria-filters-nonweighted');
tagFilterModalContainer = document.getElementById('tag-filter-modal');
listFiltersModal = document.getElementById('list-filters-modal');
listFiltersApplyBtn = document.getElementById('list-filters-apply');
listFiltersClearBtn = document.getElementById('list-filters-clear');
listFiltersClearInlineBtn = document.getElementById('filters-clear-inline');
filtersPreviewCountEl = document.getElementById('filters-preview-count');
filtersActiveCountBadge = document.getElementById('filters-active-count');
tagFiltersClearBtn = listFiltersModal ? listFiltersModal.querySelector('[data-tags-clear]') : null;
listFilterToggleButtons = listFiltersModal ? listFiltersModal.querySelectorAll('.list-filter-toggle') : [];
listFiltersPresetButtons = listFiltersModal ? listFiltersModal.querySelectorAll('[data-score-preset]') : [];
listFiltersDismissButtons = listFiltersModal ? listFiltersModal.querySelectorAll('[data-list-filters-dismiss]') : [];

// Reinicio de estado de la página (se mantiene igual)
state.allGroupedItems = []; 
state.currentListAvailableTags = [];
activeTagFilters = new Set();
currentSortColumn = 'avgGeneralScore';
currentSortDirection = 'desc';
currentFilteredGroups = [];
renderedGroupCount = 0;
listFilterState.scoreMin = null;
listFilterState.scoreMax = null;
listFilterState.criteriaMin = {};
syncScoreRangeInputs();
updateFiltersActiveCount();

if (listViewToggleButtons && listViewToggleButtons.length) {
    listViewToggleButtons.forEach(btn => {
        btn.addEventListener('click', () => setItemsViewMode(btn.dataset.listView || 'grid'));
    });
}
if (listSortSelect) {
    listSortSelect.addEventListener('change', () => applyFiltersAndSort_ListView_Grouped());
}
if (listLoadMoreBtn) {
    listLoadMoreBtn.addEventListener('click', () => renderNextPage());
}
setupLoadMoreObserver();
    setItemsViewMode('list');

const urlParamsList = new URLSearchParams(window.location.search);
state.currentListId = urlParamsList.get('listId'); 

async function initDistanceFilterFromPreference() {
    let preferred = null;
    try {
        const raw = window.localStorage.getItem("listopic.defaultDistanceKm");
        const parsed = raw != null ? parseFloat(raw) : NaN;
        if (isFinite(parsed)) preferred = parsed;
    } catch (e) {}

    if (preferred == null) {
        try {
            const uid = ListopicApp.services?.auth?.currentUser?.uid;
            const db = ListopicApp.services?.db;
            if (uid && db) {
                const snap = await db.collection("users").doc(uid).get();
                const data = snap.exists ? (snap.data() || {}) : {};
                if (typeof data.defaultDistanceKm === "number") preferred = data.defaultDistanceKm;
            }
        } catch (e) {}
    }

    if (preferred == null) preferred = 10;
    distanceFilterKm = isFinite(preferred) ? preferred : 10;
    if (listDistanceSelect) listDistanceSelect.value = String(distanceFilterKm || 0);

    if (distanceFilterKm > 0) {
        const loc = await ensureUserCoordsForDistance({ recenter: false });
        if (!loc) {
            distanceFilterKm = 0;
            if (listDistanceSelect) listDistanceSelect.value = "0";
        }
    }

    try { syncListMapDistanceCircle(); } catch (e) {}
    try { applyFiltersAndSort_ListView_Grouped(); } catch (e) {}
}

listDistanceSelect &&
    listDistanceSelect.addEventListener("change", async (ev) => {
        const raw = (listDistanceSelect.value || "").trim();
        const km = raw ? parseFloat(raw) : NaN;
        distanceFilterKm = isFinite(km) && km > 0 ? km : 0;
        hasWarnedMissingGeoForDistance = false;

        if (distanceFilterKm > 0) {
            const loc = await ensureUserCoordsForDistance({ recenter: false });
            if (!loc) {
                distanceFilterKm = 0;
                listDistanceSelect.value = "0";
                if (!hasWarnedMissingGeoForDistance) {
                    hasWarnedMissingGeoForDistance = true;
                    ListopicApp.services?.showNotification?.("Activa tu ubicacion para filtrar por distancia.", "warn");
                }
            }
        }

        try { window.localStorage.setItem("listopic.defaultDistanceKm", String(distanceFilterKm || 0)); } catch (e) {}
        if (ev && ev.isTrusted) {
            try {
                const uid = ListopicApp.services?.auth?.currentUser?.uid;
                const db = ListopicApp.services?.db;
                if (uid && db) {
                    await db.collection("users").doc(uid).update({
                        defaultDistanceKm: distanceFilterKm || 0,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (e) {}
        }
        try { syncListMapDistanceCircle(); } catch (e) {}
        applyFiltersAndSort_ListView_Grouped();
        scheduleFiltersPreview();
    });

initDistanceFilterFromPreference();

async function applyCategoryLabel(categoryId) {
    const ui = ListopicApp.uiUtils;
    const fallback = categoryId || "Hmm...";
    if (ui?.ensureCategoryCached) {
        try { await ui.ensureCategoryCached(categoryId); } catch (e) { /* ignore */ }
    }
    const label = ui?.getCategoryLabel ? ui.getCategoryLabel(categoryId, fallback) : fallback;
    if (ui?.updatePageHeaderInfo) ui.updatePageHeaderInfo(label, state.currentListName);
    const categoryLabelEl = document.getElementById('list-category-label');
    if (categoryLabelEl) categoryLabelEl.textContent = label;
}

// --- LÓGICA DE INICIALIZACIÓN CORREGIDA ---
if (state.currentListId) {
    updateAddReviewButtonHref(state.currentListId);
    if (editListLink) editListLink.href = `list-form.html?editListId=${state.currentListId}`;

    const listDocRef = ListopicApp.services.db.collection('lists').doc(state.currentListId);
    listDocRef.get().then(async listDoc => {
        if (!listDoc.exists) throw new Error("La lista no fue encontrada.");
        
        const listData = listDoc.data();
        const currentUser = ListopicApp.services.auth.currentUser;
        const isOwner = currentUser && currentUser.uid === listData.userId;

        if (editListLink) editListLink.style.display = isOwner ? 'inline-flex' : 'none';
        if (deleteListButton) deleteListButton.style.display = isOwner ? 'inline-flex' : 'none';

        state.currentListName = listData.name || "Ranking";
        const category = listData.categoryId || "Hmm..."; 
        await applyCategoryLabel(category);
        if (listTitleElement) listTitleElement.textContent = state.currentListName;
        updateAddReviewButtonHref(state.currentListId, state.currentListName);

        // Pintar estadísticas junto al título
        try {
            const statsEl = document.getElementById('list-stats');
            if (statsEl) {
        const rc = listData.reviewCount || 0;
        const fc = listData.followersCount || 0;
        const cc = listData.commentsCount || 0;
        statsEl.innerHTML = `
            <span><i class="fas fa-star-half-alt"></i> ${rc} reseñas</span>
            <span><i class="fas fa-user-group"></i> <span id="list-followers-count">${fc}</span> seguidores</span>
        `;
        const forumCountEl = document.getElementById('forum-count');
        if (forumCountEl) forumCountEl.textContent = cc;
        }
    } catch(e) { /* noop */ }

        return fetchGroupedReviews(state.currentListId);

    })
    .then(async responsePayload => {
        if (!responsePayload || typeof responsePayload !== 'object') {
            throw new Error("Respuesta inesperada de la Cloud Function.");
        }
        state.currentListName = responsePayload.listName || "Ranking Agrupado";
        const category = responsePayload.categoryId || "Hmm..."; 
        await applyCategoryLabel(category);
        if (listTitleElement) listTitleElement.textContent = state.currentListName;
        updateAddReviewButtonHref(state.currentListId, state.currentListName);
        state.currentListAvailableTags = responsePayload.tags || [];
        state.currentListCriteriaDefinitions = responsePayload.criteria || {}; 
        currentListIconClass = getListIconClass_ListView(state.currentListName);
        
        // Ya no renderizamos cabeceras de tabla
        // renderTableHeaders_ListView_Grouped(); 
        state._allGroupedItemsBase = responsePayload.groupedReviews || [];
        state.allGroupedItems = state._allGroupedItemsBase;
        extraFiltersState.placeOptionsMap.clear();
        extraFiltersState.placeOptionsLoaded = false;
        extraFiltersState.placeOptionsLoadPromise = null;
        refreshListSortOptions();
        renderCriteriaFilterControls();
        renderTagFiltersModal();
        syncFiltersModalFromState();
        updateFiltersActiveCount();
        initForumModal();
        applyFiltersAndSort_ListView_Grouped();

        // Restaurar el estado del mapa si venimos de atrás con parámetros en la URL
        initialMapParams = readMapParamsFromUrl();
        if (initialMapParams && initialMapParams.open) {
            // Abrimos el modal del mapa y restauramos vista tras inicializar
            openMapModal();
            setTimeout(() => {
                try {
                    if (listMapInstance && initialMapParams.lat != null && initialMapParams.lng != null) {
                        listMapInstance.setView([initialMapParams.lat, initialMapParams.lng], initialMapParams.zoom || listMapInstance.getZoom());
                    }
                } catch(e) {}
            }, 120);
        }
    })
    .catch(error => {
        console.error("LIST-VIEW: Error en fetch o procesamiento:", error);
        if (listTitleElement) listTitleElement.textContent = "Error al cargar lista";
        // Mostramos el error en nuestro nuevo contenedor
        if (reviewsGridContainer) reviewsGridContainer.innerHTML = `<p class="error-placeholder">${error.message}</p>`;
        ListopicApp.services.showNotification(`Error al cargar la lista: ${error.message}`, "error");
    });
} else {
    if (listTitleElement) listTitleElement.textContent = "Error: Lista no especificada";
    if (reviewsGridContainer) reviewsGridContainer.innerHTML = `<p class="error-placeholder">ID de lista no especificado en la URL.</p>`;
    ListopicApp.services.showNotification("ID de lista no especificado en la URL.", "error");
}

// Listeners de UI (eliminamos el de la tabla)
if (searchInput) {
    searchInput.addEventListener('input', () => {
        if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = window.setTimeout(() => {
            applyFiltersAndSort_ListView_Grouped();
            scheduleFiltersPreview();
        }, 180);
    });
}

// --- Modal de filtros extra ---
const showFiltersBtn = document.getElementById('show-filters-modal-btn');

async function ensurePlaceOptionsLoaded({ silent = false } = {}) {
    if (extraFiltersState.placeOptionsLoaded) return true;
    if (extraFiltersState.placeOptionsLoadPromise) return extraFiltersState.placeOptionsLoadPromise;

    const baseGroups = state._allGroupedItemsBase || [];
    if (!baseGroups.length) {
        extraFiltersState.placeOptionsLoaded = true;
        return true;
    }
    if (!silent) {
        ListopicApp.services?.showNotification?.('Cargando datos de lugares...', 'info');
    }
    extraFiltersState.placeOptionsLoadPromise = preloadPlaceOptionsForGroups(baseGroups)
        .then(() => {
            extraFiltersState.placeOptionsLoaded = true;
            return true;
        })
        .catch((e) => {
            console.warn('No se pudieron cargar opciones de lugares', e);
            if (!silent) {
                ListopicApp.services?.showNotification?.('No se pudieron cargar datos de lugares.', 'warn');
            }
            return false;
        })
        .finally(() => {
            extraFiltersState.placeOptionsLoadPromise = null;
        });
    return extraFiltersState.placeOptionsLoadPromise;
}

function openFiltersModal() {
    if (!listFiltersModal) return;
    listFiltersModal.classList.add('is-open');
    listFiltersModal.setAttribute('aria-hidden', 'false');
    syncFiltersModalFromState();
    scheduleFiltersPreview();
    const loadPromise = ensurePlaceOptionsLoaded({ silent: true });
    if (loadPromise && typeof loadPromise.then === 'function') {
        loadPromise.then(() => scheduleFiltersPreview()).catch(() => {});
    }
}

function closeFiltersModal() {
    if (!listFiltersModal) return;
    listFiltersModal.classList.remove('is-open');
    listFiltersModal.setAttribute('aria-hidden', 'true');
}

showFiltersBtn && showFiltersBtn.addEventListener('click', openFiltersModal);
mapFiltersBtn && mapFiltersBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openFiltersModal();
});
mapCenterUserBtn && mapCenterUserBtn.addEventListener('click', (e) => {
    e.preventDefault();
    recenterMapToUser();
});
if (listFiltersDismissButtons && listFiltersDismissButtons.length) {
    listFiltersDismissButtons.forEach(btn => btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeFiltersModal();
    }));
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && listFiltersModal?.classList.contains('is-open')) {
        closeFiltersModal();
    }
});
if (scoreMinInput) scoreMinInput.addEventListener('input', () => handleScoreRangeInput('min'));
if (scoreMaxInput) scoreMaxInput.addEventListener('input', () => handleScoreRangeInput('max'));
if (listFiltersPresetButtons && listFiltersPresetButtons.length) {
    listFiltersPresetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const preset = button.dataset.scorePreset;
            if (preset === 'reset') {
                setScoreRangeInputs(SCORE_MIN_DEFAULT, SCORE_MAX_DEFAULT);
            } else {
                const minValue = parseFloat(preset);
                if (isFinite(minValue)) setScoreRangeInputs(minValue, SCORE_MAX_DEFAULT);
            }
            scheduleFiltersPreview();
        });
    });
}
if (listFilterToggleButtons && listFilterToggleButtons.length) {
    listFilterToggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const isActive = button.classList.toggle('is-active');
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            scheduleFiltersPreview();
        });
    });
}
tagFiltersClearBtn && tagFiltersClearBtn.addEventListener('click', () => {
    modalTagFilters = new Set();
    syncTagModalSelection();
    scheduleFiltersPreview();
});
listFiltersClearInlineBtn && listFiltersClearInlineBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetFiltersModal();
});
listFiltersClearBtn && listFiltersClearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetFiltersModal();
});
listFiltersApplyBtn && listFiltersApplyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const snapshot = readModalFiltersSnapshot();
    const shouldLoadPlaces = hasActiveExtraFilters(snapshot.extraFilters);
    if (shouldLoadPlaces) {
        listFiltersApplyBtn.disabled = true;
        const ok = await ensurePlaceOptionsLoaded();
        listFiltersApplyBtn.disabled = false;
        if (!ok) return;
    }
    applyFiltersSnapshot(snapshot);
    closeFiltersModal();
});

async function preloadPlaceOptionsForGroups(groups){
    const ids = [...new Set(groups.map(g=>g.placeId).filter(Boolean))];
    if(ids.length===0) return;
    const db = ListopicApp.services?.db;
    if (!db) return;
    // Cargas por lotes de 10
    for(let i=0;i<ids.length;i+=10){
        const slice = ids.slice(i,i+10);
        const snaps = await Promise.all(slice.map(id=> db.collection('places').doc(id).get()));
        snaps.forEach(doc=>{ if(doc.exists) extraFiltersState.placeOptionsMap.set(doc.id, doc.data()); });
    }
}

function hasActiveExtraFilters(filters = extraFiltersState.filters) {
    const f = filters || {};
    return !!(f.wheelchairEntrance || f.wheelchairSeating || f.outdoor || f.dinein || f.delivery || f.takeout || f.curbside);
}

function applyExtraPlaceFilters(groups, filters = extraFiltersState.filters){
    const f = filters || {};
    if(!hasActiveExtraFilters(f)) return groups;
    return groups.filter(g=>{
        const p = extraFiltersState.placeOptionsMap.get(g.placeId) || {};
        const acc = p.accessibility || {};
        const sv = p.serviceOptions || {};
        if(f.wheelchairEntrance && acc.wheelchairAccessibleEntrance !== true) return false;
        if(f.wheelchairSeating && acc.wheelchairAccessibleSeating !== true) return false;
        if(f.outdoor && sv.outdoorSeating !== true) return false;
        if(f.dinein && sv.dineIn !== true) return false;
        if(f.delivery && sv.delivery !== true) return false;
        if(f.takeout && sv.takeout !== true) return false;
        if(f.curbside && sv.curbsidePickup !== true) return false;
        return true;
    });
}

if (deleteListButton) {
    deleteListButton.addEventListener('click', async () => {
        // ... (la lógica de borrado se mantiene igual)
        if (!state.currentListId) return;
        if (confirm(`¿Eliminar "${listTitleElement.textContent || 'esta lista'}"? Esta acción no se puede deshacer.`)) {
            try {
                const deleteOrOrphanList = firebase.app().functions('europe-west1').httpsCallable('deleteOrOrphanList');
                const result = await deleteOrOrphanList({ listId: state.currentListId });
                ListopicApp.services.showNotification(result.data.message, 'success');
                window.location.href = 'index.html';
            } catch (error) {
                ListopicApp.services.showNotification(`Error: ${error.message}`, 'error');
            }
        }
    });
}

// Listeners para el modal del mapa
if (showMapModalBtn) showMapModalBtn.addEventListener('click', openMapModal);
if (closeMapModalBtn) closeMapModalBtn.addEventListener('click', closeModal);
if (mapModal) mapModal.addEventListener('click', (e) => { if (e.target === mapModal) closeModal(); });

// --- Seguimiento de listas ---
(function initFollowListUI(){
    try {
        followListBtn = document.getElementById('follow-list-btn');
        if (!followListBtn) return;
        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const listId = (ListopicApp.state && ListopicApp.state.currentListId) || (new URLSearchParams(window.location.search)).get('listId');
        if (!listId) return;
        const updateBtnUI = () => {
    if (!followListBtn) return;
    if (isFollowingList) {
        followListBtn.innerHTML = '<i class="fas fa-check"></i> Siguiendo';
        followListBtn.title = 'Siguiendo lista';
        followListBtn.classList.remove('follow-cta-button');
        followListBtn.classList.add('secondary-button');
    } else {
        followListBtn.innerHTML = '<i class="fas fa-bookmark"></i> Seguir lista';
        followListBtn.title = 'Seguir lista';
        followListBtn.classList.remove('secondary-button');
        followListBtn.classList.add('follow-cta-button');
    }
    followListBtn.style.display = 'inline-flex';
};
        const checkStatus = async () => {
            const user = auth.currentUser;
            if (!user) { // Mostrar el botón aunque no haya sesión
                isFollowingList = false;
                updateBtnUI();
                return;
            }
            try {
                const doc = await db.collection('users').doc(user.uid).collection('followingLists').doc(listId).get();
                isFollowingList = doc.exists;
                updateBtnUI();
            } catch(e) { updateBtnUI(); }
        };
        followListBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) { window.location.href = 'auth.html'; return; }
            followListBtn.disabled = true;
            followListBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                const toggleFollowList = firebase.app().functions('europe-west1').httpsCallable('toggleFollowList');
                const res = await toggleFollowList({ listId });
                isFollowingList = res.data?.status === 'followed';
                updateBtnUI();
                ListopicApp.services?.showNotification?.(res.data?.message || 'Hecho', 'success');
                const cntEl = document.getElementById('list-followers-count');
                if (cntEl) {
                    const current = parseInt(cntEl.textContent || '0', 10) || 0;
                    cntEl.textContent = isFollowingList ? (current + 1) : Math.max(0, current - 1);
                }
            } catch (e) {
                ListopicApp.services?.showNotification?.(e.message, 'error');
            } finally {
                followListBtn.disabled = false;
            }
        });
        // inicial y reintentos (garantiza estado correcto tras auth init)
        checkStatus();
        setTimeout(checkStatus, 500);
        setTimeout(checkStatus, 1500);
        // También en cambios de auth
        ListopicApp.authService?.onAuthStateChangedPromise?.().then(checkStatus).catch(()=>{});
    } catch(e) { /* noop */ }
})();

// Handle browser back/forward to restore map state
window.addEventListener('popstate', () => {
    const p = readMapParamsFromUrl();
    if (p.open) {
        if (!mapModal?.classList.contains('active')) openMapModal();
        setTimeout(() => {
            try {
                if (listMapInstance && p.lat != null && p.lng != null) {
                    listMapInstance.setView([p.lat, p.lng], p.zoom || listMapInstance.getZoom());
                }
            } catch(e){}
        }, 60);
    } else {
        closeModal();
    }
});

}// Fin de init


    return {
        init
    };
})();
