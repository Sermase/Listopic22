/**
 * LoadMoreButton: pie de lista paginada («⬇️ Cargar 25 más · mostrando 25 de 120»).
 * Pensado para fetchResolved(…, { cursor }) de services/adminQueues (25 por página).
 *
 * Props
 *   onClick: () => void
 *   hasMore: boolean             false → «✨ No hay más» (o nada si no hay filas)
 *   loading?: boolean
 *   shown?: number               filas cargadas
 *   total?: number | null        total real (count); si falta no se muestra «de N»
 *   pageSize?: number            25 por defecto (solo para el texto)
 *   className?: string
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui';

export interface LoadMoreButtonProps {
    onClick: () => void;
    hasMore: boolean;
    loading?: boolean;
    shown?: number;
    total?: number | null;
    pageSize?: number;
    className?: string;
}

export const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({
    onClick,
    hasMore,
    loading = false,
    shown,
    total,
    pageSize = 25,
    className,
}) => {
    const counter = typeof shown === 'number' && shown > 0
        ? `Mostrando ${shown.toLocaleString('es-ES')}${typeof total === 'number' && total >= shown ? ` de ${total.toLocaleString('es-ES')}` : ''}`
        : '';

    if (!hasMore) {
        if (!shown) return null;
        return (
            <p className={cn('py-3 text-center text-xs text-gray-500', className)}>
                ✨ No hay más{counter ? ` · ${counter.toLowerCase()}` : ''}
            </p>
        );
    }

    return (
        <div className={cn('flex flex-col items-center gap-1.5 py-3', className)}>
            <Button variant="secondary" size="sm" onClick={onClick} loading={loading} className="min-w-40">
                {loading ? '⏳ Cargando…' : `⬇️ Cargar ${pageSize} más`}
            </Button>
            {counter && <span className="text-[11px] text-gray-500 tabular-nums">{counter}</span>}
        </div>
    );
};
