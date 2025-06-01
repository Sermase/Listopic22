window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListForm = (() => {
    const db = ListopicApp.services.db;
    const auth = ListopicApp.services.auth;

    function init() {
        console.log('Initializing List Form page logic with actual code...');
        
        const listForm = document.getElementById('list-form');

        if (listForm) {
            const addCritBtnLF = document.getElementById('add-criterion-btn');
            const critListLF = document.getElementById('criteria-list');
            const addTagBtnLF = document.getElementById('add-tag-btn');
            const tagsListLF = document.getElementById('tags-list');

            // MODIFICADO: createCriterionItem para reflejar la estructura detallada del criterio
            const createCriterionItem = (criterionKeyFromDb = null, data = {}) => {
                const div = document.createElement('div');
                div.className = 'criterion-item form-group'; // form-group para consistencia

                const domKey = criterionKeyFromDb || `new_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

                const label = data.label || '';
                const labelMin = data.labelMin || '';
                const labelMax = data.labelMax || '';
                const isPonderable = data.ponderable === undefined ? true : data.ponderable;
                const minVal = data.min !== undefined ? data.min : 0;
                const maxVal = data.max !== undefined ? data.max : 10;
                const stepVal = data.step !== undefined ? data.step : 0.1; // Default step 0.1, user requested 0.05 as possible

                // Usamos un contenedor para los detalles del slider para mejor layout con CSS
                div.innerHTML = `
                    <div class="criterion-main-input">
                        <label for="criteria_label_${domKey}">Nombre del Criterio:</label>
                        <input type="text" id="criteria_label_${domKey}" name="criteria_label_${domKey}" placeholder="Ej: Sabor, Ambiente" class="form-input criterion-input" value="<span class="math-inline">\{ListopicApp\.uiUtils\.escapeHtml\(label\)\}" required data\-criterion\-key\-from\-db\="</span>{ListopicApp.uiUtils.escapeHtml(criterionKeyFromDb || '')}">
                    </div>
                    <div class="criterion-slider-config">
                        <div>
                            <label for="criteria_labelMin_${domKey}">Etiqueta Mínima:</label>
                            <input type="text" id="criteria_labelMin_${domKey}" name="criteria_labelMin_${domKey}" placeholder="Ej: Malo" class="form-input criterion-input-small" value="<span class="math-inline">\{ListopicApp\.uiUtils\.escapeHtml\(labelMin\)\}"\>
</div\>
<div\>
<label for\="criteria\_labelMax\_</span>{domKey}">Etiqueta Máxima:</label>
                            <input type="text" id="criteria_labelMax_${domKey}" name="criteria_labelMax_${domKey}" placeholder="Ej: Excelente" class="form-input criterion-input-small" value="<span class="math-inline">\{ListopicApp\.uiUtils\.escapeHtml\(labelMax\)\}"\>
</div\>
<div\>
<label for\="criteria\_min\_</span>{domKey}">Valor Mín.:</label>
                            <input type="number" id="criteria_min_${domKey}" name="criteria_min_${domKey}" class="form-input criterion-input-xtra-small" value="<span class="math-inline">\{minVal\}" step\="any" title\="Valor mínimo"\>
</div\>
<div\>
<label for\="criteria\_max\_</span>{domKey}">Valor Máx.:</label>
                            <input type="number" id="criteria_max_${domKey}" name="criteria_max_${domKey}" class="form-input criterion-input-xtra-small" value="<span class="math-inline">\{maxVal\}" step\="any" title\="Valor máximo"\>
</div\>
<div\>
<label for\="criteria\_step\_</span>{domKey}">Paso:</label>
                            <input type="number" id="criteria_step_${domKey}" name="criteria_step_${domKey}" class="form-input criterion-input-xtra-small" value="<span class="math-inline">\{stepVal\}" step\="any" min\="0\.01" title\="Incremento \(ej\: 0\.1, 0\.5, 1\)"\>
</div\>
</div\>
<div class\="criterion\-options"\>
<label class\="criterion\-weighted\-label" title\="Marcar si este criterio debe contar para la puntuación general"\>
<input type\="checkbox" name\="criteria\_isPonderable\_</span>{domKey}" class="criterion-weighted-checkbox" ${isPonderable ? 'checked' : ''}> Pondera para la media
                        </label>
                        <button type="button" class="remove-button danger" title="Eliminar criterio">×</button>
                    </div>
                    `;
                return div;
            };

            const createTagItem = (tagValue = "") => {
                const div = document.createElement('div');
                div.className = 'tag-item form-group';
                div.innerHTML = `
                    <input type="text" name="tags[]" placeholder="Nombre de Etiqueta (Ej: Vegano)" class="form-input tag-input" value="${ListopicApp.uiUtils.escapeHtml(tagValue || '')}" required>
                    <button type="button" class="remove-button danger" title="Eliminar etiqueta">×</button>`;
                return div;
            };

            if (addCritBtnLF && critListLF) {
                addCritBtnLF.addEventListener('click', () => {
                     // Añadir con valores por defecto, incluyendo step=0.5 como un default común
                    critListLF.appendChild(createCriterionItem(null, { ponderable: true, min: 0, max: 10, step: 0.5, labelMin: "Malo", labelMax: "Bueno" }));
                });
            }
            if (addTagBtnLF && tagsListLF) {
                addTagBtnLF.addEventListener('click', () => tagsListLF.appendChild(createTagItem()));
            }

            [critListLF, tagsListLF].forEach(listContainer => {
                if (listContainer) {
                    listContainer.addEventListener('click', e => {
                        if (e.target.classList.contains('remove-button')) {
                            e.target.closest('.criterion-item, .tag-item')?.remove();
                        }
                    });
                }
            });

            const urlParamsListEdit = new URLSearchParams(window.location.search);
            const listIdToEdit = urlParamsListEdit.get('editListId');
            const listFormTitleH2 = listForm.parentElement.querySelector('h2');

            if (listIdToEdit) {
                if (listFormTitleH2) listFormTitleH2.textContent = 'Cargando Lista para Editar...';
                db.collection('lists').doc(listIdToEdit).get()
                    .then(doc => {
                        if (!doc.exists) {
                            throw new Error("Lista no encontrada.");
                        }
                        const listData = doc.data();
                        if (listFormTitleH2) listFormTitleH2.textContent = 'Editar Lista de Valoración';
                        document.getElementById('list-name').value = listData.name;

                        if (critListLF) {
                            critListLF.innerHTML = '';
                            // MODIFICADO: Cargar desde criteriaDefinition (mapa)
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
                     critListLF.appendChild(createCriterionItem(null, { ponderable: true, min: 0, max: 10, step: 0.5, labelMin: "Malo", labelMax: "Bueno" }));
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

                const formData = new FormData(listForm); // No se usa directamente para criteria ahora
                const listDataPayload = {
                    name: formData.get('name'), // Asumiendo que el input de nombre de lista tiene name="name"
                    userId: currentUser.uid,
                    categoryId: formData.get('categoryId') || "defaultCategory", // Asegurar un valor por defecto
                    isPublic: true, // Por defecto, podrías añadir un input para esto
                    criteriaDefinition: {},
                    availableTags: [], // Se llenará desde los inputs de tags
                    reviewCount: listIdToEdit ? (await db.collection('lists').doc(listIdToEdit).get()).data().reviewCount || 0 : 0, // Mantener si se edita
                    reactions: listIdToEdit ? (await db.collection('lists').doc(listIdToEdit).get()).data().reactions || {} : {}, // Mantener si se edita
                    commentsCount: listIdToEdit ? (await db.collection('lists').doc(listIdToEdit).get()).data().commentsCount || 0 : {}, // Mantener si se edita
                };

                // MODIFICADO: Recolectar criterios para el mapa criteriaDefinition
                const criterionItems = critListLF.querySelectorAll('.criterion-item');
                criterionItems.forEach(item => {
                    const domKeySuffix = item.querySelector('input[name^="criteria_label_"]').name.substring("criteria_label_".length);
                    
                    const labelInput = item.querySelector(`input[name="criteria_label_${domKeySuffix}"]`);
                    const label = labelInput.value.trim();
                    if (!label) return; 

                    let criterionMapKey = labelInput.dataset.criterionKeyFromDb || label.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/\s+/g, '_');
                    if (!labelInput.dataset.criterionKeyFromDb && listDataPayload.criteriaDefinition[criterionMapKey]) {
                         criterionMapKey = `<span class="math-inline">\{criterionMapKey\}\_</span>{Date.now().toString().slice(-5)}`;
                    }
                    
                    const minVal = parseFloat(item.querySelector(`input[name="criteria_min_${domKeySuffix}"]`).value);
                    const maxVal = parseFloat(item.querySelector(`input[name="criteria_max_${domKeySuffix}"]`).value);
                    const stepVal = parseFloat(item.querySelector(`input[name="criteria_step_${domKeySuffix}"]`).value);

                    listDataPayload.criteriaDefinition[criterionMapKey] = {
                        label: label,
                        ponderable: item.querySelector(`input[name="criteria_isPonderable_${domKeySuffix}"]`).checked,
                        type: 'slider',
                        labelMin: item.querySelector(`input[name="criteria_labelMin_${domKeySuffix}"]`).value.trim(),
                        labelMax: item.querySelector(`input[name="criteria_labelMax_${domKeySuffix}"]`).value.trim(),
                        min: isNaN(minVal) ? 0 : minVal,
                        max: isNaN(maxVal) ? 10 : maxVal,
                        step: isNaN(stepVal) || stepVal <= 0 ? 0.1 : stepVal, // Asegurar step positivo
                    };
                });

                // Recolectar etiquetas
                const tagInputs = tagsListLF.querySelectorAll('input[name="tags[]"]');
                tagInputs.forEach(input => {
                    const tagValue = input.value.trim();
                    if (tagValue) {
                        listDataPayload.availableTags.push(tagValue);
                    }
                });
                listDataPayload.availableTags = [...new Set(listDataPayload.availableTags)]; // Eliminar duplicados


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
        } else {
            console.warn("LIST-FORM: listForm element not found.");
        }
    }

    return {
        init
    };
})();