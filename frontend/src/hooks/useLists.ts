import { useQuery } from '@tanstack/react-query';
import { collection, query, orderBy, limit, getDocs, Timestamp, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface ListEntity {
    id: string;
    name: string;
    description?: string;
    userId: string;
    authorName?: string;
    photoUrl?: string;
    mainImageUrl?: string;
    thumbnailUrl?: string;
    coverUrl?: string;
    imageUrl?: string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
    parentListId?: string;

    isPublic: boolean;
    visibility?: 'public' | 'private';
    publicAccess?: 'reader' | 'writer';
    guests?: string[];
    editors?: string[];
    parentListName?: string;

    itemCount?: number;
    groupedItemsCount: number;
    viewCount?: number;
    likes?: number;
    followersCount: number;
    commentsCount: number;
    reviewCount: number;

    averageRating: number;
    avgScore?: number;

    lat?: number;
    lng?: number;

    availableTags: string[];
    fixedTags?: string[];
    criteriaDefinition?: Record<string, {
        label: string;
        labelMin?: string;
        labelMax?: string;
        min: number;
        max: number;
        step: number;
        type: string;
        ponderable: boolean;
    }>;

    criteriaAverages: Record<string, number>;
    criteriaAveragesUpdatedAt?: Timestamp;
    reactions: Record<string, unknown>;
}

async function fetchLists(
    filter: 'recent' | 'top_rated' | 'liked',
    userId: string | undefined,
    includePrivate: boolean,
): Promise<ListEntity[]> {
    const listsRef = collection(db, 'lists');

    if (filter === 'liked' && userId) {
        const likesRef = collection(db, 'list_likes');
        const likesQ = query(likesRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
        const likesSnap = await getDocs(likesQ);
        if (likesSnap.empty) return [];

        const listIds = likesSnap.docs.map(d => d.data().listId);
        const listSnaps = await Promise.all(
            listIds.map(async (id) => {
                try { return await getDoc(doc(db, 'lists', id)); }
                catch { return null; }
            })
        );
        return listSnaps
            .filter(snap => snap !== null && snap.exists())
            .map(snap => ({ id: snap!.id, ...snap!.data() })) as ListEntity[];
    }

    let q;
    if (userId) {
        if (includePrivate) {
            q = query(listsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50));
        } else {
            q = query(listsRef, where('userId', '==', userId), where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(50));
        }
    } else {
        q = query(listsRef, where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(50));
    }

    const snap = await getDocs(q);
    const fetchedLists = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ListEntity[];

    if (filter === 'top_rated') {
        fetchedLists.sort((a, b) => {
            const scoreA = a.averageRating || a.avgScore || 0;
            const scoreB = b.averageRating || b.avgScore || 0;
            return scoreB - scoreA;
        });
    }

    return fetchedLists;
}

export const useLists = (
    filter: 'recent' | 'top_rated' | 'liked' = 'recent',
    userId?: string,
    includePrivate = false,
) => {
    const q = useQuery({
        queryKey: ['lists', filter, userId ?? null, includePrivate],
        queryFn: () => fetchLists(filter, userId, includePrivate),
    });

    return {
        lists: q.data ?? [],
        loading: q.isLoading,
        error: q.error ? (q.error as Error).message : null,
    };
};
