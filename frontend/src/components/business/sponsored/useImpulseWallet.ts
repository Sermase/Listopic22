/**
 * Monedero de impulsos ⚡ de un negocio: saldo, precios, compra con Stripe y
 * la vuelta de Stripe (`?impulsos=ok|cancelado`).
 *
 *   const [purchaseReturn] = useState(() => searchParams.get('impulsos'));
 *   const wallet = useImpulseWallet(placeId, purchaseReturn);
 *   wallet.credits            // null mientras carga o si falló (nunca un 0 falso)
 *   wallet.restoredDraft      // la campaña que se estaba preparando al ir a pagar
 *   wallet.awaitingPayment    // «⏳ Confirmando tu pago con Stripe…»
 *   void wallet.buy('pack-1', { packIndex: 1 }, { itemId, radiusKm, days, intensity });
 *
 * Al volver de Stripe compara el saldo con el de antes de pagar (borrador en
 * sessionStorage o copia en localStorage). Sin ninguno de los dos (S9), la
 * primera lectura tras volver hace de referencia y el aviso termina siempre.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BUSINESS_PRO_CHECKOUT_ENABLED } from '../../../config/features';
import { createImpulsePackCheckoutSession } from '../../../services/BusinessBillingService';
import {
    DEFAULT_SPOTLIGHT_PRICING,
    getPlaceSpotlightCredits,
    getSpotlightPricing,
    type SpotlightPricing,
} from '../../../services/BusinessProService';
import { businessErrorCopy } from '../kit';
import { formatCount } from './sponsoredMeta';
import {
    IMPULSE_RETURN_POLL_SECONDS,
    saveCheckoutBaseline,
    saveSpotlightDraft,
    takeCheckoutBaseline,
    takeSpotlightDraft,
    type SpotlightDraft,
} from './spotlightDraft';

export type WalletNoticeTone = 'success' | 'neutral' | 'warning';

export interface WalletNotice {
    tone: WalletNoticeTone;
    text: string;
}

export type ImpulsePurchase = { packIndex: number } | { impulses: number };

export interface ImpulseWallet {
    /** Saldo; null mientras carga o si no se pudo leer. */
    credits: number | null;
    creditsStatus: 'loading' | 'ready' | 'error';
    reloadCredits: () => void;
    /** Vuelve a leer el saldo sin pasar por «cargando» (si falla, usa `fallback`). */
    refreshCredits: (fallback?: number) => Promise<void>;
    pricing: SpotlightPricing;
    pricingReady: boolean;
    checkoutEnabled: boolean;
    purchaseReturn: 'ok' | 'cancelled' | null;
    restoredDraft: SpotlightDraft | null;
    awaitingPayment: boolean;
    notice: WalletNotice | null;
    dismissNotice: () => void;
    buyingKey: string | null;
    buyError: string | null;
    clearBuyError: () => void;
    buy: (key: string, purchase: ImpulsePurchase, draft: Omit<SpotlightDraft, 'balanceBefore'>) => Promise<void>;
}

const CANCELLED_NOTICE: WalletNotice = { tone: 'neutral', text: '🙅 Compra cancelada: no se ha cobrado nada.' };

type CreditsState = { status: 'loading' | 'ready' | 'error'; value: number | null };

