/**
 * Valor editable en línea: una pill que al tocarla se convierte en un campo.
 *
 *   <InlineEditable label={`Nombre de ${section}`} value={name}
 *     onCommit={(next) => renameSection(section, next)} />
 *   <InlinePriceEditor label={`Precio de ${item.name}`} value={item.businessData?.price ?? ''}
 *     onCommit={(price) => savePrice(item, price)}
 *     onError={() => showToast({ variant: 'error', message: '😕 No se pudo guardar el precio' })} />
 *
 * Enter o salir del campo guardan; Esc cancela. Si el valor (normalizado) no
 * cambia no se llama a onCommit. Mientras guarda, spinner; al acabar, ✅ 1 s
 * (sin destello con «reducir movimiento»); si onCommit falla, anillo rojo y
 * vuelve al valor anterior (el que siga en `value`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatPriceInput, MAX_PRICE_TEXT } from './price';
import { prefersReducedMotion } from './motion';
import { kit } from './styles';

export interface InlineEditableProps {
    value: string;
    onCommit: (next: string) => Promise<unknown>;
    /** Nombre accesible: «Precio de Croquetas». */
    label: string;
    /** Contenido de la pill en reposo (por defecto el valor). */
    display?: React.ReactNode;
    /** Pill cuando no hay valor. */
    emptyDisplay?: React.ReactNode;
    placeholder?: string;
    normalize?: (raw: string) => string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    maxLength?: number;
    disabled?: boolean;
    onError?: (error: unknown) => void;
    className?: string;
    inputClassName?: string;
}

type Mode = 'idle' | 'editing' | 'saving';
type Flash = 'saved' | 'error' | null;

const SAVED_FLASH_MS = 1000;
const ERROR_RING_MS = 3000;

export const InlineEditable: React.FC<InlineEditableProps> = ({
    value,
    onCommit,
    label,
    display,
    emptyDisplay = '＋ Añadir',
    placeholder,
    normalize,
    inputMode,
    maxLength,
    disabled = false,
    onError,
    className,
    inputClassName,
}) => {
    const [mode, setMode] = useState<Mode>('idle');
    const [draft, setDraft] = useState(value);
    const [pending, setPending] = useState<string | null>(null);
    const [flash, setFlash] = useState<Flash>(null);
    const modeRef = useRef<Mode>('idle');
    const startDraftRef = useRef(value);
    const flashTimerRef = useRef<number | undefined>(undefined);
    const pillRef = useRef<HTMLButtonElement>(null);
    const restoreFocusRef = useRef(false);

    useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

    // Al volver a la pill tras editar con teclado, el foco vuelve a ella.
    useEffect(() => {
        if (mode === 'idle' && restoreFocusRef.current) {
            restoreFocusRef.current = false;
            pillRef.current?.focus();
        }
    }, [mode]);

    const changeMode = (next: Mode) => {
        modeRef.current = next;
        setMode(next);
    };

    const showFlash = (kind: Exclude<Flash, null>) => {
        window.clearTimeout(flashTimerRef.current);
        if (kind === 'saved' && prefersReducedMotion()) {
            setFlash(null);
            return;
        }
        setFlash(kind);
        flashTimerRef.current = window.setTimeout(() => setFlash(null), kind === 'saved' ? SAVED_FLASH_MS : ERROR_RING_MS);
    };

    const startEditing = () => {
        if (disabled || modeRef.current !== 'idle') return;
        setDraft(value);
        startDraftRef.current = value;
        setFlash(null);
        changeMode('editing');
    };

    const cancel = (restoreFocus: boolean) => {
        if (modeRef.current !== 'editing') return;
        restoreFocusRef.current = restoreFocus;
        setDraft(value);
        changeMode('idle');
    };

    const commit = async (restoreFocus: boolean) => {
        if (modeRef.current !== 'editing') return;
        const next = normalize ? normalize(draft) : draft.trim();
        restoreFocusRef.current = restoreFocus;
        if (draft === startDraftRef.current || next === value) {
            changeMode('idle');
            return;
        }
        setPending(next);
        changeMode('saving');
        try {
            await onCommit(next);
            showFlash('saved');
        } catch (error) {
            showFlash('error');
            onError?.(error);
        } finally {
            setPending(null);
            changeMode('idle');
        }
    };

    if (mode === 'editing') {
        return (
            <input
                autoFocus
                aria-label={label}
                value={draft}
                placeholder={placeholder}
                inputMode={inputMode}
                maxLength={maxLength}
                enterKeyHint="done"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => { void commit(false); }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        void commit(true);
                    } else if (event.key === 'Escape') {
                        // Que no cierre también el modal en el que esté.
                        event.preventDefault();
                        event.stopPropagation();
                        cancel(true);
                    }
                }}
                className={cn(kit.input, 'min-h-10 w-24 rounded-lg px-2 text-right', inputClassName)}
            />
        );
    }

    const saving = mode === 'saving';
    const shown = saving ? pending : value;
    const empty = !shown;

    return (
        <button
            ref={pillRef}
            type="button"
            onClick={startEditing}
            disabled={disabled || saving}
            aria-busy={saving || undefined}
            title={disabled ? undefined : 'Toca para editar'}
            className={cn(
                'inline-flex min-h-10 max-w-full items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-bold tabular-nums transition-colors disabled:cursor-default',
                kit.focus,
                empty
                    ? 'border-dashed border-[var(--lt-border-strong)] text-[var(--lt-text-muted)] hover:border-[var(--lt-accent-border)] hover:text-[var(--lt-text)]'
                    : 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]',
                flash === 'saved' && 'border-[var(--lt-success)] bg-[var(--lt-success-soft)]',
                flash === 'error' && 'border-[var(--lt-danger)] ring-2 ring-[var(--lt-danger)]',
                className,
            )}
        >
            <span className="sr-only">{`${label}: `}</span>
            <span className="truncate">{saving ? pending : (empty ? emptyDisplay : (display ?? value))}</span>
            {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}
            {flash === 'saved' && <span aria-hidden="true" className="leading-none">✅</span>}
            {flash === 'error' && <span className="sr-only">No se pudo guardar</span>}
        </button>
    );
};

export interface InlinePriceEditorProps extends Omit<InlineEditableProps, 'normalize' | 'inputMode' | 'maxLength'> {
    normalize?: (raw: string) => string;
}

/** InlineEditable para precios: normaliza como el servidor («6,5» → «6,50 €»). */
export const InlinePriceEditor: React.FC<InlinePriceEditorProps> = ({
    normalize = formatPriceInput,
    emptyDisplay = '＋ Precio',
    placeholder = '6,50',
    ...props
}) => (
    <InlineEditable
        {...props}
        normalize={normalize}
        emptyDisplay={emptyDisplay}
        placeholder={placeholder}
        inputMode="decimal"
        maxLength={MAX_PRICE_TEXT}
    />
);
