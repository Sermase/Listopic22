import { describe, expect, it } from 'vitest';
import {
    computeSpotlightUnitPrice,
    DEFAULT_SPOTLIGHT_PRICING,
} from './BusinessProService';

describe('computeSpotlightUnitPrice', () => {
    it('calcula el precio por tramos de 0,2 km', () => {
        expect(computeSpotlightUnitPrice(DEFAULT_SPOTLIGHT_PRICING, 0.2, 1)).toBe(0.08);
        expect(computeSpotlightUnitPrice(DEFAULT_SPOTLIGHT_PRICING, 1, 1)).toBe(0.4);
        expect(computeSpotlightUnitPrice(DEFAULT_SPOTLIGHT_PRICING, 2, 2)).toBe(1.6);
    });

    it('respeta el radio mínimo configurado', () => {
        const pricing = { ...DEFAULT_SPOTLIGHT_PRICING, minRadiusKm: 0.6 };
        expect(computeSpotlightUnitPrice(pricing, 0.2, 1)).toBe(0.24);
    });

    it('evita errores binarios al contar tramos decimales', () => {
        expect(computeSpotlightUnitPrice(DEFAULT_SPOTLIGHT_PRICING, 1.2, 1)).toBe(0.48);
    });
});
