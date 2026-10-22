import { describe, expect, it } from 'vitest';
import { groupTagVariants } from './tagVariants';

describe('groupTagVariants', () => {
    it('agrupa las formas de una misma etiqueta, la más usada primero', () => {
        const groups = groupTagVariants([
            { availableTags: ['🚫🌾 Sin gluten', '🥕 Vegetariano'] },
            { availableTags: ['🚫🌾 Sin gluten'] },
            { availableTags: ['🚫 🌾 Sin gluten', 'Picante'] },
            { availableTags: 'roto' },
        ]);
        expect(groups).toEqual([{
            key: 'sin gluten',
            variants: [{ tag: '🚫🌾 Sin gluten', lists: 2 }, { tag: '🚫 🌾 Sin gluten', lists: 1 }],
        }]);
    });
});
