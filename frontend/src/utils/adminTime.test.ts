import { describe, expect, it } from 'vitest';
import {
    DAY_MS,
    HOUR_MS,
    MINUTE_MS,
    addDaysIso,
    ageLevel,
    formatAge,
    formatDate,
    formatDateTime,
    formatUntil,
    toMillis,
    todayIso,
} from './adminTime';

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime(); // 06/10/2026 12:00 local

describe('toMillis', () => {
    it('lee Timestamps, {seconds}, Date, números y cadenas', () => {
        expect(toMillis({ toMillis: () => 1234 })).toBe(1234);
        expect(toMillis({ seconds: 10, nanoseconds: 5_000_000 })).toBe(10_005);
        expect(toMillis({ _seconds: 2 })).toBe(2000);
        expect(toMillis(new Date(5000))).toBe(5000);
        expect(toMillis(42)).toBe(42);
        expect(toMillis('2026-10-06')).toBe(new Date(2026, 9, 6).getTime());
        expect(toMillis('2026-10-06T10:00:00.000Z')).toBe(Date.UTC(2026, 9, 6, 10));
    });

    it('devuelve 0 si no hay fecha válida', () => {
        expect(toMillis(null)).toBe(0);
        expect(toMillis(undefined)).toBe(0);
        expect(toMillis('')).toBe(0);
        expect(toMillis('mañana')).toBe(0);
        expect(toMillis(Number.NaN)).toBe(0);
        expect(toMillis(-5)).toBe(0);
        expect(toMillis(new Date('x'))).toBe(0);
        expect(toMillis({})).toBe(0);
    });
});

describe('formatAge', () => {
    it('usa minutos, horas y días', () => {
        expect(formatAge(NOW - 20 * 1000, NOW)).toBe('ahora mismo');
        expect(formatAge(NOW - 5 * MINUTE_MS, NOW)).toBe('hace 5 min');
        expect(formatAge(NOW - 59 * MINUTE_MS, NOW)).toBe('hace 59 min');
        expect(formatAge(NOW - 3 * HOUR_MS, NOW)).toBe('hace 3 h');
        expect(formatAge(NOW - 23 * HOUR_MS - 59 * MINUTE_MS, NOW)).toBe('hace 23 h');
        expect(formatAge(NOW - 2 * DAY_MS, NOW)).toBe('hace 2 d');
        expect(formatAge(NOW - 45 * DAY_MS, NOW)).toBe('hace 45 d');
    });

    it('acepta Timestamps y fechas futuras por desfase de reloj', () => {
        expect(formatAge({ toMillis: () => NOW - 2 * HOUR_MS }, NOW)).toBe('hace 2 h');
        expect(formatAge(NOW + 30 * 1000, NOW)).toBe('ahora mismo');
    });

    it('devuelve cadena vacía sin fecha', () => {
        expect(formatAge(null, NOW)).toBe('');
        expect(formatAge(0, NOW)).toBe('');
    });
});

describe('formatUntil', () => {
    it('cuenta hacia delante', () => {
        expect(formatUntil(NOW + 20 * MINUTE_MS, NOW)).toBe('en 20 min');
        expect(formatUntil(NOW + 3 * HOUR_MS, NOW)).toBe('en 3 h');
        expect(formatUntil(NOW + 8 * DAY_MS, NOW)).toBe('en 8 d');
        expect(formatUntil(NOW - 1, NOW)).toBe('ya pasó');
        expect(formatUntil(undefined, NOW)).toBe('');
    });
});

describe('ageLevel', () => {
    it('gris menos de 24 h, ámbar de 1 a 3 días y rojo después', () => {
        expect(ageLevel(NOW - 2 * HOUR_MS, NOW)).toBe('fresh');
        expect(ageLevel(NOW - 23 * HOUR_MS, NOW)).toBe('fresh');
        expect(ageLevel(NOW - DAY_MS, NOW)).toBe('warning');
        expect(ageLevel(NOW - 3 * DAY_MS, NOW)).toBe('warning');
        expect(ageLevel(NOW - 3 * DAY_MS - 1, NOW)).toBe('old');
        expect(ageLevel(NOW - 10 * DAY_MS, NOW)).toBe('old');
        expect(ageLevel(null, NOW)).toBe('fresh');
    });
});

describe('formatDate / formatDateTime', () => {
    it('omite el año actual y lo añade si es otro', () => {
        const sameYear = new Date(2026, 8, 12, 18, 5).getTime();
        const lastYear = new Date(2025, 11, 31, 9, 0).getTime();
        expect(formatDate(sameYear, NOW)).toBe('12/09');
        expect(formatDateTime(sameYear, NOW)).toBe('12/09 18:05');
        expect(formatDate(lastYear, NOW)).toBe('31/12/2025');
        expect(formatDateTime(lastYear, NOW)).toBe('31/12/2025 09:00');
        expect(formatDate('2026-10-14', NOW)).toBe('14/10');
        expect(formatDateTime(undefined, NOW)).toBe('');
    });
});

describe('todayIso / addDaysIso', () => {
    it('trabaja con fechas locales YYYY-MM-DD', () => {
        expect(todayIso(NOW)).toBe('2026-10-06');
        expect(addDaysIso('2026-10-06', 3)).toBe('2026-10-09');
        expect(addDaysIso('2026-10-30', 3)).toBe('2026-11-02');
        expect(addDaysIso('no-es-fecha', 3)).toBe('no-es-fecha');
    });
});
