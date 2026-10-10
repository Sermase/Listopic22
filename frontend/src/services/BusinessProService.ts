import { collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, functions, storage } from '../firebase';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from '../lib/storageCache';
import { getAnalyticsSessionId } from './AnalyticsService';
import { fetchPending, fetchQueue, type QueuePage } from './adminQueues';
import { toMillis } from '../utils/adminTime';
import type { CanonicalPlaceItem } from './CanonicalItemService';

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
    /** Posición dentro de su sección (0 = primero); null o ausente = por nota. */
    menuOrder?: number | null;
}

/** Ficha tal y como la guarda el servidor (precio normalizado y céntimos). */
export interface SavedItemBusinessData extends ItemBusinessData {
    priceCents: number | null;
    menuOrder: number | null;
}

export const EMPTY_ITEM_BUSINESS_DATA: ItemBusinessData = {
    group: '',
    price: '',
    discount: '',
    ingredients: '',
    description: '',
    allergens: [],
    available: true,
    menuOrder: null,
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

const mapVisualData = (data: Record<string, unknown>): BusinessVisualData => {
    const style = asString(data.visualStyle);
    return {
        accentColor: asString(data.accentColor),
        visualStyle: (['editorial', 'clean', 'warm', 'night'].includes(style) ? style : 'editorial') as BusinessVisualStyle,
        heroText: asString(data.heroText),
        heroImageUrl: asString(data.heroImageUrl),
    };
};

export const getBusinessVisual = async (placeId: string): Promise<BusinessVisualData> => {
    const snap = await getDoc(doc(db, 'places', placeId, 'businessPro', 'visual'));
    if (!snap.exists()) return EMPTY_VISUAL_DATA;
    return mapVisualData(snap.data() as Record<string, unknown>);
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

// Devuelve lo que quedó guardado (el servidor lo sanea); null si no lo trae.
export const updateBusinessVisual = async (placeId: string, data: BusinessVisualData): Promise<BusinessVisualData | null> => {
    const callable = httpsCallable<unknown, { data?: unknown }>(functions, 'updateBusinessVisual');
    const result = await callable({ placeId, data });
    const saved = result?.data?.data;
    return saved && typeof saved === 'object' ? mapVisualData(saved as Record<string, unknown>) : null;
};

// Portada de Business Pro: sube la foto ya recortada a la carpeta del usuario
// dentro del lugar (storage.rules ya lo permite) y devuelve su URL. No crea
// documento en places/{id}/photos: solo es la portada.
export const uploadBusinessHeroImage = async (placeId: string, blob: Blob): Promise<string> => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw Object.assign(new Error('Inicia sesión para subir tu portada.'), { code: 'unauthenticated' });
    const target = storageRef(storage, `places/${placeId}/${uid}/business-hero-${Date.now()}.jpg`);
    const snapshot = await uploadBytes(target, blob, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL });
    return getDownloadURL(snapshot.ref);
};

// La ficha que devuelve el servidor, ya saneada; null si no la trae.
const mapSavedItemData = (raw: unknown): SavedItemBusinessData | null => {
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Record<string, unknown>;
    return {
        group: asString(data.group),
        price: asString(data.price),
        priceCents: typeof data.priceCents === 'number' ? data.priceCents : null,
        discount: asString(data.discount),
        ingredients: asString(data.ingredients),
        description: asString(data.description),
        allergens: Array.isArray(data.allergens) ? data.allergens.filter((entry): entry is string => typeof entry === 'string') : [],
        available: data.available !== false,
        menuOrder: typeof data.menuOrder === 'number' ? data.menuOrder : null,
    };
};

// Manda SIEMPRE la ficha completa: el servidor reconstruye todos los campos y
// un campo que falte se quedaría en blanco. Devuelve lo que quedó guardado.
export const updateCanonicalItemBusinessData = async (
    placeId: string,
    itemId: string,
    data: ItemBusinessData,
): Promise<SavedItemBusinessData | null> => {
    const callable = httpsCallable<unknown, { data?: unknown }>(functions, 'updateCanonicalItemBusinessData');
    const result = await callable({ placeId, itemId, data });
    return mapSavedItemData(result?.data?.data);
};

export const MAX_MENU_ITEMS_BATCH = 50;

