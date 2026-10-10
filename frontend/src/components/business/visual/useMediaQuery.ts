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
