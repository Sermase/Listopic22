/**
 * Visibilidad de las valoraciones: cada valoración tiene `visibility`
 * ('public' | 'private') igual a la de su lista real (la Minilista si tiene
 * `sublistId`, si no la lista donde está guardada). Las consultas públicas
 * (perfil, Lista, Home) solo leen `visibility == 'public'`: si una lista pasa a
 * pública y sus valoraciones no se sincronizan, desaparecen de la vista.
 * Misma regla que `reviewVisibilityMatchesList` en firestore.rules.
 */
import { collection, getDocs, query, where, writeBatch, type DocumentData, type QueryDocumentSnapshot, type QuerySnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { isPermissionDeniedError } from './optionalFields';

export type ReviewVisibility = 'public' | 'private';

export const listVisibility = (list: { isPublic?: unknown; visibility?: unknown } | null | undefined): ReviewVisibility =>
    list?.isPublic === true || list?.visibility === 'public' ? 'public' : 'private';

/** Lista cuya visibilidad manda sobre la valoración. */
export const reviewTargetListId = (review: { sublistId?: unknown }, storedInListId: string): string =>
    typeof review.sublistId === 'string' && review.sublistId.trim() ? review.sublistId : storedInListId;

/**
 * Pone a sus valoraciones la visibilidad de la lista. En una Lista madre no
 * toca las valoraciones hechas desde una Minilista (siguen a su Minilista).
 * Devuelve cuántas se han cambiado.
 */
export async function syncListReviewVisibility(listId: string, parentListId: string | null | undefined, visibility: ReviewVisibility): Promise<number> {
    const safeGetDocs = async (load: () => Promise<QuerySnapshot<DocumentData>>): Promise<QuerySnapshot<DocumentData> | null> => {
        try { return await load(); } catch (e: unknown) {
            if (!isPermissionDeniedError(e)) console.warn('syncListReviewVisibility: no se pudieron leer valoraciones', e);
            return null;
        }
    };
    const snapshots = parentListId
        ? await Promise.all([
            safeGetDocs(() => getDocs(query(collection(db, 'lists', parentListId, 'reviews'), where('sublistId', '==', listId)))),
            safeGetDocs(() => getDocs(collection(db, 'lists', listId, 'reviews'))),
        ])
        : [await safeGetDocs(() => getDocs(collection(db, 'lists', listId, 'reviews')))];

    const docs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
    snapshots.forEach((snap) => snap?.docs.forEach((d) => {
        const storedIn = d.ref.parent.parent?.id || listId;
        if (reviewTargetListId(d.data(), storedIn) !== listId) return; // sigue a su Minilista
        docs.set(d.ref.path, d);
    }));

    const toUpdate = [...docs.values()].filter((d) => d.data().visibility !== visibility);
    for (let i = 0; i < toUpdate.length; i += 450) {
        const batch = writeBatch(db);
        toUpdate.slice(i, i + 450).forEach((d) => batch.update(d.ref, { visibility }));
        await batch.commit();
    }
    return toUpdate.length;
}
