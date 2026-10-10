/**
 * Rango de fechas con atajos: ⚡ Hoy · 🎉 Este finde · 📆 7 días · 🗓️ Este mes · ♾️ Sin fin.
 *
 *   <QuickDateRange legend="📅 ¿Cuándo?" start={offer.startDate} end={offer.endDate ?? ''}
 *     onChange={({ start, end }) => patch({ startDate: start, endDate: end || undefined })} allowOpenEnd />
 *
 * Fechas 'YYYY-MM-DD' (hora local). Debajo, dos <input type="date">; el final
 * con min={start}. Si el inicio pasa del final, el final se iguala al inicio.
 */
import React, { useId } from 'react';
import { cn } from '../../../lib/utils';
import { EmojiChip } from './EmojiChip';
import { quickRange, type DateRangeValue, type QuickRangePreset } from './dates';
import { kit } from './styles';

export interface QuickDateRangeProps {
    start: string;
    end: string;
    onChange: (range: DateRangeValue) => void;
    allowOpenEnd?: boolean;
    legend?: React.ReactNode;
    startLabel?: React.ReactNode;
    endLabel?: React.ReactNode;
    /** Primera fecha que se puede elegir (p. ej. hoy). */
    minDate?: string;
    disabled?: boolean;
    /** «Hoy» para los atajos (tests). */
    now?: Date;
    className?: string;
}

const PRESETS: Array<{ id: QuickRangePreset; emoji: string; label: string }> = [
    { id: 'today', emoji: '⚡', label: 'Hoy' },
    { id: 'weekend', emoji: '🎉', label: 'Este finde' },
    { id: 'week', emoji: '📆', label: '7 días' },
    { id: 'month', emoji: '🗓️', label: 'Este mes' },
    { id: 'open', emoji: '♾️', label: 'Sin fin' },
];

export const QuickDateRange: React.FC<QuickDateRangeProps> = ({
    start,
    end,
    onChange,
    allowOpenEnd = false,
    legend = '📅 Fechas',
    startLabel = 'Desde',
    endLabel = 'Hasta',
    minDate,
    disabled = false,
    now,
    className,
}) => {
    const startId = useId();
    const endId = useId();
    const presets = PRESETS.filter((preset) => preset.id !== 'open' || allowOpenEnd);

    const isActive = (preset: QuickRangePreset) => {
        if (preset === 'open') return Boolean(start) && !end;
        const range = quickRange(preset, now);
        return range.start === start && range.end === end;
    };

    const applyPreset = (preset: QuickRangePreset) => {
        if (preset === 'open') {
            onChange({ start: start || quickRange('open', now).start, end: '' });
            return;
        }
        onChange(quickRange(preset, now));
    };

    const changeStart = (nextStart: string) => {
        const nextEnd = end && nextStart && end < nextStart ? nextStart : end;
        onChange({ start: nextStart, end: nextEnd });
    };

    return (
        <fieldset className={cn('min-w-0 space-y-3', className)} disabled={disabled}>
            <legend className={kit.label}>{legend}</legend>
            <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                    <EmojiChip
                        key={preset.id}
                        emoji={preset.emoji}
                        label={preset.label}
                        size="sm"
                        selected={isActive(preset.id)}
                        disabled={disabled}
                        onToggle={() => applyPreset(preset.id)}
                    />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0 space-y-1.5">
                    <label htmlFor={startId} className={cn(kit.label, 'block')}>{startLabel}</label>
                    <input
                        id={startId}
                        type="date"
                        value={start}
                        min={minDate}
                        required
                        onChange={(event) => changeStart(event.target.value)}
                        className={cn(kit.input, 'px-2')}
                    />
                </div>
                <div className="min-w-0 space-y-1.5">
                    <label htmlFor={endId} className={cn(kit.label, 'block')}>{endLabel}</label>
                    <input
                        id={endId}
                        type="date"
                        value={end}
                        min={start || minDate}
                        required={!allowOpenEnd}
                        onChange={(event) => onChange({ start, end: event.target.value })}
                        className={cn(kit.input, 'px-2')}
                    />
                </div>
            </div>
            {allowOpenEnd && !end && start && (
                <p className="text-xs text-[var(--lt-text-muted)]"><span aria-hidden="true">♾️ </span>Sin fecha de fin: seguirá activa hasta que la quites.</p>
            )}
        </fieldset>
    );
};
