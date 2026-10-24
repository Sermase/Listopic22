import { describe, expect, it } from 'vitest';
import { searchPreferenceRules } from './searchPreferences';
import type { UxPreferences } from '../context/PreferencesContext';

const base: UxPreferences = {
    glutenFree: false, lactoseFree: false, vegetarian: false, vegan: false, allergens: [],
    stepFree: false, accessibleRestroom: false, petFriendly: false, contribute: [], showHelpTips: true,
};

describe('searchPreferenceRules', () => {
    it('no hace nada sin preferencias ni fuera de Elementos y Sitios', () => {
        expect(searchPreferenceRules(base, 'items')).toEqual([]);
        expect(searchPreferenceRules({ ...base, glutenFree: true }, 'lists')).toEqual([]);
    });

    it('sin gluten filtra platos y solo ordena sitios', () => {
        expect(searchPreferenceRules({ ...base, glutenFree: true }, 'items')[0].filter).toBe('isGlutenFree:true');
        const place = searchPreferenceRules({ ...base, glutenFree: true }, 'places')[0];
        expect(place.filter).toBeUndefined();
        expect(place.optional).toEqual(['isGlutenFree:true']);
    });

    it('movilidad y mascotas nunca quitan resultados', () => {
        const rules = searchPreferenceRules({ ...base, stepFree: true, accessibleRestroom: true, petFriendly: true }, 'places');
        expect(rules).toHaveLength(3);
        expect(rules.every((rule) => !rule.filter && rule.optional?.length)).toBe(true);
    });
});
