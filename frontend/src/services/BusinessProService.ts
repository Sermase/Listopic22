import { collection, collectionGroup, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
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

// ── Gestión de carta: reseñas por elemento y propuestas ─────────────────────

// Espejos de los helpers de functions/modules/canonical-items.js para agrupar
// reseñas por elemento en el cliente con la misma lógica que el backend.
export const normalizeItemName = (value: string): string => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const itemDocIdFromName = (value: string): string => {
    const normalized = normalizeItemName(value);
    return normalized
        ? normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140)
        : 'sin-nombre';
};

export interface ManagerPlaceReview {
    id: string;
    refPath: string;
    itemId: string;
    itemName: string;
    authorName: string;
    overallRating: number | null;
    comment: string;
    createdAtMs: number;
}

export const getPlaceReviewsForManager = async (placeId: string): Promise<ManagerPlaceReview[]> => {
    const snap = await getDocs(query(
        collectionGroup(db, 'reviews'),
        where('placeId', '==', placeId),
        limit(100),
    ));
    const byId = new Map<string, ManagerPlaceReview>();
    snap.docs.forEach((reviewDoc) => {
        const data = reviewDoc.data() as Record<string, unknown>;
        const isNested = reviewDoc.ref.path.startsWith('lists/');
        if (byId.has(reviewDoc.id) && !isNested) return;
        const itemName = typeof data.itemName === 'string' && data.itemName
            ? data.itemName
            : typeof data.itemNameOriginal === 'string' ? data.itemNameOriginal : '';
        const canonicalItemId = typeof data.canonicalItemId === 'string' && data.canonicalItemId
            ? data.canonicalItemId.replace(/\//g, '-').slice(0, 300)
            : '';
        const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
        byId.set(reviewDoc.id, {
            id: reviewDoc.id,
            refPath: reviewDoc.ref.path,
            itemId: canonicalItemId || itemDocIdFromName(itemName),
            itemName,
            authorName: typeof data.authorName === 'string' ? data.authorName : 'Anónimo',
            overallRating: typeof data.overallRating === 'number' ? data.overallRating : null,
            comment: typeof data.comment === 'string' ? data.comment : '',
            createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
        });
    });
    return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
};

export type ItemProposalType = 'merge' | 'rename' | 'reassign_review';
export type ItemProposalStatus = 'pending' | 'approved' | 'rejected';

export interface ItemProposal {
    id: string;
    placeId: string;
    placeName?: string;
    type: ItemProposalType;
    payload: Record<string, string>;
    note?: string;
    status: ItemProposalStatus;
    adminNotes?: string;
    createdBy?: string;
    createdAtMs: number;
}

const mapProposal = (id: string, data: Record<string, unknown>): ItemProposal => {
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
    return {
        id,
        placeId: typeof data.placeId === 'string' ? data.placeId : '',
        placeName: typeof data.placeName === 'string' ? data.placeName : undefined,
        type: (['merge', 'rename', 'reassign_review'].includes(String(data.type)) ? data.type : 'merge') as ItemProposalType,
        payload: (data.payload && typeof data.payload === 'object' ? data.payload : {}) as Record<string, string>,
        note: typeof data.note === 'string' ? data.note : undefined,
        status: (['pending', 'approved', 'rejected'].includes(String(data.status)) ? data.status : 'pending') as ItemProposalStatus,
        adminNotes: typeof data.adminNotes === 'string' ? data.adminNotes : undefined,
        createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
        createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
    };
};

export const describeProposal = (proposal: ItemProposal): string => {
    if (proposal.type === 'merge') {
        return `Fusionar "${proposal.payload.sourceItemName || proposal.payload.sourceItemId}" con "${proposal.payload.targetItemName || proposal.payload.targetItemId}"`;
    }
    if (proposal.type === 'rename') {
        return `Renombrar "${proposal.payload.currentName}" a "${proposal.payload.newName}"`;
    }
    return `Mover la reseña "${proposal.payload.reviewItemName || ''}"${proposal.payload.reviewAuthorName ? ` de ${proposal.payload.reviewAuthorName}` : ''} a "${proposal.payload.targetItemName || proposal.payload.targetItemId}"`;
};

export const getMyItemProposals = async (placeId: string, uid: string): Promise<ItemProposal[]> => {
    const snap = await getDocs(query(
        collection(db, 'itemProposals'),
        where('placeId', '==', placeId),
        where('createdBy', '==', uid),
        limit(50),
    ));
    return snap.docs
        .map((proposalDoc) => mapProposal(proposalDoc.id, proposalDoc.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
};

export const getPendingItemProposals = async (): Promise<ItemProposal[]> => {
    const snap = await getDocs(query(
        collection(db, 'itemProposals'),
        where('status', '==', 'pending'),
        limit(100),
    ));
    return snap.docs
        .map((proposalDoc) => mapProposal(proposalDoc.id, proposalDoc.data() as Record<string, unknown>))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
};

export const createBusinessItem = async (
    placeId: string,
    name: string,
    businessData?: Partial<ItemBusinessData>,
): Promise<{ itemId: string }> => {
    const callable = httpsCallable<unknown, { itemId: string }>(functions, 'createBusinessItem');
    const result = await callable({ placeId, name, businessData });
    return result.data;
};

export const submitItemProposal = async (
    placeId: string,
    type: ItemProposalType,
    payload: Record<string, string>,
    note?: string,
): Promise<{ proposalId: string }> => {
    const callable = httpsCallable<unknown, { proposalId: string }>(functions, 'submitItemProposal');
    const result = await callable({ placeId, type, payload, note });
    return result.data;
};

export const reviewItemProposal = async (
    proposalId: string,
    decision: 'approve' | 'reject',
    adminNotes?: string,
): Promise<void> => {
    const callable = httpsCallable(functions, 'reviewItemProposal');
    await callable({ proposalId, decision, adminNotes });
};

// ── Emplazamientos patrocinados ─────────────────────────────────────────────

export type SponsoredPlacementStatus = 'requested' | 'active' | 'rejected' | 'ended';

export interface SponsoredPlacement {
    id: string;
    placeId: string;
    placeName?: string;
    placePhotoUrl?: string;
    placeAddress?: string;
    type: 'home' | 'search';
    headline?: string;
    startsAt?: string;
    endsAt?: string;
    status: SponsoredPlacementStatus;
    adminNotes?: string;
    createdAtMs: number;
}

const mapPlacement = (id: string, data: Record<string, unknown>): SponsoredPlacement => {
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
    return {
        id,
        placeId: typeof data.placeId === 'string' ? data.placeId : '',
        placeName: typeof data.placeName === 'string' ? data.placeName : undefined,
        placePhotoUrl: typeof data.placePhotoUrl === 'string' ? data.placePhotoUrl : undefined,
        placeAddress: typeof data.placeAddress === 'string' ? data.placeAddress : undefined,
        type: data.type === 'search' ? 'search' : 'home',
        headline: typeof data.headline === 'string' ? data.headline : undefined,
        startsAt: typeof data.startsAt === 'string' ? data.startsAt : undefined,
        endsAt: typeof data.endsAt === 'string' ? data.endsAt : undefined,
        status: (['requested', 'active', 'rejected', 'ended'].includes(String(data.status)) ? data.status : 'requested') as SponsoredPlacementStatus,
        adminNotes: typeof data.adminNotes === 'string' ? data.adminNotes : undefined,
        createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
    };
};

export const getPlaceSponsoredPlacements = async (placeId: string): Promise<SponsoredPlacement[]> => {
    const snap = await getDocs(query(
        collection(db, 'sponsoredPlacements'),
        where('placeId', '==', placeId),
        limit(50),
    ));
    return snap.docs
        .map((placementDoc) => mapPlacement(placementDoc.id, placementDoc.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
};

export const getOpenSponsoredPlacements = async (): Promise<SponsoredPlacement[]> => {
    const snap = await getDocs(query(
        collection(db, 'sponsoredPlacements'),
        where('status', 'in', ['requested', 'active']),
        limit(100),
    ));
    return snap.docs
        .map((placementDoc) => mapPlacement(placementDoc.id, placementDoc.data() as Record<string, unknown>))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
};

export const getActiveHomePlacements = async (): Promise<SponsoredPlacement[]> => {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await getDocs(query(
        collection(db, 'sponsoredPlacements'),
        where('status', '==', 'active'),
        where('type', '==', 'home'),
        limit(10),
    ));
    return snap.docs
        .map((placementDoc) => mapPlacement(placementDoc.id, placementDoc.data() as Record<string, unknown>))
        .filter((placement) => (!placement.startsAt || placement.startsAt <= today)
            && (!placement.endsAt || placement.endsAt >= today))
        .slice(0, 3);
};

export const requestSponsoredPlacement = async (input: {
    placeId: string;
    type: 'home' | 'search';
    headline?: string;
    startsAt?: string;
    endsAt?: string;
}): Promise<{ placementId: string }> => {
    const callable = httpsCallable<unknown, { placementId: string }>(functions, 'requestSponsoredPlacement');
    const result = await callable(input);
    return result.data;
};

export const reviewSponsoredPlacement = async (
    placementId: string,
    decision: 'activate' | 'reject' | 'end',
    adminNotes?: string,
): Promise<void> => {
    const callable = httpsCallable(functions, 'reviewSponsoredPlacement');
    await callable({ placementId, decision, adminNotes });
};
