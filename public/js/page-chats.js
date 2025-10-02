window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageChats = (() => {
    let chatListElement;
    let chatMessagesElement;
    let newChatForm;
    let newChatInput;
    let messageForm;
    let messageInput;
    let chatListStatusElement;
    let newChatErrorElement;
    let chatTitleElement;
    let emptyStateElement;
    let chatListPanel;
    let chatListBackdrop;
    let mobileListOpenButton;
    let mobileListCloseButton;
    let chatHeaderAvatarsElement;
    let chatHeaderSubtitleElement;

    let unsubscribeChats = null;
    let unsubscribeMessages = null;
    let currentChatId = null;
    let chatsCache = [];
    let currentUser = null;
    let pendingChatId = null;


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

    const getOtherParticipants = (chat) => {
        if (!chat || !Array.isArray(chat.participants)) {
            return [];
        }
        const profiles = chat.participantProfiles || {};
        return chat.participants
            .filter(uid => uid !== currentUser.uid)
            .map(uid => {
                const profile = profiles[uid] || {};
                return {
                    uid,
                    username: profile.username || '',
                    displayName: profile.displayName || '',
                    email: profile.email || '',
                    photoUrl: profile.photoUrl || ''
                };
            });
    };

    const createAvatarElement = (user = {}, options = {}) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-avatar';
        if (options.size === 'sm') {
            wrapper.classList.add('sm');
        }
        const altLabel = options.alt || user.displayName || user.username || user.email || 'Avatar';

        if (user.photoUrl) {
            const img = document.createElement('img');
            img.src = user.photoUrl;
            img.alt = altLabel;
            wrapper.appendChild(img);
        } else {
            const fallback = document.createElement('span');
            const initialSource = (user.displayName || user.username || user.email || '?').trim();
            fallback.textContent = initialSource ? initialSource.charAt(0).toUpperCase() : '?';
            fallback.setAttribute('aria-hidden', 'true');
            wrapper.appendChild(fallback);
        }

        wrapper.title = altLabel;
        wrapper.setAttribute('aria-label', altLabel);
        return wrapper;
    };

    const getChatDisplayName = (chat) => {
        if (!chat) return 'Chat';
        const otherParticipants = getOtherParticipants(chat);
        if (!otherParticipants.length) {
            return 'Conversacion personal';
        }
        const names = otherParticipants.map(user => user.displayName || user.username || user.email || 'Usuario');
        return names.join(', ');
    };

    const renderChatList = (chats) => {
        chatsCache = Array.isArray(chats) ? chats : [];
        if (!chatListElement) return;

        chatListElement.innerHTML = '';

        if (chatListStatusElement) {
            if (!chatsCache.length) {
                chatListStatusElement.textContent = 'No tienes chats activos todavia.';
                chatListStatusElement.style.display = 'block';
            } else {
                chatListStatusElement.textContent = '';
                chatListStatusElement.style.display = 'none';
            }
        }

        if (!chatsCache.length) {
            return;
        }

        chatsCache.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            item.dataset.chatId = chat.id;
            item.tabIndex = 0;

            if (chat.id === currentChatId) {
                item.classList.add('active');
            }

            const otherUsers = getOtherParticipants(chat);

            const avatarsContainer = document.createElement('div');
            avatarsContainer.className = 'chat-avatars';

            if (!otherUsers.length) {
                const selfName = currentUser ? (currentUser.displayName || currentUser.email || '') : '';
                avatarsContainer.appendChild(createAvatarElement({
                    displayName: selfName || 'Tu',
                    username: selfName,
                    photoUrl: currentUser && currentUser.photoURL ? currentUser.photoURL : ''
                }, { size: 'sm', alt: 'Tu avatar' }));
            } else {
                otherUsers.slice(0, 3).forEach(user => {
                    const link = document.createElement('a');
                    link.href = `profile.html?viewUserId=${user.uid}`;
                    link.title = user.displayName || user.username || 'Ver perfil';
                    link.appendChild(createAvatarElement(user, { size: 'sm', alt: link.title }));
                    link.addEventListener('click', event => event.stopPropagation());
                    avatarsContainer.appendChild(link);
                });
            }

            item.appendChild(avatarsContainer);

            const body = document.createElement('div');
            body.className = 'chat-list-body';

            const topRow = document.createElement('div');
            topRow.className = 'chat-list-row';

            const nameElement = document.createElement('span');
            nameElement.className = 'chat-name';
            nameElement.textContent = getChatDisplayName(chat);
            topRow.appendChild(nameElement);

            const updatedAtElement = document.createElement('span');
            updatedAtElement.className = 'chat-updated-at';
            const updatedText = formatRelativeTime(chat.updatedAt) || '';
            updatedAtElement.textContent = updatedText || 'Sin actividad';
            topRow.appendChild(updatedAtElement);

            body.appendChild(topRow);

            const bottomRow = document.createElement('div');
            bottomRow.className = 'chat-list-row';

            const lastMessageElement = document.createElement('span');
            lastMessageElement.className = 'chat-last-message';
            lastMessageElement.textContent = chat.lastMessage || 'Sin mensajes todavia.';
            bottomRow.appendChild(lastMessageElement);

            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'chat-list-actions';

            const unreadCount = chat.unreadCounts && chat.unreadCounts[currentUser.uid];
            if (unreadCount && unreadCount > 0) {
                const indicator = document.createElement('span');
                indicator.className = 'chat-unread-indicator';
                indicator.title = `${unreadCount} mensaje(s) sin leer`;
                actionsContainer.appendChild(indicator);
            }

            if (otherUsers.length === 1) {
                const profileLink = document.createElement('a');
                profileLink.href = `profile.html?viewUserId=${otherUsers[0].uid}`;
                profileLink.className = 'chat-profile-link';
                profileLink.setAttribute('aria-label', `Ver perfil de ${otherUsers[0].displayName || otherUsers[0].username || 'usuario'}`);
                profileLink.innerHTML = '<i class="fas fa-user"></i>';
                profileLink.addEventListener('click', event => event.stopPropagation());
                actionsContainer.appendChild(profileLink);
            }

            if (actionsContainer.children.length > 0) {
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
    };

    const isMobileLayout = () => window.matchMedia('(max-width: 900px)').matches;

    const openChatListModal = () => {
        if (!chatListPanel) return;
        if (!isMobileLayout()) return;
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

    const renderChatHeader = (chat) => {
        if (!chatTitleElement || !chatHeaderSubtitleElement || !chatHeaderAvatarsElement) return;

        chatHeaderAvatarsElement.innerHTML = '';

        if (!chat) {
            chatTitleElement.textContent = 'Selecciona un chat';
            chatHeaderSubtitleElement.textContent = 'Elige una conversacion para empezar.';
            return;
        }

        chatTitleElement.textContent = getChatDisplayName(chat);

        const otherUsers = getOtherParticipants(chat);

        if (!otherUsers.length) {
            const selfName = currentUser ? (currentUser.displayName || currentUser.email || 'Tu') : 'Tu';
            const avatar = createAvatarElement({
                displayName: selfName,
                username: selfName,
                photoUrl: currentUser && currentUser.photoURL ? currentUser.photoURL : ''
            }, { alt: 'Tu avatar' });
            chatHeaderAvatarsElement.appendChild(avatar);
        } else {
            otherUsers.slice(0, 4).forEach(user => {
                const link = document.createElement('a');
                link.href = `profile.html?viewUserId=${user.uid}`;
                link.title = user.displayName || user.username || 'Ver perfil';
                link.appendChild(createAvatarElement(user, { alt: link.title }));
                chatHeaderAvatarsElement.appendChild(link);
            });
        }

        const participantsSummary = otherUsers.length > 1
            ? `${otherUsers.length} participantes`
            : (otherUsers[0] && otherUsers[0].username ? `@${otherUsers[0].username}` : '');

        const updatedText = formatRelativeTime(chat.updatedAt) || 'Sin actividad reciente';

        const subtitleBits = [];
        if (participantsSummary) subtitleBits.push(participantsSummary);
        if (updatedText) subtitleBits.push(updatedText);

        chatHeaderSubtitleElement.textContent = subtitleBits.join(' - ');
    };

    const renderMessages = (messages) => {
        if (!chatMessagesElement) return;
        chatMessagesElement.innerHTML = '';

        if (!messages.length) {
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
            if (msg.senderId === currentUser.uid) {
                bubble.classList.add('sent');
            } else {
                bubble.classList.add('received');
            }
            bubble.textContent = msg.text;

            const meta = document.createElement('span');
            meta.className = 'message-meta';
            const isOwnMessage = msg.senderId === currentUser.uid;
            const senderLabel = isOwnMessage ? 'Tu' : (msg.senderProfile?.displayName || msg.senderProfile?.username || 'Usuario');
            const timeLabel = msg.createdAt ? formatRelativeTime(msg.createdAt) : '';
            meta.textContent = timeLabel ? `${senderLabel} - ${timeLabel}` : senderLabel;
            bubble.appendChild(meta);

            chatMessagesElement.appendChild(bubble);
        });

        chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    };

    const handleNewChatSubmit = async (event) => {
        event.preventDefault();
        if (!currentUser) return;

        const rawIdentifiers = newChatInput.value;
        const identifiers = rawIdentifiers.split(',').map(id => id.trim()).filter(Boolean);
        if (!identifiers.length) {
            showNewChatError('Introduce al menos un usuario.');
            return;
        }

        try {
            setNewChatBusy(true);
            if (!ListopicApp.services.createChatWithParticipants) {
                throw new Error('El servicio de chats no está disponible en este momento.');
            }
            const result = await ListopicApp.services.createChatWithParticipants(currentUser, identifiers);
            newChatInput.value = '';
            hideNewChatError();
            if (result && result.chatId) {
                selectChat(result.chatId);
                if (ListopicApp.services.showNotification) {
                    if (result.alreadyExists) {
                        ListopicApp.services.showNotification('Ya tienes una conversación con estos usuarios.', 'info');
                    } else {
                        ListopicApp.services.showNotification('Chat creado correctamente.', 'success');
                    }
                }
            }
        } catch (error) {
            console.error('[page-chats] Error creating chat:', error);
            const message = error && error.message ? error.message : 'No se pudo crear el chat.';
            showNewChatError(message);
        } finally {
            setNewChatBusy(false);
        }
    };

    const handleMessageSubmit = async (event) => {
        event.preventDefault();
        if (!currentChatId) return;
        const text = messageInput.value.trim();
        if (!text) return;

        messageForm.querySelector('button[type="submit"]').disabled = true;

        try {
            if (!ListopicApp.services.sendChatMessage) {
                throw new Error('El servicio de mensajería no está disponible en este momento.');
            }
            await ListopicApp.services.sendChatMessage(currentChatId, currentUser.uid, text);
            messageInput.value = '';
        } catch (error) {
            console.error('[page-chats] Error sending message:', error);
            ListopicApp.services.showNotification('No se pudo enviar el mensaje.', 'error');
        } finally {
            messageForm.querySelector('button[type="submit"]').disabled = false;
        }
    };

    const selectChat = (chatId) => {
        if (!chatId) return;

        if (currentChatId === chatId) {
            closeChatListModal();
            return;
        }
        currentChatId = chatId;

        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }

        if (!ListopicApp.services.listenToChatMessages) {
            console.error('[page-chats] El servicio de mensajes no esta disponible.');
            return;
        }

        if (chatListElement) {
            Array.from(chatListElement.querySelectorAll('.chat-list-item')).forEach(item => {
                item.classList.toggle('active', item.dataset.chatId === chatId);
            });
        }

        const chat = chatsCache.find(c => c.id === chatId);
        renderChatHeader(chat);

        if (!chat) {
            messageForm.hidden = true;
            renderMessages([]);
            return;
        }

        messageForm.hidden = false;
        if (emptyStateElement) {
            emptyStateElement.style.display = 'none';
        }

        closeChatListModal();

        unsubscribeMessages = ListopicApp.services.listenToChatMessages(chatId, async messages => {
            renderMessages(messages);
            const unreadMessageIds = messages
                .filter(msg => Array.isArray(msg.readBy) ? !msg.readBy.includes(currentUser.uid) : true)
                .map(msg => msg.id);
            if (ListopicApp.services.markChatMessagesAsRead) {
                if (unreadMessageIds.length > 0) {
                    await ListopicApp.services.markChatMessagesAsRead(chatId, currentUser.uid, unreadMessageIds);
                } else {
                    await ListopicApp.services.markChatMessagesAsRead(chatId, currentUser.uid, []);
                }
            }
        }, error => {
            console.error('[page-chats] Error listening messages:', error);
        });
    };

    const showNewChatError = (message) => {
        newChatErrorElement.textContent = message;
        newChatErrorElement.style.display = 'block';
    };

    const hideNewChatError = () => {
        newChatErrorElement.textContent = '';
        newChatErrorElement.style.display = 'none';
    };

    const setNewChatBusy = (isBusy) => {
        if (!newChatForm) return;
        Array.from(newChatForm.elements).forEach(el => el.disabled = isBusy);
    };

    const subscribeToChats = () => {
        if (!currentUser) return;
        if (!ListopicApp.services.listenToUserChats) {
            chatListStatusElement.textContent = 'El servicio de chats no está disponible.';
            return;
        }
        if (unsubscribeChats) {
            unsubscribeChats();
            unsubscribeChats = null;
        }

        unsubscribeChats = ListopicApp.services.listenToUserChats(currentUser.uid, chats => {
            renderChatList(chats);

            if (currentChatId) {
                const activeChat = chats.find(chat => chat.id === currentChatId);
                if (activeChat) {
                    renderChatHeader(activeChat);
                }
            }

            if (pendingChatId) {
                const pendingExists = chats.some(chat => chat.id === pendingChatId);
                if (pendingExists) {
                    selectChat(pendingChatId);
                    pendingChatId = null;
                }
            }

            if (currentChatId) {
                const stillExists = chats.some(chat => chat.id === currentChatId);
                if (!stillExists) {
                    if (unsubscribeMessages) {
                        unsubscribeMessages();
                        unsubscribeMessages = null;
                    }
                    currentChatId = null;
                    messageForm.hidden = true;
                    renderChatHeader(null);
                    renderMessages([]);
                    closeChatListModal();
                }
            }
        }, error => {
            console.error('[page-chats] Error listening user chats:', error);
            if (chatListStatusElement) {
                chatListStatusElement.textContent = 'No se pudieron cargar tus chats.';
                chatListStatusElement.style.display = 'block';
            }
        });
    };

    const cacheDomElements = () => {
        chatListElement = document.getElementById('chat-list');
        chatMessagesElement = document.getElementById('chat-messages');
        newChatForm = document.getElementById('new-chat-form');
        newChatInput = document.getElementById('new-chat-identifiers');
        messageForm = document.getElementById('message-form');
        messageInput = document.getElementById('message-input');
        chatListStatusElement = document.getElementById('chat-list-status');
        newChatErrorElement = document.getElementById('new-chat-error');
        chatTitleElement = document.getElementById('chat-detail-title');
        emptyStateElement = document.getElementById('chat-empty-state');
        chatListPanel = document.getElementById('chat-list-panel');
        chatListBackdrop = document.getElementById('chat-list-backdrop');
        mobileListOpenButton = document.getElementById('chat-list-open');
        mobileListCloseButton = document.getElementById('chat-list-close');
        chatHeaderAvatarsElement = document.getElementById('chat-detail-avatars');
        chatHeaderSubtitleElement = document.getElementById('chat-detail-subtitle');
        if (chatListStatusElement) {
            chatListStatusElement.style.display = 'block';
        }
        renderChatHeader(null);
        closeChatListModal();
    };

    const attachEventListeners = () => {
        if (newChatForm) {
            newChatForm.addEventListener('submit', handleNewChatSubmit);
        }
        if (messageForm) {
            messageForm.addEventListener('submit', handleMessageSubmit);
        }
        if (mobileListOpenButton) {
            mobileListOpenButton.addEventListener('click', openChatListModal);
        }
        if (mobileListCloseButton) {
            mobileListCloseButton.addEventListener('click', closeChatListModal);
        }
        if (chatListBackdrop) {
            chatListBackdrop.addEventListener('click', closeChatListModal);
        }
        window.addEventListener('beforeunload', () => {
            unsubscribeChats && unsubscribeChats();
            unsubscribeMessages && unsubscribeMessages();
        });
        window.addEventListener('resize', () => {
            if (!isMobileLayout()) {
                closeChatListModal();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && chatListPanel && chatListPanel.classList.contains('is-open')) {
                closeChatListModal();
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
        attachEventListeners();

        const params = new URLSearchParams(window.location.search);
        pendingChatId = params.get('chatId');


        subscribeToChats();
    };

    return {
        init
    };
})();






