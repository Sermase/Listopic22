/**
 * Tarjeta de una sección del tablero (y el cajón «📦 Sin sección»). La
 * tarjeta entera es la zona donde soltar platos; la cabecera lleva el asa para
 * reordenar secciones, ↑/↓, el emoji, el nombre, cuántos platos tiene, su
 * anillo de progreso y el menú «⋮».
 */
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { kit } from '../kit';
import { ActionMenu, CompletionRing } from './menuParts';
import { containerDndId, sectionDndId } from './menuModel';
import { sectionEmoji, sectionLabel } from './menuVisuals';

const platos = (count: number) => (count === 1 ? '1 plato' : `${count} platos`);

const DropHint: React.FC = () => (
    <p className="rounded-xl border-2 border-dashed border-[var(--lt-accent-border)] px-3 py-2 text-center text-sm font-bold text-[var(--lt-text)]">
        Suelta aquí <span aria-hidden="true">👇</span>
    </p>
);

interface SectionBodyProps {
    itemIds: string[];
    renderItem: (itemId: string) => React.ReactNode;
    emptyText: React.ReactNode;
    isOver: boolean;
    footer?: React.ReactNode;
}

const SectionBody: React.FC<SectionBodyProps> = ({ itemIds, renderItem, emptyText, isOver, footer }) => (
    <div className="space-y-2 px-2 pb-3 sm:px-3">
        <SortableContext items={itemIds.map((id) => `item:${id}`)} strategy={verticalListSortingStrategy}>
            {itemIds.length > 0 ? (
                <ul className="space-y-2">{itemIds.map((id) => renderItem(id))}</ul>
            ) : !isOver ? (
                <p className="rounded-xl border border-dashed border-[var(--lt-border-strong)] px-3 py-4 text-center text-sm text-[var(--lt-text-muted)]">
                    {emptyText}
                </p>
            ) : null}
        </SortableContext>
        {isOver && <DropHint />}
        {footer}
    </div>
);

export interface MenuSectionCardProps {
    name: string;
    index: number;
    total: number;
    itemIds: string[];
    renderItem: (itemId: string) => React.ReactNode;
    completion: number | null;
    collapsed: boolean;
    onToggleCollapsed: () => void;
    isOver: boolean;
    disabled?: boolean;
    onMove: (direction: -1 | 1) => void;
    onRename: () => void;
    onChangeEmoji: () => void;
    onRemove: () => void;
    onAddItem: () => void;
}

