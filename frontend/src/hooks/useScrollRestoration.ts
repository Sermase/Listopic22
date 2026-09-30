import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Cuánto esperamos a que la página vuelva a tener altura suficiente (el
// contenido se recarga al volver) antes de rendirnos.
const MAX_RESTORE_MS = 5000;
// Tiempo que la posición debe mantenerse para dar la restauración por hecha.
const STABLE_MS = 1000;

// Posición de scroll por entrada del historial (location.key). Vive en memoria:
// basta para ir y volver dentro de la app.
const positions = new Map<string, number>();

/**
 * - Navegación nueva a otra página: empieza arriba (como antes).
 * - Volver atrás/adelante: recupera la posición donde estaba el usuario,
 *   reintentando mientras el contenido carga. Si el usuario toca o hace
 *   scroll mientras tanto, se respeta su gesto y se deja de restaurar.
 */
export function useScrollRestoration() {
    const location = useLocation();
    const navigationType = useNavigationType();
    const currentKeyRef = useRef(location.key);
    const previousPathRef = useRef(location.pathname);

    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                positions.set(currentKeyRef.current, window.scrollY);
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    useLayoutEffect(() => {
        currentKeyRef.current = location.key;
        const pathChanged = previousPathRef.current !== location.pathname;
        previousPathRef.current = location.pathname;

        if (navigationType !== 'POP') {
            // Cambios de ?query en la misma página (p. ej. escribir en Buscar) no suben arriba.
            if (pathChanged && !location.hash) window.scrollTo(0, 0);
            return;
        }

        const target = positions.get(location.key);
        if (!target) {
            if (pathChanged) window.scrollTo(0, 0);
            return;
        }

        let cancelled = false;
        let frame = 0;
        let stableSince = 0;
        const startedAt = performance.now();
        const stop = () => { cancelled = true; };
        const removeListeners = () => {
            window.removeEventListener('wheel', stop);
            window.removeEventListener('pointerdown', stop);
            window.removeEventListener('touchstart', stop);
            window.removeEventListener('keydown', stop);
        };
        window.addEventListener('wheel', stop, { passive: true });
        window.addEventListener('pointerdown', stop, { passive: true });
        window.addEventListener('touchstart', stop, { passive: true });
        window.addEventListener('keydown', stop);

        // Al volver, la página se vuelve a pintar (primero corta, luego crece
        // según llegan los datos) y el navegador recorta el scroll. Por eso no
        // basta con un intento: se reaplica hasta que la posición se mantiene
        // estable un momento con la página ya lo bastante alta.
        const attempt = () => {
            if (cancelled) { removeListeners(); return; }
            const now = performance.now();
            const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const reachable = Math.min(target, maxScroll);
            if (Math.abs(window.scrollY - reachable) > 2) window.scrollTo(0, reachable);

            if (maxScroll >= target && Math.abs(window.scrollY - target) <= 2) {
                if (!stableSince) stableSince = now;
            } else {
                stableSince = 0;
            }

            const settled = stableSince && now - stableSince > STABLE_MS;
            if (settled || now - startedAt > MAX_RESTORE_MS) {
                removeListeners();
                return;
            }
            frame = requestAnimationFrame(attempt);
        };
        frame = requestAnimationFrame(attempt);

        return () => {
            cancelled = true;
            if (frame) cancelAnimationFrame(frame);
            removeListeners();
        };
    }, [location.key, location.pathname, location.hash, navigationType]);
}
