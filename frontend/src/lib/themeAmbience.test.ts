import { beforeEach, describe, expect, it } from 'vitest';
import { abuelaMemoryLine, duskAlpha, emberAlpha, isGoldenHour, pickDailyMenu, rememberDish, startOfWeek } from './themeAmbience';

describe('gracias de ambiente', () => {
    beforeEach(() => localStorage.clear());

    it('las ascuas de Brasa brillan más con las valoraciones de la semana (tope en 7)', () => {
        expect(emberAlpha(null)).toBe(0.3);
        expect(emberAlpha(0)).toBe(0.3);
        expect(emberAlpha(7)).toBe(0.75);
        expect(emberAlpha(20)).toBe(0.75);
        expect(emberAlpha(3)).toBeGreaterThan(0.3);
    });

    it('la semana empieza el lunes', () => {
        // Jueves 6 de noviembre de 2026 → lunes 2.
        expect(startOfWeek(new Date(2026, 10, 6, 15)).getDate()).toBe(2);
        // Domingo 8 → sigue siendo la semana del lunes 2.
        expect(startOfWeek(new Date(2026, 10, 8, 9)).getDate()).toBe(2);
    });

    it('Atardecer se enciende alrededor de la puesta de sol', () => {
        // Noviembre: puesta hacia las 18:05.
        expect(duskAlpha(new Date(2026, 10, 6, 18, 5))).toBe(0.45);
        expect(duskAlpha(new Date(2026, 10, 6, 12, 0))).toBe(0);
        expect(duskAlpha(new Date(2026, 10, 6, 17, 20))).toBeGreaterThan(0);
        expect(isGoldenHour(new Date(2026, 10, 6, 19))).toBe(true);
        expect(isGoldenHour(new Date(2026, 10, 6, 23))).toBe(false);
    });

    it('el menú del día es el mismo todo el día y cambia de un día a otro', () => {
        const dishes = Array.from({ length: 10 }, (_, i) => ({ title: `Plato ${i}`, score: 8, to: `/p/${i}` }));
        const today = pickDailyMenu(dishes, 'Fri Nov 06 2026');
        expect(today).toHaveLength(3);
        expect(pickDailyMenu(dishes, 'Fri Nov 06 2026')).toEqual(today);
        const week = ['Sat Nov 07 2026', 'Sun Nov 08 2026', 'Mon Nov 09 2026'].map((d) => pickDailyMenu(dishes, d).map((x) => x.to).join());
        expect(week.some((w) => w !== today.map((x) => x.to).join())).toBe(true);
    });

    it('la Abuela se acuerda de lo último que valoraste durante 3 días', () => {
        const now = new Date(2026, 10, 6, 12);
        expect(abuelaMemoryLine(now)).toBeNull();
        rememberDish('Bravas', now);
        expect(abuelaMemoryLine(now, 0)).toBe('¿Otra vez bravas? Te vas a poner malo.');
        expect(abuelaMemoryLine(new Date(2026, 10, 10, 12), 0)).toBeNull();
    });
});
