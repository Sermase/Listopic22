import { describe, expect, it } from 'vitest';
import { findSameElementReview, groupDuplicateReviews, reviewSlotKey } from './reviewUniqueness';

const base = { userId: 'u1', listId: 'L', placeId: 'P', itemName: 'Bravas', visibility: 'public' };

describe('reviewSlotKey', () => {
    it('iguala nombres con tildes, mayúsculas y signos', () => {
        expect(reviewSlotKey(base)).toBe(reviewSlotKey({ ...base, itemName: ' bravás! ' }));
    });

    it('las públicas de lista y Minilista pública comparten hueco', () => {
        expect(reviewSlotKey(base)).toBe(reviewSlotKey({ ...base, sublistId: 'S' }));
    });

    it('cada Minilista privada es un hueco aparte', () => {
        const a = reviewSlotKey({ ...base, visibility: 'private', sublistId: 'S1' });
        const b = reviewSlotKey({ ...base, visibility: 'private', sublistId: 'S2' });
        expect(a).not.toBe(b);
        expect(a).not.toBe(reviewSlotKey(base));
    });

    it('sin sitio o sin plato no hay clave', () => {
        expect(reviewSlotKey({ ...base, placeId: 'unknown' })).toBeNull();
        expect(reviewSlotKey({ ...base, itemName: '  ' })).toBeNull();
    });
});

describe('findSameElementReview', () => {
    const own = [
        { ...base, id: 'r1' },
        { ...base, id: 'r2', itemName: 'Tortilla' },
    ];

    it('encuentra la reseña que ya ocupa el hueco', () => {
        expect(findSameElementReview({ ...base, itemName: 'BRAVAS' }, own)?.id).toBe('r1');
    });

    it('no cuenta la que se está editando', () => {
        expect(findSameElementReview(base, own, 'r1')).toBeNull();
    });

    it('otro autor no choca', () => {
        expect(findSameElementReview({ ...base, userId: 'u2' }, own)).toBeNull();
    });
});

describe('groupDuplicateReviews', () => {
    it('agrupa solo los huecos repetidos', () => {
        const groups = groupDuplicateReviews([
            { ...base, id: 'a' },
            { ...base, id: 'b', itemName: 'bravas' },
            { ...base, id: 'c', itemName: 'Tortilla' },
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].reviews.map((r) => r.id)).toEqual(['a', 'b']);
    });
});
