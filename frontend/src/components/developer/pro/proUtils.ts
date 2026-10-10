/**
 * proUtils: lógica pura de la pestaña «Patrocinios y Pro» (sin React), para
 * poder probarla por separado.
 *
 * Sub-pestañas (?view=): inbox | active | history | pricing | duel | tools
 *   inbox     propuestas `pending` y `applying`, campañas y platos `requested` (del más antiguo al más reciente)
 *   active    campañas y platos `active`, ordenados por fecha de fin
 *   history   resueltos (approved | rejected | ended), tres consultas paginadas mezcladas por fecha
 *
 * API
 *   type ProView / ProQueueView; normalizeProView(view); isProQueueView(view)
 *   type ProQueueKey; PRO_QUEUES; type ProKind = 'proposal' | 'placement' | 'spotlight'
 *   KIND_QUEUE / QUEUE_KIND / KIND_META / KINDS_BY_VIEW; normalizeKindFilter(kind, view)
 *   type HistoryStatus; historyStatusOptions(kind); normalizeHistoryFilter(status, kind);
 *   historySources(kind, filter): [{ queue, statuses }]
 *   type ProRow; toProRow(item); isProQueue(queue); viewOfItem(item); proRowDomId(item)
 *   type ProDecision; decisionsFor(row, now?); isStuckProposal(row, now?); hasFailedApply(row);
 *   isRetryProposal(row, now?); isExpiredRequest(placement, now?)
 *   decisionPatch(row, decision, ctx); applyDecisionLocally(row, decision, ctx)
 *   decisionConfirm(row, decision, note); decisionSuccessText(row, decision)
 *   ctrText(metrics); applyResultText(proposal); spotlightCost(spotlight); spotlightDays(spotlight)
 *   closingInfo(row); activationInfo(row); campaignDatesText(row); proposalTypeMeta(type)
 *   sortOldestFirst(rows); sortByEndsAt(rows)
 *   loadSources(queues, fetchPage): SourceResult[]               una consulta por cola, sin tragarse errores
 *   createMergeSources / takeMerged / mergedHasMore               paginación del Historial
 *   fetchProCounts(): ProCounts; sumCounts(values); viewCount / kindCount / historyStatusCount
 *   type SectionMeta / ProSectionProps; composeRows(...)                lo visible en una sección
 */
import {
    QUEUES,
    countEachStatus,
    isStuckApplying,
    matchesSearch,
    toInboxItem,
    viewForStatus,
    type InboxItem,
    type QueueCursor,
    type QueueKey,
    type QueuePage,
} from '../../../services/adminQueues';
import {
    describeProposal,
    mapPlacement,
    mapProposal,
    mapSpotlight,
    type ItemProposal,
    type ItemProposalType,
    type ItemSpotlight,
    type SponsoredMetrics,
    type SponsoredPlacement,
} from '../../../services/BusinessProService';
import { formatDate, todayIso } from '../../../utils/adminTime';

// ── Vistas ───────────────────────────────────────────────────────────────────

export const PRO_VIEWS = ['inbox', 'active', 'history', 'pricing', 'duel', 'tools'] as const;
export type ProView = typeof PRO_VIEWS[number];
export type ProQueueView = 'inbox' | 'active' | 'history';

export const normalizeProView = (view: string | null | undefined): ProView =>
    ((PRO_VIEWS as readonly string[]).includes(view ?? '') ? view as ProView : 'inbox');

export const isProQueueView = (view: string | null | undefined): view is ProQueueView =>
    view === 'inbox' || view === 'active' || view === 'history';

// ── Colas y tipos ────────────────────────────────────────────────────────────

export type ProQueueKey = 'itemProposals' | 'sponsoredPlacements' | 'sponsoredItemSpotlights';
export const PRO_QUEUES: readonly ProQueueKey[] = ['itemProposals', 'sponsoredPlacements', 'sponsoredItemSpotlights'];

export type ProKind = 'proposal' | 'placement' | 'spotlight';
export type ProKindFilter = 'all' | ProKind;

export const KIND_QUEUE: Record<ProKind, ProQueueKey> = {
    proposal: 'itemProposals',
    placement: 'sponsoredPlacements',
    spotlight: 'sponsoredItemSpotlights',
};

export const QUEUE_KIND: Record<ProQueueKey, ProKind> = {
    itemProposals: 'proposal',
    sponsoredPlacements: 'placement',
    sponsoredItemSpotlights: 'spotlight',
};

