/**
 * StatusChip: pastilla de estado con emoji («✅ Aprobada», «⏳ Pendiente»…).
 *
 * Props
 *   status: string                pending | requested | approved | active | rejected | ended | resolved (otro → gris)
 *   gender?: 'f' | 'm'            'f' por defecto; 'm' para reportes y platos («Resuelto»)
 *   label?: string                sustituye la etiqueta calculada
 *   hideEmoji?: boolean
 *   size?: 'sm' | 'md'            'sm' por defecto
 *   className?: string
 *
 * Ejemplo: <StatusChip status={claim.status} />  ·  <StatusChip status="resolved" gender="m" />
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { statusClassName, statusEmoji, statusLabel, type StatusGender } from './statusMeta';

export interface StatusChipProps {
    status: string;
    gender?: StatusGender;
    label?: string;
    hideEmoji?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({
    status,
    gender = 'f',
    label,
    hideEmoji = false,
    size = 'sm',
    className,
}) => (
    <span
        className={cn(
            'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-bold',
            size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
            statusClassName(status),
            className,
        )}
    >
        {!hideEmoji && <span aria-hidden="true">{statusEmoji(status)}</span>}
        {label ?? statusLabel(status, { gender })}
    </span>
);
