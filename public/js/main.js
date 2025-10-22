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
    // Firebase services no deberían estar en state, se acceden desde ListopicApp.services
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

    const handleActionClick = async (action, card, sourceButton) => {
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
                await archiveService.openSaveModal(descriptor);
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

        if (action === 'like' || action === 'dislike') {
            const module = window.ListopicApp?.reviewReactions;
            if (!module || typeof module.toggle !== 'function') {
                notify('No se pudo registrar tu reacci\u00f3n.', 'error');
                return;
            }
            await module.toggle({
                card,
                reactionType: action,
                trigger: sourceButton
            });
            return;
        }

        if (action === 'comment') {
            const module = window.ListopicApp?.reviewComments;
            if (!module || typeof module.open !== 'function') {
                notify('No se pudieron cargar los comentarios.', 'error');
                return;
            }
            module.open(card);
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
        const actionBtn = event.target.closest('.review-action, [data-review-action]');

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
            const action = actionBtn.dataset.action || actionBtn.dataset.reviewAction;
            if (action && card) {
                handleActionClick(action, card, actionBtn);
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
ListopicApp.reviewReactions = (() => {
    const sanitizeCount = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 0;
        }
        return Math.max(0, Math.round(numeric));
    };

    const getServices = () => window.ListopicApp?.services || {};

    const showNotification = (message, type = 'info') => {
        const notify = getServices().showNotification;
        if (typeof notify === 'function' && message) {
            notify(message, type);
        }
    };

    const mobileMediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 768px)')
        : null;

    const isMobileViewport = () => {
        if (mobileMediaQuery && typeof mobileMediaQuery.matches === 'boolean') {
            return mobileMediaQuery.matches;
        }
        if (typeof window !== 'undefined' && typeof window.innerWidth === 'number') {
            return window.innerWidth <= 768;
        }
        return false;
    };

    const getReactionBurstLabel = (button, card, reactionType) => {
        if (!button) {
            return '';
        }
        const btnLabel = button.dataset?.reactionLabel || '';
        if (btnLabel && btnLabel.trim()) {
            return btnLabel.trim();
        }
        const cardDataset = card?.dataset || {};
        if (reactionType === 'like') {
            const categoryLike = cardDataset.categoryLikeLabel || '';
            if (categoryLike && categoryLike.trim()) {
                return categoryLike.trim();
            }
            const storedLike = cardDataset.likeLabel || '';
            if (storedLike && storedLike.trim()) {
                return storedLike.trim();
            }
        } else if (reactionType === 'dislike') {
            const categoryDislike = cardDataset.categoryDislikeLabel || '';
            if (categoryDislike && categoryDislike.trim()) {
                return categoryDislike.trim();
            }
            const storedDislike = cardDataset.dislikeLabel || '';
            if (storedDislike && storedDislike.trim()) {
                return storedDislike.trim();
            }
        }
        const fallbackText = button.querySelector('.action-label')?.textContent || '';
        return typeof fallbackText === 'string' ? fallbackText.trim() : '';
    };

    const triggerMobileReactionBurst = (button, card, reactionType) => {
        if (!button || !reactionType || !isMobileViewport()) {
            return;
        }
        const label = getReactionBurstLabel(button, card, reactionType);
        if (!label) {
            return;
        }
        const container = button;
        const existing = container.querySelector('.reaction-burst');
        if (existing) {
            existing.remove();
        }
        const burst = document.createElement('span');
        burst.className = `reaction-burst reaction-burst--${reactionType}`;
        burst.textContent = label;
        container.appendChild(burst);
        requestAnimationFrame(() => {
            burst.classList.add('is-active');
        });
        const exitDelay = 900;
        const removeDelay = 250;
        setTimeout(() => {
            burst.classList.add('is-exiting');
            setTimeout(() => {
                burst.remove();
            }, removeDelay);
        }, exitDelay);
    };

    const createReactionNotification = async ({
        ownerId,
        actorId,
        actorDisplayName,
        actorPhotoUrl,
        reactionType,
        listId,
        listName,
        reviewId,
        itemName,
        detailUrl,
        reviewPhotoUrl
    }) => {
        if (!ownerId || !actorId || ownerId === actorId) {
            return;
        }

        const services = getServices();
        const db = services.db;
        const FieldValue = firebase?.firestore?.FieldValue;
        if (!db || !FieldValue) {
            return;
        }

        const notificationsRef = db.collection('users').doc(ownerId).collection('notifications');
        const payload = {
            type: 'review_reaction',
            actorId,
            actorDisplayName: actorDisplayName || '',
            actorPhotoUrl: actorPhotoUrl || '',
            reactionType: reactionType || '',
            listId: listId || '',
            listName: listName || '',
            reviewId: reviewId || '',
            itemName: itemName || '',
            detailUrl: detailUrl || '',
            reviewPhotoUrl: reviewPhotoUrl || '',
            createdAt: FieldValue.serverTimestamp(),
            read: false
        };

        try {
            await notificationsRef.add(payload);
        } catch (error) {
            console.error('[reviewReactions] Error creando notificación de reacción:', error);
        }
    };

    const createOwnerNotification = async ({
        ownerId,
        actorId,
        actorDisplayName,
        actorPhotoUrl,
        commentSnippet,
        listId,
        listName,
        reviewId,
        itemName,
        detailUrl,
        reviewPhotoUrl
    }) => {
        if (!ownerId || !actorId || ownerId === actorId) {
            return;
        }

        const services = getServices();
        const db = services.db;
        const FieldValue = firebase?.firestore?.FieldValue;
        if (!db || !FieldValue) {
            return;
        }

        const notificationsRef = db.collection('users').doc(ownerId).collection('notifications');
        const payload = {
            type: 'review_comment',
            actorId,
            actorDisplayName: actorDisplayName || '',
            actorPhotoUrl: actorPhotoUrl || '',
            commentSnippet: commentSnippet || '',
            listId: listId || '',
            listName: listName || '',
            reviewId: reviewId || '',
            itemName: itemName || '',
            detailUrl: detailUrl || '',
            reviewPhotoUrl: reviewPhotoUrl || '',
            createdAt: FieldValue.serverTimestamp(),
            read: false
        };

        try {
            await notificationsRef.add(payload);
        } catch (error) {
            console.error('[reviewComments] Error creando notificación de comentario:', error);
        }
    };

    const getIdentifiersFromCard = (card) => {
        if (!card) {
            return {};
        }
        const helper = window.ListopicApp?.reviewActions?.getReviewData;
        if (typeof helper === 'function') {
            const data = helper(card) || {};
            return {
                listId: data.listId || '',
                reviewId: data.reviewId || '',
                itemName: data.itemName || ''
            };
        }
        const dataset = card.dataset || {};
        return {
            listId: dataset.listId || '',
            reviewId: dataset.reviewId || ''
        };
    };

    const updateReactionUi = (card, payload) => {
        if (!card || !payload || typeof payload !== 'object') {
            return;
        }
        const counts = Object.assign({ like: 0, dislike: 0 }, payload.counts || {});
        const currentReaction = typeof payload.reaction === 'string' ? payload.reaction : '';

        const likeCount = sanitizeCount(counts.like);
        const dislikeCount = sanitizeCount(counts.dislike);

        const likeBtn = card.querySelector('[data-review-action="like"]');
        const dislikeBtn = card.querySelector('[data-review-action="dislike"]');

        if (likeBtn) {
            const countEl = likeBtn.querySelector('[data-action-count="like"]');
            if (countEl) {
                countEl.textContent = likeCount;
            }
            likeBtn.classList.toggle('is-active', currentReaction === 'like');
            likeBtn.setAttribute('aria-pressed', currentReaction === 'like' ? 'true' : 'false');
        }

        if (dislikeBtn) {
            const countEl = dislikeBtn.querySelector('[data-action-count="dislike"]');
            if (countEl) {
                countEl.textContent = dislikeCount;
            }
            dislikeBtn.classList.toggle('is-active', currentReaction === 'dislike');
            dislikeBtn.setAttribute('aria-pressed', currentReaction === 'dislike' ? 'true' : 'false');
        }

        card.dataset.reactionLikeCount = likeCount;
        card.dataset.reactionDislikeCount = dislikeCount;
        card.dataset.userReaction = currentReaction;
    };

    const toggle = async ({ card, reactionType, trigger }) => {
        if (!card || !reactionType) {
            return;
        }

        const services = getServices();
        const db = services.db;
        const auth = services.auth;

        if (!db || !auth) {
            showNotification('Servicio no disponible actualmente.', 'error');
            return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            showNotification('Necesitas iniciar sesi\u00f3n para reaccionar.', 'info');
            return;
        }

        const identifiers = getIdentifiersFromCard(card);
        const cardData = typeof window.ListopicApp?.reviewActions?.getReviewData === 'function'
            ? (window.ListopicApp.reviewActions.getReviewData(card) || {})
            : {};
        if (!identifiers.listId || !identifiers.reviewId) {
            showNotification('No se pudo registrar la reacci\u00f3n.', 'error');
            return;
        }

        const FieldValue = firebase?.firestore?.FieldValue;
        if (!FieldValue) {
            showNotification('Servicio no disponible.', 'error');
            return;
        }

        if (trigger) {
            triggerMobileReactionBurst(trigger, card, reactionType);
            trigger.disabled = true;
        }

        try {
            const result = await db.runTransaction(async (transaction) => {
                const reviewRef = db.collection('lists').doc(identifiers.listId).collection('reviews').doc(identifiers.reviewId);
                const reactionRef = reviewRef.collection('reactions').doc(currentUser.uid);

                const [reviewSnap, reactionSnap] = await Promise.all([
                    transaction.get(reviewRef),
                    transaction.get(reactionRef)
                ]);

                if (!reviewSnap.exists) {
                    throw new Error('missing-review');
                }

                const reviewData = reviewSnap.exists ? (reviewSnap.data() || {}) : {};
                const counts = Object.assign({ like: 0, dislike: 0 }, reviewData.reactionCounts || {});
                const currentReaction = reactionSnap.exists ? (reactionSnap.data()?.reaction || '') : '';

                let nextReaction = reactionType;
                if (currentReaction === reactionType) {
                    counts[reactionType] = sanitizeCount(counts[reactionType] - 1);
                    transaction.delete(reactionRef);
                    nextReaction = '';
                } else {
                    counts[reactionType] = sanitizeCount(counts[reactionType] + 1);
                    if (currentReaction && counts[currentReaction] !== undefined) {
                        counts[currentReaction] = sanitizeCount(counts[currentReaction] - 1);
                    }
                    transaction.set(reactionRef, {
                        reaction: reactionType,
                        userId: currentUser.uid,
                        updatedAt: FieldValue.serverTimestamp(),
                        createdAt: reactionSnap.exists && reactionSnap.data()?.createdAt
                            ? reactionSnap.data().createdAt
                            : FieldValue.serverTimestamp()
                    }, { merge: true });
                }

                transaction.set(reviewRef, {
                    reactionCounts: counts
                }, { merge: true });

                return {
                    counts,
                    reaction: nextReaction,
                    ownerId: reviewData.userId || reviewData.authorId || reviewData.ownerId || cardData.authorId || '',
                    reviewItemName: reviewData.itemName || cardData.itemName || '',
                    reviewListName: reviewData.listName || cardData.listName || '',
                    reviewPhotoUrl: reviewData.photoUrl || cardData.photoUrl || '',
                    reviewDetailUrl: cardData.detailUrl || reviewData.detailUrl || '',
                    reviewListId: reviewData.listId || identifiers.listId || cardData.listId || ''
                };
            });

            updateReactionUi(card, result);
            if (result.reaction) {
                showNotification('Reacci\u00f3n registrada.', 'success');
                const ownerId = result.ownerId || cardData.authorId || '';
                if (ownerId && ownerId !== currentUser.uid) {
                    let actorDisplayName = currentUser.displayName || currentUser.email || 'Usuario';
                    let actorPhotoUrl = currentUser.photoURL || 'img/placeholder-avatar.png';
                    try {
                        const userDoc = await services.db.collection('users').doc(currentUser.uid).get();
                        if (userDoc.exists) {
                            const userData = userDoc.data() || {};
                            actorDisplayName = userData.displayName || userData.username || actorDisplayName;
                            actorPhotoUrl = userData.photoUrl || userData.photoURL || actorPhotoUrl;
                        }
                    } catch (profileError) {
                        console.warn('[reviewReactions] No se pudo obtener el perfil del usuario para notificaci\u00f3n:', profileError);
                    }

                    await createReactionNotification({
                        ownerId,
                        actorId: currentUser.uid,
                        actorDisplayName,
                        actorPhotoUrl,
                        reactionType: result.reaction,
                        listId: result.reviewListId || identifiers.listId || '',
                        listName: result.reviewListName || cardData.listName || '',
                        reviewId: identifiers.reviewId,
                        itemName: result.reviewItemName || cardData.itemName || '',
                        detailUrl: result.reviewDetailUrl || cardData.detailUrl || '',
                        reviewPhotoUrl: result.reviewPhotoUrl || cardData.photoUrl || ''
                    });
                }
            } else {
                showNotification('Reacci\u00f3n retirada.', 'info');
            }
        } catch (error) {
            if (error && error.message === 'missing-review') {
                showNotification('Esta rese\u00f1a ya no est\u00e1 disponible.', 'warning');
            } else {
                console.error('[reviewReactions] Error al actualizar reacci\u00f3n:', error);
                showNotification('No se pudo actualizar tu reacci\u00f3n.', 'error');
            }
        } finally {
            if (trigger) {
                trigger.disabled = false;
            }
        }
    };

    return {
        toggle
    };
})();
ListopicApp.reviewComments = (() => {
    const sanitizeCount = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 0;
        }
        return Math.max(0, Math.round(numeric));
    };

    let modal;
    let overlayEl;
    let closeButton;
    let commentsListEl;
    let loadingEl;
    let formEl;
    let textareaEl;
    let submitButton;
    let titleEl;
    let keydownHandlerAttached = false;
    let deleteClickHandlerAttached = false;
    const userProfileCache = new Map();
    let currentContext = null;

    const getServices = () => window.ListopicApp?.services || {};

    const showNotification = (message, type = 'info') => {
        const notify = getServices().showNotification;
        if (typeof notify === 'function' && message) {
            notify(message, type);
        }
    };

    const ensureModal = () => {
        if (modal) {
            return;
        }

        modal = document.createElement('div');
        modal.className = 'help-modal review-comments-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="help-modal__overlay" data-modal-dismiss></div>
            <div class="help-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="review-comments-title">
                <button type="button" class="help-modal__close" data-modal-dismiss aria-label="Cerrar">
                    <i class="fas fa-times"></i>
                </button>
                <div class="help-modal__content">
                    <p class="help-modal__eyebrow">Conversaci\u00f3n</p>
                    <h2 id="review-comments-title" data-comments-title>Comentarios</h2>
                    <div class="review-comments-modal__loading" data-comments-loading hidden>
                        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                        <span>Cargando comentarios...</span>
                    </div>
                    <div class="review-comments-modal__list" data-comments-list></div>
                    <form class="review-comments-modal__form" data-comments-form>
                        <label for="review-comment-input" class="form-label">A\u00f1ade tu comentario</label>
                        <textarea id="review-comment-input" class="form-input" rows="3" maxlength="1000" placeholder="Escribe algo amable..." data-comment-input></textarea>
                        <div class="review-comments-modal__form-actions">
                            <button type="submit" class="button submit-button" data-submit-comment>Publicar comentario</button>
                        </div>
                    </form>
                </div>
            </div>
        `.trim();

        document.body.appendChild(modal);

        overlayEl = modal.querySelector('[data-modal-dismiss]');
        closeButton = modal.querySelector('.help-modal__close');
        commentsListEl = modal.querySelector('[data-comments-list]');
        loadingEl = modal.querySelector('[data-comments-loading]');
        formEl = modal.querySelector('[data-comments-form]');
        textareaEl = modal.querySelector('[data-comment-input]');
        submitButton = modal.querySelector('[data-submit-comment]');
        titleEl = modal.querySelector('[data-comments-title]');

        const closeModal = () => close();

        overlayEl?.addEventListener('click', closeModal);
        closeButton?.addEventListener('click', (event) => {
            event.preventDefault();
            closeModal();
        });

        formEl?.addEventListener('submit', handleSubmit);
        if (!deleteClickHandlerAttached && commentsListEl) {
            commentsListEl.addEventListener('click', handleDeleteCommentClick);
            deleteClickHandlerAttached = true;
        }
    };

    const attachKeydownHandler = () => {
        if (keydownHandlerAttached) {
            return;
        }
        keydownHandlerAttached = true;
        document.addEventListener('keydown', onDocumentKeydown);
    };

    const detachKeydownHandler = () => {
        if (!keydownHandlerAttached) {
            return;
        }
        keydownHandlerAttached = false;
        document.removeEventListener('keydown', onDocumentKeydown);
    };

    const onDocumentKeydown = (event) => {
        if (event.key === 'Escape' && modal?.classList.contains('is-open')) {
            close();
        }
    };

    const toggleLoading = (isLoading) => {
        if (!loadingEl || !commentsListEl) {
            return;
        }
        loadingEl.hidden = !isLoading;
        commentsListEl.hidden = isLoading;
    };

    const toDate = (value) => {
        if (!value) return null;
        if (typeof value.toDate === 'function') {
            return value.toDate();
        }
        if (typeof value === 'object' && typeof value.seconds === 'number') {
            return new Date(value.seconds * 1000);
        }
        if (typeof value === 'number') {
            return new Date(value);
        }
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        return null;
    };

    const formatTimestamp = (value) => {
        const date = toDate(value);
        if (!date) {
            return '';
        }
        try {
            return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
        } catch (error) {
            return date.toLocaleString();
        }
    };

    const renderCommentItem = (comment) => {
        const uiUtils = window.ListopicApp?.uiUtils;
        const escape = (value) => uiUtils && typeof uiUtils.escapeHtml === 'function'
            ? uiUtils.escapeHtml(value || '')
            : (value || '').replace(/[&<>"']/g, (match) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match] || match));

        const displayName = escape(comment.userDisplayName || comment.userName || 'Usuario');
        const avatarUrl = escape(comment.userPhotoUrl || comment.userPhoto || 'img/placeholder-avatar.png');
        const messageHtml = escape(comment.message || '').replace(/\n/g, '<br>');
        const timestampLabel = formatTimestamp(comment.createdAt);
        const dateObj = toDate(comment.createdAt);
        const datetimeAttr = dateObj ? dateObj.toISOString() : '';

        const deleteButton = comment.isOwner
            ? `<button type="button" class="review-comment__delete" data-comment-delete="${escape(comment.id || '')}">
                    <i class="fas fa-trash-alt" aria-hidden="true"></i>
                    <span>Eliminar</span>
               </button>`
            : '';

        return `
            <article class="review-comment" data-comment-id="${escape(comment.id || '')}">
                <div class="review-comment__avatar">
                    <img src="${avatarUrl}" alt="Avatar de ${displayName}" loading="lazy">
                </div>
                <div class="review-comment__content">
                    <header class="review-comment__meta">
                        <span class="review-comment__author">${displayName}</span>
                        ${timestampLabel ? `<time class="review-comment__timestamp" datetime="${datetimeAttr}">${timestampLabel}</time>` : ''}
                        ${deleteButton}
                    </header>
                    <p class="review-comment__message">${messageHtml}</p>
                </div>
            </article>
        `.trim();
    };

    const renderComments = (comments) => {
        if (!commentsListEl) {
            return;
        }
        if (!Array.isArray(comments) || !comments.length) {
            commentsListEl.innerHTML = '<p class="review-comments-modal__empty">A\u00fan no hay comentarios. \u00a1S\u00e9 el primero en participar!</p>';
            return;
        }
        commentsListEl.innerHTML = comments.map(renderCommentItem).join('');
    };

    const fetchUserProfile = async (userId) => {
        if (!userId) {
            return {};
        }
        if (userProfileCache.has(userId)) {
            return userProfileCache.get(userId);
        }
        const services = getServices();
        const db = services.db;
        if (!db) {
            return {};
        }
        try {
            const snap = await db.collection('users').doc(userId).get();
            const data = snap.exists ? (snap.data() || {}) : {};
            userProfileCache.set(userId, data);
            return data;
        } catch (error) {
            console.warn('[reviewComments] No se pudo obtener el perfil del usuario:', error);
            const fallback = {};
            userProfileCache.set(userId, fallback);
            return fallback;
        }
    };

    const updateCardCommentCount = (card, newCount) => {
        if (!card) {
            return;
        }
        const sanitized = sanitizeCount(newCount);
        const commentButton = card.querySelector('[data-review-action="comment"]');
        if (commentButton) {
            const countEl = commentButton.querySelector('[data-action-count="comments"]');
            if (countEl) {
                countEl.textContent = sanitized;
            }
        }
        card.dataset.commentCount = sanitized;
    };

    const loadComments = async () => {
        const activeContext = currentContext;
        if (!activeContext) {
            return;
        }
        const services = getServices();
        const db = services.db;
        const auth = services.auth;
        if (!db) {
            showNotification('No se pudieron cargar los comentarios.', 'error');
            return;
        }

        toggleLoading(true);
        if (commentsListEl) {
            commentsListEl.innerHTML = '';
        }
        try {
            const reviewRef = db.collection('lists').doc(activeContext.listId).collection('reviews').doc(activeContext.reviewId);
            const snapshot = await reviewRef.collection('comments').orderBy('createdAt', 'asc').limit(100).get();
            if (currentContext !== activeContext) {
                return;
            }
            const currentUserId = auth && auth.currentUser ? auth.currentUser.uid : null;
            const comments = await Promise.all(snapshot.docs.map(async (doc) => {
                const data = doc.data() || {};
                const isOwner = Boolean(currentUserId && data.userId && currentUserId === data.userId);
                return { id: doc.id, isOwner, ...data };
            }));
            renderComments(comments);
            updateCardCommentCount(currentContext.card, comments.length);
        } catch (error) {
            console.error('[reviewComments] Error cargando comentarios:', error);
            showNotification('No se pudieron cargar los comentarios.', 'error');
            renderComments([]);
        } finally {
            toggleLoading(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!currentContext || !textareaEl) {
            return;
        }
        const rawMessage = textareaEl.value.trim();
        if (!rawMessage) {
            showNotification('Escribe un comentario antes de enviarlo.', 'warning');
            return;
        }

        const services = getServices();
        const db = services.db;
        const auth = services.auth;

        if (!db || !auth) {
            showNotification('Servicio no disponible.', 'error');
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            showNotification('Necesitas iniciar sesi\u00f3n para comentar.', 'info');
            return;
        }

        const FieldValue = firebase?.firestore?.FieldValue;
        if (!FieldValue) {
            showNotification('Servicio no disponible.', 'error');
            return;
        }

        submitButton?.classList.add('is-loading');
        submitButton?.setAttribute('disabled', 'true');

        try {
            const userProfile = await fetchUserProfile(user.uid);
            const reviewRef = db.collection('lists').doc(currentContext.listId).collection('reviews').doc(currentContext.reviewId);
            const payload = {
                userId: user.uid,
                userDisplayName: userProfile.displayName || userProfile.username || user.displayName || user.email || 'Usuario',
                userPhotoUrl: userProfile.photoUrl || user.photoURL || 'img/placeholder-avatar.png',
                message: rawMessage,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };
            await reviewRef.collection('comments').add(payload);
            await reviewRef.update({
                commentsCount: FieldValue.increment(1)
            });
            textareaEl.value = '';
            showNotification('Comentario publicado.', 'success');
            const snippet = truncateText(rawMessage, 160);
            await createOwnerNotification({
                ownerId: currentContext.authorId || '',
                actorId: user.uid,
                actorDisplayName: payload.userDisplayName,
                actorPhotoUrl: payload.userPhotoUrl,
                commentSnippet: snippet,
                listId: currentContext.listId,
                listName: currentContext.listName,
                reviewId: currentContext.reviewId,
                itemName: currentContext.itemName,
                detailUrl: currentContext.detailUrl,
                reviewPhotoUrl: currentContext.reviewPhotoUrl
            });
            await loadComments();
        } catch (error) {
            console.error('[reviewComments] Error al publicar comentario:', error);
            showNotification('No se pudo publicar tu comentario.', 'error');
        } finally {
            submitButton?.classList.remove('is-loading');
            submitButton?.removeAttribute('disabled');
        }
    };

    const handleDeleteCommentClick = async (event) => {
        const button = event.target.closest('[data-comment-delete]');
        if (!button || !currentContext) {
            return;
        }
        event.preventDefault();
        const commentId = button.dataset.commentDelete;
        if (!commentId) {
            return;
        }
        if (!window.confirm('¿Eliminar este comentario?')) {
            return;
        }

        const services = getServices();
        const db = services.db;
        const auth = services.auth;
        const FieldValue = firebase?.firestore?.FieldValue;
        if (!db || !auth || !auth.currentUser) {
            showNotification('No se pudo eliminar el comentario.', 'error');
            return;
        }

        const reviewRef = db.collection('lists').doc(currentContext.listId).collection('reviews').doc(currentContext.reviewId);
        const commentRef = reviewRef.collection('comments').doc(commentId);
        const originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';

        try {
            const snapshot = await commentRef.get();
            if (!snapshot.exists) {
                showNotification('El comentario ya no existe.', 'info');
            } else if ((snapshot.data()?.userId || '') !== auth.currentUser.uid) {
                showNotification('Solo puedes eliminar tus propios comentarios.', 'warning');
            } else {
                await commentRef.delete();
                if (FieldValue) {
                    await reviewRef.update({ commentsCount: FieldValue.increment(-1) });
                }
                showNotification('Comentario eliminado.', 'success');
            }
        } catch (error) {
            console.error('[reviewComments] Error eliminando comentario:', error);
            showNotification('No se pudo eliminar el comentario.', 'error');
        } finally {
            button.innerHTML = originalHtml;
            button.disabled = false;
            await loadComments();
        }
    };

    const open = (card) => {
        if (!card) {
            return;
        }
        ensureModal();

        const helper = window.ListopicApp?.reviewActions?.getReviewData;
        const baseData = typeof helper === 'function' ? (helper(card) || {}) : {};

        currentContext = {
            card,
            listId: baseData.listId || card.dataset.listId || '',
            reviewId: baseData.reviewId || card.dataset.reviewId || '',
            itemName: baseData.itemName || '',
            listName: baseData.listName || '',
            authorId: baseData.authorId || card.dataset.authorId || '',
            detailUrl: baseData.detailUrl || card.dataset.detailUrl || '',
            reviewPhotoUrl: baseData.photoUrl || card.dataset.photoUrl || ''
        };

        if (!currentContext.listId || !currentContext.reviewId) {
            showNotification('No se pudieron cargar los comentarios.', 'error');
            currentContext = null;
            return;
        }

        if (titleEl) {
            const itemName = currentContext.itemName || 'la rese\u00f1a';
            titleEl.textContent = `Comentarios sobre ${itemName}`;
        }

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        attachKeydownHandler();
        if (textareaEl) {
            textareaEl.value = '';
        }
        if (textareaEl) {
            window.setTimeout(() => {
                try {
                    textareaEl.focus();
                } catch (error) {
                    /* ignore focus errors */
                }
            }, 120);
        }
        loadComments();
    };

    const close = () => {
        if (!modal) {
            return;
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        toggleLoading(false);
        detachKeydownHandler();
        currentContext = null;
    };

    return {
        open,
        close
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
        modal.className = 'review-share-modal help-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="help-modal__overlay" data-review-share-dismiss></div>
            <div class="help-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="review-share-title">
                <button type="button" class="help-modal__close" data-review-share-dismiss aria-label="Cerrar">
                    <i class="fas fa-times"></i>
                </button>
                <div class="help-modal__content review-share-modal__content">
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
            </div>
        `;
        document.body.appendChild(modal);

        const dismissElements = modal.querySelectorAll('[data-review-share-dismiss]');
        closeButton = modal.querySelector('.help-modal__close');
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

        dismissElements.forEach(element => {
            element.addEventListener('click', (event) => {
                event.preventDefault();
                close();
            });
        });

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

        copyButton?.addEventListener('click', handleCopyLink);
        nativeShareButton?.addEventListener('click', handleNativeShare);

        document.addEventListener('keydown', handleKeydown, true);
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape' && modal?.classList.contains('is-open')) {
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
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        loadChats();
    };

    const close = () => {
        if (!modal) {
            return;
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
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
    const shouldShow = Boolean(visible);
    if (shouldShow) {
        badgeElement.hidden = false;
        badgeElement.setAttribute('data-visible', 'true');
        badgeElement.classList.add('badge-indicator--visible');
        badgeElement.setAttribute('aria-hidden', 'false');
    } else {
        badgeElement.hidden = true;
        badgeElement.setAttribute('data-visible', 'false');
        badgeElement.classList.remove('badge-indicator--visible');
        badgeElement.setAttribute('aria-hidden', 'true');
    }
};

ListopicApp.ui = ListopicApp.ui || {};
ListopicApp.ui.setBadgeVisibility = setBadgeVisibility;

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

const parseNotificationTimestamp = (value) => {
    if (!value) {
        return null;
    }

    try {
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
        }
    } catch (error) {
        console.warn('[notifications] No se pudo convertir timestamp Firestore:', error);
    }

    const candidate = value instanceof Date ? value : new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const truncateText = (text, maxLength = 140) => {
    if (typeof text !== 'string') {
        return '';
    }
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength - 1)}…`;
};

const mapNotificationToDisplayModel = (notification = {}) => {
    const type = notification.type || 'generic';
    const model = {
        id: notification.id || '',
        type,
        read: Boolean(notification.read),
        title: 'Notificación',
        segments: [],
        iconClass: 'fas fa-bell',
        thumbnailUrl: '',
        thumbnailAlt: 'Notificación',
        primaryLink: null,
        createdAt: parseNotificationTimestamp(notification.createdAt)
    };

    const safeActorName = notification.actorDisplayName || notification.actorUsername || notification.actorEmail || '';
    const actorName = typeof safeActorName === 'string' && safeActorName.trim().length > 0
        ? safeActorName.trim()
        : 'Alguien';
    const actorId = typeof notification.actorId === 'string' ? notification.actorId : null;
    const actorUrl = actorId ? `profile.html?viewUserId=${encodeURIComponent(actorId)}` : null;
    const listId = typeof notification.listId === 'string' ? notification.listId : null;
    const listNameRaw = typeof notification.listName === 'string' ? notification.listName : '';
    const listName = listNameRaw.trim();
    const listUrl = listId ? `list-view.html?listId=${encodeURIComponent(listId)}` : null;
    const reviewId = typeof notification.reviewId === 'string' ? notification.reviewId : null;
    const itemNameRaw = typeof notification.itemName === 'string' ? notification.itemName : '';
    const itemName = itemNameRaw.trim();
    const reviewUrl = notification.detailUrl
        || (reviewId && listId
            ? `detail-view.html?id=${encodeURIComponent(reviewId)}&listId=${encodeURIComponent(listId)}`
            : null);

    const segments = [];

    if (type === 'new_follower') {
        const followerNameRaw = notification.followerDisplayName || notification.followerUsername || '';
        const followerName = typeof followerNameRaw === 'string' && followerNameRaw.trim().length > 0
            ? followerNameRaw.trim()
            : 'Un usuario';
        const followerId = typeof notification.followerId === 'string' ? notification.followerId : null;
        const followerUrl = followerId ? `profile.html?viewUserId=${encodeURIComponent(followerId)}` : null;

        model.title = 'Nuevo seguidor';
        model.iconClass = 'fas fa-user-plus';
        model.thumbnailUrl = notification.followerPhotoUrl || '';
        model.thumbnailAlt = `Avatar de ${followerName}`;
        model.primaryLink = followerUrl;

        if (followerUrl) {
            segments.push({ type: 'link', text: followerName, href: followerUrl, title: `Ver perfil de ${followerName}` });
        } else {
            segments.push({ type: 'text', text: followerName });
        }
        segments.push({ type: 'text', text: ' ahora te sigue.' });
    } else if (type === 'review_comment') {
        const snippet = truncateText(notification.commentSnippet || notification.comment || '', 160);

        model.title = 'Nuevo comentario en tu reseña';
        model.iconClass = 'fas fa-comment-dots';
        model.thumbnailUrl = notification.reviewPhotoUrl || notification.actorPhotoUrl || '';
        model.thumbnailAlt = itemName ? `Imagen de ${itemName}` : `Avatar de ${actorName}`;
        model.primaryLink = reviewUrl || actorUrl || listUrl;

        if (actorUrl) {
            segments.push({ type: 'link', text: actorName, href: actorUrl, title: `Ver perfil de ${actorName}` });
        } else {
            segments.push({ type: 'text', text: actorName });
        }
        segments.push({ type: 'text', text: ' comentó en tu reseña' });

        if (reviewUrl && itemName) {
            segments.push({ type: 'text', text: ' ' });
            segments.push({ type: 'link', text: itemName, href: reviewUrl, title: `Ver reseña de ${itemName}` });
        } else if (itemName) {
            segments.push({ type: 'text', text: ` ${itemName}` });
        }

        if (listUrl && listName) {
            segments.push({ type: 'text', text: ' en la lista ' });
            segments.push({ type: 'link', text: listName, href: listUrl, title: `Ver lista ${listName}` });
        } else if (listName) {
            segments.push({ type: 'text', text: ` en la lista ${listName}` });
        }

        if (snippet) {
            segments.push({ type: 'text', text: ': ' });
            segments.push({ type: 'quote', text: snippet });
        }
    } else if (type === 'review_reaction') {
        const reactionType = typeof notification.reactionType === 'string'
            ? notification.reactionType.toLowerCase()
            : '';
        const isDislike = reactionType === 'dislike';
        const actionText = isDislike
            ? ' marcó tu reseña como "No me gusta"'
            : ' le dio Me gusta a tu reseña';

        model.title = 'Nueva reacción a tu reseña';
        model.iconClass = isDislike ? 'fas fa-thumbs-down' : 'fas fa-thumbs-up';
        model.thumbnailUrl = notification.reviewPhotoUrl || notification.actorPhotoUrl || '';
        model.thumbnailAlt = itemName ? `Imagen de ${itemName}` : `Avatar de ${actorName}`;
        model.primaryLink = reviewUrl || actorUrl || listUrl;

        if (actorUrl) {
            segments.push({ type: 'link', text: actorName, href: actorUrl, title: `Ver perfil de ${actorName}` });
        } else {
            segments.push({ type: 'text', text: actorName });
        }
        segments.push({ type: 'text', text: `${actionText}` });

        if (reviewUrl && itemName) {
            segments.push({ type: 'text', text: ' ' });
            segments.push({ type: 'link', text: itemName, href: reviewUrl, title: `Ver reseña de ${itemName}` });
        } else if (itemName) {
            segments.push({ type: 'text', text: ` ${itemName}` });
        }

        if (listUrl && listName) {
            segments.push({ type: 'text', text: ' en la lista ' });
            segments.push({ type: 'link', text: listName, href: listUrl, title: `Ver lista ${listName}` });
        } else if (listName) {
            segments.push({ type: 'text', text: ` en la lista ${listName}` });
        }
    } else {
        const message = notification.message || notification.text || notification.title || '';
        model.title = notification.title || 'Notificación';
        if (typeof message === 'string' && message.trim().length > 0) {
            segments.push({ type: 'text', text: message.trim() });
        } else {
            segments.push({ type: 'text', text: 'Tienes una nueva notificación.' });
        }

        if (notification.url) {
            model.primaryLink = notification.url;
        }
    }

    model.segments = segments;

    if (!model.thumbnailUrl && typeof notification.avatarUrl === 'string') {
        model.thumbnailUrl = notification.avatarUrl;
    }

    if (!model.primaryLink && notification.url) {
        model.primaryLink = notification.url;
    }

    return model;
};

const renderNotificationSegments = (parentElement, segments = [], options = {}) => {
    if (!parentElement || !Array.isArray(segments)) {
        return;
    }
    const { closeModalCallback } = options;

    segments.forEach(segment => {
        if (!segment || typeof segment.text !== 'string') {
            return;
        }
        if (segment.type === 'link' && segment.href) {
            const link = document.createElement('a');
            link.href = segment.href;
            link.textContent = segment.text;
            link.className = 'notification-inline-link';
            link.title = segment.title || segment.text;
            link.addEventListener('click', () => {
                if (typeof closeModalCallback === 'function') {
                    closeModalCallback();
                }
            });
            parentElement.appendChild(link);
        } else if (segment.type === 'quote') {
            const quote = document.createElement('q');
            quote.className = 'notification-quote';
            quote.textContent = segment.text;
            parentElement.appendChild(quote);
        } else {
            parentElement.appendChild(document.createTextNode(segment.text));
        }
    });
};

const getNotificationPlainText = (segments = []) => {
    if (!Array.isArray(segments)) {
        return '';
    }
    return segments.map(segment => {
        if (!segment || typeof segment.text !== 'string') {
            return '';
        }
        if (segment.type === 'quote') {
            return `"${segment.text}"`;
        }
        return segment.text;
    }).join('');
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
        const displayModel = mapNotificationToDisplayModel(notification);
        const linkTarget = displayModel.primaryLink;
        const item = document.createElement(linkTarget ? 'a' : 'div');
        item.className = 'notification-item';
        if (linkTarget) {
            item.href = linkTarget;
            item.setAttribute('aria-label', displayModel.title || 'Ver detalle de la notificación');
        }
        if (notification.id) {
            item.dataset.notificationId = notification.id;
        }
        if (!notification.read) {
            item.classList.add('unread');
        }

        const avatar = document.createElement('img');
        avatar.src = displayModel.thumbnailUrl || 'img/default-avatar.png';
        avatar.alt = displayModel.thumbnailAlt || 'Avatar de notificación';

        const content = document.createElement('div');
        content.className = 'notification-content';

        const title = document.createElement('span');
        title.className = 'notification-title';
        title.textContent = displayModel.title || 'Nueva notificación';

        const meta = document.createElement('span');
        meta.className = 'notification-meta';
        meta.textContent = formatTimestampForUi(notification.createdAt);

        content.appendChild(title);

        const previewText = getNotificationPlainText(displayModel.segments);
        if (previewText) {
            const preview = document.createElement('span');
            preview.className = 'notification-subtitle';
            preview.textContent = previewText;
            content.appendChild(preview);
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
                    console.error('[main] Error marcando notificación como leída:', error);
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
    const clearedChatIds = new Set();

    const normalizeChatId = (value) => {
        if (typeof value === 'string') {
            return value.trim() || null;
        }
        if (value === 0 || value) {
            return String(value);
        }
        return null;
    };

    const registerClearedChatIds = (detail) => {
        if (!detail) {
            return;
        }
        const ids = Array.isArray(detail.chatIds)
            ? detail.chatIds
            : (detail.chatId ? [detail.chatId] : []);
        ids.map(normalizeChatId).forEach(id => {
            if (id) {
                clearedChatIds.add(id);
            }
        });
    };

    if (chatsBadge) {
        const handleChatUnreadCleared = (event) => {
            registerClearedChatIds(event?.detail);
            setBadgeVisibility(chatsBadge, false);
        };
        document.addEventListener('listopic:chatUnreadCleared', handleChatUnreadCleared);
        cleanupFunctions.push(() => {
            document.removeEventListener('listopic:chatUnreadCleared', handleChatUnreadCleared);
            clearedChatIds.clear();
        });
    }

    if (ListopicApp.services.listenToUserChats && chatsBadge) {
        const unsubscribeChats = ListopicApp.services.listenToUserChats(user.uid, chats => {
            if (Array.isArray(chats)) {
                chats.forEach(chat => {
                    const chatId = normalizeChatId(chat?.id);
                    const rawUnread = chat?.unreadCounts ? chat.unreadCounts[user.uid] : null;
                    const unreadCount = typeof rawUnread === 'number' ? rawUnread : Number.parseInt(rawUnread, 10);
                    if (chatId && (!Number.isFinite(unreadCount) || unreadCount <= 0)) {
                        clearedChatIds.delete(chatId);
                    }
                });
            }
            const hasUnread = Array.isArray(chats) && chats.some(chat => {
                const chatId = normalizeChatId(chat?.id);
                const rawUnread = chat?.unreadCounts ? chat.unreadCounts[user.uid] : null;
                const unreadCount = typeof rawUnread === 'number' ? rawUnread : Number.parseInt(rawUnread, 10);
                if (!Number.isFinite(unreadCount)) {
                    return false;
                }
                return unreadCount > 0 && !(chatId && clearedChatIds.has(chatId));
            });
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

    if (notificationsButton && notificationsDropdown && notificationsButton.dataset.skipDropdown !== 'true') {
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
    const notificationsButton = document.getElementById('notifications-button');
    if (!notificationsButton || notificationsButton.dataset.notificationsSetup === 'true') {
        return;
    }

    const notificationsBadge = document.getElementById('notifications-badge');
    const dropdown = document.getElementById('notifications-dropdown');
    if (dropdown) {
        dropdown.classList.remove('active');
        dropdown.setAttribute('aria-hidden', 'true');
        dropdown.setAttribute('hidden', 'true');
    }

    notificationsButton.dataset.skipDropdown = 'true';
    notificationsButton.setAttribute('aria-haspopup', 'dialog');

    const {
        modal,
        listElement,
        loadingElement,
        emptyElement,
        closeButton
    } = ensureNotificationsModalElements();

    const hideBadge = () => {
        if (notificationsBadge) {
            setBadgeVisibility(notificationsBadge, false);
        }
    };

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

    const renderNotifications = (notifications = []) => {
        listElement.innerHTML = '';

        if (!Array.isArray(notifications) || notifications.length === 0) {
            emptyElement.hidden = false;
            return;
        }

        emptyElement.hidden = true;

        notifications.forEach(notification => {
            const model = mapNotificationToDisplayModel(notification);
            const item = document.createElement('li');
            item.className = 'notifications-item';

            const mediaWrapper = document.createElement('div');
            if (model.thumbnailUrl) {
                mediaWrapper.className = 'notification-thumbnail-wrapper';
                const thumbnail = document.createElement('img');
                thumbnail.src = model.thumbnailUrl;
                thumbnail.alt = model.thumbnailAlt || 'Imagen de notificación';
                thumbnail.loading = 'lazy';
                mediaWrapper.appendChild(thumbnail);
            } else {
                mediaWrapper.className = 'notification-icon';
                const iconElement = document.createElement('i');
                iconElement.className = model.iconClass || 'fas fa-bell';
                mediaWrapper.appendChild(iconElement);
            }

            const mainWrapper = document.createElement(model.primaryLink ? 'a' : 'div');
            mainWrapper.className = 'notification-main';
            if (model.primaryLink) {
                mainWrapper.href = model.primaryLink;
                mainWrapper.addEventListener('click', () => closeModal());
            }

            const titleElement = document.createElement('h3');
            titleElement.className = 'notification-title';
            titleElement.textContent = model.title || 'Notificación';
            mainWrapper.appendChild(titleElement);

            const messageElement = document.createElement('p');
            messageElement.className = 'notification-message';
            renderNotificationSegments(messageElement, model.segments, { closeModalCallback: closeModal });
            if (!messageElement.textContent.trim()) {
                messageElement.textContent = 'Tienes una nueva notificación.';
            }
            mainWrapper.appendChild(messageElement);

            const notificationDate = model.createdAt || parseNotificationTimestamp(notification.createdAt);
            if (notificationDate instanceof Date && !Number.isNaN(notificationDate.getTime())) {
                const timeElement = document.createElement('time');
                timeElement.className = 'notification-time';
                timeElement.dateTime = notificationDate.toISOString();
                timeElement.textContent = formatRelativeTimeForNotifications(notificationDate) || notificationDate.toLocaleString();
                mainWrapper.appendChild(timeElement);
            }

            item.appendChild(mediaWrapper);
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

        const finalize = () => {
            notificationsButton.disabled = false;
            delete notificationsButton.dataset.loading;
            hideBadge();
        };

        if (!currentUser) {
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'Inicia sesión para ver tus notificaciones.';
            finalize();
            return;
        }

        if (!ListopicApp.services || typeof ListopicApp.services.getUserNotifications !== 'function') {
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'El servicio de notificaciones no está disponible en este momento.';
            finalize();
            return;
        }

        try {
            let notifications = Array.isArray(ListopicApp.state.notificationsCache) && ListopicApp.state.notificationsCache.length
                ? [...ListopicApp.state.notificationsCache]
                : null;

            if (!notifications) {
                notifications = await ListopicApp.services.getUserNotifications(currentUser.uid, { limit: 30 });
            }

            loadingElement.hidden = true;

            if (!Array.isArray(notifications) || notifications.length === 0) {
                emptyElement.hidden = false;
                hideBadge();
                finalize();
                return;
            }

            renderNotifications(notifications);

            const unreadIds = notifications
                .filter(notification => !notification.read && notification.id)
                .map(notification => notification.id);

            if (unreadIds.length > 0 && typeof ListopicApp.services.markNotificationsAsRead === 'function') {
                try {
                    await ListopicApp.services.markNotificationsAsRead(currentUser.uid, unreadIds);
                    notifications = notifications.map(notification => unreadIds.includes(notification.id)
                        ? { ...notification, read: true }
                        : notification);
                } catch (markError) {
                    console.error('[main] Error marcando notificaciones como leídas desde el modal:', markError);
                }
            }

            ListopicApp.state.notificationsCache = notifications;
        } catch (error) {
            console.error('main.js: No se pudieron cargar las notificaciones:', error);
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'No pudimos cargar tus notificaciones. Intenta nuevamente más tarde.';
        } finally {
            finalize();
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
        console.error("MAIN.JS: Firebase services (auth, storage, db) no disponibles."); // <--- LOG 2 (si entra aquí)
        // Podrías mostrar un error al usuario aquí si la app no puede funcionar.
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
        console.error("MAIN.JS: ThemeManager no disponible."); // <--- LOG 5 (si entra aquí)
    }

    if (ListopicApp.authService && ListopicApp.authService.init) {
        console.log("MAIN.JS: Inicializando AuthService..."); // <--- LOG 6
        ListopicApp.authService.init();
    } else {
        console.error("MAIN.JS: AuthService no disponible."); // <--- LOG 7 (si entra aquí)
    }

    const pagePath = window.location.pathname;
    const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1).toLowerCase(); // Convertido a minúsculas para consistencia
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
                ListopicApp.pageAuth.init(); // pageAuth puede tener lógica incluso si el usuario ya está logueado (para redirigir)
            }
        } else if (!user) {
            // Si no es la pagina de autenticacion y no hay usuario, authService ya debería haber redirigido.
            // No se inicializa ninguna otra lógica de pagina.
            console.log("MAIN.JS: Usuario no autenticado y no en auth.html. authService debería redirigir."); // <--- LOG 13
            return;
        } else {
            // Usuario autenticado, o pagina pública que no requiere autenticacion (como index, si se decide)
            console.log("MAIN.JS: Usuario autenticado o pagina pública. Procediendo a inicializar lógica de pagina específica."); // <--- LOG 14
            initializeGlobalRealtimeFeatures(user);
            if (isIndexPage) {
                console.log("MAIN.JS: Es Index page, intentando inicializar pageIndex..."); // <--- LOG 15
                 if(ListopicApp.pageIndex && ListopicApp.pageIndex.init) {
                    ListopicApp.pageIndex.init();
                }
            } else if (pageName === 'review-form.html') {
                console.log("MAIN.JS: Es review-form.html, intentando inicializar pageReviewForm..."); // <--- LOG 16
                if (ListopicApp.pageReviewForm && ListopicApp.pageReviewForm.init) {
                    ListopicApp.pageReviewForm.init(); // Aquí es donde se llamaría a tu init
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
                    console.log("MAIN.JS: Coincide 'profile.html', ejecutando pageProfile.init()..."); // Log de confirmación
                    ListopicApp.pageProfile.init();
                } else {
                    console.error("MAIN.JS: ListopicApp.pageProfile.init no encontrado!"); // Log de error
                }
            } else if (pageName === 'chats.html') {
                if (ListopicApp.pageChats && ListopicApp.pageChats.init) {
                    ListopicApp.pageChats.init();
                }
            } else if (pageName === 'search.html') { // NUEVA CONDICIÓN
                if (ListopicApp.pageSearch && ListopicApp.pageSearch.init) {
                    ListopicApp.pageSearch.init();
                }
            } else if (pageName === 'place-detail.html') { // PÁGINA DE LUGAR
                if (ListopicApp.pagePlace && ListopicApp.pagePlace.init) {
                    ListopicApp.pagePlace.init();
                }
            } else if (pageName === 'developer.html') { // PÁGINA DE LUGAR
            if (ListopicApp.pagePlace && ListopicApp.pageDeveloper.init) {
                ListopicApp.pagePlace.init();
                }
            } else if (pageName === 'chats.html') {
                if (ListopicApp.pageChats && ListopicApp.pageChats.init) {
                    ListopicApp.pageChats.init();
                }
            } else {
                // Esta es la línea 95 en la estructura original del if/else if
                console.warn("MAIN.JS: No se detectó una pagina conocida. pageName:", pageName); // <--- LOG si ninguna coincide
            }
        }
    }).catch(error => {
        console.error("MAIN.JS: Error en onAuthStateChangedPromise:", error); // <--- LOG 18 (si la promesa falla)
        // Manejar error crítico si la autenticacion no se puede verificar
    });

    console.log("MAIN.JS: Fin del script de inicialización de main.js."); // <--- LOG 19



    // --- Lógica para la Instalación de la PWA (desde el Menú de Usuario) ---
let deferredPrompt;
const installMenuItem = document.getElementById('installPwaBtn');

// Criterio 1: El navegador dispara el evento para instalar
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que se muestre el mini-infobar por defecto
    e.preventDefault();
    // Guardar el evento para usarlo después
    deferredPrompt = e;
    
    // Mostrar la opción en el menú solo si no está ya instalada
    // y el navegador lo permite.
    if (installMenuItem && !isAppInstalled()) {
        console.log("Evento 'beforeinstallprompt' capturado. Mostrando opción de instalar en el menú.");
        installMenuItem.style.display = 'block';
    }
});

// Criterio 2: El usuario hace clic en nuestro botón del menú
if (installMenuItem) {
    installMenuItem.addEventListener('click', async () => {
        // Asegurarnos de que aún tenemos el evento
        if (deferredPrompt) {
            // Mostrar el diálogo de instalación del navegador
            deferredPrompt.prompt();
            
            // Esperar la respuesta del usuario
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Respuesta del usuario al prompt de instalación: ${outcome}`);

            // Si el usuario acepta, ya no necesitamos mostrar el botón
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
    // Ocultar la opción del menú y limpiar todo
    if (installMenuItem) {
        installMenuItem.style.display = 'none';
    }
    deferredPrompt = null;
    console.log('PWA fue instalada con éxito.');
    if(ListopicApp.services && ListopicApp.services.showNotification) {
        ListopicApp.services.showNotification('¡Listopic instalado! Búscalo en tu pantalla de inicio.', 'success');
    }
});

// Función de ayuda para saber si la app ya se está ejecutando como PWA
function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Al cargar la pagina, si ya está en modo standalone, nos aseguramos
// de que el botón no aparezca por si acaso.
if (isAppInstalled() && installMenuItem) {
    console.log("La app ya se está ejecutando en modo standalone. La opción de instalar no se mostrará.");
    installMenuItem.style.display = 'none';
}
// --- Fin de la Lógica de Instalación de la PWA ---


    
});


// Función global para limpiar cache de etiquetas (útil para desarrollo)
window.clearCategoryTagsCache = function() {
    if (ListopicApp.pageSearch && ListopicApp.pageSearch.clearTagsCache) {
        ListopicApp.pageSearch.clearTagsCache();
        console.log('Cache de etiquetas limpiado');
    } else {
        console.warn('Función de limpiar cache no disponible');
    }
};

// Registro del Service Worker para gestionar el caché
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      console.log('Service Worker registrado con éxito:', registration);
    }).catch((err) => {
      console.log('Fallo en el registro del Service Worker:', err);
    });
  });
}

