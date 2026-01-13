import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface CategoryEntity {
    id: string;
    description?: string;
    icon?: string;
    label?: string;
    defaultCriteria?: {
        rangos?: {
            like?: string;
            dislike?: string;
            [key: string]: string | undefined;
        }
    }
}

export const CategoryService = {
    getCategory: async (categoryId: string): Promise<CategoryEntity | null> => {
        if (!categoryId) return null;
        try {
            const ref = doc(db, 'categories', categoryId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                return { id: snap.id, ...snap.data() } as CategoryEntity;
            }
            return null;
        } catch (error) {
            console.warn("Error fetching category", error);
            return null;
        }
    }
};
