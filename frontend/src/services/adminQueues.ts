/**
 * adminQueues: colas de revisión de Developer, leídas desde el cliente con el
 * permiso de jefe (las reglas exigen el claim `admin`: llama solo cuando
 * `jefeClaim.status === 'ready'`).
 *
 * Colas (QueueKey = nombre de la colección):
 *   reports                  pending → resolved | rejected                  tab 'reports'        vistas pending / resolved
 *   businessClaims           pending → approved | rejected                  tab 'businessClaims' vistas pending / resolved
 *   itemProposals            pending → applying → approved | rejected       tab 'proProposals'   vistas inbox / history
 *                            ('applying' vuelve a pending con applyError si aplicar falla; con más de
 *                            10 min es una reserva atascada: «⏳ Atascada», solo se puede reintentar)
 *   sponsoredPlacements      requested → active → ended (o rejected)        tab 'proProposals'   vistas inbox / active / history
 *   sponsoredItemSpotlights  requested → active → ended (o rejected)        tab 'proProposals'   vistas inbox / active / history
 *
 * API
 *   QUEUES: Record<QueueKey, QueueConfig>    collection, label, emoji, gender, tab, views,
 *                                            pendingStatuses, activeStatuses, resolvedStatuses,
 *                                            placeFields, userFields, toInboxItem(id, data, now?)
 *   QUEUE_KEYS: readonly QueueKey[]
 *   toInboxItem(queue, id, data, now?): InboxItem         fila normalizada (título, subtítulo, avisos, enlace…)
 *   targetFor(queue, id, status): QueueTarget             { tab, view, focus } para goToTab(tab, { view, focus })
 *   viewForStatus(queue, status): string
 *
 *   fetchQueue(queue, { statuses, direction?, pageSize?, cursor?, now? }): Promise<QueuePage>
 *       where status (== o in) + orderBy createdAt + limit. Paginación con `cursor` (startAfter).
 *   fetchPending(queue, opts?)   pendingStatuses, createdAt asc, 50 por página
 *   fetchActive(queue, opts?)    activeStatuses (campañas «En curso»), createdAt asc, 100 por página
 *   fetchResolved(queue, opts?)  resolvedStatuses (u opts.statuses), createdAt desc, 25 por página
 *       QueuePage = { items, cursor, hasMore, degraded }. hasMore=true ⇒ hay más (aviso de truncado).
 *       Si falta el índice (failed-precondition) se repite sin orderBy con limit(200), se ordena en
 *       cliente y se marca degraded=true («⚠️ índice en construcción, orden aproximado»), sin más páginas.
 *   countByStatus(queue, statuses): Promise<number>                    getCountFromServer
 *   countEachStatus(queue, statuses?): Promise<Record<string, number | null>>   null si falla
 *   looksLikeId(term): boolean                                         sin espacios y 15+ caracteres
 *   PROPOSAL_APPLY_STALE_MS, proposalApplyingSinceMs(data), isStuckApplying(data, now?)
 *                                                                      propuesta en 'applying' atascada
 *   lookupExact(term, queues?, now?): Promise<InboxItem[]>             getDoc(col/term) + placeId/userId == term
 *   matchesSearch(item, term): boolean / normalizeSearchText(text)     filtro en cliente sin tildes
 *   isMissingIndexError(error): boolean
 *   REPORT_ISSUES, REPORT_TARGETS, URGENT_REPORT_ISSUES                 etiquetas legibles de reportes
 *
 * Para tipos ricos usa `item.data` con los mapeadores de BusinessProService
 * (mapProposal / mapPlacement / mapSpotlight): `page.items.map((i) => mapProposal(i.id, i.data))`.
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
    type QueryConstraint,
    type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MINUTE_MS, addDaysIso, ageLevel, formatDate, todayIso, toMillis, type AgeLevel } from '../utils/adminTime';

export type QueueKey = 'reports' | 'businessClaims' | 'itemProposals' | 'sponsoredPlacements' | 'sponsoredItemSpotlights';

export const QUEUE_KEYS: readonly QueueKey[] = [
    'reports',
    'businessClaims',
    'itemProposals',
    'sponsoredPlacements',
    'sponsoredItemSpotlights',
];

export type QueueDirection = 'asc' | 'desc';
export type QueueCursor = QueryDocumentSnapshot<DocumentData>;

/** Destino de un enlace: `goToTab(target.tab, { view: target.view, focus: target.focus })`. */
export interface QueueTarget {
    tab: string;
    view?: string;
    status?: string;
    focus?: string | null;
}

