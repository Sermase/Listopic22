window.ListopicApp = window.ListopicApp || {};
ListopicApp.services = (() => {
    // Ensure Firebase app is initialized, using the config from ListopicApp.config
    if (!firebase.apps.length && ListopicApp.config && ListopicApp.config.firebaseConfig) {
        firebase.initializeApp(ListopicApp.config.firebaseConfig);
    } else if (!ListopicApp.config || !ListopicApp.config.firebaseConfig) {
        console.error("Firebase config not found. Ensure config.js is loaded before firebaseService.js");
        return {}; // Devuelve un objeto vacío para no romper el resto de la app
    }

    // --- LA CORRECCIÓN ESTÁ AQUÍ ---
    // En la v9 compat, los servicios se acceden como propiedades, no como funciones.
    const auth = firebase.auth();
    const storage = firebase.storage(); // Correcto: firebase.storage()
    const db = firebase.firestore();

    // Función para mostrar notificaciones
    function showNotification(message, type = 'info') {
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            document.body.appendChild(notificationContainer);
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Estilos de notificación (pueden moverse a CSS)
        Object.assign(notification.style, {
            padding: '15px 25px',
            borderRadius: '4px',
            color: 'white',
            backgroundColor: type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            marginBottom: '10px',
            opacity: '0',
            transform: 'translateX(100%)',
            animation: 'slideInNotification 0.5s forwards, fadeOutNotification 0.5s 4.5s forwards'
        });

        notificationContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
            if (notificationContainer.children.length === 0) {
                notificationContainer.remove();
            }
        }, 5000);
    }

    if (!document.getElementById('notification-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-animation-styles';
        style.textContent = `
            #notification-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
            @keyframes slideInNotification { to { transform: translateX(0); opacity: 1; } }
            @keyframes fadeOutNotification { to { transform: translateX(100%); opacity: 0; } }
        `;
        document.head.appendChild(style);
    }

    const getListsByUserId = async (userId) => {
        if (!userId) return Promise.reject("User ID is required.");
        try {
            const snapshot = await db.collection('lists').where('userId', '==', userId).orderBy('createdAt', 'desc').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching lists:", error);
            throw error;
        }
    };
    
    const createUserInAuthAndFirestore = async (email, password, username) => {
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            await user.updateProfile({ displayName: username });
            const userProfile = {
                username: username,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                // ...otros campos por defecto
            };
            await db.collection('users').doc(user.uid).set(userProfile);
            return user;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    };

    const ensureUserProfileExists = async (user) => {
        if (!user) return;
        const userRef = db.collection('users').doc(user.uid);
        const doc = await userRef.get();
        if (!doc.exists) {
            const userProfile = {
                username: user.displayName || user.email.split('@')[0],
                email: user.email,
                photoUrl: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                 // ...otros campos por defecto
            };
            await userRef.set(userProfile);
        }
    };

    return {
        auth,
        storage,
        db,
        showNotification,
        getListsByUserId,
        createUserInAuthAndFirestore,
        ensureUserProfileExists
    };
})();