import { serverTimestamp } from 'firebase/firestore';

export interface PlaceResult {
    id: string; // Google Place ID
    name: string;
    address: string;
    lat: number;
    lng: number;
    type?: string;
    types?: string[];
    distance?: number; // Distance in meters
}

// Google Maps Global Type Definition (Partial for View)
declare global {
    interface Window {
        google: any;
    }
}

// Cache the library promise
let placesLibPromise: Promise<any> | null = null;

const getPlacesLib = (): Promise<any> => {
    if (!window.google || !window.google.maps) {
        return Promise.reject("Google Maps API not loaded");
    }
    if (!placesLibPromise) {
        placesLibPromise = window.google.maps.importLibrary("places");
    }
    return placesLibPromise as Promise<any>;
};

export const PlaceService = {
    ensurePlaceSyncedWithBackend: async (placeId: string, idToken: string): Promise<LegacyPlace> => {
        const url = `https://getplacedetailsfromgoogle-jz4x2l2cfq-ew.a.run.app?placeid=${placeId}`;
        console.log(`[PlaceService] Syncing place ${placeId} with backend...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                // If it already exists (which shouldn't happen with GET but maybe logic differs), handle gracefully?
                // Actually 200 OK returns the doc. 
                throw new Error(`Backend sync failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            return data as LegacyPlace;
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.error("Backend sync timed out after 15s");
                throw new Error("Backend sync timed out");
            }
            console.error("Error syncing place with backend:", error);
            throw error;
        }
    },

    searchPlaces: async (query: string, userLat?: number, userLng?: number): Promise<PlaceResult[]> => {
        if (!query || query.length < 2) return [];

        try {
            const { Place } = await getPlacesLib();

            // Bias towards user location if available
            const request: any = {
                textQuery: query,
                fields: ['id', 'displayName', 'formattedAddress', 'location', 'types', 'photos', 'rating', 'userRatingCount'],
                maxResultCount: 10,
            };

            if (userLat && userLng) {
                // Determine implicit bias via locationBias if needed, but 'locationBias' 
                // in new API is often handled by 'locationBias' field with CircularBounds etc.
                // For simplicity/compatibility, we can let Google handle relevance or add bias if critical.
                // request.locationBias = { center: { lat: userLat, lng: userLng }, radius: 50000 };
                // NOTE: structure might differ in V3, omitting specific bias helper for now to rely on query relevance + viewport if map context existed. 
                // However, simple text search usually works well.
            }

            const { places } = await Place.searchByText(request);

            if (!places) return [];

            return places.map((place: any) => ({
                id: place.id,
                name: place.displayName || '',
                address: place.formattedAddress || '',
                lat: place.location?.lat() || 0,
                lng: place.location?.lng() || 0,
                type: (place.types && place.types[0]) ? place.types[0] : 'establishment',
                types: place.types || [],
                distance: (userLat && userLng && place.location)
                    ? window.google.maps.geometry.spherical.computeDistanceBetween(
                        new window.google.maps.LatLng(userLat, userLng),
                        place.location
                    )
                    : undefined
            }));

        } catch (error) {
            console.warn("Place Search failed", error);
            return [];
        }
    },

    searchNearby: async (lat: number, lng: number): Promise<PlaceResult[]> => {
        try {
            const { Place } = await getPlacesLib();

            const request: any = {
                fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
                locationRestriction: {
                    // New API uses bounds or circle for restriction
                    center: { lat, lng },
                    radius: 500 // 500m radius as requested by user
                },
                maxResultCount: 20,
                // restaurant, cafe, bar, bakery, store, supermarket, park, lodging, museum, tourist_attraction
                includedPrimaryTypes: ['restaurant', 'cafe', 'bar', 'bakery', 'store', 'supermarket', 'park', 'lodging', 'museum', 'tourist_attraction']
            };

            const { places } = await Place.searchNearby(request);

            if (!places) return [];

            return places.map((place: any) => ({
                id: place.id,
                name: place.displayName || '',
                address: place.formattedAddress || '', // vicinity not always available in new object same way
                lat: place.location?.lat() || 0,
                lng: place.location?.lng() || 0,
                type: (place.types && place.types[0]) ? place.types[0] : 'establishment',
                types: place.types || [],
                distance: (place.location)
                    ? window.google.maps.geometry.spherical.computeDistanceBetween(
                        new window.google.maps.LatLng(lat, lng),
                        place.location
                    )
                    : undefined
            }));

        } catch (error) {
            console.warn("Nearby Search failed", error);
            return [];
        }
    },

    getDetails: async (placeId: string): Promise<any> => {
        try {
            const { Place } = await getPlacesLib();

            // Create Place instance
            const place = new Place({ id: placeId });

            // Fetch fields
            await place.fetchFields({
                fields: [
                    'id', 'displayName', 'formattedAddress', 'addressComponents',
                    'location', 'nationalPhoneNumber', 'internationalPhoneNumber',
                    'websiteURI', 'rating', 'userRatingCount', 'types', 'priceLevel',
                    'photos',
                    // Service Options - Boolean fields
                    // 'delivery', 'dineIn', 'takeout', 'reservable',
                    // 'servesBeer', 'servesWine', 'servesBreakfast', 'servesLunch', 'servesDinner',
                    // Accessibility
                    'accessibilityOptions'
                ]
            });

            return place;
        } catch (error) {
            console.error("Get Details failed", error);
            throw error;
        }
    }
};

