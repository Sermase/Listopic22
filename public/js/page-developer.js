window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDeveloper = (() => {
    const db = ListopicApp.services.db;
    const auth = ListopicApp.services.auth;
    const collectionsToFetch = ['users', 'lists', 'places', 'categories', 'listForums'];

    let currentData = [];
    let currentCollectionName = '';
    let sortState = {};
    let selectedRowIds = new Set(); // <-- Para guardar los IDs de las filas seleccionadas

    async function init() {
        console.log('Initializing Developer Dashboard page logic...');
        const contentContainer = document.getElementById('dev-content-container');
        contentContainer.innerHTML = '<p>Verificando permisos de administrador...</p>';

        const user = auth.currentUser;
        if (!user) {
            showAccessDenied();
            return;
        }

        try {
            const userProfileRef = db.collection('users').doc(user.uid);
            const userProfileDoc = await userProfileRef.get();
            if (userProfileDoc.exists && Array.isArray(userProfileDoc.data().userType) && userProfileDoc.data().userType.includes('jefe')) {
                console.log('Permiso de administrador concedido. Cargando dashboard.');
                setupTabs();
                setupActionButtons(); // <-- Se llama aquí para que los botones existan desde el principio
                if (collectionsToFetch.length > 0) {
                    switchTab(collectionsToFetch[0]);
                }
            } else {
                console.warn('Acceso denegado. El usuario no es "jefe".');
                showAccessDenied();
            }
        } catch (error) {
            console.error("Error al verificar el rol del usuario:", error);
            showAccessDenied("Error al verificar tus permisos.");
        }
    }

    function showAccessDenied(message = 'No tienes permiso para ver esta página.') {
        const devContainer = document.querySelector('.dev-container');
        if (devContainer) {
            devContainer.innerHTML = `
                <div style="text-align: center; padding-top: 50px;">
                    <i class="fas fa-user-lock" style="font-size: 4rem; color: var(--danger-color);"></i>
                    <h1 style="margin-top: 20px;">Acceso Denegado</h1>
                    <p style="font-size: 1.2rem; color: var(--secondary-text-color);">${message}</p>
                    <a href="index.html" class="button-primary" style="margin-top: 20px;">Volver al inicio</a>
                </div>
            `;
        }
    }

    function setupTabs() {
        const tabsContainer = document.getElementById('dev-tabs-container');
        if (!tabsContainer) return;
        tabsContainer.innerHTML = '';
        collectionsToFetch.forEach(collectionName => {
            const button = document.createElement('button');
            button.className = 'dev-tab-button';
            button.dataset.collection = collectionName;
            button.textContent = collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
            button.addEventListener('click', () => switchTab(collectionName));
            tabsContainer.appendChild(button);
        });
    }
    
    // --- Lógica de los Botones de Acción ---
    function setupActionButtons() {
        // Botón de exportar
        const exportBtn = document.getElementById('export-csv-btn');
        if (exportBtn) exportBtn.addEventListener('click', exportSelectedToCsv);

        // Botón de actualizar todos los lugares
        const updateAllPlacesBtn = document.getElementById('update-all-places-btn');
        if (updateAllPlacesBtn) updateAllPlacesBtn.addEventListener('click', handleUpdateAllPlaces);

        // NUEVO: Botón de actualizar seleccionados
        const updateBtn = document.getElementById('update-selected-btn');
        if (updateBtn) updateBtn.addEventListener('click', updateSelectedPlaces);

        // NUEVO: Botón actualizar listas seleccionadas
        const updateListsBtn = document.getElementById('update-selected-lists-btn');
        if (updateListsBtn) updateListsBtn.addEventListener('click', updateSelectedLists);

        // NUEVO: Botón de eliminar seleccionados
        const deleteBtn = document.getElementById('delete-selected-btn');
        if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedItems);

      
        const auditStatsBtn = document.getElementById('audit-stats-btn');
        if (auditStatsBtn) auditStatsBtn.addEventListener('click', runStatisticsAudit);
    }

    function updateActionButtonsState() {
        const updateBtn = document.getElementById('update-selected-btn');
        const deleteBtn = document.getElementById('delete-selected-btn');
        const exportBtn = document.getElementById('export-csv-btn');

        const hasSelection = selectedRowIds.size > 0;

        if (deleteBtn) {
            deleteBtn.disabled = !hasSelection;
            deleteBtn.style.display = 'inline-block'; // Siempre visible pero deshabilitado
        }
        if (exportBtn) {
            // El botón de exportar ahora exportará lo seleccionado, o todo si no hay nada seleccionado
            exportBtn.textContent = hasSelection ? `Exportar ${selectedRowIds.size} a CSV` : 'Exportar Todo a CSV';
        }
        if (updateBtn) {
            const isPlacesTab = currentCollectionName === 'places';
            updateBtn.style.display = isPlacesTab ? 'inline-block' : 'none';
            updateBtn.disabled = !hasSelection || !isPlacesTab;
        }
        const updateListsBtn = document.getElementById('update-selected-lists-btn');
        if (updateListsBtn) {
            const isListsTab = currentCollectionName === 'lists';
            updateListsBtn.style.display = isListsTab ? 'inline-block' : 'none';
            updateListsBtn.disabled = !hasSelection || !isListsTab;
        }
    }

    // --- Funciones para los Botones de Acción ---

    function exportSelectedToCsv() {
        const dataToExport = selectedRowIds.size > 0 
            ? currentData.filter(row => selectedRowIds.has(row.id))
            : currentData;

        if (dataToExport.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }
        const collectionName = currentCollectionName || 'export';
        exportToCsv(`${collectionName}_${new Date().toISOString().slice(0, 10)}.csv`, dataToExport);
    }

    async function handleUpdateAllPlaces() {
        if (!confirm('¿Estás seguro de que quieres actualizar TODOS los lugares? Esta operación puede tardar y consumir cuota de la API de Google.')) return;
        const btn = document.getElementById('update-all-places-btn');
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        btn.disabled = true;

        try {
            const adminUpdateAllPlaces = firebase.app().functions('europe-west1').httpsCallable('adminUpdateAllPlaces');
            const result = await adminUpdateAllPlaces();
            const { updated, skipped, errors } = result.data;
            alert(`Actualización completada.\n\nActualizados: ${updated}\nOmitidos: ${skipped}\nErrores: ${errors}`);
        } catch (error) {
            console.error("Error al ejecutar adminUpdateAllPlaces:", error);
            alert(`Error al actualizar los lugares: ${error.message}`);
        } finally {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
    }
    
    // NUEVA: Actualizar solo los lugares seleccionados
    async function updateSelectedPlaces() {
        if (selectedRowIds.size === 0) return;
        if (!confirm(`¿Estás seguro de que quieres actualizar ${selectedRowIds.size} lugar(es) seleccionados?`)) return;

        const btn = document.getElementById('update-selected-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';

        let successCount = 0;
        let errorCount = 0;

        const updatePromises = [];
        for (const docId of selectedRowIds) {
            const place = currentData.find(p => p.id === docId);
            if (place && place.googlePlaceId) {
                const adminUpdateSinglePlace = firebase.app().functions('europe-west1').httpsCallable('adminUpdateSinglePlace');
                updatePromises.push(
                    adminUpdateSinglePlace({ documentId: docId, googlePlaceId: place.googlePlaceId })
                    .then(() => successCount++)
                    .catch(err => {
                        console.error(`Error actualizando el lugar ${docId}:`, err);
                        errorCount++;
                    })
                );
            } else {
                console.warn(`No se pudo encontrar googlePlaceId para el documento ${docId}. Saltando...`);
                errorCount++;
            }
        }
        
        await Promise.all(updatePromises);
        
        alert(`Operación completada.\n\nActualizados: ${successCount}\nErrores: ${errorCount}`);
        btn.disabled = false;
        btn.innerHTML = 'Actualizar Selección';
        switchTab(currentCollectionName); // Recargar la vista
    }


    // NUEVA: Borrado suave de elementos seleccionados
    async function deleteSelectedItems() {
        if (selectedRowIds.size === 0) return;
        if (!confirm(`¿Estás seguro de que quieres eliminar ${selectedRowIds.size} elemento(s)? Serán movidos a una papelera temporal.`)) return;

        const btn = document.getElementById('delete-selected-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...';

        const writeBatch = db.batch();
        const deletedItemsRef = db.collection('deleted_items');

        for (const docId of selectedRowIds) {
            const itemData = currentData.find(item => item.id === docId);
            if (itemData) {
                const originalDocRef = db.collection(currentCollectionName).doc(docId);
                const deletedDocRef = deletedItemsRef.doc(); // Nuevo documento en la papelera
                
                // Mover al archivo de borrados
                writeBatch.set(deletedDocRef, {
                    ...itemData,
                    originalCollection: currentCollectionName,
                    deletedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Eliminar el original
                writeBatch.delete(originalDocRef);
            }
        }

        try {
            await writeBatch.commit();
            alert(`${selectedRowIds.size} elemento(s) han sido eliminados y archivados.`);
        } catch (error) {
            console.error("Error durante el borrado suave:", error);
            alert(`Ocurrió un error: ${error.message}`);
        } finally {
            btn.innerHTML = 'Eliminar Selección';
            switchTab(currentCollectionName); // Recargar la vista actual
        }
    }


    function exportToCsv(filename, rows) {
        if (!rows || !rows.length) return;
        const separator = ',';
        const allKeys = new Set();
        rows.forEach(row => Object.keys(row).forEach(key => allKeys.add(key)));
        const headers = Array.from(allKeys);
        const csvContent = [
            headers.join(separator),
            ...rows.map(row => headers.map(k => {
                let cell = row[k] === null || row[k] === undefined ? '' : row[k];
                if (typeof cell === 'object') cell = JSON.stringify(cell).replace(/"/g, '""');
                let cellString = String(cell);
                if (cellString.includes(separator) || cellString.includes('"') || cellString.includes('\n')) {
                    cellString = `"${cellString}"`;
                }
                return cellString;
            }).join(separator))
        ].join('\n');
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function switchTab(collectionName) {
        currentCollectionName = collectionName;
        document.querySelectorAll('.dev-tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.collection === collectionName);
        });

        const contentContainer = document.getElementById('dev-content-container');
        contentContainer.innerHTML = `<p>Cargando datos de "${collectionName}"...</p>`;
        sortState = {};
        selectedRowIds.clear(); // Limpiar selección al cambiar de pestaña
        updateActionButtonsState(); // Actualizar estado de botones

        try {
            const snapshot = await db.collection(collectionName).limit(100).get();
            currentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (currentData.length === 0) {
                contentContainer.innerHTML = `<p>No se encontraron documentos en la colección "${collectionName}".</p>`;
                return;
            }
            renderTable(currentData, contentContainer);
        } catch (error) {
            console.error(`Error fetching collection ${collectionName}:`, error);
            contentContainer.innerHTML = `<p style="color:var(--danger-color);">Error al cargar datos de "${collectionName}": ${error.message}</p>`;
        }
    }

    function renderTable(data, container) {
        if (!data || data.length === 0) {
            container.innerHTML = `<p>No hay datos para mostrar.</p>`;
            return;
        }

        const allKeys = new Set(['id']);
        data.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)));
        const headers = Array.from(allKeys);
        
        // Añadimos la columna de selección al principio
        const tableHeaders = [
            `<th><input type="checkbox" id="select-all-checkbox" title="Seleccionar todo"></th>`,
            ...headers.map(key => {
                const sortClass = sortState[key] ? `sort-${sortState[key]}` : '';
                const icon = sortState[key] === 'asc' ? '▲' : sortState[key] === 'desc' ? '▼' : '';
                return `<th class="sortable ${sortClass}" data-key="${escapeHtml(key)}">${escapeHtml(key)} <span class="sort-icon">${icon}</span></th>`;
            })
        ].join('');

        const tableRows = data.map(row => {
            const isSelected = selectedRowIds.has(row.id);
            return `
                <tr class="${isSelected ? 'selected' : ''}" data-row-id="${row.id}">
                    <td><input type="checkbox" class="row-selector" data-id="${row.id}" ${isSelected ? 'checked' : ''}></td>
                    ${headers.map(header => `<td>${formatCell(row[header])}</td>`).join('')}
                </tr>
            `;
        }).join('');

        const tableHTML = `
            <div class="data-table-wrapper">
                <table class="data-table" id="table-${currentCollectionName}">
                    <thead><tr>${tableHeaders}</tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>`;
        container.innerHTML = tableHTML;
        addTableEventListeners(container);
    }

    function addTableEventListeners(container) {
        // Listeners de ordenación
        container.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                const newSort = sortState[key] === 'asc' ? 'desc' : 'asc';
                sortState = { [key]: newSort };
                sortData(key, newSort);
                renderTable(currentData, container);
            });
        });

        // Listeners de selección
        const selectAllCheckbox = container.querySelector('#select-all-checkbox');
        const rowCheckboxes = container.querySelectorAll('.row-selector');

        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            rowCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
                const rowId = checkbox.dataset.id;
                if (isChecked) {
                    selectedRowIds.add(rowId);
                    document.querySelector(`[data-row-id="${rowId}"]`).classList.add('selected');
                } else {
                    selectedRowIds.delete(rowId);
                    document.querySelector(`[data-row-id="${rowId}"]`).classList.remove('selected');
                }
            });
            updateActionButtonsState();
        });

        rowCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const rowId = e.target.dataset.id;
                const rowElement = document.querySelector(`[data-row-id="${rowId}"]`);
                if (e.target.checked) {
                    selectedRowIds.add(rowId);
                    rowElement.classList.add('selected');
                } else {
                    selectedRowIds.delete(rowId);
                    rowElement.classList.remove('selected');
                }
                selectAllCheckbox.checked = rowCheckboxes.length === selectedRowIds.size;
                updateActionButtonsState();
            });
        });
    }


    function sortData(key, direction) {
        currentData.sort((a, b) => {
            const valA = a[key], valB = b[key];
            if (valA === null || typeof valA === 'undefined') return 1;
            if (valB === null || typeof valB === 'undefined') return -1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            return 0;
        });
    }

    function formatCell(value) {
        if (value === null || typeof value === 'undefined') return '<em>null</em>';
        if (Array.isArray(value)) return escapeHtml(value.join(', '));
        const valueStr = String(value);
        if (valueStr.startsWith('http://') || valueStr.startsWith('https://')) {
            return `<a href="${escapeHtml(valueStr)}" target="_blank" rel="noopener noreferrer">${escapeHtml(valueStr)}</a>`;
        }
        if (typeof value === 'object') {
            if (value.toDate) return escapeHtml(value.toDate().toLocaleString());
            if (value.latitude && value.longitude) return `Lat: ${value.latitude.toFixed(4)}, Lon: ${value.longitude.toFixed(4)}`;
            return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return escapeHtml(valueStr);
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') unsafe = String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // --- NUEVA FUNCIÓN PARA ALGOLIA ---
    async function backfillAlgolia(collectionName = null) {
        const logContainer = document.getElementById('algolia-sync-log');
        if (!logContainer) return;
        
        logContainer.innerHTML = '<p><code>Solicitando sincronización para Algolia...</code></p>';

        try {
            const functions = firebase.app().functions('europe-west1');
            const backfill = functions.httpsCallable('algolia-adminBackfillAlgolia');
            const collections = collectionName ? [collectionName] : ['lists', 'users', 'places'];
            
            for (const collection of collections) {
                logContainer.innerHTML += `<p><code>⏳ Sincronizando '${collection}'...</code></p>`;
                try {
                    const result = await backfill({ collectionName: collection });
                    logContainer.innerHTML += `<p style="color: var(--accent-color-tertiary);"><code>✅ ${collection}: ${result.data.message}</code></p>`;
                } catch (error) {
                    logContainer.innerHTML += `<p style="color: var(--danger-color);"><code>🔥 Error en '${collection}': ${error.message}</code></p>`;
                }
            }
            logContainer.innerHTML += '<p><code>Proceso de sincronización completado.</code></p>';
        } catch (error) {
            logContainer.innerHTML += `<p style="color: var(--danger-color);"><code>🔥 Error general al llamar la función: ${error.message}</code></p>`;
        }
    }

    // --- Pestaña principal: conmutación ---
    function setupMainTabs() {
        const buttons = document.querySelectorAll('.dev-main-tab-button');
        const panes = {
            data: document.getElementById('tab-content-data'),
            algolia: document.getElementById('tab-content-algolia'),
            categories: document.getElementById('tab-content-categories')
        };
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                Object.values(panes).forEach(p => p && (p.style.display = 'none'));
                const key = btn.dataset.tab;
                panes[key] && (panes[key].style.display = 'block');
            });
        });
    }

    // NUEVA: Actualizar agregados de listas seleccionadas
    async function updateSelectedLists() {
        if (selectedRowIds.size === 0) return;
        if (!confirm(`¿Actualizar agregados de ${selectedRowIds.size} lista(s)?`)) return;
        const btn = document.getElementById('update-selected-lists-btn');
        btn.disabled = true;
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        let successCount = 0;
        let errorCount = 0;
        try {
            const callable = firebase.app().functions('europe-west1').httpsCallable('adminUpdateSingleListAggregates');
            await Promise.all(
                Array.from(selectedRowIds).map(id => callable({ listId: id }).then(()=>successCount++).catch(()=>errorCount++))
            );
            alert(`Listas actualizadas: ${successCount}\nErrores: ${errorCount}`);
            switchTab(currentCollectionName);
        } catch (e) {
            console.error('Error en updateSelectedLists', e);
            alert('Error al actualizar listas: ' + e.message);
        } finally {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
    }

    // --- Admin de categorías ---
    async function initCategoriesAdminUI() {
        const sel = document.getElementById('admin-category-select');
        const idInput = document.getElementById('admin-cat-id');
        const nameInput = document.getElementById('admin-cat-name');
        const iconInput = document.getElementById('admin-cat-icon');
        const orderInput = document.getElementById('admin-cat-order');
        const likeInput = document.getElementById('admin-cat-like');
        const dislikeInput = document.getElementById('admin-cat-dislike');
        const fixedTagsTextarea = document.getElementById('admin-cat-fixed-tags');
        const defaultCriteriaTextarea = document.getElementById('admin-cat-default-criteria');
        const btnNew = document.getElementById('admin-cat-new');
        const btnSave = document.getElementById('admin-cat-save');

        async function loadSelect() {
            // Traer todas las categorías (aunque no tengan 'order') y ordenar en cliente
            const snap = await db.collection('categories').get();
            const docsSorted = snap.docs.slice().sort((a,b) => {
                const ao = (typeof a.data().order === 'number') ? a.data().order : Number.POSITIVE_INFINITY;
                const bo = (typeof b.data().order === 'number') ? b.data().order : Number.POSITIVE_INFINITY;
                return ao - bo;
            });
            const options = ['<option value="" disabled selected>Selecciona categoría...</option>']
                .concat(docsSorted.map(d => {
                    const data = d.data();
                    return `<option value="${d.id}">${escapeHtml(data.name || d.id)}</option>`;
                }));
            sel.innerHTML = options.join('');
            // Selección por defecto tipo "Comida"
            const prefer = docsSorted.find(d => ((d.data().name||d.id||'').toString().toLowerCase().includes('comida')))
                        || docsSorted.find(d => typeof d.data().order === 'number' && d.data().order === 1)
                        || docsSorted[0];
            if (prefer) {
                sel.value = prefer.id;
            }
            sel.onchange = async () => {
                const id = sel.value;
                if (!id) return;
                const doc = await db.collection('categories').doc(id).get();
                if (!doc.exists) return;
                const data = doc.data();
                idInput.value = doc.id;
                nameInput.value = data.name || '';
                iconInput.value = data.icon || '';
                orderInput.value = data.order ?? '';
                likeInput.value = data.like || '';
                dislikeInput.value = data.dislike || '';
                const fixedTags = data['fixed-tags'] || data.fixedTags || [];
                fixedTagsTextarea.value = Array.isArray(fixedTags) ? fixedTags.join(', ') : '';
                defaultCriteriaTextarea.value = data.defaultCriteria ? JSON.stringify(data.defaultCriteria, null, 2) : '';
            };
            // Cargar datos de la preselección
            sel.onchange();
        }

        btnNew && (btnNew.onclick = () => {
            sel.value = '';
            idInput.value = '';
            nameInput.value = '';
            iconInput.value = '';
            orderInput.value = '';
            likeInput.value = '';
            dislikeInput.value = '';
            fixedTagsTextarea.value = '';
            defaultCriteriaTextarea.value = '';
        });

        btnSave && (btnSave.onclick = async () => {
            try {
                const name = nameInput.value.trim();
                if (!name) { ListopicApp.services.showNotification('Nombre requerido', 'error'); return; }
                const icon = iconInput.value.trim();
                const order = parseInt(orderInput.value, 10) || 0;
                const like = likeInput.value.trim();
                const dislike = dislikeInput.value.trim();
                const fixedTags = fixedTagsTextarea.value.split(',').map(s => s.trim()).filter(Boolean);
                let defaultCriteria = {};
                const raw = defaultCriteriaTextarea.value.trim();
                if (raw) {
                    try { defaultCriteria = JSON.parse(raw); }
                    catch(e) { ListopicApp.services.showNotification('Default Criteria no es JSON válido', 'error'); return; }
                }
                const payload = { name, icon, order, like, dislike, 'fixed-tags': fixedTags, defaultCriteria };
                let docId = idInput.value.trim();
                if (!docId) {
                    docId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 64) || 'categoria';
                }
                await db.collection('categories').doc(docId).set(payload, { merge: true });
                idInput.value = docId;
                ListopicApp.services.showNotification('Categoría guardada', 'success');
                await loadSelect();
                sel.value = docId;
            } catch (e) {
                console.error('DEV: Error guardando categoría', e);
                ListopicApp.services.showNotification('No se pudo guardar la categoría: ' + e.message, 'error');
            }
        });

        await loadSelect();
    }


    async function runStatisticsAudit() {
        const btn = document.getElementById('audit-stats-btn');
        const logContainer = document.getElementById('stats-audit-log');
        if (!btn || !logContainer) return;

        const originalLabel = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Revisando...';
        logContainer.innerHTML = '<p><code>Iniciando repaso de estadísticas...</code></p>';

        try {
            const callable = firebase.app().functions('europe-west1').httpsCallable('adminAuditStatistics');
            const result = await callable();
            renderStatisticsAuditLog(result?.data);
        } catch (error) {
            console.error('Error al ejecutar adminAuditStatistics', error);
            const message = error?.message || 'Error desconocido al ejecutar el repaso.';
            logContainer.innerHTML = `<p style="color: var(--danger-color);"><code>${escapeHtml(message)}</code></p>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalLabel;
        }
    }

    function renderStatisticsAuditLog(result) {
        const container = document.getElementById('stats-audit-log');
        if (!container) return;

        if (!result || typeof result !== 'object') {
            container.innerHTML = '<p><code>Respuesta vacía del servidor.</code></p>';
            return;
        }

        const summary = result.summary || {};
        const details = result.details || {};
        const checked = summary.checked || {};
        const updated = summary.updated || {};
        const errors = Array.isArray(summary.errors) ? summary.errors : [];
        const totalUpdates = (updated.places || 0) + (updated.users || 0) + (updated.lists || 0);
        const duration = typeof summary.durationMs === 'number' ? `${summary.durationMs} ms` : 'desconocido';
        const completedAt = summary.completedAt ? new Date(summary.completedAt).toLocaleString() : '';

        const summaryHtml = `
            <div class="audit-summary">
                <h4>Resumen</h4>
                <ul>
                    <li><strong>Lugares revisados:</strong> ${checked.places || 0} · actualizados: ${updated.places || 0}</li>
                    <li><strong>Usuarios revisados:</strong> ${checked.users || 0} · actualizados: ${updated.users || 0}</li>
                    <li><strong>Listas revisadas:</strong> ${checked.lists || 0} · actualizadas: ${updated.lists || 0}</li>
                    <li><strong>Listas con grupos ajustados:</strong> ${updated.groupedItems || 0}</li>
                </ul>
                <p><small>Duración: ${escapeHtml(duration)}${completedAt ? ` · Finalizado: ${escapeHtml(completedAt)}` : ''}</small></p>
            </div>
        `;

        const errorsHtml = errors.length > 0
            ? `<details><summary>Errores (${errors.length})</summary><ul>${errors.map(err => `<li><code>${escapeHtml(err.type || 'desconocido')}</code> ${err.id ? `(${escapeHtml(err.id)})` : ''}: ${escapeHtml(err.message || 'Error sin mensaje')}</li>`).join('')}</ul></details>`
            : '';

        if (totalUpdates === 0 && errors.length === 0) {
            container.innerHTML = `${summaryHtml}<p>Todo estaba en orden. ✅</p>`;
            return;
        }

        const placesHtml = renderAuditDetailSection('Lugares ajustados', details.places || []);
        const usersHtml = renderAuditDetailSection('Usuarios ajustados', details.users || []);
        const listsHtml = renderAuditDetailSection('Listas ajustadas', details.lists || []);
        const groupsHtml = renderGroupedItemsSection('Elementos (grupos) actualizados', details.groupedItems || []);

        container.innerHTML = [summaryHtml, errorsHtml, placesHtml, usersHtml, listsHtml, groupsHtml]
            .filter(Boolean)
            .join('');
    }

    function renderAuditDetailSection(title, entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return `<details><summary>${escapeHtml(title)}</summary><p>Sin discrepancias.</p></details>`;
        }

        const itemsHtml = entries.map(entry => {
            const identifier = entry.name
                ? `${escapeHtml(entry.name)} <small>(${escapeHtml(entry.id)})</small>`
                : escapeHtml(entry.id);
            const diffs = Array.isArray(entry.diffs)
                ? entry.diffs.map(diff => `<li><code>${escapeHtml(diff.field)}</code>: ${escapeHtml(String(diff.previous ?? 0))} → <strong>${escapeHtml(String(diff.value))}</strong></li>`).join('')
                : '';
            return `<li><strong>${identifier}</strong><ul>${diffs}</ul></li>`;
        }).join('');

        return `<details open><summary>${escapeHtml(title)} (${entries.length})</summary><ol>${itemsHtml}</ol></details>`;
    }

    function renderGroupedItemsSection(title, entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return `<details><summary>${escapeHtml(title)}</summary><p>Sin ajustes necesarios.</p></details>`;
        }

        const itemsHtml = entries.map(entry => {
            const identifier = entry.name
                ? `${escapeHtml(entry.name)} <small>(${escapeHtml(entry.listId)})</small>`
                : escapeHtml(entry.listId);
            return `<li><strong>${identifier}</strong>: ${escapeHtml(String(entry.previousValue ?? 0))} → <strong>${escapeHtml(String(entry.newValue ?? 0))}</strong></li>`;
        }).join('');

        return `<details open><summary>${escapeHtml(title)} (${entries.length})</summary><ul>${itemsHtml}</ul></details>`;
    }

    return { init, setupMainTabs, initCategoriesAdminUI };
})();
