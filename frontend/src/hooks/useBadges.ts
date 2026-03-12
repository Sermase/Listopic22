import { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface Badge {
    id: string;
    name: string;
    description?: string;
    descriptionPublic: string;
    descriptionLogic?: string;
    logicNotes?: string;
    imageUrl?: string;
    icon?: string;
    active: boolean;
    type?: string;
    threshold?: number;
    xpReward?: number;
    category?: string;
    rarity?: string;
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
                const fetchedBadges = snap.docs.map((doc) => {
                    const raw = doc.data() as Partial<Badge> & { description?: string };
                    const description = typeof raw.description === 'string' ? raw.description : '';
                    const descriptionPublic = typeof raw.descriptionPublic === 'string'
                        ? raw.descriptionPublic
                        : description;

                    return {
                        id: doc.id,
                        ...raw,
                        description,
                        descriptionPublic,
                        active: raw.active !== false,
                        threshold: typeof raw.threshold === 'number'
                            ? raw.threshold
                            : Number(raw.threshold) || 0,
                        xpReward: typeof raw.xpReward === 'number'
                            ? raw.xpReward
                            : Number(raw.xpReward) || undefined,
                    } as Badge;
                });
                setBadges(fetchedBadges);
            } catch (err: unknown) {
                console.error("Error fetching badges:", err);
                setError(err instanceof Error ? err.message : "Error al cargar medallas");
            } finally {
                setLoading(false);
            }
        };

        fetchBadges();
    }, []);

    const getBadge = (id: string) => badges.find(b => b.id === id);

    return { badges, loading, error, getBadge };
};
