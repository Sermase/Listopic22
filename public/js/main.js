window.ListopicApp = window.ListopicApp || {};

// Initialize shared state container
ListopicApp.state = {
    currentListId: null,
    selectedFileForUpload: null,
    currentSelectedPlaceInfo: null,
    userLatitude: null,
    userLongitude: null,
    currentListNameForSearch: '',
    currentListCriteriaDefinitions: {}, // Cambiado a objeto/mapa
    currentGroupDetailListId: null,
    // MODIFICADO: Nombres de estado para grouped-detail-view
    currentGroupDetailEstablishment: null,
    currentGroupDetailItem: null,
    currentGroupDetailCriteriaDefinition: {}, // Usar el mapa de criterios
    lightboxImageUrls: [],
    currentLightboxImageIndex: 0,
    // Firebase services no deberÃƒÂ­an estar en state, se acceden desde ListopicApp.services
    globalRealtimeInitialized: false,
    globalRealtimeCleanup: [],
    notificationsCache: []
};
ListopicApp.reviewActions = (() => {
    let initialized = false;

    const closeAllMenus = (exceptionElement) => {
        const dropdowns = document.querySelectorAll('.review-menu__dropdown');
        dropdowns.forEach(dropdown => {
            if (dropdown === exceptionElement) {
                return;
            }
            dropdown.classList.remove('open');
            const btn = dropdown.parentElement?.querySelector('.review-menu__btn');
            if (btn) {
                btn.setAttribute('aria-expanded', 'false');
            }
        });
        if (!exceptionElement) {
            document.querySelectorAll('.review-menu__btn[aria-expanded="true"]').forEach(btn => {
                btn.setAttribute('aria-expanded', 'false');
            });
        }
    };

    const decodeDatasetValue = (() => {
        let textarea = null;
        return (value) => {
            if (typeof value !== 'string') {
                return '';
            }
            if (!textarea) {
                textarea = document.createElement('textarea');
            }
            textarea.innerHTML = value;
            return textarea.value;
        };
    })();

    const getReviewData = (card) => {
        if (!card) {
            return null;
        }
        const dataset = card.dataset || {};
        return {
            reviewId: decodeDatasetValue(dataset.reviewId || ''),
            listId: decodeDatasetValue(dataset.listId || ''),
            authorId: decodeDatasetValue(dataset.authorId || ''),
            authorName: decodeDatasetValue(dataset.authorName || ''),
            listName: decodeDatasetValue(dataset.listName || ''),
            itemName: decodeDatasetValue(dataset.itemName || ''),
            placeId: decodeDatasetValue(dataset.placeId || ''),
            placeName: decodeDatasetValue(dataset.placeName || ''),
            detailUrl: decodeDatasetValue(dataset.detailUrl || ''),
            overallRating: decodeDatasetValue(dataset.overallRating || ''),
            photoUrl: decodeDatasetValue(dataset.photoUrl || ''),
            comment: decodeDatasetValue(dataset.comment || ''),
            isOwner: dataset.isOwner === '1',
            element: card
        };
    };

    const handleShareFallback = async (detailUrl) => {
        try {
            const absoluteUrl = detailUrl ? new URL(detailUrl, window.location.href).href : window.location.href;
            if (navigator.share) {
                await navigator.share({ title: 'Listopic', url: absoluteUrl });
                return true;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(absoluteUrl);
                return true;
            }
            window.prompt('Copia el enlace de la rese\u00f1a:', absoluteUrl);
            return true;
        } catch (error) {
            console.error('[reviewActions] Error en compartir fallback:', error);
            return false;
        }
    };

    const buildArchiveDescriptorFromReview = (data) => {
        if (!data || !data.reviewId || !data.listId) {
            return null;
        }
        return {
            entityType: 'review',
            listId: data.listId,
            reviewId: data.reviewId,
            title: data.itemName || 'Reseña guardada',
            subtitle: data.listName ? `Lista: ${data.listName}` : '',
            imageUrl: data.photoUrl || '',
            context: {
                listId: data.listId || null,
                listName: data.listName || '',
                itemName: data.itemName || '',
                placeId: data.placeId || null,
                placeName: data.placeName || '',
                authorId: data.authorId || null,
                authorName: data.authorName || '',
                detailUrl: data.detailUrl || '',
                overallRating: data.overallRating || ''
            }
        };
    };

    const handleActionClick = async (action, card) => {
        const data = getReviewData(card);
        if (!data) {
            return;
        }
        const services = window.ListopicApp?.services || {};
        const notify = services.showNotification || (() => {});

        if (action === 'save') {
            const archiveService = window.ListopicApp?.archiveService;
            if (!archiveService || typeof archiveService.openSaveModal !== 'function') {
                notify('No se pudo abrir El Archivo.', 'error');
                return;
            }
            const descriptor = buildArchiveDescriptorFromReview(data);
            if (!descriptor) {
                notify('No se pudo preparar esta reseña para guardar.', 'error');
                return;
            }
            try {
                archiveService.openSaveModal(descriptor);
            } catch (error) {
                console.error('[reviewActions] Error al abrir El Archivo desde el menú de reseña:', error);
                notify(error.message || 'No se pudo abrir El Archivo.', 'error');
            }
            return;
        }

        if (action === 'share') {
            if (window.ListopicApp?.reviewShare?.open) {
                window.ListopicApp.reviewShare.open(data);
            } else {
                const success = await handleShareFallback(data.detailUrl);
                if (success) {
                    notify('Enlace preparado para compartir.', 'success');
                } else {
                    notify('No se pudo compartir la rese\u00f1a.', 'error');
                }
            }
            return;
        }

        if (action === 'edit') {
            if (!data.isOwner) {
                notify('Solo puedes editar tus rese\u00f1as.', 'warning');
                return;
            }
            if (!data.listId || !data.reviewId) {
                notify('No se pudo abrir el editor.', 'error');
                return;
            }
            const url = `review-form.html?listId=${encodeURIComponent(data.listId)}&editId=${encodeURIComponent(data.reviewId)}`;
            window.location.href = url;
            return;
        }

        if (action === 'delete') {
            if (!data.isOwner) {
                notify('Solo puedes eliminar tus rese\u00f1as.', 'warning');
                return;
            }
            if (!data.listId || !data.reviewId) {
                notify('No se pudo eliminar la rese\u00f1a.', 'error');
                return;
            }
            const confirmed = window.confirm('Eliminar esta rese\u00f1a? Esta accion no se puede deshacer.');
            if (!confirmed) {
                return;
            }
            try {
                if (!services.db) {
                    throw new Error('Servicio de base de datos no disponible.');
                }
                await services.db.collection('lists').doc(data.listId).collection('reviews').doc(data.reviewId).delete();
                data.element?.remove();
                notify('rese\u00f1a eliminada.', 'success');
            } catch (error) {
                console.error('[reviewActions] Error eliminando rese\u00f1a:', error);
                notify(error.message || 'No se pudo eliminar la rese\u00f1a.', 'error');
            }
        }
    };

    const onDocumentClick = (event) => {
        const toggleBtn = event.target.closest('.review-menu__btn');
        const actionBtn = event.target.closest('.review-action');

        if (toggleBtn) {
            event.preventDefault();
            event.stopPropagation();
            const menu = toggleBtn.closest('.review-menu');
            const dropdown = menu?.querySelector('.review-menu__dropdown');
            if (!dropdown) {
                return;
            }
            const isOpen = dropdown.classList.contains('open');
            closeAllMenus(dropdown);
            if (!isOpen) {
                dropdown.classList.add('open');
                toggleBtn.setAttribute('aria-expanded', 'true');
            } else {
                dropdown.classList.remove('open');
                toggleBtn.setAttribute('aria-expanded', 'false');
            }
            return;
        }

        if (actionBtn) {
            event.preventDefault();
            event.stopPropagation();
            const dropdown = actionBtn.closest('.review-menu__dropdown');
            if (dropdown) {
                const btn = dropdown.parentElement?.querySelector('.review-menu__btn');
                btn?.setAttribute('aria-expanded', 'false');
            }
            closeAllMenus();
            const card = actionBtn.closest('.review-super-card');
            const action = actionBtn.dataset.action;
            if (action && card) {
                handleActionClick(action, card);
            }
            return;
        }

        if (!event.target.closest('.review-menu')) {
            closeAllMenus();
        }
    };

    const onDocumentKeydown = (event) => {
        if (event.key === 'Escape') {
            closeAllMenus();
        }
    };

    const init = () => {
        if (initialized) {
            return;
        }
        initialized = true;
        document.addEventListener('click', onDocumentClick, true);
        document.addEventListener('keydown', onDocumentKeydown);
    };

    return {
        init,
        closeMenus: closeAllMenus,
        getReviewData
    };
})();
ListopicApp.reviewShare = (() => {
    let modal;
    let closeButton;
    let linkInput;
    let copyButton;
    let nativeShareButton;
    let subtitleElement;
    let feedbackElement;
    let chatFeedbackElement;
    let chatsContainer;
    let chatsListElement;
    let chatsLoadingElement;
    let chatsEmptyElement;
    let storySection;
    let storyButton;
    let storyButtonDefaultHTML = '';
    let storyDownloadLink;
    let storyFeedbackElement;
    let storyColorSelect;
    let storyStyleSelect;
    let storyCustomization = null;
    let storyContextCache = null;
    let isInitialized = false;
    let currentData = null;
    let currentLink = '';
    let chatsCache = null;
    let chatsCacheFetchedAt = 0;
    const CHATS_CACHE_TTL = 60 * 1000;

    const ensureModal = () => {
        if (isInitialized) {
            return;
        }
        createModal();
        isInitialized = true;
    };

    const getStoryModule = () => window.ListopicApp?.storyShare || null;

    const getStoryDefaults = () => getStoryModule()?.getDefaultCustomization?.() || { colorScheme: 'midnight', graphicStyle: 'radar' };

    const populateStoryOptions = () => {
        if (!storyColorSelect || !storyStyleSelect) {
            return;
        }
        const module = getStoryModule();
        const colorOptions = module?.getColorSchemeOptions?.() || [
            { value: 'midnight', label: 'Aurora nocturna' },
            { value: 'sunset', label: 'Atardecer brillante' },
            { value: 'ocean', label: 'Olas frías' },
            { value: 'forest', label: 'Bosque vivo' }
        ];
        storyColorSelect.innerHTML = colorOptions
            .map(option => `<option value="${option.value}">${option.label}</option>`)
            .join('');
        const styleOptions = module?.getGraphicStyleOptions?.() || [
            { value: 'bars', label: 'Barras' },
            { value: 'radar', label: 'Gráfico radar' }
        ];
        storyStyleSelect.innerHTML = styleOptions
            .map(option => `<option value="${option.value}">${option.label}</option>`)
            .join('');
    };

    const setStoryFeedback = (message, type = 'info') => {
        if (!storyFeedbackElement) {
            return;
        }
        if (!message) {
            storyFeedbackElement.hidden = true;
            storyFeedbackElement.textContent = '';
            storyFeedbackElement.dataset.type = '';
            return;
        }
        storyFeedbackElement.textContent = message;
        storyFeedbackElement.dataset.type = type;
        storyFeedbackElement.hidden = false;
    };

    const setStoryButtonLoading = (isLoading) => {
        if (!storyButton) {
            return;
        }
        if (isLoading) {
            storyButton.dataset.loading = 'true';
            storyButton.disabled = true;
            storyButton.innerHTML = '<i class="fas fa-spinner"></i> Generando...';
        } else {
            storyButton.dataset.loading = 'false';
            const defaultLabel = storyButtonDefaultHTML || '<i class="fab fa-instagram"></i> Generar tarjeta';
            storyButton.disabled = false;
            storyButton.innerHTML = defaultLabel;
        }
    };

    const resetStorySection = () => {
        populateStoryOptions();
        const defaults = getStoryDefaults();
        storyCustomization = { ...defaults };
        if (storyColorSelect) {
            storyColorSelect.value = defaults.colorScheme;
        }
        if (storyStyleSelect) {
            storyStyleSelect.value = defaults.graphicStyle;
        }
        if (storyDownloadLink) {
            storyDownloadLink.hidden = true;
            storyDownloadLink.removeAttribute('href');
        }
        const module = getStoryModule();
        if (!module) {
            setStoryFeedback('La generación de tarjetas no está disponible por ahora.', 'warning');
            if (storyButton) {
                storyButton.disabled = true;
            }
        } else {
            setStoryFeedback('', 'info');
            if (storyButton) {
                storyButton.disabled = false;
                storyButton.innerHTML = storyButtonDefaultHTML || '<i class="fab fa-instagram"></i> Generar tarjeta';
            }
        }
        storyContextCache = null;
    };

    const handleStoryOptionChange = () => {
        if (!storyCustomization) {
            storyCustomization = { ...getStoryDefaults() };
        }
        if (storyColorSelect?.value) {
            storyCustomization.colorScheme = storyColorSelect.value;
        }
        if (storyStyleSelect?.value) {
            storyCustomization.graphicStyle = storyStyleSelect.value;
        }
        if (storyFeedbackElement && !storyFeedbackElement.hidden && storyFeedbackElement.dataset.type !== 'error') {
            setStoryFeedback('Aplicaremos el nuevo estilo en la próxima tarjeta.', 'info');
        }
    };

    const prepareStoryContext = async () => {
        const module = getStoryModule();
        if (!module) {
            throw new Error('Servicio de tarjetas no disponible.');
        }
        if (!currentData?.listId || !currentData?.reviewId) {
            throw new Error('Faltan datos para generar la tarjeta.');
        }
        if (storyContextCache && storyContextCache.key === `${currentData.listId}/${currentData.reviewId}`) {
            return storyContextCache;
        }
        const result = await module.loadShareContext(currentData.listId, currentData.reviewId);
        storyContextCache = { key: `${currentData.listId}/${currentData.reviewId}`, ...result };
        return storyContextCache;
    };

    const handleStoryShareClick = async () => {
        const module = getStoryModule();
        if (!module) {
            setStoryFeedback('No podemos generar la tarjeta en este momento.', 'error');
            return;
        }
        if (storyButton?.dataset.loading === 'true') {
            return;
        }
        if (!storyCustomization) {
            storyCustomization = { ...getStoryDefaults() };
        }
        if (storyColorSelect?.value) {
            storyCustomization.colorScheme = storyColorSelect.value;
        }
        if (storyStyleSelect?.value) {
            storyCustomization.graphicStyle = storyStyleSelect.value;
        }
        setStoryButtonLoading(true);
        setStoryFeedback('Generando la tarjeta...', 'info');
        let blobUrl = null;
        try {
            const { context, criteriaDefinitions } = await prepareStoryContext();
            const { blob } = await module.createInstagramStoryCard(context, criteriaDefinitions, storyCustomization);
            const fileName = `listopic-story-${context.review?.id || 'reseña'}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });
            let shared = false;
            if (navigator.canShare) {
                try {
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: `Mi reseña en ${context.place?.name || context.review?.establishmentName || 'Listopic'}`,
                            text: context.review?.itemName ? `${context.review.itemName} en Listopic` : 'Mi reseña en Listopic'
                        });
                        shared = true;
                        setStoryFeedback('¡Tarjeta lista! Completa la publicación en Instagram.', 'success');
                    }
                } catch (error) {
                    if (error?.name === 'AbortError') {
                        setStoryFeedback('Compartir cancelado. Puedes descargar la tarjeta para subirla manualmente.', 'info');
                    } else {
                        console.warn('[reviewShare] Error compartiendo tarjeta:', error);
                        setStoryFeedback('No pudimos compartir automáticamente. Descarga la tarjeta para subirla tú.', 'info');
                    }
                }
            }
            if (!shared) {
                blobUrl = URL.createObjectURL(blob);
                if (storyDownloadLink) {
                    storyDownloadLink.href = blobUrl;
                    storyDownloadLink.download = fileName;
                    storyDownloadLink.hidden = false;
                    storyDownloadLink.click();
                }
                setStoryFeedback('Descargamos la tarjeta. Busca la imagen en tu galería.', 'info');
            }
        } catch (error) {
            console.error('[reviewShare] Error generando la tarjeta:', error);
            setStoryFeedback('No pudimos generar la tarjeta. Inténtalo nuevamente.', 'error');
        } finally {
            setStoryButtonLoading(false);
            if (blobUrl) {
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            }
        }
    };

    const createModal = () => {
        modal = document.createElement('div');
        modal.id = 'review-share-modal';
        modal.className = 'modal review-share-modal';
        modal.innerHTML = `
            <div class="modal-content review-share-modal__content" role="dialog" aria-modal="true" aria-labelledby="review-share-title">
                <button type="button" class="close-button review-share-modal__close" aria-label="Cerrar">&times;</button>
                <h2 id="review-share-title" class="review-share-modal__title">Compartir reseña</h2>
                <p class="review-share-modal__subtitle"></p>
                <section class="review-share-modal__section">
                    <h3 class="review-share-modal__section-title">Compartir enlace</h3>
                    <div class="review-share-modal__link-row">
                        <input type="text" class="review-share-modal__link-input" readonly>
                        <button type="button" class="button primary-button review-share-copy-btn">Copiar</button>
                        <button type="button" class="button secondary-button review-share-native-btn">Compartir</button>
                    </div>
                    <p class="review-share-modal__feedback" hidden></p>
                </section>
                <section class="review-share-modal__section">
                    <h3 class="review-share-modal__section-title">Enviar a un chat</h3>
                    <div class="review-share-modal__chats">
                        <p class="review-share-modal__chats-loading">Cargando chats...</p>
                        <p class="review-share-modal__chats-empty" hidden>No hay chats activos todavía.</p>
                        <div class="review-share-modal__chats-list"></div>
                    </div>
                    <p class="review-share-modal__chat-feedback" hidden></p>
                </section>
                <section class="review-share-modal__section review-share-modal__section--story">
                    <h3 class="review-share-modal__section-title">Tarjeta para Instagram</h3>
                    <p class="review-share-modal__story-description">Genera una tarjeta lista para compartirla en tus historias con el estilo que prefieras.</p>
                    <div class="review-share-modal__story-grid">
                        <label class="review-share-modal__story-label" for="review-share-story-color">Colores</label>
                        <select id="review-share-story-color" class="review-share-modal__story-select"></select>
                        <label class="review-share-modal__story-label" for="review-share-story-style">Gráfico</label>
                        <select id="review-share-story-style" class="review-share-modal__story-select"></select>
                    </div>
                    <div class="review-share-modal__story-actions">
                        <button type="button" class="button tertiary-button review-share-story-btn">
                            <i class="fab fa-instagram"></i> Generar tarjeta
                        </button>
                        <a class="button secondary-button review-share-story-download" hidden download>Descargar</a>
                    </div>
                    <p class="review-share-modal__story-feedback" hidden></p>
                </section>
            </div>
        `;
        document.body.appendChild(modal);

        closeButton = modal.querySelector('.review-share-modal__close');
        linkInput = modal.querySelector('.review-share-modal__link-input');
        copyButton = modal.querySelector('.review-share-copy-btn');
        nativeShareButton = modal.querySelector('.review-share-native-btn');
        subtitleElement = modal.querySelector('.review-share-modal__subtitle');
        feedbackElement = modal.querySelector('.review-share-modal__feedback');
        chatFeedbackElement = modal.querySelector('.review-share-modal__chat-feedback');
        chatsContainer = modal.querySelector('.review-share-modal__chats');
        chatsListElement = modal.querySelector('.review-share-modal__chats-list');
        chatsLoadingElement = modal.querySelector('.review-share-modal__chats-loading');
        chatsEmptyElement = modal.querySelector('.review-share-modal__chats-empty');
        storySection = modal.querySelector('.review-share-modal__section--story');
        storyButton = modal.querySelector('.review-share-story-btn');
        storyDownloadLink = modal.querySelector('.review-share-story-download');
        storyFeedbackElement = modal.querySelector('.review-share-modal__story-feedback');
        storyColorSelect = modal.querySelector('#review-share-story-color');
        storyStyleSelect = modal.querySelector('#review-share-story-style');
        if (storyButton) {
            storyButtonDefaultHTML = storyButton.innerHTML;
            storyButton.addEventListener('click', handleStoryShareClick);
        }
        if (storyColorSelect) {
            storyColorSelect.addEventListener('change', handleStoryOptionChange);
        }
        if (storyStyleSelect) {
            storyStyleSelect.addEventListener('change', handleStoryOptionChange);
        }
        resetStorySection();

        closeButton.addEventListener('click', close);
        copyButton.addEventListener('click', handleCopyLink);
        nativeShareButton.addEventListener('click', handleNativeShare);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                close();
            }
        });
        document.addEventListener('keydown', handleKeydown, true);
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape' && modal?.classList.contains('active')) {
            close();
        }
    };

    const setFeedbackMessage = (element, message, type = 'info') => {
        if (!element) {
            return;
        }
        if (!message) {
            element.hidden = true;
            return;
        }
        element.textContent = message;
        element.dataset.type = type;
        element.hidden = false;
    };

    const computeShareLink = (detailUrl) => {
        try {
            const basePath = window.location.pathname.replace(/[^/]*$/, '');
            const base = window.location.origin + basePath;
            return new URL(detailUrl || '', base).href;
        } catch (error) {
            console.warn('[reviewShare] No se pudo construir el enlace absoluto:', error);
            return window.location.href;
        }
    };

    const open = (reviewData) => {
        ensureModal();
        if (!modal) {
            return;
        }
        currentData = reviewData || null;
        currentLink = computeShareLink(reviewData?.detailUrl || '');
        if (linkInput) {
            linkInput.value = currentLink;
            try {
                linkInput.setSelectionRange(0, currentLink.length);
            } catch (error) {
                /* noop */
            }
        }
        setFeedbackMessage(feedbackElement, '');
        setFeedbackMessage(chatFeedbackElement, '');
        if (subtitleElement) {
            const itemName = reviewData?.itemName || 'Elemento';
            const listName = reviewData?.listName || 'Lista';
            subtitleElement.textContent = `${itemName} \u00b7 ${listName}`;
        }
        if (nativeShareButton) {
            const supported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
            nativeShareButton.hidden = !supported;
            nativeShareButton.disabled = !supported;
        }
        resetStorySection();
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        loadChats();
    };

    const close = () => {
        if (!modal) {
            return;
        }
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    };

    const handleCopyLink = async () => {
        if (!linkInput) {
            return;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(currentLink);
            } else {
                linkInput.focus();
                linkInput.select();
                document.execCommand('copy');
            }
            setFeedbackMessage(feedbackElement, 'Enlace copiado al portapapeles.', 'success');
        } catch (error) {
            console.error('[reviewShare] Error copiando enlace:', error);
            setFeedbackMessage(feedbackElement, 'No se pudo copiar el enlace.', 'error');
        }
    };

    const handleNativeShare = async () => {
        if (!currentLink || !navigator.share) {
            setFeedbackMessage(feedbackElement, 'Tu dispositivo no permite compartir directamente.', 'warning');
            return;
        }
        try {
            await navigator.share({
                title: currentData?.itemName || 'Listopic',
                text: currentData?.listName ? `rese\u00f1a de ${currentData.listName}` : 'rese\u00f1a en Listopic',
                url: currentLink
            });
            setFeedbackMessage(feedbackElement, 'rese\u00f1a compartida.', 'success');
        } catch (error) {
            if (error && error.name === 'AbortError') {
                setFeedbackMessage(feedbackElement, 'Compartir cancelado.', 'info');
            } else {
                console.error('[reviewShare] Error en compartir nativo:', error);
                setFeedbackMessage(feedbackElement, 'No se pudo completar el compartido.', 'error');
            }
        }
    };

    const loadChats = async () => {
        if (!chatsContainer || !chatsListElement) {
            return;
        }
        const services = window.ListopicApp?.services || {};
        const authUser = services.auth?.currentUser;

        chatsListElement.innerHTML = '';
        if (chatsLoadingElement) {
            chatsLoadingElement.hidden = false;
        }
        if (chatsEmptyElement) {
            chatsEmptyElement.hidden = true;
        }

        if (!authUser) {
            if (chatsLoadingElement) {
                chatsLoadingElement.hidden = true;
            }
            if (chatsEmptyElement) {
                chatsEmptyElement.hidden = false;
                chatsEmptyElement.textContent = 'Inicia sesion para compartir en un chat.';
            }
            return;
        }

        const reuseCache = chatsCache && (Date.now() - chatsCacheFetchedAt) < CHATS_CACHE_TTL;
        if (reuseCache) {
            if (chatsLoadingElement) {
                chatsLoadingElement.hidden = true;
            }
            renderChats(chatsCache, authUser.uid);
            return;
        }

        if (!services.db) {
            if (chatsLoadingElement) {
                chatsLoadingElement.hidden = true;
            }
            if (chatsEmptyElement) {
                chatsEmptyElement.hidden = false;
                chatsEmptyElement.textContent = 'Servicio de chats no disponible.';
            }
            return;
        }

        try {
            const snapshot = await services.db
                .collection('chats')
                .where('participants', 'array-contains', authUser.uid)
                .orderBy('updatedAt', 'desc')
                .get();
            const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            chatsCache = chats;
            chatsCacheFetchedAt = Date.now();
            if (chatsLoadingElement) {
                chatsLoadingElement.hidden = true;
            }
            renderChats(chats, authUser.uid);
        } catch (error) {
            console.error('[reviewShare] Error cargando chats:', error);
            if (chatsLoadingElement) {
                chatsLoadingElement.hidden = true;
            }
            if (chatsEmptyElement) {
                chatsEmptyElement.hidden = false;
                chatsEmptyElement.textContent = 'No se pudieron cargar tus chats.';
            }
        }
    };

    const getChatDisplayName = (chat, currentUserId) => {
        if (!chat) {
            return 'Chat';
        }
        if (chat.isGroup && chat.groupName) {
            return chat.groupName;
        }
        const participants = Array.isArray(chat.participants) ? chat.participants : [];
        const others = participants.filter(id => id !== currentUserId);
        if (!others.length) {
            return chat.groupName || 'Chat privado';
        }
        const profiles = chat.participantProfiles || {};
        const names = others.map(uid => {
            const profile = profiles[uid] || {};
            return profile.displayName || profile.username || profile.email || 'Usuario';
        });
        return names.join(', ');
    };

    const getChatMetaText = (chat, currentUserId) => {
        if (!chat) {
            return '';
        }
        if (chat.isGroup) {
            const total = Array.isArray(chat.participants) ? chat.participants.length : 0;
            return total > 0 ? `${total} participantes` : 'Grupo';
        }
        const participants = Array.isArray(chat.participants) ? chat.participants : [];
        const others = participants.filter(id => id !== currentUserId);
        if (!others.length) {
            return '';
        }
        const profiles = chat.participantProfiles || {};
        const profile = profiles[others[0]] || {};
        if (profile.username) {
            return `@${profile.username}`;
        }
        if (profile.email) {
            return profile.email;
        }
        return '';
    };

    const renderChats = (chats, currentUserId) => {
        chatsListElement.innerHTML = '';
        if (!Array.isArray(chats) || chats.length === 0) {
            if (chatsEmptyElement) {
                chatsEmptyElement.hidden = false;
                chatsEmptyElement.textContent = 'Crea un chat para compartir esta rese\u00f1a.';
            }
            return;
        }
        if (chatsEmptyElement) {
            chatsEmptyElement.hidden = true;
        }
        chats.forEach(chat => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'review-share-chat-btn';

            const title = document.createElement('span');
            title.className = 'review-share-chat-btn__title';
            title.textContent = getChatDisplayName(chat, currentUserId);
            button.appendChild(title);

            const metaText = getChatMetaText(chat, currentUserId);
            if (metaText) {
                const meta = document.createElement('span');
                meta.className = 'review-share-chat-btn__meta';
                meta.textContent = metaText;
                button.appendChild(meta);
            }

            button.addEventListener('click', () => handleChatShare(chat, button, currentUserId));
            chatsListElement.appendChild(button);
        });
    };

    const composeChatMessage = (data, link) => {
        const parts = [];
        if (data?.itemName && data?.listName) {
            parts.push(`Te comparto la rese\u00f1a "${data.itemName}" de la lista "${data.listName}".`);
        } else if (data?.itemName) {
            parts.push(`Te comparto la rese\u00f1a "${data.itemName}".`);
        }
        if (data?.overallRating) {
            parts.push(`Puntuacion: ${data.overallRating}/10.`);
        }

        const messageText = parts.join(' ').trim();
        const defaultText = 'Te comparto una rese\u00f1a.';
        const textToSend = messageText || defaultText;

        if (!data) {
            return { text: textToSend, payload: null };
        }

        const payload = {
            type: 'review-share',
            detailUrl: (link || data.detailUrl || '').trim(),
            photoUrl: (data.photoUrl || '').trim(),
            comment: (data.comment || '').trim(),
            rating: (data.overallRating || '').trim(),
            listName: (data.listName || '').trim(),
            itemName: (data.itemName || '').trim(),
            placeName: (data.placeName || '').trim(),
            authorName: (data.authorName || '').trim()
        };

        return { text: textToSend, payload };
    };

    const handleChatShare = async (chat, button, currentUserId) => {
        const services = window.ListopicApp?.services || {};
        const authUser = services.auth?.currentUser;
        if (!chat || !button || !currentData) {
            return;
        }
        if (!authUser || authUser.uid !== currentUserId) {
            setFeedbackMessage(chatFeedbackElement, 'Tu sesion no esta disponible.', 'error');
            return;
        }
        if (typeof services.sendChatMessage !== 'function') {
            setFeedbackMessage(chatFeedbackElement, 'El servicio de chat no esta disponible.', 'error');
            return;
        }
        button.disabled = true;
        button.classList.add('is-loading');
        try {
            const { text, payload } = composeChatMessage(currentData, currentLink);
            await services.sendChatMessage(chat.id, currentUserId, text, payload);
            setFeedbackMessage(chatFeedbackElement, 'rese\u00f1a compartida en el chat.', 'success');
        } catch (error) {
            console.error('[reviewShare] Error compartiendo en chat:', error);
            setFeedbackMessage(chatFeedbackElement, 'No se pudo compartir en el chat.', 'error');
        } finally {
            button.classList.remove('is-loading');
            button.disabled = false;
        }
    };

    const init = () => {
        ensureModal();
    };

    return {
        init,
        open
    };
})();

const setBadgeVisibility = (badgeElement, visible) => {
    if (!badgeElement) return;
    if (visible) {
        badgeElement.hidden = false;
        badgeElement.setAttribute('data-visible', 'true');
    } else {
        badgeElement.hidden = true;
        badgeElement.setAttribute('data-visible', 'false');
    }
};

const formatTimestampForUi = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return 'Justo ahora';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return date.toLocaleDateString();
};

const renderNotificationsList = (notifications, container, emptyStateElement) => {
    if (!container) return;
    container.innerHTML = '';

    if (!notifications || notifications.length === 0) {
        container.setAttribute('hidden', 'true');
        if (emptyStateElement) {
            emptyStateElement.textContent = 'Sin notificaciones nuevas.';
        }
        return;
    }

    container.removeAttribute('hidden');
    if (emptyStateElement) {
        const unread = notifications.filter(n => !n.read).length;
        emptyStateElement.textContent = unread > 0 ? 'Tienes nuevas notificaciones.' : 'Esto es lo ultimo que ha pasado.';
    }

    notifications.forEach(notification => {
        const isFollowerNotification = notification.type === 'new_follower' && notification.followerId;
        const linkTarget = isFollowerNotification ? `profile.html?viewUserId=${notification.followerId}` : null;
        const item = document.createElement(linkTarget ? 'a' : 'div');
        item.className = 'notification-item';
        if (linkTarget) {
            item.href = linkTarget;
            item.setAttribute('aria-label', 'Ver perfil del nuevo seguidor');
        }
        if (notification.id) {
            item.dataset.notificationId = notification.id;
        }
        if (!notification.read) {
            item.classList.add('unread');
        }

        const avatar = document.createElement('img');
        if (notification.type === 'new_follower') {
            const followerLabel = notification.followerDisplayName || notification.followerUsername || 'Nuevo seguidor';
            avatar.src = notification.followerPhotoUrl || 'img/default-avatar.png';
            avatar.alt = `Avatar de ${followerLabel}`;
        } else {
            avatar.src = 'img/default-avatar.png';
            avatar.alt = 'Avatar de notificacion';
        }

        const content = document.createElement('div');
        content.className = 'notification-content';

        const title = document.createElement('span');
        title.className = 'notification-title';
        if (notification.type === 'new_follower') {
            const displayName = notification.followerDisplayName || notification.followerUsername || 'Un usuario';
            const username = notification.followerUsername && notification.followerUsername.toLowerCase() !== displayName.toLowerCase()
                ? notification.followerUsername
                : null;
            title.textContent = `${displayName} empezo a seguirte${username ? ` (@${username})` : ''}.`;
        } else {
            title.textContent = notification.title || 'Nueva notificacion';
        }

        const meta = document.createElement('span');
        meta.className = 'notification-meta';
        meta.textContent = formatTimestampForUi(notification.createdAt);

        content.appendChild(title);

        if (notification.type === 'new_follower' && notification.followerUsername && (!notification.followerDisplayName || notification.followerDisplayName.toLowerCase() !== notification.followerUsername.toLowerCase())) {
            const usernameBadge = document.createElement('span');
            usernameBadge.className = 'notification-subtitle';
            usernameBadge.textContent = `@${notification.followerUsername}`;
            content.appendChild(usernameBadge);
        }

        content.appendChild(meta);

        item.appendChild(avatar);
        item.appendChild(content);
        container.appendChild(item);

        const markAsRead = () => {
            if (notification.read || !notification.id || !ListopicApp.services || !ListopicApp.services.markNotificationsAsRead) {
                return;
            }
            const auth = ListopicApp.services.auth;
            const authUser = auth && auth.currentUser;
            if (authUser) {
                ListopicApp.services.markNotificationsAsRead(authUser.uid, [notification.id]).catch(error => {
                    console.error('[main] Error marcando notificaciÃƒÂ³n como leÃƒÂ­da:', error);
                });
            }
        };

        item.addEventListener('click', () => {
            markAsRead();
            if (linkTarget) {
                const dropdown = document.getElementById('notifications-dropdown');
                const button = document.getElementById('notifications-button');
                if (dropdown) {
                    dropdown.classList.remove('active');
                    dropdown.setAttribute('aria-hidden', 'true');
                }
                if (button) {
                    button.setAttribute('aria-expanded', 'false');
                }
            }
        }, { once: true });
    });
};

const initializeGlobalRealtimeFeatures = (user) => {
    if (!user || ListopicApp.state.globalRealtimeInitialized || !ListopicApp.services) return;

    const chatsBadge = document.getElementById('chats-badge');
    const notificationsBadge = document.getElementById('notifications-badge');
    const notificationsButton = document.getElementById('notifications-button');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const notificationsList = document.getElementById('notifications-list');
    const emptyStateElement = notificationsDropdown ? notificationsDropdown.querySelector('.notifications-empty-state') : null;

    const cleanupFunctions = [];

    if (chatsBadge) {
        const handleChatUnreadCleared = () => {
            setBadgeVisibility(chatsBadge, false);
        };
        document.addEventListener('listopic:chatUnreadCleared', handleChatUnreadCleared);
        cleanupFunctions.push(() => {
            document.removeEventListener('listopic:chatUnreadCleared', handleChatUnreadCleared);
        });
    }

    if (ListopicApp.services.listenToUserChats && chatsBadge) {
        const unsubscribeChats = ListopicApp.services.listenToUserChats(user.uid, chats => {
            const hasUnread = Array.isArray(chats) && chats.some(chat => (chat.unreadCounts && chat.unreadCounts[user.uid] > 0));
            setBadgeVisibility(chatsBadge, hasUnread);
        }, error => {
            console.error('[main] Error monitorizando chats para badge:', error);
        });
        cleanupFunctions.push(unsubscribeChats);
    }

    if (ListopicApp.services.listenToNotifications && notificationsList) {
        const unsubscribeNotifications = ListopicApp.services.listenToNotifications(user.uid, notifications => {
            ListopicApp.state.notificationsCache = notifications;
            const unreadCount = notifications.filter(n => !n.read).length;
            setBadgeVisibility(notificationsBadge, unreadCount > 0);
            renderNotificationsList(notifications, notificationsList, emptyStateElement);
        }, error => {
            console.error('[main] Error monitorizando notificaciones:', error);
        });
        cleanupFunctions.push(unsubscribeNotifications);
    }

    if (notificationsButton && notificationsDropdown) {
        const toggleDropdown = (event) => {
            event.stopPropagation();
            const willOpen = !notificationsDropdown.classList.contains('active');
            notificationsDropdown.classList.toggle('active', willOpen);
            notificationsDropdown.setAttribute('aria-hidden', (!willOpen).toString());
            notificationsButton.setAttribute('aria-expanded', willOpen.toString());
            if (willOpen) {
                const unreadIds = (ListopicApp.state.notificationsCache || []).filter(n => !n.read).map(n => n.id);
                if (unreadIds.length > 0 && ListopicApp.services.markNotificationsAsRead) {
                    ListopicApp.services.markNotificationsAsRead(user.uid, unreadIds);
                }
                setBadgeVisibility(notificationsBadge, false);
            }
        };

        notificationsButton.addEventListener('click', toggleDropdown);

        document.addEventListener('click', (event) => {
            if (!notificationsDropdown.classList.contains('active')) return;
            if (!notificationsDropdown.contains(event.target) && !notificationsButton.contains(event.target)) {
                notificationsDropdown.classList.remove('active');
                notificationsDropdown.setAttribute('aria-hidden', 'true');
                notificationsButton.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && notificationsDropdown.classList.contains('active')) {
                notificationsDropdown.classList.remove('active');
                notificationsDropdown.setAttribute('aria-hidden', 'true');
                notificationsButton.setAttribute('aria-expanded', 'false');
            }
        });
    }

    ListopicApp.state.globalRealtimeCleanup = cleanupFunctions;
    ListopicApp.state.globalRealtimeInitialized = true;
};

const notificationsRelativeTimeFormatter = (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat !== 'undefined')
    ? new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
    : null;

function formatRelativeTimeForNotifications(date) {
    if (!(date instanceof Date)) {
        return '';
    }

    if (!notificationsRelativeTimeFormatter) {
        const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
        if (Math.abs(diffMinutes) <= 1) {
            return 'justo ahora';
        }
        const suffix = diffMinutes >= 0 ? 'hace' : 'en';
        return `${suffix} ${Math.abs(diffMinutes)} min`;
    }

    const timeUnits = [
        { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
        { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
        { unit: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
        { unit: 'day', ms: 1000 * 60 * 60 * 24 },
        { unit: 'hour', ms: 1000 * 60 * 60 },
        { unit: 'minute', ms: 1000 * 60 },
        { unit: 'second', ms: 1000 }
    ];

    const diff = date.getTime() - Date.now();
    for (const { unit, ms } of timeUnits) {
        if (Math.abs(diff) >= ms || unit === 'second') {
            const value = Math.round(diff / ms);
            return notificationsRelativeTimeFormatter.format(value, unit);
        }
    }

    return '';
}

function ensureNotificationsModalElements() {
    let modal = document.getElementById('notificationsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'notificationsModal';
        modal.className = 'modal notifications-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'notificationsModalTitle');
        modal.innerHTML = `
            <div class="modal-content notifications-modal-content">
                <button type="button" class="close-button close-notifications-modal" aria-label="Cerrar notificaciones">
                    <span aria-hidden="true">&times;</span>
                </button>
                <h2 id="notificationsModalTitle">Notificaciones</h2>
                <div class="notifications-modal-body">
                    <p class="notifications-loading-state">Cargando notificaciones...</p>
                    <ul class="notifications-list" role="list"></ul>
                    <p class="notifications-empty-state" hidden>No tienes notificaciones nuevas.</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const listElement = modal.querySelector('.notifications-list');
    const loadingElement = modal.querySelector('.notifications-loading-state');
    const emptyElement = modal.querySelector('.notifications-empty-state');
    const closeButton = modal.querySelector('.close-notifications-modal');

    return {
        modal,
        listElement,
        loadingElement,
        emptyElement,
        closeButton
    };
}

function setupNotificationsUI(currentUser) {
    const notificationsButton = document.getElementById('notificationsButton');
    if (!notificationsButton || notificationsButton.dataset.notificationsSetup === 'true') {
        return;
    }

    const {
        modal,
        listElement,
        loadingElement,
        emptyElement,
        closeButton
    } = ensureNotificationsModalElements();

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        notificationsButton.setAttribute('aria-expanded', 'false');
        notificationsButton.disabled = false;
        delete notificationsButton.dataset.loading;
        notificationsButton.focus();
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    };

    if (!modal.dataset.listenersAttached) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });

        if (closeButton) {
            closeButton.addEventListener('click', closeModal);
        }

        document.addEventListener('keydown', handleKeyDown);
        modal.dataset.listenersAttached = 'true';
    }

    const renderNotifications = (notifications) => {
        listElement.innerHTML = '';

        notifications.forEach(notification => {
            const item = document.createElement('li');
            item.className = 'notifications-item';

            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'notification-icon';
            const iconElement = document.createElement('i');
            iconElement.className = notification.icon || 'fas fa-bell';
            iconWrapper.appendChild(iconElement);

            const mainWrapper = document.createElement('div');
            mainWrapper.className = 'notification-main';

            if (notification.title) {
                const titleElement = document.createElement('h3');
                titleElement.className = 'notification-title';
                titleElement.textContent = notification.title;
                mainWrapper.appendChild(titleElement);
            }

            const messageElement = document.createElement('p');
            messageElement.className = 'notification-message';
            messageElement.textContent = notification.message || notification.text || 'Tienes una nueva notificaciÃƒÂ³n.';
            mainWrapper.appendChild(messageElement);

            if (notification.url) {
                const linkElement = document.createElement('a');
                linkElement.className = 'notification-link';
                linkElement.href = notification.url;
                linkElement.target = '_blank';
                linkElement.rel = 'noopener noreferrer';
                linkElement.textContent = 'Ver detalles';
                mainWrapper.appendChild(linkElement);
            }

            const timestamp = notification.createdAt;
            let notificationDate = null;
            if (timestamp && typeof timestamp.toDate === 'function') {
                notificationDate = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                notificationDate = timestamp;
            } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
                const parsedDate = new Date(timestamp);
                if (!isNaN(parsedDate)) {
                    notificationDate = parsedDate;
                }
            }

            if (notificationDate instanceof Date && !isNaN(notificationDate)) {
                const timeElement = document.createElement('time');
                timeElement.className = 'notification-time';
                timeElement.dateTime = notificationDate.toISOString();
                timeElement.textContent = formatRelativeTimeForNotifications(notificationDate) || notificationDate.toLocaleString();
                mainWrapper.appendChild(timeElement);
            }

            item.appendChild(iconWrapper);
            item.appendChild(mainWrapper);
            listElement.appendChild(item);
        });
    };

    const openModal = async () => {
        notificationsButton.disabled = true;
        notificationsButton.setAttribute('aria-expanded', 'true');
        notificationsButton.dataset.loading = 'true';
        modal.classList.add('active');
        document.body.classList.add('modal-open');

        listElement.innerHTML = '';
        emptyElement.hidden = true;
        emptyElement.textContent = 'No tienes notificaciones nuevas.';
        loadingElement.hidden = false;

        if (!currentUser) {
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'Inicia sesiÃƒÂ³n para ver tus notificaciones.';
            notificationsButton.disabled = false;
            return;
        }

        if (!ListopicApp.services || typeof ListopicApp.services.getUserNotifications !== 'function') {
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'El servicio de notificaciones no estÃƒÂ¡ disponible en este momento.';
            notificationsButton.disabled = false;
            return;
        }

        try {
            const notifications = await ListopicApp.services.getUserNotifications(currentUser.uid, { limit: 30 });
            loadingElement.hidden = true;

            if (!notifications || notifications.length === 0) {
                emptyElement.hidden = false;
                return;
            }

            renderNotifications(notifications);
        } catch (error) {
            console.error('main.js: No se pudieron cargar las notificaciones:', error);
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'No pudimos cargar tus notificaciones. Intenta nuevamente mÃƒÂ¡s tarde.';
        } finally {
            notificationsButton.disabled = false;
            delete notificationsButton.dataset.loading;
        }
    };

    notificationsButton.addEventListener('click', openModal);
    notificationsButton.dataset.notificationsSetup = 'true';
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("MAIN.JS: DOMContentLoaded disparado."); // <--- LOG 1

    if (ListopicApp.reviewActions && typeof ListopicApp.reviewActions.init === 'function') {
        ListopicApp.reviewActions.init();
    }

    if (ListopicApp.reviewShare && typeof ListopicApp.reviewShare.init === 'function') {
        ListopicApp.reviewShare.init();
    }

