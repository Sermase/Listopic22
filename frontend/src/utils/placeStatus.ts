import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export function isClosedPlaceStatus(value?: string | null) {
    const status = String(value || '').trim().toLowerCase();
    return status === 'permanently_closed'
        || status === 'temporarily_closed'
        || status === 'closed_permanently'
        || status === 'closed_temporarily';
}

/** Tipo de cierre, solo con estados reales: Google pone «OPERATIONAL» a los abiertos. */
export function closedStatusKind(value?: string | null): 'permanent' | 'temporary' | null {
    if (!isClosedPlaceStatus(value)) return null;
    return String(value).toLowerCase().includes('perman') ? 'permanent' : 'temporary';
}

export function resolveClosedStatus(...values: Array<string | null | undefined>) {
    return values.find(value => isClosedPlaceStatus(value)) || null;
}

export async function fetchClosedStatusesForPlaceIds(placeIds: string[]) {
    const uniqueIds = Array.from(new Set(placeIds.filter(Boolean)));
    const result = new Map<string, string>();

    for (let i = 0; i < uniqueIds.length; i += 10) {
        const chunk = uniqueIds.slice(i, i + 10);
        const snap = await getDocs(query(collection(db, 'places'), where(documentId(), 'in', chunk)));
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const closedStatus = resolveClosedStatus(
                data.closedStatus,
                data.googleBusinessStatus,
                data.businessStatus
            );
            if (closedStatus) {
                result.set(docSnap.id, closedStatus);
            }
        });
    }

    return result;
}
