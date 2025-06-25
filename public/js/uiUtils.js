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
    // === FUNCIÓN CENTRALIZADA: SUPER TARJETA RESEÑA v2.0 =====
    // ==========================================================
    renderReviewSuperCard: function(review) {
        const uiUtils = this;

        // --- Preparación de Datos ---
        const creationDate = review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString('es-ES') : 'Fecha desconocida';
        const placeName = review.establishmentName || 'Lugar no especificado';
        const placeAddress = review.placeAddress || '';
        const placeAddressUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeAddress)}`;
        const itemName = review.itemName || 'Valoración General';
        const listName = review.listName || 'Lista Desconocida';
        const overallRating = (review.overallRating || 0).toFixed(1);
        const detailUrl = `detail-view.html?id=${review.id}&listId=${review.listId}`;
        const listUrl = `list-view.html?listId=${review.listId}`;

        // Helper para el color de las barras de notas
        const getRatingColor = (rating) => {
            if (rating >= 8) return '#06D6A0'; // Verde (terciario)
            if (rating >= 6) return '#FFD166'; // Amarillo (primario)
            if (rating >= 4) return '#118AB2'; // Azul (cuaternario)
            return '#f56ead'; // Rosa/Rojo (secundario)
        };

        // --- Construcción de la sección de Criterios con BARRAS DE COLORES ---
        let criteriaHtml = '<p><em>No hay valoraciones detalladas.</em></p>';
        if (review.scores && review.criteriaDefinition && Object.keys(review.criteriaDefinition).length > 0) {
            const criteriaItems = Object.entries(review.criteriaDefinition)
                .map(([critKey, critDef]) => {
                    const score = review.scores[critKey];
                    if (score === undefined) return '';
                    const score10 = parseFloat(score).toFixed(1);
                    const widthPercent = (score10 / 10) * 100;
                    const barColor = getRatingColor(score10);
                    return `
                        <div class="criteria-bar">
                            <div class="criteria-bar__label" title="${uiUtils.escapeHtml(critDef.label)}">${uiUtils.escapeHtml(critDef.label)}</div>
                            <div class="criteria-bar__viz">
                                <div class="criteria-bar__bg">
                                    <div class="criteria-bar__fill" style="width: ${widthPercent}%; background-color: ${barColor};"></div>
                                </div>
                                <div class="criteria-bar__value" style="color: ${barColor};">${score10}</div>
                            </div>
                        </div>`;
                }).join('');
            if (criteriaItems) {
                criteriaHtml = `<div class="criteria-bars-list">${criteriaItems}</div>`;
            }
        }
        
        // --- (Comentario y Tags sin cambios en la lógica) ---
        let commentHtml = '<em></em>';
        if (review.comment) {
            const snippet = review.comment.length > 120 ? uiUtils.escapeHtml(review.comment.substring(0, 120)) + '...' : uiUtils.escapeHtml(review.comment);
            commentHtml = `<p class="comment-snippet">${snippet}</p>`;
        }
        let tagsHtml = '<em></em>';
        if (review.userTags && review.userTags.length > 0) {
            tagsHtml = review.userTags.map(tag => `<span class="info-tag">${uiUtils.escapeHtml(tag)}</span>`).join('');
        }
        
        // --- (Imagen/Icono sin cambios en la lógica) ---
        let imageHtml;
        if (review.photoUrl) {
            imageHtml = `<img src="${uiUtils.escapeHtml(review.photoUrl)}" alt="Foto de ${uiUtils.escapeHtml(itemName)}" class="review-super-card__image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                         <div class="review-super-card__icon-placeholder" style="display:none;"><i class="fas fa-utensils"></i></div>`;
        } else {
            imageHtml = `<div class="review-super-card__icon-placeholder"><i class="fas fa-utensils"></i></div>`;
        }

        // --- Ensamblado Final con toda la tarjeta clicable ---
        return `
            <article class="review-super-card" onclick="event.stopPropagation(); window.location.href='${detailUrl}';">
                <header class="review-super-card__header">
                    <div class="review-super-card__title-group">
                        <h4 class="review-super-card__title">${uiUtils.escapeHtml(itemName)}</h4>
                        <p class="review-super-card__subtitle">
                            en <strong>${uiUtils.escapeHtml(placeName)}</strong> &middot; ${creationDate}
                        </p>
                    </div>
                    <div class="review-super-card__score">
                        <span class="score-value">${overallRating}</span>
                        <span class="score-label">General</span>
                    </div>
                </header>
                <div class="review-super-card__body">
                    <div class="review-super-card__image-container">
                        ${imageHtml}
                    </div>
                    <div class="review-super-card__main-content">
                        ${criteriaHtml}
                        <section class="review-super-card__section">
                            ${tagsHtml}
                        </section>
                        <section class="review-super-card__section">
                            ${commentHtml}
                        </section>
                    </div>
                </div>
                <footer class="review-super-card__footer">
                    <a href="${placeAddressUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="address-link">
                        <i class="fas fa-map-marker-alt"></i> ${uiUtils.escapeHtml(placeAddress)}
                    </a>
                    <div class="tags-container">${tagsHtml}</div>
                </footer>
            </article>
        `;
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