import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { categoryFixedTags } from '../lib/categoryTags';

export interface CategoryEntity {
    id: string;
    description?: string;
    icon?: string;
    label?: string;
    like?: string;
    dislike?: string;
    'fixed-tags'?: string[];
    defaultCriteria?: {
        rangos?: {
            like?: string;
            dislike?: string;
            [key: string]: string | undefined;
        }
    }
}

// Las etiquetas fijas casi nunca cambian: una lectura por categoría y sesión.
const fixedTagsCache = new Map<string, Promise<string[]>>();

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
    },

    /** Etiquetas fijas de la categoría (vacío si no tiene o no se puede leer). */
    getFixedTags: (categoryId: unknown): Promise<string[]> => {
        if (typeof categoryId !== 'string' || !categoryId.trim()) return Promise.resolve([]);
        const id = categoryId.trim();
        let pending = fixedTagsCache.get(id);
        if (!pending) {
            pending = CategoryService.getCategory(id).then(categoryFixedTags);
            fixedTagsCache.set(id, pending);
        }
        return pending;
    },

    getReactionConfig: (category: CategoryEntity | null | undefined): { like?: string; dislike?: string } | null => {
        if (!category) return null;
        const like = typeof category.like === 'string' && category.like.trim()
            ? category.like.trim()
            : category.defaultCriteria?.rangos?.like?.trim();
        const dislike = typeof category.dislike === 'string' && category.dislike.trim()
            ? category.dislike.trim()
            : category.defaultCriteria?.rangos?.dislike?.trim();
        return like || dislike ? { like, dislike } : null;
    }
};
