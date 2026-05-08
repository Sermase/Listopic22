import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { ReviewEntity } from '../hooks/useListDetails';

const toMillis = (value: unknown): number => {
    if (!value) return 0;
    if (typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') {
        return (value as { seconds: number }).seconds * 1000;
    }
    return 0;
};

export async function fetchUserReviewsFromAccessibleLists(userId: string, maxReviews = 80): Promise<ReviewEntity[]> {
    const [ownListsSnap, publicListsSnap] = await Promise.all([
        getDocs(query(collection(db, 'lists'), where('userId', '==', userId), limit(120))),
        getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(220))),
    ]);

    const listIds = Array.from(new Set([
        ...ownListsSnap.docs.map((docSnap) => docSnap.id),
        ...publicListsSnap.docs.map((docSnap) => docSnap.id),
    ]));

    const rows: ReviewEntity[] = [];
    const concurrency = 12;

    for (let i = 0; i < listIds.length; i += concurrency) {
        const chunk = listIds.slice(i, i + concurrency);
        const snapshots = await Promise.all(chunk.map(async (listId) => {
            try {
                const snap = await getDocs(query(
                    collection(db, 'lists', listId, 'reviews'),
                    where('userId', '==', userId),
                    orderBy('createdAt', 'desc'),
                    limit(30),
                ));
                return snap.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...(docSnap.data() as Record<string, unknown>),
                    listId,
                } as ReviewEntity));
            } catch {
                return [] as ReviewEntity[];
            }
        }));
        rows.push(...snapshots.flat());
    }

    return rows
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, maxReviews);
}
