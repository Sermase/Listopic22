/**
 * Rejilla de EmojiTile dentro de un <fieldset><legend>.
 *
 *   <TileGrid legend="♿ Movilidad" right={`${done} de 7`}>
 *     {MOBILITY.map((o) => <EmojiTile key={o.key} … />)}
 *   </TileGrid>
 *   <TileGrid legend="⚠️ Alérgenos" cols={7}>…<EmojiTile variant="compact" …/></TileGrid>
 *
 * cols: 4 (por defecto) 2→3→4 columnas; 3: 2→3; 2: 1→2; 7: 4→7 (alérgenos).
 */
import React, { useId } from 'react';
import { cn } from '../../../lib/utils';
import { kit } from './styles';

export type TileGridCols = 2 | 3 | 4 | 7;

const colsClass: Record<TileGridCols, string> = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    7: 'grid-cols-4 sm:grid-cols-7',
};

export interface TileGridProps {
    legend: React.ReactNode;
    help?: React.ReactNode;
    /** A la derecha de la leyenda: «3 de 14 marcados». */
    right?: React.ReactNode;
    cols?: TileGridCols;
    hideLegend?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    className?: string;
}

export const TileGrid: React.FC<TileGridProps> = ({ legend, help, right, cols = 4, hideLegend = false, disabled, children, className }) => {
    const helpId = useId();
    return (
        <fieldset className={cn('min-w-0 space-y-3', className)} disabled={disabled} aria-describedby={help ? helpId : undefined}>
            {/* Oculta: solo sr-only (con w-full, la leyenda absoluta ensanchaba la página). */}
            <legend className={hideLegend ? 'sr-only' : 'w-full'}>
                <span className="flex items-center justify-between gap-3">
                    <span className={kit.label}>{legend}</span>
                    {right && <span className="shrink-0 text-xs font-semibold text-[var(--lt-text-muted)]">{right}</span>}
                </span>
            </legend>
            {help && <p id={helpId} className="-mt-1 text-sm text-[var(--lt-text-muted)]">{help}</p>}
            <div className={cn('grid gap-2 sm:gap-3', colsClass[cols])}>{children}</div>
        </fieldset>
    );
};