export type InboxBadgeTone = 'danger' | 'warning' | 'info' | 'neutral';

/** Aviso corto en una fila. Si trae `userId`, pinta detrás el nombre (useAdminNames). */
export interface InboxBadge {
    emoji: string;
    text: string;
    tone: InboxBadgeTone;
    userId?: string;
}

export interface InboxItem {
    /** `${queue}:${id}`: único entre colas, sirve de key de React. */
    key: string;
    id: string;
    queue: QueueKey;
    status: string;
    emoji: string;
    title: string;
    subtitle: string;
    placeId: string | null;
    placeName: string | null;
    userId: string | null;
    createdAtMs: number;
    ageLevel: AgeLevel;
    /** Reporte de child_safety, harassment o impersonation (siempre en rojo y arriba). */
    urgent: boolean;
    badges: InboxBadge[];
    target: QueueTarget;
    /** Texto normalizado (sin tildes, minúsculas) para matchesSearch. */
    searchText: string;
    /** Documento original de Firestore (Timestamps intactos). */
    data: Record<string, unknown>;
}

export interface QueueViews {
    pending: string;
    active?: string;
    resolved: string;
}

export interface QueueConfig {
    key: QueueKey;
    collection: string;
    label: string;
    emoji: string;
    /** Género gramatical del elemento (reporte → 'm'; solicitud, propuesta, campaña → 'f'). */
    gender: 'f' | 'm';
    tab: string;
    views: QueueViews;
    pendingStatuses: readonly string[];
    activeStatuses: readonly string[];
    resolvedStatuses: readonly string[];
    /** Campos que guardan el id del lugar (búsqueda exacta). */
    placeFields: readonly string[];
    /** Campos que guardan el uid del autor (búsqueda exacta). */
    userFields: readonly string[];
    toInboxItem: (id: string, data: Record<string, unknown>, now?: number) => InboxItem;
}

export interface QueuePage {
    items: InboxItem[];
    /** Pásalo a la siguiente llamada para seguir (null si no hay más). */
    cursor: QueueCursor | null;
    hasMore: boolean;
    /** Índice en construcción: orden aproximado y sin más páginas. */
    degraded: boolean;
}

export interface FetchQueueOptions {
    statuses?: readonly string[];
    direction?: QueueDirection;
    pageSize?: number;
    cursor?: QueueCursor | null;
    now?: number;
}

export const FALLBACK_LIMIT = 200;
export const LOOKUP_LIMIT = 25;

// ── Reportes: etiquetas ─────────────────────────────────────────────────────

export const URGENT_REPORT_ISSUES: ReadonlySet<string> = new Set(['child_safety', 'harassment', 'impersonation']);

export const REPORT_ISSUES: Record<string, { emoji: string; label: string }> = {
    inappropriate: { emoji: '🚫', label: 'Contenido inapropiado' },
    child_safety: { emoji: '🧒', label: 'Seguridad infantil' },
    spam: { emoji: '📢', label: 'Spam' },
    fake: { emoji: '🎭', label: 'Falso o engañoso' },
    place_closed: { emoji: '🔒', label: 'El sitio ha cerrado' },
    item_missing: { emoji: '❓', label: 'El elemento ya no existe' },
    duplicate: { emoji: '👯', label: 'Duplicado' },
    item_not_available: { emoji: '🍽️', label: 'Ya no está disponible' },
    incorrect_info: { emoji: '✏️', label: 'Información incorrecta' },
    wrong_place: { emoji: '📍', label: 'Sitio equivocado' },
    harassment: { emoji: '🛑', label: 'Acoso' },
    impersonation: { emoji: '🪪', label: 'Suplantación' },
    other: { emoji: '🚩', label: 'Otro motivo' },
};

