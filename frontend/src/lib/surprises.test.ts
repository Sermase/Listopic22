import { describe, expect, it } from 'vitest';
import { dishEmoji, isAnsieviQuery, isPartyFood, reviewSurprises, tapCounter, pollQuery } from './surprises';
import { THEME_CHARACTERS, scoopColors } from './themeCharacters';

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
        const input = { overallRating: 6, criteria: [{ id: 'c', label: 'Cantidad' }], scores: { c: 3 }, now: at(14), character: THEME_CHARACTERS.abuela };
        expect(reviewSurprises(input).map((s) => s.id)).toEqual(['abuela']);
        expect(reviewSurprises({ ...input, character: null })).toEqual([]);
        // Los demás personajes se quejan con su voz y van con su interruptor.
        const gull = reviewSurprises({ ...input, character: THEME_CHARACTERS.lagoon });
        expect(gull.map((s) => s.id)).toEqual(['themeCharacters']);
        expect(gull[0].effect).toMatchObject({ kind: 'bubble', emoji: '🐦', text: THEME_CHARACTERS.lagoon!.tiny });
    });

    it('buscador', () => {
        expect(pollQuery('Tortilla con cebolla')).toEqual({ poll: 'tortilla', side: 'con' });
        expect(pollQuery('tortilla de patata sin cebolla')).toEqual({ poll: 'tortilla', side: 'sin' });
        expect(pollQuery('tortilla')).toEqual({ poll: 'tortilla', side: undefined });
        expect(pollQuery('pizza hawaiana')).toEqual({ poll: 'pizza', side: 'con' });
        expect(pollQuery('pizza sin piña')).toEqual({ poll: 'pizza', side: 'sin' });
        expect(pollQuery('piña')).toEqual({ poll: 'pizza', side: undefined });
        expect(pollQuery('bravas')).toBeNull();
        expect(pollQuery('espinacas')).toBeNull();
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

describe('gracias de los temas', () => {
    it('helado de notas: una bola por criterio con color según su nota (máximo 5)', () => {
        const criteria = [{ id: 'a' }, { id: 'b', max: 5 }, { id: 'c' }, { id: 'd' }];
        expect(scoopColors({ a: 9.5, b: 2.5, c: 3, d: Number.NaN }, criteria)).toEqual(['#f9a8d4', '#d6bfa8', '#8b5e3c']);
        const many = Array.from({ length: 7 }, (_, i) => ({ id: `k${i}` }));
        expect(scoopColors(Object.fromEntries(many.map((c) => [c.id, 8])), many)).toHaveLength(5);
    });

    it('Medianoche y Mediodía no tienen personaje; los especiales sí', () => {
        expect(THEME_CHARACTERS.dark).toBeUndefined();
        expect(THEME_CHARACTERS.light).toBeUndefined();
        (['warm', 'cool', 'neon', 'graphite', 'sunset', 'lagoon', 'abuela'] as const).forEach((t) => {
            expect(THEME_CHARACTERS[t]?.greetings.length).toBeGreaterThan(0);
        });
    });
});
