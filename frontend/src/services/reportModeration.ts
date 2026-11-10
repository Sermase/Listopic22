/**
 * reportModeration: decisiones sobre `reports` desde Developer (las reglas solo
 * dejan escribir a los jefes). Antes vivía dentro de DeveloperPage.
 *
 * API
 *   updateReportStatus({ reportId, report, status, closedStatus?, notes?, actorUid? })
 *       'resolved' | 'rejected': status, resolvedAt (hora del servidor), resolvedBy, adminNotes
 *       y resolvedClosedStatus. Si cierra un lugar, actualiza places.closedStatus y las reseñas.
 *       'pending' (Reabrir): borra resolvedAt, resolvedBy y resolvedClosedStatus.
 *   markGroupItemUnavailable({ reportId, report, actorUid? })
 *       Marca el plato como retirado (setItemAvailability) y resuelve el reporte.
 *   setItemAvailability({ placeId, itemName, unavailable })
 *       Única marca de «ya no lo sirven»: places.unavailableItems (por nombre normalizado).
 *   setUserSuspension({ uid, suspended, reason?, reportId? })   suspensión cautelar (callable)
 *   listSuspendedUsers()                                    cuentas en revisión
 *   syncPlaceStatusFromGoogle(placeId): Promise<string>     texto legible del estado en Google
 *   groupReportPlaceId(targetId)                           placeId de «{placeId}_{elemento}»
 *   CLOSED_STATUS_LABELS
 */
import { collection, deleteField, doc, getDocs, limit, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { adminSearchReviews } from './developerAdmin';
import { normalizeItemName } from '../lib/listElements';

export type ReportDecision = 'resolved' | 'rejected' | 'pending';
export type PlaceClosedStatus = 'permanently_closed' | 'temporarily_closed';

export const CLOSED_STATUS_LABELS: Record<PlaceClosedStatus, string> = {
    permanently_closed: '🔒 Cerrado permanentemente',
    temporarily_closed: '⏰ Cerrado temporalmente',
};

interface ReportRef {
    targetType?: unknown;
    targetId?: unknown;
    targetName?: unknown;
    targetOwnerId?: unknown;
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** placeId de un reporte de grupo (targetId con formato «{placeId}_{elemento}»). */
export const groupReportPlaceId = (targetId: string): string => {
    const index = targetId.indexOf('_');
    return index > 0 ? targetId.substring(0, index) : targetId;
};

const REVIEW_BATCH_SIZE = 450;

async function markPlaceClosed(placeId: string, closedStatus: PlaceClosedStatus): Promise<void> {
    await updateDoc(doc(db, 'places', placeId), {
        closedStatus,
        closedStatusUpdatedAt: serverTimestamp(),
    });
    // Las reseñas del lugar (lists/{listId}/reviews) llevan el estado para que
    // ReviewCard lo muestre. Rutas por el servidor: la consulta del navegador
    // la rechazan las reglas.
    try {
        const { reviews } = await adminSearchReviews({ placeId, limit: 5000 });
        for (let index = 0; index < reviews.length; index += REVIEW_BATCH_SIZE) {
            const batch = writeBatch(db);
            reviews.slice(index, index + REVIEW_BATCH_SIZE).forEach((review) => {
                batch.update(doc(db, review.path), { placeClosedStatus: closedStatus });
            });
            await batch.commit();
        }
    } catch (error) {
        console.warn('reportModeration: no se pudo copiar closedStatus a las reseñas', error);
    }
}

export async function updateReportStatus({
    reportId,
    report,
    status,
    closedStatus,
    notes,
    actorUid,
}: {
    reportId: string;
    report: ReportRef;
    status: ReportDecision;
    closedStatus?: PlaceClosedStatus;
    notes?: string;
    actorUid?: string | null;
}): Promise<void> {
    const ref = doc(db, 'reports', reportId);
    if (status === 'pending') {
        // Reabrir: vuelve a la cola sin arrastrar quién y cuándo lo cerró.
        await updateDoc(ref, {
            status: 'pending',
            resolvedAt: deleteField(),
            resolvedBy: deleteField(),
            resolvedClosedStatus: deleteField(),
        });
        return;
    }

    const trimmedNotes = notes?.trim();
    await updateDoc(ref, {
        status,
        resolvedAt: serverTimestamp(),
        resolvedBy: actorUid || 'admin',
        ...(trimmedNotes ? { adminNotes: trimmedNotes } : {}),
        ...(closedStatus ? { resolvedClosedStatus: closedStatus } : {}),
    });

    const targetId = asText(report.targetId);
    if (status === 'resolved' && closedStatus && report.targetType === 'place' && targetId) {
        await markPlaceClosed(targetId, closedStatus);
    } else if (status === 'resolved' && closedStatus && report.targetType === 'review') {
        // Reporte antiguo de «ha cerrado» hecho desde una reseña: se cierra su sitio.
        await markPlaceClosed((await reportDish(report)).placeId, closedStatus);
    }
}

/**
 * Plato retirado (o que vuelve): única marca, en el sitio, por nombre
 * normalizado. El servidor (syncGroupedItemsOnPlaceItems) rehace Buscar.
 */
export async function setItemAvailability({ placeId, itemName, unavailable }: {
    placeId: string;
    itemName: string;
    unavailable: boolean;
}): Promise<void> {
    const key = normalizeItemName(itemName);
    if (!placeId || !key) throw new Error('Falta el sitio o el plato.');
    const placeRef = doc(db, 'places', placeId);
    // En transacción: dos jefes marcando platos del mismo sitio a la vez no se pisan.
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(placeRef);
        const stored = snap.data()?.unavailableItems;
        const current: unknown[] = Array.isArray(stored) ? stored : [];
        const others = current.filter((name) => normalizeItemName(name) !== key);
        tx.update(placeRef, {
            unavailableItems: unavailable ? [...others, itemName.trim()] : others,
            unavailableItemsUpdatedAt: serverTimestamp(),
        });
    });
}

