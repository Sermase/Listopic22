/**
 * 📖 «Tu carta» (spec §7): el negocio ordena sus platos por secciones
 * arrastrando, edita precio y disponibilidad en la fila, completa cada ficha
 * en un modal, añade platos (con su lista de Listopic) y propone correcciones.
 *
 *   <BusinessItemsSection placeId={placeId} placeName={place?.name} placeTypes={place?.types}
 *     onGoToTab={(tab, params) => goToTab(tab, params)} />
 *
 * Reglas que se mantienen:
 * - Cada guardado de un plato manda la ficha completa (el servidor rehace todos
 *   los campos); varios platos a la vez van en lotes de 50 (updateBusinessMenuItems).
 * - Las secciones se guardan solas y nunca antes de leer las guardadas.
 * - Recargar no vacía la carta: si falla, se queda lo que había.
 * - No se escribe lo que no cambia; reordenar secciones espera 800 ms y la
 *   disponibilidad de cada plato, 600 ms.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getCachedDoc } from '../../../lib/queryCache';
import { cn } from '../../../lib/utils';
import { getCanonicalPlaceItems, type CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import {
    createBusinessItem,
    getBusinessItemExistsDetails,
    getMyItemProposals,
    getPlaceReviewsForManager,
    isCallableUnavailableError,
    MAX_MENU_ITEMS_BATCH,
    normalizeItemName,
    submitItemProposal,
    updateBusinessMenuItems,
    updateCanonicalItemBusinessData,
    type ItemBusinessData,
    type ItemProposal,
    type ItemProposalType,
    type ManagerPlaceReview,
} from '../../../services/BusinessProService';
import { businessErrorCopy, EmptyState, isDeepEqual, kit, PanelError, prefersReducedMotion, SoftCard } from '../kit';
import { CartaHeader, type CartaView } from './CartaHeader';
import { healPlaceItems } from './getPlaceItemsHealed';
import { ItemSheetModal } from './ItemSheetModal';
import { MenuBoard, type MenuItemMove } from './MenuBoard';
import type { ItemSheetTab, MenuRowActions } from './MenuItemRow';
import {
    chunk,
    itemBusinessDataFrom,
    itemGroupOf,
    itemNameOf,
    MAX_MENU_SECTIONS,
    readReviewedNoAllergens,
    sortPlaceItems,
    writeReviewedNoAllergens,
} from './menuModel';
import { MenuPublicPreview } from './MenuPublicPreview';
import { DeleteSectionModal, MoveToModal, SectionEditModal, type DeleteSectionTarget } from './MenuSectionModals';
import { sectionLabel, sectionNameTaken, TYPICAL_SECTIONS } from './menuVisuals';
import { NewItemModal, type NewItemInput } from './NewItemModal';
import { NewSectionCard } from './NewSectionCard';
import { ProposalsHistoryModal } from './ProposalsHistoryModal';
import { useMenuSections } from './useMenuSections';

const AVAILABILITY_DEBOUNCE_MS = 600;
const FLASH_MS = 1500;

type LoadState = 'loading' | 'ready' | 'error';
type StoredData = Record<string, unknown>;

/** Cambio de un plato: la ficha completa nueva y cómo estaba antes (para deshacer). */
interface ItemChange {
    itemId: string;
    data: ItemBusinessData;
    previous: StoredData | undefined;
}

interface PersistResult {
    saved: Map<string, StoredData>;
    error: unknown;
}

const changeFor = (item: CanonicalPlaceItem, patch: Partial<ItemBusinessData>): ItemChange => ({
    itemId: item.id,
    data: { ...itemBusinessDataFrom(item), ...patch },
    previous: item.businessData,
});

const withData = (item: CanonicalPlaceItem, data: object | undefined): CanonicalPlaceItem => ({
    ...item,
    businessData: { ...(item.businessData || {}), ...(data || {}) },
});

const sameStrings = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((entry, index) => entry === b[index]);

