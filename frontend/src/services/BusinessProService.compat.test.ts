import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hosting se publica al fusionar y Functions se despliegan después a mano: el
// frontend nuevo tiene que funcionar también con las callables anteriores.

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({ httpsCallable: () => callable }));
vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

import {
    createBusinessItem,
    EMPTY_OFFER_DATA,
    isCallableInternalError,
    isCallableUnavailableError,
    saveBusinessOffer,
    updateBusinessVisual,
    updateCanonicalItemBusinessData,
} from './BusinessProService';

const callableError = (code: string, details?: unknown) => Object.assign(new Error(code), { code: `functions/${code}`, details });

beforeEach(() => callable.mockReset());

describe('isCallableUnavailableError', () => {
    it('una callable sin desplegar (unimplemented, not-found sin platos) cuenta como no disponible', () => {
        expect(isCallableUnavailableError(callableError('unimplemented'))).toBe(true);
        expect(isCallableUnavailableError(callableError('not-found'))).toBe(true);
    });

    it('los errores del servidor nuevo no', () => {
        expect(isCallableUnavailableError(callableError('not-found', { itemIds: ['bravas'] }))).toBe(false);
        expect(isCallableUnavailableError(callableError('permission-denied'))).toBe(false);
        expect(isCallableUnavailableError(callableError('resource-exhausted'))).toBe(false);
        expect(isCallableUnavailableError(null)).toBe(false);
    });

    it("'internal' no la da por no disponible (puede ser un fallo real): se trata aparte", () => {
        expect(isCallableUnavailableError(callableError('internal'))).toBe(false);
        expect(isCallableInternalError(callableError('internal'))).toBe(true);
        expect(isCallableInternalError(callableError('unimplemented'))).toBe(false);
    });
});

describe('createBusinessItem con lista', () => {
    it('manda listId solo si hay lista', async () => {
        callable.mockResolvedValue({ data: { ok: true, itemId: 'pulpo', name: 'Pulpo' } });
        await createBusinessItem('place-1', 'Pulpo', { group: 'Raciones' });
        expect(callable).toHaveBeenLastCalledWith({ placeId: 'place-1', name: 'Pulpo', businessData: { group: 'Raciones' } });
        await createBusinessItem('place-1', 'Pulpo', { group: 'Raciones' }, 'pulpos');
        expect(callable).toHaveBeenLastCalledWith({ placeId: 'place-1', name: 'Pulpo', businessData: { group: 'Raciones' }, listId: 'pulpos' });
    });

    it('con un servidor anterior (sin linkedListIds) no da la lista por guardada', async () => {
        callable.mockResolvedValue({
            data: { ok: true, itemId: 'pulpo', name: 'Pulpo', item: { id: 'pulpo', canonicalName: 'Pulpo', businessData: { group: 'Raciones' } } },
        });
        const result = await createBusinessItem('place-1', 'Pulpo', { group: 'Raciones' }, 'pulpos');
        expect(result.item.linkedListIds).toEqual([]);
    });

    it('con el servidor nuevo devuelve la lista guardada', async () => {
        callable.mockResolvedValue({
            data: { ok: true, itemId: 'pulpo', name: 'Pulpo', item: { id: 'pulpo', canonicalName: 'Pulpo', linkedListIds: ['pulpos'] } },
        });
        const result = await createBusinessItem('place-1', 'Pulpo', {}, 'pulpos');
        expect(result.item.linkedListIds).toEqual(['pulpos']);
    });
});

describe('updateCanonicalItemBusinessData', () => {
    it('con un servidor anterior (sin menuOrder) devuelve menuOrder null', async () => {
        callable.mockResolvedValue({
            data: { ok: true, itemId: 'pulpo', data: { group: 'Raciones', price: '14,00 €', priceCents: 1400, allergens: [], available: true } },
        });
        const saved = await updateCanonicalItemBusinessData('place-1', 'pulpo', {
            group: 'Raciones', price: '14', discount: '', ingredients: '', description: '', allergens: [], available: true, menuOrder: 2,
        });
        expect(saved).toMatchObject({ group: 'Raciones', price: '14,00 €', menuOrder: null });
    });
});

describe('saveBusinessOffer acepta la respuesta nueva y la anterior', () => {
    const offer = { ...EMPTY_OFFER_DATA, title: '2x1 en cañas', status: 'active' as const };

    it('{ offerId, data }: usa lo que guardó el servidor', async () => {
        callable.mockResolvedValue({ data: { ok: true, offerId: 'o1', data: { ...offer, title: '2x1 en cañas (saneado)' } } });
        await expect(saveBusinessOffer('place-1', offer)).resolves.toEqual({
            offerId: 'o1',
            data: { ...offer, title: '2x1 en cañas (saneado)' },
        });
    });

    it('{ offerId } sin data: usa lo enviado', async () => {
        callable.mockResolvedValue({ data: { ok: true, offerId: 'o1' } });
        await expect(saveBusinessOffer('place-1', offer)).resolves.toEqual({ offerId: 'o1', data: offer });
    });

    it('solo el id como texto, o sin id al editar: no se rompe', async () => {
        callable.mockResolvedValue({ data: 'o2' });
        await expect(saveBusinessOffer('place-1', offer)).resolves.toEqual({ offerId: 'o2', data: offer });
        callable.mockResolvedValue({ data: { ok: true } });
        await expect(saveBusinessOffer('place-1', offer, 'o3')).resolves.toEqual({ offerId: 'o3', data: offer });
    });
});

describe('updateBusinessVisual', () => {
    it('devuelve lo guardado o null si la respuesta no lo trae', async () => {
        callable.mockResolvedValue({ data: { ok: true, data: { accentColor: '#ff0000', visualStyle: 'clean', heroText: 'Hola', heroImageUrl: 'https://img/h.jpg' } } });
        await expect(updateBusinessVisual('place-1', { accentColor: '#FF0000', visualStyle: 'clean', heroText: 'Hola', heroImageUrl: 'https://img/h.jpg' }))
            .resolves.toMatchObject({ accentColor: '#ff0000', heroImageUrl: 'https://img/h.jpg' });
        callable.mockResolvedValue({ data: { ok: true } });
        await expect(updateBusinessVisual('place-1', { accentColor: '', visualStyle: 'editorial', heroText: '', heroImageUrl: '' })).resolves.toBeNull();
    });
});
