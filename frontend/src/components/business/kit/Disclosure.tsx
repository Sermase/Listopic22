/**
 * Acordeón con emoji, título, contador y mini barra «x de n».
 *
 *   <Disclosure emoji="♿" title="Movilidad" progress={{ done: 3, total: 7 }} storageKey={`bp:acc:${placeId}:mobility`} defaultOpen>
 *     <TileGrid …/>
 *   </Disclosure>
 *   <Disclosure emoji="💳" title="Ver más formas de pago" count={13}>…</Disclosure>
 *
 * Con `storageKey` recuerda si estaba abierto (useStoredChoice). El botón
 * lleva aria-expanded y aria-controls; el contenido cerrado no se pinta.
 */
import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useStoredChoice } from '../../../hooks/useStoredChoice';
import { kit } from './styles';

const OPEN_STATES = ['open', 'closed'] as const;

export interface DisclosureProps {
    emoji?: string;
    title: React.ReactNode;
    /** Número o texto corto a la derecha (p. ej. seleccionados). */
    count?: React.ReactNode;
    /** Mini barra «x de n». */
    progress?: { done: number; total: number };
    help?: React.ReactNode;
    storageKey?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    className?: string;
    /** Sin borde ni fondo (dentro de otra tarjeta). */
    flat?: boolean;
    onOpenChange?: (open: boolean) => void;
}

interface DisclosureViewProps extends DisclosureProps {
    open: boolean;
    setOpen: (open: boolean) => void;
}

const DisclosureView: React.FC<DisclosureViewProps> = ({
    emoji, title, count, progress, help, children, className, flat = false, open, setOpen, onOpenChange,
}) => {
    const contentId = useId();
    const percent = progress && progress.total > 0 ? Math.round((Math.min(progress.done, progress.total) / progress.total) * 100) : 0;
    const toggle = () => {
        setOpen(!open);
        onOpenChange?.(!open);
    };

    return (
        <div className={cn(flat ? 'border-b border-[var(--lt-border)] last:border-b-0' : kit.inset, className)}>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                onClick={toggle}
                className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--lt-glass)]',
                    kit.focus,
                )}
            >
                {emoji && <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>}
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--lt-text)]">{title}</span>
                    {help && <span className="mt-0.5 block text-xs text-[var(--lt-text-muted)]">{help}</span>}
                </span>
                {progress && (
                    <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--lt-text-muted)]">{progress.done} de {progress.total}</span>
                        <span aria-hidden="true" className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--lt-border-strong)]">
                            <span className="block h-full rounded-full bg-[var(--lt-accent)] transition-[width]" style={{ width: `${percent}%` }} />
                        </span>
                    </span>
                )}
                {count != null && count !== '' && count !== 0 && (
                    <span className="shrink-0 rounded-full bg-[var(--lt-accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--lt-accent)]">{count}</span>
                )}
                <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-[var(--lt-text-muted)] transition-transform', open && 'rotate-180')} />
            </button>
            <div id={contentId} hidden={!open} className="px-3 pb-3 pt-1">
                {open && children}
            </div>
        </div>
    );
};

const StoredDisclosure: React.FC<DisclosureProps & { storageKey: string }> = (props) => {
    const [state, setState] = useStoredChoice(props.storageKey, OPEN_STATES, props.defaultOpen ? 'open' : 'closed');
    return <DisclosureView {...props} open={state === 'open'} setOpen={(open) => setState(open ? 'open' : 'closed')} />;
};

const LocalDisclosure: React.FC<DisclosureProps> = (props) => {
    const [open, setOpen] = useState(Boolean(props.defaultOpen));
    return <DisclosureView {...props} open={open} setOpen={setOpen} />;
};

export const Disclosure: React.FC<DisclosureProps> = (props) => (
    props.storageKey
        ? <StoredDisclosure {...props} storageKey={props.storageKey} />
        : <LocalDisclosure {...props} />
);
