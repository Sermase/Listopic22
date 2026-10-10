/**
 * 📣 Promos («Hazte ver», spec §8): monedero de impulsos y cuatro subpestañas
 * sincronizadas con `?sub=` (🎁 Ofertas · 🍽️ Plato estrella · 🗺️ Portada y
 * mapa · 📈 Resultados).
 *
 *   <BusinessSponsoredSection placeId={placeId} placeName={place.name}
 *     placePhotoUrl={photo} placeAddress={address} onGoToTab={goToTab} />
 *
 * URL: `?sub=plato&item={id}` abre el asistente con ese plato (Carta →
 * «📣 Impulsar»); `?impulsos=ok|cancelado` (vuelta de Stripe) abre 🍽️ Plato
 * estrella en el paso ③ con la campaña que se estaba preparando. Los cambios
 * de subpestaña conservan el resto de parámetros (tab, section…).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../../ui/Tabs';
import { formatEur } from '../../../config/planBeta';
import { useToast } from '../../../context/ToastContext';
import type { ItemSpotlightRequestResult } from '../../../services/BusinessProService';
import { ChoiceCards, launchConfetti, SectionHeader, SoftCard, useReportDirty, type ChoiceOption } from '../kit';
import { CampaignsTimeline } from './CampaignsTimeline';
import { ImpulsePacksModal } from './ImpulsePacksModal';
import { ImpulseWalletBar } from './ImpulseWalletBar';
import { OffersPanel } from './OffersPanel';
import { PlacementPanel } from './PlacementPanel';
import { SpotlightWizard } from './SpotlightWizard';
import {
    clampPlan,
    computeOfferStatus,
    DEFAULT_SPOTLIGHT_PLAN,
    EMPTY_PLACEMENT_DRAFT,
    formatCount,
    parsePromoSub,
    PROMO_SUBS,
    publicToday,
    type PlacementDraft,
    type PromoSub,
    type SpotlightPlan,
} from './sponsoredMeta';
import { useImpulseWallet } from './useImpulseWallet';
import { usePlacePreview } from './usePlacePreview';
import { useSponsoredData } from './useSponsoredData';

export type BusinessManageTabId = 'general' | 'visual' | 'items' | 'sponsored' | 'stats';

export interface BusinessSponsoredSectionProps {
    placeId: string;
    placeName?: string;
    placePhotoUrl?: string;
    placeAddress?: string;
    /** Ir a otra pestaña de la gestión (p. ej. «📖 Ir a la carta»). Sin él, se cambia ?tab=. */
    onGoToTab?: (tab: BusinessManageTabId) => void;
}

const PICKER_OPTIONS: ChoiceOption<PromoSub>[] = [
    {
        value: 'ofertas',
        title: 'Lanzar una promo',
        subtitle: '2x1, happy hour, postre gratis…',
        preview: <span aria-hidden="true" className="block text-[56px] leading-none">🎁</span>,
    },
    {
        value: 'plato',
        title: 'Que vean tu mejor plato',
        subtitle: 'Aparece en el carrusel a quien esté cerca',
        preview: <span aria-hidden="true" className="block text-[56px] leading-none">🍽️</span>,
    },
    {
        value: 'campanas',
        title: 'Salir en portada o en el mapa',
        subtitle: 'Lo revisa un administrador',
        preview: <span aria-hidden="true" className="block text-[56px] leading-none">🗺️</span>,
    },
];

const TAB_OPTIONS = PROMO_SUBS.map((entry) => ({
    value: entry.value,
    label: <><span aria-hidden="true">{entry.emoji}</span> {entry.label}</>,
}));

