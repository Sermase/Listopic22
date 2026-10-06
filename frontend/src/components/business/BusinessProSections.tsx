import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
    Share2,
    Sparkles,
    Tags,
    Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { BUSINESS_PRO_CHECKOUT_ENABLED } from '../../config/features';
import { formatEur } from '../../config/planBeta';
import { createImpulsePackCheckoutSession } from '../../services/BusinessBillingService';
import { getBusinessPlaceAnalytics, type BusinessPlaceAnalyticsResult } from '../../services/AnalyticsService';
import { getCanonicalPlaceItems, type CanonicalPlaceItem } from '../../services/CanonicalItemService';
import {
    ALLERGEN_OPTIONS,
    allergenLabel,
    computeSpotlightImpulses,
    impulsesPriceEur,
    packDiscountPercent,
    spotlightRadiusSteps,
    createBusinessItem,
    DEFAULT_SPOTLIGHT_PRICING,
    deleteBusinessOffer,
    describeProposal,
    EMPTY_ITEM_BUSINESS_DATA,
    EMPTY_OFFER_DATA,
    EMPTY_VISUAL_DATA,
    getBusinessMenuSections,
    getBusinessItemExistsDetails,
    getBusinessOffers,
    getBusinessVisual,
    getMyItemProposals,
    getPlaceItemSpotlights,
    getPlaceReviewsForManager,
    getPlaceSponsoredPlacements,
    getPlaceSpotlightCredits,
    getSpotlightPricing,
    normalizeItemName,
    rebuildPlaceItems,
    requestItemSpotlight,
    requestSponsoredPlacement,
    saveBusinessOffer,
    SPOTLIGHT_RADIUS_STEP_KM,
    submitItemProposal,
    updateBusinessMenuSections,
    updateBusinessVisual,
    updateCanonicalItemBusinessData,
    type BusinessOffer,
    type BusinessOfferData,
    type BusinessVisualData,
    type BusinessVisualStyle,
    type ItemBusinessData,
    type ItemProposal,
    type ItemSpotlight,
    type ManagerPlaceReview,
    type MenuSection,
    type SponsoredPlacement,
    type SpotlightPricing,
} from '../../services/BusinessProService';

type Message = { type: 'success' | 'error'; text: string } | null;
const BUSINESS_SHARE_CHANNEL_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp',
    clipboard: 'Enlace copiado',
    image: 'Tarjeta generada',
    chat: 'Chat Listopic',
};
const BUSINESS_SHARE_ENTITY_LABELS: Record<string, string> = {
    place: 'Ficha del lugar',
    group: 'Grupo o elemento',
    review: 'Valoración',
    list: 'Lista',
    sublist: 'Minilista',
};

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--lt-text)] outline-none transition-colors placeholder:text-[var(--lt-text-muted)] focus:border-[var(--lt-accent-border)]';

// Campaña que se estaba configurando al ir a Stripe a comprar lo que falta:
// se guarda para recuperarla al volver.
interface SpotlightDraft {
    itemId: string;
    radiusKm: number;
    days: number;
    intensity: number;
    balanceBefore: number;
}

const spotlightDraftKey = (placeId: string) => `spotlightDraft:${placeId}`;

const takeSpotlightDraft = (placeId: string): SpotlightDraft | null => {
    try {
        const raw = sessionStorage.getItem(spotlightDraftKey(placeId));
        sessionStorage.removeItem(spotlightDraftKey(placeId));
        const data = raw ? JSON.parse(raw) as Partial<SpotlightDraft> : null;
        if (!data) return null;
        return {
            itemId: typeof data.itemId === 'string' ? data.itemId : '',
            radiusKm: Number(data.radiusKm) || 2,
            days: Math.floor(Number(data.days)) || 7,
            intensity: Math.floor(Number(data.intensity)) || 1,
            balanceBefore: Number.isFinite(Number(data.balanceBefore)) ? Number(data.balanceBefore) : 0,
        };
    } catch {
        return null;
    }
};

const saveSpotlightDraft = (placeId: string, draft: SpotlightDraft) => {
    try {
        sessionStorage.setItem(spotlightDraftKey(placeId), JSON.stringify(draft));
    } catch {
        // Sin sessionStorage solo se pierde el borrador.
    }
};

// Comprobaciones del saldo al volver de Stripe (segundos desde la vuelta).
const IMPULSE_RETURN_POLL_SECONDS = [3, 6, 10, 15, 25, 40, 60, 90, 120, 180];

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
        allergens: Array.isArray(raw.allergens)
            ? raw.allergens.filter((entry): entry is string => typeof entry === 'string')
            : [],
        available: raw.available !== false,
    };
};

// Carta del sitio para elegir elementos. Si hay reseñas (de cualquiera, bots incluidos)
// cuyo elemento no está en places/{id}/items (sitios anteriores a la carta persistida),
// se reconstruye una vez y se vuelve a leer.
const healedPlaces = new Set<string>();
const getPlaceItemsHealed = async (placeId: string): Promise<CanonicalPlaceItem[]> => {
    const [itemRows, reviewRows] = await Promise.all([
        getCanonicalPlaceItems(placeId),
        getPlaceReviewsForManager(placeId).catch(() => [] as ManagerPlaceReview[]),
    ]);
    const knownIds = new Set(itemRows.map((item) => item.id));
    const hasOrphans = reviewRows.some((review) => review.itemName && !knownIds.has(review.itemId));
    if (!hasOrphans || healedPlaces.has(placeId)) return itemRows;
    healedPlaces.add(placeId);
    try {
        await rebuildPlaceItems(placeId);
        return await getCanonicalPlaceItems(placeId);
    } catch (error) {
        console.warn('getPlaceItemsHealed: rebuild failed', error);
        return itemRows;
    }
};

