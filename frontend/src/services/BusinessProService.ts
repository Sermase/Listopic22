import { collection, collectionGroup, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { getAnalyticsSessionId } from './AnalyticsService';

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
    allergens: string[];
    available: boolean;
}

export const EMPTY_ITEM_BUSINESS_DATA: ItemBusinessData = {
    group: '',
    price: '',
    discount: '',
    ingredients: '',
    description: '',
    allergens: [],
    available: true,
};

// Los 14 alérgenos de declaración obligatoria en la UE (mismos ids que valida el backend).
export const ALLERGEN_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
    { value: 'gluten', label: 'Gluten', emoji: '🌾' },
    { value: 'crustaceos', label: 'Crustáceos', emoji: '🦐' },
    { value: 'huevo', label: 'Huevo', emoji: '🥚' },
    { value: 'pescado', label: 'Pescado', emoji: '🐟' },
    { value: 'cacahuetes', label: 'Cacahuetes', emoji: '🥜' },
    { value: 'soja', label: 'Soja', emoji: '🌱' },
    { value: 'lacteos', label: 'Lácteos', emoji: '🥛' },
    { value: 'frutos_secos', label: 'Frutos secos', emoji: '🌰' },
    { value: 'apio', label: 'Apio', emoji: '🥬' },
    { value: 'mostaza', label: 'Mostaza', emoji: '🟡' },
    { value: 'sesamo', label: 'Sésamo', emoji: '⚪' },
    { value: 'sulfitos', label: 'Sulfitos', emoji: '🍷' },
    { value: 'altramuces', label: 'Altramuces', emoji: '🫘' },
    { value: 'moluscos', label: 'Moluscos', emoji: '🦪' },
];

export const allergenLabel = (value: string): string => {
    const option = ALLERGEN_OPTIONS.find((entry) => entry.value === value);
    return option ? `${option.emoji} ${option.label}` : value;
};

export interface MenuSection {
    name: string;
    order: number;
}

export const getBusinessMenuSections = async (placeId: string): Promise<MenuSection[]> => {
    const snap = await getDoc(doc(db, 'places', placeId, 'businessPro', 'menu'));
    if (!snap.exists()) return [];
    const data = snap.data() as { sections?: Array<{ name?: unknown; order?: unknown }> };
    return (Array.isArray(data.sections) ? data.sections : [])
        .map((section, index) => ({
            name: typeof section.name === 'string' ? section.name : '',
            order: typeof section.order === 'number' ? section.order : index,
        }))
        .filter((section) => section.name)
        .sort((a, b) => a.order - b.order);
};

export const updateBusinessMenuSections = async (placeId: string, sections: string[]): Promise<void> => {
    const callable = httpsCallable(functions, 'updateBusinessMenuSections');
    await callable({ placeId, sections });
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
        where('visibility', '==', 'public'),
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

// Reconstruye los items canónicos del lugar desde sus reseñas (cura lugares
// con reseñas anteriores al sistema de items persistidos). Solo gestores.
export const rebuildPlaceItems = async (placeId: string): Promise<void> => {
    const callable = httpsCallable(functions, 'rebuildPlaceItemsForManager');
    await callable({ placeId });
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

export interface SponsoredMetrics {
    impressions: number;
    clicks: number;
}

const mapSponsoredMetrics = (data: Record<string, unknown>): SponsoredMetrics => {
    const metrics = data.metrics && typeof data.metrics === 'object' ? data.metrics as Record<string, unknown> : {};
    return {
        impressions: typeof metrics.impressions === 'number' && metrics.impressions > 0 ? metrics.impressions : 0,
        clicks: typeof metrics.clicks === 'number' && metrics.clicks > 0 ? metrics.clicks : 0,
    };
};

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
    metrics: SponsoredMetrics;
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
        metrics: mapSponsoredMetrics(data),
        createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
    };
};

export const getPlaceSponsoredPlacements = async (placeId: string): Promise<SponsoredPlacement[]> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const snap = await getDocs(query(
        collection(db, 'sponsoredPlacements'),
        where('createdBy', '==', uid),
        limit(100),
    ));
    return snap.docs
        .map((placementDoc) => mapPlacement(placementDoc.id, placementDoc.data() as Record<string, unknown>))
        .filter((placement) => placement.placeId === placeId)
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

