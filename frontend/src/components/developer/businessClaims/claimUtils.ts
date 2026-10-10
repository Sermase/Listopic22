/**
 * claimUtils: lógica pura de la pestaña «Solicitudes negocio» (sin React ni Firestore),
 * para poder probarla por separado.
 *
 * API
 *   type ClaimsView = 'pending' | 'resolved';  type ClaimsFilter = 'all' | 'approved' | 'rejected'
 *   normalizeClaimsView(view) / normalizeClaimsFilter(status)     lo que llega por la URL
 *   viewOfStatus(status): ClaimsView
 *   toClaim(item: InboxItem): ClaimView                           documento → BusinessClaim tipado
 *   placeContextFromDoc(data | null): PlaceContext                 estado de verificación del lugar
 *   claimWarnings(claim, place, competing): InboxBadge[]          «⚠️ Ya verificado · propietario», «👥 N solicitudes…»
 *   ownerToReplace(claim, place): string | null                   uid del propietario que se sustituiría al aprobar
 *   countPendingByPlace(items): Map<placeId, n>
 *   markDecided(item, status, notes, uid, now): InboxItem          estado local tras decidir (con reviewedAt)
 *   buildClaimHistory(claim, audit): ClaimHistoryEntry[]           «Historial de decisiones» (más reciente primero)
 *   safeWebsiteUrl(text) / phoneHref(text) / formatBytes(bytes)
 */
import type { InboxBadge, InboxItem } from '../../../services/adminQueues';
import type { BusinessClaim, BusinessClaimProof, BusinessClaimStatus } from '../../../services/BusinessClaimService';
import { MINUTE_MS, toMillis } from '../../../utils/adminTime';

export type ClaimsView = 'pending' | 'resolved';
export type ClaimsFilter = 'all' | 'approved' | 'rejected';
export type ClaimDecision = Exclude<BusinessClaimStatus, 'pending'>;

export const MIN_REJECT_NOTE_LENGTH = 8;

export const normalizeClaimsView = (view: string | null | undefined): ClaimsView =>
    (view === 'resolved' ? 'resolved' : 'pending');

export const normalizeClaimsFilter = (status: string | null | undefined): ClaimsFilter =>
    (status === 'approved' || status === 'rejected' ? status : 'all');

export const viewOfStatus = (status: string): ClaimsView => (status === 'pending' ? 'pending' : 'resolved');

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const optionalStr = (value: unknown): string | null => str(value) || null;

const toProof = (value: unknown): BusinessClaimProof | null => {
    if (!value || typeof value !== 'object') return null;
    const proof = value as Record<string, unknown>;
    const downloadUrl = str(proof.downloadUrl);
    const storagePath = str(proof.storagePath);
    if (!downloadUrl && !storagePath) return null;
    return {
        name: str(proof.name) || 'Archivo',
        size: typeof proof.size === 'number' && Number.isFinite(proof.size) ? proof.size : 0,
        type: str(proof.type),
        storagePath,
        downloadUrl,
    };
};

const toProofs = (value: unknown): BusinessClaimProof[] => (Array.isArray(value)
    ? value.map(toProof).filter((proof): proof is BusinessClaimProof => proof !== null)
    : []);

/** Decisión anterior guardada al reenviar una solicitud rechazada (B3, `previousReviews`). */
export interface ClaimPreviousReview {
    status: string;
    adminNotes: string | null;
    reviewedBy: string | null;
    reviewedAtMs: number;
    proofs: BusinessClaimProof[];
}

export interface ClaimView extends BusinessClaim {
    createdAtMs: number;
    updatedAtMs: number;
    reviewedAtMs: number;
    previousReviews: ClaimPreviousReview[];
}

export const toClaim = (item: Pick<InboxItem, 'id' | 'status' | 'data'>): ClaimView => {
    const data = item.data;
    const status = (str(item.status) || str(data.status) || 'pending') as BusinessClaimStatus;
    const previousReviews = Array.isArray(data.previousReviews)
        ? data.previousReviews
            .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
            .map((entry) => ({
                status: str(entry.status) || 'rejected',
                adminNotes: optionalStr(entry.adminNotes),
                reviewedBy: optionalStr(entry.reviewedBy),
                reviewedAtMs: toMillis(entry.reviewedAt),
                proofs: toProofs(entry.proofs),
            }))
        : [];
    return {
        id: item.id,
        userId: str(data.userId),
        userEmail: optionalStr(data.userEmail),
        userName: optionalStr(data.userName),
        placeId: str(data.placeId),
        placeName: str(data.placeName),
        placeAddress: optionalStr(data.placeAddress),
        role: str(data.role),
        contactEmail: str(data.contactEmail),
        contactPhone: str(data.contactPhone),
        website: str(data.website),
        message: typeof data.message === 'string' ? data.message : '',
        status,
        proofs: toProofs(data.proofs),
        truthDeclarationAccepted: data.truthDeclarationAccepted === true,
        truthDeclarationText: str(data.truthDeclarationText),
        truthDeclarationAcceptedAt: data.truthDeclarationAcceptedAt,
        adminNotes: optionalStr(data.adminNotes),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        reviewedAt: data.reviewedAt,
        reviewedBy: optionalStr(data.reviewedBy),
        createdAtMs: toMillis(data.createdAt),
        updatedAtMs: toMillis(data.updatedAt),
        reviewedAtMs: toMillis(data.reviewedAt),
        previousReviews,
    };
};