export const REPORT_TARGETS: Record<string, { emoji: string; label: string }> = {
    place: { emoji: '📍', label: 'Lugar' },
    review: { emoji: '📝', label: 'Reseña' },
    list: { emoji: '📋', label: 'Lista' },
    group: { emoji: '👥', label: 'Grupo' },
    user: { emoji: '👤', label: 'Usuario' },
    other: { emoji: '⚠️', label: 'Otro' },
};

// ── Utilidades internas ─────────────────────────────────────────────────────

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const firstStr = (...values: unknown[]): string => {
    for (const value of values) {
        const text = str(value);
        if (text) return text;
    }
    return '';
};

const positiveNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const formatNumber = (value: number): string => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });

const quote = (text: string): string => `«${text}»`;

const joinParts = (...parts: Array<string | null | undefined | false>): string =>
    parts.filter((part): part is string => Boolean(part)).join(' · ');

export const normalizeSearchText = (text: string): string => text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Todas las palabras del término aparecen en la fila (sin tildes ni mayúsculas). */
export const matchesSearch = (item: Pick<InboxItem, 'searchText'>, term: string): boolean => {
    const tokens = normalizeSearchText(term).split(' ').filter(Boolean);
    return tokens.every((token) => item.searchText.includes(token));
};

export const viewForStatus = (queue: QueueKey, status: string): string => {
    const config = QUEUES[queue];
    if (config.pendingStatuses.includes(status)) return config.views.pending;
    if (config.activeStatuses.includes(status) && config.views.active) return config.views.active;
    return config.views.resolved;
};

export const targetFor = (queue: QueueKey, id: string, status: string): QueueTarget => ({
    tab: QUEUES[queue].tab,
    view: viewForStatus(queue, status),
    focus: id,
});

const formatCampaignDates = (startsAt: string, endsAt: string, now: number): string => {
    if (startsAt && endsAt) return `del ${formatDate(startsAt, now)} al ${formatDate(endsAt, now)}`;
    if (endsAt) return `hasta el ${formatDate(endsAt, now)}`;
    if (startsAt) return `desde el ${formatDate(startsAt, now)}`;
    return '';
};

/** Avisos de fechas de campañas (home/búsqueda y platos). */
const campaignBadges = (status: string, endsAt: string, now: number): InboxBadge[] => {
    const today = todayIso(now);
    const badges: InboxBadge[] = [];
    if (endsAt && endsAt < today) {
        if (status === 'requested') badges.push({ emoji: '🧹', text: 'Ya vencida sin revisar', tone: 'danger' });
        if (status === 'active') badges.push({ emoji: '🧹', text: 'Vencida sin cerrar', tone: 'danger' });
    } else if (status === 'active' && endsAt && endsAt <= addDaysIso(today, 3)) {
        badges.push({ emoji: '📅', text: `Termina el ${formatDate(endsAt, now)}`, tone: 'info' });
    }
    if (status === 'active' && !endsAt) badges.push({ emoji: '∞', text: 'Sin fecha de fin', tone: 'info' });
    return badges;
};

interface ItemParts {
    status: string;
    emoji: string;
    title: string;
    subtitle: string;
    placeId?: string;
    placeName?: string;
    userId?: string;
    urgent?: boolean;
    badges?: InboxBadge[];
    searchExtra?: string[];
}

