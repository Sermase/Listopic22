/**
 * Elegir varias opciones con chips (idiomas, cocinas, pagos, servicios…).
 *
 *   <ChipGroup legend="🗣️ Idiomas" options={LANGUAGE_OPTIONS} value={doc.languages ?? []}
 *     onChange={(languages) => patch({ languages })} max={12} allowOther otherPlaceholder="Otro idioma" />
 *
 *   // Bloques plegables (Disclosure), con o sin opciones sueltas arriba:
 *   <ChipGroup legend="Formas de pago" options={COMMON} groups={[{ key: 'more', title: 'Ver más formas de pago (13)', options: MORE }]} … />
 *
 * Es un <fieldset><legend> (pulsar el título no marca nada). Lo guardado se casa
 * con las opciones sin mayúsculas ni tildes, también por sus `aliases` («es»,
 * «Castellano» marcan Español sin reescribir lo guardado hasta que se toque ese
 * chip); al marcar se guarda `option.value`.
 * Con `max`: contador x/max, y al llegar los chips libres se desactivan con
 * «{max} como máximo». «➕ Otro» abre un campo que añade con Enter (si el texto
 * coincide con una opción, marca esa). Los valores guardados que no están en el
 * catálogo salen en «Otras que añadiste», con botón para quitarlos.
 */