/** Quién se muestra como solicitante: nombre, email o uid. */
export const claimantLabel = (claim: Pick<BusinessClaim, 'userName' | 'userEmail' | 'userId'>): string =>
    str(claim.userName) || str(claim.userEmail) || str(claim.userId) || 'Solicitante';

// ── Contexto del lugar ──────────────────────────────────────────────────────

export interface PlaceContext {
    exists: boolean;
    name: string;
    verified: boolean;
    ownerId: string;
    managerIds: string[];
    claimId: string;
}

export const placeContextFromDoc = (data: Record<string, unknown> | null | undefined): PlaceContext => {
    if (!data) return { exists: false, name: '', verified: false, ownerId: '', managerIds: [], claimId: '' };
    return {
        exists: true,
        name: str(data.name),
        verified: data.businessVerified === true,
        ownerId: str(data.businessOwnerUserId),
        managerIds: Array.isArray(data.businessManagerIds)
            ? data.businessManagerIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            : [],
        claimId: str(data.businessClaimId),
    };
};

/** uid del propietario actual si aprobar esta solicitud le quitaría la propiedad; null si no. */
export const ownerToReplace = (claim: Pick<BusinessClaim, 'userId'>, place: PlaceContext | null | undefined): string | null => {
    if (!place?.exists || !place.verified || !place.ownerId) return null;
    return place.ownerId !== claim.userId ? place.ownerId : null;
};

/** Solicitudes pendientes por lugar (sin contar dos veces el mismo id). */
export const countPendingByPlace = (items: ReadonlyArray<Pick<InboxItem, 'id' | 'status' | 'placeId'>>): Map<string, number> => {
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    items.forEach((item) => {
        if (item.status !== 'pending' || !item.placeId || seen.has(item.id)) return;
        seen.add(item.id);
        counts.set(item.placeId, (counts.get(item.placeId) ?? 0) + 1);
    });
    return counts;
};

/**
 * Avisos de una solicitud pendiente: lugar ya verificado (con su propietario en
 * `userId`, para pintar el nombre), solicitudes que compiten por el mismo lugar
 * y lugar borrado. `place` undefined = aún cargando (sin avisos de lugar).
 */
export const claimWarnings = (
    claim: Pick<BusinessClaim, 'userId' | 'status'>,
    place: PlaceContext | null | undefined,
    competing: number,
): InboxBadge[] => {
    if (claim.status !== 'pending') return [];
    const badges: InboxBadge[] = [];
    if (place && !place.exists) {
        badges.push({ emoji: '❓', text: 'El lugar ya no existe', tone: 'danger' });
    } else if (place?.verified) {
        if (!place.ownerId) badges.push({ emoji: '⚠️', text: 'Ya verificado, sin propietario', tone: 'warning' });
        else if (place.ownerId !== claim.userId) badges.push({ emoji: '⚠️', text: 'Ya verificado · propietario', tone: 'warning', userId: place.ownerId });
        else badges.push({ emoji: 'ℹ️', text: 'Ya es el propietario', tone: 'info' });
    } else if (place && claim.userId && place.managerIds.includes(claim.userId)) {
        badges.push({ emoji: 'ℹ️', text: 'Ya es gestor del lugar', tone: 'info' });
    }
    if (competing > 1) badges.push({ emoji: '👥', text: `${competing} solicitudes para este lugar`, tone: 'warning' });
    return badges;
};

/** Estado local tras aprobar o rechazar (sin esperar a recargar). */
export const markDecided = (
    item: InboxItem,
    status: ClaimDecision,
    adminNotes: string,
    reviewerUid: string | null,
    now: number = Date.now(),
): InboxItem => ({
    ...item,
    status,
    target: { ...item.target, view: 'resolved' },
    data: {
        ...item.data,
        status,
        adminNotes,
        reviewedBy: reviewerUid,
        reviewedAt: now,
        updatedAt: now,
    },
});