const buildItem = (
    queue: QueueKey,
    id: string,
    data: Record<string, unknown>,
    now: number,
    parts: ItemParts,
): InboxItem => {
    const createdAtMs = toMillis(data.createdAt);
    const searchText = normalizeSearchText([
        id,
        parts.title,
        parts.subtitle,
        parts.placeId,
        parts.placeName,
        parts.userId,
        ...(parts.searchExtra || []),
    ].filter(Boolean).join(' '));
    return {
        key: `${queue}:${id}`,
        id,
        queue,
        status: parts.status,
        emoji: parts.emoji,
        title: parts.title,
        subtitle: parts.subtitle,
        placeId: parts.placeId || null,
        placeName: parts.placeName || null,
        userId: parts.userId || null,
        createdAtMs,
        ageLevel: ageLevel(createdAtMs, now),
        urgent: Boolean(parts.urgent),
        badges: parts.badges || [],
        target: targetFor(queue, id, parts.status),
        searchText,
        data,
    };
};

// ── Conversión de cada colección a InboxItem ────────────────────────────────

const reportToItem = (id: string, data: Record<string, unknown>, now: number = Date.now()): InboxItem => {
    const status = str(data.status) || 'pending';
    const issueType = str(data.issueType) || 'other';
    const targetType = str(data.targetType) || 'other';
    const issue = REPORT_ISSUES[issueType] || { emoji: '🚩', label: issueType };
    const target = REPORT_TARGETS[targetType] || REPORT_TARGETS.other;
    const reporterName = firstStr(data.userName, data.userEmail);
    const targetId = str(data.targetId);
    return buildItem('reports', id, data, now, {
        status,
        emoji: issue.emoji,
        title: firstStr(data.targetName, data.itemName, targetId) || 'Sin nombre',
        subtitle: joinParts(issue.label, `${target.emoji} ${target.label}`, reporterName && `por ${reporterName}`),
        placeId: targetType === 'place' ? targetId : str(data.placeId),
        userId: firstStr(data.userId, data.reportedByUserId, data.reporterUid),
        urgent: URGENT_REPORT_ISSUES.has(issueType),
        searchExtra: [targetId, str(data.description), str(data.userEmail), str(data.userName), issueType],
    });
};

const claimToItem = (id: string, data: Record<string, unknown>, now: number = Date.now()): InboxItem => {
    const status = str(data.status) || 'pending';
    const userName = firstStr(data.userName, data.userEmail, data.userId);
    const role = str(data.role);
    const previousReviews = Array.isArray(data.previousReviews) ? data.previousReviews.length : 0;
    const badges: InboxBadge[] = [];
    if (previousReviews > 0 && status === 'pending') {
        badges.push({ emoji: '🔁', text: `Reenvío nº ${previousReviews}`, tone: 'info' });
    }
    const placeName = str(data.placeName);
    return buildItem('businessClaims', id, data, now, {
        status,
        emoji: '🏪',
        title: placeName || str(data.placeId) || 'Lugar sin nombre',
        subtitle: joinParts(role ? `${userName} (${role})` : userName, str(data.contactEmail)),
        placeId: str(data.placeId),
        placeName,
        userId: str(data.userId),
        badges,
        searchExtra: [str(data.userEmail), str(data.contactEmail), str(data.contactPhone), str(data.website), str(data.placeAddress)],
    });
};

/**
 * Una propuesta en 'applying' más de 10 minutos ya no la está aplicando nadie
 * (el callable corta a los 5): el servidor deja reintentarla (no rechazarla,
 * porque parte del cambio puede estar hecho). Mismo umbral que APPLY_STALE_MS
 * en functions/modules/lib/item-proposals.js.
 */
export const PROPOSAL_APPLY_STALE_MS = 10 * MINUTE_MS;

/** Desde cuándo está la propuesta en 'applying' (0 si no se sabe). */
export const proposalApplyingSinceMs = (data: Record<string, unknown>): number =>
    toMillis(data.applyingAt) || toMillis(data.reviewedAt);

