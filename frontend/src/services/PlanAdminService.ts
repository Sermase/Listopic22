import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface SetPlanInput {
    active: boolean;
    /** Fecha ISO de caducidad. Omitir para plan indefinido. */
    expiresAt?: string | null;
    notes?: string;
}

export interface SetPlanResult {
    ok: boolean;
    active: boolean;
    source: 'manual' | 'trial' | null;
    expiresAt: string | null;
}

export const adminSetBusinessPlan = async (input: SetPlanInput & { placeId: string }): Promise<SetPlanResult> => {
    const callable = httpsCallable<typeof input, SetPlanResult>(functions, 'adminSetBusinessPlan');
    const result = await callable(input);
    return result.data;
};

export const adminSetUserPlan = async (input: SetPlanInput & { userId: string }): Promise<SetPlanResult> => {
    const callable = httpsCallable<typeof input, SetPlanResult>(functions, 'adminSetUserPlan');
    const result = await callable(input);
    return result.data;
};
