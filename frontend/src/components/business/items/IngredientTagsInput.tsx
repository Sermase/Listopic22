/**
 * Ingredientes como etiquetas con dibujito: Enter o coma crea una etiqueta.
 * Se guarda como siempre, un texto separado por comas (máx. 300).
 *
 *   <IngredientTagsInput value={draft.ingredients} onChange={(ingredients) => patch({ ingredients })} />
 */
import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { CharCounter, foldText, kit } from '../kit';
import { ingredientEmoji, joinIngredients, MAX_INGREDIENTS_TEXT, splitIngredients } from './menuVisuals';

export interface IngredientTagsInputProps {
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
}

export const IngredientTagsInput: React.FC<IngredientTagsInputProps> = ({ value, onChange, disabled = false }) => {
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputId = useId();
    const hintId = useId();
    const counterId = useId();
    const list = splitIngredients(value);

    const add = (raw: string): boolean => {
        const known = new Set(list.map(foldText));
        const fresh = splitIngredients(raw).filter((entry) => !known.has(foldText(entry)));
        if (fresh.length === 0) return true;
        const next = joinIngredients([...list, ...fresh]);
        if (next.length > MAX_INGREDIENTS_TEXT) {
            setError(`Caben ${MAX_INGREDIENTS_TEXT} caracteres como mucho. Quita alguno o acórtalo.`);
            return false;
        }
        setError(null);
        onChange(next);
        return true;
    };

    const remove = (entry: string) => {
        setError(null);
        onChange(joinIngredients(list.filter((item) => item !== entry)));
    };

    const commitDraft = () => {
        if (!draft.trim()) return;
        if (add(draft)) setDraft('');
    };

    return (
        <div className="min-w-0 space-y-2">
            <label htmlFor={inputId} className={cn(kit.label, 'block')}>🥕 Ingredientes</label>
            {list.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Ingredientes añadidos">
                    {list.map((entry) => (
                        <li
                            key={entry}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] pl-3 text-sm font-semibold text-[var(--lt-text)]"
                        >
                            <span aria-hidden="true" className="leading-none">{ingredientEmoji(entry)}</span>
                            <span>{entry}</span>
                            <button
                                type="button"
                                disabled={disabled}
                                aria-label={`Quitar ${entry}`}
                                title={`Quitar ${entry}`}
                                onClick={() => remove(entry)}
                                className={cn('grid h-9 w-9 place-items-center rounded-full text-[var(--lt-text-muted)] hover:text-[var(--lt-danger)]', kit.focus)}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <input
                id={inputId}
                value={draft}
                disabled={disabled}
                placeholder={list.length > 0 ? 'Otro ingrediente…' : 'Queso, tomate, albahaca…'}
                enterKeyHint="enter"
                aria-describedby={`${hintId} ${counterId}`}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                    const text = event.target.value;
                    if (text.includes(',')) {
                        const parts = text.split(',');
                        const rest = parts.pop() ?? '';
                        if (add(parts.join(','))) setDraft(rest.trimStart());
                        else setDraft(text);
                        return;
                    }
                    setDraft(text);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commitDraft();
                    } else if (event.key === 'Backspace' && !draft && list.length > 0) {
                        remove(list[list.length - 1]);
                    }
                }}
                onBlur={commitDraft}
                className={cn(kit.input, error && 'border-[var(--lt-danger)]')}
            />
            <div className="flex items-start justify-between gap-3">
                <p id={hintId} className={cn('text-xs', error ? 'font-semibold text-[var(--lt-danger)]' : 'text-[var(--lt-text-muted)]')}>
                    {error || 'Pulsa Intro o escribe una coma para añadirlo.'}
                </p>
                <CharCounter id={counterId} length={value.length} max={MAX_INGREDIENTS_TEXT} />
            </div>
        </div>
    );
};
