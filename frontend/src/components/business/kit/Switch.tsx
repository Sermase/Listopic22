/**
 * Interruptor accesible (role="switch", 44px) para «Activar…», «Disponible»…
 *
 *   <Switch checked={enabled} onChange={setEnabled} label="📅 Mostrar botón de reservar" />
 *   <Switch checked={open} onChange={…} label="Lunes" labelHidden onText="Abierto" offText="🌙 Cerrado" />
 *   <Switch checked={hide} onChange={…} label="🙈 No mostrar el de Google" description="Se ocultará en tu ficha." />
 *
 * Toda la fila es el botón; `onText`/`offText` se ven al lado del interruptor
 * (el estado ya lo anuncia aria-checked).
 */
import React, { useId } from 'react';
import { cn } from '../../../lib/utils';
import { kit } from './styles';

export interface SwitchProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: React.ReactNode;
    description?: React.ReactNode;
    onText?: React.ReactNode;
    offText?: React.ReactNode;
    /** La etiqueta solo para lectores de pantalla. */
    labelHidden?: boolean;
    disabled?: boolean;
    /** card: fila con borde (por defecto); plain: sin caja. */
    variant?: 'card' | 'plain';
    className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
    checked,
    onChange,
    label,
    description,
    onText,
    offText,
    labelHidden = false,
    disabled = false,
    variant = 'card',
    className,
}) => {
    const labelId = useId();
    const descriptionId = useId();
    const stateText = checked ? onText : offText;

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelId}
            aria-describedby={description ? descriptionId : undefined}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'flex min-h-11 w-full items-center gap-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                kit.focus,
                variant === 'card'
                    ? cn('rounded-2xl border px-3 py-2.5', checked ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]' : 'border-[var(--lt-border)] bg-[var(--lt-glass)] hover:border-[var(--lt-border-strong)]')
                    : 'rounded-xl',
                labelHidden && 'w-auto',
                className,
            )}
        >
            <span className={cn('min-w-0 flex-1', labelHidden && 'sr-only')}>
                <span id={labelId} className="block text-sm font-semibold text-[var(--lt-text)]">{label}</span>
                {description && <span id={descriptionId} className="mt-0.5 block text-xs text-[var(--lt-text-muted)]">{description}</span>}
            </span>
            {stateText != null && (
                <span aria-hidden="true" className={cn('shrink-0 text-xs font-bold', checked ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]')}>
                    {stateText}
                </span>
            )}
            <span
                aria-hidden="true"
                className={cn(
                    'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
                    checked ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent)]' : 'border-[var(--lt-border-strong)] bg-[var(--lt-border-strong)]',
                )}
            >
                <span
                    className={cn(
                        'absolute left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform motion-reduce:transition-none',
                        checked && 'translate-x-5',
                    )}
                />
            </span>
        </button>
    );
};