export const isStuckApplying = (data: Record<string, unknown>, now: number = Date.now()): boolean => {
    if (str(data.status) !== 'applying') return false;
    const since = proposalApplyingSinceMs(data);
    return !since || now - since >= PROPOSAL_APPLY_STALE_MS;
};

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Avisos de una propuesta: aplicándose, atascada o con el último intento fallido. */
const proposalBadges = (status: string, data: Record<string, unknown>, now: number): InboxBadge[] => {
    const badges: InboxBadge[] = [];
    if (status === 'applying') {
        badges.push(isStuckApplying(data, now)
            ? { emoji: '⏳', text: 'Atascada', tone: 'danger' }
            : { emoji: '⚙️', text: 'Aplicándose ahora', tone: 'info' });
    }
    const applyError = data.applyError && typeof data.applyError === 'object' ? data.applyError as Record<string, unknown> : null;
    const errorMessage = applyError ? str(applyError.message) : '';
    if (status === 'pending' && errorMessage) {
        badges.push({ emoji: '⚠️', text: `No se pudo aplicar: ${truncate(errorMessage, 90)}`, tone: 'danger' });
    }
    return badges;
};

const PROPOSAL_TYPES: Record<string, { emoji: string; label: string }> = {
    merge: { emoji: '🔀', label: 'Fusión' },
    rename: { emoji: '✏️', label: 'Renombre' },
    reassign_review: { emoji: '↪️', label: 'Mover reseña' },
};

const proposalSummary = (type: string, payload: Record<string, unknown>): string => {
    if (type === 'merge') {
        return `${quote(firstStr(payload.sourceItemName, payload.sourceItemId))} → ${quote(firstStr(payload.targetItemName, payload.targetItemId))}`;
    }
    if (type === 'rename') {
        return `${quote(str(payload.currentName))} → ${quote(str(payload.newName))}`;
    }
    const author = str(payload.reviewAuthorName);
    return `${quote(str(payload.reviewItemName) || 'reseña')}${author ? ` de ${author}` : ''} → ${quote(firstStr(payload.targetItemName, payload.targetItemId))}`;
};

const proposalToItem = (id: string, data: Record<string, unknown>, now: number = Date.now()): InboxItem => {
    const status = str(data.status) || 'pending';
    const type = str(data.type) || 'merge';
    const typeInfo = PROPOSAL_TYPES[type] || PROPOSAL_TYPES.merge;
    const payload = data.payload && typeof data.payload === 'object' ? data.payload as Record<string, unknown> : {};
    const placeName = str(data.placeName);
    const summary = proposalSummary(type, payload);
    return buildItem('itemProposals', id, data, now, {
        status,
        emoji: typeInfo.emoji,
        title: placeName || str(data.placeId) || 'Lugar sin nombre',
        subtitle: joinParts(typeInfo.label, summary),
        placeId: str(data.placeId),
        placeName,
        userId: str(data.createdBy),
        badges: proposalBadges(status, data, now),
        searchExtra: [str(data.note), ...Object.values(payload).map(str)],
    });
};

const placementToItem = (id: string, data: Record<string, unknown>, now: number = Date.now()): InboxItem => {
    const status = str(data.status) || 'requested';
    const placeName = str(data.placeName);
    const headline = str(data.headline);
    const startsAt = str(data.startsAt);
    const endsAt = str(data.endsAt);
    return buildItem('sponsoredPlacements', id, data, now, {
        status,
        emoji: '📣',
        title: placeName || str(data.placeId) || 'Lugar sin nombre',
        subtitle: joinParts(
            data.type === 'search' ? 'Búsqueda' : 'Home',
            headline && quote(headline),
            formatCampaignDates(startsAt, endsAt, now),
        ),
        placeId: str(data.placeId),
        placeName,
        userId: str(data.createdBy),
        badges: campaignBadges(status, endsAt, now),
        searchExtra: [headline, str(data.placeAddress)],
    });
};