export interface KindMeta {
    emoji: string;
    /** Etiqueta del chip de filtro. */
    label: string;
    /** «las propuestas de carta», para avisos («No se pudieron cargar …»). */
    the: string;
    gender: 'f' | 'm';
}

export const KIND_META: Record<ProKind, KindMeta> = {
    proposal: { emoji: '📝', label: 'Carta', the: 'las propuestas de carta', gender: 'f' },
    placement: { emoji: '📣', label: 'Campañas', the: 'las campañas', gender: 'f' },
    spotlight: { emoji: '🍽️', label: 'Platos', the: 'los platos destacados', gender: 'm' },
};

export const KINDS_BY_VIEW: Record<ProQueueView, readonly ProKind[]> = {
    inbox: ['proposal', 'placement', 'spotlight'],
    active: ['placement', 'spotlight'],
    history: ['proposal', 'placement', 'spotlight'],
};

export const normalizeKindFilter = (kind: string | null | undefined, view: ProQueueView): ProKindFilter =>
    (KINDS_BY_VIEW[view] as readonly string[]).includes(kind ?? '') ? kind as ProKind : 'all';

export const isProQueue = (queue: QueueKey): queue is ProQueueKey =>
    (PRO_QUEUES as readonly string[]).includes(queue);

/** Sub-pestaña donde vive un elemento según su estado (inbox, active o history). */
export const viewOfItem = (item: Pick<InboxItem, 'queue' | 'status'>): ProQueueView => {
    const view = viewForStatus(item.queue, item.status);
    return isProQueueView(view) ? view : 'history';
};

// ── Historial: filtros de estado ─────────────────────────────────────────────

export type HistoryStatus = 'approved' | 'rejected' | 'ended';
export type HistoryFilter = 'all' | HistoryStatus;

const HISTORY_ORDER: readonly HistoryStatus[] = ['approved', 'rejected', 'ended'];

export const HISTORY_STATUSES_BY_KIND: Record<ProKind, readonly HistoryStatus[]> = {
    proposal: ['approved', 'rejected'],
    placement: ['rejected', 'ended'],
    spotlight: ['rejected', 'ended'],
};

/** Chips de estado que tienen sentido para el tipo elegido (las campañas no se «aprueban»). */
export const historyStatusOptions = (kind: ProKindFilter): HistoryStatus[] => {
    if (kind !== 'all') return [...HISTORY_STATUSES_BY_KIND[kind]];
    return [...HISTORY_ORDER];
};

export const normalizeHistoryFilter = (status: string | null | undefined, kind: ProKindFilter): HistoryFilter =>
    (historyStatusOptions(kind) as string[]).includes(status ?? '') ? status as HistoryStatus : 'all';

/** Consultas que forman el Historial con esos filtros (una por cola, con sus estados). */
export const historySources = (kind: ProKindFilter, filter: HistoryFilter): Array<{ queue: ProQueueKey; statuses: HistoryStatus[] }> => {
    const kinds: readonly ProKind[] = kind === 'all' ? KINDS_BY_VIEW.history : [kind];
    return kinds
        .map((entry) => ({
            queue: KIND_QUEUE[entry],
            statuses: HISTORY_STATUSES_BY_KIND[entry].filter((status) => filter === 'all' || status === filter),
        }))
        .filter((source) => source.statuses.length > 0);
};

// ── Filas tipadas ────────────────────────────────────────────────────────────

export type ProRow =
    | { kind: 'proposal'; item: InboxItem; proposal: ItemProposal }
    | { kind: 'placement'; item: InboxItem; placement: SponsoredPlacement }
    | { kind: 'spotlight'; item: InboxItem; spotlight: ItemSpotlight };

export const toProRow = (item: InboxItem): ProRow => {
    if (item.queue === 'itemProposals') return { kind: 'proposal', item, proposal: mapProposal(item.id, item.data) };
    if (item.queue === 'sponsoredPlacements') return { kind: 'placement', item, placement: mapPlacement(item.id, item.data) };
    return { kind: 'spotlight', item, spotlight: mapSpotlight(item.id, item.data) };
};

const campaignOf = (row: ProRow): SponsoredPlacement | ItemSpotlight | null => {
    if (row.kind === 'placement') return row.placement;
    if (row.kind === 'spotlight') return row.spotlight;
    return null;
};

