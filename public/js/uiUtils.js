// Contenido completo para uiUtils.js

window.ListopicApp = window.ListopicApp || {};

// Añadir una caché de categorías al estado global si no existe
window.ListopicApp.state = window.ListopicApp.state || {};
window.ListopicApp.state.categoryCache = window.ListopicApp.state.categoryCache || {};


ListopicApp.uiUtils = {
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
// En public/js/uiUtils.js

// En public/js/uiUtils.js

// En public/js/uiUtils.js

// En public/js/uiUtils.js

renderReviewSuperCard: function(review) {
    const uiUtils = this;

    // --- 1. Preparación de Datos ---
    const author = review.author || { id: '#', photoUrl: 'img/placeholder-avatar.png', name: 'Usuario' };
    const place = review.place || { id: '#', name: review.establishmentName || 'Lugar Desconocido' };
    const list = { id: review.listId, name: review.listName || 'Lista Desconocida' };
    const overallRating = (review.overallRating || 0).toFixed(1);
    const detailUrl = `detail-view.html?id=${review.id}&listId=${review.listId}`;

    // --- 2. Construcción de Bloques de HTML ---
    
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
                                <div class="criteria-bar__bg"><div class="criteria-bar__fill" style="width: ${score10 * 10}%;"></div></div>
                                <div class="criteria-bar__value">${score10}</div>
                            </div>
                        </div>`;
            }).join('');
        if (criteriaItems) criteriaHtml = `<div class="criteria-bars-list">${criteriaItems}</div>`;
    }
    
    let commentHtml = review.comment ? `<p class="review-super-card__comment">${uiUtils.escapeHtml(review.comment)}</p>` : '';
    let tagsHtml = (review.userTags && review.userTags.length > 0) 
        ? `<div class="review-super-card__tags">${review.userTags.map(tag => `<span class="info-tag">${uiUtils.escapeHtml(tag)}</span>`).join('')}</div>` 
        : '';

    let imageHtml = review.photoUrl
        ? `<img src="${uiUtils.escapeHtml(review.photoUrl)}" alt="Foto de ${uiUtils.escapeHtml(review.itemName)}" class="review-super-card__image">`
        : `<div class="review-super-card__icon-placeholder"><i class="fas fa-camera"></i></div>`;

    // --- 3. Ensamblado Final de la Tarjeta ---
    return `
        <article class="review-super-card" onclick="window.location.href='${detailUrl}';">
            <header class="review-super-card__header">
                <div class="header-main-info">
                    <a href="profile.html?viewUserId=${author.id}" class="author-link" onclick="event.stopPropagation()">
                        <img src="${uiUtils.escapeHtml(author.photoUrl)}" alt="Avatar de ${uiUtils.escapeHtml(author.name)}" class="author-avatar">
                        <span class="author-name">${uiUtils.escapeHtml(author.name)}</span>
                    </a>
                    <div class="list-highlight">
                         <span class="meta-separator">•</span> en <a href="list-view.html?listId=${list.id}" onclick="event.stopPropagation()">${uiUtils.escapeHtml(list.name)}</a>
                    </div>
                </div>
                <div class="review-super-card__score">
                    <span class="score-value" style="color: ${this.getRatingColor(overallRating)};">${overallRating}</span>
                </div>
            </header>
            <div class="review-super-card__body">
                <div class="review-super-card__image-container">
                    ${imageHtml}
                </div>
                <div class="review-super-card__main-content">
                    <div class="review-super-card__title-group">
                        <h4 class="review-super-card__title">${uiUtils.escapeHtml(review.itemName)}</h4>
                        <p class="review-super-card__subtitle">
                             <a href="grouped-detail-view.html?listId=${review.listId}&placeId=${place.id}&itemName=${encodeURIComponent(review.itemName)}" class="place-name-link" onclick="event.stopPropagation()">
                                <i class="fas fa-map-marker-alt"></i> ${uiUtils.escapeHtml(place.name)}
                            </a>
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
    }
};