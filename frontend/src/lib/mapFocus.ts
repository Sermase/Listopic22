/**
 * Dónde encuadrar el mapa de una lista con todos sus sitios (sin radio):
 * - Si tienes alguno cerca (≤ NEAR_KM), alrededor de ti hasta incluir los más cercanos.
 * - Si no, donde se juntan la mayoría (el grupo más grande), no a medio camino
 *   entre ciudades ni en tu casa vacía.
 */
export interface FocusPoint { lat: number; lng: number }

export const NEAR_KM = 25;
const CLUSTER_KM = 60;
const NEAREST_SHOWN = 3;

export function distanceKm(a: FocusPoint, b: FocusPoint): number {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Puntos que deben quedar dentro del encuadre (incluye tu posición si estás cerca). */
export function focusPoints(points: FocusPoint[], user: FocusPoint | null): FocusPoint[] {
    if (points.length <= 1) return points;
    if (user) {
        const byDistance = points.map((p) => ({ p, d: distanceKm(user, p) })).sort((a, b) => a.d - b.d);
        if (byDistance[0].d <= NEAR_KM) {
            const near = byDistance.filter((x) => x.d <= NEAR_KM);
            return [user, ...(near.length >= NEAREST_SHOWN ? near : byDistance.slice(0, NEAREST_SHOWN).filter((x) => x.d <= NEAR_KM * 2)).map((x) => x.p)];
        }
    }
    // Grupo más grande: el punto con más vecinos a menos de CLUSTER_KM (empate: el más cercano a ti).
    let best: { members: FocusPoint[]; d: number } | null = null;
    for (const p of points) {
        const members = points.filter((q) => distanceKm(p, q) <= CLUSTER_KM);
        const d = user ? distanceKm(user, p) : 0;
        if (!best || members.length > best.members.length || (members.length === best.members.length && d < best.d)) best = { members, d };
    }
    return best ? best.members : points;
}