export interface BusinessItemsSectionProps {
    placeId: string;
    /** Para sugerir listas al añadir un plato; si faltan se leen del sitio. */
    placeName?: string;
    placeTypes?: string[];
    /**
     * Ir a otra pestaña con parámetros (Carta → «📣 Impulsar» abre Promos con el
     * plato), pasando por el aviso de cambios sin guardar de la página. Sin él,
     * se cambia la URL directamente.
     */
    onGoToTab?: (tab: 'sponsored', params: Record<string, string>) => void;
}

export const BusinessItemsSection: React.FC<BusinessItemsSectionProps> = ({ placeId, placeName, placeTypes, onGoToTab }) => {
    const { user } = useAuth();
    const uid = user?.uid ?? null;
    const { showToast } = useToast();
    const [, setSearchParams] = useSearchParams();

    // ── Datos ───────────────────────────────────────────────────────────────
    const [items, setItems] = useState<CanonicalPlaceItem[]>([]);
    const [itemsState, setItemsState] = useState<LoadState>('loading');
    const [reviews, setReviews] = useState<ManagerPlaceReview[]>([]);
    const [reviewsState, setReviewsState] = useState<LoadState>('loading');
    const [proposals, setProposals] = useState<ItemProposal[]>([]);
    const itemsRef = useRef<CanonicalPlaceItem[]>([]);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);
    // Sube con cada cambio local: una lectura que empezó antes no lo pisa.
    const itemsVersion = useRef(0);
    // Último cambio pedido por plato: solo ese aplica (o deshace) lo que vuelva del servidor.
    const latestOp = useRef(new Map<string, number>());
    const opSeq = useRef(0);

    const fetchAll = useCallback(async (isCancelled: () => boolean = () => false): Promise<CanonicalPlaceItem[] | null> => {
        const startVersion = itemsVersion.current;
        const [itemResult, reviewResult] = await Promise.allSettled([
            getCanonicalPlaceItems(placeId),
            getPlaceReviewsForManager(placeId),
        ]);
        if (isCancelled()) return null;
        const reviewRows = reviewResult.status === 'fulfilled' ? reviewResult.value : null;
        if (reviewRows) {
            setReviews(reviewRows);
            setReviewsState('ready');
        } else {
            console.error('BusinessItemsSection: reviews load failed', reviewResult.status === 'rejected' ? reviewResult.reason : null);
            // Si ya había valoraciones se quedan; si no, se dice.
            setReviewsState((prev) => (prev === 'ready' ? prev : 'error'));
        }
        if (itemResult.status === 'rejected') {
            console.error('BusinessItemsSection: items load failed', itemResult.reason);
            setItemsState((prev) => (prev === 'ready' ? prev : 'error'));
            return null;
        }
        const rows = reviewRows ? await healPlaceItems(placeId, itemResult.value, reviewRows) : itemResult.value;
        if (isCancelled()) return null;
        if (itemsVersion.current === startVersion) {
            setItems(rows);
        } else {
            // Hubo cambios locales durante la lectura: se quedan y se añade lo que faltaba.
            setItems((prev) => {
                const known = new Set(prev.map((item) => item.id));
                return sortPlaceItems([...prev, ...rows.filter((item) => !known.has(item.id))]);
            });
        }
        setItemsState('ready');
        return rows;
    }, [placeId]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            await fetchAll(() => cancelled);
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [fetchAll]);

    const retryItems = () => {
        setItemsState('loading');
        void fetchAll();
    };
    const retryReviews = () => {
        setReviewsState('loading');
        void fetchAll();
    };

    const loadProposals = useCallback(async (): Promise<ItemProposal[]> => {
        if (!uid) return [];
        const rows = await getMyItemProposals(placeId, uid);
        setProposals(rows);
        return rows;
    }, [placeId, uid]);

    useEffect(() => {
        const load = async () => {
            try {
                await loadProposals();
            } catch (error) {
                console.warn('BusinessItemsSection: proposals load failed', error);
            }
        };
        void load();
    }, [loadProposals]);

    const pendingProposals = proposals.filter((proposal) => proposal.status === 'pending' || proposal.status === 'applying').length;

    const menu = useMenuSections(placeId, {
        onSaved: () => showToast({ variant: 'success', message: '✅ Secciones guardadas', durationMs: 2500 }),
        onError: (error, restored) => showToast({
            variant: 'error',
            title: '😕 No se pudieron guardar las secciones',
            message: `${businessErrorCopy(error).message}${restored ? ' Te muestro las que había guardadas.' : ''}`,
        }),
    });
    // Si no se pudieron leer las secciones, el tablero agrupa por las de los
    // platos (sin poder tocarlas) en vez de mandarlo todo a «Sin sección».
    const itemGroupsKey = useMemo(() => {
        const seen: string[] = [];
        items.forEach((item) => {
            const group = itemGroupOf(item);
            if (group && !seen.includes(group)) seen.push(group);
        });
        return seen.join('\n');
    }, [items]);
    const fallbackSections = useMemo(() => (itemGroupsKey ? itemGroupsKey.split('\n') : []), [itemGroupsKey]);
    const sections = menu.ready ? menu.sections : fallbackSections;
    const sectionsKnown = menu.ready || menu.loadError;

    // Datos del sitio para sugerir listas (si la página no los pasa).
    const [placeInfo, setPlaceInfo] = useState<{ name?: string; types?: string[] }>({});
    const needsPlaceInfo = !placeName || !placeTypes;
    useEffect(() => {
        if (!needsPlaceInfo) return;
        let cancelled = false;
        void getCachedDoc('places', placeId).then((data) => {
            if (cancelled || !data) return;
            setPlaceInfo({
                name: typeof data.name === 'string' ? data.name : undefined,
                types: Array.isArray(data.types) ? data.types.filter((entry): entry is string => typeof entry === 'string') : undefined,
            });
        });
        return () => {
            cancelled = true;
        };
    }, [placeId, needsPlaceInfo]);
    const effectivePlaceName = placeName || placeInfo.name;
    // ListSearch vuelve a leer las listas si cambia la referencia: claves estables.
    const typesKey = (placeTypes || placeInfo.types || []).join('|');
    const effectivePlaceTypes = useMemo(() => (typesKey ? typesKey.split('|') : undefined), [typesKey]);
    const listKey = useMemo(
        () => Array.from(new Set(items.flatMap((item) => item.linkedListIds || []))).filter(Boolean).sort().join('|'),
        [items],
    );
    const suggestedListIds = useMemo(() => (listKey ? listKey.split('|') : []), [listKey]);

    // «✅ Revisado: sin alérgenos» (solo en este navegador).
    const [reviewedNoAllergens, setReviewedNoAllergens] = useState<Set<string>>(() => readReviewedNoAllergens(placeId));
    const setReviewed = (itemId: string, next: boolean) => {
        setReviewedNoAllergens((prev) => {
            const updated = new Set(prev);
            if (next) updated.add(itemId);
            else updated.delete(itemId);
            writeReviewedNoAllergens(placeId, updated);
            return updated;
        });
    };

    // ── Guardar platos ──────────────────────────────────────────────────────

    // Con Functions anteriores (aún sin updateBusinessMenuItems) los lotes van
    // plato a plato; se recuerda para no volver a probar en esta visita.
    const batchUnavailable = useRef(false);

    /** Envía los cambios (uno solo o en lotes de 50) y devuelve lo guardado por plato. */
    const sendChanges = useCallback(async (changes: ItemChange[]): Promise<PersistResult> => {
        const saved = new Map<string, StoredData>();
        const sendOne = async (change: ItemChange) => {
            const stored = await updateCanonicalItemBusinessData(placeId, change.itemId, change.data);
            saved.set(change.itemId, { ...change.data, ...(stored || {}) });
        };
        try {
            if (changes.length === 1) {
                await sendOne(changes[0]);
            } else {
                for (const part of chunk(changes, MAX_MENU_ITEMS_BATCH)) {
                    let rows: Awaited<ReturnType<typeof updateBusinessMenuItems>> | null = null;
                    if (!batchUnavailable.current) {
                        try {
                            rows = await updateBusinessMenuItems(placeId, part.map((change) => ({ itemId: change.itemId, data: change.data })));
                        } catch (error) {
                            if (!isCallableUnavailableError(error)) throw error;
                            console.warn('BusinessItemsSection: updateBusinessMenuItems unavailable, saving one by one', error);
                            batchUnavailable.current = true;
                        }
                    }
                    if (rows) {
                        const byId = new Map(rows.map((row) => [row.itemId, row.data] as const));
                        part.forEach((change) => saved.set(change.itemId, { ...change.data, ...(byId.get(change.itemId) || {}) }));
                    } else {
                        for (const change of part) await sendOne(change);
                    }
                }
            }
            return { saved, error: null };
        } catch (error) {
            console.error('BusinessItemsSection: save items failed', error);
            return { saved, error };
        }
    }, [placeId]);

    // Functions anteriores no guardan menuOrder (vuelve null): el orden dentro
    // de la sección sigue por nota. Se avisa una vez en vez de «saltar» sin más.
    const orderNoticeShown = useRef(false);
    const noticeIfOrderIgnored = useCallback((changes: ItemChange[], saved: Map<string, StoredData>) => {
        if (orderNoticeShown.current) return;
        const ignored = changes.some((change) => typeof change.data.menuOrder === 'number'
            && saved.has(change.itemId)
            && typeof saved.get(change.itemId)?.menuOrder !== 'number');
        if (!ignored) return;
        orderNoticeShown.current = true;
        showToast({
            variant: 'info',
            title: '↕️ Orden por nota, de momento',
            message: 'Mover platos de sección ya funciona. El orden dentro de cada sección se guardará cuando terminemos de actualizar el servidor: mientras, van por nota ⭐.',
            durationMs: 7000,
        });
    }, [showToast]);

    /**
     * Cambio optimista: se ve al momento, se guarda y, si falla, vuelve a como
     * estaba (solo si no hubo otro cambio después en ese plato). Sin `force`, lo
     * que no cambia nada no se envía.
     */
    const persist = useCallback(async (
        changes: ItemChange[],
        { failTitle, toast = true, force = false }: { failTitle?: string; toast?: boolean; force?: boolean } = {},
    ): Promise<PersistResult> => {
        const pending = force ? changes : changes.filter((change) => {
            const current = itemsRef.current.find((item) => item.id === change.itemId);
            return current && !isDeepEqual(itemBusinessDataFrom(current), change.data);
        });
        if (pending.length === 0) return { saved: new Map(), error: null };
        opSeq.current += 1;
        const op = opSeq.current;
        pending.forEach((change) => latestOp.current.set(change.itemId, op));
        const byId = new Map(pending.map((change) => [change.itemId, change] as const));
        itemsVersion.current += 1;
        setItems((prev) => prev.map((item) => {
            const change = byId.get(item.id);
            return change ? withData(item, change.data) : item;
        }));

        const result = await sendChanges(pending);
        noticeIfOrderIgnored(pending, result.saved);
        itemsVersion.current += 1;
        setItems((prev) => prev.map((item) => {
            const change = byId.get(item.id);
            if (!change || latestOp.current.get(item.id) !== op) return item;
            const stored = result.saved.get(item.id);
            if (stored) return withData(item, stored);
            return result.error ? { ...item, businessData: change.previous } : item;
        }));
        if (result.error && toast) {
            showToast({ variant: 'error', title: failTitle || '😕 No se pudo guardar', message: businessErrorCopy(result.error).message });
        }
        return result;
    }, [sendChanges, noticeIfOrderIgnored, showToast]);

    const findItem = (itemId: string) => itemsRef.current.find((item) => item.id === itemId);

    // Disponibilidad: un toque cambia al momento; se guarda 600 ms después (y nada si vuelve a como estaba).
    const availabilityTimers = useRef(new Map<string, number>());
    const availabilityBase = useRef(new Map<string, { available: boolean; previous: StoredData | undefined }>());
    const flushAvailability = useCallback((itemId: string) => {
        availabilityTimers.current.delete(itemId);
        const base = availabilityBase.current.get(itemId);
        availabilityBase.current.delete(itemId);
        const latest = itemsRef.current.find((item) => item.id === itemId);
        if (!base || !latest) return;
        const data = itemBusinessDataFrom(latest);
        if (data.available === base.available) return;
        void persist([{ itemId, data, previous: base.previous }], { failTitle: '😕 No se pudo cambiar la disponibilidad', force: true });
    }, [persist]);

    useEffect(() => {
        const timers = availabilityTimers.current;
        return () => {
            // Al salir, lo que estaba esperando se guarda ya.
            Array.from(timers.keys()).forEach((itemId) => {
                window.clearTimeout(timers.get(itemId));
                flushAvailability(itemId);
            });
        };
    }, [flushAvailability]);

    const toggleAvailable = (item: CanonicalPlaceItem) => {
        const current = itemBusinessDataFrom(item).available;
        if (!availabilityBase.current.has(item.id)) {
            availabilityBase.current.set(item.id, { available: current, previous: item.businessData });
        }
        setItems((prev) => prev.map((entry) => (entry.id === item.id ? withData(entry, { available: !current }) : entry)));
        window.clearTimeout(availabilityTimers.current.get(item.id));
        availabilityTimers.current.set(item.id, window.setTimeout(() => flushAvailability(item.id), AVAILABILITY_DEBOUNCE_MS));
    };

    const savePrice = async (item: CanonicalPlaceItem, price: string) => {
        const current = findItem(item.id) ?? item;
        const { error } = await persist([changeFor(current, { price })], { toast: false });
        if (error) throw error;
    };

    const moveItems = (moves: MenuItemMove[]) => {
        const changes = moves.flatMap((move) => {
            const item = findItem(move.itemId);
            return item ? [changeFor(item, { group: move.group, menuOrder: move.menuOrder })] : [];
        });
        void persist(changes, { failTitle: changes.length === 1 ? '😕 No se pudo mover el plato' : '😕 No se pudieron mover los platos' });
    };

    // ── Ficha, alta y propuestas ────────────────────────────────────────────
    const [sheet, setSheet] = useState<{ itemId: string; tab: ItemSheetTab } | null>(null);
    const [flashItemId, setFlashItemId] = useState<string | null>(null);
    const [ctaItemId, setCtaItemId] = useState<string | null>(null);
    const pendingReveal = useRef<string | null>(null);
    const flashTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(flashTimer.current), []);

    const openSheet = (itemId: string, tab: ItemSheetTab = 'ficha') => {
        setSheet({ itemId, tab });
        if (ctaItemId === itemId) setCtaItemId(null);
    };

    /** Lleva a la fila del plato y la ilumina 1,5 s (sin destello con «reducir movimiento»). */
    const reveal = (itemId: string) => {
        pendingReveal.current = itemId;
        window.clearTimeout(flashTimer.current);
        setFlashItemId(itemId);
        flashTimer.current = window.setTimeout(() => setFlashItemId(null), FLASH_MS);
    };

    useEffect(() => {
        const itemId = pendingReveal.current;
        if (!itemId) return;
        const row = Array.from(document.querySelectorAll<HTMLElement>('[data-item-id]')).find((element) => element.dataset.itemId === itemId);
        if (!row) return;
        pendingReveal.current = null;
        row.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, [items, flashItemId]);

    const [newItem, setNewItem] = useState<{ open: boolean; section: string }>({ open: false, section: '' });
    const [lastSection, setLastSection] = useState('');
    const openNewItem = (section?: string) => setNewItem({ open: true, section: section ?? lastSection });
    const closeNewItem = () => setNewItem((prev) => ({ ...prev, open: false }));

    const createItem = async ({ name, group, price, listId }: NewItemInput) => {
        try {
            const created = await createBusinessItem(placeId, name, { group, price }, listId);
            itemsVersion.current += 1;
            setItems((prev) => sortPlaceItems([...prev.filter((item) => item.id !== created.itemId), created.item]));
            setLastSection(group);
            closeNewItem();
            setCtaItemId(created.itemId);
            reveal(created.itemId);
            // Functions anteriores crean el plato pero no guardan la lista elegida.
            const listMissing = Boolean(listId) && !(created.item.linkedListIds || []).includes(listId as string);
            showToast({
                variant: 'success',
                title: '🎉 ¡Plato añadido!',
                message: [
                    group ? `«${created.name}» ya está en ${sectionLabel(group)}.` : `«${created.name}» ya está en tu carta.`,
                    listMissing ? '📋 La lista de Listopic no se ha podido guardar todavía (estamos actualizando el servidor).' : '',
                ].filter(Boolean).join(' '),
                durationMs: listMissing ? 7000 : undefined,
            });
        } catch (error) {
            const existing = getBusinessItemExistsDetails(error);
            if (!existing) throw error;
            const known = findItem(existing.itemId)
                || (await fetchAll())?.find((item) => item.id === existing.itemId);
            if (!known) throw error;
            closeNewItem();
            const shownName = itemNameOf(known) || existing.canonicalName;
            reveal(known.id);
            openSheet(known.id);
            showToast({
                variant: 'info',
                message: normalizeItemName(shownName) === normalizeItemName(name)
                    ? 'Ya estaba en tu carta: te lo abro.'
                    : `Ya estaba en tu carta como «${shownName}»: te lo abro.`,
            });
        }
    };

    const saveSheet = async (item: CanonicalPlaceItem, data: ItemBusinessData): Promise<ItemBusinessData> => {
        const current = findItem(item.id) ?? item;
        const { saved, error } = await persist([{ itemId: item.id, data, previous: current.businessData }], { toast: false });
        if (error) throw error;
        return itemBusinessDataFrom(withData(current, saved.get(item.id) ?? data));
    };

    const propose = async (type: ItemProposalType, payload: Record<string, string>, note?: string) => {
        await submitItemProposal(placeId, type, payload, note);
        loadProposals().catch(() => undefined);
    };

    const [historyOpen, setHistoryOpen] = useState(false);
    const [movingItem, setMovingItem] = useState<CanonicalPlaceItem | null>(null);

    // ── Secciones ───────────────────────────────────────────────────────────
    const [sectionEdit, setSectionEdit] = useState<{ name: string; mode: 'rename' | 'emoji' } | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const addSections = (names: string[]) => {
        const fresh: string[] = [];
        names.forEach((name) => {
            if (!sectionNameTaken([...sections, ...fresh], name)) fresh.push(name);
        });
        const next = [...sections, ...fresh].slice(0, MAX_MENU_SECTIONS);
        if (!sameStrings(next, sections)) void menu.commit(next);
    };

    /** Renombra (o cambia el emoji de) una sección y lleva sus platos con ella. */
    const renameSection = async (oldName: string, nextName: string) => {
        if (!menu.ready || oldName === nextName) return;
        const before = sections;
        const affected = itemsRef.current.filter((item) => itemGroupOf(item) === oldName);
        const [sectionsOk, itemsResult] = await Promise.all([
            menu.commit(before.map((name) => (name === oldName ? nextName : name))),
            persist(affected.map((item) => changeFor(item, { group: nextName })), { failTitle: '😕 No se pudieron mover los platos de la sección' }),
        ]);
        if (sectionsOk && itemsResult.error) {
            // Los platos siguen con el nombre de antes: la sección vuelve a llamarse así.
            await menu.commit(before);
        } else if (!sectionsOk && !itemsResult.error && affected.length > 0) {
            const back = affected.flatMap((item) => {
                const current = findItem(item.id);
                return current ? [changeFor(current, { group: oldName })] : [];
            });
            await persist(back, { toast: false });
        }
    };

    const removeSection = async (name: string, target: DeleteSectionTarget) => {
        if (!menu.ready) return;
        const affected = itemsRef.current.filter((item) => itemGroupOf(item) === name);
        const group = target.mode === 'move' ? target.to : '';
        const [sectionsOk, itemsResult] = await Promise.all([
            menu.commit(sections.filter((entry) => entry !== name)),
            persist(affected.map((item) => changeFor(item, { group, menuOrder: null })), { failTitle: '😕 No se pudieron mover los platos' }),
        ]);
        if (!sectionsOk && !itemsResult.error && affected.length > 0) {
            // La sección sigue: sus platos vuelven a ella.
            const back = affected.flatMap((item) => {
                const current = findItem(item.id);
                return current ? [{ itemId: item.id, data: itemBusinessDataFrom(item), previous: current.businessData }] : [];
            });
            await persist(back, { toast: false });
        }
    };

    const requestRemoveSection = (name: string) => {
        const count = items.filter((item) => itemGroupOf(item) === name).length;
        if (count > 0) setDeleting(name);
        else void removeSection(name, { mode: 'unsection' });
    };

    const rowActions: MenuRowActions = {
        openSheet,
        savePrice,
        onPriceError: () => showToast({ variant: 'error', message: '😕 No se pudo guardar el precio' }),
        toggleAvailable,
        openMoveTo: setMovingItem,
        // La pestaña 📣 Promos abre el asistente con este plato (la URL manda).
        impulse: (item) => {
            if (onGoToTab) {
                onGoToTab('sponsored', { sub: 'plato', item: item.id });
                return;
            }
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'sponsored');
                next.set('sub', 'plato');
                next.set('item', item.id);
                return next;
            });
        },
    };

    const reviewsByItem = useMemo(() => {
        const map = new Map<string, ManagerPlaceReview[]>();
        reviews.forEach((review) => {
            const rows = map.get(review.itemId) || [];
            rows.push(review);
            map.set(review.itemId, rows);
        });
        return map;
    }, [reviews]);

    const sheetItem = sheet ? items.find((item) => item.id === sheet.itemId) || null : null;
    const [view, setView] = useState<CartaView>('edit');
    const loaded = itemsState === 'ready';
    const empty = loaded && items.length === 0;

    const jumpToUnsectioned = () => {
        setView('edit');
        const bucket = document.getElementById('carta-sin-seccion');
        bucket?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        bucket?.focus?.({ preventScroll: true });
    };

    const typicalMissing = TYPICAL_SECTIONS.filter((name) => !sectionNameTaken(sections, name));
    const secondaryButton = 'min-h-11 border-[var(--lt-border-strong)] bg-[var(--lt-glass)] hover:bg-[var(--lt-accent-soft)]';

    let board: React.ReactNode;
    if (itemsState === 'error' && items.length === 0) {
        board = <PanelError what="tu carta" onRetry={retryItems} />;
    } else if ((!loaded && items.length === 0) || (loaded && !sectionsKnown)) {
        board = (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando tu carta">
                {[0, 1, 2].map((key) => (
                    <div key={key} className={cn(kit.surface, 'space-y-2 p-4')}>
                        <div className="h-5 w-40 animate-pulse rounded-lg bg-[var(--lt-glass)] motion-reduce:animate-none" />
                        <div className="h-12 animate-pulse rounded-2xl bg-[var(--lt-glass)] motion-reduce:animate-none" />
                        <div className="h-12 animate-pulse rounded-2xl bg-[var(--lt-glass)] motion-reduce:animate-none" />
                    </div>
                ))}
            </div>
        );
    } else if (empty && sections.length === 0) {
        board = (
            <SoftCard className="p-2">
                <EmptyState
                    emoji="🍽️"
                    title="Tu carta está vacía… ¡vamos a llenarla! 🥗🍰"
                    text="Empieza por las secciones típicas o añade directamente tu primer plato."
                    actions={(
                        <>
                            {menu.ready && (
                                <Button variant="secondary" onClick={() => addSections([...TYPICAL_SECTIONS])} className={secondaryButton}>
                                    ✨ Crear secciones típicas
                                </Button>
                            )}
                            <Button onClick={() => openNewItem('')} className="min-h-11">＋ Añadir primer plato</Button>
                        </>
                    )}
                />
            </SoftCard>
        );
    } else {
        board = (
            <div className="space-y-3">
                {menu.ready && sections.length === 0 && typicalMissing.length > 0 && (
                    <div className={cn(kit.inset, 'flex flex-wrap items-center gap-2 px-3 py-2')}>
                        <p className="min-w-0 flex-1 text-sm text-[var(--lt-text)]">Aún no tienes secciones. Agrupa tus platos para que se encuentren mejor.</p>
                        <Button variant="secondary" onClick={() => addSections(typicalMissing)} className={secondaryButton}>
                            ✨ Crear secciones típicas
                        </Button>
                    </div>
                )}
                <MenuBoard
                    items={items}
                    sections={sections}
                    sectionsReady={menu.ready}
                    reviewedNoAllergens={reviewedNoAllergens}
                    flashItemId={flashItemId}
                    ctaItemId={ctaItemId}
                    rowActions={rowActions}
                    onMoveItems={moveItems}
                    onReorderSections={(next) => { void menu.commit(next, { debounce: true }); }}
                    onRenameSection={(name) => setSectionEdit({ name, mode: 'rename' })}
                    onChangeSectionEmoji={(name) => setSectionEdit({ name, mode: 'emoji' })}
                    onRemoveSection={requestRemoveSection}
                    onAddItem={(section) => openNewItem(section)}
                    footer={<NewSectionCard sections={sections} ready={menu.ready} onAdd={addSections} />}
                />
                {items.length > 0 && (
                    <p className="text-xs text-[var(--lt-text-muted)]">
                        ↕️ Arrastra desde el asa para ordenar. Dentro de cada sección, lo que no ordenes va por nota ⭐.
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <SoftCard as="section" aria-label="Tu carta" className="p-4 sm:p-5">
                <CartaHeader
                    placeId={placeId}
                    loaded={loaded && sectionsKnown}
                    items={items}
                    sections={sections}
                    reviewedNoAllergens={reviewedNoAllergens}
                    pendingProposals={pendingProposals}
                    view={view}
                    onViewChange={setView}
                    onAddItem={() => openNewItem()}
                    onOpenHistory={() => setHistoryOpen(true)}
                    onJumpToUnsectioned={jumpToUnsectioned}
                />
            </SoftCard>

            {menu.loadError && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[var(--lt-danger)]/40 px-4 py-3">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--lt-text)]">
                        😕 No se pudieron cargar tus secciones. Hasta que carguen no se pueden cambiar.
                    </p>
                    <Button variant="secondary" onClick={() => { void menu.reload(); }} loading={menu.loading} className={secondaryButton}>
                        Reintentar
                    </Button>
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
                <div className={cn('min-w-0', view === 'public' && 'hidden xl:block')}>{board}</div>
                <aside className={cn('min-w-0 xl:sticky xl:top-4', view === 'edit' && 'hidden xl:block')}>
                    <MenuPublicPreview items={items} sections={sections} />
                </aside>
            </div>

            <ItemSheetModal
                item={sheetItem}
                initialTab={sheet?.tab}
                items={items}
                sections={sections}
                reviews={sheetItem ? reviewsByItem.get(sheetItem.id) || [] : []}
                reviewsState={reviewsState}
                onRetryReviews={retryReviews}
                pendingProposals={pendingProposals}
                reviewedNoAllergens={sheetItem ? reviewedNoAllergens.has(sheetItem.id) : false}
                onReviewedNoAllergensChange={(next) => { if (sheetItem) setReviewed(sheetItem.id, next); }}
                onSave={saveSheet}
                onPropose={propose}
                onClose={() => setSheet(null)}
            />
            <NewItemModal
                open={newItem.open}
                items={items}
                sections={sections}
                sectionsReady={menu.ready}
                defaultSection={newItem.section}
                placeName={effectivePlaceName}
                placeTypes={effectivePlaceTypes}
                suggestedListIds={suggestedListIds}
                onCreate={createItem}
                onOpenExisting={(itemId) => {
                    closeNewItem();
                    reveal(itemId);
                    openSheet(itemId);
                }}
                onClose={closeNewItem}
            />
            <ProposalsHistoryModal open={historyOpen} load={loadProposals} onClose={() => setHistoryOpen(false)} />
            <MoveToModal
                item={movingItem}
                sections={sections}
                onMove={(item, group) => {
                    const current = findItem(item.id) ?? item;
                    void persist([changeFor(current, { group, menuOrder: null })], { failTitle: '😕 No se pudo mover el plato' });
                }}
                onClose={() => setMovingItem(null)}
            />
            <DeleteSectionModal
                section={deleting}
                count={deleting ? items.filter((item) => itemGroupOf(item) === deleting).length : 0}
                sections={sections}
                onConfirm={(target) => { if (deleting) void removeSection(deleting, target); }}
                onClose={() => setDeleting(null)}
            />
            <SectionEditModal
                section={sectionEdit?.name ?? null}
                mode={sectionEdit?.mode ?? 'rename'}
                sections={sections}
                onSubmit={(oldName, nextName) => { void renameSection(oldName, nextName); }}
                onClose={() => setSectionEdit(null)}
            />
        </div>
    );
};
