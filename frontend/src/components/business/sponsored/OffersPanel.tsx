/**
 * 🎁 Ofertas: los cupones del negocio, «＋ Nueva oferta» con plantillas,
 * publicar o despublicar con un interruptor, duplicar y borrar (con useConfirm).
 *
 *   <OffersPanel placeId={placeId} offers={data.offers} />
 *
 * La lista usa lo que guarda el servidor (S4) y el estado real de cada oferta
 * según sus fechas (S3). Errores junto a la oferta o en el editor (S1).
 */
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import {
    deleteBusinessOffer,
    EMPTY_OFFER_DATA,
    saveBusinessOffer,
    type BusinessOffer,
    type BusinessOfferData,
} from '../../../services/BusinessProService';
import { businessErrorCopy, EmptyState, launchConfetti, PanelError, SectionHeader, StatusPill } from '../kit';
import { OfferCouponCard } from './OfferCouponCard';
import { OfferEditorModal, type OfferEditorMode } from './OfferEditorModal';
import {
    cleanOfferData,
    computeOfferStatus,
    MAX_OFFER_TITLE,
    MAX_OFFERS,
    offerData,
    offerTemplate,
    publicToday,
    sortOffers,
    splitLeadingEmoji,
    STARTER_TEMPLATE_KEYS,
} from './sponsoredMeta';
import type { Loadable } from './useSponsoredData';

export interface OffersPanelProps {
    placeId: string;
    offers: Loadable<BusinessOffer[]>;
}

interface EditorState {
    mode: OfferEditorMode;
    offerId?: string;
    initial: BusinessOfferData;
    templateKey: string | null;
}

const savedMessage = (offer: BusinessOfferData, today: string): string => {
    switch (computeOfferStatus(offer, today)) {
        case 'live':
            return 'Ya se ve en tu ficha.';
        case 'scheduled':
            return 'Se verá en tu ficha cuando llegue la fecha.';
        case 'expired':
            return 'Ojo: con esas fechas ya no se ve.';
        default:
            return 'Guardada como borrador: no se ve hasta que la publiques.';
    }
};

const SkeletonCoupons: React.FC = () => (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Cargando tus ofertas">
        {[0, 1].map((index) => (
            <div key={index} className="flex h-36 overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)]">
                <div className="w-16 animate-pulse bg-[var(--lt-glass)] sm:w-20" />
                <div className="flex-1 space-y-3 p-4">
                    <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--lt-glass)]" />
                    <div className="h-5 w-3/4 animate-pulse rounded-lg bg-[var(--lt-glass)]" />
                    <div className="h-4 w-1/2 animate-pulse rounded-lg bg-[var(--lt-glass)]" />
                </div>
            </div>
        ))}
    </div>
);