const spotlightToItem = (id: string, data: Record<string, unknown>, now: number = Date.now()): InboxItem => {
    const status = str(data.status) || 'requested';
    const placeName = str(data.placeName);
    const itemName = str(data.itemName);
    const radiusKm = positiveNumber(data.radiusKm);
    const weeks = positiveNumber(data.weeks);
    const days = positiveNumber(data.days) ?? (weeks ? weeks * 7 : null);
    const units = positiveNumber(data.units);
    const impulses = positiveNumber(data.impulses);
    const creditsUsed = positiveNumber(data.creditsUsed);
    const endsAt = str(data.endsAt);
    const reach = [
        radiusKm ? `${formatNumber(radiusKm)} km` : '',
        days ? `${formatNumber(days)} d` : '',
    ].filter(Boolean).join(' × ');
    const intensity = units && units > 1 ? `intensidad ×${formatNumber(units)}` : '';
    const impulsesText = impulses
        ? `${formatNumber(impulses)} impulsos${creditsUsed ? ` (${formatNumber(creditsUsed)} de regalo)` : ''}`
        : '';
    // El plato salió de la carta: la campaña no se sirve (el carrusel la oculta)
    // hasta que alguien decida. Es el único aviso de esto en Developer.
    const badges: InboxBadge[] = data.itemInactive === true
        ? [{ emoji: '🚫', text: 'Plato retirado · no se muestra', tone: 'danger' }]
        : [];
    badges.push(...campaignBadges(status, endsAt, now));
    if (data.creditsRefunded === true && creditsUsed) {
        badges.push({ emoji: '↩️', text: `${formatNumber(creditsUsed)} impulsos devueltos`, tone: 'neutral' });
    }
    return buildItem('sponsoredItemSpotlights', id, data, now, {
        status,
        emoji: '🍽️',
        title: itemName || 'Plato sin nombre',
        subtitle: joinParts(placeName, reach, intensity, impulsesText),
        placeId: str(data.placeId),
        placeName,
        userId: str(data.createdBy),
        badges,
        searchExtra: [str(data.itemId)],
    });
};

// ── Configuración de las colas ──────────────────────────────────────────────

export const QUEUES: Record<QueueKey, QueueConfig> = {
    reports: {
        key: 'reports',
        collection: 'reports',
        label: 'Reportes',
        emoji: '🚩',
        gender: 'm',
        tab: 'reports',
        views: { pending: 'pending', resolved: 'resolved' },
        pendingStatuses: ['pending'],
        activeStatuses: [],
        resolvedStatuses: ['resolved', 'rejected'],
        placeFields: ['targetId'],
        userFields: ['userId', 'reportedByUserId', 'reporterUid'],
        toInboxItem: reportToItem,
    },
    businessClaims: {
        key: 'businessClaims',
        collection: 'businessClaims',
        label: 'Solicitudes de negocio',
        emoji: '🏪',
        gender: 'f',
        tab: 'businessClaims',
        views: { pending: 'pending', resolved: 'resolved' },
        pendingStatuses: ['pending'],
        activeStatuses: [],
        resolvedStatuses: ['approved', 'rejected'],
        placeFields: ['placeId'],
        userFields: ['userId'],
        toInboxItem: claimToItem,
    },
    itemProposals: {
        key: 'itemProposals',
        collection: 'itemProposals',
        label: 'Propuestas de carta',
        emoji: '📝',
        gender: 'f',
        tab: 'proProposals',
        views: { pending: 'inbox', resolved: 'history' },
        // 'applying' también espera: se ve en la bandeja (y atascada, se reintenta).
        pendingStatuses: ['pending', 'applying'],
        activeStatuses: [],
        resolvedStatuses: ['approved', 'rejected'],
        placeFields: ['placeId'],
        userFields: ['createdBy'],
        toInboxItem: proposalToItem,
    },
    sponsoredPlacements: {
        key: 'sponsoredPlacements',
        collection: 'sponsoredPlacements',
        label: 'Campañas solicitadas',
        emoji: '📣',
        gender: 'f',
        tab: 'proProposals',
        views: { pending: 'inbox', active: 'active', resolved: 'history' },
        pendingStatuses: ['requested'],
        activeStatuses: ['active'],
        resolvedStatuses: ['rejected', 'ended'],
        placeFields: ['placeId'],
        userFields: ['createdBy'],
        toInboxItem: placementToItem,
    },
    sponsoredItemSpotlights: {
        key: 'sponsoredItemSpotlights',
        collection: 'sponsoredItemSpotlights',
        label: 'Platos destacados solicitados',
        emoji: '🍽️',
        gender: 'm',
        tab: 'proProposals',
        views: { pending: 'inbox', active: 'active', resolved: 'history' },
        pendingStatuses: ['requested'],
        activeStatuses: ['active'],
        resolvedStatuses: ['rejected', 'ended'],
        placeFields: ['placeId'],
        userFields: ['createdBy'],
        toInboxItem: spotlightToItem,
    },
};

