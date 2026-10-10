/**
 * Ayuda en línea que se abre con un botón «?» (funciona con el dedo, sin hover).
 * Siempre hermano del control, nunca dentro de un <label> o <button>.
 *
 *   <div className="flex flex-wrap items-center gap-2">
 *     <Switch … />
 *     <HelpToggle label="Qué es un bucle magnético">Un sistema que…</HelpToggle>
 *   </div>
 *
 * Devuelve el botón y, si está abierto, el panel (con `basis-full`, así en un
 * flex-wrap cae debajo del control). Para colocarlos por separado usa
 * HelpToggleButton + HelpPanel compartiendo `open` y `panelId`.
 */
import React, { useId, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface HelpToggleButtonProps {
    open: boolean;
    onToggle: () => void;
    panelId: string;
    label?: string;
    className?: string;
}

export const HelpToggleButton: React.FC<HelpToggleButtonProps> = ({ open, onToggle, panelId, label = 'Ver ayuda', className }) => (
    <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={onToggle}
        className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--lt-accent-border)]',
            open ? 'text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]',
            className,
        )}
    >
        <span className={cn(
            'grid h-7 w-7 place-items-center rounded-full border transition-colors',
            open ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]' : 'border-[var(--lt-border-strong)] bg-[var(--lt-glass)]',
        )}>
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </span>
    </button>
);

export interface HelpPanelProps {
    id: string;
    open: boolean;
    children: React.ReactNode;
    className?: string;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ id, open, children, className }) => (
    <div
        id={id}
        hidden={!open}
        className={cn(
            'basis-full rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2 text-sm leading-relaxed text-[var(--lt-text-muted)]',
            className,
        )}
    >
        {open && children}
    </div>
);

export interface HelpToggleProps {
    children: React.ReactNode;
    /** Nombre accesible del botón. */
    label?: string;
    defaultOpen?: boolean;
    buttonClassName?: string;
    panelClassName?: string;
}

export const HelpToggle: React.FC<HelpToggleProps> = ({ children, label, defaultOpen = false, buttonClassName, panelClassName }) => {
    const [open, setOpen] = useState(defaultOpen);
    const panelId = useId();
    return (
        <>
            <HelpToggleButton open={open} onToggle={() => setOpen((value) => !value)} panelId={panelId} label={label} className={buttonClassName} />
            <HelpPanel id={panelId} open={open} className={panelClassName}>{children}</HelpPanel>
        </>
    );
};
