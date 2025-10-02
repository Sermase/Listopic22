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

    let unsubscribeChats = null;
    let unsubscribeMessages = null;
    let currentChatId = null;
    let chatsCache = [];
    let currentUser = null;

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

    const getChatDisplayName = (chat) => {
        if (!chat) return 'Chat';
        const participants = chat.participants || [];
        const otherParticipants = participants.filter(uid => uid !== currentUser.uid);
        if (otherParticipants.length === 0) return 'Conversación personal';

        const profiles = chat.participantProfiles || {};
        const names = otherParticipants.map(uid => {
            const profile = profiles[uid] || {};
            return profile.username || profile.displayName || profile.email || 'Usuario';
        });
        return names.join(', ');
    };

    const renderChatList = (chats) => {
        chatsCache = chats;
        chatListElement.innerHTML = '';

        if (!chats.length) {
            if (chatListStatusElement) {
                chatListStatusElement.textContent = 'No tienes chats activos todavía.';
            }
            return;
        }

        if (chatListStatusElement) {
            chatListStatusElement.textContent = '';
        }

        chats.forEach(chat => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'chat-list-item';
            item.dataset.chatId = chat.id;
            if (chat.id === currentChatId) {
                item.classList.add('active');
            }

            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            const name = getChatDisplayName(chat);
            avatar.textContent = name.substring(0, 1).toUpperCase();

            const info = document.createElement('div');
            info.className = 'chat-info';

            const nameElement = document.createElement('span');
            nameElement.className = 'chat-name';
            nameElement.textContent = name;

            const lastMessageElement = document.createElement('span');
            lastMessageElement.className = 'chat-last-message';
            lastMessageElement.textContent = chat.lastMessage || 'Sin mensajes todavía.';

            const updatedAtElement = document.createElement('span');
            updatedAtElement.className = 'chat-updated-at';
            updatedAtElement.textContent = formatRelativeTime(chat.updatedAt);

            info.appendChild(nameElement);
            info.appendChild(lastMessageElement);
            info.appendChild(updatedAtElement);

            item.appendChild(avatar);
            item.appendChild(info);

            const unreadCount = chat.unreadCounts && chat.unreadCounts[currentUser.uid];
            if (unreadCount && unreadCount > 0) {
                const indicator = document.createElement('span');
                indicator.className = 'chat-unread-indicator';
                indicator.title = `${unreadCount} mensaje(s) sin leer`;
                item.appendChild(indicator);
            }

            item.addEventListener('click', () => selectChat(chat.id));
            chatListElement.appendChild(item);
        });
    };

    const renderMessages = (messages) => {
        chatMessagesElement.innerHTML = '';

        if (!messages.length) {
            const empty = document.createElement('div');
            empty.className = 'chat-empty-state';
            empty.innerHTML = '<p>Empieza la conversación enviando el primer mensaje.</p>';
            chatMessagesElement.appendChild(empty);
            return;
        }

        messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            if (msg.senderId === currentUser.uid) {
                bubble.classList.add('sent');
            }
            bubble.textContent = msg.text;

            const meta = document.createElement('span');
            meta.className = 'message-meta';
            const senderProfile = msg.senderId === currentUser.uid ? 'Tú' : (msg.senderProfile?.username || msg.senderProfile?.displayName || 'Usuario');
            const time = msg.createdAt ? formatRelativeTime(msg.createdAt) : '';
            meta.textContent = `${senderProfile} · ${time}`;
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
        if (currentChatId === chatId) return;
        currentChatId = chatId;

        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }

        if (!ListopicApp.services.listenToChatMessages) {
            console.error('[page-chats] El servicio de mensajes no está disponible.');
            return;
        }

        Array.from(chatListElement.querySelectorAll('.chat-list-item')).forEach(item => {
            item.classList.toggle('active', item.dataset.chatId === chatId);
        });

        const chat = chatsCache.find(c => c.id === chatId);
        chatTitleElement.textContent = getChatDisplayName(chat);
        messageForm.hidden = false;
        emptyStateElement && (emptyStateElement.style.display = 'none');

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
                const stillExists = chats.some(chat => chat.id === currentChatId);
                if (!stillExists && unsubscribeMessages) {
                    unsubscribeMessages();
                    unsubscribeMessages = null;
                    currentChatId = null;
                    chatTitleElement.textContent = 'Selecciona un chat';
                    chatMessagesElement.innerHTML = '';
                    messageForm.hidden = true;
                }
            }
        }, error => {
            console.error('[page-chats] Error listening user chats:', error);
            if (chatListStatusElement) {
                chatListStatusElement.textContent = 'No se pudieron cargar tus chats.';
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
    };

    const attachEventListeners = () => {
        if (newChatForm) {
            newChatForm.addEventListener('submit', handleNewChatSubmit);
        }
        if (messageForm) {
            messageForm.addEventListener('submit', handleMessageSubmit);
        }
        window.addEventListener('beforeunload', () => {
            unsubscribeChats && unsubscribeChats();
            unsubscribeMessages && unsubscribeMessages();
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
        subscribeToChats();
    };

    return {
        init
    };
})();
