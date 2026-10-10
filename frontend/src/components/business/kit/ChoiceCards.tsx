/**
 * Elegir una opción con tarjetas (precio, política de mascotas, proveedor,
 * estilo, estado…). Sustituye a los <select> nativos.
 *
 *   <ChoiceCards legend="💶 Precio" options={PRICE_OPTIONS} value={data.priceRange}
 *     onChange={(priceRange) => patch({ priceRange })} columns={4} />
 *
 *   <ChoiceCards legend="Precio" options={…} value={v} allowClear clearLabel="Quitar precio"
 *     onChange={(next) => patch({ priceRange: next ?? undefined })} />   // next: T | null
 *
 *   variant: 'card' (emoji, título, subtítulo, `preview`), 'swatch' (preview grande:
 *   colores, miniaturas) o 'compact' (pills en una fila que salta de línea).
 *
 * role="radiogroup" con role="radio"/aria-checked; flechas, Inicio y Fin mueven la
 * selección (tabindex itinerante). `tone` colorea la opción elegida (semáforo).
 */
import React, { useId, useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { kit, toneBubbleClass, toneSurfaceClass, type Tone } from './styles';

export interface ChoiceOption<T extends string> {
    value: T;
    title: string;
    emoji?: string;
    subtitle?: React.ReactNode;
    tone?: Tone;
    /** Mini dibujo: miniatura de estilo, muestra de color, pin… */
    preview?: React.ReactNode;
    disabled?: boolean;
}

export type ChoiceColumns = 1 | 2 | 3 | 4 | 5 | 6;

const columnsClass: Record<ChoiceColumns, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 min-[420px]:grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-3 sm:grid-cols-5',
    6: 'grid-cols-4 sm:grid-cols-6',
};

interface ChoiceCardsBaseProps<T extends string> {
    legend: React.ReactNode;
    help?: React.ReactNode;
    options: ChoiceOption<T>[];
    value: T | null | undefined;
    columns?: ChoiceColumns;
    variant?: 'card' | 'swatch' | 'compact';
    clearLabel?: string;
    hideLegend?: boolean;
    disabled?: boolean;
    className?: string;
}

export type ChoiceCardsProps<T extends string> = ChoiceCardsBaseProps<T> & (
    | { allowClear: true; onChange: (value: T | null) => void }
    | { allowClear?: false; onChange: (value: T) => void }
);

const usesTone = (tone: Tone | undefined): tone is Exclude<Tone, 'neutral' | 'accent'> => Boolean(tone && tone !== 'neutral' && tone !== 'accent');

