/**
 * Cifra principal de 📊 (spec §9.2): emoji de 40px, etiqueta, valor grande,
 * comparación con el periodo anterior (▲/▼/＝ siempre con texto) y una
 * mini línea de tendencia.
 *
 *   <StatTile emoji="👀" label="Visitas a tu ficha" status="ready" value="1.240"
 *     delta={computeDelta(240, 200)} trend={[3, 5, 2, 8]} />
 *   <StatTile emoji="👀" label="Visitas a tu ficha" status="error" onRetry={traffic.reload} />
 *
 * Con error nunca enseña un 0: dice que no se pudo cargar y deja reintentar.
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { Skeleton } from '../../Skeleton';
import { kit } from '../kit';
import type { Delta } from './statsModel';
import type { StatsLoadStatus } from './useStatsData';

const DELTA_CLASS: Record<Delta['kind'], string> = {
    up: 'text-[var(--lt-success)]',
    down: 'text-[var(--lt-warning)]',
    same: 'text-[var(--lt-text-muted)]',
};

const DELTA_SR: Record<Delta['kind'], string> = {
    up: 'Sube: ',
    down: 'Baja: ',
    same: '',
};

export const DeltaLine: React.FC<{ delta: Delta; className?: string }> = ({ delta, className }) => (
    <p className={cn('text-xs font-bold leading-snug', DELTA_CLASS[delta.kind], className)}>
        <span aria-hidden="true">{delta.arrow} </span>
        <span className="sr-only">{DELTA_SR[delta.kind]}</span>
        {delta.text}
    </p>
);

/** Línea de tendencia sin ejes (decorativa: los números están en «🔢 Ver números»). */
export const Sparkline: React.FC<{ values: readonly number[]; className?: string }> = ({ values, className }) => {
    if (values.length < 2) return null;
    const max = Math.max(...values);
    const width = values.length - 1;
    const y = (value: number) => (max > 0 ? 95 - (value / max) * 85 : 95);
    const points = values.map((value, index) => `${index},${y(value).toFixed(2)}`).join(' ');
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            viewBox={`0 0 ${width} 100`}
            preserveAspectRatio="none"
            className={cn('block h-7 w-full overflow-visible', className)}
        >
            {max > 0 && <polygon points={`0,100 ${points} ${width},100`} fill="var(--lt-accent)" fillOpacity={0.1} />}
            <polyline
                points={points}
                fill="none"
                stroke={max > 0 ? 'var(--lt-accent)' : 'var(--lt-border-strong)'}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

export interface StatTileProps {
    emoji: string;
    label: string;
    status: StatsLoadStatus;
    /** El número (o la chapa de nota). */
    value?: React.ReactNode;
    delta?: Delta | null;
    /** Valores del periodo para la mini línea. */
    trend?: readonly number[];
    /** Una línea bajo el valor: «de 23 valoraciones públicas», «sobre todo por 💚 WhatsApp». */
    caption?: React.ReactNode;
    onRetry?: () => void;
    busy?: boolean;
    className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
    emoji, label, status, value, delta, trend, caption, onRetry, busy = false, className,
}) => (
    <article
        aria-busy={status === 'loading' || busy || undefined}
        className={cn(kit.surface, 'flex min-w-0 flex-col gap-2 p-3 transition-opacity sm:p-4', busy && 'opacity-60', className)}
    >
        <div className="flex items-center gap-2">
            <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-xl leading-none"
            >
                {emoji}
            </span>
            <h4 className="min-w-0 text-sm font-semibold leading-tight text-[var(--lt-text-muted)]">{label}</h4>
        </div>

        {status === 'loading' && (
            <div className="space-y-2">
                <p role="status" className="sr-only">Cargando {label.toLowerCase()}…</p>
                <Skeleton aria-hidden="true" className="h-8 w-20" />
                <Skeleton aria-hidden="true" className="h-3 w-full" />
            </div>
        )}

        {status === 'error' && (
            <div className="space-y-1.5">
                <p className="text-sm font-bold text-[var(--lt-text)]">
                    <span aria-hidden="true">😕 </span>No se pudo cargar
                </p>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className={cn('-ml-1 min-h-11 rounded-lg px-1 text-sm font-bold text-[var(--lt-accent)] underline-offset-2 hover:underline', kit.focus)}
                    >
                        Reintentar
                    </button>
                )}
            </div>
        )}

        {status === 'ready' && (
            <>
                <div className="text-[28px] font-black leading-none text-[var(--lt-text)] sm:text-[32px]">{value}</div>
                {caption && <p className="text-xs leading-snug text-[var(--lt-text-muted)]">{caption}</p>}
                {delta && <DeltaLine delta={delta} />}
                {trend && <Sparkline values={trend} className="mt-auto" />}
            </>
        )}
    </article>
);
