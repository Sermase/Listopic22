import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({ httpsCallable: () => callable }));
vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {} }));

import { createBusinessItem, getBusinessItemExistsDetails } from './BusinessProService';

describe('createBusinessItem', () => {
    beforeEach(() => callable.mockReset());

    it('devuelve el elemento creado tal y como lo guardó el servidor', async () => {
        callable.mockResolvedValue({
            data: {
                ok: true,
                itemId: 'tarta-de-queso',
                name: 'Tarta de queso',
                item: {
                    id: 'tarta-de-queso',
                    canonicalName: 'Tarta de queso',
                    status: 'active',
                    source: 'business',
                    businessData: { group: 'Postres', price: '6,50 €', priceCents: 650 },
                    stats: { reviewCount: 0, averageRating: null },
                },
            },
        });
        const result = await createBusinessItem('place-1', 'Tarta de queso', { group: 'Postres', price: '6,5' });
        expect(callable).toHaveBeenCalledWith({ placeId: 'place-1', name: 'Tarta de queso', businessData: { group: 'Postres', price: '6,5' } });
        expect(result.itemId).toBe('tarta-de-queso');
        expect(result.name).toBe('Tarta de queso');
        expect(result.item).toMatchObject({
            id: 'tarta-de-queso',
            canonicalName: 'Tarta de queso',
            source: 'business',
            businessData: { group: 'Postres', price: '6,50 €', priceCents: 650 },
        });
    });

    it('con un backend que solo devuelve el id, monta el elemento con lo enviado', async () => {
        callable.mockResolvedValue({ data: { ok: true, itemId: 'pulpo', name: 'Pulpo' } });
        const result = await createBusinessItem('place-1', 'Pulpo', { group: 'Raciones', price: '14 €' });
        expect(result.item).toMatchObject({
            id: 'pulpo',
            canonicalName: 'Pulpo',
            status: 'active',
            source: 'business',
            businessData: { group: 'Raciones', price: '14 €', available: true },
            stats: { reviewCount: 0 },
        });
    });
});

describe('getBusinessItemExistsDetails', () => {
    it('lee los details del HttpsError already-exists', () => {
        const error = Object.assign(new Error('Ya existe «Croqueta, la original» en tu carta.'), {
            code: 'functions/already-exists',
            details: { itemId: 'croqueta-prueba-1', canonicalName: 'Croqueta, la original' },
        });
        expect(getBusinessItemExistsDetails(error)).toEqual({ itemId: 'croqueta-prueba-1', canonicalName: 'Croqueta, la original' });
    });

    it('ignora otros errores y already-exists sin itemId', () => {
        expect(getBusinessItemExistsDetails(Object.assign(new Error('x'), { code: 'functions/resource-exhausted', details: { itemId: 'a' } }))).toBeNull();
        expect(getBusinessItemExistsDetails(Object.assign(new Error('x'), { code: 'functions/already-exists' }))).toBeNull();
        expect(getBusinessItemExistsDetails(null)).toBeNull();
    });
});
