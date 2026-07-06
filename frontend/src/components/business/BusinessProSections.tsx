import React, { useEffect, useState } from 'react';
import {
    Check,
    Image as ImageIcon,
    Loader2,
    Megaphone,
    Pencil,
    Save,
    Sparkles,
    Tags,
    Trash2,
} from 'lucide-react';
import { getCanonicalPlaceItems, type CanonicalPlaceItem } from '../../services/CanonicalItemService';
import {
    deleteBusinessOffer,
    EMPTY_ITEM_BUSINESS_DATA,
    EMPTY_OFFER_DATA,
    EMPTY_VISUAL_DATA,
    getBusinessOffers,
    getBusinessVisual,
    saveBusinessOffer,
    updateBusinessVisual,
    updateCanonicalItemBusinessData,
    type BusinessOffer,
    type BusinessOfferData,
    type BusinessVisualData,
    type BusinessVisualStyle,
    type ItemBusinessData,
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

export const BusinessItemsSection: React.FC<{ placeId: string }> = ({ placeId }) => {
    const [items, setItems] = useState<CanonicalPlaceItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<ItemBusinessData>(EMPTY_ITEM_BUSINESS_DATA);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<Message>(null);

    useEffect(() => {
        let cancelled = false;
        const loadItems = async () => {
            setLoadingItems(true);
            try {
                const rows = await getCanonicalPlaceItems(placeId);
                if (!cancelled) setItems(rows);
            } catch (error) {
                console.error('BusinessItemsSection: failed loading canonical items', error);
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoadingItems(false);
            }
        };
        void loadItems();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    const selectedItem = items.find((item) => item.id === selectedId) || null;

    const selectItem = (item: CanonicalPlaceItem) => {
        setSelectedId(item.id);
        setForm(itemBusinessDataFrom(item));
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

    return (
        <ProSectionShell
            title="Elementos, carta y grupos"
            text="La base son los elementos valorados por la comunidad; el negocio los enriquece con su ficha oficial (grupo, precio, descripción). Los nombres y estadísticas comunitarias no se tocan."
            icon={Tags}
        >
            <div className="grid gap-5 lg:grid-cols-[1fr,1.1fr]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-4">
                        <h3 className="text-sm font-black text-[var(--lt-text)]">Elementos comunitarios</h3>
                        <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Toca un elemento para editar su ficha oficial.</p>
                    </div>

                    {loadingItems ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                            Cargando elementos...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                            Todavía no hay elementos canónicos persistidos. Se generarán cuando entren reseñas con elementos en este lugar.
                        </div>
                    ) : (
                        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                            {items.map((item) => {
                                const hasOfficialData = Boolean((item.businessData as Record<string, unknown> | undefined)?.price
                                    || (item.businessData as Record<string, unknown> | undefined)?.group);
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
                                                    {(item.stats?.reviewCount || 0)} reseñas
                                                    {typeof item.stats?.averageRating === 'number' ? ` · ${item.stats.averageRating.toFixed(2)}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                {hasOfficialData && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-200">
                                                        <Check className="h-3 w-3" />
                                                        Ficha
                                                    </span>
                                                )}
                                                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[10px] font-black uppercase text-[var(--lt-text-muted)]">
                                                    {item.linkedListIds?.length || 0} listas
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                        <h3 className="text-sm font-black text-[var(--lt-text)]">Ficha oficial del elemento</h3>
                        <p className="text-xs text-[var(--lt-text-muted)]">
                            {selectedItem
                                ? `Editando: ${selectedItem.canonicalName || selectedItem.id}`
                                : 'Selecciona un elemento de la lista para editar su ficha.'}
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
                            <Field label="Descuento / promoción">
                                <input
                                    className={inputClass}
                                    value={form.discount}
                                    onChange={(event) => setForm({ ...form, discount: event.target.value })}
                                    placeholder="2x1, -20%, happy hour..."
                                />
                            </Field>
                            <Field label="Ingredientes">
                                <input
                                    className={inputClass}
                                    value={form.ingredients}
                                    onChange={(event) => setForm({ ...form, ingredients: event.target.value })}
                                    placeholder="Queso crema, galleta, frutos rojos..."
                                />
                            </Field>
                            <Field label="Descripción">
                                <textarea
                                    className={`${inputClass} min-h-24`}
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
                            <div className="flex flex-wrap items-center gap-3">
                                <SaveButton saving={saving} onClick={save} label="Guardar ficha" />
                                <span className="text-xs text-[var(--lt-text-muted)]">
                                    Los merges o cambios de nombre pasarán por revisión admin (próximamente).
                                </span>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-10 text-center text-sm text-[var(--lt-text-muted)]">
                            <Tags className="mx-auto mb-2 h-6 w-6 text-[var(--lt-accent)]" />
                            Ningún elemento seleccionado.
                        </div>
                    )}
                </div>
            </div>
        </ProSectionShell>
    );
};

const formatOfferDates = (offer: BusinessOffer): string | null => {
    if (offer.startsAt && offer.endsAt) return `${offer.startsAt} → ${offer.endsAt}`;
    if (offer.endsAt) return `hasta ${offer.endsAt}`;
    if (offer.startsAt) return `desde ${offer.startsAt}`;
    return null;
};

export const BusinessSponsoredSection: React.FC<{ placeId: string }> = ({ placeId }) => {
    const [offers, setOffers] = useState<BusinessOffer[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<BusinessOfferData>(EMPTY_OFFER_DATA);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [message, setMessage] = useState<Message>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const rows = await getBusinessOffers(placeId);
                if (!cancelled) setOffers(rows);
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

    return (
        <ProSectionShell
            title="Contenido patrocinado"
            text="Ofertas y promociones del local, siempre marcadas como patrocinadas y separadas de valoraciones y rankings orgánicos."
            icon={Megaphone}
        >
            <div className="grid gap-5 lg:grid-cols-[1fr,1.1fr]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-4">
                        <h3 className="text-sm font-black text-[var(--lt-text)]">Ofertas del local</h3>
                        <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Las ofertas en estado borrador no se muestran públicamente.</p>
                    </div>
                    {loading ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                            Cargando ofertas...
                        </div>
                    ) : offers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                            Aún no hay ofertas. Crea la primera con el formulario.
                        </div>
                    ) : (
                        <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
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
                                                {offer.description && <p className="mt-1 truncate text-xs text-[var(--lt-text-muted)]">{offer.description}</p>}
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

                    <p className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-[var(--lt-text-muted)]">
                        Próximamente: lugar destacado en búsquedas y listas patrocinadas, siempre con etiqueta visible de promocionado.
                    </p>
                </div>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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
                            className={`${inputClass} min-h-20`}
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
                    <SectionMessage message={message} />
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
        </ProSectionShell>
    );
};
