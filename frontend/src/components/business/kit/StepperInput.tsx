/**
 * Número con botones −/+ de 44px (días de campaña, unidades…).
 *
 *   <StepperInput label="Duración" value={days} min={1} max={30} onChange={setDays} suffix="días" />
 *
 * El número central es un role="spinbutton": flechas ↑/↓, RePág/AvPág (±5),
 * Inicio y Fin también lo cambian.
 */
import React, { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { kit } from './styles';

export interface StepperInputProps {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    label: React.ReactNode;
    /** Unidad tras el número: «días», «km». */
    suffix?: string;
    step?: number;
    labelHidden?: boolean;
    disabled?: boolean;
    className?: string;
}

export const StepperInput: React.FC<StepperInputProps> = ({
    value, min, max, onChange, label, suffix, step = 1, labelHidden = false, disabled = false, className,
}) => {
    const labelId = useId();
    const clamp = (next: number) => Math.min(max, Math.max(min, next));
    const set = (next: number) => {
        const clamped = clamp(next);
        if (clamped !== value) onChange(clamped);
    };
    const valueText = suffix ? `${value} ${suffix}` : String(value);

    const buttonClass = cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        kit.focus,
        kit.idle,
    );

    return (
        <div className={cn('space-y-1.5', className)}>
            <span id={labelId} className={cn(kit.label, 'block', labelHidden && 'sr-only')}>{label}</span>
            <div role="group" aria-labelledby={labelId} className="inline-flex items-center gap-2">
                <button
                    type="button"
                    aria-label={`Restar ${step}`}
                    disabled={disabled || value <= min}
                    onClick={() => set(value - step)}
                    className={buttonClass}
                >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span
                    role="spinbutton"
                    tabIndex={disabled ? -1 : 0}
                    aria-labelledby={labelId}
                    aria-valuenow={value}
                    aria-valuemin={min}
                    aria-valuemax={max}
                    aria-valuetext={valueText}
                    aria-disabled={disabled || undefined}
                    onKeyDown={(event) => {
                        if (disabled) return;
                        const map: Record<string, number> = {
                            ArrowUp: value + step,
                            ArrowRight: value + step,
                            ArrowDown: value - step,
                            ArrowLeft: value - step,
                            PageUp: value + step * 5,
                            PageDown: value - step * 5,
                            Home: min,
                            End: max,
                        };
                        if (!(event.key in map)) return;
                        event.preventDefault();
                        set(map[event.key]);
                    }}
                    className={cn(
                        'inline-flex min-h-11 min-w-[4.5rem] items-baseline justify-center gap-1 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2',
                        kit.focus,
                    )}
                >
                    <span className="text-lg font-black tabular-nums text-[var(--lt-text)]">{value}</span>
                    {suffix && <span className="text-xs font-semibold text-[var(--lt-text-muted)]">{suffix}</span>}
                </span>
                <button
                    type="button"
                    aria-label={`Sumar ${step}`}
                    disabled={disabled || value >= max}
                    onClick={() => set(value + step)}
                    className={buttonClass}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};
