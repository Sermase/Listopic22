/**
 * Elementos que un sitio ya tiene en una lista («Tortilla de patata» en el
 * bar X dentro de «Tortillas»), para elegir uno al valorar en vez de teclearlo.
 */
import { itemNameKey } from './placeItems';

export interface PlaceElementOption {
    name: string;
    count: number;
}

interface ReviewForOptions {
    placeId?: unknown;
    itemName?: unknown;
    sublistId?: unknown;
}

/**
 * Agrupa por nombre comparable («Bravas» = «bravás!») y ordena por número de
 * valoraciones. Se queda con la forma más repetida del nombre (a igualdad, la
 * primera que aparece).
 * Con `sublistId` solo cuentan las reseñas de esa Minilista.
 */
export function placeElementsInList(
    reviews: readonly ReviewForOptions[],
    placeId: string,
    sublistId?: string | null,
): PlaceElementOption[] {
    const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
    reviews.forEach((review) => {
        if (review.placeId !== placeId) return;
        if (sublistId && review.sublistId !== sublistId) return;
        const name = typeof review.itemName === 'string' ? review.itemName.trim() : '';
        if (!name) return;
        const key = itemNameKey(name);
        const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
        group.count += 1;
        group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
        groups.set(key, group);
    });
    return Array.from(groups.values())
        .map((group) => ({
            name: Array.from(group.spellings.entries()).sort((a, b) => b[1] - a[1])[0][0],
            count: group.count,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}
