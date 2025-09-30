window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageChats = (() => {
    const state = {
        currentUser: null,
        chats: [],
        activeChatId: null,
        participantsCache: {},
        unsubscribers: {
            chats: null,
            messages: null
        },
        pendingChatSelection: null
    };

    const elements = {
        chatList: null,
        chatMessages: null,
        chatTitle: null,
        chatSubtitle: null,
        chatMembers: null,
        messageForm: null,
        messageInput: null,
        newChatButton: null,
        newChatModal: null,
        closeNewChatModalButton: null,
        newChatForm: null,
        newChatTypeInputs: [],
        groupNameField: null,
        groupNameInput: null,
        participantsInput: null
    };

    function init() {
        cacheElements();
        attachEventListeners();
        hydrateFromAuth();
    }

    function cacheElements() {
        elements.chatList = document.getElementById('chat-list');
        elements.chatMessages = document.getElementById('chat-messages');
        elements.chatTitle = document.getElementById('chat-title');
        elements.chatSubtitle = document.getElementById('chat-subtitle');
        elements.chatMembers = document.getElementById('chat-members');
        elements.messageForm = document.getElementById('message-form');
        elements.messageInput = document.getElementById('message-input');
        elements.newChatButton = document.getElementById('new-chat-btn');
        elements.newChatModal = document.getElementById('new-chat-modal');
        elements.closeNewChatModalButton = document.getElementById('close-new-chat-modal');
        elements.newChatForm = document.getElementById('new-chat-form');
        elements.newChatTypeInputs = Array.from(document.querySelectorAll('input[name="chat-type"]'));
        elements.groupNameField = document.getElementById('group-name-field');
        elements.groupNameInput = document.getElementById('group-name-input');
        elements.participantsInput = document.getElementById('chat-participants-input');
    }

    function attachEventListeners() {
        elements.messageForm?.addEventListener('submit', handleSendMessage);
        elements.newChatButton?.addEventListener('click', () => openNewChatModal());
        elements.closeNewChatModalButton?.addEventListener('click', () => closeNewChatModal());
        elements.newChatModal?.addEventListener('click', (event) => {
            if (event.target === elements.newChatModal) {
                closeNewChatModal();
            }
        });
        elements.newChatForm?.addEventListener('submit', handleNewChatSubmit);
        elements.newChatTypeInputs.forEach(input => {
            input.addEventListener('change', updateNewChatTypeVisibility);
        });

        window.addEventListener('beforeunload', cleanup);
    }

    function hydrateFromAuth() {
        ListopicApp.authService.onAuthStateChangedPromise().then(async (user) => {
            if (!user) {
                window.location.href = 'auth.html';
                return;
            }
            state.currentUser = user;
            startChatsListener();
            handleInitialQueryParams();
        }).catch(error => {
            console.error('[page-chats] Error obtaining authenticated user:', error);
            ListopicApp.services.showNotification('No se pudo cargar tu sesión. Inténtalo de nuevo.', 'error');
        });
    }

    function startChatsListener() {
        cleanupChatsListener();
        state.unsubscribers.chats = ListopicApp.services.listenToUserChats(state.currentUser.uid, async (chats) => {
            state.chats = Array.isArray(chats) ? chats : [];
            await populateParticipantsCache(state.chats);
            renderChatList();
            autoSelectChat();
        });
    }

    function cleanupChatsListener() {
        if (state.unsubscribers.chats) {
            state.unsubscribers.chats();
            state.unsubscribers.chats = null;
        }
    }

    async function populateParticipantsCache(chats) {
        if (!Array.isArray(chats) || chats.length === 0) {
            return;
        }
        const idsToLoad = new Set();
        chats.forEach(chat => {
            if (!Array.isArray(chat.memberIds)) {
                return;
            }
            chat.memberIds.forEach(memberId => {
                if (memberId !== state.currentUser.uid && !state.participantsCache[memberId]) {
                    idsToLoad.add(memberId);
                }
            });
        });
        if (idsToLoad.size === 0) {
            return;
        }
        try {
            const profilesMap = await ListopicApp.services.getUserProfilesByIds(Array.from(idsToLoad));
            Object.assign(state.participantsCache, profilesMap);
        } catch (error) {
            console.error('[page-chats] Error loading participant profiles:', error);
        }
    }

    function renderChatList() {
        if (!elements.chatList) {
            return;
        }
        elements.chatList.innerHTML = '';
        if (!state.chats.length) {
            const empty = document.createElement('div');
            empty.className = 'chat-empty-state';
            empty.innerHTML = `
                <i class="fas fa-comments"></i>
                <p>Aún no tienes conversaciones.</p>
                <p class="hint">Crea un chat privado o un grupo para empezar a hablar.</p>
            `;
            elements.chatList.appendChild(empty);
            return;
        }

        state.chats.forEach(chat => {
            const chatItem = buildChatListItem(chat);
            elements.chatList.appendChild(chatItem);
        });
    }

    function buildChatListItem(chat) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'chat-list-item';
        if (chat.id === state.activeChatId) {
            item.classList.add('active');
        }
        item.dataset.chatId = chat.id;

        const info = getChatDisplayInfo(chat);
        const lastMessageText = chat.lastMessage?.text || 'Sin mensajes aún';
        const lastMessageTime = formatTimestamp(chat.lastMessage?.sentAt);

        item.innerHTML = `
            <div class="chat-list-item-main">
                <span class="chat-list-item-title">${info.title}</span>
                <span class="chat-list-item-time">${lastMessageTime}</span>
            </div>
            <div class="chat-list-item-meta">
                <span class="chat-list-item-subtitle">${info.subtitle}</span>
                <span class="chat-list-item-preview">${lastMessageText}</span>
            </div>
        `;

        item.addEventListener('click', () => {
            setActiveChat(chat.id);
        });

        return item;
    }

    function getChatDisplayInfo(chat) {
        const defaultInfo = {
            title: 'Chat',
            subtitle: ''
        };
        if (!chat) {
            return defaultInfo;
        }
        if (chat.type === 'group') {
            const title = chat.name || 'Grupo sin nombre';
            const subtitle = `${Array.isArray(chat.memberIds) ? chat.memberIds.length : 0} participantes`;
            return { title, subtitle };
        }
        const otherMemberId = Array.isArray(chat.memberIds)
            ? chat.memberIds.find(id => id !== state.currentUser.uid)
            : null;
        if (!otherMemberId) {
            return defaultInfo;
        }
        const profile = state.participantsCache[otherMemberId];
        const title = profile?.username || profile?.displayName || profile?.email || 'Chat privado';
        return {
            title,
            subtitle: profile?.bio ? profile.bio.substring(0, 60) : 'Chat privado'
        };
    }

    function setActiveChat(chatId) {
        if (!chatId || chatId === state.activeChatId) {
            return;
        }
        state.activeChatId = chatId;
        updateChatListSelection();
        updateMessageFormState(true);
        const chat = state.chats.find(item => item.id === chatId);
        renderActiveChatHeader(chat);
        subscribeToMessages(chatId);
    }

    function updateChatListSelection() {
        if (!elements.chatList) {
            return;
        }
        const items = elements.chatList.querySelectorAll('.chat-list-item');
        items.forEach(item => {
            item.classList.toggle('active', item.dataset.chatId === state.activeChatId);
        });
    }

    function renderActiveChatHeader(chat) {
        if (!chat) {
            elements.chatTitle.textContent = 'Selecciona un chat';
            elements.chatSubtitle.textContent = 'Elige una conversación para ver los mensajes.';
            elements.chatMembers.innerHTML = '';
            updateMessageFormState(false);
            clearMessages();
            return;
        }
        const info = getChatDisplayInfo(chat);
        elements.chatTitle.textContent = info.title;
        elements.chatSubtitle.textContent = info.subtitle || '';
        renderChatMembers(chat);
    }

    function renderChatMembers(chat) {
        if (!elements.chatMembers) {
            return;
        }
        elements.chatMembers.innerHTML = '';
        if (!Array.isArray(chat.memberIds)) {
            return;
        }
        const fragment = document.createDocumentFragment();
        chat.memberIds.forEach(memberId => {
            const member = memberId === state.currentUser.uid
                ? { username: 'Tú', photoUrl: state.currentUser.photoURL }
                : state.participantsCache[memberId];
            const badge = document.createElement('span');
            badge.className = 'chat-member-badge';
            badge.textContent = member?.username || member?.displayName || member?.email || 'Usuario';
            fragment.appendChild(badge);
        });
        elements.chatMembers.appendChild(fragment);
    }

    function subscribeToMessages(chatId) {
        cleanupMessagesListener();
        if (!chatId) {
            clearMessages();
            return;
        }
        state.unsubscribers.messages = ListopicApp.services.listenToChatMessages(chatId, (messages) => {
            renderMessages(messages || []);
        });
    }

    function cleanupMessagesListener() {
        if (state.unsubscribers.messages) {
            state.unsubscribers.messages();
            state.unsubscribers.messages = null;
        }
    }

    function clearMessages() {
        if (!elements.chatMessages) {
            return;
        }
        elements.chatMessages.innerHTML = `
            <div class="chat-empty-state">
                <i class="fas fa-message"></i>
                <p>No hay mensajes</p>
                <p class="hint">Selecciona un chat para comenzar la conversación.</p>
            </div>
        `;
    }

    function renderMessages(messages) {
        if (!elements.chatMessages) {
            return;
        }
        if (!Array.isArray(messages) || messages.length === 0) {
            clearMessages();
            return;
        }
        const fragment = document.createDocumentFragment();
        messages.forEach(message => {
            const messageRow = document.createElement('div');
            const isOwnMessage = message.senderId === state.currentUser.uid;
            messageRow.className = `chat-message-row ${isOwnMessage ? 'own' : 'other'}`;

            const bubble = document.createElement('div');
            bubble.className = 'chat-message-bubble';
            const text = document.createElement('p');
            text.className = 'chat-message-text';
            text.textContent = message.text || '';

            const meta = document.createElement('span');
            meta.className = 'chat-message-meta';
            const senderProfile = !isOwnMessage ? state.participantsCache[message.senderId] : null;
            const senderName = isOwnMessage
                ? 'Tú'
                : senderProfile?.username || senderProfile?.displayName || senderProfile?.email || 'Usuario';
            meta.textContent = `${senderName} • ${formatTimestamp(message.sentAt)}`;

            bubble.appendChild(text);
            bubble.appendChild(meta);
            messageRow.appendChild(bubble);
            fragment.appendChild(messageRow);
        });
        elements.chatMessages.innerHTML = '';
        elements.chatMessages.appendChild(fragment);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) {
            return '';
        }
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        } catch (error) {
            return '';
        }
    }

    function handleSendMessage(event) {
        event.preventDefault();
        if (!state.activeChatId) {
            return;
        }
        const messageText = elements.messageInput?.value.trim();
        if (!messageText) {
            return;
        }
        elements.messageForm.querySelector('button[type="submit"]').disabled = true;
        ListopicApp.services.sendChatMessage(state.activeChatId, state.currentUser.uid, messageText)
            .then(() => {
                if (elements.messageInput) {
                    elements.messageInput.value = '';
                }
            })
            .catch(error => {
                console.error('[page-chats] Error sending message:', error);
                ListopicApp.services.showNotification('No se pudo enviar el mensaje. Inténtalo de nuevo.', 'error');
            })
            .finally(() => {
                updateMessageFormState(Boolean(state.activeChatId));
            });
    }

    function updateMessageFormState(isEnabled) {
        if (!elements.messageForm || !elements.messageInput) {
            return;
        }
        elements.messageInput.disabled = !isEnabled;
        const submitButton = elements.messageForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = !isEnabled;
        }
    }

    function openNewChatModal() {
        if (!elements.newChatModal) {
            return;
        }
        elements.newChatModal.classList.add('active');
        updateNewChatTypeVisibility();
    }

    function closeNewChatModal() {
        if (!elements.newChatModal) {
            return;
        }
        elements.newChatModal.classList.remove('active');
        elements.newChatForm?.reset();
        updateNewChatTypeVisibility();
    }

    function updateNewChatTypeVisibility() {
        if (!elements.groupNameField) {
            return;
        }
        const selectedType = elements.newChatTypeInputs.find(input => input.checked)?.value;
        const shouldShowGroupName = selectedType === 'group';
        elements.groupNameField.hidden = !shouldShowGroupName;
    }

    async function handleNewChatSubmit(event) {
        event.preventDefault();
        if (!state.currentUser) {
            return;
        }
        const selectedType = elements.newChatTypeInputs.find(input => input.checked)?.value || 'private';
        const identifiersRaw = elements.participantsInput?.value || '';
        const identifiers = identifiersRaw
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);

        if (identifiers.length === 0) {
            ListopicApp.services.showNotification('Introduce al menos un usuario.', 'warning');
            return;
        }

        try {
            const resolvedUsers = await resolveIdentifiersToUsers(identifiers);
            if (selectedType === 'private') {
                await createPrivateChatFromModal(resolvedUsers);
            } else {
                await createGroupChatFromModal(resolvedUsers);
            }
            closeNewChatModal();
        } catch (error) {
            console.error('[page-chats] Error creating chat:', error);
            ListopicApp.services.showNotification(error.message || 'No se pudo crear el chat.', 'error');
        }
    }

    async function resolveIdentifiersToUsers(identifiers) {
        const results = [];
        for (const identifier of identifiers) {
            if (!identifier) {
                continue;
            }
            let userProfile = await ListopicApp.services.getUserProfileById(identifier);
            if (!userProfile) {
                userProfile = await ListopicApp.services.findUserByIdentifier(identifier);
            }
            if (userProfile) {
                results.push(userProfile);
            }
        }
        const unique = [];
        const seen = new Set();
        results.forEach(user => {
            if (user && !seen.has(user.id)) {
                seen.add(user.id);
                unique.push(user);
            }
        });
        if (!unique.length) {
            throw new Error('No se encontraron usuarios con los datos proporcionados.');
        }
        return unique;
    }

    async function createPrivateChatFromModal(users) {
        if (!users.length) {
            throw new Error('Selecciona un usuario válido para iniciar el chat privado.');
        }
        const targetUser = users[0];
        if (targetUser.id === state.currentUser.uid) {
            throw new Error('No puedes iniciar un chat contigo mismo.');
        }
        const chat = await ListopicApp.services.getOrCreatePrivateChat(state.currentUser.uid, targetUser.id);
        state.pendingChatSelection = chat.id;
        ListopicApp.services.showNotification('Chat privado listo para conversar.', 'success');
    }

    async function createGroupChatFromModal(users) {
        const memberIds = users
            .filter(user => user.id !== state.currentUser.uid)
            .map(user => user.id);
        if (memberIds.length < 2) {
            throw new Error('Un grupo necesita al menos dos participantes adicionales.');
        }
        const groupName = elements.groupNameInput?.value.trim();
        const chat = await ListopicApp.services.createGroupChat(groupName, memberIds, state.currentUser.uid);
        state.pendingChatSelection = chat.id;
        ListopicApp.services.showNotification('Grupo creado con éxito.', 'success');
    }

    function handleInitialQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const chatIdParam = params.get('chatId');
        const userIdParam = params.get('userId');
        if (chatIdParam) {
            state.pendingChatSelection = chatIdParam;
        } else if (userIdParam) {
            ensurePrivateChatWithUser(userIdParam);
        }
    }

    async function ensurePrivateChatWithUser(userId) {
        if (!userId || !state.currentUser) {
            return;
        }
        try {
            const chat = await ListopicApp.services.getOrCreatePrivateChat(state.currentUser.uid, userId);
            state.pendingChatSelection = chat.id;
        } catch (error) {
            console.error('[page-chats] Error ensuring private chat from query:', error);
            ListopicApp.services.showNotification('No se pudo preparar el chat con esa persona.', 'error');
        }
    }

    function autoSelectChat() {
        if (state.pendingChatSelection) {
            const exists = state.chats.some(chat => chat.id === state.pendingChatSelection);
            if (exists) {
                setActiveChat(state.pendingChatSelection);
                state.pendingChatSelection = null;
                return;
            }
        }
        if (!state.activeChatId && state.chats.length) {
            setActiveChat(state.chats[0].id);
        } else if (!state.chats.length) {
            state.activeChatId = null;
            renderActiveChatHeader(null);
        }
    }

    function cleanup() {
        cleanupChatsListener();
        cleanupMessagesListener();
    }

    return {
        init
    };
})();
