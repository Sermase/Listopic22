import { describe, expect, it } from 'vitest';
import { followMergedItem, itemDocIdFromName, itemNameKey, resolvePlaceItemByName, reviewItemId, type PlaceItemLike } from './placeItems';

const croqueta: PlaceItemLike = {
    id: 'croqueta-prueba-1',
    canonicalName: 'Croqueta, la original',
    status: 'active',
    source: 'business',
    curatedAliasesNormalized: ['croqueta prueba 1', 'croqueta la original'],
    aliasesNormalized: ['1', 'croqueta prueba 1', 'croqueta la original'],
    stats: { reviewCount: 1 },
};

describe('placeItems', () => {
    it('itemDocIdFromName y itemNameKey usan la normalización de las Listas', () => {
        expect(itemDocIdFromName('Croqueta, la original')).toBe('croqueta-la-original');
        expect(itemDocIdFromName('🍺')).toBe('sin-nombre');
        expect(itemNameKey('  Bravás! ')).toBe('bravas');
        expect(itemNameKey('寿司')).toBe('寿司');
    });

    it('reviewItemId respeta los enlaces antiguos y suelta el sellado si el autor cambia el nombre', () => {
        expect(reviewItemId({ itemName: '1', canonicalItemId: 'croqueta-prueba-1' })).toBe('croqueta-prueba-1');
        expect(reviewItemId({ itemName: 'Croqueta, la original', canonicalItemId: 'croqueta-prueba-1', canonicalItemFor: 'croqueta la original' }))
            .toBe('croqueta-prueba-1');
        expect(reviewItemId({ itemName: 'Bravas', canonicalItemId: 'croqueta-prueba-1', canonicalItemFor: 'croqueta la original' }))
            .toBe('bravas');
        expect(reviewItemId({ itemName: 'Patatas bravas' })).toBe('patatas-bravas');
    });

    it('resuelve el nombre nuevo, el antiguo y el escrito en una reseña movida', () => {
        const items = [croqueta, { id: 'bravas', canonicalName: 'Bravas', status: 'active' }];
        expect(resolvePlaceItemByName(items, 'Croqueta, la original')?.id).toBe('croqueta-prueba-1');
        expect(resolvePlaceItemByName(items, 'croqueta PRUEBA 1')?.id).toBe('croqueta-prueba-1');
        expect(resolvePlaceItemByName(items, '1')?.id).toBe('croqueta-prueba-1');
        expect(resolvePlaceItemByName(items, 'Tortilla')).toBeNull();
        expect(resolvePlaceItemByName(items, '🍺')).toBeNull();
    });

    it('sigue las fusiones y no se queda en un elemento inactivo', () => {
        const items: PlaceItemLike[] = [
            { id: 'regina-rosa', canonicalName: 'Reggina rosa', status: 'inactive', mergedInto: 'regina-rossa' },
            { id: 'regina-rossa', canonicalName: 'Regina rossa', status: 'active' },
            { id: 'huerfano', canonicalName: 'Huérfano', status: 'inactive', mergedInto: 'no-existe' },
        ];
        expect(resolvePlaceItemByName(items, 'Reggina rosa')?.id).toBe('regina-rossa');
        expect(resolvePlaceItemByName(items, 'Huérfano')).toBeNull();
    });

    it('el alias curado gana al nombre escrito en reseñas de otro elemento', () => {
        const items: PlaceItemLike[] = [
            { id: 'croqueta-la-original', canonicalName: 'Croqueta la original', status: 'active', source: 'community', aliasesNormalized: ['croqueta la original'], stats: { reviewCount: 3 } },
            croqueta,
        ];
        // Los dos lo reclaman como nombre o alias curado: gana el del negocio.
        expect(resolvePlaceItemByName(items, 'Croqueta, la original')?.id).toBe('croqueta-prueba-1');
    });

    it('followMergedItem corta los ciclos', () => {
        const a: PlaceItemLike = { id: 'a', status: 'inactive', mergedInto: 'b' };
        const b: PlaceItemLike = { id: 'b', status: 'inactive', mergedInto: 'a' };
        const map = new Map([[a.id, a], [b.id, b]]);
        expect(followMergedItem(a, map)).toBeNull();
    });
});
