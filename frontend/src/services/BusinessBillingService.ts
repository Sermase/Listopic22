import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface BusinessProCheckoutSession {
    id: string;
    url: string;
}

export const createBusinessProCheckoutSession = async (placeId: string): Promise<BusinessProCheckoutSession> => {
    const callable = httpsCallable<{ placeId: string }, BusinessProCheckoutSession>(
        functions,
        'createBusinessProCheckoutSession',
    );
    const result = await callable({ placeId });
    return result.data;
};
