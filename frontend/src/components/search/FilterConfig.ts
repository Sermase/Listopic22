import type React from 'react';
import {
    Accessibility, Camera, CircleDollarSign, Coffee, List as ListIcon, MapPin,
    MessageSquareText, PawPrint, ShieldCheck, Star, Tags, Utensils, WheatOff,
} from 'lucide-react';

/** Opción de un filtro numérico (nota mínima, nº de opiniones). */
export interface NumericFilterOption {
    label: string;
    start?: number;
    end?: number;
}

export interface FilterSectionConfig {
    attribute: string;
    label: string;
    icon: React.ElementType;
    limit?: number;
    defaultOpen?: boolean;
    dependsOn?: string;
    /** Si está, es un filtro numérico (Algolia numericFilters) con estas opciones. */
    numeric?: NumericFilterOption[];
}

// Nota de 0 a 10, como en toda la app.
const MIN_RATING: NumericFilterOption[] = [
    { label: '7+', start: 7 },
    { label: '8+', start: 8 },
    { label: '9+', start: 9 },
];

// Más de una opinión: que la nota no dependa de una sola persona.
const MIN_OPINIONS: NumericFilterOption[] = [
    { label: '3+', start: 3 },
    { label: '10+', start: 10 },
    { label: '25+', start: 25 },
];

const DISH_SECTIONS: FilterSectionConfig[] = [
    { attribute: 'listCategoryName', label: 'Categoría', icon: Tags, defaultOpen: true },
    { attribute: 'listName', label: 'Lista', icon: ListIcon, dependsOn: 'listCategoryName', defaultOpen: true },
    { attribute: 'avgGeneralScore', label: 'Nota mínima', icon: Star, defaultOpen: true, numeric: MIN_RATING },
    { attribute: 'itemTags', label: 'Etiquetas', icon: Tags, defaultOpen: true, limit: 10 },
    { attribute: 'reviewCount', label: 'Opiniones', icon: MessageSquareText, numeric: MIN_OPINIONS },
    { attribute: 'authorUserType', label: 'Valorado por', icon: ShieldCheck },
    { attribute: 'isGlutenFree', label: 'Sin gluten', icon: WheatOff },
    { attribute: 'hasPhoto', label: 'Con fotos', icon: Camera },
    { attribute: 'petOptions', label: 'Mascotas', icon: PawPrint },
    { attribute: 'accessibilityOptions', label: 'Accesibilidad', icon: Accessibility },
];

/**
 * Filtros por pestaña, de más a menos útil. Solo atributos que los índices de
 * Algolia tienen como faceta o como número filtrable (functions/modules/algolia.js).
 * Fuera: «Estado del sitio» (ya lo hace «Incluir cerrados»), «Fotos» en Listas,
 * y las dos listas de etiquetas de Elementos (itemTags ya incluye groupTags).
 */
export const FILTER_SECTIONS: Record<string, FilterSectionConfig[]> = {
    lists: [
        { attribute: 'categoryName', label: 'Categoría', icon: ListIcon, defaultOpen: true },
        { attribute: 'availableTags', label: 'Etiquetas', icon: Tags, defaultOpen: true, limit: 10 },
    ],
    places: [
        { attribute: 'types', label: 'Tipo de sitio', icon: Utensils, defaultOpen: true },
        { attribute: 'averageRating', label: 'Nota mínima', icon: Star, defaultOpen: true, numeric: MIN_RATING },
        { attribute: 'itemTags', label: 'Qué se come', icon: Tags, defaultOpen: true, limit: 10 },
        { attribute: 'priceLevel', label: 'Precio', icon: CircleDollarSign },
        { attribute: 'serviceOptions', label: 'Servicios', icon: Coffee },
        { attribute: 'publicHumanReviewsCount', label: 'Opiniones', icon: MessageSquareText, numeric: MIN_OPINIONS },
        { attribute: 'isGlutenFree', label: 'Sin gluten', icon: WheatOff },
        { attribute: 'petOptions', label: 'Mascotas', icon: PawPrint },
        { attribute: 'accessibilityOptions', label: 'Accesibilidad', icon: Accessibility },
        { attribute: 'hasPhoto', label: 'Con fotos', icon: Camera },
    ],
    users: [
        { attribute: 'userType', label: 'Tipo', icon: ShieldCheck, defaultOpen: true },
        { attribute: 'residence', label: 'Ciudad', icon: MapPin, defaultOpen: true },
    ],
    items: DISH_SECTIONS,
    grouped_items: DISH_SECTIONS,
};

/** Solo estos valores tienen sentido como filtro. */
export const FACET_VALUE_ALLOWLIST: Record<string, string[]> = {
    userType: ['bot', 'jefe', 'critico', 'critic'],
    authorUserType: ['bot', 'jefe', 'critico', 'critic', 'experto'],
    hasPhoto: ['true'],
    isGlutenFree: ['true'],
};

/** Tipos de Google que tiene casi cualquier sitio: como filtro no separan nada. */
export const FACET_VALUE_BLOCKLIST: Record<string, string[]> = {
    types: ['establishment', 'point_of_interest', 'food', 'store', 'premise', 'political', 'locality', 'neighborhood', 'health'],
};

export function visibleFacetItems<T extends { value: string }>(attribute: string, items: T[]): T[] {
    const allow = FACET_VALUE_ALLOWLIST[attribute];
    const block = FACET_VALUE_BLOCKLIST[attribute];
    return items.filter((item) => {
        const value = String(item.value);
        if (allow && !allow.includes(value)) return false;
        if (block && block.includes(value)) return false;
        return true;
    });
}

export const NUMERIC_FILTER_ATTRIBUTES = new Set(
    Object.values(FILTER_SECTIONS).flat().filter((section) => section.numeric).map((section) => section.attribute),
);

/** «≥ 8» (etiqueta de Algolia para un filtro numérico) → «8+». */
export function formatNumericRefinementLabel(label: string): string {
    const match = /^\s*(?:≥|>=)\s*([\d.,]+)\s*$/.exec(label);
    return match ? `${match[1]}+` : label;
}
