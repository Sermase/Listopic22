// El menú sube pegado al dedo desde la barra de abajo (BottomNav) y Navbar lo
// pinta. Aquí se cruzan: Navbar registra el panel y BottomNav lo mueve.

/** Pide a Navbar que abra el menú. */
export const OPEN_MENU_EVENT = 'listopic:open-menu';
/** Pide a Navbar que cierre el menú (se soltó sin subirlo bastante). */
export const CLOSE_MENU_EVENT = 'listopic:close-menu';

let panel: HTMLElement | null = null;
let dragging = false;
let pull = 0;

const backdropOf = (el: HTMLElement) => el.previousElementSibling as HTMLElement | null;

function place(el: HTMLElement, animate: boolean) {
    const h = el.offsetHeight || window.innerHeight;
    const y = Math.max(0, h - pull);
    const transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    el.style.animation = 'none';
    el.style.transition = transition;
    el.style.transform = `translateY(${y}px)`;
    const shade = backdropOf(el);
    if (shade) {
        shade.style.animation = 'none';
        shade.style.transition = animate ? 'opacity .28s ease-out' : 'none';
        shade.style.opacity = String(Math.min(1, pull / Math.max(1, h)));
    }
}

/** Navbar: el panel del menú al montarse o desmontarse. */
export function registerMenuPanel(el: HTMLElement | null) {
    panel = el;
    if (el && dragging) place(el, false);
}

/** BottomNav: empieza a subir el menú (lo abre escondido abajo). */
export function startMenuDrag() {
    dragging = true;
    pull = 0;
    window.dispatchEvent(new Event(OPEN_MENU_EVENT));
}

/** BottomNav: cuánto ha subido el dedo desde que empezó. */
export function moveMenuDrag(distance: number) {
    if (!dragging) return;
    pull = Math.max(0, distance);
    if (panel) place(panel, false);
}

/** BottomNav: soltó. Se queda abierto si subió bastante o deprisa; si no, baja y se cierra. */
export function endMenuDrag(speed: number) {
    if (!dragging) return;
    dragging = false;
    const el = panel;
    if (!el) return;
    const h = el.offsetHeight || window.innerHeight;
    const open = pull > h * 0.3 || speed > 0.5;
    pull = open ? h : 0;
    place(el, true);
    window.setTimeout(() => {
        if (!open) { window.dispatchEvent(new Event(CLOSE_MENU_EVENT)); return; }
        // Abierto: vuelve a sus estilos (deslizar hacia abajo lo sigue cerrando).
        el.style.transition = '';
        el.style.transform = '';
        const shade = backdropOf(el);
        if (shade) { shade.style.transition = ''; shade.style.opacity = ''; }
    }, 300);
}

export const isMenuDragging = () => dragging;
