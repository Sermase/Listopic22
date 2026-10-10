import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

import { applyPreset, copyDayTo, displayWeek, formatPeriod, isCopyableDay, timelineSegments, withDay } from './hoursModel';

describe('hoursModel', () => {
    it('displayWeek enseña los 7 días y conserva todos los turnos guardados (F2)', () => {
        const week = displayWeek([{ day: 3, periods: [{ open: '13:00', close: '16:00' }, { open: '20:00', close: '23:30' }] }]);
        expect(week).toHaveLength(7);
        expect(week[3].periods).toHaveLength(2);
        expect(week[0].periods).toEqual([{ open: '', close: '' }]);
    });

    it('withDay quita los días sin indicar, así el borrador sin tocar no tiene cambios', () => {
        const stored = [{ day: 1, closed: false, periods: [{ open: '09:00', close: '14:00' }] }];
        expect(withDay(stored, { day: 1, closed: false, periods: [{ open: '', close: '' }] })).toEqual([]);
        expect(withDay([], { day: 4, closed: true, periods: [{ open: '', close: '' }] })).toEqual([
            { day: 4, closed: true, periods: [{ open: '', close: '' }] },
        ]);
    });

    it('copia el lunes a laborables o a toda la semana', () => {
        const monday = [{ day: 0, closed: false, periods: [{ open: '08:00', close: '15:00' }] }];
        expect(isCopyableDay(monday, 0)).toBe(true);
        expect(isCopyableDay([], 0)).toBe(false);
        expect(copyDayTo(monday, 0, [0, 1, 2, 3, 4]).map((day) => day.day)).toEqual([0, 1, 2, 3, 4]);
        expect(copyDayTo(monday, 0, [0, 1, 2, 3, 4, 5, 6])).toHaveLength(7);
    });

    it('las plantillas respetan los días cerrados', () => {
        const result = applyPreset([{ day: 6, closed: true, periods: [] }], [{ open: '19:00', close: '02:00' }]);
        expect(result.find((day) => day.day === 6)).toMatchObject({ closed: true });
        expect(result.filter((day) => !day.closed)).toHaveLength(6);
    });

    it('la mini línea parte los turnos que cruzan medianoche', () => {
        expect(timelineSegments([{ open: '12:00', close: '18:00' }])).toEqual([{ start: 50, width: 25 }]);
        expect(timelineSegments([{ open: '20:00', close: '02:00' }])).toEqual([
            { start: 0, width: 8.3 },
            { start: 83.3, width: 16.7 },
        ]);
        expect(formatPeriod({ open: '08:00', close: '20:00' })).toBe('8:00–20:00');
    });
});
