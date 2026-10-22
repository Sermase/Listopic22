import { describe, expect, it } from 'vitest';
import { aptSummary, aptVerdict, itemAptOk } from './aptFor';

describe('aptFor', () => {
    it('veredicto: un «no» basta para no darlo por apto', () => {
        expect(aptVerdict(undefined)).toBeNull();
        expect(aptVerdict({ yes: 3 })).toBe('yes');
        expect(aptVerdict({ no: 1 })).toBe('no');
        expect(aptVerdict({ yes: 3, no: 1 })).toBe('mixed');
        expect(aptVerdict({ yes: 0, no: 0 })).toBeNull();
    });

    it('resumen legible', () => {
        expect(aptSummary('glutenFree', { yes: 4, no: 1 })).toBe('🌾 ✅ 4 celíacos: sin problemas · ⚠️ 1: me sentó mal');
        expect(aptSummary('glutenFree', {})).toBe('');
    });

    it('claves aptas de un elemento', () => {
        const aptFor = { items: { bravas: { glutenFree: { yes: 2 }, vegan: { yes: 1, no: 1 } } } };
        expect(itemAptOk(aptFor, 'bravas')).toEqual(['glutenFree']);
        expect(itemAptOk(aptFor, 'otro')).toEqual([]);
        expect(itemAptOk(null, 'bravas')).toEqual([]);
    });
});
