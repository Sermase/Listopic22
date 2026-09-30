/**
 * Cálculo de notas de Listopic: una sola fuente para toda la app.
 *
 * - Nota de una valoración: media de los criterios que cuentan para la nota,
 *   redondeada a 1 decimal (igual que se ha guardado siempre `overallRating`).
 * - Lista madre: solo se compara con SUS criterios. Una valoración hecha desde
 *   una Minilista puede tener criterios extra; para la madre no cuentan.
 * - Minilista: usa todos sus criterios (los heredados + los suyos).
 * - Ponderaciones futuras (×0 a ×3): preparadas, pero APAGADAS por defecto.
 *   Hoy un criterio cuenta ×1 o no cuenta (`ponderable: false`).
 *
 * Espejo en servidor: functions/modules/lib/scoring.js (mismos vectores de test).
 */

export const SCORE_MIN = 0;
export const SCORE_MAX = 10;
export const MAX_CRITERION_WEIGHT = 3;

/** Cambiar a true solo cuando se decida activar ×0–×3 (ver Mejoras/modelo-listopic.md). */
export const WEIGHTS_ENABLED = false;

export interface ScoringCriterion {
    id: string;
    ponderable?: boolean;
    isPonderable?: boolean;
    /** Peso futuro 0–3. Se ignora mientras WEIGHTS_ENABLED sea false. */
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
    useWeights?: boolean;
}

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

/** Peso efectivo: 0 = no cuenta para la nota. Sin ponderaciones activas solo existe 0 o 1. */
export function criterionWeight(criterion: CriterionFields, options: ScoringOptions = {}): number {
    const useWeights = options.useWeights ?? WEIGHTS_ENABLED;
    if (criterion.ponderable === false || criterion.isPonderable === false) return 0;
    if (useWeights && isScoreValue(criterion.weight)) {
        return Math.min(MAX_CRITERION_WEIGHT, Math.max(0, Math.round(criterion.weight)));
    }
    return 1;
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
    list: { criteriaDefinition?: CriteriaInput; parentListId?: unknown } | null | undefined,
    options: ScoringOptions = {},
): ListScoreResult {
    const isMinilist = typeof list?.parentListId === 'string' && list.parentListId.length > 0;
    return isMinilist
        ? reviewScoreForMinilist(review)
        : reviewScoreForParentList(review, list?.criteriaDefinition, options);
}

/** Media simple sin redondear (el redondeo es cosa de quien la muestra). */
export function averageScore(values: ReadonlyArray<number | null | undefined>): number | null {
    const valid = values.filter(isScoreValue);
    if (valid.length === 0) return null;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

// --- Ranking agregado (índice de búsqueda y futura clasificación) ------------
// Idéntico a functions/modules/algolia.js. No cambiar sin actualizar ambos lados.

export const RANKING_PRIOR_AVERAGE = 7;
export const RANKING_PRIOR_WEIGHT = 5;
const RANKING_BAYES_FACTOR = 8;
const RANKING_VOLUME_FACTOR = 4;

// Como en algolia.js: solo números reales; cualquier otra cosa cuenta como 0.
const safeNumber = (value: unknown): number => (isScoreValue(value) ? value : 0);

/** Media bayesiana: con pocas valoraciones la nota se acerca a 7; con muchas, a la media real. */
export function bayesianRating(
    average: unknown,
    count: unknown,
    priorAverage = RANKING_PRIOR_AVERAGE,
    priorWeight = RANKING_PRIOR_WEIGHT,
): number {
    const reviewCount = Math.max(0, safeNumber(count));
    if (reviewCount <= 0) return 0;
    const rating = Math.max(SCORE_MIN, Math.min(SCORE_MAX, safeNumber(average)));
    return ((rating * reviewCount) + (priorAverage * priorWeight)) / (reviewCount + priorWeight);
}

export const rankingVolumeBoost = (count: unknown): number => Math.log1p(Math.max(0, safeNumber(count)));

const roundRankingScore = (value: number): number => Number(Math.max(0, value).toFixed(4));

/** rankingScore = bayesiana × 8 + ln(1 + nº valoraciones) × 4 (4 decimales). */
export function rankingScore(average: unknown, count: unknown): number {
    return roundRankingScore(
        (bayesianRating(average, count) * RANKING_BAYES_FACTOR) + (rankingVolumeBoost(count) * RANKING_VOLUME_FACTOR),
    );
}