/**
 * ¿Falla porque el servidor aún no tiene esa callable? Hosting se publica al
 * fusionar y Functions se despliegan después a mano: mientras tanto, una
 * callable nueva sin desplegar responde 404 sin cabeceras CORS y el SDK lo da
 * como 'internal' (o 'not-found' / 'unimplemented'). Un 'not-found' con
 * details.itemIds sí viene del servidor nuevo (platos que ya no existen).
 * 'internal' no cuenta aquí: también es un fallo real del servidor nuevo (ver
 * isCallableInternalError; quien llama reintenta antes de decidir).
 */
const plainCallableCode = (error: unknown): string => {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return typeof code === 'string' ? code.replace(/^functions\//, '') : '';
};

export const isCallableInternalError = (error: unknown): boolean => plainCallableCode(error) === 'internal';

export const isCallableUnavailableError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const { details } = error as { details?: unknown };
    const plain = plainCallableCode(error);
    if (plain === 'unimplemented') return true;
    if (plain !== 'not-found') return false;
    const itemIds = details && typeof details === 'object' ? (details as { itemIds?: unknown }).itemIds : undefined;
    return !Array.isArray(itemIds);
};

// Varias fichas completas en una sola llamada (≤ 50; un solo cargo al cupo de
// la carta): mover platos de sección, ordenar una sección, renombrar o quitar
// una sección con platos. Devuelve lo guardado por plato.
export const updateBusinessMenuItems = async (
    placeId: string,
    items: Array<{ itemId: string; data: ItemBusinessData }>,
): Promise<Array<{ itemId: string; data: SavedItemBusinessData }>> => {
    const callable = httpsCallable<unknown, { items?: Array<{ itemId?: unknown; data?: unknown }> }>(functions, 'updateBusinessMenuItems');
    const result = await callable({ placeId, items });
    const rows = Array.isArray(result?.data?.items) ? result.data.items : [];
    return rows.flatMap((row) => {
        const data = mapSavedItemData(row?.data);
        return typeof row?.itemId === 'string' && data ? [{ itemId: row.itemId, data }] : [];
    });
};

export interface SavedBusinessOffer {
    offerId: string;
    /** Lo que guardó el servidor (saneado); si no lo trae, lo enviado. */
    data: BusinessOfferData;
}

export const saveBusinessOffer = async (
    placeId: string,
    data: BusinessOfferData,
    offerId?: string,
): Promise<SavedBusinessOffer> => {
    const callable = httpsCallable<{ placeId: string; offerId?: string; data: BusinessOfferData }, { offerId: string; data?: unknown }>(
        functions,
        'saveBusinessOffer',
    );
    const result = await callable({ placeId, offerId, data });
    // Servidor nuevo y anterior devuelven { offerId, data }; si llegara solo el
    // id (o sin `data`) se usa lo enviado, y si faltara el id, el de la oferta editada.
    const raw: unknown = result?.data;
    const response = (typeof raw === 'string' ? { offerId: raw } : (raw && typeof raw === 'object' ? raw : {})) as { offerId?: unknown; data?: unknown };
    const saved = response.data && typeof response.data === 'object' ? response.data as Record<string, unknown> : null;
    return {
        offerId: typeof response.offerId === 'string' && response.offerId ? response.offerId : (offerId || ''),
        data: saved
            ? {
                title: asString(saved.title),
                description: asString(saved.description),
                conditions: asString(saved.conditions),
                ctaUrl: asString(saved.ctaUrl),
                startsAt: asString(saved.startsAt),
                endsAt: asString(saved.endsAt),
                status: saved.status === 'active' ? 'active' : 'draft',
            }
            : data,
    };
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
    /** Lo que escribió el autor si el servidor renombró la reseña al nombre del plato. */
    originalItemName?: string;
    authorName: string;
    overallRating: number | null;
    comment: string;
    createdAtMs: number;
}

/** Máximo de valoraciones públicas que lee la gestión (Carta y Estadísticas). */
export const MANAGER_REVIEWS_LIMIT = 100;

export const getPlaceReviewsForManager = async (placeId: string): Promise<ManagerPlaceReview[]> => {
    const snap = await getDocs(query(
        collectionGroup(db, 'reviews'),
        where('placeId', '==', placeId),
        where('visibility', '==', 'public'),
        limit(MANAGER_REVIEWS_LIMIT),
    ));
    return managerReviewsFrom(snap.docs);
};

