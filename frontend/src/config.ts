export const ListopicConfig = {
    FUNCTION_URLS: {
        getPlaceDetails: import.meta.env.VITE_GET_PLACE_DETAILS_URL || "https://europe-west1-listopic.cloudfunctions.net/getPlaceDetails",
        getPlaceDetailsFromGoogle: import.meta.env.VITE_GET_PLACE_DETAILS_FROM_GOOGLE_URL || "https://getplacedetailsfromgoogle-jz4x2l2cfq-ew.a.run.app",
        placesTextSearch: import.meta.env.VITE_PLACES_TEXT_SEARCH_URL || "https://europe-west1-listopic.cloudfunctions.net/placesTextSearch",
        placesNearbyRestaurants: import.meta.env.VITE_PLACES_NEARBY_RESTAURANTS_URL || "https://europe-west1-listopic.cloudfunctions.net/placesNearbyRestaurants",
        refreshPlaceMainImage: import.meta.env.VITE_REFRESH_PLACE_MAIN_IMAGE_URL || "https://europe-west1-listopic.cloudfunctions.net/refreshPlaceMainImage"
    },
    ALGOLIA: {
        APP_ID: import.meta.env.VITE_ALGOLIA_APP_ID || "",
        SEARCH_KEY: import.meta.env.VITE_ALGOLIA_SEARCH_KEY || ""
    }
};
