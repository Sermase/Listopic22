import { useState, useEffect } from 'react';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserProfileEntity {
    uid: string;
    username: string;
    displayName?: string;
    email: string;
    bio?: string;
    photoUrl?: string;
    userType: string;
    followersCount: number;
    followingCount: number;
    createdAt?: Timestamp;
    // Add other fields as needed based on legacy schema
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
            } catch (err: any) {
                console.error("Error fetching user profile:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [uid]);

    return { profile, loading, error };
};