// 1. Cargar elementos comunes PRIMERO
// if (ListopicApp.commonUI && ListopicApp.commonUI.loadCommonElements) {
//     console.log("MAIN.JS: Cargando elementos comunes (header/footer)...");
//     ListopicApp.commonUI.loadCommonElements();
// } else {
//     console.error("MAIN.JS: commonUI no disponible para cargar header/footer.");
// }

    if (!ListopicApp.services || !ListopicApp.services.auth || !ListopicApp.services.storage || !ListopicApp.services.db) {
        console.error("MAIN.JS: Firebase services (auth, storage, db) no disponibles."); // <--- LOG 2 (si entra aquÃƒÂ­)
        // PodrÃƒÂ­as mostrar un error al usuario aquÃƒÂ­ si la app no puede funcionar.
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = '<p style="color:red; text-align:center; margin-top: 50px;">Error critico: La aplicacion no pudo inicializar los servicios base. Por favor, recarga o contacta soporte.</p>';
        }
        return;
    }
    console.log("MAIN.JS: Servicios de Firebase comprobados, parecen estar disponibles."); // <--- LOG 3

    if (ListopicApp.themeManager && ListopicApp.themeManager.init) {
        console.log("MAIN.JS: Inicializando ThemeManager..."); // <--- LOG 4
        ListopicApp.themeManager.init();
    } else {
        console.error("MAIN.JS: ThemeManager no disponible."); // <--- LOG 5 (si entra aquÃƒÂ­)
    }

    if (ListopicApp.authService && ListopicApp.authService.init) {
        console.log("MAIN.JS: Inicializando AuthService..."); // <--- LOG 6
        ListopicApp.authService.init();
    } else {
        console.error("MAIN.JS: AuthService no disponible."); // <--- LOG 7 (si entra aquÃƒÂ­)
    }

    const pagePath = window.location.pathname;
    const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1).toLowerCase(); // Convertido a minÃƒÂºsculas para consistencia
    console.log("MAIN.JS: pagePath detectado:", pagePath); // <--- LOG 8
    console.log("MAIN.JS: pageName calculado:", pageName); // <--- LOG 9
    const isIndexPage = pageName === '' || pageName === 'index.html';

    // Esperar a que el estado de autenticacion se resuelva antes de inicializar paginas protegidas
    console.log("MAIN.JS: Esperando resolucion de onAuthStateChangedPromise..."); // <--- LOG 10
    ListopicApp.authService.onAuthStateChangedPromise().then(user => {
        console.log("MAIN.JS: onAuthStateChangedPromise resuelta. Usuario:", user ? user.uid : 'No hay usuario'); // <--- LOG 11

        try {
            setupNotificationsUI(user);
        } catch (notificationsError) {
            console.error('MAIN.JS: Error inicializando el modal de notificaciones:', notificationsError);
        }

        if (pageName === 'auth.html') {
            console.log("MAIN.JS: Es auth.html, intentando inicializar pageAuth..."); // <--- LOG 12
            if (ListopicApp.pageAuth && ListopicApp.pageAuth.init) {
                ListopicApp.pageAuth.init(); // pageAuth puede tener lÃƒÂ³gica incluso si el usuario ya estÃƒÂ¡ logueado (para redirigir)
            }
        } else if (!user) {
            // Si no es la pagina de autenticacion y no hay usuario, authService ya deberÃƒÂ­a haber redirigido.
            // No se inicializa ninguna otra lÃƒÂ³gica de pagina.
            console.log("MAIN.JS: Usuario no autenticado y no en auth.html. authService deberÃƒÂ­a redirigir."); // <--- LOG 13
            return;
        } else {
            // Usuario autenticado, o pagina pÃƒÂºblica que no requiere autenticacion (como index, si se decide)
            console.log("MAIN.JS: Usuario autenticado o pagina pÃƒÂºblica. Procediendo a inicializar lÃƒÂ³gica de pagina especÃƒÂ­fica."); // <--- LOG 14
            initializeGlobalRealtimeFeatures(user);
            if (isIndexPage) {
                console.log("MAIN.JS: Es Index page, intentando inicializar pageIndex..."); // <--- LOG 15
                 if(ListopicApp.pageIndex && ListopicApp.pageIndex.init) {
                    ListopicApp.pageIndex.init();
                }
            } else if (pageName === 'review-form.html') {
                console.log("MAIN.JS: Es review-form.html, intentando inicializar pageReviewForm..."); // <--- LOG 16
                if (ListopicApp.pageReviewForm && ListopicApp.pageReviewForm.init) {
                    ListopicApp.pageReviewForm.init(); // AquÃƒÂ­ es donde se llamarÃƒÂ­a a tu init
                } else {
                    console.error("MAIN.JS: ListopicApp.pageReviewForm.init no encontrado!"); // <--- LOG 17 (si falta)
                }
            } else if (pageName === 'list-form.html') {
                if (ListopicApp.pageListForm && ListopicApp.pageListForm.init) {
                    ListopicApp.pageListForm.init();
                }
            } else if (pageName === 'list-view.html') {
                if (ListopicApp.pageListView && ListopicApp.pageListView.init) {
                    ListopicApp.pageListView.init();
                }
            } else if (pageName === 'detail-view.html') {
                if (ListopicApp.pageDetailView && ListopicApp.pageDetailView.init) {
                    ListopicApp.pageDetailView.init();
                }
            } else if (pageName === 'grouped-detail-view.html') {
                if (ListopicApp.pageGroupedDetailView && ListopicApp.pageGroupedDetailView.init) {
                    ListopicApp.pageGroupedDetailView.init();
                }
            } else if (pageName === 'archive.html') {
                if (ListopicApp.pageArchive?.init) {
                    ListopicApp.pageArchive.init();
                }

            } else if (pageName === 'profile.html') {
                console.log("MAIN.JS: Coincide 'profile.html', comprobando si pageProfile existe...");
                if (ListopicApp.pageProfile && ListopicApp.pageProfile.init) {
                    console.log("MAIN.JS: Coincide 'profile.html', ejecutando pageProfile.init()..."); // Log de confirmaciÃƒÂ³n
                    ListopicApp.pageProfile.init();
                } else {
                    console.error("MAIN.JS: ListopicApp.pageProfile.init no encontrado!"); // Log de error
                }
            } else if (pageName === 'chats.html') {
                if (ListopicApp.pageChats && ListopicApp.pageChats.init) {
                    ListopicApp.pageChats.init();
                }
            } else if (pageName === 'search.html') { // NUEVA CONDICIÃƒâ€œN
                if (ListopicApp.pageSearch && ListopicApp.pageSearch.init) {
                    ListopicApp.pageSearch.init();
                }
            } else if (pageName === 'place-detail.html') { // PÃƒÂGINA DE LUGAR
                if (ListopicApp.pagePlace && ListopicApp.pagePlace.init) {
                    ListopicApp.pagePlace.init();
                }
            } else if (pageName === 'developer.html') { // PÃƒÂGINA DE LUGAR
            if (ListopicApp.pagePlace && ListopicApp.pageDeveloper.init) {
                ListopicApp.pagePlace.init();
                }
            } else if (pageName === 'chats.html') {
                if (ListopicApp.pageChats && ListopicApp.pageChats.init) {
                    ListopicApp.pageChats.init();
                }
            } else {
                // Esta es la lÃƒÂ­nea 95 en la estructura original del if/else if
                console.warn("MAIN.JS: No se detectÃƒÂ³ una pagina conocida. pageName:", pageName); // <--- LOG si ninguna coincide
            }
        }
    }).catch(error => {
        console.error("MAIN.JS: Error en onAuthStateChangedPromise:", error); // <--- LOG 18 (si la promesa falla)
        // Manejar error crÃƒÂ­tico si la autenticacion no se puede verificar
    });

    console.log("MAIN.JS: Fin del script de inicializaciÃƒÂ³n de main.js."); // <--- LOG 19



    // --- LÃƒÂ³gica para la InstalaciÃƒÂ³n de la PWA (desde el MenÃƒÂº de Usuario) ---
