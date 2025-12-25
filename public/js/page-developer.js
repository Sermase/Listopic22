window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDeveloper = (() => {
    const db = ListopicApp.services.db;
    const auth = ListopicApp.services.auth;
    const collectionsToFetch = ['users', 'lists', 'places', 'categories', 'listForums'];

    let currentData = [];
    let viewData = [];
    let currentCollectionName = '';
    let sortState = {};
    let selectedRowIds = new Set(); // <-- Para guardar los IDs de las filas seleccionadas
    let quickFilters = new Set();
    let searchTerm = '';
    const jobCards = new Map();
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
                setupFiltersBar();
                setupModalListeners();
                setupConsoleSearch();
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

    // --- Job cards (progreso de tareas largas) ---
    function upsertJobCard(jobId, title) {
        const container = document.getElementById('dev-job-cards');
        if (!container) return null;
        let card = container.querySelector(`[data-job-id="${jobId}"]`);
        if (!card) {
            card = document.createElement('div');
            card.className = 'dev-job-card';
            card.dataset.jobId = jobId;
            card.innerHTML = `
                <div class="dev-job-meta">
                    <span class="dev-job-title">${escapeHtml(title)}</span>
                    <span class="dev-job-status" data-job-status></span>
                    <div class="dev-progress" aria-hidden="true"><div class="dev-progress-bar" data-job-progress></div></div>
                </div>
                <span class="dev-status-pill warn" data-job-pill>En curso</span>
            `;
            container.prepend(card);
        }
        jobCards.set(jobId, card);
        return card;
    }

    function updateJobCard(jobId, { statusText, progress, tone }) {
        const card = jobCards.get(jobId);
        if (!card) return;
        const statusEl = card.querySelector('[data-job-status]');
        if (statusEl && statusText) statusEl.textContent = statusText;
        const bar = card.querySelector('[data-job-progress]');
        if (bar && typeof progress === 'number') {
            const clamped = Math.max(0, Math.min(100, progress));
            bar.style.width = `${clamped}%`;
        }
        const pill = card.querySelector('[data-job-pill]');
        if (pill && tone) {
            pill.className = `dev-status-pill ${tone}`;
            pill.textContent = tone === 'ok' ? 'Listo' : tone === 'danger' ? 'Error' : 'En curso';
        }
    }

    function finishJobCard(jobId, tone, message) {
        updateJobCard(jobId, { statusText: message, progress: 100, tone: tone });
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

    // --- Filtros y resumen maestro-detalle ---
    function getCollectionFilters(collectionName) {
        switch (collectionName) {
            case 'places':
                return [
                    { id: 'noGoogleId', label: 'Sin googlePlaceId', predicate: (item) => !item.googlePlaceId },
                    { id: 'sinFoto', label: 'Sin foto principal', predicate: (item) => !item.mainImageUrl },
                    { id: 'sinCoords', label: 'Sin coordenadas', predicate: (item) => !(item.location?.latitude && item.location?.longitude) }
                ];
            case 'lists':
                return [
                    { id: 'privadas', label: 'Privadas', predicate: (item) => item.isPublic === false },
                    { id: 'sinCategoria', label: 'Sin categoría', predicate: (item) => !item.categoryId },
                    { id: 'sinResenas', label: 'Sin reseñas', predicate: (item) => !item.reviewCount }
                ];
            case 'users':
                return [
                    { id: 'sinRol', label: 'Sin rol', predicate: (item) => !item.userType || (Array.isArray(item.userType) && item.userType.length === 0) },
                    { id: 'sinNombre', label: 'Sin nombre', predicate: (item) => !item.displayName && !item.username },
                    { id: 'sinFoto', label: 'Sin foto', predicate: (item) => !item.photoUrl }
                ];
            default:
                return [];
        }
    }

    function renderFilterChips() {
        const container = document.getElementById('dev-filter-chips');
        if (!container) return;
        container.innerHTML = '';
        const filters = getCollectionFilters(currentCollectionName);
        filters.forEach(filter => {
            const btn = document.createElement('button');
            btn.className = `dev-chip ${quickFilters.has(filter.id) ? 'active' : ''}`;
            btn.textContent = filter.label;
            btn.dataset.filterId = filter.id;
            btn.addEventListener('click', () => {
                if (quickFilters.has(filter.id)) {
                    quickFilters.delete(filter.id);
                } else {
                    quickFilters.add(filter.id);
                }
                btn.classList.toggle('active', quickFilters.has(filter.id));
                applyFilters();
            });
            container.appendChild(btn);
        });
    }

    function matchesSearch(item) {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return Object.entries(item).some(([key, value]) => {
            if (key === 'id') {
                return String(value || '').toLowerCase().includes(term);
            }
            if (typeof value === 'string') {
                return value.toLowerCase().includes(term);
            }
            if (typeof value === 'number') {
                return String(value).includes(term);
            }
            return false;
        });
    }

    function matchesQuickFilters(item) {
        if (!quickFilters.size) return true;
        const filters = getCollectionFilters(currentCollectionName);
        return Array.from(quickFilters).every(fId => {
            const f = filters.find(x => x.id === fId);
            return f ? f.predicate(item) : true;
        });
    }

    function applyFilters() {
        viewData = (currentData || []).filter(item => matchesSearch(item) && matchesQuickFilters(item));
        renderSummaryCards();
        renderTable(viewData, document.getElementById('dev-content-container'));
        const first = viewData[0] || null;
        renderDetailPanel(first);
        updateActionButtonsState();
    }

    function getCollectionMetrics(collectionName, data) {
        const total = data.length;
        const metrics = [{ label: 'Documentos', value: total }];
        if (collectionName === 'places') {
            metrics.push(
                { label: 'Sin googlePlaceId', value: data.filter(d => !d.googlePlaceId).length, filterId: 'noGoogleId' },
                { label: 'Sin foto principal', value: data.filter(d => !d.mainImageUrl).length, filterId: 'sinFoto' },
                { label: 'Sin coordenadas', value: data.filter(d => !(d.location?.latitude && d.location?.longitude)).length, filterId: 'sinCoords' }
            );
        } else if (collectionName === 'lists') {
            metrics.push(
                { label: 'Privadas', value: data.filter(d => d.isPublic === false).length, filterId: 'privadas' },
                { label: 'Sin categoría', value: data.filter(d => !d.categoryId).length, filterId: 'sinCategoria' },
                { label: 'Sin reseñas', value: data.filter(d => !d.reviewCount).length, filterId: 'sinResenas' }
            );
        } else if (collectionName === 'users') {
            metrics.push(
                { label: 'Sin rol', value: data.filter(d => !d.userType || (Array.isArray(d.userType) && d.userType.length === 0)).length, filterId: 'sinRol' },
                { label: 'Sin nombre', value: data.filter(d => !d.displayName && !d.username).length, filterId: 'sinNombre' },
                { label: 'Sin foto', value: data.filter(d => !d.photoUrl).length, filterId: 'sinFoto' }
            );
        }
        return metrics;
    }

    function renderSummaryCards() {
        const container = document.getElementById('dev-summary-cards');
        if (!container) return;
        const metrics = getCollectionMetrics(currentCollectionName, viewData || currentData || []);
        container.innerHTML = '';
        metrics.forEach(metric => {
            const card = document.createElement('div');
            card.className = 'dev-summary-card';
            card.innerHTML = `
                <span class="dev-summary-title">${escapeHtml(metric.label)}</span>
                <span class="dev-summary-value">${metric.value}</span>
                ${typeof metric.filterId === 'string' ? `<span class="dev-summary-pill">Click para filtrar</span>` : ''}
            `;
            if (metric.filterId) {
                card.addEventListener('click', () => {
                    if (quickFilters.has(metric.filterId)) {
                        quickFilters.delete(metric.filterId);
                    } else {
                        quickFilters.add(metric.filterId);
                    }
                    renderFilterChips();
                    applyFilters();
                });
            }
            container.appendChild(card);
        });
    }

    function setupFiltersBar() {
        const searchInput = document.getElementById('dev-filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchTerm = (e.target.value || '').trim();
                applyFilters();
            });
        }
        renderFilterChips();
    }

    // --- Consola de búsqueda unificada ---
    function setupConsoleSearch() {
        const searchBtn = document.getElementById('dev-console-search-btn');
        const clearBtn = document.getElementById('dev-console-clear-btn');
        const select = document.getElementById('dev-console-collection');
        if (select) {
            select.addEventListener('change', () => {
                updateConsoleFilters(select.value);
            });
        }
        if (searchBtn) searchBtn.addEventListener('click', runConsoleSearch);
        if (clearBtn) clearBtn.addEventListener('click', clearConsoleSearch);
        updateConsoleFilters(select?.value || 'lists');
    }

    function updateConsoleFilters(collection) {
        const config = {
            lists: ['id','user','name','limit'],
            places: ['id','user','name','google','limit'],
            users: ['id','user','name','limit'],
            categories: ['id','name','limit'],
            listForums: ['id','user','name','limit']
        };
        const allowed = new Set(config[collection] || ['id','name','limit']);
        document.querySelectorAll('.dev-console-field').forEach(field => {
            const key = field.dataset.field;
            const visible = allowed.has(key) || key === 'collection';
            field.style.display = visible ? '' : 'none';
        });
    }

    async function runConsoleSearch() {
        const collection = document.getElementById('dev-console-collection')?.value || 'lists';
        const id = getInputValue('dev-console-id');
        const user = getInputValue('dev-console-user');
        const nameContains = getInputValue('dev-console-name');
        const googleId = getInputValue('dev-console-google');
        const limitRaw = parseInt(getInputValue('dev-console-limit'), 10);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 120;

        currentCollectionName = collection;
        document.querySelectorAll('.dev-tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.collection === collection);
        });
        quickFilters.clear();
        searchTerm = nameContains;
        const searchInput = document.getElementById('dev-filter-search');
        if (searchInput) searchInput.value = nameContains;
        renderFilterChips();

        const contentContainer = document.getElementById('dev-content-container');
        if (contentContainer) {
            contentContainer.innerHTML = '<p>Buscando...</p>';
        }

        try {
            const data = await fetchConsoleData({ collection, id, user, nameContains, googleId, limit });
            currentData = data;
            viewData = data;
            applyFilters();
        } catch (e) {
            console.error('Error en consola de búsqueda', e);
            if (contentContainer) contentContainer.innerHTML = `<p style="color:var(--danger-color);">Error: ${e.message}</p>`;
        }
    }

    function clearConsoleSearch() {
        ['dev-console-id','dev-console-user','dev-console-name','dev-console-google','dev-console-limit'].forEach(id => setInputValue(id, ''));
        const select = document.getElementById('dev-console-collection');
        if (select) select.value = 'lists';
        searchTerm = '';
        quickFilters.clear();
        renderFilterChips();
        applyFilters();
    }

    async function fetchConsoleData({ collection, id, user, nameContains, googleId, limit }) {
        if (id) {
            const doc = await db.collection(collection).doc(id).get();
            if (doc.exists) {
                return [{ id: doc.id, ...doc.data() }];
            }
            return [];
        }

        // Build base query
        let query = db.collection(collection);
        if (collection === 'places') {
            if (googleId) query = query.where('googlePlaceId', '==', googleId);
            if (user) query = query.where('createdByUserId', '==', user);
        } else if (collection === 'lists') {
            if (user) query = query.where('userId', '==', user);
        } else if (collection === 'users') {
            if (user) {
                // soportar búsqueda exacta por email
                query = query.where('emailLowerCase', '==', user.toLowerCase());
            }
        } else if (collection === 'categories') {
            // sin filtros server, se filtrará en cliente
        } else if (collection === 'listForums') {
            if (user) query = query.where('ownerId', '==', user);
        }
        query = query.limit(limit);
        const snap = await query.get();
        let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (nameContains) {
            const term = nameContains.toLowerCase();
            rows = rows.filter(r => {
                const name = (r.name || r.displayName || '').toLowerCase();
                return name.includes(term);
            });
        }
        return rows;
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

    function setupModalListeners() {
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', closeDetailModal);
        });
        const saveBtn = document.getElementById('dev-detail-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveDetailModal);
        }
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

        const recalcListAveragesBtn = document.getElementById('recalculate-list-averages-btn');
        if (recalcListAveragesBtn) recalcListAveragesBtn.addEventListener('click', recalculateSelectedListAverages);

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
        const recalcListAveragesBtn = document.getElementById('recalculate-list-averages-btn');
        if (recalcListAveragesBtn) {
            const isListsTab = currentCollectionName === 'lists';
            recalcListAveragesBtn.style.display = isListsTab ? 'inline-block' : 'none';
            recalcListAveragesBtn.disabled = !hasSelection || !isListsTab;
        }
    }

    // --- Funciones para los Botones de Acción ---

    function exportSelectedToCsv() {
        const dataToExport = selectedRowIds.size > 0 
            ? currentData.filter(row => selectedRowIds.has(row.id))
            : (viewData.length ? viewData : currentData);

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
        const jobId = `update-all-places-${Date.now()}`;
        upsertJobCard(jobId, 'Actualizar todos los lugares');
        updateJobCard(jobId, { statusText: 'Ejecutando función...', progress: 10, tone: 'warn' });

        try {
            const adminUpdateAllPlaces = firebase.app().functions('europe-west1').httpsCallable('adminUpdateAllPlaces');
            const result = await adminUpdateAllPlaces();
            const { updated, skipped, errors } = result.data;
            alert(`Actualización completada.\n\nActualizados: ${updated}\nOmitidos: ${skipped}\nErrores: ${errors}`);
            finishJobCard(jobId, 'ok', `Actualizados: ${updated}, Omitidos: ${skipped}, Errores: ${errors}`);
        } catch (error) {
            console.error("Error al ejecutar adminUpdateAllPlaces:", error);
            alert(`Error al actualizar los lugares: ${error.message}`);
            finishJobCard(jobId, 'danger', error.message);
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
        const jobId = `update-selected-places-${Date.now()}`;
        upsertJobCard(jobId, `Actualizar ${selectedRowIds.size} lugares`);
        updateJobCard(jobId, { statusText: 'Enviando peticiones...', progress: 5, tone: 'warn' });

        let successCount = 0;
        let errorCount = 0;

        const updatePromises = [];
        for (const docId of selectedRowIds) {
            const place = currentData.find(p => p.id === docId);
            if (place && place.googlePlaceId) {
                const adminUpdateSinglePlace = firebase.app().functions('europe-west1').httpsCallable('adminUpdateSinglePlace');
                updatePromises.push(
                    adminUpdateSinglePlace({ documentId: docId, googlePlaceId: place.googlePlaceId })
                    .then(() => { successCount++; })
                    .catch(err => {
                        console.error(`Error actualizando el lugar ${docId}:`, err);
                        errorCount++;
                    })
                    .finally(() => {
                        const progress = Math.round(((successCount + errorCount) / selectedRowIds.size) * 100);
                        updateJobCard(jobId, { statusText: `Procesando... (${successCount + errorCount}/${selectedRowIds.size})`, progress, tone: 'warn' });
                    })
                );
            } else {
                console.warn(`No se pudo encontrar googlePlaceId para el documento ${docId}. Saltando...`);
                errorCount++;
            }
        }
        
        await Promise.all(updatePromises);
        
        alert(`Operación completada.\n\nActualizados: ${successCount}\nErrores: ${errorCount}`);
        finishJobCard(jobId, errorCount ? 'warn' : 'ok', `Ok: ${successCount} · Errores: ${errorCount}`);
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
        const consoleSelect = document.getElementById('dev-console-collection');
        if (consoleSelect) {
            consoleSelect.value = collectionName;
            updateConsoleFilters(collectionName);
        }

        const contentContainer = document.getElementById('dev-content-container');
        contentContainer.innerHTML = `<p>Cargando datos de "${collectionName}"...</p>`;
        sortState = {};
        selectedRowIds.clear(); // Limpiar selección al cambiar de pestaña
        updateActionButtonsState(); // Actualizar estado de botones
        quickFilters.clear();
        searchTerm = '';
        const searchInput = document.getElementById('dev-filter-search');
        if (searchInput) searchInput.value = '';

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
            viewData = [...currentData];
            renderFilterChips();
            applyFilters();
        } catch (error) {
            console.error(`Error fetching collection ${collectionName}:`, error);
            contentContainer.innerHTML = `<p style="color:var(--danger-color);">Error al cargar datos de "${collectionName}": ${error.message}</p>`;
        }
    }

    function renderTable(data, container) {
        if (!data || data.length === 0) {
            container.innerHTML = `<p>No hay datos para mostrar.</p>`;
            renderDetailPanel(null);
            return;
        }

        const allKeys = new Set(['id']);
        data.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)));
        const preferred = getDisplayColumns(currentCollectionName, Array.from(allKeys));
        const headers = preferred.length ? preferred : Array.from(allKeys);
        
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
        const first = data[0];
        if (first && !selectedRowIds.size) {
            renderDetailPanel(first);
        }
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

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                rowCheckboxes.forEach(checkbox => {
                    checkbox.checked = isChecked;
                    const rowId = checkbox.dataset.id;
                    const rowEl = container.querySelector(`[data-row-id="${rowId}"]`);
                    if (isChecked) {
                        selectedRowIds.add(rowId);
                        rowEl && rowEl.classList.add('selected');
                    } else {
                        selectedRowIds.delete(rowId);
                        rowEl && rowEl.classList.remove('selected');
                    }
                });
                updateActionButtonsState();
            });
        }

        rowCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const rowId = e.target.dataset.id;
                const rowElement = container.querySelector(`[data-row-id="${rowId}"]`);
                if (e.target.checked) {
                    selectedRowIds.add(rowId);
                    rowElement.classList.add('selected');
                } else {
                    selectedRowIds.delete(rowId);
                    rowElement.classList.remove('selected');
                }
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = rowCheckboxes.length === selectedRowIds.size;
                }
                updateActionButtonsState();
            });
        });

        container.querySelectorAll('tbody tr').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('input')) return;
                const rowId = row.dataset.rowId;
                const item = viewData.find(d => d.id === rowId) || currentData.find(d => d.id === rowId);
                if (item) {
                    renderDetailPanel(item);
                }
            });
            row.addEventListener('dblclick', (e) => {
                const rowId = row.dataset.rowId;
                const item = viewData.find(d => d.id === rowId) || currentData.find(d => d.id === rowId);
                if (item) {
                    openDetailModal(item);
                }
            });
        });
    }


    function sortData(key, direction) {
        const sorter = (a, b) => {
            const valA = a[key], valB = b[key];
            if (valA === null || typeof valA === 'undefined') return 1;
            if (valB === null || typeof valB === 'undefined') return -1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            return 0;
        };
        currentData.sort(sorter);
        viewData.sort(sorter);
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

    function getDisplayColumns(collection, allKeysArray) {
        const defaults = {
            users: ['id','displayName','username','email','userType','followersCount','reviewsCount'],
            lists: ['id','name','userId','categoryId','isPublic','reviewCount','followersCount'],
            places: ['id','name','city','province','googlePlaceId','reviewsCount','mainImageUrl'],
            categories: ['id','name','displayName','order'],
            listForums: ['id','ownerId','name']
        };
        const configured = defaults[collection] || [];
        const available = new Set(allKeysArray || []);
        return configured.filter(key => available.has(key));
    }

    function renderDetailPanel(item) {
        const panel = document.getElementById('dev-detail-panel');
        if (!panel) return;
        if (!item) {
            panel.innerHTML = `<p style="color:var(--secondary-text-color);">Selecciona una fila para ver detalles.</p>`;
            return;
        }

        const title = getItemTitle(item);
        const meta = getItemMeta(item);
        const highlightFields = getHighlightFields(item);
        const statusBadges = getStatusBadges(item);

        const kvHtml = highlightFields.map(kv => `
            <div class="dev-detail-kv">
                <div class="label">${escapeHtml(kv.label)}</div>
                <div class="value">${escapeHtml(kv.value ?? '')}</div>
            </div>
        `).join('');

        const badgesHtml = statusBadges.map(b => `<span class="dev-status-pill ${b.tone}">${escapeHtml(b.text)}</span>`).join(' ');

        panel.innerHTML = `
            <div class="dev-detail-header">
                <div>
                    <div class="dev-detail-title">${escapeHtml(title)}</div>
                    <div class="dev-detail-meta">${escapeHtml(meta)}</div>
                    <div>${badgesHtml}</div>
                </div>
                <span class="dev-summary-pill">ID: ${escapeHtml(item.id)}</span>
            </div>
            <div class="dev-detail-grid">${kvHtml}</div>
            <div class="dev-json-block"><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></div>
            <div class="dev-tool-actions">
                <button id="dev-open-modal-btn" class="button secondary-button"><i class="fas fa-up-right-from-square"></i> Ver detalle</button>
            </div>
        `;
        const openBtn = panel.querySelector('#dev-open-modal-btn');
        if (openBtn) {
            openBtn.addEventListener('click', () => openDetailModal(item));
        }
    }

    function getItemTitle(item) {
        if (currentCollectionName === 'places') return item.name || item.googlePlaceId || item.id;
        if (currentCollectionName === 'lists') return item.name || item.id;
        if (currentCollectionName === 'users') return item.displayName || item.username || item.email || item.id;
        return item.id;
    }

    function getItemMeta(item) {
        if (currentCollectionName === 'places') {
            const parts = [];
            if (item.city) parts.push(item.city);
            if (item.province) parts.push(item.province);
            if (item.country) parts.push(item.country);
            return parts.join(' · ') || 'Place';
        }
        if (currentCollectionName === 'lists') {
            const pub = item.isPublic === false ? 'Privada' : 'Pública';
            return `${pub} · ${item.reviewCount || 0} reseñas`;
        }
        if (currentCollectionName === 'users') {
            const role = Array.isArray(item.userType) ? item.userType.join(', ') : (item.userType || 'Usuario');
            return `${role} · ${item.email || ''}`;
        }
        return currentCollectionName;
    }

    function getHighlightFields(item) {
        if (currentCollectionName === 'places') {
            const lat = Number(item.location?.latitude ?? item.location?.lat ?? item.coordinates?.latitude ?? item.coordinates?.lat ?? NaN);
            const lon = Number(item.location?.longitude ?? item.location?.lng ?? item.coordinates?.longitude ?? item.coordinates?.lng ?? NaN);
            const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
            return [
                { label: 'Google Place ID', value: item.googlePlaceId || '—' },
                { label: 'Coords', value: hasCoords ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : 'Sin coordenadas' },
                { label: 'Foto', value: item.mainImageUrl ? 'Con foto' : 'Sin foto' },
                { label: 'Rating', value: item.googleRating ?? item.averageRating ?? '—' },
                { label: 'Reviews', value: item.googleUserRatingsTotal ?? item.reviewsCount ?? 0 }
            ];
        }
        if (currentCollectionName === 'lists') {
            return [
                { label: 'Propietario', value: item.userId || '—' },
                { label: 'Categoría', value: item.categoryId || '—' },
                { label: 'Pública', value: item.isPublic === false ? 'No' : 'Sí' },
                { label: 'Reviews', value: item.reviewCount ?? 0 },
                { label: 'Seguidores', value: item.followersCount ?? 0 }
            ];
        }
        if (currentCollectionName === 'users') {
            return [
                { label: 'Email', value: item.email || item.emailLowerCase || '—' },
                { label: 'Rol', value: Array.isArray(item.userType) ? item.userType.join(', ') : (item.userType || 'Usuario') },
                { label: 'Reviews', value: item.reviewsCount ?? 0 },
                { label: 'Seguidores', value: item.followersCount ?? 0 },
                { label: 'Siguiendo', value: item.followingCount ?? 0 }
            ];
        }
        return [
            { label: 'ID', value: item.id }
        ];
    }

    function getStatusBadges(item) {
        const badges = [];
        if (currentCollectionName === 'places') {
            if (!item.googlePlaceId) badges.push({ tone: 'warn', text: 'Falta googlePlaceId' });
            if (!item.mainImageUrl) badges.push({ tone: 'warn', text: 'Sin foto' });
            if (!(item.location?.latitude && item.location?.longitude)) badges.push({ tone: 'warn', text: 'Sin coordenadas' });
        } else if (currentCollectionName === 'lists') {
            if (item.isPublic === false) badges.push({ tone: 'warn', text: 'Privada' });
            if (!item.categoryId) badges.push({ tone: 'warn', text: 'Sin categoría' });
        } else if (currentCollectionName === 'users') {
            if (!item.userType || (Array.isArray(item.userType) && item.userType.length === 0)) badges.push({ tone: 'warn', text: 'Sin rol' });
        }
        if (!badges.length) badges.push({ tone: 'ok', text: 'OK' });
        return badges;
    }

    function getDetailLink(item) {
        if (!item || !item.id) return null;
        if (currentCollectionName === 'places') {
            const placeId = item.googlePlaceId || item.id;
            return { url: `place-detail.html?placeId=${encodeURIComponent(placeId)}`, label: 'Abrir lugar' };
        }
        if (currentCollectionName === 'lists') {
            return { url: `list-view.html?listId=${encodeURIComponent(item.id)}`, label: 'Abrir lista' };
        }
        if (currentCollectionName === 'users') {
            return { url: `profile.html?viewUserId=${encodeURIComponent(item.id)}`, label: 'Abrir usuario' };
        }
        if (currentCollectionName === 'categories') {
            return { url: `developer.html#cat-${encodeURIComponent(item.id)}`, label: 'Abrir categoría' };
        }
        if (currentCollectionName === 'listForums') {
            return { url: `chats.html?forumId=${encodeURIComponent(item.id)}`, label: 'Abrir foro' };
        }
        return null;
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') unsafe = String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function renderListImageEditor(item) {
        const main = (item?.mainImageUrl || '').trim();
        const cover = (item?.coverImageUrl || '').trim();
        const previewUrl = main || cover;
        const previewSource = main ? 'mainImageUrl' : (cover ? 'coverImageUrl' : '');
        const hint = cover && !main ? ` <span class="dev-summary-pill">Tip: tienes <code>coverImageUrl</code></span>` : '';
        return `
            <div class="dev-image-card" id="dev-list-image-editor">
                <div class="dev-image-card__header">
                    <div>
                        <div class="dev-image-card__title">Imagen de la lista</div>
                        <div class="dev-image-card__meta">Se guarda en <code>mainImageUrl</code>${previewSource ? `. Vista previa: <code>${escapeHtml(previewSource)}</code>.` : '.'}</div>
                    </div>
                    ${hint}
                </div>
                <div class="dev-image-card__body">
                    <div class="dev-image-preview" id="dev-list-image-drop-area" role="button" tabindex="0" title="Arrastra una imagen o haz clic para seleccionar">
                        <img id="dev-list-image-preview" alt="Imagen de la lista" loading="lazy" ${previewUrl ? `src="${escapeHtml(previewUrl)}"` : ''}>
                        <div id="dev-list-image-preview-empty" class="dev-image-preview-empty" ${previewUrl ? 'hidden' : ''}>Sin imagen</div>
                        <input type="file" id="dev-list-image-file" accept="image/*" class="file-input-hidden">
                    </div>
                    <div>
                        <label for="dev-list-image-url" class="dev-helper-text" style="margin:0 0 6px 0;">URL</label>
                        <input id="dev-list-image-url" class="form-input" type="url" placeholder="https://..." value="${escapeHtml(main)}">
                        <div class="dev-image-actions">
                            <button id="dev-list-image-save-btn" class="button primary-button" type="button"><i class="fas fa-image"></i> Guardar imagen</button>
                            <button id="dev-list-image-pick-file-btn" class="button secondary-button" type="button"><i class="fas fa-upload"></i> Elegir archivo</button>
                            <button id="dev-list-image-apply-json-btn" class="button secondary-button" type="button">Aplicar al JSON</button>
                            <button id="dev-list-image-clear-btn" class="button secondary-button" type="button">Limpiar</button>
                            ${cover ? `<button id="dev-list-image-use-cover-btn" class="button secondary-button" type="button">Usar coverImageUrl</button>` : ''}
                        </div>
                        <p class="dev-helper-text" style="margin:6px 0 0 0;">“Guardar imagen” actualiza Firestore directamente (si la URL está vacía, borra el campo).</p>
                    </div>
                </div>
            </div>
        `;
    }

    function updateDetailModalJsonPreview(item) {
        const pre = document.getElementById('dev-detail-modal-json-pre');
        if (!pre) return;
        pre.textContent = JSON.stringify(item, null, 2);
    }

    function patchDetailModalEditorMainImageUrl(url) {
        const editor = document.getElementById('dev-detail-modal-editor');
        if (!editor) return { ok: false, error: 'Editor no encontrado.' };
        let payload;
        try {
            payload = JSON.parse(editor.value || '{}');
            if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('El JSON debe ser un objeto.');
        } catch (e) {
            return { ok: false, error: `JSON inválido: ${e.message}` };
        }

        const trimmed = (url || '').trim();
        if (trimmed) {
            payload.mainImageUrl = trimmed;
        } else {
            delete payload.mainImageUrl;
        }
        editor.value = JSON.stringify(payload, null, 2);
        return { ok: true };
    }

    function setupListImageEditor(item) {
        const urlInput = document.getElementById('dev-list-image-url');
        const previewImg = document.getElementById('dev-list-image-preview');
        const previewEmpty = document.getElementById('dev-list-image-preview-empty');
        const saveBtn = document.getElementById('dev-list-image-save-btn');
        const pickFileBtn = document.getElementById('dev-list-image-pick-file-btn');
        const applyJsonBtn = document.getElementById('dev-list-image-apply-json-btn');
        const clearBtn = document.getElementById('dev-list-image-clear-btn');
        const useCoverBtn = document.getElementById('dev-list-image-use-cover-btn');
        const dropArea = document.getElementById('dev-list-image-drop-area');
        const fileInput = document.getElementById('dev-list-image-file');

        let selectedFile = null;
        let objectUrl = null;

        if (!urlInput || !previewImg || !previewEmpty || !saveBtn || !applyJsonBtn || !clearBtn) return;

        const setButtonsEnabled = (enabled) => {
            [saveBtn, pickFileBtn, applyJsonBtn, clearBtn, useCoverBtn].forEach(btn => {
                if (!btn) return;
                btn.disabled = !enabled;
            });
        };

        const setPreviewUrl = (rawUrl) => {
            const next = (rawUrl || '').trim();
            if (next) {
                previewImg.src = next;
                previewEmpty.hidden = true;
            } else {
                previewImg.removeAttribute('src');
                previewEmpty.hidden = false;
            }
        };

        const revokeObjectUrl = () => {
            if (!objectUrl) {
                return;
            }
            try { URL.revokeObjectURL(objectUrl); } catch (_) {}
            objectUrl = null;
        };

        const clearPendingFile = () => {
            selectedFile = null;
            revokeObjectUrl();
            if (fileInput) {
                fileInput.value = '';
            }
        };

        previewImg.onerror = () => {
            previewEmpty.hidden = false;
        };

        urlInput.addEventListener('input', () => {
            clearPendingFile();
            setPreviewUrl(urlInput.value);
        });

        const applyToLocalState = (rawUrl) => {
            const next = (rawUrl || '').trim();
            if (!currentModalItem) return;
            if (next) currentModalItem.mainImageUrl = next;
            else delete currentModalItem.mainImageUrl;
            updateDetailModalJsonPreview(currentModalItem);
        };

        clearBtn.addEventListener('click', () => {
            urlInput.value = '';
            clearPendingFile();
            setPreviewUrl('');
        });

        if (useCoverBtn) {
            useCoverBtn.addEventListener('click', () => {
                const cover = (item?.coverImageUrl || '').trim();
                urlInput.value = cover;
                clearPendingFile();
                setPreviewUrl(cover);
            });
        }

        const openFilePicker = () => {
            if (!fileInput) {
                notify('No se pudo abrir el selector de archivos.', 'error');
                return;
            }
            fileInput.value = '';
            fileInput.click();
        };

        const handleImageFile = async (file) => {
            if (!file) {
                return;
            }
            if (!file.type || !file.type.startsWith('image/')) {
                notify('El archivo seleccionado no es una imagen válida.', 'error');
                return;
            }

            try {
                const uiUtils = window.ListopicApp?.uiUtils || {};
                const compressedFile = typeof uiUtils.compressImage === 'function'
                    ? await uiUtils.compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.72 })
                    : file;

                clearPendingFile();
                selectedFile = compressedFile;
                urlInput.value = '';
                objectUrl = URL.createObjectURL(compressedFile);
                setPreviewUrl(objectUrl);
            } catch (error) {
                console.error('[Developer] Error al procesar la imagen seleccionada:', error);
                notify('No se pudo procesar la imagen seleccionada.', 'error');
                clearPendingFile();
                setPreviewUrl(urlInput.value || item?.coverImageUrl || '');
            }
        };

        pickFileBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            openFilePicker();
        });

        dropArea?.addEventListener('click', (event) => {
            event.preventDefault();
            openFilePicker();
        });

        dropArea?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            event.preventDefault();
            openFilePicker();
        });

        fileInput?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            handleImageFile(file);
        });

        const preventDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        ['dragenter', 'dragover'].forEach((eventName) => {
            dropArea?.addEventListener(eventName, (event) => {
                preventDefaults(event);
                dropArea.classList.add('drag-over');
            });
        });

        ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
            dropArea?.addEventListener(eventName, (event) => {
                preventDefaults(event);
                dropArea.classList.remove('drag-over');
            });
        });

        dropArea?.addEventListener('drop', (event) => {
            const files = Array.from(event.dataTransfer?.files || []);
            const file = files.find(candidate => candidate.type && candidate.type.startsWith('image/'));
            if (!file) {
                if (files.length) {
                    notify('Solo puedes arrastrar archivos de imagen en este espacio.', 'warning');
                }
                return;
            }
            handleImageFile(file);
        });

        applyJsonBtn.addEventListener('click', () => {
            if (selectedFile) {
                notify('Tienes una imagen seleccionada pero pendiente de subir. Pulsa "Guardar imagen" para subirla y guardarla.', 'info');
                return;
            }
            const url = (urlInput.value || '').trim();
            const res = patchDetailModalEditorMainImageUrl(url);
            if (!res.ok) {
                notify(res.error, 'error');
                return;
            }
            applyToLocalState(url);
            notify('mainImageUrl aplicado al JSON.', 'success');
        });

        saveBtn.addEventListener('click', async () => {
            if (!currentModalItem?.id || currentCollectionName !== 'lists') return;
            let url = (urlInput.value || '').trim();
            const hasFile = !!selectedFile;
            const msg = hasFile
                ? `¿Subir imagen y guardar mainImageUrl en lists/${currentModalItem.id}?`
                : (url
                    ? `¿Guardar mainImageUrl en lists/${currentModalItem.id}?`
                    : `¿Borrar mainImageUrl en lists/${currentModalItem.id}?`);
            if (!confirm(msg)) return;

            setButtonsEnabled(false);
            try {
                if (hasFile) {
                    const storage = window.ListopicApp?.services?.storage || ListopicApp?.services?.storage;
                    if (!storage?.ref) {
                        throw new Error('Firebase Storage no está disponible.');
                    }
                    const rawName = typeof selectedFile.name === 'string' && selectedFile.name.trim()
                        ? selectedFile.name.trim()
                        : `list_image_${Date.now()}.jpg`;
                    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const storagePath = `list-images/${currentModalItem.id}/${Date.now()}_${safeName}`;
                    const storageRef = storage.ref(storagePath);
                    const uploadSnapshot = await storageRef.put(selectedFile);
                    url = await uploadSnapshot.ref.getDownloadURL();
                    urlInput.value = url;
                    clearPendingFile();
                    setPreviewUrl(url);
                }

                const deleteValue = firebase?.firestore?.FieldValue?.delete?.();
                const payload = url ? { mainImageUrl: url } : { mainImageUrl: deleteValue };
                if (!url && !deleteValue) throw new Error('No se pudo obtener FieldValue.delete()');

                await db.collection('lists').doc(currentModalItem.id).set(payload, { merge: true });

                const editorRes = patchDetailModalEditorMainImageUrl(url);
                if (!editorRes.ok) {
                    notify(`Imagen guardada, pero no se pudo actualizar el JSON del editor: ${editorRes.error}`, 'warning');
                }
                applyToLocalState(url);
                notify('Imagen guardada.', 'success');
            } catch (e) {
                console.error('Error al guardar imagen de lista', e);
                notify(`Error al guardar imagen: ${e.message}`, 'error');
            } finally {
                setButtonsEnabled(true);
            }
        });

        setPreviewUrl(urlInput.value || item?.coverImageUrl || '');
    }

    // Modal de detalle/edición
    let currentModalItem = null;
    function openDetailModal(item) {
        currentModalItem = item;
        const modal = document.getElementById('dev-detail-modal');
        const titleEl = document.getElementById('dev-detail-modal-title');
        const metaEl = document.getElementById('dev-detail-modal-meta');
        const jsonEl = document.getElementById('dev-detail-modal-json');
        const editor = document.getElementById('dev-detail-modal-editor');
        if (!modal || !titleEl || !metaEl || !jsonEl || !editor) return;

        titleEl.textContent = getItemTitle(item);
        metaEl.textContent = getItemMeta(item);
        const highlightFields = getHighlightFields(item);
        const statusBadges = getStatusBadges(item);
        const detailLink = getDetailLink(item);
        const kvHtml = highlightFields.map(kv => `
            <div class="dev-modal-kv">
                <div class="label">${escapeHtml(kv.label)}</div>
                <div class="value">${escapeHtml(kv.value ?? '')}</div>
            </div>
        `).join('');
        const badgesHtml = statusBadges.map(b => `<span class="dev-status-pill ${b.tone}">${escapeHtml(b.text)}</span>`).join(' ');
        const imageEditorHtml = currentCollectionName === 'lists' ? renderListImageEditor(item) : '';
        jsonEl.innerHTML = `
            <div class="dev-modal-grid">${kvHtml}</div>
            <div style="margin-bottom:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">${badgesHtml}
                ${detailLink ? `<a class="dev-summary-pill" href="${escapeHtml(detailLink.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(detailLink.label)}</a>` : ''}
            </div>
            ${imageEditorHtml}
            <div class="dev-json-block"><pre id="dev-detail-modal-json-pre">${escapeHtml(JSON.stringify(item, null, 2))}</pre></div>
        `;
        editor.value = JSON.stringify(item, null, 2);
        modal.hidden = false;
        modal.style.display = 'flex';
        if (currentCollectionName === 'lists') setupListImageEditor(item);
    }

    function closeDetailModal() {
        const modal = document.getElementById('dev-detail-modal');
        if (modal) {
            modal.hidden = true;
            modal.style.display = 'none';
        }
        currentModalItem = null;
    }

    function isLegacyGooglePhotoUrl(url) {
        return typeof url === 'string' && url.includes('maps.googleapis.com/maps/api/place/photo');
    }

    async function resolveLegacyPlacePhoto(placeId, url) {
        if (!placeId || !isLegacyGooglePhotoUrl(url)) {
            return null;
        }
        const placesService = window.ListopicApp?.placesService;
        if (!placesService || typeof placesService.refreshMainImage !== 'function') {
            return null;
        }
        try {
            const result = await placesService.refreshMainImage(placeId, { force: true });
            return result?.photoUrl || null;
        } catch (error) {
            console.warn('[Developer] Could not refresh legacy place photo.', error);
            return null;
        }
    }

    async function saveDetailModal() {
        if (!currentModalItem) return;
        const editor = document.getElementById('dev-detail-modal-editor');
        if (!editor) return;
        let payload;
        try {
            payload = JSON.parse(editor.value || '{}');
            if (typeof payload !== 'object' || Array.isArray(payload)) {
                throw new Error('El JSON debe ser un objeto.');
            }
        } catch (e) {
            alert(`JSON inválido: ${e.message}`);
            return;
        }
        if (!confirm(`¿Guardar cambios en ${currentCollectionName}/${currentModalItem.id}?`)) {
            return;
        }
        if (currentCollectionName === 'places') {
            const hasPayloadUrl = Object.prototype.hasOwnProperty.call(payload, 'mainImageUrl');
            const payloadUrl = hasPayloadUrl && typeof payload.mainImageUrl === 'string'
                ? payload.mainImageUrl.trim()
                : '';
            const fallbackUrl = !hasPayloadUrl && typeof currentModalItem.mainImageUrl === 'string'
                ? currentModalItem.mainImageUrl.trim()
                : '';
            const legacyUrl = payloadUrl || fallbackUrl;
            if (isLegacyGooglePhotoUrl(legacyUrl) && (!hasPayloadUrl || isLegacyGooglePhotoUrl(payloadUrl))) {
                const resolvedUrl = await resolveLegacyPlacePhoto(currentModalItem.id, legacyUrl);
                if (resolvedUrl) {
                    payload.mainImageUrl = resolvedUrl;
                }
            }
        }
        try {
            await db.collection(currentCollectionName).doc(currentModalItem.id).set(payload, { merge: true });
            alert('Guardado con éxito.');
            closeDetailModal();
            switchTab(currentCollectionName);
        } catch (e) {
            console.error('Error al guardar', e);
            alert(`Error al guardar: ${e.message}`);
        }
    }
    // --- NUEVA FUNCIÓN PARA ALGOLIA ---
    async function backfillAlgolia(collectionName = null) {
        const logContainer = document.getElementById('algolia-sync-log');
        if (!logContainer) return;

        const jobId = `algolia-${Date.now()}`;
        upsertJobCard(jobId, 'Sincronizar Algolia');
        updateJobCard(jobId, { statusText: 'Solicitando sincronización...', progress: 5, tone: 'warn' });
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
                    const progress = Math.round(((collections.indexOf(collection) + 1) / collections.length) * 100);
                    updateJobCard(jobId, { statusText: `${collection} listo`, progress, tone: 'warn' });
                } catch (error) {
                    logContainer.innerHTML += `<p style="color: var(--danger-color);"><code>🔥 Error en '${collection}': ${error.message}</code></p>`;
                    updateJobCard(jobId, { statusText: `Error en ${collection}`, progress: 100, tone: 'danger' });
                }
            }
            logContainer.innerHTML += '<p><code>Proceso de sincronización completado.</code></p>';
            finishJobCard(jobId, 'ok', 'Algolia sincronizado');
        } catch (error) {
            logContainer.innerHTML += `<p style="color: var(--danger-color);"><code>🔥 Error general al llamar la función: ${error.message}</code></p>`;
            finishJobCard(jobId, 'danger', error.message);
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
        const jobId = `update-lists-${Date.now()}`;
        upsertJobCard(jobId, `Actualizar ${selectedRowIds.size} listas`);
        updateJobCard(jobId, { statusText: 'Enviando...', progress: 5, tone: 'warn' });
        let successCount = 0;
        let errorCount = 0;
        try {
            const callable = firebase.app().functions('europe-west1').httpsCallable('adminUpdateSingleListAggregates');
            await Promise.all(
                Array.from(selectedRowIds).map(id => callable({ listId: id }).then(()=>{
                    successCount++;
                    const progress = Math.round(((successCount + errorCount) / selectedRowIds.size) * 100);
                    updateJobCard(jobId, { statusText: `Listas procesadas ${successCount + errorCount}/${selectedRowIds.size}`, progress, tone: 'warn' });
                }).catch(()=>{
                    errorCount++;
                }))
            );
            alert(`Listas actualizadas: ${successCount}\nErrores: ${errorCount}`);
            finishJobCard(jobId, errorCount ? 'warn' : 'ok', `Ok: ${successCount} · Errores: ${errorCount}`);
            switchTab(currentCollectionName);
        } catch (e) {
            console.error('Error en updateSelectedLists', e);
            alert('Error al actualizar listas: ' + e.message);
            finishJobCard(jobId, 'danger', e.message);
        } finally {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
    }

    async function recalculateSelectedListAverages() {
        if (selectedRowIds.size === 0) return;
        if (!confirm(`¿Calcular medias para ${selectedRowIds.size} lista(s)?`)) return;
        const btn = document.getElementById('recalculate-list-averages-btn');
        const originalBtnText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
        }

        const jobId = `recalc-averages-${Date.now()}`;
        upsertJobCard(jobId, `Calcular medias (${selectedRowIds.size})`);
        updateJobCard(jobId, { statusText: 'Preparando cálculo...', progress: 5, tone: 'warn' });

        let successCount = 0;
        let errorCount = 0;

        try {
            const callable = firebase.app().functions('europe-west1').httpsCallable('adminRecalculateListAverages');
            for (const listId of selectedRowIds) {
                try {
                    await callable({ listId });
                    successCount++;
                } catch (error) {
                    console.error('Error recalc medias lista', listId, error);
                    errorCount++;
                }
                const processed = successCount + errorCount;
                const progress = Math.round((processed / selectedRowIds.size) * 100);
                updateJobCard(jobId, { statusText: `Listas procesadas ${processed}/${selectedRowIds.size}`, progress, tone: 'warn' });
            }
            alert(`Medias recalculadas: ${successCount}\nErrores: ${errorCount}`);
            finishJobCard(jobId, errorCount ? 'warn' : 'ok', `Medias listas: ${successCount}, errores: ${errorCount}`);
            switchTab(currentCollectionName);
        } catch (error) {
            console.error('Error en recalculateSelectedListAverages', error);
            alert('No se pudieron recalcular las medias: ' + error.message);
            finishJobCard(jobId, 'danger', error.message);
        } finally {
            if (btn) {
                btn.innerHTML = originalBtnText;
                btn.disabled = false;
            }
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
        const reviewMissingPlaceBtn = document.getElementById('dev-review-missing-place-btn');
        if (reviewMissingPlaceBtn) reviewMissingPlaceBtn.addEventListener('click', (event) => handleReviewSearch(event, { missingPlace: true }));
        const reviewMissingDateBtn = document.getElementById('dev-review-missing-date-btn');
        if (reviewMissingDateBtn) reviewMissingDateBtn.addEventListener('click', (event) => handleReviewSearch(event, { missingDate: true }));
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
    function buildReviewFilters(overrides = {}) {
        const filters = {
            reviewId: getInputValue('dev-review-filter-id'),
            userId: getInputValue('dev-review-filter-user'),
            placeId: getInputValue('dev-review-filter-place'),
            itemName: getInputValue('dev-review-filter-item'),
            listId: getInputValue('dev-review-filter-list'),
            fromDate: getInputValue('dev-review-filter-from'),
            toDate: getInputValue('dev-review-filter-to'),
            missingPlace: false,
            missingDate: false
        };
        if (Object.prototype.hasOwnProperty.call(overrides, 'missingPlace')) {
            filters.missingPlace = Boolean(overrides.missingPlace);
        }
        if (Object.prototype.hasOwnProperty.call(overrides, 'missingDate')) {
            filters.missingDate = Boolean(overrides.missingDate);
        }
        return filters;
    }

    async function handleReviewSearch(event, overrides = {}) {
        event?.preventDefault?.();
        const filters = buildReviewFilters(overrides);
        const limit = parseInt(getInputValue('dev-review-limit'), 10) || 50;
        const container = document.getElementById('dev-review-results');
        const btn = document.getElementById('dev-review-search-btn');
        if (!container) return;

        if (!filters.reviewId && !filters.userId && !filters.placeId && !filters.itemName && !filters.listId && !filters.missingPlace && !filters.missingDate) {
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
        const warnings = [];
        const normalizedItem = (filters.itemName || '').toLowerCase();
        const wantsMissingPlace = Boolean(filters.missingPlace);
        const wantsMissingDate = Boolean(filters.missingDate);
        let includeItemFilter = Boolean(filters.itemName);
        let includeMissingPlaceFilter = wantsMissingPlace;
        let includeMissingDateFilter = wantsMissingDate;
        const { fromMs, toMs } = parseDateRange(filters.fromDate, filters.toDate);
        const hasDateRange = Boolean(fromMs || toMs);

        if (wantsMissingPlace && filters.placeId) {
            warnings.push('Filtro "sin lugar" ignora placeId.');
        }
        if (wantsMissingDate && hasDateRange) {
            warnings.push('Filtro "sin fecha" ignora el rango de fechas.');
        }

        const applyCommonFilters = (query, { includePlaceId = true, includeItem = true } = {}) => {
            if (filters.reviewId) query = query.where(firebase.firestore.FieldPath.documentId(), '==', filters.reviewId);
            if (filters.userId) query = query.where('userId', '==', filters.userId);
            if (filters.listId) query = query.where('listId', '==', filters.listId);
            if (includePlaceId && !wantsMissingPlace && filters.placeId) {
                query = query.where('placeId', '==', filters.placeId);
            }
            if (includeItem && filters.itemName) {
                query = query.where('itemNameLower', '==', normalizedItem);
            }
            return query;
        };

        const buildReviewQueries = ({ includeItem, includeMissingPlace, includeMissingDate }) => {
            const queries = [];
            if (includeMissingPlace) {
                [null, ''].forEach(placeValue => {
                    let q = db.collectionGroup('reviews');
                    q = applyCommonFilters(q, { includePlaceId: false, includeItem });
                    q = q.where('placeId', '==', placeValue);
                    if (includeMissingDate) {
                        q = q.where('createdAt', '==', null).where('updatedAt', '==', null);
                    }
                    q = q.limit(limit);
                    queries.push(q);
                });
            } else {
                let q = db.collectionGroup('reviews');
                q = applyCommonFilters(q, { includePlaceId: true, includeItem });
                if (includeMissingDate) {
                    q = q.where('createdAt', '==', null).where('updatedAt', '==', null);
                }
                q = q.limit(limit);
                queries.push(q);
            }
            return queries;
        };

        const mergeSnapshots = (snapshots) => {
            const rows = [];
            const seen = new Set();
            snapshots.forEach(snapshot => {
                snapshot.docs.forEach(doc => {
                    const key = doc.ref.path;
                    if (seen.has(key)) return;
                    seen.add(key);
                    rows.push({ id: doc.id, ref: doc.ref, data: doc.data() });
                });
            });
            return rows;
        };

        const runQueryPlan = async () => {
            const queries = buildReviewQueries({
                includeItem: includeItemFilter,
                includeMissingPlace: includeMissingPlaceFilter,
                includeMissingDate: includeMissingDateFilter
            });
            const snapshots = await Promise.all(queries.map(query => query.get()));
            return mergeSnapshots(snapshots);
        };

        let rows = null;
        let appliedItemFilter = includeItemFilter;
        let lastError = null;

        try {
            rows = await runQueryPlan();
        } catch (error) {
            lastError = error;
        }

        if (rows === null && lastError?.code === 'failed-precondition' && includeItemFilter) {
            warnings.push('No hay indice para itemNameLower, se filtra en cliente.');
            includeItemFilter = false;
            appliedItemFilter = false;
            lastError = null;
            try {
                rows = await runQueryPlan();
            } catch (error) {
                lastError = error;
            }
        }

        if (rows === null && lastError?.code === 'failed-precondition' && (includeMissingPlaceFilter || includeMissingDateFilter)) {
            warnings.push('No hay indice para filtros "sin lugar"/"sin fecha", se filtra en cliente.');
            includeMissingPlaceFilter = false;
            includeMissingDateFilter = false;
            lastError = null;
            try {
                rows = await runQueryPlan();
            } catch (error) {
                lastError = error;
            }
        }

        if (rows === null) {
            throw lastError;
        }

        if (!wantsMissingDate && hasDateRange) {
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

        if (wantsMissingPlace) {
            rows = rows.filter(r => {
                const placeId = r.data?.placeId;
                if (typeof placeId === 'string') return placeId.trim().length === 0;
                return !placeId;
            });
        }

        if (wantsMissingDate) {
            rows = rows.filter(r => {
                const createdMs = getTimestampMs(r.data?.createdAt);
                const updatedMs = getTimestampMs(r.data?.updatedAt);
                return !createdMs && !updatedMs;
            });
        }

        rows.sort((a, b) => {
            const ta = getTimestampMs(a.data?.createdAt) || getTimestampMs(a.data?.updatedAt) || 0;
            const tb = getTimestampMs(b.data?.createdAt) || getTimestampMs(b.data?.updatedAt) || 0;
            return tb - ta;
        });

        if (rows.length > limit) {
            rows = rows.slice(0, limit);
        }

        return { results: rows, warnings };
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

