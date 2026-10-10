/**
 * Lista de barras con emoji (de dónde llegan, por dónde comparten…): una
 * fila por clave, de más a menos, con el número y su % en texto.
 *
 *   <EmojiBarList ariaLabel="De dónde llegan"
 *     rows={[{ key: 'search', emoji: '🔎', label: 'Buscadores', value: 42 }, …]} />
 *
 * Las barras son de acento (magnitud), nunca de colores de estado.
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { formatCount } from '../sponsored/sponsoredMeta';
import { formatPercent, percentOf } from './statsModel';

export interface EmojiBarRow {
    key: string;
    emoji: string;
    label: string;
    value: number;
}

export interface EmojiBarListProps {
    rows: readonly EmojiBarRow[];
    ariaLabel: string;
    /** Total para el %; por defecto, la suma de las filas. */
    total?: number;
    className?: string;
}

export const EmojiBarList: React.FC<EmojiBarListProps> = ({ rows, ariaLabel, total, className }) => {
    const sum = total ?? rows.reduce((acc, row) => acc + row.value, 0);
    const max = Math.max(0, ...rows.map((row) => row.value));
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    return (
        <ul aria-label={ariaLabel} className={cn('space-y-3', className)}>
            {sorted.map((row) => (
                <li key={row.key} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 font-semibold text-[var(--lt-text)]">
                            <span aria-hidden="true" className="mr-1.5">{row.emoji}</span>
                            {row.label}
                        </span>
                        <span className="shrink-0 tabular-nums">
                            <strong className="font-black text-[var(--lt-text)]">{formatCount(row.value)}</strong>
                            <span className="text-[var(--lt-text-muted)]"> · {formatPercent(percentOf(row.value, sum))}</span>
                        </span>
                    </div>
                    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--lt-glass)]">
                        {row.value > 0 && (
                            <div
                                className="h-full rounded-full bg-[var(--lt-accent)]"
                                style={{ width: `${Math.max(2, percentOf(row.value, max))}%` }}
                            />
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
};
