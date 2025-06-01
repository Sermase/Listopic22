window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListForm = (() => {
    // Asegúrate de que db y auth se obtienen de ListopicApp.services en init o aquí si se garantiza que ya están cargados.
    // Para mayor seguridad, es mejor obtenerlos dentro de init.

    function init() {
        console.log('Initializing List Form page logic...');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;

        const listForm = document.getElementById('list-form');
        if (!listForm) {
            console.error("LIST-FORM: Elemento #list-form no encontrado.");
            return;
        }

        const addCritBtnLF = document.getElementById('add-criterion-btn');
        const critListLF = document.getElementById('criteria-list');
        const addTagBtnLF = document.getElementById('add-tag-btn');
        const tagsListLF = document.getElementById('tags-list');
        const listFormTitleH2 = listForm.parentElement?.querySelector('h2');


        if (!addCritBtnLF) console.warn("LIST-FORM: Botón #add-criterion-btn no encontrado.");
        if (!critListLF) console.warn("LIST-FORM: Contenedor #criteria-list no encontrado.");
        if (!addTagBtnLF) console.warn("LIST-FORM: Botón #add-tag-btn no encontrado.");
        if (!tagsListLF) console.warn("LIST-FORM: Contenedor #tags-list no encontrado.");


        const createCriterionItem = (criterionKeyFromDb = null, data = {}) => {
            console.log("createCriterionItem_0b6758 llamado con key:", criterionKeyFromDb, "data:", data);
            const div = document.createElement('div');
            div.className = 'criterion-item form-group'; 

            const domKey = criterionKeyFromDb || `new_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

            const label = data.label || '';
            const labelMin = data.labelMin || '';
            const labelMax = data.labelMax || '';
            const isPonderable = data.ponderable === undefined ? true : data.ponderable;
            const minVal = data.min !== undefined ? data.min : 0;
            const maxVal = data.max !== undefined ? data.max : 10;
            const stepVal = data.step !== undefined ? data.step : 0.1; 

            let escapedLabel = "", escapedLabelMin = "", escapedLabelMax = "";
            let escapedCriterionKeyFromDb = "";
            if (ListopicApp.uiUtils && typeof ListopicApp.uiUtils.escapeHtml === 'function') {
                escapedLabel = ListopicApp.uiUtils.escapeHtml(label);
                escapedLabelMin = ListopicApp.uiUtils.escapeHtml(labelMin);
                escapedLabelMax = ListopicApp.uiUtils.escapeHtml(labelMax);
                escapedCriterionKeyFromDb = ListopicApp.uiUtils.escapeHtml(criterionKeyFromDb || '');
            } else {
                console.warn("ListopicApp.uiUtils.escapeHtml no está disponible. Usando valores sin escapar.");
                escapedLabel = label;
                escapedLabelMin = labelMin;
                escapedLabelMax = labelMax;
                escapedCriterionKeyFromDb = criterionKeyFromDb || '';
            }

            div.innerHTML = `
                <div class="criterion-main-input">
                    <label for="criteria_label_${domKey}">Nombre del Criterio:</label>
                    <input type="text" id="criteria_label_${domKey}" name="criteria_label_${domKey}" placeholder="Ej: Sabor, Ambiente" class="form-input criterion-input" value="${escapedLabel}" required data-criterion-key-from-db="${escapedCriterionKeyFromDb}">
                </div>
                <div class="criterion-slider-config">
                    <div>
                        <label for="criteria_labelMin_${domKey}">Etiqueta Mínima:</label>
                        <input type="text" id="criteria_labelMin_${domKey}" name="criteria_labelMin_${domKey}" placeholder="Ej: Malo" class="form-input criterion-input-small" value="${escapedLabelMin}">
                    </div>
                    <div>
                        <label for="criteria_labelMax_${domKey}">Etiqueta Máxima:</label>
                        <input type="text" id="criteria_labelMax_${domKey}" name="criteria_labelMax_${domKey}" placeholder="Ej: Excelente" class="form-input criterion-input-small" value="${escapedLabelMax}">
                    </div>
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
                </div>
                <div class="criterion-options">
                    <label class="criterion-weighted-label" title="Marcar si este criterio debe contar para la puntuación general">
                        <input type="checkbox" name="criteria_isPonderable_${domKey}" class="criterion-weighted-checkbox" ${isPonderable ? 'checked' : ''}> Pondera para la media
                    </label>
                    <button type="button" class="remove-button danger" title="Eliminar criterio">×</button>
                </div>
                `;
            console.log("createCriterionItem_0b6758 HTML generado:", div.innerHTML.length > 0);
            return div;
        };

        const createTagItem = (tagValue = "") => {
            const div = document.createElement('div');
            div.className = 'tag-item form-group';
            const escapedTagValue = (ListopicApp.uiUtils && ListopicApp.uiUtils.escapeHtml) ? ListopicApp.uiUtils.escapeHtml(tagValue || '') : (tagValue || '');
            div.innerHTML = `
                <input type="text" name="tags[]" placeholder="Nombre de Etiqueta (Ej: Vegano)" class="form-input tag-input" value="${escapedTagValue}" required>
                <button type="button" class="remove-button danger" title="Eliminar etiqueta">×</button>`;
            return div;
        };

        if (addCritBtnLF && critListLF) {
            addCritBtnLF.addEventListener('click', () => {
                console.log("Botón 'Añadir Criterio' clickeado.");
                try {
                    const newCriterionElement = createCriterionItem(null, { 
                        label: "", // Empezar con etiqueta vacía
                        ponderable: true, 
                        min: 0, 
                        max: 10, 
                        step: 0.1, // Default más común
                        labelMin: "", // Empezar vacío
                        labelMax: ""  // Empezar vacío
                    });
                    critListLF.appendChild(newCriterionElement);
                    console.log("Nuevo criterio añadido al DOM.");
                } catch (e) {
                    console.error("Error al añadir nuevo criterio:", e);
                }
            });
        }
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
            if (listFormTitleH2) listFormTitleH2.textContent = 'Cargando Lista para Editar...';
            db.collection('lists').doc(listIdToEdit).get()
                .then(doc => {
                    if (!doc.exists) {
                        throw new Error("Lista no encontrada.");
                    }
                    const listData = doc.data();
                    if (listFormTitleH2) listFormTitleH2.textContent = 'Editar Lista de Valoración';
                    
                    const listNameInput = document.getElementById('list-name');
                    if (listNameInput) listNameInput.value = listData.name;
                    else console.warn("Input #list-name no encontrado");


                    if (critListLF) {
                        critListLF.innerHTML = '';
                        if (listData.criteriaDefinition && typeof listData.criteriaDefinition === 'object') {
                            for (const keyInDb in listData.criteriaDefinition) {
                                const critDefObject = listData.criteriaDefinition[keyInDb];
                                critListLF.appendChild(createCriterionItem(keyInDb, critDefObject));
                            }
                        }
                    }
                    if (tagsListLF) {
                        tagsListLF.innerHTML = '';
                        if (listData.availableTags && Array.isArray(listData.availableTags)) {
                            listData.availableTags.forEach(t => tagsListLF.appendChild(createTagItem(t)));
                        }
                    }
                })
                .catch(error => {
                    console.error("Error cargando lista para editar:", error);
                    ListopicApp.services.showNotification(`No se pudo cargar la lista: ${error.message}`, 'error');
                    if (listFormTitleH2) listFormTitleH2.textContent = 'Crear Nueva Lista de Valoración';
                });
        } else {
            if (listFormTitleH2) listFormTitleH2.textContent = 'Crear Nueva Lista de Valoración';
            if (critListLF && critListLF.children.length === 0) {
                 critListLF.appendChild(createCriterionItem(null, { ponderable: true, min: 0, max: 10, step: 0.1, labelMin: "", labelMax: "" }));
            }
            if (tagsListLF && tagsListLF.children.length === 0) tagsListLF.appendChild(createTagItem(""));
        }

        listForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = listForm.querySelector('.submit-button');
            if (submitButton) submitButton.disabled = true;

            const currentUser = auth.currentUser;
            if (!currentUser) {
                ListopicApp.services.showNotification("Debes estar autenticado para guardar una lista.", 'error');
                if (submitButton) submitButton.disabled = false;
                return;
            }
            
            const listNameInput = document.getElementById('list-name');
            const categoryIdInput = listForm.querySelector('input[name="categoryId"]'); // Asumiendo que tienes este input

            const listDataPayload = {
                name: listNameInput ? listNameInput.value : "Lista sin nombre",
                userId: currentUser.uid,
                categoryId: categoryIdInput ? categoryIdInput.value : "defaultCategory",
                isPublic: true, 
                criteriaDefinition: {},
                availableTags: [],
                 // Mantener estos campos si se está editando, sino inicializar
                reviewCount: 0,
                reactions: {},
                commentsCount: 0
            };
            
            if(listIdToEdit) {
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
                // Si es nuevo y la clave ya existe (ej. dos criterios nuevos con el mismo nombre), añadir un sufijo
                if (!labelInput.dataset.criterionKeyFromDb && listDataPayload.criteriaDefinition[criterionMapKey]) {
                     criterionMapKey = `${criterionMapKey}_${Math.random().toString(36).substr(2, 3)}`;
                }
                
                const minValInput = item.querySelector(`input[name="criteria_min_${domKeySuffix}"]`);
                const maxValInput = item.querySelector(`input[name="criteria_max_${domKeySuffix}"]`);
                const stepValInput = item.querySelector(`input[name="criteria_step_${domKeySuffix}"]`);
                const isPonderableInput = item.querySelector(`input[name="criteria_isPonderable_${domKeySuffix}"]`);
                const labelMinInput = item.querySelector(`input[name="criteria_labelMin_${domKeySuffix}"]`);
                const labelMaxInput = item.querySelector(`input[name="criteria_labelMax_${domKeySuffix}"]`);


                const minVal = minValInput ? parseFloat(minValInput.value) : 0;
                const maxVal = maxValInput ? parseFloat(maxValInput.value) : 10;
                const stepVal = stepValInput ? parseFloat(stepValInput.value) : 0.1;

                listDataPayload.criteriaDefinition[criterionMapKey] = {
                    label: label,
                    ponderable: isPonderableInput ? isPonderableInput.checked : true,
                    type: 'slider',
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
                if (tagValue) {
                    listDataPayload.availableTags.push(tagValue);
                }
            });
            listDataPayload.availableTags = [...new Set(listDataPayload.availableTags)];


            console.log("Intentando guardar en Firestore (listDataPayload):", JSON.stringify(listDataPayload, null, 2));

            try {
                let savedListId;
                if (listIdToEdit) {
                    listDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('lists').doc(listIdToEdit).update(listDataPayload);
                    savedListId = listIdToEdit;
                } else {
                    listDataPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    listDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('lists').add(listDataPayload);
                    savedListId = docRef.id;
                }
                ListopicApp.services.showNotification(`Lista ${listIdToEdit ? 'actualizada' : 'creada'} con éxito!`, 'success');
                window.location.href = `list-view.html?listId=${savedListId}`;
            } catch (error) {
                console.error('Error al guardar la lista:', error);
                ListopicApp.services.showNotification(`No se pudo guardar la lista: ${error.message}`, 'error');
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    } // Fin de init

    return {
        init
    };
})();