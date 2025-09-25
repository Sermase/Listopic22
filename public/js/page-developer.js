window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDeveloper = (() => {
    const db = ListopicApp.services.db;
    const auth = ListopicApp.services.auth;
    const functionsService = ListopicApp.services.functions;
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
                setupActionButtons(); // <-- Se llama aquÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ para que los botones existan desde el principio
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

    function showAccessDenied(message = 'No tienes permiso para ver esta pÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡gina.') {
        const devContainer = document.querySelector('.dev-container');
        if (devContainer) {
            devContainer.innerHTML = `
                <div style="text-align: center; padding-top: 50px;">
                    <i class="fas fa-user-lock" style="font-size: 4rem; color: var(--danger-color);"></i>
                    <h1 style="margin-top: 20px;">Acceso Denegado</h1>
                    <p style="font-size: 1.2rem; color: var(--secondary-text-color);">${message}</p>
                    <a href="Index.html" class="button-primary" style="margin-top: 20px;">Volver al inicio</a>
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
    
    // --- LÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³gica de los Botones de AcciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n ---
    function setupActionButtons() {
        // BotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de exportar
        const exportBtn = document.getElementById('export-csv-btn');
        if (exportBtn) exportBtn.addEventListener('click', exportSelectedToCsv);

        // BotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de actualizar todos los lugares
        const updateAllPlacesBtn = document.getElementById('update-all-places-btn');
        if (updateAllPlacesBtn) updateAllPlacesBtn.addEventListener('click', handleUpdateAllPlaces);

        // NUEVO: BotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de actualizar seleccionados
        const updateBtn = document.getElementById('update-selected-btn');
        if (updateBtn) updateBtn.addEventListener('click', updateSelectedPlaces);

        // NUEVO: BotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n actualizar listas seleccionadas
        const updateListsBtn = document.getElementById('update-selected-lists-btn');
        if (updateListsBtn) updateListsBtn.addEventListener('click', updateSelectedLists);

        attachAlgoliaButton("algolia-sync-all-btn", null);
        attachAlgoliaButton("algolia-sync-lists-btn", "lists");
        attachAlgoliaButton("algolia-sync-users-btn", "users");
        attachAlgoliaButton("algolia-sync-places-btn", "places");
        // NUEVO: BotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de eliminar seleccionados
        const deleteBtn = document.getElementById('delete-selected-btn');
        if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedItems);
    }

    function attachAlgoliaButton(buttonId, collectionName) {
        const button = document.getElementById(buttonId);
        if (!button) {
            return;
        }
        button.addEventListener("click", async () => {
            const originalHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Sincronizando...";
            try {
                await backfillAlgolia(collectionName || null);
            } catch (error) {
                console.error("DEV: Error al sincronizar Algolia", error);
            } finally {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        });
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
            // El botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de exportar ahora exportarÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ lo seleccionado, o todo si no hay nada seleccionado
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

    // --- Funciones para los Botones de AcciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n ---

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
        if (!confirm('ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿EstÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡s seguro de que quieres actualizar TODOS los lugares? Esta operaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n puede tardar y consumir cuota de la API de Google.')) return;
        const btn = document.getElementById('update-all-places-btn');
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        btn.disabled = true;

        try {
            const adminUpdateAllPlaces = firebase.app().functions('europe-west1').httpsCallable('adminUpdateAllPlaces');
            const result = await adminUpdateAllPlaces();
            const { updated, skipped, errors } = result.data;
            alert(`ActualizaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n completada.\n\nActualizados: ${updated}\nOmitidos: ${skipped}\nErrores: ${errors}`);
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
        if (!confirm(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿EstÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡s seguro de que quieres actualizar ${selectedRowIds.size} lugar(es) seleccionados?`)) return;

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
        
        alert(`OperaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n completada.\n\nActualizados: ${successCount}\nErrores: ${errorCount}`);
        btn.disabled = false;
        btn.innerHTML = 'Actualizar SelecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n';
        switchTab(currentCollectionName); // Recargar la vista
    }


    // NUEVA: Borrado suave de elementos seleccionados
    async function deleteSelectedItems() {
        if (selectedRowIds.size === 0) return;
        if (!confirm(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿EstÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡s seguro de que quieres eliminar ${selectedRowIds.size} elemento(s)? SerÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡n movidos a una papelera temporal.`)) return;

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
            alert(`OcurriÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ un error: ${error.message}`);
        } finally {
            btn.innerHTML = 'Eliminar SelecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n';
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
        selectedRowIds.clear(); // Limpiar selecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n al cambiar de pestaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±a
        updateActionButtonsState(); // Actualizar estado de botones

        try {
            const snapshot = await db.collection(collectionName).limit(100).get();
            currentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (currentData.length === 0) {
                contentContainer.innerHTML = `<p>No se encontraron documentos en la colecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n "${collectionName}".</p>`;
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
        
        // AÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±adimos la columna de selecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n al principio
        const tableHeaders = [
            `<th><input type="checkbox" id="select-all-checkbox" title="Seleccionar todo"></th>`,
            ...headers.map(key => {
                const sortClass = sortState[key] ? `sort-${sortState[key]}` : '';
                const icon = sortState[key] === 'asc' ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²' : sortState[key] === 'desc' ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼' : '';
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
        // Listeners de ordenaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
        container.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                const newSort = sortState[key] === 'asc' ? 'desc' : 'asc';
                sortState = { [key]: newSort };
                sortData(key, newSort);
                renderTable(currentData, container);
            });
        });

        // Listeners de selecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
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

    // --- NUEVA FUNCIÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œN PARA ALGOLIA ---
    async function backfillAlgolia(collectionName = null) {
        const logContainer = document.getElementById('algolia-sync-log');
        if (!logContainer) return;
        
        logContainer.innerHTML = '<p><code>Solicitando sincronizaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n para Algolia...</code></p>';

        try {
            const backfill = (functionsService || firebase.app().functions('europe-west1')).httpsCallable('algolia-adminBackfillAlgolia');
            const collections = collectionName ? [collectionName] : ['lists', 'users', 'places'];
            
            for (const collection of collections) {
                logContainer.innerHTML += `<p><code>ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ Sincronizando '${collection}'...</code></p>`;
                try {
                    const result = await backfill({ collectionName: collection });
                    logContainer.innerHTML += `<p style="color: var(--accent-color-tertiary);"><code>ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ ${collection}: ${result.data.message}</code></p>`;
                } catch (error) {
                    logContainer.innerHTML += `<p style="color: var(--danger-color);"><code>ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ Error en '${collection}': ${error.message}</code></p>`;
                }
            }
            logContainer.innerHTML += '<p><code>Proceso de sincronizaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n completado.</code></p>';
        } catch (error) {
            logContainer.innerHTML += `<p style="color: var(--danger-color);"><code>ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ Error general al llamar la funciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n: ${error.message}</code></p>`;
        }
    }

    // --- PestaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±a principal: conmutaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n ---
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
        if (!confirm(`ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿Actualizar agregados de ${selectedRowIds.size} lista(s)?`)) return;
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

    // --- Admin de categorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as ---
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
            // Traer todas las categorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as (aunque no tengan 'order') y ordenar en cliente
            const snap = await db.collection('categories').get();
            const docsSorted = snap.docs.slice().sort((a,b) => {
                const ao = (typeof a.data().order === 'number') ? a.data().order : Number.POSITIVE_INFINITY;
                const bo = (typeof b.data().order === 'number') ? b.data().order : Number.POSITIVE_INFINITY;
                return ao - bo;
            });
            const options = ['<option value="" disabled selected>Selecciona categorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a...</option>']
                .concat(docsSorted.map(d => {
                    const data = d.data();
                    return `<option value="${d.id}">${escapeHtml(data.name || d.id)}</option>`;
                }));
            sel.innerHTML = options.join('');
            // SelecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n por defecto tipo "Comida"
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
            // Cargar datos de la preselecciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n
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
                    catch(e) { ListopicApp.services.showNotification('Default Criteria no es JSON vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lido', 'error'); return; }
                }
                const payload = { name, icon, order, like, dislike, 'fixed-tags': fixedTags, defaultCriteria };
                let docId = idInput.value.trim();
                if (!docId) {
                    docId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 64) || 'categoria';
                }
                await db.collection('categories').doc(docId).set(payload, { merge: true });
                idInput.value = docId;
                ListopicApp.services.showNotification('CategorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a guardada', 'success');
                await loadSelect();
                sel.value = docId;
            } catch (e) {
                console.error('DEV: Error guardando categorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a', e);
                ListopicApp.services.showNotification('No se pudo guardar la categorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a: ' + e.message, 'error');
            }
        });

        await loadSelect();
    }

    return { init, setupMainTabs, initCategoriesAdminUI };
})();
