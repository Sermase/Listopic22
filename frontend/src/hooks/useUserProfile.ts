import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserProfileEntity {
    uid: string;
    email: string;
    username: string;
    usernameLower?: string;
    displayName?: string;
    name?: string;
    surnames?: string;
    photoUrl?: string;
    photoStoragePath?: string;
    userType: 'user' | 'admin' | 'jefe' | string[];
    bio?: string;
    location?: string;
    residence?: string;
    website?: string;
    instagram?: string;
    twitter?: string;
    createdAt?: Record<string, unknown>;
    usernameLockedAt?: Record<string, unknown>;
    xp?: number;
    level?: number;
    photosCount?: number;
    followersCount?: number;
    followingCount?: number;
    reviewsCount?: number;
    badges?: Array<string | { id?: string }>;
    defaultDistanceKm?: number;
    listCount?: number;
    listsCount?: number;
    publicListsCount?: number;
    privateListsCount?: number;
    reviewedPlacesCount?: number;
    followingListsCount?: number;
    followingUsersCount?: number;
    followingPlacesCount?: number;
    mapLayerPreference?: string;
    notificationPreferences?: Record<string, boolean>;
}

export const useUserProfile = (uid: string | undefined) => {
    const q = useQuery({
        queryKey: ['userProfile', uid],
        enabled: !!uid,
        queryFn: async () => {
            const userRef = doc(db, 'users', uid!);
            let snap;
            try {
                snap = await getDocFromServer(userRef);
            } catch {
                snap = await getDoc(userRef);
            }
            if (!snap.exists()) throw new Error('Perfil no encontrado');
            return { uid: snap.id, ...snap.data() } as UserProfileEntity;
        },
        staleTime: 30 * 1000,
        refetchOnMount: 'always',
    });

    return {
        profile: q.data ?? null,
        loading: q.isLoading,
        error: q.error ? (q.error as Error).message : null,
    };
};
