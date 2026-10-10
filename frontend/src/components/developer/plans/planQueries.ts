/**
 * planQueries: lecturas de Firestore de la pestaña «Planes» (consultas de
 * cliente que las reglas permiten al jefe). Las claves de react-query cuelgan
 * de ['developer','plans', …], así que invalidateQueries({ queryKey: ['developer'] })
 * tras cada cambio refresca la pestaña, la bandeja y los contadores.
 *
 * API
 *   PLANS_QUERY_KEY = ['developer','plans'], planPlaceKey(id), planUserKey(id)
 *   fetchAttention(now?)            ⏳ Pro manual/prueba que caduca en ≤14 d, 💳 pagos con problema,
 *                                   🛒 checkouts sin terminar (campo único; sin índices compuestos)
 *   fetchPlaceList('pro'|'verified')   where businessProActive|businessVerified == true, máx. 200, más count
 *   fetchPlace(id) / searchPlaces(term) getDoc exacto y prefijo de nombre (name >= t && <= t+'')
 *   fetchPremiumUsers() / fetchUser(id) / searchUsers(term)   premium.active == true; uid, @username o email
 *   fetchProCount()
 *   fetchPlanHistory({ filter, cursor })   adminAuditLog action in […] orderBy createdAt desc (índice
 *                                          action+createdAt); sin índice: sin orden, 200 y ordenado aquí
 *   fetchImpulsePurchases({ cursor })      impulsePurchases orderBy createdAt desc
 *   fetchInterestSummary() / fetchInterestPage({ filter, cursor })   beta «Lo quiero»
 */
import {
    collection,
    doc,
    getCountFromServer,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    where,
    type DocumentData,
    type Query,
    type QueryConstraint,
    type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { FALLBACK_LIMIT, isMissingIndexError, looksLikeId } from '../../../services/adminQueues';
import { DAY_MS } from '../../../utils/adminTime';
import { PLAN_EXPIRY_WINDOW_DAYS } from '../../../hooks/useDeveloperInbox';
import {
    BILLING_PROBLEM_STATUSES,
    CHECKOUT_STARTED,
    compareByExpiry,
    compareByName,
    historyActionsFor,
    mapHistoryEntry,
    mapImpulsePurchase,
    mapInterestRow,
    mapPlanPlace,
    mapPlanUser,
    type BetaFilter,
    type HistoryFilter,
    type ImpulsePurchaseRow,
    type InterestRow,
    type PlanHistoryEntry,
    type PlanPlace,
    type PlanUser,
} from './planUtils';

export const PLANS_QUERY_KEY = ['developer', 'plans'] as const;
export const planPlaceKey = (id: string) => ['developer', 'plans', 'place', id] as const;
export const planUserKey = (id: string) => ['developer', 'plans', 'user', id] as const;

export const ATTENTION_LIMIT = 50;
export const PLACES_LIMIT = 200;
export const USERS_LIMIT = 200;
export const HISTORY_PAGE = 25;
export const PURCHASES_PAGE = 25;
export const INTEREST_PAGE = 25;
const SEARCH_LIMIT = 10;

export type PageCursor = QueryDocumentSnapshot<DocumentData>;

const placesRef = () => collection(db, 'places');
const usersRef = () => collection(db, 'users');

const count = async (target: Query<DocumentData>): Promise<number> => (await getCountFromServer(target)).data().count;

const safeCount = async (label: string, target: () => Query<DocumentData>): Promise<number | null> => {
    try {
        return await count(target());
    } catch (error) {
        console.warn(`planQueries: no se pudo contar ${label}`, error);
        return null;
    }
};

const docsToPlaces = (docs: Array<{ id: string; data: () => DocumentData }>, now: number): PlanPlace[] =>
    docs.map((placeDoc) => mapPlanPlace(placeDoc.id, placeDoc.data() as Record<string, unknown>, now));

const uniqueById = <T extends { id: string }>(rows: T[]): T[] => {
    const seen = new Set<string>();
    return rows.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
    });
};

// ── ⚠️ Atención ─────────────────────────────────────────────────────────────

export interface AttentionSectionData {
    rows: PlanPlace[];
    error: string | null;
}

export interface PlanAttention {
    expiring: AttentionSectionData;
    billing: AttentionSectionData;
    checkouts: AttentionSectionData;
    fetchedAt: number;
}

