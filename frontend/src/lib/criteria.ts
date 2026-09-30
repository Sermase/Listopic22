/**
 * Orden estable de los criterios de una lista. Se guardan como mapa
 * (id → definición) y un mapa no conserva el orden, así que desde ahora cada
 * criterio lleva `order`. Los antiguos, sin `order`, van detrás por nombre.
 */
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

interface OrderableCriterion {
    label?: string;
    order?: number;
}

export function compareCriteria(idA: string, a: OrderableCriterion | null | undefined, idB: string, b: OrderableCriterion | null | undefined): number {
    const orderA = typeof a?.order === 'number' ? a.order : null;
    const orderB = typeof b?.order === 'number' ? b.order : null;
    if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB;
    if (orderA !== null && orderB === null) return -1;
    if (orderA === null && orderB !== null) return 1;
    return collator.compare(a?.label || idA, b?.label || idB);
}

export function orderedCriteriaEntries<T extends OrderableCriterion>(
    definition: Record<string, T> | null | undefined,
): Array<[string, T]> {
    if (!definition || typeof definition !== 'object') return [];
    return Object.entries(definition)
        .filter(([, value]) => !!value && typeof value === 'object')
        .sort(([idA, a], [idB, b]) => compareCriteria(idA, a, idB, b));
}
