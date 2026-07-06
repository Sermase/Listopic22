import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

// Datos Business Pro: lectura directa de Firestore (colecciones públicas de solo
// lectura) y escritura vía callables que validan gestor + plan Pro activo.

export type BusinessVisualStyle = 'editorial' | 'clean' | 'warm' | 'night';

export interface BusinessVisualData {
    accentColor: string;
    visualStyle: BusinessVisualStyle;
    heroText: string;
    heroImageUrl: string;
}

export const EMPTY_VISUAL_DATA: BusinessVisualData = {
    accentColor: '',
    visualStyle: 'editorial',
    heroText: '',
    heroImageUrl: '',
};

export interface ItemBusinessData {
    group: string;
    price: string;
    discount: string;
    ingredients: string;
    description: string;
    available: boolean;
}

export const EMPTY_ITEM_BUSINESS_DATA: ItemBusinessData = {
    group: '',
    price: '',
    discount: '',
    ingredients: '',
    description: '',
    available: true,
};

export type BusinessOfferStatus = 'draft' | 'active';

export interface BusinessOfferData {
    title: string;
    description: string;
    conditions: string;
    ctaUrl: string;
    startsAt: string;
    endsAt: string;
    status: BusinessOfferStatus;
}

export interface BusinessOffer extends BusinessOfferData {
    id: string;
}

export const EMPTY_OFFER_DATA: BusinessOfferData = {
    title: '',
    description: '',
    conditions: '',
    ctaUrl: '',
    startsAt: '',
    endsAt: '',
    status: 'draft',
};

const asString = (value: unknown): string => typeof value === 'string' ? value : '';

export const getBusinessVisual = async (placeId: string): Promise<BusinessVisualData> => {
    const snap = await getDoc(doc(db, 'places', placeId, 'businessPro', 'visual'));
    if (!snap.exists()) return EMPTY_VISUAL_DATA;
    const data = snap.data() as Record<string, unknown>;
    const style = asString(data.visualStyle);
    return {
        accentColor: asString(data.accentColor),
        visualStyle: (['editorial', 'clean', 'warm', 'night'].includes(style) ? style : 'editorial') as BusinessVisualStyle,
        heroText: asString(data.heroText),
        heroImageUrl: asString(data.heroImageUrl),
    };
};

export const getBusinessOffers = async (placeId: string): Promise<BusinessOffer[]> => {
    const snap = await getDocs(collection(db, 'places', placeId, 'offers'));
    return snap.docs
        .map((offerDoc) => {
            const data = offerDoc.data() as Record<string, unknown>;
            return {
                id: offerDoc.id,
                title: asString(data.title),
                description: asString(data.description),
                conditions: asString(data.conditions),
                ctaUrl: asString(data.ctaUrl),
                startsAt: asString(data.startsAt),
                endsAt: asString(data.endsAt),
                status: data.status === 'active' ? 'active' as const : 'draft' as const,
            };
        })
        .sort((a, b) => a.title.localeCompare(b.title, 'es'));
};

export const updateBusinessVisual = async (placeId: string, data: BusinessVisualData): Promise<void> => {
    const callable = httpsCallable(functions, 'updateBusinessVisual');
    await callable({ placeId, data });
};

export const updateCanonicalItemBusinessData = async (
    placeId: string,
    itemId: string,
    data: ItemBusinessData,
): Promise<void> => {
    const callable = httpsCallable(functions, 'updateCanonicalItemBusinessData');
    await callable({ placeId, itemId, data });
};

export const saveBusinessOffer = async (
    placeId: string,
    data: BusinessOfferData,
    offerId?: string,
): Promise<string> => {
    const callable = httpsCallable<{ placeId: string; offerId?: string; data: BusinessOfferData }, { offerId: string }>(
        functions,
        'saveBusinessOffer',
    );
    const result = await callable({ placeId, offerId, data });
    return result.data.offerId;
};

export const deleteBusinessOffer = async (placeId: string, offerId: string): Promise<void> => {
    const callable = httpsCallable(functions, 'deleteBusinessOffer');
    await callable({ placeId, offerId });
};
