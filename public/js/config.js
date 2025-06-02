window.ListopicApp = window.ListopicApp || {};

ListopicApp.config = {
    firebaseConfig: {
        apiKey: "AIzaSyDPEW5zXtvfnD0XtdmXSkMBZrsFdO-tmsg", // Reemplaza con tu API Key real
        authDomain: "listopic.firebaseapp.com",
        /*
        databaseURL: "https://listopic-default-rtdb.europe-west1.firebasedatabase.app",
        */
        projectId: "listopic",
        storageBucket: "listopic.firebasestorage.app", // Asegúrate que sea listopic.appspot.com o el correcto
        messagingSenderId: "851333213702",
        appId: "1:851333213702:web:e8c2f3b1aa098d923d5d87"
    },
    API_BASE_URL: '/api',
    API_BASE_URL_FUNCTIONS: 'https://europe-west1-listopic.cloudfunctions.net',
    FUNCTION_URLS: {
        groupedReviews: "https://groupedreviews-jz4x2l2cfq-ew.a.run.app", // <--- URL DE CLOUD RUN
        // Añade las URLs para las nuevas funciones de Places. Estas URLs las obtendrás después de desplegarlas.
         // Tendrán un formato similar a la de groupedReviews, pero con sus nombres.
         // Ejemplo (los hashes serán diferentes):
        placesNearbyRestaurants: "https://placesnearbyrestaurants-jz4x2l2cfq-ew.a.run.app", 
        placesTextSearch: "https://placestextsearch-jz4x2l2cfq-ew.a.run.app"
    },
    GOOGLE_PLACES_API_KEY: 'AIzaSyDXUk2b2VZu6Ui-HlBMZeMeQGBvzaSpHvE' // Tu clave de API de Google Places

};
