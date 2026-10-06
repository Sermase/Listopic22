import { describe, expect, it, vi } from 'vitest';

const getDocs = vi.hoisted(() => vi.fn());
vi.mock('firebase/firestore', async (importOriginal) => ({
    ...(await importOriginal<typeof import('firebase/firestore')>()),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    getDocs,
}));
vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {} }));

import { getActiveItemSpotlights } from './BusinessProService';

const spotlightDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

describe('getActiveItemSpotlights', () => {
    it('no sirve campañas cuyo plato ya no está en la carta', async () => {
        getDocs.mockResolvedValue({
            docs: [
                spotlightDoc('vivo', { status: 'active', itemId: 'croqueta', itemName: 'Croqueta' }),
                spotlightDoc('huerfano', { status: 'active', itemId: 'borrado', itemName: 'Borrado', itemInactive: true }),
                spotlightDoc('reactivado', { status: 'active', itemId: 'tortilla', itemName: 'Tortilla', itemInactive: false }),
            ],
        });

        const result = await getActiveItemSpotlights();

        expect(result.map((spotlight) => spotlight.id)).toEqual(['vivo', 'reactivado']);
        expect(result.every((spotlight) => spotlight.itemInactive === false)).toBe(true);
    });
});
