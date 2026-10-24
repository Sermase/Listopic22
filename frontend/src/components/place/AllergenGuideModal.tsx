import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { ALLERGEN_OPTIONS } from '../../services/BusinessProService';
import { matchingAllergens, splitByAllergens } from '../../lib/allergens';

export interface AllergenGuideDish {
    id: string;
    name: string;
    allergens: string[];
}

const emojiOf = (value: string) => ALLERGEN_OPTIONS.find((option) => option.value === value)?.emoji ?? '•';
const labelOf = (value: string) => ALLERGEN_OPTIONS.find((option) => option.value === value)?.label ?? value;

/**
 * Guía de alérgenos de La Carta: eliges alérgenos (salen marcados los de «Mis
 * preferencias») y ves qué platos no los llevan, cuáles sí y cuáles no están indicados.
 */
export const AllergenGuideModal: React.FC<{
    dishes: AllergenGuideDish[];
    initialSelected: string[];
    onClose: () => void;
}> = ({ dishes, initialSelected, onClose }) => {
    const [selected, setSelected] = useState<string[]>(initialSelected);
    const toggle = (value: string) => setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
    const { safe, contains, unknown } = splitByAllergens(dishes, selected);

    const group = (title: string, items: AllergenGuideDish[], tone: string) => items.length > 0 && (
        <section>
            <h3 className={`mb-1.5 text-xs font-bold uppercase tracking-widest ${tone}`}>{title} ({items.length})</h3>
            <ul className="divide-y divide-[var(--lt-border)] rounded-xl border border-[var(--lt-border)]">
                {items.map((dish) => (
                    <li key={dish.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-[var(--lt-text)]">{dish.name}</span>
                        <span className="shrink-0 text-base" aria-label={dish.allergens.length ? `Lleva: ${dish.allergens.map(labelOf).join(', ')}` : 'Alérgenos sin indicar'}>
                            {dish.allergens.length
                                ? dish.allergens.map((allergen) => (
                                    <span key={allergen} aria-hidden="true" className={matchingAllergens({ allergens: [allergen] }, selected).length ? '' : 'opacity-40'}>{emojiOf(allergen)}</span>
                                ))
                                : <span aria-hidden="true" className="text-xs text-[var(--lt-text-muted)]">sin indicar</span>}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );

    return (
        <Modal isOpen onClose={onClose} title="Alérgenos de la carta">
            <div className="space-y-4 p-4">
                <div>
                    <p className="mb-2 text-xs text-[var(--lt-text-muted)]">Marca lo que no puedes tomar:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {ALLERGEN_OPTIONS.map((option) => {
                            const on = selected.includes(option.value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggle(option.value)}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]' : 'border-[var(--lt-border)] text-[var(--lt-text-muted)]'}`}
                                >
                                    <span aria-hidden="true">{option.emoji}</span> {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {selected.length === 0 ? (
                    group('Platos', dishes, 'text-[var(--lt-text-muted)]')
                ) : (
                    <>
                        {group('No los llevan', safe, 'text-emerald-400')}
                        {group('Sin indicar por el local', unknown, 'text-amber-400')}
                        {group('Los llevan', contains, 'text-red-400')}
                    </>
                )}
                <p className="text-xs leading-snug text-[var(--lt-text-muted)]">⚠️ Lo indica el local. Si tienes una alergia, confírmalo siempre con el personal.</p>
            </div>
        </Modal>
    );
};
