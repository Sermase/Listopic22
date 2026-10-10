/**
 * Radar del alcance de un plato estrella: 📍 en el centro, anillos de
 * referencia y el círculo del radio elegido (escala logarítmica entre el
 * mínimo y el máximo del precio).
 *
 *   <RadiusRadar km={2} minKm={0.2} maxKm={20} />
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { formatKm, reachLabel } from './sponsoredMeta';

export interface RadiusRadarProps {
    km: number;
    minKm: number;
    maxKm: number;
    className?: string;
}

const SIZE = 200;
const CENTER = SIZE / 2;
const MIN_R = 14;
const MAX_R = 88;

export const RadiusRadar: React.FC<RadiusRadarProps> = ({ km, minKm, maxKm, className }) => {
    const span = Math.log(Math.max(maxKm, minKm + 0.01) / Math.max(minKm, 0.01));
    const t = span > 0 ? Math.log(Math.max(km, minKm) / Math.max(minKm, 0.01)) / span : 1;
    const radius = MIN_R + (MAX_R - MIN_R) * Math.max(0, Math.min(1, t));
    const label = `${formatKm(km)} ${reachLabel(km)}`;

    return (
        <figure className={cn('flex flex-col items-center gap-2', className)}>
            <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                role="img"
                aria-label={`Radio de ${label}`}
                className="h-44 w-44 sm:h-52 sm:w-52"
            >
                {[30, 60, 90].map((ring) => (
                    <circle
                        key={ring}
                        cx={CENTER}
                        cy={CENTER}
                        r={ring}
                        fill="none"
                        strokeWidth={1}
                        strokeDasharray="3 5"
                        className="stroke-[var(--lt-border-strong)]"
                    />
                ))}
                <line x1={CENTER} y1={8} x2={CENTER} y2={SIZE - 8} strokeWidth={1} className="stroke-[var(--lt-border)]" />
                <line x1={8} y1={CENTER} x2={SIZE - 8} y2={CENTER} strokeWidth={1} className="stroke-[var(--lt-border)]" />
                <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={radius}
                    strokeWidth={2}
                    className="fill-[var(--lt-accent-soft)] stroke-[var(--lt-accent)] transition-[r] duration-300 motion-reduce:transition-none"
                />
                <text x={CENTER} y={CENTER + 9} textAnchor="middle" fontSize="26" aria-hidden="true">📍</text>
            </svg>
            <figcaption className="text-center">
                <span className="block text-3xl font-black tabular-nums text-[var(--lt-text)]">{formatKm(km)}</span>
                <span className="block text-sm text-[var(--lt-text-muted)]">{reachLabel(km)}</span>
            </figcaption>
        </figure>
    );
};
