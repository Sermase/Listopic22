const EARTH_RADIUS_METERS = 6371008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Distancia en metros entre dos coordenadas (fórmula de Haversine).
 * Sustituye a google.maps.geometry.spherical.computeDistanceBetween para no
 * tener que cargar la librería "geometry" de Google solo por este cálculo.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
