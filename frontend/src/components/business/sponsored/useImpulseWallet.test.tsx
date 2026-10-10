import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

const service = vi.hoisted(() => ({
    getPlaceSpotlightCredits: vi.fn(),
    getSpotlightPricing: vi.fn(),
}));
vi.mock('../../../services/BusinessProService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../services/BusinessProService')>()),
    ...service,
}));
const billing = vi.hoisted(() => ({ createImpulsePackCheckoutSession: vi.fn() }));
vi.mock('../../../services/BusinessBillingService', () => billing);
vi.mock('../../../config/features', () => ({ BUSINESS_PRO_CHECKOUT_ENABLED: true, BUSINESS_PRO_ENFORCED: true }));

import { DEFAULT_SPOTLIGHT_PRICING } from '../../../services/BusinessProService';
import { saveCheckoutBaseline, saveSpotlightDraft } from './spotlightDraft';
import { useImpulseWallet } from './useImpulseWallet';

const PLACE = 'place-1';

// Avanza los temporizadores y deja resolver las promesas de cada lectura.
const advance = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
};

describe('useImpulseWallet', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        sessionStorage.clear();
        localStorage.clear();
        service.getPlaceSpotlightCredits.mockReset();
        service.getSpotlightPricing.mockReset().mockResolvedValue(DEFAULT_SPOTLIGHT_PRICING);
        billing.createImpulsePackCheckoutSession.mockReset();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads the balance and never reports a false 0 while loading or after an error', async () => {
        service.getPlaceSpotlightCredits.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(340);
        const { result } = renderHook(() => useImpulseWallet(PLACE, null));
        expect(result.current.credits).toBeNull();
        expect(result.current.creditsStatus).toBe('loading');
        await advance(0);
        expect(result.current.creditsStatus).toBe('error');
        expect(result.current.credits).toBeNull();
        act(() => result.current.reloadCredits());
        await advance(0);
        expect(result.current.credits).toBe(340);
        expect(result.current.awaitingPayment).toBe(false);
    });

    it('confirms a Stripe payment against the stored draft and restores the plan', async () => {
        saveSpotlightDraft(PLACE, { itemId: 'croquetas', radiusKm: 2, days: 7, intensity: 2, balanceBefore: 100 });
        service.getPlaceSpotlightCredits.mockResolvedValueOnce(100).mockResolvedValueOnce(100).mockResolvedValue(600);
        const { result } = renderHook(() => useImpulseWallet(PLACE, 'ok'));
        expect(result.current.restoredDraft).toMatchObject({ itemId: 'croquetas', days: 7, intensity: 2 });
        expect(result.current.awaitingPayment).toBe(true);
        await advance(3000);
        expect(result.current.awaitingPayment).toBe(true);
        await advance(3000);
        expect(result.current.awaitingPayment).toBe(false);
        expect(result.current.credits).toBe(600);
        expect(result.current.notice).toEqual({ tone: 'success', text: '✅ ¡Impulsos añadidos! Ya tienes ⚡ 600.' });
    });

    it('S9: without a stored draft, uses the balance on return as baseline and still confirms', async () => {
        // Al volver: 50 (referencia); el webhook suma 500 un poco después.
        service.getPlaceSpotlightCredits.mockResolvedValueOnce(50).mockResolvedValueOnce(50).mockResolvedValueOnce(50).mockResolvedValue(550);
        const { result } = renderHook(() => useImpulseWallet(PLACE, 'ok'));
        expect(result.current.restoredDraft).toBeNull();
        expect(result.current.awaitingPayment).toBe(true);
        await advance(3000);
        await advance(3000);
        expect(result.current.awaitingPayment).toBe(false);
        expect(result.current.notice?.tone).toBe('success');
        expect(result.current.credits).toBe(550);
    });

    it('S9: without any baseline the waiting always ends with an honest message', async () => {
        service.getPlaceSpotlightCredits.mockResolvedValue(550);
        const { result } = renderHook(() => useImpulseWallet(PLACE, 'ok'));
        await advance(180_000);
        expect(result.current.awaitingPayment).toBe(false);
        expect(result.current.notice?.tone).toBe('neutral');
        expect(result.current.notice?.text).toContain('Tu saldo es de ⚡ 550');
    });

    it('uses the localStorage copy of the balance when the draft is gone', async () => {
        saveCheckoutBaseline(PLACE, 100, Date.now());
        service.getPlaceSpotlightCredits.mockResolvedValueOnce(600).mockResolvedValue(600);
        const { result } = renderHook(() => useImpulseWallet(PLACE, 'ok'));
        await advance(3000);
        expect(result.current.awaitingPayment).toBe(false);
        expect(result.current.notice?.tone).toBe('success');
    });

    it('a cancelled checkout says nothing was charged and keeps the draft', async () => {
        saveSpotlightDraft(PLACE, { itemId: 'croquetas', radiusKm: 1, days: 3, intensity: 1, balanceBefore: 0 });
        service.getPlaceSpotlightCredits.mockResolvedValue(0);
        const { result } = renderHook(() => useImpulseWallet(PLACE, 'cancelado'));
        expect(result.current.purchaseReturn).toBe('cancelled');
        expect(result.current.awaitingPayment).toBe(false);
        expect(result.current.notice?.text).toBe('🙅 Compra cancelada: no se ha cobrado nada.');
        expect(result.current.restoredDraft?.itemId).toBe('croquetas');
    });

    it('buy() saves the draft with the balance before paying and goes to Stripe', async () => {
        service.getPlaceSpotlightCredits.mockResolvedValue(120);
        billing.createImpulsePackCheckoutSession.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1', impulses: 500, priceEur: 22.5 });
        const assign = vi.fn();
        const original = window.location;
        Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
        try {
            const { result } = renderHook(() => useImpulseWallet(PLACE, null));
            await advance(0);
            await act(async () => {
                await result.current.buy('pack-1', { packIndex: 1 }, { itemId: 'croquetas', radiusKm: 2, days: 7, intensity: 1 });
            });
            expect(billing.createImpulsePackCheckoutSession).toHaveBeenCalledWith(PLACE, { packIndex: 1 });
            expect(JSON.parse(sessionStorage.getItem(`spotlightDraft:${PLACE}`) || '{}')).toEqual({
                itemId: 'croquetas', radiusKm: 2, days: 7, intensity: 1, balanceBefore: 120,
            });
            expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/cs_1');
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: original });
        }
    });
});