/**
 * Las valoraciones públicas MÁS RECIENTES (📊 Estadísticas, T3). Usa el índice
 * reviews (placeId, visibility, createdAt desc); mientras no exista o se esté
 * construyendo, lee como getPlaceReviewsForManager y lo dice con
 * `newestFirst: false` para no presentar unas cualquiera como «las últimas».
 * `capped`: la lectura llegó al máximo (cuenta copias raíz + anidadas, así que
 * puede haber menos de 100 reseñas distintas y aun así quedar más por leer).
 */
export const getLatestPlaceReviewsForManager = async (placeId: string): Promise<{ reviews: ManagerPlaceReview[]; newestFirst: boolean; capped: boolean }> => {
    const publicReviews = query(
        collectionGroup(db, 'reviews'),
        where('placeId', '==', placeId),
        where('visibility', '==', 'public'),
    );
    try {
        const snap = await getDocs(query(publicReviews, orderBy('createdAt', 'desc'), limit(MANAGER_REVIEWS_LIMIT)));
        return { reviews: managerReviewsFrom(snap.docs), newestFirst: true, capped: snap.size >= MANAGER_REVIEWS_LIMIT };
    } catch (error) {
        if ((error as { code?: unknown } | null)?.code !== 'failed-precondition') throw error;
        console.warn('getLatestPlaceReviewsForManager: falta el índice de createdAt; se leen sin orden', error);
        const snap = await getDocs(query(publicReviews, limit(MANAGER_REVIEWS_LIMIT)));
        return { reviews: managerReviewsFrom(snap.docs), newestFirst: false, capped: snap.size >= MANAGER_REVIEWS_LIMIT };
    }
};

function managerReviewsFrom(docs: QueryDocumentSnapshot[]): ManagerPlaceReview[] {
    const byId = new Map<string, ManagerPlaceReview>();
    docs.forEach((reviewDoc) => {
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
            ...(typeof data.originalItemName === 'string' && data.originalItemName ? { originalItemName: data.originalItemName } : {}),
            authorName: typeof data.authorName === 'string' ? data.authorName : 'Anónimo',
            overallRating: typeof data.overallRating === 'number' ? data.overallRating : null,
            comment: typeof data.comment === 'string' ? data.comment : '',
            createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
        });
    });
    return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export type ItemProposalType = 'merge' | 'rename' | 'reassign_review';
// 'applying': un jefe la está aplicando ahora (reserva de reviewItemProposal).
// Si aplicar falla vuelve a 'pending' con applyError; si lleva más de 10
// minutos así, se quedó atascada y se puede reintentar (ver adminQueues).
export type ItemProposalStatus = 'pending' | 'applying' | 'approved' | 'rejected';

const ITEM_PROPOSAL_STATUSES: readonly ItemProposalStatus[] = ['pending', 'applying', 'approved', 'rejected'];

// Resultado que guarda reviewItemProposal al aprobar: fusión y mover reseña
// devuelven reassignedReviews; el renombre, renamed.
export interface ItemProposalApplyResult {
    reassignedReviews?: number;
    renamed?: boolean;
    [key: string]: unknown;
}

// Último intento de aplicarla que falló (la propuesta volvió a 'pending').
export interface ItemProposalApplyError {
    message: string;
    code?: string;
    by?: string;
    atMs?: number;
}

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
    reviewedBy?: string;
    reviewedAtMs?: number;
    applyResult?: ItemProposalApplyResult | null;
    // Desde cuándo está en 'applying' (con reviewedBy = quién la aplica).
    applyingAtMs?: number;
    applyError?: ItemProposalApplyError;
}

// Listas de Developer: el array de siempre más el aviso de truncado
// (hasMore: había más de las que se han traído) y degraded (índice en
// construcción, orden aproximado). Los métodos de array devuelven arrays normales.
export type QueueRows<T> = T[] & { hasMore: boolean; degraded: boolean };

const withQueueMeta = <T>(rows: T[], page: Pick<QueuePage, 'hasMore' | 'degraded'>): QueueRows<T> =>
    Object.assign(rows, { hasMore: page.hasMore, degraded: page.degraded });

