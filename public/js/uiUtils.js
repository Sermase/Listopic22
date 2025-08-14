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

    // En uiUtils.js, reemplaza la función entera por esta:

    renderReviewSuperCard: function(review) {
        const uiUtils = this;

        // --- 1. Preparación de Datos (Ahora mucho más seguro) ---
        const author = review.author || {};
        const authorId = author.id || review.userId;
        const authorName = uiUtils.escapeHtml(author.name || 'Usuario Anónimo');
        const authorPhoto = uiUtils.escapeHtml(author.photoUrl || 'img/placeholder-avatar.png');

        const place = review.place || {};
        const placeId = place.id || review.placeId;
        const placeName = uiUtils.escapeHtml(place.name || review.establishmentName || 'Lugar Desconocido');
        const placeUrl = uiUtils.escapeHtml(place.googleMapsUrl || '#');

        const list = { id: review.listId, name: uiUtils.escapeHtml(review.listName || 'Lista Desconocida') };
        const overallRating = (review.overallRating || 0).toFixed(1);
        const detailUrl = `detail-view.html?id=${review.id}&listId=${review.listId}`;

        // --- 2. Construcción de Bloques de HTML ---
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
            ? `<img src="${uiUtils.escapeHtml(review.photoUrl)}" alt="Foto de ${uiUtils.escapeHtml(review.itemName)}" class="review-super-card__image">`
            : `<div class="review-super-card__icon-placeholder"><i class="fas fa-camera"></i></div>`;
        
        // --- 3. Ensamblado Final ---
        return `
            <article class="review-super-card" onclick="window.location.href='${detailUrl}';">
                <header class="review-super-card__header">
                    <div class="header-main-info">
                        <a href="profile.html?viewUserId=${authorId}" class="author-link" onclick="event.stopPropagation()">
                            <img src="${authorPhoto}" alt="Avatar de ${authorName}" class="author-avatar">
                            <span class="author-name">${authorName}</span>
                        </a>
                        <div class="list-highlight">
                            <span class="meta-separator">•</span> en <a href="list-view.html?listId=${list.id}" onclick="event.stopPropagation()">${list.name}</a>
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
        tagsHtml = `<div class="review-list-card__tags">${group.groupTags.map(tag => `<span class="info-tag">${uiUtils.escapeHtml(tag)}</span>`).join('')}</div>`;
    }

    // Imagen (tu lógica se mantiene)
    const imageHtml = group.thumbnailUrl
        ? `<img src="${uiUtils.escapeHtml(group.thumbnailUrl)}" alt="Foto" class="review-list-card__image">`
        : `<div class="review-list-card__icon-placeholder"><i class="${listIcon || 'fas fa-camera'}"></i></div>`;

    // --- ¡MEJORA! Creamos el nuevo botón del mapa ---
    const mapLinkHtml = group.googleMapsUrl 
        ? `<a href="${uiUtils.escapeHtml(group.googleMapsUrl)}" class="score-container__map-link" target="_blank" onclick="event.stopPropagation()">
               <i class="fas fa-map-marked-alt"></i>
               <span>Mapa</span>
           </a>`
        : '';

    // --- HTML FINAL DE LA TARJETA ---
    return `
        <div class="review-list-card" onclick="window.location.href='${detailUrl}'">
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
        </div>
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

    updateReviewFormWithPlace: function(place) {
        if (!place) return;

        console.log("uiUtils: Updating form with CLEANED place object from backend:", place);

        // Actualizar el estado global con el objeto limpio de Firestore
        window.ListopicApp.state.currentSelectedPlaceInfo = place;

        // Actualizar los campos del formulario
        const establishmentNameInput = document.getElementById('restaurant-name-search-input');
        const establishmentNameHidden = document.getElementById('establishment-name');
        const locationDisplayNameInput = document.getElementById('location-display-name');
        const locationAddressManualInput = document.getElementById('location-address-manual');
        const locationRegionManualInput = document.getElementById('location-region-manual');
        const locationGoogleMapsUrlManualInput = document.getElementById('location-google-maps-url-manual');
        
        // Campos ocultos
        const locationLatInput = document.getElementById('location-latitude');
        const locationLonInput = document.getElementById('location-longitude');
        const locationPlaceIdInput = document.getElementById('location-googlePlaceId'); // El más importante
        const locationCityGInput = document.getElementById('location-city-g');
        const locationPostalCodeGInput = document.getElementById('location-postalCode-g');
        const locationCountryGInput = document.getElementById('location-country-g');

        if (establishmentNameInput) establishmentNameInput.value = place.name || '';
        if (establishmentNameHidden) establishmentNameHidden.value = place.name || '';
        if (locationDisplayNameInput) locationDisplayNameInput.value = place.name || '';
        // Usamos los campos del documento de Firestore
        if (locationAddressManualInput) locationAddressManualInput.value = place.address || '';
        if (locationRegionManualInput) locationRegionManualInput.value = place.region || '';
        if (locationGoogleMapsUrlManualInput) locationGoogleMapsUrlManualInput.value = place.googleMapsUrl || '';
        
        // Usamos la estructura anidada de 'location'
        if (locationLatInput && place.location) locationLatInput.value = place.location.latitude || "";
        if (locationLonInput && place.location) locationLonInput.value = place.location.longitude || "";
        
        // El ID del documento AHORA es el placeId que necesitamos
        if (locationPlaceIdInput) locationPlaceIdInput.value = place.id || ""; 
        
        // Rellenamos el resto de campos si existen en nuestro objeto
        if (locationCityGInput) locationCityGInput.value = place.city || "";
        if (locationPostalCodeGInput) locationPostalCodeGInput.value = place.postalCode || "";
        if (locationCountryGInput) locationCountryGInput.value = place.country || "";

        // Opcional: abrir los campos manuales para que el usuario vea los datos
        const manualLocationFieldsDiv = document.getElementById('manual-location-fields');
        if (manualLocationFieldsDiv) manualLocationFieldsDiv.style.display = 'block';
    },

    compressImage: function(file, options = {}) {
        return new Promise((resolve, reject) => {
            const { maxWidth = 1280, maxHeight = 1280, quality = 0.7 } = options;
            const reader = new FileReader();
            reader.readAsDataURL(file);
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
                                const newFile = new File([blob], `compressed_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`.toLowerCase(), {
                                    type: 'image/jpeg',
                                    lastModified: Date.now(),
                                });
                                resolve(newFile);
                            } else {
                                reject(new Error('Canvas to Blob conversion failed'));
                            }
                        },
                        'image/jpeg',
                        quality
                    );
                };
                img.onerror = (error) => reject(error);
            };
            reader.onerror = (error) => reject(error);
        });
    }
};