const settle = async (label: string, task: () => Promise<PlanPlace[]>): Promise<AttentionSectionData> => {
    try {
        return { rows: await task(), error: null };
    } catch (error) {
        console.warn(`planQueries: no se pudo cargar ${label}`, error);
        return { rows: [], error: 'No se pudo cargar' };
    }
};

const byBillingDate = (a: PlanPlace, b: PlanPlace) =>
    (a.billingUpdatedAtMs || Number.MAX_SAFE_INTEGER) - (b.billingUpdatedAtMs || Number.MAX_SAFE_INTEGER);

export async function fetchAttention(now: number = Date.now()): Promise<PlanAttention> {
    const [expiring, billing, checkouts] = await Promise.all([
        settle('Business Pro que caduca', async () => {
            const snap = await getDocs(query(
                placesRef(),
                where('businessPlanExpiresAt', '>', new Date(now)),
                where('businessPlanExpiresAt', '<=', new Date(now + PLAN_EXPIRY_WINDOW_DAYS * DAY_MS)),
                orderBy('businessPlanExpiresAt', 'asc'),
                limit(ATTENTION_LIMIT),
            ));
            return docsToPlaces(snap.docs, now)
                .filter((place) => place.proFlag && (place.plan.source === 'manual' || place.plan.source === 'trial'));
        }),
        settle('Pagos con problema', async () => {
            const snap = await getDocs(query(
                placesRef(),
                where('businessBillingStatus', 'in', [...BILLING_PROBLEM_STATUSES]),
                limit(ATTENTION_LIMIT),
            ));
            return docsToPlaces(snap.docs, now).sort(byBillingDate);
        }),
        settle('Checkouts sin terminar', async () => {
            const snap = await getDocs(query(
                placesRef(),
                where('businessBillingStatus', '==', CHECKOUT_STARTED),
                limit(ATTENTION_LIMIT),
            ));
            return docsToPlaces(snap.docs, now).sort(byBillingDate);
        }),
    ]);
    return { expiring, billing, checkouts, fetchedAt: now };
}

// ── Pro activos / Verificados ───────────────────────────────────────────────

export type PlaceListKind = 'pro' | 'verified';

export interface PlaceList {
    rows: PlanPlace[];
    /** Documentos leídos (en «Verificados sin Pro», antes de quitar los que tienen Pro). */
    loaded: number;
    /** Total real (count) de la consulta; null si no se pudo contar. */
    total: number | null;
    /** Se llegó al límite: hay más en el servidor de los que se muestran. */
    truncated: boolean;
    fetchedAt: number;
}

export async function fetchPlaceList(kind: PlaceListKind, now: number = Date.now()): Promise<PlaceList> {
    const field = kind === 'pro' ? 'businessProActive' : 'businessVerified';
    const listQuery = query(placesRef(), where(field, '==', true), limit(PLACES_LIMIT));
    const [snap, total] = await Promise.all([
        getDocs(listQuery),
        safeCount(field, () => query(placesRef(), where(field, '==', true))),
    ]);
    const all = docsToPlaces(snap.docs, now);
    const rows = kind === 'pro'
        ? all.sort(compareByExpiry)
        : all.filter((place) => !place.plan.isPro).sort(compareByName);
    return {
        rows,
        loaded: snap.docs.length,
        total,
        truncated: snap.docs.length >= PLACES_LIMIT || (total !== null && total > snap.docs.length),
        fetchedAt: now,
    };
}

export const fetchProCount = (): Promise<number | null> =>
    safeCount('businessProActive', () => query(placesRef(), where('businessProActive', '==', true)));

export async function fetchPlace(id: string, now: number = Date.now()): Promise<PlanPlace | null> {
    const snap = await getDoc(doc(db, 'places', id));
    return snap.exists() ? mapPlanPlace(snap.id, snap.data() as Record<string, unknown>, now) : null;
}

const capitalize = (text: string): string => text.charAt(0).toLocaleUpperCase('es-ES') + text.slice(1);

/**
 * Locales fuera de lo cargado: el documento con ese id (si parece un id) y
 * los que empiezan por ese nombre (tal cual y con mayúscula inicial).
 */
