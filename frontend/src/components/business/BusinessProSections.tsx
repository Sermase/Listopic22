import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowRightLeft,
    BarChart3,
    Check,
    Image as ImageIcon,
    Loader2,
    Megaphone,
    MessageSquare,
    Pencil,
    Plus,
    Save,
    Sparkles,
    Tags,
    Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCanonicalPlaceItems, type CanonicalPlaceItem } from '../../services/CanonicalItemService';
import {
    createBusinessItem,
    deleteBusinessOffer,
    describeProposal,
    EMPTY_ITEM_BUSINESS_DATA,
    EMPTY_OFFER_DATA,
    EMPTY_VISUAL_DATA,
    getBusinessOffers,
    getBusinessVisual,
    getMyItemProposals,
    getPlaceReviewsForManager,
    getPlaceSponsoredPlacements,
    requestSponsoredPlacement,
    saveBusinessOffer,
    submitItemProposal,
    updateBusinessVisual,
    updateCanonicalItemBusinessData,
    type BusinessOffer,
    type BusinessOfferData,
    type BusinessVisualData,
    type BusinessVisualStyle,
    type ItemBusinessData,
    type ItemProposal,
    type ManagerPlaceReview,
    type SponsoredPlacement,
} from '../../services/BusinessProService';

type Message = { type: 'success' | 'error'; text: string } | null;

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--lt-text)] outline-none transition-colors placeholder:text-[var(--lt-text-muted)] focus:border-[var(--lt-accent-border)]';

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return fallback;
};

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-xs text-[var(--lt-text-muted)]">{hint}</span>}
    </label>
);

