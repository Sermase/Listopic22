/**
 * «🍽️ Nuevo plato» (spec §7.6): nombre, sección, precio y, si quieres, la lista
 * de Listopic en la que encaja (ListSearch).
 *
 *   <NewItemModal open={open} items={items} sections={names} sectionsReady
 *     defaultSection="Postres" suggestedListIds={ids} placeName={name} placeTypes={types}
 *     onCreate={create} onOpenExisting={openSheet} onClose={close} />
 *
 * `onCreate` lanza si falla (el error sale junto al botón). Las listas privadas
 * no valen: se avisa aquí y el servidor también las rechaza.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Modal } from '../../ui';
import { ListSearch } from '../../ListSearch';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { cn } from '../../../lib/utils';
import { businessErrorCopy, ChoiceCards, kit, TextField, type ChoiceOption } from '../kit';
import { findItemByName, itemNameOf, UNSECTIONED } from './menuModel';
import { formatPriceInput, MAX_ITEM_NAME, MAX_PRICE_TEXT, sectionEmoji, sectionLabel } from './menuVisuals';
import { listUsableProblem } from './useListNames';

export interface NewItemInput {
    name: string;
    /** '' = sin sección. */
    group: string;
    price: string;
    listId: string | null;
}

export interface NewItemModalProps {
    open: boolean;
    items: CanonicalPlaceItem[];
    sections: string[];
    sectionsReady: boolean;
    /** Sección preelegida ('' = sin sección). */
    defaultSection: string;
    placeName?: string;
    placeTypes?: string[];
    /** Listas donde ya están otros platos del negocio (referencia estable). */
    suggestedListIds: string[];
    onCreate: (input: NewItemInput) => Promise<void>;
    onOpenExisting: (itemId: string) => void;
    onClose: () => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = (props) => {
    if (!props.open) return null;
    return <NewItemForm {...props} />;
};

const NewItemForm: React.FC<NewItemModalProps> = ({
    items,
    sections,
    sectionsReady,
    defaultSection,
    placeName,
    placeTypes,
    suggestedListIds,
    onCreate,
    onOpenExisting,
    onClose,
}) => {
    const formId = useId();
    const [name, setName] = useState('');
    const [group, setGroup] = useState(defaultSection && sections.includes(defaultSection) ? defaultSection : '');
    const [price, setPrice] = useState('');
    const [pickList, setPickList] = useState(true);
    const [listId, setListId] = useState<string | null>(null);
    const [listCheck, setListCheck] = useState<{ listId: string; problem: string | null } | null>(null);
    const [creating, setCreating] = useState(false);
    const creatingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!listId) return;
        let cancelled = false;
        void listUsableProblem(listId)
            .catch(() => null)
            .then((problem) => {
                if (!cancelled) setListCheck({ listId, problem });
            });
        return () => {
            cancelled = true;
        };
    }, [listId]);

    const checkingList = Boolean(listId) && listCheck?.listId !== listId;
    const listProblem = listId && listCheck?.listId === listId ? listCheck.problem : null;
    const trimmed = name.trim();
    const existing = trimmed ? findItemByName(items, trimmed) : null;

    const options: ChoiceOption<string>[] = [
        ...sections.map((section) => ({ value: section, title: sectionLabel(section), emoji: sectionEmoji(section) })),
        { value: UNSECTIONED, title: 'Sin sección', emoji: '📦' },
    ];

    const invalidReason = !trimmed
        ? 'Escribe el nombre del plato.'
        : existing ? 'Ese plato ya está en tu carta.'
            : checkingList ? 'Comprobando la lista…'
                : listProblem ? 'Elige otra lista o pulsa «Ahora no».' : null;

    const submit = async () => {
        if (invalidReason || creatingRef.current) return;
        creatingRef.current = true;
        setCreating(true);
        setError(null);
        try {
            await onCreate({
                name: trimmed,
                group: sections.includes(group) ? group : '',
                price: formatPriceInput(price),
                listId: pickList ? listId : null,
            });
        } catch (failure) {
            setError(businessErrorCopy(failure, '😕 No se pudo añadir el plato. Inténtalo de nuevo.').message);
        } finally {
            creatingRef.current = false;
            setCreating(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="text-base font-black">🍽️ Nuevo plato</span>}
            footer={(
                <div className="space-y-2">
                    {error && (
                        <p role="alert" className="rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">{error}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {invalidReason && trimmed && (
                            <p className="mr-auto text-sm font-semibold text-[var(--lt-warning)]">{invalidReason}</p>
                        )}
                        <Button variant="ghost" onClick={onClose} disabled={creating} className="min-h-11">Cancelar</Button>
                        <Button type="submit" form={formId} disabled={Boolean(invalidReason)} loading={creating} className="min-h-11">
                            ＋ Añadir plato
                        </Button>
                    </div>
                </div>
            )}
        >
            <form
                id={formId}
                className="space-y-5"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <div className="space-y-2">
                    <TextField
                        label="Nombre del plato"
                        value={name}
                        onChange={(next) => {
                            setName(next);
                            setError(null);
                        }}
                        max={MAX_ITEM_NAME}
                        required
                        autoFocus
                        placeholder="Croquetas de jamón"
                        disabled={creating}
                    />
                    {existing && (
                        <div role="status" className={cn(kit.inset, 'flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-[var(--lt-text)]')}>
                            <span className="min-w-0 flex-1">👀 Ya tienes «{itemNameOf(existing)}» en la carta.</span>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onOpenExisting(existing.id)}
                                className="min-h-11 border-[var(--lt-border-strong)] bg-[var(--lt-glass)]"
                            >
                                Abrir ficha
                            </Button>
                        </div>
                    )}
                </div>

                <ChoiceCards
                    legend="📂 Sección"
                    variant="compact"
                    options={options}
                    value={group || UNSECTIONED}
                    onChange={(value) => setGroup(value === UNSECTIONED ? '' : value)}
                    disabled={creating}
                    help={sectionsReady ? (sections.length === 0 ? 'Aún no tienes secciones; puedes colocarlo después.' : undefined) : 'Cargando tus secciones…'}
                />

                <TextField
                    label="💶 Precio (opcional)"
                    value={price}
                    onChange={setPrice}
                    onBlur={() => setPrice((prev) => formatPriceInput(prev))}
                    inputMode="decimal"
                    placeholder="6,50 €"
                    max={MAX_PRICE_TEXT}
                    disabled={creating}
                />

                <section className={cn(kit.inset, 'space-y-3 p-3 sm:p-4')} aria-labelledby={`${formId}-list`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h3 id={`${formId}-list`} className={kit.label}>📋 ¿En qué lista de Listopic encaja?</h3>
                            <p className="text-xs text-[var(--lt-text-muted)]">Así tu plato podrá salir destacado en esa lista cuando lo impulses 📣</p>
                        </div>
                        {pickList ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setPickList(false);
                                    setListId(null);
                                }}
                                className={cn('min-h-11 shrink-0 rounded-lg px-1 text-sm font-semibold text-[var(--lt-text-muted)] underline underline-offset-4 hover:text-[var(--lt-text)]', kit.focus)}
                            >
                                Ahora no
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setPickList(true)}
                                className={cn('min-h-11 shrink-0 rounded-lg px-1 text-sm font-semibold text-[var(--lt-accent)] underline-offset-4 hover:underline', kit.focus)}
                            >
                                📋 Elegir lista
                            </button>
                        )}
                    </div>
                    {pickList && (
                        <>
                            <ListSearch
                                onSelect={(id) => setListId(id)}
                                selectedListId={listId}
                                placeName={placeName}
                                placeTypes={placeTypes}
                                suggestedListIds={suggestedListIds}
                            />
                            {listProblem && (
                                <p role="alert" className="text-sm font-semibold text-[var(--lt-danger)]">{listProblem}</p>
                            )}
                            {checkingList && <p className="text-xs text-[var(--lt-text-muted)]">Comprobando la lista…</p>}
                        </>
                    )}
                </section>
            </form>
        </Modal>
    );
};
