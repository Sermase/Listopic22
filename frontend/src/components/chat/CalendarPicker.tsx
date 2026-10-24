import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MEAL_TIMES, atTime, formatLongDay, formatTime, monthMatrix, startOfDay } from '../../lib/chatExtras';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const OTHER_TIMES = Array.from({ length: 34 }, (_, i) => {
    const minutes = 7 * 60 + i * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`;
});

/** Calendario del mes y horas de comida/cena: dos toques y listo. */
export const CalendarPicker: React.FC<{ value: number | null; onChange: (ms: number | null) => void }> = ({ value, onChange }) => {
    const [now] = useState(() => Date.now());
    const today = startOfDay(now);
    const initial = new Date(value ?? now);
    const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
    const [day, setDay] = useState<number | null>(value ? startOfDay(value) : null);
    const [time, setTime] = useState<string | null>(value ? formatTime(value) : null);

    const monthName = new Date(view.year, view.month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const canGoBack = view.year > new Date(now).getFullYear() || (view.year === new Date(now).getFullYear() && view.month > new Date(now).getMonth());
    const move = (delta: number) => setView(({ year, month }) => {
        const d = new Date(year, month + delta, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
    });

    const pick = (nextDay: number | null, nextTime: string | null) => {
        setDay(nextDay);
        setTime(nextTime);
        onChange(nextDay !== null && nextTime ? atTime(nextDay, nextTime) : null);
    };

    const isPastTime = (t: string) => day !== null && atTime(day, t) < now;
    const extraTime = time && !MEAL_TIMES.includes(time) ? time : '';

    return (
        <div>
            <div className="rounded-2xl bg-[var(--lt-bg)] border border-white/10 p-3">
                <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => move(-1)} disabled={!canGoBack} className="p-1.5 rounded-full text-gray-300 hover:bg-white/10 disabled:opacity-25" aria-label="Mes anterior">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-white">{monthLabel}</span>
                    <button type="button" onClick={() => move(1)} className="p-1.5 rounded-full text-gray-300 hover:bg-white/10" aria-label="Mes siguiente">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEKDAYS.map((w) => <span key={w} className="text-[10px] font-bold text-gray-500 py-1">{w}</span>)}
                    {monthMatrix(view.year, view.month).flat().map((d, i) => {
                        if (d === null) return <span key={`e${i}`} />;
                        const ms = new Date(view.year, view.month, d).getTime();
                        const past = ms < today;
                        const selected = day === ms;
                        const isToday = ms === today;
                        return (
                            <button
                                key={ms}
                                type="button"
                                disabled={past}
                                onClick={() => pick(ms, time && atTime(ms, time) >= now ? time : null)}
                                aria-label={formatLongDay(ms)}
                                aria-pressed={selected}
                                className={`aspect-square rounded-full text-sm font-semibold transition-colors ${selected
                                    ? 'bg-[var(--lt-accent)] text-white shadow-md shadow-[var(--lt-accent-shadow)]'
                                    : past
                                        ? 'text-gray-600'
                                        : `text-gray-200 hover:bg-white/10 ${isToday ? 'ring-1 ring-[var(--lt-accent-border)]' : ''}`}`}
                            >
                                {d}
                            </button>
                        );
                    })}
                </div>
            </div>

            {day !== null && (
                <div className="mt-3 animate-fade-in">
                    <p className="text-xs text-gray-400 mb-2">{formatLongDay(day)} · ¿a qué hora?</p>
                    <div className="grid grid-cols-5 gap-1.5">
                        {MEAL_TIMES.map((t) => (
                            <button
                                key={t}
                                type="button"
                                disabled={isPastTime(t)}
                                onClick={() => pick(day, t)}
                                className={`py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-25 ${time === t
                                    ? 'bg-[var(--lt-accent)] text-white'
                                    : 'bg-white/5 text-gray-200 hover:bg-white/10'}`}
                            >
                                {t}
                            </button>
                        ))}
                        <select
                            value={extraTime}
                            onChange={(e) => e.target.value && pick(day, e.target.value)}
                            aria-label="Otra hora"
                            className={`py-2 rounded-xl text-xs font-bold text-center appearance-none [color-scheme:dark] ${extraTime ? 'bg-[var(--lt-accent)] text-white' : 'bg-white/5 text-gray-200'}`}
                        >
                            <option value="">Otra</option>
                            {OTHER_TIMES.filter((t) => !MEAL_TIMES.includes(t) && !isPastTime(t)).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
};
