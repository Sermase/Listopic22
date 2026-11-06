/**
 * «Ver todo» de los carruseles de Inicio: Buscar se abre con el mismo criterio
 * que el carrusel (`?preset=`), como un filtro que se ve y se quita con la ✕.
 */
export type SearchPresetId = 'top-reciente' | 'joyas';

export interface SearchPreset {
    /** Pestaña de Buscar en la que vale el filtro. */
    tab: 'items' | 'places';
    /** Orden con que se abre (alias de Buscar). */
    sort: string;
    /** Texto del chip. */
    label: string;
    /** Filtro de Algolia; `nowSec` = ahora en segundos. */
    filter: (nowSec: number) => string;
}

/** Días que cuenta «Top reciente» en Buscar. */
export const RECENT_DAYS = 60;

export const SEARCH_PRESETS: Record<SearchPresetId, SearchPreset> = {
    // Como el carrusel: buena nota y valorado estos días, lo mejor primero.
    'top-reciente': {
        tab: 'items',
        sort: 'top_rated',
        label: 'Top reciente: 7,5 o más, valorado en los últimos 2 meses',
        filter: (nowSec) => `avgGeneralScore >= 7.5 AND lastReviewAtTimestamp >= ${Math.floor(nowSec - RECENT_DAYS * 86_400)}`,
    },
    // Mucha nota y poca fama: de 1 a 8 reseñas de personas.
    joyas: {
        tab: 'places',
        sort: 'rating',
        label: 'Joyas ocultas: 7,5 o más con pocas reseñas',
        filter: () => 'averageRating >= 7.5 AND publicHumanReviewsCount >= 1 AND publicHumanReviewsCount <= 8',
    },
};

export const isSearchPresetId = (value: string | null | undefined): value is SearchPresetId =>
    !!value && Object.prototype.hasOwnProperty.call(SEARCH_PRESETS, value);

/** El preset de la URL si vale para esta pestaña; si no, null. */
export function presetFor(value: string | null | undefined, tab: string): SearchPreset | null {
    if (!isSearchPresetId(value)) return null;
    const preset = SEARCH_PRESETS[value];
    return preset.tab === tab ? preset : null;
}