export const MenuSectionCard: React.FC<MenuSectionCardProps> = ({
    name,
    index,
    total,
    itemIds,
    renderItem,
    completion,
    collapsed,
    onToggleCollapsed,
    isOver,
    disabled = false,
    onMove,
    onRename,
    onChangeEmoji,
    onRemove,
    onAddItem,
}) => {
    const label = sectionLabel(name);
    const emoji = sectionEmoji(name);
    const {
        attributes,
        listeners,
        setNodeRef: setSortRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: sectionDndId(name), data: { type: 'section', name }, disabled });
    const { setNodeRef: setDropRef } = useDroppable({ id: containerDndId(name), data: { type: 'container', container: name } });
    const setRefs = (node: HTMLElement | null) => {
        setSortRef(node);
        setDropRef(node);
    };
    const bodyId = `carta-seccion-${index}`;

    return (
        <section
            ref={setRefs}
            aria-label={`Sección ${label}`}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn(
                'rounded-2xl border bg-[var(--lt-card-strong)] shadow-sm transition-colors',
                isOver ? 'border-dashed border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]' : 'border-[var(--lt-border)]',
                isDragging && 'opacity-40',
            )}
        >
            <header className="flex items-center gap-1.5 p-2 sm:gap-2 sm:p-3">
                <button
                    ref={setActivatorNodeRef}
                    type="button"
                    aria-label={`Arrastrar la sección ${label}`}
                    title="Arrastra para ordenar las secciones"
                    disabled={disabled}
                    className={cn(
                        'grid h-11 w-8 shrink-0 touch-none place-items-center rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] disabled:opacity-40',
                        kit.focus,
                        !disabled && 'cursor-grab active:cursor-grabbing',
                    )}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-5 w-5" aria-hidden="true" />
                </button>
                <span
                    aria-hidden="true"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-xl leading-none"
                >
                    {emoji}
                </span>
                <h3 className="flex min-w-0 flex-1">
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        aria-expanded={!collapsed}
                        aria-controls={bodyId}
                        className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl text-left', kit.focus)}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-black leading-tight text-[var(--lt-text)] sm:text-lg">{label}</span>
                            {' '}
                            <span className="block text-xs font-semibold text-[var(--lt-text-muted)]">{platos(itemIds.length)}</span>
                        </span>
                        <ChevronDown
                            className={cn('h-5 w-5 shrink-0 text-[var(--lt-text-muted)] transition-transform motion-reduce:transition-none', !collapsed && 'rotate-180')}
                            aria-hidden="true"
                        />
                    </button>
                </h3>
                {completion !== null && <CompletionRing percent={completion} label={`${label}: fichas al ${completion} %`} />}
                <div className="hidden items-center sm:flex">
                    <button
                        type="button"
                        aria-label={`Subir la sección ${label}`}
                        title="Subir"
                        disabled={disabled || index === 0}
                        onClick={() => onMove(-1)}
                        className={cn('grid h-11 w-9 place-items-center rounded-xl text-[var(--lt-text-muted)] hover:bg-[var(--lt-glass)] hover:text-[var(--lt-text)] disabled:opacity-30', kit.focus)}
                    >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label={`Bajar la sección ${label}`}
                        title="Bajar"
                        disabled={disabled || index === total - 1}
                        onClick={() => onMove(1)}
                        className={cn('grid h-11 w-9 place-items-center rounded-xl text-[var(--lt-text-muted)] hover:bg-[var(--lt-glass)] hover:text-[var(--lt-text)] disabled:opacity-30', kit.focus)}
                    >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                <ActionMenu
                    label={`Opciones de la sección ${label}`}
                    items={[
                        { key: 'rename', label: '✏️ Renombrar', onSelect: onRename, disabled },
                        { key: 'emoji', label: '😀 Cambiar emoji', onSelect: onChangeEmoji, disabled },
                        { key: 'up', label: '⬆️ Subir', onSelect: () => onMove(-1), disabled: disabled || index === 0 },
                        { key: 'down', label: '⬇️ Bajar', onSelect: () => onMove(1), disabled: disabled || index === total - 1 },
                        { key: 'add', label: '＋ Añadir plato aquí', onSelect: onAddItem },
                        { key: 'remove', label: '🗑️ Eliminar sección', onSelect: onRemove, danger: true, disabled },
                    ]}
                />
            </header>
            <div id={bodyId} hidden={collapsed && !isOver}>
                {collapsed ? (
                    isOver ? <div className="px-2 pb-3 sm:px-3"><DropHint /></div> : null
                ) : (
                    <SectionBody
                        itemIds={itemIds}
                        renderItem={renderItem}
                        isOver={isOver}
                        emptyText={<>🫙 Nada por aquí todavía. Arrastra platos o añade uno.</>}
                        footer={(
                            <button
                                type="button"
                                onClick={onAddItem}
                                className={cn(
                                    'flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--lt-border-strong)] px-3 text-sm font-bold text-[var(--lt-text-muted)] transition-colors hover:border-[var(--lt-accent-border)] hover:text-[var(--lt-text)]',
                                    kit.focus,
                                )}
                            >
                                ＋ Añadir plato en {label}
                            </button>
                        )}
                    />
                )}
            </div>
        </section>
    );
};

/** «📦 Sin sección»: platos sin sección o de una sección que ya no existe. Va primero. */
export const UnsectionedCard: React.FC<{
    containerKey: string;
    itemIds: string[];
    renderItem: (itemId: string) => React.ReactNode;
    isOver: boolean;
}> = ({ containerKey, itemIds, renderItem, isOver }) => {
    const { setNodeRef } = useDroppable({ id: containerDndId(containerKey), data: { type: 'container', container: containerKey } });
    return (
        <section
            ref={setNodeRef}
            id="carta-sin-seccion"
            tabIndex={-1}
            aria-label="Sin sección"
            className={cn(
                'scroll-mt-40 rounded-2xl border-2 border-dashed outline-none transition-colors',
                isOver ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]' : 'border-[var(--lt-warning)]/50 bg-[var(--lt-card-strong)]',
            )}
        >
            <header className="flex items-center gap-3 p-3">
                <span
                    aria-hidden="true"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-xl leading-none"
                >
                    📦
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-black leading-tight text-[var(--lt-text)] sm:text-lg">Sin sección</h3>
                    <p className="text-sm text-[var(--lt-warning)]">
                        {itemIds.length > 0 ? <>Arrastra estos platos a su sección <span aria-hidden="true">👇</span></> : 'Suelta aquí para dejarlo sin sección.'}
                    </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-[var(--lt-text-muted)]">{platos(itemIds.length)}</span>
            </header>
            <SectionBody
                itemIds={itemIds}
                renderItem={renderItem}
                isOver={isOver}
                emptyText="Nada sin sección."
            />
        </section>
    );
};
