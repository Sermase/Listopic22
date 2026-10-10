/**
 * Piezas pequeñas de 🎨 Imagen.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { kit } from '../kit';

export interface ActionChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    emoji: string;
    label: React.ReactNode;
    /** Pulsado (aria-pressed), p. ej. la idea que ya está escrita. */
    pressed?: boolean;
    busy?: boolean;
}

/**
 * Botón-chip con emoji para acciones («🖼️ Elegir de las fotos del local») y
 * sugerencias. El texto puede saltar de línea (nunca desborda en 375px).
 */
export const ActionChip = React.forwardRef<HTMLButtonElement, ActionChipProps>(({ emoji, label, pressed, busy = false, className, disabled, ...props }, ref) => (
    <button
        ref={ref}
        type="button"
        aria-pressed={pressed}
        disabled={disabled || busy}
        className={cn(
            'inline-flex min-h-11 max-w-full select-none items-center gap-2 rounded-full border px-3.5 py-1.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            kit.focus,
            pressed ? kit.selected : kit.idle,
            className,
        )}
        {...props}
    >
        {busy
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            : <span aria-hidden="true" className="shrink-0 text-lg leading-none">{emoji}</span>}
        <span className="min-w-0">{label}</span>
    </button>
));

ActionChip.displayName = 'ActionChip';

/** Línea de consejos en gris: «☀️ Luz natural · 🍽️ … · 🔤 …». */
export const TipsLine: React.FC<{ tips: Array<{ emoji: string; text: string }>; className?: string }> = ({ tips, className }) => (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--lt-text-muted)]', className)}>
        {tips.map((tip) => (
            <li key={tip.text} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">{tip.emoji}</span>
                {tip.text}
            </li>
        ))}
    </ul>
);
