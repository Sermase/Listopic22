/**
 * Tablero de la carta con arrastrar y soltar (@dnd-kit): platos entre
 * secciones y dentro de cada una (menuOrder), y secciones entre sí. Los mismos
 * sensores que PhotoEditorModal: ratón (5px), dedo (200 ms) y teclado.
 *
 * Mientras se arrastra, el tablero mueve los platos en local; al soltar avisa
 * con los cambios (sección y orden) de los platos que cambian, y nada si el
 * plato vuelve a donde estaba.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    closestCenter,
    closestCorners,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    TouchSensor,
    useSensor,
    useSensors,
    type Announcements,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
    type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { triggerHaptic, triggerHapticSelection } from '../../../utils/haptics';
import {
    buildBoard,
    itemBusinessDataFrom,
    itemNameOf,
    planDropMoves,
    sectionDndId,
    UNSECTIONED,
    type BoardContainers,
    type MenuItemMove,
} from './menuModel';
import { MenuItemDragPreview, MenuItemRow, type MenuRowActions } from './MenuItemRow';
import { MenuSectionCard, UnsectionedCard } from './MenuSectionCard';
import { itemCompletion, sectionEmoji, sectionLabel } from './menuVisuals';

export type { MenuItemMove };

export interface MenuBoardProps {
    items: CanonicalPlaceItem[];
    sections: string[];
    /** Secciones leídas: se pueden reordenar, renombrar y quitar. */
    sectionsReady: boolean;
    reviewedNoAllergens: ReadonlySet<string>;
    flashItemId?: string | null;
    ctaItemId?: string | null;
    rowActions: MenuRowActions;
    onMoveItems: (moves: MenuItemMove[]) => void;
    onReorderSections: (next: string[]) => void;
    onRenameSection: (name: string) => void;
    onChangeSectionEmoji: (name: string) => void;
    onRemoveSection: (name: string) => void;
    onAddItem: (section: string) => void;
    /** Al final del tablero: la tarjeta «＋ Nueva sección». */
    footer?: React.ReactNode;
}

type Containers = BoardContainers;

const EXPAND_ON_HOVER_MS = 600;

const isItemId = (id: UniqueIdentifier) => String(id).startsWith('item:');
const isSectionId = (id: UniqueIdentifier) => String(id).startsWith('sec:');
const idOf = (id: UniqueIdentifier) => String(id).replace(/^(item|sec|container):/, '');

const findContainer = (containers: Containers, id: UniqueIdentifier): string | null => {
    const raw = String(id);
    if (raw.startsWith('container:')) return raw.slice('container:'.length);
    if (raw.startsWith('sec:')) return raw.slice('sec:'.length);
    const itemId = idOf(raw);
    return Object.keys(containers).find((key) => containers[key].includes(itemId)) ?? null;
};

const dragEmoji = (containerKey: string | null) => (
    !containerKey || containerKey === UNSECTIONED ? '🍽️' : sectionEmoji(containerKey)
);

const isMobileViewport = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && !window.matchMedia('(min-width: 1024px)').matches;

// Platos: primero lo que hay bajo el dedo (un plato antes que su sección); con
// teclado, lo más cercano. Secciones: solo otras secciones.
const collisionDetection: CollisionDetection = (args) => {
    const type = args.active.data.current?.type;
    if (type === 'section') {
        return closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((entry) => entry.data.current?.type === 'section'),
        });
    }
    const targets = args.droppableContainers.filter((entry) => entry.data.current?.type !== 'section');
    const hits = pointerWithin({ ...args, droppableContainers: targets });
    if (hits.length > 0) {
        const itemHit = hits.find((hit) => isItemId(hit.id));
        return itemHit ? [itemHit] : hits;
    }
    return closestCorners({ ...args, droppableContainers: targets });
};

