import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface CanonicalItemSourceName {
    name: string;
    count: number;
}

export interface CanonicalItemStats {
    reviewCount?: number;
    ratingCount?: number;
    ratingTotal?: number;
    averageRating?: number | null;
    photoCount?: number;
    criteriaStats?: Record<string, {
        count: number;
        total: number;
        average: number;
    }>;
}

export interface CanonicalPlaceItem {
    id: string;
    canonicalName?: string;
    aliasesNormalized?: string[];
    sourceNames?: CanonicalItemSourceName[];
    linkedListIds?: string[];
    status?: 'active' | 'inactive' | 'unavailable';
    source?: string;
    businessData?: Record<string, unknown>;
    stats?: CanonicalItemStats;
}

export const getCanonicalPlaceItems = async (placeId: string): Promise<CanonicalPlaceItem[]> => {
    const snap = await getDocs(collection(db, 'places', placeId, 'items'));
    return snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<CanonicalPlaceItem, 'id'>) }))
        .filter((item) => item.status !== 'inactive')
        .sort((a, b) => {
            const reviewsDiff = (b.stats?.reviewCount || 0) - (a.stats?.reviewCount || 0);
            if (reviewsDiff !== 0) return reviewsDiff;
            return (a.canonicalName || a.id).localeCompare(b.canonicalName || b.id, 'es');
        });
};