// ── Platos destacados por radio (sorteo ponderado por unidades) ─────────────

// Nombre comercial de las unidades de patrocinio: cada "impulso" es un peso
// en el sorteo del carrusel (2 impulsos = doble probabilidad que 1).
export const SPOTLIGHT_UNIT_SINGULAR = 'impulso';
export const SPOTLIGHT_UNIT_PLURAL = 'impulsos';
export const SPOTLIGHT_RADIUS_STEP_KM = 0.2;

export interface SpotlightPricing {
    pricePerRadiusStepPerWeek: number;
    minRadiusKm: number;
    maxRadiusKm: number;
    maxUnitsPerCampaign: number;
    maxWeeks: number;
}

export const DEFAULT_SPOTLIGHT_PRICING: SpotlightPricing = {
    pricePerRadiusStepPerWeek: 0.08,
    minRadiusKm: 0.2,
    maxRadiusKm: 20,
    maxUnitsPerCampaign: 10,
    maxWeeks: 8,
};

export const getSpotlightPricing = async (): Promise<SpotlightPricing> => {
    const snap = await getDoc(doc(db, 'config', 'sponsoredPricing')).catch(() => null);
    const data = snap?.exists() ? snap.data() as Record<string, unknown> : {};
    const merged = { ...DEFAULT_SPOTLIGHT_PRICING };
    (Object.keys(DEFAULT_SPOTLIGHT_PRICING) as Array<keyof SpotlightPricing>).forEach((key) => {
        const value = data[key];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) merged[key] = value;
    });
    // Migra de forma transparente la configuración anterior expresada por km.
    if (!(typeof data.pricePerRadiusStepPerWeek === 'number' && data.pricePerRadiusStepPerWeek > 0)
        && typeof data.pricePerKmPerWeek === 'number' && data.pricePerKmPerWeek > 0) {
        merged.pricePerRadiusStepPerWeek = Number((data.pricePerKmPerWeek * SPOTLIGHT_RADIUS_STEP_KM).toFixed(2));
    }
    merged.minRadiusKm = Number((Math.ceil(merged.minRadiusKm / SPOTLIGHT_RADIUS_STEP_KM) * SPOTLIGHT_RADIUS_STEP_KM).toFixed(1));
    merged.maxRadiusKm = Number((Math.floor(merged.maxRadiusKm / SPOTLIGHT_RADIUS_STEP_KM) * SPOTLIGHT_RADIUS_STEP_KM).toFixed(1));
    if (merged.maxRadiusKm < merged.minRadiusKm) merged.maxRadiusKm = merged.minRadiusKm;
    return merged;
};

// Precio por impulso = precio del tramo × nº de tramos de 0,2 km × semanas.
export const computeSpotlightUnitPrice = (pricing: SpotlightPricing, radiusKm: number, weeks: number): number => {
    const effectiveRadius = Math.max(pricing.minRadiusKm, radiusKm);
    const radiusSteps = Math.ceil((effectiveRadius / SPOTLIGHT_RADIUS_STEP_KM) - 1e-9);
    return Number((pricing.pricePerRadiusStepPerWeek * radiusSteps * weeks).toFixed(2));
};

export const updateSpotlightPricing = async (pricing: SpotlightPricing): Promise<SpotlightPricing> => {
    const callable = httpsCallable<SpotlightPricing, { pricing: SpotlightPricing }>(functions, 'adminUpdateSpotlightPricing');
    const result = await callable(pricing);
    return result.data.pricing;
};

export type ItemSpotlightStatus = 'requested' | 'active' | 'rejected' | 'ended';

export interface ItemSpotlight {
    id: string;
    placeId: string;
    placeName?: string;
    placePhotoUrl?: string;
    itemId: string;
    itemName: string;
    linkedListIds: string[];
    itemAverageRating: number | null;
    itemReviewCount: number;
    center: { lat: number; lng: number } | null;
    radiusKm: number;
    units: number;
    weeks?: number;
    unitPriceEur?: number;
    totalPriceEur?: number;
    startsAt?: string;
    endsAt?: string;
    status: ItemSpotlightStatus;
    adminNotes?: string;
    metrics: SponsoredMetrics;
    createdAtMs: number;
}