export function ChoiceCards<T extends string>(props: ChoiceCardsProps<T>) {
    const {
        legend, help, options, value, columns = 2, variant = 'card', clearLabel = 'Quitar selección',
        hideLegend = false, disabled = false, className,
    } = props;
    const legendId = useId();
    const helpId = useId();
    const refs = useRef<Array<HTMLButtonElement | null>>([]);

    const select = (next: T) => (props.onChange as (value: T) => void)(next);
    const isEnabled = (index: number) => !disabled && !options[index]?.disabled;
    const selectedIndex = options.findIndex((option) => option.value === value);
    const firstEnabled = options.findIndex((_, index) => isEnabled(index));
    const tabStop = selectedIndex >= 0 && isEnabled(selectedIndex) ? selectedIndex : firstEnabled;

    const move = (from: number, step: 1 | -1) => {
        for (let i = 1; i <= options.length; i += 1) {
            const index = (from + step * i + options.length) % options.length;
            if (isEnabled(index)) return index;
        }
        return from;
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        let next: number | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = move(index, 1);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = move(index, -1);
        else if (event.key === 'Home') next = firstEnabled;
        else if (event.key === 'End') next = move(0, -1);
        if (next == null || next < 0) return;
        event.preventDefault();
        select(options[next].value);
        refs.current[next]?.focus();
    };

    const compact = variant === 'compact';
    const swatch = variant === 'swatch';

    return (
        <fieldset
            role="radiogroup"
            aria-labelledby={legendId}
            aria-describedby={help ? helpId : undefined}
            disabled={disabled}
            className={cn('min-w-0 space-y-3', className)}
        >
            <legend id={legendId} className={cn(kit.label, hideLegend && 'sr-only')}>{legend}</legend>
            {help && <p id={helpId} className="-mt-1 text-sm text-[var(--lt-text-muted)]">{help}</p>}

            <div className={compact ? 'flex flex-wrap gap-2' : cn('grid gap-2 sm:gap-3', columnsClass[columns])}>
                {options.map((option, index) => {
                    const checked = index === selectedIndex;
                    const toned = checked && usesTone(option.tone);
                    const stateClass = checked
                        ? (toned ? cn(toneSurfaceClass[option.tone as Tone], 'text-[var(--lt-text)]') : kit.selected)
                        : kit.idle;
                    const bubble = (
                        <span
                            aria-hidden="true"
                            className={cn(
                                'grid shrink-0 place-items-center rounded-full shadow-sm',
                                toneBubbleClass[toned ? option.tone as Tone : 'accent'],
                                compact ? 'h-4 w-4' : 'h-5 w-5',
                            )}
                        >
                            <Check className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} strokeWidth={3} />
                        </span>
                    );

                    return (
                        <button
                            key={option.value}
                            ref={(node) => { refs.current[index] = node; }}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            tabIndex={index === tabStop ? 0 : -1}
                            disabled={disabled || option.disabled}
                            onClick={() => select(option.value)}
                            onKeyDown={(event) => onKeyDown(event, index)}
                            className={cn(
                                'relative select-none border transition disabled:cursor-not-allowed disabled:opacity-50',
                                kit.focus,
                                compact && 'inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold',
                                swatch && 'flex min-h-11 flex-col items-center gap-1.5 rounded-2xl p-2 text-center',
                                !compact && !swatch && 'flex min-h-[76px] flex-col items-start gap-1 rounded-2xl p-3 pr-9 text-left',
                                stateClass,
                            )}
                        >
                            {compact ? (
                                <>
                                    {option.emoji && <span aria-hidden="true" className="text-lg leading-none">{option.emoji}</span>}
                                    <span className="whitespace-nowrap">{option.title}</span>
                                    {checked && bubble}
                                </>
                            ) : swatch ? (
                                <>
                                    <span className="relative grid place-items-center">
                                        {option.preview ?? (option.emoji && <span aria-hidden="true" className="text-3xl leading-none">{option.emoji}</span>)}
                                        {checked && <span className="absolute -right-1.5 -top-1.5">{bubble}</span>}
                                    </span>
                                    <span className="text-xs font-semibold leading-tight">{option.title}</span>
                                    {option.subtitle && <span className="text-[11px] text-[var(--lt-text-muted)]">{option.subtitle}</span>}
                                </>
                            ) : (
                                <>
                                    {option.preview && <span className="mb-1 block w-full">{option.preview}</span>}
                                    {option.emoji && <span aria-hidden="true" className="text-2xl leading-none">{option.emoji}</span>}
                                    <span className="text-sm font-bold leading-snug">{option.title}</span>
                                    {option.subtitle && <span className="text-xs font-normal text-[var(--lt-text-muted)]">{option.subtitle}</span>}
                                    {checked && <span className="absolute right-2.5 top-2.5">{bubble}</span>}
                                </>
                            )}
                        </button>
                    );
                })}
            </div>

            {props.allowClear && value != null && value !== '' && (
                <button
                    type="button"
                    onClick={() => props.onChange(null)}
                    className={cn('min-h-11 rounded-lg px-1 text-sm font-semibold text-[var(--lt-text-muted)] underline-offset-4 hover:text-[var(--lt-text)] hover:underline', kit.focus)}
                >
                    {clearLabel}
                </button>
            )}
        </fieldset>
    );
}
