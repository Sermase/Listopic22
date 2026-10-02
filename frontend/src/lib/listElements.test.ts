import { describe, expect, it } from 'vitest';
import { elementKey, rankListElements } from './listElements';

const vll = { placeCity: 'Valladolid', placeProvince: 'Valladolid', placeRegion: 'Castilla y León', placeCountry: 'España' };
const list = { criteriaDefinition: { sabor: {} }, parentListId: null, scoringWeights: { sabor: 1 } };

const review = (placeId: string, itemName: string, overallRating: number, extra: Record<string, unknown> = {}) => ({
    placeId, itemName, overallRating, userId: 'u', scores: { sabor: overallRating }, ...vll, ...extra,
});

describe('rankListElements', () => {
    it('misma clave de agrupación que la Lista', () => {
        expect(elementKey({ placeId: 'p1', itemName: ' Toma-té ' }, 'dish')).toBe('p1_toma te');
        expect(elementKey({ placeId: 'p1', itemName: 'TOMATE' }, 'dish')).not.toBe(elementKey({ placeId: 'p2', itemName: 'tomate' }, 'dish'));
        expect(elementKey({ placeId: 'p1', itemName: 'X' }, 'place')).toBe('p1');
    });

    it('agrupa, promedia y ordena con la fórmula única; puesto por ciudad', () => {
        const ranked = rankListElements([
            review('p1', 'Croqueta', 9), review('p1', 'Croqueta', 9), review('p1', 'Croqueta', 9),
            review('p2', 'Tortilla', 10),
            review('p3', 'Bravas', 8), review('p3', 'Bravas', 8),
        ], list);
        // Croqueta 9×3 → 8,0 · Tortilla 10×1 → 7,75 · Bravas 8×2 → 7,4
        expect(ranked.map((e) => e.itemName)).toEqual(['Croqueta', 'Tortilla', 'Bravas']);
        expect(ranked[0]).toMatchObject({ average: 9, count: 3, rank: 1 });
        expect(ranked[2].contextRanks.find((r) => r.level === 'city')!.label).toBe('#3 en Valladolid');
    });

    it('como la Lista por defecto: sin bots ni sitios cerrados', () => {
        const ranked = rankListElements([
            review('p1', 'A', 9, { userId: 'bot1' }),
            review('p2', 'B', 8, { placeClosedStatus: 'CLOSED_PERMANENTLY' }),
            review('p3', 'C', 7),
        ], list, { excludeAuthorIds: new Set(['bot1']) });
        expect(ranked.map((e) => e.itemName)).toEqual(['C']);
    });

    it('en la madre, la valoración de Minilista cuenta sin sus criterios propios', () => {
        const ranked = rankListElements([
            { ...review('p1', 'A', 8), sublistId: 'mini', scores: { sabor: 6, relleno: 10 } },
        ], list);
        expect(ranked[0].average).toBe(6);
    });
});
