// Beta gratuita de planes («Lo quiero»). Espejo de functions/modules/lib/plan-beta.js:
// si cambias precios o duración, cámbialos en los dos sitios.

export type BetaPlanId = 'premium' | 'business_pro';
export type BillingPeriod = 'monthly' | 'yearly';

export const PLAN_BETA_TRIAL_DAYS = 90;

export const PLAN_BETA_PRICES: Record<BetaPlanId, { monthlyEur: number; yearlyEur: number }> = {
    premium: { monthlyEur: 3.99, yearlyEur: 39 },
    business_pro: { monthlyEur: 12, yearlyEur: 120 },
};

export const formatEur = (value: number): string =>
    value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(value) ? 0 : 2 });
