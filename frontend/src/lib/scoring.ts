/**
 * Cálculo de notas de Listopic: una sola fuente para toda la app.
 *
 * - Nota de una valoración: media de los criterios que cuentan para la nota,
 *   redondeada a 1 decimal (igual que se ha guardado siempre `overallRating`).
 * - Lista madre: solo se compara con SUS criterios. Una valoración hecha desde
 *   una Minilista puede tener criterios extra; para la madre no cuentan.
 * - Minilista: usa todos sus criterios (los heredados + los suyos).
 * - Pesos: la fuente de verdad es `scoringWeights` de la lista (id → 0..3).
 *   ×0 no cuenta; ×1, ×2 y ×3 cuentan esas veces. Si una lista antigua no tiene
 *   `scoringWeights`, se usa `ponderable` (×1 / ×0).
 * - Un criterio sin puntuar en una valoración (p. ej. porque se añadió después)
 *   no cuenta para la media de esa valoración.
 * - Ranking: una sola fórmula bayesiana para toda la app (`rankPosition`).
 *
 * Espejo en servidor: functions/modules/lib/scoring.js (mismos vectores de test).
 */

export const SCORE_MIN = 0;
export const SCORE_MAX = 10;
export const MAX_CRITERION_WEIGHT = 3;

/**
 * Pesos ×0–×3 activos. En listas con valoraciones solo cambian con la migración
 * del servidor (simular → aplicar). Poner false vuelve a «cuenta = ×1».
 */
export const WEIGHTS_ENABLED = true;

export interface ScoringCriterion {
    id: string;
    ponderable?: boolean;
    isPonderable?: boolean;
    /** Peso 0–3 en la propia definición (si la lista no trae `scoringWeights`). */
    weight?: number;
}

type CriterionFields = Omit<ScoringCriterion, 'id'> & { id?: string };
export type CriteriaInput =
    | ReadonlyArray<CriterionFields>
    | Readonly<Record<string, CriterionFields | null | undefined>>
    | null
    | undefined;

export type ScoresInput = Readonly<Record<string, unknown>> | null | undefined;

export interface ScoringOptions {
    /** Usa ×2/×3. Por defecto WEIGHTS_ENABLED; con false cualquier peso > 0 cuenta ×1. */
    useWeights?: boolean;
    /** `scoringWeights` de la lista (id → 0..3). Si trae el criterio, manda sobre `ponderable`. */
    weights?: Readonly<Record<string, unknown>> | null;
}

export type ScoringWeights = Record<string, number>;

export interface ReviewScoreResult {
    /** Nota 0–10 con 1 decimal, o null si no hay ningún criterio que cuente puntuado. */
    score: number | null;
    /** Todos los criterios que cuentan están puntuados. */
    complete: boolean;
    scoredCount: number;
    requiredCount: number;
    /** Ids de criterios que cuentan y siguen sin puntuar. */
    missing: string[];
}

export interface ReviewLike {
    overallRating?: unknown;
    scores?: ScoresInput;
    sublistId?: unknown;
}

export interface ListScoreResult {
    score: number | null;
    /** 'criteria': recalculada con los criterios de la lista; 'stored': overallRating guardado. */
    source: 'criteria' | 'stored' | 'none';
    /** Solo una parte de los criterios de la lista estaba puntuada en la valoración. */
    partial: boolean;
}

export const roundToTenth = (value: number): number => Number(value.toFixed(1));

export const isScoreValue = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Acepta el formato guardado (mapa id → definición) y el antiguo (array con id). */
export function normalizeCriteria(criteria: CriteriaInput): ScoringCriterion[] {
    if (!criteria) return [];
    if (Array.isArray(criteria)) {
        return criteria
            .filter((c): c is CriterionFields & { id: string } => !!c && typeof c.id === 'string' && c.id.length > 0)
            .map((c) => ({ ...c, id: c.id }));
    }
    return Object.entries(criteria as Record<string, CriterionFields | null | undefined>)
        .filter(([, def]) => !!def && typeof def === 'object')
        .map(([id, def]) => ({ ...(def as CriterionFields), id }));
}

const clampWeight = (value: number): number => Math.min(MAX_CRITERION_WEIGHT, Math.max(0, Math.round(value)));

