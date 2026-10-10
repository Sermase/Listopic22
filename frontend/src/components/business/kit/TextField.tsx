/**
 * Campos de texto del kit con etiqueta, ayuda, error y contador.
 *
 *   <TextField label="Nombre visible" value={name} onChange={setName} max={120}
 *     placeholder={place.name} hint={`Déjalo vacío para usar «${place.name}»`} />
 *   <TextField label="📸 Instagram" prefix="@" value={ig} onChange={setIg} />
 *   <TextField label="💶 Precio" prefix="€" inputMode="decimal" value={price} onChange={setPrice} />
 *   <TextField label="✉️ Email" type="email" value={email} onChange={setEmail}
 *     error={emailOk ? undefined : '✋ Este email no parece válido'} />
 *   <TextAreaField label="Descripción" value={text} onChange={setText} max={1400} rows={5} />
 *
 * El <label> envuelve un único control (en TextAreaField va con htmlFor para que
 * `labelAside` quepa entre etiqueta y control). `max` es el límite del servidor: el
 * contador avisa por encima de `softMax` y no deja escribir más allá de `max`.
 * Ayuda, error y contador van en aria-describedby; con error, aria-invalid.
 */
import React, { useId } from 'react';
import { cn } from '../../../lib/utils';
import { CharCounter } from './CharCounter';
import { kit } from './styles';

interface FieldBaseProps {
    label: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    hint?: React.ReactNode;
    error?: React.ReactNode;
    max?: number;
    softMax?: number;
    /** Emoji, '@' o '€' fijo a la izquierda. */
    prefix?: React.ReactNode;
    labelHidden?: boolean;
    /** Clases del contenedor. */
    className?: string;
    /** Clases del control. */
    inputClassName?: string;
    /** TextField: a la derecha del campo (p. ej. un HelpToggle). TextAreaField: entre etiqueta y control (chips de inspiración). */
    labelAside?: React.ReactNode;
}

export type TextFieldProps = FieldBaseProps
    & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix' | 'className' | 'maxLength' | 'size'>;

export type TextAreaFieldProps = FieldBaseProps
    & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'prefix' | 'className' | 'maxLength'>;

const errorControlClass = 'border-[var(--lt-danger)] focus:border-[var(--lt-danger)] focus:ring-[var(--lt-danger-soft)]';

const useFieldIds = (hasHint: boolean, hasError: boolean, hasCounter: boolean, describedBy?: string) => {
    const hintId = useId();
    const errorId = useId();
    const counterId = useId();
    const ids = [
        describedBy,
        hasError ? errorId : null,
        hasHint ? hintId : null,
        hasCounter ? counterId : null,
    ].filter(Boolean).join(' ');
    return { hintId, errorId, counterId, describedBy: ids || undefined };
};

const FieldFooter: React.FC<{
    hint?: React.ReactNode;
    error?: React.ReactNode;
    hintId: string;
    errorId: string;
    counterId: string;
    length: number;
    max?: number;
    softMax?: number;
}> = ({ hint, error, hintId, errorId, counterId, length, max, softMax }) => {
    if (!hint && !error && max == null) return null;
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
                {error && <p id={errorId} className="text-sm font-semibold text-[var(--lt-danger)]">{error}</p>}
                {hint && <p id={hintId} className="text-xs text-[var(--lt-text-muted)]">{hint}</p>}
            </div>
            {max != null && <CharCounter id={counterId} length={length} max={max} softMax={softMax} className="mt-0.5" />}
        </div>
    );
};

const FieldLabel: React.FC<{ label: React.ReactNode; hidden: boolean; required?: boolean }> = ({ label, hidden, required }) => (
    <span className={cn(kit.label, 'block', hidden && 'sr-only')}>
        {label}
        {required && <span aria-hidden="true" className="text-[var(--lt-danger)]"> *</span>}
    </span>
);

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(({
    label, value, onChange, hint, error, max, softMax, prefix, labelHidden = false, className, inputClassName, labelAside,
    type = 'text', 'aria-describedby': ariaDescribedBy, ...inputProps
}, ref) => {
    const ids = useFieldIds(Boolean(hint), Boolean(error), max != null, ariaDescribedBy);
    return (
        <div className={cn('min-w-0 space-y-1.5', className)}>
            <div className="flex items-end justify-between gap-2">
                <label className="block min-w-0 flex-1 space-y-1.5">
                    <FieldLabel label={label} hidden={labelHidden} required={inputProps.required} />
                    <span className="relative flex items-center">
                        {prefix != null && (
                            <span aria-hidden="true" className="pointer-events-none absolute left-3 select-none text-base font-semibold leading-none text-[var(--lt-text-muted)]">
                                {prefix}
                            </span>
                        )}
                        <input
                            ref={ref}
                            type={type}
                            value={value}
                            maxLength={max}
                            onChange={(event) => onChange(event.target.value)}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={ids.describedBy}
                            className={cn(kit.input, prefix != null && 'pl-9', error && errorControlClass, inputClassName)}
                            {...inputProps}
                        />
                    </span>
                </label>
                {labelAside}
            </div>
            <FieldFooter hint={hint} error={error} hintId={ids.hintId} errorId={ids.errorId} counterId={ids.counterId} length={value.length} max={max} softMax={softMax} />
        </div>
    );
});

TextField.displayName = 'TextField';

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(({
    label, value, onChange, hint, error, max, softMax, prefix, labelHidden = false, className, inputClassName, labelAside,
    rows = 4, id, 'aria-describedby': ariaDescribedBy, ...textareaProps
}, ref) => {
    const ids = useFieldIds(Boolean(hint), Boolean(error), max != null, ariaDescribedBy);
    const generatedId = useId();
    const controlId = id ?? generatedId;
    // La etiqueta va con htmlFor (no envolviendo) para que `labelAside` (chips de
    // inspiración) pueda ir entre la etiqueta y el control sin quedar dentro del <label>.
    return (
        <div className={cn('min-w-0 space-y-1.5', className)}>
            <div className="flex items-end justify-between gap-2">
                <label htmlFor={controlId} className="block min-w-0">
                    <FieldLabel label={label} hidden={labelHidden} required={textareaProps.required} />
                </label>
                {prefix != null && <span aria-hidden="true" className="text-base leading-none">{prefix}</span>}
            </div>
            {labelAside}
            <textarea
                ref={ref}
                id={controlId}
                rows={rows}
                value={value}
                maxLength={max}
                onChange={(event) => onChange(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={ids.describedBy}
                className={cn(kit.input, 'block resize-y py-2.5 leading-relaxed', error && errorControlClass, inputClassName)}
                {...textareaProps}
            />
            <FieldFooter hint={hint} error={error} hintId={ids.hintId} errorId={ids.errorId} counterId={ids.counterId} length={value.length} max={max} softMax={softMax} />
        </div>
    );
});

TextAreaField.displayName = 'TextAreaField';
