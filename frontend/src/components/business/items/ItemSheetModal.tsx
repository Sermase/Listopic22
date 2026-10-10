/**
 * Ficha de un plato en un modal (spec §7.5): 📝 Ficha | 💬 Valoraciones | 🛠️ Correcciones.
 *
 *   <ItemSheetModal item={open} initialTab="ficha" items={items} sections={names}
 *     reviews={reviewsOf(open.id)} reviewsState="ready" onRetryReviews={reload}
 *     pendingProposals={3} reviewedNoAllergens={false} onReviewedNoAllergensChange={…}
 *     onSave={saveSheet} onPropose={propose} onClose={close} />
 *
 * El estado del modal (borrador, nota, búsquedas) se reinicia con cada plato.
 * Cerrar con cambios sin guardar pregunta antes (useLeaveGuard o, fuera del
 * provider, el mismo aviso con useConfirm).
 */
import React, { useMemo, useState } from 'react';
import { Button, Modal, Tabs } from '../../ui';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import {
    ALLERGEN_OPTIONS,
    normalizeItemName,
    type ItemBusinessData,
    type ItemProposalType,
    type ManagerPlaceReview,
} from '../../../services/BusinessProService';
import { cn } from '../../../lib/utils';
import {
    businessErrorCopy,
    ChoiceCards,
    EmojiChip,
    EmojiTile,
    EmptyState,
    isDeepEqual,
    kit,
    PanelError,
    StickySaveBar,
    Switch,
    TextAreaField,
    TextField,
    TileGrid,
    useLeaveGuard,
    useReportDirty,
    type ChoiceOption,
} from '../kit';
import { IngredientTagsInput } from './IngredientTagsInput';
import { ItemPicker } from './ItemPicker';
import { ReviewScore, ScoreChip } from './menuParts';
import {
    findItemByName,
    formatReviewDate,
    itemBusinessDataFrom,
    itemNameOf,
    ratingOf,
    reviewCountOf,
    UNSECTIONED,
} from './menuModel';
import type { ItemSheetTab } from './MenuItemRow';
import {
    allergenHints,
    allergenOption,
    formatPriceInput,
    itemCompletion,
    MAX_DESCRIPTION_TEXT,
    MAX_DISCOUNT_TEXT,
    MAX_ITEM_NAME,
    MAX_PENDING_PROPOSALS,
    MAX_PRICE_TEXT,
    PROMO_PRESETS,
    sectionEmoji,
    sectionLabel,
    splitIngredients,
} from './menuVisuals';
import { useListNames } from './useListNames';

const DIRTY_KEY = 'carta:item-sheet';
const MAX_PROPOSAL_NOTE = 500;
/** A partir de aquí se avisa de cuántas propuestas pendientes quedan. */
const PROPOSALS_WARN_AT = 15;

export interface ItemSheetModalProps {
    /** Plato abierto; null = cerrado. */
    item: CanonicalPlaceItem | null;
    initialTab?: ItemSheetTab;
    /** Toda la carta (para buscar duplicados y elegir otro plato). */
    items: CanonicalPlaceItem[];
    sections: string[];
    /** Valoraciones de este plato. */
    reviews: ManagerPlaceReview[];
    reviewsState: 'loading' | 'ready' | 'error';
    onRetryReviews: () => void;
    pendingProposals: number;
    /** «✅ Revisado: sin alérgenos» (solo en este navegador, no se guarda). */
    reviewedNoAllergens: boolean;
    onReviewedNoAllergensChange: (next: boolean) => void;
    /** Guarda la ficha completa y devuelve cómo quedó guardada. Lanza si falla. */
    onSave: (item: CanonicalPlaceItem, data: ItemBusinessData) => Promise<ItemBusinessData>;
    /** Envía una propuesta al equipo. Lanza si falla. */
    onPropose: (type: ItemProposalType, payload: Record<string, string>, note?: string) => Promise<void>;
    onClose: () => void;
}

export const ItemSheetModal: React.FC<ItemSheetModalProps> = (props) => {
    if (!props.item) return null;
    return <ItemSheet key={props.item.id} {...props} item={props.item} />;
};

