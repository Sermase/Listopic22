// Campaña que se estaba configurando al ir a Stripe a comprar lo que falta:
// se guarda para recuperarla al volver.
export interface SpotlightDraft {
    itemId: string;
    radiusKm: number;
    days: number;
    intensity: number;
    balanceBefore: number;
}

const spotlightDraftKey = (placeId: string) => `spotlightDraft:${placeId}`;

export const takeSpotlightDraft = (placeId: string): SpotlightDraft | null => {
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

export const saveSpotlightDraft = (placeId: string, draft: SpotlightDraft) => {
    try {
        sessionStorage.setItem(spotlightDraftKey(placeId), JSON.stringify(draft));
    } catch {
        // Sin sessionStorage solo se pierde el borrador.
    }
};

// Comprobaciones del saldo al volver de Stripe (segundos desde la vuelta).
export const IMPULSE_RETURN_POLL_SECONDS = [3, 6, 10, 15, 25, 40, 60, 90, 120, 180];

// Copia del saldo de antes de pagar en localStorage: si Stripe vuelve en otra
// pestaña (sin el borrador de sessionStorage), sigue habiendo con qué comparar.
const checkoutBaselineKey = (placeId: string) => `impulseCheckoutBaseline:${placeId}`;
const CHECKOUT_BASELINE_TTL_MS = 6 * 60 * 60 * 1000;

export const saveCheckoutBaseline = (placeId: string, balanceBefore: number, now: number = Date.now()) => {
    try {
        localStorage.setItem(checkoutBaselineKey(placeId), JSON.stringify({ balanceBefore, at: now }));
    } catch {
        // Sin localStorage se compara con el saldo al volver.
    }
};

export const takeCheckoutBaseline = (placeId: string, now: number = Date.now()): number | null => {
    try {
        const raw = localStorage.getItem(checkoutBaselineKey(placeId));
        localStorage.removeItem(checkoutBaselineKey(placeId));
        const data = raw ? JSON.parse(raw) as { balanceBefore?: unknown; at?: unknown } : null;
        const balance = Number(data?.balanceBefore);
        const at = Number(data?.at);
        if (!data || !Number.isFinite(balance) || !Number.isFinite(at) || now - at > CHECKOUT_BASELINE_TTL_MS) return null;
        return Math.max(0, Math.floor(balance));
    } catch {
        return null;
    }
};
