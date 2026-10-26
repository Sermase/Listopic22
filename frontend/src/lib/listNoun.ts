/** Categoría de comida («Hmm...»): sus elementos son platos. */
export const FOOD_CATEGORY_ID = 'comida_hmm';

/**
 * Cómo se llama lo que hay en una Lista: platos en las de comida (y en las
 * antiguas sin categoría, que son de comida) y sitios en el resto (Playas…)
 * o cuando se agrupa por sitio.
 */
export function listItemNoun(categoryId: string | null | undefined, count: number, grouping: 'dish' | 'place' = 'dish'): string {
    const isPlace = grouping === 'place' || (!!categoryId && categoryId !== FOOD_CATEGORY_ID);
    if (isPlace) return count === 1 ? 'sitio' : 'sitios';
    return count === 1 ? 'plato' : 'platos';
}
