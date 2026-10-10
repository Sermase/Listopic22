/**
 * Buscar y elegir otro plato de la carta con chips (mover una valoración,
 * proponer una fusión).
 *
 *   <ItemPicker legend="¿A qué plato va?" items={others} value={targetId} onChange={setTargetId} />
 */
import React, { useId, useMemo, useState } from 'react';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { cn } from '../../../lib/utils';
import { EmojiChip, foldText, kit } from '../kit';
import { itemGroupOf, itemNameOf, reviewCountOf } from './menuModel';
import { sectionEmoji } from './menuVisuals';

const MAX_SHOWN = 12;

export const ItemPicker: React.FC<{
    legend: React.ReactNode;
    items: CanonicalPlaceItem[];
    value: string;
    onChange: (itemId: string) => void;
    disabled?: boolean;
    className?: string;
}> = ({ legend, items, value, onChange, disabled = false, className }) => {
    const [query, setQuery] = useState('');
    const searchId = useId();
    const shown = useMemo(() => {
        const needle = foldText(query);
        const matches = needle ? items.filter((item) => foldText(itemNameOf(item)).includes(needle)) : items;
        const sorted = [...matches].sort((a, b) => reviewCountOf(b) - reviewCountOf(a) || itemNameOf(a).localeCompare(itemNameOf(b), 'es'));
        const limited = sorted.slice(0, MAX_SHOWN);
        const selected = items.find((item) => item.id === value);
        return selected && !limited.includes(selected) ? [selected, ...limited.slice(0, MAX_SHOWN - 1)] : limited;
    }, [items, query, value]);

    return (
        <fieldset className={cn('min-w-0 space-y-2', className)} disabled={disabled}>
            <legend className={kit.label}>{legend}</legend>
            <label htmlFor={searchId} className="sr-only">Buscar plato</label>
            <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="🔎 Busca el plato…"
                className={kit.input}
            />
            {shown.length === 0 ? (
                <p className="text-sm text-[var(--lt-text-muted)]">No hay ningún plato que se llame así.</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {shown.map((item) => (
                        <EmojiChip
                            key={item.id}
                            size="sm"
                            emoji={sectionEmoji(itemGroupOf(item))}
                            label={itemNameOf(item)}
                            selected={item.id === value}
                            onToggle={() => onChange(item.id === value ? '' : item.id)}
                        />
                    ))}
                </div>
            )}
        </fieldset>
    );
};