/**
 * Sitio y plato de un reporte: los de grupo lo llevan en targetId
 * («{placeId}_{plato}»); los antiguos hechos desde una reseña se buscan por su autor.
 */
export async function reportDish(report: ReportRef): Promise<{ placeId: string; itemName: string }> {
    const targetId = asText(report.targetId);
    if (report.targetType === 'review') {
        const ownerId = asText(report.targetOwnerId);
        const { reviews } = ownerId ? await adminSearchReviews({ userId: ownerId, limit: 5000 }) : { reviews: [] };
        const review = reviews.find((row) => row.id === targetId);
        if (!review?.placeId || !review.itemName) throw new Error('No encuentro la reseña reportada (¿la han borrado?).');
        return { placeId: review.placeId, itemName: review.itemName };
    }
    const placeId = groupReportPlaceId(targetId);
    const itemName = asText(report.targetName);
    if (!placeId || !itemName) throw new Error('El reporte no indica el lugar o el elemento.');
    return { placeId, itemName };
}

export async function markGroupItemUnavailable({
    reportId,
    report,
    notes,
    actorUid,
}: {
    reportId: string;
    report: ReportRef;
    notes?: string;
    actorUid?: string | null;
}): Promise<void> {
    const { placeId, itemName } = await reportDish(report);
    await setItemAvailability({ placeId, itemName, unavailable: true });
    await updateReportStatus({ reportId, report, status: 'resolved', notes, actorUid });
}

interface SyncPlaceStatusResult {
    businessStatus?: string;
    closedStatus?: string | null;
}

export async function syncPlaceStatusFromGoogle(placeId: string): Promise<string> {
    const sync = httpsCallable<{ placeId: string }, SyncPlaceStatusResult>(functions, 'syncPlaceStatusFromGoogle');
    const { data } = await sync({ placeId });
    if (data?.closedStatus === 'permanently_closed' || data?.closedStatus === 'temporarily_closed') {
        return CLOSED_STATUS_LABELS[data.closedStatus];
    }
    return `✅ Operativo${data?.businessStatus ? ` (${data.businessStatus})` : ''}`;
}

/** Suspensión cautelar: no puede valorar, reaccionar, comentar ni chatear (Términos §7). */
export async function setUserSuspension({ uid, suspended, reason, reportId }: {
    uid: string;
    suspended: boolean;
    reason?: string;
    reportId?: string;
}): Promise<void> {
    const call = httpsCallable<{ uid: string; suspended: boolean; reason?: string; reportId?: string }, { success: boolean }>(functions, 'adminSetUserSuspension');
    await call({ uid, suspended, ...(reason?.trim() ? { reason: reason.trim() } : {}), ...(reportId ? { reportId } : {}) });
}

export interface SuspendedUser {
    uid: string;
    name: string;
    reason: string;
    reportId: string | null;
}

export async function listSuspendedUsers(): Promise<SuspendedUser[]> {
    const snap = await getDocs(query(collection(db, 'users'), where('suspension.active', '==', true), limit(50)));
    return snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            uid: docSnap.id,
            name: asText(data.username) || asText(data.displayName) || docSnap.id,
            reason: asText(data.suspension?.reason),
            reportId: asText(data.suspension?.reportId) || null,
        };
    });
}
