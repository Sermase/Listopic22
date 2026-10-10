/**
 * Columnas pequeñas (visitas por día, valoraciones por mes). Cada columna es
 * un botón: al tocarla (o con las flechas) se lee su detalle arriba.
 *
 *   <MiniColumns ariaLabel="Visitas por día" hint="Toca una columna para ver el día"
 *     columns={days.map((day) => ({ key: day.date, value: day.views, detail: dayDetail(day), current: isToday }))} />
 *
 * T1: cada columna ocupa toda la altura (`h-full`), así el % de la barra se
 * calcula sobre algo definido y nunca sale a 0 px.
 */
import React, { useState } from 'react';
import { cn } from '../../../lib/utils';
import { formatCount } from '../sponsored/sponsoredMeta';

export interface MiniColumn {
    key: string;
    value: number;
    /** Lo que se lee al tocarla: «sáb 4 oct · 12 visitas · 2 compartidos». */
    detail: string;
    /** Bajo la columna; vacío para no amontonar etiquetas. */
    axisLabel?: React.ReactNode;
    /** Debajo de la etiqueta (la chapa de nota del mes…). */
    extra?: React.ReactNode;
    /** Hoy, el mes actual: va recuadrada. */
    current?: boolean;
}

export interface MiniColumnsProps {
    columns: readonly MiniColumn[];
    ariaLabel: string;
    /** Texto mientras no hay ninguna tocada. */
    hint?: string;
    /** Altura del dibujo (h-36 por defecto). */
    heightClass?: string;
    className?: string;
}

export const MiniColumns: React.FC<MiniColumnsProps> = ({
    columns, ariaLabel, hint = 'Toca una columna para ver el detalle', heightClass = 'h-36', className,
}) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const selectedIndex = columns.findIndex((column) => column.key === selectedKey);
    const selected = selectedIndex >= 0 ? columns[selectedIndex] : null;
    const max = Math.max(0, ...columns.map((column) => column.value));
    const dense = columns.length > 12;
    const tabStop = selectedIndex >= 0 ? selectedIndex : columns.length - 1;
    const hasExtra = columns.some((column) => column.extra != null);

    const focusColumn = (group: HTMLElement, index: number) => {
        const target = columns[index];
        if (!target) return;
        setSelectedKey(target.key);
        group.querySelectorAll<HTMLButtonElement>('button[data-column]')[index]?.focus();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const from = selectedIndex >= 0 ? selectedIndex : tabStop;
        let next: number | null = null;
        if (event.key === 'ArrowRight') next = Math.min(columns.length - 1, from + 1);
        else if (event.key === 'ArrowLeft') next = Math.max(0, from - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = columns.length - 1;
        if (next === null) return;
        event.preventDefault();
        focusColumn(event.currentTarget, next);
    };

    return (
        <div className={cn('min-w-0', className)}>
            <div className="mb-2 flex min-h-5 items-baseline justify-between gap-3 text-sm">
                <p aria-live="polite" className={cn('min-w-0', selected ? 'font-bold text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]')}>
                    {selected ? selected.detail : hint}
                </p>
                {max > 0 && <span className="shrink-0 text-xs text-[var(--lt-text-muted)]">máx. {formatCount(max)}</span>}
            </div>

            <div
                role="group"
                aria-label={ariaLabel}
                onKeyDown={onKeyDown}
                className={cn('relative flex items-end border-b border-[var(--lt-border-strong)]', heightClass, dense ? 'gap-[2px]' : 'gap-2')}
            >
                {/* Línea del máximo: la escala sin ejes. */}
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-[var(--lt-border)]" />
                {columns.map((column, index) => {
                    const isSelected = index === selectedIndex;
                    const percent = max > 0 ? Math.max(4, (column.value / max) * 100) : 0;
                    return (
                        <button
                            key={column.key}
                            type="button"
                            data-column=""
                            aria-label={column.detail}
                            aria-pressed={isSelected}
                            tabIndex={index === tabStop ? 0 : -1}
                            onClick={() => setSelectedKey(isSelected ? null : column.key)}
                            className={cn(
                                'relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t-md outline-none transition-colors hover:bg-[var(--lt-glass)] focus-visible:ring-2 focus-visible:ring-[var(--lt-accent-border)]',
                                column.current && 'ring-1 ring-[var(--lt-accent-border)]',
                                isSelected && 'bg-[var(--lt-accent-soft)]',
                            )}
                        >
                            {column.value > 0 ? (
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'block w-full rounded-t-[4px] bg-[var(--lt-accent)] transition-opacity',
                                        dense ? 'max-w-4' : 'max-w-6',
                                        selectedIndex >= 0 && !isSelected && 'opacity-60',
                                    )}
                                    style={{ height: `${percent}%` }}
                                />
                            ) : (
                                <span aria-hidden="true" className={cn('block h-0.5 w-full rounded-full bg-[var(--lt-border-strong)]', dense ? 'max-w-4' : 'max-w-6')} />
                            )}
                        </button>
                    );
                })}
            </div>

            <div aria-hidden="true" className={cn('mt-1 flex', dense ? 'gap-[2px]' : 'gap-2')}>
                {columns.map((column) => (
                    <span
                        key={column.key}
                        className={cn(
                            'min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] leading-tight',
                            dense && 'first:text-left last:text-right',
                            column.current ? 'font-bold text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]',
                        )}
                    >
                        {column.axisLabel}
                    </span>
                ))}
            </div>

            {hasExtra && (
                <div className={cn('mt-1.5 flex', dense ? 'gap-[2px]' : 'gap-2')}>
                    {columns.map((column) => (
                        <div key={column.key} className="flex min-w-0 flex-1 justify-center">{column.extra}</div>
                    ))}
                </div>
            )}
        </div>
    );
};
