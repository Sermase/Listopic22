/**
 * Piezas pequeñas de 📊 Estadísticas: la tarjeta con su cabecera, el
 * esqueleto de carga y la chapa de nota (siempre con la escala de lib/scoreScale).
 *
 *   <StatsCard emoji="🧭" title="¿Cómo te encuentran?" busy={refreshing}>…</StatsCard>
 *   <ScoreChip score={8.4} withLabel />   // [8.4] 😍 Muy bueno
 */
import React, { useId } from 'react';
import { cn } from '../../../lib/utils';
import { formatScore, SCORE_BAND_EMOJI, SCORE_BAND_LABEL, scoreBadgeStyle, scoreBand } from '../../../lib/scoreScale';
import { Skeleton } from '../../Skeleton';
import { SectionHeader, SoftCard } from '../kit';

export interface StatsCardProps {
    emoji: string;
    title: React.ReactNode;
    help?: React.ReactNode;
    right?: React.ReactNode;
    /** Se está actualizando: se queda lo de antes, un poco apagado (sin saltos). */
    busy?: boolean;
    className?: string;
    children: React.ReactNode;
}

export const StatsCard: React.FC<StatsCardProps> = ({ emoji, title, help, right, busy = false, className, children }) => {
    const titleId = useId();
    return (
        <SoftCard
            as="section"
            aria-labelledby={titleId}
            aria-busy={busy || undefined}
            className={cn('min-w-0 space-y-4 p-4 transition-opacity sm:p-5', busy && 'opacity-60', className)}
        >
            <SectionHeader as="h3" id={titleId} emoji={emoji} title={title} help={help} right={right} />
            {children}
        </SoftCard>
    );
};

/** Esqueleto de una tarjeta mientras llega su fuente. */
export const CardSkeleton: React.FC<{ lines?: number; chart?: boolean; label: string }> = ({ lines = 2, chart = false, label }) => (
    <div className="space-y-3">
        <p role="status" className="sr-only">{label}</p>
        {chart && <Skeleton aria-hidden="true" className="h-36 w-full" />}
        {Array.from({ length: lines }, (_, index) => (
            <Skeleton key={index} aria-hidden="true" className={cn('h-4', index % 2 ? 'w-2/3' : 'w-full')} />
        ))}
    </div>
);

export interface ScoreChipProps {
    score: number | null | undefined;
    /** Añade «😍 Muy bueno» al lado. */
    withLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const chipSize = {
    sm: 'min-w-8 px-1.5 py-0.5 text-xs',
    md: 'min-w-10 px-2 py-1 text-sm',
    lg: 'min-w-14 px-2.5 py-1 text-2xl',
} as const;

/** Nota con el color de su tramo (T5: nunca un verde fijo). */
export const ScoreChip: React.FC<ScoreChipProps> = ({ score, withLabel = false, size = 'sm', className }) => {
    const band = scoreBand(score);
    const chip = (
        <span
            className={cn('inline-flex shrink-0 items-center justify-center rounded-lg font-black leading-none', chipSize[size], !withLabel && className)}
            style={scoreBadgeStyle(score)}
        >
            {formatScore(score)}
        </span>
    );
    if (!withLabel) return chip;
    return (
        <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
            {chip}
            <span className="text-sm font-bold text-[var(--lt-text)]">
                <span aria-hidden="true">{SCORE_BAND_EMOJI[band]} </span>
                {SCORE_BAND_LABEL[band]}
            </span>
        </span>
    );
};

/** Botón con aspecto de enlace secundario (Ver mi ficha, Ir a Promos…). */
export const secondaryActionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--lt-border-strong)] bg-[var(--lt-glass)] px-4 text-sm font-bold text-[var(--lt-text)] transition-colors hover:bg-[var(--lt-accent-soft)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--lt-accent-border)]';
