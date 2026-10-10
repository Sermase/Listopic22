/**
 * Medidor de progreso con puntos de emoji, nivel y empujoncito «Siguiente».
 *
 *   <ProgressMeter value={70} title="🎯 Tu ficha está al 70 %"
 *     dots={SECTIONS.map((s) => ({ emoji: s.emoji, label: s.title, done: s.status === 'complete' }))}
 *     next={<>🕒 Horarios: la gente mira si estás abierto antes de ir</>} />
 *   <ProgressMeter compact value={45} title="Tu carta" level="🍳 Cocinando" />
 *
 * role="progressbar" (0-100), relleno con --lt-accent-grad; los puntos sin
 * hacer salen en gris.
 */
import React, { useId } from 'react';
import { cn } from '../../../lib/utils';

export interface ProgressDot {
    emoji: string;
    label: string;
    done: boolean;
}

export interface ProgressMeterProps {
    /** 0-100. */
    value: number;
    title: React.ReactNode;
    dots?: ProgressDot[];
    /** Etiqueta de nivel: «🍳 Cocinando». */
    level?: React.ReactNode;
    /** Lo siguiente que conviene hacer (sin el «Siguiente:», lo pone el componente). */
    next?: React.ReactNode;
    compact?: boolean;
    className?: string;
}

export const ProgressMeter: React.FC<ProgressMeterProps> = ({ value, title, dots, level, next, compact = false, className }) => {
    const titleId = useId();
    const percent = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

    return (
        <div className={cn('space-y-2.5', className)}>
            <div className="flex items-center justify-between gap-3">
                <p id={titleId} className={cn('font-black text-[var(--lt-text)]', compact ? 'text-sm' : 'text-base')}>{title}</p>
                {level && (
                    <span className="shrink-0 rounded-full bg-[var(--lt-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--lt-text)]">{level}</span>
                )}
            </div>
            <div
                role="progressbar"
                aria-labelledby={titleId}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${percent} %`}
                className={cn('overflow-hidden rounded-full bg-[var(--lt-border-strong)]', compact ? 'h-2' : 'h-3')}
            >
                <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: `${percent}%`, backgroundImage: 'var(--lt-accent-grad)' }}
                />
            </div>
            {dots && dots.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Pasos">
                    {dots.map((dot) => (
                        <li
                            key={dot.label}
                            title={`${dot.label}: ${dot.done ? 'hecho' : 'pendiente'}`}
                            className={cn(
                                'grid h-8 w-8 place-items-center rounded-full border text-base leading-none transition',
                                dot.done
                                    ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]'
                                    : 'border-[var(--lt-border)] bg-[var(--lt-glass)] opacity-60 grayscale',
                            )}
                        >
                            <span aria-hidden="true">{dot.emoji}</span>
                            <span className="sr-only">{`${dot.label}: ${dot.done ? 'hecho' : 'pendiente'}`}</span>
                        </li>
                    ))}
                </ul>
            )}
            {next && (
                <p className="text-sm text-[var(--lt-text-muted)]">
                    <span className="font-semibold text-[var(--lt-text)]">Siguiente:</span> {next}
                </p>
            )}
        </div>
    );
};
