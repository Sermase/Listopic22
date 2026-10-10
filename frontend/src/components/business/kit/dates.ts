/**
 * Rangos rápidos de fechas ('YYYY-MM-DD', hora local) para QuickDateRange:
 *
 *   quickRange('weekend', new Date(2026, 9, 7))  // { start: '2026-10-10', end: '2026-10-11' }
 *   quickRange('open', today)                    // { start: hoy, end: '' } (sin fin)
 */

export type QuickRangePreset = 'today' | 'weekend' | 'week' | 'month' | 'open';

export interface DateRangeValue {
    start: string;
    end: string;
}

/** Date → 'YYYY-MM-DD' en hora local (no UTC: a medianoche no cambia el día). */
export const toDateInput = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const quickRange = (preset: QuickRangePreset, now: Date = new Date()): DateRangeValue => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (preset) {
        case 'today':
            return { start: toDateInput(today), end: toDateInput(today) };
        case 'weekend': {
            const day = today.getDay(); // 0 domingo … 6 sábado
            if (day === 0) return { start: toDateInput(today), end: toDateInput(today) };
            const saturday = addDays(today, 6 - day);
            return { start: toDateInput(day === 6 ? today : saturday), end: toDateInput(addDays(saturday, 1)) };
        }
        case 'week':
            return { start: toDateInput(today), end: toDateInput(addDays(today, 6)) };
        case 'month':
            return { start: toDateInput(today), end: toDateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
        case 'open':
            return { start: toDateInput(today), end: '' };
    }
};
