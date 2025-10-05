// Contenido completo para uiUtils.js

window.ListopicApp = window.ListopicApp || {};

// Añadir una caché de categorías al estado global si no existe
window.ListopicApp.state = window.ListopicApp.state || {};
window.ListopicApp.state.categoryCache = window.ListopicApp.state.categoryCache || {};


ListopicApp.uiUtils = {
    createAutomationSlug: function(value) {
        if (value === undefined || value === null) {
            return '';
        }
        return String(value)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    generateAutomationId: function(prefix, ...parts) {
        const slugParts = parts
            .map(part => this.createAutomationSlug(part))
            .filter(Boolean);
        const base = this.createAutomationSlug(prefix) || 'id';
        return [base, ...slugParts].join('-');
    },

    buildInteractiveTag: function({
        text = '',
        iconClass = '',
        tagType = 'meta',
        value = '',
        entityType = '',
        entityId = '',
        extraClasses = '',
        testIdPrefix = 'tag'
    } = {}) {
        const textString = text === undefined || text === null ? '' : String(text);
        const rawValue = value === undefined || value === null ? (textString || tagType) : String(value);
        const safeText = this.escapeHtml(textString);
        const slugEntity = entityType || 'generic';
        const dataTestId = this.generateAutomationId(
            testIdPrefix,
            slugEntity,
            tagType || 'meta',
            rawValue || 'value'
        );
        const classNames = ['info-tag'];
        if (extraClasses) {
            classNames.push(extraClasses);
        }

        const iconHtml = iconClass
            ? `<i class="${this.escapeHtml(iconClass)}" aria-hidden="true"></i>`
            : '';
        const entityTypeAttr = entityType
            ? ` data-entity-type="${this.escapeHtml(String(entityType))}"`
            : '';
        const entityIdAttr = entityId !== undefined && entityId !== null && entityId !== ''
            ? ` data-entity-id="${this.escapeHtml(String(entityId))}"`
            : '';

        return `
            <span
                class="${classNames.join(' ').trim()}"
                role="button"
                tabindex="0"
                data-interactive="true"
                data-selected="false"
                data-tag-type="${this.escapeHtml(String(tagType))}"
                data-tag-value="${this.escapeHtml(rawValue)}"
                data-testid="${dataTestId}"
                aria-pressed="false"${entityTypeAttr}${entityIdAttr}
            >
                ${iconHtml}<span class="info-tag__label">${safeText}</span>
            </span>
        `.trim();
    },

    // NUEVA FUNCIÓN PARA OBTENER ICONOS DE FORMA EFICIENTE
    getListIcon: async function(list) {
        const defaultIcon = 'fa-solid fa-list';
        if (!list) return defaultIcon;
    
        // --- LÓGICA HÍBRIDA ---
    
        // 1. PRIORIDAD MÁXIMA: Buscar por palabras clave en el nombre de la lista
        if (list.name) {
            const listNameLower = list.name.toLowerCase();
            if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) return 'fa-solid fa-birthday-cake';
            if (listNameLower.includes('pizza')) return 'fa-solid fa-pizza-slice';
            if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) return 'fa-solid fa-hamburger';
            if (listNameLower.includes('taco') || listNameLower.includes('mexican') || listNameLower.includes('nacho')) return 'fa-solid fa-pepper-hot';
            if (listNameLower.includes('café') || listNameLower.includes('coffee')) return 'fa-solid fa-coffee';
            if (listNameLower.includes('sushi') || listNameLower.includes('japo')) return 'fa-solid fa-fish';
            if (listNameLower.includes('helado') || listNameLower.includes('ice cream')) return 'fa-solid fa-ice-cream';
            // Puedes añadir más palabras clave aquí en el futuro
        }
    
        // 2. SEGUNDA PRIORIDAD: Buscar el icono de la categoría en la base de datos
        if (list.categoryId) {
            const categoryCache = ListopicApp.state.categoryCache || {};
    
            if (categoryCache[list.categoryId]) {
                return categoryCache[list.categoryId].icon || defaultIcon;
            }
    
            try {
                const db = ListopicApp.services.db;
                if (!db) {
                    console.error("uiUtils.getListIcon: db service not available.");
                    return defaultIcon;
                }
                const doc = await db.collection('categories').doc(list.categoryId).get();
                if (doc.exists) {
                    const categoryData = doc.data();
                    categoryCache[list.categoryId] = categoryData;
                    return categoryData.icon || defaultIcon;
                }
            } catch (error) {
                console.error(`Error fetching category icon for ${list.categoryId}:`, error);
                return defaultIcon;
            }
        }
    
        // 3. ÚLTIMO RECURSO: Devolver el icono por defecto
        return defaultIcon;
    },

    // --- El resto de tus funciones ---

    showPreviewGlobal: function(src, previewContainer) {
        if (!previewContainer) {
            console.warn("showPreviewGlobal: previewContainer no encontrado");
            return;
        }
        previewContainer.innerHTML = '';
        if (src) {
            const img = document.createElement('img');
            img.src = src;
            img.alt = "Previsualización";
            img.onerror = () => {
                previewContainer.innerHTML = '<p style="color: var(--danger-color, #ff8a80);">Error al cargar imagen.</p>';
            };
            previewContainer.appendChild(img);
        }
    },

    clearPreviewGlobal: function(previewContainer, urlInput, fileInput) {
        if (previewContainer) previewContainer.innerHTML = '';
        if (urlInput) urlInput.value = '';
        if (fileInput) fileInput.value = null;
    },

    renderTagCheckboxes: function(containerElement, availableTags = [], selectedTags = []) {
        if (!containerElement) {
            console.error("Tag container not found for checkboxes.");
            return;
        }
        containerElement.innerHTML = '';
        if (!Array.isArray(availableTags) || availableTags.length === 0) {
            containerElement.innerHTML = '<p>No hay etiquetas definidas para esta lista.</p>';
            return;
        }
        availableTags.forEach(tag => {
            const tagString = String(tag);
            const tagId = `tag-${tagString.toLowerCase().replace(/\s+/g, '-')}`;
            const isChecked = selectedTags.includes(tagString);

            const label = document.createElement('label');
            label.className = 'tag-checkbox';
            if (isChecked) {
                label.classList.add('selected');
            }

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'tags';
            input.value = tagString;
            input.id = tagId;
            input.checked = isChecked;

            input.addEventListener('change', function () {
                label.classList.toggle('selected', this.checked);
            });

            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${tagString}`));
            containerElement.appendChild(label);
        });
    },
    
    renderCriteriaSliders: function(containerElement, existingRatings = {}, criteriaDefinitionMap = {}) {
        if (!containerElement) return;
        containerElement.innerHTML = '';
        if (typeof criteriaDefinitionMap !== 'object' || Object.keys(criteriaDefinitionMap).length === 0) {
            containerElement.innerHTML = '<p>No hay criterios de valoración definidos para esta lista.</p>';
            return;
        }
        for (const [criterionKey, criterion] of Object.entries(criteriaDefinitionMap)) {
            const currentValue = existingRatings[criterionKey] !== undefined ? parseFloat(existingRatings[criterionKey]) : 5;
            const sliderGroup = document.createElement('div');
            sliderGroup.className = 'form-group slider-group';
            const label = document.createElement('label');
            label.htmlFor = `rating-${criterionKey}`;
            const weightedIndicator = criterion.ponderable === false ? ' <small class="non-weighted-criterion">(No pondera)</small>' : '';
            label.innerHTML = `${this.escapeHtml(criterion.label)}${weightedIndicator}`;
            const sliderInput = document.createElement('input');
            sliderInput.type = 'range';
            sliderInput.id = `rating-${criterionKey}`;
            sliderInput.name = `ratings[${criterionKey}]`;
            sliderInput.min = String(criterion.min !== undefined ? criterion.min : '0');
            sliderInput.max = String(criterion.max !== undefined ? criterion.max : '10');
            sliderInput.step = String(criterion.step !== undefined ? criterion.step : '0.5');
            sliderInput.value = currentValue;
            sliderInput.className = 'form-input rating-slider';
            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'slider-value-display';
            valueDisplay.textContent = parseFloat(sliderInput.value).toFixed(1);
            sliderInput.addEventListener('input', () => { valueDisplay.textContent = parseFloat(sliderInput.value).toFixed(1); });
            label.appendChild(valueDisplay);
            sliderGroup.appendChild(label);
            sliderGroup.appendChild(sliderInput);
            if (criterion.labelMin || criterion.labelMax) {
                const rangeLabels = document.createElement('div');
                rangeLabels.className = 'slider-range-labels';
                const leftLabelSpan = document.createElement('span');
                leftLabelSpan.textContent = this.escapeHtml(criterion.labelMin || String(sliderInput.min));
                const rightLabelSpan = document.createElement('span');
                rightLabelSpan.textContent = this.escapeHtml(criterion.labelMax || String(sliderInput.max));
                rangeLabels.appendChild(leftLabelSpan);
                rangeLabels.appendChild(rightLabelSpan);
                sliderGroup.appendChild(rangeLabels);
            }
            containerElement.appendChild(sliderGroup);
        }
    },

    escapeHtml: function(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    },

    // ==========================================================
// === FUNCIÓN CENTRALIZADA: SUPER TARJETA RESEÑA v3.0 =====
// ==========================================================

    // En uiUtils.js, reemplaza la función entera por esta:

    renderReviewSuperCard: function(review) {
        const uiUtils = this;
        const services = window.ListopicApp?.services || {};
        const currentUserId = services.auth?.currentUser?.uid || null;

        const author = review.author || {};
        const authorId = author.id || review.userId || '';
        const authorNameRaw = author.name || 'Usuario Anonimo';
        const authorName = uiUtils.escapeHtml(authorNameRaw);
        const authorPhoto = uiUtils.escapeHtml(author.photoUrl || 'img/placeholder-avatar.png');

        const place = review.place || {};
        const placeId = place.id || review.placeId || '';
        const placeNameRaw = place.name || review.establishmentName || 'Lugar Desconocido';
        const placeName = uiUtils.escapeHtml(placeNameRaw);
        const placeUrlRaw = place.googleMapsUrl || '#';
        const placeUrl = uiUtils.escapeHtml(placeUrlRaw);

        const listId = review.listId || '';
        const listNameRaw = review.listName || 'Lista Desconocida';
        const listName = uiUtils.escapeHtml(listNameRaw);

        const itemNameRaw = review.itemName || 'Elemento sin nombre';
        const itemName = uiUtils.escapeHtml(itemNameRaw);

        const overallRatingValue = parseFloat(review.overallRating);
        const overallRating = Number.isFinite(overallRatingValue) ? overallRatingValue.toFixed(1) : '0.0';
        const ratingColor = this.getRatingColor(overallRating);

        const detailUrl = `detail-view.html?id=${review.id || ''}&listId=${listId}`;
        const dataDetailUrl = uiUtils.escapeHtml(detailUrl);
        const isOwner = Boolean(currentUserId && authorId && currentUserId === authorId);

        const placeLinkHtml = placeId && placeId !== '#'
            ? `<a href="place-detail.html?placeId=${placeId}" class="place-name-link" onclick="event.stopPropagation()">${placeName}</a>`
            : `<span class="place-name-link--no-link">${placeName}</span>`;

        let criteriaHtml = '';
        if (review.scores && review.criteriaDefinition && Object.keys(review.criteriaDefinition).length > 0) {
            const criteriaItems = Object.entries(review.criteriaDefinition)
                .map(([critKey, critDef]) => {
                    const score = review.scores[critKey];
                    if (score === undefined) return '';
                    const score10 = parseFloat(score).toFixed(1);
                    return `<div class="criteria-bar">
                                <div class="criteria-bar__label" title="${uiUtils.escapeHtml(critDef.label)}">${uiUtils.escapeHtml(critDef.label)}</div>
                                <div class="criteria-bar__viz">
                                    <div class="criteria-bar__bg">
                                        <div class="criteria-bar__fill" style="width: ${score10 * 10}%;"></div>
                                    </div>
                                    <div class="criteria-bar__value" style="color: ${this.getRatingColor(score10)};">${score10}</div>
                                </div>
                            </div>`;
                }).join('');
            if (criteriaItems) criteriaHtml = `<div class="criteria-bars-list">${criteriaItems}</div>`;
        }

        const commentHtml = review.comment ? `<p class="review-super-card__comment">${uiUtils.escapeHtml(review.comment)}</p>` : '';
        const tagsHtml = (review.userTags && review.userTags.length > 0)
            ? `<div class="review-super-card__tags">${review.userTags.map(tag => `<span class="info-tag">${uiUtils.escapeHtml(tag)}</span>`).join('')}</div>`
            : '';

        const imageHtml = review.photoUrl
            ? `<img src="${uiUtils.escapeHtml(review.photoUrl)}" alt="Foto de ${itemName}" class="review-super-card__image">`
            : `<div class="review-super-card__icon-placeholder"><i class="fas fa-camera"></i></div>`;

        const menuHtml = `
            <div class="review-menu" data-review-menu>
                <button class="review-menu__btn" type="button" aria-haspopup="true" aria-expanded="false" title="Opciones">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
                <div class="review-menu__dropdown" role="menu">
                    <button class="review-action" type="button" data-action="share">Compartir</button>
                    ${isOwner ? '<button class="review-action" type="button" data-action="edit">Editar rese\u00f1a</button><button class="review-action danger" type="button" data-action="delete">Eliminar</button>' : ''}
                </div>
            </div>`;

        return `
            <article class="review-super-card" onclick="window.location.href='${detailUrl}';"
                data-review-id="${uiUtils.escapeHtml(review.id || '')}"
                data-list-id="${uiUtils.escapeHtml(listId)}"
                data-author-id="${uiUtils.escapeHtml(authorId)}"
                data-author-name="${uiUtils.escapeHtml(authorNameRaw)}"
                data-list-name="${uiUtils.escapeHtml(listNameRaw)}"
                data-item-name="${uiUtils.escapeHtml(itemNameRaw)}"
                data-place-id="${uiUtils.escapeHtml(placeId)}"
                data-place-name="${uiUtils.escapeHtml(placeNameRaw)}"
                data-detail-url="${dataDetailUrl}"
                data-overall-rating="${overallRating}"
                data-photo-url="${uiUtils.escapeHtml(review.photoUrl || '')}"
                data-comment="${uiUtils.escapeHtml(review.comment || '')}"
                data-is-owner="${isOwner ? '1' : '0'}">
                <header class="review-super-card__header">
                    <div class="header-main-info">
                        <a href="profile.html?viewUserId=${authorId}" class="author-link" onclick="event.stopPropagation()">
                            <img src="${authorPhoto}" alt="Avatar de ${authorName}" class="author-avatar">
                            <span class="author-name">${authorName}</span>
                        </a>
                        <div class="list-highlight">
                            <span class="meta-separator">&middot;</span> en <a href="list-view.html?listId=${listId}" onclick="event.stopPropagation()">${listName}</a>
                        </div>
                    </div>
                    <div class="review-super-card__score">
                        <span class="score-value" style="color: ${ratingColor};">${overallRating}</span>
                        ${menuHtml}
                    </div>
                </header>
                <div class="review-super-card__body">
                    <div class="review-super-card__image-container">
                        ${imageHtml}
                    </div>
                    <div class="review-super-card__main-content">
                        <div class="review-super-card__title-group">
                            <h4 class="review-super-card__title">${itemName}</h4>
                            <p class="review-super-card__subtitle">
                                <a href="${placeUrl}" target="_blank" class="place-icon-link" onclick="event.stopPropagation()" title="Ver en Google Maps">
                                    <i class="fas fa-map-marker-alt"></i>
                                </a>
                                ${placeLinkHtml}
                            </p>
                        </div>
                        ${criteriaHtml}
                        ${commentHtml}
                        ${tagsHtml}
                    </div>
                </div>
            </article>
        `;
    },
   

    // AÑADE ESTA FUNCIÓN AUXILIAR DENTRO DE ListopicApp.uiUtils
    getRatingColor: function(rating) {
        const numericRating = parseFloat(rating);
        if (numericRating >= 8) return 'var(--accent-color-tertiary)'; // Verde
        if (numericRating >= 6) return 'var(--accent-color-quinary)';  // Amarillo
        if (numericRating >= 4) return 'var(--accent-color-secondary)';// Rosa/Naranja
        return 'var(--danger-color)'; // Rojo
    },

    updatePageHeaderInfo: function(categoryName = "Hmm...", listName = null) {
        const categoryEl = document.getElementById('page-category-name');
        const separatorEl = document.getElementById('page-list-name-separator');
        const listNameEl = document.getElementById('page-list-name');
        if (categoryEl) categoryEl.textContent = this.escapeHtml(categoryName);
        if (listName && listNameEl && separatorEl) {
            listNameEl.textContent = this.escapeHtml(listName);
            separatorEl.style.display = 'inline';
            listNameEl.style.display = 'inline';
        } else if (listNameEl && separatorEl) {
            listNameEl.textContent = '';
            separatorEl.style.display = 'none';
            listNameEl.style.display = 'none';
        }
    },



    // ... al final de uiUtils.js, dentro del objeto ListopicApp.uiUtils ...

    /**
     * Genera el HTML para una tarjeta de reseña en la vista de lista agrupada.
     * Muestra los criterios y la media de forma prominente.
     * @param {object} group - El objeto de la reseña agrupada.
     * @param {object} listData - Los datos de la lista (para los criterios).
     * @param {string} listIcon - La clase del icono para el placeholder.
     * @returns {string} El HTML de la tarjeta.
     */
    // En public/js/uiUtils.js

// En public/js/uiUtils.js

    // En /public/js/uiUtils.js

createListViewGroupCard: function(group, listData, listIcon) {
    const uiUtils = this;
    const detailUrl = `grouped-detail-view.html?listId=${group.listId}&placeId=${group.placeId}&item=${encodeURIComponent(group.itemName || "")}`;

    // Desglose de criterios con BARRAS DE PROGRESO (tu lógica se mantiene)
    let criteriaHtml = '';
    if (group.avgScores && listData.criteriaDefinition && Object.keys(listData.criteriaDefinition).length > 0) {
        const criteriaItems = Object.entries(group.avgScores)
            .map(([critKey, score]) => {
                const critDef = listData.criteriaDefinition[critKey];
                if (!critDef) return '';
                const score10 = parseFloat(score);
                return `
                    <div class="criteria-bar--compact">
                        <span class="criteria-bar__label">${uiUtils.escapeHtml(critDef.label)}</span>
                        <div class="criteria-bar__viz">
                            <div class="criteria-bar__bg">
                                <div class="criteria-bar__fill" style="width: ${score10 * 10}%; background-color: ${this.getRatingColor(score10)};"></div>
                            </div>
                            <span class="criteria-bar__value" style="color: ${this.getRatingColor(score10)};">${score10.toFixed(1)}</span>
                        </div>
                    </div>`;
            }).join('');
        if (criteriaItems) {
            criteriaHtml = `<div class="criteria-bars-list--compact">${criteriaItems}</div>`;
        }
    }
    
    // Etiquetas relevantes (tu lógica se mantiene)
    let tagsHtml = '';
    // CORRECCIÓN: Usamos group.groupTags que es el campo correcto que viene del backend
    if (group.groupTags && group.groupTags.length > 0) {
        const tags = group.groupTags.map(tag => uiUtils.buildInteractiveTag({
            text: tag,
            iconClass: 'fas fa-tag',
            tagType: 'group-tag',
            value: tag,
            entityType: 'grouped-item',
            entityId: group.groupId || `${group.listId || 'list'}-${group.placeId || 'place'}-${group.itemName || tag}`,
            extraClasses: 'info-tag--category',
            testIdPrefix: 'group-tag'
        })).join('');
        tagsHtml = `<div class="review-list-card__tags">${tags}</div>`;
    }

    // Imagen (tu lógica se mantiene)
    const imageHtml = group.thumbnailUrl
        ? `<img src="${uiUtils.escapeHtml(group.thumbnailUrl)}" alt="Foto" class="review-list-card__image">`
        : `<div class="review-list-card__icon-placeholder"><i class="${listIcon || 'fas fa-camera'}"></i></div>`;

    // --- ¡MEJORA! Creamos el nuevo botón del mapa ---
    const mapLinkTestId = uiUtils.generateAutomationId('map-link', group.placeId || group.establishmentName || group.itemName || 'map');
    const mapLinkHtml = group.googleMapsUrl
        ? `<a href="${uiUtils.escapeHtml(group.googleMapsUrl)}" class="score-container__map-link" target="_blank" rel="noopener" data-testid="${mapLinkTestId}" data-entity-type="place" data-entity-id="${uiUtils.escapeHtml(String(group.placeId || ''))}" onclick="event.stopPropagation()">
               <i class="fas fa-map-marked-alt" aria-hidden="true"></i>
               <span>Mapa</span>
           </a>`
        : '';

    // --- HTML FINAL DE LA TARJETA ---
    const cardAutomationId = uiUtils.generateAutomationId('list-view-card', group.listId || 'list', group.placeId || 'place', group.itemName || group.establishmentName || 'item');
    const safeGroupId = uiUtils.escapeHtml(String(group.groupId || `${group.listId || 'list'}-${group.placeId || 'place'}-${group.itemName || 'item'}`));

    return `
        <article class="review-list-card" role="button" tabindex="0" data-testid="${cardAutomationId}" data-entity-type="grouped-item" data-entity-id="${safeGroupId}" data-list-id="${uiUtils.escapeHtml(String(group.listId || ''))}" data-place-id="${uiUtils.escapeHtml(String(group.placeId || ''))}" data-item-name="${uiUtils.escapeHtml(String(group.itemName || group.establishmentName || ''))}" onclick="window.location.href='${detailUrl}'" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.href='${detailUrl}';}">
            <div class="review-list-card__image-container">${imageHtml}</div>
            <div class="review-list-card__main-content">
                <h4 class="review-list-card__title">${uiUtils.escapeHtml(group.itemName || group.establishmentName)}</h4>
                <div class="review-list-card__subtitle">
                    <span>${group.itemName ? uiUtils.escapeHtml(group.establishmentName) : ''}</span>

                    </div>
                <div class="review-list-card__criteria-section">
                    ${criteriaHtml}
                </div>
                ${tagsHtml}
            </div>
            <div class="review-list-card__score-container">

                <div class="score-container__main">
                    <span class="score-value">${(group.avgGeneralScore || 0).toFixed(1)}</span>
                    <span class="review-count-badge">${group.itemCount} reseña${group.itemCount > 1 ? 's' : ''}</span>
                </div>

                ${mapLinkHtml}

            </div>
        </article>
    `;
},
    
    getRatingColor: function(rating) {
        const numericRating = parseFloat(rating);
        if (numericRating >= 8) return 'var(--accent-color-tertiary)';
        if (numericRating >= 6) return 'var(--accent-color-quinary)';
        if (numericRating >= 4) return 'var(--accent-color-secondary)';
        return 'var(--danger-color)';
    },

    // Nos da el color en formato HEX, que es lo que el SVG necesita.
    getRatingHexColor: function(rating) {
        const numericRating = parseFloat(rating);
        if (numericRating >= 8) return '#06D6A0'; // Verde
        if (numericRating >= 6) return '#FFD166'; // Amarillo/Oro
        if (numericRating >= 4) return '#f56ead'; // Rosa
        return '#D9534F'; // Rojo
    },
    
    // En public/js/uiUtils.js, dentro de ListopicApp.uiUtils

    enrichReviews: async function(reviewDocs) {
        try {
            if (!reviewDocs || reviewDocs.length === 0) return [];
            
            const reviewsData = reviewDocs.map(doc => ({ id: doc.id, ...doc.data() }));
    
            // 1. Recolectar todos los IDs únicos necesarios
            const listIds = [...new Set(reviewsData.map(r => r.listId).filter(Boolean))];
            const placeIds = [...new Set(reviewsData.map(r => r.placeId).filter(Boolean))];
            const authorIds = [...new Set(reviewsData.map(r => r.userId).filter(Boolean))];
    
            // 2. Crear promesas para obtener todos los datos en paralelo
            const listPromises = listIds.map(id => ListopicApp.services.db.collection('lists').doc(id).get());
            const placePromises = placeIds.length > 0 ? 
                placeIds.map(id => ListopicApp.services.db.collection('places').doc(id).get()) : [];
            const authorPromises = authorIds.length > 0 ?
                authorIds.map(id => ListopicApp.services.db.collection('users').doc(id).get()) : [];
    
            // 3. Esperar a que todas las consultas se completen
            const [listSnapshots, placeSnapshots, authorSnapshots] = await Promise.all([
                Promise.all(listPromises),
                Promise.all(placePromises),
                Promise.all(authorPromises),
            ]);
    
            // 4. Crear mapas para un acceso rápido y eficiente a los datos
            const listsMap = new Map(
                listSnapshots.filter(doc => doc.exists).map(doc => [doc.id, doc.data()])
            );
            const placesMap = new Map(
                placeSnapshots.filter(doc => doc.exists).map(doc => [doc.id, doc.data()])
            );
            const authorsMap = new Map(
                authorSnapshots.filter(doc => doc.exists).map(doc => [doc.id, doc.data()])
            );
    
            // 5. Mapear sobre las reseñas originales y construir los objetos enriquecidos
            return reviewsData.map(review => {
                const listData = listsMap.get(review.listId);
                const authorData = authorsMap.get(review.userId);
                const placeData = placesMap.get(review.placeId);
                return {
                    ...review,
                    listName: listData?.name || 'Lista Desconocida',
                    criteriaDefinition: listData?.criteriaDefinition || {},
                    author: {
                        id: review.userId,
                        name: authorData?.displayName || authorData?.username || 'Usuario Anónimo',
                        photoUrl: authorData?.photoUrl || 'img/placeholder-avatar.png'
                    },
                    place: {
                        id: review.placeId,
                        name: placeData?.name || 'Lugar Desconocido',
                        googleMapsUrl: placeData?.googleMapsUrl || '#'
                    }
                };
            });
        } catch (error) {
            console.error("Error catastrófico en enrichReviews:", error);
            return [];
        }
    },
    renderCriteriaBars: function(scores, criteriaDefinition) {
        if (!scores || !criteriaDefinition || Object.keys(criteriaDefinition).length === 0) {
            return '<p class="loading-placeholder">No hay criterios para mostrar.</p>';
        }
    
        const criteriaItems = Object.entries(criteriaDefinition)
            .map(([critKey, critDef]) => {
                const score = scores[critKey];
                if (score === undefined || critDef.ponderable === false) return ''; // Opcional: no mostrar no ponderables
                
                const score10 = parseFloat(score).toFixed(1);
                return `<div class="criteria-bar">
                            <div class="criteria-bar__label" title="${this.escapeHtml(critDef.label)}">${this.escapeHtml(critDef.label)}</div>
                            <div class="criteria-bar__viz">
                                <div class="criteria-bar__bg">
                                    <div class="criteria-bar__fill" style="width: ${score10 * 10}%; background-color: ${this.getRatingColor(score10)};"></div>
                                </div>
                                <div class="criteria-bar__value" style="color: ${this.getRatingColor(score10)};">${score10}</div>
                            </div>
                        </div>`;
            }).join('');
    
        return criteriaItems || '<p class="loading-placeholder">No hay criterios ponderables para mostrar.</p>';
    },

    // Añade esta función dentro del objeto ListopicApp.uiUtils en tu archivo public/js/uiUtils.js

    updateReviewFormWithPlace: function(placeData) {
    const establishmentNameSearchInput = document.getElementById('restaurant-name-search-input');
    const establishmentNameHidden = document.getElementById('establishment-name');
    const locationDisplayNameInput = document.getElementById('location-display-name');
    const locationAddressManualInput = document.getElementById('location-address-manual');
    const locationRegionManualInput = document.getElementById('location-region-manual');
    const locationGoogleMapsUrlManualInput = document.getElementById('location-google-maps-url-manual');
    const locationLatInput = document.getElementById('location-latitude');
    const locationLonInput = document.getElementById('location-longitude');
    const locationPlaceIdInput = document.getElementById('location-googlePlaceId');
    const locationCityGInput = document.getElementById('location-city-g');
    const locationPostalCodeGInput = document.getElementById('location-postalCode-g');
    const locationCountryGInput = document.getElementById('location-country-g');

    if (establishmentNameSearchInput) establishmentNameSearchInput.value = placeData.name || '';
    if (establishmentNameHidden) establishmentNameHidden.value = placeData.name || '';
    if (locationDisplayNameInput) locationDisplayNameInput.value = placeData.name || '';
    if (locationAddressManualInput) locationAddressManualInput.value = placeData.addressFormatted || placeData.streetAddress || '';
    if (locationRegionManualInput) locationRegionManualInput.value = placeData.region || '';
    if (locationGoogleMapsUrlManualInput) locationGoogleMapsUrlManualInput.value = placeData.mapsUrl || '';
    if (locationLatInput) locationLatInput.value = placeData.latitude || "";
    if (locationLonInput) locationLonInput.value = placeData.longitude || "";
    if (locationPlaceIdInput) locationPlaceIdInput.value = placeData.id || placeData.placeId || "";
    if (locationCityGInput) locationCityGInput.value = placeData.city || "";
    if (locationPostalCodeGInput) locationPostalCodeGInput.value = placeData.postalCode || "";
    if (locationCountryGInput) locationCountryGInput.value = placeData.country || "";
},



    // ==========================================================
    // ===       FUNCIONES PARA RENDERIZAR BÚSQUEDA (MEJORADAS) ===
    // ==========================================================

    createListCard: function(listData, id) {
        const creatorName = listData.authorName || listData.ownerName || 'Anonimo';
        const rawId = id ?? listData.objectID ?? '';
        const safeId = this.escapeHtml(String(rawId));
        const cardTestId = this.generateAutomationId('search-card', 'list', rawId || listData.slug || listData.name);
        const typeTag = this.buildInteractiveTag({
            text: 'Lista',
            iconClass: 'fas fa-stream',
            tagType: 'type',
            value: 'list',
            entityType: 'list',
            entityId: id,
            extraClasses: 'info-tag--list'
        });
        const ownerTag = this.buildInteractiveTag({
            text: creatorName,
            iconClass: 'fas fa-user',
            tagType: 'owner',
            value: listData.authorId || listData.ownerId || creatorName,
            entityType: 'list',
            entityId: id
        });
        const reviewsTag = this.buildInteractiveTag({
            text: `${listData.reviewCount || 0} reseñas`,
            iconClass: 'fas fa-pencil-alt',
            tagType: 'reviews',
            value: listData.reviewCount || 0,
            entityType: 'list',
            entityId: id,
            extraClasses: 'info-tag--reviews'
        });

        return `
            <a href="list-view.html?listId=${safeId}" class="search-card" data-testid="${cardTestId}" data-entity-type="list" data-entity-id="${safeId}">
                <div class="search-card__icon-container">
                    <i class="fas fa-list-alt" aria-hidden="true"></i>
                </div>
                <div class="search-card__content">
                    <h4 class="search-card__title">${this.escapeHtml(listData.name)}</h4>
                    <div class="search-card__tags">
                        ${typeTag}
                        ${ownerTag}
                        ${reviewsTag}
                    </div>
                </div>
            </a>
        `;
    },

    createUserCard: function(userData, id) {
        const photoHtml = userData.photoUrl
            ? `<img src="${this.escapeHtml(userData.photoUrl)}" alt="Avatar de ${this.escapeHtml(userData.username)}">`
            : '<i class="fas fa-user" aria-hidden="true"></i>';
        const rawId = id ?? userData.id ?? '';
        const safeId = this.escapeHtml(String(rawId));
        const cardTestId = this.generateAutomationId('search-card', 'user', rawId || userData.username || userData.displayName);
        const typeTag = this.buildInteractiveTag({
            text: 'Usuario',
            iconClass: 'fas fa-user',
            tagType: 'type',
            value: 'user',
            entityType: 'user',
            entityId: id,
            extraClasses: 'info-tag--user'
        });
        const listsTag = this.buildInteractiveTag({
            text: `${userData.publicListsCount || 0} listas`,
            iconClass: 'fas fa-list-alt',
            tagType: 'lists',
            value: userData.publicListsCount || 0,
            entityType: 'user',
            entityId: id,
            extraClasses: 'info-tag--lists'
        });
        const reviewsTag = this.buildInteractiveTag({
            text: `${userData.reviewsCount || 0} reseñas`,
            iconClass: 'fas fa-star',
            tagType: 'reviews',
            value: userData.reviewsCount || 0,
            entityType: 'user',
            entityId: id,
            extraClasses: 'info-tag--reviews'
        });

        return `
            <a href="profile.html?viewUserId=${safeId}" class="search-card" data-testid="${cardTestId}" data-entity-type="user" data-entity-id="${safeId}">
                <div class="search-card__icon-container">
                    ${photoHtml}
                </div>
                <div class="search-card__content">
                    <h4 class="search-card__title">${this.escapeHtml(userData.displayName || userData.username)}</h4>
                    <div class="search-card__tags">
                        ${typeTag}
                        ${listsTag}
                        ${reviewsTag}
                    </div>
                </div>
            </a>
        `;
    },

    createPlaceCard: function(placeData, id) {
        const rawId = id ?? placeData.id ?? '';
        const safeId = this.escapeHtml(String(rawId));
        const cardTestId = this.generateAutomationId('search-card', 'place', rawId || placeData.name);
        const typeTag = this.buildInteractiveTag({
            text: 'Lugar',
            iconClass: 'fas fa-map-pin',
            tagType: 'type',
            value: 'place',
            entityType: 'place',
            entityId: id,
            extraClasses: 'info-tag--place'
        });
        const addressTag = placeData.address
            ? this.buildInteractiveTag({
                  text: placeData.address,
                  iconClass: 'fas fa-location-arrow',
                  tagType: 'address',
                  value: placeData.address,
                  entityType: 'place',
                  entityId: id,
                  extraClasses: 'info-tag--location'
              })
            : '';

        return `
            <a href="place-detail.html?placeId=${safeId}" class="search-card" data-testid="${cardTestId}" data-entity-type="place" data-entity-id="${safeId}">
                <div class="search-card__icon-container">
                    <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
                </div>
                <div class="search-card__content">
                    <h4 class="search-card__title">${this.escapeHtml(placeData.name)}</h4>
                    <div class="search-card__tags">
                        ${typeTag}
                        ${addressTag}
                    </div>
                </div>
            </a>
        `;
    },

    createGroupedItemCard: function(itemData) {
        const uiUtils = this;
        const ratingValue = typeof itemData.avgGeneralScore === 'number'
            ? itemData.avgGeneralScore
            : (typeof itemData.averageRating === 'number' ? itemData.averageRating : null);
        const safeListId = itemData.listId || itemData.listSlug || '';
        const safePlaceId = itemData.placeId || '';
        const entityAutomationId = itemData.objectID || `${safeListId}-${safePlaceId}` || itemData.itemName || 'item';
        const safeEntityId = uiUtils.escapeHtml(String(entityAutomationId));
        const typeTag = uiUtils.buildInteractiveTag({
            text: 'Elemento',
            iconClass: 'fas fa-box-open',
            tagType: 'type',
            value: 'item',
            entityType: 'item',
            entityId: entityAutomationId,
            extraClasses: 'info-tag--item',
            testIdPrefix: 'tag'
        });
        const ratingTag = ratingValue !== null
            ? uiUtils.buildInteractiveTag({
                  text: `${ratingValue.toFixed(1)}/10`,
                  iconClass: 'fas fa-star',
                  tagType: 'rating',
                  value: ratingValue,
                  entityType: 'item',
                  entityId: entityAutomationId,
                  extraClasses: 'info-tag--rating'
              })
            : '';
        const listTag = itemData.listName
            ? uiUtils.buildInteractiveTag({
                  text: itemData.listName,
                  iconClass: 'fas fa-list',
                  tagType: 'list',
                  value: safeListId || itemData.listName,
                  entityType: 'item',
                  entityId: entityAutomationId,
                  extraClasses: 'info-tag--list'
              })
            : '';
        const cityTag = itemData.placeCity
            ? uiUtils.buildInteractiveTag({
                  text: itemData.placeCity,
                  iconClass: 'fas fa-city',
                  tagType: 'city',
                  value: itemData.placeCity,
                  entityType: 'item',
                  entityId: entityAutomationId,
                  extraClasses: 'info-tag--location'
              })
            : '';

        const params = [];
        if (itemData.listId) {
            params.push(`listId=${encodeURIComponent(itemData.listId)}`);
        }
        if (itemData.placeId) {
            params.push(`placeId=${encodeURIComponent(itemData.placeId)}`);
        }
        if (itemData.itemName) {
            params.push(`item=${encodeURIComponent(itemData.itemName)}`);
        }
        const detailHref = `grouped-detail-view.html${params.length ? `?${params.join('&')}` : ''}`;

        const cardTestId = uiUtils.generateAutomationId('search-card', 'item', entityAutomationId || itemData.itemName || safeListId);

        return `
            <a href="${detailHref}" class="search-card search-card--item" data-testid="${cardTestId}" data-entity-type="item" data-entity-id="${safeEntityId}">
                <div class="search-card__icon-container">
                    <i class="fas fa-star" aria-hidden="true"></i>
                </div>
                <div class="search-card__content">
                    <h4 class="search-card__title">${uiUtils.escapeHtml(itemData.itemName || 'Elemento sin nombre')}</h4>
                    <p class="search-card__subtitle">${uiUtils.escapeHtml(itemData.establishmentName || '')}</p>
                    <div class="search-card__tags">
                        ${typeTag}
                        ${listTag}
                        ${cityTag}
                        ${ratingTag}
                    </div>
                </div>
            </a>
        `;
    },
    
    // ==========================================================
    // === FUNCIÓN DE COMPRESIÓN DE IMÁGENES (REVISADA)       ===
    // ==========================================================

    compressImage: function(file, options = {}) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                return reject(new Error('El archivo no es una imagen.'));
            }

            const { maxWidth = 1280, maxHeight = 1280, quality = 0.7 } = options;
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                // Generamos un nombre de archivo más limpio y seguro
                                const safeFileName = `compressed_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_').toLowerCase()}`;
                                const newFile = new File([blob], safeFileName, {
                                    type: 'image/jpeg', // Forzamos a JPEG por la compresión con calidad
                                    lastModified: Date.now(),
                                });
                                resolve(newFile);
                            } else {
                                reject(new Error('La conversión de Canvas a Blob falló.'));
                            }
                        },
                        'image/jpeg',
                        quality
                    );
                };
                img.onerror = (error) => reject(new Error('No se pudo cargar la imagen para comprimirla.'));
            };
            reader.onerror = (error) => reject(new Error('Error al leer el archivo de imagen.'));
            
            reader.readAsDataURL(file);
        });
    }
};


(function registerInteractiveTagHandlers() {
    if (window.__ListopicInteractiveTagsInitialized) {
        return;
    }
    window.__ListopicInteractiveTagsInitialized = true;

    function toggleTagSelection(tagEl) {
        const currentState = tagEl.getAttribute('aria-pressed') === 'true';
        const nextState = !currentState;
        tagEl.setAttribute('aria-pressed', String(nextState));
        tagEl.dataset.selected = String(nextState);
    }

    document.addEventListener('click', (event) => {
        const tagEl = event.target.closest('.info-tag[data-interactive="true"]');
        if (!tagEl) {
            return;
        }
        toggleTagSelection(tagEl);
    });

    document.addEventListener('keydown', (event) => {
        const tagEl = event.target.closest('.info-tag[data-interactive="true"]');
        if (!tagEl) {
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleTagSelection(tagEl);
        }
    });
})();


