import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { LEGAL_VERSION } from '../config/legal';

export type LegalAcceptanceMethod = 'signup' | 'prompt';

// Aceptaciones de esta sesión (uid -> versión). Evitan que el aviso de
// aceptación aparezca un instante tras registrarse (antes de que llegue el
// documento users/{uid}) o si la escritura falla (reglas aún sin desplegar).
const acceptedThisSession = new Map<string, string>();
let signupInProgress = false;

/** Llamar justo antes de crear la cuenta con email: el usuario ya marcó las casillas. */
export function markSignupAcceptance(active: boolean): void {
    signupInProgress = active;
}

export function isLegalAcceptedThisSession(uid: string): boolean {
    return signupInProgress || acceptedThisSession.get(uid) === LEGAL_VERSION;
}

/**
 * Guarda en users/{uid}.legalAcceptance la versión aceptada de Términos y
 * Privacidad y la confirmación de edad. La fecha la pone el servidor (las
 * reglas exigen request.time), así sirve de prueba.
 */
export async function recordLegalAcceptance(uid: string, method: LegalAcceptanceMethod): Promise<void> {
    acceptedThisSession.set(uid, LEGAL_VERSION);
    try {
        await setDoc(doc(db, 'users', uid), {
            legalAcceptance: {
                version: LEGAL_VERSION,
                acceptedAt: serverTimestamp(),
                ageConfirmed: true,
                method,
            },
        }, { merge: true });
    } catch (error) {
        // No se bloquea a la persona: se le volverá a pedir en la próxima sesión.
        console.warn('No se pudo guardar la aceptación de condiciones', error);
    }
}
