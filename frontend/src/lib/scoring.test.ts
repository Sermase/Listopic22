import { describe, expect, it } from 'vitest';
import vectors from './scoring.vectors.json';
import {
    averageScore,
    bayesianRating,
    computeReviewScore,
    criterionWeight,
    mergeMinilistCriteria,
    rankingScore,
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

    it.each(vectors.ranking)('ranking: media $average con $count valoraciones', ({ average, count, bayesian, rankingScore: expected }) => {
        expect(bayesianRating(average, count)).toBeCloseTo(bayesian, 9);
        expect(rankingScore(average, count)).toBe(expected);
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

describe('ranking: una sola valoración no basta para encabezar', () => {
    it('10 con 1 valoración queda por debajo de 8,5 con 10 valoraciones', () => {
        expect(rankingScore(10, 1)).toBeLessThan(rankingScore(8.5, 10));
    });

    it('con muchas valoraciones manda la media real', () => {
        expect(bayesianRating(9, 1000)).toBeGreaterThan(8.95);
        expect(rankingScore(9, 100)).toBeGreaterThan(rankingScore(7.5, 100));
    });
});
