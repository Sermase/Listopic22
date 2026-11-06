import { useQuery } from '@tanstack/react-query';
import { collectionGroup, getCountFromServer, limit, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

/**
 * Cuántas valoraciones has hecho desde `since`, hasta 100 (un recuento: una sola lectura).
 * Lo usan las gracias de ambiente: el cielo de Medianoche y las ascuas de Brasa.
 */
export function useMyReviewCount(since: Date, enabled: boolean): number | null {
    const { user } = useAuth();
    const uid = user && !user.isAnonymous ? user.uid : null;
    const key = since.toISOString().slice(0, 10);
    const { data } = useQuery({
        queryKey: ['myReviewCount', uid, key],
        enabled: enabled && !!uid,
        staleTime: 10 * 60_000,
        queryFn: async () => {
            const snap = await getCountFromServer(query(
                collectionGroup(db, 'reviews'),
                where('userId', '==', uid),
                where('createdAt', '>=', Timestamp.fromDate(since)),
                // Las reglas piden límite (≤ 100) en las consultas de grupo; aquí basta con 100.
                limit(100),
            ));
            return snap.data().count;
        },
    });
    return typeof data === 'number' ? data : null;
}
