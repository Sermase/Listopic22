import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchListDetails, listDetailsQueryKey } from './useListDetails';
import { rankListElements, rankedElementsFromRanking, type RankedElement, type StoredRankingElement } from '../lib/listElements';
import { fetchBotAuthorIds } from '../utils/authorRoles';

export type ListRanksState =
    | { status: 'loading' }
    | { status: 'ready'; byList: Record<string, RankedElement[]> }
    | { status: 'error' };

const STALE_MS = 5 * 60 * 1000;

/**
 * Resumen de puestos que guardan las Functions (listRankings/{listId}): 1 lectura.
 * null si no lo hay (Lista privada, aún sin calcular o recortado): entonces se lee la Lista.
 */
async function fetchStoredRanking(listId: string): Promise<RankedElement[] | null> {
    try {
        const snap = await getDoc(doc(db, 'listRankings', listId));
        const data = snap.exists() ? snap.data() : null;
        if (!data || data.truncated === true || !Array.isArray(data.elements)) return null;
        return rankedElementsFromRanking(data.elements as StoredRankingElement[]);
    } catch {
        return null;
    }
}

/**
 * Ranking de elementos de varias Listas, igual que en cada Lista (sin bots ni
 * sitios cerrados, misma fórmula). Lee el resumen de cada Lista; solo si no
 * lo hay, la Lista completa.
 */
export function useListRanks(listIds: ReadonlyArray<string>): ListRanksState {
    const queryClient = useQueryClient();
    const [state, setState] = useState<ListRanksState>({ status: 'loading' });
    const key = [...listIds].sort().join('|');

    useEffect(() => {
        let cancelled = false;
        const ids = key ? key.split('|') : [];
        (async () => {
            try {
                const byList: Record<string, RankedElement[]> = {};
                const stored = await Promise.all(ids.map(async (listId) => [listId, await queryClient.fetchQuery({
                    queryKey: ['listRanking', listId],
                    queryFn: () => fetchStoredRanking(listId),
                    staleTime: STALE_MS,
                })] as const));
                stored.forEach(([listId, elements]) => { if (elements) byList[listId] = elements; });

                const missing = stored.filter(([, elements]) => !elements).map(([listId]) => listId);
                if (missing.length > 0) {
                    const details = await Promise.all(missing.map(async (listId) => {
                        try {
                            return [listId, await queryClient.fetchQuery({
                                queryKey: listDetailsQueryKey(listId),
                                queryFn: () => fetchListDetails(listId),
                                staleTime: STALE_MS,
                            })] as const;
                        } catch {
                            return [listId, null] as const; // Lista privada o borrada: sin puestos.
                        }
                    }));
                    const authors = details.flatMap(([, d]) => d?.reviews.map((r) => r.userId || r.authorId || '') ?? []);
                    const bots = await fetchBotAuthorIds(authors);
                    details.forEach(([listId, d]) => {
                        if (d) byList[listId] = rankListElements(d.reviews, d.list, { excludeAuthorIds: bots });
                    });
                }
                if (!cancelled) setState({ status: 'ready', byList });
            } catch {
                if (!cancelled) setState({ status: 'error' });
            }
        })();
        return () => { cancelled = true; };
    }, [key, queryClient]);

    return state;
}
