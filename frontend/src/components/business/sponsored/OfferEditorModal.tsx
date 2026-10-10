/**
 * Crear o editar una oferta (spec §8 «🎁 Ofertas»): a la izquierda el
 * formulario (tipo de oferta, título con emoji, descripción, condiciones en
 * chips, fechas, enlace y estado); a la derecha «👀 Así la verán».
 *
 *   <OfferEditorModal open placeId={id} mode="create" initial={draft} templateKey="2x1"
 *     canCreate={offers.length < MAX_OFFERS} onClose={close} onSaved={(offer, mode) => …} />
 *
 * Guarda con saveBusinessOffer y entrega lo que guardó el servidor. Los errores
 * salen en el pie, junto al botón. Cerrar con cambios pide confirmación.
 */
import React, { useId, useRef, useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { useConfirm } from '../../../context/ConfirmContext';
import { cn } from '../../../lib/utils';
import { saveBusinessOffer, type BusinessOffer, type BusinessOfferData } from '../../../services/BusinessProService';
import {
    businessErrorCopy,
    ChoiceCards,
    Disclosure,
    EmojiChip,
    kit,
    QuickDateRange,
    StatusPill,
    TextAreaField,
    TextField,
    useDirtyState,
    useReportDirty,
    type ChoiceOption,
} from '../kit';
import { PlaceOfferCard } from './PlaceOfferCard';
import {
    cleanOfferData,
    computeOfferStatus,
    CONDITION_CHIPS,
    formatShortDate,
    hasCondition,
    isValidOfferUrl,
    MAX_OFFER_CONDITIONS,
    MAX_OFFER_DESCRIPTION,
    MAX_OFFER_TITLE,
    MAX_OFFER_URL,
    MAX_OFFERS,
    OFFER_TEMPLATES,
    OFFER_TITLE_EMOJI,
    offerTemplate,
    publicToday,
    splitLeadingEmoji,
    toggleCondition,
    withLeadingEmoji,
} from './sponsoredMeta';

export type OfferEditorMode = 'create' | 'edit';

export interface OfferEditorModalProps {
    open: boolean;
    placeId: string;
    mode: OfferEditorMode;
    /** Oferta que se edita (modo edit). */
    offerId?: string;
    initial: BusinessOfferData;
    /** Baldosa de «¿Qué tipo de oferta?» marcada al abrir. */
    templateKey?: string | null;
    /** false cuando ya hay MAX_OFFERS ofertas (solo afecta a crear). */
    canCreate: boolean;
    onClose: () => void;
    onSaved: (offer: BusinessOffer, mode: OfferEditorMode) => void;
}

export const OfferEditorModal: React.FC<OfferEditorModalProps> = (props) => {
    if (!props.open) return null;
    return <OfferEditorForm {...props} />;
};

const TEMPLATE_OPTIONS: ChoiceOption<string>[] = OFFER_TEMPLATES.map((template) => ({
    value: template.key,
    emoji: template.emoji,
    title: template.label,
}));

const STATUS_OPTIONS: ChoiceOption<BusinessOfferData['status']>[] = [
    { value: 'draft', emoji: '📝', title: 'Borrador' },
    { value: 'active', emoji: '🟢', title: 'Publicar' },
];

const previewNote = (form: BusinessOfferData, today: string): string => {
    switch (computeOfferStatus(form, today)) {
        case 'draft':
            return '📝 Es un borrador: no se verá hasta que la publiques.';
        case 'scheduled':
            return `🗓️ Se verá a partir del ${formatShortDate(form.startsAt)}.`;
        case 'expired':
            return '⌛ Con estas fechas ya no se vería: cambia el final.';
        default:
            return '🟢 Se verá en tu ficha en cuanto la guardes.';
    }
};

const OfferPreview: React.FC<{ form: BusinessOfferData; today: string }> = ({ form, today }) => (
    <div className="space-y-3">
        <div className="rounded-2xl border border-[var(--lt-promo)]/30 bg-[var(--lt-card-strong)] p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
                <span aria-hidden="true">📣</span>
                <p className="text-sm font-bold text-[var(--lt-text)]">Ofertas</p>
                <StatusPill label="Patrocinado" tone="promo" size="sm" className="ml-auto" />
            </div>
            <PlaceOfferCard
                preview
                offer={{
                    title: form.title.trim() || 'Tu oferta',
                    description: form.description.trim(),
                    conditions: form.conditions.trim(),
                    ctaUrl: form.ctaUrl.trim(),
                    startsAt: form.startsAt,
                    endsAt: form.endsAt,
                }}
            />
        </div>
        <p className="text-sm text-[var(--lt-text-muted)]">{previewNote(form, today)}</p>
    </div>
);

const OfferEditorForm: React.FC<OfferEditorModalProps> = ({
    placeId,
    mode,
    offerId,
    initial,
    templateKey: initialTemplateKey,
    canCreate,
    onClose,
    onSaved,
}) => {
    const confirm = useConfirm();
    const emojiPanelId = useId();
    const [form, setForm] = useState<BusinessOfferData>(initial);
    const [templateKey, setTemplateKey] = useState<string | null>(initialTemplateKey ?? null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [today] = useState(() => publicToday());

    const { dirty } = useDirtyState(initial, form);
    useReportDirty('promos:offer', dirty, '🎁 la oferta');

    const patch = (next: Partial<BusinessOfferData>) => {
        setForm((prev) => ({ ...prev, ...next }));
        setError(null);
    };

    const urlOk = isValidOfferUrl(form.ctaUrl);
    const datesOk = !(form.startsAt && form.endsAt && form.endsAt < form.startsAt);
    const invalidReason = !form.title.trim()
        ? 'Ponle un título a la oferta'
        : !urlOk
            ? 'Revisa el enlace'
            : !datesOk
                ? 'La fecha de fin va antes que la de inicio'
                : mode === 'create' && !canCreate
                    ? `Ya tienes ${MAX_OFFERS} ofertas: borra alguna antigua para crear otra`
                    : null;
    const canSave = !invalidReason && !saving && (mode === 'create' || dirty);

    const requestClose = async () => {
        if (savingRef.current) return;
        if (dirty) {
            const leave = await confirm({
                title: '¿Salir sin guardar?',
                message: 'Perderás los cambios en esta oferta.',
                confirmLabel: 'Salir',
                destructive: true,
            });
            if (!leave) return;
        }
        onClose();
    };

    const save = async () => {
        if (!canSave || savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setError(null);
        try {
            const saved = await saveBusinessOffer(placeId, cleanOfferData(form), mode === 'edit' ? offerId : undefined);
            onSaved({ id: saved.offerId, ...saved.data }, mode);
        } catch (err) {
            console.error('OfferEditorModal: save failed', err);
            setError(businessErrorCopy(err, '😕 No se pudo guardar la oferta.').message);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const pickTemplate = (key: string) => {
        setTemplateKey(key);
        const template = offerTemplate(key);
        if (template) patch({ title: template.title });
    };

    const titleEmoji = splitLeadingEmoji(form.title).emoji;

    const footer = (
        <div className="space-y-2">
            {error && (
                <p role="alert" className="rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">{error}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-[9rem] flex-1 text-sm text-[var(--lt-text-muted)]" aria-live="polite">
                    {invalidReason
                        ? <><span aria-hidden="true">✋ </span>{invalidReason}</>
                        : mode === 'edit' && !dirty
                            ? 'Sin cambios'
                            : dirty ? <span className="text-[var(--lt-warning)]"><span aria-hidden="true">● </span>Cambios sin guardar</span> : null}
                </p>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Button variant="ghost" onClick={() => void requestClose()} disabled={saving} className="min-h-11 hover:bg-[var(--lt-glass)]">
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={() => void save()} disabled={!canSave} loading={saving} className="min-h-11">
                        {mode === 'create' ? '🎁 Crear oferta' : '💾 Guardar cambios'}
                    </Button>
                </div>
            </div>
        </div>
    );

    return (
        <Modal
            isOpen
            onClose={() => void requestClose()}
            size="xl"
            title={<span><span aria-hidden="true">{mode === 'create' ? '🎁 ' : '✏️ '}</span>{mode === 'create' ? 'Nueva oferta' : 'Editar oferta'}</span>}
            footer={footer}
        >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-6">
                    {mode === 'create' && (
                        <ChoiceCards
                            legend="¿Qué tipo de oferta?"
                            help="Te dejamos el título escrito; cámbialo a tu gusto."
                            options={TEMPLATE_OPTIONS}
                            value={templateKey}
                            onChange={pickTemplate}
                            variant="swatch"
                            columns={5}
                        />
                    )}

                    <div className="space-y-2">
                        <TextField
                            label="✏️ Título"
                            value={form.title}
                            onChange={(title) => patch({ title })}
                            max={MAX_OFFER_TITLE}
                            placeholder="🍻 2x1 en cañas los jueves"
                            labelAside={(
                                <button
                                    type="button"
                                    aria-expanded={emojiOpen}
                                    aria-controls={emojiPanelId}
                                    aria-label="Elegir el emoji del título"
                                    title="Elegir el emoji del título"
                                    onClick={() => setEmojiOpen((value) => !value)}
                                    className={cn(
                                        'grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-xl leading-none transition-colors',
                                        kit.focus,
                                        emojiOpen ? kit.selected : kit.idle,
                                    )}
                                >
                                    <span aria-hidden="true">{titleEmoji || '😀'}</span>
                                </button>
                            )}
                        />
                        {emojiOpen && (
                            <div id={emojiPanelId} role="group" aria-label="Emoji del título" className={cn(kit.inset, 'flex flex-wrap gap-1 p-2')}>
                                {OFFER_TITLE_EMOJI.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        aria-label={`Poner ${emoji}`}
                                        aria-pressed={titleEmoji === emoji}
                                        onClick={() => {
                                            patch({ title: withLeadingEmoji(form.title, emoji) });
                                            setEmojiOpen(false);
                                        }}
                                        className={cn(
                                            'grid h-11 w-11 place-items-center rounded-xl text-xl leading-none transition-colors hover:bg-[var(--lt-accent-soft)]',
                                            kit.focus,
                                            titleEmoji === emoji && 'bg-[var(--lt-accent-soft)]',
                                        )}
                                    >
                                        <span aria-hidden="true">{emoji}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <TextAreaField
                        label="📝 Descripción"
                        value={form.description}
                        onChange={(description) => patch({ description })}
                        max={MAX_OFFER_DESCRIPTION}
                        rows={3}
                        placeholder="Cuenta en qué consiste y por qué merece la pena."
                    />

                    <TextAreaField
                        label="📜 Condiciones"
                        value={form.conditions}
                        onChange={(conditions) => patch({ conditions })}
                        max={MAX_OFFER_CONDITIONS}
                        rows={2}
                        hint="Toca las que apliquen o escribe las tuyas."
                        placeholder="Solo en barra · No acumulable"
                        labelAside={(
                            <div role="group" aria-label="Condiciones rápidas" className="flex flex-wrap gap-2">
                                {CONDITION_CHIPS.map((chip) => {
                                    const selected = hasCondition(form.conditions, chip.text);
                                    const next = toggleCondition(form.conditions, chip.text);
                                    return (
                                        <EmojiChip
                                            key={chip.text}
                                            emoji={chip.emoji}
                                            label={chip.text}
                                            size="sm"
                                            selected={selected}
                                            disabled={!selected && next === null}
                                            title={!selected && next === null ? 'No cabe: las condiciones tienen 300 caracteres como máximo' : undefined}
                                            onToggle={() => {
                                                if (next !== null) patch({ conditions: next });
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    />

                    <div className="space-y-2">
                        <QuickDateRange
                            legend="📅 ¿Cuándo?"
                            start={form.startsAt}
                            end={form.endsAt}
                            onChange={({ start, end }) => patch({ startsAt: start, endsAt: end })}
                            allowOpenEnd
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-[var(--lt-text-muted)]">Fuera de estas fechas no se muestra, aunque esté publicada.</p>
                            {(form.startsAt || form.endsAt) && (
                                <button
                                    type="button"
                                    onClick={() => patch({ startsAt: '', endsAt: '' })}
                                    className={cn('min-h-11 rounded-lg px-1 text-sm font-semibold text-[var(--lt-text-muted)] underline-offset-4 hover:text-[var(--lt-text)] hover:underline', kit.focus)}
                                >
                                    Quitar fechas
                                </button>
                            )}
                        </div>
                    </div>

                    <TextField
                        label="🔗 Enlace (opcional)"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        value={form.ctaUrl}
                        onChange={(ctaUrl) => patch({ ctaUrl })}
                        max={MAX_OFFER_URL}
                        placeholder="https://tuweb.com/oferta"
                        hint="Sale como «Más información» debajo de la oferta."
                        error={urlOk ? undefined : '✋ Este enlace no parece válido'}
                    />

                    <ChoiceCards
                        legend="Estado"
                        options={STATUS_OPTIONS}
                        value={form.status}
                        onChange={(status) => patch({ status })}
                        variant="compact"
                    />

                    <Disclosure emoji="👀" title="Ver cómo queda" className="lg:hidden">
                        <OfferPreview form={form} today={today} />
                    </Disclosure>
                </div>

                <aside aria-label="Así la verán" className="hidden lg:block">
                    <div className="sticky top-0 space-y-3">
                        <p className="text-sm font-black text-[var(--lt-text)]"><span aria-hidden="true">👀 </span>Así la verán</p>
                        <OfferPreview form={form} today={today} />
                    </div>
                </aside>
            </div>
        </Modal>
    );
};
