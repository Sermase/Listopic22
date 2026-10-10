/**
 * AgeChip: antigüedad de un elemento («hace 3 h») con color según lo que lleva
 * esperando: < 24 h gris, de 1 a 3 d ámbar, > 3 d rojo. `urgent` lo pone
 * siempre en rojo con 🚨. Al pasar el ratón se ve la fecha exacta.
 *
 * Props
 *   at: unknown           Timestamp de Firestore, ms, Date o cadena ISO (createdAt)
 *   now?: number          para tests o para refrescar a la vez una lista
 *   urgent?: boolean      reportes urgentes
 *   prefix?: string       texto delante, p. ej. «la más antigua»
 *   className?: string
 *
 * No pinta nada si no hay fecha. Ejemplo: <AgeChip at={item.createdAtMs} urgent={item.urgent} />
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { ageLevel, formatAge, formatDateTime, type AgeLevel } from '../../../utils/adminTime';

export interface AgeChipProps {
    at: unknown;
    now?: number;
    urgent?: boolean;
    prefix?: string;
    className?: string;
}

const LEVEL_CLASS: Record<AgeLevel, string> = {
    fresh: 'border-white/10 bg-white/5 text-gray-300',
    warning: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    old: 'border-red-500/30 bg-red-500/15 text-red-300',
};

export const AgeChip: React.FC<AgeChipProps> = ({ at, now, urgent = false, prefix, className }) => {
    // Sin `now`, las funciones usan la hora actual (se recalcula en cada render).
    const text = formatAge(at, now);
    if (!text) return null;
    const level: AgeLevel = urgent ? 'old' : ageLevel(at, now);
    return (
        <span
            title={formatDateTime(at, now)}
            className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                LEVEL_CLASS[level],
                className,
            )}
        >
            {urgent && <span aria-hidden="true">🚨</span>}
            {prefix ? `${prefix} ${text}` : text}
        </span>
    );
};
