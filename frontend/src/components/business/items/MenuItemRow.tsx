/**
 * Fila de un plato en el tablero de la carta (mínimo 44px): asa para
 * arrastrar (solo desde aquí, para que en móvil la página siga desplazándose),
 * nombre con sus chapas, alérgenos o lo que falta, precio editable en línea,
 * disponibilidad de un toque, abrir la ficha y menú «⋮».
 */
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, GripVertical } from 'lucide-react';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { cn } from '../../../lib/utils';
import { InlinePriceEditor, StatusPill, kit } from '../kit';
import { ActionMenu, ScoreChip } from './menuParts';
import { itemBusinessDataFrom, itemNameOf, ratingOf, reviewCountOf } from './menuModel';
import { allergenOption, CARTA_CHECKS, itemCompletion, type CartaCheckKey } from './menuVisuals';

export type ItemSheetTab = 'ficha' | 'reviews' | 'fixes';

export interface MenuRowActions {
    openSheet: (itemId: string, tab?: ItemSheetTab) => void;
    savePrice: (item: CanonicalPlaceItem, price: string) => Promise<unknown>;
    onPriceError: (error: unknown) => void;
    toggleAvailable: (item: CanonicalPlaceItem) => void;
    openMoveTo: (item: CanonicalPlaceItem) => void;
    impulse: (item: CanonicalPlaceItem) => void;
}

export interface MenuItemRowProps {
    item: CanonicalPlaceItem;
    containerId: string;
    sectionNames: string[];
    reviewedNoAllergens: boolean;
    flash?: boolean;
    showCompleteCta?: boolean;
    dragDisabled?: boolean;
    actions: MenuRowActions;
}

// Los 4 puntos de campos de la fila (la sección ya se ve por dónde está el plato).
const FIELD_DOTS: CartaCheckKey[] = ['price', 'description', 'allergens', 'ingredients'];

