import { describe, expect, it } from 'vitest';
import {
    computeSpotlightImpulses,
    DEFAULT_SPOTLIGHT_PRICING,
    impulsesPriceEur,
    normalizeSpotlightPricing,
    packDiscountPercent,
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
