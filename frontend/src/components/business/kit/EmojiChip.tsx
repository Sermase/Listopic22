/**
 * Chip conmutables con emoji (alérgenos, idiomas, cocinas…). 44px de alto.
 *
 *   <EmojiChip emoji="🥛" label="Lácteos" selected={on} onToggle={() => toggle('milk')} />
 *   <EmojiChip emoji="🥚" label="Sin huevo" cornerBadge="sin" selected={on} onToggle={…} />
 *   <EmojiChip emoji="🏷️" label="Brunch" selected onToggle={remove} onRemove={remove} />
 *
 * Es un <button aria-pressed>. Apagado usa kit.idle; encendido kit.selected y un ✓.
 * Con `onRemove` lleva al lado un botón «Quitar {label}» (y el ✓ se omite).
 */
import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { kit } from './styles';

export interface EmojiChipProps {
    emoji?: string;
    label: string;
    selected: boolean;
    onToggle: () => void;
    disabled?: boolean;
    onRemove?: () => void;
    /** Etiqueta pequeña sobre el emoji, p. ej. 'sin'. */
    cornerBadge?: string;
    size?: 'sm' | 'md';
    /** Texto del tooltip y de ayuda (p. ej. por qué está desactivado). */
    title?: string;
    className?: string;
}

export const EmojiChip: React.FC<EmojiChipProps> = ({
    emoji,
    label,
    selected,
    onToggle,
    disabled = false,
    onRemove,
    cornerBadge,
    size = 'md',
    title,
    className,
}) => {
    const chip = (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            title={title}
            onClick={onToggle}
            className={cn(
                'inline-flex min-h-11 select-none items-center gap-2 rounded-full border font-semibold transition-colors',
                kit.focus,
                size === 'md' ? 'px-3.5 text-sm' : 'px-3 text-xs',
                selected ? kit.selected : kit.idle,
                disabled && 'cursor-not-allowed opacity-50 hover:border-[var(--lt-border)] hover:text-[var(--lt-text-muted)]',
                onRemove && 'rounded-r-none border-r-0 pr-2',
                !onRemove && className,
            )}
        >
            {emoji && (
                <span aria-hidden="true" className={cn('relative leading-none', size === 'md' ? 'text-lg' : 'text-base', cornerBadge && 'mr-1.5')}>
                    {emoji}
                    {cornerBadge && (
                        <span className="absolute -right-2.5 -top-2 rounded-full border border-[var(--lt-border-strong)] bg-[var(--lt-card-strong)] px-1 text-[9px] font-black leading-[14px] text-[var(--lt-text)]">
                            {cornerBadge}
                        </span>
                    )}
                </span>
            )}
            <span className="whitespace-nowrap">{label}</span>
            {selected && !onRemove && (
                <span aria-hidden="true" className={cn(kit.checkBubble, 'h-4 w-4')}>
                    <Check className="h-3 w-3" strokeWidth={3} />
                </span>
            )}
        </button>
    );

    if (!onRemove) return chip;

    return (
        <span className={cn('inline-flex', className)}>
            {chip}
            <button
                type="button"
                aria-label={`Quitar ${label}`}
                title={`Quitar ${label}`}
                disabled={disabled}
                onClick={onRemove}
                className={cn(
                    'grid min-h-11 w-10 place-items-center rounded-r-full border border-l-0 transition-colors',
                    kit.focus,
                    selected ? kit.selected : kit.idle,
                    'hover:text-[var(--lt-danger)]',
                )}
            >
                <X className="h-4 w-4" aria-hidden="true" />
            </button>
        </span>
    );
};
