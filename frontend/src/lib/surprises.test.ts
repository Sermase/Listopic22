import { describe, expect, it } from 'vitest';
import { dishEmoji, isAnsieviQuery, isPartyFood, reviewSurprises, tapCounter, tortillaQuery } from './surprises';

const at = (h: number) => new Date(2026, 9, 26, h, 30);

describe('sorpresas', () => {
    it('emoji del plato', () => {
        expect(dishEmoji('Las mejores pizzas', 'Margarita')).toBe('🍕');
        expect(dishEmoji('Patatas bravas')).toBe('🥔');
        expect(dishEmoji('Playas')).toBe('🏖️');
        expect(dishEmoji('Algo raro')).toBe('😋');
    });

    it('desde el 9 llueve y con suspenso se rompe el plato', () => {
        const base = { criteria: [], scores: {}, listName: 'Tartas de queso', now: at(14) };
        expect(reviewSurprises({ ...base, overallRating: 10 }).map((s) => s.id)).toEqual(['perfectTen']);
        expect(reviewSurprises({ ...base, overallRating: 1 }).map((s) => s.id)).toEqual(['brokenPlate']);
        expect(reviewSurprises({ ...base, overallRating: 9 }).map((s) => s.id)).toEqual(['perfectTen']);
        expect(reviewSurprises({ ...base, overallRating: 4.9 }).map((s) => s.id)).toEqual(['brokenPlate']);
        expect(reviewSurprises({ ...base, overallRating: 7 })).toEqual([]);
        expect(reviewSurprises({ ...base, overallRating: 5 })).toEqual([]);
    });

    it('picante al máximo', () => {
        const input = { overallRating: 7, criteria: [{ id: 'p', label: 'Picante', max: 10 }], scores: { p: 10 }, now: at(14) };
        expect(reviewSurprises(input).map((s) => s.id)).toEqual(['spicy']);
        expect(reviewSurprises({ ...input, scores: { p: 9 } })).toEqual([]);
    });

    it('madrugada solo con comida de fiesta', () => {
        const base = { overallRating: 7, criteria: [], scores: {} };
        expect(reviewSurprises({ ...base, listName: 'Kebabs', now: at(4) }).map((s) => s.id)).toEqual(['lateNight']);
        expect(reviewSurprises({ ...base, listName: 'Kebabs', now: at(14) })).toEqual([]);
        expect(reviewSurprises({ ...base, listName: 'Tartas de queso', now: at(4) })).toEqual([]);
        expect(isPartyFood('Hamburguesas')).toBe(true);
    });

    it('la abuela se queja de las raciones pequeñas', () => {
        const input = { overallRating: 6, criteria: [{ id: 'c', label: 'Cantidad' }], scores: { c: 3 }, now: at(14), abuela: true };
        expect(reviewSurprises(input).map((s) => s.id)).toEqual(['abuela']);
        expect(reviewSurprises({ ...input, abuela: false })).toEqual([]);
    });

    it('buscador', () => {
        expect(tortillaQuery('Tortilla con cebolla')).toBe('con');
        expect(tortillaQuery('tortilla de patata sin cebolla')).toBe('sin');
        expect(tortillaQuery('tortilla')).toBeNull();
        expect(isAnsieviQuery(' Ansievi ')).toBe(true);
    });

    it('siete toques seguidos', () => {
        let hits = 0;
        const tap = tapCounter(7, 3000, () => { hits += 1; });
        for (let i = 0; i < 6; i += 1) tap();
        expect(hits).toBe(0);
        tap();
        expect(hits).toBe(1);
    });
});
