import { describe, expect, it } from 'vitest';
import { placeCardScore, placeRating } from './placeRating';

describe('placeRating', () => {
    it('nota pública de personas; críticos aparte y provisional por debajo de 3', () => {
        expect(placeRating({
            averageRating: 7.83, publicHumanReviewsCount: 3, totalVisibleReviewsCount: 5, reviewsCount: 5,
            publicBotReviewsCount: 2, botAverageRating: 9, criticRating: 8.75, criticReviewsCount: 2,
        })).toEqual({
            average: 7.83, count: 3, visibleCount: 5,
            bots: { average: 9, count: 2 },
            critic: { average: 8.75, count: 2, provisional: true },
        });
    });

    it('solo bots: sin nota pública, pero con actividad', () => {
        const rating = placeRating({ averageRating: null, publicHumanReviewsCount: 0, totalVisibleReviewsCount: 2, reviewsCount: 2, publicBotReviewsCount: 2, botAverageRating: 6.5 });
        expect(rating.average).toBeNull();
        expect(rating.count).toBe(0);
        expect(rating.visibleCount).toBe(2);
        expect(rating.bots).toEqual({ average: 6.5, count: 2 });
    });

    it('documento anterior al recálculo: reviewsCount/averageRating como antes', () => {
        expect(placeRating({ averageRating: 8, reviewsCount: 4 })).toMatchObject({ average: 8, count: 4, visibleCount: 4, bots: null });
        expect(placeRating(null)).toMatchObject({ average: null, count: 0, visibleCount: 0, critic: null });
    });
});

describe('placeCardScore (Buscar)', () => {
    const botOnly = { hasPublicRating: false, publicHumanReviewsCount: 0, totalVisibleReviewsCount: 2, reviewsCount: 2, publicBotReviewsCount: 2, botAverageRating: 6.5 };

    it('sin filtro «Bots»: «Sin nota pública todavía» (null), nunca un 0', () => {
        expect(placeCardScore(botOnly, false)).toEqual({ avgRating: null, reviewCount: 0 });
    });

    it('con filtro «Bots»: la nota de bots, marcada como tal', () => {
        expect(placeCardScore(botOnly, true)).toEqual({ avgRating: 6.5, reviewCount: 2, scoreKind: 'bot' });
    });

    it('con nota pública, siempre la pública', () => {
        const place = { hasPublicRating: true, averageRating: 8, publicHumanReviewsCount: 3, totalVisibleReviewsCount: 5, publicBotReviewsCount: 2, botAverageRating: 4 };
        expect(placeCardScore(place, true)).toEqual({ avgRating: 8, reviewCount: 3 });
    });
});
