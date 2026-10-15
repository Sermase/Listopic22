/**
 * Lo que la portada de Buscar guarda en este navegador (nunca en Firestore):
 * las búsquedas recientes (las escribe SearchPage) y las listas que más abres.
 * Todo en try/catch: en modo privado o con el almacenamiento bloqueado, no pasa nada.
 */
import { applyListVisit, parseListVisits, parseRecentSearches, type ListVisit } from './searchLanding';

export const RECENT_SEARCHES_KEY = 'listopic_recent_searches';
export const LIST_VISITS_KEY = 'listopic_list_visits';

const read = (key: string): string | null => {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
        return null;
    }
};

export const readRecentSearches = (): string[] => parseRecentSearches(read(RECENT_SEARCHES_KEY));

export const readListVisits = (): ListVisit[] => parseListVisits(read(LIST_VISITS_KEY));

/** Apunta que se ha abierto una lista (ListPage, al cargarla). */
export function recordListVisit(visit: { id: string; name?: string | null; coverUrl?: string | null }): void {
    try {
        if (typeof localStorage === 'undefined') return;
        const next = applyListVisit(readListVisits(), visit, Date.now());
        localStorage.setItem(LIST_VISITS_KEY, JSON.stringify(next));
    } catch {
        // Sin almacenamiento, sin «listas de siempre».
    }
}
