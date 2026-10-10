/**
 * Baldosa sí/no con emoji para booleanos (accesibilidad, familias, dietas,
 * alérgenos de un plato). Va dentro de un TileGrid.
 *
 *   <EmojiTile emoji="🚪" label="Entrada sin escalones" selected={!!data.stepFreeEntrance}
 *     onToggle={() => patch({ stepFreeEntrance: !data.stepFreeEntrance })}
 *     help="Sin escalones ni desniveles de más de 2 cm hasta la mesa." />
 *   <EmojiTile variant="compact" emoji="🥛" label="Lácteos" selected={on} onToggle={…} />
 *
 * Es un <button aria-pressed> con burbuja ✓ cuando está marcado. La ayuda
 * (botón «?» en la esquina, fuera del botón principal) se abre debajo de la baldosa.
 */
import React, { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { HelpPanel, HelpToggleButton } from './HelpToggle';
import { kit } from './styles';

export interface EmojiTileProps {
    emoji: string;
    label: string;
    sublabel?: React.ReactNode;
    selected: boolean;
    onToggle: () => void;
    help?: React.ReactNode;
    /** Etiqueta pequeña sobre el emoji, p. ej. 'sin'. */
    cornerBadge?: string;
    disabled?: boolean;
    /** card: emoji arriba y texto a la izquierda; compact: centrado, para rejillas densas. */
    variant?: 'card' | 'compact';
    className?: string;
}

export const EmojiTile: React.FC<EmojiTileProps> = ({
    emoji,
    label,
    sublabel,
    selected,
    onToggle,
    help,
    cornerBadge,
    disabled = false,
    variant = 'card',
    className,
}) => {
    const [helpOpen, setHelpOpen] = useState(false);
    const helpId = useId();
    const compact = variant === 'compact';

    return (
        <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
            <div className="relative flex flex-1 flex-col">
                <button
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={onToggle}
                    className={cn(
                        'relative flex w-full flex-1 select-none rounded-2xl border transition active:scale-[0.98]',
                        kit.focus,
                        compact
                            ? 'min-h-[84px] flex-col items-center justify-center gap-1 px-1.5 py-2 text-center'
                            : 'min-h-[92px] flex-col items-start justify-between gap-2 p-3 text-left',
                        selected ? kit.selected : kit.idle,
                        disabled && 'cursor-not-allowed opacity-50',
                    )}
                >
                    <span aria-hidden="true" className={cn('relative leading-none', compact ? 'text-3xl' : 'text-[28px]', !selected && 'opacity-90')}>
                        {emoji}
                        {cornerBadge && (
                            <span className="absolute -right-3 -top-1.5 rounded-full border border-[var(--lt-border-strong)] bg-[var(--lt-card-strong)] px-1 text-[9px] font-black leading-[14px] text-[var(--lt-text)]">
                                {cornerBadge}
                            </span>
                        )}
                    </span>
                    <span className="min-w-0">
                        <span className={cn('block font-bold leading-snug', compact ? 'text-xs' : 'text-sm', selected && 'text-[var(--lt-text)]')}>{label}</span>
                        {sublabel && <span className="mt-0.5 block text-xs font-normal text-[var(--lt-text-muted)]">{sublabel}</span>}
                    </span>
                    {selected && (
                        <span
                            aria-hidden="true"
                            className={cn(
                                kit.checkBubble,
                                'absolute',
                                compact ? 'top-1.5 h-4 w-4' : 'top-3',
                                // Con ayuda, el «?» ocupa la esquina derecha y el ✓ se pone a su lado.
                                compact ? (help ? 'left-1.5' : 'right-1.5') : (help ? 'right-11' : 'right-2.5'),
                            )}
                        >
                            <Check className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} strokeWidth={3} />
                        </span>
                    )}
                </button>
                {help && (
                    <HelpToggleButton
                        open={helpOpen}
                        onToggle={() => setHelpOpen((open) => !open)}
                        panelId={helpId}
                        label={`Más información: ${label}`}
                        className="absolute right-0 top-0"
                    />
                )}
            </div>
            {help && <HelpPanel id={helpId} open={helpOpen}>{help}</HelpPanel>}
        </div>
    );
};