export function useImpulseWallet(placeId: string, rawPurchaseReturn: string | null): ImpulseWallet {
    const [purchaseReturn] = useState<'ok' | 'cancelled' | null>(() => {
        if (!rawPurchaseReturn) return null;
        return rawPurchaseReturn === 'ok' ? 'ok' : 'cancelled';
    });
    // Se leen una sola vez: al volver de Stripe (pagando o cancelando).
    const [restoredDraft] = useState<SpotlightDraft | null>(() => (purchaseReturn ? takeSpotlightDraft(placeId) : null));
    const [storedBaseline] = useState<number | null>(() => (purchaseReturn ? takeCheckoutBaseline(placeId) : null));

    const [credits, setCredits] = useState<CreditsState>({ status: 'loading', value: null });
    const [creditsTick, setCreditsTick] = useState(0);
    const creditsRef = useRef<number | null>(null);
    const [pricingState, setPricingState] = useState<{ ready: boolean; value: SpotlightPricing }>({
        ready: false,
        value: DEFAULT_SPOTLIGHT_PRICING,
    });
    const [awaitingPayment, setAwaitingPayment] = useState(() => purchaseReturn === 'ok');
    const [notice, setNotice] = useState<WalletNotice | null>(() => (purchaseReturn === 'cancelled' ? CANCELLED_NOTICE : null));
    const [buyingKey, setBuyingKey] = useState<string | null>(null);
    const [buyError, setBuyError] = useState<string | null>(null);

    useEffect(() => {
        creditsRef.current = credits.status === 'ready' ? credits.value : null;
    }, [credits]);

    useEffect(() => {
        let cancelled = false;
        getPlaceSpotlightCredits(placeId)
            .then((balance) => {
                if (!cancelled) setCredits({ status: 'ready', value: balance });
            })
            .catch((error) => {
                console.error('useImpulseWallet: credits load failed', error);
                if (!cancelled) setCredits((prev) => (prev.status === 'ready' ? prev : { status: 'error', value: null }));
            });
        return () => {
            cancelled = true;
        };
    }, [placeId, creditsTick]);

    useEffect(() => {
        let cancelled = false;
        getSpotlightPricing()
            .catch(() => DEFAULT_SPOTLIGHT_PRICING)
            .then((pricing) => {
                if (!cancelled) setPricingState({ ready: true, value: pricing });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Vuelta de Stripe con pago: el webhook suma los impulsos al confirmarse,
    // así que se consulta el saldo unas cuantas veces.
    useEffect(() => {
        if (purchaseReturn !== 'ok') return;
        let baseline: number | null = restoredDraft ? restoredDraft.balanceBefore : storedBaseline;
        const knewBaseline = baseline !== null;
        let cancelled = false;
        let done = false;
        const last = IMPULSE_RETURN_POLL_SECONDS.length - 1;

        const finish = (balance: number | null) => {
            done = true;
            setAwaitingPayment(false);
            setNotice({
                tone: 'neutral',
                text: knewBaseline
                    ? '⏳ Stripe aún no ha confirmado el pago. Con algunos métodos, como el adeudo SEPA, tarda unos días: los impulsos se sumarán solos al confirmarse.'
                    : `${balance !== null ? `Tu saldo es de ⚡ ${formatCount(balance)}. ` : ''}Si aún no ves los impulsos de tu compra, Stripe está terminando de confirmarla: se sumarán solos (con adeudo SEPA puede tardar unos días).`,
            });
        };

        // S9: sin saldo de referencia guardado, el de ahora mismo hace de referencia.
        if (baseline === null) {
            getPlaceSpotlightCredits(placeId)
                .then((balance) => {
                    if (!cancelled && baseline === null) baseline = balance;
                })
                .catch(() => undefined);
        }

        const timers = IMPULSE_RETURN_POLL_SECONDS.map((seconds, index) => window.setTimeout(() => {
            if (done) return;
            getPlaceSpotlightCredits(placeId)
                .then((balance) => {
                    if (cancelled || done) return;
                    setCredits({ status: 'ready', value: balance });
                    if (baseline === null) {
                        baseline = balance;
                    } else if (balance > baseline) {
                        done = true;
                        setAwaitingPayment(false);
                        setNotice({ tone: 'success', text: `✅ ¡Impulsos añadidos! Ya tienes ⚡ ${formatCount(balance)}.` });
                        return;
                    }
                    if (index === last) finish(balance);
                })
                .catch(() => {
                    if (!cancelled && !done && index === last) finish(null);
                });
        }, seconds * 1000));

        return () => {
            cancelled = true;
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [purchaseReturn, placeId, restoredDraft, storedBaseline]);

    const reloadCredits = useCallback(() => {
        setCredits((prev) => ({ ...prev, status: 'loading' }));
        setCreditsTick((tick) => tick + 1);
    }, []);

    const refreshCredits = useCallback(async (fallback?: number) => {
        try {
            const balance = await getPlaceSpotlightCredits(placeId);
            setCredits({ status: 'ready', value: balance });
        } catch {
            if (fallback !== undefined) setCredits({ status: 'ready', value: Math.max(0, fallback) });
        }
    }, [placeId]);

    const buy = useCallback(async (key: string, purchase: ImpulsePurchase, draft: Omit<SpotlightDraft, 'balanceBefore'>) => {
        if (!BUSINESS_PRO_CHECKOUT_ENABLED) return;
        const balanceBefore = creditsRef.current;
        if (balanceBefore === null) {
            setBuyError('Espera a que cargue tu saldo para comprar.');
            return;
        }
        setBuyingKey(key);
        setBuyError(null);
        try {
            const session = await createImpulsePackCheckoutSession(placeId, purchase);
            saveSpotlightDraft(placeId, { ...draft, balanceBefore });
            saveCheckoutBaseline(placeId, balanceBefore);
            window.location.assign(session.url);
        } catch (error) {
            console.error('useImpulseWallet: impulse checkout failed', error);
            setBuyError(businessErrorCopy(error, '😕 No se pudo iniciar la compra de impulsos.').message);
            setBuyingKey(null);
        }
    }, [placeId]);

    const dismissNotice = useCallback(() => setNotice(null), []);
    const clearBuyError = useCallback(() => setBuyError(null), []);

    return {
        credits: credits.status === 'ready' ? credits.value : null,
        creditsStatus: credits.status,
        reloadCredits,
        refreshCredits,
        pricing: pricingState.value,
        pricingReady: pricingState.ready,
        checkoutEnabled: BUSINESS_PRO_CHECKOUT_ENABLED,
        purchaseReturn,
        restoredDraft,
        awaitingPayment,
        notice,
        dismissNotice,
        buyingKey,
        buyError,
        clearBuyError,
        buy,
    };
}
