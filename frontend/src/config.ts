// Con emuladores (VITE_USE_EMULATORS=true) las funciones HTTP van al emulador, nunca a producción.
const EMULATED = import.meta.env.VITE_USE_EMULATORS === 'true';
const fn = (name: string, prod: string) => (EMULATED ? `http://127.0.0.1:5001/demo-listopic/europe-west1/${name}` : prod);

export const ListopicConfig = {
    FUNCTION_URLS: {
        getPlaceDetails: import.meta.env.VITE_GET_PLACE_DETAILS_URL || fn("getPlaceDetails", "https://europe-west1-listopic.cloudfunctions.net/getPlaceDetails"),
        getPlaceDetailsFromGoogle: import.meta.env.VITE_GET_PLACE_DETAILS_FROM_GOOGLE_URL || fn("getPlaceDetailsFromGoogle", "https://getplacedetailsfromgoogle-jz4x2l2cfq-ew.a.run.app"),
        placesTextSearch: import.meta.env.VITE_PLACES_TEXT_SEARCH_URL || fn("placesTextSearch", "https://europe-west1-listopic.cloudfunctions.net/placesTextSearch"),
        placesNearbyRestaurants: import.meta.env.VITE_PLACES_NEARBY_RESTAURANTS_URL || fn("placesNearbyRestaurants", "https://europe-west1-listopic.cloudfunctions.net/placesNearbyRestaurants"),
        refreshPlaceMainImage: import.meta.env.VITE_REFRESH_PLACE_MAIN_IMAGE_URL || fn("refreshPlaceMainImage", "https://europe-west1-listopic.cloudfunctions.net/refreshPlaceMainImage")
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