export const BusinessSponsoredSection: React.FC<BusinessSponsoredSectionProps> = ({
    placeId,
    placeName,
    placePhotoUrl,
    placeAddress,
    onGoToTab,
}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { showToast } = useToast();
    // Vuelta de Stripe tras comprar impulsos: se lee una vez y se quita de la URL.
    const [purchaseReturn] = useState<string | null>(() => searchParams.get('impulsos'));
    const wallet = useImpulseWallet(placeId, purchaseReturn);
    const data = useSponsoredData(placeId);
    const place = usePlacePreview(placeId, { name: placeName, photoUrl: placePhotoUrl, address: placeAddress });
    const [today] = useState(() => publicToday());

    const subParam = parsePromoSub(searchParams.get('sub'));
    const itemParam = searchParams.get('item');

    const [rawPlan, setRawPlan] = useState<SpotlightPlan>(() => {
        const draft = wallet.restoredDraft;
        if (draft) {
            return { step: 3, itemId: draft.itemId, radiusKm: draft.radiusKm, days: draft.days, intensity: draft.intensity };
        }
        return { ...DEFAULT_SPOTLIGHT_PLAN, itemId: itemParam || '' };
    });
    // Un ?item= nuevo (Carta → «📣 Impulsar») elige ese plato.
    const [seenItemParam, setSeenItemParam] = useState(itemParam);
    if (itemParam !== seenItemParam) {
        setSeenItemParam(itemParam);
        if (itemParam) setRawPlan((prev) => ({ ...prev, itemId: itemParam, step: 1 }));
    }
    const plan = clampPlan(wallet.pricing, rawPlan);
    const { pricing } = wallet;
    const updatePlan = useCallback((updater: (prev: SpotlightPlan) => SpotlightPlan) => {
        setRawPlan((prev) => updater(clampPlan(pricing, prev)));
    }, [pricing]);

    const [placementDraft, setPlacementDraft] = useState<PlacementDraft>(EMPTY_PLACEMENT_DRAFT);
    const [packsOpen, setPacksOpen] = useState(false);
    const [highlightId, setHighlightId] = useState<string | null>(null);

    // Lo que se pierde al salir de 📣 Promos: la solicitud a medio escribir y el
    // plato estrella ya configurado (pasado el paso ①). La oferta abierta en el
    // editor lo cuenta el propio editor.
    const placementDirty = Boolean(placementDraft.headline.trim() || placementDraft.startsAt || placementDraft.endsAt);
    useReportDirty('promos:placement', placementDirty, '🗺️ tu solicitud de portada o mapa', () => setPlacementDraft(EMPTY_PLACEMENT_DRAFT));
    const spotlightDirty = rawPlan.step > 1 && Boolean(rawPlan.itemId);
    useReportDirty('promos:spotlight', spotlightDirty, '🍽️ tu plato estrella', () => setRawPlan(DEFAULT_SPOTLIGHT_PLAN));

    // Quita ?impulsos= (y abre 🍽️ Plato estrella) sin perder el resto de la URL.
    const hasPurchaseParam = searchParams.has('impulsos');
    useEffect(() => {
        if (!hasPurchaseParam) return;
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('impulsos');
            next.set('sub', 'plato');
            return next;
        }, { replace: true });
    }, [hasPurchaseParam, setSearchParams]);

    const setSub = useCallback((next: PromoSub) => {
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            params.set('sub', next);
            if (next !== 'plato') params.delete('item');
            return params;
        }, { replace: true });
    }, [setSearchParams]);

    const goToCarta = () => {
        if (onGoToTab) {
            onGoToTab('items');
            return;
        }
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            params.set('tab', 'items');
            params.delete('sub');
            params.delete('item');
            return params;
        }, { replace: true });
    };

    const { offers, placements, spotlights } = data;
    const campaignsReady = placements.status === 'ready' && spotlights.status === 'ready';
    const campaignStatuses = campaignsReady ? [...placements.data, ...spotlights.data].map((row) => row.status) : [];
    const counters = {
        liveOffers: offers.status === 'ready' ? offers.data.filter((offer) => computeOfferStatus(offer, today) === 'live').length : null,
        running: campaignsReady ? campaignStatuses.filter((status) => status === 'active').length : null,
        inReview: campaignsReady ? campaignStatuses.filter((status) => status === 'requested').length : null,
    };

    const firstVisitPossible = subParam === null && !purchaseReturn && !itemParam;
    const anyLoading = offers.status === 'loading' || placements.status === 'loading' || spotlights.status === 'loading';
    const nothingCreated = offers.status === 'ready' && campaignsReady
        && offers.data.length === 0 && placements.data.length === 0 && spotlights.data.length === 0;
    const deciding = firstVisitPossible && anyLoading;
    const showPicker = firstVisitPossible && nothingCreated;
    const sub: PromoSub = subParam ?? (purchaseReturn || itemParam ? 'plato' : 'ofertas');
    const caption = PROMO_SUBS.find((entry) => entry.value === sub)?.caption;

    const handleLaunched = (result: ItemSpotlightRequestResult, itemName: string) => {
        launchConfetti();
        const used = result.creditsUsed > 0 ? `Se han descontado ⚡ ${formatCount(result.creditsUsed)} de tu saldo.` : '';
        const pending = result.billedImpulses > 0
            ? `Quedan ⚡ ${formatCount(result.billedImpulses)} pendientes (${formatEur(result.totalPriceEur)}): te confirmaremos el precio antes de activarlo.`
            : '';
        showToast({
            variant: 'success',
            title: '🎉 ¡Enviado!',
            message: [`Un admin activará «${itemName}» y te avisamos.`, used, pending].filter(Boolean).join(' '),
            durationMs: 7000,
        });
        void spotlights.refresh();
        void wallet.refreshCredits(wallet.credits !== null ? wallet.credits - result.creditsUsed : undefined);
        setRawPlan((prev) => ({ ...prev, step: 1, itemId: '' }));
        setHighlightId(result.spotlightId);
        setSub('resultados');
    };

    const handlePlacementSubmitted = (placementId: string) => {
        showToast({
            variant: 'success',
            title: '📬 ¡Solicitud enviada!',
            message: 'Un administrador la revisa y te llega una notificación.',
        });
        setPlacementDraft(EMPTY_PLACEMENT_DRAFT);
        void placements.refresh();
        setHighlightId(placementId);
        setSub('resultados');
    };

    const closePacks = () => {
        setPacksOpen(false);
        wallet.clearBuyError();
    };

    return (
        <div className="space-y-5">
            <SectionHeader
                emoji="📣"
                title="Hazte ver"
                help="Promociona tu local sin tocar las valoraciones: todo sale con la etiqueta Patrocinado."
            />

            <ImpulseWalletBar wallet={wallet} counters={counters} onRecharge={() => setPacksOpen(true)} />

            {deciding ? (
                <div className="space-y-3" aria-label="Cargando tus promociones">
                    <div className="h-11 w-full max-w-lg animate-pulse rounded-xl bg-[var(--lt-glass)]" />
                    <div className="h-40 animate-pulse rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)]" />
                </div>
            ) : showPicker ? (
                <SoftCard as="section" className="p-4 sm:p-6">
                    <ChoiceCards
                        legend={<span className="text-lg font-black">¿Qué te apetece hacer hoy?</span>}
                        help="Elige por dónde empezar; luego puedes probar lo demás."
                        options={PICKER_OPTIONS}
                        value={null}
                        onChange={setSub}
                        columns={3}
                    />
                </SoftCard>
            ) : (
                <>
                    <div className="space-y-1">
                        <Tabs scrollable size="lg" ariaLabel="Secciones de Promos" value={sub} options={TAB_OPTIONS} onChange={setSub} />
                        {caption && <p className="px-1 text-xs text-[var(--lt-text-muted)]">{caption}</p>}
                    </div>

                    {sub === 'ofertas' && <OffersPanel placeId={placeId} offers={offers} />}
                    {sub === 'plato' && (
                        <SpotlightWizard
                            placeId={placeId}
                            plan={plan}
                            onPlanChange={updatePlan}
                            items={data.items}
                            spotlights={spotlights}
                            wallet={wallet}
                            place={place}
                            requestedItemId={itemParam}
                            onOpenPacks={() => setPacksOpen(true)}
                            onLaunched={handleLaunched}
                            onGoToCarta={goToCarta}
                        />
                    )}
                    {sub === 'campanas' && (
                        <PlacementPanel
                            placeId={placeId}
                            placements={placements}
                            draft={placementDraft}
                            onDraftChange={setPlacementDraft}
                            place={place}
                            onSubmitted={handlePlacementSubmitted}
                        />
                    )}
                    {sub === 'resultados' && (
                        <CampaignsTimeline
                            placements={placements}
                            spotlights={spotlights}
                            highlightId={highlightId}
                            onStartSpotlight={() => setSub('plato')}
                        />
                    )}
                </>
            )}

            <ImpulsePacksModal
                open={packsOpen}
                onClose={closePacks}
                wallet={wallet}
                draft={{ itemId: plan.itemId, radiusKm: plan.radiusKm, days: plan.days, intensity: plan.intensity }}
            />
        </div>
    );
};