export const toInboxItem = (
    queue: QueueKey,
    id: string,
    data: Record<string, unknown>,
    now: number = Date.now(),
): InboxItem => QUEUES[queue].toInboxItem(id, data, now);

// ── Consultas ───────────────────────────────────────────────────────────────

export const isMissingIndexError = (error: unknown): boolean => {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return code === 'failed-precondition' || code === 'firestore/failed-precondition';
};

const statusConstraint = (statuses: readonly string[]): QueryConstraint => (statuses.length === 1
    ? where('status', '==', statuses[0])
    : where('status', 'in', [...statuses]));

const EMPTY_PAGE: QueuePage = { items: [], cursor: null, hasMore: false, degraded: false };

export async function fetchQueue(
    queue: QueueKey,
    options: FetchQueueOptions & { statuses: readonly string[] },
): Promise<QueuePage> {
    const config = QUEUES[queue];
    const statuses = options.statuses;
    const direction = options.direction ?? 'asc';
    const pageSize = Math.max(1, Math.floor(options.pageSize ?? 25));
    const now = options.now ?? Date.now();
    if (statuses.length === 0) return EMPTY_PAGE;

    const ref = collection(db, config.collection);
    const toItems = (docs: QueueCursor[]) => docs.map((snap) => config.toInboxItem(snap.id, snap.data() as Record<string, unknown>, now));

    try {
        const constraints: QueryConstraint[] = [statusConstraint(statuses), orderBy('createdAt', direction)];
        if (options.cursor) constraints.push(startAfter(options.cursor));
        // Uno de más para saber si hay otra página sin pedir un count.
        constraints.push(limit(pageSize + 1));
        const snap = await getDocs(query(ref, ...constraints));
        const hasMore = snap.docs.length > pageSize;
        const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
        return {
            items: toItems(pageDocs),
            cursor: hasMore ? pageDocs[pageDocs.length - 1] : null,
            hasMore,
            degraded: false,
        };
    } catch (error) {
        if (!isMissingIndexError(error)) throw error;
        console.warn(`adminQueues: falta el índice de ${config.collection}; orden aproximado`, error);
        // Sin índice no se puede seguir paginando: la primera página ya lo trajo todo.
        if (options.cursor) return { ...EMPTY_PAGE, degraded: true };
        const snap = await getDocs(query(ref, statusConstraint(statuses), limit(FALLBACK_LIMIT)));
        const sign = direction === 'asc' ? 1 : -1;
        const sorted = [...snap.docs].sort((a, b) => sign * (toMillis(a.data().createdAt) - toMillis(b.data().createdAt)));
        return { items: toItems(sorted), cursor: null, hasMore: false, degraded: true };
    }
}

const withDefaults = (
    queue: QueueKey,
    statuses: readonly string[],
    direction: QueueDirection,
    pageSize: number,
    options: FetchQueueOptions,
): Promise<QueuePage> => fetchQueue(queue, {
    ...options,
    statuses: options.statuses ?? statuses,
    direction: options.direction ?? direction,
    pageSize: options.pageSize ?? pageSize,
});