export async function searchPlaces(term: string, now: number = Date.now()): Promise<PlanPlace[]> {
    const text = term.trim();
    if (text.length < 3 || text.includes('/')) return [];
    const tasks: Array<Promise<PlanPlace[]>> = [];
    if (looksLikeId(text)) {
        tasks.push(fetchPlace(text, now).then((place) => (place ? [place] : [])));
    }
    Array.from(new Set([text, capitalize(text)])).forEach((prefix) => {
        tasks.push(getDocs(query(
            placesRef(),
            where('name', '>=', prefix),
            where('name', '<=', `${prefix}`),
            limit(SEARCH_LIMIT),
        )).then((snap) => docsToPlaces(snap.docs, now)));
    });
    const results = await Promise.allSettled(tasks);
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length === results.length) throw (failed[0] as PromiseRejectedResult).reason;
    return uniqueById(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])));
}

// ── 👑 Premium usuarios ──────────────────────────────────────────────────────

export interface UserList {
    rows: PlanUser[];
    loaded: number;
    total: number | null;
    truncated: boolean;
    fetchedAt: number;
}

const compareUsers = (a: PlanUser, b: PlanUser): number => {
    const aMs = a.premiumExpiresAtMs || Number.MAX_SAFE_INTEGER;
    const bMs = b.premiumExpiresAtMs || Number.MAX_SAFE_INTEGER;
    return (aMs - bMs) || (a.username || a.displayName || a.id).localeCompare(b.username || b.displayName || b.id, 'es');
};

export async function fetchPremiumUsers(now: number = Date.now()): Promise<UserList> {
    const [snap, total] = await Promise.all([
        getDocs(query(usersRef(), where('premium.active', '==', true), limit(USERS_LIMIT))),
        safeCount('premium.active', () => query(usersRef(), where('premium.active', '==', true))),
    ]);
    const rows = snap.docs.map((userDoc) => mapPlanUser(userDoc.id, userDoc.data() as Record<string, unknown>, now)).sort(compareUsers);
    return {
        rows,
        loaded: snap.docs.length,
        total,
        truncated: snap.docs.length >= USERS_LIMIT || (total !== null && total > snap.docs.length),
        fetchedAt: now,
    };
}

export async function fetchUser(id: string, now: number = Date.now()): Promise<PlanUser | null> {
    const snap = await getDoc(doc(db, 'users', id));
    return snap.exists() ? mapPlanUser(snap.id, snap.data() as Record<string, unknown>, now) : null;
}

/** Todos los usuarios que coinciden por uid, @username o email (no solo el primero). */
export async function searchUsers(term: string, now: number = Date.now()): Promise<PlanUser[]> {
    const text = term.trim();
    if (text.length < 3) return [];
    const normalized = text.toLowerCase().replace(/^@/, '');
    const tasks: Array<Promise<PlanUser[]>> = [];
    if (!/[\s/]/.test(text)) tasks.push(fetchUser(text, now).then((user) => (user ? [user] : [])));
    const byField = (field: string, value: string) => getDocs(query(usersRef(), where(field, '==', value), limit(SEARCH_LIMIT)))
        .then((snap) => snap.docs.map((userDoc) => mapPlanUser(userDoc.id, userDoc.data() as Record<string, unknown>, now)));
    tasks.push(byField('usernameLower', normalized));
    if (text.includes('@') && !text.startsWith('@')) {
        tasks.push(byField('emailLowerCase', normalized));
        tasks.push(byField('email', text));
    }
    const results = await Promise.allSettled(tasks);
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length === results.length) throw (failed[0] as PromiseRejectedResult).reason;
    return uniqueById(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])));
}

// ── 🗂️ Historial ─────────────────────────────────────────────────────────────

export interface CursorPage<T> {
    rows: T[];
    cursor: PageCursor | null;
    hasMore: boolean;
    /** Falta el índice (en construcción): sin paginar y con orden aproximado. */
    degraded: boolean;
}

const pageOf = <T>(docs: PageCursor[], rows: T[], pageSize: number): CursorPage<T> => ({
    rows,
    cursor: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore: docs.length >= pageSize,
    degraded: false,
});