export const MenuBoard: React.FC<MenuBoardProps> = ({
    items,
    sections,
    sectionsReady,
    reviewedNoAllergens,
    flashItemId,
    ctaItemId,
    rowActions,
    onMoveItems,
    onReorderSections,
    onRenameSection,
    onChangeSectionEmoji,
    onRemoveSection,
    onAddItem,
    footer,
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
    const board = useMemo(() => buildBoard(items, sections), [items, sections]);
    const baseContainers = useMemo<Containers>(() => {
        const next: Containers = { [UNSECTIONED]: board.unsectioned.map((item) => item.id) };
        board.sections.forEach((section) => { next[section.name] = section.items.map((item) => item.id); });
        return next;
    }, [board]);

    const [dragContainers, setDragContainers] = useState<Containers | null>(null);
    const containers = dragContainers ?? baseContainers;
    const snapshot = useRef<Containers | null>(null);
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [overKey, setOverKey] = useState<string | null>(null);

    // Abiertas en escritorio; en móvil solo la primera (hasta que la persona toque).
    const [collapsedState, setCollapsedState] = useState<Set<string> | null>(null);
    const collapsed = useMemo(
        () => collapsedState ?? new Set(isMobileViewport() ? sections.slice(1) : []),
        [collapsedState, sections],
    );
    const toggleCollapsed = (name: string) => {
        const next = new Set(collapsed);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setCollapsedState(next);
    };

    const expandTimer = useRef<{ key: string; timer: number } | null>(null);
    const clearExpandTimer = () => {
        if (expandTimer.current) window.clearTimeout(expandTimer.current.timer);
        expandTimer.current = null;
    };
    useEffect(() => clearExpandTimer, []);

    // Al llevarte a un plato (recién añadido o encontrado), su sección se abre.
    const revealId = flashItemId || ctaItemId || null;
    const [revealedId, setRevealedId] = useState<string | null>(null);
    if (revealId !== revealedId) {
        setRevealedId(revealId);
        const container = revealId ? findContainer(baseContainers, `item:${revealId}`) : null;
        if (container && collapsed.has(container)) {
            const next = new Set(collapsed);
            next.delete(container);
            setCollapsedState(next);
        }
    }
    const isCollapsed = (name: string) => collapsed.has(name);

    const activeItem = activeId && isItemId(activeId) ? itemById.get(idOf(activeId)) : undefined;
    const activeSection = activeId && isSectionId(activeId) ? idOf(activeId) : null;

    const nameOfDndId = (id: UniqueIdentifier): string => {
        if (isItemId(id)) {
            const item = itemById.get(idOf(id));
            return item ? `«${itemNameOf(item)}»` : 'el plato';
        }
        const key = idOf(id);
        if (key === UNSECTIONED) return '«Sin sección»';
        return `la sección «${sectionLabel(key)}»`;
    };

    const announcements: Announcements = {
        onDragStart: ({ active }) => `Has cogido ${nameOfDndId(active.id)}.`,
        onDragOver: ({ active, over }) => (over ? `${nameOfDndId(active.id)} está sobre ${nameOfDndId(over.id)}.` : `${nameOfDndId(active.id)} no está sobre ninguna sección.`),
        onDragEnd: ({ active, over }) => (over ? `${nameOfDndId(active.id)} soltado en ${nameOfDndId(over.id)}.` : `${nameOfDndId(active.id)} soltado.`),
        onDragCancel: ({ active }) => `Cancelado: ${nameOfDndId(active.id)} vuelve a su sitio.`,
    };

    const reset = () => {
        clearExpandTimer();
        setActiveId(null);
        setOverKey(null);
        setDragContainers(null);
        snapshot.current = null;
    };

    const onDragStart = ({ active }: DragStartEvent) => {
        void triggerHaptic('light');
        setActiveId(active.id);
        if (isItemId(active.id)) {
            snapshot.current = baseContainers;
            setDragContainers(baseContainers);
        }
    };

    const onDragOver = ({ active, over }: DragOverEvent) => {
        if (!over || !isItemId(active.id)) {
            setOverKey(null);
            clearExpandTimer();
            return;
        }
        const current = dragContainers ?? baseContainers;
        const from = findContainer(current, active.id);
        const to = findContainer(current, over.id);
        const origin = snapshot.current ? findContainer(snapshot.current, active.id) : from;
        setOverKey(to && to !== origin ? to : null);

        // Una sección cerrada se abre si el plato se queda encima un momento.
        if (to && isCollapsed(to)) {
            if (expandTimer.current?.key !== to) {
                clearExpandTimer();
                expandTimer.current = {
                    key: to,
                    timer: window.setTimeout(() => {
                        setCollapsedState((prev) => {
                            const next = new Set(prev ?? collapsed);
                            next.delete(to);
                            return next;
                        });
                        expandTimer.current = null;
                    }, EXPAND_ON_HOVER_MS),
                };
            }
        } else {
            clearExpandTimer();
        }

        if (!from || !to || from === to) return;
        const itemId = idOf(active.id);
        setDragContainers((prev) => {
            const state = prev ?? baseContainers;
            const target = state[to] || [];
            let index = target.length;
            if (isItemId(over.id)) {
                const overIndex = target.indexOf(idOf(over.id));
                const translated = active.rect.current.translated;
                const below = translated ? translated.top > over.rect.top + (over.rect.height / 2) : false;
                if (overIndex >= 0) index = overIndex + (below ? 1 : 0);
            }
            return {
                ...state,
                [from]: (state[from] || []).filter((id) => id !== itemId),
                [to]: [...target.slice(0, index).filter((id) => id !== itemId), itemId, ...target.slice(index).filter((id) => id !== itemId)],
            };
        });
    };

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (isSectionId(active.id)) {
            if (over && isSectionId(over.id) && over.id !== active.id) {
                const from = sections.indexOf(idOf(active.id));
                const to = sections.indexOf(idOf(over.id));
                if (from >= 0 && to >= 0) {
                    void triggerHapticSelection();
                    onReorderSections(arrayMove(sections, from, to));
                }
            }
            reset();
            return;
        }
        if (!isItemId(active.id) || !snapshot.current) {
            reset();
            return;
        }
        const itemId = idOf(active.id);
        let final = dragContainers ?? baseContainers;
        const container = findContainer(final, active.id);
        if (over && container && isItemId(over.id) && findContainer(final, over.id) === container) {
            const list = final[container];
            const from = list.indexOf(itemId);
            const to = list.indexOf(idOf(over.id));
            if (from >= 0 && to >= 0 && from !== to) final = { ...final, [container]: arrayMove(list, from, to) };
        }
        const moves = over && container ? planDropMoves(itemId, container, snapshot.current, final, itemById) : [];
        reset();
        if (moves.length > 0) {
            void triggerHapticSelection();
            onMoveItems(moves);
        }
    };

    const renderItem = (containerKey: string) => (itemId: string) => {
        const item = itemById.get(itemId);
        if (!item) return null;
        return (
            <MenuItemRow
                key={itemId}
                item={item}
                containerId={containerKey}
                sectionNames={sections}
                reviewedNoAllergens={reviewedNoAllergens.has(itemId)}
                flash={flashItemId === itemId}
                showCompleteCta={ctaItemId === itemId}
                actions={rowActions}
            />
        );
    };

    const sectionCompletion = (ids: string[]): number | null => {
        if (ids.length === 0) return null;
        const total = ids.reduce((sum, id) => {
            const item = itemById.get(id);
            if (!item) return sum;
            return sum + itemCompletion(itemBusinessDataFrom(item), { sections, reviewedNoAllergens: reviewedNoAllergens.has(id) }).percent;
        }, 0);
        return Math.round(total / ids.length);
    };

    const showBucket = containers[UNSECTIONED].length > 0 || Boolean(activeItem);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={reset}
            accessibility={{
                announcements,
                screenReaderInstructions: {
                    draggable: 'Para mover, pulsa espacio o Intro. Muévelo con las flechas y vuelve a pulsar espacio o Intro para soltarlo. Esc cancela.',
                },
            }}
        >
            <div className="space-y-4">
                {showBucket && (
                    <UnsectionedCard
                        containerKey={UNSECTIONED}
                        itemIds={containers[UNSECTIONED]}
                        renderItem={renderItem(UNSECTIONED)}
                        isOver={overKey === UNSECTIONED}
                    />
                )}
                <SortableContext items={sections.map(sectionDndId)} strategy={verticalListSortingStrategy}>
                    {sections.map((name, index) => {
                        const ids = containers[name] || [];
                        return (
                            <MenuSectionCard
                                key={name}
                                name={name}
                                index={index}
                                total={sections.length}
                                itemIds={ids}
                                renderItem={renderItem(name)}
                                completion={sectionCompletion(ids)}
                                collapsed={isCollapsed(name)}
                                onToggleCollapsed={() => toggleCollapsed(name)}
                                isOver={overKey === name}
                                disabled={!sectionsReady}
                                onMove={(direction) => {
                                    const target = index + direction;
                                    if (target < 0 || target >= sections.length) return;
                                    onReorderSections(arrayMove(sections, index, target));
                                }}
                                onRename={() => onRenameSection(name)}
                                onChangeEmoji={() => onChangeSectionEmoji(name)}
                                onRemove={() => onRemoveSection(name)}
                                onAddItem={() => onAddItem(name)}
                            />
                        );
                    })}
                </SortableContext>
                {footer}
            </div>
            <DragOverlay dropAnimation={null}>
                {activeItem ? (
                    <MenuItemDragPreview item={activeItem} emoji={dragEmoji(findContainer(containers, `item:${activeItem.id}`))} />
                ) : activeSection ? (
                    <div className="flex min-h-14 rotate-1 scale-105 items-center gap-3 rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-card-strong)] px-4 py-2 shadow-2xl">
                        <span aria-hidden="true" className="text-xl leading-none">{sectionEmoji(activeSection)}</span>
                        <span className="text-base font-black text-[var(--lt-text)]">{sectionLabel(activeSection)}</span>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

