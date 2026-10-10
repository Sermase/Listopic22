/**
 * Termómetro de notas: una barra apilada por tramo (🤩 Excelente … 😬
 * Mejorable) con los colores de lib/scoreScale y una leyenda con números.
 *
 *   <ScoreThermometer counts={bandCounts(reviews)} />
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { SCORE_BADGE, SCORE_BAND_EMOJI, SCORE_BAND_LABEL } from '../../../lib/scoreScale';
import { formatCount } from '../sponsored/sponsoredMeta';
import { SCORE_BANDS } from './statsMeta';
import { formatPercent, percentOf, type RatedBand } from './statsModel';

export interface ScoreThermometerProps {
    counts: Record<RatedBand, number>;
    className?: string;
}

export const ScoreThermometer: React.FC<ScoreThermometerProps> = ({ counts, className }) => {
    const total = SCORE_BANDS.reduce((sum, band) => sum + (counts[band] || 0), 0);
    if (total === 0) return null;
    return (
        <div className={cn('space-y-3', className)}>
            {/* El hueco de 2px entre tramos los separa sin bordes. Los números van en la leyenda. */}
            <div aria-hidden="true" className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
                {SCORE_BANDS.filter((band) => counts[band] > 0).map((band) => (
                    <span
                        key={band}
                        className="block h-full min-w-1.5"
                        style={{ flexGrow: counts[band], flexBasis: 0, backgroundColor: SCORE_BADGE[band].bg }}
                    />
                ))}
            </div>
            <ul aria-label="Reparto de notas" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {SCORE_BANDS.map((band) => (
                    <li key={band} className={cn('inline-flex items-center gap-1.5', counts[band] === 0 && 'opacity-60')}>
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SCORE_BADGE[band].bg }} />
                        <span className="text-[var(--lt-text)]">
                            <span aria-hidden="true">{SCORE_BAND_EMOJI[band]} </span>
                            {SCORE_BAND_LABEL[band]}
                        </span>
                        <strong className="font-black tabular-nums text-[var(--lt-text)]">{formatCount(counts[band])}</strong>
                        <span className="sr-only">({formatPercent(percentOf(counts[band], total))})</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
