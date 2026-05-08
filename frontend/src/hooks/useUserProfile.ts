import { useEffect, useState } from 'react';
import { doc, getDoc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

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
    reviewCount?: number;
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

const toProfileEntity = (id: string, data: Record<string, unknown>): UserProfileEntity => ({
    uid: id,
    ...(data as Omit<UserProfileEntity, 'uid'>),
});

export const useUserProfile = (uid: string | undefined) => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfileEntity | null>(null);
    const [loading, setLoading] = useState(Boolean(uid));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!uid) {
            setProfile(null);
            setLoading(false);
            setError(null);
            return;
        }

        const isOwnProfile = user?.uid === uid;
        const userRef = doc(db, isOwnProfile ? 'users' : 'publicProfiles', uid);
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;

        setLoading(true);
        setError(null);

        // First try a server read so a direct PWA refresh does not stay stuck on
        // stale cached counters/photos. The live subscription below keeps it fresh.
        getDocFromServer(userRef)
            .catch(() => getDoc(userRef))
            .then((snap) => {
                if (cancelled) return;
                if (!snap.exists()) {
                    setProfile(null);
                    setError('Perfil no encontrado');
                    setLoading(false);
                    return;
                }
                setProfile(toProfileEntity(snap.id, snap.data()));
                setLoading(false);
            })
            .catch((readError) => {
                if (cancelled) return;
                setError((readError as Error).message || 'Perfil no encontrado');
                setLoading(false);
            });

        unsubscribe = onSnapshot(
            userRef,
            (snap) => {
                if (cancelled) return;
                if (!snap.exists()) {
                    setProfile(null);
                    setError('Perfil no encontrado');
                    setLoading(false);
                    return;
                }
                setProfile(toProfileEntity(snap.id, snap.data()));
                setError(null);
                setLoading(false);
            },
            (snapshotError) => {
                if (cancelled) return;
                setError(snapshotError.message || 'Perfil no encontrado');
                setLoading(false);
            },
        );

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [uid, user?.uid]);

    return { profile, loading, error };
};