const mapSpotlight = (id: string, data: Record<string, unknown>): ItemSpotlight => {
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
    const center = data.center as { lat?: unknown; lng?: unknown } | undefined;
    return {
        id,
        placeId: typeof data.placeId === 'string' ? data.placeId : '',
        placeName: typeof data.placeName === 'string' ? data.placeName : undefined,
        placePhotoUrl: typeof data.placePhotoUrl === 'string' ? data.placePhotoUrl : undefined,
        itemId: typeof data.itemId === 'string' ? data.itemId : '',
        itemName: typeof data.itemName === 'string' ? data.itemName : '',
        linkedListIds: Array.isArray(data.linkedListIds)
            ? data.linkedListIds.filter((entry): entry is string => typeof entry === 'string')
            : [],
        itemAverageRating: typeof data.itemAverageRating === 'number' ? data.itemAverageRating : null,
        itemReviewCount: typeof data.itemReviewCount === 'number' ? data.itemReviewCount : 0,
        center: center && typeof center.lat === 'number' && typeof center.lng === 'number'
            ? { lat: center.lat, lng: center.lng }
            : null,
        radiusKm: typeof data.radiusKm === 'number' ? data.radiusKm : 0,
        units: typeof data.units === 'number' && data.units > 0 ? data.units : 1,
        weeks: typeof data.weeks === 'number' && data.weeks > 0 ? data.weeks : undefined,
        unitPriceEur: typeof data.unitPriceEur === 'number' ? data.unitPriceEur : undefined,
        totalPriceEur: typeof data.totalPriceEur === 'number' ? data.totalPriceEur : undefined,
        startsAt: typeof data.startsAt === 'string' ? data.startsAt : undefined,
        endsAt: typeof data.endsAt === 'string' ? data.endsAt : undefined,
        status: (['requested', 'active', 'rejected', 'ended'].includes(String(data.status)) ? data.status : 'requested') as ItemSpotlightStatus,
        adminNotes: typeof data.adminNotes === 'string' ? data.adminNotes : undefined,
        metrics: mapSponsoredMetrics(data),
        createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
    };
};

export const requestItemSpotlight = async (input: {
    placeId: string;
    itemId: string;
    units: number;
    radiusKm: number;
    weeks: number;
}): Promise<{ spotlightId: string; totalPriceEur: number }> => {
    const callable = httpsCallable<unknown, { spotlightId: string; totalPriceEur: number }>(functions, 'requestItemSpotlight');
    const result = await callable(input);
    return result.data;
};

export const getPlaceItemSpotlights = async (placeId: string): Promise<ItemSpotlight[]> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const snap = await getDocs(query(
        collection(db, 'sponsoredItemSpotlights'),
        where('createdBy', '==', uid),
        limit(100),
    ));
    return snap.docs
        .map((spotlightDoc) => mapSpotlight(spotlightDoc.id, spotlightDoc.data() as Record<string, unknown>))
        .filter((spotlight) => spotlight.placeId === placeId)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
};

export const getOpenItemSpotlights = async (): Promise<ItemSpotlight[]> => {
    const snap = await getDocs(query(
        collection(db, 'sponsoredItemSpotlights'),
        where('status', 'in', ['requested', 'active']),
        limit(100),
    ));
    return snap.docs
        .map((spotlightDoc) => mapSpotlight(spotlightDoc.id, spotlightDoc.data() as Record<string, unknown>))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
};

export const getActiveItemSpotlights = async (): Promise<ItemSpotlight[]> => {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await getDocs(query(
        collection(db, 'sponsoredItemSpotlights'),
        where('status', '==', 'active'),
        limit(100),
    ));
    return snap.docs
        .map((spotlightDoc) => mapSpotlight(spotlightDoc.id, spotlightDoc.data() as Record<string, unknown>))
        .filter((spotlight) => (!spotlight.startsAt || spotlight.startsAt <= today)
            && (!spotlight.endsAt || spotlight.endsAt >= today));
};

