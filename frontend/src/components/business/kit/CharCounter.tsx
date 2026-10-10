/**
 * Contador de caracteres «x/max». Pasa a color de aviso por encima de `softMax`
 * (por defecto el 90 % de max) y a peligro si se pasa de `max`.
 *
 *   <CharCounter id={counterId} length={value.length} max={1400} />
 */
import React from 'react';
import { cn } from '../../../lib/utils';

export interface CharCounterProps {
    length: number;
    max: number;
    softMax?: number;
    id?: string;
    className?: string;
}

const counterSoftMax = (max: number, softMax?: number) => softMax ?? Math.floor(max * 0.9);

export const CharCounter: React.FC<CharCounterProps> = ({ length, max, softMax, id, className }) => {
    const soft = counterSoftMax(max, softMax);
    const tone = length > max
        ? 'text-[var(--lt-danger)]'
        : length > soft ? 'text-[var(--lt-warning)]' : 'text-[var(--lt-text-muted)]';
    return (
        <span id={id} className={cn('shrink-0 text-xs font-semibold tabular-nums', tone, className)}>
            <span aria-hidden="true">{length}/{max}</span>
            <span className="sr-only">{`${length} de ${max} caracteres`}</span>
        </span>
    );
};