/** Pendientes del más antiguo al más reciente (50 por página). */
export const fetchPending = (queue: QueueKey, options: FetchQueueOptions = {}): Promise<QueuePage> =>
    withDefaults(queue, QUEUES[queue].pendingStatuses, 'asc', 50, options);

/** Campañas en curso del más antiguo al más reciente (100 por página). Vacío si la cola no tiene estado activo. */
export const fetchActive = (queue: QueueKey, options: FetchQueueOptions = {}): Promise<QueuePage> =>
    withDefaults(queue, QUEUES[queue].activeStatuses, 'asc', 100, options);

/** Resueltos del más reciente al más antiguo (25 por página). Filtra con `statuses` (p. ej. ['approved']). */
export const fetchResolved = (queue: QueueKey, options: FetchQueueOptions = {}): Promise<QueuePage> =>
    withDefaults(queue, QUEUES[queue].resolvedStatuses, 'desc', 25, options);

export async function countByStatus(queue: QueueKey, statuses: string | readonly string[]): Promise<number> {
    const list = typeof statuses === 'string' ? [statuses] : statuses;
    if (list.length === 0) return 0;
    const snap = await getCountFromServer(query(collection(db, QUEUES[queue].collection), statusConstraint(list)));
    return snap.data().count;
}

/** Un count por estado (para los chips «Aprobadas (12) · Rechazadas (3)»). null si ese count falla. */
export async function countEachStatus(
    queue: QueueKey,
    statuses: readonly string[] = [
        ...QUEUES[queue].pendingStatuses,
        ...QUEUES[queue].activeStatuses,
        ...QUEUES[queue].resolvedStatuses,
    ],
): Promise<Record<string, number | null>> {
    const entries = await Promise.all(statuses.map(async (status) => {
        try {
            return [status, await countByStatus(queue, status)] as const;
        } catch (error) {
            console.warn(`adminQueues: no se pudo contar ${queue}/${status}`, error);
            return [status, null] as const;
        }
    }));
    return Object.fromEntries(entries);
}

export const looksLikeId = (term: string): boolean => {
    const trimmed = term.trim();
    return trimmed.length >= 15 && !/\s/.test(trimmed);
};

/**
 * Búsqueda exacta en servidor para lo que no está cargado: el documento con ese id
 * y los que tienen ese placeId o ese uid de autor. Devuelve [] si el término no
 * parece un id. Más recientes primero, sin duplicados.
 */
export async function lookupExact(
    term: string,
    queues: readonly QueueKey[] = QUEUE_KEYS,
    now: number = Date.now(),
): Promise<InboxItem[]> {
    const id = term.trim();
    if (!looksLikeId(id)) return [];

    const tasks: Array<Promise<InboxItem[]>> = [];
    queues.forEach((queue) => {
        const config = QUEUES[queue];
        const toItem = (snapId: string, data: DocumentData) => config.toInboxItem(snapId, data as Record<string, unknown>, now);
        if (!id.includes('/')) {
            tasks.push(getDoc(doc(db, config.collection, id))
                .then((snap) => (snap.exists() ? [toItem(snap.id, snap.data())] : [])));
        }
        [...config.placeFields, ...config.userFields].forEach((field) => {
            tasks.push(getDocs(query(collection(db, config.collection), where(field, '==', id), limit(LOOKUP_LIMIT)))
                .then((snap) => snap.docs.map((entry) => toItem(entry.id, entry.data()))));
        });
    });

    const settled = await Promise.allSettled(tasks);
    const byKey = new Map<string, InboxItem>();
    settled.forEach((result) => {
        if (result.status === 'rejected') {
            console.warn('adminQueues: búsqueda exacta fallida', result.reason);
            return;
        }
        result.value.forEach((item) => {
            if (!byKey.has(item.key)) byKey.set(item.key, item);
        });
    });
    return Array.from(byKey.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}
