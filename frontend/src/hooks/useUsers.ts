import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfileEntity } from './useUserProfile';

export interface UserEntity {
    uid: string;
    displayName: string;
    photoUrl?: string;
    username?: string;
    bio?: string;
    followersCount?: number;
    publicListsCount?: number;
    reviewsCount?: number;
    userType?: UserProfileEntity['userType'];
}

export const useUsers = () => {
    const [users, setUsers] = useState<UserEntity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);
            try {
                // Try to order by followersCount if index exists
                // If not, we might need a fallback or create index
                let q = query(collection(db, 'publicProfiles'), orderBy('followersCount', 'desc'), limit(15));

                try {
                    const snap = await getDocs(q);
                    setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserEntity)));
                } catch {
                    console.warn("Index missing for followersCount, falling back to simple fetch");
                    // Fallback: fetch recent users or just default order
                    q = query(collection(db, 'publicProfiles'), limit(15));
                    const snap = await getDocs(q);
                    setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserEntity)));
                }

            } catch (err) {
                console.error("Error fetching users:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, []);

    return { users, loading };
};
