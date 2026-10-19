/**
 * Borrador de una valoración nueva (localStorage, una clave por lista).
 * Va atado al sitio: antes se recuperaba en cualquier valoración de la misma
 * lista y el formulario salía relleno con el plato y las notas de otro sitio.
 */
export const REVIEW_DRAFT_VERSION = 3;
/** Pasado este tiempo el borrador se olvida. */
export const REVIEW_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ReviewDraft {
    v: typeof REVIEW_DRAFT_VERSION;
    placeId: string;
    itemName: string;
    comment: string;
    criteriaScores: Record<string, number>;
    savedAt: number;
}

export const reviewDraftKey = (listId: string | null | undefined): string => `listopic_review_draft_${listId || 'global'}`;

/** Lee un borrador guardado; null si es de otro formato (los antiguos no sabían de qué sitio eran), está roto o caducado. */
export function parseReviewDraft(raw: string | null, now = Date.now()): ReviewDraft | null {
    if (!raw) return null;
    try {
        const draft = JSON.parse(raw);
        if (!draft || draft.v !== REVIEW_DRAFT_VERSION) return null;
        if (typeof draft.placeId !== 'string' || !draft.placeId) return null;
        if (typeof draft.savedAt !== 'number' || now - draft.savedAt > REVIEW_DRAFT_MAX_AGE_MS) return null;
        const scores: Record<string, number> = {};
        if (draft.criteriaScores && typeof draft.criteriaScores === 'object') {
            Object.entries(draft.criteriaScores).forEach(([key, value]) => {
                if (typeof value === 'number' && Number.isFinite(value)) scores[key] = value;
            });
        }
        return {
            v: REVIEW_DRAFT_VERSION,
            placeId: draft.placeId,
            itemName: typeof draft.itemName === 'string' ? draft.itemName : '',
            comment: typeof draft.comment === 'string' ? draft.comment : '',
            criteriaScores: scores,
            savedAt: draft.savedAt,
        };
    } catch {
        return null;
    }
}

/**
 * ¿Se recupera el borrador? Solo para el mismo sitio, si aún no se ha puntuado
 * ni escrito nada y, con el plato fijado desde la carta, si es ese mismo plato.
 */
export function shouldRestoreReviewDraft(
    draft: ReviewDraft | null,
    current: { placeId?: string | null; lockedItemName?: string | null; hasScores: boolean; comment: string },
): draft is ReviewDraft {
    if (!draft || !current.placeId || draft.placeId !== current.placeId) return false;
    if (current.hasScores || current.comment.trim()) return false;
    if (current.lockedItemName && draft.itemName.trim().toLowerCase() !== current.lockedItemName.trim().toLowerCase()) return false;
    return Boolean(draft.itemName.trim() || draft.comment.trim() || Object.keys(draft.criteriaScores).length > 0);
}
