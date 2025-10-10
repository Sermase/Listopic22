window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageChats = (() => {
    let chatListElement;
    let chatMessagesElement;
    let messageForm;
    let messageInput;
    let chatListStatusElement;
    let chatTitleElement;
    let chatHeaderAvatarsElement;
    let chatHeaderSubtitleElement;
    let chatInfoButton;
    let emptyStateElement;

    let chatListPanel;
    let chatListBackdrop;
    let mobileListOpenButton;
    let mobileListCloseButton;

    let groupModalElement;
    let groupModalForm;
    let groupNameField;
    let groupNameInput;
    let groupSearchInput;
    let groupSearchResultsElement;
    let groupSelectedElement;
    let groupModalEmptyState;
    let groupModalSubmitButton;
    let groupModalCancelButton;
    let groupModalCloseButton;

    let chatInfoModalElement;
    let chatInfoTitleElement;
    let chatInfoSubtitleElement;
    let chatInfoParticipantsElement;
    let chatInfoAddButton;
    let chatInfoCloseButton;

    let unsubscribeChats = null;
    let unsubscribeMessages = null;
    let currentChatId = null;
    let currentChatData = null;
    let chatsCache = [];
    let currentUser = null;
    let pendingChatId = null;
    let followingUsersCache = [];
    let groupSelectedUsers = new Map();
    let groupModalMode = 'create';
    let groupModalTargetChatId = null;
    let groupModalBusy = false;
    const formatRelativeTime = (timestamp) => {
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

    const isMobileLayout = () => window.matchMedia('(max-width: 900px)').matches;

    const sanitizeText = (value) => (typeof value === 'string' ? value : '');

    const notifyChatUnreadCleared = (chatId = null) => {
        if (typeof document === 'undefined') {
            return;
        }
        const normalizedId = typeof chatId === 'string' ? chatId : (chatId ? String(chatId) : null);
        const eventInit = normalizedId ? { detail: { chatId: normalizedId } } : undefined;
        document.dispatchEvent(new CustomEvent('listopic:chatUnreadCleared', eventInit));
    };

    const createSharedReviewCard = (payload, isOwnMessage) => {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        const detailUrl = sanitizeText(payload.detailUrl);
        const cardElement = detailUrl ? document.createElement('a') : document.createElement('div');
        cardElement.className = 'shared-review-card';
        if (detailUrl) {
            cardElement.href = detailUrl;
            cardElement.target = '_blank';
            cardElement.rel = 'noopener noreferrer';
        }

        if (isOwnMessage) {
            cardElement.classList.add('shared-review-card--sent');
        }

        const media = document.createElement('div');
        media.className = 'shared-review-card__media';
        const photoUrl = sanitizeText(payload.photoUrl);
        if (photoUrl) {
            const image = document.createElement('img');
            image.src = photoUrl;
            image.alt = payload.itemName ? `Foto de ${sanitizeText(payload.itemName)}` : 'Foto de la reseña';
            image.className = 'shared-review-card__image';
            media.appendChild(image);
        } else {
            media.classList.add('shared-review-card__media--placeholder');
            const icon = document.createElement('i');
            icon.className = 'fas fa-camera';
            media.appendChild(icon);
        }

        const body = document.createElement('div');
        body.className = 'shared-review-card__body';

        const titleRow = document.createElement('div');
        titleRow.className = 'shared-review-card__title-row';

        const title = document.createElement('span');
        title.className = 'shared-review-card__title';
        title.textContent = sanitizeText(payload.itemName) || 'Reseña compartida';
        titleRow.appendChild(title);

        const ratingValue = sanitizeText(payload.rating);
        if (ratingValue) {
            const rating = document.createElement('span');
            rating.className = 'shared-review-card__rating';
            const numericRating = Number.parseFloat(ratingValue);
            rating.textContent = Number.isFinite(numericRating) ? numericRating.toFixed(1) : ratingValue;
            const ratingColor = window.ListopicApp?.uiUtils?.getRatingColor;
            if (typeof ratingColor === 'function') {
                const computedColor = ratingColor(Number.isFinite(numericRating) ? numericRating : ratingValue);
                if (computedColor) {
                    rating.style.backgroundColor = computedColor;
                }
            }
            titleRow.appendChild(rating);
        }

        body.appendChild(titleRow);

        const subtitleParts = [];
        const listName = sanitizeText(payload.listName);
        const placeName = sanitizeText(payload.placeName);
        if (listName) subtitleParts.push(listName);
        if (placeName) subtitleParts.push(placeName);
        if (subtitleParts.length) {
            const subtitle = document.createElement('span');
            subtitle.className = 'shared-review-card__subtitle';
            subtitle.textContent = subtitleParts.join(' · ');
            body.appendChild(subtitle);
        }

        const commentText = sanitizeText(payload.comment);
        if (commentText) {
            const comment = document.createElement('p');
            comment.className = 'shared-review-card__comment';
            comment.textContent = commentText;
            body.appendChild(comment);
        }

        cardElement.appendChild(media);
        cardElement.appendChild(body);

        return cardElement;
    };

    const openChatListModal = () => {
        if (!chatListPanel || !isMobileLayout()) return;
        chatListPanel.classList.add('is-open');
        if (chatListBackdrop) {
            chatListBackdrop.hidden = false;
            chatListBackdrop.classList.add('is-active');
        }
        document.body.classList.add('chat-list-modal-open');
    };

    const closeChatListModal = () => {
        if (chatListPanel) {
            chatListPanel.classList.remove('is-open');
        }
        if (chatListBackdrop) {
            chatListBackdrop.classList.remove('is-active');
            chatListBackdrop.hidden = true;
        }
        document.body.classList.remove('chat-list-modal-open');
    };

    const mapParticipantProfiles = (chat) => {
        if (!chat) return [];
        const profiles = chat.participantProfiles || {};
        const ids = Array.isArray(chat.participants) ? chat.participants : [];
        return ids.map(uid => ({
            uid,
            username: profiles[uid]?.username || '',
            displayName: profiles[uid]?.displayName || '',
            email: profiles[uid]?.email || '',
            photoUrl: profiles[uid]?.photoUrl || ''
        }));
    };

    const getOtherParticipants = (chat) => {
        if (!chat || !Array.isArray(chat.participants)) {
            return [];
        }
        const everyone = mapParticipantProfiles(chat);
        return everyone.filter(profile => profile.uid !== currentUser?.uid);
    };

    const getChatDisplayName = (chat) => {
        if (!chat) return 'Chat';
        if (chat.isGroup && chat.groupName) {
            return chat.groupName;
        }
        const others = getOtherParticipants(chat);
        if (!others.length) {
            return 'Conversacion personal';
        }
        return others.map(user => user.displayName || user.username || user.email || 'Usuario').join(', ');
    };

    const buildParticipantsSummary = (chat) => {
        if (!chat) return '';
        if (chat.isGroup) {
            const total = Array.isArray(chat.participants) ? chat.participants.length : 0;
            return total > 0 ? `${total} participantes` : '';
        }
        const others = getOtherParticipants(chat);
        return others[0]?.username ? `@${others[0].username}` : '';
    };
    const ensureFollowingUsers = async () => {
        if (followingUsersCache.length || !ListopicApp.services.getFollowingUsers || !currentUser) {
            return followingUsersCache;
        }
        try {
            const followers = await ListopicApp.services.getFollowingUsers(currentUser.uid);
            followingUsersCache = Array.isArray(followers) ? followers : [];
        } catch (error) {
            console.error('[page-chats] Error obteniendo seguidos:', error);
            ListopicApp.services.showNotification?.('No se pudieron cargar tus usuarios seguidos.', 'error');
            followingUsersCache = [];
        }
        return followingUsersCache;
    };

    const resetGroupModalState = () => {
        groupSelectedUsers.clear();
        if (groupNameInput) {
            groupNameInput.value = '';
        }
        if (groupSearchInput) {
            groupSearchInput.value = '';
        }
        if (groupModalEmptyState) {
            groupModalEmptyState.textContent = 'Empieza a escribir para buscar entre tus seguidos.';
            groupModalEmptyState.hidden = false;
        }
        if (groupSearchResultsElement) {
            groupSearchResultsElement.innerHTML = '';
        }
        if (groupSelectedElement) {
            groupSelectedElement.innerHTML = '';
            groupSelectedElement.classList.add('is-empty');
        }
        if (groupModalSubmitButton) {
            groupModalSubmitButton.disabled = true;
        }
    };

    const closeGroupModal = () => {
        if (!groupModalElement) return;
        groupModalElement.classList.remove('is-open');
        groupModalElement.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('chat-modal-open');
        resetGroupModalState();
        groupModalMode = 'create';
        groupModalTargetChatId = null;
    };

    const renderSelectedUsersChips = () => {
        if (!groupSelectedElement) return;
        groupSelectedElement.innerHTML = '';
        if (!groupSelectedUsers.size) {
            groupSelectedElement.classList.add('is-empty');
            return;
        }
        groupSelectedElement.classList.remove('is-empty');
        groupSelectedUsers.forEach(user => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chat-chip';
            chip.dataset.uid = user.uid;

            const avatar = document.createElement('span');
            avatar.className = 'chat-chip-avatar';
            if (user.photoUrl) {
                const img = document.createElement('img');
                img.src = user.photoUrl;
                img.alt = user.displayName || user.username || 'Usuario';
                avatar.appendChild(img);
            } else {
                avatar.textContent = (user.displayName || user.username || user.email || '?').charAt(0).toUpperCase();
            }
            chip.appendChild(avatar);

            const label = document.createElement('span');
            label.className = 'chat-chip-label';
            label.textContent = user.displayName || user.username || user.email || 'Usuario';
            chip.appendChild(label);

            const removeIcon = document.createElement('i');
            removeIcon.className = 'fas fa-times';
            chip.appendChild(removeIcon);

            chip.addEventListener('click', () => {
                groupSelectedUsers.delete(user.uid);
                renderSelectedUsersChips();
                renderGroupSearchResults(groupSearchInput?.value || '');
                updateGroupModalSubmitState();
            });

            groupSelectedElement.appendChild(chip);
        });
    };

    const filterSelectableUsers = (term, excludedIds = []) => {
        const normalizedTerm = (term || '').trim().toLowerCase();
        const excludedSet = new Set(excludedIds);
        const selectedSet = new Set(groupSelectedUsers.keys());
        return followingUsersCache.filter(user => {
            if (!user || !user.uid) return false;
            if (excludedSet.has(user.uid) || selectedSet.has(user.uid) || user.uid === currentUser?.uid) {
                return false;
            }
            if (!normalizedTerm) return true;
            const haystack = [user.displayName, user.username, user.email]
                .filter(Boolean)
                .map(value => value.toLowerCase());
            return haystack.some(value => value.includes(normalizedTerm));
        }).slice(0, 10);
    };

    const renderGroupSearchResults = (term) => {
        if (!groupSearchResultsElement) return;
        const excluded = [];
        if (groupModalMode === 'add' && groupModalTargetChatId) {
            const targetChat = chatsCache.find(chat => chat.id === groupModalTargetChatId);
            if (targetChat && Array.isArray(targetChat.participants)) {
                excluded.push(...targetChat.participants);
            }
        }
        const matches = filterSelectableUsers(term, excluded);
        groupSearchResultsElement.innerHTML = '';
        if (!matches.length) {
            if (groupModalEmptyState) {
                groupModalEmptyState.textContent = term ? 'No se encontraron usuarios.' : 'Empieza a escribir para buscar entre tus seguidos.';
                groupModalEmptyState.hidden = false;
            }
            return;
        }
        if (groupModalEmptyState) {
            groupModalEmptyState.hidden = true;
        }
        matches.forEach(user => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'chat-search-item';
            item.dataset.uid = user.uid;

            const avatar = document.createElement('span');
            avatar.className = 'chat-search-avatar';
            if (user.photoUrl) {
                const img = document.createElement('img');
                img.src = user.photoUrl;
                img.alt = user.displayName || user.username || 'Usuario';
                avatar.appendChild(img);
            } else {
                avatar.textContent = (user.displayName || user.username || user.email || '?').charAt(0).toUpperCase();
            }
            item.appendChild(avatar);

            const info = document.createElement('span');
            info.className = 'chat-search-info';
            const primary = document.createElement('strong');
            primary.textContent = user.displayName || user.username || 'Usuario';
            info.appendChild(primary);
            if (user.username) {
                const secondary = document.createElement('span');
                secondary.textContent = `@${user.username}`;
                info.appendChild(secondary);
            }
            item.appendChild(info);

            item.addEventListener('click', () => {
                groupSelectedUsers.set(user.uid, user);
                renderSelectedUsersChips();
                renderGroupSearchResults(groupSearchInput?.value || '');
                updateGroupModalSubmitState();
            });

            groupSearchResultsElement.appendChild(item);
        });
    };

    const updateGroupModalSubmitState = () => {
        if (!groupModalSubmitButton) return;
        const hasSelection = groupSelectedUsers.size > 0;
        if (groupModalMode === 'create') {
            const groupNameValid = groupNameInput && groupNameInput.value.trim().length > 0;
            groupModalSubmitButton.disabled = !(groupNameValid && hasSelection) || groupModalBusy;
            groupModalSubmitButton.textContent = 'Crear grupo';
        } else {
            groupModalSubmitButton.disabled = !hasSelection || groupModalBusy;
            groupModalSubmitButton.textContent = 'Agregar';
        }
    };

    const openGroupModal = async (mode = 'create', targetChatId = null) => {
        if (!groupModalElement) return;
        groupModalMode = mode;
        groupModalTargetChatId = targetChatId;
        groupModalBusy = false;
        resetGroupModalState();
        if (groupNameField) {
            groupNameField.hidden = mode !== 'create';
        }
        if (groupNameInput) {
            groupNameInput.required = mode === 'create';
        }
        if (groupModalSubmitButton) {
            groupModalSubmitButton.textContent = mode === 'create' ? 'Crear grupo' : 'Agregar';
        }
        if (mode === 'add' && groupNameInput) {
            groupNameInput.value = currentChatData?.groupName || '';
        }
        await ensureFollowingUsers();
        renderGroupSearchResults('');
        renderSelectedUsersChips();
        updateGroupModalSubmitState();
        groupModalElement.classList.add('is-open');
        groupModalElement.setAttribute('aria-hidden', 'false');
        document.body.classList.add('chat-modal-open');
        groupSearchInput?.focus();
    };
    const toggleChatsBadge = (visible) => {
        const badge = document.getElementById('chats-badge');
        if (!badge) {
            return;
        }
        if (visible) {
            badge.hidden = false;
            badge.setAttribute('data-visible', 'true');
        } else {
            badge.hidden = true;
            badge.setAttribute('data-visible', 'false');
        }
    };

    const updateChatsBadgeVisibility = () => {
        if (!currentUser) {
            return;
        }
        const hasUnreadChats = chatsCache.some(chat => {
            if (!chat || !chat.unreadCounts) {
                return false;
            }
            const unread = chat.unreadCounts[currentUser.uid];
            return typeof unread === 'number' && unread > 0;
        });
        toggleChatsBadge(hasUnreadChats);
    };

    const updateLocalChatData = (chatId, partialData) => {
        const index = chatsCache.findIndex(chat => chat.id === chatId);
        if (index !== -1) {
            chatsCache[index] = {
                ...chatsCache[index],
                ...partialData
            };
        }
        if (currentChatId === chatId) {
            currentChatData = {
                ...currentChatData,
                ...partialData
            };
        }
        updateChatsBadgeVisibility();
    };

    const handleGroupModalSubmit = async (event) => {
        event.preventDefault();
        if (groupModalBusy) return;
        const selectedIds = Array.from(groupSelectedUsers.keys());
        if (!selectedIds.length) {
            return;
        }
        groupModalBusy = true;
        updateGroupModalSubmitState();
        try {
            if (groupModalMode === 'create') {
                const groupName = groupNameInput?.value.trim() || '';
                if (!groupName) {
                    throw new Error('Debes indicar un nombre para el grupo.');
                }
                const response = await ListopicApp.services.createGroupChat(currentUser, selectedIds, groupName);
                if (response && response.chatId) {
                    pendingChatId = response.chatId;
                    ListopicApp.services.showNotification?.('Grupo creado correctamente.', 'success');
                }
                closeGroupModal();
            } else if (groupModalMode === 'add' && groupModalTargetChatId) {
                const update = await ListopicApp.services.updateGroupChatParticipants(groupModalTargetChatId, currentUser.uid, { add: selectedIds, remove: [] });
                if (update) {
                    updateLocalChatData(groupModalTargetChatId, update);
                    ListopicApp.services.showNotification?.('Participantes agregados al grupo.', 'success');
                    renderChatHeader(currentChatData);
                    if (groupModalTargetChatId === currentChatId) {
                        renderChatInfoModal();
                    }
                    renderChatList(chatsCache);
                }
                closeGroupModal();
            }
        } catch (error) {
            console.error('[page-chats] Error gestionando grupo:', error);
            const message = error?.message || 'No se pudo completar la operacion.';
            ListopicApp.services.showNotification?.(message, 'error');
        } finally {
            groupModalBusy = false;
            updateGroupModalSubmitState();
        }
    };

    const openChatInfoModal = () => {
        if (!currentChatData || !chatInfoModalElement || !currentChatData.isGroup) return;
        renderChatInfoModal();
        chatInfoModalElement.classList.add('is-open');
        chatInfoModalElement.setAttribute('aria-hidden', 'false');
        document.body.classList.add('chat-modal-open');
    };

    const closeChatInfoModal = () => {
        if (!chatInfoModalElement) return;
        chatInfoModalElement.classList.remove('is-open');
        chatInfoModalElement.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('chat-modal-open');
    };

    const handleRemoveParticipant = async (uid) => {
        if (!currentChatData || !currentChatData.isGroup || currentChatData.ownerId !== currentUser?.uid) {
            return;
        }
        if (!uid || uid === currentUser.uid) {
            return;
        }
        if (!Array.isArray(currentChatData.participants) || currentChatData.participants.length <= 2) {
            ListopicApp.services.showNotification?.('El grupo debe tener al menos dos participantes.', 'error');
            return;
        }
        try {
            const update = await ListopicApp.services.updateGroupChatParticipants(currentChatData.id || currentChatId, currentUser.uid, { add: [], remove: [uid] });
            if (update) {
                updateLocalChatData(currentChatData.id || currentChatId, update);
                ListopicApp.services.showNotification?.('Participante eliminado.', 'success');
                renderChatHeader(currentChatData);
                renderChatInfoModal();
                renderChatList(chatsCache);
            }
        } catch (error) {
            console.error('[page-chats] Error al eliminar participante:', error);
            const message = error?.message || 'No se pudo eliminar el participante.';
            ListopicApp.services.showNotification?.(message, 'error');
        }
    };

    const renderChatInfoModal = () => {
        if (!chatInfoModalElement || !currentChatData) return;
        const participants = mapParticipantProfiles(currentChatData);
        if (chatInfoTitleElement) {
            chatInfoTitleElement.textContent = getChatDisplayName(currentChatData);
        }
        if (chatInfoSubtitleElement) {
            const summary = buildParticipantsSummary(currentChatData);
            chatInfoSubtitleElement.textContent = summary || '';
        }
        if (chatInfoParticipantsElement) {
            chatInfoParticipantsElement.innerHTML = '';
            participants.forEach(user => {
                const item = document.createElement('div');
                item.className = 'chat-info-participant';

                const avatar = document.createElement('span');
                avatar.className = 'chat-info-participant-avatar';
                if (user.photoUrl) {
                    const img = document.createElement('img');
                    img.src = user.photoUrl;
                    img.alt = user.displayName || user.username || 'Usuario';
                    avatar.appendChild(img);
                } else {
                    avatar.textContent = (user.displayName || user.username || user.email || '?').charAt(0).toUpperCase();
                }
                item.appendChild(avatar);

                const info = document.createElement('div');
                info.className = 'chat-info-participant-data';
                const name = document.createElement('span');
                name.className = 'chat-info-participant-name';
                name.textContent = user.displayName || user.username || user.email || 'Usuario';
                info.appendChild(name);
                if (user.username) {
                    const username = document.createElement('span');
                    username.className = 'chat-info-participant-username';
                    username.textContent = `@${user.username}`;
                    info.appendChild(username);
                }
                item.appendChild(info);

                if (currentChatData.ownerId === user.uid) {
                    const badge = document.createElement('span');
                    badge.className = 'chat-info-participant-badge';
                    badge.textContent = 'Propietario';
                    item.appendChild(badge);
                } else if (currentChatData.ownerId === currentUser?.uid && currentChatData.isGroup) {
                    const removeButton = document.createElement('button');
                    removeButton.type = 'button';
                    removeButton.className = 'chat-info-remove';
                    removeButton.textContent = 'Eliminar';
                    removeButton.addEventListener('click', () => handleRemoveParticipant(user.uid));
                    item.appendChild(removeButton);
                }

                chatInfoParticipantsElement.appendChild(item);
            });
        }
        if (chatInfoAddButton) {
            const isOwner = currentChatData.isGroup && currentChatData.ownerId === currentUser?.uid;
            chatInfoAddButton.hidden = !isOwner;
        }
    };
    const renderChatHeader = (chat) => {
        if (!chatTitleElement || !chatHeaderAvatarsElement || !chatHeaderSubtitleElement) {
            return;
        }
        chatHeaderAvatarsElement.innerHTML = '';
        if (!chat) {
            chatTitleElement.textContent = 'Selecciona un chat';
            chatHeaderSubtitleElement.textContent = 'Elige una conversacion para empezar.';
            if (chatInfoButton) {
                chatInfoButton.disabled = true;
            }
            return;
        }

        chatTitleElement.textContent = getChatDisplayName(chat);
        const subtitle = buildParticipantsSummary(chat);
        chatHeaderSubtitleElement.textContent = subtitle || '';

        const others = getOtherParticipants(chat);
        const participantsForHeader = chat.isGroup ? others.slice(0, 4) : others.slice(0, 1);
        if (!participantsForHeader.length) {
            const selfProfile = mapParticipantProfiles(chat).find(user => user.uid === currentUser?.uid);
            const placeholder = document.createElement('div');
            placeholder.className = 'chat-avatar';
            const initialSource = (selfProfile?.displayName || selfProfile?.username || currentUser?.displayName || currentUser?.email || '?').trim();
            placeholder.textContent = initialSource ? initialSource.charAt(0).toUpperCase() : '?';
            chatHeaderAvatarsElement.appendChild(placeholder);
        } else {
            participantsForHeader.forEach(user => {
                const link = document.createElement('a');
                link.href = `profile.html?viewUserId=${user.uid}`;
                link.title = user.displayName || user.username || 'Ver perfil';
                link.addEventListener('click', event => event.stopPropagation());

                const avatar = document.createElement('div');
                avatar.className = 'chat-avatar';
                if (user.photoUrl) {
                    const img = document.createElement('img');
                    img.src = user.photoUrl;
                    img.alt = user.displayName || user.username || 'Usuario';
                    avatar.appendChild(img);
                } else {
                    avatar.textContent = (user.displayName || user.username || user.email || '?').charAt(0).toUpperCase();
                }
                link.appendChild(avatar);
                chatHeaderAvatarsElement.appendChild(link);
            });
        }

        if (chatInfoButton) {
            chatInfoButton.disabled = !chat.isGroup;
        }
    };

    const renderChatList = (chats) => {
        chatsCache = Array.isArray(chats) ? chats : [];
        if (!chatListElement) return;
        chatListElement.innerHTML = '';

        if (chatsCache.length === 0) {
            if (chatListStatusElement) {
                chatListStatusElement.textContent = 'No tienes chats activos todavia.';
                chatListStatusElement.hidden = false;
            }
            return;
        }

        if (chatListStatusElement) {
            chatListStatusElement.textContent = '';
            chatListStatusElement.hidden = true;
        }

        chatsCache
            .slice()
            .sort((a, b) => {
                const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || 0);
                const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || 0);
                return bTime - aTime;
            })
            .forEach(chat => {
                const item = document.createElement('div');
                item.className = 'chat-list-item';
                item.dataset.chatId = chat.id;
                item.tabIndex = 0;
                if (chat.id === currentChatId) {
                    item.classList.add('active');
                }

                const avatarsContainer = document.createElement('div');
                avatarsContainer.className = 'chat-avatars';
                const participants = chat.isGroup ? getOtherParticipants(chat).slice(0, 3) : getOtherParticipants(chat).slice(0, 1);
                if (!participants.length) {
                    const fallback = document.createElement('div');
                    fallback.className = 'chat-avatar';
                    fallback.textContent = 'T';
                    avatarsContainer.appendChild(fallback);
                } else {
                    participants.forEach(user => {
                        const link = document.createElement('a');
                        link.href = `profile.html?viewUserId=${user.uid}`;
                        link.title = user.displayName || user.username || 'Ver perfil';
                        link.addEventListener('click', event => event.stopPropagation());

                        const avatar = document.createElement('div');
                        avatar.className = 'chat-avatar';
                        if (user.photoUrl) {
                            const img = document.createElement('img');
                            img.src = user.photoUrl;
                            img.alt = user.displayName || user.username || 'Usuario';
                            avatar.appendChild(img);
                        } else {
                            avatar.textContent = (user.displayName || user.username || user.email || '?').charAt(0).toUpperCase();
                        }
                        link.appendChild(avatar);
                        avatarsContainer.appendChild(link);
                    });
                }
                item.appendChild(avatarsContainer);

                const body = document.createElement('div');
                body.className = 'chat-list-body';

                const topRow = document.createElement('div');
                topRow.className = 'chat-list-row';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'chat-name';
                nameSpan.textContent = getChatDisplayName(chat);
                topRow.appendChild(nameSpan);
                const updatedSpan = document.createElement('span');
                updatedSpan.className = 'chat-updated-at';
                updatedSpan.textContent = formatRelativeTime(chat.updatedAt);
                topRow.appendChild(updatedSpan);
                body.appendChild(topRow);

                const bottomRow = document.createElement('div');
                bottomRow.className = 'chat-list-row';
                const lastMessage = document.createElement('span');
                lastMessage.className = 'chat-last-message';
                const previewText = chat.lastMessage || (chat.lastMessageType === 'review-share' ? 'Reseña compartida' : 'Sin mensajes todavia.');
                lastMessage.textContent = previewText;
                bottomRow.appendChild(lastMessage);

                const actionsContainer = document.createElement('div');
                actionsContainer.className = 'chat-list-actions';
                const unreadCount = chat.unreadCounts && currentUser ? chat.unreadCounts[currentUser.uid] : 0;
                if (unreadCount > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'chat-unread-indicator';
                    badge.title = `${unreadCount} mensaje(s) sin leer`;
                    actionsContainer.appendChild(badge);
                }
                if (actionsContainer.children.length) {
                    bottomRow.appendChild(actionsContainer);
                }

                body.appendChild(bottomRow);
                item.appendChild(body);

                item.addEventListener('click', () => selectChat(chat.id));
                item.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectChat(chat.id);
                    }
                });

                chatListElement.appendChild(item);
            });
        updateChatsBadgeVisibility();
    };

    const renderMessages = (messages) => {
        if (!chatMessagesElement) return;
        chatMessagesElement.innerHTML = '';

        if (!Array.isArray(messages) || !messages.length) {
            if (emptyStateElement) {
                emptyStateElement.style.display = 'block';
                chatMessagesElement.appendChild(emptyStateElement);
            }
            return;
        }

        if (emptyStateElement) {
            emptyStateElement.style.display = 'none';
        }

        messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            const isOwnMessage = msg.senderId === currentUser.uid;
            if (isOwnMessage) {
                bubble.classList.add('sent');
            } else {
                bubble.classList.add('received');
            }

            if (msg.messageType) {
                bubble.dataset.messageType = msg.messageType;
            }

            const content = document.createElement('div');
            content.className = 'message-content';

            const rawText = typeof msg.text === 'string' ? msg.text : '';
            const textValue = rawText.trim();
            if (textValue) {
                const textParagraph = document.createElement('p');
                textParagraph.className = 'message-text';
                textParagraph.textContent = rawText;
                content.appendChild(textParagraph);
            }

            const sharePayload = msg.sharePayload || (msg.messageType === 'review-share' ? msg.payload : null);
            if (msg.messageType === 'review-share' && sharePayload) {
                const shareCard = createSharedReviewCard(sharePayload, isOwnMessage);
                if (shareCard) {
                    content.appendChild(shareCard);
                    bubble.classList.add('has-shared-card');
                }
            }

            if (content.children.length) {
                bubble.appendChild(content);
            }

            const meta = document.createElement('span');
            meta.className = 'message-meta';
            const senderLabel = isOwnMessage ? 'Tu' : (msg.senderProfile?.displayName || msg.senderProfile?.username || 'Usuario');
            const timeLabel = msg.createdAt ? formatRelativeTime(msg.createdAt) : '';
            meta.textContent = timeLabel ? `${senderLabel} - ${timeLabel}` : senderLabel;
            bubble.appendChild(meta);

            chatMessagesElement.appendChild(bubble);
        });

        chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    };
    const selectChat = (chatId) => {
        if (!chatId || currentChatId === chatId || !ListopicApp.services.listenToChatMessages) {
            closeChatListModal();
            return;
        }
        currentChatId = chatId;
        const chat = chatsCache.find(c => c.id === chatId);
        currentChatData = chat || null;

        if (chat && currentUser?.uid && chat.unreadCounts && typeof chat.unreadCounts === 'object') {
            const unreadCount = chat.unreadCounts[currentUser.uid] || 0;
            if (unreadCount > 0) {
                const updatedCounts = { ...chat.unreadCounts, [currentUser.uid]: 0 };
                updateLocalChatData(chat.id, { unreadCounts: updatedCounts });
                renderChatList(chatsCache);
                notifyChatUnreadCleared(chat.id);
            }
        }

        renderChatHeader(currentChatData);

        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }

        if (!messageForm) {
            closeChatListModal();
            return;
        }

        messageForm.hidden = !chat;
        if (!chat) {
            renderMessages([]);
            closeChatListModal();
            return;
        }

        if (chatListElement) {
            Array.from(chatListElement.querySelectorAll('.chat-list-item')).forEach(item => {
                item.classList.toggle('active', item.dataset.chatId === chatId);
            });
        }

        unsubscribeMessages = ListopicApp.services.listenToChatMessages(chatId, async messages => {
            renderMessages(messages);
            const unreadMessageIds = messages
                .filter(msg => Array.isArray(msg.readBy) ? !msg.readBy.includes(currentUser.uid) : true)
                .map(msg => msg.id);
            if (ListopicApp.services.markChatMessagesAsRead) {
                try {
                    await ListopicApp.services.markChatMessagesAsRead(chatId, currentUser.uid, unreadMessageIds);
                    if (unreadMessageIds.length > 0) {
                        notifyChatUnreadCleared(chatId);
                    }
                } catch (error) {
                    console.error('[page-chats] Error marcando mensajes como leidos:', error);
                }
            }
        }, error => {
            console.error('[page-chats] Error escuchando mensajes:', error);
        });

        closeChatListModal();
        if (messageInput) {
            messageInput.focus();
        }
    };

    const subscribeToChats = () => {
        if (!currentUser) return;
        if (!ListopicApp.services.listenToUserChats) {
            if (chatListStatusElement) {
                chatListStatusElement.textContent = 'El servicio de chats no esta disponible.';
                chatListStatusElement.hidden = false;
            }
            return;
        }
        if (unsubscribeChats) {
            unsubscribeChats();
            unsubscribeChats = null;
        }

        unsubscribeChats = ListopicApp.services.listenToUserChats(currentUser.uid, chats => {
            renderChatList(chats);
            if (pendingChatId) {
                const pendingExists = chats.some(chat => chat.id === pendingChatId);
                if (pendingExists) {
                    selectChat(pendingChatId);
                    pendingChatId = null;
                }
            }
            if (currentChatId) {
                const activeChat = chats.find(chat => chat.id === currentChatId);
                if (activeChat) {
                    currentChatData = activeChat;
                    renderChatHeader(currentChatData);
                }
            }
        }, error => {
            console.error('[page-chats] Error escuchando chats del usuario:', error);
            if (chatListStatusElement) {
                chatListStatusElement.textContent = 'No se pudieron cargar tus chats.';
                chatListStatusElement.hidden = false;
            }
        });
    };

    const handleMessageSubmit = async (event) => {
        event.preventDefault();
        if (!currentChatId) return;
        const text = (messageInput?.value || '').trim();
        if (!text) return;
        const submitButton = messageForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
        }
        try {
            if (!ListopicApp.services.sendChatMessage) {
                throw new Error('El servicio de mensajeria no esta disponible en este momento.');
            }
            await ListopicApp.services.sendChatMessage(currentChatId, currentUser.uid, text);
            if (messageInput) {
                messageInput.value = '';
            }
        } catch (error) {
            console.error('[page-chats] Error enviando mensaje:', error);
            ListopicApp.services.showNotification?.('No se pudo enviar el mensaje.', 'error');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    };

    const cacheDomElements = () => {
        chatListElement = document.getElementById('chat-list');
        chatMessagesElement = document.getElementById('chat-messages');
        messageForm = document.getElementById('message-form');
        messageInput = document.getElementById('message-input');
        chatListStatusElement = document.getElementById('chat-list-status');
        chatTitleElement = document.getElementById('chat-detail-title');
        chatHeaderAvatarsElement = document.getElementById('chat-detail-avatars');
        chatHeaderSubtitleElement = document.getElementById('chat-detail-subtitle');
        chatInfoButton = document.getElementById('chat-info-button');
        emptyStateElement = document.getElementById('chat-empty-state');

        chatListPanel = document.getElementById('chat-list-panel');
        chatListBackdrop = document.getElementById('chat-list-backdrop');
        mobileListOpenButton = document.getElementById('chat-list-open');
        mobileListCloseButton = document.getElementById('chat-list-close');

        groupModalElement = document.getElementById('chat-group-modal');
        groupModalForm = document.getElementById('chat-group-form');
        groupNameField = document.getElementById('group-name-field');
        groupNameInput = document.getElementById('group-name-input');
        groupSearchInput = document.getElementById('group-search-input');
        groupSearchResultsElement = document.getElementById('group-search-results');
        groupSelectedElement = document.getElementById('group-selected-users');
        groupModalEmptyState = document.getElementById('group-modal-empty-state');
        groupModalSubmitButton = document.getElementById('chat-group-submit');
        groupModalCancelButton = document.getElementById('chat-group-cancel');
        groupModalCloseButton = document.getElementById('chat-group-modal-close');

        chatInfoModalElement = document.getElementById('chat-info-modal');
        chatInfoTitleElement = document.getElementById('chat-info-title');
        chatInfoSubtitleElement = document.getElementById('chat-info-subtitle');
        chatInfoParticipantsElement = document.getElementById('chat-info-participants');
        chatInfoAddButton = document.getElementById('chat-info-add');
        chatInfoCloseButton = document.getElementById('chat-info-modal-close');
    };

    const attachEventListeners = () => {
        if (messageForm) {
            messageForm.addEventListener('submit', handleMessageSubmit);
        }
        if (messageInput) {
            messageInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey && !isMobileLayout()) {
                    event.preventDefault();
                    if (typeof messageForm?.requestSubmit === 'function') {
                        messageForm.requestSubmit();
                    } else if (messageForm) {
                        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                        messageForm.dispatchEvent(submitEvent);
                    }
                }
            });
        }
        if (mobileListOpenButton) {
            mobileListOpenButton.addEventListener('click', () => openChatListModal());
        }
        if (mobileListCloseButton) {
            mobileListCloseButton.addEventListener('click', () => closeChatListModal());
        }
        if (chatListBackdrop) {
            chatListBackdrop.addEventListener('click', () => closeChatListModal());
        }
        window.addEventListener('resize', () => {
            if (!isMobileLayout()) {
                closeChatListModal();
            }
        });
        window.addEventListener('beforeunload', () => {
            unsubscribeChats && unsubscribeChats();
            unsubscribeMessages && unsubscribeMessages();
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.remove('chat-layout');
            }
        });

        const openGroupButton = document.getElementById('open-group-modal');
        if (openGroupButton) {
            openGroupButton.addEventListener('click', () => openGroupModal('create'));
        }
        if (groupModalCloseButton) {
            groupModalCloseButton.addEventListener('click', () => closeGroupModal());
        }
        if (groupModalCancelButton) {
            groupModalCancelButton.addEventListener('click', () => closeGroupModal());
        }
        if (groupModalForm) {
            groupModalForm.addEventListener('submit', handleGroupModalSubmit);
        }
        if (groupSearchInput) {
            groupSearchInput.addEventListener('input', (event) => {
                renderGroupSearchResults(event.target.value || '');
                updateGroupModalSubmitState();
            });
        }
        if (chatInfoButton) {
            chatInfoButton.addEventListener('click', () => {
                if (!chatInfoButton.disabled) {
                    openChatInfoModal();
                }
            });
        }
        if (chatInfoAddButton) {
            chatInfoAddButton.addEventListener('click', () => {
                if (currentChatData) {
                    closeChatInfoModal();
                    openGroupModal('add', currentChatData.id || currentChatId);
                }
            });
        }
        if (chatInfoCloseButton) {
            chatInfoCloseButton.addEventListener('click', () => closeChatInfoModal());
        }
        if (chatInfoModalElement) {
            chatInfoModalElement.addEventListener('click', (event) => {
                if (event.target === chatInfoModalElement) {
                    closeChatInfoModal();
                }
            });
        }
        if (groupModalElement) {
            groupModalElement.addEventListener('click', (event) => {
                if (event.target === groupModalElement) {
                    closeGroupModal();
                }
            });
        }
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (groupModalElement && groupModalElement.classList.contains('is-open')) {
                    closeGroupModal();
                } else if (chatInfoModalElement && chatInfoModalElement.classList.contains('is-open')) {
                    closeChatInfoModal();
                }
            }
        });
    };

    const init = () => {
        if (!ListopicApp.services || !ListopicApp.services.auth) {
            console.error('[page-chats] Firebase services no disponibles.');
            return;
        }

        currentUser = ListopicApp.services.auth.currentUser;
        if (!currentUser) {
            console.error('[page-chats] Usuario no autenticado.');
            return;
        }

        cacheDomElements();
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.add('chat-layout');
        }
        attachEventListeners();

        const params = new URLSearchParams(window.location.search);
        pendingChatId = params.get('chatId');

        subscribeToChats();
    };

    return {
        init
    };
})();