const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value ? value : undefined;

const optionalMillis = (value: unknown): number | undefined => {
    const ms = toMillis(value);
    return ms > 0 ? ms : undefined;
};

const optionalCount = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

// Quién y cuándo decidió (y, tras el cambio B5 del backend, quién activó y cerró).
interface ResolutionFields {
    reviewedBy?: string;
    reviewedAtMs?: number;
    activatedBy?: string;
    activatedAtMs?: number;
    endedBy?: string;
    endedAtMs?: number;
    closedBy?: string;
    closedAtMs?: number;
}

const mapResolutionFields = (data: Record<string, unknown>): ResolutionFields => ({
    reviewedBy: optionalString(data.reviewedBy),
    reviewedAtMs: optionalMillis(data.reviewedAt),
    activatedBy: optionalString(data.activatedBy),
    activatedAtMs: optionalMillis(data.activatedAt),
    endedBy: optionalString(data.endedBy),
    endedAtMs: optionalMillis(data.endedAt),
    closedBy: optionalString(data.closedBy),
    closedAtMs: optionalMillis(data.closedAt),
});

const mapApplyError = (value: unknown): ItemProposalApplyError | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const raw = value as Record<string, unknown>;
    const message = optionalString(raw.message);
    if (!message) return undefined;
    return {
        message,
        code: optionalString(raw.code),
        by: optionalString(raw.by),
        atMs: optionalMillis(raw.at),
    };
};

export const mapProposal = (id: string, data: Record<string, unknown>): ItemProposal => {
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
    return {
        id,
        placeId: typeof data.placeId === 'string' ? data.placeId : '',
        placeName: typeof data.placeName === 'string' ? data.placeName : undefined,
        type: (['merge', 'rename', 'reassign_review'].includes(String(data.type)) ? data.type : 'merge') as ItemProposalType,
        payload: (data.payload && typeof data.payload === 'object' ? data.payload : {}) as Record<string, string>,
        note: typeof data.note === 'string' ? data.note : undefined,
        status: (ITEM_PROPOSAL_STATUSES as readonly string[]).includes(String(data.status)) ? data.status as ItemProposalStatus : 'pending',
        adminNotes: typeof data.adminNotes === 'string' ? data.adminNotes : undefined,
        createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
        createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
        reviewedBy: optionalString(data.reviewedBy),
        reviewedAtMs: optionalMillis(data.reviewedAt),
        applyResult: data.applyResult && typeof data.applyResult === 'object'
            ? data.applyResult as ItemProposalApplyResult
            : data.applyResult === null ? null : undefined,
        applyingAtMs: optionalMillis(data.applyingAt),
        applyError: mapApplyError(data.applyError),
    };
};

