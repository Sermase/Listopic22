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

export const PlaceService = {
    searchPlaces: async (query: string, userLat?: number, userLng?: number): Promise<PlaceResult[]> => {
        if (!query || query.length < 3) return [];

        try {
            // URL Base
            const baseUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1`;

            // Strategy: Hybrid 2-Pass Search
            // Pass 1: Strict Local (~20km) - ensure close things are found
            // Pass 2: Global (with soft bias ~50km) - find famous things elsewhere

            let p1Promise: Promise<any[]> = Promise.resolve([]);
            let p2Promise: Promise<any[]> = Promise.resolve([]);

            if (userLat && userLng) {
                // Pass 1: Strict Local (20km)
                const vbLocal = createViewbox(userLat, userLng, 20);
                p1Promise = fetch(`${baseUrl}&viewbox=${vbLocal}&bounded=1&limit=25`)
                    .then(r => r.json())
                    .catch(() => []);

                // Pass 2: Global (Soft Bias 50km)
                const vbGlobal = createViewbox(userLat, userLng, 50);
                p2Promise = fetch(`${baseUrl}&viewbox=${vbGlobal}&bounded=0&limit=25`)
                    .then(r => r.json())
                    .catch(() => []);
            } else {
                // No location? Just global search
                p2Promise = fetch(`${baseUrl}&limit=50`)
                    .then(r => r.json())
                    .catch(() => []);
            }

            const [localData, globalData] = await Promise.all([p1Promise, p2Promise]);

            // Deduplicate & Merge
            // Priority: Local Results > Global Results
            const uniqueMap = new Map();

            // Process Local First
            localData.forEach((item: any) => {
                if (!uniqueMap.has(item.place_id)) {
                    uniqueMap.set(item.place_id, { ...item, _isLocal: true });
                }
            });

            // Process Global Second
            globalData.forEach((item: any) => {
                if (!uniqueMap.has(item.place_id)) {
                    uniqueMap.set(item.place_id, { ...item, _isLocal: false });
                }
            });

            let results: PlaceResult[] = Array.from(uniqueMap.values()).map((item: any) => ({
                id: String(item.place_id),
                name: item.name || item.display_name.split(',')[0],
                address: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                type: item.type,
                // Helper internal flag for sorting if needed, though order preservation is enough
                // _isLocal: item._isLocal 
            }));

            // Smart Sort
            if (userLat && userLng) {
                // Determine distances
                results = results.map(place => ({
                    ...place,
                    distance: haversineDistance(userLat, userLng, place.lat, place.lng)
                }));

                // Sort: 
                // 1. Local results (roughly < 20km) should be first? 
                //    Actually, if we preserved order (Local Data first), they are already at top.
                //    But let's sort purely by distance? 
                //    User wants: "Closest first". 
                //    However, if I search "Paris", and I am in Madrid, I don't want a "Bar Paris" (10m away) to hide "Paris France". 
                //    But user explicitly complained "not closest first". 
                //    Rule: Sort by distance is usually safe for "Place Search" of items/shops. 
                //    Let's strictly sort by distance. The 2-pass just ensures we actually FETCHED the local ones.

                results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
            }

            return results;

        } catch (error) {
            console.error("Error searching places:", error);
            return [];
        }
    },

    searchNearby: async (lat: number, lng: number): Promise<PlaceResult[]> => {
        try {
            // Strict ~10km bounding box for "Nearby"
            const viewbox = createViewbox(lat, lng, 10);

            // Expanded categories for a richer "Nearby" discovery like Google Maps
            const categories = ['restaurant', 'bar', 'cafe', 'pub', 'fast_food', 'ice_cream', 'bakery'];

            // Execute fetches sequentially to avoid rate limiting (HTTP2 Refused Stream / 429)
            // Nominatim Policy requests not to flood.
            const rawData: any[] = [];
            for (const cat of categories) {
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${cat}&limit=10&lat=${lat}&lon=${lng}&viewbox=${viewbox}&bounded=1&addressdetails=1`);
                    if (response.ok) {
                        const json = await response.json();
                        rawData.push(...json);
                    }
                    // Small delay to be polite
                    await new Promise(r => setTimeout(r, 200));
                } catch (err) {
                    // Ignore fail for individual cat
                }
            }

            // Deduplicate by place_id
            const uniqueMap = new Map();
            rawData.forEach((item: any) => {
                if (item && item.place_id && !uniqueMap.has(item.place_id)) {
                    uniqueMap.set(item.place_id, item);
                }
            });

            let results: PlaceResult[] = Array.from(uniqueMap.values()).map((item: any) => ({
                id: String(item.place_id),
                name: item.name || item.display_name.split(',')[0],
                address: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                type: item.type,
                distance: haversineDistance(lat, lng, parseFloat(item.lat), parseFloat(item.lon))
            }));

            // Strict Sort by Distance to show closest first
            results.sort((a, b) => (a.distance || 0) - (b.distance || 0));

            return results.slice(0, 40); // larger slice since we have strict bounds

        } catch (error) {
            console.error("Error searching nearby places:", error);
            return [];
        }
    }
};
// Legacy Schema Interface
export interface LegacyPlace {
    accessibility: any; // map
    hearingLoop: null;
    wheelchairAccessibleEntrance: boolean | null;
    wheelchairAccessibleParking: boolean | null;
    wheelchairAccessibleRestroom: any; // null
    wheelchairAccessibleSeating: any; // null
    address: string;
    address_normalized: string;
    averageRating: number;
    city: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    country: string;
    followersCount: number;
    formatted_address: string;
    googleMapsUrl: string;
    googlePlaceId: string | null;
    googleRating: number | null;
    googleUserRatingsTotal: number | null;
    lastGoogleSync: any;
    lastPhotoRefresh: any;
    location: {
        latitude: number;
        longitude: number;
    };
    mainImagePhotoReference: string | null;
    mainImageUrl: string | null;
    name: string;
    name_normalized: string;
    phone: string | null;
    postalCode: string;
    priceLevel: number | null;
    province: string;
    region: string;
    reviewsCount: number;
    types: string[];
    updatedAt: any;
    vicinity: string;
    website: string | null;
}

