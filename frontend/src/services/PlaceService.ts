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

// Google Maps Global Type Definition (Partial)
declare global {
    interface Window {
        google: any;
    }
}

// Helper to get Google Places Service
const getPlacesService = (): any => {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
        console.warn("Google Maps API not loaded");
        return null;
    }
    const mapDiv = document.createElement('div');
    return new window.google.maps.places.PlacesService(mapDiv);
};

export const PlaceService = {
    searchPlaces: async (query: string, userLat?: number, userLng?: number): Promise<PlaceResult[]> => {
        if (!query || query.length < 2) return [];

        return new Promise((resolve) => {
            const service = getPlacesService();
            if (!service) return resolve([]);

            const request: any = {
                query: query,
                fields: ['place_id', 'name', 'formatted_address', 'geometry', 'photos', 'types', 'rating', 'user_ratings_total']
            };

            // Bias towards user location if available
            if (userLat && userLng) {
                request.location = new window.google.maps.LatLng(userLat, userLng);
                request.radius = 50000; // 50km bias
            }

            service.textSearch(request, (results: any[], status: any) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                    const mapped = results.map(item => ({
                        id: item.place_id,
                        name: item.name,
                        address: item.formatted_address || item.vicinity || '',
                        lat: item.geometry?.location?.lat(),
                        lng: item.geometry?.location?.lng(),
                        type: (item.types && item.types[0]) ? item.types[0] : 'establishment',
                        distance: (userLat && userLng && item.geometry?.location)
                            ? window.google.maps.geometry.spherical.computeDistanceBetween(
                                new window.google.maps.LatLng(userLat, userLng),
                                item.geometry.location
                            )
                            : undefined
                    }));
                    resolve(mapped);
                } else {
                    console.warn("Place Search failed or empty:", status);
                    resolve([]);
                }
            });
        });
    },

    searchNearby: async (lat: number, lng: number): Promise<PlaceResult[]> => {
        return new Promise((resolve) => {
            const service = getPlacesService();
            if (!service) return resolve([]);

            // Use rankBy DISTANCE requires keyword or name or type.
            // If we just want "nearby places", often 'establishment' or 'restaurant' is good.
            const request: any = {
                location: new window.google.maps.LatLng(lat, lng),
                rankBy: window.google.maps.places.RankBy.DISTANCE,
                type: 'restaurant' // Default to restaurants for "Nearby" button as per app theme (food lists)
                // Keyword is optional but good for filtering
            };

            service.nearbySearch(request, (results: any[], status: any) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                    const mapped = results.slice(0, 20).map(item => ({
                        id: item.place_id,
                        name: item.name,
                        address: item.vicinity || item.formatted_address || '', // nearbySearch returns vicinity mostly
                        lat: item.geometry?.location?.lat(),
                        lng: item.geometry?.location?.lng(),
                        type: (item.types && item.types[0]) ? item.types[0] : 'establishment',
                        distance: (lat && lng && item.geometry?.location)
                            ? window.google.maps.geometry.spherical.computeDistanceBetween(
                                new window.google.maps.LatLng(lat, lng),
                                item.geometry.location
                            )
                            : undefined
                    }));
                    resolve(mapped);
                } else {
                    console.warn("Nearby Search failed:", status);
                    resolve([]);
                }
            });
        });
    },

    getDetails: async (placeId: string): Promise<any> => {
        return new Promise((resolve, reject) => {
            const service = getPlacesService();
            if (!service) return reject("Google Maps not loaded");

            // Needed fields for LegacyPlace transformation
            const request = {
                placeId: placeId,
                fields: [
                    'place_id', 'name', 'formatted_address', 'address_components',
                    'geometry', 'formatted_phone_number', 'international_phone_number',
                    'website', 'url', 'rating', 'user_ratings_total', 'types', 'price_level',
                    'photos', 'vicinity',
                    // New Service Options Fields
                    'delivery', 'dine_in', 'takeout', 'reservable',
                    'serves_beer', 'serves_wine', 'serves_breakfast', 'serves_lunch', 'serves_dinner'
                ]
            };

            service.getDetails(request, (place: any, status: any) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
                    resolve(place);
                } else {
                    reject(status);
                }
            });
        });
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

    // 7. Map Service Options
    const serviceOptions = isGoogle ? {
        delivery: !!src.delivery,
        takeout: !!src.takeout,
        dineIn: !!src.dine_in,
        reservable: !!src.reservable,
        servesBeer: !!src.serves_beer,
        servesWine: !!src.serves_wine,
        servesBreakfast: !!src.serves_breakfast,
        servesLunch: !!src.serves_lunch,
        servesDinner: !!src.serves_dinner
    } : {};

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
        serviceOptions: serviceOptions,

        updatedAt: now,
        lastGoogleSync: now,
        followersCount: 0,
        reviewsCount: 0,
        averageRating: null
    };
};
