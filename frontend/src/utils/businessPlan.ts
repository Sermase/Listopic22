// Lectura del plan (entitlements) de un negocio desde el documento de `places`.
// Espejo del helper de backend `functions/modules/lib/business-plan.js`:
// la fuente de verdad son los campos businessTier / businessProActive /
// businessPlanSource / businessPlanExpiresAt, escritos solo por Cloud Functions.

export type BusinessPlanSource = 'manual' | 'trial' | 'stripe';

export interface BusinessPlan {
    isPro: boolean;
    source: BusinessPlanSource | null;
    expiresAt: Date | null;
    billingStatus: string | null;
}

export const FREE_BUSINESS_PLAN: BusinessPlan = {
    isPro: false,
    source: null,
    expiresAt: null,
    billingStatus: null,
};

const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
    }
    return null;
};

const asPlanSource = (value: unknown): BusinessPlanSource | null =>
    value === 'manual' || value === 'trial' || value === 'stripe' ? value : null;

export const getBusinessPlanFromPlace = (data: Record<string, unknown> | null | undefined): BusinessPlan => {
    if (!data) return FREE_BUSINESS_PLAN;

    const expiresAt = toDate(data.businessPlanExpiresAt);
    const proFlag = data.businessProActive === true || data.businessTier === 'pro';
    const expired = expiresAt !== null && expiresAt.getTime() <= Date.now();

    return {
        isPro: proFlag && !expired,
        source: asPlanSource(data.businessPlanSource),
        expiresAt,
        billingStatus: typeof data.businessBillingStatus === 'string' ? data.businessBillingStatus : null,
    };
};

export const PLAN_SOURCE_LABELS: Record<BusinessPlanSource, string> = {
    manual: 'Concedido manualmente',
    trial: 'Periodo de prueba',
    stripe: 'Suscripción',
};

export const formatPlanExpiry = (expiresAt: Date | null): string | null => {
    if (!expiresAt) return null;
    return expiresAt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
