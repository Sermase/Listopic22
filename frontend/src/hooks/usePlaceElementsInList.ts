import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '../firebase';
import { placeElementsInList, type PlaceElementOption } from '../lib/placeElementsInList';
import { listDetailsQueryKey, type fetchListDetails } from './useListDetails';

interface ListMetaForElements {
    parentListId?: string | null;
    isPublic?: boolean;
    visibility?: string;
}

type ListDetailsData = Awaited<ReturnType<typeof fetchListDetails>>;

/**
 * Elementos que el sitio ya tiene en la lista. Si la lista ya está en caché
 * (se viene de su página) no se lee nada; si no, solo las reseñas de ese sitio.
 */
export function usePlaceElementsInList(listId: string | null, list: ListMetaForElements | null, placeId: string | null | undefined, enabled = true) {
    const queryClient = useQueryClient();
    return useQuery<PlaceElementOption[]>({
        queryKey: ['placeElementsInList', listId, placeId],
        enabled: enabled && Boolean(listId && list && placeId),
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const cached = queryClient.getQueryData<ListDetailsData>(listDetailsQueryKey(listId!));
            if (cached?.reviews) return placeElementsInList(cached.reviews, placeId!);

            // Mismos filtros que la página de la lista (las reglas exigen la visibilidad).
            const visibility = list!.isPublic === true || list!.visibility === 'public' ? 'public' : 'private';
            const constraints: QueryConstraint[] = [where('placeId', '==', placeId), where('visibility', '==', visibility)];
            const load = (reviewsListId: string, extra: QueryConstraint[] = []) => getDocs(
                query(collection(db, 'lists', reviewsListId, 'reviews'), ...extra, ...constraints)
            ).then((snap) => snap.docs.map((d) => d.data())).catch(() => []);

            const parentListId = list!.parentListId;
            const reviews = parentListId
                ? (await Promise.all([
                    load(parentListId, [where('sublistId', '==', listId)]),
                    load(listId!),
                ])).flat()
                : await load(listId!);
            return placeElementsInList(reviews, placeId!);
        },
    });
}
