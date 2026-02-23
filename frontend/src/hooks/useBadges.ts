import { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface Badge {
    id: string;
    name: string;
    descriptionPublic: string;
    descriptionLogic?: string;
    imageUrl?: string;
    active: boolean;
    type?: string;
    threshold?: number;
}

export const useBadges = () => {
    const [badges, setBadges] = useState<Badge[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBadges = async () => {
            try {
                const q = query(collection(db, 'badges'));
                const snap = await getDocs(q);
                const fetchedBadges = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Badge));
                setBadges(fetchedBadges);
            } catch (err: unknown) {
                console.error("Error fetching badges:", err);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setError((err as any).message);
            } finally {
                setLoading(false);
            }
        };

        fetchBadges();
    }, []);

    const getBadge = (id: string) => badges.find(b => b.id === id);

    return { badges, loading, error, getBadge };
};