type Notice = { tone: 'success' | 'error'; text: string } | null;

const NoticeLine: React.FC<{ notice: Notice; className?: string }> = ({ notice, className }) => {
    if (!notice) return null;
    return (
        <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={cn('text-sm font-semibold', notice.tone === 'error' ? 'text-[var(--lt-danger)]' : 'text-[var(--lt-success)]', className)}
        >
            {notice.text}
        </p>
    );
};

const PROPOSAL_SENT = '📨 ¡Enviada! El equipo de Listopic la revisará y te avisamos.';

const ItemSheet: React.FC<ItemSheetModalProps & { item: CanonicalPlaceItem }> = ({
    item,
    initialTab = 'ficha',
    items,
    sections,
    reviews,
    reviewsState,
    onRetryReviews,
    pendingProposals,
    reviewedNoAllergens,
    onReviewedNoAllergensChange,
    onSave,
    onPropose,
    onClose,
}) => {
    const confirm = useConfirm();
    const guard = useLeaveGuard();
    const { showToast } = useToast();
    const name = itemNameOf(item);
    const saved = useMemo(() => itemBusinessDataFrom(item), [item]);
    const [draft, setDraft] = useState<ItemBusinessData>(saved);
    // Si lo guardado cambia por fuera (una recarga) y no habías tocado nada, el
    // borrador lo sigue; si habías cambiado algo, se respeta lo tuyo.
    const [base, setBase] = useState<ItemBusinessData>(saved);
    if (!isDeepEqual(base, saved)) {
        setBase(saved);
        if (isDeepEqual(draft, base)) setDraft(saved);
    }
    const [tab, setTab] = useState<ItemSheetTab>(initialTab);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const dirty = !isDeepEqual(saved, draft);

    const discard = () => {
        setDraft(saved);
        setSaveError(null);
    };
    useReportDirty(DIRTY_KEY, dirty, `la ficha de «${name}»`, discard);

    const requestClose = async () => {
        if (!dirty) {
            onClose();
            return;
        }
        // Con el provider de la gestión, su aviso (y su descarte); si no, el mismo aviso aquí.
        const ok = guard.isDirty(DIRTY_KEY)
            ? await guard.confirmLeave(DIRTY_KEY)
            : await confirm({
                title: '¿Salir sin guardar?',
                message: `Perderás los cambios en la ficha de «${name}».`,
                confirmLabel: 'Salir',
                cancelLabel: 'Seguir editando',
                destructive: true,
            });
        if (ok) onClose();
    };

    const patch = (next: Partial<ItemBusinessData>) => {
        setSaveError(null);
        setDraft((prev) => ({ ...prev, ...next }));
    };

    const save = async () => {
        if (saving || !dirty) return;
        const data: ItemBusinessData = { ...draft, price: formatPriceInput(draft.price) };
        setSaving(true);
        setSaveError(null);
        try {
            const stored = await onSave(item, data);
            setDraft(stored);
            showToast({ variant: 'success', message: `✅ Ficha de «${name}» guardada` });
        } catch (error) {
            setSaveError(businessErrorCopy(error, '😕 No se pudo guardar la ficha. Inténtalo de nuevo.').message);
        } finally {
            setSaving(false);
        }
    };

    const completion = itemCompletion(draft, { sections, reviewedNoAllergens });
    const reviewCount = Math.max(reviewCountOf(item), reviews.length);

    const title = (
        <div className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="text-xl leading-none">{sectionEmoji(draft.group || '')}</span>
                <span className="truncate text-base font-black">{name}</span>
                <ScoreChip rating={ratingOf(item)} count={reviewCountOf(item)} />
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-[var(--lt-text-muted)]">
                {completion.nextMissing
                    ? `Ficha al ${completion.percent} %: ${completion.nextMissing.missing} para llegar al 100 % ✨`
                    : '✨ Ficha completa al 100 %'}
            </span>
        </div>
    );

    return (
        <Modal
            isOpen
            onClose={() => { void requestClose(); }}
            title={title}
            size="lg"
            footer={(
                <StickySaveBar
                    placement="footer"
                    dirty={dirty}
                    saving={saving}
                    error={saveError}
                    onSave={() => { void save(); }}
                    onDiscard={discard}
                    saveLabel="💾 Guardar ficha"
                />
            )}
        >
            <div className="space-y-5">
                <Tabs
                    size="lg"
                    value={tab}
                    onChange={setTab}
                    scrollable
                    ariaLabel={`Ficha de ${name}`}
                    options={[
                        { value: 'ficha', label: '📝 Ficha' },
                        {
                            value: 'reviews',
                            label: '💬 Valoraciones',
                            suffix: <span className="rounded-full bg-[var(--lt-glass)] px-1.5 text-xs tabular-nums">{reviewCount}</span>,
                        },
                        { value: 'fixes', label: '🛠️ Correcciones' },
                    ]}
                />
                <div role="tabpanel" aria-label={tab === 'ficha' ? 'Ficha' : tab === 'reviews' ? 'Valoraciones' : 'Correcciones'}>
                    {tab === 'ficha' && (
                        <FichaTab
                            item={item}
                            draft={draft}
                            savedGroup={saved.group}
                            savedMenuOrder={saved.menuOrder ?? null}
                            sections={sections}
                            disabled={saving}
                            patch={patch}
                            reviewedNoAllergens={reviewedNoAllergens}
                            onReviewedNoAllergensChange={onReviewedNoAllergensChange}
                        />
                    )}
                    {tab === 'reviews' && (
                        <ReviewsTab
                            item={item}
                            items={items}
                            reviews={reviews}
                            reviewsState={reviewsState}
                            onRetry={onRetryReviews}
                            pendingProposals={pendingProposals}
                            onPropose={onPropose}
                        />
                    )}
                    {tab === 'fixes' && (
                        <FixesTab item={item} items={items} pendingProposals={pendingProposals} onPropose={onPropose} />
                    )}
                </div>
            </div>
        </Modal>
    );
};

