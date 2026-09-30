import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchListDetails, listDetailsQueryKey } from './useListDetails';
import { rankListElements, type RankedElement } from '../lib/listElements';
import { fetchBotAuthorIds } from '../utils/authorRoles';

export type ListRanksState =
    | { status: 'loading' }
    | { status: 'ready'; byList: Record<string, RankedElement[]> }
    | { status: 'error' };

/**
 * Ranking de elementos de varias Listas, igual que en cada Lista (sin bots ni
 * sitios cerrados, misma fórmula). Lee las Listas completas: usarlo solo donde
 * se enseñan puestos (estadísticas del sitio, página del elemento).
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
                const details = await Promise.all(ids.map(async (listId) => {
                    try {
                        return [listId, await queryClient.fetchQuery({
                            queryKey: listDetailsQueryKey(listId),
                            queryFn: () => fetchListDetails(listId),
                            staleTime: 5 * 60 * 1000,
                        })] as const;
                    } catch {
                        return [listId, null] as const; // Lista privada o borrada: sin puestos.
                    }
                }));
                const authors = details.flatMap(([, d]) => d?.reviews.map((r) => r.userId || r.authorId || '') ?? []);
                const bots = await fetchBotAuthorIds(authors);
                const byList: Record<string, RankedElement[]> = {};
                details.forEach(([listId, d]) => {
                    if (d) byList[listId] = rankListElements(d.reviews, d.list, { excludeAuthorIds: bots });
                });
                if (!cancelled) setState({ status: 'ready', byList });
            } catch {
                if (!cancelled) setState({ status: 'error' });
            }
        })();
        return () => { cancelled = true; };
    }, [key, queryClient]);

    return state;
}
