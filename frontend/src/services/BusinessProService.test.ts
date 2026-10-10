import { describe, expect, it, vi } from 'vitest';

const { httpsCallableMock, callMock } = vi.hoisted(() => ({
    httpsCallableMock: vi.fn(),
    callMock: vi.fn(),
}));

vi.mock('../firebase', () => ({ db: {}, functions: { region: 'europe-west1' }, auth: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: httpsCallableMock }));

import {
    computeSpotlightImpulses,
    DEFAULT_SPOTLIGHT_PRICING,
    impulsesPriceEur,
    mapPlacement,
    mapProposal,
    mapSpotlight,
    normalizeSpotlightPricing,
    packDiscountPercent,
    reviewItemProposal,
} from './BusinessProService';

describe('impulsos (0,2 km × 1 día × 1 papeleta)', () => {
    it('cuenta tramos, días e intensidad', () => {
        expect(computeSpotlightImpulses(DEFAULT_SPOTLIGHT_PRICING, { radiusKm: 0.2, days: 1, intensity: 1 })).toBe(1);
        expect(computeSpotlightImpulses(DEFAULT_SPOTLIGHT_PRICING, { radiusKm: 0.4, days: 2, intensity: 1 })).toBe(4);
        expect(computeSpotlightImpulses(DEFAULT_SPOTLIGHT_PRICING, { radiusKm: 5, days: 10, intensity: 4 })).toBe(1000);
        expect(impulsesPriceEur(DEFAULT_SPOTLIGHT_PRICING, 1000)).toBe(50);
        expect(impulsesPriceEur(DEFAULT_SPOTLIGHT_PRICING, 35)).toBe(1.75);
    });

    it('respeta el radio mínimo y evita errores binarios', () => {
        const pricing = { ...DEFAULT_SPOTLIGHT_PRICING, minRadiusKm: 0.6 };
        expect(computeSpotlightImpulses(pricing, { radiusKm: 0.2, days: 1, intensity: 1 })).toBe(3);
        expect(computeSpotlightImpulses(DEFAULT_SPOTLIGHT_PRICING, { radiusKm: 1.2, days: 1, intensity: 1 })).toBe(6);
    });

    it('lee la configuración antigua por semanas sin heredar su precio', () => {
        const pricing = normalizeSpotlightPricing({ pricePerRadiusStepPerWeek: 0.08, maxUnitsPerCampaign: 4, maxWeeks: 2 });
        expect(pricing.pricePerImpulseEur).toBe(0.05);
        expect(pricing.maxIntensity).toBe(4);
        expect(pricing.maxDays).toBe(14);
    });

    it('calcula el descuento de cada paquete', () => {
        expect(packDiscountPercent(DEFAULT_SPOTLIGHT_PRICING, { impulses: 100, priceEur: 5 })).toBe(0);
        expect(packDiscountPercent(DEFAULT_SPOTLIGHT_PRICING, { impulses: 2000, priceEur: 80 })).toBe(20);
        expect(packDiscountPercent(DEFAULT_SPOTLIGHT_PRICING, { impulses: 10000, priceEur: 350 })).toBe(30);
        expect(packDiscountPercent({ ...DEFAULT_SPOTLIGHT_PRICING, pricePerImpulseEur: 0.03 }, { impulses: 10000, priceEur: 350 })).toBeLessThan(0);
    });
});

describe('mapeadores para el historial de Developer', () => {
    const ts = (ms: number) => ({ toMillis: () => ms });

    it('propuesta: quién, cuándo y resultado de aplicarla', () => {
        const proposal = mapProposal('p1', {
            status: 'approved',
            type: 'merge',
            reviewedBy: 'uid-ana',
            reviewedAt: ts(5000),
            applyResult: { reassignedReviews: 3 },
        });
        expect(proposal).toMatchObject({ reviewedBy: 'uid-ana', reviewedAtMs: 5000, applyResult: { reassignedReviews: 3 } });
        expect(mapProposal('p2', { applyResult: null }).applyResult).toBeNull();
        expect(mapProposal('p3', {}).reviewedAtMs).toBeUndefined();
    });

    it('propuesta: aplicándose ahora y último intento fallido', () => {
        const applying = mapProposal('p4', { status: 'applying', reviewedBy: 'uid-ana', applyingAt: ts(3000) });
        expect(applying).toMatchObject({ status: 'applying', reviewedBy: 'uid-ana', applyingAtMs: 3000 });
        expect(applying.applyError).toBeUndefined();

        const failed = mapProposal('p5', {
            status: 'pending',
            applyError: { message: 'El elemento destino ya no está activo.', code: 'failed-precondition', by: 'uid-ana', at: ts(4000) },
        });
        expect(failed.status).toBe('pending');
        expect(failed.applyError).toEqual({ message: 'El elemento destino ya no está activo.', code: 'failed-precondition', by: 'uid-ana', atMs: 4000 });
        expect(mapProposal('p6', { applyError: { code: 'x' } }).applyError).toBeUndefined();
        expect(mapProposal('p7', { status: 'raro' }).status).toBe('pending');
    });

    it('campaña: revisión y cierre automático', () => {
        const placement = mapPlacement('s1', { status: 'ended', createdBy: 'uid-1', reviewedBy: 'uid-ana', reviewedAt: ts(7000), endedAt: ts(9000) });
        expect(placement).toMatchObject({ createdBy: 'uid-1', reviewedBy: 'uid-ana', reviewedAtMs: 7000, endedAtMs: 9000 });
        expect(placement.activatedAtMs).toBeUndefined();
    });

    it('plato: impulsos de regalo, facturados y devueltos', () => {
        const spotlight = mapSpotlight('d1', {
            status: 'rejected',
            impulses: 140,
            creditsUsed: 120,
            billedImpulses: 20,
            creditsRefunded: true,
            creditsRefundedAt: ts(11000),
        });
        expect(spotlight).toMatchObject({ creditsUsed: 120, billedImpulses: 20, creditsRefunded: true, creditsRefundedAtMs: 11000 });
        expect(mapSpotlight('d2', { creditsUsed: 0 })).toMatchObject({ creditsUsed: 0, creditsRefunded: false });
    });
});

describe('reviewItemProposal', () => {
    it('espera lo mismo que el servidor (300 s) y algo más, no los 70 s por defecto', async () => {
        httpsCallableMock.mockReset().mockReturnValue(callMock);
        callMock.mockReset().mockResolvedValue({ data: { ok: true } });
        await reviewItemProposal('prop1', 'approve', 'Mismo plato');
        expect(httpsCallableMock).toHaveBeenCalledWith({ region: 'europe-west1' }, 'reviewItemProposal', { timeout: 310_000 });
        expect(callMock).toHaveBeenCalledWith({ proposalId: 'prop1', decision: 'approve', adminNotes: 'Mismo plato' });
    });
});