import React, { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { EmojiChip } from './EmojiChip';
import { Disclosure } from './Disclosure';
import { kit } from './styles';
import { foldText, sameFolded } from './text';

export interface ChipOption {
    value: string;
    label: string;
    emoji?: string;
    /** Tooltip del chip. */
    hint?: string;
    /** Otros textos guardados que cuentan como esta opción («es», «castellano»…). */
    aliases?: readonly string[];
}

const matchesOption = (item: string, option: ChipOption): boolean => (
    sameFolded(item, option.value) || Boolean(option.aliases?.some((alias) => sameFolded(item, alias)))
);

export interface ChipOptionGroup {
    key: string;
    title: string;
    emoji?: string;
    options: ChipOption[];
    help?: React.ReactNode;
    defaultOpen?: boolean;
    /** Recordar abierto/cerrado (Disclosure). */
    storageKey?: string;
    /** Debajo de los chips del bloque (p. ej. un enlace «Detállalo en …»). */
    footer?: React.ReactNode;
}

export interface ChipGroupProps {
    legend: React.ReactNode;
    help?: React.ReactNode;
    options?: ChipOption[];
    value: string[];
    onChange: (next: string[]) => void;
    max?: number;
    allowOther?: boolean;
    otherPlaceholder?: string;
    otherMaxLength?: number;
    groups?: ChipOptionGroup[];
    /** Título de la fila de valores fuera del catálogo. */
    customTitle?: string;
    disabled?: boolean;
    /** Leyenda solo para lectores de pantalla (cuando ya hay un SectionHeader). */
    hideLegend?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}

export const ChipGroup: React.FC<ChipGroupProps> = ({
    legend,
    help,
    options = [],
    value,
    onChange,
    max,
    allowOther = false,
    otherPlaceholder = 'Escribe y pulsa Enter',
    otherMaxLength = 60,
    groups = [],
    customTitle = 'Otras que añadiste',
    disabled = false,
    hideLegend = false,
    size = 'md',
    className,
}) => {
    const helpId = useId();
    const otherInputId = useId();
    const [otherOpen, setOtherOpen] = useState(false);
    const [otherText, setOtherText] = useState('');
    const [otherNote, setOtherNote] = useState('');

    const allOptions = [...options, ...groups.flatMap((group) => group.options)];
    const isOn = (option: ChipOption) => value.some((item) => matchesOption(item, option));
    const customValues = value.filter((item) => !allOptions.some((option) => matchesOption(item, option)));
    const atMax = max != null && value.length >= max;
    const maxHint = max != null ? `${max} como máximo` : '';

    const toggle = (option: ChipOption) => {
        if (isOn(option)) {
            onChange(value.filter((item) => !matchesOption(item, option)));
        } else if (!atMax) {
            onChange([...value, option.value]);
        }
    };

    const removeValue = (item: string) => onChange(value.filter((entry) => entry !== item));

    const addOther = () => {
        const text = otherText.replace(/\s+/g, ' ').trim();
        if (!text) return;
        const match = allOptions.find((option) => matchesOption(text, option) || sameFolded(option.label, text));
        if (match && isOn(match)) {
            setOtherNote(`«${match.label}» ya está marcada.`);
        } else if (!match && value.some((item) => foldText(item) === foldText(text))) {
            setOtherNote(`«${text}» ya está añadida.`);
        } else if (atMax) {
            setOtherNote(maxHint);
            return;
        } else {
            onChange([...value, match ? match.value : text]);
            setOtherNote(match ? `Marcada «${match.label}».` : '');
        }
        setOtherText('');
    };

    const renderChip = (option: ChipOption) => {
        const on = isOn(option);
        const blocked = !on && atMax;
        return (
            <EmojiChip
                key={option.value}
                emoji={option.emoji}
                label={option.label}
                selected={on}
                disabled={disabled || blocked}
                title={blocked ? maxHint : option.hint}
                size={size}
                onToggle={() => toggle(option)}
            />
        );
    };

    return (
        <fieldset
            className={cn('min-w-0 space-y-3', className)}
            disabled={disabled}
            aria-describedby={help ? helpId : undefined}
        >
            {/* Oculta: solo sr-only (con w-full, la leyenda absoluta ensanchaba la página). */}
            <legend className={hideLegend ? 'sr-only' : 'w-full'}>
                <span className="flex items-center justify-between gap-3">
                    <span className={kit.label}>{legend}</span>
                    {max != null && (
                        <span className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                            atMax ? 'bg-[var(--lt-warning-soft)] text-[var(--lt-warning)]' : 'bg-[var(--lt-glass)] text-[var(--lt-text-muted)]',
                        )}>
                            <span aria-hidden="true">{value.length}/{max}</span>
                            <span className="sr-only">{`, ${value.length} de ${max} como máximo`}</span>
                        </span>
                    )}
                </span>
            </legend>
            {help && <p id={helpId} className="-mt-1 text-sm text-[var(--lt-text-muted)]">{help}</p>}

            {options.length > 0 && (
                <div className="flex flex-wrap gap-2">{options.map(renderChip)}</div>
            )}

            {groups.length > 0 && (
                <div className="space-y-2">
                    {groups.map((group) => {
                        const selectedCount = group.options.filter(isOn).length;
                        return (
                            <Disclosure
                                key={group.key}
                                emoji={group.emoji}
                                title={group.title}
                                help={group.help}
                                count={selectedCount || undefined}
                                defaultOpen={group.defaultOpen}
                                storageKey={group.storageKey}
                            >
                                <div className="flex flex-wrap gap-2">{group.options.map(renderChip)}</div>
                                {group.footer && <div className="mt-3 text-sm">{group.footer}</div>}
                            </Disclosure>
                        );
                    })}
                </div>
            )}

            {atMax && <p className="text-xs font-semibold text-[var(--lt-warning)]" aria-live="polite">✋ {maxHint}</p>}

            {customValues.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-[var(--lt-text-muted)]">{customTitle}</p>
                    <div className="flex flex-wrap gap-2">
                        {customValues.map((item) => (
                            <EmojiChip
                                key={item}
                                label={item}
                                selected
                                size={size}
                                disabled={disabled}
                                onToggle={() => removeValue(item)}
                                onRemove={() => removeValue(item)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {allowOther && (
                <div className="flex flex-wrap items-center gap-2">
                    {!otherOpen ? (
                        <button
                            type="button"
                            disabled={disabled || atMax}
                            title={atMax ? maxHint : undefined}
                            onClick={() => {
                                setOtherOpen(true);
                                setOtherNote('');
                            }}
                            className={cn(
                                'inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                kit.focus,
                                kit.idle,
                            )}
                        >
                            <span aria-hidden="true">➕</span> Otro
                        </button>
                    ) : (
                        <>
                            <label htmlFor={otherInputId} className="sr-only">Añadir otra opción</label>
                            <input
                                id={otherInputId}
                                autoFocus
                                value={otherText}
                                maxLength={otherMaxLength}
                                placeholder={otherPlaceholder}
                                enterKeyHint="done"
                                onChange={(event) => {
                                    setOtherText(event.target.value);
                                    setOtherNote('');
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        addOther();
                                    } else if (event.key === 'Escape') {
                                        event.stopPropagation();
                                        setOtherOpen(false);
                                        setOtherText('');
                                    }
                                }}
                                className={cn(kit.input, 'w-auto min-w-0 flex-1 sm:max-w-xs')}
                            />
                            <button
                                type="button"
                                onClick={addOther}
                                disabled={!otherText.trim()}
                                className={cn(
                                    'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors disabled:opacity-50',
                                    kit.focus,
                                    kit.selected,
                                )}
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" /> Añadir
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setOtherOpen(false);
                                    setOtherText('');
                                    setOtherNote('');
                                }}
                                className={cn('min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]', kit.focus)}
                            >
                                Listo
                            </button>
                        </>
                    )}
                    <p className="basis-full text-xs text-[var(--lt-text-muted)] empty:hidden" aria-live="polite">{otherNote}</p>
                </div>
            )}
        </fieldset>
    );
};
