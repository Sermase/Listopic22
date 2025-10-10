window.ListopicApp = window.ListopicApp || {};

ListopicApp.archiveService = (() => {
    const FIELD_VALUE = () => firebase.firestore.FieldValue;

    const DEFAULT_ARCHIVES = Object.freeze([
        {
            id: '__default-quiero-ir',
            name: 'Quiero ir',
            description: 'Guarda aquí los lugares o elementos que quieres probar.',
            systemId: 'WANT_TO_GO',
            sortOrder: 10
        },
        {
            id: '__default-ya-fui',
            name: 'Ya fui',
            description: 'Todo lo que ya disfrutaste vive en este archivo.',
            systemId: 'ALREADY_WENT',
            sortOrder: 20
        }
    ]);

    const MODAL_ID = 'archive-modal';

    const state = {
        userId: null,
        archives: [],
        selectedArchiveIds: new Set(),
        membership: [],
        currentEntity: null,
        isOpen: false,
        isSaving: false,
        modalEl: null,
        modalDialogEl: null,
        archivesListEl: null,
        loadingEl: null,
        emptyEl: null,
        createInputEl: null,
        createButtonEl: null,
        saveButtonEl: null,
        cancelButtons: [],
        descriptionEl: null
    };

    const getServices = () => window.ListopicApp?.services || {};

    const getDb = () => getServices().db || null;
    const getAuth = () => getServices().auth || null;

    const showNotification = (message, type = 'info') => {
        const notifier = getServices().showNotification;
        if (typeof notifier === 'function') {
            notifier(message, type);
        } else {
            console[type === 'error' ? 'error' : 'log'](`[archiveService] ${message}`);
        }
    };

    const getUiUtils = () => window.ListopicApp?.uiUtils || null;

    const escapeHtml = (value) => {
        const utils = getUiUtils();
        if (utils && typeof utils.escapeHtml === 'function') {
            return utils.escapeHtml(String(value ?? ''));
        }
        const p = document.createElement('p');
        p.textContent = value ?? '';
        return p.innerHTML;
    };

    function createModalIfNeeded() {
        if (state.modalEl) {
            return;
        }

        const modalWrapper = document.createElement('div');
        modalWrapper.id = MODAL_ID;
        modalWrapper.className = 'archive-modal';
        modalWrapper.setAttribute('aria-hidden', 'true');
        modalWrapper.innerHTML = `
            <div class="archive-modal__overlay" data-archive-modal-dismiss></div>
            <div class="archive-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="archive-modal-title" tabindex="-1">
                <button type="button" class="archive-modal__close" data-archive-modal-dismiss aria-label="Cerrar ventana">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
                <div class="archive-modal__content">
                    <header class="archive-modal__header">
                        <p class="archive-modal__eyebrow">El Archivo</p>
                        <h2 id="archive-modal-title">Guardar en tus archivos</h2>
                        <p class="archive-modal__description">
                            Selecciona un archivo personal o crea uno nuevo para organizar este elemento.
                        </p>
                    </header>
                    <div class="archive-modal__body">
                        <div class="archive-modal__loading" hidden aria-hidden="true">
                            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
                            <span>Cargando archivos&hellip;</span>
                        </div>
                        <div class="archive-modal__empty" hidden>
                            <i class="fas fa-folder-open" aria-hidden="true"></i>
                            <span>Todavía no tienes archivos personales. ¡Crea el primero!</span>
                        </div>
                        <div class="archive-modal__list" id="archive-modal-list"></div>
                        <div class="archive-modal__create">
                            <label for="archive-modal-new-name">Crear nuevo archivo</label>
                            <div class="archive-modal__create-row">
                                <input type="text" id="archive-modal-new-name" maxlength="60" placeholder="Nombre del nuevo archivo">
                                <button type="button" class="button secondary-button" id="archive-modal-create-btn">
                                    <i class="fas fa-plus-circle" aria-hidden="true"></i>
                                    Crear
                                </button>
                            </div>
                        </div>
                    </div>
                    <footer class="archive-modal__actions">
                        <button type="button" class="button secondary-button" data-archive-modal-dismiss>
                            Cancelar
                        </button>
                        <button type="button" class="button primary-button" id="archive-modal-save-btn" disabled>
                            Guardar
                        </button>
                    </footer>
                </div>
            </div>
        `.trim();

        document.body.appendChild(modalWrapper);

        modalWrapper.classList.add('help-modal');
        const overlayEl = modalWrapper.querySelector('.archive-modal__overlay');
        if (overlayEl) overlayEl.classList.add('help-modal__overlay');
        const dialogEl = modalWrapper.querySelector('.archive-modal__dialog');
        if (dialogEl) dialogEl.classList.add('help-modal__dialog');
        const closeEl = modalWrapper.querySelector('.archive-modal__close');
        if (closeEl) closeEl.classList.add('help-modal__close');
        const contentEl = modalWrapper.querySelector('.archive-modal__content');
        if (contentEl) contentEl.classList.add('help-modal__content');

        state.modalEl = modalWrapper;
        state.modalDialogEl = dialogEl || modalWrapper.querySelector('.archive-modal__dialog');
        state.archivesListEl = modalWrapper.querySelector('#archive-modal-list');
        state.loadingEl = modalWrapper.querySelector('.archive-modal__loading');
        state.emptyEl = modalWrapper.querySelector('.archive-modal__empty');
        state.createInputEl = modalWrapper.querySelector('#archive-modal-new-name');
        state.createButtonEl = modalWrapper.querySelector('#archive-modal-create-btn');
        state.saveButtonEl = modalWrapper.querySelector('#archive-modal-save-btn');
        state.cancelButtons = Array.from(modalWrapper.querySelectorAll('[data-archive-modal-dismiss]'));

        state.cancelButtons.forEach(el => {
            el.addEventListener('click', () => closeModal());
        });

        state.createButtonEl?.addEventListener('click', handleCreateArchiveClick);
        state.saveButtonEl?.addEventListener('click', handleSaveSelection);

        modalWrapper.addEventListener('click', (event) => {
            if (event.target?.dataset?.archiveModalDismiss !== undefined) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (state.isOpen && event.key === 'Escape') {
                closeModal();
            }
        });
    }

    function getDefaultArchiveId(systemId) {
        if (!systemId) return null;
        const match = state.archives.find(archive => archive.systemId === systemId);
        if (match) {
            return match.id;
        }
        const fallback = DEFAULT_ARCHIVES.find(item => item.systemId === systemId);
        return fallback?.id || null;
    }

    function buildEntityKey(descriptor) {
        if (!descriptor || !descriptor.entityType) {
            return null;
        }
        const type = String(descriptor.entityType || '').toLowerCase();
        const ui = getUiUtils();
        const slugify = (value) => {
            if (!value) return '';
            if (ui && typeof ui.createAutomationSlug === 'function') {
                return ui.createAutomationSlug(value);
            }
            return String(value).trim().toLowerCase().replace(/\s+/g, '-');
        };

        if (type === 'place') {
            if (!descriptor.placeId) return null;
            return `place:${descriptor.placeId}`;
        }
        if (type === 'group') {
            if (!descriptor.listId || !descriptor.placeId || !descriptor.itemName) {
                return null;
            }
            const itemSlug = slugify(descriptor.itemName);
            return `group:${descriptor.listId}:${descriptor.placeId}:${itemSlug}`;
        }
        if (type === 'review') {
            if (!descriptor.listId || !descriptor.reviewId) return null;
            return `review:${descriptor.listId}:${descriptor.reviewId}`;
        }
        return null;
    }

    function dispatchArchiveUpdated(entityKey, archiveIds = []) {
        if (!entityKey) {
            return;
        }
        window.dispatchEvent(new CustomEvent('archive:updated', {
            detail: {
                entityKey,
                archiveIds: Array.isArray(archiveIds) ? [...archiveIds] : []
            }
        }));
    }

    function shouldDefaultToWishlist(descriptor) {
        if (!descriptor) return false;
        const type = descriptor.entityType;
        if (type === 'place' || type === 'group') {
            return true;
        }
        return false;
    }

    function sanitizeDescriptor(rawDescriptor) {
        const descriptor = { ...(rawDescriptor || {}) };
        descriptor.entityType = String(descriptor.entityType || '').toLowerCase();
        descriptor.title = descriptor.title ? String(descriptor.title).trim() : '';
        descriptor.subtitle = descriptor.subtitle ? String(descriptor.subtitle).trim() : '';
        descriptor.imageUrl = descriptor.imageUrl ? String(descriptor.imageUrl) : '';
        descriptor.context = descriptor.context || {};
        descriptor.entityKey = buildEntityKey(descriptor);
        if (!descriptor.entityKey) {
            throw new Error('No se pudo preparar el elemento a guardar.');
        }
        return descriptor;
    }

    async function ensureDefaultArchives(userId) {
        if (!userId) return;
        const db = getDb();
        if (!db) {
            throw new Error('Servicio de base de datos no disponible.');
        }
        const archivesRef = db.collection('users').doc(userId).collection('archives');
        const now = FIELD_VALUE().serverTimestamp();

        const checks = await Promise.all(DEFAULT_ARCHIVES.map(defaultArchive => archivesRef.doc(defaultArchive.id).get()));
        const batch = db.batch();
        let needsCommit = false;

        DEFAULT_ARCHIVES.forEach((defaultArchive, index) => {
            const docSnap = checks[index];
            if (!docSnap.exists) {
                batch.set(archivesRef.doc(defaultArchive.id), {
                    name: defaultArchive.name,
                    description: defaultArchive.description || '',
                    isSystem: true,
                    systemId: defaultArchive.systemId,
                    sortOrder: defaultArchive.sortOrder || 0,
                    nameLower: defaultArchive.name.toLowerCase(),
                    createdAt: now,
                    updatedAt: now,
                    itemsCount: 0
                });
                needsCommit = true;
            }
        });

        if (needsCommit) {
            await batch.commit();
        }
    }

    async function loadArchives(userId) {
        if (!userId) return [];
        const db = getDb();
        if (!db) {
            throw new Error('Servicio de base de datos no disponible.');
        }
        const archivesRef = db.collection('users').doc(userId).collection('archives');
        const snapshot = await archivesRef
            .orderBy('sortOrder', 'asc')
            .orderBy('nameLower', 'asc')
            .get();

        const archives = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            return {
                id: doc.id,
                name: data.name || 'Archivo',
                description: data.description || '',
                isSystem: Boolean(data.isSystem),
                systemId: data.systemId || null,
                sortOrder: data.sortOrder ?? 100,
                itemsCount: data.itemsCount ?? 0,
                nameLower: data.nameLower || data.name?.toLowerCase?.() || ''
            };
        });

        return archives;
    }

    async function fetchEntityMembership(userId, entityKey) {
        if (!userId || !entityKey) {
            return [];
        }
        const db = getDb();
        if (!db) {
            throw new Error('Servicio de base de datos no disponible.');
        }
        const indexRef = db.collection('users').doc(userId).collection('archiveIndex').doc(entityKey);
        const doc = await indexRef.get();
        if (!doc.exists) {
            return [];
        }
        const data = doc.data() || {};
        return Array.isArray(data.archiveIds) ? data.archiveIds : [];
    }

    function toggleLoading(isLoading) {
        if (state.loadingEl) {
            state.loadingEl.toggleAttribute('hidden', !isLoading);
            state.loadingEl.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
            state.loadingEl.classList.toggle('is-active', Boolean(isLoading));
        }
        if (state.emptyEl && isLoading) {
            state.emptyEl.setAttribute('hidden', '');
        }
        if (state.saveButtonEl) {
            state.saveButtonEl.disabled = isLoading || state.isSaving;
        }
        if (state.createButtonEl) {
            state.createButtonEl.disabled = isLoading || state.isSaving;
        }
        if (state.createInputEl) {
            state.createInputEl.disabled = isLoading || state.isSaving;
        }
        if (state.archivesListEl) {
            state.archivesListEl.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        }
    }

    function redirectToArchivePageIfNeeded() {
        if (typeof window === 'undefined' || !window.location) {
            return;
        }
        const currentPage = (window.location.pathname || '').split('/').pop();
        if (currentPage === 'archive.html') {
            return;
        }
        window.location.assign('archive.html');
    }

    function renderArchiveList() {
        if (!state.archivesListEl) {
            return;
        }

        state.archivesListEl.innerHTML = '';

        if (!Array.isArray(state.archives) || state.archives.length === 0) {
            if (state.emptyEl) {
                state.emptyEl.hidden = false;
            }
            return;
        }

        if (state.emptyEl) {
            state.emptyEl.hidden = true;
        }

        const fragment = document.createDocumentFragment();

        state.archives.forEach(archive => {
            const option = document.createElement('label');
            option.className = 'archive-option';

            const checkboxId = `archive-option-${archive.id}`;
            option.innerHTML = `
                <input type="checkbox" id="${checkboxId}" value="${archive.id}">
                <div class="archive-option__content">
                    <span class="archive-option__name">${escapeHtml(archive.name)}</span>
                    ${archive.description ? `<span class="archive-option__description">${escapeHtml(archive.description)}</span>` : ''}
                </div>
                ${archive.isSystem ? '<span class="archive-option__badge">Predeterminado</span>' : ''}
            `;
            const checkbox = option.querySelector('input[type="checkbox"]');
            checkbox.checked = state.selectedArchiveIds.has(archive.id);
            option.classList.toggle('is-selected', checkbox.checked);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    state.selectedArchiveIds.add(archive.id);
                } else {
                    state.selectedArchiveIds.delete(archive.id);
                }
                option.classList.toggle('is-selected', checkbox.checked);
            });
            fragment.appendChild(option);
        });

        state.archivesListEl.appendChild(fragment);
        enableSaveButtonIfReady();
    }

    function enableSaveButtonIfReady() {
        if (!state.saveButtonEl) return;
        state.saveButtonEl.disabled = state.isSaving || !state.currentEntity;
    }

    async function ensureUserIdAvailable() {
        const auth = getAuth();
        if (!auth) {
            throw new Error('Servicio de autenticación no disponible.');
        }
        let user = auth.currentUser;
        if (user) {
            state.userId = user.uid;
            return user.uid;
        }
        if (window.ListopicApp?.authService?.onAuthStateChangedPromise) {
            user = await window.ListopicApp.authService.onAuthStateChangedPromise();
        }
        if (!user) {
            throw new Error('Debes iniciar sesión para guardar en tus archivos.');
        }
        state.userId = user.uid;
        return user.uid;
    }

    async function openSaveModal(descriptor) {
        try {
            const userId = await ensureUserIdAvailable();
            const preparedDescriptor = sanitizeDescriptor(descriptor);

            createModalIfNeeded();

            document.body.classList.add('modal-open');
            state.modalEl.classList.add('is-open');
            state.modalEl.setAttribute('aria-hidden', 'false');
            state.isOpen = true;
            state.isSaving = false;
            state.currentEntity = preparedDescriptor;
            state.selectedArchiveIds = new Set();
            state.membership = [];

            toggleLoading(true);
            state.archives = [];
            state.archivesListEl.innerHTML = '';
            enableSaveButtonIfReady();

            await ensureDefaultArchives(userId);
            state.archives = await loadArchives(userId);
            state.membership = await fetchEntityMembership(userId, preparedDescriptor.entityKey);
            state.membership.forEach(id => state.selectedArchiveIds.add(id));

            if (state.selectedArchiveIds.size === 0 && shouldDefaultToWishlist(preparedDescriptor)) {
                const wishlistId = getDefaultArchiveId('WANT_TO_GO');
                if (wishlistId) {
                    state.selectedArchiveIds.add(wishlistId);
                }
            }

            toggleLoading(false);
            renderArchiveList();

            if (state.modalDialogEl) {
                state.modalDialogEl.focus();
            }
        } catch (error) {
            console.error('[archiveService] Error opening archive modal', error);
            showNotification(error.message || 'No se pudo abrir tus archivos.', 'error');
            closeModal();
        }
    }

    function closeModal() {
        if (!state.modalEl) {
            return;
        }
        toggleLoading(false);
        state.modalEl.classList.remove('is-open');
        state.modalEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        state.isOpen = false;
        state.isSaving = false;
        state.currentEntity = null;
        state.selectedArchiveIds.clear();
        state.membership = [];
    }

    async function handleCreateArchiveClick() {
        if (!state.createInputEl || !state.createButtonEl) {
            return;
        }
        const rawName = state.createInputEl.value.trim();
        if (!rawName) {
            showNotification('Escribe un nombre para el nuevo archivo.', 'warning');
            state.createInputEl.focus();
            return;
        }
        if (rawName.length < 3) {
            showNotification('El nombre debe tener al menos 3 caracteres.', 'warning');
            state.createInputEl.focus();
            return;
        }

        const lowerName = rawName.toLowerCase();
        if (state.archives.some(archive => archive.nameLower === lowerName)) {
            showNotification('Ya tienes un archivo con ese nombre.', 'warning');
            state.createInputEl.focus();
            return;
        }

        try {
            state.isSaving = true;
            toggleLoading(true);

            const db = getDb();
            if (!db) {
                throw new Error('Servicio de base de datos no disponible.');
            }
            const userId = state.userId;
            if (!userId) {
                throw new Error('Usuario no disponible.');
            }

            const archivesRef = db.collection('users').doc(userId).collection('archives');
            const now = FIELD_VALUE().serverTimestamp();
            const newArchiveRef = await archivesRef.add({
                name: rawName,
                nameLower: lowerName,
                description: '',
                isSystem: false,
                systemId: null,
                sortOrder: 100 + state.archives.length,
                createdAt: now,
                updatedAt: now,
                itemsCount: 0
            });

            state.createInputEl.value = '';

            state.archives = await loadArchives(userId);
            state.selectedArchiveIds.add(newArchiveRef.id);
            renderArchiveList();
            showNotification('Archivo creado correctamente.', 'success');
        } catch (error) {
            console.error('[archiveService] Error creating archive', error);
            showNotification(error.message || 'No se pudo crear el archivo.', 'error');
        } finally {
            state.isSaving = false;
            toggleLoading(false);
        }
    }

    function buildItemData(descriptor, timestamp) {
        return {
            entityType: descriptor.entityType,
            entityKey: descriptor.entityKey,
            placeId: descriptor.placeId || null,
            listId: descriptor.listId || null,
            reviewId: descriptor.reviewId || null,
            itemName: descriptor.itemName || null,
            title: descriptor.title || '',
            subtitle: descriptor.subtitle || '',
            imageUrl: descriptor.imageUrl || '',
            context: descriptor.context || {},
            createdAt: timestamp,
            updatedAt: timestamp,
            lastInteractionAt: timestamp
        };
    }

    async function updateEntityMembership(userId, descriptor, targetArchiveIds) {
        const db = getDb();
        if (!db) {
            throw new Error('Servicio de base de datos no disponible.');
        }
        if (!userId) {
            throw new Error('Usuario no disponible.');
        }

        const entityKey = descriptor.entityKey || buildEntityKey(descriptor);
        if (!entityKey) {
            throw new Error('No se pudo determinar el elemento a guardar.');
        }

        const userRef = db.collection('users').doc(userId);
        const indexRef = userRef.collection('archiveIndex').doc(entityKey);
        const snapshot = await indexRef.get();
        const currentArchiveIds = snapshot.exists && Array.isArray(snapshot.data()?.archiveIds)
            ? snapshot.data().archiveIds
            : [];

        const desired = Array.isArray(targetArchiveIds) ? targetArchiveIds : [];
        const toAdd = desired.filter(id => !currentArchiveIds.includes(id));
        const toRemove = currentArchiveIds.filter(id => !desired.includes(id));

        if (toAdd.length === 0 && toRemove.length === 0) {
            return { toAdd, toRemove };
        }

        const batch = db.batch();
        const now = FIELD_VALUE().serverTimestamp();

        toAdd.forEach(archiveId => {
            const archiveRef = userRef.collection('archives').doc(archiveId);
            const itemRef = archiveRef.collection('items').doc(entityKey);
            const itemData = buildItemData(descriptor, now);
            batch.set(itemRef, itemData, { merge: true });
            batch.set(archiveRef, {
                updatedAt: now,
                itemsCount: FIELD_VALUE().increment(1)
            }, { merge: true });
        });

        toRemove.forEach(archiveId => {
            const archiveRef = userRef.collection('archives').doc(archiveId);
            const itemRef = archiveRef.collection('items').doc(entityKey);
            batch.delete(itemRef);
            batch.set(archiveRef, {
                updatedAt: now,
                itemsCount: FIELD_VALUE().increment(-1)
            }, { merge: true });
        });

        if (desired.length > 0) {
            const indexData = {
                entityKey,
                entityType: descriptor.entityType,
                archiveIds: desired,
                title: descriptor.title || '',
                subtitle: descriptor.subtitle || '',
                imageUrl: descriptor.imageUrl || '',
                metadata: {
                    placeId: descriptor.placeId || null,
                    listId: descriptor.listId || null,
                    reviewId: descriptor.reviewId || null,
                    itemName: descriptor.itemName || null,
                    context: descriptor.context || {}
                },
                updatedAt: now
            };
            batch.set(indexRef, indexData, { merge: true });
        } else {
            batch.delete(indexRef);
        }

        await batch.commit();
        return { toAdd, toRemove };
    }

    async function handleSaveSelection() {
        if (!state.currentEntity || state.isSaving) {
            return;
        }
        try {
            state.isSaving = true;
            if (state.saveButtonEl) {
                state.saveButtonEl.disabled = true;
                state.saveButtonEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Guardando&hellip;`;
            }
            const targetArchiveIds = Array.from(state.selectedArchiveIds);
            await updateEntityMembership(state.userId, state.currentEntity, targetArchiveIds);
            state.membership = targetArchiveIds;
            dispatchArchiveUpdated(state.currentEntity.entityKey, targetArchiveIds);
            showNotification('Elemento actualizado en tus archivos.', 'success');
            closeModal();
            redirectToArchivePageIfNeeded();
        } catch (error) {
            console.error('[archiveService] Error guardando selección', error);
            showNotification(error.message || 'No se pudo guardar en tus archivos.', 'error');
        } finally {
            state.isSaving = false;
            if (state.saveButtonEl) {
                state.saveButtonEl.innerHTML = 'Guardar';
                state.saveButtonEl.disabled = false;
            }
        }
    }

    async function moveEntityBetweenArchives(userId, descriptor, fromArchiveId, toArchiveId) {
        if (!userId || !descriptor || !fromArchiveId || !toArchiveId) {
            return;
        }
        const membership = await fetchEntityMembership(userId, descriptor.entityKey || buildEntityKey(descriptor));
        if (!membership.includes(fromArchiveId)) {
            return;
        }
        const target = membership.filter(id => id !== fromArchiveId);
        if (!target.includes(toArchiveId)) {
            target.push(toArchiveId);
        }
        await updateEntityMembership(userId, descriptor, target);
        dispatchArchiveUpdated(descriptor.entityKey || buildEntityKey(descriptor), target);
    }

    async function handleReviewSubmission(options = {}) {
        try {
            const userId = options.userId || await ensureUserIdAvailable();
            if (!userId) {
                return;
            }
            await ensureDefaultArchives(userId);
            state.archives = await loadArchives(userId);
            const wantId = getDefaultArchiveId('WANT_TO_GO');
            const wentId = getDefaultArchiveId('ALREADY_WENT');
            if (!wantId || !wentId) {
                return;
            }
            const tasks = [];
            if (options.placeId) {
                const placeDescriptor = sanitizeDescriptor({
                    entityType: 'place',
                    placeId: options.placeId,
                    title: options.placeName || 'Lugar guardado',
                    subtitle: options.listName ? `Lista: ${options.listName}` : '',
                    imageUrl: options.placeImageUrl || '',
                    context: {
                        listId: options.listId || null,
                        lastReviewId: options.reviewId || null,
                        lastReviewCreatedAt: options.createdAt || null,
                        listName: options.listName || '',
                        placeName: options.placeName || ''
                    }
                });
                tasks.push(moveEntityBetweenArchives(userId, placeDescriptor, wantId, wentId));
            }
            if (options.placeId && options.itemName && options.listId) {
                const groupDescriptor = sanitizeDescriptor({
                    entityType: 'group',
                    placeId: options.placeId,
                    listId: options.listId,
                    itemName: options.itemName,
                    title: options.itemName,
                    subtitle: options.placeName || '',
                    imageUrl: options.placeImageUrl || '',
                    context: {
                        listName: options.listName || '',
                        placeName: options.placeName || '',
                        lastReviewId: options.reviewId || null,
                        lastReviewCreatedAt: options.createdAt || null
                    }
                });
                tasks.push(moveEntityBetweenArchives(userId, groupDescriptor, wantId, wentId));
            }
            await Promise.all(tasks);
        } catch (error) {
            console.error('[archiveService] Error al mover elemento tras reseña', error);
        }
    }

    async function ensureDefaultArchivesReady() {
        const userId = await ensureUserIdAvailable();
        if (!userId) {
            throw new Error('Usuario no disponible.');
        }
        await ensureDefaultArchives(userId);
    }

    async function getEntityArchiveIds(descriptor) {
        try {
            const userId = await ensureUserIdAvailable();
            if (!userId) {
                return [];
            }
            const prepared = sanitizeDescriptor(descriptor);
            if (!prepared.entityKey) {
                return [];
            }
            await ensureDefaultArchives(userId);
            return fetchEntityMembership(userId, prepared.entityKey) || [];
        } catch (error) {
            console.error('[archiveService] Error obteniendo archivos para elemento', error);
            return [];
        }
    }

    async function isEntitySaved(descriptor) {
        const memberships = await getEntityArchiveIds(descriptor);
        return Array.isArray(memberships) && memberships.length > 0;
    }

    async function setEntityArchiveMembership(descriptor, archiveIds = []) {
        const normalizedIds = Array.isArray(archiveIds) ? archiveIds.filter(Boolean) : [];
        const userId = await ensureUserIdAvailable();
        if (!userId) {
            throw new Error('Usuario no disponible.');
        }
        await ensureDefaultArchives(userId);
        const prepared = sanitizeDescriptor(descriptor);
        await updateEntityMembership(userId, prepared, normalizedIds);
        dispatchArchiveUpdated(prepared.entityKey, normalizedIds);
    }

    return {
        openSaveModal,
        closeModal,
        handleReviewSubmission,
        ensureDefaultArchivesReady,
        getEntityArchiveIds,
        isEntitySaved,
        setEntityArchiveMembership,
        __test: {
            buildEntityKey,
            dispatchArchiveUpdated
        }
    };
})();
