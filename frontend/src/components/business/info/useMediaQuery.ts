import { useCallback, useSyncExternalStore } from 'react';

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** ¿Cumple la pantalla esta media query? (sin matchMedia, `fallback`). */
export function useMediaQuery(query: string, fallback = false): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        if (!canMatch()) return () => undefined;
        const media = window.matchMedia(query);
        media.addEventListener?.('change', onChange);
        return () => media.removeEventListener?.('change', onChange);
    }, [query]);
    const getSnapshot = () => (canMatch() ? window.matchMedia(query).matches : fallback);
    return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

/** Escritorio (lg, 1024px): lista lateral + editor. Por debajo: tarjetas + modal. */
export const useIsDesktop = (): boolean => useMediaQuery('(min-width: 1024px)');
