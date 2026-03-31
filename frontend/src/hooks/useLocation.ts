import { useState, useEffect } from 'react';

export interface Location {
    latitude: number;
    longitude: number;
}

const LOCATION_CACHE_KEY = 'listopic_location';

function readCachedLocation(): Location | null {
    try {
        const raw = sessionStorage.getItem(LOCATION_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
            return parsed as Location;
        }
    } catch {
        // ignore parse errors
    }
    return null;
}

function writeCachedLocation(loc: Location) {
    try {
        sessionStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
    } catch {
        // ignore storage errors
    }
}

export const useLocation = () => {
    const [location, setLocation] = useState<Location | null>(() => readCachedLocation());
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(() => readCachedLocation() === null);

    useEffect(() => {
        // If we already have a cached location, skip the API call
        if (location !== null) return;

        if (!navigator.geolocation) {
            setError('Geolocalización no soportada por el navegador');
            setLoading(false);
            return;
        }

        const success = (position: GeolocationPosition) => {
            const loc: Location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            writeCachedLocation(loc);
            setLocation(loc);
            setLoading(false);
        };

        const fail = (err: GeolocationPositionError) => {
            setError(err.message);
            setLoading(false);
        };

        navigator.geolocation.getCurrentPosition(success, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fórmula del Haversine para calcular distancia en km
    const calculateDistance = (targetLat: number, targetLng: number): number | null => {
        if (!location) return null;

        const toRad = (value: number) => (value * Math.PI) / 180;
        const R = 6371; // Radio de la Tierra en km

        const dLat = toRad(targetLat - location.latitude);
        const dLon = toRad(targetLng - location.longitude);
        const lat1 = toRad(location.latitude);
        const lat2 = toRad(targetLat);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const requestLocation = () => {
        setLoading(true);
        setError(null);
        if (!navigator.geolocation) {
            setError('Geolocalización no soportada');
            setLoading(false);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc: Location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                writeCachedLocation(loc);
                setLocation(loc);
                setLoading(false);
            },
            (err) => {
                setError(err.message);
                setLoading(false);
            }
        );
    };

    return { location, error, loading, calculateDistance, requestLocation };
};