// ── 📝 Ficha ─────────────────────────────────────────────────────────────────

const FichaTab: React.FC<{
    item: CanonicalPlaceItem;
    draft: ItemBusinessData;
    savedGroup: string;
    savedMenuOrder: number | null;
    sections: string[];
    disabled: boolean;
    patch: (next: Partial<ItemBusinessData>) => void;
    reviewedNoAllergens: boolean;
    onReviewedNoAllergensChange: (next: boolean) => void;
}> = ({ item, draft, savedGroup, savedMenuOrder, sections, disabled, patch, reviewedNoAllergens, onReviewedNoAllergensChange }) => {
    const sectionOptions = useMemo(() => {
        const options: ChoiceOption<string>[] = sections.map((section) => ({
            value: section,
            title: sectionLabel(section),
            emoji: sectionEmoji(section),
        }));
        if (draft.group && !sections.includes(draft.group)) {
            options.push({ value: draft.group, title: `${draft.group} (ya no está en tu carta)`, emoji: '⚠️' });
        }
        options.push({ value: UNSECTIONED, title: 'Sin sección', emoji: '📦' });
        return options;
    }, [sections, draft.group]);

    const ingredients = splitIngredients(draft.ingredients);
    const hints = allergenHints(ingredients, draft.allergens);
    const toggleAllergen = (value: string) => patch({
        allergens: draft.allergens.includes(value)
            ? draft.allergens.filter((entry) => entry !== value)
            : [...draft.allergens, value],
    });

    return (
        <div className="space-y-6">
            <ChoiceCards
                legend="📂 Sección"
                variant="compact"
                options={sectionOptions}
                value={draft.group || UNSECTIONED}
                disabled={disabled}
                onChange={(value) => {
                    const group = value === UNSECTIONED ? '' : value;
                    // En otra sección su sitio no vale: va detrás de los ordenados.
                    patch({ group, menuOrder: group === savedGroup ? savedMenuOrder : null });
                }}
                help={sections.length === 0 ? 'Aún no tienes secciones: créalas en el tablero de la carta.' : undefined}
            />

            <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                    label="💶 Precio"
                    value={draft.price}
                    onChange={(price) => patch({ price })}
                    onBlur={() => {
                        const price = formatPriceInput(draft.price);
                        if (price !== draft.price) patch({ price });
                    }}
                    inputMode="decimal"
                    placeholder="6,50 €"
                    max={MAX_PRICE_TEXT}
                    disabled={disabled}
                    hint="Escribe 6,5 y queda «6,50 €». También vale «12 €/kg»."
                />
                <div className="space-y-1.5">
                    <span className={cn(kit.label, 'block')}>🟢 Disponibilidad</span>
                    <Switch
                        checked={draft.available}
                        onChange={(available) => patch({ available })}
                        label="Se puede pedir"
                        description="Si se acaba, apágalo y saldrá como agotado."
                        onText="🟢 En carta"
                        offText="🚫 Agotado hoy"
                        disabled={disabled}
                    />
                </div>
            </div>

            <fieldset className="min-w-0 space-y-2" disabled={disabled}>
                <legend className={kit.label}>🏷️ Promoción</legend>
                <div className="flex flex-wrap gap-2">
                    {PROMO_PRESETS.map((preset) => {
                        const on = draft.discount === preset.text;
                        return (
                            <EmojiChip
                                key={preset.text}
                                size="sm"
                                emoji={preset.emoji}
                                label={preset.text}
                                selected={on}
                                onToggle={() => patch({ discount: on ? '' : preset.text })}
                            />
                        );
                    })}
                </div>
                <TextField
                    label="Texto de la promoción"
                    labelHidden
                    value={draft.discount}
                    onChange={(discount) => patch({ discount })}
                    placeholder="O escribe la tuya: «2x1 los martes»"
                    max={MAX_DISCOUNT_TEXT}
                    hint="Sale junto al plato en tu carta."
                />
            </fieldset>

            <TextAreaField
                label="📝 Descripción"
                value={draft.description}
                onChange={(description) => patch({ description })}
                max={MAX_DESCRIPTION_TEXT}
                rows={3}
                disabled={disabled}
                placeholder="Cuéntalo como se lo contarías a un cliente: cómo se hace, de dónde viene…"
            />

            <div className="space-y-2">
                <IngredientTagsInput
                    value={draft.ingredients}
                    onChange={(next) => patch({ ingredients: next })}
                    disabled={disabled}
                />
                {hints.length > 0 && (
                    <div className={cn(kit.inset, 'space-y-2 px-3 py-2.5')}>
                        <p className="text-sm text-[var(--lt-text)]">
                            <span aria-hidden="true">💡 </span>Parece que lleva… Márcalo si es así:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {hints.map((value) => {
                                const option = allergenOption(value);
                                if (!option) return null;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => toggleAllergen(value)}
                                        className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', kit.idle, kit.focus)}
                                    >
                                        <span aria-hidden="true">{option.emoji}</span>
                                        {option.label}
                                        <span className="text-[var(--lt-accent)]">· ＋ Marcar</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <TileGrid
                    legend="⚠️ Alérgenos"
                    cols={7}
                    right={`${draft.allergens.length} de ${ALLERGEN_OPTIONS.length} marcados`}
                    disabled={disabled}
                >
                    {ALLERGEN_OPTIONS.map((option) => (
                        <EmojiTile
                            key={option.value}
                            variant="compact"
                            emoji={option.emoji}
                            label={option.label}
                            selected={draft.allergens.includes(option.value)}
                            onToggle={() => toggleAllergen(option.value)}
                        />
                    ))}
                </TileGrid>
                {draft.allergens.length === 0 && (
                    <div className="space-y-1">
                        <EmojiChip
                            size="sm"
                            emoji="✅"
                            label="Revisado: sin alérgenos"
                            selected={reviewedNoAllergens}
                            onToggle={() => onReviewedNoAllergensChange(!reviewedNoAllergens)}
                        />
                        <p className="text-xs text-[var(--lt-text-muted)]">Solo cuenta para tu progreso en este dispositivo; no sale en la carta.</p>
                    </div>
                )}
            </div>

            <LinkedLists listIds={item.linkedListIds} />
        </div>
    );
};

const LinkedLists: React.FC<{ listIds?: string[] }> = ({ listIds }) => {
    const ids = useMemo(() => Array.from(new Set((listIds || []).filter(Boolean))), [listIds]);
    const { lists, loading } = useListNames(ids);
    return (
        <section className="space-y-2" aria-labelledby="carta-linked-lists">
            <div>
                <h3 id="carta-linked-lists" className={kit.label}>📋 Listas de Listopic</h3>
                <p className="text-xs text-[var(--lt-text-muted)]">Donde la comunidad lo valora.</p>
            </div>
            {ids.length === 0 ? (
                <p className="text-sm text-[var(--lt-text-muted)]">Aún no aparece en ninguna lista.</p>
            ) : (
                <ul className="flex flex-wrap gap-2" aria-busy={loading || undefined}>
                    {ids.map((id) => {
                        const list = lists[id];
                        return (
                            <li key={id} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 text-sm font-semibold text-[var(--lt-text)]">
                                <span aria-hidden="true">{list === null ? '🔒' : '📋'}</span>
                                {loading ? 'Cargando…' : list ? list.name : 'Lista privada'}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

// ── 💬 Valoraciones ─────────────────────────────────────────────────────────

const ReviewsTab: React.FC<{
    item: CanonicalPlaceItem;
    items: CanonicalPlaceItem[];
    reviews: ManagerPlaceReview[];
    reviewsState: 'loading' | 'ready' | 'error';
    onRetry: () => void;
    pendingProposals: number;
    onPropose: ItemSheetModalProps['onPropose'];
}> = ({ item, items, reviews, reviewsState, onRetry, pendingProposals, onPropose }) => {
    const [movingPath, setMovingPath] = useState<string | null>(null);
    const [targetId, setTargetId] = useState('');
    const [sending, setSending] = useState(false);
    const [notices, setNotices] = useState<Record<string, Notice>>({});
    const others = useMemo(() => items.filter((entry) => entry.id !== item.id && entry.status !== 'inactive'), [items, item.id]);
    const atLimit = pendingProposals >= MAX_PENDING_PROPOSALS;
    const canonical = normalizeItemName(itemNameOf(item));

    if (reviewsState === 'error') return <PanelError what="las valoraciones" onRetry={onRetry} />;
    if (reviewsState === 'loading' && reviews.length === 0) {
        return (
            <div className="space-y-2" aria-busy="true" aria-label="Cargando valoraciones">
                {[0, 1, 2].map((key) => <div key={key} className={cn(kit.inset, 'h-20 animate-pulse motion-reduce:animate-none')} />)}
            </div>
        );
    }
    if (reviews.length === 0) {
        return <EmptyState size="sm" emoji="💬" title="Aún sin valoraciones." text="¡Comparte el plato para estrenarlo!" />;
    }

    const propose = async (review: ManagerPlaceReview) => {
        if (!targetId || sending) return;
        setSending(true);
        try {
            await onPropose('reassign_review', { reviewPath: review.refPath, targetItemId: targetId });
            setNotices((prev) => ({ ...prev, [review.refPath]: { tone: 'success', text: PROPOSAL_SENT } }));
            setMovingPath(null);
            setTargetId('');
        } catch (error) {
            setNotices((prev) => ({
                ...prev,
                [review.refPath]: { tone: 'error', text: businessErrorCopy(error, '😕 No se pudo enviar la propuesta.').message },
            }));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-3">
            {atLimit && <LimitNotice />}
            <ul className="space-y-2">
                {reviews.map((review) => {
                    const written = (review.originalItemName || review.itemName || '').trim();
                    const showWritten = Boolean(written) && normalizeItemName(written) !== canonical;
                    const moving = movingPath === review.refPath;
                    return (
                        <li key={review.refPath} className={cn(kit.inset, 'space-y-2 px-3 py-3')}>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <ReviewScore score={review.overallRating} />
                                <span className="min-w-0 truncate text-sm font-bold text-[var(--lt-text)]">{review.authorName}</span>
                                {review.createdAtMs > 0 && (
                                    <span className="text-xs text-[var(--lt-text-muted)]">{formatReviewDate(review.createdAtMs)}</span>
                                )}
                            </div>
                            {showWritten && (
                                <p className="text-xs text-[var(--lt-text-muted)]">
                                    <span aria-hidden="true">✍️ </span>Escrito como «{written}»
                                </p>
                            )}
                            {review.comment && <p className="line-clamp-3 text-sm text-[var(--lt-text)]">{review.comment}</p>}
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    aria-expanded={moving}
                                    disabled={atLimit || others.length === 0}
                                    onClick={() => {
                                        setMovingPath(moving ? null : review.refPath);
                                        setTargetId('');
                                    }}
                                    className={cn('min-h-11 rounded-lg px-1 text-sm font-semibold text-[var(--lt-accent)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50', kit.focus)}
                                >
                                    ↔️ Mover a otro plato
                                </button>
                                <NoticeLine notice={notices[review.refPath] ?? null} />
                            </div>
                            {moving && (
                                <div className="space-y-3 border-t border-[var(--lt-border)] pt-3">
                                    <ItemPicker legend="¿De qué plato es esta valoración?" items={others} value={targetId} onChange={setTargetId} disabled={sending} />
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            onClick={() => { void propose(review); }}
                                            disabled={!targetId}
                                            loading={sending}
                                            className="min-h-11"
                                        >
                                            Proponer
                                        </Button>
                                        <Button variant="ghost" onClick={() => setMovingPath(null)} disabled={sending} className="min-h-11">
                                            Cancelar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

const LimitNotice: React.FC = () => (
    <p role="status" className="rounded-xl bg-[var(--lt-warning-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-warning)]">
        ⏳ Tienes {MAX_PENDING_PROPOSALS} propuestas pendientes, el máximo. Espera a que el equipo revise alguna.
    </p>
);

// ── 🛠️ Correcciones ─────────────────────────────────────────────────────────

const FixesTab: React.FC<{
    item: CanonicalPlaceItem;
    items: CanonicalPlaceItem[];
    pendingProposals: number;
    onPropose: ItemSheetModalProps['onPropose'];
}> = ({ item, items, pendingProposals, onPropose }) => {
    const name = itemNameOf(item);
    const others = useMemo(() => items.filter((entry) => entry.id !== item.id && entry.status !== 'inactive'), [items, item.id]);
    const [note, setNote] = useState('');
    const [mergeTarget, setMergeTarget] = useState('');
    const [newName, setNewName] = useState('');
    const [sending, setSending] = useState<'merge' | 'rename' | null>(null);
    const [mergeNotice, setMergeNotice] = useState<Notice>(null);
    const [renameNotice, setRenameNotice] = useState<Notice>(null);
    const atLimit = pendingProposals >= MAX_PENDING_PROPOSALS;

    const target = others.find((entry) => entry.id === mergeTarget) || null;
    const trimmedName = newName.trim();
    const sameName = Boolean(trimmedName) && trimmedName === name.trim();
    const taken = trimmedName && !sameName ? findItemByName(items, trimmedName, item.id) : null;
    const renameProblem = sameName
        ? 'Es el mismo nombre que ya tiene.'
        : taken ? `👀 Ya hay un plato que se llama «${itemNameOf(taken)}». Si es el mismo, propón una fusión.` : null;

    const send = async (kind: 'merge' | 'rename') => {
        if (sending || atLimit) return;
        const setNotice = kind === 'merge' ? setMergeNotice : setRenameNotice;
        setSending(kind);
        setMergeNotice(null);
        setRenameNotice(null);
        try {
            if (kind === 'merge') {
                await onPropose('merge', { sourceItemId: item.id, targetItemId: mergeTarget }, note.trim() || undefined);
                setMergeTarget('');
            } else {
                await onPropose('rename', { itemId: item.id, newName: trimmedName }, note.trim() || undefined);
                setNewName('');
            }
            setNote('');
            setNotice({ tone: 'success', text: PROPOSAL_SENT });
        } catch (error) {
            setNotice({ tone: 'error', text: businessErrorCopy(error, '😕 No se pudo enviar la propuesta.').message });
        } finally {
            setSending(null);
        }
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-[var(--lt-text-muted)]">
                Las valoraciones nunca se pierden. Lo revisa el equipo de Listopic y te avisamos.
            </p>
            {atLimit ? <LimitNotice /> : pendingProposals >= PROPOSALS_WARN_AT && (
                <p className="text-sm font-semibold text-[var(--lt-warning)]">
                    ⏳ Tienes {pendingProposals}/{MAX_PENDING_PROPOSALS} propuestas pendientes.
                </p>
            )}

            <TextAreaField
                label="💬 Nota para el equipo (opcional)"
                value={note}
                onChange={setNote}
                max={MAX_PROPOSAL_NOTE}
                rows={2}
                placeholder="Ej.: es el mismo plato, escrito con una errata."
                disabled={Boolean(sending)}
            />

            <section className={cn(kit.inset, 'space-y-3 p-3 sm:p-4')} aria-labelledby="carta-fix-merge">
                <div>
                    <h3 id="carta-fix-merge" className="text-sm font-black text-[var(--lt-text)]">🔗 Es un duplicado</h3>
                    <p className="text-xs text-[var(--lt-text-muted)]">¿Es el mismo plato que otro escrito distinto? Elige con cuál se junta.</p>
                </div>
                {others.length === 0 ? (
                    <p className="text-sm text-[var(--lt-text-muted)]">No hay otros platos en tu carta.</p>
                ) : (
                    <ItemPicker legend="Se junta con…" items={others} value={mergeTarget} onChange={setMergeTarget} disabled={Boolean(sending) || atLimit} />
                )}
                {target && (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--lt-text)]" aria-live="polite">
                        <span className="rounded-full border border-[var(--lt-border)] px-2.5 py-1 font-semibold">«{name}»</span>
                        <span aria-hidden="true">➜</span>
                        <span className="sr-only">se junta con</span>
                        <span className="rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-2.5 py-1 font-semibold">«{itemNameOf(target)}»</span>
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        onClick={() => { void send('merge'); }}
                        disabled={!mergeTarget || atLimit || sending === 'rename'}
                        loading={sending === 'merge'}
                        className="min-h-11"
                    >
                        Proponer fusión
                    </Button>
                    <NoticeLine notice={mergeNotice} />
                </div>
            </section>

            <section className={cn(kit.inset, 'space-y-3 p-3 sm:p-4')} aria-labelledby="carta-fix-rename">
                <div>
                    <h3 id="carta-fix-rename" className="text-sm font-black text-[var(--lt-text)]">✏️ Cambiar nombre</h3>
                    <p className="text-xs text-[var(--lt-text-muted)]">Para erratas o un nombre mejor. El nombre de antes se sigue reconociendo.</p>
                </div>
                <TextField
                    label="Nombre nuevo"
                    value={newName}
                    onChange={setNewName}
                    max={MAX_ITEM_NAME}
                    placeholder={name}
                    error={renameProblem ?? undefined}
                    disabled={Boolean(sending) || atLimit}
                />
                {trimmedName && !renameProblem && (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--lt-text)]" aria-live="polite">
                        <span className="text-[var(--lt-text-muted)] line-through">«{name}»</span>
                        <span aria-hidden="true">→</span>
                        <span className="sr-only">pasa a llamarse</span>
                        <span className="font-semibold">«{trimmedName}»</span>
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        onClick={() => { void send('rename'); }}
                        disabled={!trimmedName || Boolean(renameProblem) || atLimit || sending === 'merge'}
                        loading={sending === 'rename'}
                        className="min-h-11"
                    >
                        Proponer nombre nuevo
                    </Button>
                    <NoticeLine notice={renameNotice} />
                </div>
            </section>
        </div>
    );
};