export const transformToLegacyPlace = (place: PlaceResult): LegacyPlace => {
    const now = new Date();
    // Rough address parsing from display_name if available, usually logic is complex but we do best effort
    // OSM display_name is "Name, Road, City, County, State, Postcode, Country"
    const parts = place.address.split(',').map(p => p.trim());
    const country = parts[parts.length - 1] || '';
    const postalCode = parts.find(p => /^\d{5}$/.test(p)) || ''; // Simple regex for Spain/US
    const city = parts.find(p => p !== country && p !== postalCode && isNaN(Number(p))) || ''; // Fallback

    return {
        accessibility: {},
        hearingLoop: null,
        wheelchairAccessibleEntrance: null, // Unknown in basic OSM
        wheelchairAccessibleParking: null,
        wheelchairAccessibleRestroom: null,
        wheelchairAccessibleSeating: null,
        address: place.address,
        address_normalized: place.address.toLowerCase(),
        averageRating: 0, // No internal rating yet
        city: city,
        coordinates: {
            latitude: place.lat,
            longitude: place.lng
        },
        country: country,
        followersCount: 0,
        formatted_address: place.address,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`, // Fallback link
        googlePlaceId: null, // Not a Google Place
        googleRating: null,
        googleUserRatingsTotal: null,
        lastGoogleSync: null,
        lastPhotoRefresh: null,
        location: {
            latitude: place.lat,
            longitude: place.lng
        },
        mainImagePhotoReference: null,
        mainImageUrl: null,
        name: place.name,
        name_normalized: place.name.toLowerCase(),
        phone: null,
        postalCode: postalCode,
        priceLevel: null,
        province: city, // weak fallback
        region: city, // weak fallback
        reviewsCount: 0,
        types: place.type ? [place.type] : ['establishment'],
        updatedAt: now,
        vicinity: place.address,
        website: null
    };
};