let deferredPrompt;
const installMenuItem = document.getElementById('installPwaBtn');

// Criterio 1: El navegador dispara el evento para instalar
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que se muestre el mini-infobar por defecto
    e.preventDefault();
    // Guardar el evento para usarlo despuÃƒÂ©s
    deferredPrompt = e;
    
    // Mostrar la opciÃƒÂ³n en el menÃƒÂº solo si no estÃƒÂ¡ ya instalada
    // y el navegador lo permite.
    if (installMenuItem && !isAppInstalled()) {
        console.log("Evento 'beforeinstallprompt' capturado. Mostrando opciÃƒÂ³n de instalar en el menÃƒÂº.");
        installMenuItem.style.display = 'block';
    }
});

// Criterio 2: El usuario hace clic en nuestro botÃƒÂ³n del menÃƒÂº
if (installMenuItem) {
    installMenuItem.addEventListener('click', async () => {
        // Asegurarnos de que aÃƒÂºn tenemos el evento
        if (deferredPrompt) {
            // Mostrar el diÃƒÂ¡logo de instalaciÃƒÂ³n del navegador
            deferredPrompt.prompt();
            
            // Esperar la respuesta del usuario
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Respuesta del usuario al prompt de instalaciÃƒÂ³n: ${outcome}`);

            // Si el usuario acepta, ya no necesitamos mostrar el botÃƒÂ³n
            if (outcome === 'accepted') {
                installMenuItem.style.display = 'none';
            }

            // Descartamos el evento, ya que solo se puede usar una vez
            deferredPrompt = null;
        }
    });
}

// Criterio 3: La app se ha instalado correctamente
window.addEventListener('appinstalled', () => {
    // Ocultar la opciÃƒÂ³n del menÃƒÂº y limpiar todo
    if (installMenuItem) {
        installMenuItem.style.display = 'none';
    }
    deferredPrompt = null;
    console.log('PWA fue instalada con ÃƒÂ©xito.');
    if(ListopicApp.services && ListopicApp.services.showNotification) {
        ListopicApp.services.showNotification('Ã‚Â¡Listopic instalado! BÃƒÂºscalo en tu pantalla de inicio.', 'success');
    }
});

// FunciÃƒÂ³n de ayuda para saber si la app ya se estÃƒÂ¡ ejecutando como PWA
function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Al cargar la pagina, si ya estÃƒÂ¡ en modo standalone, nos aseguramos
// de que el botÃƒÂ³n no aparezca por si acaso.
if (isAppInstalled() && installMenuItem) {
    console.log("La app ya se estÃƒÂ¡ ejecutando en modo standalone. La opciÃƒÂ³n de instalar no se mostrarÃƒÂ¡.");
    installMenuItem.style.display = 'none';
}
// --- Fin de la LÃƒÂ³gica de InstalaciÃƒÂ³n de la PWA ---


    
});


// FunciÃƒÂ³n global para limpiar cache de etiquetas (ÃƒÂºtil para desarrollo)
window.clearCategoryTagsCache = function() {
    if (ListopicApp.pageSearch && ListopicApp.pageSearch.clearTagsCache) {
        ListopicApp.pageSearch.clearTagsCache();
        console.log('Cache de etiquetas limpiado');
    } else {
        console.warn('FunciÃƒÂ³n de limpiar cache no disponible');
    }
};

// Registro del Service Worker para gestionar el cachÃƒÂ©
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      console.log('Service Worker registrado con ÃƒÂ©xito:', registration);
    }).catch((err) => {
      console.log('Fallo en el registro del Service Worker:', err);
    });
  });
}

