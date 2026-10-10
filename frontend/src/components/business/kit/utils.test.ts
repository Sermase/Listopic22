import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { businessErrorCopy } from './errors';
import { formatPriceInput, parseMenuPrice } from './price';
import { foldText, includesFolded } from './text';
import { isOvernight, timeRangeError, toTimeValue } from './time';
import { quickRange, toDateInput } from './dates';
import { isDeepEqual, useDirtyState } from './useDirtyState';

const callableError = (code: string, message = code) => Object.assign(new Error(message), { code: `functions/${code}` });

describe('formatPriceInput (mirror of functions/modules/lib/menu-price.js)', () => {
    it.each([
        ['6,5', '6,50 €'],
        ['6.5', '6,50 €'],
        ['6', '6,00 €'],
        ['€1.2', '1,20 €'],
        ['6.50€', '6,50 €'],
        ['6,50 €', '6,50 €'],
        ['1.234,5', '1.234,50 €'],
        ['1,234.5', '1.234,50 €'],
        ['1.234', '1.234,00 €'],
        ['007', '7,00 €'],
        ['12 €/kg', '12 €/kg'],
        ['Según mercado', 'Según mercado'],
        ['', ''],
        ['   ', ''],
    ])('%j → %j', (raw, expected) => {
        expect(formatPriceInput(raw)).toBe(expected);
    });

    it('caps free text at 40 characters and returns cents for numbers', () => {
        expect(formatPriceInput('x'.repeat(60))).toHaveLength(40);
        expect(parseMenuPrice('1,2')).toEqual({ price: '1,20 €', priceCents: 120 });
        expect(parseMenuPrice('S/M')).toEqual({ price: 'S/M', priceCents: null });
    });
});

describe('foldText', () => {
    it('ignores case, accents and extra spaces', () => {
        expect(foldText('  Catalán   Valenciano ')).toBe('catalan valenciano');
        expect(includesFolded(['Español', 'Inglés'], 'INGLES')).toBe(true);
        expect(includesFolded(['Español'], 'Euskera')).toBe(false);
    });
});

describe('time helpers', () => {
    it('normalizes to HH:MM', () => {
        expect(toTimeValue('9:30')).toBe('09:30');
        expect(toTimeValue('09:30:00')).toBe('09:30');
        expect(toTimeValue('24:00')).toBe('');
        expect(toTimeValue('mañana')).toBe('');
    });

    it('detects overnight periods and missing times', () => {
        expect(isOvernight({ open: '20:00', close: '02:00' })).toBe(true);
        expect(isOvernight({ open: '13:00', close: '16:00' })).toBe(false);
        expect(timeRangeError({ open: '13:00', close: '' })).toBe('Falta la hora de cierre');
        expect(timeRangeError({ open: '', close: '16:00' })).toBe('Falta la hora de apertura');
        expect(timeRangeError({ open: '20:00', close: '02:00' })).toBeNull();
    });
});

describe('quickRange', () => {
    // Martes 6 de octubre de 2026.
    const tuesday = new Date(2026, 9, 6, 23, 30);

    it('builds the presets in local time', () => {
        expect(toDateInput(tuesday)).toBe('2026-10-06');
        expect(quickRange('today', tuesday)).toEqual({ start: '2026-10-06', end: '2026-10-06' });
        expect(quickRange('weekend', tuesday)).toEqual({ start: '2026-10-10', end: '2026-10-11' });
        expect(quickRange('week', tuesday)).toEqual({ start: '2026-10-06', end: '2026-10-12' });
        expect(quickRange('month', tuesday)).toEqual({ start: '2026-10-06', end: '2026-10-31' });
        expect(quickRange('open', tuesday)).toEqual({ start: '2026-10-06', end: '' });
    });

    it('«Este finde» starts today on Saturday and Sunday', () => {
        expect(quickRange('weekend', new Date(2026, 9, 10))).toEqual({ start: '2026-10-10', end: '2026-10-11' });
        expect(quickRange('weekend', new Date(2026, 9, 11))).toEqual({ start: '2026-10-11', end: '2026-10-11' });
    });
});

describe('businessErrorCopy', () => {
    it('maps the known codes', () => {
        expect(businessErrorCopy(callableError('aborted'))).toEqual({ code: 'aborted', message: '🔄 Alguien cambió estos datos.', action: 'reload' });
        expect(businessErrorCopy(callableError('resource-exhausted', 'Has hecho demasiados cambios hoy en este negocio.')).message)
            .toBe('⏳ Has hecho muchos cambios hoy; vuelve a intentarlo mañana.');
        expect(businessErrorCopy(callableError('permission-denied')).message).toBe('🔒 Necesitas Business Pro activo para esto.');
    });

    it('uses the server message, or the fallback for generic ones', () => {
        expect(businessErrorCopy(callableError('invalid-argument', 'El enlace no es válido.')).message).toBe('El enlace no es válido.');
        expect(businessErrorCopy(callableError('internal')).message).toBe('😕 No se pudo guardar.');
        expect(businessErrorCopy(new TypeError('Failed to fetch')).message).toBe('😕 No se pudo guardar.');
        expect(businessErrorCopy(null, '😕 No se pudo guardar el precio').message).toBe('😕 No se pudo guardar el precio');
    });
});

describe('useDirtyState', () => {
    it('deep-compares, treating undefined keys as missing', () => {
        expect(isDeepEqual({ a: [1, { b: 'x' }], c: undefined }, { a: [1, { b: 'x' }] })).toBe(true);
        expect(isDeepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
        expect(isDeepEqual({ a: '' }, { a: undefined })).toBe(false);

        const { result, rerender } = renderHook(({ draft }) => useDirtyState({ name: 'Bar Pepe', tags: ['tapas'] }, draft), {
            initialProps: { draft: { name: 'Bar Pepe', tags: ['tapas'] } },
        });
        expect(result.current.dirty).toBe(false);
        rerender({ draft: { name: 'Bar Pepe', tags: ['tapas', 'vermut'] } });
        expect(result.current.dirty).toBe(true);
    });

    it('accepts a custom comparator', () => {
        const { result } = renderHook(() => useDirtyState({ id: 1, at: 1 }, { id: 1, at: 2 }, (a, b) => a.id === b.id));
        expect(result.current.dirty).toBe(false);
    });
});
