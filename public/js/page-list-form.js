window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListForm = (() => {
    function init() {
        console.log('page-list-form.js: Initializing List Form page logic...');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        // Para llamar a Cloud Functions desde el cliente
        const functions = firebase.app().functions(ListopicApp.config.firebaseConfig.region || 'europe-west1'); // Asegúrate que la región sea la correcta

        const listForm = document.getElementById('list-form');
        if (!listForm) {
            console.error("LIST-FORM: Elemento #list-form no encontrado. Saliendo de init.");
            return;
        }

        const addCritBtnLF = document.getElementById('add-criterion-btn');
        const critListLF = document.getElementById('criteria-list');
        const addTagBtnLF = document.getElementById('add-tag-btn');
        const tagsListLF = document.getElementById('tags-list');
        const categorySelect = document.getElementById('list-category');
        const fixedTagsGroup = document.getElementById('fixed-tags-group');
        const listFormTitleH2 = listForm.parentElement?.querySelector('h2');
        const listNameInput = document.getElementById('list-name');
        const isPublicToggle = document.getElementById('list-public-toggle'); // ¡AÑADE ESTA LÍNEA AQUÍ!


        if (!listNameInput) console.warn("LIST-FORM: Input #list-name no encontrado.");
        if (!addCritBtnLF) console.warn("LIST-FORM: Botón #add-criterion-btn no encontrado.");
        if (!critListLF) console.warn("LIST-FORM: Contenedor #criteria-list no encontrado.");
        if (!addTagBtnLF) console.warn("LIST-FORM: Botón #add-tag-btn no encontrado.");
        if (!tagsListLF) console.warn("LIST-FORM: Contenedor #tags-list no encontrado.");

        // Estado auxiliar global para edición
        window.ListopicApp.state = window.ListopicApp.state || {};
        window.ListopicApp.state.isEditingList = false;
        window.ListopicApp.state.currentEditingCategoryId = null;

        const createCriterionItem = (criterionKeyFromDb = null, data = {}) => {
            console.log("createCriterionItem: Llamado con key:", criterionKeyFromDb, "data:", data);
            const div = document.createElement('div');
            div.className = 'criterion-item form-group';
            const domKey = criterionKeyFromDb || `crit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

            const label = data.label || '';
            const labelMin = data.labelMin || '';
            const labelMax = data.labelMax || '';
            const isPonderable = data.ponderable === undefined ? true : data.ponderable;
            const minVal = data.min !== undefined ? data.min : 0;
            const maxVal = data.max !== undefined ? data.max : 10;
            const stepVal = data.step !== undefined ? data.step : 0.1;

            let uiUtils = ListopicApp.uiUtils || { escapeHtml: (val) => val };

            div.innerHTML = `
                <div class="criterion-main-input">
                    <label for="criteria_label_${domKey}">Nombre del Criterio:</label>
                    <input type="text" id="criteria_label_${domKey}" name="criteria_label_${domKey}" placeholder="Ej: Sabor, Ambiente" class="form-input criterion-input" value="${uiUtils.escapeHtml(label)}" required data-criterion-key-from-db="${uiUtils.escapeHtml(criterionKeyFromDb || '')}">
                </div>
                <div class="criterion-slider-config">
                    <div>
                        <label for="criteria_labelMin_${domKey}">Etiqueta Mínima:</label>
                        <input type="text" id="criteria_labelMin_${domKey}" name="criteria_labelMin_${domKey}" placeholder="Ej: Malo" class="form-input criterion-input-small" value="${uiUtils.escapeHtml(labelMin)}">
                    </div>
                    <div>
                        <label for="criteria_labelMax_${domKey}">Etiqueta Máxima:</label>
                        <input type="text" id="criteria_labelMax_${domKey}" name="criteria_labelMax_${domKey}" placeholder="Ej: Excelente" class="form-input criterion-input-small" value="${uiUtils.escapeHtml(labelMax)}">
                    </div>
                    <!--
                    <div>
                        <label for="criteria_min_${domKey}">Valor Mín.:</label>
                        <input type="number" id="criteria_min_${domKey}" name="criteria_min_${domKey}" class="form-input criterion-input-xtra-small" value="${minVal}" step="any" title="Valor mínimo">
                    </div>
                    <div>
                        <label for="criteria_max_${domKey}">Valor Máx.:</label>
                        <input type="number" id="criteria_max_${domKey}" name="criteria_max_${domKey}" class="form-input criterion-input-xtra-small" value="${maxVal}" step="any" title="Valor máximo">
                    </div>
                    <div>
                        <label for="criteria_step_${domKey}">Paso:</label>
                        <input type="number" id="criteria_step_${domKey}" name="criteria_step_${domKey}" class="form-input criterion-input-xtra-small" value="${stepVal}" step="any" min="0.01" title="Incremento (ej: 0.01, 0.1, 0.5, 1)">
                    </div>
                    -->
                </div>
                <div class="criterion-options">
                    <label class="criterion-weighted-label" for="criteria_isPonderable_${domKey}" title="Marcar si este criterio debe contar para la puntuación general">
                        <input type="checkbox" id="criteria_isPonderable_${domKey}" name="criteria_isPonderable_${domKey}" class="criterion-weighted-checkbox" ${isPonderable ? 'checked' : ''}> Pondera para la media
                    </label>
                    <button type="button" class="remove-button danger" title="Eliminar criterio">×</button>
                </div>`;
            console.log("createCriterionItem: HTML generado.");
            // Añadir botón de opciones avanzadas y campos ocultos para min/max/step/type
            try {
                const optionsDiv = div.querySelector('.criterion-options');
                if (optionsDiv) {
                    const advBtn = document.createElement('button');
                    advBtn.type = 'button';
                    advBtn.className = 'advanced-button';
                    advBtn.dataset.critDomkey = domKey;
                    advBtn.title = 'Opciones avanzadas';
                    advBtn.textContent = '⚙️ Opciones';
                    const removeBtn = optionsDiv.querySelector('.remove-button');
                    if (removeBtn) {
                        optionsDiv.insertBefore(advBtn, removeBtn);
                    } else {
                        optionsDiv.appendChild(advBtn);
                    }
                }
                const hiddenMin = document.createElement('input');
                hiddenMin.type = 'hidden';
                hiddenMin.name = `criteria_min_${domKey}`;
                hiddenMin.value = minVal;
                const hiddenMax = document.createElement('input');
                hiddenMax.type = 'hidden';
                hiddenMax.name = `criteria_max_${domKey}`;
                hiddenMax.value = maxVal;
                const hiddenStep = document.createElement('input');
                hiddenStep.type = 'hidden';
                hiddenStep.name = `criteria_step_${domKey}`;
                hiddenStep.value = stepVal;
                const hiddenType = document.createElement('input');
                hiddenType.type = 'hidden';
                hiddenType.name = `criteria_type_${domKey}`;
                hiddenType.value = 'slider';
                div.appendChild(hiddenMin);
                div.appendChild(hiddenMax);
                div.appendChild(hiddenStep);
                div.appendChild(hiddenType);
            } catch(e) { console.warn('No se pudieron añadir campos avanzados:', e); }
            return div;
        };

        const createTagItem = (tagValue = "") => {
            const div = document.createElement('div');
            div.className = 'tag-item form-group';
            let uiUtils = ListopicApp.uiUtils || { escapeHtml: (val) => val };
            const escapedTagValue = uiUtils.escapeHtml(tagValue || '');
            div.innerHTML = `
                <input type="text" name="tags[]" placeholder="Nombre de Etiqueta (Ej: Vegano)" class="form-input tag-input" value="${escapedTagValue}" required>
                <button type="button" class="remove-button danger" title="Eliminar etiqueta">×</button>`;
            return div;
        };

        // Modal avanzado reutilizable
        function ensureAdvancedModal() {
            if (document.getElementById('criterion-advanced-modal')) return;
            const overlay = document.createElement('div');
            overlay.id = 'criterion-advanced-modal';
            overlay.className = 'lp-modal-overlay';
            overlay.style.display = 'none';
            overlay.innerHTML = `
                <div class="lp-modal">
                    <h3>Opciones avanzadas</h3>
                    <div class="lp-modal-body">
                        <div class="form-row"><label>Tipo</label>
                            <select id="adv-crit-type"><option value="slider">Deslizador</option></select>
                        </div>
                        <div class="form-row"><label>Mín</label><input id="adv-crit-min" type="number" step="any"></div>
                        <div class="form-row"><label>Máx</label><input id="adv-crit-max" type="number" step="any"></div>
                        <div class="form-row"><label>Paso</label><input id="adv-crit-step" type="number" step="any" min="0.01"></div>
                        <div class="form-row"><label><input id="adv-crit-ponderable" type="checkbox"> Ponderable</label></div>
                    </div>
                    <div class="lp-modal-actions">
                        <button id="adv-crit-accept" class="button primary">Aceptar</button>
                        <button id="adv-crit-cancel" class="button secondary">No, quiero mantenerlos</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
        }

        function openAdvancedFor(criterionEl) {
            ensureAdvancedModal();
            const modal = document.getElementById('criterion-advanced-modal');
            const labelInput = criterionEl.querySelector('input[name^="criteria_label_"]');
            const suffix = labelInput ? labelInput.name.substring('criteria_label_'.length) : null;
            if (!suffix) return;
            modal.dataset.targetSuffix = suffix;
            const typeInput = criterionEl.querySelector(`input[name="criteria_type_${suffix}"]`);
            const minInput = criterionEl.querySelector(`input[name="criteria_min_${suffix}"]`);
            const maxInput = criterionEl.querySelector(`input[name="criteria_max_${suffix}"]`);
            const stepInput = criterionEl.querySelector(`input[name="criteria_step_${suffix}"]`);
            const pondInput = criterionEl.querySelector(`#criteria_isPonderable_${suffix}`);
            modal.querySelector('#adv-crit-type').value = typeInput?.value || 'slider';
            modal.querySelector('#adv-crit-min').value = minInput?.value ?? 0;
            modal.querySelector('#adv-crit-max').value = maxInput?.value ?? 10;
            modal.querySelector('#adv-crit-step').value = stepInput?.value ?? 0.1;
            modal.querySelector('#adv-crit-ponderable').checked = !!(pondInput?.checked);
            modal.style.display = 'flex';
        }

        function closeAdvanced() {
            const modal = document.getElementById('criterion-advanced-modal');
            if (modal) modal.style.display = 'none';
        }

        if (critListLF) {
            critListLF.addEventListener('click', (e) => {
                const btn = e.target.closest('.advanced-button');
                if (!btn) return;
                const item = btn.closest('.criterion-item');
                if (item) openAdvancedFor(item);
            });
        }

        document.addEventListener('click', (e) => {
            const modal = document.getElementById('criterion-advanced-modal');
            if (!modal || modal.style.display !== 'flex') return;
            if (e.target.id === 'adv-crit-cancel') { e.preventDefault(); closeAdvanced(); return; }
            if (e.target.id === 'adv-crit-accept') {
                e.preventDefault();
                const suffix = modal.dataset.targetSuffix;
                if (!suffix) return closeAdvanced();
                const minVal = parseFloat(document.getElementById('adv-crit-min').value || '0');
                const maxVal = parseFloat(document.getElementById('adv-crit-max').value || '10');
                const stepVal = parseFloat(document.getElementById('adv-crit-step').value || '0.1');
                const typeVal = document.getElementById('adv-crit-type').value || 'slider';
                const pondVal = document.getElementById('adv-crit-ponderable').checked;
                const targetItem = critListLF?.querySelector(`input[name="criteria_label_${suffix}"]`)?.closest('.criterion-item');
                if (targetItem) {
                    const minInput = targetItem.querySelector(`input[name="criteria_min_${suffix}"]`);
                    const maxInput = targetItem.querySelector(`input[name="criteria_max_${suffix}"]`);
                    const stepInput = targetItem.querySelector(`input[name="criteria_step_${suffix}"]`);
                    const typeInput = targetItem.querySelector(`input[name="criteria_type_${suffix}"]`);
                    const pondInput = targetItem.querySelector(`#criteria_isPonderable_${suffix}`);
                    if (minInput) minInput.value = isNaN(minVal) ? 0 : minVal;
                    if (maxInput) maxInput.value = isNaN(maxVal) ? 10 : maxVal;
                    if (stepInput) stepInput.value = (!isNaN(stepVal) && stepVal > 0) ? stepVal : 0.1;
                    if (typeInput) typeInput.value = typeVal;
                    if (pondInput) pondInput.checked = pondVal;
                }
                closeAdvanced();
            }
        });

        if (addCritBtnLF && critListLF) {
            console.log("page-list-form.js: Registrando listener para addCritBtnLF");
            addCritBtnLF.addEventListener('click', () => {
                console.log("page-list-form.js: Botón 'Añadir Criterio' clickeado.");
                try {
                    const newCriterionElement = createCriterionItem(null, { 
                        label: "", ponderable: true, min: 0, max: 10, step: 0.1, 
                        labelMin: "", labelMax: ""  
                    });
                    critListLF.appendChild(newCriterionElement);
                    console.log("page-list-form.js: Nuevo criterio añadido al DOM.");
                } catch (e) {
                    console.error("page-list-form.js: Error al añadir nuevo criterio:", e);
                }
            });
        }

        // --- Categorías: carga + aplicación a la UI ---
        async function loadCategoriesAndWire() {
            if (!categorySelect) return;
            try {
                // Traer sin orderBy para no excluir docs sin el campo; ordenamos en cliente
                const snap = await db.collection('categories').get();
                const cats = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
                cats.sort((a,b) => {
                    const ao = (typeof a.order === 'number') ? a.order : Number.POSITIVE_INFINITY;
                    const bo = (typeof b.order === 'number') ? b.order : Number.POSITIVE_INFINITY;
                    return ao - bo;
                });

                categorySelect.innerHTML = '<option value="" disabled selected>Selecciona una categoría</option>' +
                    cats.map(c => {
                        const label = (ListopicApp.uiUtils?.getCategoryLabel?.(c.id, c.displayname || c.displayName || c.name || c.id))
                            || c.displayname || c.displayName || c.name || c.id;
                        return `<option value="${c.id}">${(ListopicApp.uiUtils?.escapeHtml(label)) || label}</option>`;
                    }).join('');

                const getCatById = (id) => {
                    const inSnap = snap.docs.find(d => d.id === id);
                    if (inSnap) return { id, data: inSnap.data() };
                    return null;
                };

                // Modal propio para confirmar sustitución de criterios cuando se edita
                function ensureCategoryChangeModal() {
                    if (document.getElementById('category-change-modal')) return;
                    const ov = document.createElement('div');
                    ov.id = 'category-change-modal';
                    ov.className = 'lp-modal-overlay';
                    ov.style.display = 'none';
                    ov.innerHTML = `
                        <div class="lp-modal">
                            <h3>Cambiar categoría</h3>
                            <div class="lp-modal-body">
                                <p>Estás editando una lista. Aplicar la nueva categoría puede reemplazar los criterios mostrados por los valores base.</p>
                                <p>¿Quieres aplicar los valores base de la nueva categoría?</p>
                            </div>
                            <div class="lp-modal-actions">
                                <button id="catchg-accept" class="button primary">Aceptar</button>
                                <button id="catchg-cancel" class="button secondary">No, quiero mantenerlo</button>
                            </div>
                        </div>`;
                    document.body.appendChild(ov);
                }

                function confirmCategoryChange() {
                    ensureCategoryChangeModal();
                    const modal = document.getElementById('category-change-modal');
                    return new Promise(resolve => {
                        modal.style.display = 'flex';
                        const onClick = (e) => {
                            if (e.target.id === 'catchg-accept') { cleanup(); resolve(true); }
                            if (e.target.id === 'catchg-cancel') { cleanup(); resolve(false); }
                        };
                        function cleanup(){
                            modal.style.display = 'none';
                            document.removeEventListener('click', onClick);
                        }
                        document.addEventListener('click', onClick);
                    });
                }

                categorySelect.addEventListener('change', async () => {
                    const selId = categorySelect.value;
                    if (window.ListopicApp?.state?.isEditingList) {
                        const ok = await confirmCategoryChange();
                        if (!ok) {
                            const prev = window.ListopicApp.state.currentEditingCategoryId;
                            if (prev) categorySelect.value = prev;
                            return;
                        }
                    }
                    let data = getCatById(selId)?.data;
                    if (!data) {
                        const d = await db.collection('categories').doc(selId).get();
                        data = d.exists ? d.data() : {};
                    }
                    applyCategoryToForm(selId, data || {});
                    if (window.ListopicApp?.state) window.ListopicApp.state.currentEditingCategoryId = selId;
                });

                // Selección por defecto: prioriza "Comida" si existe; sino la de menor 'order'; sino la primera
                let defaultCat = cats.find(c => (c.displayname || c.displayName || c.name || c.id || '').toString().toLowerCase().includes('comida'))
                              || cats.find(c => typeof c.order === 'number' && c.order === 1)
                              || cats[0];
                if (defaultCat) {
                    categorySelect.value = defaultCat.id;
                    applyCategoryToForm(defaultCat.id, defaultCat);
                }
            } catch (e) {
                console.error('LIST-FORM: Error cargando categorías', e);
                categorySelect.innerHTML = '<option value="" disabled selected>Error al cargar categorías</option>';
            }
        }

        function extractCriteriaFromCategory(cat) {
            if (!cat || typeof cat !== 'object') return {};
            if (cat.defaultCriteria && typeof cat.defaultCriteria === 'object') return cat.defaultCriteria;
            const out = {};
            for (const [k, v] of Object.entries(cat)) {
                if (v && typeof v === 'object' && (v.type || v.label || v.labelMin || v.labelMax)) {
                    out[k] = {
                        label: v.label || k,
                        ponderable: v.ponderable !== false,
                        type: v.type || 'slider',
                        labelMin: v.labelMin || '',
                        labelMax: v.labelMax || '',
                        min: typeof v.min === 'number' ? v.min : 0,
                        max: typeof v.max === 'number' ? v.max : 10,
                        step: typeof v.step === 'number' ? v.step : 0.5,
                    };
                }
            }
            return out;
        }

        function getFixedTagsFromCategory(cat) {
            return cat?.['fixed-tags'] || cat?.fixedTags || cat?.fixed_tags || [];
        }

        function renderFixedTags(tags) {
            if (!fixedTagsGroup) return;
            if (!Array.isArray(tags) || tags.length === 0) {
                fixedTagsGroup.innerHTML = '<p class="loading-placeholder">Esta categoría no define etiquetas base.</p>';
                return;
            }
            fixedTagsGroup.innerHTML = tags.map(tag => {
                const safe = (ListopicApp.uiUtils?.escapeHtml(tag)) || String(tag);
                return `<label class="tag-checkbox"><input type="checkbox" name="fixed-tags" value="${safe}" checked> <span>${safe}</span></label>`;
            }).join('');
        }

        function applyCategoryToForm(categoryId, cat) {
            if (critListLF) {
                critListLF.innerHTML = '';
                const critDef = extractCriteriaFromCategory(cat);
                const entries = Object.entries(critDef);
                if (entries.length === 0) {
                    critListLF.innerHTML = '<p class="loading-placeholder">Esta categoría no define criterios. Añádelos manualmente.</p>';
                } else {
                    entries.forEach(([key, def]) => {
                        critListLF.appendChild(createCriterionItem(key, def));
                    });
                }
                // Añadir siempre un criterio vacío extra para facilitar añadir uno nuevo
                critListLF.appendChild(createCriterionItem(null, { label: '', ponderable: true, type: 'slider', min: 0, max: 10, step: 0.5, labelMin: '', labelMax: '' }));
            }
            renderFixedTags(getFixedTagsFromCategory(cat));
        }

        loadCategoriesAndWire();
        if (addTagBtnLF && tagsListLF) {
            addTagBtnLF.addEventListener('click', () => tagsListLF.appendChild(createTagItem()));
        }

        if (critListLF) {
            critListLF.addEventListener('click', e => {
                if (e.target.classList.contains('remove-button')) {
                    e.target.closest('.criterion-item')?.remove();
                }
            });
        }
        if (tagsListLF) {
            tagsListLF.addEventListener('click', e => {
                 if (e.target.classList.contains('remove-button')) {
                    e.target.closest('.tag-item')?.remove();
                 }
            });
        }
        
        const urlParamsListEdit = new URLSearchParams(window.location.search);
        const listIdToEdit = urlParamsListEdit.get('editListId');

        if (listIdToEdit) {
            // Lógica para cargar datos de una lista existente para editar (como antes)
            if (listFormTitleH2) listFormTitleH2.textContent = 'Cargando Lista para Editar...';
            db.collection('lists').doc(listIdToEdit).get()
                .then(async doc => {
                    if (!doc.exists) throw new Error("Lista no encontrada.");
                    const listData = doc.data();
                    if (listFormTitleH2) listFormTitleH2.textContent = 'Editar Lista de Valoración';
                    if (listNameInput) listNameInput.value = listData.name;
                    
                    // NUEVO: Rellenar el campo de categoría
                    const categoryInput = document.getElementById('list-category');
                    if (categoryInput) {
                        categoryInput.value = listData.categoryId || listData.categoryName || 'Hmm...';
                        window.ListopicApp.state.isEditingList = true;
                        window.ListopicApp.state.currentEditingCategoryId = categoryInput.value;
                    }

                    if (critListLF) {
                        critListLF.innerHTML = '';
                        if (listData.criteriaDefinition && typeof listData.criteriaDefinition === 'object') {
                            for (const keyInDb in listData.criteriaDefinition) {
                                const critDefObject = listData.criteriaDefinition[keyInDb];
                                critListLF.appendChild(createCriterionItem(keyInDb, critDefObject));
                            }
                        }
                    }
                    if (tagsListLF) { /* ... lógica para cargar tags ... */ }
                    tagsListLF.innerHTML = '';
                    let baseTags = [];
                    try {
                        const catId = listData.categoryId;
                        if (catId) {
                            const catDoc = await db.collection('categories').doc(catId).get();
                            if (catDoc.exists) {
                                baseTags = getFixedTagsFromCategory(catDoc.data()) || [];
                                renderFixedTags(baseTags);
                            }
                        }
                    } catch (e) { console.warn('No se pudieron obtener las etiquetas base de la categoría:', e); }
                    const allTags = Array.isArray(listData.availableTags) ? listData.availableTags : [];
                    const baseSet = new Set((baseTags || []).map(t => String(t)));
                    const customTags = allTags.filter(t => !baseSet.has(String(t)));
                    try {
                        const fixedInputs = document.querySelectorAll('#fixed-tags-group input[name="fixed-tags"]');
                        fixedInputs.forEach(input => { input.checked = allTags.includes(input.value); });
                    } catch (_) {}
                    customTags.forEach(tagText => { tagsListLF.appendChild(createTagItem(tagText)); });
                })
                .catch(error => { /* ... manejo de error ... */ });
        } else {
            // Configuración para una nueva lista (como antes)
            if (listFormTitleH2) listFormTitleH2.textContent = 'Crear Nueva Lista de Valoración';
            // El criterio vacío inicial lo añadimos cuando se aplica la categoría por defecto
            if (tagsListLF && tagsListLF.children.length === 0) tagsListLF.appendChild(createTagItem(""));
        }

        listForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = listForm.querySelector('.submit-button');
            if (!submitButton) {
                console.error("Botón de submit no encontrado");
                return;
            }
            submitButton.disabled = true;

            const currentUser = auth.currentUser;
            if (!currentUser) {
                ListopicApp.services.showNotification("Debes estar autenticado para guardar una lista.", 'error');
                submitButton.disabled = false;
                return;
            }
            // const categoryIdInput = listForm.querySelector('input[name="categoryId"]'); // Ya no es un input oculto con ese name fijo
            const categoryInput = document.getElementById('list-category'); // El nuevo input visible

            const listDataPayload = {
                name: listNameInput ? listNameInput.value.trim() : "Lista sin nombre",
                userId: currentUser.uid,
                // Usamos 'categoryId' como clave en Firestore, y leemos del input visible.
                // Si está vacío, ponemos "defaultCategory" (o "General", o lo que prefieras como valor por defecto).
                categoryId: "Hmm...", // <--- ASIGNA EL VALOR FIJO AQUÍ
                isPublic: isPublicToggle ? isPublicToggle.checked : true, // Leemos el estado del toggle
                criteriaDefinition: {}, // Se llenará después
                availableTags: [],      // Se llenará después
                // Valores iniciales para nuevas listas, se mantendrán si se edita
                reviewCount: 0,
                reactions: {},
                commentsCount: 0
            };

            // Asegurar categoryId desde el selector si está disponible
            try {
                if (categorySelect && categorySelect.value) {
                    listDataPayload.categoryId = categorySelect.value;
                }
            } catch (e) { /* noop */ }

            if(listIdToEdit) { // Si estamos editando, mantener los contadores existentes
                try {
                    const existingListDoc = await db.collection('lists').doc(listIdToEdit).get();
                    if(existingListDoc.exists) {
                        const existingData = existingListDoc.data();
                        listDataPayload.reviewCount = existingData.reviewCount || 0;
                        listDataPayload.reactions = existingData.reactions || {};
                        listDataPayload.commentsCount = existingData.commentsCount || 0;
                    }
                } catch (e) {
                    console.warn("No se pudo obtener datos existentes de la lista para mantener contadores", e);
                }
            }

            const criterionItems = critListLF.querySelectorAll('.criterion-item');
            criterionItems.forEach(item => {
                const labelInput = item.querySelector('input[name^="criteria_label_"]');
                if (!labelInput) return;
                const domKeySuffix = labelInput.name.substring("criteria_label_".length);
                const label = labelInput.value.trim();
                if (!label) return; 

                let criterionMapKey = labelInput.dataset.criterionKeyFromDb || label.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/\s+/g, '_');
                if (!labelInput.dataset.criterionKeyFromDb && listDataPayload.criteriaDefinition[criterionMapKey]) {
                     criterionMapKey = `${criterionMapKey}_${Math.random().toString(36).substr(2, 3)}`;
                }
                
                const minValInput = item.querySelector(`input[name="criteria_min_${domKeySuffix}"]`);
                const maxValInput = item.querySelector(`input[name="criteria_max_${domKeySuffix}"]`);
                const stepValInput = item.querySelector(`input[name=\"criteria_step_${domKeySuffix}\"]`);
                const typeValInput = item.querySelector(`input[name=\"criteria_type_${domKeySuffix}\"]`);
                const isPonderableInput = item.querySelector(`input[name="criteria_isPonderable_${domKeySuffix}"]`);
                const labelMinInput = item.querySelector(`input[name="criteria_labelMin_${domKeySuffix}"]`);
                const labelMaxInput = item.querySelector(`input[name="criteria_labelMax_${domKeySuffix}"]`);

                const minVal = minValInput ? parseFloat(minValInput.value) : 0;
                const maxVal = maxValInput ? parseFloat(maxValInput.value) : 10;
                const stepVal = stepValInput ? parseFloat(stepValInput.value) : 0.1;

                listDataPayload.criteriaDefinition[criterionMapKey] = {
                    label: label,
                    ponderable: isPonderableInput ? isPonderableInput.checked : true,
                    type: typeValInput ? (typeValInput.value || 'slider') : 'slider',
                    labelMin: labelMinInput ? labelMinInput.value.trim() : "",
                    labelMax: labelMaxInput ? labelMaxInput.value.trim() : "",
                    min: isNaN(minVal) ? 0 : minVal,
                    max: isNaN(maxVal) ? 10 : maxVal,
                    step: isNaN(stepVal) || stepVal <= 0 ? 0.1 : stepVal,
                };
            });

            const tagInputs = tagsListLF.querySelectorAll('input[name="tags[]"]');
            tagInputs.forEach(input => {
                const tagValue = input.value.trim();
                if (tagValue) listDataPayload.availableTags.push(tagValue);
            });
            listDataPayload.availableTags = [...new Set(listDataPayload.availableTags)];

            console.log("Payload para Firestore:", JSON.stringify(listDataPayload, null, 2));

            
    // --- ¡CAMBIO AQUÍ! Recogemos ambos tipos de etiquetas ---
            

            // 2. Recoger etiquetas fijas (las que están seleccionadas)
            const fixedTagInputs = document.querySelectorAll('input[name="fixed-tags"]:checked');
            fixedTagInputs.forEach(input => {
                listDataPayload.availableTags.push(input.value);
            });
            
            // 3. Eliminar duplicados
            listDataPayload.availableTags = [...new Set(listDataPayload.availableTags)];

            // --- FIN DEL CAMBIO ---
     

            
            try {
                let savedListId;
                if (listIdToEdit) {
                    const updateListFunction = functions.httpsCallable('updateListWithValidation');
                    await updateListFunction({ listId: listIdToEdit, data: listDataPayload });
                    savedListId = listIdToEdit;
                    ListopicApp.services.showNotification('¡Lista actualizada con éxito!', 'success');
                } else {
                    const createListFunction = functions.httpsCallable('createListWithValidation');
                    const result = await createListFunction(listDataPayload);
                    savedListId = result.data.listId;
                    ListopicApp.services.showNotification(result.data.message || '¡Lista creada con éxito!', 'success');
                }
                window.location.href = `list-view.html?listId=${savedListId}`;
            } catch (error) {
                console.error('Error al guardar la lista:', error);
                ListopicApp.services.showNotification(`No se pudo guardar la lista: ${error.message}`, 'error');
            } finally {
                submitButton.disabled = false;
            }
        });
    }

    return {
        init
    };
})();
