import { describe, expect, it } from 'vitest';
import { buildSoulmateFeed } from './soulmateFeed';

const ana = { uid: 'ana', displayName: 'Ana', affinityScore: 91 };
const leo = { uid: 'leo', displayName: 'Leo', affinityScore: 70 };
const r = (id: string, userId: string, itemName: string, overallRating: number, createdAt: number, extra = {}) =>
    ({ id, userId, placeId: 'P' + itemName, itemName, overallRating, createdAt, placeName: 'Bar', ...extra });

describe('buildSoulmateFeed', () => {
    it('solo platos bien puntuados por almas gemelas que no has probado', () => {
        const cards = buildSoulmateFeed([ana], [
            r('1', 'ana', 'Bravas', 9, 3),
            r('2', 'ana', 'Tortilla', 6, 2),
            r('3', 'otro', 'Pizza', 9, 1),
            r('4', 'ana', 'Croquetas', 8, 1),
        ], [{ id: 'mine', placeId: 'PCroquetas', itemName: 'croquetas' }]);
        expect(cards.map((c) => c.title)).toEqual(['Bravas']);
        expect(cards[0].subtitle).toBe('💞 91% afín · Bar');
        expect(cards[0].authorName).toBe('Ana');
    });

    it('máximo dos por persona y lo más reciente primero', () => {
        const cards = buildSoulmateFeed([ana, leo], [
            r('1', 'ana', 'A', 9, 5),
            r('2', 'ana', 'B', 9, 4),
            r('3', 'ana', 'C', 9, 3),
            r('4', 'leo', 'D', 9, 1),
        ], []);
        expect(cards.map((c) => c.title)).toEqual(['A', 'B', 'D']);
    });

    it('sin almas gemelas, nada', () => {
        expect(buildSoulmateFeed([], [r('1', 'ana', 'A', 9, 1)], [])).toEqual([]);
    });
});
