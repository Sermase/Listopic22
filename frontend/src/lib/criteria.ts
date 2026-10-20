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

interface WeightedCriterion {
    id: string;
    isPonderable: boolean;
    /** 0 no cuenta; 0,5–3 cuenta esa proporción. */
    weight?: number;
}

/** «×1,5»; el 0 se lee «No cuenta». */
export const formatWeight = (weight: number): string =>
    weight > 0 ? `×${String(weight).replace('.', ',')}` : 'No cuenta';

/** Pesos que se pueden elegir: 0, 0,5, 1 … 3. */
export const WEIGHT_OPTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((value) => ({ value, label: formatWeight(value) }));

/** Peso de un criterio del formulario: el elegido o, si no hay, 1 si cuenta y 0 si no. */
export const criterionWeightOf = (criterion: Pick<WeightedCriterion, 'isPonderable' | 'weight'>): number =>
    typeof criterion.weight === 'number' ? criterion.weight : (criterion.isPonderable ? 1 : 0);

/** `scoringWeights` a partir de los criterios del formulario. */
export function weightsFromCriteria(criteria: ReadonlyArray<WeightedCriterion>): Record<string, number> {
    return Object.fromEntries(criteria.map((c) => [c.id, criterionWeightOf(c)]));
}
