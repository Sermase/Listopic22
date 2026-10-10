/**
 * «📱 Así te ven»: la carta como saldrá en tu página, dentro de un marco de
 * móvil. Mismo orden que la carta pública (menuOrder, luego nota y nombre) y
 * los platos sin sección al final, en «Otros».
 *
 *   <MenuPublicPreview items={items} sections={names} />
 */
import React, { useMemo } from 'react';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { cn } from '../../../lib/utils';
import { ScoreChip } from './menuParts';
import { buildBoard, itemBusinessDataFrom, itemNameOf, ratingOf, reviewCountOf } from './menuModel';
import { allergenOption, splitIngredients } from './menuVisuals';

export const MenuPublicPreview: React.FC<{ items: CanonicalPlaceItem[]; sections: string[]; className?: string }> = ({ items, sections, className }) => {
    const groups = useMemo(() => {
        const visible = items.filter((item) => item.status !== 'inactive');
        const board = buildBoard(visible, sections);
        const rows = board.sections.filter((section) => section.items.length > 0);
        if (board.unsectioned.length > 0) rows.push({ name: sections.length > 0 ? 'Otros' : '', items: board.unsectioned });
        return rows;
    }, [items, sections]);

    return (
        <section aria-labelledby="carta-preview-title" className={cn('space-y-2', className)}>
            <h3 id="carta-preview-title" className="text-sm font-black text-[var(--lt-text)]">📱 Así te ven</h3>
            <div className="mx-auto w-full max-w-[380px] rounded-[2rem] border-[6px] border-[var(--lt-border-strong)] bg-[var(--lt-bg)] p-2 shadow-xl">
                <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-[var(--lt-border-strong)]" />
                <div className="max-h-[70vh] overflow-y-auto overscroll-contain rounded-[1.4rem] border border-[var(--lt-border)] bg-[var(--lt-card-strong)]">
                    <div className="flex items-center gap-2 border-b border-[var(--lt-border)] px-4 py-3">
                        <span aria-hidden="true">🍴</span>
                        <span className="text-sm font-black text-[var(--lt-text)]">La carta</span>
                        <span className="ml-auto text-[11px] font-bold text-[var(--lt-success)]">✓ Carta oficial</span>
                    </div>
                    {groups.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-[var(--lt-text-muted)]">
                            Aún no hay platos. Añade alguno y aparecerá aquí.
                        </p>
                    ) : groups.map((group) => (
                        <div key={group.name || 'general'}>
                            {group.name && (
                                <h4 className="border-b border-[var(--lt-border)] bg-[var(--lt-glass)] px-4 py-2 text-xs font-black text-[var(--lt-accent)]">
                                    {group.name}
                                </h4>
                            )}
                            <ul className="divide-y divide-[var(--lt-border)]">
                                {group.items.map((item) => {
                                    const data = itemBusinessDataFrom(item);
                                    const ingredients = splitIngredients(data.ingredients);
                                    return (
                                        <li key={item.id} className={cn('flex items-start gap-3 px-4 py-3', !data.available && 'opacity-60')}>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-sm font-semibold text-[var(--lt-text)]">{itemNameOf(item)}</span>
                                                    {data.discount && (
                                                        <span className="rounded-full bg-[var(--lt-success-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lt-success)]">{data.discount}</span>
                                                    )}
                                                    {!data.available && (
                                                        <span className="rounded-full bg-[var(--lt-danger-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lt-danger)]">No disponible</span>
                                                    )}
                                                </div>
                                                {data.description && <p className="line-clamp-2 text-xs leading-snug text-[var(--lt-text-muted)]">{data.description}</p>}
                                                {ingredients.length > 0 && (
                                                    <p className="line-clamp-2 text-xs text-[var(--lt-text-muted)]">
                                                        <span aria-hidden="true">🥕 </span>{ingredients.join(', ')}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <ScoreChip rating={ratingOf(item)} count={reviewCountOf(item)} />
                                                    {data.allergens.map((value) => {
                                                        const option = allergenOption(value);
                                                        return option ? (
                                                            <span key={value} title={option.label} className="text-sm leading-none">
                                                                <span aria-hidden="true">{option.emoji}</span>
                                                                <span className="sr-only">{option.label}</span>
                                                            </span>
                                                        ) : null;
                                                    })}
                                                </div>
                                            </div>
                                            {data.price && <span className="shrink-0 text-sm font-black text-[var(--lt-text)]">{data.price}</span>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
