import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

export interface Location {
    latitude: number;
    longitude: number;
}

interface LocationSnapshot {
    location: Location | null;
    error: string | null;
    loading: boolean;
}

const LOCATION_CACHE_KEY = 'listopic_location';
// Sin timeout, una petición colgada dejaría la ubicación bloqueada para todos.
const POSITION_TIMEOUT_MS = 20000;
const POSITION_OPTIONS: PositionOptions = { timeout: POSITION_TIMEOUT_MS, maximumAge: 300000 };
// Algunos navegadores no llaman a ningún callback si se cierra el aviso de
// permiso; pasado este margen se libera la petición para poder pedir otra.
const STALE_REQUEST_MS = POSITION_TIMEOUT_MS + 10000;
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;
const UNSUPPORTED_MESSAGE = 'Geolocalización no soportada por el navegador';

function readCachedLocation(): Location | null {
    try {
        const raw = sessionStorage.getItem(LOCATION_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
            return { latitude: parsed.latitude, longitude: parsed.longitude };
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

// ---------------------------------------------------------------------------
// Almacén único de la ubicación del usuario. Antes cada componente tenía su
// propia copia: si el carrusel de patrocinados fallaba al montar y luego otra
// pantalla conseguía la ubicación, el carrusel no se enteraba nunca. Ahora
// todos leen el mismo estado (useSyncExternalStore) y hay una sola petición
// en curso a la vez.
// ---------------------------------------------------------------------------

const createInitialSnapshot = (): LocationSnapshot => {
    const cached = readCachedLocation();
    return { location: cached, error: null, loading: cached === null };
};

let snapshot: LocationSnapshot = createInitialSnapshot();
const listeners = new Set<() => void>();
let inFlight: Promise<Location | null> | null = null;
let activeRequest: symbol | null = null;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let lastErrorCode: number | null = null;
let permissionState: PermissionState | null = null;
// Cambia al reiniciar el almacén (tests): las respuestas antiguas se ignoran.
let generation = 0;
let teardownWatchers: (() => void) | null = null;

const sameLocation = (a: Location | null, b: Location | null) =>
    a === b || (!!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude);

function setSnapshot(patch: Partial<LocationSnapshot>) {
    const next = { ...snapshot, ...patch };
    if (next.location === snapshot.location && next.error === snapshot.error && next.loading === snapshot.loading) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
}

function clearStaleTimer() {
    if (staleTimer !== null) clearTimeout(staleTimer);
    staleTimer = null;
}

function fetchPosition(): Promise<Location | null> {
    if (inFlight) return inFlight;
    const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geolocation) {
        setSnapshot({ loading: false, error: UNSUPPORTED_MESSAGE });
        return Promise.resolve(snapshot.location);
    }

    const gen = generation;
    const token = Symbol('geolocation');
    activeRequest = token;
    setSnapshot({ loading: true, error: null });

    let settle: (value: Location | null) => void = () => undefined;
    const request = new Promise<Location | null>((resolve) => {
        settle = resolve;
        // Devuelve true si esta petición sigue siendo la vigente (y la libera).
        const release = () => {
            if (activeRequest !== token) return false;
            activeRequest = null;
            inFlight = null;
            clearStaleTimer();
            return true;
        };

        const onSuccess = (position: GeolocationPosition) => {
            if (gen !== generation) {
                resolve(null);
                return;
            }
            const isCurrent = release();
            const loc: Location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            };
            lastErrorCode = null;
            writeCachedLocation(loc);
            // Misma posición que la guardada: se conserva la referencia para no
            // re-encuadrar mapas ni recalcular listas sin motivo.
            const location = sameLocation(snapshot.location, loc) ? snapshot.location : loc;
            // Una respuesta tardía (tras liberar la petición) también vale.
            setSnapshot(isCurrent ? { location, error: null, loading: false } : { location, error: null });
            resolve(location);
        };

        const onError = (err: GeolocationPositionError) => {
            if (gen !== generation) {
                resolve(null);
                return;
            }
            const isCurrent = release();
            // Un error tardío solo cuenta si no hay otra petición en marcha.
            if (isCurrent || activeRequest === null) lastErrorCode = err.code;
            if (isCurrent) setSnapshot({ loading: false, error: err.message || 'No se pudo obtener la ubicación' });
            resolve(null);
        };

        try {
            geolocation.getCurrentPosition(onSuccess, onError, POSITION_OPTIONS);
        } catch {
            if (release()) setSnapshot({ loading: false, error: 'No se pudo obtener la ubicación' });
            resolve(null);
        }
    });

    // Si el navegador respondió en el acto, la petición ya está liberada.
    if (activeRequest === token) {
        inFlight = request;
        staleTimer = setTimeout(() => {
            staleTimer = null;
            if (activeRequest !== token) return;
            activeRequest = null;
            inFlight = null;
            // Sin respuesta y con el permiso aún por decidir: el aviso se cerró sin
            // contestar (Firefox no llama a nada). Cuenta como un «no» para no
            // volver a preguntar solo al volver a la pestaña.
            lastErrorCode = permissionState === 'prompt' ? PERMISSION_DENIED : TIMEOUT;
            setSnapshot({ loading: false, error: 'No se pudo obtener la ubicación' });
            // Quien esperaba no se queda colgado; si la posición llega luego,
            // igualmente se guarda en el almacén.
            settle(null);
        }, STALE_REQUEST_MS);
    }
    return request;
}

// Tras un "no" explícito no se vuelve a preguntar solo (evita re-avisos en
// Firefox/Safari), salvo que el permiso conste ya como concedido.
const isBlockedByDenial = () => lastErrorCode === PERMISSION_DENIED && permissionState !== 'granted';

// Al montar un componente: pide la ubicación si aún no la hay.
function ensureLocation() {
    if (snapshot.location || inFlight || isBlockedByDenial()) return;
    void fetchPosition();
}

// Al volver a la app/pestaña o al conceder el permiso: reintenta si falta.
function retryIfUseful() {
    if (snapshot.location || inFlight || listeners.size === 0 || isBlockedByDenial()) return;
    void fetchPosition();
}

async function refreshPermissionState() {
    try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (status) permissionState = status.state;
    } catch {
        // Permissions API no disponible: se decide con el último error.
    }
}

