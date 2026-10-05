import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { BetaPlanId, BillingPeriod } from '../config/planBeta';

export type PlanInterestStatus = 'trial_started' | 'already_active' | 'trial_used' | 'registered';

export interface PlanInterestResult {
    status: PlanInterestStatus;
    expiresAt: string | null;
}

export const registerPlanInterest = async (
    plan: BetaPlanId,
    billing: BillingPeriod,
    placeId?: string,
): Promise<PlanInterestResult> => {
    const callable = httpsCallable<{ plan: BetaPlanId; billing: BillingPeriod; placeId?: string }, PlanInterestResult>(
        functions,
        'registerPlanInterest',
    );
    const result = await callable({ plan, billing, ...(placeId ? { placeId } : {}) });
    return result.data;
};

export const describePlanInterestResult = (result: PlanInterestResult): string => {
    const until = result.expiresAt
        ? new Date(result.expiresAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;
    switch (result.status) {
        case 'trial_started':
            return `¡Hecho! Lo tienes gratis${until ? ` hasta el ${until}` : ''}. No te cobraremos nada.`;
        case 'already_active':
            return 'Ya lo tienes activo. Hemos apuntado que te interesa.';
        case 'trial_used':
            return `Ya usaste la prueba gratuita${until ? ` (hasta el ${until})` : ''}. Hemos apuntado que te sigue interesando.`;
        default:
            return 'Apuntado. Te avisaremos cuando abra.';
    }
};