export async function fetchPlanHistory(
    { filter, cursor = null, pageSize = HISTORY_PAGE }: { filter: HistoryFilter; cursor?: PageCursor | null; pageSize?: number },
): Promise<CursorPage<PlanHistoryEntry>> {
    const actions = [...historyActionsFor(filter)];
    const actionConstraint: QueryConstraint = where('action', 'in', actions);
    const auditRef = collection(db, 'adminAuditLog');
    try {
        const snap = await getDocs(query(
            auditRef,
            actionConstraint,
            orderBy('createdAt', 'desc'),
            ...(cursor ? [startAfter(cursor)] : []),
            limit(pageSize),
        ));
        return pageOf(snap.docs, snap.docs.map((entry) => mapHistoryEntry(entry.id, entry.data() as Record<string, unknown>)), pageSize);
    } catch (error) {
        if (cursor || !isMissingIndexError(error)) throw error;
        console.warn('planQueries: falta el índice adminAuditLog (action, createdAt); orden aproximado', error);
        const snap = await getDocs(query(auditRef, actionConstraint, limit(FALLBACK_LIMIT)));
        const rows = snap.docs
            .map((entry) => mapHistoryEntry(entry.id, entry.data() as Record<string, unknown>))
            .sort((a, b) => b.createdAtMs - a.createdAtMs);
        return { rows, cursor: null, hasMore: false, degraded: true };
    }
}

export async function fetchImpulsePurchases(
    { cursor = null, pageSize = PURCHASES_PAGE }: { cursor?: PageCursor | null; pageSize?: number } = {},
): Promise<CursorPage<ImpulsePurchaseRow>> {
    const snap = await getDocs(query(
        collection(db, 'impulsePurchases'),
        orderBy('createdAt', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(pageSize),
    ));
    return pageOf(snap.docs, snap.docs.map((entry) => mapImpulsePurchase(entry.id, entry.data() as Record<string, unknown>)), pageSize);
}

// ── 🧪 Beta «Lo quiero» ──────────────────────────────────────────────────────

export interface InterestSummary {
    /** Negocios que han pulsado «Lo quiero» (planInterest de business_pro). */
    interested: number | null;
    withoutPlace: number | null;
    yearly: number | null;
    /** Locales con Business Pro en prueba ahora (beta y concedidas en Developer con fecha). */
    trialsNow: number | null;
    /** De ellos, los que vienen de la beta. */
    betaTrialsNow: number | null;
    /** Pruebas de la beta concedidas desde el principio (audit log). */
    betaTrialsGranted: number | null;
    fetchedAt: number;
}

export async function fetchInterestSummary(now: number = Date.now()): Promise<InterestSummary> {
    const interest = collection(db, 'planInterest');
    const business = where('plan', '==', 'business_pro');
    // Solo igualdades: bastan los índices de campo único.
    const [interested, withoutPlace, yearly, trialsNow, betaTrialsNow, betaTrialsGranted] = await Promise.all([
        safeCount('planInterest', () => query(interest, business)),
        safeCount('planInterest sin local', () => query(interest, business, where('placeId', '==', null))),
        safeCount('planInterest anual', () => query(interest, business, where('billing', '==', 'yearly'))),
        safeCount('pruebas activas', () => query(placesRef(), where('businessPlanSource', '==', 'trial'), where('businessProActive', '==', true))),
        safeCount('pruebas beta activas', () => query(placesRef(), where('businessPlanGrantedBy', '==', 'beta'), where('businessProActive', '==', true))),
        safeCount('pruebas beta concedidas', () => query(collection(db, 'adminAuditLog'), where('action', '==', 'businessPlan.betaTrial'))),
    ]);
    return { interested, withoutPlace, yearly, trialsNow, betaTrialsNow, betaTrialsGranted, fetchedAt: now };
}

export async function fetchInterestPage(
    { filter, cursor = null, pageSize = INTEREST_PAGE }: { filter: BetaFilter; cursor?: PageCursor | null; pageSize?: number },
): Promise<CursorPage<InterestRow>> {
    const interest = collection(db, 'planInterest');
    if (filter === 'noPlace') {
        // Igualdades sin orden (sin índice compuesto): se ordena aquí.
        const snap = await getDocs(query(
            interest,
            where('plan', '==', 'business_pro'),
            where('placeId', '==', null),
            limit(FALLBACK_LIMIT),
        ));
        const rows = snap.docs
            .map((entry) => mapInterestRow(entry.id, entry.data() as Record<string, unknown>))
            .sort((a, b) => b.lastAtMs - a.lastAtMs);
        return { rows, cursor: null, hasMore: false, degraded: false };
    }
    const snap = await getDocs(query(
        interest,
        orderBy('lastAt', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(pageSize),
    ));
    return pageOf(snap.docs, snap.docs.map((entry) => mapInterestRow(entry.id, entry.data() as Record<string, unknown>)), pageSize);
}