/** Peso efectivo: 0 = no cuenta para la nota. Sin ponderaciones activas solo existe 0 o 1. */
export function criterionWeight(criterion: CriterionFields, options: ScoringOptions = {}): number {
    const useWeights = options.useWeights ?? WEIGHTS_ENABLED;
    const listWeight = criterion.id ? options.weights?.[criterion.id] : undefined;
    if (isScoreValue(listWeight)) {
        const weight = clampWeight(listWeight);
        return useWeights ? weight : (weight > 0 ? 1 : 0);
    }
    if (criterion.ponderable === false || criterion.isPonderable === false) return 0;
    if (useWeights && isScoreValue(criterion.weight)) return clampWeight(criterion.weight);
    return 1;
}

/**
 * `scoringWeights` a partir de los criterios: ×1 lo que cuenta, ×0 lo que no.
 * Es lo que se guarda al crear o editar una lista y lo que rellena el script de backfill.
 */
export function deriveScoringWeights(criteria: CriteriaInput, existing?: Readonly<Record<string, unknown>> | null): ScoringWeights {
    const weights: ScoringWeights = {};
    normalizeCriteria(criteria).forEach((criterion) => {
        const previous = existing?.[criterion.id];
        weights[criterion.id] = isScoreValue(previous)
            ? clampWeight(previous)
            : (criterion.ponderable === false || criterion.isPonderable === false ? 0 : 1);
    });
    return weights;
}

export const isComputingCriterion = (criterion: CriterionFields, options: ScoringOptions = {}): boolean =>
    criterionWeight(criterion, options) > 0;

export function computingCriteria(criteria: CriteriaInput, options: ScoringOptions = {}): ScoringCriterion[] {
    return normalizeCriteria(criteria).filter((c) => isComputingCriterion(c, options));
}

/**
 * Nota de una valoración con los criterios dados. Con los criterios de siempre
 * (todos ×1) da exactamente el mismo número que se guardaba en `overallRating`.
 */
export function computeReviewScore(
    scores: ScoresInput,
    criteria: CriteriaInput,
    options: ScoringOptions = {},
): ReviewScoreResult {
    const required = computingCriteria(criteria, options);
    let weightedTotal = 0;
    let weightSum = 0;
    let scoredCount = 0;
    const missing: string[] = [];

    required.forEach((criterion) => {
        const value = scores?.[criterion.id];
        if (!isScoreValue(value)) {
            missing.push(criterion.id);
            return;
        }
        const weight = criterionWeight(criterion, options);
        weightedTotal += value * weight;
        weightSum += weight;
        scoredCount += 1;
    });

    return {
        score: weightSum > 0 ? roundToTenth(weightedTotal / weightSum) : null,
        complete: required.length > 0 && missing.length === 0,
        scoredCount,
        requiredCount: required.length,
        missing,
    };
}

/** Criterios de la Minilista = heredados de la madre + los suyos (los suyos no pisan a los heredados). */
export function mergeMinilistCriteria(parentCriteria: CriteriaInput, ownCriteria: CriteriaInput): ScoringCriterion[] {
    const merged = new Map<string, ScoringCriterion>();
    normalizeCriteria(parentCriteria).forEach((c) => merged.set(c.id, c));
    normalizeCriteria(ownCriteria).forEach((c) => {
        if (!merged.has(c.id)) merged.set(c.id, c);
    });
    return Array.from(merged.values());
}

const storedOverall = (review: ReviewLike): number | null =>
    isScoreValue(review.overallRating) ? review.overallRating : null;

/**
 * Nota de una valoración vista desde una Lista (madre).
 *
 * - Valoración hecha en la propia lista: su `overallRating` guardado, tal cual
 *   (así no cambia ningún resultado aunque el creador haya editado criterios).
 * - Valoración hecha desde una Minilista: se recalcula solo con los criterios
 *   de la madre que tenga puntuados, para que los criterios extra no alteren la
 *   comparación. Si no comparte ninguno, se usa el `overallRating` guardado.
 */
