import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({ httpsCallable: () => callable }));
vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {} }));

import { adminRepairPlaceItems } from './BusinessProService';

describe('adminRepairPlaceItems', () => {
    beforeEach(() => callable.mockReset());

    it('envía placeId solo si lo hay y normaliza la respuesta', async () => {
        callable.mockResolvedValue({
            data: {
                ok: true,
                dryRun: true,
                truncated: false,
                totals: { places: 2, renamedReviews: 3, stampedReviews: 4, deactivatedItems: 1, mergedItems: 1, fixedMergedItems: 0, spotlightsUpdated: 2 },
                places: [
                    {
                        placeId: 'p1',
                        placeName: 'Sermase',
                        renamedReviews: 3,
                        stampedReviews: 4,
                        deactivatedItems: 1,
                        mergedItems: 1,
                        fixedMergedItems: 0,
                        spotlightsUpdated: 2,
                        conflicts: [{ name: 'croqueta', itemIds: ['a', 'b', 7] }],
                        duplicates: [],
                    },
                    { placeId: 'p2', placeName: null, renamedReviews: 0, conflicts: [], duplicates: [], error: 'boom' },
                ],
            },
        });

        const result = await adminRepairPlaceItems({ placeId: '  ', dryRun: true });

        expect(callable).toHaveBeenCalledWith({ dryRun: true });
        expect(result.dryRun).toBe(true);
        expect(result.totals).toEqual({ places: 2, renamedReviews: 3, stampedReviews: 4, deactivatedItems: 1, mergedItems: 1, fixedMergedItems: 0, spotlightsUpdated: 2 });
        expect(result.places[0].conflicts).toEqual([{ name: 'croqueta', itemIds: ['a', 'b'] }]);
        expect(result.places[1]).toMatchObject({ placeId: 'p2', placeName: null, stampedReviews: 0, error: 'boom' });
    });

    it('pasa el placeId recortado y dryRun false al aplicar', async () => {
        callable.mockResolvedValue({ data: { ok: true, dryRun: false, places: [], totals: {}, truncated: true } });

        const result = await adminRepairPlaceItems({ placeId: ' p1 ', dryRun: false });

        expect(callable).toHaveBeenCalledWith({ placeId: 'p1', dryRun: false });
        expect(result).toMatchObject({ dryRun: false, truncated: true, places: [] });
        expect(result.totals.places).toBe(0);
    });
});