const formatReviewDate = (ms: number): string => {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Mismo orden que getCanonicalPlaceItems (más valoraciones primero, luego por
// nombre), para colocar un plato recién creado sin recargar la carta.
const sortPlaceItems = (rows: CanonicalPlaceItem[]): CanonicalPlaceItem[] => [...rows].sort((a, b) =>
    (b.stats?.reviewCount || 0) - (a.stats?.reviewCount || 0)
    || (a.canonicalName || a.id).localeCompare(b.canonicalName || b.id, 'es'));

const itemGroupOf = (item: CanonicalPlaceItem): string => {
    const group = (item.businessData as Record<string, unknown> | undefined)?.group;
    return typeof group === 'string' ? group : '';
};

const MAX_MENU_SECTIONS = 20;

// En escritorio (lg) la ficha está al lado de la lista; en móvil queda debajo.
const isSideBySideLayout = (): boolean => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width: 1024px)').matches;

export const BusinessItemsSection: React.FC<{ placeId: string }> = ({ placeId }) => {
    const { user } = useAuth();
    const confirm = useConfirm();
    const rebuildAttempted = React.useRef(false);
    const [items, setItems] = useState<CanonicalPlaceItem[]>([]);
    const [reviews, setReviews] = useState<ManagerPlaceReview[]>([]);
    const [proposals, setProposals] = useState<ItemProposal[]>([]);
    const [loading, setLoading] = useState(true);
    // Recargas posteriores a la primera: no cambian la lista por el spinner.
    const [refreshing, setRefreshing] = useState(false);
    // Sube con cada cambio local de `items`: una lectura que empezó antes no lo pisa.
    const itemsVersion = React.useRef(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedIdRef = React.useRef<string | null>(null);
    const [form, setForm] = useState<ItemBusinessData>(EMPTY_ITEM_BUSINESS_DATA);
    const [saving, setSaving] = useState(false);
    // Cada aviso se pinta junto al control que lo produce.
    const [addMessage, setAddMessage] = useState<Message>(null);
    const [addedItemId, setAddedItemId] = useState<string | null>(null);
    const [sectionsMessage, setSectionsMessage] = useState<Message>(null);
    const [itemMessage, setItemMessage] = useState<Message>(null);
    const [reviewsMessage, setReviewsMessage] = useState<Message>(null);
    const [proposalMessage, setProposalMessage] = useState<Message>(null);

    const [newItemName, setNewItemName] = useState('');
    const [newItemGroup, setNewItemGroup] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [creatingItem, setCreatingItem] = useState(false);
    const creatingItemRef = React.useRef(false);
    const newItemInputRef = React.useRef<HTMLInputElement>(null);
    const itemsListRef = React.useRef<HTMLDivElement>(null);
    const sheetRef = React.useRef<HTMLDivElement>(null);
    const pendingRevealId = React.useRef<string | null>(null);

    const [sections, setSections] = useState<MenuSection[]>([]);
    const [sectionDraft, setSectionDraft] = useState('');
    const [savingSections, setSavingSections] = useState(false);
    const [sectionsSaved, setSectionsSaved] = useState(false);
    // Las secciones se guardan al momento y en orden. load() no pisa las locales
    // si hay guardados en curso o si cambiaron mientras leía.
    const sectionsVersion = React.useRef(0);
    const pendingSectionSaves = React.useRef(0);
    const sectionsSaveChain = React.useRef<Promise<void>>(Promise.resolve());
    // No se tocan hasta leer las guardadas de este sitio: como cada cambio guarda la
    // lista entera, uno hecho antes borraría las que ya había en el servidor.
    const [sectionsReadyFor, setSectionsReadyFor] = useState<string | null>(null);
    const sectionsReady = sectionsReadyFor === placeId;

    const [showPreview, setShowPreview] = useState(false);
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [renameValue, setRenameValue] = useState('');
    const [proposalNote, setProposalNote] = useState('');
    const [submittingProposal, setSubmittingProposal] = useState<string | null>(null);
    const [movingReviewPath, setMovingReviewPath] = useState<string | null>(null);
    const [moveTargetId, setMoveTargetId] = useState('');

    const load = async ({ silent = false }: { silent?: boolean } = {}): Promise<CanonicalPlaceItem[] | null> => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const startItemsVersion = itemsVersion.current;
        const startSectionsVersion = sectionsVersion.current;
        try {
            const [itemRows, reviewRows, proposalRows, sectionRows] = await Promise.all([
                getCanonicalPlaceItems(placeId),
                getPlaceReviewsForManager(placeId).catch((error) => {
                    console.error('BusinessItemsSection: reviews load failed', error);
                    return [] as ManagerPlaceReview[];
                }),
                user ? getMyItemProposals(placeId, user.uid).catch(() => [] as ItemProposal[]) : Promise.resolve([] as ItemProposal[]),
                getBusinessMenuSections(placeId).catch((error) => {
                    console.error('BusinessItemsSection: sections load failed', error);
                    return null;
                }),
            ]);
            setReviews(reviewRows);
            setProposals(proposalRows);
            if (sectionRows) {
                if (pendingSectionSaves.current === 0 && sectionsVersion.current === startSectionsVersion) {
                    setSections(sectionRows);
                }
                setSectionsReadyFor(placeId);
            } else if (sectionsReadyFor !== placeId) {
                setSectionsMessage({ type: 'error', text: 'No se pudieron cargar tus secciones. Recarga la página para editarlas.' });
            }

            // Autocuración: si hay reseñas cuyo elemento no está persistido
            // (lugares con reseñas anteriores al sistema de items), se
            // reconstruyen los items del lugar una sola vez y se recarga.
            let nextItems = itemRows;
            const knownIds = new Set(itemRows.map((item) => item.id));
            const hasOrphanReviews = reviewRows.some((review) => review.itemName && !knownIds.has(review.itemId));
            if (hasOrphanReviews && !rebuildAttempted.current) {
                rebuildAttempted.current = true;
                try {
                    await rebuildPlaceItems(placeId);
                    nextItems = await getCanonicalPlaceItems(placeId);
                } catch (error) {
                    console.warn('BusinessItemsSection: rebuild failed', error);
                }
            }
            if (itemsVersion.current === startItemsVersion) {
                setItems(nextItems);
            } else {
                // Hubo cambios locales durante la lectura (un plato recién creado):
                // se conservan y se añade lo que faltaba.
                setItems((prev) => {
                    const localIds = new Set(prev.map((item) => item.id));
                    return sortPlaceItems([...prev, ...nextItems.filter((item) => !localIds.has(item.id))]);
                });
            }
            return nextItems;
        } catch (error) {
            console.error('BusinessItemsSection: load failed', error);
            return null;
        } finally {
            if (silent) setRefreshing(false);
            else setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placeId, user?.uid]);

    // Tras añadir (o reabrir) un plato desde el alta rápida: su fila se trae a la
    // vista dentro de la lista y, si la ficha está al lado, también la ficha. En
    // móvil la ficha queda debajo y no se salta allí para seguir añadiendo platos.
    useEffect(() => {
        const revealId = pendingRevealId.current;
        if (!revealId) return;
        pendingRevealId.current = null;
        const container = itemsListRef.current;
        const row = Array.from(container?.querySelectorAll<HTMLElement>('[data-item-id]') || [])
            .find((element) => element.dataset.itemId === revealId);
        if (container && row) {
            const box = container.getBoundingClientRect();
            const rect = row.getBoundingClientRect();
            if (rect.top < box.top) container.scrollTop -= box.top - rect.top;
            else if (rect.bottom > box.bottom) container.scrollTop += rect.bottom - box.bottom;
        }
        if (isSideBySideLayout()) sheetRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, [items, selectedId]);

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

    // Vista previa de la carta tal y como se verá en la página pública.
    const menuPreview = useMemo(() => {
        const rows = items.map((item) => {
            const raw = (item.businessData || {}) as Record<string, unknown>;
            return {
                id: item.id,
                name: item.canonicalName || item.id,
                group: typeof raw.group === 'string' ? raw.group : '',
                price: typeof raw.price === 'string' ? raw.price : '',
                discount: typeof raw.discount === 'string' ? raw.discount : '',
                description: typeof raw.description === 'string' ? raw.description : '',
                allergens: Array.isArray(raw.allergens) ? raw.allergens.filter((entry): entry is string => typeof entry === 'string') : [],
                available: raw.available !== false,
                rating: typeof item.stats?.averageRating === 'number' ? item.stats.averageRating : null,
                reviewCount: item.stats?.reviewCount || 0,
            };
        });
        const byName = (a: { rating: number | null; name: string }, b: { rating: number | null; name: string }) =>
            (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name, 'es');
        const sectionNames = sections.map((section) => section.name);
        const groups = sectionNames.map((name) => ({
            name,
            items: rows.filter((row) => row.group === name).sort(byName),
        })).filter((group) => group.items.length > 0);
        const leftovers = rows.filter((row) => !row.group || !sectionNames.includes(row.group)).sort(byName);
        if (leftovers.length > 0) groups.push({ name: sectionNames.length > 0 ? 'Otros' : '', items: leftovers });
        return groups;
    }, [items, sections]);

    const selectItem = (item: CanonicalPlaceItem) => {
        selectedIdRef.current = item.id;
        setSelectedId(item.id);
        setForm(itemBusinessDataFrom(item));
        setMergeTargetId('');
        setRenameValue('');
        setProposalNote('');
        setMovingReviewPath(null);
        setMoveTargetId('');
        setItemMessage(null);
        setReviewsMessage(null);
        setProposalMessage(null);
    };

    // El servidor normaliza el precio ('1,2' → '1,20 €'): se relee la carta para
    // mostrarlo tal y como ha quedado guardado.
    const syncStoredPrice = async (itemId: string, sentPrice: string) => {
        if (!sentPrice.trim()) return;
        const startVersion = itemsVersion.current;
        const fresh = await getCanonicalPlaceItems(placeId)
            .then((rows) => rows.find((item) => item.id === itemId) || null)
            .catch(() => null);
        const stored = fresh?.businessData?.price;
        if (!fresh || typeof stored !== 'string' || stored === sentPrice) return;
        if (itemsVersion.current !== startVersion) return;
        setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, businessData: fresh.businessData } : item));
        if (selectedIdRef.current === itemId) {
            setForm((prev) => prev.price === sentPrice ? { ...prev, price: stored } : prev);
        }
    };

    const save = async () => {
        if (!selectedId) return;
        const itemId = selectedId;
        const data = form;
        setSaving(true);
        setItemMessage(null);
        try {
            await updateCanonicalItemBusinessData(placeId, itemId, data);
            itemsVersion.current += 1;
            setItems((prev) => prev.map((item) => item.id === itemId
                ? { ...item, businessData: { ...(item.businessData || {}), ...data } }
                : item));
            setItemMessage({ type: 'success', text: 'Ficha oficial guardada.' });
            void syncStoredPrice(itemId, data.price);
        } catch (error) {
            console.error('BusinessItemsSection: save failed', error);
            setItemMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo guardar la ficha del elemento.') });
        } finally {
            setSaving(false);
        }
    };

    // Guarda la lista completa de secciones al momento (sin estado oculto sin guardar).
    // Los guardados van en cola y cada uno lleva la lista entera: si falla el último,
    // se vuelve a lo que hay guardado.
    const persistSections = (next: MenuSection[]) => {
        sectionsVersion.current += 1;
        pendingSectionSaves.current += 1;
        setSections(next);
        setSavingSections(true);
        setSectionsSaved(false);
        setSectionsMessage(null);
        const names = next.map((section) => section.name);
        sectionsSaveChain.current = sectionsSaveChain.current.then(async () => {
            let failure: unknown = null;
            try {
                await updateBusinessMenuSections(placeId, names);
            } catch (error) {
                failure = error;
                console.error('BusinessItemsSection: save sections failed', error);
            }
            pendingSectionSaves.current -= 1;
            if (pendingSectionSaves.current > 0) return;
            if (failure) {
                const startVersion = sectionsVersion.current;
                const saved = await getBusinessMenuSections(placeId).catch(() => null);
                // Si entretanto hubo otro cambio, su guardado informa.
                if (sectionsVersion.current !== startVersion) return;
                if (saved) setSections(saved);
                setSectionsMessage({
                    type: 'error',
                    text: `${getErrorMessage(failure, 'No se pudieron guardar las secciones.')}${saved ? ' Te muestro las que había guardadas.' : ''}`,
                });
            } else {
                setSectionsSaved(true);
            }
            setSavingSections(false);
        });
    };

    const addSection = () => {
        const name = sectionDraft.replace(/[<>]/g, '').trim().slice(0, 40);
        if (!name || !sectionsReady) return;
        if (sections.some((section) => section.name.toLowerCase() === name.toLowerCase())) {
            setSectionsMessage({ type: 'error', text: `Ya tienes la sección «${name}».` });
            return;
        }
        if (sections.length >= MAX_MENU_SECTIONS) {
            setSectionsMessage({ type: 'error', text: `Puedes tener hasta ${MAX_MENU_SECTIONS} secciones.` });
            return;
        }
        setSectionDraft('');
        persistSections([...sections, { name, order: sections.length }]);
    };

    const moveSection = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (!sectionsReady || target < 0 || target >= sections.length) return;
        const next = [...sections];
        [next[index], next[target]] = [next[target], next[index]];
        persistSections(next.map((section, order) => ({ ...section, order })));
    };

    const removeSection = async (index: number) => {
        const section = sections[index];
        if (!section || !sectionsReady) return;
        const dishCount = items.filter((item) => itemGroupOf(item) === section.name).length;
        if (dishCount > 0) {
            const confirmed = await confirm({
                title: `¿Quitar la sección «${section.name}»?`,
                message: `${dishCount === 1 ? 'Tiene 1 plato, que pasará' : `Tiene ${dishCount} platos, que pasarán`} a «Sin sección». En tu carta saldrán en «Otros».`,
                confirmLabel: 'Quitar sección',
                destructive: true,
            });
            if (!confirmed) return;
        }
        if (newItemGroup === section.name) setNewItemGroup('');
        persistSections(sections
            .filter((entry) => entry.name !== section.name)
            .map((entry, order) => ({ ...entry, order })));
    };

    const toggleAllergen = (value: string) => {
        setForm((prev) => ({
            ...prev,
            allergens: prev.allergens.includes(value)
                ? prev.allergens.filter((entry) => entry !== value)
                : [...prev.allergens, value],
        }));
    };

    // Alta rápida: nombre, sección y precio en una sola llamada. El plato se
    // inserta en la lista sin recargar, se abre su ficha y la sección elegida se
    // mantiene para el siguiente.
    const addItem = async () => {
        const name = newItemName.trim();
        // Enter y el botón pueden llegar seguidos: solo una alta a la vez.
        if (!name || creatingItem || creatingItemRef.current) return;
        creatingItemRef.current = true;
        setCreatingItem(true);
        setAddMessage(null);
        setAddedItemId(null);
        // Solo una sección que siga en la lista (si se quitó o se revirtió, «Sin sección»).
        const group = sections.some((section) => section.name === newItemGroup) ? newItemGroup : '';
        const price = newItemPrice.trim();
        try {
            const created = await createBusinessItem(placeId, name, { group, price });
            itemsVersion.current += 1;
            setItems((prev) => sortPlaceItems([...prev.filter((item) => item.id !== created.itemId), created.item]));
            pendingRevealId.current = created.itemId;
            selectItem(created.item);
            setAddedItemId(created.itemId);
            setNewItemName('');
            setNewItemPrice('');
            setAddMessage({
                type: 'success',
                text: group ? `«${created.name}» añadido a ${group}.` : `«${created.name}» añadido a la carta.`,
            });
        } catch (error) {
            const existing = getBusinessItemExistsDetails(error);
            const known = existing
                ? items.find((item) => item.id === existing.itemId)
                    || (await load({ silent: true }))?.find((item) => item.id === existing.itemId)
                : undefined;
            if (existing && known) {
                pendingRevealId.current = known.id;
                selectItem(known);
                setAddedItemId(known.id);
                setNewItemName('');
                setNewItemPrice('');
                const shownName = known.canonicalName || existing.canonicalName || known.id;
                setAddMessage({
                    type: 'success',
                    text: normalizeItemName(shownName) === normalizeItemName(name)
                        ? 'Ya estaba en tu carta: te lo abro.'
                        : `Ya estaba en tu carta como «${shownName}»: te lo abro.`,
                });
            } else {
                console.error('BusinessItemsSection: create item failed', error);
                setAddMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo añadir el plato.') });
            }
        } finally {
            creatingItemRef.current = false;
            setCreatingItem(false);
            newItemInputRef.current?.focus();
        }
    };

    const sendProposal = async (
        key: string,
        type: 'merge' | 'rename' | 'reassign_review',
        payload: Record<string, string>,
    ) => {
        // Mover una valoración se avisa en su tarjeta; fusión y renombre, en "Proponer corrección".
        const setResult = type === 'reassign_review' ? setReviewsMessage : setProposalMessage;
        setSubmittingProposal(key);
        setReviewsMessage(null);
        setProposalMessage(null);
        try {
            await submitItemProposal(placeId, type, payload, proposalNote.trim() || undefined);
            setResult({ type: 'success', text: 'Propuesta enviada. Un administrador la revisará y te llegará una notificación.' });
            setMergeTargetId('');
            setRenameValue('');
            setProposalNote('');
            setMovingReviewPath(null);
            setMoveTargetId('');
            if (user) setProposals(await getMyItemProposals(placeId, user.uid).catch(() => proposals));
        } catch (error) {
            console.error('BusinessItemsSection: proposal failed', error);
            setResult({ type: 'error', text: getErrorMessage(error, 'No se pudo enviar la propuesta.') });
        } finally {
            setSubmittingProposal(null);
        }
    };

    return (
        <ProSectionShell
            title="Elementos, carta y grupos"
            text="La base son los elementos valorados por la comunidad. Enriquécelos con la ficha oficial, añade platos nuevos y propone correcciones (fusiones de duplicados por erratas, renombres o mover valoraciones mal asignadas): los cambios sensibles pasan por revisión admin."
            icon={Tags}
        >
            <div className="mb-4 flex justify-end">
                <button
                    type="button"
                    onClick={() => setShowPreview((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
                        showPreview
                            ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]'
                            : 'border-white/10 bg-white/5 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'
                    }`}
                >
                    <ImageIcon className="h-4 w-4" />
                    {showPreview ? 'Cerrar vista previa' : 'Vista previa de la carta'}
                </button>
            </div>

            {showPreview && (
                <div className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-[var(--lt-bg-deep)]">
                    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                        <span className="text-sm font-black uppercase tracking-wide text-[var(--lt-text)]">La Carta</span>
                        <span className="ml-auto text-[10px] font-bold uppercase text-emerald-300">Así se verá en tu página</span>
                    </div>
                    {menuPreview.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-[var(--lt-text-muted)]">
                            Aún no hay elementos. Añade platos y secciones para verlos aquí.
                        </p>
                    ) : (
                        menuPreview.map((group) => (
                            <div key={group.name || 'general'}>
                                {group.name && (
                                    <div className="border-b border-white/5 bg-white/[0.03] px-5 py-2">
                                        <h4 className="text-xs font-black uppercase tracking-[0.18em] text-[var(--lt-accent)]">{group.name}</h4>
                                    </div>
                                )}
                                <div className="divide-y divide-white/5">
                                    {group.items.map((item) => (
                                        <div key={item.id} className={`flex items-start gap-3 px-5 py-3 ${item.available ? '' : 'opacity-50'}`}>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-semibold text-[var(--lt-text)]">{item.name}</span>
                                                    {item.discount && (
                                                        <span className="rounded border border-emerald-500/25 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">{item.discount}</span>
                                                    )}
                                                    {!item.available && (
                                                        <span className="rounded border border-red-500/25 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">No disponible</span>
                                                    )}
                                                </div>
                                                {item.description && (
                                                    <p className="mt-0.5 text-xs leading-snug text-[var(--lt-text-muted)] line-clamp-2">{item.description}</p>
                                                )}
                                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                    {item.reviewCount > 0 && item.rating !== null && (
                                                        <span className="font-mono text-xs font-black text-emerald-400">
                                                            ★ {item.rating.toFixed(1)}
                                                            <span className="ml-1 font-normal text-[var(--lt-text-muted)]">({item.reviewCount})</span>
                                                        </span>
                                                    )}
                                                    {item.allergens.map((allergen) => (
                                                        <span key={allergen} className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--lt-text-muted)]">
                                                            {allergenLabel(allergen)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            {item.price && <span className="shrink-0 text-sm font-black text-[var(--lt-text)]">{item.price}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
                {/* Columna izquierda: lista de elementos + crear */}
                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3">
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Añadir elemento a la carta</h3>
                            <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Para platos que aún no tienen valoraciones. Se crea al momento.</p>
                        </div>
                        <form
                            className="space-y-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void addItem();
                            }}
                        >
                            <input
                                ref={newItemInputRef}
                                className={inputClass}
                                value={newItemName}
                                onChange={(event) => setNewItemName(event.target.value)}
                                placeholder="Nombre del plato o producto"
                                aria-label="Nombre del plato o producto"
                                maxLength={120}
                            />
                            <div className="flex gap-2">
                                {sections.length > 0 && (
                                    <select
                                        className={`${inputClass} min-w-0 flex-1`}
                                        value={newItemGroup}
                                        onChange={(event) => setNewItemGroup(event.target.value)}
                                        aria-label="Sección del plato"
                                    >
                                        <option value="">Sin sección</option>
                                        {sections.map((section) => (
                                            <option key={section.name} value={section.name}>{section.name}</option>
                                        ))}
                                    </select>
                                )}
                                <input
                                    className={`${inputClass} min-w-0 flex-1`}
                                    value={newItemPrice}
                                    onChange={(event) => setNewItemPrice(event.target.value)}
                                    placeholder="6,50 €"
                                    aria-label="Precio del plato"
                                    maxLength={40}
                                />
                                <button
                                    type="submit"
                                    disabled={creatingItem || !newItemName.trim()}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[var(--lt-accent)] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                                >
                                    {creatingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                    Añadir
                                </button>
                            </div>
                        </form>
                        {addMessage && (
                            <div className="mt-3 space-y-1.5" role="status">
                                <SectionMessage message={addMessage} />
                                {addMessage.type === 'success' && addedItemId && addedItemId === selectedId && (
                                    <button
                                        type="button"
                                        onClick={() => sheetRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })}
                                        className="text-xs font-bold text-[var(--lt-accent)] lg:hidden"
                                    >
                                        Completar su ficha (alérgenos, descripción...)
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-black text-[var(--lt-text)]">Secciones de la carta</h3>
                                <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Entrantes, primeros, postres... el orden aquí es el orden público. Los cambios se guardan al momento.</p>
                            </div>
                            {(savingSections || sectionsSaved) && (
                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--lt-text-muted)]" role="status">
                                    {savingSections
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Check className="h-3.5 w-3.5 text-emerald-300" />}
                                    {savingSections ? 'Guardando...' : 'Guardado'}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className={inputClass}
                                value={sectionDraft}
                                onChange={(event) => setSectionDraft(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') addSection(); }}
                                placeholder="Nueva sección (ej. Entrantes)"
                                aria-label="Nueva sección"
                                maxLength={40}
                                disabled={!sectionsReady}
                            />
                            <button
                                type="button"
                                onClick={addSection}
                                disabled={!sectionsReady || !sectionDraft.trim()}
                                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[var(--lt-text)] disabled:opacity-50"
                                aria-label="Añadir sección"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        {sections.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                                {sections.map((section, index) => (
                                    <div key={section.name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                        <span className="w-4 text-right font-mono text-[11px] text-[var(--lt-text-muted)]">{index + 1}</span>
                                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--lt-text)]">{section.name}</span>
                                        <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} className="text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] disabled:opacity-30" title="Subir" aria-label={`Subir ${section.name}`}>↑</button>
                                        <button type="button" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} className="text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] disabled:opacity-30" title="Bajar" aria-label={`Bajar ${section.name}`}>↓</button>
                                        <button type="button" onClick={() => void removeSection(index)} className="text-red-300/70 hover:text-red-300" title="Eliminar" aria-label={`Quitar ${section.name}`}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {sectionsMessage && <div className="mt-3"><SectionMessage message={sectionsMessage} /></div>}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-4 flex items-start justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-black text-[var(--lt-text)]">Elementos del lugar</h3>
                                <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Toca un elemento para ver sus valoraciones y editar su ficha.</p>
                            </div>
                            {refreshing && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--lt-accent)]" aria-label="Actualizando" />}
                        </div>

                        {loading ? (
                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                                Cargando elementos...
                            </div>
                        ) : items.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                                Todavía no hay elementos. Añade el primero arriba o espera a que lleguen valoraciones.
                            </div>
                        ) : (
                            <div ref={itemsListRef} className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                                {items.map((item) => {
                                    const hasOfficialData = Boolean((item.businessData as Record<string, unknown> | undefined)?.price
                                        || (item.businessData as Record<string, unknown> | undefined)?.group);
                                    // stats.reviewCount es el total; las reseñas cargadas van limitadas.
                                    const reviewCount = typeof item.stats?.reviewCount === 'number'
                                        ? item.stats.reviewCount
                                        : (reviewsByItem.get(item.id) || []).length;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            data-item-id={item.id}
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
                                                        {reviewCount} valoraciones
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
                    <div ref={sheetRef} className="scroll-mt-4 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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
                                    <Field label="Sección de la carta">
                                        {sections.length > 0 ? (
                                            <select
                                                className={inputClass}
                                                value={form.group}
                                                onChange={(event) => setForm({ ...form, group: event.target.value })}
                                            >
                                                <option value="">Sin sección</option>
                                                {sections.map((section) => (
                                                    <option key={section.name} value={section.name}>{section.name}</option>
                                                ))}
                                                {form.group && !sections.some((section) => section.name === form.group) && (
                                                    <option value={form.group}>{form.group}</option>
                                                )}
                                            </select>
                                        ) : (
                                            <>
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
                                            </>
                                        )}
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
                                <Field label="Alérgenos" hint="Los 14 de declaración obligatoria. Marca los que contiene el plato.">
                                    <div className="flex flex-wrap gap-1.5">
                                        {ALLERGEN_OPTIONS.map((option) => {
                                            const active = form.allergens.includes(option.value);
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => toggleAllergen(option.value)}
                                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                                        active
                                                            ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                                                            : 'border-white/10 bg-white/5 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'
                                                    }`}
                                                >
                                                    {option.emoji} {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
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
                                <SectionMessage message={itemMessage} />
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
                                    <h3 className="text-sm font-black text-[var(--lt-text)]">Valoraciones de este elemento ({selectedReviews.length})</h3>
                                </div>
                                {selectedReviews.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-center text-xs text-[var(--lt-text-muted)]">
                                        Este elemento aún no tiene valoraciones asignadas.
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
                                {reviewsMessage && <div className="mt-3"><SectionMessage message={reviewsMessage} /></div>}
                            </div>

                            {/* Correcciones del elemento */}
                            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <h3 className="text-sm font-black text-[var(--lt-text)]">Proponer corrección</h3>
                                <p className="text-xs text-[var(--lt-text-muted)]">
                                    Para duplicados por erratas (ej. "reggina rosa" y "regina rossa") o nombres mal escritos.
                                    Las propuestas las revisa un administrador; las valoraciones y sus nombres originales nunca se pierden.
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
                                <SectionMessage message={proposalMessage} />
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

    const [items, setItems] = useState<CanonicalPlaceItem[]>([]);
    const [spotlights, setSpotlights] = useState<ItemSpotlight[]>([]);
    const [pricing, setPricing] = useState<SpotlightPricing>(DEFAULT_SPOTLIGHT_PRICING);
    const [searchParams, setSearchParams] = useSearchParams();
    // Vuelta de Stripe tras comprar impulsos. El saldo lo suma el webhook al
    // confirmar el pago, así que puede tardar en aparecer.
    const [impulsePurchaseReturn] = useState<string | null>(() => searchParams.get('impulsos'));
    const [restoredDraft] = useState<SpotlightDraft | null>(() => (impulsePurchaseReturn ? takeSpotlightDraft(placeId) : null));
    const [spotlightItemId, setSpotlightItemId] = useState(() => restoredDraft?.itemId || '');
    const [spotlightIntensity, setSpotlightIntensity] = useState(() => restoredDraft?.intensity || 1);
    const [spotlightRadius, setSpotlightRadius] = useState(() => restoredDraft?.radiusKm || 2);
    // El campo de días guarda el texto tal cual para poder borrarlo y escribir.
    const [spotlightDaysInput, setSpotlightDaysInput] = useState(() => String(restoredDraft?.days || 7));
    const [spotlightCredits, setSpotlightCredits] = useState(0);
    const [requestingSpotlight, setRequestingSpotlight] = useState(false);
    const [buyingImpulses, setBuyingImpulses] = useState<string | null>(null);
    const [awaitingImpulses, setAwaitingImpulses] = useState(false);

    useEffect(() => {
        if (!searchParams.has('impulsos')) return;
        const next = new URLSearchParams(searchParams);
        next.delete('impulsos');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);
    useEffect(() => {
        if (!impulsePurchaseReturn) return;
        if (impulsePurchaseReturn !== 'ok') {
            setMessage({ type: 'error', text: 'Compra cancelada: no se ha cobrado nada.' });
            return;
        }
        setMessage({
            type: 'success',
            text: 'Estamos confirmando el pago con Stripe. Los impulsos se sumarán a tu saldo en cuanto se confirme.',
        });
        setAwaitingImpulses(true);
        const baseline = restoredDraft?.balanceBefore ?? null;
        let cancelled = false;
        let done = false;
        const timers = IMPULSE_RETURN_POLL_SECONDS.map((seconds, index) => window.setTimeout(() => {
            if (done) return;
            void getPlaceSpotlightCredits(placeId)
                .then((balance) => {
                    if (cancelled || done) return;
                    setSpotlightCredits(balance);
                    if (baseline !== null && balance > baseline) {
                        done = true;
                        setAwaitingImpulses(false);
                        setMessage({ type: 'success', text: 'Impulsos añadidos a tu saldo.' });
                    } else if (index === IMPULSE_RETURN_POLL_SECONDS.length - 1) {
                        setAwaitingImpulses(false);
                        if (baseline !== null) {
                            setMessage({
                                type: 'success',
                                text: 'Stripe aún no ha confirmado el pago. Con algunos métodos, como el adeudo SEPA, tarda unos días: los impulsos se sumarán solos al confirmarse.',
                            });
                        }
                    }
                })
                .catch(() => {
                    if (!cancelled && index === IMPULSE_RETURN_POLL_SECONDS.length - 1) setAwaitingImpulses(false);
                });
        }, seconds * 1000));
        return () => {
            cancelled = true;
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [impulsePurchaseReturn, placeId, restoredDraft]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [offerRows, placementRows, itemRows, spotlightRows, pricingConfig, creditsBalance] = await Promise.all([
                    getBusinessOffers(placeId),
                    getPlaceSponsoredPlacements(placeId).catch(() => [] as SponsoredPlacement[]),
                    getPlaceItemsHealed(placeId).catch(() => [] as CanonicalPlaceItem[]),
                    getPlaceItemSpotlights(placeId).catch(() => [] as ItemSpotlight[]),
                    getSpotlightPricing().catch(() => DEFAULT_SPOTLIGHT_PRICING),
                    getPlaceSpotlightCredits(placeId).catch(() => 0),
                ]);
                if (!cancelled) {
                    setOffers(offerRows);
                    setPlacements(placementRows);
                    setItems(itemRows);
                    setSpotlights(spotlightRows);
                    setPricing(pricingConfig);
                    setSpotlightRadius((current) => {
                        const clamped = Math.max(pricingConfig.minRadiusKm, Math.min(pricingConfig.maxRadiusKm, current));
                        return Number((Math.round(clamped / SPOTLIGHT_RADIUS_STEP_KM) * SPOTLIGHT_RADIUS_STEP_KM).toFixed(1));
                    });
                    setSpotlightDaysInput((current) => String(Math.max(1, Math.min(pricingConfig.maxDays, Math.floor(Number(current)) || 1))));
                    setSpotlightIntensity((current) => Math.max(1, Math.min(pricingConfig.maxIntensity, current)));
                    setSpotlightCredits(creditsBalance);
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

    const spotlightDaysParsed = Math.floor(Number(spotlightDaysInput));
    const spotlightDaysValid = spotlightDaysInput.trim() !== '' && Number.isFinite(spotlightDaysParsed) && spotlightDaysParsed >= 1;
    const spotlightDays = Math.max(1, Math.min(pricing.maxDays, spotlightDaysValid ? spotlightDaysParsed : 1));
    const spotlightRadiusStepCount = spotlightRadiusSteps(pricing, spotlightRadius);
    const spotlightImpulses = computeSpotlightImpulses(pricing, {
        radiusKm: spotlightRadius,
        days: spotlightDays,
        intensity: spotlightIntensity,
    });
    const spotlightValueEur = impulsesPriceEur(pricing, spotlightImpulses);
    const spotlightCreditsUsed = Math.min(spotlightCredits, spotlightImpulses);
    const spotlightMissing = spotlightImpulses - spotlightCreditsUsed;
    const spotlightMissingEur = impulsesPriceEur(pricing, spotlightMissing);
    const spotlightTopUp = Math.max(spotlightMissing, pricing.minPurchaseImpulses);
    // Con la compra online abierta, la campaña se paga entera con saldo.
    const spotlightBlockedByBalance = BUSINESS_PRO_CHECKOUT_ENABLED && spotlightMissing > 0;

    const buyImpulses = async (key: string, purchase: { packIndex: number } | { impulses: number }) => {
        setBuyingImpulses(key);
        setMessage(null);
        try {
            const session = await createImpulsePackCheckoutSession(placeId, purchase);
            saveSpotlightDraft(placeId, {
                itemId: spotlightItemId,
                radiusKm: spotlightRadius,
                days: spotlightDays,
                intensity: spotlightIntensity,
                balanceBefore: spotlightCredits,
            });
            window.location.assign(session.url);
        } catch (error) {
            console.error('BusinessSponsoredSection: impulse checkout failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo iniciar la compra de impulsos.') });
            setBuyingImpulses(null);
        }
    };

    const requestSpotlight = async () => {
        if (!spotlightItemId) {
            setMessage({ type: 'error', text: 'Elige el plato que quieres destacar.' });
            return;
        }
        setRequestingSpotlight(true);
        setMessage(null);
        try {
            const result = await requestItemSpotlight({
                placeId,
                itemId: spotlightItemId,
                radiusKm: spotlightRadius,
                days: spotlightDays,
                intensity: spotlightIntensity,
            });
            setSpotlightItemId('');
            setSpotlights(await getPlaceItemSpotlights(placeId).catch(() => spotlights));
            setSpotlightCredits(await getPlaceSpotlightCredits(placeId).catch(() => Math.max(0, spotlightCredits - result.creditsUsed)));
            const used = result.creditsUsed > 0
                ? `Se han descontado ${result.creditsUsed.toLocaleString('es-ES')} impulsos de tu saldo. `
                : '';
            const pending = result.billedImpulses > 0
                ? `Quedan ${result.billedImpulses.toLocaleString('es-ES')} impulsos pendientes (${formatEur(result.totalPriceEur)}); te confirmaremos las condiciones antes de activarla. `
                : '';
            setMessage({ type: 'success', text: `Solicitud enviada. ${used}${pending}Un administrador la activará.` });
        } catch (error) {
            console.error('BusinessSponsoredSection: spotlight request failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo solicitar el plato destacado.') });
        } finally {
            setRequestingSpotlight(false);
        }
    };

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
                    <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-white/[0.03] p-4">
                        <div>
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Destacar un plato por cercanía</h3>
                            <p className="text-xs text-[var(--lt-text-muted)]">
                                Tu plato entra en el sorteo del carrusel de destacados cuando alguien está dentro del radio.
                                {' '}<strong>1 impulso = 0,2 km de radio durante 1 día</strong> ({pricing.pricePerImpulseEur.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 3 })}).
                                {' '}La intensidad multiplica tus papeletas frente a otros negocios de la zona: si nadie más compite allí, con ×1 ya sales siempre.
                            </p>
                        </div>
                        <Field label="Plato">
                            <select
                                className={inputClass}
                                value={spotlightItemId}
                                onChange={(event) => setSpotlightItemId(event.target.value)}
                            >
                                <option value="">Elige un elemento de tu carta...</option>
                                {items.map((item) => (
                                    <option key={item.id} value={item.id}>{item.canonicalName || item.id}</option>
                                ))}
                            </select>
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label={`Radio: ${spotlightRadius.toLocaleString('es-ES')} km`}>
                                <input
                                    type="range"
                                    min={pricing.minRadiusKm}
                                    max={pricing.maxRadiusKm}
                                    step={SPOTLIGHT_RADIUS_STEP_KM}
                                    value={spotlightRadius}
                                    onChange={(event) => setSpotlightRadius(Number(Number(event.target.value).toFixed(1)))}
                                    className="mt-3 w-full accent-[var(--lt-accent)]"
                                />
                            </Field>
                            <Field label="Días">
                                <input
                                    type="number"
                                    min={1}
                                    max={pricing.maxDays}
                                    className={inputClass}
                                    value={spotlightDaysInput}
                                    onChange={(event) => setSpotlightDaysInput(event.target.value)}
                                    onBlur={() => setSpotlightDaysInput(String(spotlightDays))}
                                />
                            </Field>
                            <Field label="Intensidad">
                                <select
                                    className={inputClass}
                                    value={spotlightIntensity}
                                    onChange={(event) => setSpotlightIntensity(Number(event.target.value) || 1)}
                                >
                                    {Array.from({ length: pricing.maxIntensity }, (_, i) => i + 1).map((intensity) => (
                                        <option key={intensity} value={intensity}>
                                            ×{intensity} {intensity === 1 ? '(normal)' : `(${intensity} papeletas)`}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                        <div className="space-y-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-[var(--lt-text-muted)]">
                                    {spotlightRadiusStepCount} tramos de 0,2 km × {spotlightDays} día{spotlightDays === 1 ? '' : 's'} × ×{spotlightIntensity}
                                    <span className="block text-sm font-black text-[var(--lt-text)]">
                                        {spotlightImpulses.toLocaleString('es-ES')} impulsos · {formatEur(spotlightValueEur)}
                                    </span>
                                </p>
                                <p className="text-right text-xs text-[var(--lt-text-muted)]">
                                    Tu saldo
                                    <span className="block text-sm font-black text-yellow-200">{spotlightCredits.toLocaleString('es-ES')} impulsos</span>
                                </p>
                            </div>
                            {spotlightMissing > 0 ? (
                                <p className="text-[11px] font-bold text-amber-200">
                                    Te faltan {spotlightMissing.toLocaleString('es-ES')} impulsos ({formatEur(spotlightMissingEur)}).
                                    {BUSINESS_PRO_CHECKOUT_ENABLED
                                        ? ' Compra lo que falta o un paquete y vuelve a solicitarla.'
                                        : ' La compra online aún no está abierta: puedes solicitarla igualmente y te confirmaremos las condiciones antes de activarla.'}
                                </p>
                            ) : (
                                <p className="text-[11px] text-emerald-300">Se descontarán de tu saldo al solicitarla.</p>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={requestSpotlight}
                                disabled={requestingSpotlight || !spotlightItemId || !spotlightDaysValid || spotlightBlockedByBalance}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-60"
                            >
                                {requestingSpotlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                Solicitar plato destacado
                            </button>
                            {BUSINESS_PRO_CHECKOUT_ENABLED && spotlightMissing > 0 && (
                                <button
                                    type="button"
                                    onClick={() => void buyImpulses('missing', { impulses: spotlightMissing })}
                                    disabled={buyingImpulses !== null || awaitingImpulses || !spotlightDaysValid}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-black text-amber-100 disabled:opacity-60"
                                >
                                    {buyingImpulses === 'missing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    Comprar {spotlightTopUp.toLocaleString('es-ES')} impulsos · {formatEur(impulsesPriceEur(pricing, spotlightTopUp))}
                                </button>
                            )}
                        </div>
                        {pricing.packs.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-xs font-black text-[var(--lt-text)]">
                                    Paquetes de impulsos {BUSINESS_PRO_CHECKOUT_ENABLED ? '' : '(próximamente)'}
                                </p>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    {pricing.packs.map((pack, index) => {
                                        const discount = packDiscountPercent(pricing, pack);
                                        return (
                                            <div key={pack.impulses} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                                                <p className="text-xs text-[var(--lt-text-muted)]">
                                                    <span className="block text-sm font-black text-[var(--lt-text)]">{pack.impulses.toLocaleString('es-ES')} impulsos</span>
                                                    {formatEur(pack.priceEur)}{discount > 0 ? ` · −${discount} %` : ''}
                                                </p>
                                                {BUSINESS_PRO_CHECKOUT_ENABLED && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void buyImpulses(`pack-${index}`, { packIndex: index })}
                                                        disabled={buyingImpulses !== null || awaitingImpulses}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--lt-accent)] px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
                                                    >
                                                        {buyingImpulses === `pack-${index}` && <Loader2 className="h-3 w-3 animate-spin" />}
                                                        Comprar
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {spotlights.length > 0 && (
                            <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                                {spotlights.map((spotlight) => {
                                    const meta = PLACEMENT_STATUS_META[spotlight.status];
                                    return (
                                        <div key={spotlight.id} className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-[var(--lt-text)]">{spotlight.itemName}</p>
                                                <p className="text-[11px] text-[var(--lt-text-muted)]">
                                                    ×{spotlight.units} · {spotlight.radiusKm} km
                                                    {spotlight.days ? ` · ${spotlight.days} día${spotlight.days === 1 ? '' : 's'}` : spotlight.weeks ? ` · ${spotlight.weeks} sem.` : ''}
                                                    {spotlight.impulses ? ` · ${spotlight.impulses.toLocaleString('es-ES')} impulsos` : ''}
                                                    {typeof spotlight.totalPriceEur === 'number' ? ` · ${formatEur(spotlight.totalPriceEur)}` : ''}
                                                    {spotlight.endsAt ? ` · hasta ${spotlight.endsAt}` : ''}
                                                </p>
                                                {spotlight.itemInactive && (
                                                    <p className="text-[11px] font-bold text-rose-300">🚫 Este plato ya no está en tu carta: la campaña está en pausa hasta que el equipo la revise.</p>
                                                )}
                                                {spotlight.adminNotes && <p className="text-[11px] text-[var(--lt-text-muted)]">Admin: {spotlight.adminNotes}</p>}
                                                {spotlight.status === 'active' && (
                                                    <p className="text-[11px] font-bold text-amber-300/80">
                                                        {spotlight.metrics.impressions} impresiones · {spotlight.metrics.clicks} clics · CTR {spotlight.metrics.impressions > 0 ? ((spotlight.metrics.clicks / spotlight.metrics.impressions) * 100).toFixed(1) : '0,0'}%
                                                    </p>
                                                )}
                                            </div>
                                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${meta.className}`}>
                                                {meta.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

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
                                                    {placement.status === 'active' && (
                                                        <p className="mt-0.5 text-[11px] font-bold text-cyan-300/80">
                                                            {placement.metrics.impressions} impresiones · {placement.metrics.clicks} clics · CTR {placement.metrics.impressions > 0 ? ((placement.metrics.clicks / placement.metrics.impressions) * 100).toFixed(1) : '0,0'}%
                                                        </p>
                                                    )}
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
    const [traffic, setTraffic] = useState<BusinessPlaceAnalyticsResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [reviewRows, itemRows, trafficRows] = await Promise.all([
                    getPlaceReviewsForManager(placeId).catch(() => [] as ManagerPlaceReview[]),
                    getCanonicalPlaceItems(placeId).catch(() => [] as CanonicalPlaceItem[]),
                    getBusinessPlaceAnalytics(placeId, 30).catch(() => null),
                ]);
                if (!cancelled) {
                    setReviews(reviewRows);
                    setItems(itemRows);
                    setTraffic(trafficRows);
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

        const pageDaily = traffic?.page.daily || [];
        const relatedDaily = traffic?.relatedDaily || [];
        const pageViews = pageDaily.reduce((sum, row) => sum + row.totalViews, 0);
        const uniqueSessions = pageDaily.reduce((sum, row) => sum + row.uniqueSessions, 0);
        const relatedShares = relatedDaily.reduce((sum, row) => sum + row.totalShares, 0);
        const shareChannels = relatedDaily.reduce<Record<string, number>>((totals, row) => {
            Object.entries(row.byShareChannel).forEach(([channel, count]) => {
                totals[channel] = (totals[channel] || 0) + count;
            });
            return totals;
        }, {});
        const shareEntityTypes = relatedDaily.reduce<Record<string, number>>((totals, row) => {
            Object.entries(row.byShareEntityType).forEach(([entityType, count]) => {
                totals[entityType] = (totals[entityType] || 0) + count;
            });
            return totals;
        }, {});

        return { total: reviews.length, average, monthly, maxCount, topItems, pageViews, uniqueSessions, relatedShares, shareChannels, shareEntityTypes };
    }, [reviews, items, traffic]);

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
            text="Resumen de la actividad de la comunidad en tu local: valoraciones, evolución de la nota y elementos más valorados."
            icon={BarChart3}
        >
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                    <p className="text-3xl font-black text-[var(--lt-text)]">{stats.total}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Valoraciones recibidas</p>
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

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-4 text-center">
                    <p className="text-3xl font-black text-[var(--lt-text)]">{stats.pageViews.toLocaleString('es-ES')}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Vistas de la ficha · 30 días</p>
                </div>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-4 text-center">
                    <p className="text-3xl font-black text-[var(--lt-text)]">{stats.uniqueSessions.toLocaleString('es-ES')}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Sesiones únicas · 30 días</p>
                </div>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-4 text-center">
                    <p className="flex items-center justify-center gap-2 text-3xl font-black text-[var(--lt-text)]"><Share2 className="h-5 w-5 text-violet-300" />{stats.relatedShares.toLocaleString('es-ES')}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Compartidos relacionados · 30 días</p>
                </div>
            </div>

            {Object.keys(stats.shareChannels).length > 0 && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Cómo se ha compartido</h3>
                        <StatBreakdown values={stats.shareChannels} labels={BUSINESS_SHARE_CHANNEL_LABELS} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Qué contenido relacionado se comparte</h3>
                        <StatBreakdown values={stats.shareEntityTypes} labels={BUSINESS_SHARE_ENTITY_LABELS} />
                    </div>
                </div>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-4 text-sm font-black text-[var(--lt-text)]">Valoraciones por mes (últimos 6 meses)</h3>
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
                    <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Elementos con más valoraciones</h3>
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
                                    <span className="text-xs text-[var(--lt-text-muted)]">{item.stats?.reviewCount || 0} valoraciones</span>
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

const StatBreakdown: React.FC<{ values: Record<string, number>; labels: Record<string, string> }> = ({ values, labels }) => (
    <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(values).sort((a, b) => b[1] - a[1]).map(([key, count]) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <span className="text-[var(--lt-text-muted)]">{labels[key] || key}</span>
                <strong className="text-[var(--lt-text)]">{count.toLocaleString('es-ES')}</strong>
            </div>
        ))}
    </div>
);