// ── Historial de decisiones ────────────────────────────────────────────────

/** Entrada de `adminAuditLog` (businessClaim.review y similares). */
export interface ClaimAuditEntry {
    id: string;
    action: string;
    actorUid: string | null;
    createdAtMs: number;
    details: Record<string, unknown>;
}

export interface ClaimHistoryEntry {
    key: string;
    kind: 'review' | 'submitted' | 'other';
    status: string;
    by: string | null;
    atMs: number;
    notes: string | null;
    /** Propietario anterior, si la aprobación transfirió la propiedad (B4). */
    previousOwnerId: string | null;
    proofs: BusinessClaimProof[];
    action: string;
}

const MATCH_WINDOW_MS = 5 * MINUTE_MS;

export const auditEntryFromDoc = (id: string, data: Record<string, unknown>): ClaimAuditEntry => ({
    id,
    action: str(data.action),
    actorUid: optionalStr(data.actorUid),
    createdAtMs: toMillis(data.createdAt),
    details: data.details && typeof data.details === 'object' ? data.details as Record<string, unknown> : {},
});

/**
 * Une el audit log (quién y cuándo, sin nota) con lo que guarda la propia
 * solicitud (`adminNotes` de la decisión actual y `previousReviews` de los
 * reenvíos). Si una decisión aparece en los dos sitios, se pinta una vez.
 */
export const buildClaimHistory = (claim: ClaimView, audit: readonly ClaimAuditEntry[]): ClaimHistoryEntry[] => {
    const entries: ClaimHistoryEntry[] = audit.map((entry) => {
        const isReview = entry.action === 'businessClaim.review';
        return {
            key: `audit:${entry.id}`,
            kind: isReview ? 'review' : 'other',
            status: str(entry.details.status),
            by: entry.actorUid,
            atMs: entry.createdAtMs,
            notes: optionalStr(entry.details.adminNotes),
            previousOwnerId: optionalStr(entry.details.previousOwnerUserId),
            proofs: [],
            action: entry.action,
        };
    });

    const attach = (status: string, by: string | null, atMs: number, notes: string | null, proofs: BusinessClaimProof[]) => {
        const match = entries.find((entry) => entry.kind === 'review'
            && entry.status === status
            && (!by || !entry.by || entry.by === by)
            && atMs > 0 && entry.atMs > 0
            && Math.abs(entry.atMs - atMs) <= MATCH_WINDOW_MS);
        if (!match) return false;
        if (!match.notes && notes) match.notes = notes;
        if (proofs.length > 0 && match.proofs.length === 0) match.proofs = proofs;
        return true;
    };

    claim.previousReviews.forEach((review, index) => {
        if (attach(review.status, review.reviewedBy, review.reviewedAtMs, review.adminNotes, review.proofs)) return;
        entries.push({
            key: `previous:${index}`,
            kind: 'review',
            status: review.status,
            by: review.reviewedBy,
            atMs: review.reviewedAtMs,
            notes: review.adminNotes,
            previousOwnerId: null,
            proofs: review.proofs,
            action: 'businessClaim.review',
        });
    });

    if (claim.status !== 'pending' && (claim.reviewedAtMs || claim.reviewedBy)) {
        const notes = claim.adminNotes ?? null;
        if (!attach(claim.status, claim.reviewedBy ?? null, claim.reviewedAtMs, notes, [])) {
            entries.push({
                key: 'current',
                kind: 'review',
                status: claim.status,
                by: claim.reviewedBy ?? null,
                atMs: claim.reviewedAtMs,
                notes,
                previousOwnerId: null,
                proofs: [],
                action: 'businessClaim.review',
            });
        }
    }

    if (claim.createdAtMs) {
        entries.push({
            key: 'submitted',
            kind: 'submitted',
            status: 'pending',
            by: claim.userId || null,
            atMs: claim.createdAtMs,
            notes: null,
            previousOwnerId: null,
            proofs: [],
            action: entries.some((entry) => entry.kind === 'review' && entry.atMs > 0 && entry.atMs < claim.createdAtMs)
                ? 'resubmitted'
                : 'submitted',
        });
    }

    return entries.sort((a, b) => b.atMs - a.atMs);
};

// ── Contacto ────────────────────────────────────────────────────────────────

/** URL navegable de la web de contacto (añade https:// si falta). null si no es http(s). */
export const safeWebsiteUrl = (text: string | null | undefined): string | null => {
    const trimmed = str(text);
    if (!trimmed || /\s/.test(trimmed)) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
};

export const phoneHref = (text: string | null | undefined): string | null => {
    const digits = str(text).replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 6 ? `tel:${digits}` : null;
};

export const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
};
