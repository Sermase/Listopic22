/**
 * Alérgenos de «Mis preferencias» frente a La Carta del local. Un plato sin
 * alérgenos indicados es «sin indicar», nunca «apto»: el local puede no haberlo rellenado.
 */
export interface AllergenDish {
    allergens: readonly string[];
}

/** Alérgenos que pliegan La Carta: los elegidos y, con «Sin gluten», el gluten. */
export function userAllergens(prefs: { allergens: readonly string[]; glutenFree: boolean }): string[] {
    return Array.from(new Set([...(prefs.glutenFree ? ['gluten'] : []), ...prefs.allergens]));
}

export function matchingAllergens(dish: AllergenDish, selected: readonly string[]): string[] {
    return dish.allergens.filter((allergen) => selected.includes(allergen));
}

export function splitByAllergens<T extends AllergenDish>(dishes: readonly T[], selected: readonly string[]) {
    const safe: T[] = [];
    const contains: T[] = [];
    const unknown: T[] = [];
    dishes.forEach((dish) => {
        if (matchingAllergens(dish, selected).length > 0) contains.push(dish);
        else if (dish.allergens.length === 0) unknown.push(dish);
        else safe.push(dish);
    });
    return { safe, contains, unknown };
}
