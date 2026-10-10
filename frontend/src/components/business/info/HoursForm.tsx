import React from 'react';
import { Plus } from 'lucide-react';
import {
    HOURS_PRESETS,
    INFO_LIMITS,
    MAX_SHIFTS_PER_DAY,
    SHIFT_LABELS,
    WEEKDAY_OPTIONS,
} from '../../../constants/businessInfoOptions';
import type { BusinessHoursPeriod, BusinessWeeklyHours } from '../../../types/businessInfo';
import { cn } from '../../../lib/utils';
import { Switch, TextAreaField, TimeRangeRow, kit } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FormStack } from './formParts';
import {
    EMPTY_PERIOD,
    applyPreset,
    copyDayTo,
    displayWeek,
    formatPeriod,
    isCopyableDay,
    isUnsetDay,
    timelineSegments,
    withDay,
} from './hoursModel';

const WORKDAYS = [0, 1, 2, 3, 4];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const chipClass = cn('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', kit.focus, kit.idle);

/** «🌞 Comida», «🌙 Cena», «Turno 3»… (sin nombre si solo hay uno). */
const shiftName = (index: number, total: number): { emoji?: string; label: string } | null => {
    if (total <= 1) return null;
    const known = SHIFT_LABELS[index];
    return known ? { emoji: known.emoji, label: known.label } : { label: `Turno ${index + 1}` };
};

/** Mini línea de 24 h con los turnos del día (decorativa: las horas ya están en los campos). */
const DayTimeline: React.FC<{ periods: BusinessHoursPeriod[] | undefined }> = ({ periods }) => {
    const segments = timelineSegments(periods);
    return (
        <div aria-hidden="true" className="space-y-1">
            <div className="relative h-2 overflow-hidden rounded-full bg-[var(--lt-border)]">
                {segments.map((segment) => (
                    <span
                        key={`${segment.start}-${segment.width}`}
                        className="absolute inset-y-0 rounded-full bg-[var(--lt-accent)]"
                        style={{ left: `${segment.start}%`, width: `${segment.width}%` }}
                    />
                ))}
            </div>
            <div className="flex justify-between text-[10px] font-semibold tabular-nums text-[var(--lt-text-muted)]">
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
            </div>
        </div>
    );
};

/** 🕒 Horarios: 7 días, varios turnos por día, atajos y plantillas. */
export const HoursForm: React.FC<SectionFormProps<'hours'>> = ({ doc, onChange }) => {
    const weekly = doc.data.weeklySchedule;
    const week = displayWeek(weekly);
    const setWeekly = (next: BusinessWeeklyHours[]) => onChange({ weeklySchedule: next });
    const updateDay = (entry: BusinessWeeklyHours) => setWeekly(withDay(weekly, entry));
    const mondayCopyable = isCopyableDay(weekly, 0);

    return (
        <FormStack>
            <div className="space-y-3">
                <p className={kit.label}><EmojiText emoji="⚡">Atajos</EmojiText></p>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={chipClass}
                        disabled={!mondayCopyable}
                        title={mondayCopyable ? undefined : 'Primero pon el horario del lunes'}
                        onClick={() => setWeekly(copyDayTo(weekly, 0, WORKDAYS))}
                    >
                        <span aria-hidden="true">📋</span> Copiar lunes a laborables
                    </button>
                    <button
                        type="button"
                        className={chipClass}
                        disabled={!mondayCopyable}
                        title={mondayCopyable ? undefined : 'Primero pon el horario del lunes'}
                        onClick={() => setWeekly(copyDayTo(weekly, 0, ALL_DAYS))}
                    >
                        <span aria-hidden="true">📋</span> Copiar a toda la semana
                    </button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Plantillas de horario">
                    {HOURS_PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            className={chipClass}
                            onClick={() => setWeekly(applyPreset(weekly, preset.periods))}
                        >
                            <span aria-hidden="true">{preset.emoji}</span>
                            {preset.label}
                            <span className="font-normal text-[var(--lt-text-muted)]">{preset.periods.map(formatPeriod).join(' · ')}</span>
                        </button>
                    ))}
                </div>
                {!mondayCopyable && <p className="text-xs text-[var(--lt-text-muted)]">Pon el lunes y cópialo al resto con un toque.</p>}
            </div>

            <ul className="divide-y divide-[var(--lt-border)]" aria-label="Horario de la semana">
                {week.map((day) => {
                    const option = WEEKDAY_OPTIONS[day.day];
                    const periods = day.periods || [];
                    const closed = day.closed === true;
                    const unset = isUnsetDay(day);
                    const setPeriod = (index: number, period: BusinessHoursPeriod) => updateDay({
                        ...day,
                        periods: periods.map((current, i) => (i === index ? period : current)),
                    });
                    const removePeriod = (index: number) => updateDay({ ...day, periods: periods.filter((_, i) => i !== index) });
                    const addPeriod = () => updateDay({ ...day, periods: [...periods, { ...EMPTY_PERIOD }] });

                    return (
                        <li key={day.day} className="space-y-3 py-4 first:pt-0 last:pb-0">
                            <div className="flex items-center gap-3">
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm font-black',
                                        closed || unset ? 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text-muted)]' : kit.selected,
                                    )}
                                >
                                    {option.short}
                                </span>
                                <span className="min-w-0 flex-1 text-sm font-bold text-[var(--lt-text)]">{option.label}</span>
                                <Switch
                                    checked={!closed}
                                    onChange={(open) => updateDay({ ...day, closed: !open })}
                                    label={`${option.label}: abierto`}
                                    labelHidden
                                    onText="Abierto"
                                    offText={<EmojiText emoji="🌙">Cerrado</EmojiText>}
                                    variant="plain"
                                    className="shrink-0 px-1"
                                />
                            </div>

                            {!closed && (
                                <div className="space-y-3 sm:pl-[3.25rem]">
                                    {periods.map((period, index) => {
                                        const name = shiftName(index, periods.length);
                                        return (
                                            <TimeRangeRow
                                                key={index}
                                                period={period}
                                                label={name ? <EmojiText emoji={name.emoji || '🕒'}>{name.label}</EmojiText> : undefined}
                                                a11yLabel={name ? `${option.label}, ${name.label.toLowerCase()}` : option.label}
                                                onChange={(next) => setPeriod(index, next)}
                                                onRemove={periods.length > 1 ? () => removePeriod(index) : undefined}
                                                showErrors={!unset}
                                            />
                                        );
                                    })}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {periods.length < MAX_SHIFTS_PER_DAY && !unset && (
                                            <button
                                                type="button"
                                                onClick={addPeriod}
                                                className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[var(--lt-accent)] hover:bg-[var(--lt-accent-soft)]', kit.focus)}
                                            >
                                                <Plus className="h-4 w-4" aria-hidden="true" /> Añadir turno
                                            </button>
                                        )}
                                        {unset && <span className="text-xs text-[var(--lt-text-muted)]">Sin indicar: este día no saldrá en tu ficha.</span>}
                                    </div>
                                    {!unset && <DayTimeline periods={periods} />}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <TextAreaField
                label={<EmojiText emoji="📝">Notas de horario</EmojiText>}
                value={doc.data.notes || ''}
                onChange={(notes) => onChange({ notes })}
                max={INFO_LIMITS.notes}
                rows={3}
                placeholder="Cocina abierta hasta las 23:00, en agosto cerramos por vacaciones…"
            />
        </FormStack>
    );
};
