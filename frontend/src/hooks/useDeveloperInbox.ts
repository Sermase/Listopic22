/**
 * useDeveloperInbox: datos de la bandeja «📥 Pendientes» y de los contadores
 * de la barra lateral de Developer (react-query, consultas de cliente con
 * permiso de jefe: pasa `enabled = jefeClaim.status === 'ready'`).
 *
 * API
 *   useDeveloperPendingCounts(enabled: boolean): UseQueryResult<DeveloperPendingCounts>
 *       queryKey ['developer','pendingCounts'], staleTime 60 s, refetchOnWindowFocus.
 *       Solo consultas count (filas 2 a 9 y 11 del diseño). Para la barra lateral:
 *       data.badges[tab] = { review, attention } con tab en
 *       'pending' | 'reports' | 'businessClaims' | 'plans' | 'proProposals'.
 *       review > 0 → contador rojo/ámbar; si no, attention > 0 → punto ámbar; 0 y 0 → nada.
 *   useDeveloperInbox(enabled: boolean): UseQueryResult<DeveloperInbox>
 *       queryKey ['developer','inbox'], staleTime 60 s. Filas completas; solo para PendingInboxTab.
 *   useInvalidateDeveloper(): () => Promise<void>
 *       invalidateQueries({ queryKey: ['developer'] }); llámalo tras cada decisión.
 *   fetchDeveloperPendingCounts(now?) / fetchDeveloperInbox(now?)   las mismas cargas sin hook
 *   DEVELOPER_QUERY_KEY, DEVELOPER_PENDING_COUNTS_KEY, DEVELOPER_INBOX_KEY
 *
 * DeveloperInbox
 *   groups: InboxGroup[]          siempre 6, en este orden: urgentReports, reports, businessClaims,
 *                                 itemProposals, sponsoredPlacements, sponsoredItemSpotlights.
 *                                 items del más antiguo al más reciente (muestra 5 y «Ver N más →» a target).
 *                                 En solicitudes, badges «⚠️ Ya verificado · propietario» (userId = dueño)
 *                                 y «👥 N solicitudes para este lugar».
 *   attention: AttentionSection[] planExpiring ⏳, billing 💳, campaignOverdue 🧹 y
 *                                 campaignEndingSoon 📅 (informative: no suma en «Atención»).
 *   followUp                      betaLeads 👋 y checkoutsStarted 🛒 (counts) con su destino.
 *   summary                       toReview, urgent, attention, oldestMs (tarjetas de arriba).
 *   degraded                      algún índice en construcción (orden aproximado).
 *   errors                        nombres de las secciones que no se pudieron cargar.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    collection,
    doc,
    getCountFromServer,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    where,
    type DocumentData,
    type Query,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    QUEUES,
    countByStatus,
    fetchActive,
    fetchPending,
    type InboxBadge,
    type InboxItem,
    type QueueKey,
    type QueuePage,
    type QueueTarget,
} from '../services/adminQueues';
import { DAY_MS, addDaysIso, formatDate, todayIso, toMillis, formatUntil } from '../utils/adminTime';
import { PLAN_SOURCE_LABELS, type BusinessPlanSource } from '../utils/businessPlan';

export const DEVELOPER_QUERY_KEY = ['developer'] as const;
export const DEVELOPER_PENDING_COUNTS_KEY = ['developer', 'pendingCounts'] as const;
export const DEVELOPER_INBOX_KEY = ['developer', 'inbox'] as const;

const STALE_MS = 60 * 1000;
export const PLAN_EXPIRY_WINDOW_DAYS = 14;
export const ENDING_SOON_DAYS = 3;
const BILLING_PROBLEM_STATUSES = ['past_due', 'unpaid'];
const URGENT_GROUP_KEY = 'urgentReports';

// ── Tipos ───────────────────────────────────────────────────────────────────

export type SidebarBadgeTab = 'pending' | 'reports' | 'businessClaims' | 'plans' | 'proProposals';

export interface SidebarBadge {
    /** Elementos por revisar (contador rojo/ámbar). */
    review: number;
    /** Elementos que piden atención (punto ámbar con número). */
    attention: number;
}

