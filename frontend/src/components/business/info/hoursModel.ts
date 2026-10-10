import type { BusinessHoursPeriod, BusinessWeeklyHours } from '../../../types/businessInfo';
import { MAX_SHIFTS_PER_DAY } from '../../../constants/businessInfoOptions';
import { toTimeValue } from '../kit/time';

// Ayudas del horario semanal (🕒 Horarios). El borrador guarda solo los días
// tocados o guardados; en pantalla siempre se ven los 7 (lunes = 0).

export const EMPTY_PERIOD: BusinessHoursPeriod = { open: '', close: '' };

export const isEmptyPeriod = (period: BusinessHoursPeriod | undefined): boolean => (
    !period || (!toTimeValue(period.open) && !toTimeValue(period.close) && !period.open?.trim() && !period.close?.trim())
);

export const isValidPeriod = (period: BusinessHoursPeriod | undefined): boolean => {
    if (!period) return false;
    const open = toTimeValue(period.open);
    const close = toTimeValue(period.close);
    return Boolean(open && close && open !== close);
};

/** Un día sin cerrar y sin ninguna hora escrita: «sin indicar» (no se guarda). */
export const isUnsetDay = (day: BusinessWeeklyHours): boolean => (
    day.closed !== true && (day.periods || []).every(isEmptyPeriod)
);

/** Los 7 días para pintar: cada uno con al menos un turno (vacío si no hay). */
export const displayWeek = (weekly: BusinessWeeklyHours[] | undefined): BusinessWeeklyHours[] => {
    const byDay = new Map((weekly || []).map((entry) => [entry.day, entry]));
    return Array.from({ length: 7 }, (_, day) => {
        const stored = byDay.get(day);
        const periods = (stored?.periods || []).slice(0, MAX_SHIFTS_PER_DAY);
        return {
            day,
            closed: stored?.closed === true,
            periods: periods.length ? periods : [{ ...EMPTY_PERIOD }],
        };
    });
};

/**
 * Cambia un día del borrador. Un día «sin indicar» se quita del array, así el
 * borrador sin tocar es igual que lo guardado.
 */
export const withDay = (weekly: BusinessWeeklyHours[] | undefined, next: BusinessWeeklyHours): BusinessWeeklyHours[] => {
    const others = (weekly || []).filter((entry) => entry.day !== next.day);
    const entry: BusinessWeeklyHours = {
        day: next.day,
        closed: next.closed === true,
        periods: (next.periods || []).slice(0, MAX_SHIFTS_PER_DAY).map((period) => ({ open: period.open, close: period.close })),
    };
    const result = isUnsetDay(entry) ? others : [...others, entry];
    return result.sort((a, b) => a.day - b.day);
};

/** Copia el horario de un día a otros días (los turnos válidos o «cerrado»). */
export const copyDayTo = (weekly: BusinessWeeklyHours[] | undefined, fromDay: number, toDays: number[]): BusinessWeeklyHours[] => {
    const source = displayWeek(weekly)[fromDay];
    const periods = source.closed ? [] : (source.periods || []).filter(isValidPeriod);
    return toDays
        .filter((day) => day !== fromDay)
        .reduce((acc, day) => withDay(acc, { day, closed: source.closed === true, periods: source.closed ? [] : periods.map((period) => ({ ...period })) }), weekly || []);
};

/** ¿Se puede copiar este día? (tiene turnos válidos o está cerrado). */
export const isCopyableDay = (weekly: BusinessWeeklyHours[] | undefined, day: number): boolean => {
    const entry = displayWeek(weekly)[day];
    return entry.closed === true || (entry.periods || []).some(isValidPeriod);
};

/** Aplica una plantilla a los días abiertos (a toda la semana si no hay nada). */
export const applyPreset = (weekly: BusinessWeeklyHours[] | undefined, periods: BusinessHoursPeriod[]): BusinessWeeklyHours[] => {
    const week = displayWeek(weekly);
    return week
        .filter((day) => day.closed !== true)
        .reduce((acc, day) => withDay(acc, { day: day.day, closed: false, periods: periods.map((period) => ({ ...period })) }), weekly || []);
};

const toMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

/** Tramos de la mini línea de 24 h, en porcentaje (los que cruzan medianoche se parten en dos). */
export const timelineSegments = (periods: BusinessHoursPeriod[] | undefined): Array<{ start: number; width: number }> => {
    const day = 24 * 60;
    const percent = (minutes: number) => Math.round((minutes / day) * 1000) / 10;
    return (periods || []).filter(isValidPeriod).flatMap((period) => {
        const open = toMinutes(toTimeValue(period.open));
        const close = toMinutes(toTimeValue(period.close));
        if (close > open) return [{ start: percent(open), width: percent(close - open) }];
        const segments = [{ start: percent(open), width: percent(day - open) }];
        if (close > 0) segments.unshift({ start: 0, width: percent(close) });
        return segments;
    });
};

/** «8:00–20:00» para las plantillas. */
export const formatPeriod = (period: BusinessHoursPeriod): string => {
    const short = (time: string) => time.replace(/^0(\d)/, '$1');
    return `${short(period.open)}–${short(period.close)}`;
};
