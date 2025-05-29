window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListForm = (() => {
    // Dependencies:
    // ListopicApp.services.db (Firestore instance)
    // ListopicApp.services.auth
    // firebase.firestore.FieldValue for timestamps

    function init() {
        console.log('Initializing List Form page logic with actual code...');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        // const state = ListopicApp.state; // Access shared state if needed for this page

        // --- Start of code moved from app.js's list-form.html block ---
        const listForm = document.getElementById('list-form');

        if (listForm) {
            const addCritBtnLF = document.getElementById('add-criterion-btn');
            const critListLF = document.getElementById('criteria-list');
            const addTagBtnLF = document.getElementById('add-tag-btn');
            const tagsListLF = document.getElementById('tags-list');

            const createCriterionItem = (criterionKey, data = {}) => { // data here is from criteriaDefinition's value
                const div = document.createElement('div');
                div.className = 'criterion-item form-group';
                const isWeightedChecked = (data.isWeighted === undefined || data.isWeighted === true || data.isWeighted === 'true') ? 'checked' : '';
                const initialHiddenValue = (data.isWeighted === undefined || data.isWeighted === true || data.isWeighted === 'true') ? 'true' : 'false';

                div.innerHTML = `
                    <input type="text" name="criteria_title[]" placeholder="Título (Ej: Sabor)" class="form-input criterion-input" value="${ListopicApp.uiUtils.escapeHtml(data.title || '')}" required>
                    <input type="text" name="criteria_label_left[]" placeholder="Etiqueta Izquierda (Ej: Malo)" class="form-input criterion-input" value="${ListopicApp.uiUtils.escapeHtml(data.label_left || '')}"> <!-- Visual, not directly in criteriaDefinition -->
                    <input type="text" name="criteria_label_right[]" placeholder="Etiqueta Derecha (Ej: Excelente)" class="form-input criterion-input" value="${ListopicApp.uiUtils.escapeHtml(data.label_right || '')}"> <!-- Visual, not directly in criteriaDefinition -->
                    <label class="criterion-weighted-label" title="Marcar si este criterio debe contar para la puntuación general">
                        <input type="checkbox" name="criteria_isWeighted_checkbox" class="criterion-weighted-checkbox" ${data.ponderable ? 'checked' : ''}> Pondera
                    </label>
                    <input type="hidden" name="criteria_isWeighted[]" value="${initialHiddenValue}">
                    <button type="button" class="remove-button danger" title="Eliminar criterio">×</button>`;

                const checkbox = div.querySelector('.criterion-weighted-checkbox');
                const hiddenInput = div.querySelector('input[name="criteria_isWeighted[]"]');
                checkbox.addEventListener('change', () => {
                    hiddenInput.value = checkbox.checked ? 'true' : 'false';
                });
                // Store the key for easier transformation later
                const titleInput = div.querySelector('input[name="criteria_title[]"]');
                if (criterionKey) {
                    titleInput.dataset.criterionKey = criterionKey;
                }
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
                addCritBtnLF.addEventListener('click', () => critListLF.appendChild(createCriterionItem()));
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
                            // Transform criteriaDefinition map to form fields
                            if (listData.criteriaDefinition && typeof listData.criteriaDefinition === 'object') {
                                for (const key in listData.criteriaDefinition) {
                                    const critDef = listData.criteriaDefinition[key];
                                    // Adapt createCriterionItem or how you populate it.
                                    // For simplicity, we'll assume the old structure for now and it needs mapping.
                                    // This part needs careful mapping from new model to old form structure if form isn't updated.
                                    // Let's assume createCriterionItem expects { title: 'Sabor', ponderable: true }
                                    // and the title input will be used to generate the key.
                                    critListLF.appendChild(createCriterionItem(key, { title: critDef.label, ponderable: critDef.ponderable /*, visual info if needed */ }));
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
                        alert(`No se pudo cargar la lista: ${error.message}`);
                        if (listFormTitleH2) listFormTitleH2.textContent = 'Crear Nueva Lista de Valoración';
                    });
            } else {
                if (listFormTitleH2) listFormTitleH2.textContent = 'Crear Nueva Lista de Valoración';
                if (critListLF && critListLF.children.length === 0) critListLF.appendChild(createCriterionItem(null, {title: '', ponderable: true})); // Add a default empty one
                if (tagsListLF && tagsListLF.children.length === 0) tagsListLF.appendChild(createTagItem(""));
            }

            listForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = listForm.querySelector('.submit-button');
                if (submitButton) submitButton.disabled = true;

                const currentUser = auth.currentUser;
                if (!currentUser) {
                    alert("Debes estar autenticado para guardar una lista.");
                    if (submitButton) submitButton.disabled = false;
                    return;
                }

                const formData = new FormData(listForm);
                const listDataPayload = {
                    name: formData.get('name'),
                    userId: currentUser.uid, // Reference to users/{userId}
                    categoryId: formData.get('categoryId'), // Added categoryId from form
                    isPublic: true, // Default or get from form
                    criteriaDefinition: {},
                    availableTags: formData.getAll('tags[]').map(tag => tag.trim()).filter(tag => tag !== ''),
                    reviewCount: 0,
                    reactions: {},
                    commentsCount: 0
                };

                const titles = formData.getAll('criteria_title[]');
                // const labelsLeft = formData.getAll('criteria_label_left[]'); // For visual, not directly in criteriaDefinition
                // const labelsRight = formData.getAll('criteria_label_right[]'); // For visual, not directly in criteriaDefinition
                const areWeighted = formData.getAll('criteria_isWeighted[]');

                for (let i = 0; i < titles.length; i++) {
                    if (titles[i]?.trim()) {
                        const title = titles[i].trim();
                        const key = title.toLowerCase().replace(/[^a-z0-9]/g, '') || `criterion${i}`; // Generate a key
                        listDataPayload.criteriaDefinition[key] = {
                            label: title, // This is the display name
                            ponderable: areWeighted[i] === 'true',
                            visual: 'slider' // Default, or get from form if you add that option
                        };
                    }
                }
 // Corregido: Muestra el payload real que se intenta guardar
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
                    alert(`Lista ${listIdToEdit ? 'actualizada' : 'creada'} con éxito!`);
                    window.location.href = `list-view.html?listId=${savedListId}`;
                } catch (error) {
                    console.error('Error al guardar la lista:', error);
                    alert(`No se pudo guardar la lista: ${error.message}`);
                } finally {
                    if (submitButton) submitButton.disabled = false;
                }
            });
        } else {
            console.warn("LIST-FORM: listForm element not found.");
        }
        // --- End of code moved from app.js ---
    }

    return {
        init
    };
})();