// Saldo de impulsos de regalo del lugar (otorgados desde Developer). Se
// consumen automáticamente al solicitar campañas, antes de cobrar nada.
export const getPlaceSpotlightCredits = async (placeId: string): Promise<number> => {
    const snap = await getDoc(doc(db, 'places', placeId));
    const value = snap.exists() ? (snap.data() as Record<string, unknown>).spotlightCredits : 0;
    return typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
};

export const adminGrantSpotlightCredits = async (
    placeId: string,
    credits: number,
    notes?: string,
): Promise<{ balance: number }> => {
    const callable = httpsCallable<unknown, { balance: number }>(functions, 'adminGrantSpotlightCredits');
    const result = await callable({ placeId, credits, notes });
    return result.data;
};

export const reviewItemSpotlight = async (
    spotlightId: string,
    decision: 'activate' | 'reject' | 'end',
    adminNotes?: string,
): Promise<void> => {
    const callable = httpsCallable(functions, 'reviewItemSpotlight');
    await callable({ spotlightId, decision, adminNotes });
};

export const recordSponsoredEvent = async (
    campaignType: 'placement' | 'spotlight',
    campaignId: string,
    eventType: 'impression' | 'click',
): Promise<void> => {
    if (import.meta.env.DEV) return;
    const callable = httpsCallable(functions, 'recordSponsoredEvent');
    await callable({ campaignType, campaignId, eventType, sessionId: getAnalyticsSessionId() });
};

// Solo los emplazamientos contratados para búsqueda reciben chincheta dorada.
// Los de home se quedan en home y los impulsos de plato en su carrusel con
// filtro geográfico; así una campaña no obtiene inventario que no ha comprado.
let sponsoredSearchCampaignsCache: { campaigns: Map<string, string[]>; fetchedAt: number } | null = null;

export const getSponsoredSearchCampaigns = async (): Promise<Map<string, string[]>> => {
    if (sponsoredSearchCampaignsCache && Date.now() - sponsoredSearchCampaignsCache.fetchedAt < 5 * 60 * 1000) {
        return sponsoredSearchCampaignsCache.campaigns;
    }
    const today = new Date().toISOString().slice(0, 10);
    const inDateWindow = (row: { startsAt?: string; endsAt?: string }) =>
        (!row.startsAt || row.startsAt <= today) && (!row.endsAt || row.endsAt >= today);

    const placementsSnap = await getDocs(query(
        collection(db, 'sponsoredPlacements'),
        where('status', '==', 'active'),
        limit(100),
    )).catch(() => null);

    const campaigns = new Map<string, string[]>();
    (placementsSnap?.docs || []).forEach((placementDoc) => {
        const row = mapPlacement(placementDoc.id, placementDoc.data() as Record<string, unknown>);
        if (row.type !== 'search' || !row.placeId || !inDateWindow(row)) return;
        campaigns.set(row.placeId, [...(campaigns.get(row.placeId) || []), row.id]);
    });

    sponsoredSearchCampaignsCache = { campaigns, fetchedAt: Date.now() };
    return campaigns;
};

export const getSponsoredPlaceIds = async (): Promise<Set<string>> => {
    const campaigns = await getSponsoredSearchCampaigns();
    return new Set(campaigns.keys());
};

// Sorteo ponderado sin reemplazo: cada campaña entra con peso = unidades, así
// que comprar 2 unidades duplica la probabilidad frente a quien compra 1.
export const weightedSampleSpotlights = (candidates: ItemSpotlight[], count: number): ItemSpotlight[] => {
    const pool = [...candidates];
    const picked: ItemSpotlight[] = [];
    while (pool.length > 0 && picked.length < count) {
        const totalWeight = pool.reduce((sum, spotlight) => sum + spotlight.units, 0);
        let ticket = Math.random() * totalWeight;
        let index = 0;
        for (let i = 0; i < pool.length; i += 1) {
            ticket -= pool[i].units;
            if (ticket <= 0) {
                index = i;
                break;
            }
        }
        picked.push(pool[index]);
        pool.splice(index, 1);
    }
    return picked;
};
