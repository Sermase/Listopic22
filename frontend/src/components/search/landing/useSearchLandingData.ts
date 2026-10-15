/**
 * Datos de la portada de Buscar. Todas las lecturas son acotadas (limit) y
 * de una vez (sin listeners), cacheadas con react-query y getCachedDocs.
 *
 * - Reseñas recientes públicas: el mismo useReviews de la Home (100 como mucho).
 * - Con sesión: tus reseñas (60), a quién sigues (150) y tus chats (15).
 * - Perfiles: solo los que se pintan (≤ 16), casi siempre ya en caché porque
 *   useReviews los acaba de leer para los autores.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, collectionGroup, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useReviews } from '../../../hooks/useReviews';
import { getCachedDocs } from '../../../lib/queryCache';
import type { ChatEntry, FollowEntry, LandingReview, PersonMeta } from '../../../lib/searchLanding';
import type { TasteReview } from '../../../utils/tasteMatch';

const POOL_LIMIT = 100;
const OWN_REVIEWS_LIMIT = 60;
const FOLLOWING_LIMIT = 150;
const CHATS_LIMIT = 15;

const EMPTY_REVIEWS: LandingReview[] = [];
const EMPTY_TASTE: TasteReview[] = [];
const EMPTY_FOLLOWING: FollowEntry[] = [];
const EMPTY_CHATS: ChatEntry[] = [];
const EMPTY_PROFILES: Record<string, PersonMeta> = {};

/** Reseñas públicas recientes (zona y gente se sacan de aquí). Funciona sin sesión. */
export function useLandingPool(): { reviews: LandingReview[]; loading: boolean } {
    const { reviews, loading } = useReviews({ type: 'trending', limit: POOL_LIMIT });
    return { reviews: (reviews as unknown as LandingReview[]) ?? EMPTY_REVIEWS, loading };
}

export function useOwnTaste(uid: string | null | undefined): { reviews: TasteReview[]; loading: boolean } {
    const q = useQuery({
        queryKey: ['searchLanding', 'ownTaste', uid ?? null],
        enabled: !!uid,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        queryFn: async (): Promise<TasteReview[]> => {
            const snap = await getDocs(query(collectionGroup(db, 'reviews'), where('userId', '==', uid), limit(OWN_REVIEWS_LIMIT)));
            return snap.docs.map((d) => {
                const data = d.data() as Record<string, unknown>;
                return {
                    placeId: typeof data.placeId === 'string' ? data.placeId : undefined,
                    itemName: typeof data.itemName === 'string' ? data.itemName : undefined,
                    overallRating: typeof data.overallRating === 'number' ? data.overallRating : undefined,
                };
            });
        },
    });
    return { reviews: q.data ?? EMPTY_TASTE, loading: !!uid && q.isLoading };
}

export const followingQueryKey = (uid: string | null | undefined) => ['searchLanding', 'following', uid ?? null] as const;

export function useFollowing(uid: string | null | undefined): { following: FollowEntry[]; loading: boolean } {
    const q = useQuery({
        queryKey: followingQueryKey(uid),
        enabled: !!uid,
        staleTime: 10 * 60 * 1000,
        queryFn: async (): Promise<FollowEntry[]> => {
            const snap = await getDocs(query(collection(db, 'users', uid!, 'following'), limit(FOLLOWING_LIMIT)));
            return snap.docs.map((d) => {
                const data = d.data() as Record<string, unknown>;
                return {
                    uid: d.id,
                    followedAt: data.followedAt,
                    displayName: typeof data.displayName === 'string' ? data.displayName : null,
                    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
                };
            });
        },
    });
    return { following: q.data ?? EMPTY_FOLLOWING, loading: !!uid && q.isLoading };
}

export function useRecentChats(uid: string | null | undefined): { chats: ChatEntry[]; loading: boolean } {
    const q = useQuery({
        queryKey: ['searchLanding', 'chats', uid ?? null],
        enabled: !!uid,
        staleTime: 10 * 60 * 1000,
        queryFn: async (): Promise<ChatEntry[]> => {
            try {
                const snap = await getDocs(query(
                    collection(db, 'chats'),
                    where('participants', 'array-contains', uid),
                    orderBy('updatedAt', 'desc'),
                    limit(CHATS_LIMIT),
                ));
                return snap.docs.map((d) => {
                    const data = d.data() as Record<string, unknown>;
                    return {
                        participants: Array.isArray(data.participants) ? data.participants.filter((p): p is string => typeof p === 'string') : [],
                        updatedAt: data.updatedAt,
                        type: typeof data.type === 'string' ? data.type : null,
                    };
                });
            } catch (error) {
                // Sin chats (o sin permiso) la sección sigue con a quién sigues.
                console.warn('[SearchLanding] chats no disponibles', error);
                return [];
            }
        },
    });
    return { chats: q.data ?? EMPTY_CHATS, loading: !!uid && q.isLoading };
}

/** Perfiles públicos de los que se pintan. */
export function useProfiles(uids: string[]): { profiles: Record<string, PersonMeta>; loading: boolean } {
    const ids = useMemo(() => Array.from(new Set(uids.filter(Boolean))).sort(), [uids]);
    const q = useQuery({
        queryKey: ['searchLanding', 'profiles', ids.join(',')],
        enabled: ids.length > 0,
        staleTime: 10 * 60 * 1000,
        placeholderData: (previous) => previous,
        queryFn: async () => (await getCachedDocs('publicProfiles', ids)) as Record<string, PersonMeta>,
    });
    return { profiles: q.data ?? EMPTY_PROFILES, loading: ids.length > 0 && q.isLoading };
}
