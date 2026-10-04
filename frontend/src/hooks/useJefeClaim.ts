import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

export type JefeClaimStatus = 'checking' | 'provisioning' | 'ready' | 'error';

/**
 * Las reglas de Firestore reconocen al jefe por el claim `admin` del token, no por
 * su `userType`. Sin él, en Developer fallan Listas, Usuarios, Reportes, Uso de API…
 * Si eres jefe (AuthContext) y el token no lo trae, se pide a la Function (que vuelve
 * a comprobar que eres jefe) y se refresca el token. Solo pasa la primera vez.
 */
export function useJefeClaim(user: User | null, isJefe: boolean): { status: JefeClaimStatus; error: string | null } {
    const [status, setStatus] = useState<JefeClaimStatus>('checking');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !isJefe) return;
        let cancelled = false;
        (async () => {
            try {
                const token = await user.getIdTokenResult();
                if (token.claims.admin === true) {
                    if (!cancelled) setStatus('ready');
                    return;
                }
                if (!cancelled) setStatus('provisioning');
                await httpsCallable(getFunctions(undefined, 'europe-west1'), 'adminProvisionJefeClaim')({});
                await user.getIdToken(true);
                if (!cancelled) setStatus('ready');
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
                setStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, [user, isJefe]);

    return { status, error };
}
