/**
 * useAdminNames: nombres legibles de usuarios (jefes que resolvieron algo,
 * solicitantes, propietarios) a partir de su uid. Cada uid es un
 * getDoc(users/{uid}) cacheado con react-query (['adminName', uid], 30 min);
 * la regla `users get` lo permite al jefe.
 *
 * API
 *   useAdminNames(uids: ReadonlyArray<string | null | undefined>): Record<string, string>
 *       Una entrada por cada uid recibido: el nombre si ya está, o un uid corto
 *       («a1b2c3d4…») mientras carga o si no existe. 'system' → «Automático»,
 *       'beta' → «Beta «Lo quiero»».
 *   useAdminName(uid: string | null | undefined): string | null
 *   fetchAdminName(uid: string): Promise<string>
 *       displayName → name → @username → email → uid corto.
 *   adminNameQueryKey(uid: string): readonly ['adminName', string]
 *   SPECIAL_ACTOR_NAMES: Record<string, string>      actores que no son usuarios
 *   shortUid(uid: string): string
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const SPECIAL_ACTOR_NAMES: Record<string, string> = {
    system: 'Automático',
    beta: 'Beta «Lo quiero»',
};

const NAME_STALE_MS = 30 * 60 * 1000;

export const adminNameQueryKey = (uid: string) => ['adminName', uid] as const;

export const shortUid = (uid: string): string => (uid.length > 10 ? `${uid.slice(0, 8)}…` : uid);

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export async function fetchAdminName(uid: string): Promise<string> {
    if (SPECIAL_ACTOR_NAMES[uid]) return SPECIAL_ACTOR_NAMES[uid];
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return shortUid(uid);
    const data = snap.data() as Record<string, unknown>;
    const username = asText(data.username);
    return asText(data.displayName)
        || asText(data.name)
        || (username ? `@${username}` : '')
        || asText(data.email)
        || shortUid(uid);
}

const isLookupUid = (uid: unknown): uid is string =>
    typeof uid === 'string' && uid.length > 0 && !uid.includes('/');

export function useAdminNames(uids: ReadonlyArray<string | null | undefined>): Record<string, string> {
    // Clave estable: misma lista de uids ⇒ mismas consultas aunque cambie el array.
    const idsKey = Array.from(new Set(uids.filter(isLookupUid))).sort().join('|');
    const ids = useMemo(() => (idsKey ? idsKey.split('|') : []), [idsKey]);
    const lookupIds = useMemo(() => ids.filter((uid) => !SPECIAL_ACTOR_NAMES[uid]), [ids]);

    const names = useQueries({
        queries: lookupIds.map((uid) => ({
            queryKey: adminNameQueryKey(uid),
            queryFn: () => fetchAdminName(uid),
            staleTime: NAME_STALE_MS,
            gcTime: 2 * NAME_STALE_MS,
            retry: 0,
            refetchOnWindowFocus: false,
        })),
        combine: (results) => results.map((result) => result.data),
    });

    // `names` es un array nuevo en cada render: la cadena lo resume para memoizar.
    const namesKey = names.map((name) => name ?? '').join('\u0000');
    return useMemo(() => {
        const loaded = namesKey.split('\u0000');
        const resolved: Record<string, string> = {};
        ids.forEach((uid) => {
            resolved[uid] = SPECIAL_ACTOR_NAMES[uid] || shortUid(uid);
        });
        lookupIds.forEach((uid, index) => {
            if (loaded[index]) resolved[uid] = loaded[index];
        });
        return resolved;
    }, [ids, lookupIds, namesKey]);
}

export function useAdminName(uid: string | null | undefined): string | null {
    const names = useAdminNames([uid]);
    return uid ? names[uid] ?? null : null;
}
