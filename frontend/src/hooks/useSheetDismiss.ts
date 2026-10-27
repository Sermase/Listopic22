import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { haptic } from '../utils/haptics';

// Ventanas (modales y hojas) que se cierran como en Pachote: con «atrás» del
// móvil o del navegador, y deslizando hacia abajo. Cada ventana abierta deja
// una entrada en el historial con la misma URL; «atrás» la quita y cierra la
// ventana en vez de salir de la página.

type Entry = { token: string; close: () => void; open: boolean };

const KEY = '__sheet';
const stack: Entry[] = [];
let listening = false;

const stateToken = (state: unknown): string | undefined =>
    state && typeof state === 'object' ? (state as Record<string, unknown>)[KEY] as string | undefined : undefined;

function onPopState(event: PopStateEvent) {
    const token = stateToken(event.state);
    const keep = token ? stack.findIndex((entry) => entry.token === token) : -1;
    const popped = stack.splice(keep + 1);
    for (let i = popped.length - 1; i >= 0; i--) popped[i].close();
    // La que no se deja cerrar (p. ej. mientras sube una foto) recupera su sitio y su entrada.
    if (popped.length) {
        setTimeout(() => {
            for (const entry of popped) {
                if (!entry.open || stack.includes(entry)) continue;
                stack.push(entry);
                window.history.pushState({ ...(window.history.state || {}), [KEY]: entry.token }, '');
            }
        }, 0);
    }
    // Entrada de una ventana que ya no está (se salió a otra página desde ella): se salta.
    if (token && keep === -1) window.history.back();
}

/** Hay alguna ventana abierta: «atrás» de Android debe cerrarla, no salir de la app. */
export const hasOpenSheet = () => stack.length > 0;

// Con una ventana abierta, deslizar hacia abajo no recarga la página (el «tirar para
// actualizar» de Chrome sacaba de la ventana). Solo cuenta en <html>, no en <body>.
let locks = 0;
const PTR_CLASS = 'lt-no-pull-refresh';

/** Bloquea el «tirar para actualizar» mientras `active`. */
export function useNoPullToRefresh(active: boolean): void {
    useEffect(() => {
        if (!active || typeof document === 'undefined') return;
        locks += 1;
        document.documentElement.classList.add(PTR_CLASS);
        return () => {
            locks -= 1;
            if (!locks) document.documentElement.classList.remove(PTR_CLASS);
        };
    }, [active]);
}

/** «Atrás» cierra la ventana mientras `open`. */
export function useBackToClose(open: boolean, onClose: () => void): void {
    const id = useId();
    // Una marca por apertura (useId puede repetirse entre ventanas que ocupan el mismo hueco).
    const tokenRef = useRef<string | null>(null);
    const closeRef = useRef(onClose);
    useLayoutEffect(() => { closeRef.current = onClose; });
    useNoPullToRefresh(open);

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;
        tokenRef.current ??= `${id}${Math.random().toString(36).slice(2, 8)}`;
        const token = tokenRef.current;
        if (!listening) {
            window.addEventListener('popstate', onPopState);
            listening = true;
        }
        const entry: Entry = { token, close: () => closeRef.current(), open: true };
        stack.push(entry);
        if (stateToken(window.history.state) !== token) {
            window.history.pushState({ ...(window.history.state || {}), [KEY]: token }, '');
        }
        return () => {
            entry.open = false;
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

const hasShade = (el: Element) => {
    const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return !!c && (c.length < 4 || Number(c[3]) > 0);
};

/** El fondo oscuro de la ventana: el primer antepasado fijo del panel o, si es transparente, su hermano oscuro («tocar fuera cierra»). */
function findBackdrop(panel: HTMLElement): HTMLElement | null {
    for (let el = panel.parentElement; el && el !== document.body; el = el.parentElement) {
        if (getComputedStyle(el).position !== 'fixed') continue;
        if (hasShade(el)) return el;
        const sibling = Array.from(el.children).find((c) => !c.contains(panel) && hasShade(c));
        return (sibling as HTMLElement | undefined) || el;
    }
    return null;
}

const animateSheets = () => typeof window !== 'undefined'
    && window.matchMedia('(max-width: 767px)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Al cerrarse con su botón (o tocando fuera) la ventana desaparecía de golpe: una copia baja y se desvanece en su lugar.
 * `ancestors` son los antepasados del panel cuando se abrió (`fixedAt`, el primero fijo): lo quitado se vuelve a poner, copiado, donde estaba. */
function slideOutCopy(panel: HTMLElement, ancestors: HTMLElement[], fixedAt: number) {
    if (!animateSheets()) return;
    const parentAt = ancestors.findIndex((el) => el.isConnected);
    if (parentAt === -1) return;
    const removed = parentAt === 0 ? panel : ancestors[parentAt - 1];
    // Solo si se quitó la ventana (no una página entera al navegar).
    if (parentAt - 1 > fixedAt) return;
    panel.setAttribute('data-lt-ghost', '');
    const copy = removed.cloneNode(true) as HTMLElement;
    panel.removeAttribute('data-lt-ghost');
    const copyPanel = copy.matches('[data-lt-ghost]') ? copy : copy.querySelector<HTMLElement>('[data-lt-ghost]');
    if (!copyPanel) return;
    copy.classList.add('lt-ghost');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.pointerEvents = 'none';
    ancestors[parentAt].appendChild(copy);
    const from = panel.style.transform || 'translateY(0)';
    const timing = { duration: 240, easing: 'cubic-bezier(.4, 0, .9, .6)', fill: 'forwards' as const };
    // El fondo oscuro se desvanece; el panel baja entero, sin volverse transparente.
    const shades = Array.from(copy.children).filter((el) => !el.contains(copyPanel));
    if (copy !== copyPanel) (shades.length ? shades : [copy]).forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], timing));
    copyPanel.animate([{ transform: from }, { transform: 'translateY(100%)' }], timing).finished
        .catch(() => undefined)
        .then(() => copy.remove());
}