export const OffersPanel: React.FC<OffersPanelProps> = ({ placeId, offers }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
    const [today] = useState(() => publicToday());

    const count = offers.data.length;
    const full = count >= MAX_OFFERS;

    const setCardError = (offerId: string, message: string | null) => setCardErrors((prev) => {
        if (!message) {
            if (!(offerId in prev)) return prev;
            const next = { ...prev };
            delete next[offerId];
            return next;
        }
        return { ...prev, [offerId]: message };
    });

    const openCreate = (templateKey?: string) => {
        const template = templateKey ? offerTemplate(templateKey) : undefined;
        setEditor({
            mode: 'create',
            initial: { ...EMPTY_OFFER_DATA, status: 'active', title: template?.title ?? '' },
            templateKey: template?.key ?? null,
        });
    };

    const openEdit = (offer: BusinessOffer) => {
        setCardError(offer.id, null);
        setEditor({ mode: 'edit', offerId: offer.id, initial: offerData(offer), templateKey: null });
    };

    const duplicate = (offer: BusinessOffer) => {
        const copyTitle = `${offer.title} (copia)`.slice(0, MAX_OFFER_TITLE);
        setEditor({ mode: 'create', initial: { ...offerData(offer), title: copyTitle, status: 'draft' }, templateKey: null });
    };

    const handleSaved = (offer: BusinessOffer, mode: OfferEditorMode) => {
        offers.setData((prev) => sortOffers(
            mode === 'edit'
                ? prev.map((row) => (row.id === offer.id ? offer : row))
                : [...prev.filter((row) => row.id !== offer.id), offer],
        ));
        setCardError(offer.id, null);
        setEditor(null);
        if (mode === 'create') launchConfetti();
        showToast({
            variant: 'success',
            title: mode === 'create' ? '🎁 ¡Oferta creada!' : '✅ Oferta guardada',
            message: savedMessage(offer, today),
        });
    };

    const togglePublished = async (offer: BusinessOffer, published: boolean) => {
        if (busyId) return;
        setBusyId(offer.id);
        setCardError(offer.id, null);
        try {
            const saved = await saveBusinessOffer(
                placeId,
                cleanOfferData({ ...offerData(offer), status: published ? 'active' : 'draft' }),
                offer.id,
            );
            const next: BusinessOffer = { id: saved.offerId, ...saved.data };
            offers.setData((prev) => sortOffers(prev.map((row) => (row.id === offer.id ? next : row))));
            showToast({
                variant: 'success',
                title: published ? '🟢 Oferta publicada' : '📝 Oferta en borrador',
                message: savedMessage(next, today),
            });
        } catch (error) {
            console.error('OffersPanel: publish toggle failed', error);
            setCardError(offer.id, businessErrorCopy(error, '😕 No se pudo cambiar la oferta.').message);
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (offer: BusinessOffer) => {
        if (busyId) return;
        const title = splitLeadingEmoji(offer.title).text || offer.title;
        const ok = await confirm({
            title: '¿Eliminar la oferta?',
            message: `«${title}» desaparecerá de tu ficha. No se puede deshacer.`,
            confirmLabel: 'Eliminar',
            destructive: true,
        });
        if (!ok) return;
        setBusyId(offer.id);
        setCardError(offer.id, null);
        try {
            await deleteBusinessOffer(placeId, offer.id);
            offers.setData((prev) => prev.filter((row) => row.id !== offer.id));
            showToast({ variant: 'success', title: '🗑️ Oferta eliminada', message: `«${title}» ya no sale en tu ficha.` });
        } catch (error) {
            console.error('OffersPanel: delete failed', error);
            setCardError(offer.id, businessErrorCopy(error, '😕 No se pudo eliminar la oferta.').message);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section aria-labelledby="promos-offers-title" className="space-y-4">
            <SectionHeader
                as="h3"
                id="promos-offers-title"
                emoji="🎁"
                title="Ofertas"
                help="Gratis con Pro. Salen en tu ficha con la etiqueta Patrocinado."
            />

            {offers.status === 'ready' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <StatusPill
                        label={`${count}/${MAX_OFFERS} ofertas`}
                        tone={full ? 'warning' : 'neutral'}
                        title={full ? 'Has llegado al máximo: borra alguna antigua para crear otra' : undefined}
                    />
                    <Button
                        variant="primary"
                        onClick={() => openCreate()}
                        disabled={full}
                        leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                        className="min-h-11"
                    >
                        Nueva oferta
                    </Button>
                </div>
            )}

            {offers.status === 'loading' && <SkeletonCoupons />}
            {offers.status === 'error' && <PanelError what="tus ofertas" onRetry={offers.reload} />}
            {offers.status === 'ready' && count === 0 && (
                <EmptyState
                    emoji="🎟️"
                    title="Aún no tienes ofertas"
                    text="Una buena promo trae gente nueva. Empieza por una de estas:"
                    actions={STARTER_TEMPLATE_KEYS.map((key) => {
                        const template = offerTemplate(key);
                        if (!template) return null;
                        return (
                            <Button
                                key={key}
                                variant="secondary"
                                onClick={() => openCreate(key)}
                                className="min-h-11 border-[var(--lt-border-strong)] bg-[var(--lt-glass)] hover:bg-[var(--lt-accent-soft)]"
                            >
                                <span aria-hidden="true">{template.emoji}</span>
                                {template.label}
                            </Button>
                        );
                    })}
                />
            )}
            {offers.status === 'ready' && count > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {offers.data.map((offer) => (
                        <OfferCouponCard
                            key={offer.id}
                            offer={offer}
                            today={today}
                            busy={busyId === offer.id}
                            error={cardErrors[offer.id]}
                            canDuplicate={!full}
                            onTogglePublished={(published) => void togglePublished(offer, published)}
                            onEdit={() => openEdit(offer)}
                            onDuplicate={() => duplicate(offer)}
                            onDelete={() => void remove(offer)}
                        />
                    ))}
                </div>
            )}
            {full && offers.status === 'ready' && (
                <p className="text-sm text-[var(--lt-text-muted)]">
                    <span aria-hidden="true">✋ </span>Has llegado a {MAX_OFFERS} ofertas: borra alguna antigua para crear otra.
                </p>
            )}

            {editor && (
                <OfferEditorModal
                    open
                    placeId={placeId}
                    mode={editor.mode}
                    offerId={editor.offerId}
                    initial={editor.initial}
                    templateKey={editor.templateKey}
                    canCreate={!full}
                    onClose={() => setEditor(null)}
                    onSaved={handleSaved}
                />
            )}
        </section>
    );
};
