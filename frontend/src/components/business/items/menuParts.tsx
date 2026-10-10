/**
 * Piezas pequeñas de la carta: menú «⋮» de acciones, anillo de progreso y
 * chapa de nota.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { scoreBadgeStyle } from '../../../lib/scoreScale';
import { kit } from '../kit';
import { formatScoreEs } from './menuModel';

export interface ActionMenuItem {
    key: string;
    label: React.ReactNode;
    onSelect: () => void;
    danger?: boolean;
    disabled?: boolean;
}

/**
 * Botón «⋮» con un menú de acciones (role="menu"). Esc lo cierra (sin cerrar el
 * modal de debajo) y devuelve el foco al botón; flechas arriba y abajo se mueven.
 */
export const ActionMenu: React.FC<{
    label: string;
    items: ActionMenuItem[];
    className?: string;
    buttonClassName?: string;
}> = ({ label, items, className, buttonClassName }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const close = (restoreFocus: boolean) => {
        setOpen(false);
        if (restoreFocus) buttonRef.current?.focus();
    };

    const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            close(true);
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const entries = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
        const index = entries.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % entries.length : (index - 1 + entries.length) % entries.length;
        entries[next]?.focus();
    };

    return (
        <div ref={rootRef} className={cn('relative', className)}>
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                title={label}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onClick={() => setOpen((value) => !value)}
                className={cn(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--lt-text-muted)] transition-colors hover:bg-[var(--lt-glass)] hover:text-[var(--lt-text)]',
                    kit.focus,
                    open && 'bg-[var(--lt-glass)] text-[var(--lt-text)]',
                    buttonClassName,
                )}
            >
                <MoreVertical className="h-5 w-5" aria-hidden="true" />
            </button>
            {open && (
                <div
                    id={menuId}
                    role="menu"
                    aria-label={label}
                    onKeyDown={onMenuKeyDown}
                    className="absolute right-0 top-full z-40 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--lt-border-strong)] bg-[var(--lt-card-strong)] p-1.5 shadow-2xl"
                >
                    {items.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            onClick={() => {
                                close(false);
                                item.onSelect();
                            }}
                            className={cn(
                                'flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                kit.focus,
                                item.danger
                                    ? 'text-[var(--lt-danger)] hover:bg-[var(--lt-danger-soft)]'
                                    : 'text-[var(--lt-text)] hover:bg-[var(--lt-glass)]',
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Anillo de progreso pequeño (cabecera de sección). */
export const CompletionRing: React.FC<{ percent: number; label: string; size?: number; className?: string }> = ({
    percent,
    label,
    size = 30,
    className,
}) => {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    const radius = (size - 6) / 2;
    const circumference = 2 * Math.PI * radius;
    return (
        <span role="img" aria-label={label} title={label} className={cn('relative inline-grid shrink-0 place-items-center', className)}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={3} className="stroke-[var(--lt-border-strong)]" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - value / 100)}
                    className={value >= 100 ? 'stroke-[var(--lt-success)]' : 'stroke-[var(--lt-accent)]'}
                />
            </svg>
            <span aria-hidden="true" className="absolute text-[9px] font-black tabular-nums text-[var(--lt-text-muted)]">{value}</span>
        </span>
    );
};

/** «⭐ 8,6 (12)» con el color de la escala de notas. */
export const ScoreChip: React.FC<{ rating: number | null; count: number; className?: string }> = ({ rating, count, className }) => {
    if (count <= 0 || rating === null) return null;
    return (
        <span
            className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black tabular-nums', className)}
            style={scoreBadgeStyle(rating)}
            title={`Nota media ${formatScoreEs(rating)} con ${count} ${count === 1 ? 'valoración' : 'valoraciones'}`}
        >
            <span aria-hidden="true">⭐</span>
            {formatScoreEs(rating)}
            <span className="font-semibold opacity-80">({count})</span>
        </span>
    );
};

/** Nota de una valoración: «⭐ 9» con el color de la escala, o «Sin nota». */
export const ReviewScore: React.FC<{ score: number | null; className?: string }> = ({ score, className }) => {
    if (score === null) {
        return <span className={cn('inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-[var(--lt-text-muted)]', className)}>Sin nota</span>;
    }
    return (
        <span
            className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black tabular-nums', className)}
            style={scoreBadgeStyle(score)}
            title={`Nota ${formatScoreEs(score)}`}
        >
            <span aria-hidden="true">⭐</span>
            {formatScoreEs(score)}
        </span>
    );
};
