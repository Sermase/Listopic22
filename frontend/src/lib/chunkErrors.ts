// Tras un despliegue, una pestaña abierta con la versión anterior puede pedir
// un trozo de JS que ya no existe. La solución es recargar para bajar la
// versión nueva, pero una sola vez por minuto para no entrar en un bucle.

const RELOAD_GUARD_KEY = 'listopic:new-version-reload-at';
const RELOAD_GUARD_MS = 60_000;

const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i;

export const isChunkLoadError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const { name, message } = error as { name?: unknown; message?: unknown };
    return name === 'ChunkLoadError' || (typeof message === 'string' && CHUNK_ERROR_PATTERN.test(message));
};

/** Recarga la página si no se ha hecho en el último minuto. Devuelve true si recarga. */
export const reloadOnceForNewVersion = (): boolean => {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        if (Date.now() - last < RELOAD_GUARD_MS) return false;
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
        // Sin sessionStorage (modo privado estricto): recargar igualmente.
    }
    window.location.reload();
    return true;
};
