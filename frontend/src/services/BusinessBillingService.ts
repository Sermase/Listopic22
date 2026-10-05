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

export interface ImpulseCheckoutSession {
    id: string;
    url: string;
    impulses: number;
    priceEur: number;
}

// Compra de impulsos: un paquete (packIndex) o una cantidad suelta a precio de lista.
export const createImpulsePackCheckoutSession = async (
    placeId: string,
    purchase: { packIndex: number } | { impulses: number },
): Promise<ImpulseCheckoutSession> => {
    const callable = httpsCallable<{ placeId: string; packIndex?: number; impulses?: number }, ImpulseCheckoutSession>(
        functions,
        'createImpulsePackCheckoutSession',
    );
    const result = await callable({ placeId, ...purchase });
    return result.data;
};
