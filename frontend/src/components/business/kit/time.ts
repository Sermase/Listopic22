/**
 * Horas de un turno ({ open, close } en 'HH:MM'), compartido por TimeRangeRow
 * y la validación del formulario de horarios:
 *
 *   toTimeValue('9:5')                                // '' (no es una hora)
 *   toTimeValue('9:30')                               // '09:30'
 *   isOvernight({ open: '20:00', close: '02:00' })    // true
 *   timeRangeError({ open: '13:00', close: '' })      // 'Falta la hora de cierre'
 */

export interface TimePeriod {
    open: string;
    close: string;
}

/** 'H:MM' o 'HH:MM[:SS]' → 'HH:MM'; cualquier otra cosa → ''. */
export const toTimeValue = (value: string | undefined | null): string => {
    const match = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(value || '');
    if (!match) return '';
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return '';
    return `${String(hours).padStart(2, '0')}:${match[2]}`;
};

/** Cierra al día siguiente (cierre antes que apertura). */
export const isOvernight = (period: TimePeriod): boolean => {
    const open = toTimeValue(period.open);
    const close = toTimeValue(period.close);
    return Boolean(open && close && close < open);
};

/** Mensaje de error del turno, o null si está bien. */
export const timeRangeError = (period: TimePeriod): string | null => {
    const open = toTimeValue(period.open);
    const close = toTimeValue(period.close);
    if (!open && !close) return 'Faltan las horas de este turno';
    if (!open) return 'Falta la hora de apertura';
    if (!close) return 'Falta la hora de cierre';
    if (open === close) return 'La apertura y el cierre no pueden ser iguales';
    return null;
};
