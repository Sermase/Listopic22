import { tagKey } from './categoryTags';

/**
 * Etiquetas escritas de varias formas («🚫🌾 Sin gluten», «🚫 🌾 Sin gluten»,
 * «sin gluten»…) en las listas: se agrupan por tagKey para unificarlas.
 */
export interface TagVariantGroup {
    key: string;
    /** Formas distintas, de la más usada a la menos. */
    variants: Array<{ tag: string; lists: number }>;
}

/** Con `all`, también las etiquetas escritas de una sola forma (para quitarlas). */
export function groupTagVariants(lists: Array<{ availableTags?: unknown }>, all = false): TagVariantGroup[] {
    const byKey = new Map<string, Map<string, number>>();
    lists.forEach((list) => {
        const tags = Array.isArray(list.availableTags) ? list.availableTags : [];
        new Set(tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim()))
            .forEach((tag) => {
                const key = tagKey(tag);
                if (!key) return;
                const variants = byKey.get(key) ?? new Map<string, number>();
                variants.set(tag, (variants.get(tag) ?? 0) + 1);
                byKey.set(key, variants);
            });
    });
    return Array.from(byKey.entries())
        .filter(([, variants]) => all || variants.size > 1)
        .map(([key, variants]) => ({
            key,
            variants: Array.from(variants.entries())
                .map(([tag, count]) => ({ tag, lists: count }))
                .sort((a, b) => b.lists - a.lists || a.tag.localeCompare(b.tag)),
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
}
