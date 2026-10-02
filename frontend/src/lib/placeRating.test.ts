import { describe, expect, it } from 'vitest';
import { CRITIC_MIN_SAMPLE, placeRating } from './placeRating';

describe('placeRating', () => {
    it('general y críticos por separado', () => {
        expect(placeRating({ averageRating: 7.83, reviewsCount: 3, criticRating: 8.75, criticReviewsCount: 2 })).toEqual({
            average: 7.83, count: 3, critic: { average: 8.75, count: 2, provisional: true },
        });
        expect(placeRating({ averageRating: 8, reviewsCount: 10, criticRating: 9, criticReviewsCount: CRITIC_MIN_SAMPLE }).critic?.provisional).toBe(false);
    });

    it('sin valoraciones públicas: sin nota; sin críticos: no hay nota de críticos', () => {
        expect(placeRating({ averageRating: 6, reviewsCount: 0 })).toEqual({ average: null, count: 0, critic: null });
        expect(placeRating({ averageRating: 6, reviewsCount: 2, criticReviewsCount: 0, criticRating: null }).critic).toBeNull();
        expect(placeRating(null)).toEqual({ average: null, count: 0, critic: null });
    });
});
