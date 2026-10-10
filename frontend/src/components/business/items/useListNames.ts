/**
 * Nombres de listas de Listopic por id (para los chips «📋 Listas de Listopic»
 * y la lista elegida al crear un plato). Lee cada una por separado: si una es
 * privada y no se puede leer, las demás salen igual.
 *
 *   const { lists, loading } = useListNames(item.linkedListIds);
 *   lists.tartas?.name  // 'Tartas de queso'
 */
import { useEffect, useMemo, useState } from 'react';
import { getCachedDoc } from '../../../lib/queryCache';

export interface ListSummary {
    id: string;
    name: string;
    isPublic: boolean;
}

const toSummary = (id: string, data: Record<string, unknown> | null): ListSummary | null => {
    if (!data) return null;
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : id;
    return { id, name, isPublic: data.isPublic === true || data.visibility === 'public' };
};

export const getListSummary = async (id: string): Promise<ListSummary | null> => toSummary(id, await getCachedDoc('lists', id));

const isPublicList = (data: Record<string, unknown>) => data.isPublic === true || data.visibility === 'public';

/**
 * ¿Sirve esta lista para un plato nuevo? Mismas reglas que el servidor
 * (businessListProblem): tiene que existir, no ser un archivo y ser pública
 * (una Minilista de madre privada cuenta como privada). Null si sirve.
 */
export const listUsableProblem = async (listId: string): Promise<string | null> => {
    const list = await getCachedDoc('lists', listId);
    if (!list) return 'Esa lista ya no existe. Elige otra o déjalo para más tarde.';
    const name = typeof list.name === 'string' && list.name.trim() ? `«${list.name.trim()}»` : 'Esa lista';
    if (list.type === 'archive') return `${name} no admite platos. Elige otra lista.`;
    let visible = isPublicList(list);
    if (visible && typeof list.parentListId === 'string' && list.parentListId) {
        const parent = await getCachedDoc('lists', list.parentListId);
        if (parent) visible = isPublicList(parent);
    }
    return visible ? null : `🔒 ${name} es privada. Elige una lista pública de Listopic.`;
};

export function useListNames(ids: readonly string[] | undefined): { lists: Record<string, ListSummary | null>; loading: boolean } {
    const key = useMemo(() => Array.from(new Set((ids || []).filter(Boolean))).sort().join('|'), [ids]);
    const [state, setState] = useState<{ key: string; lists: Record<string, ListSummary | null> }>({ key: '', lists: {} });

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        const wanted = key.split('|');
        void Promise.all(wanted.map(async (id) => [id, await getListSummary(id).catch(() => null)] as const))
            .then((rows) => {
                if (!cancelled) setState({ key, lists: Object.fromEntries(rows) });
            });
        return () => {
            cancelled = true;
        };
    }, [key]);

    return {
        lists: state.key === key ? state.lists : {},
        loading: Boolean(key) && state.key !== key,
    };
}