function installWatchers() {
    if (teardownWatchers || typeof window === 'undefined' || typeof document === 'undefined') return;
    const gen = generation;
    const cleanups: Array<() => void> = [];
    teardownWatchers = () => cleanups.splice(0).forEach((cleanup) => cleanup());

    const onReturn = () => {
        void refreshPermissionState().then(() => {
            if (gen === generation) retryIfUseful();
        });
    };

    const onVisibility = () => {
        if (document.visibilityState === 'visible') onReturn();
    };
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    try {
        navigator.permissions?.query({ name: 'geolocation' as PermissionName })
            .then((status) => {
                if (gen !== generation) return;
                permissionState = status.state;
                const onChange = () => {
                    permissionState = status.state;
                    if (status.state === 'granted') retryIfUseful();
                };
                status.addEventListener('change', onChange);
                cleanups.push(() => status.removeEventListener('change', onChange));
            })
            .catch(() => undefined);
    } catch {
        // Permissions API no disponible.
    }

    // En la app de Android la Permissions API no es fiable: también al volver.
    try {
        if (Capacitor.isNativePlatform()) {
            const handle = CapApp.addListener('resume', onReturn);
            cleanups.push(() => {
                void handle.then((listener) => listener.remove()).catch(() => undefined);
            });
        }
    } catch {
        // Plugin App no disponible.
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    installWatchers();
    return () => {
        listeners.delete(listener);
    };
}

const getSnapshot = () => snapshot;

/**
 * Pide la posición actual (o se une a la petición en curso). Referencia
 * estable: se puede poner en dependencias de efectos sin provocar bucles.
 * Nunca rechaza: devuelve null si no se pudo obtener.
 */
export function requestLocation(): Promise<Location | null> {
    return fetchPosition();
}

/** Solo para tests: deja el almacén como recién cargado. */
export function __resetLocationStoreForTests() {
    generation += 1;
    teardownWatchers?.();
    teardownWatchers = null;
    clearStaleTimer();
    inFlight = null;
    activeRequest = null;
    lastErrorCode = null;
    permissionState = null;
    snapshot = createInitialSnapshot();
    listeners.forEach((listener) => listener());
}

// Fórmula del Haversine para calcular distancia en km
function distanceKm(from: Location, targetLat: number, targetLng: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Radio de la Tierra en km

    const dLat = toRad(targetLat - from.latitude);
    const dLon = toRad(targetLng - from.longitude);
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(targetLat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const useLocation = () => {
    const { location, error, loading } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        ensureLocation();
    }, []);

    const calculateDistance = useCallback((targetLat: number, targetLng: number): number | null => {
        if (!location) return null;
        return distanceKm(location, targetLat, targetLng);
    }, [location]);

    return { location, error, loading, calculateDistance, requestLocation };
};
