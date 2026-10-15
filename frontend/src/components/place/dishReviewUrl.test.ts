import { describe, expect, it } from 'vitest';
import { dishReviewUrl } from './dishReviewUrl';

const parse = (url: string) => new URLSearchParams(url.split('?')[1]);

describe('dishReviewUrl', () => {
    it('fija sitio, plato y lista', () => {
        const url = dishReviewUrl('P1', 'Patatas bravas', 'L9');
        expect(url.startsWith('/create-review?')).toBe(true);
        const q = parse(url);
        expect(q.get('placeId')).toBe('P1');
        expect(q.get('itemName')).toBe('Patatas bravas');
        expect(q.get('listId')).toBe('L9');
    });

    it('omite la lista cuando no se conoce', () => {
        expect(parse(dishReviewUrl('P1', 'Tortilla', undefined)).has('listId')).toBe(false);
        expect(parse(dishReviewUrl('P1', 'Tortilla', null)).has('listId')).toBe(false);
        expect(parse(dishReviewUrl('P1', 'Tortilla', '  ')).has('listId')).toBe(false);
    });

    it('codifica nombres con caracteres especiales y recorta espacios', () => {
        const q = parse(dishReviewUrl('P1', '  Café & tarta 50%? ', 'L'));
        expect(q.get('itemName')).toBe('Café & tarta 50%?');
    });
});
