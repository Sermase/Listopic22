window.ListopicApp = window.ListopicApp || {};
ListopicApp.services = (() => {
    // Ensure Firebase app is initialized, using the config from ListopicApp.config
    if (!firebase.apps.length && ListopicApp.config && ListopicApp.config.firebaseConfig) {
        firebase.initializeApp(ListopicApp.config.firebaseConfig);
    } else if (!ListopicApp.config || !ListopicApp.config.firebaseConfig) {
        console.error("Firebase config not found. Ensure config.js is loaded before firebaseService.js");
        // Potentially throw an error or return early if config is essential for other initializations
    }

    const auth = firebase.auth();
    const storage = firebase.storage();
    const db = firebase.firestore();
    const FieldValue = firebase.firestore.FieldValue;

    // Función para mostrar notificaciones
    function showNotification(message, type = 'info') {
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(notificationContainer);
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`; // Puedes definir estas clases en style.css
        notification.style.cssText = `
            padding: 15px 25px;
            border-radius: 4px;
            color: white;
            background-color: ${type === 'error' ? 'var(--danger-color, #f44336)' : type === 'success' ? 'var(--accent-color-tertiary, #4CAF50)' : 'var(--accent-color-secondary, #2196F3)'};
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            opacity: 0;
            transform: translateX(100%);
            animation: slideInNotification 0.5s forwards, fadeOutNotification 0.5s 4.5s forwards;
        `;
        
        notification.textContent = message;
        notificationContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
            if (notificationContainer.children.length === 0) {
                notificationContainer.remove();
            }
        }, 5000); // Tiempo total antes de remover el elemento
    }

    // Agregar estilos para las animaciones de notificación (solo una vez)
    if (!document.getElementById('notification-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-animation-styles';
        style.textContent = `
            @keyframes slideInNotification { to { transform: translateX(0); opacity: 1; } }
            @keyframes fadeOutNotification { to { transform: translateX(100%); opacity: 0; } }
        `;
        document.head.appendChild(style);
    }

    // Function to get lists by user ID
    const getListsByUserId = async (userId) => {
        if (!userId) {
            console.error("User ID is required to fetch lists.");
            return Promise.reject("User ID is required.");
        }
        try {
            const listsSnapshot = await db.collection('lists')
                                          .where('userId', '==', userId)
                                          .orderBy('createdAt', 'desc') // Optional: order by creation time
                                          .get();
            const lists = [];
            listsSnapshot.forEach(doc => {
                lists.push({ id: doc.id, ...doc.data() });
            });
            return lists;
        } catch (error) {
            console.error("Error fetching lists by user ID:", error);
            throw error;
        }
    };

    // Function to get reviews by user ID
    const getReviewsByUserId = async (userId) => {
        if (!userId) {
            console.error("User ID is required to fetch reviews.");
            return Promise.reject("User ID is required.");
        }
        try {
            const reviewsSnapshot = await db.collection('reviews')
                                            .where('userId', '==', userId)
                                            .orderBy('createdAt', 'desc') // Optional: order by creation time
                                            .get();
            const reviews = [];
            reviewsSnapshot.forEach(doc => {
                reviews.push({ id: doc.id, ...doc.data() });
            });
            return reviews;
        } catch (error) {
            console.error("Error fetching reviews by user ID:", error);
            throw error;
        }
    };

    // Función para crear usuario en Auth y Firestore
    const createUserInAuthAndFirestore = async (email, password, username) => {
        try {
            console.log('[firebaseService] Iniciando createUserInAuthAndFirestore con:', email, username);
            // 1. Crear usuario en Firebase Auth
            console.log('[firebaseService] Paso 1: Creando usuario en Auth...');
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log('[firebaseService] Usuario creado en Auth:', user.uid);

            // 2. Actualizar perfil con el nombre de usuario
            console.log('[firebaseService] Paso 2: Actualizando perfil en Auth...');
            await user.updateProfile({
                displayName: username
            });
            console.log('[firebaseService] Perfil actualizado en Auth.');

            // 3. Crear documento en Firestore con todos los campos deseados
            const newUserDocument = {
                username: username,
                email: email,
                bio: "", // Valor inicial
                photoUrl: user.photoURL || "", // Tomar de Auth si existe, sino vacío
                userType: 'basico', // Valor inicial por defecto
                followersCount: 0, // Valor inicial
                followingCount: 0, // Valor inicial
                badges: [], // Array vacío inicialmente
                createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Timestamp del servidor
                dateOfBirth: null, // Nuevo campo, se inicializa como null
                residence: ""      // Nuevo campo, se inicializa vacío
            };
            console.log('[firebaseService] Paso 3: Documento a guardar en Firestore:', newUserDocument);

            // 4. Guardar en Firestore
            console.log('[firebaseService] Paso 4: Guardando en Firestore en users/' + user.uid);
            await db.collection('users').doc(user.uid).set(newUserDocument);
            showNotification('Usuario creado y perfil completo guardado.', 'info'); // Notificación de éxito global de la función
            console.log('[firebaseService] Documento guardado en Firestore exitosamente.');
            

            // 5. Devolver el user para confirmación
            return user;
        } catch (error) {
            console.error('[firebaseService] Error detallado en createUserInAuthAndFirestore:', error);
            showNotification('No se ha creado nada!', 'error');
            // Re-lanzar el error para que sea capturado por el llamador (auth.html)
            throw error;
        }
    };

    // NUEVA FUNCIÓN: Asegura que el perfil de usuario exista en Firestore.
    // Es idempotente: si ya existe, no hace nada; si no, lo crea.
    const ensureUserProfileExists = async (user) => {
        if (!user || !user.uid) {
            console.warn("ensureUserProfileExists: Usuario nulo o sin UID.");
            return;
        }

        const userDocRef = db.collection('users').doc(user.uid);

        try {
            const doc = await userDocRef.get();
            if (!doc.exists) {
                console.log(`[firebaseService] Perfil Firestore no encontrado para UID: ${user.uid}. Creando...`);
                const newUserDocument = {
                    username: user.displayName || user.email.split('@')[0], // Usa displayName de Google o parte del email
                    email: user.email,
                    bio: "",
                    photoUrl: user.photoURL || "",
                    userType: 'basico',
                    followersCount: 0,
                    followingCount: 0,
                    publicListsCount: 0, // Añadir contadores de listas
                    privateListsCount: 0,
                    reviewsCount: 0,     // Añadir contador de reseñas
                    commentsCount: 0,    // Añadir contador de comentarios
                    badges: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    dateOfBirth: null,
                    residence: ""
                };
                await userDocRef.set(newUserDocument);
                console.log(`[firebaseService] Perfil Firestore creado para UID: ${user.uid}.`);
            } else {
                console.log(`[firebaseService] Perfil Firestore ya existe para UID: ${user.uid}. No se necesita crear.`);
                // Opcional: podrías actualizar displayName o photoUrl si ha cambiado en Auth
                // await userDocRef.update({
                //     username: user.displayName || doc.data().username,
                //     photoUrl: user.photoURL || doc.data().photoUrl,
                //     updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                // });
            }
        } catch (error) {
            console.error("[firebaseService] Error en ensureUserProfileExists:", error);
            showNotification(`Error al crear o verificar el perfil de usuario: ${error.message}`, 'error');
            throw error;
        }
    };

    const listenToUserChats = (userId, onUpdate, onError) => {
        if (!userId) return () => {};
        try {
            const query = db.collection('chats')
                .where('participants', 'array-contains', userId)
                .orderBy('updatedAt', 'desc');
            const unsubscribe = query.onSnapshot(snapshot => {
                const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                onUpdate && onUpdate(chats);
            }, error => {
                console.error('[firebaseService] Error escuchando chats del usuario:', error);
                onError && onError(error);
            });
            return unsubscribe;
        } catch (error) {
            console.error('[firebaseService] Error creando listener de chats:', error);
            onError && onError(error);
            return () => {};
        }
    };

    const listenToChatMessages = (chatId, onUpdate, onError) => {
        if (!chatId) return () => {};
        try {
            const query = db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt', 'asc');
            const unsubscribe = query.onSnapshot(snapshot => {
                const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                onUpdate && onUpdate(messages);
            }, error => {
                console.error('[firebaseService] Error escuchando mensajes del chat:', error);
                onError && onError(error);
            });
            return unsubscribe;
        } catch (error) {
            console.error('[firebaseService] Error creando listener de mensajes:', error);
            onError && onError(error);
            return () => {};
        }
    };

    const createChatWithParticipants = async (currentUser, identifiers) => {
        if (!currentUser || !currentUser.uid) {
            throw new Error('Usuario no autenticado.');
        }

        const normalizeIdentifier = (value) => {
            if (typeof value !== 'string') {
                return '';
            }
            let cleaned = value.trim();
            cleaned = cleaned.replace(/^[@#]+/, '');
            cleaned = cleaned.replace(/[\s,;]+$/, '');
            return cleaned.trim();
        };

        const sanitized = Array.isArray(identifiers)
            ? identifiers.map(normalizeIdentifier).filter(Boolean)
            : [];

        if (!sanitized.length) {
            throw new Error('Debes indicar al menos un usuario.');
        }

        try {
            const functions = firebase.app().functions('europe-west1');
            const resolver = functions.httpsCallable('resolveChatParticipants');
            const response = await resolver({ identifiers: sanitized });
            const responseData = response && response.data ? response.data : {};
            const resolvedUsersRaw = Array.isArray(responseData.users) ? responseData.users : [];
            const resolvedUsers = resolvedUsersRaw.filter(user => user.uid !== currentUser.uid);

            if (!resolvedUsers.length) {
                throw new Error('No se encontraron usuarios con los datos proporcionados.');
            }

            const participantIds = new Set([currentUser.uid]);
            const participantProfiles = {};

            const currentProfileSnap = await db.collection('users').doc(currentUser.uid).get();
            const currentProfile = currentProfileSnap.exists ? currentProfileSnap.data() : {};
            participantProfiles[currentUser.uid] = {
                username: currentProfile.username || currentUser.displayName || currentUser.email || '',
                displayName: currentProfile.displayName || currentProfile.username || currentUser.displayName || '',
                photoUrl: currentProfile.photoUrl || currentUser.photoURL || '',
                email: currentProfile.email || currentUser.email || ''
            };

            resolvedUsers.forEach(user => {
                participantIds.add(user.uid);
                participantProfiles[user.uid] = {
                    username: user.username || user.displayName || user.email || '',
                    displayName: user.displayName || user.username || '',
                    photoUrl: user.photoUrl || '',
                    email: user.email || ''
                };
            });

            if (participantIds.size < 2) {
                throw new Error('Debes seleccionar al menos otro usuario.');
            }

            const participantsArray = Array.from(participantIds).sort();
            const participantsHash = participantsArray.join('_');

            const existingChatSnapshot = await db.collection('chats')
                .where('participantsHash', '==', participantsHash)
                .limit(1)
                .get();

            if (!existingChatSnapshot.empty) {
                const existingChat = existingChatSnapshot.docs[0];
                return { chatId: existingChat.id, alreadyExists: true };
            }

            const unreadCounts = {};
            participantsArray.forEach(uid => {
                unreadCounts[uid] = 0;
            });

            const chatData = {
                participants: participantsArray,
                participantsHash,
                participantProfiles,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                lastMessage: '',
                lastMessageSenderId: null,
                unreadCounts
            };

            const newChatRef = await db.collection('chats').add(chatData);
            return { chatId: newChatRef.id, alreadyExists: false };
        } catch (error) {
            console.error('[firebaseService] Error creando chat:', error);
            throw error;
        }
    };

    const sendChatMessage = async (chatId, senderId, text) => {
        if (!chatId || !senderId || !text) {
            throw new Error('Datos incompletos para enviar el mensaje.');
        }

        const trimmed = text.trim();
        if (!trimmed) {
            throw new Error('El mensaje está vacío.');
        }

        const chatRef = db.collection('chats').doc(chatId);
        const senderProfileSnap = await db.collection('users').doc(senderId).get();
        const senderProfile = senderProfileSnap.exists ? senderProfileSnap.data() : {};
        const currentAuthUser = auth.currentUser;

        await db.runTransaction(async (transaction) => {
            const chatSnap = await transaction.get(chatRef);
            if (!chatSnap.exists) {
                throw new Error('El chat ya no existe.');
            }

            const chatData = chatSnap.data();
            if (!Array.isArray(chatData.participants) || !chatData.participants.includes(senderId)) {
                throw new Error('No puedes enviar mensajes en este chat.');
            }

            const messageRef = chatRef.collection('messages').doc();
            const timestamp = FieldValue.serverTimestamp();

            transaction.set(messageRef, {
                text: trimmed,
                senderId,
                createdAt: timestamp,
                readBy: [senderId],
                senderProfile: {
                    username: senderProfile.username || senderProfile.displayName || senderProfile.email || (currentAuthUser ? (currentAuthUser.displayName || currentAuthUser.email || '') : ''),
                    displayName: senderProfile.displayName || senderProfile.username || (currentAuthUser ? (currentAuthUser.displayName || '') : ''),
                    photoUrl: senderProfile.photoUrl || (currentAuthUser ? currentAuthUser.photoURL || '' : '')
                }
            });

            const updatePayload = {
                lastMessage: trimmed,
                lastMessageSenderId: senderId,
                updatedAt: timestamp
            };

            const currentUnread = chatData.unreadCounts || {};
            (chatData.participants || []).forEach(participantId => {
                if (participantId === senderId) {
                    updatePayload[`unreadCounts.${participantId}`] = 0;
                } else {
                    const previous = currentUnread[participantId] || 0;
                    updatePayload[`unreadCounts.${participantId}`] = previous + 1;
                }
            });

            transaction.update(chatRef, updatePayload);
        });
    };

    const markChatMessagesAsRead = async (chatId, userId, messageIds = []) => {
        if (!chatId || !userId) return;
        try {
            const chatRef = db.collection('chats').doc(chatId);
            const unreadUpdate = {};
            unreadUpdate[`unreadCounts.${userId}`] = 0;
            await chatRef.set(unreadUpdate, { merge: true });

            const idsToUpdate = Array.isArray(messageIds) ? messageIds.filter(Boolean) : [];
            if (idsToUpdate.length > 0) {
                const batch = db.batch();
                idsToUpdate.forEach(messageId => {
                    const messageRef = chatRef.collection('messages').doc(messageId);
                    batch.set(messageRef, { readBy: FieldValue.arrayUnion(userId) }, { merge: true });
                });
                await batch.commit();
            }
        } catch (error) {
            console.error('[firebaseService] Error marcando mensajes como leídos:', error);
        }
    };

    const listenToNotifications = (userId, onUpdate, onError) => {
        if (!userId) return () => {};
        try {
            const query = db.collection('users')
                .doc(userId)
                .collection('notifications')
                .orderBy('createdAt', 'desc')
                .limit(30);

            const unsubscribe = query.onSnapshot(snapshot => {
                const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                onUpdate && onUpdate(notifications);
            }, error => {
                console.error('[firebaseService] Error escuchando notificaciones:', error);
                onError && onError(error);
            });

            return unsubscribe;
        } catch (error) {
            console.error('[firebaseService] Error creando listener de notificaciones:', error);
            onError && onError(error);
            return () => {};
        }
    };

    const markNotificationsAsRead = async (userId, notificationIds = []) => {
        if (!userId) return;
        try {
            const notificationsRef = db.collection('users').doc(userId).collection('notifications');
            let targets = Array.isArray(notificationIds) ? notificationIds.filter(Boolean) : [];

            if (!targets.length) {
                const snapshot = await notificationsRef.where('read', '==', false).get();
                targets = snapshot.docs.map(doc => doc.id);
            }

            if (!targets.length) return;

            const batch = db.batch();
            targets.forEach(notificationId => {
                const ref = notificationsRef.doc(notificationId);
                batch.set(ref, { read: true, readAt: FieldValue.serverTimestamp() }, { merge: true });
            });
            await batch.commit();
        } catch (error) {
            console.error('[firebaseService] Error marcando notificaciones como leídas:', error);
        }
    };

    return {
        auth: auth,
        storage: storage,
        db: db,
        getListsByUserId: getListsByUserId,
        getReviewsByUserId: getReviewsByUserId,
        createUserInAuthAndFirestore: createUserInAuthAndFirestore,
        showNotification: showNotification,
        ensureUserProfileExists: ensureUserProfileExists,
        listenToUserChats,
        listenToChatMessages,
        createChatWithParticipants,
        sendChatMessage,
        markChatMessagesAsRead,
        listenToNotifications,
        markNotificationsAsRead
    };
})();
