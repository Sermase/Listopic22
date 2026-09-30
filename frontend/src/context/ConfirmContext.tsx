import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Acción destructiva (borrar, quitar): el botón se pinta en rojo. */
    destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
    resolve: (value: boolean) => void;
}

/**
 * Sustituye a window.confirm(): mismo uso con await, pero con el estilo de la
 * app, en español, accesible (Esc cancela, foco en la acción) y usable en móvil.
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [pending, setPending] = useState<PendingConfirm | null>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    const confirm = useCallback<ConfirmFn>((options) => new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
    }), []);

    const close = useCallback((result: boolean) => {
        setPending((current) => {
            current?.resolve(result);
            return null;
        });
    }, []);

    useEffect(() => {
        if (!pending) return;
        confirmButtonRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [pending, close]);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {pending && createPortal(
                <div className="fixed inset-0 z-[11000] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <button type="button" className="absolute inset-0 cursor-default" aria-label={pending.cancelLabel || 'Cancelar'} onClick={() => close(false)} />
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="lt-confirm-title"
                        className="relative w-full max-w-sm rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] p-5 shadow-2xl"
                        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <div className="flex items-start gap-3">
                            {pending.destructive && (
                                <div className="w-10 h-10 shrink-0 rounded-full bg-red-500/15 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <h2 id="lt-confirm-title" className="font-bold text-[var(--lt-text)]">{pending.title}</h2>
                                {pending.message && <p className="mt-1 text-sm text-[var(--lt-text-muted)]">{pending.message}</p>}
                            </div>
                        </div>
                        <div className="mt-5 flex gap-2 justify-end">
                            <button type="button" onClick={() => close(false)} className="btn-glass">
                                {pending.cancelLabel || 'Cancelar'}
                            </button>
                            <button
                                ref={confirmButtonRef}
                                type="button"
                                onClick={() => close(true)}
                                className={pending.destructive
                                    ? 'inline-flex items-center justify-center px-5 py-2.5 rounded-full text-sm font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition'
                                    : 'btn-primary'}
                            >
                                {pending.confirmLabel || 'Aceptar'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </ConfirmContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = (): ConfirmFn => {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
    return ctx;
};
