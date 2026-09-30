import React, { useId } from 'react';
import { isScoreValue } from '../lib/scoring';
import { formatScore, scoreBadge, scoreTextColor } from '../lib/scoreScale';

export interface CriterionRatingCriterion {
    id: string;
    label?: string;
    step?: number;
    labelMin?: string;
    labelMax?: string;
}

interface CriterionRatingProps {
    criterion: CriterionRatingCriterion;
    value: number | undefined;
    /** Cuenta para la nota (obligatorio). Si no, es un detalle opcional. */
    counts: boolean;
    onChange: (value: number | undefined) => void;
}

const UNSCORED_TRACK = 'var(--lt-border)';

/**
 * Un criterio de la valoración. Empieza "Sin puntuar": el deslizador no trae
 * ninguna nota puesta hasta que la persona lo toca (también vale tocar el
 * centro o pulsar Enter para dejar el 5).
 */
export const CriterionRating: React.FC<CriterionRatingProps> = ({ criterion, value, counts, onChange }) => {
    const inputId = useId();
    const scored = isScoreValue(value);
    const step = criterion.step || (counts ? 0.1 : 0.5);
    const shown = scored ? value : 5;
    const fill = scored ? (counts ? scoreBadge(value).bg : 'var(--lt-accent)') : UNSCORED_TRACK;
    const pct = (shown / 10) * 100;
    const label = criterion.label || criterion.id;

    const commit = (raw: string) => {
        const next = parseFloat(raw);
        if (!Number.isFinite(next)) return;
        onChange(next);
        navigator.vibrate?.(8);
    };

    return (
        <div className="space-y-2" data-criterion-id={criterion.id}>
            <div className="flex items-center justify-between gap-3">
                <label htmlFor={inputId} className="text-sm font-semibold text-[var(--lt-text)]">
                    {label}
                </label>
                {scored ? (
                    <span
                        key={value}
                        className="lt-score-pop text-base font-black font-display tabular-nums"
                        style={{ color: counts ? scoreTextColor(value) : 'var(--lt-accent)' }}
                    >
                        {formatScore(value)}
                    </span>
                ) : (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-[var(--lt-border-strong)] text-[var(--lt-text-muted)]">
                        Sin puntuar
                    </span>
                )}
            </div>
            <input
                id={inputId}
                type="range"
                min="0"
                max="10"
                step={step}
                value={shown}
                aria-valuetext={scored ? `${formatScore(value)} de 10` : 'Sin puntuar'}
                data-unscored={scored ? undefined : 'true'}
                onChange={(e) => commit(e.target.value)}
                // Tocar el deslizador sin moverlo (justo en el 5) también puntúa.
                onPointerUp={(e) => { if (!scored) commit(e.currentTarget.value); }}
                onKeyDown={(e) => {
                    if (!scored && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        commit(e.currentTarget.value);
                    }
                }}
                className="custom-range-slider"
                style={{
                    background: `linear-gradient(to right, ${fill} 0%, ${fill} ${scored ? pct : 0}%, var(--lt-border) ${scored ? pct : 0}%, var(--lt-border) 100%)`,
                    '--thumb-color': scored ? fill : 'var(--lt-card-strong)',
                } as React.CSSProperties}
            />
            <div className="flex justify-between gap-3 text-[10px] leading-snug text-[var(--lt-text-muted)]">
                <span><span className="font-bold tabular-nums">0</span>{criterion.labelMin ? ` · ${criterion.labelMin}` : ''}</span>
                <span className="text-right">{criterion.labelMax ? `${criterion.labelMax} · ` : ''}<span className="font-bold tabular-nums">10</span></span>
            </div>
            {!counts && scored && (
                <button
                    type="button"
                    onClick={() => onChange(undefined)}
                    className="text-[11px] font-semibold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] underline underline-offset-2"
                >
                    Quitar
                </button>
            )}
        </div>
    );
};