export function reviewScoreForParentList(
    review: ReviewLike,
    parentCriteria: CriteriaInput,
    options: ScoringOptions = {},
): ListScoreResult {
    const stored = storedOverall(review);
    const fromMinilist = typeof review.sublistId === 'string' && review.sublistId.length > 0;
    if (fromMinilist) {
        const result = computeReviewScore(review.scores, parentCriteria, options);
        if (result.score !== null) {
            return { score: result.score, source: 'criteria', partial: !result.complete };
        }
    }
    return { score: stored, source: stored === null ? 'none' : 'stored', partial: false };
}

/** Nota de una valoración dentro de su Minilista: la guardada (incluye los criterios extra). */
export function reviewScoreForMinilist(review: ReviewLike): ListScoreResult {
    const stored = storedOverall(review);
    return { score: stored, source: stored === null ? 'none' : 'stored', partial: false };
}

/** Nota de una valoración según la lista que se está mirando. */
export function reviewScoreForList(
    review: ReviewLike,
    list: { criteriaDefinition?: CriteriaInput; parentListId?: unknown; scoringWeights?: Readonly<Record<string, unknown>> | null } | null | undefined,
    options: ScoringOptions = {},
): ListScoreResult {
    const isMinilist = typeof list?.parentListId === 'string' && list.parentListId.length > 0;
    return isMinilist
        ? reviewScoreForMinilist(review)
        : reviewScoreForParentList(review, list?.criteriaDefinition, { weights: list?.scoringWeights, ...options });
}

/** Media simple sin redondear (el redondeo es cosa de quien la muestra). */
export function averageScore(values: ReadonlyArray<number | null | undefined>): number | null {
    const valid = values.filter(isScoreValue);
    if (valid.length === 0) return null;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

// --- Ranking único ------------------------------------------------------------
// Una sola fórmula para ordenar por nota en toda la app (Lista, Home, Sitio,
// búsqueda). Se MUESTRA siempre la media real; esta posición solo ordena.
// Espejo exacto en functions/modules/lib/scoring.js.
//
//   posición = (n · media + m · C) / (n + m),   m = 3,   C = 7
//
//   m = 3: con m = 2 un 10 con 1 valoración empata con un 8,5 con 10.
//   C fijo en 7 (no la media de cada lista): con C = media de una lista
//   exigente (8) un 10 con 1 valoración volvía a encabezar. Mostrar siempre la
//   media real; este número solo ordena.

export const RANK_PRIOR_WEIGHT = 3;
export const RANK_PRIOR = 7;

const safeNumber = (value: unknown): number => (isScoreValue(value) ? value : 0);

/** Posición bayesiana de un elemento. Sin valoraciones → 0 (va al final). */
export function rankPosition(
    average: unknown,
    count: unknown,
    prior: number = RANK_PRIOR,
    priorWeight: number = RANK_PRIOR_WEIGHT,
): number {
    const n = Math.max(0, safeNumber(count));
    if (n <= 0) return 0;
    const rating = Math.max(SCORE_MIN, Math.min(SCORE_MAX, safeNumber(average)));
    return ((rating * n) + (prior * priorWeight)) / (n + priorWeight);
}

export interface RankableStats {
    average: unknown;
    count: unknown;
}

/** Comparador para `.sort`: mejor posición primero; a igualdad, más valoraciones. */
export function compareByRank(a: RankableStats, b: RankableStats): number {
    const diff = rankPosition(b.average, b.count) - rankPosition(a.average, a.count);
    if (diff !== 0) return diff;
    return safeNumber(b.count) - safeNumber(a.count);
}

/** Valor guardado en Algolia como `rankingScore` (4 decimales). */
export const rankingIndexScore = (average: unknown, count: unknown): number =>
    Number(rankPosition(average, count).toFixed(4));

export interface RankedStats extends RankableStats {
    id: string;
}

/**
 * Orden de los elementos de una Lista, el mismo en la Lista, la ficha y Buscar:
 * posición con 4 decimales (lo que guarda Algolia), luego más valoraciones y,
 * si todo empata, la clave del elemento. Sin empates, el puesto no depende de
 * qué valoración llegó antes ni del orden interno de Algolia.
 */
export function compareElementsByRank(a: RankedStats, b: RankedStats): number {
    const diff = rankingIndexScore(b.average, b.count) - rankingIndexScore(a.average, a.count);
    if (diff !== 0) return diff;
    const byCount = safeNumber(b.count) - safeNumber(a.count);
    if (byCount !== 0) return byCount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
