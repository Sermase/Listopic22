import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Autores marcados como bot en su perfil público (`publicProfiles.userType`).
 * Mismo criterio que la página de Lista, que por defecto oculta a los bots.
 */
export async function fetchBotAuthorIds(uids: Iterable<string>): Promise<Set<string>> {
    const unique = [...new Set([...uids].filter(Boolean))];
    const bots = new Set<string>();
    await Promise.all(unique.map(async (uid) => {
        try {
            const snap = await getDoc(doc(db, 'publicProfiles', uid));
            if (!snap.exists()) return;
            const userType = snap.data().userType ?? [];
            const roles = Array.isArray(userType) ? userType : [userType];
            if (roles.includes('bot')) bots.add(uid);
        } catch {
            // Sin perfil legible: se trata como persona.
        }
    }));
    return bots;
}
