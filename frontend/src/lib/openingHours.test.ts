import { describe, expect, it } from 'vitest';
import { todayHours } from './openingHours';

const google = ['lunes: Cerrado', 'martes: 12:00–16:00, 20:00–23:30', 'miércoles: 12:00–16:00', 'sábado: 12:00–0:30'];

describe('todayHours', () => {
    it('encuentra el día con y sin tildes, en español o inglés', () => {
        expect(todayHours(google, new Date(2026, 9, 6))).toBe('12:00–16:00, 20:00–23:30'); // martes
        expect(todayHours(google, new Date(2026, 9, 7))).toBe('12:00–16:00'); // miércoles
        expect(todayHours(google, new Date(2026, 9, 10))).toBe('12:00–0:30'); // sábado
        expect(todayHours(['Monday: 9:00 AM – 5:00 PM'], new Date(2026, 9, 5))).toBe('9:00 AM – 5:00 PM');
        expect(todayHours(['Lunes: Cerrado'], new Date(2026, 9, 5))).toBe('Cerrado');
    });

    it('null si no hay horario o no aparece hoy', () => {
        expect(todayHours(undefined)).toBeNull();
        expect(todayHours(google, new Date(2026, 9, 4))).toBeNull(); // domingo
    });
});
