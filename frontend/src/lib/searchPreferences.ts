import type { UxPreferences } from '../context/PreferencesContext';

/**
 * «Mis preferencias» en Buscar. Lo del plato (sin gluten en Elementos) filtra de
 * verdad; lo del sitio (sin gluten, movilidad, mascotas) solo sube primero lo que
 * consta, porque casi ningún sitio tiene esos datos y si no la búsqueda se vacía.
 * Vegetariano y vegano no tienen campo en Algolia: aquí no hacen nada.
 */
export interface SearchPreferenceRule {
    key: keyof UxPreferences;
    label: string;
    /** Filtro estricto de Algolia. */
    filter?: string;
    /** optionalFilters de Algolia: sube, no quita. */
    optional?: string[];
}

export function searchPreferenceRules(prefs: UxPreferences, tab: string): SearchPreferenceRule[] {
    if (tab !== 'items' && tab !== 'places') return [];
    const rules: SearchPreferenceRule[] = [];
    if (prefs.glutenFree) {
        rules.push(tab === 'items'
            ? { key: 'glutenFree', label: '🌾 Sin gluten', filter: 'isGlutenFree:true' }
            : { key: 'glutenFree', label: '🌾 Sin gluten primero', optional: ['isGlutenFree:true'] });
    }
    if (prefs.stepFree) rules.push({ key: 'stepFree', label: '♿ Sin escalones primero', optional: ['accessibilityOptions:wheelchairAccessibleEntrance'] });
    if (prefs.accessibleRestroom) rules.push({ key: 'accessibleRestroom', label: '♿ Baño adaptado primero', optional: ['accessibilityOptions:wheelchairAccessibleRestroom'] });
    if (prefs.petFriendly) rules.push({ key: 'petFriendly', label: '🐾 Con mascotas primero', optional: ['petOptions:petFriendly', 'petOptions:allowsDogs'] });
    return rules;
}
