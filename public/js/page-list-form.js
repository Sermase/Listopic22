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
        const listFormTitleH2 = listForm.parentElement?.querySelector('h2');
        const listNameInput = document.getElementById('list-name');

        if (!listNameInput) console.warn("LIST-FORM: Input #list-name no encontrado.");
        if (!addCritBtnLF) console.warn("LIST-FORM: Botón #add-criterion-btn no encontrado.");
        if (!critListLF) console.warn("LIST-FORM: Contenedor #criteria-list no encontrado.");
        if (!addTagBtnLF) console.warn("LIST-FORM: Botón #add-tag-btn no encontrado.");
        if (!tagsListLF) console.warn("LIST-FORM: Contenedor #tags-list no encontrado.");

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
                    <label class="criterion-weighted-label" for="criteria_isPonderable_${domKey}" title="Marcar si este criterio debe contar para la puntuación general">
                        <input type="checkbox" id="criteria_isPonderable_${domKey}" name="criteria_isPonderable_${domKey}" class="criterion-weighted-checkbox" ${isPonderable ? 'checked' : ''}> Pondera para la media
                    </label>
                    <button type="button" class="remove-button danger" title="Eliminar criterio">×</button>
                </div>`;
            console.log("createCriterionItem: HTML generado.");
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
                .then(doc => {
                    if (!doc.exists) throw new Error("Lista no encontrada.");
                    const listData = doc.data();
                    if (listFormTitleH2) listFormTitleH2.textContent = 'Editar Lista de Valoración';
                    if (listNameInput) listNameInput.value = listData.name;

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
                })
                .catch(error => { /* ... manejo de error ... */ });
        } else {
            // Configuración para una nueva lista (como antes)
            if (listFormTitleH2) listFormTitleH2.textContent = 'Crear Nueva Lista de Valoración';
            if (critListLF && critListLF.children.length === 0) {
                 critListLF.appendChild(createCriterionItem(null, { label: "", ponderable: true, min: 0, max: 10, step: 0.1, labelMin: "", labelMax: "" }));
            }
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
            
            const categoryIdInput = listForm.querySelector('input[name="categoryId"]');
            const listDataPayload = {
                name: listNameInput ? listNameInput.value.trim() : "Lista sin nombre",
                userId: currentUser.uid, // userId del propietario
                categoryId: categoryIdInput ? categoryIdInput.value : "defaultCategory",
                isPublic: true, // O tomar de un input si lo añades
                criteriaDefinition: {},
                availableTags: [],
                reviewCount: 0, reactions: {}, commentsCount: 0 // Para nuevas listas
            };

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
                if (tagValue) listDataPayload.availableTags.push(tagValue);
            });
            listDataPayload.availableTags = [...new Set(listDataPayload.availableTags)];

            console.log("Payload para Firestore:", JSON.stringify(listDataPayload, null, 2));

            try {
                let savedListId;
                if (listIdToEdit) {
                    listDataPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('lists').doc(listIdToEdit).update(listDataPayload);
                    savedListId = listIdToEdit;
                    ListopicApp.services.showNotification('Lista actualizada con éxito!', 'success');
                } else {
                    // Llamar a la Cloud Function para crear la lista con validación
                    const createListFunction = functions.httpsCallable('createListWithValidation');
                    ListopicApp.services.showNotification('Creando lista...', 'info');
                    
                    const result = await createListFunction(listDataPayload); // Pasamos todo el payload
                    
                    savedListId = result.data.listId;
                    ListopicApp.services.showNotification(result.data.message || '¡Lista creada con éxito!', 'success');
                }
                window.location.href = `list-view.html?listId=${savedListId}`;
            } catch (error) {
                console.error('Error al guardar la lista:', error);
                let errorMessage = `No se pudo guardar la lista: ${error.message || 'Error desconocido.'}`;
                if (error.code === 'already-exists' || error.details === 'already-exists') { // Firebase HttpsError
                    errorMessage = 'Ya tienes una lista con ese nombre. Por favor, elige otro.';
                } else if (error.code) {
                    errorMessage = `Error: ${error.message} (Código: ${error.code})`;
                }
                ListopicApp.services.showNotification(errorMessage, 'error');
            } finally {
                submitButton.disabled = false;
            }
        });
    } // Fin de init

    return {
        init
    };
})();