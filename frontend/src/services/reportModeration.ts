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
 *       Añade el elemento a places.unavailableItems y resuelve el reporte.
 *   syncPlaceStatusFromGoogle(placeId): Promise<string>     texto legible del estado en Google
 *   groupReportPlaceId(targetId)                           placeId de «{placeId}_{elemento}»
 *   CLOSED_STATUS_LABELS
 */
import { arrayUnion, deleteField, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { adminSearchReviews } from './developerAdmin';

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
    }
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
    const placeId = groupReportPlaceId(asText(report.targetId));
    const elementName = asText(report.targetName);
    if (!placeId || !elementName) throw new Error('El reporte no indica el lugar o el elemento.');
    await updateDoc(doc(db, 'places', placeId), { unavailableItems: arrayUnion(elementName) });
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
