import { describe, expect, it } from 'vitest';
import { matchingAllergens, splitByAllergens, userAllergens } from './allergens';

describe('allergens', () => {
    it('sin gluten cuenta como alérgeno, sin repetir', () => {
        expect(userAllergens({ glutenFree: true, allergens: ['huevo', 'gluten'] })).toEqual(['gluten', 'huevo']);
        expect(userAllergens({ glutenFree: false, allergens: [] })).toEqual([]);
    });

    it('separa aptos, los que lo llevan y los sin indicar', () => {
        const dishes = [
            { name: 'Bravas', allergens: ['sulfitos'] },
            { name: 'Croquetas', allergens: ['gluten', 'lacteos'] },
            { name: 'Ensalada', allergens: [] },
        ];
        const { safe, contains, unknown } = splitByAllergens(dishes, ['gluten']);
        expect(safe.map((d) => d.name)).toEqual(['Bravas']);
        expect(contains.map((d) => d.name)).toEqual(['Croquetas']);
        expect(unknown.map((d) => d.name)).toEqual(['Ensalada']);
        expect(matchingAllergens(dishes[1], ['lacteos', 'huevo'])).toEqual(['lacteos']);
    });
});
