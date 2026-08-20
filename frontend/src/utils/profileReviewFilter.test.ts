import { describe, expect, it } from 'vitest';
import { getSelectedProfileReviewListId, selectProfileReviewResults } from './profileReviewFilter';

describe('profile review list filtering', () => {
    it('uses the independently queried list results instead of the partially loaded profile feed', () => {
        const baseReviews = [
            { id: 'loaded-a', listId: 'list-a' },
            { id: 'loaded-b', listId: 'list-b' },
        ];
        const queriedListReviews = [
            { id: 'loaded-a', listId: 'list-a' },
            { id: 'not-loaded-yet', listId: 'list-a' },
        ];

        expect(selectProfileReviewResults('list-a', baseReviews, queriedListReviews))
            .toEqual(queriedListReviews);
    });

    it('keeps the general paginated feed when no list is selected', () => {
        const baseReviews = [{ id: 'base', listId: 'list-a' }];
        expect(selectProfileReviewResults('all', baseReviews, [])).toEqual(baseReviews);
        expect(getSelectedProfileReviewListId('all')).toBeUndefined();
    });
});
