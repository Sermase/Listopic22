import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';

// Ventanas (modales y hojas) que se cierran como en Pachote: con «atrás» del
// móvil o del navegador, y deslizando hacia abajo. Cada ventana abierta deja
// una entrada en el historial con la misma URL; «atrás» la quita y cierra la
// ventana en vez de salir de la página.

type Entry = { token: string; close: () => void };

const KEY = '__sheet';
const stack: Entry[] = [];
let listening = false;

const stateToken = (state: unknown): string | undefined =>
    state && typeof state === 'object' ? (state as Record<string, unknown>)[KEY] as string | undefined : undefined;

function onPopState(event: PopStateEvent) {
    const token = stateToken(event.state);
    const keep = token ? stack.findIndex((entry) => entry.token === token) : -1;
    for (let i = stack.length - 1; i > keep; i--) {
        const [entry] = stack.splice(i, 1);
        entry.close();
    }
    // Entrada de una ventana que ya no está (se salió a otra página desde ella): se salta.
    if (token && keep === -1) window.history.back();
}

/** Hay alguna ventana abierta: «atrás» de Android debe cerrarla, no salir de la app. */
export const hasOpenSheet = () => stack.length > 0;

/** «Atrás» cierra la ventana mientras `open`. */
export function useBackToClose(open: boolean, onClose: () => void): void {
    const id = useId();
    // Una marca por apertura (useId puede repetirse entre ventanas que ocupan el mismo hueco).
    const tokenRef = useRef<string | null>(null);
    const closeRef = useRef(onClose);
    useLayoutEffect(() => { closeRef.current = onClose; });

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;
        tokenRef.current ??= `${id}${Math.random().toString(36).slice(2, 8)}`;
        const token = tokenRef.current;
        if (!listening) {
            window.addEventListener('popstate', onPopState);
            listening = true;
        }
        const entry: Entry = { token, close: () => closeRef.current() };
        stack.push(entry);
        if (stateToken(window.history.state) !== token) {
            window.history.pushState({ ...(window.history.state || {}), [KEY]: token }, '');
        }
        return () => {
            const i = stack.indexOf(entry);
            if (i === -1) return; // La cerró «atrás».
            stack.splice(i, 1);
            // Se cerró con su botón: se quita su entrada del historial. Con espera, por si
            // se vuelve a montar al momento (StrictMode) o se ha navegado a otra página.
            setTimeout(() => {
                if (stack.some((other) => other.token === token)) return;
                if (stateToken(window.history.state) === token) window.history.back();
            }, 0);
        };
    }, [open, id]);

    useEffect(() => {
        if (!open) tokenRef.current = null;
    }, [open]);
}

const NO_SWIPE = 'input,textarea,select,[contenteditable="true"],[data-no-swipe],.leaflet-container';

/** Desliza hacia abajo para cerrar: devuelve la ref del panel. Solo arrastra si lo de debajo del dedo está arriba del todo. */
export function useSwipeToClose(onClose: () => void) {
    const closeRef = useRef(onClose);
    useLayoutEffect(() => { closeRef.current = onClose; });
    const detach = useRef<(() => void) | null>(null);

    return useCallback((panel: HTMLElement | null) => {
        detach.current?.();
        detach.current = null;
        if (!panel) return;

        let x0 = 0;
        let y0 = 0;
        let t0 = 0;
        let dy = 0;
        let armed = false;
        let dragging = false;

        const atTop = (target: EventTarget | null) => {
            for (let el = target as HTMLElement | null; el && el !== panel.parentElement; el = el.parentElement) {
                if (el.scrollTop > 0) return false;
            }
            return true;
        };
        const reset = (animate: boolean) => {
            panel.style.transition = animate ? 'transform .2s cubic-bezier(.2,.8,.2,1)' : '';
            panel.style.transform = '';
        };

        const start = (e: TouchEvent) => {
            const target = e.target as HTMLElement | null;
            armed = e.touches.length === 1 && !target?.closest(NO_SWIPE) && atTop(target);
            dragging = false;
            if (!armed) return;
            x0 = e.touches[0].clientX;
            y0 = e.touches[0].clientY;
            dy = 0;
        };
        const move = (e: TouchEvent) => {
            if (!armed) return;
            const t = e.touches[0];
            if (!dragging) {
                const dx = Math.abs(t.clientX - x0);
                const down = t.clientY - y0;
                if (dx < 8 && Math.abs(down) < 8) return;
                if (down <= dx || !atTop(e.target)) { armed = false; return; }
                dragging = true;
                y0 = t.clientY;
                t0 = performance.now();
                panel.style.transition = 'none';
            }
            dy = Math.max(0, t.clientY - y0);
            panel.style.transform = `translateY(${dy}px)`;
            if (e.cancelable) e.preventDefault();
        };
        const end = () => {
            if (!dragging) return;
            dragging = false;
            armed = false;
            const speed = dy / Math.max(1, performance.now() - t0);
            if (dy > Math.min(140, panel.offsetHeight * 0.25) || (dy > 30 && speed > 0.6)) {
                panel.style.transition = 'transform .18s ease-in';
                panel.style.transform = 'translateY(110%)';
                setTimeout(() => {
                    closeRef.current();
                    // Si la ventana no se ha ido (p. ej. pide confirmación), vuelve a su sitio.
                    setTimeout(() => { if (panel.isConnected) reset(true); }, 350);
                }, 170);
            } else {
                reset(true);
            }
        };

        panel.addEventListener('touchstart', start, { passive: true });
        panel.addEventListener('touchmove', move, { passive: false });
        panel.addEventListener('touchend', end);
        panel.addEventListener('touchcancel', end);
        detach.current = () => {
            panel.removeEventListener('touchstart', start);
            panel.removeEventListener('touchmove', move);
            panel.removeEventListener('touchend', end);
            panel.removeEventListener('touchcancel', end);
        };
    }, []);
}

/** Las dos cosas: «atrás» y deslizar. Pon la ref en el panel de la ventana. */
export function useSheetDismiss(onClose: () => void, open = true) {
    useBackToClose(open, onClose);
    return useSwipeToClose(onClose);
}