export interface DeveloperPendingCounts {
    reports: number | null;
    businessClaims: number | null;
    itemProposals: number | null;
    sponsoredPlacements: number | null;
    sponsoredItemSpotlights: number | null;
    /** Aproximado: locales con caducidad en 14 días (la lista filtra además Pro activo manual/prueba). */
    plansExpiring: number | null;
    billingProblems: number | null;
    campaignsOverdue: number | null;
    betaLeads: number | null;
    toReview: number;
    attention: number;
    badges: Record<SidebarBadgeTab, SidebarBadge>;
    fetchedAt: number;
}

export type InboxGroupKey = typeof URGENT_GROUP_KEY | QueueKey;

export interface InboxGroup {
    key: InboxGroupKey;
    emoji: string;
    title: string;
    items: InboxItem[];
    /** Total real por revisar (count del servidor; si falla, lo cargado). */
    total: number;
    oldestMs: number | null;
    hasMore: boolean;
    degraded: boolean;
    error: string | null;
    /** «Ver todas →» */
    target: QueueTarget;
}

export type AttentionKind = 'planExpiring' | 'billing' | 'campaignOverdue' | 'campaignEndingSoon';

export interface AttentionItem {
    key: string;
    id: string;
    kind: AttentionKind;
    emoji: string;
    title: string;
    subtitle: string;
    /** Fecha clave: caducidad, alta del problema de pago o fin de campaña (ms). */
    dateMs: number;
    placeId: string | null;
    target: QueueTarget;
    data: Record<string, unknown>;
}

export interface AttentionSection {
    key: AttentionKind;
    emoji: string;
    title: string;
    items: AttentionItem[];
    error: string | null;
    /** Solo informativa (no suma en «Atención»). */
    informative: boolean;
}

export interface DeveloperInbox {
    fetchedAt: number;
    groups: InboxGroup[];
    attention: AttentionSection[];
    followUp: {
        betaLeads: number | null;
        checkoutsStarted: number | null;
        betaTarget: QueueTarget;
        checkoutsTarget: QueueTarget;
    };
    summary: {
        toReview: number;
        urgent: number;
        attention: number;
        oldestMs: number | null;
    };
    degraded: boolean;
    errors: string[];
}

// ── Consultas compartidas ───────────────────────────────────────────────────

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const placesRef = () => collection(db, 'places');

const plansExpiringQuery = (now: number): Query<DocumentData> => query(
    placesRef(),
    where('businessPlanExpiresAt', '>', new Date(now)),
    where('businessPlanExpiresAt', '<=', new Date(now + PLAN_EXPIRY_WINDOW_DAYS * DAY_MS)),
);

const billingProblemsQuery = (): Query<DocumentData> => query(
    placesRef(),
    where('businessBillingStatus', 'in', BILLING_PROBLEM_STATUSES),
);

const betaLeadsQuery = (): Query<DocumentData> => query(
    collection(db, 'planInterest'),
    where('plan', '==', 'business_pro'),
    where('placeId', '==', null),
);

const checkoutsStartedQuery = (): Query<DocumentData> => query(
    placesRef(),
    where('businessBillingStatus', '==', 'checkout_started'),
);

const countQuery = async (target: Query<DocumentData>): Promise<number> => (await getCountFromServer(target)).data().count;

const safeCount = async (label: string, task: () => Promise<number>): Promise<number | null> => {
    try {
        return await task();
    } catch (error) {
        console.warn(`useDeveloperInbox: no se pudo contar ${label}`, error);
        return null;
    }
};

const REVIEW_QUEUES: readonly QueueKey[] = [
    'reports',
    'businessClaims',
    'itemProposals',
    'sponsoredPlacements',
    'sponsoredItemSpotlights',
];

const countPending = (queue: QueueKey) => safeCount(queue, () => countByStatus(queue, QUEUES[queue].pendingStatuses));

const countOverdueCampaigns = async (now: number): Promise<number> => {
    const today = todayIso(now);
    // Índices (status, endsAt ASC). Las solicitudes de platos aún no tienen endsAt.
    const [placements, spotlights] = await Promise.all([
        countQuery(query(collection(db, 'sponsoredPlacements'), where('status', 'in', ['active', 'requested']), where('endsAt', '<', today))),
        countQuery(query(collection(db, 'sponsoredItemSpotlights'), where('status', '==', 'active'), where('endsAt', '<', today))),
    ]);
    return placements + spotlights;
};

