import { useCurrentRefinements } from 'react-instantsearch';

/**
 * Elementos con valoraciones solo de bots: la Lista no los enseña mientras no se
 * piden los bots, y Buscar igual. Con el filtro «Bots» activo, aparecen.
 */
export const HIDE_BOT_ONLY = 'NOT botOnly:true';

export function useBotOnlyFilter(tab: string): string {
    const { items } = useCurrentRefinements();
    if (tab !== 'items' && tab !== 'grouped_items') return '';
    const showBots = items.some((item) => item.attribute === 'authorUserType' && item.refinements.some((r) => String(r.value) === 'bot'));
    return showBots ? '' : HIDE_BOT_ONLY;
}
