// ===================================================================
// ===       ARCHIVO DE CONFIGURACIÓN DE FIREBASE (CORREGIDO)      ===
// ===            ARCHIVO: public/js/config.js                     ===
// ===================================================================

window.ListopicApp = window.ListopicApp || {};

// 1. TU CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyDPEW5zXtvfnD0XtdmXSkMBZrsFdO-tmsg",
    authDomain: "listopic.firebaseapp.com",
    projectId: "listopic",
    // --- ¡ESTA ES LA LÍNEA CORREGIDA! ---
    storageBucket: "listopic.firebasestorage.app",
    messagingSenderId: "851333213702",
    appId: "1:851333213702:web:e8c2f3b1aa098d923d5d87"
};

// 2. INICIALIZACIÓN DE LOS SERVICIOS DE FIREBASE (sin cambios)
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();
const functions = firebase.functions();

// 3. LÓGICA PARA CONECTAR A LOS EMULADORES EN LOCAL (sin cambios)
/*
if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    console.warn("MODO EMULADOR: Conectando a los servicios locales de Firebase.");
    
    auth.useEmulator('http://127.0.0.1:9099');
    db.useEmulator('127.0.0.1', 8080);
    storage.useEmulator('127.0.0.1', 9199);
    functions.useEmulator('127.0.0.1', 5001);
}
*/

// 4. CONFIGURACIÓN GLOBAL Y SERVICIOS PARA LA APP (sin cambios)
ListopicApp.config = {
    firebaseConfig: firebaseConfig,
    
    FUNCTION_URLS: {
        groupedReviews: "https://groupedreviews-jz4x2l2cfq-ew.a.run.app",
        placesNearbyRestaurants: "https://placesnearbyrestaurants-jz4x2l2cfq-ew.a.run.app",
        placesTextSearch: "https://placestextsearch-jz4x2l2cfq-ew.a.run.app",
        getPlaceDetails: "https://getplacedetails-jz4x2l2cfq-ew.a.run.app"
    },
    // Añade aquí tus claves de Algolia cuando las tengas en un lugar seguro
    ALGOLIA_APP_ID: 'FI4Q0XQABV',
    ALGOLIA_SEARCH_KEY: '2eb82c39128de614fa26eceea96934b4' 
};

ListopicApp.services = {
    db: db,
    auth: auth,
    storage: storage,
    functions: functions
};