const sumKnown = (...values: Array<number | null>): number => values.reduce<number>((total, value) => total + (value ?? 0), 0);

// ── Contadores (barra lateral) ──────────────────────────────────────────────

export async function fetchDeveloperPendingCounts(now: number = Date.now()): Promise<DeveloperPendingCounts> {
    const [
        reports,
        businessClaims,
        itemProposals,
        sponsoredPlacements,
        sponsoredItemSpotlights,
        plansExpiring,
        billingProblems,
        campaignsOverdue,
        betaLeads,
    ] = await Promise.all([
        ...REVIEW_QUEUES.map(countPending),
        safeCount('plansExpiring', () => countQuery(plansExpiringQuery(now))),
        safeCount('billingProblems', () => countQuery(billingProblemsQuery())),
        safeCount('campaignsOverdue', () => countOverdueCampaigns(now)),
        safeCount('betaLeads', () => countQuery(betaLeadsQuery())),
    ]);

    const proProposalsReview = sumKnown(itemProposals, sponsoredPlacements, sponsoredItemSpotlights);
    const toReview = sumKnown(reports, businessClaims) + proProposalsReview;
    const plansAttention = sumKnown(plansExpiring, billingProblems);
    const attention = plansAttention + sumKnown(campaignsOverdue);

    return {
        reports,
        businessClaims,
        itemProposals,
        sponsoredPlacements,
        sponsoredItemSpotlights,
        plansExpiring,
        billingProblems,
        campaignsOverdue,
        betaLeads,
        toReview,
        attention,
        badges: {
            pending: { review: toReview, attention },
            reports: { review: reports ?? 0, attention: 0 },
            businessClaims: { review: businessClaims ?? 0, attention: 0 },
            plans: { review: 0, attention: plansAttention },
            proProposals: { review: proProposalsReview, attention: campaignsOverdue ?? 0 },
        },
        fetchedAt: now,
    };
}

// ── Bandeja completa ────────────────────────────────────────────────────────

const oldestOf = (items: Array<{ createdAtMs: number }>): number | null => {
    const values = items.map((item) => item.createdAtMs).filter((ms) => ms > 0);
    return values.length > 0 ? Math.min(...values) : null;
};

const daysUntilIso = (iso: string, today: string): number =>
    Math.round((toMillis(iso) - toMillis(today)) / DAY_MS);

const whenText = (days: number): string => {
    if (days <= 0) return 'hoy';
    if (days === 1) return 'mañana';
    return `en ${days} d`;
};

/** Avisos de contexto para las solicitudes de negocio (lugar ya verificado, solicitudes que compiten). */
async function addClaimContext(items: InboxItem[]): Promise<InboxItem[]> {
    const placeIds = Array.from(new Set(items.map((item) => item.placeId).filter((id): id is string => Boolean(id))));
    const places = new Map<string, Record<string, unknown>>();
    await Promise.all(placeIds.map(async (placeId) => {
        try {
            const snap = await getDoc(doc(db, 'places', placeId));
            if (snap.exists()) places.set(placeId, snap.data() as Record<string, unknown>);
        } catch (error) {
            console.warn('useDeveloperInbox: no se pudo leer el lugar', placeId, error);
        }
    }));
    const claimsPerPlace = new Map<string, number>();
    items.forEach((item) => {
        if (item.placeId) claimsPerPlace.set(item.placeId, (claimsPerPlace.get(item.placeId) ?? 0) + 1);
    });

    return items.map((item) => {
        if (!item.placeId) return item;
        const extra: InboxBadge[] = [];
        const place = places.get(item.placeId);
        if (place?.businessVerified === true) {
            const ownerId = str(place.businessOwnerUserId);
            if (!ownerId) extra.push({ emoji: '⚠️', text: 'Ya verificado', tone: 'warning' });
            else if (ownerId !== item.userId) extra.push({ emoji: '⚠️', text: 'Ya verificado · propietario', tone: 'warning', userId: ownerId });
            else extra.push({ emoji: 'ℹ️', text: 'Ya es el propietario', tone: 'info' });
        }
        const competing = claimsPerPlace.get(item.placeId) ?? 0;
        if (competing > 1) extra.push({ emoji: '👥', text: `${competing} solicitudes para este lugar`, tone: 'warning' });
        return extra.length > 0 ? { ...item, badges: [...item.badges, ...extra] } : item;
    });
}

