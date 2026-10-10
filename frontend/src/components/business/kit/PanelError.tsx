/**
 * Error al cargar un panel: nunca ceros ni un vacío falso en su lugar.
 *
 *   if (error) return <PanelError what="tus estadísticas" onRetry={reload} retrying={loading} />;
 *   // → «😕 No hemos podido cargar tus estadísticas» + [Reintentar]
 */
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';

export interface PanelErrorProps {
    /** Qué no se pudo cargar, en minúscula: «tus ofertas», «la carta». */
    what: string;
    onRetry: () => void;
    retrying?: boolean;
    /** Detalle opcional bajo el título. */
    detail?: React.ReactNode;
    className?: string;
}

export const PanelError: React.FC<PanelErrorProps> = ({ what, onRetry, retrying = false, detail, className }) => (
    <div
        role="alert"
        className={cn(
            'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--lt-danger)]/40 px-4 py-6 text-center sm:flex-row sm:text-left',
            className,
        )}
    >
        <span aria-hidden="true" className="text-3xl leading-none">😕</span>
        <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--lt-text)]">No hemos podido cargar {what}</p>
            {detail && <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">{detail}</p>}
        </div>
        <Button
            variant="secondary"
            onClick={onRetry}
            loading={retrying}
            leftIcon={<RefreshCw className={cn('h-4 w-4', retrying && 'animate-spin')} aria-hidden="true" />}
            className="min-h-11 shrink-0 border-[var(--lt-border-strong)] bg-[var(--lt-glass)] hover:bg-[var(--lt-accent-soft)]"
        >
            Reintentar
        </Button>
    </div>
);