export const describeProposal = (proposal: ItemProposal): string => {
    if (proposal.type === 'merge') {
        return `Fusionar "${proposal.payload.sourceItemName || proposal.payload.sourceItemId}" con "${proposal.payload.targetItemName || proposal.payload.targetItemId}"`;
    }
    if (proposal.type === 'rename') {
        return `Renombrar "${proposal.payload.currentName}" a "${proposal.payload.newName}"`;
    }
    return `Mover la valoración "${proposal.payload.reviewItemName || ''}"${proposal.payload.reviewAuthorName ? ` de ${proposal.payload.reviewAuthorName}` : ''} a "${proposal.payload.targetItemName || proposal.payload.targetItemId}"`;
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

// Developer: propuestas pendientes, de la más antigua a la más reciente (máx. 100).
export const getPendingItemProposals = async (): Promise<QueueRows<ItemProposal>> => {
    const page = await fetchPending('itemProposals', { pageSize: 100 });
    return withQueueMeta(page.items.map((item) => mapProposal(item.id, item.data)), page);
};

// Reconstruye los items canónicos del lugar desde sus reseñas (cura lugares
// con reseñas anteriores al sistema de items persistidos). Solo gestores.
export const rebuildPlaceItems = async (placeId: string): Promise<void> => {
    const callable = httpsCallable(functions, 'rebuildPlaceItemsForManager');
    await callable({ placeId });
};

// Elemento recién creado tal y como queda en places/{placeId}/items/{itemId}
// (precio ya normalizado por el servidor), para pintarlo sin recargar la carta.
export interface CreatedBusinessItem {
    itemId: string;
    name: string;
    item: CanonicalPlaceItem;
}

interface CreateBusinessItemResponse {
    ok?: boolean;
    itemId?: string;
    name?: string;
    item?: Partial<CanonicalPlaceItem> | null;
}

// listId: la lista pública de Listopic en la que encaja el plato (opcional).
export const createBusinessItem = async (
    placeId: string,
    name: string,
    businessData?: Partial<ItemBusinessData>,
    listId?: string | null,
): Promise<CreatedBusinessItem> => {
    const callable = httpsCallable<unknown, CreateBusinessItemResponse>(functions, 'createBusinessItem');
    const result = await callable(listId ? { placeId, name, businessData, listId } : { placeId, name, businessData });
    const data = result.data || {};
    const raw = data.item || {};
    const itemId = data.itemId || (typeof raw.id === 'string' && raw.id) || itemDocIdFromName(name);
    const canonicalName = (typeof raw.canonicalName === 'string' && raw.canonicalName) || data.name || name;
    // Si el backend aún no devuelve `item` (despliegue anterior), se reconstruye
    // con lo enviado para no tener que recargar.
    const item: CanonicalPlaceItem = {
        id: itemId,
        canonicalName,
        status: raw.status || 'active',
        source: raw.source || 'business',
        // Un servidor anterior no guarda la lista (ni devuelve linkedListIds): vacío, no la enviada.
        linkedListIds: Array.isArray(raw.linkedListIds) ? raw.linkedListIds : [],
        businessData: raw.businessData || { ...EMPTY_ITEM_BUSINESS_DATA, ...(businessData || {}) },
        stats: raw.stats || { reviewCount: 0, ratingCount: 0, ratingTotal: 0, averageRating: null, photoCount: 0 },
    };
    return { itemId, name: canonicalName, item };
};

// details del HttpsError 'already-exists' de createBusinessItem: el elemento
// que ya ocupa ese nombre (o lo tuvo antes de un renombre).
export interface BusinessItemExistsDetails {
    itemId: string;
    canonicalName: string;
}

export const getBusinessItemExistsDetails = (error: unknown): BusinessItemExistsDetails | null => {
    if (!error || typeof error !== 'object') return null;
    const { code, details } = error as { code?: unknown; details?: unknown };
    if (code !== 'functions/already-exists' && code !== 'already-exists') return null;
    if (!details || typeof details !== 'object') return null;
    const { itemId, canonicalName } = details as { itemId?: unknown; canonicalName?: unknown };
    if (typeof itemId !== 'string' || !itemId) return null;
    return { itemId, canonicalName: typeof canonicalName === 'string' ? canonicalName : '' };
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

// Aplicar una propuesta reconstruye la carta y el servidor tiene hasta 300 s.
// El navegador espera algo más (por defecto serían 70 s y cortaría antes con
// un deadline-exceeded en inglés).
export const reviewItemProposal = async (
    proposalId: string,
    decision: 'approve' | 'reject',
    adminNotes?: string,
): Promise<void> => {
    const callable = httpsCallable(functions, 'reviewItemProposal', { timeout: 310_000 });
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
    createdBy?: string;
    reviewedBy?: string;
    reviewedAtMs?: number;
    // Hoy solo los escribe el cierre automático (endedAt) o nadie (el resto);
    // quedan listos para cuando el backend los guarde (B5).
    activatedBy?: string;
    activatedAtMs?: number;
    endedBy?: string;
    endedAtMs?: number;
    closedBy?: string;
    closedAtMs?: number;
}

export const mapPlacement = (id: string, data: Record<string, unknown>): SponsoredPlacement => {
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
        createdBy: optionalString(data.createdBy),
        ...mapResolutionFields(data),
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

// Developer: campañas solicitadas y activas, de la más antigua a la más reciente (máx. 100).
export const getOpenSponsoredPlacements = async (): Promise<QueueRows<SponsoredPlacement>> => {
    const page = await fetchQueue('sponsoredPlacements', { statuses: ['requested', 'active'], direction: 'asc', pageSize: 100 });
    return withQueueMeta(page.items.map((item) => mapPlacement(item.id, item.data)), page);
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

// ── Platos destacados por radio (sorteo ponderado por papeletas) ────────────

// 1 impulso = 0,2 km de radio × 1 día × 1 papeleta. Una campaña gasta
// tramos × días × intensidad impulsos del saldo del local. La intensidad son
// papeletas en el sorteo del carrusel (×2 = doble probabilidad que ×1).
// Espejo de functions/modules/lib/impulse-pricing.js.
export const SPOTLIGHT_UNIT_SINGULAR = 'impulso';
export const SPOTLIGHT_UNIT_PLURAL = 'impulsos';
export const SPOTLIGHT_RADIUS_STEP_KM = 0.2;

export interface ImpulsePack {
    impulses: number;
    priceEur: number;
}

export interface SpotlightPricing {
    pricePerImpulseEur: number;
    minRadiusKm: number;
    maxRadiusKm: number;
    maxIntensity: number;
    maxDays: number;
    minPurchaseImpulses: number;
    packs: ImpulsePack[];
}

export const DEFAULT_SPOTLIGHT_PRICING: SpotlightPricing = {
    pricePerImpulseEur: 0.05,
    minRadiusKm: 0.2,
    maxRadiusKm: 20,
    maxIntensity: 10,
    maxDays: 60,
    minPurchaseImpulses: 100,
    packs: [
        { impulses: 100, priceEur: 5 },
        { impulses: 500, priceEur: 22.5 },
        { impulses: 2000, priceEur: 80 },
        { impulses: 10000, priceEur: 350 },
    ],
};

const isPositiveNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

export const normalizeSpotlightPricing = (data: Record<string, unknown>): SpotlightPricing => {
    const pricing: SpotlightPricing = { ...DEFAULT_SPOTLIGHT_PRICING, packs: DEFAULT_SPOTLIGHT_PRICING.packs.map((pack) => ({ ...pack })) };
    (['pricePerImpulseEur', 'minRadiusKm', 'maxRadiusKm', 'maxIntensity', 'maxDays', 'minPurchaseImpulses'] as const).forEach((key) => {
        const value = data[key];
        if (isPositiveNumber(value)) pricing[key] = value;
    });
    // Configuración anterior (impulsos = papeletas por semanas).
    if (!isPositiveNumber(data.maxIntensity) && isPositiveNumber(data.maxUnitsPerCampaign)) pricing.maxIntensity = data.maxUnitsPerCampaign;
    if (!isPositiveNumber(data.maxDays) && isPositiveNumber(data.maxWeeks)) pricing.maxDays = data.maxWeeks * 7;
    if (Array.isArray(data.packs)) {
        pricing.packs = data.packs
            .filter((pack): pack is ImpulsePack => Boolean(pack) && Number.isInteger((pack as ImpulsePack).impulses)
                && (pack as ImpulsePack).impulses > 0 && isPositiveNumber((pack as ImpulsePack).priceEur))
            .map((pack) => ({ impulses: pack.impulses, priceEur: pack.priceEur }))
            .sort((a, b) => a.impulses - b.impulses);
    }
    pricing.maxIntensity = Math.floor(pricing.maxIntensity);
    pricing.maxDays = Math.floor(pricing.maxDays);
    pricing.minPurchaseImpulses = Math.floor(pricing.minPurchaseImpulses);
    pricing.minRadiusKm = Number((Math.ceil((pricing.minRadiusKm / SPOTLIGHT_RADIUS_STEP_KM) - 1e-9) * SPOTLIGHT_RADIUS_STEP_KM).toFixed(1));
    pricing.maxRadiusKm = Number((Math.floor((pricing.maxRadiusKm / SPOTLIGHT_RADIUS_STEP_KM) + 1e-9) * SPOTLIGHT_RADIUS_STEP_KM).toFixed(1));
    if (pricing.maxRadiusKm < pricing.minRadiusKm) pricing.maxRadiusKm = pricing.minRadiusKm;
    return pricing;
};

export const getSpotlightPricing = async (): Promise<SpotlightPricing> => {
    const snap = await getDoc(doc(db, 'config', 'sponsoredPricing')).catch(() => null);
    return normalizeSpotlightPricing(snap?.exists() ? snap.data() as Record<string, unknown> : {});
};

export const spotlightRadiusSteps = (pricing: SpotlightPricing, radiusKm: number): number =>
    Math.ceil((Math.max(pricing.minRadiusKm, radiusKm) / SPOTLIGHT_RADIUS_STEP_KM) - 1e-9);

// Impulsos de una campaña = tramos de 0,2 km × días × intensidad.
export const computeSpotlightImpulses = (
    pricing: SpotlightPricing,
    campaign: { radiusKm: number; days: number; intensity: number },
): number => spotlightRadiusSteps(pricing, campaign.radiusKm) * campaign.days * campaign.intensity;

export const impulsesPriceEur = (pricing: SpotlightPricing, impulses: number): number =>
    Math.round(impulses * pricing.pricePerImpulseEur * 100) / 100;

// Descuento de un paquete frente al precio de lista (negativo si sale más caro).
export const packDiscountPercent = (pricing: SpotlightPricing, pack: ImpulsePack): number => {
    const list = pack.impulses * pricing.pricePerImpulseEur;
    return list > 0 ? Math.round((1 - pack.priceEur / list) * 100) : 0;
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
    // Papeletas en el sorteo (intensidad).
    units: number;
    days?: number;
    weeks?: number;
    impulses?: number;
    totalPriceEur?: number;
    startsAt?: string;
    endsAt?: string;
    status: ItemSpotlightStatus;
    adminNotes?: string;
    // El plato salió de la carta sin fusión: la campaña no se sirve hasta que
    // un admin decida (lo marca el servidor al reconstruir la carta).
    itemInactive: boolean;
    metrics: SponsoredMetrics;
    createdAtMs: number;
    createdBy?: string;
    // Impulsos pagados con saldo de regalo y los que quedan por facturar
    // (impulses = creditsUsed + billedImpulses; totalPriceEur es solo lo facturado).
    creditsUsed?: number;
    billedImpulses?: number;
    pricePerImpulseEur?: number;
    // Al rechazar, el backend devuelve creditsUsed al saldo del local
    // (mapSpotlight siempre lo rellena; opcional para los objetos hechos a mano).
    creditsRefunded?: boolean;
    creditsRefundedAtMs?: number;
    reviewedBy?: string;
    reviewedAtMs?: number;
    // startsAt es la fecha de activación; activatedBy/endedBy/closed* llegarán con B5.
    activatedBy?: string;
    activatedAtMs?: number;
    endedBy?: string;
    endedAtMs?: number;
    closedBy?: string;
    closedAtMs?: number;
}

export const mapSpotlight = (id: string, data: Record<string, unknown>): ItemSpotlight => {
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
        days: typeof data.days === 'number' && data.days > 0 ? data.days : undefined,
        weeks: typeof data.weeks === 'number' && data.weeks > 0 ? data.weeks : undefined,
        impulses: typeof data.impulses === 'number' && data.impulses > 0 ? data.impulses : undefined,
        totalPriceEur: typeof data.totalPriceEur === 'number' ? data.totalPriceEur : undefined,
        startsAt: typeof data.startsAt === 'string' ? data.startsAt : undefined,
        endsAt: typeof data.endsAt === 'string' ? data.endsAt : undefined,
        status: (['requested', 'active', 'rejected', 'ended'].includes(String(data.status)) ? data.status : 'requested') as ItemSpotlightStatus,
        adminNotes: typeof data.adminNotes === 'string' ? data.adminNotes : undefined,
        itemInactive: data.itemInactive === true,
        metrics: mapSponsoredMetrics(data),
        createdAtMs: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0,
        createdBy: optionalString(data.createdBy),
        creditsUsed: optionalCount(data.creditsUsed),
        billedImpulses: optionalCount(data.billedImpulses),
        pricePerImpulseEur: optionalCount(data.pricePerImpulseEur),
        creditsRefunded: data.creditsRefunded === true,
        creditsRefundedAtMs: optionalMillis(data.creditsRefundedAt),
        ...mapResolutionFields(data),
    };
};

export interface ItemSpotlightRequestResult {
    spotlightId: string;
    impulses: number;
    creditsUsed: number;
    billedImpulses: number;
    totalPriceEur: number;
}

export const requestItemSpotlight = async (input: {
    placeId: string;
    itemId: string;
    radiusKm: number;
    days: number;
    intensity: number;
}): Promise<ItemSpotlightRequestResult> => {
    const callable = httpsCallable<unknown, ItemSpotlightRequestResult>(functions, 'requestItemSpotlight');
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

// Developer: platos solicitados y activos, del más antiguo al más reciente (máx. 100).
export const getOpenItemSpotlights = async (): Promise<QueueRows<ItemSpotlight>> => {
    const page = await fetchQueue('sponsoredItemSpotlights', { statuses: ['requested', 'active'], direction: 'asc', pageSize: 100 });
    return withQueueMeta(page.items.map((item) => mapSpotlight(item.id, item.data)), page);
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
        .filter((spotlight) => !spotlight.itemInactive
            && (!spotlight.startsAt || spotlight.startsAt <= today)
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

// ── Reparación de cartas (solo jefe) ────────────────────────────────────────

export interface RepairNameGroup {
    name: string;
    itemIds: string[];
}

export interface RepairPlaceItemsCounters {
    renamedReviews: number;
    stampedReviews: number;
    deactivatedItems: number;
    mergedItems: number;
    fixedMergedItems: number;
    spotlightsUpdated: number;
}

export interface RepairPlaceItemsPlace extends RepairPlaceItemsCounters {
    placeId: string;
    placeName: string | null;
    conflicts: RepairNameGroup[];
    duplicates: RepairNameGroup[];
    /** El servidor sigue con el resto de lugares si uno falla. */
    error?: string;
}

export interface RepairPlaceItemsResult {
    ok: boolean;
    dryRun: boolean;
    places: RepairPlaceItemsPlace[];
    totals: RepairPlaceItemsCounters & { places: number };
    truncated: boolean;
}

const REPAIR_COUNTER_KEYS: Array<keyof RepairPlaceItemsCounters> = [
    'renamedReviews', 'stampedReviews', 'deactivatedItems', 'mergedItems', 'fixedMergedItems', 'spotlightsUpdated',
];

const asCount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

const mapNameGroups = (value: unknown): RepairNameGroup[] => (Array.isArray(value) ? value : [])
    .map((entry) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as { name?: unknown; itemIds?: unknown };
        return {
            name: typeof row.name === 'string' ? row.name : '',
            itemIds: Array.isArray(row.itemIds) ? row.itemIds.filter((id): id is string => typeof id === 'string') : [],
        };
    });

const mapRepairCounters = (data: Record<string, unknown>): RepairPlaceItemsCounters => (
    Object.fromEntries(REPAIR_COUNTER_KEYS.map((key) => [key, asCount(data[key])])) as unknown as RepairPlaceItemsCounters
);

// Alinea los elementos de carta con el modelo nuevo: reescribe el nombre de las
// valoraciones curadas, recupera alias de renombres/fusiones aprobados, cierra
// duplicados y refresca los platos destacados. Con dryRun solo cuenta.
export const adminRepairPlaceItems = async (input: { placeId?: string; dryRun: boolean }): Promise<RepairPlaceItemsResult> => {
    // El servidor admite 540 s; con los 70 s por defecto el navegador dejaría de esperar antes.
    const callable = httpsCallable<unknown, Record<string, unknown>>(functions, 'adminRepairPlaceItems', { timeout: 550_000 });
    const placeId = input.placeId?.trim();
    const result = await callable(placeId ? { placeId, dryRun: input.dryRun } : { dryRun: input.dryRun });
    const data = result.data || {};
    const places = (Array.isArray(data.places) ? data.places : []).map((entry): RepairPlaceItemsPlace => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        return {
            placeId: typeof row.placeId === 'string' ? row.placeId : '',
            placeName: typeof row.placeName === 'string' && row.placeName ? row.placeName : null,
            ...mapRepairCounters(row),
            conflicts: mapNameGroups(row.conflicts),
            duplicates: mapNameGroups(row.duplicates),
            ...(typeof row.error === 'string' && row.error ? { error: row.error } : {}),
        };
    });
    const totals = (data.totals && typeof data.totals === 'object' ? data.totals : {}) as Record<string, unknown>;
    return {
        ok: data.ok === true,
        dryRun: data.dryRun !== false,
        places,
        totals: { places: asCount(totals.places) || places.length, ...mapRepairCounters(totals) },
        truncated: data.truncated === true,
    };
};