// Legacy Schema Interface
// Province Map for Spain (first 2 digits of postal code)
const PROVINCE_MAP: Record<string, string> = {
    '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
    '06': 'Badajoz', '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
    '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
    '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
    '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
    '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
    '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
    '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
    '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo',
    '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya', '49': 'Zamora', '50': 'Zaragoza',
    '51': 'Ceuta', '52': 'Melilla'
};

const getProvinceFromPostalCode = (postalCode: string): string => {
    if (!postalCode || postalCode.length < 2) return '';
    const prefix = postalCode.substring(0, 2);
    return PROVINCE_MAP[prefix] || '';
};

// Strict Legacy Schema Interface
export interface LegacyPlace {
    // Identity
    name: string;
    name_normalized: string;
    googlePlaceId: string;

    // Address & Location
    address: string;
    address_normalized: string;
    vicinity?: string;
    formatted_address?: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    location: {
        latitude: number;
        longitude: number;
    };

    // Hierarchy
    city: string;
    region: string;
    province: string;
    country: string;
    postalCode: string;

    // Google Metadata
    googleMapsUrl: string | null;
    website: string | null;
    phone: string | null;
    international_phone_number?: string | null;

    // Stats & Types
    priceLevel: number | null;
    googleRating: number | null;
    googleUserRatingsTotal: number | null;
    types: string[];

    // Images
    mainImageUrl: string | null;
    mainImagePhotoReference: string | null;

    // Accessibility (Legacy Structure)
    accessibility: any;
    serviceOptions?: any;

    // Metadata
    updatedAt: any;
    lastGoogleSync: any;

    // Internal Stats
    followersCount: number;
    reviewsCount: number;
    averageRating: number | null;
}

