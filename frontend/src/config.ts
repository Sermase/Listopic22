export const ListopicConfig = {
    FUNCTION_URLS: {
        getPlaceDetails: import.meta.env.VITE_GET_PLACE_DETAILS_URL || "https://europe-west1-listopic.cloudfunctions.net/getPlaceDetails",
        getPlaceDetailsFromGoogle: import.meta.env.VITE_GET_PLACE_DETAILS_FROM_GOOGLE_URL || "https://getplacedetailsfromgoogle-jz4x2l2cfq-ew.a.run.app",
        placesTextSearch: import.meta.env.VITE_PLACES_TEXT_SEARCH_URL || "https://europe-west1-listopic.cloudfunctions.net/placesTextSearch",
        placesNearbyRestaurants: import.meta.env.VITE_PLACES_NEARBY_RESTAURANTS_URL || "https://europe-west1-listopic.cloudfunctions.net/placesNearbyRestaurants",
        refreshPlaceMainImage: import.meta.env.VITE_REFRESH_PLACE_MAIN_IMAGE_URL || "https://europe-west1-listopic.cloudfunctions.net/refreshPlaceMainImage"
    },
    // Clave pública de navegador de Google Maps JS (restringida por referrer en
    // Google Cloud). Antes estaba fija en index.html y se cargaba en todas las
    // páginas; ahora PlaceService la usa bajo demanda.
    GOOGLE_MAPS_BROWSER_KEY: import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || "AIzaSyBV26T665w65z1FNdDk8mwHSH1o0c2PeW8",
    ALGOLIA: {
        APP_ID: import.meta.env.VITE_ALGOLIA_APP_ID || "",
        SEARCH_KEY: import.meta.env.VITE_ALGOLIA_SEARCH_KEY || ""
    }
};