/** id del elemento HTML de la fila (para el scroll al foco). */
export const proRowDomId = (item: Pick<InboxItem, 'queue' | 'id'>): string => `pro-row-${item.queue}-${item.id}`;

export const placeLabel = (row: ProRow): string => {
    const record = row.kind === 'proposal' ? row.proposal : row.kind === 'placement' ? row.placement : row.spotlight;
    return record.placeName || record.placeId || 'el lugar';
};

// ── Etiquetas ────────────────────────────────────────────────────────────────

export const PROPOSAL_TYPE_META: Record<ItemProposalType, { emoji: string; label: string }> = {
    merge: { emoji: '🔀', label: 'Fusión' },
    rename: { emoji: '✏️', label: 'Renombre' },
    reassign_review: { emoji: '↪️', label: 'Mover reseña' },
};

export const PLACEMENT_TYPE_META: Record<SponsoredPlacement['type'], { emoji: string; label: string }> = {
    home: { emoji: '🏠', label: 'Home' },
    search: { emoji: '🔎', label: 'Búsquedas' },
};

const formatCount = (value: number): string => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });

const plural = (count: number, one: string, many: string): string => `${formatCount(count)} ${count === 1 ? one : many}`;

export const ctrText = (metrics: SponsoredMetrics): string => {
    const ratio = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
    return `${ratio.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
};

/** «🔀 3 reseñas movidas», «✏️ Nombre cambiado»… Solo en propuestas aprobadas. */
export const applyResultText = (proposal: ItemProposal): string | null => {
    if (proposal.status !== 'approved' || !proposal.applyResult) return null;
    const { reassignedReviews, renamed } = proposal.applyResult;
    if (typeof reassignedReviews === 'number') {
        const emoji = proposal.type === 'reassign_review' ? '↪️' : '🔀';
        if (reassignedReviews === 0) return `${emoji} Ninguna reseña que mover`;
        return `${emoji} ${plural(reassignedReviews, 'reseña movida', 'reseñas movidas')}`;
    }
    if (renamed) return '✏️ Nombre cambiado';
    return null;
};

export interface SpotlightCost {
    impulses: number | null;
    /** Pagados con saldo de regalo (creditsUsed). */
    gift: number;
    /** A facturar (billedImpulses); se deduce si falta. */
    billed: number | null;
    /** Importe facturado (solo la parte que no es regalo). */
    totalEur: number | null;
}

export const spotlightCost = (spotlight: ItemSpotlight): SpotlightCost => {
    const impulses = spotlight.impulses ?? null;
    const gift = spotlight.creditsUsed ?? 0;
    const billed = spotlight.billedImpulses ?? (impulses !== null ? Math.max(0, impulses - gift) : null);
    return {
        impulses,
        gift,
        billed,
        totalEur: typeof spotlight.totalPriceEur === 'number' ? spotlight.totalPriceEur : null,
    };
};

export const spotlightDays = (spotlight: ItemSpotlight): number => {
    if (spotlight.days && spotlight.days >= 1) return spotlight.days;
    if (spotlight.weeks && spotlight.weeks >= 1) return spotlight.weeks * 7;
    return 1;
};

/** «del 12/10 al 19/10», «hasta el 19/10», «desde el 12/10» o ''. */
export const campaignDatesText = (startsAt?: string, endsAt?: string, now?: number): string => {
    if (startsAt && endsAt) return `del ${formatDate(startsAt, now)} al ${formatDate(endsAt, now)}`;
    if (endsAt) return `hasta el ${formatDate(endsAt, now)}`;
    if (startsAt) return `desde el ${formatDate(startsAt, now)}`;
    return '';
};

// ── Quién y cuándo ───────────────────────────────────────────────────────────

export interface ActorInfo {
    status: string;
    by: string | null;
    at: number | null;
}

/**
 * Quién cerró una fila resuelta. Las campañas que cerró el proceso diario solo
 * tienen endedAt (se muestran como 🤖 Automático); las que se finalizaron a mano
 * guardan reviewedBy/reviewedAt (o endedBy/closedBy cuando el backend los escriba).
 */
export const closingInfo = (row: ProRow): ActorInfo => {
    if (row.kind === 'proposal') {
        const { status, reviewedBy, reviewedAtMs, applyingAtMs } = row.proposal;
        // 'applying': quién la está aplicando y desde cuándo.
        const at = status === 'applying' ? applyingAtMs : reviewedAtMs;
        return { status, by: reviewedBy ?? null, at: at ?? null };
    }
    const campaign = campaignOf(row)!;
    const { status } = campaign;
    if (status === 'ended') {
        if (campaign.endedBy) {
            return { status, by: campaign.endedBy, at: campaign.endedAtMs ?? campaign.closedAtMs ?? campaign.reviewedAtMs ?? null };
        }
        if (campaign.endedAtMs) return { status, by: 'system', at: campaign.endedAtMs };
        return { status, by: campaign.closedBy ?? campaign.reviewedBy ?? null, at: campaign.closedAtMs ?? campaign.reviewedAtMs ?? null };
    }
    if (status === 'rejected') {
        if (!campaign.reviewedBy && campaign.closedAtMs) return { status, by: campaign.closedBy ?? 'system', at: campaign.closedAtMs };
        return { status, by: campaign.closedBy ?? campaign.reviewedBy ?? null, at: campaign.closedAtMs ?? campaign.reviewedAtMs ?? null };
    }
    return { status, by: null, at: null };
};

/** Quién activó una campaña (si se sabe). En las activas, reviewedBy/At es la activación. */
export const activationInfo = (row: ProRow): ActorInfo | null => {
    const campaign = campaignOf(row);
    if (!campaign) return null;
    if (campaign.activatedBy || campaign.activatedAtMs) {
        return { status: 'active', by: campaign.activatedBy ?? null, at: campaign.activatedAtMs ?? null };
    }
    const reviewIsActivation = campaign.status === 'active' || (campaign.status === 'ended' && Boolean(campaign.endedAtMs) && !campaign.endedBy);
    if (reviewIsActivation && (campaign.reviewedBy || campaign.reviewedAtMs)) {
        return { status: 'active', by: campaign.reviewedBy ?? null, at: campaign.reviewedAtMs ?? null };
    }
    // Platos: startsAt es el día en que se activó.
    if (row.kind === 'spotlight' && row.spotlight.startsAt && campaign.status !== 'requested') {
        return { status: 'active', by: null, at: null };
    }
    return null;
};

// ── Decisiones ───────────────────────────────────────────────────────────────

export type ProDecision = 'approve' | 'reject' | 'activate' | 'end';

/**
 * Propuesta atascada en 'applying' (más de 10 minutos): la llamada que la
 * aplicaba murió. Solo se puede reintentar; el servidor no deja rechazarla
 * porque parte del cambio puede estar ya hecho. Si el reintento falla, vuelve
 * a 'pending' y entonces sí se puede rechazar.
 */
export const isStuckProposal = (row: ProRow, now: number = Date.now()): boolean =>
    row.kind === 'proposal' && row.proposal.status === 'applying' && isStuckApplying(row.item.data, now);

/**
 * Propuesta que volvió a 'pending' porque aplicarla falló (applyError). Puede
 * que parte del cambio ya esté hecho (la fusión o el nombre nuevo se guardan
 * antes de reconstruir la carta): se ofrece primero «🔁 Reintentar» y el
 * servidor no deja rechazarla si el cambio ya se ve en la carta.
 */
export const hasFailedApply = (row: ProRow): boolean =>
    row.kind === 'proposal' && row.proposal.status === 'pending' && Boolean(row.proposal.applyError);

/** Aprobar es reintentar: atascada en 'applying' o con un intento fallido. */
export const isRetryProposal = (row: ProRow, now: number = Date.now()): boolean =>
    isStuckProposal(row, now) || hasFailedApply(row);

/**
 * Campaña de home o búsqueda pedida cuyo último día ya pasó: el servidor no la
 * activa (B5), solo se puede rechazar. Los platos no cuentan: al activarlos
 * reciben fechas nuevas.
 */
export const isExpiredRequest = (placement: SponsoredPlacement, now: number = Date.now()): boolean =>
    placement.status === 'requested' && Boolean(placement.endsAt && placement.endsAt < todayIso(now));

export const decisionsFor = (row: ProRow, now: number = Date.now()): ProDecision[] => {
    if (row.kind === 'proposal') {
        if (hasFailedApply(row)) return ['approve', 'reject'];
        if (row.proposal.status === 'pending') return ['reject', 'approve'];
        return isStuckProposal(row, now) ? ['approve'] : [];
    }
    const { status } = campaignOf(row)!;
    if (status === 'requested') {
        if (row.kind === 'placement' && isExpiredRequest(row.placement, now)) return ['reject'];
        return ['reject', 'activate'];
    }
    if (status === 'active') return ['end'];
    return [];
};

const NEXT_STATUS: Record<ProDecision, string> = {
    approve: 'approved',
    reject: 'rejected',
    activate: 'active',
    end: 'ended',
};

/** Fecha UTC 'YYYY-MM-DD' + días: el mismo cálculo que hace el backend al activar un plato. */
export const isoUtcPlusDays = (now: number, days: number): string => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

export interface DecisionContext {
    uid: string | null;
    notes: string;
    now: number;
}

/** Lo que el backend escribe en el documento al decidir (para pintarlo sin esperar a releerlo). */
export const decisionPatch = (row: ProRow, decision: ProDecision, { uid, notes, now }: DecisionContext): Record<string, unknown> => {
    const patch: Record<string, unknown> = {
        status: NEXT_STATUS[decision],
        adminNotes: notes || null,
        reviewedBy: uid,
        reviewedAt: now,
    };
    if (row.kind === 'spotlight' && decision === 'activate') {
        patch.startsAt = isoUtcPlusDays(now, 0);
        patch.endsAt = isoUtcPlusDays(now, spotlightDays(row.spotlight));
    }
    if (row.kind === 'spotlight' && decision === 'reject' && (row.spotlight.creditsUsed ?? 0) > 0 && !row.spotlight.creditsRefunded) {
        patch.creditsRefunded = true;
        patch.creditsRefundedAt = now;
    }
    return patch;
};

export const applyDecisionLocally = (row: ProRow, decision: ProDecision, context: DecisionContext): ProRow =>
    toProRow(toInboxItem(row.item.queue, row.item.id, { ...row.item.data, ...decisionPatch(row, decision, context) }, context.now));

export interface DecisionConfirmText {
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
}

const noteSentence = (note: string): string => (note ? `Nota para el negocio: “${note}”.` : 'Sin nota para el negocio.');

export const decisionConfirm = (row: ProRow, decision: ProDecision, note: string, now?: number): DecisionConfirmText => {
    const place = placeLabel(row);
    const noteText = noteSentence(note);
    if (row.kind === 'proposal') {
        const summary = `${place}: ${describeProposal(row.proposal)}.`;
        if (decision === 'approve' && isStuckProposal(row, now)) {
            return {
                title: '🔁 ¿Reintentar la propuesta?',
                message: `${summary} Se quedó a medias al aplicarla. Se termina de aplicar y avisamos al negocio. ${noteText}`,
                confirmLabel: 'Reintentar',
            };
        }
        if (hasFailedApply(row)) {
            const failure = `El último intento de aplicarla falló («${row.proposal.applyError?.message ?? ''}»)`;
            // El servidor solo lo comprueba en fusiones y renombres (se ven en los elementos de la carta).
            const serverGuard = row.proposal.type === 'reassign_review' ? '' : ' Si ya se ve en la carta, te pediremos «🔁 Reintentar».';
            return decision === 'approve'
                ? {
                    title: '🔁 ¿Reintentar la propuesta?',
                    message: `${summary} ${failure}. Se vuelve a aplicar y, si sale bien, avisamos al negocio. ${noteText}`,
                    confirmLabel: 'Reintentar',
                }
                : {
                    title: '❌ ¿Rechazar la propuesta?',
                    message: `${summary} ⚠️ ${failure} y puede que parte del cambio ya esté hecho: rechazarla no lo deshace.${serverGuard} Avisamos al negocio. ${noteText}`,
                    confirmLabel: 'Rechazar',
                    destructive: true,
                };
        }
        return decision === 'approve'
            ? { title: '✅ ¿Aprobar y aplicar la propuesta?', message: `${summary} Se aplica al momento y avisamos al negocio. ${noteText}`, confirmLabel: 'Aprobar y aplicar' }
            : { title: '❌ ¿Rechazar la propuesta?', message: `${summary} Avisamos al negocio. ${noteText}`, confirmLabel: 'Rechazar', destructive: true };
    }
    if (row.kind === 'placement') {
        const { placement } = row;
        const type = PLACEMENT_TYPE_META[placement.type].label;
        const dates = campaignDatesText(placement.startsAt, placement.endsAt, now);
        const summary = `${type} · ${place}${placement.headline ? ` · «${placement.headline}»` : ''}${dates ? ` · ${dates}` : ''}.`;
        if (decision === 'activate') {
            // Si su fecha de fin ya pasó no se ofrece Activar (isExpiredRequest).
            return { title: '🟢 ¿Activar la campaña?', message: `${summary} ${noteText}`, confirmLabel: 'Activar' };
        }
        if (decision === 'end') {
            return { title: '🏁 ¿Finalizar la campaña?', message: `${summary} Deja de mostrarse ahora y avisamos al negocio. ${noteText}`, confirmLabel: 'Finalizar', destructive: true };
        }
        return { title: '❌ ¿Rechazar la campaña?', message: `${summary} Avisamos al negocio. ${noteText}`, confirmLabel: 'Rechazar', destructive: true };
    }
    const { spotlight } = row;
    const summary = `«${spotlight.itemName || 'Plato'}» de ${place}.`;
    if (decision === 'activate') {
        const days = spotlightDays(spotlight);
        // El servidor comprueba la carta al activar: si el plato sigue fuera, no lo activa.
        const gone = spotlight.itemInactive ? ' ⚠️ El plato ya no está en la carta: si sigue así, no se podrá activar.' : '';
        return {
            title: '🟢 ¿Activar el plato destacado?',
            message: `${summary}${gone} ${days === 1 ? 'Su día empieza' : `Sus ${days} días empiezan`} a contar hoy. ${noteText}`,
            confirmLabel: 'Activar',
        };
    }
    if (decision === 'end') {
        return { title: '🏁 ¿Finalizar el plato destacado?', message: `${summary} Deja de mostrarse ahora y avisamos al negocio. ${noteText}`, confirmLabel: 'Finalizar', destructive: true };
    }
    const gift = spotlight.creditsUsed ?? 0;
    const refund = gift > 0 && !spotlight.creditsRefunded ? ` Se devuelven ${plural(gift, 'impulso', 'impulsos')} de regalo al local.` : '';
    return { title: '❌ ¿Rechazar el plato destacado?', message: `${summary}${refund} Avisamos al negocio. ${noteText}`, confirmLabel: 'Rechazar', destructive: true };
};

export const decisionSuccessText = (row: ProRow, decision: ProDecision): string => {
    const masculine = row.kind === 'spotlight';
    const ending = masculine ? 'o' : 'a';
    if (decision === 'approve') return '✅ Aprobada y aplicada. Hemos avisado al negocio.';
    if (decision === 'activate') return `🟢 Activad${ending}. Ya está en «En curso» y hemos avisado al negocio.`;
    if (decision === 'end') return `🏁 Finalizad${ending}. Queda archivad${ending} en «Historial».`;
    if (row.kind === 'spotlight' && (row.spotlight.creditsUsed ?? 0) > 0 && !row.spotlight.creditsRefunded) {
        return `❌ Rechazado. Hemos devuelto ${plural(row.spotlight.creditsUsed ?? 0, 'impulso', 'impulsos')} al local y avisado al negocio.`;
    }
    return `❌ Rechazad${ending}. Hemos avisado al negocio.`;
};

// ── Orden ────────────────────────────────────────────────────────────────────

export const sortOldestFirst = (rows: ProRow[]): ProRow[] =>
    [...rows].sort((a, b) => a.item.createdAtMs - b.item.createdAtMs);

const endsAtOf = (row: ProRow): string => campaignOf(row)?.endsAt ?? '';

/** «En curso»: primero la que termina antes; las que no tienen fecha de fin, al final. */
export const sortByEndsAt = (rows: ProRow[]): ProRow[] => [...rows].sort((a, b) => {
    const endA = endsAtOf(a);
    const endB = endsAtOf(b);
    if (endA !== endB) {
        if (!endA) return 1;
        if (!endB) return -1;
        return endA < endB ? -1 : 1;
    }
    return a.item.createdAtMs - b.item.createdAtMs;
});

// ── Carga sin tragarse errores ───────────────────────────────────────────────

export interface SourceResult {
    queue: ProQueueKey;
    items: InboxItem[];
    hasMore: boolean;
    degraded: boolean;
    error: string | null;
}

/** Una consulta por cola en paralelo. Si una falla, las demás se muestran y esa trae su error. */
export async function loadSources(
    queues: readonly ProQueueKey[],
    fetchPage: (queue: ProQueueKey) => Promise<QueuePage>,
): Promise<SourceResult[]> {
    const settled = await Promise.allSettled(queues.map((queue) => fetchPage(queue)));
    return settled.map((result, index) => {
        const queue = queues[index];
        if (result.status === 'fulfilled') {
            return { queue, items: result.value.items, hasMore: result.value.hasMore, degraded: result.value.degraded, error: null };
        }
        console.error(`ProProposalsTab: no se pudo cargar ${queue}`, result.reason);
        return { queue, items: [], hasMore: false, degraded: false, error: `No se pudieron cargar ${KIND_META[QUEUE_KIND[queue]].the}.` };
    });
}

// ── Historial: tres consultas paginadas mezcladas por fecha ──────────────────

export interface MergeSource {
    queue: ProQueueKey;
    statuses: readonly string[];
    /** Traídos del servidor pero aún sin mostrar. */
    buffer: InboxItem[];
    cursor: QueueCursor | null;
    hasMore: boolean;
    degraded: boolean;
    error: string | null;
}

export type MergeFetcher = (source: MergeSource) => Promise<QueuePage>;

export const createMergeSources = (sources: Array<{ queue: ProQueueKey; statuses: readonly string[] }>): MergeSource[] =>
    sources.map((source) => ({ ...source, buffer: [], cursor: null, hasMore: true, degraded: false, error: null }));

export const mergedHasMore = (sources: readonly MergeSource[]): boolean =>
    sources.some((source) => source.buffer.length > 0 || (source.hasMore && !source.error));

/**
 * Saca los `count` siguientes elementos, del más reciente al más antiguo, de
 * varias consultas paginadas. Solo se emite un elemento cuando todas las colas
 * tienen algo en el búfer o ya no tienen más, así el orden es exacto.
 */
export async function takeMerged(
    sources: readonly MergeSource[],
    count: number,
    fetchPage: MergeFetcher,
): Promise<{ sources: MergeSource[]; items: InboxItem[] }> {
    const next = sources.map((source) => ({ ...source, buffer: [...source.buffer] }));
    const items: InboxItem[] = [];
    while (items.length < count) {
        await Promise.all(next.map(async (source) => {
            if (source.buffer.length > 0 || !source.hasMore || source.error) return;
            try {
                const page = await fetchPage(source);
                source.buffer.push(...page.items);
                source.cursor = page.cursor;
                source.hasMore = page.hasMore && page.items.length > 0;
                source.degraded = source.degraded || page.degraded;
            } catch (error) {
                console.error(`ProProposalsTab: no se pudo cargar el historial de ${source.queue}`, error);
                source.hasMore = false;
                source.error = `No se pudo cargar el historial de ${KIND_META[QUEUE_KIND[source.queue]].the}.`;
            }
        }));
        const candidates = next.filter((source) => source.buffer.length > 0);
        if (candidates.length === 0) break;
        const newest = candidates.reduce((best, source) => (
            source.buffer[0].createdAtMs > best.buffer[0].createdAtMs ? source : best
        ));
        items.push(newest.buffer.shift()!);
    }
    return { sources: next, items };
}

// ── Contadores ───────────────────────────────────────────────────────────────

export type ProCounts = Record<ProQueueKey, Record<string, number | null>>;

export const PRO_COUNTS_KEY = ['developer', 'proProposals', 'counts'] as const;

/** Un count por cola y estado (null si ese count falla). */
export async function fetchProCounts(): Promise<ProCounts> {
    const [itemProposals, sponsoredPlacements, sponsoredItemSpotlights] = await Promise.all(PRO_QUEUES.map((queue) => countEachStatus(queue)));
    return { itemProposals, sponsoredPlacements, sponsoredItemSpotlights };
}

/** Suma de contadores; null si alguno no se sabe (para no enseñar un total falso). */
export const sumCounts = (values: ReadonlyArray<number | null | undefined>): number | null => {
    let total = 0;
    for (const value of values) {
        if (typeof value !== 'number') return null;
        total += value;
    }
    return total;
};

export const countOf = (counts: ProCounts | undefined, queue: ProQueueKey, status: string): number | null =>
    counts ? counts[queue]?.[status] ?? null : null;

/** Contador de cada tipo en una sub-pestaña con los filtros dados. */
export const kindCount = (
    counts: ProCounts | undefined,
    view: ProQueueView,
    kind: ProKind,
    historyFilter: HistoryFilter = 'all',
): number | null => {
    const queue = KIND_QUEUE[kind];
    // Bandeja: los mismos estados que la lista (propuestas: pending y applying).
    if (view === 'inbox') return sumCounts(QUEUES[queue].pendingStatuses.map((status) => countOf(counts, queue, status)));
    if (view === 'active') return kind === 'proposal' ? 0 : countOf(counts, queue, 'active');
    const statuses = HISTORY_STATUSES_BY_KIND[kind].filter((status) => historyFilter === 'all' || status === historyFilter);
    return sumCounts(statuses.map((status) => countOf(counts, queue, status)));
};

export const viewCount = (
    counts: ProCounts | undefined,
    view: ProQueueView,
    kind: ProKindFilter = 'all',
    historyFilter: HistoryFilter = 'all',
): number | null => {
    const kinds: readonly ProKind[] = kind === 'all' ? KINDS_BY_VIEW[view] : [kind];
    return sumCounts(kinds.map((entry) => kindCount(counts, view, entry, historyFilter)));
};

/** Contador del chip de estado del Historial con el tipo elegido. */
export const historyStatusCount = (counts: ProCounts | undefined, kind: ProKindFilter, status: HistoryStatus): number | null => {
    const kinds: readonly ProKind[] = kind === 'all' ? KINDS_BY_VIEW.history : [kind];
    return sumCounts(kinds
        .filter((entry) => HISTORY_STATUSES_BY_KIND[entry].includes(status))
        .map((entry) => countOf(counts, KIND_QUEUE[entry], status)));
};

// ── Contrato de las secciones con colas ──────────────────────────────────────

/** Estado de carga que cada sección comunica a la cabecera (Actualizar, «hace 1 min», índice). */
export interface SectionMeta {
    loading: boolean;
    loadedAt: number | null;
    degraded: boolean;
}

export const sameMeta = (a: SectionMeta | undefined, b: SectionMeta): boolean =>
    Boolean(a) && a!.loading === b.loading && a!.loadedAt === b.loadedAt && a!.degraded === b.degraded;

export interface ProSectionProps {
    /** La sub-pestaña está a la vista (las demás siguen montadas pero ocultas). */
    active: boolean;
    /** Cambia para pedir una recarga (Actualizar, o una decisión en otra sub-pestaña). */
    refreshKey: number;
    search: string;
    /** Hay una búsqueda exacta en el servidor en marcha. */
    searching?: boolean;
    kind: ProKindFilter;
    focusId: string | null;
    /** Documento enfocado leído del servidor (puede no estar entre lo cargado). */
    focusItem: InboxItem | null;
    /** Resultados de lookupExact para el término actual. */
    exactItems: InboxItem[];
    onDecided: () => void;
    onMeta: (meta: SectionMeta) => void;
}

/** Visible en una sección: lo cargado + el foco fijado arriba + coincidencias exactas del servidor. */
export const composeRows = ({
    loaded,
    view,
    kind,
    term,
    focusItem,
    exactItems,
    overrides,
    accepts = () => true,
}: {
    loaded: ProRow[];
    view: ProQueueView;
    kind: ProKindFilter;
    term: string;
    focusItem: InboxItem | null;
    exactItems: InboxItem[];
    overrides: Record<string, ProRow>;
    /** Filtro extra para lo que llega de fuera de lo cargado (p. ej. el estado del Historial). */
    accepts?: (item: InboxItem) => boolean;
}): ProRow[] => {
    const matchesKind = (item: InboxItem) => kind === 'all' || (isProQueue(item.queue) && QUEUE_KIND[item.queue] === kind);
    const loadedKeys = new Set(loaded.map((row) => row.item.key));
    const base = loaded.filter((row) => matchesKind(row.item));
    // El foco se fija arriba en su sub-pestaña aunque no esté cargado o el filtro de tipo no lo incluya.
    const focusLoaded = focusItem ? loaded.find((row) => row.item.key === focusItem.key) : undefined;
    const pinned = focusItem && isProQueue(focusItem.queue) && viewOfItem(focusItem) === view && !base.some((row) => row.item.key === focusItem.key)
        ? [focusLoaded ?? toProRow(focusItem)]
        : [];
    let visible = [...pinned, ...base];
    if (term) {
        visible = visible.filter((row) => matchesSearch(row.item, term));
        const shown = new Set(visible.map((row) => row.item.key));
        exactItems.forEach((item) => {
            if (shown.has(item.key) || loadedKeys.has(item.key) || !isProQueue(item.queue)) return;
            if (viewOfItem(item) !== view || !matchesKind(item) || !accepts(item)) return;
            visible.push(toProRow(item));
            shown.add(item.key);
        });
    }
    return visible.map((row) => overrides[row.item.key] ?? row);
};
