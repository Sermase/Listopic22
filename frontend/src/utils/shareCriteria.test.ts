import { describe, it, expect } from 'vitest';
import { buildCriteriaStats, buildShareCriteriaGroups } from './shareCriteria';

describe('buildCriteriaStats', () => {
    it('returns empty array when scores is undefined', () => {
        expect(buildCriteriaStats(undefined)).toEqual([]);
    });

    it('returns empty array when scores is empty', () => {
        expect(buildCriteriaStats({})).toEqual([]);
    });

    it('maps scores to stats with key and score', () => {
        const result = buildCriteriaStats({ ambiente: 8, comida: 9 });
        expect(result).toHaveLength(2);
        expect(result.find(s => s.key === 'ambiente')?.score).toBe(8);
    });

    it('uses key as label when no definition provided', () => {
        const result = buildCriteriaStats({ comida: 7 });
        expect(result[0].label).toBe('comida');
    });

    it('uses label from array definition', () => {
        const definition = [{ id: 'comida', label: 'Calidad de la comida' }];
        const result = buildCriteriaStats({ comida: 7 }, definition);
        expect(result[0].label).toBe('Calidad de la comida');
    });

    it('uses label from record definition', () => {
        const definition = { comida: { label: 'Calidad de la comida' } };
        const result = buildCriteriaStats({ comida: 7 }, definition);
        expect(result[0].label).toBe('Calidad de la comida');
    });

    it('clamps scores to [0, 10]', () => {
        const result = buildCriteriaStats({ bueno: 15, malo: -3 });
        expect(result.find(s => s.key === 'bueno')?.score).toBe(10);
        expect(result.find(s => s.key === 'malo')?.score).toBe(0);
    });

    it('respects the limit parameter', () => {
        const scores = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
        expect(buildCriteriaStats(scores, undefined, 3)).toHaveLength(3);
    });

    it('defaults limit to 6', () => {
        const scores = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
        expect(buildCriteriaStats(scores)).toHaveLength(6);
    });

    it('respects ordering from array definition', () => {
        const definition = [
            { id: 'z', label: 'Último' },
            { id: 'a', label: 'Primero' },
        ];
        const result = buildCriteriaStats({ a: 5, z: 5 }, definition);
        expect(result[0].key).toBe('z');
        expect(result[1].key).toBe('a');
    });

    it('filters out non-finite scores', () => {
        const result = buildCriteriaStats({ bueno: NaN, malo: Infinity, ok: 5 });
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('ok');
    });
});

describe('buildShareCriteriaGroups', () => {
    it('separates ponderable criteria from circular extras', () => {
        const definition = {
            comida: { label: 'Comida', ponderable: true },
            ruido: { label: 'Ruido', ponderable: false },
            terraza: { label: 'Terraza', isPonderable: false },
        };

        const result = buildShareCriteriaGroups({ comida: 9, ruido: 4, terraza: 8 }, definition);

        expect(result.ponderable.map((item) => item.key)).toEqual(['comida']);
        expect(result.nonPonderable.map((item) => item.key)).toEqual(['ruido', 'terraza']);
    });

    it('treats criteria without an explicit flag as ponderable', () => {
        const result = buildShareCriteriaGroups({ ambiente: 7 }, { ambiente: { label: 'Ambiente' } });
        expect(result.ponderable).toHaveLength(1);
        expect(result.nonPonderable).toEqual([]);
    });
});
