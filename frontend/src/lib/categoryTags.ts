/**
 * Etiquetas fijas de una categoría (campo `fixed-tags` en categories/{id}): en «Hmm...»
 * son Vegetariano, Sin gluten… Van en todas las listas de esa categoría, también en
 * las creadas antes de fijarlas, y no se pueden quitar.
 */

/** Clave para comparar etiquetas: «🚫🌾 Sin gluten» y «sin gluten» son la misma. */
export function tagKey(tag: string): string {
    return tag
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function cleanTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of tags) {
        if (typeof tag !== 'string') continue;
        const trimmed = tag.trim();
        const key = tagKey(trimmed);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
    }
    return out;
}

export function categoryFixedTags(category: unknown): string[] {
    if (!category || typeof category !== 'object') return [];
    return cleanTags((category as Record<string, unknown>)['fixed-tags']);
}

/** Etiquetas de la lista con las fijas de su categoría delante, sin repetir. Si la lista ya
 * tiene su propia versión de una fija (con otro emoji, por ejemplo), se queda la suya. */
export function withCategoryTags(fixed: readonly string[], tags: unknown): string[] {
    const own = cleanTags(tags);
    const locked = lockedCategoryTags(fixed, own);
    const lockedKeys = new Set(locked.map(tagKey));
    return [...locked, ...own.filter((tag) => !lockedKeys.has(tagKey(tag)))];
}

/** La versión que se ve de cada etiqueta fija (la de la lista si la tiene): estas no se quitan. */
export function lockedCategoryTags(fixed: readonly string[], tags: unknown): string[] {
    const ownByKey = new Map(cleanTags(tags).map((tag) => [tagKey(tag), tag]));
    return cleanTags(fixed).map((tag) => ownByKey.get(tagKey(tag)) ?? tag);
}
