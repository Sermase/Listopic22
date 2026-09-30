import { describe, expect, it } from 'vitest';
import vectors from './scoring.vectors.json';
import {
    averageScore,
    compareByRank,
    computeReviewScore,
    criterionWeight,
    deriveScoringWeights,
    mergeMinilistCriteria,
    rankingIndexScore,
    rankPosition,
    reviewScoreForList,
    reviewScoreForParentList,
    WEIGHTS_ENABLED,
    type CriteriaInput,
    type ReviewLike,
    type ScoresInput,
} from './scoring';

// Copia literal del cálculo que hacía AddReviewForm antes de centralizarlo.
function legacyOverall(criteriaDefinition: Record<string, { ponderable?: boolean }>, scores: Record<string, number>) {
    const criteriaList = Object.keys(criteriaDefinition).map((k) => ({ id: k, ponderable: criteriaDefinition[k].ponderable !== false }));
    let total = 0;
    let count = 0;
    criteriaList.forEach((c) => {
        const val = scores[c.id];
        if (c.ponderable !== false && val !== undefined) {
            total += val;
            count++;
        }
    });
    return count > 0 ? parseFloat((total / count).toFixed(1)) : null;
}

// Generador determinista para que el test sea reproducible.
function seededRandom(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

describe('scoring: vectores compartidos con el servidor', () => {
    it.each(vectors.review)('nota de valoración: $name', ({ criteria, scores, expected, ...rest }) => {
        const options = 'options' in rest ? (rest.options as { useWeights?: boolean }) : undefined;
        expect(computeReviewScore(scores as ScoresInput, criteria as CriteriaInput, options)).toEqual(expected);
    });

    it.each(vectors.parent)('Lista madre: $name', ({ review, parentCriteria, expected }) => {
        expect(reviewScoreForParentList(review as ReviewLike, parentCriteria as CriteriaInput)).toEqual(expected);
    });

    it.each(vectors.list)('según la lista: $name', ({ review, list, expected }) => {
        expect(reviewScoreForList(review as ReviewLike, list as Parameters<typeof reviewScoreForList>[1])).toEqual(expected);
    });

    it.each(vectors.ranking)('ranking: media $average con $count valoraciones (C=$prior)', ({ average, count, prior, position }) => {
        expect(rankPosition(average, count, prior)).toBeCloseTo(position, 9);
    });

    it.each(vectors.ranking.filter((r) => r.prior === 7))('índice de búsqueda: media $average con $count', ({ average, count, indexScore }) => {
        expect(rankingIndexScore(average, count)).toBe(indexScore);
    });

    it.each(vectors.deriveWeights)('pesos derivados: $name', ({ criteria, existing, expected }) => {
        expect(deriveScoringWeights(criteria as CriteriaInput, existing as Record<string, unknown> | null)).toEqual(expected);
    });
});

describe('scoring: compatibilidad con las notas ya guardadas', () => {
    it('da exactamente el mismo overallRating que el cálculo anterior (5.000 casos aleatorios)', () => {
        const random = seededRandom(20260930);
        for (let i = 0; i < 5000; i++) {
            const definition: Record<string, { ponderable?: boolean }> = {};
            const scores: Record<string, number> = {};
            const criteriaCount = Math.floor(random() * 8);
            const step = random() < 0.5 ? 0.1 : 0.5;
            for (let c = 0; c < criteriaCount; c++) {
                const roll = random();
                definition[`c${c}`] = roll < 0.15 ? { ponderable: false } : roll < 0.5 ? { ponderable: true } : {};
                if (random() < 0.85) {
                    scores[`c${c}`] = Math.round((random() * 10) / step) * step;
                }
            }
            const legacy = legacyOverall(definition, scores);
            expect(computeReviewScore(scores, definition).score).toBe(legacy);
        }
    });

    it('las ponderaciones están apagadas por defecto', () => {
        expect(WEIGHTS_ENABLED).toBe(false);
        expect(criterionWeight({ weight: 3 })).toBe(1);
        expect(criterionWeight({ weight: 0 })).toBe(1);
        expect(criterionWeight({ ponderable: false, weight: 3 })).toBe(0);
    });
});

describe('scoring: Minilistas', () => {
    it('hereda los criterios de la madre y añade los suyos sin pisarlos', () => {
        const merged = mergeMinilistCriteria(
            { sabor: { ponderable: true }, precio: { ponderable: false } },
            { sabor: { ponderable: false }, relleno: {} },
        );
        expect(merged.map((c) => c.id)).toEqual(['sabor', 'precio', 'relleno']);
        expect(merged[0].ponderable).toBe(true);
    });

    it('la nota de Minilista cuenta los extras y la de la madre no', () => {
        const parent = { sabor: {}, textura: {} };
        const minilist = mergeMinilistCriteria(parent, { relleno: {} });
        const scores = { sabor: 8, textura: 6, relleno: 10 };
        const minilistScore = computeReviewScore(scores, minilist).score;
        expect(minilistScore).toBe(8);
        expect(reviewScoreForParentList({ sublistId: 'm', overallRating: minilistScore, scores }, parent).score).toBe(7);
    });
});

describe('scoring: medias', () => {
    it('ignora huecos y devuelve null sin datos', () => {
        expect(averageScore([8, null, undefined, 6])).toBe(7);
        expect(averageScore([])).toBeNull();
    });
});

describe('ranking único: una sola valoración no basta para encabezar', () => {
    it('10 con 1 valoración queda por debajo de 8,5 con 10 valoraciones (C = 7)', () => {
        expect(rankPosition(10, 1)).toBeCloseTo(7.75, 10);
        expect(rankPosition(8.5, 10)).toBeGreaterThan(rankPosition(10, 1));
    });

    it('cualquier media de 8 o más con 10 valoraciones supera a un 10 con 1', () => {
        for (const avg of [8, 8.5, 9, 9.5]) {
            expect(rankPosition(avg, 10)).toBeGreaterThan(rankPosition(10, 1));
        }
    });

    it('con muchas valoraciones manda la media real', () => {
        expect(rankPosition(9, 1000)).toBeGreaterThan(8.95);
        expect(rankPosition(9, 100)).toBeGreaterThan(rankPosition(7.5, 100));
    });

    it('el volumen ya no compra posiciones: 6,0 con 100 queda detrás de 9,0 con 2', () => {
        expect(rankPosition(9, 2)).toBeGreaterThan(rankPosition(6, 100));
    });

    it('compareByRank ordena por posición y desempata por número de valoraciones', () => {
        const items = [
            { id: 'uno-de-10', average: 10, count: 1 },
            { id: 'diez-de-8.5', average: 8.5, count: 10 },
            { id: 'empate-a', average: 8, count: 3 },
            { id: 'empate-b', average: 8, count: 3 },
            { id: 'sin-valoraciones', average: null, count: 0 },
        ];
        const order = [...items].sort(compareByRank).map((i) => i.id);
        expect(order[0]).toBe('diez-de-8.5');
        expect(order[order.length - 1]).toBe('sin-valoraciones');
    });
});

describe('scoringWeights', () => {
    it('hoy ×1 / ×0 da lo mismo que ponderable', () => {
        const criteria = { a: {}, b: { ponderable: false }, c: {} };
        const scores = { a: 7, b: 2, c: 9 };
        expect(computeReviewScore(scores, criteria, { weights: deriveScoringWeights(criteria) }))
            .toEqual(computeReviewScore(scores, criteria));
    });
});

// Regla histórica (confirmada 30/09/2026): un criterio que no existía cuando se
// hizo la valoración NO entra en su cálculo. Nunca se sustituye por 0, 5 ni nada.
describe('regla histórica de criterios nuevos', () => {
    const HAND_EXPECTED = [7, 8, 7, 8, 7];
    type ListFixture = { criteriaDefinition: CriteriaInput; scoringWeights: Record<string, number>; parentListId: string | null };

    it.each(vectors.historic.map((v, i) => ({ ...v, hand: HAND_EXPECTED[i] })))('$name', (v) => {
        const list = v.list as ListFixture;
        const score = v.kind === 'review'
            ? computeReviewScore(v.scores as ScoresInput, list.criteriaDefinition, { weights: list.scoringWeights }).score
            : reviewScoreForList(v.review as ReviewLike, list).score;
        expect(score).toBe(v.hand);
        expect(score).toBe(v.expected);
    });

    it('el criterio ausente no se trata como 0 ni como 5', () => {
        const [old] = vectors.historic;
        const list = old.list as ListFixture;
        const score = computeReviewScore(old.scores as ScoresInput, list.criteriaDefinition, { weights: list.scoringWeights }).score;
        expect(score).not.toBeCloseTo((old as { notWith: { zero: number } }).notWith.zero, 1);
        expect(score).not.toBeCloseTo((old as { notWith: { five: number } }).notWith.five, 1);
    });

    it('la valoración antigua queda «incompleta» pero con nota válida', () => {
        const [old] = vectors.historic;
        const list = old.list as ListFixture;
        const r = computeReviewScore(old.scores as ScoresInput, list.criteriaDefinition, { weights: list.scoringWeights });
        expect(r.complete).toBe(false);
        expect(r.missing).toEqual(['nuevo']);
        expect(r.score).toBe(7);
    });
});
