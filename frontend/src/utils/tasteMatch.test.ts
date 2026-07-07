import { describe, expect, it } from 'vitest';
import { computeTasteMatch } from './tasteMatch';

describe('computeTasteMatch', () => {
    it('devuelve null sin lugares en común (el bug del 39% con una pizza ajena)', () => {
        const own = [{ placeId: 'p1', itemName: 'Tarta', overallRating: 9 }];
        const other = [{ placeId: 'p2', itemName: 'Pizza reggina', overallRating: 8 }];
        expect(computeTasteMatch(own, other)).toBeNull();
    });

    it('devuelve null si alguno no tiene reseñas', () => {
        expect(computeTasteMatch([], [{ placeId: 'p1', overallRating: 8 }])).toBeNull();
    });

    it('un solo lugar común con notas idénticas no supera el ~63%', () => {
        const own = [{ placeId: 'p1', overallRating: 8 }];
        const other = [{ placeId: 'p1', overallRating: 8 }];
        const result = computeTasteMatch(own, other);
        expect(result).not.toBeNull();
        expect(result!.score).toBeGreaterThan(40);
        expect(result!.score).toBeLessThanOrEqual(65);
        expect(result!.sharedPlaces).toBe(1);
    });

    it('muchos lugares comunes con notas parecidas dan un match alto', () => {
        const own = ['p1', 'p2', 'p3', 'p4'].map((placeId) => ({ placeId, overallRating: 8 }));
        const other = ['p1', 'p2', 'p3', 'p4'].map((placeId) => ({ placeId, overallRating: 8.5 }));
        const result = computeTasteMatch(own, other);
        expect(result!.score).toBeGreaterThanOrEqual(85);
    });

    it('mismo plato en el mismo sitio suma plus y se reporta', () => {
        const own = [{ placeId: 'p1', itemName: 'Regina Rossa', overallRating: 9 }];
        const other = [{ placeId: 'p1', itemName: 'regina rossa', overallRating: 9 }];
        const result = computeTasteMatch(own, other);
        expect(result!.sharedItems).toBe(1);
        expect(result!.reason).toContain('plato');
    });

    it('notas opuestas en lo común dan score bajo', () => {
        const own = [{ placeId: 'p1', overallRating: 9.5 }, { placeId: 'p2', overallRating: 9 }];
        const other = [{ placeId: 'p1', overallRating: 2 }, { placeId: 'p2', overallRating: 3 }];
        const result = computeTasteMatch(own, other);
        expect(result === null || result.score < 30).toBe(true);
    });
});
