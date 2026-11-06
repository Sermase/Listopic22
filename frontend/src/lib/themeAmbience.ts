/**
 * Gracias de ambiente de los temas (fase 2, parte 2): lo que cambia solo, sin
 * publicar nada. Funciones puras (se prueban sin navegador) y un poco de memoria
 * en este dispositivo.
 *
 * - Medianoche: cada valoración del mes es una estrella en el cielo del menú.
 * - Brasa: las ascuas del fondo brillan más cuantas más valoraciones llevas esta semana.
 * - Atardecer: el fondo se enciende al acercarse la puesta de sol.
 * - Pizarra: «Menú del día» a tiza en el menú, con 3 platos de «Cerca y bueno» que cambian cada día.
 * - Abuela: se acuerda de lo último que valoraste.
 */
import { hashString, mulberry32 } from './homeFeeds';

// ── Calendario ───────────────────────────────────────────────────────────────

export const startOfMonth = (now: Date): Date => new Date(now.getFullYear(), now.getMonth(), 1);

/** Lunes de esta semana a las 00:00. */
export function startOfWeek(now: Date): Date {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}

// ── Brasa ────────────────────────────────────────────────────────────────────

/** Brillo de las ascuas: 0,3 sin valoraciones esta semana y 0,75 con 7 o más. */
export function emberAlpha(weekCount: number | null): number {
    const n = Math.max(0, Math.min(7, weekCount ?? 0));
    return Math.round((0.3 + (n / 7) * 0.45) * 100) / 100;
}

// ── Atardecer ────────────────────────────────────────────────────────────────

/** Puesta de sol aproximada en España peninsular (hora local, minutos desde las 00:00), por mes. */
const SUNSET_BY_MONTH = [18 * 60 + 15, 18 * 60 + 50, 19 * 60 + 50, 20 * 60 + 55, 21 * 60 + 25, 21 * 60 + 47, 21 * 60 + 45, 21 * 60 + 15, 20 * 60 + 25, 19 * 60 + 25, 18 * 60 + 5, 17 * 60 + 55];

export const sunsetMinutes = (now: Date): number => SUNSET_BY_MONTH[now.getMonth()];

/** Cuánto se enciende el fondo: 0 lejos de la puesta, hasta 0,45 en ella (hora y media antes y después). */
export function duskAlpha(now: Date): number {
    const minutes = now.getHours() * 60 + now.getMinutes();
    const distance = Math.abs(minutes - sunsetMinutes(now));
    return Math.round(Math.max(0, 1 - distance / 90) * 0.45 * 100) / 100;
}

/** Hora dorada: de 18 a 22 h (la misma franja que la medalla del tema). */
export const isGoldenHour = (now: Date): boolean => now.getHours() >= 18 && now.getHours() < 22;

// ── Pizarra: menú del día ────────────────────────────────────────────────────

export interface MenuDish {
    title: string;
    subtitle?: string;
    score: number | null;
    to: string;
}

const MENU_KEY = 'listopic_menu_fuente';

/** Inicio guarda aquí lo mejor de «Cerca y bueno» (platos) para el menú de la Pizarra. */
export function saveMenuSource(dishes: readonly MenuDish[]): void {
    if (!dishes.length) return;
    try {
        localStorage.setItem(MENU_KEY, JSON.stringify(dishes.slice(0, 10).map(({ title, subtitle, score, to }) => ({ title, subtitle, score, to }))));
    } catch { /* sin almacenamiento */ }
}

function readMenuSource(): MenuDish[] {
    try {
        const list = JSON.parse(localStorage.getItem(MENU_KEY) || '[]');
        return Array.isArray(list) ? list.filter((d) => d && typeof d.title === 'string' && typeof d.to === 'string') : [];
    } catch {
        return [];
    }
}

/** Tres platos de los guardados, en un orden que cambia cada día (el mismo todo el día). */
export function pickDailyMenu(dishes: readonly MenuDish[], day: string, count = 3): MenuDish[] {
    const rand = mulberry32(hashString(`menu-${day}`));
    return dishes
        .map((dish) => ({ dish, roll: rand() }))
        .sort((a, b) => a.roll - b.roll)
        .slice(0, count)
        .map(({ dish }) => dish);
}

export const todaysMenu = (now = new Date()): MenuDish[] => pickDailyMenu(readMenuSource(), now.toDateString());

// ── Abuela: lo último que valoraste ─────────────────────────────────────────

const LAST_DISH_KEY = 'listopic_ultimo_plato';

export function rememberDish(name: string | null | undefined, now = new Date()): void {
    const clean = (name || '').trim();
    if (!clean) return;
    try { localStorage.setItem(LAST_DISH_KEY, JSON.stringify({ name: clean.slice(0, 60), at: now.getTime() })); } catch { /* opcional */ }
}

const MEMORY_LINES = [
    (x: string) => `¿Otra vez ${x}? Te vas a poner malo.`,
    (x: string) => `¿Y qué tal ${x}? ¿Como las mías?`,
    (x: string) => `Lo de ${x} está muy bien, pero un cocido es un cocido.`,
    (x: string) => `Ya me he enterado de lo de ${x}. A mí no me invitas, claro.`,
];

/** Frase de la Abuela sobre lo último que valoraste (de los últimos 3 días), o null. */
export function abuelaMemoryLine(now = new Date(), roll = Math.random()): string | null {
    try {
        const last = JSON.parse(localStorage.getItem(LAST_DISH_KEY) || 'null') as { name?: string; at?: number } | null;
        if (!last?.name || !last.at || now.getTime() - last.at > 3 * 86_400_000) return null;
        const dish = last.name.charAt(0).toLowerCase() + last.name.slice(1);
        return MEMORY_LINES[Math.floor(roll * MEMORY_LINES.length) % MEMORY_LINES.length](dish);
    } catch {
        return null;
    }
}
