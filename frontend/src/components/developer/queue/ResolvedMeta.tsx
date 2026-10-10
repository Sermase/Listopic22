/**
 * ResolvedMeta: quién y cuándo resolvió algo, en una línea de solo lectura:
 * «✅ Aprobada por Ana · 12/09 18:20 · “nota”». Si el autor es 'system',
 * «🤖 Automático». Resuelve el nombre del uid con useAdminNames.
 *
 * Props
 *   status: string              estado final (approved, rejected, ended, resolved…)
 *   by?: string | null          uid de quien decidió, 'system' o vacío
 *   at?: unknown                fecha de la decisión (Timestamp, ms, Date, ISO)
 *   notes?: string | null       nota que se envió (se muestra entre comillas, sin textarea)
 *   gender?: 'f' | 'm'          concordancia de la etiqueta (reportes: 'm')
 *   label?: string              sustituye la etiqueta («Cerrada automáticamente»)
 *   children?: ReactNode        extras al final de la línea (applyResult, impulsos devueltos…)
 *   className?: string
 *
 * Ejemplo:
 *   <ResolvedMeta status={p.status} by={p.reviewedBy} at={p.reviewedAtMs} notes={p.adminNotes}>
 *     <span>🔀 3 reseñas movidas</span>
 *   </ResolvedMeta>
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { useAdminName } from '../../../hooks/useAdminNames';
import { formatDateTime } from '../../../utils/adminTime';
import { statusEmoji, statusLabel, type StatusGender } from './statusMeta';

export interface ResolvedMetaProps {
    status: string;
    by?: string | null;
    at?: unknown;
    notes?: string | null;
    gender?: StatusGender;
    label?: string;
    children?: React.ReactNode;
    className?: string;
}

const Separator: React.FC = () => <span aria-hidden="true" className="text-gray-500">·</span>;

export const ResolvedMeta: React.FC<ResolvedMetaProps> = ({
    status,
    by,
    at,
    notes,
    gender = 'f',
    label,
    children,
    className,
}) => {
    const actor = by && by.trim() ? by.trim() : null;
    const isSystem = actor === 'system';
    const actorName = useAdminName(actor && !isSystem ? actor : null);
    const when = formatDateTime(at);
    const note = notes?.trim();

    return (
        <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400', className)}>
            <span className="font-semibold text-gray-200">
                <span aria-hidden="true">{statusEmoji(status)}</span> {label ?? statusLabel(status, { gender })}
                {actorName && <span className="font-normal text-gray-400"> por <span className="font-semibold text-gray-200">{actorName}</span></span>}
            </span>
            {isSystem && (
                <>
                    <Separator />
                    <span>🤖 Automático</span>
                </>
            )}
            {when && (
                <>
                    <Separator />
                    <time className="tabular-nums">{when}</time>
                </>
            )}
            {note && (
                <>
                    <Separator />
                    <span className="break-words italic text-gray-300">“{note}”</span>
                </>
            )}
            {children && (
                <>
                    <Separator />
                    {children}
                </>
            )}
        </div>
    );
};
