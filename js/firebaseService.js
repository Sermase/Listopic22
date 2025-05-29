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

    return {
        auth: auth,
        storage: storage,
        db: db
    };
})();