const planSourceLabel = (data: Record<string, unknown>): string => {
    if (data.businessPlanGrantedBy === 'beta') return 'Prueba (beta)';
    const source = str(data.businessPlanSource) as BusinessPlanSource;
    return PLAN_SOURCE_LABELS[source] || 'Business Pro';
};

const BILLING_LABELS: Record<string, string> = {
    past_due: 'pago atrasado',
    unpaid: 'impagado',
};

const placeTitle = (id: string, data: Record<string, unknown>): string => str(data.name) || str(data.placeName) || id;

async function fetchPlansExpiring(now: number): Promise<AttentionItem[]> {
    const snap = await getDocs(query(
        plansExpiringQuery(now),
        orderBy('businessPlanExpiresAt', 'asc'),
        limit(50),
    ));
    return snap.docs
        .map((placeDoc) => ({ id: placeDoc.id, data: placeDoc.data() as Record<string, unknown> }))
        .filter(({ data }) => data.businessProActive === true
            && (data.businessPlanSource === 'manual' || data.businessPlanSource === 'trial'))
        .map(({ id, data }) => {
            const expiresMs = toMillis(data.businessPlanExpiresAt);
            return {
                key: `planExpiring:${id}`,
                id,
                kind: 'planExpiring' as const,
                emoji: '⏳',
                title: placeTitle(id, data),
                subtitle: `${planSourceLabel(data)} · caduca el ${formatDate(expiresMs, now)} (${formatUntil(expiresMs, now)})`,
                dateMs: expiresMs,
                placeId: id,
                target: { tab: 'plans', view: 'attention', focus: id },
                data,
            };
        });
}

async function fetchBillingProblems(now: number): Promise<AttentionItem[]> {
    const snap = await getDocs(query(billingProblemsQuery(), limit(50)));
    return snap.docs
        .map((placeDoc) => {
            const data = placeDoc.data() as Record<string, unknown>;
            const status = str(data.businessBillingStatus);
            const sinceMs = toMillis(data.businessBillingUpdatedAt);
            return {
                key: `billing:${placeDoc.id}`,
                id: placeDoc.id,
                kind: 'billing' as const,
                emoji: '💳',
                title: placeTitle(placeDoc.id, data),
                subtitle: `Stripe: ${BILLING_LABELS[status] || status}${sinceMs ? ` desde el ${formatDate(sinceMs, now)}` : ''}`,
                dateMs: sinceMs,
                placeId: placeDoc.id,
                target: { tab: 'plans', view: 'attention', focus: placeDoc.id },
                data,
            };
        })
        // Los más antiguos primero; sin fecha, al final.
        .sort((a, b) => (a.dateMs || Number.MAX_SAFE_INTEGER) - (b.dateMs || Number.MAX_SAFE_INTEGER));
}

const campaignTitle = (item: InboxItem): string => {
    if (item.queue === 'sponsoredPlacements') {
        return `${item.data.type === 'search' ? 'Búsqueda' : 'Home'} · ${item.placeName || item.title}`;
    }
    return item.placeName ? `${item.title} · ${item.placeName}` : item.title;
};