const SectionMessage: React.FC<{ message: Message }> = ({ message }) => {
    if (!message) return null;
    return (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/25 bg-red-500/10 text-red-200'
        }`}>
            {message.text}
        </div>
    );
};

const SaveButton: React.FC<{ saving: boolean; onClick: () => void; label?: string }> = ({ saving, onClick, label = 'Guardar' }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--lt-accent)] px-4 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-60"
    >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {label}
    </button>
);

const ProSectionShell: React.FC<{
    title: string;
    text: string;
    icon: React.ElementType;
    children: React.ReactNode;
}> = ({ title, text, icon: Icon, children }) => (
    <section className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5">
        <div className="mb-5 flex items-start gap-3 border-b border-white/10 pb-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-[var(--lt-text)]">{title}</h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                        <Sparkles className="h-3 w-3" />
                        Pro
                    </span>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--lt-text-muted)]">{text}</p>
            </div>
        </div>
        {children}
    </section>
);

const PROPOSAL_STATUS_META: Record<ItemProposal['status'], { label: string; className: string }> = {
    pending: { label: 'Pendiente', className: 'border-amber-500/25 bg-amber-500/10 text-amber-200' },
    approved: { label: 'Aprobada', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' },
    rejected: { label: 'Rechazada', className: 'border-red-500/25 bg-red-500/10 text-red-200' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Imagen y página del negocio
// ─────────────────────────────────────────────────────────────────────────────

const VISUAL_STYLE_OPTIONS: Array<{ value: BusinessVisualStyle; label: string }> = [
    { value: 'editorial', label: 'Editorial' },
    { value: 'clean', label: 'Limpio' },
    { value: 'warm', label: 'Cálido' },
    { value: 'night', label: 'Noche' },
];

export const BusinessVisualSection: React.FC<{ placeId: string; placeName?: string }> = ({ placeId, placeName }) => {
    const [form, setForm] = useState<BusinessVisualData>(EMPTY_VISUAL_DATA);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<Message>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await getBusinessVisual(placeId);
                if (!cancelled) setForm(data);
            } catch (error) {
                console.error('BusinessVisualSection: load failed', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    const save = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await updateBusinessVisual(placeId, form);
            setMessage({ type: 'success', text: 'Personalización visual guardada.' });
        } catch (error) {
            console.error('BusinessVisualSection: save failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo guardar la personalización.') });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] px-4 py-10 text-center text-sm text-[var(--lt-text-muted)]">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                Cargando personalización...
            </div>
        );
    }

    return (
        <ProSectionShell
            title="Imagen y página del negocio"
            text="Personalización visual del perfil público: portada, color de acento, estilo y texto destacado."
            icon={ImageIcon}
        >
            <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
                <div className="space-y-4">
                    <Field label="Imagen de portada (URL)" hint="Enlace a una imagen. La subida de archivos llegará más adelante.">
                        <input
                            className={inputClass}
                            value={form.heroImageUrl}
                            onChange={(event) => setForm({ ...form, heroImageUrl: event.target.value })}
                            placeholder="https://..."
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Color de acento" hint="Formato #rrggbb">
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : '#6d5dfc'}
                                    onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
                                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/5"
                                />
                                <input
                                    className={inputClass}
                                    value={form.accentColor}
                                    onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
                                    placeholder="#6d5dfc"
                                />
                            </div>
                        </Field>
                        <Field label="Estilo visual">
                            <select
                                className={inputClass}
                                value={form.visualStyle}
                                onChange={(event) => setForm({ ...form, visualStyle: event.target.value as BusinessVisualStyle })}
                            >
                                {VISUAL_STYLE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <Field label="Texto destacado de portada">
                        <textarea
                            className={`${inputClass} min-h-24`}
                            value={form.heroText}
                            onChange={(event) => setForm({ ...form, heroText: event.target.value })}
                            placeholder="Ej. Cocina honesta, producto local y brunch de fin de semana."
                        />
                    </Field>
                    <SectionMessage message={message} />
                    <SaveButton saving={saving} onClick={save} />
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--lt-bg-deep)]">
                    {form.heroImageUrl ? (
                        <img src={form.heroImageUrl} alt="" className="h-40 w-full object-cover" />
                    ) : (
                        <div className="h-40 bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-500" />
                    )}
                    <div className="p-4" style={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? { borderTop: `3px solid ${form.accentColor}` } : undefined}>
                        <p className="text-xs font-black uppercase tracking-[0.18em]" style={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? { color: form.accentColor } : { color: 'var(--lt-accent)' }}>
                            Preview
                        </p>
                        <h3 className="mt-2 text-2xl font-black text-[var(--lt-text)]">{placeName || 'Tu negocio'}</h3>
                        <p className="mt-2 text-sm text-[var(--lt-text-muted)]">
                            {form.heroText || 'Así se verá la cabecera pública del negocio con tu personalización.'}
                        </p>
                    </div>
                </div>
            </div>
        </ProSectionShell>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Elementos, carta y propuestas
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_GROUP_SUGGESTIONS = ['Entrantes', 'Principales', 'Postres', 'Bebidas', 'Menú del día', 'Especiales'];

const itemBusinessDataFrom = (item: CanonicalPlaceItem | null): ItemBusinessData => {
    const raw = (item?.businessData || {}) as Record<string, unknown>;
    return {
        group: typeof raw.group === 'string' ? raw.group : '',
        price: typeof raw.price === 'string' ? raw.price : '',
        discount: typeof raw.discount === 'string' ? raw.discount : '',
        ingredients: typeof raw.ingredients === 'string' ? raw.ingredients : '',
        description: typeof raw.description === 'string' ? raw.description : '',
        available: raw.available !== false,
    };
};

const formatReviewDate = (ms: number): string => {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const BusinessItemsSection: React.FC<{ placeId: string }> = ({ placeId }) => {
    const { user } = useAuth();
    const [items, setItems] = useState<CanonicalPlaceItem[]>([]);
    const [reviews, setReviews] = useState<ManagerPlaceReview[]>([]);
    const [proposals, setProposals] = useState<ItemProposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<ItemBusinessData>(EMPTY_ITEM_BUSINESS_DATA);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<Message>(null);

    const [newItemName, setNewItemName] = useState('');
    const [creatingItem, setCreatingItem] = useState(false);

    const [mergeTargetId, setMergeTargetId] = useState('');
    const [renameValue, setRenameValue] = useState('');
    const [proposalNote, setProposalNote] = useState('');
    const [submittingProposal, setSubmittingProposal] = useState<string | null>(null);
    const [movingReviewPath, setMovingReviewPath] = useState<string | null>(null);
    const [moveTargetId, setMoveTargetId] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const [itemRows, reviewRows, proposalRows] = await Promise.all([
                getCanonicalPlaceItems(placeId),
                getPlaceReviewsForManager(placeId).catch((error) => {
                    console.error('BusinessItemsSection: reviews load failed', error);
                    return [] as ManagerPlaceReview[];
                }),
                user ? getMyItemProposals(placeId, user.uid).catch(() => [] as ItemProposal[]) : Promise.resolve([] as ItemProposal[]),
            ]);
            setItems(itemRows);
            setReviews(reviewRows);
            setProposals(proposalRows);
        } catch (error) {
            console.error('BusinessItemsSection: load failed', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placeId, user?.uid]);

    const reviewsByItem = useMemo(() => {
        const map = new Map<string, ManagerPlaceReview[]>();
        reviews.forEach((review) => {
            const rows = map.get(review.itemId) || [];
            rows.push(review);
            map.set(review.itemId, rows);
        });
        return map;
    }, [reviews]);

    const selectedItem = items.find((item) => item.id === selectedId) || null;
    const selectedReviews = selectedId ? (reviewsByItem.get(selectedId) || []) : [];
    const otherItems = items.filter((item) => item.id !== selectedId);

    const selectItem = (item: CanonicalPlaceItem) => {
        setSelectedId(item.id);
        setForm(itemBusinessDataFrom(item));
        setMergeTargetId('');
        setRenameValue('');
        setMovingReviewPath(null);
        setMessage(null);
    };

    const save = async () => {
        if (!selectedId) return;
        setSaving(true);
        setMessage(null);
        try {
            await updateCanonicalItemBusinessData(placeId, selectedId, form);
            setItems((prev) => prev.map((item) => item.id === selectedId
                ? { ...item, businessData: { ...(item.businessData || {}), ...form } }
                : item));
            setMessage({ type: 'success', text: 'Ficha oficial guardada.' });
        } catch (error) {
            console.error('BusinessItemsSection: save failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo guardar la ficha del elemento.') });
        } finally {
            setSaving(false);
        }
    };

    const addItem = async () => {
        const name = newItemName.trim();
        if (!name) return;
        setCreatingItem(true);
        setMessage(null);
        try {
            await createBusinessItem(placeId, name);
            setNewItemName('');
            setMessage({ type: 'success', text: `Elemento "${name}" añadido a la carta.` });
            await load();
        } catch (error) {
            console.error('BusinessItemsSection: create item failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo crear el elemento.') });
        } finally {
            setCreatingItem(false);
        }
    };

    const sendProposal = async (
        key: string,
        type: 'merge' | 'rename' | 'reassign_review',
        payload: Record<string, string>,
    ) => {
        setSubmittingProposal(key);
        setMessage(null);
        try {
            await submitItemProposal(placeId, type, payload, proposalNote.trim() || undefined);
            setMessage({ type: 'success', text: 'Propuesta enviada. Un administrador la revisará y te llegará una notificación.' });
            setMergeTargetId('');
            setRenameValue('');
            setProposalNote('');
            setMovingReviewPath(null);
            setMoveTargetId('');
            if (user) setProposals(await getMyItemProposals(placeId, user.uid).catch(() => proposals));
        } catch (error) {
            console.error('BusinessItemsSection: proposal failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo enviar la propuesta.') });
        } finally {
            setSubmittingProposal(null);
        }
    };

    return (
        <ProSectionShell
            title="Elementos, carta y grupos"
            text="La base son los elementos valorados por la comunidad. Enriquécelos con la ficha oficial, añade platos nuevos y propone correcciones (fusiones de duplicados por erratas, renombres o mover reseñas mal asignadas): los cambios sensibles pasan por revisión admin."
            icon={Tags}
        >
            <div className="grid gap-5 lg:grid-cols-[1fr,1.2fr]">
                {/* Columna izquierda: lista de elementos + crear */}
                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3">
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Añadir elemento a la carta</h3>
                            <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Para platos que aún no tienen reseñas. Se crea al momento.</p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                className={inputClass}
                                value={newItemName}
                                onChange={(event) => setNewItemName(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') void addItem(); }}
                                placeholder="Nombre del plato o producto"
                            />
                            <button
                                type="button"
                                onClick={addItem}
                                disabled={creatingItem || !newItemName.trim()}
                                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[var(--lt-accent)] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                            >
                                {creatingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Añadir
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-4">
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Elementos del lugar</h3>
                            <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Toca un elemento para ver sus reseñas y editar su ficha.</p>
                        </div>

                        {loading ? (
                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                                Cargando elementos...
                            </div>
                        ) : items.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                                Todavía no hay elementos. Añade el primero arriba o espera a que lleguen reseñas.
                            </div>
                        ) : (
                            <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                                {items.map((item) => {
                                    const hasOfficialData = Boolean((item.businessData as Record<string, unknown> | undefined)?.price
                                        || (item.businessData as Record<string, unknown> | undefined)?.group);
                                    const reviewRows = reviewsByItem.get(item.id) || [];
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => selectItem(item)}
                                            className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                                                selectedId === item.id
                                                    ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]'
                                                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h4 className="truncate text-sm font-black text-[var(--lt-text)]">{item.canonicalName || item.id}</h4>
                                                    <p className="mt-1 text-xs text-[var(--lt-text-muted)]">
                                                        {reviewRows.length || item.stats?.reviewCount || 0} reseñas
                                                        {typeof item.stats?.averageRating === 'number' ? ` · ${item.stats.averageRating.toFixed(2)}` : ''}
                                                        {item.source === 'business' ? ' · añadido por el negocio' : ''}
                                                    </p>
                                                </div>
                                                {hasOfficialData && (
                                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-200">
                                                        <Check className="h-3 w-3" />
                                                        Ficha
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {proposals.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Mis propuestas</h3>
                            <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                                {proposals.map((proposal) => {
                                    const meta = PROPOSAL_STATUS_META[proposal.status];
                                    return (
                                        <div key={proposal.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-xs leading-relaxed text-[var(--lt-text)]">{describeProposal(proposal)}</p>
                                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${meta.className}`}>
                                                    {meta.label}
                                                </span>
                                            </div>
                                            {proposal.adminNotes && (
                                                <p className="mt-1 text-[11px] text-[var(--lt-text-muted)]">Admin: {proposal.adminNotes}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Columna derecha: ficha + reseñas + propuestas del elemento */}
                <div className="space-y-4">
                    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div>
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Ficha oficial del elemento</h3>
                            <p className="text-xs text-[var(--lt-text-muted)]">
                                {selectedItem
                                    ? `Editando: ${selectedItem.canonicalName || selectedItem.id}`
                                    : 'Selecciona un elemento de la lista.'}
                            </p>
                        </div>
                        {selectedItem ? (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Grupo de carta">
                                        <input
                                            className={inputClass}
                                            list="business-item-groups"
                                            value={form.group}
                                            onChange={(event) => setForm({ ...form, group: event.target.value })}
                                            placeholder="Postres, Entrantes..."
                                        />
                                        <datalist id="business-item-groups">
                                            {ITEM_GROUP_SUGGESTIONS.map((group) => <option key={group} value={group} />)}
                                        </datalist>
                                    </Field>
                                    <Field label="Precio">
                                        <input
                                            className={inputClass}
                                            value={form.price}
                                            onChange={(event) => setForm({ ...form, price: event.target.value })}
                                            placeholder="6,50 €"
                                        />
                                    </Field>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Descuento / promoción">
                                        <input
                                            className={inputClass}
                                            value={form.discount}
                                            onChange={(event) => setForm({ ...form, discount: event.target.value })}
                                            placeholder="2x1, -20%..."
                                        />
                                    </Field>
                                    <Field label="Ingredientes">
                                        <input
                                            className={inputClass}
                                            value={form.ingredients}
                                            onChange={(event) => setForm({ ...form, ingredients: event.target.value })}
                                            placeholder="Queso crema, galleta..."
                                        />
                                    </Field>
                                </div>
                                <Field label="Descripción">
                                    <textarea
                                        className={`${inputClass} min-h-20`}
                                        value={form.description}
                                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                                        placeholder="Descripción corta para la ficha del elemento."
                                    />
                                </Field>
                                <label className="flex items-center gap-2 text-sm text-[var(--lt-text)]">
                                    <input
                                        type="checkbox"
                                        checked={form.available}
                                        onChange={(event) => setForm({ ...form, available: event.target.checked })}
                                        className="h-4 w-4 rounded border-white/20 bg-white/5"
                                    />
                                    Disponible actualmente en carta
                                </label>
                                <SectionMessage message={message} />
                                <SaveButton saving={saving} onClick={save} label="Guardar ficha" />
                            </>
                        ) : (
                            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-10 text-center text-sm text-[var(--lt-text-muted)]">
                                <Tags className="mx-auto mb-2 h-6 w-6 text-[var(--lt-accent)]" />
                                Ningún elemento seleccionado.
                            </div>
                        )}
                    </div>

                    {selectedItem && (
                        <>
                            {/* Reseñas del elemento */}
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <div className="mb-3 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-[var(--lt-accent)]" />
                                    <h3 className="text-sm font-black text-[var(--lt-text)]">Reseñas de este elemento ({selectedReviews.length})</h3>
                                </div>
                                {selectedReviews.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-center text-xs text-[var(--lt-text-muted)]">
                                        Este elemento aún no tiene reseñas asignadas.
                                    </p>
                                ) : (
                                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                                        {selectedReviews.map((review) => (
                                            <div key={review.refPath} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-xs font-bold text-[var(--lt-text)]">
                                                            "{review.itemName}" · {review.authorName}
                                                        </p>
                                                        <p className="text-[11px] text-[var(--lt-text-muted)]">
                                                            {review.overallRating !== null ? `Nota ${review.overallRating.toFixed(1)}` : 'Sin nota'}
                                                            {review.createdAtMs ? ` · ${formatReviewDate(review.createdAtMs)}` : ''}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setMovingReviewPath(movingReviewPath === review.refPath ? null : review.refPath);
                                                            setMoveTargetId('');
                                                        }}
                                                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-black uppercase text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                                                    >
                                                        <ArrowRightLeft className="h-3 w-3" />
                                                        Mover
                                                    </button>
                                                </div>
                                                {review.comment && (
                                                    <p className="mt-1 text-[11px] leading-snug text-[var(--lt-text-muted)] line-clamp-2">{review.comment}</p>
                                                )}
                                                {movingReviewPath === review.refPath && (
                                                    <div className="mt-2 flex gap-2">
                                                        <select
                                                            className={inputClass}
                                                            value={moveTargetId}
                                                            onChange={(event) => setMoveTargetId(event.target.value)}
                                                        >
                                                            <option value="">Elemento correcto...</option>
                                                            {otherItems.map((item) => (
                                                                <option key={item.id} value={item.id}>{item.canonicalName || item.id}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            disabled={!moveTargetId || submittingProposal === review.refPath}
                                                            onClick={() => sendProposal(review.refPath, 'reassign_review', {
                                                                reviewPath: review.refPath,
                                                                targetItemId: moveTargetId,
                                                            })}
                                                            className="shrink-0 rounded-xl bg-[var(--lt-accent)] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                                                        >
                                                            {submittingProposal === review.refPath ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Proponer'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Correcciones del elemento */}
                            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <h3 className="text-sm font-black text-[var(--lt-text)]">Proponer corrección</h3>
                                <p className="text-xs text-[var(--lt-text-muted)]">
                                    Para duplicados por erratas (ej. "reggina rosa" y "regina rossa") o nombres mal escritos.
                                    Las propuestas las revisa un administrador; las reseñas y sus nombres originales nunca se pierden.
                                </p>
                                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                                    <select
                                        className={inputClass}
                                        value={mergeTargetId}
                                        onChange={(event) => setMergeTargetId(event.target.value)}
                                    >
                                        <option value="">Fusionar este elemento con...</option>
                                        {otherItems.map((item) => (
                                            <option key={item.id} value={item.id}>{item.canonicalName || item.id}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={!mergeTargetId || submittingProposal === 'merge'}
                                        onClick={() => sendProposal('merge', 'merge', {
                                            sourceItemId: selectedItem.id,
                                            targetItemId: mergeTargetId,
                                        })}
                                        className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-200 disabled:opacity-50"
                                    >
                                        {submittingProposal === 'merge' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Proponer fusión'}
                                    </button>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                                    <input
                                        className={inputClass}
                                        value={renameValue}
                                        onChange={(event) => setRenameValue(event.target.value)}
                                        placeholder={`Nuevo nombre para "${selectedItem.canonicalName || selectedItem.id}"`}
                                    />
                                    <button
                                        type="button"
                                        disabled={!renameValue.trim() || submittingProposal === 'rename'}
                                        onClick={() => sendProposal('rename', 'rename', {
                                            itemId: selectedItem.id,
                                            newName: renameValue.trim(),
                                        })}
                                        className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-200 disabled:opacity-50"
                                    >
                                        {submittingProposal === 'rename' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Proponer renombre'}
                                    </button>
                                </div>
                                <Field label="Nota para el administrador (opcional)">
                                    <input
                                        className={inputClass}
                                        value={proposalNote}
                                        onChange={(event) => setProposalNote(event.target.value)}
                                        placeholder="Ej. Es el mismo plato, escrito con errata."
                                    />
                                </Field>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </ProSectionShell>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Contenido patrocinado: ofertas + campañas
// ─────────────────────────────────────────────────────────────────────────────

const formatOfferDates = (offer: { startsAt?: string; endsAt?: string }): string | null => {
    if (offer.startsAt && offer.endsAt) return `${offer.startsAt} → ${offer.endsAt}`;
    if (offer.endsAt) return `hasta ${offer.endsAt}`;
    if (offer.startsAt) return `desde ${offer.startsAt}`;
    return null;
};

const PLACEMENT_STATUS_META: Record<SponsoredPlacement['status'], { label: string; className: string }> = {
    requested: { label: 'Solicitado', className: 'border-amber-500/25 bg-amber-500/10 text-amber-200' },
    active: { label: 'Activo', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' },
    rejected: { label: 'Rechazado', className: 'border-red-500/25 bg-red-500/10 text-red-200' },
    ended: { label: 'Finalizado', className: 'border-white/15 bg-white/5 text-gray-400' },
};

const PLACEMENT_TYPE_LABELS: Record<SponsoredPlacement['type'], string> = {
    home: 'Destacado en la home',
    search: 'Destacado en búsquedas',
};

export const BusinessSponsoredSection: React.FC<{ placeId: string }> = ({ placeId }) => {
    const [offers, setOffers] = useState<BusinessOffer[]>([]);
    const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<BusinessOfferData>(EMPTY_OFFER_DATA);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [message, setMessage] = useState<Message>(null);

    const [placementType, setPlacementType] = useState<'home' | 'search'>('home');
    const [placementHeadline, setPlacementHeadline] = useState('');
    const [placementStartsAt, setPlacementStartsAt] = useState('');
    const [placementEndsAt, setPlacementEndsAt] = useState('');
    const [requestingPlacement, setRequestingPlacement] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [offerRows, placementRows] = await Promise.all([
                    getBusinessOffers(placeId),
                    getPlaceSponsoredPlacements(placeId).catch(() => [] as SponsoredPlacement[]),
                ]);
                if (!cancelled) {
                    setOffers(offerRows);
                    setPlacements(placementRows);
                }
            } catch (error) {
                console.error('BusinessSponsoredSection: load failed', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    const resetForm = () => {
        setForm(EMPTY_OFFER_DATA);
        setEditingId(null);
    };

    const editOffer = (offer: BusinessOffer) => {
        setEditingId(offer.id);
        setForm({
            title: offer.title,
            description: offer.description,
            conditions: offer.conditions,
            ctaUrl: offer.ctaUrl,
            startsAt: offer.startsAt,
            endsAt: offer.endsAt,
            status: offer.status,
        });
        setMessage(null);
    };

    const save = async () => {
        if (!form.title.trim()) {
            setMessage({ type: 'error', text: 'La oferta necesita un título.' });
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            const offerId = await saveBusinessOffer(placeId, form, editingId || undefined);
            setOffers((prev) => {
                const next: BusinessOffer = { id: offerId, ...form };
                const exists = prev.some((offer) => offer.id === offerId);
                return exists
                    ? prev.map((offer) => offer.id === offerId ? next : offer)
                    : [...prev, next];
            });
            setMessage({ type: 'success', text: editingId ? 'Oferta actualizada.' : 'Oferta creada.' });
            resetForm();
        } catch (error) {
            console.error('BusinessSponsoredSection: save failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo guardar la oferta.') });
        } finally {
            setSaving(false);
        }
    };

    const removeOffer = async (offer: BusinessOffer) => {
        if (!window.confirm(`¿Eliminar la oferta "${offer.title}"?`)) return;
        setDeletingId(offer.id);
        setMessage(null);
        try {
            await deleteBusinessOffer(placeId, offer.id);
            setOffers((prev) => prev.filter((row) => row.id !== offer.id));
            if (editingId === offer.id) resetForm();
        } catch (error) {
            console.error('BusinessSponsoredSection: delete failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo eliminar la oferta.') });
        } finally {
            setDeletingId(null);
        }
    };

    const requestPlacement = async () => {
        setRequestingPlacement(true);
        setMessage(null);
        try {
            await requestSponsoredPlacement({
                placeId,
                type: placementType,
                headline: placementHeadline.trim() || undefined,
                startsAt: placementStartsAt || undefined,
                endsAt: placementEndsAt || undefined,
            });
            setPlacementHeadline('');
            setPlacementStartsAt('');
            setPlacementEndsAt('');
            setPlacements(await getPlaceSponsoredPlacements(placeId).catch(() => placements));
            setMessage({ type: 'success', text: 'Solicitud enviada. Un administrador la activará y te llegará una notificación.' });
        } catch (error) {
            console.error('BusinessSponsoredSection: placement request failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo enviar la solicitud.') });
        } finally {
            setRequestingPlacement(false);
        }
    };

    return (
        <ProSectionShell
            title="Contenido patrocinado"
            text="Ofertas del local y campañas de visibilidad (home y búsquedas), siempre marcadas como patrocinadas y separadas de valoraciones y rankings orgánicos."
            icon={Megaphone}
        >
            <div className="grid gap-5 lg:grid-cols-[1fr,1.1fr]">
                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-4">
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Ofertas del local</h3>
                            <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Se muestran en tu página de lugar con etiqueta Patrocinado. Los borradores no se publican.</p>
                        </div>
                        {loading ? (
                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                                Cargando...
                            </div>
                        ) : offers.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                                Aún no hay ofertas. Crea la primera con el formulario.
                            </div>
                        ) : (
                            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                                {offers.map((offer) => {
                                    const dates = formatOfferDates(offer);
                                    return (
                                        <div key={offer.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="truncate text-sm font-black text-[var(--lt-text)]">{offer.title}</h4>
                                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                                                            offer.status === 'active'
                                                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                                                                : 'border-white/15 bg-white/5 text-gray-400'
                                                        }`}>
                                                            {offer.status === 'active' ? 'Activa' : 'Borrador'}
                                                        </span>
                                                    </div>
                                                    {dates && <p className="mt-1 text-xs text-[var(--lt-text-muted)]">{dates}</p>}
                                                </div>
                                                <div className="flex shrink-0 gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => editOffer(offer)}
                                                        className="rounded-lg border border-white/10 bg-white/5 p-2 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                                                        title="Editar"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeOffer(offer)}
                                                        disabled={deletingId === offer.id}
                                                        className="rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-red-200 disabled:opacity-50"
                                                        title="Eliminar"
                                                    >
                                                        {deletingId === offer.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div>
                            <h3 className="text-sm font-black text-[var(--lt-text)]">{editingId ? 'Editar oferta' : 'Nueva oferta'}</h3>
                            <p className="text-xs text-[var(--lt-text-muted)]">Guárdala como borrador mientras la preparas y actívala cuando esté lista.</p>
                        </div>
                        <Field label="Título">
                            <input
                                className={inputClass}
                                value={form.title}
                                onChange={(event) => setForm({ ...form, title: event.target.value })}
                                placeholder="2x1 en cañas los jueves"
                            />
                        </Field>
                        <Field label="Descripción">
                            <textarea
                                className={`${inputClass} min-h-16`}
                                value={form.description}
                                onChange={(event) => setForm({ ...form, description: event.target.value })}
                                placeholder="Detalle de la oferta que verán los usuarios."
                            />
                        </Field>
                        <Field label="Condiciones">
                            <input
                                className={inputClass}
                                value={form.conditions}
                                onChange={(event) => setForm({ ...form, conditions: event.target.value })}
                                placeholder="Solo en barra, no acumulable..."
                            />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Empieza">
                                <input
                                    type="date"
                                    className={inputClass}
                                    value={form.startsAt}
                                    onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                                />
                            </Field>
                            <Field label="Termina">
                                <input
                                    type="date"
                                    className={inputClass}
                                    value={form.endsAt}
                                    onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                                />
                            </Field>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Enlace (opcional)">
                                <input
                                    className={inputClass}
                                    value={form.ctaUrl}
                                    onChange={(event) => setForm({ ...form, ctaUrl: event.target.value })}
                                    placeholder="https://..."
                                />
                            </Field>
                            <Field label="Estado">
                                <select
                                    className={inputClass}
                                    value={form.status}
                                    onChange={(event) => setForm({ ...form, status: event.target.value === 'active' ? 'active' : 'draft' })}
                                >
                                    <option value="draft">Borrador</option>
                                    <option value="active">Activa</option>
                                </select>
                            </Field>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <SaveButton saving={saving} onClick={save} label={editingId ? 'Guardar cambios' : 'Crear oferta'} />
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                                >
                                    Cancelar edición
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div>
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Solicitar campaña patrocinada</h3>
                            <p className="text-xs text-[var(--lt-text-muted)]">
                                Tu negocio aparecerá destacado con etiqueta "Patrocinado". Las solicitudes las activa un administrador.
                            </p>
                        </div>
                        <Field label="Dónde">
                            <select
                                className={inputClass}
                                value={placementType}
                                onChange={(event) => setPlacementType(event.target.value === 'search' ? 'search' : 'home')}
                            >
                                <option value="home">Destacado en la home</option>
                                <option value="search">Destacado en búsquedas</option>
                            </select>
                        </Field>
                        <Field label="Mensaje corto (opcional)">
                            <input
                                className={inputClass}
                                value={placementHeadline}
                                onChange={(event) => setPlacementHeadline(event.target.value)}
                                placeholder="Ej. Nueva carta de temporada"
                            />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Empieza">
                                <input type="date" className={inputClass} value={placementStartsAt} onChange={(event) => setPlacementStartsAt(event.target.value)} />
                            </Field>
                            <Field label="Termina">
                                <input type="date" className={inputClass} value={placementEndsAt} onChange={(event) => setPlacementEndsAt(event.target.value)} />
                            </Field>
                        </div>
                        <button
                            type="button"
                            onClick={requestPlacement}
                            disabled={requestingPlacement}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-60"
                        >
                            {requestingPlacement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                            Enviar solicitud
                        </button>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Mis campañas</h3>
                        {placements.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-center text-xs text-[var(--lt-text-muted)]">
                                Sin campañas todavía.
                            </p>
                        ) : (
                            <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                                {placements.map((placement) => {
                                    const meta = PLACEMENT_STATUS_META[placement.status];
                                    const dates = formatOfferDates(placement);
                                    return (
                                        <div key={placement.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-[var(--lt-text)]">{PLACEMENT_TYPE_LABELS[placement.type]}</p>
                                                    {placement.headline && <p className="mt-0.5 truncate text-[11px] text-[var(--lt-text-muted)]">{placement.headline}</p>}
                                                    {dates && <p className="mt-0.5 text-[11px] text-[var(--lt-text-muted)]">{dates}</p>}
                                                    {placement.adminNotes && <p className="mt-0.5 text-[11px] text-[var(--lt-text-muted)]">Admin: {placement.adminNotes}</p>}
                                                </div>
                                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${meta.className}`}>
                                                    {meta.label}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <SectionMessage message={message} />
                </div>
            </div>
        </ProSectionShell>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Estadísticas del negocio
// ─────────────────────────────────────────────────────────────────────────────

const monthKey = (ms: number): string => {
    const date = new Date(ms);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string): string => {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, (month || 1) - 1, 1).toLocaleDateString('es-ES', { month: 'short' });
};

const lastMonths = (count: number): string[] => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(monthKey(date.getTime()));
    }
    return keys;
};

export const BusinessStatsSection: React.FC<{ placeId: string }> = ({ placeId }) => {
    const [reviews, setReviews] = useState<ManagerPlaceReview[]>([]);
    const [items, setItems] = useState<CanonicalPlaceItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [reviewRows, itemRows] = await Promise.all([
                    getPlaceReviewsForManager(placeId).catch(() => [] as ManagerPlaceReview[]),
                    getCanonicalPlaceItems(placeId).catch(() => [] as CanonicalPlaceItem[]),
                ]);
                if (!cancelled) {
                    setReviews(reviewRows);
                    setItems(itemRows);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    const stats = useMemo(() => {
        const rated = reviews.filter((review) => review.overallRating !== null);
        const average = rated.length
            ? rated.reduce((sum, review) => sum + (review.overallRating || 0), 0) / rated.length
            : null;

        const months = lastMonths(6);
        const byMonth = new Map<string, { count: number; total: number; rated: number }>();
        months.forEach((key) => byMonth.set(key, { count: 0, total: 0, rated: 0 }));
        reviews.forEach((review) => {
            if (!review.createdAtMs) return;
            const key = monthKey(review.createdAtMs);
            const bucket = byMonth.get(key);
            if (!bucket) return;
            bucket.count += 1;
            if (review.overallRating !== null) {
                bucket.total += review.overallRating;
                bucket.rated += 1;
            }
        });
        const monthly = months.map((key) => {
            const bucket = byMonth.get(key)!;
            return {
                key,
                label: monthLabel(key),
                count: bucket.count,
                average: bucket.rated ? bucket.total / bucket.rated : null,
            };
        });
        const maxCount = Math.max(1, ...monthly.map((row) => row.count));

        const topItems = [...items]
            .filter((item) => (item.stats?.reviewCount || 0) > 0)
            .sort((a, b) => (b.stats?.reviewCount || 0) - (a.stats?.reviewCount || 0))
            .slice(0, 5);

        return { total: reviews.length, average, monthly, maxCount, topItems };
    }, [reviews, items]);

    if (loading) {
        return (
            <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] px-4 py-10 text-center text-sm text-[var(--lt-text-muted)]">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                Calculando estadísticas...
            </div>
        );
    }

    return (
        <ProSectionShell
            title="Estadísticas del negocio"
            text="Resumen de la actividad de la comunidad en tu local: reseñas, evolución de la nota y elementos más valorados."
            icon={BarChart3}
        >
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                    <p className="text-3xl font-black text-[var(--lt-text)]">{stats.total}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Reseñas recibidas</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                    <p className="text-3xl font-black text-[var(--lt-text)]">{stats.average !== null ? stats.average.toFixed(2) : '—'}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Nota media</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                    <p className="text-3xl font-black text-[var(--lt-text)]">{items.length}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Elementos en carta</p>
                </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-4 text-sm font-black text-[var(--lt-text)]">Reseñas por mes (últimos 6 meses)</h3>
                    <div className="flex h-36 items-end gap-2">
                        {stats.monthly.map((row) => (
                            <div key={row.key} className="flex flex-1 flex-col items-center gap-1">
                                <span className="text-[11px] font-bold text-[var(--lt-text-muted)]">{row.count || ''}</span>
                                <div
                                    className="w-full rounded-t-lg bg-[var(--lt-accent)]/70"
                                    style={{ height: `${Math.max(4, (row.count / stats.maxCount) * 100)}%` }}
                                />
                                <span className="text-[10px] font-bold uppercase text-[var(--lt-text-muted)]">{row.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex justify-between border-t border-white/10 pt-2">
                        {stats.monthly.map((row) => (
                            <span key={`avg-${row.key}`} className="flex-1 text-center text-[10px] text-[var(--lt-text-muted)]">
                                {row.average !== null ? row.average.toFixed(1) : '·'}
                            </span>
                        ))}
                    </div>
                    <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-[var(--lt-text-muted)]">Nota media de cada mes</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Elementos más reseñados</h3>
                    {stats.topItems.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-xs text-[var(--lt-text-muted)]">
                            Aún no hay datos suficientes.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {stats.topItems.map((item, index) => (
                                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                                    <span className="w-4 text-right font-mono text-xs text-[var(--lt-text-muted)]">{index + 1}</span>
                                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--lt-text)]">{item.canonicalName || item.id}</span>
                                    <span className="text-xs text-[var(--lt-text-muted)]">{item.stats?.reviewCount || 0} reseñas</span>
                                    {typeof item.stats?.averageRating === 'number' && (
                                        <span className="font-mono text-sm font-black text-emerald-400">{item.stats.averageRating.toFixed(1)}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </ProSectionShell>
    );
};
