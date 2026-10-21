/** Distancia corta para tarjetas: «a 350 m», «a 1,2 km», «a 15 km». */
export const formatDistance = (km: number | null | undefined): string | undefined => {
    if (typeof km !== 'number' || !Number.isFinite(km)) return undefined;
    if (km < 1) return `a ${Math.max(50, Math.round(km * 1000 / 50) * 50)} m`;
    return `a ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
};