/** Campañas vencidas sin cerrar (y solicitudes de home o búsqueda ya vencidas) y las que terminan en ≤ 3 días. */
function classifyCampaigns(
    active: InboxItem[],
    requested: InboxItem[],
    now: number,
): { overdue: AttentionItem[]; endingSoon: AttentionItem[] } {
    const today = todayIso(now);
    const soonLimit = addDaysIso(today, ENDING_SOON_DAYS);
    const overdue: AttentionItem[] = [];
    const endingSoon: AttentionItem[] = [];

    const toAttention = (item: InboxItem, kind: AttentionKind, emoji: string, subtitle: string, endsAt: string): AttentionItem => ({
        key: `${kind}:${item.key}`,
        id: item.id,
        kind,
        emoji,
        title: campaignTitle(item),
        subtitle,
        dateMs: toMillis(endsAt),
        placeId: item.placeId,
        target: item.target,
        data: item.data,
    });

    active.forEach((item) => {
        const endsAt = str(item.data.endsAt);
        if (!endsAt) return;
        if (endsAt < today) {
            overdue.push(toAttention(item, 'campaignOverdue', '🧹', `terminó el ${formatDate(endsAt, now)} y sigue «activa»`, endsAt));
        } else if (endsAt <= soonLimit) {
            endingSoon.push(toAttention(item, 'campaignEndingSoon', '📅', `termina el ${formatDate(endsAt, now)} (${whenText(daysUntilIso(endsAt, today))})`, endsAt));
        }
    });
    requested.forEach((item) => {
        // Solo campañas de home o búsqueda: un plato pedido recibe fechas nuevas al
        // activarlo (aunque una solicitud antigua traiga endsAt) y el cierre nocturno no lo toca.
        if (item.queue !== 'sponsoredPlacements') return;
        const endsAt = str(item.data.endsAt);
        if (endsAt && endsAt < today) {
            overdue.push(toAttention(item, 'campaignOverdue', '🧹', `solicitada, terminaba el ${formatDate(endsAt, now)} y sigue sin revisar`, endsAt));
        }
    });

    const byDate = (a: AttentionItem, b: AttentionItem) => a.dateMs - b.dateMs;
    return { overdue: overdue.sort(byDate), endingSoon: endingSoon.sort(byDate) };
}