// Transform Google Result to Strict Legacy Place
export const transformToLegacyPlace = (place: PlaceResult, detailedGoogleData?: any): LegacyPlace => {
    const now = new Date();

    // detailedGoogleData is likely a google.maps.places.Place instance now
    const src = detailedGoogleData || {};

    // Fallback/Hybrid logic
    // src.displayName is strict in new API, but PlaceResult has .name
    const name = src.displayName || place.name || '';

    // Address Components Extraction
    let city = '';
    let region = '';
    let country = '';
    let postalCode = '';
    let route = '';
    let streetNumber = '';

    if (src.addressComponents) {
        src.addressComponents.forEach((c: any) => {
            if (c.types.includes('locality')) city = c.longText || c.shortText;
            if (c.types.includes('administrative_area_level_1')) region = c.longText || c.shortText;
            if (c.types.includes('country')) country = c.longText || c.long_name;
            if (c.types.includes('postal_code')) postalCode = c.longText || c.long_name;
            if (c.types.includes('route')) route = c.longText || c.long_name;
            if (c.types.includes('street_number')) streetNumber = c.longText || c.long_name;
        });
    } else {
        // Fallback parsing
        const parts = place.address.split(',').map(p => p.trim());
        country = parts[parts.length - 1] || '';
        postalCode = parts.find(p => /^\d{5}$/.test(p)) || '';
        city = parts.find(p => p !== country && p !== postalCode && isNaN(Number(p))) || '';
    }

    // 3. Derived Fields
    const province = getProvinceFromPostalCode(postalCode) || city;
    const constructedAddress = route ? `${route} ${streetNumber}, ${city}`.trim() : (src.formattedAddress || place.address);

    // 4. Coordinates
    const lat = src.location?.lat() || place.lat;
    const lng = src.location?.lng() || place.lng;

    // 5. Types
    const types = src.types || (place.type ? [place.type] : ['establishment']);

    // 6. Id Resolution
    const finalId = src.id || place.id;

    // 7. Map Service Options (New API fields are direct booleans on the Place object mostly)
    const serviceOptions = {
        delivery: !!src.delivery,
        takeout: !!src.takeout,
        dineIn: !!src.dineIn,
        reservable: !!src.reservable,
        servesBeer: !!src.servesBeer,
        servesWine: !!src.servesWine,
        servesBreakfast: !!src.servesBreakfast,
        servesLunch: !!src.servesLunch,
        servesDinner: !!src.servesDinner
    };

    // 7b. Map Accessibility (From accessibilityOptions array)
    // Google V3 API returns strings like "WHEELCHAIR_ACCESSIBLE_ENTRANCE"
    const accOptions = (src.accessibilityOptions || []).map((o: string) => o.toUpperCase());
    const accessibility = {
        wheelchairAccessibleEntrance: accOptions.includes('WHEELCHAIR_ACCESSIBLE_ENTRANCE'),
        wheelchairAccessibleParking: accOptions.includes('WHEELCHAIR_ACCESSIBLE_PARKING'),
        wheelchairAccessibleRestroom: accOptions.includes('WHEELCHAIR_ACCESSIBLE_RESTROOM'),
        wheelchairAccessibleSeating: accOptions.includes('WHEELCHAIR_ACCESSIBLE_SEATING'),
        hearingLoop: accOptions.includes('HEARING_LOOP')
    };

    // 8. Photos
    // src.photos in new API is array of google.maps.places.Photo
    // p.getURI({maxWidth})
    let mainImageUrl = null;
    let mainImagePhotoReference = null;

    if (src.photos && src.photos.length > 0) {
        const p = src.photos[0];
        // Ensure getURI exists (New API calls it getURI, old was getUrl)
        if (typeof p.getURI === 'function') {
            mainImageUrl = p.getURI({ maxWidth: 800 });
        } else if (typeof p.getUrl === 'function') {
            // Fallback if mixed types
            mainImageUrl = p.getUrl({ maxWidth: 800 });
        }
        // References might not be exposed transparently in new objects but we can try
        mainImagePhotoReference = (p as any).name || null; // 'name' resource name often holds reference
    }

    // Normalizations: Lowercase ONLY (User Request)
    const nameNormalized = name.toLowerCase();
    const addressNormalized = constructedAddress.toLowerCase();

    return {
        // Identity
        googlePlaceId: finalId,
        name: name,
        name_normalized: nameNormalized,

        // Location
        address: constructedAddress,
        address_normalized: addressNormalized,
        vicinity: constructedAddress, // New API deprecates vicinity
        formatted_address: src.formattedAddress || place.address,

        coordinates: { latitude: lat, longitude: lng }, // Legacy: nested object
        location: { latitude: lat, longitude: lng },    // Legacy: often duplicated as 'location' geopoint in firestore, but here mapped as object. 
        // Note: If Firestore uses GeoPoint, the save logic usually converts it. We keep object here.

        city,
        region,
        province,
        country,
        postalCode,

        // Meta
        googleMapsUrl: src.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        website: src.websiteUri || null,
        phone: src.nationalPhoneNumber || src.internationalPhoneNumber || null,
        international_phone_number: src.internationalPhoneNumber || null,

        // Stats
        priceLevel: src.priceLevel || null, // PriceLevel enum logic might be needed
        googleRating: src.rating || null,
        googleUserRatingsTotal: src.userRatingCount || null,
        types: types,

        // Images
        mainImageUrl: mainImageUrl,
        mainImagePhotoReference: mainImagePhotoReference,

        // Legacy Fields
        accessibility: accessibility,
        serviceOptions: serviceOptions,

        updatedAt: serverTimestamp(),
        lastGoogleSync: serverTimestamp(),

        // Initial Counters for new places
        followersCount: 0,
        reviewsCount: 0,
        averageRating: null
    };
};
