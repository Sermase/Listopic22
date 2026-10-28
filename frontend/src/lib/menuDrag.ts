// El menú sube pegado al dedo desde la barra de abajo (BottomNav) y Navbar lo
// pinta. Aquí se cruzan: Navbar registra el panel y BottomNav lo mueve.

/** Pide a Navbar que abra el menú. */
export const OPEN_MENU_EVENT = 'listopic:open-menu';
/** Pide a Navbar que cierre el menú (se soltó sin subirlo bastante). */
export const CLOSE_MENU_EVENT = 'listopic:close-menu';

/** El dedo va sobre el asa, un poco por debajo del borde de arriba del panel. */
const GRAB = 14;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';

let panel: HTMLElement | null = null;
let dragging = false;
let fingerY: number | null = null;
let enterStart = 0;
const ENTER_MS = 140;

const backdropOf = (el: HTMLElement) => el.previousElementSibling as HTMLElement | null;

/** Dónde queda arriba el panel sin moverlo: el fondo de su capa menos su alto. */
const restingTop = (el: HTMLElement) => (el.offsetParent as HTMLElement | null ?? document.documentElement).getBoundingClientRect().bottom - el.offsetHeight;

function place(el: HTMLElement, y: number, duration: number) {
    const h = el.offsetHeight || window.innerHeight;
    el.style.animation = 'none';
    el.style.transition = duration ? `transform ${duration}ms ${EASE}` : 'none';
    el.style.transform = `translateY(${Math.min(h, Math.max(0, y))}px)`;
    const shade = backdropOf(el);
    if (shade) {
        shade.style.animation = 'none';
        shade.style.transition = duration ? `opacity ${duration}ms ease-out` : 'none';
        shade.style.opacity = String(1 - Math.min(1, Math.max(0, y) / h));
    }
}

/** Sigue al dedo: el borde de arriba del panel justo encima de él. */
function follow(el: HTMLElement) {
    if (fingerY === null) return;
    const y = fingerY - GRAB - restingTop(el);
    // Al principio entra en un instante (no de golpe) hasta el dedo; luego va pegado.
    if (!enterStart) enterStart = performance.now();
    place(el, y, Math.max(0, Math.round(ENTER_MS - (performance.now() - enterStart))));
}

/** Navbar: el panel del menú al montarse o desmontarse. */
export function registerMenuPanel(el: HTMLElement | null) {
    panel = el;
    if (!el || !dragging) return;
    place(el, el.offsetHeight || window.innerHeight, 0);
    requestAnimationFrame(() => { if (panel === el && dragging) follow(el); });
}

/** BottomNav: empieza a subir el menú (lo abre escondido abajo). */
export function startMenuDrag(clientY: number) {
    dragging = true;
    enterStart = 0;
    fingerY = clientY;
    window.dispatchEvent(new Event(OPEN_MENU_EVENT));
}

/** BottomNav: el dedo se mueve. */
export function moveMenuDrag(clientY: number) {
    if (!dragging) return;
    fingerY = clientY;
    if (panel && enterStart) follow(panel);
}

/** BottomNav: soltó, con la velocidad vertical del dedo (px/ms, negativa hacia arriba). */
export function endMenuDrag(speed: number) {
    if (!dragging) return;
    dragging = false;
    const el = panel;
    fingerY = null;
    if (!el) return;
    const h = el.offsetHeight || window.innerHeight;
    const y = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    // Abierto si sube deprisa, o si ya enseña un tercio y no baja deprisa.
    const open = speed < -0.4 || (speed <= 0.4 && y < h * 0.67);
    // Más rápido cuanto menos le queda.
    const duration = Math.round(160 + 160 * Math.min(1, Math.abs((open ? y : h - y) / h)));
    place(el, open ? 0 : h, duration);
    window.setTimeout(() => {
        if (!open) { window.dispatchEvent(new Event(CLOSE_MENU_EVENT)); return; }
        // Abierto: vuelve a sus estilos (deslizar hacia abajo lo sigue cerrando).
        el.style.transition = '';
        el.style.transform = '';
        const shade = backdropOf(el);
        if (shade) { shade.style.transition = ''; shade.style.opacity = ''; }
    }, duration + 20);
}
