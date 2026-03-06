import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
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
    followersCount?: number;
    followingCount?: number;
    reviewsCount?: number;
    badges?: Record<string, unknown>[]; // Or string[], using any[] for safety as I saw objects in gamification
    // Add other fields as needed based on legacy schema
    defaultDistanceKm?: number;
    followingListsCount?: number;
    followingUsersCount?: number;
    followingPlacesCount?: number;
}

export const useUserProfile = (uid: string | undefined) => {
    const [profile, setProfile] = useState<UserProfileEntity | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!uid) {
            setLoading(false);
            return;
        }

        const fetchProfile = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, 'users', uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setProfile({ uid: docSnap.id, ...docSnap.data() } as UserProfileEntity);
                } else {
                    setError('Perfil no encontrado');
                }
            } catch (err: unknown) {
                console.error("Error fetching user profile:", err);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setError((err as any).message);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [uid]);

    return { profile, loading, error };
};
