import { useState, useEffect } from 'react';

export interface Location {
    latitude: number;
    longitude: number;
}

export const useLocation = () => {
    const [location, setLocation] = useState<Location | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (!navigator.geolocation) {
            setError('Geolocalización no soportada por el navegador');
            setLoading(false);
            return;
        }

        const success = (position: GeolocationPosition) => {
            setLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            });
            setLoading(false);
        };

        const fail = (err: GeolocationPositionError) => {
            setError(err.message);
            setLoading(false);
            console.warn('Error obteniendo ubicación:', err);
        };

        // Solicitar ubicación al montar
        navigator.geolocation.getCurrentPosition(success, fail);
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
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
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
