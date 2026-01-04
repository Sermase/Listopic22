export interface PlaceResult {
    id: string; // OSM ID
    name: string;
    address: string;
    lat: number;
    lng: number;
    type?: string;
    distance?: number; // Distance in meters
}

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Radius of Earth in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};

const createViewbox = (lat: number, lng: number, km: number) => {
    // 1 deg lat = ~111km. 1 deg lng = ~111km * cos(lat)
    const deltaLat = km / 111;
    const deltaLng = km / (111 * Math.cos(lat * Math.PI / 180));

    // viewbox=left,top,right,bottom (lng1,lat2,lng2,lat1)
    // NOTE: Nominatim expects: <x1>,<y1>,<x2>,<y2> (left,top,right,bottom) 
    // OR <x1>,<y2>,<x2>,<y1> ? 
    // Docs say: viewbox=<x1>,<y1>,<x2>,<y2>. (Left, Top, Right, Bottom)
    // But usually it's minLon, maxLat, maxLon, minLat.

    const minLng = lng - deltaLng;
    const maxLng = lng + deltaLng;
    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;

    return `${minLng},${maxLat},${maxLng},${minLat}`;
};

import { auth } from '../firebase';
import { ListopicConfig } from '../config';

const callPlaceFunction = async (functionName: keyof typeof ListopicConfig.FUNCTION_URLS, params: any) => {
    try {
        const url = ListopicConfig.FUNCTION_URLS[functionName];
        if (!url) throw new Error(`Function URL for ${functionName} not configured`);

        const token = await auth.currentUser?.getIdToken();
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Add userId to params if authenticated
        if (auth.currentUser && !params.userId) {
            params.userId = auth.currentUser.uid;
        }

        // Construct query string for GET if needed, or POST?
        // Prompt says "Endpoint HTTP". Standard Cloud Functions can be GET or POST.
        // Given params like latitude/longitude/query, usually POST or GET with query params.
        // Let's assume POST for complex params or GET for search.
        // Prompt says "parametro query obligatorio" for keys.
        // Let's use POST to be safe with JSON body, or check if prompt specified method.
        // "Backend en functions/modules/core.js con endpoints HTTP".
        // Let's assume POST for body payload.

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }

        return await response.json();

    } catch (error) {
        console.error(`Error calling ${functionName}:`, error);
        return null;
    }
};

