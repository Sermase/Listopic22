/**
 * Un turno de horario: apertura y cierre con <input type="time" step={900}> (HH:MM).
 *
 *   <TimeRangeRow label="🌞 Comida" period={p} onChange={(next) => setPeriod(i, next)}
 *     onRemove={periods.length > 1 ? () => removePeriod(i) : undefined} />
 *
 * Avisa «🌙 hasta el día siguiente» si cierra antes de abrir, y marca como
 * error «Falta la hora de cierre» (validación: timeRangeError en ./time).
 * `showErrors={false}` oculta los errores hasta que la persona intente guardar.
 */
import React, { useId } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { kit } from './styles';
import { isOvernight, timeRangeError, toTimeValue, type TimePeriod } from './time';

export interface TimeRangeRowProps {
    period: TimePeriod;
    onChange: (period: TimePeriod) => void;
    onRemove?: () => void;
    label?: React.ReactNode;
    /** Contexto para lectores de pantalla: «Lunes, comida» → «Lunes, comida: abre». */
    a11yLabel?: string;
    /** Error externo; si no, se calcula con timeRangeError. */
    error?: string | null;
    showErrors?: boolean;
    disabled?: boolean;
    className?: string;
}

export const TimeRangeRow: React.FC<TimeRangeRowProps> = ({
    period, onChange, onRemove, label, a11yLabel, error, showErrors = true, disabled = false, className,
}) => {
    const openId = useId();
    const closeId = useId();
    const messageId = useId();
    const open = toTimeValue(period.open);
    const close = toTimeValue(period.close);
    const problem = error !== undefined ? error : timeRangeError(period);
    // Un turno recién añadido (sin horas) no se pinta en rojo: solo se recuerda.
    const fresh = !open && !close && error === undefined;
    const visibleError = showErrors ? problem : null;
    const overnight = isOvernight(period);
    const plainLabel = a11yLabel ?? (typeof label === 'string' ? label : 'turno');

    // Ancho para «01:00 PM» con el reloj del navegador (relojes de 12 h), no solo «13:00».
    const inputClass = (invalid: boolean) => cn(
        kit.input,
        'w-[8.5rem] px-2 tabular-nums',
        invalid && 'border-[var(--lt-danger)] focus:border-[var(--lt-danger)] focus:ring-[var(--lt-danger-soft)]',
    );

    return (
        <div className={cn('space-y-1', className)}>
            <div className="flex flex-wrap items-end gap-2">
                {/* En móvil: nombre del turno y papelera arriba, las dos horas debajo (caben con «01:00 PM»). */}
                {label && <span className="order-1 min-w-0 flex-1 self-center text-xs font-semibold text-[var(--lt-text-muted)] sm:min-w-[5.5rem] sm:flex-none">{label}</span>}
                {label && <span aria-hidden="true" className="order-3 h-0 basis-full sm:hidden" />}
                <div className="order-4 space-y-1">
                    <label htmlFor={openId} className="block text-xs text-[var(--lt-text-muted)]">Abre</label>
                    <input
                        id={openId}
                        aria-label={a11yLabel ? `${a11yLabel}: abre` : undefined}
                        type="time"
                        step={900}
                        value={open}
                        disabled={disabled}
                        aria-invalid={Boolean(visibleError && !fresh && !open) || undefined}
                        aria-describedby={visibleError || overnight ? messageId : undefined}
                        onChange={(event) => onChange({ ...period, open: event.target.value })}
                        className={inputClass(Boolean(visibleError && !fresh && !open))}
                    />
                </div>
                <span aria-hidden="true" className="order-4 pb-3 text-[var(--lt-text-muted)]">→</span>
                <div className="order-4 space-y-1">
                    <label htmlFor={closeId} className="block text-xs text-[var(--lt-text-muted)]">Cierra</label>
                    <input
                        id={closeId}
                        aria-label={a11yLabel ? `${a11yLabel}: cierra` : undefined}
                        type="time"
                        step={900}
                        value={close}
                        disabled={disabled}
                        aria-invalid={Boolean(visibleError && !fresh && !close) || undefined}
                        aria-describedby={visibleError || overnight ? messageId : undefined}
                        onChange={(event) => onChange({ ...period, close: event.target.value })}
                        className={inputClass(Boolean(visibleError && !fresh && !close))}
                    />
                </div>
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        disabled={disabled}
                        aria-label={`Quitar ${plainLabel}`}
                        title={`Quitar ${plainLabel}`}
                        className={cn(
                            'grid h-11 w-11 place-items-center rounded-xl text-[var(--lt-text-muted)] transition-colors hover:bg-[var(--lt-danger-soft)] hover:text-[var(--lt-danger)]',
                            label ? 'order-2 sm:order-5' : 'order-5',
                            kit.focus,
                        )}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>
            {(visibleError || overnight) && (
                <p id={messageId} className={cn('text-xs font-semibold', visibleError && !fresh ? 'text-[var(--lt-danger)]' : 'text-[var(--lt-text-muted)]')}>
                    {visibleError ?? <><span aria-hidden="true">🌙 </span>hasta el día siguiente</>}
                </p>
            )}
        </div>
    );
};
