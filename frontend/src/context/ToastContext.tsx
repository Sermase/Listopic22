import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

type ToastVariant = 'success' | 'info' | 'error';

interface ToastPayload {
    title?: string;
    message: string;
    variant?: ToastVariant;
    durationMs?: number;
}

interface ToastEntry extends ToastPayload {
    id: string;
    variant: ToastVariant;
}

interface ToastContextValue {
    showToast: (payload: ToastPayload) => void;
}

const DEFAULT_DURATION_MS = 2800;

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
    success: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-100',
    info: 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-indigo-100',
    error: 'border-rose-400/35 bg-rose-500/12 text-rose-100',
};

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
    success: 'text-emerald-300',
    info: 'text-[var(--lt-accent)]',
    error: 'text-rose-300',
};

const ToastIcon: React.FC<{ variant: ToastVariant }> = ({ variant }) => {
    if (variant === 'success') {
        return <CheckCircle2 className={`w-4 h-4 shrink-0 ${VARIANT_ICON_CLASS[variant]}`} />;
    }
    if (variant === 'error') {
        return <AlertTriangle className={`w-4 h-4 shrink-0 ${VARIANT_ICON_CLASS[variant]}`} />;
    }
    return <Info className={`w-4 h-4 shrink-0 ${VARIANT_ICON_CLASS[variant]}`} />;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastEntry[]>([]);
    const timersRef = useRef<Record<string, number>>({});

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        const timer = timersRef.current[id];
        if (timer) {
            window.clearTimeout(timer);
            delete timersRef.current[id];
        }
    }, []);

    const showToast = useCallback((payload: ToastPayload) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const variant: ToastVariant = payload.variant || 'info';
        const entry: ToastEntry = {
            id,
            title: payload.title,
            message: payload.message,
            variant,
            durationMs: payload.durationMs ?? DEFAULT_DURATION_MS,
        };

        setToasts((prev) => [...prev, entry].slice(-5));

        const timeoutId = window.setTimeout(() => {
            removeToast(id);
        }, entry.durationMs);
        timersRef.current[id] = timeoutId;
    }, [removeToast]);

    const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="pointer-events-none fixed top-20 right-4 z-[220] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto border rounded-xl backdrop-blur-md shadow-lg p-3 pr-2 flex gap-2 animate-fade-in ${VARIANT_STYLES[toast.variant]}`}
                        role="status"
                        aria-live="polite"
                    >
                        <ToastIcon variant={toast.variant} />
                        <div className="min-w-0 flex-1">
                            {toast.title && <p className="text-sm font-bold leading-tight truncate">{toast.title}</p>}
                            <p className="text-xs leading-snug opacity-95">{toast.message}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeToast(toast.id)}
                            className="p-1 rounded-md hover:bg-white/10 transition-colors"
                            aria-label="Cerrar aviso"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextValue => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

