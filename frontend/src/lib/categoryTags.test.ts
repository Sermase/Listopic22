import { describe, expect, it } from 'vitest';
import { categoryFixedTags, dietFixedTags, isDefaultVegetarian, isMeatTag, listTagsWithDiet, lockedCategoryTags, MEAT_TAG, tagKey, withCategoryTags } from './categoryTags';

const HMM = ['🥕 Vegetariano', '🚫🌾 Sin gluten'];

describe('categoryTags', () => {
    it('tagKey ignora emoji, tildes y mayúsculas', () => {
        expect(tagKey('🚫🌾 Sin gluten')).toBe('sin gluten');
        expect(tagKey('  SIN   GLUTEN ')).toBe('sin gluten');
        expect(tagKey('Opción')).toBe('opcion');
    });

    it('lee las fijas de la categoría', () => {
        expect(categoryFixedTags({ 'fixed-tags': [...HMM, 3, '', '🥕 Vegetariano'] })).toEqual(HMM);
        expect(categoryFixedTags(null)).toEqual([]);
        expect(categoryFixedTags({ 'fixed-tags': 'x' })).toEqual([]);
    });

    it('añade las fijas que faltan delante y respeta la versión de la lista', () => {
        expect(withCategoryTags(HMM, ['Picante', 'sin gluten'])).toEqual(['🥕 Vegetariano', 'sin gluten', 'Picante']);
        expect(withCategoryTags(HMM, undefined)).toEqual(HMM);
        expect(withCategoryTags([], ['A', 'a'])).toEqual(['A']);
    });

    it('las bloqueadas son las versiones que se ven', () => {
        expect(lockedCategoryTags(HMM, ['sin gluten'])).toEqual(['🥕 Vegetariano', 'sin gluten']);
    });
});

describe('dieta por defecto vegetariana', () => {
    it('quita «Vegetariano» y añade «Lleva carne o pescado» fija', () => {
        const fixed = ['🥦 Vegetariano', '🚫🌾 Sin gluten'];
        expect(dietFixedTags(fixed, false)).toEqual(fixed);
        expect(dietFixedTags(fixed, true)).toEqual([MEAT_TAG, '🚫🌾 Sin gluten']);
        expect(listTagsWithDiet(fixed, ['Vegetariano', 'Picante'], true)).toEqual([MEAT_TAG, '🚫🌾 Sin gluten', 'Picante']);
        expect(isMeatTag('lleva carne o pescado')).toBe(true);
        expect(isDefaultVegetarian({ defaultDiet: 'vegetarian' })).toBe(true);
        expect(isDefaultVegetarian({})).toBe(false);
    });
});
