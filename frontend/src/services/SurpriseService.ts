import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import { fireSurprise, type TortillaSide } from '../lib/surprises';

/** Medallas secretas (las define y las da functions/modules/surprises.js). */
export type SecretBadgeId = 'BIEN_COMIDO' | 'AVE_NOCTURNA' | 'CROQUETERO' | 'DETECTIVE' | 'JUEZ_TORTILLA' | 'PALADAR_DE_HIERRO';

const CLAIMED_KEY = 'listopic_secret_badges';

const readClaimed = (): string[] => {
    try {
        const v = JSON.parse(localStorage.getItem(CLAIMED_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
};

/**
 * Pide una medalla secreta. Sin sesión no hace nada; si ya la tenía, tampoco
 * avisa. Nunca lanza: una sorpresa no puede romper lo que se estaba haciendo.
 */
export async function claimSecretBadge(id: SecretBadgeId): Promise<boolean> {
    const uid = auth.currentUser?.uid;
    if (!uid || auth.currentUser?.isAnonymous) return false;
    const key = `${uid}:${id}`;
    if (readClaimed().includes(key)) return false;
    try {
        const call = httpsCallable<{ id: string }, { awarded: boolean; already: boolean; name?: string; icon?: string }>(functions, 'claimSurpriseBadge');
        const { data } = await call({ id });
        if (data.awarded || data.already) {
            try { localStorage.setItem(CLAIMED_KEY, JSON.stringify([...readClaimed(), key].slice(-50))); } catch { /* opcional */ }
        }
        if (data.awarded) {
            fireSurprise({ kind: 'bubble', emoji: data.icon || '🏅', text: `Medalla secreta: «${data.name || id}»` });
        }
        return data.awarded;
    } catch (error) {
        console.warn('Sorpresas: medalla secreta', error);
        return false;
    }
}

export interface TortillaTally {
    con: number;
    sin: number;
}

export interface TortillaResults {
    total: TortillaTally;
    /** Celda de unos 10 km donde votaste (si había ubicación). */
    zone: (TortillaTally & { label?: string }) | null;
    mine: TortillaSide | null;
}

/** Vota (o solo mira, sin `side`) en la encuesta eterna de la tortilla. */
export async function tortillaPoll(input: { side?: TortillaSide; lat?: number; lng?: number; city?: string }): Promise<TortillaResults> {
    const call = httpsCallable<typeof input, TortillaResults>(functions, 'tortillaPoll');
    const { data } = await call(input);
    return data;
}