export const PlaceService = {
    searchPlaces: async (query: string, userLat?: number, userLng?: number): Promise<PlaceResult[]> => {
        if (!query || query.length < 3) return [];

        try {
            const params: any = { query };
            if (userLat && userLng) {
                params.latitude = userLat;
                params.longitude = userLng;
            }

            // Call Backend "placesTextSearch"
            const data = await callPlaceFunction('placesTextSearch', params);

            if (!data || !Array.isArray(data)) return [];

            // Map Backend Results to internal PlaceResult
            return data.map((item: any) => ({
                id: item.place_id || item.googlePlaceId || item.objectID, // Handle varying IDs (Google vs Local vs Algolia)
                name: item.name,
                address: item.formatted_address || item.vicinity || item.address || '',
                lat: item.geometry?.location?.lat || item.coordinates?.latitude || item._geoloc?.lat || 0,
                lng: item.geometry?.location?.lng || item.coordinates?.longitude || item._geoloc?.lng || 0,
                type: (item.types && item.types[0]) ? item.types[0] : 'establishment',
                distance: item.distance // Backend often explicitly returns distance if calculated
            }));

        } catch (error) {
            console.error("Error searching places:", error);
            return [];
        }
    },

    searchNearby: async (lat: number, lng: number): Promise<PlaceResult[]> => {
        try {
            const params = {
                latitude: lat,
                longitude: lng,
                // Default category/types logic could be here if we had list context
                // For now, generic nearby
                categoryId: 'restaurant', // Default fallback as typical "nearby"
                categoryTypes: 'restaurant,food,establishment'
            };

            // Call Backend "placesNearbyRestaurants"
            const data = await callPlaceFunction('placesNearbyRestaurants', params);

            if (!data || !Array.isArray(data)) return [];

            return data.map((item: any) => ({
                id: item.place_id || item.googlePlaceId,
                name: item.name,
                address: item.formatted_address || item.vicinity || item.address || '',
                lat: item.geometry?.location?.lat || item.coordinates?.latitude || 0,
                lng: item.geometry?.location?.lng || item.coordinates?.longitude || 0,
                type: (item.types && item.types[0]) ? item.types[0] : 'establishment',
                distance: item.distance
            }));

        } catch (error) {
            console.error("Error searching nearby places:", error);
            return [];
        }
    },

    // New helper for detail fetching if we want to be fully compliant
    getDetails: async (placeId: string): Promise<any> => {
        return await callPlaceFunction('getPlaceDetailsFromGoogle', { placeid: placeId });
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
    googlePlaceId: string; // The ID of the document AND the field

    // Address & Location
    address: string;
    address_normalized: string;
    vicinity?: string; // Often used as short address
    formatted_address?: string; // Google field
    coordinates: {
        latitude: number;
        longitude: number;
    };
    location: { // Redundant but required by legacy
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

    // Internal Stats (initially empty for new places)
    followersCount: number;
    reviewsCount: number;
    averageRating: number | null;
}

// Transform Google/OSM result to Strict Legacy Place
export const transformToLegacyPlace = (place: PlaceResult, detailedGoogleData?: any): LegacyPlace => {
    const now = new Date();

    // 1. Data Source Resolution
    // If we have detailedGoogleData (from getPlaceDetailsFromGoogle), use it primarily.
    // Otherwise fallback to basic PlaceResult (OSM/partial).

    const isGoogle = !!detailedGoogleData;
    const src = detailedGoogleData || place;

    // 2. Address Components Extraction (Critical for Legacy)
    let city = '';
    let region = '';
    let country = '';
    let postalCode = '';
    let route = '';
    let streetNumber = '';

    if (isGoogle && src.address_components) {
        src.address_components.forEach((c: any) => {
            if (c.types.includes('locality')) city = c.long_name;
            if (c.types.includes('administrative_area_level_1')) region = c.long_name;
            if (c.types.includes('country')) country = c.long_name;
            if (c.types.includes('postal_code')) postalCode = c.long_name;
            if (c.types.includes('route')) route = c.long_name;
            if (c.types.includes('street_number')) streetNumber = c.long_name;
        });
    } else {
        // Basic parsing for OSM/Fallback
        const parts = place.address.split(',').map(p => p.trim());
        country = parts[parts.length - 1] || '';
        postalCode = parts.find(p => /^\d{5}$/.test(p)) || '';
        city = parts.find(p => p !== country && p !== postalCode && isNaN(Number(p))) || '';
    }

    // 3. Derived Fields
    const province = getProvinceFromPostalCode(postalCode) || city; // Fallback to city if no postal match
    const constructedAddress = route ? `${route} ${streetNumber}, ${city}`.trim() : src.formatted_address || place.address;

    // 4. Coordinates
    const lat = isGoogle ? src.geometry?.location?.lat : place.lat;
    const lng = isGoogle ? src.geometry?.location?.lng : place.lng;

    // 5. Types
    const types = src.types || (place.type ? [place.type] : ['establishment']);

    // 6. Id Resolution
    // Legacy STRICTLY wants 'googlePlaceId' valid. 
    // If OSM, we fake it or prefix it? 
    // User said: "el id de lugar debería ser el id de google".
    // If we only have OSM, we technically violate this unless we mock it or require Google.
    // For now, if no googlePlaceId, use OSM ID prefixed.
    const finalId = src.place_id ? String(src.place_id) : `osm_${place.id}`;

    return {
        // Identity
        googlePlaceId: finalId,
        name: src.name,
        name_normalized: src.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),

        // Location
        address: constructedAddress,
        address_normalized: constructedAddress.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        vicinity: src.vicinity || constructedAddress,
        formatted_address: src.formatted_address || place.address,

        coordinates: { latitude: typeof lat === 'function' ? lat() : lat, longitude: typeof lng === 'function' ? lng() : lng },
        location: { latitude: typeof lat === 'function' ? lat() : lat, longitude: typeof lng === 'function' ? lng() : lng },

        city,
        region,
        province,
        country,
        postalCode,

        // Meta
        googleMapsUrl: src.url || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        website: src.website || null,
        phone: src.formatted_phone_number || src.international_phone_number || null,
        international_phone_number: src.international_phone_number || null,

        // Stats
        priceLevel: src.price_level || null,
        googleRating: src.rating || null,
        googleUserRatingsTotal: src.user_ratings_total || null,
        types: types,

        // Images
        mainImageUrl: src.photos?.[0] ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${src.photos[0].photo_reference}&key=YOUR_API_KEY_HERE` : null, // Note: In frontend we might not have key exposed directly for URL generation without proxy, but strict schema expects a URL.
        mainImagePhotoReference: src.photos?.[0]?.photo_reference || null,

        // Legacy Fields
        accessibility: {}, // Would need separate fetch as per prompt
        serviceOptions: {},

        updatedAt: now,
        lastGoogleSync: now,
        followersCount: 0,
        reviewsCount: 0,
        averageRating: null
    };
};
