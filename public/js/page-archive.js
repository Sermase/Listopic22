window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageArchive = (() => {
    const state = {
        currentUser: null,
        archiveListener: null,
        containerEl: null,
    };

    const getServices = () => window.ListopicApp?.services || {};

    const showNotification = (message, type = 'info') => {
        const notifier = getServices().showNotification;
        if (typeof notifier === 'function') {
            notifier(message, type);
        } else if (type === 'error') {
            console.error('[pageArchive]', message);
        } else {
            console.log('[pageArchive]', message);
        }
    };

    const buildItemDescriptor = (itemData = {}) => ({
        entityType: itemData.entityType || 'place',
        placeId: itemData.placeId || null,
        listId: itemData.listId || null,
        reviewId: itemData.reviewId || null,
        itemName: itemData.itemName || null,
        title: itemData.title || '',
        subtitle: itemData.subtitle || '',
        imageUrl: itemData.imageUrl || '',
        context: itemData.context || {}
    });

    const resolveItemLink = (item) => {
        if (item.entityType === 'review' && item.listId && item.reviewId) {
            const params = new URLSearchParams({ listId: item.listId, id: item.reviewId });
            return `detail-view.html?${params.toString()}`;
        }
        if (item.entityType === 'group' && item.listId && item.placeId) {
            const params = new URLSearchParams({
                listId: item.listId,
                placeId: item.placeId,
            });
            if (item.itemName) {
                params.set('item', item.itemName);
            }
            return `grouped-detail-view.html?${params.toString()}`;
        }
        if (item.placeId) {
            return `place-detail.html?placeId=${encodeURIComponent(item.placeId)}`;
        }
        return null;
    };

    const renderArchives = (archives = []) => {
        if (!state.containerEl) {
            return;
        }
        if (!Array.isArray(archives) || archives.length === 0) {
            state.containerEl.innerHTML = '<p class="empty-placeholder">Todavía no tienes archivos personales. Empieza guardando un lugar, grupo o reseña.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();

        archives.forEach((archive) => {
            const section = document.createElement('section');
            section.className = 'archive-section';

            const header = document.createElement('header');
            header.className = 'archive-section__header';
            header.innerHTML = `
                <div>
                    <h2>${ListopicApp.uiUtils?.escapeHtml(archive.name || 'Archivo')}</h2>
                    <p class="archive-section__description">${ListopicApp.uiUtils?.escapeHtml(archive.description || '')}</p>
                </div>
                <span class="archive-section__count">${archive.items.length} elemento${archive.items.length === 1 ? '' : 's'}</span>
            `;
            section.appendChild(header);

            const itemsWrapper = document.createElement('div');
            itemsWrapper.className = 'archive-items';

            if (archive.items.length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'empty-placeholder';
                emptyMsg.textContent = 'No hay elementos guardados en este archivo.';
                itemsWrapper.appendChild(emptyMsg);
            } else {
                archive.items.forEach((itemDoc) => {
                    itemsWrapper.appendChild(createItemCard(archive.id, itemDoc));
                });
            }

            section.appendChild(itemsWrapper);
            fragment.appendChild(section);
        });

        state.containerEl.innerHTML = '';
        state.containerEl.appendChild(fragment);
    };

    const createItemCard = (archiveId, itemData) => {
        const descriptor = buildItemDescriptor(itemData);
        const card = document.createElement('article');
        card.className = 'archive-item-card';

        const mediaUrl = descriptor.imageUrl || 'img/listopic-logo.png';
        const link = resolveItemLink(itemData);

        card.innerHTML = `
            <div class="archive-item-card__media">
                <img src="${mediaUrl}" alt="${ListopicApp.uiUtils?.escapeHtml(descriptor.title || 'Elemento guardado')}" loading="lazy">
            </div>
            <div class="archive-item-card__body">
                <div class="archive-item-card__titles">
                    <h3>${ListopicApp.uiUtils?.escapeHtml(descriptor.title || 'Elemento guardado')}</h3>
                    <p class="archive-item-card__subtitle">${ListopicApp.uiUtils?.escapeHtml(descriptor.subtitle || '')}</p>
                </div>
                <div class="archive-item-card__meta">
                    <span class="archive-item-card__badge">${descriptor.entityType || 'elemento'}</span>
                    ${descriptor.context?.listName ? `<span class="archive-item-card__badge archive-item-card__badge--accent">${ListopicApp.uiUtils?.escapeHtml(descriptor.context.listName)}</span>` : ''}
                </div>
                <div class="archive-item-card__actions">
                    ${link ? `<a class="button secondary-button" href="${link}"><i class="fas fa-arrow-up-right-from-square"></i> Ver detalle</a>` : ''}
                    <button type="button" class="button secondary-button manage-button"><i class="fas fa-folder-open"></i> Gestionar</button>
                    <button type="button" class="button danger remove-button"><i class="fas fa-trash-alt"></i> Quitar</button>
                </div>
            </div>
        `;

        const manageBtn = card.querySelector('.manage-button');
        manageBtn?.addEventListener('click', () => {
            try {
                window.ListopicApp.archiveService.openSaveModal({ ...descriptor });
            } catch (error) {
                console.error('[pageArchive] Error al abrir el modal del archivo:', error);
                showNotification(error.message || 'No se pudo abrir El Archivo.', 'error');
            }
        });

        const removeBtn = card.querySelector('.remove-button');
        removeBtn?.addEventListener('click', async () => {
            if (removeBtn.disabled) {
                return;
            }
            const originalRemoveLabel = removeBtn.innerHTML;
            removeBtn.disabled = true;
            removeBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Quitando...';
            try {
                const membership = await window.ListopicApp.archiveService.getEntityArchiveIds(descriptor);
                const target = membership.filter((id) => id !== archiveId);
                await window.ListopicApp.archiveService.setEntityArchiveMembership(descriptor, target);
                showNotification('Elemento eliminado del archivo.', 'success');
            } catch (error) {
                console.error('[pageArchive] Error al eliminar elemento del archivo:', error);
                showNotification(error.message || 'No se pudo eliminar el elemento.', 'error');
            } finally {
                removeBtn.disabled = false;
                removeBtn.innerHTML = originalRemoveLabel;
            }
        });

        return card;
    };

    const fetchArchivesWithItems = async (userId) => {
        const services = getServices();
        const db = services.db;
        if (!db) {
            throw new Error('Servicio de base de datos no disponible.');
        }
        const archivesRef = db.collection('users').doc(userId).collection('archives');
        const archivesSnap = await archivesRef
            .orderBy('sortOrder', 'asc')
            .orderBy('nameLower', 'asc')
            .get();

        const archives = [];
        for (const doc of archivesSnap.docs) {
            const data = doc.data() || {};
            let itemsSnap;
            try {
                itemsSnap = await archivesRef.doc(doc.id).collection('items').orderBy('lastInteractionAt', 'desc').get();
            } catch (error) {
                itemsSnap = await archivesRef.doc(doc.id).collection('items').get();
            }
            const items = itemsSnap.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
            archives.push({
                id: doc.id,
                name: data.name || 'Archivo',
                description: data.description || '',
                isSystem: Boolean(data.isSystem),
                items
            });
        }
        return archives;
    };

    const refreshView = async () => {
        if (!state.currentUser || !state.containerEl) {
            return;
        }
        state.containerEl.innerHTML = '<p class="loading-placeholder">Actualizando archivo...</p>';
        try {
            if (window.ListopicApp.archiveService?.ensureDefaultArchivesReady) {
                await window.ListopicApp.archiveService.ensureDefaultArchivesReady();
            }
            const archives = await fetchArchivesWithItems(state.currentUser.uid);
            renderArchives(archives);
        } catch (error) {
            console.error('[pageArchive] Error cargando el archivo del usuario:', error);
            state.containerEl.innerHTML = `<p class="error-placeholder">${error.message || 'No se pudo cargar el archivo.'}</p>`;
        }
    };

    const handleArchiveEvent = () => {
        refreshView();
    };

    const init = async () => {
        try {
            const services = getServices();
            if (!services.auth || !services.db) {
                throw new Error('Servicios esenciales no disponibles.');
            }
            state.containerEl = document.getElementById('archive-content');
            if (!state.containerEl) {
                throw new Error('Contenedor principal del archivo no encontrado.');
            }
            state.containerEl.innerHTML = '<p class="loading-placeholder">Cargando tu archivo...</p>';

            const user = await ListopicApp.authService.onAuthStateChangedPromise();
            if (!user) {
                window.location.href = 'auth.html?redirect=archive.html';
                return;
            }
            state.currentUser = user;
            await refreshView();

            window.addEventListener('archive:updated', handleArchiveEvent);
        } catch (error) {
            console.error('[pageArchive] Error inicializando la página del archivo:', error);
            showNotification(error.message || 'No se pudo abrir tu archivo.', 'error');
            if (state.containerEl) {
                state.containerEl.innerHTML = `<p class="error-placeholder">${error.message || 'No se pudo abrir tu archivo.'}</p>`;
            }
        }
    };

    return {
        init
    };
})();
