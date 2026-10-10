/**
 * adminTime: fechas y antigüedad para las colas de Developer.
 * Sustituye a las copias locales de `toMillis` de las pestañas.
 *
 * API
 *   MINUTE_MS, HOUR_MS, DAY_MS
 *   type AgeLevel = 'fresh' | 'warning' | 'old'
 *   toMillis(value: unknown): number
 *       Timestamp de Firestore, {seconds}, Date, número (ms) o cadena ISO / 'YYYY-MM-DD'
 *       (medianoche local). Devuelve 0 si no hay fecha válida.
 *   formatAge(value: unknown, now = Date.now()): string
 *       «ahora mismo», «hace 5 min», «hace 3 h», «hace 2 d». '' si no hay fecha.
 *   formatUntil(value: unknown, now = Date.now()): string
 *       «en 20 min», «en 3 h», «en 8 d», «ya pasó». '' si no hay fecha.
 *   ageLevel(value: unknown, now = Date.now()): AgeLevel
 *       < 24 h → 'fresh' (gris) · 1 a 3 d → 'warning' (ámbar) · > 3 d → 'old' (rojo).
 *   formatDate(value: unknown, now = Date.now()): string
 *       «14/10» (con año, «14/10/2025», si no es el año de `now`). '' si no hay fecha.
 *   formatDateTime(value: unknown, now = Date.now()): string
 *       «12/09 18:20» (con año si no es el actual). '' si no hay fecha.
 *   todayIso(now = Date.now()): string
 *       Fecha local 'YYYY-MM-DD', para comparar con startsAt/endsAt de campañas.
 *   addDaysIso(iso: string, days: number): string
 *       Suma días a una fecha 'YYYY-MM-DD'.
 */

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export type AgeLevel = 'fresh' | 'warning' | 'old';

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const toMillis = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        const dateOnly = ISO_DATE_ONLY.exec(trimmed);
        if (dateOnly) {
            return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime();
        }
        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'object') {
        const candidate = value as { toMillis?: unknown; seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown };
        if (typeof candidate.toMillis === 'function') {
            const ms = (candidate.toMillis as () => number).call(value);
            return Number.isFinite(ms) ? ms : 0;
        }
        const seconds = typeof candidate.seconds === 'number'
            ? candidate.seconds
            : typeof candidate._seconds === 'number' ? candidate._seconds : null;
        if (seconds !== null) {
            const nanos = typeof candidate.nanoseconds === 'number' ? candidate.nanoseconds : 0;
            return seconds * 1000 + Math.floor(nanos / 1e6);
        }
    }
    return 0;
};

export const formatAge = (value: unknown, now: number = Date.now()): string => {
    const ms = toMillis(value);
    if (!ms) return '';
    const diff = now - ms;
    if (diff < MINUTE_MS) return 'ahora mismo';
    if (diff < HOUR_MS) return `hace ${Math.floor(diff / MINUTE_MS)} min`;
    if (diff < DAY_MS) return `hace ${Math.floor(diff / HOUR_MS)} h`;
    return `hace ${Math.floor(diff / DAY_MS)} d`;
};

export const formatUntil = (value: unknown, now: number = Date.now()): string => {
    const ms = toMillis(value);
    if (!ms) return '';
    const diff = ms - now;
    if (diff <= 0) return 'ya pasó';
    if (diff < HOUR_MS) return `en ${Math.max(1, Math.ceil(diff / MINUTE_MS))} min`;
    if (diff < DAY_MS) return `en ${Math.ceil(diff / HOUR_MS)} h`;
    return `en ${Math.ceil(diff / DAY_MS)} d`;
};

export const ageLevel = (value: unknown, now: number = Date.now()): AgeLevel => {
    const ms = toMillis(value);
    if (!ms) return 'fresh';
    const diff = now - ms;
    if (diff < DAY_MS) return 'fresh';
    if (diff <= 3 * DAY_MS) return 'warning';
    return 'old';
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const formatDate = (value: unknown, now: number = Date.now()): string => {
    const ms = toMillis(value);
    if (!ms) return '';
    const date = new Date(ms);
    const base = `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
    return date.getFullYear() === new Date(now).getFullYear() ? base : `${base}/${date.getFullYear()}`;
};

export const formatDateTime = (value: unknown, now: number = Date.now()): string => {
    const ms = toMillis(value);
    if (!ms) return '';
    const date = new Date(ms);
    return `${formatDate(ms, now)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const todayIso = (now: number = Date.now()): string => {
    const date = new Date(now);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const addDaysIso = (iso: string, days: number): string => {
    const ms = toMillis(iso);
    if (!ms) return iso;
    const date = new Date(ms);
    date.setDate(date.getDate() + days);
    return todayIso(date.getTime());
};
