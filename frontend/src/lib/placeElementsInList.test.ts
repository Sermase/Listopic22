import { describe, expect, it } from 'vitest';
import { placeElementsInList } from './placeElementsInList';

describe('placeElementsInList', () => {
    const reviews = [
        { placeId: 'bar-1', itemName: 'Tortilla de patata' },
        { placeId: 'bar-1', itemName: 'tortilla de patata' },
        { placeId: 'bar-1', itemName: 'Tortilla de Patata!' },
        { placeId: 'bar-1', itemName: 'Tortilla con cebolla' },
        { placeId: 'bar-2', itemName: 'Croquetas' },
        { placeId: 'bar-1', itemName: '  ' },
    ];

    it('agrupa los nombres equivalentes del sitio y ordena por reseñas', () => {
        expect(placeElementsInList(reviews, 'bar-1')).toEqual([
            { name: 'Tortilla de patata', count: 3 },
            { name: 'Tortilla con cebolla', count: 1 },
        ]);
    });

    it('sin reseñas del sitio no hay opciones', () => {
        expect(placeElementsInList(reviews, 'bar-9')).toEqual([]);
    });

    it('en una Minilista solo cuentan las suyas', () => {
        const nested = [
            { placeId: 'bar-1', itemName: 'Tortilla', sublistId: 'mini' },
            { placeId: 'bar-1', itemName: 'Bravas', sublistId: 'otra' },
        ];
        expect(placeElementsInList(nested, 'bar-1', 'mini')).toEqual([{ name: 'Tortilla', count: 1 }]);
    });
});
