/**
 * Barra de guardar pegada abajo: solo aparece con cambios o con error.
 *
 *   <StickySaveBar dirty={dirty} saving={saving} error={error?.message}
 *     errorAction={error?.action === 'reload' ? { label: 'Recargar', onClick: reload } : undefined}
 *     invalidReason={hoursError} onSave={save} onDiscard={discard}
 *     legal="Al guardar confirmas que es correcto y actual." />
 *
 *   // Dentro de un Modal va en su `footer` y se ve siempre:
 *   <Modal footer={<StickySaveBar placement="footer" saveLabel="Guardar ficha" … />}>
 *
 * «● Cambios sin guardar» en color de aviso, «Descartar» y el botón principal,
 * desactivado si no hay cambios o si `invalidReason`. Los errores se ven aquí.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';

export interface StickySaveBarProps {
    dirty: boolean;
    saving: boolean;
    error?: React.ReactNode;
    /** Acción junto al error (p. ej. «Recargar» cuando otro cambió los datos). */
    errorAction?: { label: string; onClick: () => void };
    /** Por qué no se puede guardar todavía («Falta la hora de cierre»). */
    invalidReason?: React.ReactNode;
    onSave: () => void;
    onDiscard: () => void;
    saveLabel?: React.ReactNode;
    discardLabel?: React.ReactNode;
    /** Línea legal pequeña. */
    legal?: React.ReactNode;
    /** sticky: pegada abajo de la página; footer: dentro del pie de un Modal (siempre visible). */
    placement?: 'sticky' | 'footer';
    className?: string;
}

export const StickySaveBar: React.FC<StickySaveBarProps> = ({
    dirty,
    saving,
    error,
    errorAction,
    invalidReason,
    onSave,
    onDiscard,
    saveLabel = '💾 Guardar',
    discardLabel = 'Descartar',
    legal,
    placement = 'sticky',
    className,
}) => {
    const hasError = Boolean(error);
    if (placement === 'sticky' && !dirty && !hasError && !saving) return null;

    const canSave = dirty && !invalidReason && !saving;
    const status = saving
        ? <span className="text-[var(--lt-text-muted)]">Guardando…</span>
        : invalidReason
            ? <span className="text-[var(--lt-warning)]"><span aria-hidden="true">✋ </span>{invalidReason}</span>
            : dirty
                ? <span className="text-[var(--lt-warning)]"><span aria-hidden="true">● </span>Cambios sin guardar</span>
                : <span className="text-[var(--lt-text-muted)]"><span aria-hidden="true">✅ </span>Todo guardado</span>;

    const bar = (
        <div
            role="region"
            aria-label="Guardar cambios"
            className={cn(
                'space-y-2',
                placement === 'sticky' && 'rounded-2xl border border-[var(--lt-border-strong)] bg-[var(--lt-card-strong)]/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl sm:px-4',
                placement === 'footer' && className,
            )}
        >
            {hasError && (
                <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">
                    <span className="min-w-0 flex-1">{error}</span>
                    {errorAction && (
                        <button
                            type="button"
                            onClick={errorAction.onClick}
                            className="min-h-11 shrink-0 rounded-lg px-2 font-bold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--lt-danger)]"
                        >
                            {errorAction.label}
                        </button>
                    )}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {/* min-w-36: con los dos botones en un móvil, estos bajan de línea antes que estrujar el texto. */}
                <p className="min-w-36 flex-1 text-sm font-semibold" aria-live="polite">{status}</p>
                <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                    {dirty && (
                        <Button
                            variant="ghost"
                            onClick={onDiscard}
                            disabled={saving}
                            className="min-h-11 hover:bg-[var(--lt-glass)]"
                        >
                            {discardLabel}
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        onClick={onSave}
                        disabled={!canSave}
                        loading={saving}
                        leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined}
                        title={typeof invalidReason === 'string' ? invalidReason : undefined}
                        className="min-h-11"
                    >
                        {saveLabel}
                    </Button>
                </div>
            </div>
            {legal && <p className="text-xs text-[var(--lt-text-muted)]">{legal}</p>}
        </div>
    );

    if (placement === 'footer') return bar;

    return (
        <div className={cn('sticky bottom-0 z-20 pt-3 pb-[env(safe-area-inset-bottom)]', className)}>
            <div className="mb-3">{bar}</div>
        </div>
    );
};
