window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDeveloper = (() => {
    const db = ListopicApp.services.db;
    const auth = ListopicApp.services.auth;
    const collectionsToFetch = ['users', 'lists', 'places', 'categories', 'listForums'];

    let currentData = [];
    let currentCollectionName = '';
    let sortState = {};
    let selectedRowIds = new Set(); // <-- Para guardar los IDs de las filas seleccionadas
    let currentLimit = 100;
    const advancedState = {
        reviewResults: [],
        groupResults: [],
        placeResults: [],
        listResults: [],
        selectedReview: null,
        selectedGroup: null,
        selectedPlace: null,
        selectedList: null
    };

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
                setupAdvancedTools();
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

    // --- Utilidades para la pestaña avanzada y notificaciones ---
    function notify(message, type = 'info') {
        try {
            if (ListopicApp?.services?.showNotification) {
                ListopicApp.services.showNotification(message, type);
            } else {
                alert(message);
            }
        } catch (e) {
            console.warn('DEV notify fallback:', e);
            alert(message);
        }
    }

    function getInputValue(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function setInputValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    }

    function setElementVisible(elOrId, isVisible) {
        const element = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
        if (!element) return;
        element.hidden = !isVisible;
        element.style.display = isVisible ? '' : 'none';
    }

    function serializeDataForTextarea(data) {
        try {
            return JSON.stringify(data || {}, null, 2);
        } catch (e) {
            return '';
        }
    }

    function parseJsonInput(rawText) {
        const trimmed = (rawText || '').trim();
        if (!trimmed) return {};
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
        throw new Error('El JSON debe ser un objeto.');
    }

    function formatDateTime(value) {
        if (!value) return '';
        try {
            const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
            return date.toLocaleString();
        } catch (e) {
            return String(value);
        }
    }

    function formatDateForInput(value) {
        try {
            const date = typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : value ? new Date(value) : null;
            if (!date || Number.isNaN(date.getTime())) return '';
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        } catch {
            return '';
        }
    }

    function getTimestampMs(value) {
        if (!value) return 0;
        try {
            if (typeof value.toMillis === 'function') return value.toMillis();
            if (typeof value.toDate === 'function') return value.toDate().getTime();
            if (value instanceof Date) return value.getTime();
            const num = Number(value);
            return Number.isFinite(num) ? num : 0;
        } catch (e) {
            return 0;
        }
    }

    function parseDateRange(fromStr, toStr) {
        const fromMs = fromStr ? Date.parse(fromStr + 'T00:00:00Z') : 0;
        const toMs = toStr ? Date.parse(toStr + 'T23:59:59.999Z') : 0;
        return {
            fromMs: Number.isFinite(fromMs) ? fromMs : 0,
            toMs: Number.isFinite(toMs) ? toMs : 0
        };
    }

    function showModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.hidden = false;
        modal.style.display = 'flex';
    }

    function hideModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.hidden = true;
        modal.style.display = 'none';
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
        const limitSelect = document.getElementById('dev-limit-select');
        if (limitSelect) {
            limitSelect.value = String(currentLimit);
            limitSelect.addEventListener('change', () => {
                const parsed = parseInt(limitSelect.value, 10);
                currentLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
                const targetCollection = currentCollectionName || collectionsToFetch[0];
                if (targetCollection) {
                    switchTab(targetCollection);
                }
            });
        }

        const exportBtn = document.getElementById('export-csv-btn');
        if (exportBtn) exportBtn.addEventListener('click', exportSelectedToCsv);

        const exportAllBtn = document.getElementById('export-all-csv-btn');
        if (exportAllBtn) exportAllBtn.addEventListener('click', exportEntireCollectionToCsv);

        const updateAllPlacesBtn = document.getElementById('update-all-places-btn');
        if (updateAllPlacesBtn) updateAllPlacesBtn.addEventListener('click', handleUpdateAllPlaces);

        const updateBtn = document.getElementById('update-selected-btn');
        if (updateBtn) updateBtn.addEventListener('click', updateSelectedPlaces);

        const updateListsBtn = document.getElementById('update-selected-lists-btn');
        if (updateListsBtn) updateListsBtn.addEventListener('click', updateSelectedLists);

        const fixPlacesBtn = document.getElementById('fix-selected-places-btn');
        if (fixPlacesBtn) fixPlacesBtn.addEventListener('click', fixSelectedPlaces);

        const deleteBtn = document.getElementById('delete-selected-btn');
        if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedItems);

      
        const auditStatsBtn = document.getElementById('audit-stats-btn');
        if (auditStatsBtn) auditStatsBtn.addEventListener('click', runStatisticsAudit);

        const auditPlaceIdsBtn = document.getElementById('audit-place-ids-btn');
        if (auditPlaceIdsBtn) auditPlaceIdsBtn.addEventListener('click', runPlaceIdAudit);

        // Listeners para los botones de Algolia
        const syncAllBtn = document.getElementById('algolia-sync-all-btn');
        if (syncAllBtn) syncAllBtn.addEventListener('click', () => backfillAlgolia(null));

        const syncListsBtn = document.getElementById('algolia-sync-lists-btn');
        if (syncListsBtn) syncListsBtn.addEventListener('click', () => backfillAlgolia('lists'));

        const syncUsersBtn = document.getElementById('algolia-sync-users-btn');
        if (syncUsersBtn) syncUsersBtn.addEventListener('click', () => backfillAlgolia('users'));

        const syncPlacesBtn = document.getElementById('algolia-sync-places-btn');
        if (syncPlacesBtn) syncPlacesBtn.addEventListener('click', () => backfillAlgolia('places'));
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
            exportBtn.textContent = hasSelection
                ? `Exportar ${selectedRowIds.size} seleccionados`
                : 'Exportar vista a CSV';
        }
        if (updateBtn) {
            const isPlacesTab = currentCollectionName === 'places';
            updateBtn.style.display = isPlacesTab ? 'inline-block' : 'none';
            updateBtn.disabled = !hasSelection || !isPlacesTab;
        }
        const fixPlacesBtn = document.getElementById('fix-selected-places-btn');
        if (fixPlacesBtn) {
            const isPlacesTab = currentCollectionName === 'places';
            const hasFixableSelection = isPlacesTab && Array.from(selectedRowIds).some(id => {
                const place = currentData.find(item => item.id === id);
                return place && typeof place.googlePlaceId === 'string' && place.googlePlaceId && place.googlePlaceId !== place.id;
            });
            fixPlacesBtn.style.display = isPlacesTab ? 'inline-block' : 'none';
            fixPlacesBtn.disabled = !hasFixableSelection;
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

    async function exportEntireCollectionToCsv() {
        if (!currentCollectionName) {
            alert('Selecciona una colección antes de exportar.');
            return;
        }

        const btn = document.getElementById('export-all-csv-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando...';
        }

        try {
            const callable = firebase.app().functions('europe-west1').httpsCallable('adminGetCollection');
            const response = await callable({ collectionName: currentCollectionName });
            const collectionData = Array.isArray(response?.data?.data) ? response.data.data : [];

            if (!collectionData.length) {
                alert('La colección no tiene documentos o no se pudieron obtener.');
                return;
            }

            exportToCsv(`${currentCollectionName}_full_${new Date().toISOString().slice(0, 10)}.csv`, collectionData);
        } catch (error) {
            console.error('Error al exportar la colección completa:', error);
            alert(`No se pudo exportar la colección: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Exportar colección completa';
            }
        }
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


    async function fixSelectedPlaces() {
        if (currentCollectionName !== 'places') {
            alert('Esta acci�n solo est� disponible en la pesta�a de lugares.');
            return;
        }

        if (selectedRowIds.size === 0) {
            alert('Selecciona al menos un lugar para reparar.');
            return;
        }

        const candidates = Array.from(selectedRowIds)
            .map(id => currentData.find(item => item.id === id))
            .filter(place => place && typeof place.googlePlaceId === 'string' && place.googlePlaceId && place.googlePlaceId !== place.id);

        if (candidates.length === 0) {
            alert('La selecci�n no contiene lugares con googlePlaceId diferente al ID del documento.');
            return;
        }

        if (!confirm(`Se reparar�n ${candidates.length} lugar(es). Las rese�as y seguidores se reasignar�n al ID correcto.\n\n�Deseas continuar?`)) {
            return;
        }

        const btn = document.getElementById('fix-selected-places-btn');
        const originalLabel = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reparando...';
        }

        const callable = firebase.app().functions('europe-west1').httpsCallable('adminFixPlaceDocument');
        let successCount = 0;
        let errorCount = 0;
        const skippedCount = selectedRowIds.size - candidates.length;

        for (const place of candidates) {
            try {
                await callable({ sourceId: place.id, targetId: place.googlePlaceId });
                successCount++;
            } catch (error) {
                console.error(`Error reparando el lugar ${place.id}`, error);
                errorCount++;
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalLabel || 'Reparar IDs (Places)';
        }

        alert(`Proceso completado.\nReparados: ${successCount}\nOmitidos: ${skippedCount}\nErrores: ${errorCount}`);
        switchTab(currentCollectionName);
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

        const limitSelect = document.getElementById('dev-limit-select');
        if (limitSelect) {
            limitSelect.value = String(currentLimit);
        }

        try {
            let query = db.collection(collectionName);
            if (Number.isFinite(currentLimit) && currentLimit > 0) {
                query = query.limit(currentLimit);
            }
            const snapshot = await query.get();
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
            const backfill = functions.httpsCallable('adminBackfillAlgolia');
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
            tools: document.getElementById('tab-content-tools'),
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
        const displayNameInput = document.getElementById('admin-cat-displayname');
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
                    const label = data.displayname || data.displayName || data.name || d.id;
                    return `<option value="${d.id}">${escapeHtml(label)}</option>`;
                }));
            sel.innerHTML = options.join('');
            // Selección por defecto tipo "Comida"
            const prefer = docsSorted.find(d => ((d.data().displayname||d.data().displayName||d.data().name||d.id||'').toString().toLowerCase().includes('comida')))
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
                if (displayNameInput) displayNameInput.value = data.displayname || data.displayName || '';
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
            if (displayNameInput) displayNameInput.value = '';
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


    async function runPlaceIdAudit() {
        const btn = document.getElementById('audit-place-ids-btn');
        const logContainer = document.getElementById('place-id-audit-log');
        if (!btn || !logContainer) return;

        const originalLabel = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auditando...';
        logContainer.innerHTML = '<p><code>Analizando IDs de lugares...</code></p>';

        try {
            const callable = firebase.app().functions('europe-west1').httpsCallable('adminAuditPlaceIdConsistency');
            const result = await callable();
            renderPlaceIdAuditLog(result?.data);
        } catch (error) {
            console.error('Error al ejecutar adminAuditPlaceIdConsistency', error);
            const message = error?.message || 'Error desconocido al auditar los IDs.';
            logContainer.innerHTML = `<p style="color: var(--danger-color);"><code>${escapeHtml(message)}</code></p>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalLabel;
        }
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

    function renderPlaceIdAuditLog(result) {
        const container = document.getElementById('place-id-audit-log');
        if (!container) return;

        if (!result || typeof result !== 'object') {
            container.innerHTML = '<p><code>Respuesta vacia del servidor.</code></p>';
            return;
        }

        const summary = result.summary || {};
        const mismatched = Array.isArray(result.mismatchedIds) ? result.mismatchedIds : [];
        const missing = Array.isArray(result.missingGooglePlaceId) ? result.missingGooglePlaceId : [];
        const duplicates = Array.isArray(result.duplicateGroups) ? result.duplicateGroups : [];

        const summaryHtml = `
            <div class="audit-summary">
                <h4>Resumen IDs Places</h4>
                <ul>
                    <li><strong>Total lugares:</strong> ${summary.totalDocs ?? 0}</li>
                    <li><strong>Coinciden docId / googlePlaceId:</strong> ${summary.matchingCount ?? 0}</li>
                    <li><strong>IDs distintos:</strong> ${summary.mismatchedCount ?? 0}</li>
                    <li><strong>Sin googlePlaceId:</strong> ${summary.missingGooglePlaceIdCount ?? 0}</li>
                    <li><strong>Duplicados:</strong> ${summary.duplicateGroupCount ?? 0} grupos (${summary.duplicateDocumentCount ?? 0} documentos)</li>
                </ul>
            </div>
        `;

        const buildListHtml = (title, entries, formatter) => {
            if (!Array.isArray(entries) || entries.length === 0) {
                return `<details><summary>${escapeHtml(title)}</summary><p>Sin datos.</p></details>`;
            }

            const limitedEntries = entries.slice(0, 100);
            const extraCount = entries.length - limitedEntries.length;
            const items = limitedEntries.map(formatter).join('');
            const extraNote = extraCount > 0 ? `<p><small>Mostrando ${limitedEntries.length} de ${entries.length} resultados.</small></p>` : '';
            return `<details open><summary>${escapeHtml(title)} (${entries.length})</summary><ol>${items}</ol>${extraNote}</details>`;
        };

        const mismatchedHtml = buildListHtml('Documentos con ID distinto al googlePlaceId', mismatched, entry => {
            const name = entry.name ? `${escapeHtml(entry.name)} ` : '';
            return `<li>${name}<code>${escapeHtml(entry.id)}</code> &ne; <code>${escapeHtml(entry.googlePlaceId)}</code></li>`;
        });

        const missingHtml = buildListHtml('Documentos sin googlePlaceId', missing, entry => {
            const name = entry.name ? `${escapeHtml(entry.name)} ` : '';
            return `<li>${name}<code>${escapeHtml(entry.id)}</code></li>`;
        });

        const duplicatesHtml = buildListHtml('Duplicados por googlePlaceId', duplicates, entry => {
            const docIds = Array.isArray(entry.documentIds) ? entry.documentIds : [];
            const docList = docIds.map(id => `<code>${escapeHtml(id)}</code>`).join(', ');
            return `<li><strong>${escapeHtml(entry.googlePlaceId)}</strong> (${entry.count}) → ${docList}</li>`;
        });

        container.innerHTML = [summaryHtml, mismatchedHtml, missingHtml, duplicatesHtml]
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

    // --- Herramientas de búsqueda/edición avanzadas ---
    function setupAdvancedTools() {
        const reviewSearchBtn = document.getElementById('dev-review-search-btn');
        if (reviewSearchBtn) reviewSearchBtn.addEventListener('click', handleReviewSearch);
        const reviewClearBtn = document.getElementById('dev-review-clear-btn');
        if (reviewClearBtn) reviewClearBtn.addEventListener('click', resetReviewForm);
        const reviewSaveBtn = document.getElementById('dev-review-save-btn');
        if (reviewSaveBtn) reviewSaveBtn.addEventListener('click', saveReviewEdits);
        document.querySelectorAll('#dev-review-modal [data-close-modal]').forEach(el => {
            el.addEventListener('click', () => hideModal('dev-review-modal'));
        });

        const groupSearchBtn = document.getElementById('dev-group-search-btn');
        if (groupSearchBtn) groupSearchBtn.addEventListener('click', handleGroupSearch);
        const groupClearBtn = document.getElementById('dev-group-clear-btn');
        if (groupClearBtn) groupClearBtn.addEventListener('click', () => {
            ['dev-group-filter-list', 'dev-group-filter-place', 'dev-group-filter-item'].forEach(id => setInputValue(id, ''));
            const resultsEl = document.getElementById('dev-group-results');
            if (resultsEl) resultsEl.innerHTML = '';
            setElementVisible('dev-group-editor', false);
            advancedState.groupResults = [];
            advancedState.selectedGroup = null;
        });
        const groupApplyBtn = document.getElementById('dev-group-apply-btn');
        if (groupApplyBtn) groupApplyBtn.addEventListener('click', applyGroupEdits);
        const groupCancelBtn = document.getElementById('dev-group-cancel-btn');
        if (groupCancelBtn) groupCancelBtn.addEventListener('click', () => setElementVisible('dev-group-editor', false));

        const placeSearchBtn = document.getElementById('dev-place-search-btn');
        if (placeSearchBtn) placeSearchBtn.addEventListener('click', handlePlaceSearch);
        const placeClearBtn = document.getElementById('dev-place-clear-btn');
        if (placeClearBtn) placeClearBtn.addEventListener('click', resetPlaceForms);
        const placeSaveBtn = document.getElementById('dev-place-save-btn');
        if (placeSaveBtn) placeSaveBtn.addEventListener('click', savePlaceEdits);
        const placeCancelBtn = document.getElementById('dev-place-cancel-btn');
        if (placeCancelBtn) placeCancelBtn.addEventListener('click', () => setElementVisible('dev-place-editor', false));

        const listSearchBtn = document.getElementById('dev-list-search-btn');
        if (listSearchBtn) listSearchBtn.addEventListener('click', handleListSearch);
        const listClearBtn = document.getElementById('dev-list-clear-btn');
        if (listClearBtn) listClearBtn.addEventListener('click', resetListForms);
        const listSaveBtn = document.getElementById('dev-list-save-btn');
        if (listSaveBtn) listSaveBtn.addEventListener('click', saveListEdits);
        const listCancelBtn = document.getElementById('dev-list-cancel-btn');
        if (listCancelBtn) listCancelBtn.addEventListener('click', () => setElementVisible('dev-list-editor', false));
    }

    // --- Reseñas ---
    async function handleReviewSearch(event) {
        event?.preventDefault?.();
        const filters = {
            reviewId: getInputValue('dev-review-filter-id'),
            userId: getInputValue('dev-review-filter-user'),
            placeId: getInputValue('dev-review-filter-place'),
            itemName: getInputValue('dev-review-filter-item'),
            listId: getInputValue('dev-review-filter-list'),
            fromDate: getInputValue('dev-review-filter-from'),
            toDate: getInputValue('dev-review-filter-to')
        };
        const limit = parseInt(getInputValue('dev-review-limit'), 10) || 50;
        const container = document.getElementById('dev-review-results');
        const btn = document.getElementById('dev-review-search-btn');
        if (!container) return;

        if (!filters.reviewId && !filters.userId && !filters.placeId && !filters.itemName && !filters.listId) {
            container.innerHTML = '<p>Introduce al menos un filtro.</p>';
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        }
        container.innerHTML = '<p><code>Buscando reseñas...</code></p>';

        try {
            const { results, warnings } = await searchReviews(filters, limit);
            advancedState.reviewResults = results;
            renderReviewResults(results, warnings);
        } catch (error) {
            console.error('DEV: error buscando reseñas', error);
            container.innerHTML = `<p style="color:var(--danger-color);">${escapeHtml(error?.message || 'No se pudieron obtener reseñas.')}</p>`;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i> Buscar reseñas';
            }
        }
    }

    async function searchReviews(filters, limit = 50) {
        let query = db.collectionGroup('reviews');
        const warnings = [];
        const normalizedItem = (filters.itemName || '').toLowerCase();
        let appliedItemFilter = false;
        const { fromMs, toMs } = parseDateRange(filters.fromDate, filters.toDate);

        try {
            if (filters.reviewId) query = query.where(firebase.firestore.FieldPath.documentId(), '==', filters.reviewId);
            if (filters.userId) query = query.where('userId', '==', filters.userId);
            if (filters.placeId) query = query.where('placeId', '==', filters.placeId);
            if (filters.listId) query = query.where('listId', '==', filters.listId);
            if (filters.itemName) {
                query = query.where('itemNameLower', '==', normalizedItem);
                appliedItemFilter = true;
            }
            query = query.limit(limit);
            const snapshot = await query.get();
            let rows = snapshot.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
            if (fromMs || toMs) {
                rows = rows.filter(r => {
                    const ts = getTimestampMs(r.data?.createdAt) || getTimestampMs(r.data?.updatedAt);
                    if (fromMs && ts < fromMs) return false;
                    if (toMs && ts > toMs) return false;
                    return true;
                });
            }
            if (filters.itemName && !appliedItemFilter) {
                rows = rows.filter(r => (r.data?.itemName || '').toLowerCase().includes(normalizedItem));
            }
            rows.sort((a, b) => {
                const ta = getTimestampMs(a.data?.createdAt) || getTimestampMs(a.data?.updatedAt) || 0;
                const tb = getTimestampMs(b.data?.createdAt) || getTimestampMs(b.data?.updatedAt) || 0;
                return tb - ta;
            });
            return { results: rows, warnings };
        } catch (error) {
            if (filters.itemName && error?.code === 'failed-precondition') {
                warnings.push('No hay índice para itemNameLower, se filtra en cliente.');
                let fallback = db.collectionGroup('reviews');
                if (filters.reviewId) fallback = fallback.where(firebase.firestore.FieldPath.documentId(), '==', filters.reviewId);
                if (filters.userId) fallback = fallback.where('userId', '==', filters.userId);
                if (filters.placeId) fallback = fallback.where('placeId', '==', filters.placeId);
                if (filters.listId) fallback = fallback.where('listId', '==', filters.listId);
                fallback = fallback.limit(limit);
                const snap = await fallback.get();
                let rows = snap.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
                if (fromMs || toMs) {
                    rows = rows.filter(r => {
                        const ts = getTimestampMs(r.data?.createdAt) || getTimestampMs(r.data?.updatedAt);
                        if (fromMs && ts < fromMs) return false;
                        if (toMs && ts > toMs) return false;
                        return true;
                    });
                }
                rows = rows.filter(r => (r.data?.itemName || '').toLowerCase().includes(normalizedItem));
                rows.sort((a, b) => {
                    const ta = getTimestampMs(a.data?.createdAt) || getTimestampMs(a.data?.updatedAt) || 0;
                    const tb = getTimestampMs(b.data?.createdAt) || getTimestampMs(b.data?.updatedAt) || 0;
                    return tb - ta;
                });
                return { results: rows, warnings };
            }
            throw error;
        }
    }

    function renderReviewResults(results, warnings = []) {
        const container = document.getElementById('dev-review-results');
        if (!container) return;
        const warningHtml = (warnings || []).map(w => `<p class="dev-helper-text">${escapeHtml(w)}</p>`).join('');
        if (!results || results.length === 0) {
            container.innerHTML = `${warningHtml}<p>No se encontraron reseñas con los filtros actuales.</p>`;
            return;
        }
        const rowsHtml = results.map((row, index) => {
            const data = row.data || {};
            const place = data.establishmentName || data.placeName || data.placeId || '(sin lugar)';
            const item = data.itemName || '(sin elemento)';
            const created = formatDateTime(data.createdAt || data.updatedAt);
            const rating = typeof data.overallRating === 'number' ? data.overallRating.toFixed(1) : '';
            return `<button class="dev-result-card" data-review-index="${index}" aria-label="Editar reseña ${escapeHtml(item)}">
                <div class="dev-result-meta">
                    <span class="dev-result-title">${escapeHtml(place)}</span>
                    <span class="dev-result-sub">${escapeHtml(item)}</span>
                    <span class="dev-result-sub">Creada: ${escapeHtml(created || 's/f')}</span>
                </div>
                <div class="dev-result-meta" style="text-align:right;">
                    <span class="dev-result-sub">ID: ${escapeHtml(row.id || '')}</span>
                    <span class="dev-result-sub">Score: ${escapeHtml(rating)}</span>
                </div>
            </button>`;
        }).join('');
        container.innerHTML = `${warningHtml}<div class="dev-result-list">${rowsHtml}</div>`;
        container.querySelectorAll('[data-review-index]').forEach(btn => {
            btn.addEventListener('click', () => openReviewEditor(Number(btn.dataset.reviewIndex)));
        });
    }

    function openReviewEditor(index) {
        const entry = advancedState.reviewResults[index];
        if (!entry) return;
        advancedState.selectedReview = { ...entry, index };
        const data = entry.data || {};
        setInputValue('dev-review-edit-id', entry.id || '');
        setInputValue('dev-review-edit-list', data.listId || '');
        setInputValue('dev-review-edit-user', data.userId || data.authorId || data.ownerId || '');
        setInputValue('dev-review-edit-place', data.placeId || '');
        setInputValue('dev-review-edit-item', data.itemName || '');
        setInputValue('dev-review-edit-establishment', data.establishmentName || data.placeName || '');
        setInputValue('dev-review-edit-created', formatDateForInput(data.createdAt || data.updatedAt));
        setInputValue('dev-review-edit-json', serializeDataForTextarea(data));
        showModal('dev-review-modal');
    }

    function resetReviewForm() {
        ['dev-review-filter-id', 'dev-review-filter-user', 'dev-review-filter-place', 'dev-review-filter-item', 'dev-review-filter-list'].forEach(id => setInputValue(id, ''));
        const container = document.getElementById('dev-review-results');
        if (container) container.innerHTML = '';
        hideModal('dev-review-modal');
        advancedState.reviewResults = [];
        advancedState.selectedReview = null;
    }

    async function saveReviewEdits() {
        const entry = advancedState.selectedReview;
        if (!entry || !entry.ref) {
            notify('Selecciona una reseña primero.', 'warning');
            return;
        }
        const updates = {};
        const userId = getInputValue('dev-review-edit-user');
        const listId = getInputValue('dev-review-edit-list');
        const placeId = getInputValue('dev-review-edit-place');
        const itemName = getInputValue('dev-review-edit-item');
        const establishment = getInputValue('dev-review-edit-establishment');
        const createdDateStr = getInputValue('dev-review-edit-created');
        const rawJson = getInputValue('dev-review-edit-json');
        let extraUpdates = {};

        if (userId) {
            ['userId', 'authorId', 'ownerId', 'authorUid', 'creatorId'].forEach(key => updates[key] = userId);
        }
        if (listId) {
            ['listId', 'parentListId'].forEach(key => updates[key] = listId);
        }
        if (placeId) updates.placeId = placeId;
        if (itemName) {
            updates.itemName = itemName;
            updates.itemNameLower = itemName.toLowerCase();
        }
        if (establishment) {
            updates.establishmentName = establishment;
            updates.placeName = establishment;
        }
        if (createdDateStr) {
            const parsed = Date.parse(createdDateStr);
            if (Number.isFinite(parsed)) {
                updates.createdAt = firebase.firestore.Timestamp.fromDate(new Date(parsed));
            } else {
                notify('Fecha de creación inválida.', 'error');
                return;
            }
        }
        if (rawJson) {
            try {
                extraUpdates = parseJsonInput(rawJson);
            } catch (error) {
                notify(error.message, 'error');
                return;
            }
        }
        const finalUpdates = { ...extraUpdates, ...updates };
        if (Object.keys(finalUpdates).length === 0) {
            notify('No hay cambios para guardar.', 'warning');
            return;
        }
        const btn = document.getElementById('dev-review-save-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        }
        try {
            await entry.ref.set(finalUpdates, { merge: true });
            notify('Reseña actualizada.', 'success');
            advancedState.reviewResults[entry.index].data = { ...(entry.data || {}), ...finalUpdates };
            renderReviewResults(advancedState.reviewResults);
            hideModal('dev-review-modal');
        } catch (error) {
            console.error('DEV: error actualizando reseña', error);
            notify('Error al actualizar reseña: ' + (error?.message || ''), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
            }
        }
    }

    // --- Grupos (agrupaciones de reseñas) ---
    async function handleGroupSearch(event) {
        event?.preventDefault?.();
        const listId = getInputValue('dev-group-filter-list');
        const placeId = getInputValue('dev-group-filter-place');
        const itemName = getInputValue('dev-group-filter-item');
        const container = document.getElementById('dev-group-results');
        const btn = document.getElementById('dev-group-search-btn');
        if (!container) return;
        if (!listId) {
            container.innerHTML = '<p>Introduce un listId para buscar grupos.</p>';
            return;
        }
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        }
        container.innerHTML = '<p><code>Consultando función groupedReviews...</code></p>';
        try {
            const groups = await fetchGroupedItems(listId);
            let filtered = Array.isArray(groups) ? groups : [];
            if (placeId) filtered = filtered.filter(g => (g.placeId || '') === placeId);
            if (itemName) {
                const lower = itemName.toLowerCase();
                filtered = filtered.filter(g => (g.itemName || '').toLowerCase().includes(lower));
            }
            filtered = filtered.map(g => ({ ...g, listId }));
            advancedState.groupResults = filtered;
            renderGroupResults(filtered);
        } catch (error) {
            console.error('DEV: error buscando grupos', error);
            container.innerHTML = `<p style="color:var(--danger-color);">${escapeHtml(error?.message || 'No se pudieron obtener los grupos.')}</p>`;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i> Buscar grupos';
            }
        }
    }

    async function fetchGroupedItems(listId) {
        const functionUrl = ListopicApp?.config?.FUNCTION_URLS?.groupedReviews;
        if (!functionUrl) {
            throw new Error('URL de groupedReviews no configurada.');
        }
        const headers = { 'Accept': 'application/json' };
        const currentUser = auth.currentUser;
        if (currentUser) {
            try {
                const token = await currentUser.getIdToken(true);
                headers['Authorization'] = `Bearer ${token}`;
            } catch (e) {
                console.warn('DEV grouped fetch: no se pudo obtener token, se intenta anónimo.');
            }
        }
        const res = await fetch(`${functionUrl}?listId=${encodeURIComponent(listId)}`, { headers });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Error HTTP ${res.status}`);
        }
        const json = await res.json();
        return Array.isArray(json?.groupedReviews) ? json.groupedReviews : [];
    }

    function renderGroupResults(groups) {
        const container = document.getElementById('dev-group-results');
        if (!container) return;
        if (!groups || groups.length === 0) {
            container.innerHTML = '<p>No se encontraron grupos con los filtros.</p>';
            return;
        }
        const rows = groups.map((group, index) => {
            const count = group.itemCount ?? group.reviewCount ?? group.count ?? 0;
            const score = typeof group.avgGeneralScore === 'number' ? group.avgGeneralScore.toFixed(1) : '';
            return `<tr>
                <td>${escapeHtml(group.itemName || '')}</td>
                <td>${escapeHtml(group.establishmentName || group.placeName || '')}</td>
                <td>${escapeHtml(group.placeId || '')}</td>
                <td>${escapeHtml(String(count))}</td>
                <td>${escapeHtml(score)}</td>
                <td>
                    <button class="button secondary-button" data-group-index="${index}"><i class="fas fa-pen"></i> Editar</button>
                    <button class="button secondary-button" data-group-review-index="${index}"><i class="fas fa-share"></i> Cargar reseñas</button>
                </td>
            </tr>`;
        }).join('');
        container.innerHTML = `<div class="dev-mini-table"><table><thead><tr><th>Elemento</th><th>Lugar</th><th>placeId</th><th>Reseñas</th><th>Score</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
        container.querySelectorAll('[data-group-index]').forEach(btn => {
            btn.addEventListener('click', () => openGroupEditor(Number(btn.dataset.groupIndex)));
        });
        container.querySelectorAll('[data-group-review-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.groupReviewIndex);
                const group = advancedState.groupResults[idx];
                if (group) {
                    prefillReviewFiltersFromGroup(group);
                    handleReviewSearch();
                }
            });
        });
    }

    function openGroupEditor(index) {
        const group = advancedState.groupResults[index];
        if (!group) return;
        advancedState.selectedGroup = { ...group, index };
        const infoEl = document.getElementById('dev-group-selected');
        const count = group.itemCount ?? group.reviewCount ?? group.count ?? 0;
        if (infoEl) {
            infoEl.textContent = `${group.itemName || '(sin item)'} • ${group.establishmentName || group.placeName || 'lugar'} (${count} reseñas)`;
        }
        setInputValue('dev-group-edit-item', group.itemName || '');
        setInputValue('dev-group-edit-place', group.placeId || '');
        setInputValue('dev-group-edit-list', group.listId || '');
        setInputValue('dev-group-edit-user', '');
        setElementVisible('dev-group-editor', true);
    }

    async function applyGroupEdits() {
        const selected = advancedState.selectedGroup;
        if (!selected) {
            notify('Primero selecciona un grupo.', 'warning');
            return;
        }
        const payload = {};
        const newItem = getInputValue('dev-group-edit-item');
        const newPlace = getInputValue('dev-group-edit-place');
        const newList = getInputValue('dev-group-edit-list');
        const newUser = getInputValue('dev-group-edit-user');

        if (newItem) {
            payload.itemName = newItem;
            payload.itemNameLower = newItem.toLowerCase();
        }
        if (newPlace) payload.placeId = newPlace;
        if (newList) payload.listId = newList;
        if (newUser) {
            ['userId', 'authorId', 'ownerId', 'authorUid', 'creatorId'].forEach(key => payload[key] = newUser);
        }
        if (Object.keys(payload).length === 0) {
            notify('Añade al menos un campo a actualizar.', 'warning');
            return;
        }
        const btn = document.getElementById('dev-group-apply-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        }
        try {
            let query = db.collectionGroup('reviews').where('listId', '==', selected.listId);
            if (selected.placeId) query = query.where('placeId', '==', selected.placeId);
            if (selected.itemName) query = query.where('itemName', '==', selected.itemName);
            const snap = await query.get();
            const docs = snap.docs || [];
            if (!docs.length) {
                notify('No se encontraron reseñas con esa combinación.', 'warning');
                return;
            }
            await batchSetDocuments(docs, payload);
            notify(`Reseñas actualizadas: ${docs.length}`, 'success');
        } catch (error) {
            console.error('DEV: error actualizando grupo', error);
            notify('Error al actualizar reseñas del grupo: ' + (error?.message || ''), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-share-square"></i> Actualizar reseñas';
            }
        }
    }

    function prefillReviewFiltersFromGroup(group) {
        setInputValue('dev-review-filter-item', group.itemName || '');
        setInputValue('dev-review-filter-place', group.placeId || '');
        setInputValue('dev-review-filter-list', group.listId || '');
    }

    async function batchSetDocuments(docs, payload) {
        const chunkSize = 400;
        for (let i = 0; i < docs.length; i += chunkSize) {
            const slice = docs.slice(i, i + chunkSize);
            const batch = db.batch();
            slice.forEach(doc => batch.set(doc.ref, payload, { merge: true }));
            await batch.commit();
        }
    }

    // --- Lugares ---
    async function handlePlaceSearch(event) {
        event?.preventDefault?.();
        const filters = {
            placeId: getInputValue('dev-place-filter-id'),
            googlePlaceId: getInputValue('dev-place-filter-google'),
            userId: getInputValue('dev-place-filter-user'),
            name: getInputValue('dev-place-filter-name')
        };
        const container = document.getElementById('dev-place-results');
        const btn = document.getElementById('dev-place-search-btn');
        if (!container) return;
        if (!filters.placeId && !filters.googlePlaceId && !filters.userId && !filters.name) {
            container.innerHTML = '<p>Introduce al menos un filtro.</p>';
            return;
        }
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        }
        container.innerHTML = '<p><code>Buscando lugares...</code></p>';
        try {
            let results = [];
            if (filters.placeId) {
                const doc = await db.collection('places').doc(filters.placeId).get();
                if (doc.exists) results.push({ id: doc.id, ref: doc.ref, data: doc.data() });
            } else {
                let query = db.collection('places');
                if (filters.googlePlaceId) query = query.where('googlePlaceId', '==', filters.googlePlaceId);
                if (filters.userId) query = query.where('userId', '==', filters.userId);
                query = query.limit(50);
                const snap = await query.get();
                results = snap.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
                if (filters.name) {
                    const lower = filters.name.toLowerCase();
                    results = results.filter(r => (r.data?.name || '').toLowerCase().includes(lower));
                }
            }
            advancedState.placeResults = results;
            renderPlaceResults(results);
        } catch (error) {
            console.error('DEV: error buscando lugares', error);
            container.innerHTML = `<p style="color:var(--danger-color);">${escapeHtml(error?.message || 'No se pudieron obtener lugares.')}</p>`;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i> Buscar lugares';
            }
        }
    }

    function renderPlaceResults(results) {
        const container = document.getElementById('dev-place-results');
        if (!container) return;
        if (!results || results.length === 0) {
            container.innerHTML = '<p>No se encontraron lugares.</p>';
            return;
        }
        const rows = results.map((row, index) => {
            const data = row.data || {};
            return `<tr>
                <td>${escapeHtml(row.id || '')}</td>
                <td>${escapeHtml(data.name || '')}</td>
                <td>${escapeHtml(data.googlePlaceId || '')}</td>
                <td>${escapeHtml(data.userId || '')}</td>
                <td>${escapeHtml(String(data.reviewsCount ?? ''))}</td>
                <td><button class="button secondary-button" data-place-index="${index}"><i class="fas fa-pen"></i> Editar</button></td>
            </tr>`;
        }).join('');
        container.innerHTML = `<div class="dev-mini-table"><table><thead><tr><th>ID</th><th>Nombre</th><th>Google ID</th><th>Propietario</th><th>Reseñas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
        container.querySelectorAll('[data-place-index]').forEach(btn => {
            btn.addEventListener('click', () => openPlaceEditor(Number(btn.dataset.placeIndex)));
        });
    }

    function openPlaceEditor(index) {
        const entry = advancedState.placeResults[index];
        if (!entry) return;
        advancedState.selectedPlace = { ...entry, index };
        const data = entry.data || {};
        setInputValue('dev-place-edit-id', entry.id || '');
        setInputValue('dev-place-edit-name', data.name || '');
        setInputValue('dev-place-edit-google', data.googlePlaceId || '');
        setInputValue('dev-place-edit-user', data.userId || '');
        setInputValue('dev-place-edit-json', serializeDataForTextarea(data));
        setElementVisible('dev-place-editor', true);
    }

    async function savePlaceEdits() {
        const entry = advancedState.selectedPlace;
        if (!entry || !entry.ref) {
            notify('Selecciona un lugar primero.', 'warning');
            return;
        }
        const updates = {};
        const name = getInputValue('dev-place-edit-name');
        const googlePlaceId = getInputValue('dev-place-edit-google');
        const userId = getInputValue('dev-place-edit-user');
        const rawJson = getInputValue('dev-place-edit-json');
        let extraUpdates = {};

        if (name) updates.name = name;
        if (googlePlaceId) updates.googlePlaceId = googlePlaceId;
        if (userId) updates.userId = userId;
        if (rawJson) {
            try {
                extraUpdates = parseJsonInput(rawJson);
            } catch (error) {
                notify(error.message, 'error');
                return;
            }
        }
        const finalUpdates = { ...extraUpdates, ...updates };
        if (Object.keys(finalUpdates).length === 0) {
            notify('No hay cambios para guardar.', 'warning');
            return;
        }
        const btn = document.getElementById('dev-place-save-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        }
        try {
            await entry.ref.set(finalUpdates, { merge: true });
            notify('Lugar actualizado.', 'success');
            advancedState.placeResults[entry.index].data = { ...(entry.data || {}), ...finalUpdates };
            renderPlaceResults(advancedState.placeResults);
            setElementVisible('dev-place-editor', false);
        } catch (error) {
            console.error('DEV: error actualizando lugar', error);
            notify('Error al actualizar lugar: ' + (error?.message || ''), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
            }
        }
    }

    function resetPlaceForms() {
        ['dev-place-filter-id', 'dev-place-filter-google', 'dev-place-filter-user', 'dev-place-filter-name'].forEach(id => setInputValue(id, ''));
        const container = document.getElementById('dev-place-results');
        if (container) container.innerHTML = '';
        setElementVisible('dev-place-editor', false);
        advancedState.placeResults = [];
        advancedState.selectedPlace = null;
    }

    // --- Listas ---
    async function handleListSearch(event) {
        event?.preventDefault?.();
        const filters = {
            listId: getInputValue('dev-list-filter-id'),
            userId: getInputValue('dev-list-filter-user'),
            name: getInputValue('dev-list-filter-name')
        };
        const container = document.getElementById('dev-list-results');
        const btn = document.getElementById('dev-list-search-btn');
        if (!container) return;
        if (!filters.listId && !filters.userId && !filters.name) {
            container.innerHTML = '<p>Introduce al menos un filtro.</p>';
            return;
        }
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        }
        container.innerHTML = '<p><code>Buscando listas...</code></p>';
        try {
            let results = [];
            if (filters.listId) {
                const doc = await db.collection('lists').doc(filters.listId).get();
                if (doc.exists) results.push({ id: doc.id, ref: doc.ref, data: doc.data() });
            } else {
                let query = db.collection('lists');
                if (filters.userId) query = query.where('userId', '==', filters.userId);
                query = query.limit(50);
                const snap = await query.get();
                results = snap.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
                if (filters.name) {
                    const lower = filters.name.toLowerCase();
                    results = results.filter(r => (r.data?.name || '').toLowerCase().includes(lower));
                }
            }
            advancedState.listResults = results;
            renderListResults(results);
        } catch (error) {
            console.error('DEV: error buscando listas', error);
            container.innerHTML = `<p style="color:var(--danger-color);">${escapeHtml(error?.message || 'No se pudieron obtener listas.')}</p>`;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i> Buscar listas';
            }
        }
    }

    function renderListResults(results) {
        const container = document.getElementById('dev-list-results');
        if (!container) return;
        if (!results || results.length === 0) {
            container.innerHTML = '<p>No se encontraron listas.</p>';
            return;
        }
        const rows = results.map((row, index) => {
            const data = row.data || {};
            const category = data.categoryId || data.category || '';
            return `<tr>
                <td>${escapeHtml(row.id || '')}</td>
                <td>${escapeHtml(data.name || '')}</td>
                <td>${escapeHtml(data.userId || '')}</td>
                <td>${escapeHtml(category)}</td>
                <td>${escapeHtml(String(data.reviewCount ?? data.reviewsCount ?? ''))}</td>
                <td><button class="button secondary-button" data-list-index="${index}"><i class="fas fa-pen"></i> Editar</button></td>
            </tr>`;
        }).join('');
        container.innerHTML = `<div class="dev-mini-table"><table><thead><tr><th>ID</th><th>Nombre</th><th>Propietario</th><th>Categoría</th><th>Reseñas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
        container.querySelectorAll('[data-list-index]').forEach(btn => {
            btn.addEventListener('click', () => openListEditor(Number(btn.dataset.listIndex)));
        });
    }

    function openListEditor(index) {
        const entry = advancedState.listResults[index];
        if (!entry) return;
        advancedState.selectedList = { ...entry, index };
        const data = entry.data || {};
        setInputValue('dev-list-edit-id', entry.id || '');
        setInputValue('dev-list-edit-name', data.name || '');
        setInputValue('dev-list-edit-user', data.userId || '');
        setInputValue('dev-list-edit-category', data.categoryId || data.category || '');
        setInputValue('dev-list-edit-json', serializeDataForTextarea(data));
        setElementVisible('dev-list-editor', true);
    }

    async function saveListEdits() {
        const entry = advancedState.selectedList;
        if (!entry || !entry.ref) {
            notify('Selecciona una lista primero.', 'warning');
            return;
        }
        const updates = {};
        const name = getInputValue('dev-list-edit-name');
        const userId = getInputValue('dev-list-edit-user');
        const categoryId = getInputValue('dev-list-edit-category');
        const rawJson = getInputValue('dev-list-edit-json');
        let extraUpdates = {};

        if (name) updates.name = name;
        if (userId) updates.userId = userId;
        if (categoryId) updates.categoryId = categoryId;
        if (rawJson) {
            try {
                extraUpdates = parseJsonInput(rawJson);
            } catch (error) {
                notify(error.message, 'error');
                return;
            }
        }
        const finalUpdates = { ...extraUpdates, ...updates };
        if (Object.keys(finalUpdates).length === 0) {
            notify('No hay cambios para guardar.', 'warning');
            return;
        }
        const btn = document.getElementById('dev-list-save-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        }
        try {
            await entry.ref.set(finalUpdates, { merge: true });
            notify('Lista actualizada.', 'success');
            advancedState.listResults[entry.index].data = { ...(entry.data || {}), ...finalUpdates };
            renderListResults(advancedState.listResults);
            setElementVisible('dev-list-editor', false);
        } catch (error) {
            console.error('DEV: error actualizando lista', error);
            notify('Error al actualizar lista: ' + (error?.message || ''), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
            }
        }
    }

    function resetListForms() {
        ['dev-list-filter-id', 'dev-list-filter-user', 'dev-list-filter-name'].forEach(id => setInputValue(id, ''));
        const container = document.getElementById('dev-list-results');
        if (container) container.innerHTML = '';
        setElementVisible('dev-list-editor', false);
        advancedState.listResults = [];
        advancedState.selectedList = null;
    }

    // --- Fin de utilidades existentes ---

    return { init, setupMainTabs, initCategoriesAdminUI };
})();
