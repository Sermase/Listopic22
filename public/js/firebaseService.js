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
            showNotification('Documento de usuario guardado en Firestore.', 'success');
            console.log('[firebaseService] Documento guardado en Firestore exitosamente.');


            // 5. Devolver el user para confirmación
            return user;
        } catch (error) {
            console.error('[firebaseService] Error detallado en createUserInAuthAndFirestore:', error);
            showNotification('No se ha creado nada!', 'error');
            // Re-lanzar el error para que sea capturado por el llamador (auth.html)
            throw error;
        }
        showNotification('Fin del intento de creación de usuario', 'info');
    };


    return {
        auth: auth,
        storage: storage,
        db: db,
        getListsByUserId: getListsByUserId,
        getReviewsByUserId: getReviewsByUserId,
        createUserInAuthAndFirestore: createUserInAuthAndFirestore,
        showNotification: showNotification
    };
})();