/** Desliza hacia abajo para cerrar: devuelve la ref del panel. Solo arrastra si lo de debajo del dedo está arriba del todo.
 * En el móvil la ventana entra desde abajo con un asa (clases lt-sheet en index.css) y el fondo se aclara al arrastrar. */
export function useSwipeToClose(onClose: () => void) {
    const closeRef = useRef(onClose);
    useLayoutEffect(() => { closeRef.current = onClose; });
    const detach = useRef<(() => void) | null>(null);

    return useCallback((panel: HTMLElement | null) => {
        detach.current?.();
        detach.current = null;
        if (!panel) return;
        panel.classList.add('lt-sheet');
        const backdrop = findBackdrop(panel);
        // Dónde está, para la copia que baja al cerrarse.
        const ancestors: HTMLElement[] = [];
        for (let el = panel.parentElement; el; el = el.parentElement) ancestors.push(el);
        const fixedAt = ancestors.findIndex((el) => getComputedStyle(el).position === 'fixed');
        let swiped = false;
        backdrop?.classList.add('lt-sheet-backdrop');
        let dim: number[] | null = null;
        const shade = (alpha: number, transition: string) => {
            if (!backdrop || !dim) return;
            backdrop.style.transition = transition;
            backdrop.style.backgroundColor = `rgba(${dim[0]}, ${dim[1]}, ${dim[2]}, ${alpha})`;
        };

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
            if (backdrop) {
                backdrop.style.transition = animate ? 'background-color .2s ease-out' : '';
                backdrop.style.backgroundColor = '';
            }
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
                const rgba = backdrop ? getComputedStyle(backdrop).backgroundColor.match(/[\d.]+/g)?.map(Number) : null;
                dim = rgba && rgba.length >= 3 ? [rgba[0], rgba[1], rgba[2], rgba[3] ?? 1] : null;
            }
            dy = Math.max(0, t.clientY - y0);
            panel.style.transform = `translateY(${dy}px)`;
            if (dim) shade(dim[3] * (1 - Math.min(1, dy / Math.max(1, panel.offsetHeight))), 'none');
            if (e.cancelable) e.preventDefault();
        };
        const end = () => {
            if (!dragging) return;
            dragging = false;
            armed = false;
            const speed = dy / Math.max(1, performance.now() - t0);
            if (dy > Math.min(140, panel.offsetHeight * 0.25) || (dy > 30 && speed > 0.6)) {
                swiped = true;
                haptic('light');
                panel.style.transition = 'transform .18s ease-in';
                panel.style.transform = 'translateY(110%)';
                shade(0, 'background-color .18s ease-in');
                setTimeout(() => {
                    closeRef.current();
                    // Si la ventana no se ha ido (p. ej. pide confirmación), vuelve a su sitio.
                    setTimeout(() => { if (panel.isConnected) { swiped = false; reset(true); } }, 350);
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
            // Desmontada (no solo cambiada de ref): baja suave si no se fue ya deslizando.
            requestAnimationFrame(() => { if (!panel.isConnected && !swiped) slideOutCopy(panel, ancestors, fixedAt); });
        };
    }, []);
}

/** Las dos cosas: «atrás» y deslizar. Pon la ref en el panel de la ventana. */
export function useSheetDismiss(onClose: () => void, open = true) {
    useBackToClose(open, onClose);
    return useSwipeToClose(onClose);
}
