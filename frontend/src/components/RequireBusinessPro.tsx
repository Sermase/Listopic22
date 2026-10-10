import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BUSINESS_PRO_CHECKOUT_ENABLED, BUSINESS_PRO_ENFORCED } from '../config/features';
import { createBusinessProCheckoutSession } from '../services/BusinessBillingService';
import { PLAN_BETA_TRIAL_DAYS } from '../config/planBeta';
import { describePlanInterestResult, registerPlanInterest } from '../services/PlanInterestService';
import type { BusinessPlan } from '../utils/businessPlan';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { SoftCard, kit, toneClass } from './business/kit';

// Solo lo que existe de verdad (spec §3.3, X9).
const PRO_BENEFITS = [
    { emoji: '🎨', text: 'Tu portada, tu color y tu frase' },
    { emoji: '📖', text: 'Carta oficial con precios y alérgenos' },
    { emoji: '📣', text: 'Ofertas y platos destacados (siempre etiquetados)' },
    { emoji: '📊', text: 'Estadísticas de visitas y opiniones' },
] as const;

const getErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return 'No se pudo iniciar la contratación. Inténtalo de nuevo.';
};

/** Lo que cambia según desde dónde se ofrece Business Pro (cada pestaña, el modal de la cabecera). */
export interface BusinessProUpsellCopy {
    /** Emoji grande de arriba (por defecto ✨). */
    emoji?: string;
    title?: string;
    text?: string;
}

export interface BusinessProUpsellCardProps extends BusinessProUpsellCopy {
    placeId: string;
    /** Sin tarjeta alrededor: para meterlo dentro de un Modal. */
    bare?: boolean;
    className?: string;
}

export const BusinessProUpsellCard: React.FC<BusinessProUpsellCardProps> = ({
    placeId,
    emoji = '✨',
    title = 'Esta sección es de Business Pro',
    text = 'Activa Business Pro para este local y desbloquea todas las herramientas para lucirlo.',
    bare = false,
    className,
}) => {
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startCheckout = async () => {
        setStarting(true);
        setError(null);
        try {
            const session = await createBusinessProCheckoutSession(placeId);
            window.location.assign(session.url);
        } catch (checkoutError) {
            console.error('BusinessProUpsellCard: checkout failed', checkoutError);
            setError(getErrorMessage(checkoutError));
            setStarting(false);
        }
    };

    // Beta gratuita: activa Business Pro como prueba y recarga para ver las pestañas.
    const startBetaTrial = async () => {
        setStarting(true);
        setError(null);
        try {
            const result = await registerPlanInterest('business_pro', 'monthly', placeId);
            if (result.status === 'trial_started' || result.status === 'already_active') {
                window.location.reload();
                return;
            }
            setError(describePlanInterestResult(result));
        } catch (trialError) {
            console.error('BusinessProUpsellCard: beta trial failed', trialError);
            setError(getErrorMessage(trialError));
        }
        setStarting(false);
    };

    const sparkle = starting
        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        : <span aria-hidden="true" className="leading-none">✨</span>;

    const body = (
        <div className="flex flex-col items-center text-center">
            <span
                aria-hidden="true"
                className={cn('grid h-16 w-16 place-items-center rounded-2xl text-4xl leading-none', toneClass.promo)}
            >
                {emoji}
            </span>
            <h2 className="mt-4 text-lg font-black text-[var(--lt-text)] sm:text-xl">{title}</h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--lt-text-muted)]">{text}</p>

            <ul className="mt-5 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2" aria-label="Qué incluye Business Pro">
                {PRO_BENEFITS.map((benefit) => (
                    <li key={benefit.text} className={cn(kit.inset, 'flex min-h-11 items-center gap-3 px-3 py-2')}>
                        <span aria-hidden="true" className="text-xl leading-none">{benefit.emoji}</span>
                        <span className="text-sm font-semibold text-[var(--lt-text)]">{benefit.text}</span>
                    </li>
                ))}
            </ul>

            {BUSINESS_PRO_CHECKOUT_ENABLED ? (
                <Button size="lg" onClick={startCheckout} disabled={starting} leftIcon={sparkle} className="mt-6 min-h-11">
                    Hazte Business Pro
                </Button>
            ) : (
                <>
                    <Button size="lg" onClick={startBetaTrial} disabled={starting} leftIcon={sparkle} className="mt-6 min-h-11">
                        Pruébalo gratis {PLAN_BETA_TRIAL_DAYS} días
                    </Button>
                    <p role="note" className={cn(kit.inset, 'mt-4 flex max-w-md items-start gap-2 px-4 py-3 text-left text-sm text-[var(--lt-text-muted)]')}>
                        <span aria-hidden="true" className="leading-5">🎁</span>
                        <span>Beta gratuita por tiempo limitado: sin tarjeta y sin cobros. Al acabar, el local vuelve solo al plan gratuito.</span>
                    </p>
                </>
            )}
            {error && (
                <p role="alert" className={cn('mt-4 max-w-md rounded-xl px-4 py-3 text-sm font-semibold', toneClass.danger)}>
                    {error}
                </p>
            )}
            <p className="mt-4 max-w-md text-xs text-[var(--lt-text-muted)]">
                Si este local tuvo Business Pro, sus datos siguen guardados: al reactivar el plan volverán a estar disponibles tal y como quedaron.
            </p>
        </div>
    );

    if (bare) return <div className={className}>{body}</div>;
    return <SoftCard as="section" className={cn('p-6 sm:p-8', className)}>{body}</SoftCard>;
};

// Puerta única de acceso a las funcionalidades Business Pro. Mientras
// BUSINESS_PRO_ENFORCED sea false (modo pruebas) el contenido queda abierto;
// al activarlo, los locales sin plan ven el paywall (con el texto de la
// pestaña que se ha abierto, si se pasa).
export const RequireBusinessPro: React.FC<BusinessProUpsellCopy & {
    placeId: string;
    plan: BusinessPlan;
    children: React.ReactNode;
}> = ({ placeId, plan, children, ...copy }) => {
    if (!BUSINESS_PRO_ENFORCED || plan.isPro) return <>{children}</>;
    return <BusinessProUpsellCard placeId={placeId} {...copy} />;
};