export const MenuItemRow: React.FC<MenuItemRowProps> = ({
    item,
    containerId,
    sectionNames,
    reviewedNoAllergens,
    flash = false,
    showCompleteCta = false,
    dragDisabled = false,
    actions,
}) => {
    const name = itemNameOf(item);
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `item:${item.id}`, data: { type: 'item', container: containerId }, disabled: dragDisabled });

    const data = itemBusinessDataFrom(item);
    const completion = itemCompletion(data, { sections: sectionNames, reviewedNoAllergens });
    const reviewCount = reviewCountOf(item);
    const isNew = item.source === 'business' && reviewCount === 0;
    const allergens = data.allergens.map((value) => allergenOption(value)).filter((option): option is NonNullable<typeof option> => Boolean(option));

    return (
        <li
            ref={setNodeRef}
            data-item-id={item.id}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] py-1.5 pl-1 pr-1.5 transition-shadow sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-2',
                isDragging && 'opacity-40',
                // Sin destello con «reducir movimiento».
                flash && 'motion-safe:ring-2 motion-safe:ring-[var(--lt-accent)] motion-safe:ring-offset-2 motion-safe:ring-offset-[var(--lt-card-strong)]',
            )}
        >
            <button
                ref={setActivatorNodeRef}
                type="button"
                aria-label={`Arrastrar ${name}`}
                title="Arrastra para moverlo"
                disabled={dragDisabled}
                className={cn(
                    'row-span-2 grid h-11 w-8 touch-none place-items-center self-start rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] disabled:cursor-default disabled:opacity-40 sm:row-span-1 sm:self-center',
                    kit.focus,
                    !dragDisabled && 'cursor-grab active:cursor-grabbing',
                )}
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className={cn('min-w-0 py-0.5', !data.available && 'opacity-60')}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                        type="button"
                        onClick={() => actions.openSheet(item.id)}
                        className={cn('min-w-0 rounded-md text-left text-sm font-bold leading-snug text-[var(--lt-text)] hover:text-[var(--lt-accent)] sm:text-base', kit.focus)}
                    >
                        {name}
                    </button>
                    <ScoreChip rating={ratingOf(item)} count={reviewCount} />
                    {isNew && <StatusPill size="sm" emoji="🆕" label="Nuevo" tone="accent" />}
                    {data.discount && <StatusPill size="sm" emoji="🏷️" label={data.discount} />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    {allergens.length > 0 ? (
                        <span className="inline-flex flex-wrap items-center gap-0.5">
                            <span className="sr-only">Alérgenos:</span>
                            {allergens.map((option) => (
                                <span key={option.value} title={option.label} className="leading-none">
                                    <span aria-hidden="true">{option.emoji}</span>
                                    <span className="sr-only">{option.label}</span>
                                </span>
                            ))}
                        </span>
                    ) : !reviewedNoAllergens ? (
                        <button
                            type="button"
                            onClick={() => actions.openSheet(item.id)}
                            className={cn('rounded-md text-xs font-semibold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]', kit.focus)}
                        >
                            ＋ alérgenos
                        </button>
                    ) : null}
                    {completion.done === completion.total ? (
                        <span className="text-xs font-semibold text-[var(--lt-success)]">✨ Ficha completa</span>
                    ) : (
                        <span className="inline-flex items-center gap-0.5" aria-label={`Ficha al ${completion.percent} %`}>
                            {CARTA_CHECKS.filter((check) => FIELD_DOTS.includes(check.key)).map((check) => (
                                <span
                                    key={check.key}
                                    aria-hidden="true"
                                    title={`${check.label}: ${completion.checks[check.key] ? 'listo' : 'falta'}`}
                                    className={cn('text-xs leading-none', !completion.checks[check.key] && 'opacity-35 grayscale')}
                                >
                                    {check.emoji}
                                </span>
                            ))}
                        </span>
                    )}
                </div>
                {showCompleteCta && (
                    <button
                        type="button"
                        onClick={() => actions.openSheet(item.id)}
                        className={cn('mt-1 min-h-9 rounded-md text-sm font-bold text-[var(--lt-accent)] hover:underline', kit.focus)}
                    >
                        Completar ficha →
                    </button>
                )}
            </div>

            <div className="col-span-2 col-start-2 row-start-2 flex items-center justify-end gap-1 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                <InlinePriceEditor
                    label={`Precio de ${name}`}
                    value={data.price}
                    onCommit={(price) => actions.savePrice(item, price)}
                    onError={actions.onPriceError}
                />
                <button
                    type="button"
                    aria-pressed={!data.available}
                    aria-label={data.available ? `${name}: en carta. Marcar como agotado` : `${name}: agotado. Volver a ponerlo en carta`}
                    title={data.available ? 'En carta (toca para marcarlo agotado)' : 'Agotado (toca para volver a ponerlo)'}
                    onClick={() => actions.toggleAvailable(item)}
                    className={cn(
                        'inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-bold transition-colors',
                        kit.focus,
                        data.available
                            ? 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text-muted)] hover:border-[var(--lt-border-strong)]'
                            : 'border-[var(--lt-warning)]/40 bg-[var(--lt-warning-soft)] text-[var(--lt-warning)]',
                    )}
                >
                    <span aria-hidden="true">{data.available ? '🟢' : '🚫'}</span>
                    {!data.available && <span aria-hidden="true">Agotado</span>}
                </button>
                <button
                    type="button"
                    aria-label={`Abrir ficha de ${name}`}
                    title="Abrir ficha"
                    onClick={() => actions.openSheet(item.id)}
                    className={cn('grid h-10 w-9 shrink-0 place-items-center rounded-xl text-[var(--lt-text-muted)] hover:bg-[var(--lt-card-strong)] hover:text-[var(--lt-text)]', kit.focus)}
                >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>

            <ActionMenu
                label={`Más acciones de ${name}`}
                className="col-start-3 row-start-1 self-start sm:col-start-4 sm:self-center"
                items={[
                    { key: 'open', label: '📝 Abrir ficha', onSelect: () => actions.openSheet(item.id) },
                    { key: 'move', label: '📂 Mover a…', onSelect: () => actions.openMoveTo(item) },
                    {
                        key: 'available',
                        label: data.available ? '🚫 Marcar agotado' : '🟢 Volver a poner en carta',
                        onSelect: () => actions.toggleAvailable(item),
                    },
                    { key: 'reviews', label: '💬 Valoraciones', onSelect: () => actions.openSheet(item.id, 'reviews') },
                    { key: 'impulse', label: '📣 Impulsar', onSelect: () => actions.impulse(item) },
                ]}
            />
        </li>
    );
};

/** Lo que se ve bajo el dedo al arrastrar un plato. */
export const MenuItemDragPreview: React.FC<{ item: CanonicalPlaceItem; emoji: string }> = ({ item, emoji }) => {
    const data = itemBusinessDataFrom(item);
    return (
        <div className="flex min-h-12 rotate-2 scale-105 items-center gap-2 rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-card-strong)] px-3 py-2 shadow-2xl">
            <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--lt-text)]">{itemNameOf(item)}</span>
            {data.price && <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--lt-text)]">{data.price}</span>}
        </div>
    );
};