export async function fetchDeveloperInbox(now: number = Date.now()): Promise<DeveloperInbox> {
    const errors: string[] = [];
    const attempt = async <T>(label: string, task: () => Promise<T>): Promise<{ value: T | null; error: string | null }> => {
        try {
            return { value: await task(), error: null };
        } catch (error) {
            console.warn(`useDeveloperInbox: no se pudo cargar ${label}`, error);
            errors.push(label);
            return { value: null, error: 'No se pudo cargar' };
        }
    };

    const [pages, counts, plansExpiring, billing, activePlacements, activeSpotlights, betaLeads, checkoutsStarted] = await Promise.all([
        Promise.all(REVIEW_QUEUES.map((queue) => attempt(QUEUES[queue].label, () => fetchPending(queue, { now })))),
        Promise.all(REVIEW_QUEUES.map(countPending)),
        attempt('Business Pro que caduca', () => fetchPlansExpiring(now)),
        attempt('Pagos con problema', () => fetchBillingProblems(now)),
        attempt('Campañas en curso', () => fetchActive('sponsoredPlacements', { now })),
        attempt('Platos en curso', () => fetchActive('sponsoredItemSpotlights', { now })),
        safeCount('betaLeads', () => countQuery(betaLeadsQuery())),
        safeCount('checkoutsStarted', () => countQuery(checkoutsStartedQuery())),
    ]);

    const pageOf = (queue: QueueKey): { page: QueuePage | null; error: string | null; count: number | null } => {
        const index = REVIEW_QUEUES.indexOf(queue);
        return { page: pages[index].value, error: pages[index].error, count: counts[index] };
    };

    const claims = pageOf('businessClaims');
    const claimItems = claims.page ? await addClaimContext(claims.page.items) : [];

    const reports = pageOf('reports');
    const reportItems = reports.page?.items ?? [];
    const urgentItems = reportItems.filter((item) => item.urgent);
    const normalReportItems = reportItems.filter((item) => !item.urgent);

    const buildGroup = (queue: QueueKey, items: InboxItem[]): InboxGroup => {
        const { page, error, count } = pageOf(queue);
        const config = QUEUES[queue];
        const total = queue === 'reports'
            ? Math.max(0, (count ?? reportItems.length) - urgentItems.length)
            : count ?? items.length;
        return {
            key: queue,
            emoji: config.emoji,
            title: config.label,
            items,
            total: Math.max(total, items.length),
            oldestMs: oldestOf(items),
            hasMore: page?.hasMore ?? false,
            degraded: page?.degraded ?? false,
            error,
            target: { tab: config.tab, view: config.views.pending },
        };
    };

    const urgentGroup: InboxGroup = {
        key: URGENT_GROUP_KEY,
        emoji: '🚨',
        title: 'Reportes urgentes',
        items: urgentItems,
        total: urgentItems.length,
        oldestMs: oldestOf(urgentItems),
        hasMore: false,
        degraded: reports.page?.degraded ?? false,
        // Si fallan los reportes, el aviso ya sale una vez en el grupo «Reportes».
        error: null,
        target: { tab: QUEUES.reports.tab, view: QUEUES.reports.views.pending },
    };

    const groups: InboxGroup[] = [
        urgentGroup,
        buildGroup('reports', normalReportItems),
        buildGroup('businessClaims', claimItems),
        buildGroup('itemProposals', pageOf('itemProposals').page?.items ?? []),
        buildGroup('sponsoredPlacements', pageOf('sponsoredPlacements').page?.items ?? []),
        buildGroup('sponsoredItemSpotlights', pageOf('sponsoredItemSpotlights').page?.items ?? []),
    ];

    const requestedCampaigns = [
        ...(pageOf('sponsoredPlacements').page?.items ?? []),
        ...(pageOf('sponsoredItemSpotlights').page?.items ?? []),
    ];
    const activeCampaigns = [...(activePlacements.value?.items ?? []), ...(activeSpotlights.value?.items ?? [])];
    const campaigns = classifyCampaigns(activeCampaigns, requestedCampaigns, now);
    const campaignError = activePlacements.error || activeSpotlights.error;

    const attention: AttentionSection[] = [
        {
            key: 'planExpiring',
            emoji: '⏳',
            title: `Business Pro que caduca en ${PLAN_EXPIRY_WINDOW_DAYS} días o menos`,
            items: plansExpiring.value ?? [],
            error: plansExpiring.error,
            informative: false,
        },
        { key: 'billing', emoji: '💳', title: 'Pagos con problema', items: billing.value ?? [], error: billing.error, informative: false },
        { key: 'campaignOverdue', emoji: '🧹', title: 'Campañas vencidas sin cerrar', items: campaigns.overdue, error: campaignError, informative: false },
        {
            key: 'campaignEndingSoon',
            emoji: '📅',
            title: `Terminan en ${ENDING_SOON_DAYS} días o menos`,
            items: campaigns.endingSoon,
            // El fallo ya se avisa en «Campañas vencidas sin cerrar».
            error: null,
            informative: true,
        },
    ];

    const allReviewItems = groups.flatMap((group) => group.items);
    const degraded = pages.some((entry) => entry.value?.degraded)
        || Boolean(activePlacements.value?.degraded || activeSpotlights.value?.degraded);

    return {
        fetchedAt: now,
        groups,
        attention,
        followUp: {
            betaLeads,
            checkoutsStarted,
            betaTarget: { tab: 'plans', view: 'beta' },
            checkoutsTarget: { tab: 'plans', view: 'attention' },
        },
        summary: {
            toReview: groups.reduce((total, group) => total + group.total, 0),
            urgent: urgentGroup.total,
            attention: attention.filter((section) => !section.informative).reduce((total, section) => total + section.items.length, 0),
            oldestMs: oldestOf(allReviewItems),
        },
        degraded,
        errors,
    };
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useDeveloperPendingCounts(enabled: boolean) {
    return useQuery({
        queryKey: DEVELOPER_PENDING_COUNTS_KEY,
        queryFn: () => fetchDeveloperPendingCounts(),
        enabled,
        staleTime: STALE_MS,
        refetchOnWindowFocus: true,
    });
}

export function useDeveloperInbox(enabled: boolean) {
    return useQuery({
        queryKey: DEVELOPER_INBOX_KEY,
        queryFn: () => fetchDeveloperInbox(),
        enabled,
        staleTime: STALE_MS,
        refetchOnWindowFocus: true,
    });
}

export function useInvalidateDeveloper(): () => Promise<void> {
    const queryClient = useQueryClient();
    return useCallback(() => queryClient.invalidateQueries({ queryKey: DEVELOPER_QUERY_KEY }), [queryClient]);
}
