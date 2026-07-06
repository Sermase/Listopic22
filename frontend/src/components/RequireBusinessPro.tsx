import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { BUSINESS_PRO_ENFORCED } from '../config/features';
import { createBusinessProCheckoutSession } from '../services/BusinessBillingService';
import type { BusinessPlan } from '../utils/businessPlan';

const PRO_BENEFITS = [
    'Personalización visual de la página del negocio (fondos, galería, branding).',
    'Carta y elementos oficiales con foto, precio y descripción.',
    'Ofertas y contenido destacado, siempre etiquetado como promocionado.',
];

const getErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return 'No se pudo iniciar la contratación. Inténtalo de nuevo.';
};

export const BusinessProUpsellCard: React.FC<{ placeId: string }> = ({ placeId }) => {
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

    return (
        <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-xl font-black text-[var(--lt-text)]">Esta sección es de Business Pro</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--lt-text-muted)]">
                Activa Business Pro para este local y desbloquea todas las herramientas de promoción y personalización.
            </p>
            <ul className="mx-auto mt-5 max-w-md space-y-2 text-left text-sm text-[var(--lt-text-muted)]">
                {PRO_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lt-accent)]" />
                        <span>{benefit}</span>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                onClick={startCheckout}
                disabled={starting}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-60"
            >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Hazte Business Pro
            </button>
            {error && (
                <p className="mx-auto mt-4 max-w-md rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                </p>
            )}
        </div>
    );
};

// Puerta única de acceso a las funcionalidades Business Pro. Mientras
// BUSINESS_PRO_ENFORCED sea false (modo pruebas) el contenido queda abierto;
// al activarlo, los locales sin plan ven el paywall.
export const RequireBusinessPro: React.FC<{
    placeId: string;
    plan: BusinessPlan;
    children: React.ReactNode;
}> = ({ placeId, plan, children }) => {
    if (!BUSINESS_PRO_ENFORCED || plan.isPro) return <>{children}</>;
    return <BusinessProUpsellCard placeId={placeId} />;
};
