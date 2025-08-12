// Contenido completo para public/js/config.js
window.ListopicApp = window.ListopicApp || {};

ListopicApp.config = {
    firebaseConfig: {
        apiKey: "AIzaSyDPEW5zXtvfnD0XtdmXSkMBZrsFdO-tmsg",
        authDomain: "listopic.firebaseapp.com",
        projectId: "listopic",
        storageBucket: "listopic.appspot.com", // Corregido al valor más común
        messagingSenderId: "851333213702",
        appId: "1:851333213702:web:e8c2f3b1aa098d923d5d87"
    },
    FUNCTION_URLS: {
        groupedReviews: "https://groupedreviews-jz4x2l2cfq-ew.a.run.app",
        placesNearbyRestaurants: "https://placesnearbyrestaurants-jz4x2l2cfq-ew.a.run.app",
        placesTextSearch: "https://placestextsearch-jz4x2l2cfq-ew.a.run.app",
        getPlaceDetailsFromGoogle: "https://getplacedetailsfromgoogle-jz4x2l2cfq-ew.a.run.app",
        reverseGeocode: "https://reversegeocode-jz4x2l2cfq-ew.a.run.app" // Asegúrate que esta URL es la correcta tras el despliegue
    }
    // LA API KEY DE GOOGLE SE HA ELIMINADO DE AQUÍ. ¡BIEN!
};