import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZonePicker } from '../components/search/ZonePicker';
import { HIDE_BOT_ONLY, useBotOnlyFilter } from '../components/search/botOnlyFilter';
import { FILTER_SECTIONS, NUMERIC_FILTER_ATTRIBUTES, formatNumericRefinementLabel, visibleFacetItems, type FilterSectionConfig } from '../components/search/FilterConfig';
import { hitPhoto, usePlaceHitPhotos } from '../components/search/SearchResultPhotos';
import { SearchLanding } from '../components/search/SearchLanding';
import { elementKey } from '../lib/listElements';
import { usePreferences } from '../context/PreferencesContext';
import { searchPreferenceRules } from '../lib/searchPreferences';
import { parseZones, zoneKey, zonesFilter, zonesLabel, type Zone } from '../lib/searchZones';
import {
    InstantSearch,
    Configure,
    useSearchBox,
    useInfiniteHits,
    useRefinementList,
    useNumericMenu,
    useCurrentRefinements,
    useClearRefinements,
    useStats,
    useInstantSearch,
    Index
} from 'react-instantsearch';
import { Link } from 'react-router-dom';
import {
    Search, Map as MapIcon, Users, List as ListIcon, MessageCircle,
    X, Clock, ChevronLeft, ChevronRight, Star, LocateFixed, Loader2,
    ArrowUpDown, ChevronDown, SlidersHorizontal, ShieldCheck, Bot, Utensils,
    Coffee, Wine, EyeOff, AlertTriangle
} from 'lucide-react';

import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import { SearchQueryParser } from '../services/SearchQueryParser';
import { ListItemCard } from '../components/ListItemCard';
import { SearchMapView } from '../components/SearchMapView';
import { useLocation } from '../hooks/useLocation';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { getPlaceTypeLabel, getPlaceTypeLabels } from '../utils/placeTypeLabels';
import { fetchClosedStatusesForPlaceIds, isClosedPlaceStatus } from '../utils/placeStatus';
import { placeCardScore } from '../lib/placeRating';
import { HomeFeedCard } from '../components/home/HomeFeedCard';
import type { HomeFeedCard as HomeFeedCardData } from '../lib/homeFeeds';
import { useSearchEggs } from '../components/surprises/useSearchEggs';
import { MarqueeText } from '../components/ui/MarqueeText';

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_SEARCHES_KEY = 'listopic_recent_searches';

const TAB_LABELS: Record<string, string> = {
    lists: 'Listas', places: 'Sitios', users: 'Usuarios', items: 'Elementos',
};
const TAB_ICONS: Record<string, React.ElementType> = {
    lists: ListIcon, places: MapIcon, users: Users, items: MessageCircle,
};

const FILTER_LABELS: Record<string, string> = {
    availableTags: 'Etiqueta', categoryId: 'Categoría', categoryName: 'Categoría', city: 'Ciudad',
    types: 'Tipo', priceLevel: 'Precio', serviceOptions: 'Servicio',
    accessibilityOptions: 'Accesibilidad', petOptions: 'Mascotas', userType: 'Tipo', badges: 'Insignia',
    listCategoryId: 'Categoría', authorUserType: 'Tipo de usuario', placeCity: 'Ciudad', listName: 'Lista', groupTags: 'Tag', residence: 'Ciudad',
    itemTags: 'Etiqueta', hasPhoto: 'Fotos', isGlutenFree: 'Sin gluten', closedStatus: 'Estado', placeClosedStatus: 'Estado',
    averageRating: 'Nota', avgGeneralScore: 'Nota', publicHumanReviewsCount: 'Opiniones', reviewCount: 'Opiniones',
};

const USER_TYPE_LABELS: Record<string, string> = {
    bot: 'Bots',
    critico: 'Críticos',
    critic: 'Críticos',
    experto: 'Expertos',
    jefe: 'Equipo',
    admin: 'Admin',
    user: 'Usuarios',
};

const FACET_VALUE_LABELS: Record<string, Record<string, string>> = {
    serviceOptions: {
        delivery: 'A domicilio',
        takeout: 'Para llevar',
        dineIn: 'Comer allí',
        reservable: 'Reservable',
        servesBeer: 'Cerveza',
        servesWine: 'Vino',
        servesBreakfast: 'Desayuno',
        servesLunch: 'Comida',
        servesDinner: 'Cena',
    },
    accessibilityOptions: {
        wheelchairAccessibleEntrance: 'Entrada accesible',
        wheelchairAccessibleSeating: 'Asientos accesibles',
        wheelchairAccessibleParking: 'Parking accesible',
        wheelchairAccessibleRestroom: 'Baño accesible',
        hearingLoop: 'Bucle auditivo',
    },
    petOptions: {
        petFriendly: 'Admite mascotas',
        allowsDogs: 'Admite perros',
        allowsCats: 'Admite gatos',
        indoorAllowed: 'Interior permitido',
        terraceOnly: 'Solo terraza',
        assistanceDogsOnly: 'Perros de asistencia',
        waterBowls: 'Cuencos de agua',
        petMenu: 'Menú para mascotas',
        requiresLeash: 'Requiere correa',
    },
    closedStatus: {
        permanently_closed: 'Cerrado permanente',
        temporarily_closed: 'Cerrado temporal',
    },
    placeClosedStatus: {
        permanently_closed: 'Cerrado permanente',
        temporarily_closed: 'Cerrado temporal',
    },
    hasPhoto: { true: 'Con fotos' },
    isGlutenFree: { true: 'Sin gluten' },
};

const EMPTY_MESSAGES: Record<string, { title: string; hint: string }> = {
    lists: { title: 'No hay listas', hint: 'Prueba por nombre, etiqueta o categoría.' },
    places: { title: 'No hay sitios', hint: 'Prueba otra ciudad o tipo.' },
    users: { title: 'No hay usuarios', hint: 'Busca por nombre o prueba @nombre.' },
    items: { title: 'No hay elementos', hint: 'Prueba #etiqueta o el nombre del plato.' },
    grouped_items: { title: 'No hay elementos', hint: 'Prueba #etiqueta o el nombre del plato.' },
    all: { title: 'Sin resultados', hint: 'Cambia las palabras o los filtros.' },
};

type SearchHit = {
    objectID: string;
    displayName?: string;
    username?: string;
    photoUrl?: string;
    bio?: string;
    followersCount?: number;
    reviewsCount?: number;
    name?: string;
    itemName?: string;
    thumbnailUrl?: string;
    mainImageUrl?: string;
    coverUrl?: string;
    imageUrl?: string;
    averageRating?: number;
    avgGeneralScore?: number;
    reviewCount?: number;
    // Sitios (lib/place-rating.js): nota pública de personas aparte de la actividad con bots.
    hasPublicRating?: boolean;
    publicHumanReviewsCount?: number;
    totalVisibleReviewsCount?: number;
    publicBotReviewsCount?: number;
    botAverageRating?: number;
    itemCount?: number;
    placeId?: string;
    placeName?: string;
    city?: string;
    placeCity?: string;
    authorName?: string;
    ownerName?: string;
    listOwnerName?: string;
    authorPhoto?: string;
    ownerPhoto?: string;
    listName?: string;
    listId?: string;
    categoryName?: string;
    listCategoryName?: string;
    groupTags?: string[];
    itemTags?: string[];
    types?: string[];
    availableTags?: string[];
    closedStatus?: string | null;
    placeClosedStatus?: string | null;
    googleBusinessStatus?: string | null;
    businessStatus?: string | null;
    placeGoogleBusinessStatus?: string | null;
    placeBusinessStatus?: string | null;
    level?: number;
    xp?: number;
    hasPhoto?: boolean;
};

// Opciones de ordenación por pestaña
// NOTA: los valores que no son el índice base requieren réplicas en Algolia.
// Crear desde el dashboard: Algolia → Index → Replicas con los nombres indicados.
type SortOption = {
    value: string;
    indexName: string;
    label: string;
    requiresLocation?: boolean;
};

const SORT_OPTIONS: Record<string, SortOption[]> = {
    lists: [
        { value: 'lists', indexName: 'lists', label: 'Destacadas' },
        { value: 'lists_by_followers', indexName: 'lists_by_followers', label: 'Seguidores' },
        { value: 'lists_by_reviews', indexName: 'lists_by_reviews', label: 'Reseñas' },
    ],
    places: [
        { value: 'places', indexName: 'places', label: 'Destacados' },
        { value: 'places_by_rating', indexName: 'places_by_rating', label: 'Reseña' },
        { value: 'places_by_reviews', indexName: 'places_by_reviews', label: 'Reseñas' },
        { value: 'places_distance', indexName: 'places', label: 'Más cerca', requiresLocation: true },
    ],
    users: [
        { value: 'users', indexName: 'users', label: 'Destacados' },
        { value: 'users_by_level', indexName: 'users_by_level', label: 'Nivel' },
        { value: 'users_by_followers', indexName: 'users_by_followers', label: 'Seguidores' },
        { value: 'users_by_reviews', indexName: 'users_by_reviews', label: 'Reseñas' },
    ],
    items: [
        { value: 'grouped_items', indexName: 'grouped_items', label: 'Destacados' },
        { value: 'grouped_items_by_score', indexName: 'grouped_items_by_score', label: 'Puntuación' },
        { value: 'grouped_items_by_reviews', indexName: 'grouped_items_by_reviews', label: 'Reseñas' },
        { value: 'items_distance', indexName: 'grouped_items', label: 'Más cerca', requiresLocation: true },
    ],
};

const SORT_PARAM_ALIASES: Record<string, Record<string, string>> = {
    lists: {
        popular: 'lists_by_followers',
        followers: 'lists_by_followers',
        most_reviewed: 'lists_by_reviews',
        reviews: 'lists_by_reviews',
        latest: 'lists',
    },
    places: {
        rating: 'places_by_rating',
        top_rated: 'places_by_rating',
        most_reviewed: 'places_by_reviews',
        reviews: 'places_by_reviews',
        distance: 'places_distance',
        nearby: 'places_distance',
        latest: 'places',
    },
    users: {
        followers: 'users_by_followers',
        most_reviewed: 'users_by_reviews',
        reviews: 'users_by_reviews',
        level: 'users_by_level',
    },
    items: {
        top_rated: 'grouped_items_by_score',
        top_liked: 'grouped_items_by_score',
        score: 'grouped_items_by_score',
        most_reviewed: 'grouped_items_by_reviews',
        reviews: 'grouped_items_by_reviews',
        distance: 'items_distance',
        nearby: 'items_distance',
        latest: 'grouped_items',
    },
};

function getDefaultSortValue(tab: string) {
    return SORT_OPTIONS[tab]?.[0]?.value || INDEX_NAMES.lists;
}

function resolveSortValue(tab: string, requested?: string | null) {
    const options = SORT_OPTIONS[tab] || [];
    const aliased = requested ? (SORT_PARAM_ALIASES[tab]?.[requested] || requested) : null;
    return options.some(option => option.value === aliased) ? aliased as string : getDefaultSortValue(tab);
}

function getSortOption(tab: string, value?: string | null) {
    const options = SORT_OPTIONS[tab] || SORT_OPTIONS.lists;
    const resolved = resolveSortValue(tab, value);
    return options.find(option => option.value === resolved) || options[0];
}

function getDistanceSortValue(tab: string) {
    return SORT_OPTIONS[tab]?.find(option => option.requiresLocation)?.value || null;
}

function normalizeSearchTab(tab: string) {
    if (tab === 'grouped_items') return 'items';
    if (tab === 'all' || Object.prototype.hasOwnProperty.call(INDEX_NAMES, tab)) return tab;
    return 'all';
}

type GeoRadius = number | 'all';

const GEO_RADIUS_OPTIONS = [
    { value: 500, label: '500 m' }, { value: 1000, label: '1 km' },
    { value: 2000, label: '2 km' }, { value: 5000, label: '5 km' },
    { value: 10000, label: '10 km' }, { value: 20000, label: '20 km' },
    { value: 50000, label: '50 km' }, { value: 'all', label: 'Sin límite' },
];

function parseGeoRadiusParam(value: string | null): GeoRadius {
    if (value === 'all') return 'all';
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 10000;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getRecentSearches = (): string[] => {
    try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]'); } catch { return []; }
};
const saveRecentSearch = (term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    const list = getRecentSearches().filter(s => s !== t);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([t, ...list].slice(0, 5)));
};

// ─── Search Box ───────────────────────────────────────────────────────────────

type CustomSearchBoxProps = Record<string, unknown> & {
    rawQuery?: string;
    onQueryChange?: (query: string) => void;
    /** Con la caja vacía, las búsquedas recientes ya las enseña la portada de Buscar. */
    hideEmptyRecents?: boolean;
};

const CustomSearchBox = ({ rawQuery = '', onQueryChange, hideEmptyRecents = false, ...props }: CustomSearchBoxProps) => {
    const { refine } = useSearchBox(props);
    const [val, setVal] = useState(rawQuery);
    const [focused, setFocused] = useState(false);
    const [recents, setRecents] = useState<string[]>([]);
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => { if (rawQuery !== val) setVal(rawQuery); }, [rawQuery]); // eslint-disable-line
    // El temporizador solo se rearma al escribir, y la URL solo se toca si el texto cambió:
    // si no, al pulsar un resultado justo después de un re-render, el setSearchParams
    // diferido devolvía a /search (reemplazando la navegación al elemento).
    const latest = useRef({ rawQuery, onQueryChange });
    useEffect(() => { latest.current = { rawQuery, onQueryChange }; }, [rawQuery, onQueryChange]);
    useEffect(() => {
        const t = setTimeout(() => {
            refine(SearchQueryParser.parse(val).cleanedQuery);
            if (val !== latest.current.rawQuery) latest.current.onQueryChange?.(val);
        }, 300);
        return () => clearTimeout(t);
    }, [val, refine]);

    const select = (term: string) => {
        setVal(term);
        saveRecentSearch(term);
        setRecents(getRecentSearches());
        refine(SearchQueryParser.parse(term).cleanedQuery);
        onQueryChange?.(term);
    };
    const showRecent = !hideEmptyRecents && focused && !val && recents.length > 0;
    const matchRecent = focused && val ? recents.filter(s => s.toLowerCase().includes(val.toLowerCase())) : [];

    return (
        <div className="relative w-full">
            <form onSubmit={e => {
                e.preventDefault();
                saveRecentSearch(val);
                refine(SearchQueryParser.parse(val).cleanedQuery);
                onQueryChange?.(val);
            }} role="search">
                <input ref={ref} type="text" value={val}
                    onChange={e => setVal(e.target.value)}
                    onFocus={() => { setRecents(getRecentSearches()); setFocused(true); }}
                    onBlur={() => setTimeout(() => setFocused(false), 150)}
                    placeholder="Buscar listas, sitios, platos o personas"
                    aria-label="Buscar en Listopic"
                    enterKeyHint="search"
                    autoComplete="off"
                    className="w-full rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] py-3.5 pl-12 pr-10 text-base text-[var(--lt-text)] backdrop-blur-xl placeholder:text-[var(--lt-text-muted)] transition-colors focus:outline-none focus:border-[var(--lt-accent-border)] focus:shadow-[0_0_0_3px_var(--lt-accent-soft)]"
                />
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--lt-accent)]" aria-hidden="true" />
                {val && (
                    <button type="button" aria-label="Borrar búsqueda" onClick={() => { setVal(''); refine(''); onQueryChange?.(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--lt-card-strong)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </form>
            {(showRecent || matchRecent.length > 0) && (
                <div className="absolute top-full mt-1.5 left-0 right-0 bg-[var(--lt-card-strong)] border border-[var(--lt-border)] rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                    {showRecent && (
                        <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Búsquedas recientes</p>
                    )}
                    {showRecent && recents.map(t => (
                        <button key={t} onMouseDown={() => select(t)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[var(--lt-text)] hover:bg-[var(--lt-accent-soft)] transition-colors">
                            <Clock className="w-4 h-4 text-[var(--lt-text-muted)] shrink-0" /><span className="truncate text-sm">{t}</span>
                        </button>
                    ))}
                    {matchRecent.map(t => (
                        <button key={t} onMouseDown={() => select(t)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[var(--lt-text)] hover:bg-[var(--lt-accent-soft)] transition-colors">
                            <Search className="w-4 h-4 text-[var(--lt-text-muted)] shrink-0" /><span className="truncate text-sm">{t}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Sort Control ─────────────────────────────────────────────────────────────

const SortControl = ({
    activeTab,
    value,
    onChange,
}: {
    activeTab: string;
    value: string;
    onChange: (value: string) => void;
}) => {
    const opts = SORT_OPTIONS[activeTab] || [];
    if (opts.length <= 1) return null;
    return (
        <div className="relative flex items-center rounded-full border border-[var(--lt-border)] bg-[var(--lt-card)] pl-2.5 pr-2 transition-colors hover:border-[var(--lt-accent-border)]">
            <ArrowUpDown className="pointer-events-none w-3.5 h-3.5 shrink-0 text-[var(--lt-accent)]" aria-hidden="true" />
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                aria-label="Ordenar resultados"
                className="appearance-none bg-transparent border-0 py-1.5 pl-1.5 pr-4 text-xs font-bold text-[var(--lt-text)] focus:outline-none cursor-pointer"
            >
                {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 w-3 h-3 text-[var(--lt-text-muted)]" aria-hidden="true" />
        </div>
    );
};

// ─── Active Filters Chips ─────────────────────────────────────────────────────

const ActiveFiltersChips = () => {
    const { items } = useCurrentRefinements();
    const { refine: clearAll, canRefine } = useClearRefinements();
    if (!canRefine || items.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {items.map(item => item.refinements.map(r => (
                <button key={`${item.attribute}-${r.value}`}
                    onClick={() => item.refine(r)}
                    aria-label={`Quitar ${FILTER_LABELS[item.attribute] || item.attribute}: ${formatFacetLabel(item.attribute, r.label)}`}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] rounded-full text-xs text-[var(--lt-text)] hover:opacity-80 transition-opacity">
                    <span className="font-bold text-[var(--lt-accent)]">{FILTER_LABELS[item.attribute] || item.attribute}:</span>
                    {formatFacetLabel(item.attribute, r.label)}
                    <X className="w-3 h-3 ml-0.5 text-[var(--lt-text-muted)]" />
                </button>
            )))}
            <button onClick={clearAll} className="flex items-center gap-1 px-2.5 py-1 bg-[var(--lt-danger-soft)] border border-[var(--lt-danger)]/30 rounded-full text-xs font-bold text-[var(--lt-danger)] hover:opacity-80 transition-opacity">
                Limpiar <X className="w-3 h-3" />
            </button>
        </div>
    );
};

// ─── Results Count ────────────────────────────────────────────────────────────

const ResultsCount = () => {
    const { nbHits, processingTimeMS } = useStats();
    if (nbHits === 0) return null;
    return (
        <span className="text-xs text-[var(--lt-text-muted)]">
            <strong className="font-bold text-[var(--lt-text)]">{nbHits.toLocaleString('es')}</strong> resultado{nbHits !== 1 ? 's' : ''}
            <span className="opacity-60 ml-1">· {processingTimeMS}ms</span>
        </span>
    );
};

// ─── Refinement List ──────────────────────────────────────────────────────────

function formatFacetLabel(attribute: string, label: string) {
    if (NUMERIC_FILTER_ATTRIBUTES.has(attribute)) {
        return formatNumericRefinementLabel(label);
    }
    if (attribute === 'authorUserType' || attribute === 'userType') {
        return USER_TYPE_LABELS[label] || label;
    }
    if (FACET_VALUE_LABELS[attribute]?.[label]) {
        return FACET_VALUE_LABELS[attribute][label];
    }
    if (attribute === 'types') {
        return getPlaceTypeLabel(label);
    }
    if (attribute === 'priceLevel') {
        return label === '0' ? 'Gratis' : '€'.repeat(Math.max(1, Math.min(4, Number(label) || 1)));
    }
    return label;
}

function hasActiveRefinement(refinements: ReturnType<typeof useCurrentRefinements>['items'], attribute: string) {
    return refinements.some(item => item.attribute === attribute && item.refinements.length > 0);
}

function shouldFilterClosed(tab: string) {
    return tab === 'places' || tab === 'items' || tab === 'grouped_items';
}

function getDefaultClosedFilter(tab: string) {
    if (tab === 'places') {
        return 'NOT closedStatus:permanently_closed AND NOT closedStatus:temporarily_closed AND NOT closedStatus:CLOSED_PERMANENTLY AND NOT closedStatus:CLOSED_TEMPORARILY AND NOT googleBusinessStatus:CLOSED_PERMANENTLY AND NOT googleBusinessStatus:CLOSED_TEMPORARILY AND NOT businessStatus:CLOSED_PERMANENTLY AND NOT businessStatus:CLOSED_TEMPORARILY';
    }
    if (tab === 'items' || tab === 'grouped_items') {
        return 'NOT placeClosedStatus:permanently_closed AND NOT placeClosedStatus:temporarily_closed AND NOT placeClosedStatus:CLOSED_PERMANENTLY AND NOT placeClosedStatus:CLOSED_TEMPORARILY AND NOT placeGoogleBusinessStatus:CLOSED_PERMANENTLY AND NOT placeGoogleBusinessStatus:CLOSED_TEMPORARILY AND NOT placeBusinessStatus:CLOSED_PERMANENTLY AND NOT placeBusinessStatus:CLOSED_TEMPORARILY';
    }
    return '';
}

// La pestaña Sitios muestra los que tienen ACTIVIDAD visible: alguna reseña pública,
// también de bots (reviewsCount = totalVisibleReviewsCount). Un sitio solo con bots sale,
// «Sin nota pública todavía»; NUNCA depende de publicHumanReviewsCount. Se filtra con
// reviewsCount (y no con el nombre nuevo) porque es el campo que tienen todos los registros
// y el que usan las apps ya instaladas. Filtrarlo en Algolia evita páginas vacías.
const PLACES_WITH_REVIEWS_FILTER = 'reviewsCount > 0';

function isClosedStatus(value?: string | null) {
    return isClosedPlaceStatus(value);
}

function getHitClosedStatus(activeTab: string, hit: SearchHit) {
    const values = activeTab === 'places'
        ? [hit.closedStatus, hit.googleBusinessStatus, hit.businessStatus]
        : [hit.placeClosedStatus, hit.placeGoogleBusinessStatus, hit.placeBusinessStatus];
    return values.find(value => isClosedStatus(value)) || null;
}

function joinAlgoliaFilters(parts: Array<string | null | undefined>) {
    return parts.filter((part): part is string => Boolean(part && part.trim())).join(' AND ');
}

const CustomRefinementList = ({ attribute, label, icon: Icon, limit = 8, defaultOpen = false, dependsOn }: FilterSectionConfig) => {
    const { items, refine } = useRefinementList({ attribute, limit, showMore: true, showMoreLimit: 24 });
    const { items: currentRefinements } = useCurrentRefinements();
    const [isOpen, setIsOpen] = useState(defaultOpen);
    if (dependsOn && !hasActiveRefinement(currentRefinements, dependsOn)) return null;

    const visibleItems = visibleFacetItems(attribute, items);

    if (visibleItems.length === 0) return null;
    const selectedCount = visibleItems.filter(item => item.isRefined).length;

    return (
        <section className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
            >
                <span className="w-6 h-6 rounded-md bg-[var(--lt-accent-soft)] flex items-center justify-center text-[var(--lt-accent)] shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--lt-text)] leading-tight">{label}</span>
                    <span className={`block text-[11px] ${selectedCount > 0 ? 'font-bold text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)]'}`}>
                        {selectedCount > 0 ? `${selectedCount} activo${selectedCount > 1 ? 's' : ''}` : `${visibleItems.length} ${visibleItems.length === 1 ? 'opción' : 'opciones'}`}
                    </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-[var(--lt-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                {visibleItems.map(item => (
                    <button
                        type="button"
                        key={String(item.value)}
                        onClick={() => refine(item.value)}
                        aria-pressed={item.isRefined}
                        className={`min-h-8 max-w-full overflow-hidden box-border rounded-full border px-3 py-1.5 text-xs font-bold leading-none transition-colors active:scale-95 ${
                            item.isRefined
                                ? 'border-transparent lt-on-accent shadow-md shadow-[var(--lt-accent-shadow)]'
                                : 'bg-[var(--lt-card-strong)] border-[var(--lt-border)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'
                        }`}
                        style={item.isRefined ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}
                    >
                        <span className="inline-block max-w-36 truncate align-middle">{formatFacetLabel(attribute, item.label)}</span>
                        <span className={item.isRefined ? 'ml-1 opacity-75 align-middle' : 'ml-1 text-[var(--lt-text-muted)] align-middle'}>
                            {item.count}
                        </span>
                    </button>
                ))}
                </div>
            )}
        </section>
    );
};

// Filtro numérico (nota mínima, nº de opiniones): una opción a la vez; pulsarla otra vez la quita.
const NumericFilterSection = ({ attribute, label, icon: Icon, defaultOpen = false, numeric = [] }: FilterSectionConfig) => {
    const { items, refine } = useNumericMenu({ attribute, items: [{ label: 'Cualquiera' }, ...numeric] });
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const anyValue = items[0]?.value;
    const options = items.slice(1);
    const selected = options.find(item => item.isRefined);
    if (options.length === 0) return null;
    return (
        <section className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
            >
                <span className="w-6 h-6 rounded-md bg-[var(--lt-accent-soft)] flex items-center justify-center text-[var(--lt-accent)] shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--lt-text)] leading-tight">{label}</span>
                    <span className={`block text-[11px] ${selected ? 'font-bold text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)]'}`}>
                        {selected ? `Desde ${selected.label}` : 'Cualquiera'}
                    </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-[var(--lt-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                    {options.map(item => (
                        <button
                            type="button"
                            key={item.label}
                            onClick={() => refine(item.isRefined && anyValue !== undefined ? anyValue : item.value)}
                            aria-pressed={item.isRefined}
                            className={`min-h-8 rounded-full border px-3 py-1.5 text-xs font-bold leading-none transition-colors active:scale-95 ${
                                item.isRefined
                                    ? 'border-transparent lt-on-accent shadow-md shadow-[var(--lt-accent-shadow)]'
                                    : 'bg-[var(--lt-card-strong)] border-[var(--lt-border)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'
                            }`}
                            style={item.isRefined ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
};

// ─── Filter Content ───────────────────────────────────────────────────────────

const ClosedPlacesToggle = ({
    activeTab,
    includeClosed,
    onIncludeClosedChange,
}: {
    activeTab: string;
    includeClosed: boolean;
    onIncludeClosedChange: (value: boolean) => void;
}) => {
    if (!shouldFilterClosed(activeTab)) return null;

    return (
        <section className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-3 py-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-md bg-[var(--lt-danger-soft)] flex items-center justify-center shrink-0">
                        <EyeOff className="w-3.5 h-3.5 text-[var(--lt-danger)]" />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-sm font-bold text-[var(--lt-text)] leading-tight">Incluir cerrados</span>
                    </span>
                </span>
                <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${includeClosed ? 'bg-[var(--lt-danger)]' : 'bg-[var(--lt-border-strong)]'}`}>
                    <input
                        type="checkbox"
                        className="sr-only"
                        checked={includeClosed}
                        onChange={event => onIncludeClosedChange(event.target.checked)}
                    />
                    <span className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${includeClosed ? 'translate-x-5' : 'translate-x-1'}`} />
                </span>
            </label>
        </section>
    );
};

const FilterContent = ({
    activeTab,
    includeClosed,
    onIncludeClosedChange,
}: {
    activeTab: string;
    includeClosed: boolean;
    onIncludeClosedChange: (value: boolean) => void;
}) => {
    const sections = FILTER_SECTIONS[activeTab] || [];
    return (
        <div className="space-y-2">
            {sections.map(section => (
                section.numeric
                    ? <NumericFilterSection key={section.attribute} {...section} />
                    : <CustomRefinementList key={section.attribute} {...section} />
            ))}
            <ClosedPlacesToggle activeTab={activeTab} includeClosed={includeClosed} onIncludeClosedChange={onIncludeClosedChange} />
        </div>
    );
};

// ─── Estados de carga y error ─────────────────────────────────────────────────

const SearchResultsSkeleton = ({ listLayout }: { listLayout: boolean }) => (
    <div
        className={listLayout ? 'flex flex-col gap-3' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'}
        aria-busy="true"
        aria-label="Cargando resultados"
    >
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="lt-skeleton-card flex h-[7.5rem] gap-3 overflow-hidden rounded-2xl p-2" aria-hidden="true">
                <div className="h-full w-28 shrink-0 rounded-xl bg-[var(--lt-skeleton-base)]" />
                <div className="flex-1 space-y-2 py-2 pr-2">
                    <div className="h-4 w-3/4 rounded bg-[var(--lt-skeleton-base)]" />
                    <div className="h-3 w-1/2 rounded bg-[var(--lt-skeleton-base)]" />
                    <div className="flex gap-2 pt-2">
                        <div className="h-3 w-12 rounded bg-[var(--lt-skeleton-base)]" />
                        <div className="h-3 w-12 rounded bg-[var(--lt-skeleton-base)]" />
                    </div>
                </div>
            </div>
        ))}
    </div>
);

/** Resultados por sección en «Todo»: un carrusel que llena el ancho de escritorio. */
const FEDERATED_HITS = 8;

const CarouselSkeleton = () => (
    <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-2 lg:mx-0 lg:px-0" aria-busy="true" aria-label="Cargando resultados">
        {Array.from({ length: FEDERATED_HITS }).map((_, i) => (
            <div key={i} className="lt-skeleton-card h-[170px] w-[220px] shrink-0 rounded-3xl md:h-[190px] md:w-[260px]" aria-hidden="true" />
        ))}
    </div>
);

// Si Algolia falla (red, credenciales), avisamos en vez de dejar la página en blanco.
const SearchErrorNotice = () => {
    const { status, error, refresh } = useInstantSearch({ catchError: true });
    if (status !== 'error' || !error) return null;
    return (
        <div role="alert" className="mx-4 lg:mx-8 mb-5 rounded-2xl border border-[var(--lt-warning)]/30 bg-[var(--lt-warning-soft)] p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--lt-warning)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-[var(--lt-text)] font-bold text-sm">La búsqueda no responde ahora mismo</p>
                <p className="text-[var(--lt-text-muted)] text-xs mt-0.5">Comprueba tu conexión e inténtalo de nuevo.</p>
            </div>
            <button type="button" onClick={() => refresh()} className="btn-glass text-xs shrink-0">Reintentar</button>
        </div>
    );
};

// En "Todo" cada sección se oculta si no tiene resultados; si ninguna tiene,
// hay que decirlo en lugar de dejar la pantalla vacía.
const AllTabEmptyState = ({ hasQuery }: { hasQuery: boolean }) => {
    const { scopedResults, status } = useInstantSearch();
    if (!hasQuery || status === 'loading' || status === 'stalled' || status === 'error') return null;
    const sections = scopedResults.slice(1); // el primero es el índice raíz
    if (sections.length === 0) return null;
    const allEmpty = sections.every(section => section.results && section.results.nbHits === 0);
    return allEmpty ? <EmptyState activeTab="all" /> : null;
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState = ({ activeTab, onTabChange, zoneLabel, onClearZone }: { activeTab: string; onTabChange?: (t: string) => void; zoneLabel?: string | null; onClearZone?: () => void }) => {
    const msg = EMPTY_MESSAGES[activeTab] || EMPTY_MESSAGES.all;
    const inZone = Boolean(zoneLabel && onClearZone);
    const EmptyIcon = TAB_ICONS[activeTab === 'grouped_items' ? 'items' : activeTab] || Search;
    return (
        <div className="relative mx-auto my-6 max-w-md overflow-hidden rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-5 py-10 text-center">
            <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full blur-[60px]" style={{ backgroundColor: 'var(--lt-accent-soft)' }} aria-hidden="true" />
            <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                <EmptyIcon className="h-6 w-6" />
                <Search className="absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-full border border-[var(--lt-border)] bg-[var(--lt-card-strong)] p-1 text-[var(--lt-text-muted)]" aria-hidden="true" />
            </div>
            <h3 className="relative text-lg font-bold text-[var(--lt-text)] mb-1 [text-wrap:balance]">{inZone ? `${msg.title} en ${zoneLabel}` : msg.title}</h3>
            <p className="relative text-[var(--lt-text-muted)] text-sm mb-5">{inZone ? 'Prueba con otra zona o quítala.' : msg.hint}</p>
            {inZone && (
                <button
                    type="button"
                    onClick={onClearZone}
                    className="relative rounded-full px-4 py-2 text-sm font-bold lt-on-accent shadow-lg shadow-[var(--lt-accent-shadow)] transition-opacity hover:opacity-90"
                    style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                >
                    Buscar en todas las zonas
                </button>
            )}
            {!inZone && onTabChange && activeTab !== 'all' && (
                <div className="relative flex flex-wrap justify-center gap-2">
                    {Object.entries(TAB_LABELS).filter(([k]) => k !== activeTab).map(([k, l]) => {
                        const TabIcon = TAB_ICONS[k] || Search;
                        return (
                            <button key={k} onClick={() => onTabChange(k)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-3.5 py-1.5 text-xs font-bold text-[var(--lt-text)] transition-colors hover:border-[var(--lt-accent-border)]">
                                <TabIcon className="h-3.5 w-3.5 text-[var(--lt-accent)]" /> Buscar en {l}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── User Hit Card ────────────────────────────────────────────────────────────

const userAvatarUrl = (hit: SearchHit, displayName: string) =>
    hit.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`;

const UserHitCard = ({ hit, selected, onHover }: { hit: SearchHit; selected: boolean; onHover: (id: string | null) => void }) => {
    const displayName = hit.displayName || hit.username || '?';
    const level = Math.max(1, hit.level || 1);
    return (
        <Link to={`/profile/${hit.objectID}`}
            id={`hit-${hit.objectID}`}
            onMouseEnter={() => onHover(hit.objectID)}
            onMouseLeave={() => onHover(null)}
            className={`group flex items-center gap-3 rounded-2xl border bg-[var(--lt-card)] p-3 transition-colors duration-200 hover:border-[var(--lt-accent-border)] ${selected ? 'border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent)]' : 'border-[var(--lt-border)]'}`}>
            <span className="relative shrink-0">
                <img src={userAvatarUrl(hit, displayName)}
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-[var(--lt-border)]" alt="" />
                <span
                    className="absolute -bottom-1 -right-1 rounded-full border-2 border-[var(--lt-card-strong)] px-1.5 py-px text-[10px] font-black leading-tight lt-on-accent"
                    style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                    aria-label={`Nivel ${level}`}
                >
                    {level}
                </span>
            </span>
            <div className="min-w-0 flex-1">
                <MarqueeText as="h3" text={displayName} className="text-sm font-bold text-[var(--lt-text)]" />
                {hit.username && hit.displayName && hit.username !== hit.displayName && (
                    <MarqueeText text={`@${hit.username}`} className="text-xs font-medium text-[var(--lt-accent)]" />
                )}
                {hit.bio && <p className="text-[var(--lt-text-muted)] text-xs line-clamp-1 mt-0.5">{hit.bio}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[var(--lt-text-muted)]">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> <strong className="font-bold text-[var(--lt-text)]">{hit.followersCount || 0}</strong> seg.</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3" /> <strong className="font-bold text-[var(--lt-text)]">{hit.reviewsCount || 0}</strong> reseñas</span>
                </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--lt-text-muted)] shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
};

/** Persona en el carrusel de «Todo»: avatar grande, nombre y nivel. */
const UserMiniCard = ({ hit }: { hit: SearchHit }) => {
    const displayName = hit.displayName || hit.username || '?';
    const level = Math.max(1, hit.level || 1);
    return (
        <Link
            to={`/profile/${hit.objectID}`}
            id={`hit-${hit.objectID}`}
            className="group flex w-[9.5rem] shrink-0 snap-start flex-col items-center rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-3 pb-3 pt-4 text-center transition-colors hover:border-[var(--lt-accent-border)]"
        >
            <span className="relative">
                <img src={userAvatarUrl(hit, displayName)} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--lt-accent-border)] transition-transform duration-300 group-hover:scale-105" />
                <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[var(--lt-card-strong)] px-1.5 py-px text-[10px] font-black leading-tight lt-on-accent"
                    style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                >
                    Nv. {level}
                </span>
            </span>
            <MarqueeText as="h3" text={displayName} className="mt-3 w-full text-sm font-bold text-[var(--lt-text)]" />
            <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--lt-text-muted)]">
                <span className="flex items-center gap-0.5"><Users className="h-3 w-3" /> {hit.followersCount || 0}</span>
                <span className="flex items-center gap-0.5"><Star className="h-3 w-3" /> {hit.reviewsCount || 0}</span>
            </span>
        </Link>
    );
};

/** Resultado de Algolia → tarjeta con foto de la Home (carruseles de «Todo»). */
function hitToFeedCard(activeTab: string, hit: SearchHit, fallbackPhoto?: string | null): HomeFeedCardData {
    const photoUrl = hitPhoto(hit) ?? fallbackPhoto ?? null;
    const closed = isClosedStatus(getHitClosedStatus(activeTab, hit));
    const city = hit.city || hit.placeCity;
    if (activeTab === 'places') {
        const score = placeCardScore(hit, false);
        const typeLabel = getPlaceTypeLabels(hit.types || [], 1)[0];
        return {
            key: `place:${hit.objectID}`, kind: 'place', id: hit.objectID,
            title: hit.name || hit.placeName || 'Sitio',
            subtitle: [typeLabel, city].filter(Boolean).join(' · ') || undefined,
            badge: closed ? 'Cerrado' : undefined,
            photoUrl, rating: score.avgRating, count: score.reviewCount,
            to: `/place/${hit.objectID}`,
        };
    }
    if (activeTab === 'lists') {
        const owner = hit.ownerName || hit.authorName || hit.listOwnerName;
        const rating = hit.averageRating ?? hit.avgGeneralScore;
        return {
            key: `list:${hit.objectID}`, kind: 'list', id: hit.objectID,
            title: hit.name || 'Lista',
            subtitle: [owner ? `por ${owner}` : null, typeof hit.itemCount === 'number' ? `${hit.itemCount} elementos` : null].filter(Boolean).join(' · ') || undefined,
            badge: hit.categoryName || undefined,
            photoUrl, rating: typeof rating === 'number' && rating > 0 ? rating : null, count: hit.reviewsCount ?? 0,
            to: `/list/${hit.objectID}`,
        };
    }
    // Elementos (grouped_items): plato en un sitio.
    // Mismo nombre y enlace que ListItemCard en la pestaña Elementos.
    const name = hit.name ?? hit.itemName ?? 'Resultado';
    const rating = hit.averageRating ?? hit.avgGeneralScore;
    return {
        key: `dish:${hit.objectID}`, kind: 'dish', id: hit.objectID,
        title: name,
        subtitle: [hit.placeName, city].filter(Boolean).join(' · ') || undefined,
        badge: closed ? 'Cerrado' : (hit.listCategoryName || undefined),
        photoUrl, rating: typeof rating === 'number' && rating > 0 ? rating : null, count: hit.reviewsCount ?? hit.reviewCount ?? 0,
        to: hit.placeId ? `/group/${hit.placeId}/${encodeURIComponent(name)}` : `/list/${hit.objectID}`,
        placeId: hit.placeId, placeName: hit.placeName, itemName: name,
    };
}

// ─── Custom Hits ──────────────────────────────────────────────────────────────

interface HitsProps {
    activeTab: string;
    onTabChange?: (t: string) => void;
    selectedHitId?: string | null;
    onHoverHit?: (id: string | null) => void;
    onSelectHit?: (id: string) => void;
    /** Usa layout de lista compacta (para el panel lateral derecho) */
    listLayout?: boolean;
    /** Desactiva el scroll infinito (usado en sección federated) */
    noInfiniteScroll?: boolean;
    /** Carrusel horizontal de tarjetas con foto, como en la Home (sección de «Todo»). */
    carousel?: boolean;
    includeClosed?: boolean;
    /**
     * Los resultados están en el orden del ranking de una sola Lista (sin texto
     * buscado, orden por puntuación): con una zona elegida se muestra «#3 en Valladolid».
     */
    rankEligible?: boolean;
    /** Zona elegida («Valladolid», «Madrid + Barcelona»…) para «#3 en …» y el vacío. */
    zoneLabel?: string | null;
    onClearZone?: () => void;
}

/** Configure de los resultados: añade el filtro de «solo bots» según el filtro «Bots». */
const ResultsConfigure = ({ tab, query, filters, geo, optionalFilters }: { tab: string; query: string; filters: string; geo: Record<string, unknown>; optionalFilters?: string[] }) => {
    const botFilter = useBotOnlyFilter(tab);
    return <Configure query={query} filters={joinAlgoliaFilters([filters, botFilter])} hitsPerPage={20} {...(optionalFilters?.length ? { optionalFilters } : {})} {...geo} />;
};

const NO_HITS: SearchHit[] = [];

const CustomHits: React.FC<HitsProps> = ({ activeTab, onTabChange, selectedHitId, onHoverHit, onSelectHit, listLayout = false, noInfiniteScroll = false, carousel = false, includeClosed = false, rankEligible = false, zoneLabel: selectedZoneLabel = null, onClearZone }) => {
    const { hits, isLastPage, showMore } = useInfiniteHits();
    const { status, results } = useInstantSearch();
    // Cualquier filtro de la barra lateral (tags, tipo de usuario…) deja un
    // subconjunto: su posición ya no es el puesto de la Lista en esa zona.
    const { items: refinements } = useCurrentRefinements();
    const zoneLabel = rankEligible && refinements.length === 0 ? selectedZoneLabel : null;
    // Con el filtro «Bots», un sitio sin nota pública enseña la de bots (marcada como tal).
    const showBots = refinements.some((item) => item.attribute === 'authorUserType' && item.refinements.some((r) => String(r.value) === 'bot'));
    const sentinelRef = useRef<HTMLDivElement>(null);
    const hover = onHoverHit ?? (() => {});
    const typedHits = useMemo(() => hits as SearchHit[], [hits]);
    const placeIdsKey = useMemo(() => {
        if (!shouldFilterClosed(activeTab) || includeClosed) return '';
        const ids = typedHits
            .map(hit => activeTab === 'places' ? hit.objectID : hit.placeId)
            .filter((id): id is string => Boolean(id));
        return Array.from(new Set(ids)).sort().join('|');
    }, [activeTab, includeClosed, typedHits]);
    const [closedPlaceIds, setClosedPlaceIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!placeIdsKey) {
            queueMicrotask(() => setClosedPlaceIds(new Set()));
            return;
        }
        let cancelled = false;
        const placeIds = placeIdsKey.split('|').filter(Boolean);
        fetchClosedStatusesForPlaceIds(placeIds)
            .then(statuses => {
                if (!cancelled) setClosedPlaceIds(new Set(statuses.keys()));
            })
            .catch(() => {
                if (!cancelled) setClosedPlaceIds(new Set());
            });
        return () => { cancelled = true; };
    }, [placeIdsKey]);

    const visibleHits = useMemo(() => {
        const openHits = includeClosed || !shouldFilterClosed(activeTab)
            ? typedHits
            : typedHits.filter(hit => {
                if (isClosedStatus(getHitClosedStatus(activeTab, hit))) return false;
                const placeId = activeTab === 'places' ? hit.objectID : hit.placeId;
                return !placeId || !closedPlaceIds.has(placeId);
            });
        return openHits;
    }, [activeTab, closedPlaceIds, includeClosed, typedHits]);
    // Sitios sin foto propia: la de un plato valorado (pocas lecturas, solo lo visible).
    const placePhotos = usePlaceHitPhotos(activeTab === 'places' ? visibleHits : NO_HITS);
    const carouselRef = useRef<HTMLDivElement>(null);
    const scrollCarousel = (direction: 1 | -1) => {
        const el = carouselRef.current;
        if (el) el.scrollBy({ left: direction * Math.max(280, el.clientWidth * 0.8), behavior: 'smooth' });
    };

    useEffect(() => {
        if (noInfiniteScroll) return;
        const el = sentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && !isLastPage) showMore(); }, { threshold: 0.1 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [noInfiniteScroll, isLastPage, showMore]);

    if (visibleHits.length === 0) {
        if (activeTab === 'all') return null;
        // Sin respuesta todavía (o buscando): esqueleto, no un falso "no hay".
        const awaitingResults = (results as { __isArtificial?: boolean } | undefined)?.__isArtificial
            || status === 'loading' || status === 'stalled';
        if (awaitingResults) return carousel ? <CarouselSkeleton /> : <SearchResultsSkeleton listLayout={listLayout} />;
        if (status === 'error') return null; // SearchErrorNotice ya lo explica
        return <EmptyState activeTab={activeTab} onTabChange={onTabChange} zoneLabel={selectedZoneLabel} onClearZone={onClearZone} />;
    }

    if (carousel) {
        const arrowClass = 'absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--lt-border)] bg-[var(--lt-card-strong)] text-[var(--lt-text)] shadow-xl opacity-0 transition-opacity hover:border-[var(--lt-accent-border)] hover:text-[var(--lt-accent)] focus-visible:opacity-100 group-hover:opacity-100 md:flex';
        return (
            <div className="group relative">
                {visibleHits.length > 3 && (
                    <>
                        <button type="button" aria-label="Anteriores" onClick={() => scrollCarousel(-1)} className={`${arrowClass} -left-3`}>
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button type="button" aria-label="Siguientes" onClick={() => scrollCarousel(1)} className={`${arrowClass} -right-3`}>
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </>
                )}
                <div ref={carouselRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 scroll-px-4 pb-3 pt-0.5 snap-x snap-mandatory hide-scrollbar scroll-smooth lg:mx-0 lg:px-0 lg:scroll-px-0">
                    {visibleHits.map(hit => (
                        activeTab === 'users'
                            ? <UserMiniCard key={hit.objectID} hit={hit} />
                            : (
                                <div key={hit.objectID} id={`hit-${hit.objectID}`} className="shrink-0 snap-start">
                                    <HomeFeedCard card={hitToFeedCard(activeTab, hit, placePhotos[hit.objectID])} />
                                </div>
                            )
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className={listLayout ? 'flex flex-col gap-3' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'}>
                {visibleHits.map((hit, index) => {
                    const selected = selectedHitId === hit.objectID;
                    if (activeTab === 'users') {
                        return <UserHitCard key={hit.objectID} hit={hit} selected={selected} onHover={hover} />;
                    }
                    return (
                        <div
                            key={hit.objectID}
                            id={`hit-${hit.objectID}`}
                            onMouseEnter={() => hover(hit.objectID)}
                            onMouseLeave={() => hover(null)}
                            onClick={() => onSelectHit?.(hit.objectID)}
                            className={`rounded-2xl transition-shadow duration-200 cursor-pointer ${selected ? 'outline outline-2 outline-[var(--lt-accent)] outline-offset-2 shadow-lg shadow-[var(--lt-accent-shadow)]' : ''}`}
                        >
                            <ListItemCard
                                item={{
                                    id: hit.objectID,
                                    name: hit.name ?? hit.itemName ?? 'Resultado',
                                    photoUrl: hitPhoto(hit) ?? (activeTab === 'places' ? placePhotos[hit.objectID] : undefined) ?? undefined,
                                    ...(activeTab === 'places'
                                        ? placeCardScore(hit, showBots)
                                        : {
                                            avgRating: hit.averageRating ?? hit.avgGeneralScore ?? 0,
                                            reviewCount: hit.reviewsCount ?? hit.reviewCount ?? hit.itemCount ?? 0,
                                        }),
                                    placeId: activeTab === 'places' ? hit.objectID : hit.placeId,
                                    placeName: hit.placeName || (activeTab === 'places' ? hit.name : undefined),
                                    placeCity: hit.city || hit.placeCity,
                                    authorName: hit.authorName || hit.ownerName || hit.listOwnerName,
                                    authorPhoto: hit.authorPhoto || hit.ownerPhoto,
                                    listName: hit.listName,
                                    listId: hit.listId,
                                    followersCount: hit.followersCount,
                                    itemCount: hit.itemCount,
                                    placeClosedStatus: getHitClosedStatus(activeTab, hit),
                                    tags: (activeTab === 'grouped_items' || activeTab === 'items')
                                        ? [hit.listCategoryName, ...(hit.groupTags || []), ...(hit.itemTags || [])].filter((tag): tag is string => Boolean(tag))
                                        : activeTab === 'places' ? getPlaceTypeLabels(hit.types || [], 4)
                                        : [hit.categoryName, ...(hit.availableTags || [])].filter((tag): tag is string => Boolean(tag)),
                                }}
                                isGrid={!listLayout}
                                disableLift={listLayout}
                                contextRankLabel={zoneLabel ? `#${index + 1} en ${zoneLabel}` : undefined}
                                elementKey={(activeTab === 'items' || activeTab === 'grouped_items') ? elementKey({ placeId: hit.placeId, itemName: hit.itemName }, 'dish') : undefined}
                                groupingMode={
                                    activeTab === 'lists' ? 'list' :
                                    (activeTab === 'grouped_items' || activeTab === 'items') ? 'dish' : 'place'
                                }
                            />
                        </div>
                    );
                })}
            </div>
            {!noInfiniteScroll && !isLastPage && (
                <div ref={sentinelRef} className="py-8 flex items-center justify-center gap-2 text-xs font-medium text-[var(--lt-text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--lt-accent)]" aria-hidden="true" /> Buscando más…
                </div>
            )}
        </div>
    );
};

// ─── Federated Section ────────────────────────────────────────────────────────

const FedSectionContent = ({ title, subtitle, type, icon: Icon, onViewAll }: { title: string; subtitle: string; type: string; icon: React.ElementType; onViewAll: () => void }) => {
    const { hits } = useInfiniteHits();
    const { nbHits } = useStats();
    const visibleCount = hits.length;
    if (visibleCount === 0) return null;
    return (
        <section className="mb-5">
            <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base md:text-xl font-display font-bold leading-tight text-[var(--lt-text)]">
                        <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                            <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate">{title}</span>
                    </h2>
                    <p className="mt-0.5 truncate text-xs font-medium text-[var(--lt-text-muted)]">
                        {nbHits > visibleCount ? `${visibleCount} de ${nbHits.toLocaleString('es')} · ${subtitle}` : subtitle}
                    </p>
                </div>
                <button onClick={onViewAll} className="shrink-0 inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-bold text-[var(--lt-accent)] bg-[var(--lt-accent-soft)] hover:opacity-80 transition-opacity">
                    Ver todo <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>
            <CustomHits activeTab={type} noInfiniteScroll carousel />
        </section>
    );
};

const FederatedSection = ({
    indexName,
    title,
    subtitle,
    type,
    icon,
    onViewAll,
    filters,
    query,
}: {
    indexName: string;
    title: string;
    subtitle: string;
    type: string;
    icon: React.ElementType;
    onViewAll: () => void;
    filters?: string;
    query?: string;
}) => (
    <Index indexName={indexName}>
        <Configure hitsPerPage={FEDERATED_HITS} filters={filters} query={query} />
        <FedSectionContent title={title} subtitle={subtitle} type={type} icon={icon} onViewAll={onViewAll} />
    </Index>
);

// ─── Geo Controls (reutilizable) ──────────────────────────────────────────────

const GeoControls = ({
    isGeoTab, geoActive, geoRadius, locLoading, locError,
    onRadiusChange,
}: {
    isGeoTab: boolean;
    geoActive: boolean;
    geoRadius: GeoRadius;
    locLoading: boolean;
    locError: string | null;
    onRadiusChange: (v: GeoRadius) => void;
}) => {
    // «Cerca de mí» se activa en los filtros rápidos; aquí solo el radio (o el aviso).
    if (!isGeoTab || !geoActive) return null;
    return (
        <div className="flex items-center gap-2">
            {locLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--lt-text-muted)]" aria-label="Buscando tu ubicación" />}
            {!locError && (
                <select
                    value={geoRadius}
                    onChange={e => onRadiusChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    aria-label="Radio de búsqueda"
                    className="bg-[var(--lt-card)] border border-[var(--lt-success)]/40 rounded-full px-3 py-1.5 text-xs font-bold text-[var(--lt-text)] focus:outline-none"
                >
                    {GEO_RADIUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            )}
            {locError && <span className="text-xs text-[var(--lt-danger)]">{locError}</span>}
        </div>
    );
};

const FilterTrigger = ({ onClick }: { onClick: () => void }) => {
    const { items } = useCurrentRefinements();
    const activeCount = items.reduce((total, item) => total + item.refinements.length, 0);

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                activeCount > 0
                    ? 'border-transparent lt-on-accent shadow-lg shadow-[var(--lt-accent-shadow)]'
                    : 'bg-[var(--lt-card)] border-[var(--lt-border)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'
            }`}
            style={activeCount > 0 ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}
        >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${activeCount > 0 ? '' : 'text-[var(--lt-accent)]'}`} />
            Filtros
            {activeCount > 0 && (
                <span className="min-w-4 h-4 rounded-full bg-white/25 px-1 text-[10px] flex items-center justify-center">
                    {activeCount}
                </span>
            )}
        </button>
    );
};

const QuickFacetButton = ({ attribute, value, label, icon: Icon }: { attribute: string; value: string; label: string; icon: React.ElementType }) => {
    const { items, refine } = useRefinementList({ attribute, limit: 30 });
    const item = items.find(option => option.value === value || option.label === value);
    const isActive = Boolean(item?.isRefined);
    const isAvailable = Boolean(item);

    return (
        <button
            type="button"
            disabled={!isAvailable}
            onClick={() => item && refine(item.value)}
            aria-pressed={isActive}
            className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                isActive
                    ? 'border-transparent lt-on-accent shadow-md shadow-[var(--lt-accent-shadow)]'
                    : isAvailable
                        ? 'bg-[var(--lt-card)] border-[var(--lt-border)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'
                        : 'bg-transparent border-[var(--lt-border)] text-[var(--lt-text-muted)] opacity-50 cursor-not-allowed'
            }`}
            style={isActive ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}
        >
            <Icon className={`w-3.5 h-3.5 ${isActive || !isAvailable ? '' : 'text-[var(--lt-accent)]'}`} />
            {label}
            {item && <span className={isActive ? 'opacity-75' : 'text-[var(--lt-text-muted)]'}>{item.count}</span>}
        </button>
    );
};

const QuickFilters = ({
    activeTab,
    isGeoTab,
    geoActive,
    locLoading,
    onToggleGeo,
}: {
    activeTab: string;
    isGeoTab: boolean;
    geoActive: boolean;
    locLoading: boolean;
    onToggleGeo: () => void;
}) => {
    const showReviewUserTypes = activeTab === 'items' || activeTab === 'grouped_items' || activeTab === 'places';
    const showPlaceTypes = activeTab === 'places';

    if (!isGeoTab && !showReviewUserTypes && !showPlaceTypes) return null;

    return (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto hide-scrollbar px-4 pb-1 lg:mx-0 lg:px-0">
            {isGeoTab && (
                <button
                    type="button"
                    onClick={onToggleGeo}
                    disabled={locLoading}
                    aria-pressed={geoActive}
                    className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                        geoActive
                            ? 'bg-emerald-600 border-emerald-400/50 lt-on-accent shadow-md shadow-emerald-900/30'
                            : 'bg-[var(--lt-card)] border-[var(--lt-border)] text-[var(--lt-text)] hover:border-[var(--lt-success)]'
                    }`}
                >
                    {locLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className={`w-3.5 h-3.5 ${geoActive ? '' : 'text-[var(--lt-success)]'}`} />}
                    Cerca de mí
                </button>
            )}
            {showReviewUserTypes && (
                <>
                    <QuickFacetButton attribute="authorUserType" value="critico" label="Críticos" icon={ShieldCheck} />
                    <QuickFacetButton attribute="authorUserType" value="bot" label="Bots" icon={Bot} />
                    <QuickFacetButton attribute="authorUserType" value="experto" label="Expertos" icon={Star} />
                </>
            )}
            {showPlaceTypes && (
                <>
                    <QuickFacetButton attribute="types" value="restaurant" label="Restaurantes" icon={Utensils} />
                    <QuickFacetButton attribute="types" value="cafe" label="Cafés" icon={Coffee} />
                    <QuickFacetButton attribute="types" value="bar" label="Bares" icon={Wine} />
                </>
            )}
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const SearchPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryParam = searchParams.get('q') || '';
    useSearchEggs(queryParam);
    // Llegada desde una Lista («Explorar otra zona en Buscar…»): se busca dentro de ella.
    const listIdParam = searchParams.get('listId') || '';
    const listNameParam = searchParams.get('listName') || '';
    const typeParam = normalizeSearchTab(searchParams.get('type') || 'all');
    const sortParam = searchParams.get('sort') || '';
    const geoParam = searchParams.get('geo') === '1';
    const radiusParam = searchParams.get('radius');
    const zones = useMemo(() => parseZones(searchParams.getAll('zone')), [searchParams]);

    const [sortByTab, setSortByTab] = useState<Record<string, string>>(() => (
        typeParam === 'all' ? {} : { [typeParam]: resolveSortValue(typeParam, sortParam) }
    ));
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const filtersRef = useSheetDismiss(() => setMobileFiltersOpen(false), mobileFiltersOpen);
    const [includeClosedPlaces, setIncludeClosedPlaces] = useState(false);
    const [geoActive, setGeoActive] = useState(() => (
        (typeParam === 'places' || typeParam === 'items') && geoParam
    ));
    const [geoRadius, setGeoRadius] = useState<GeoRadius>(() => parseGeoRadiusParam(radiusParam));
    const [mapExpanded, setMapExpanded] = useState(false);
    const [selectedHitId, setSelectedHitId] = useState<string | null>(null);
    const [hoveredHitId, setHoveredHitId] = useState<string | null>(null);

    const { location, error: locError, loading: locLoading, requestLocation } = useLocation();
    const activeTab = typeParam;
    const isGeoTab = activeTab === 'places' || activeTab === 'items';
    const activeSortOption = getSortOption(activeTab, sortParam || sortByTab[activeTab]);
    const activeIndexName = activeSortOption?.indexName || INDEX_NAMES.lists;
    const effectiveGeoActive = geoActive || Boolean(activeSortOption?.requiresLocation);

    const buildSearchParams = useCallback(({
        tab = activeTab,
        sortValue = activeSortOption.value,
        query = queryParam,
        geoEnabled = effectiveGeoActive,
        radiusValue = geoRadius,
        zonesValue = zones,
    }: {
        tab?: string;
        sortValue?: string;
        query?: string;
        geoEnabled?: boolean;
        radiusValue?: GeoRadius;
        zonesValue?: Zone[];
    } = {}) => {
        const nextParams: Record<string, string | string[]> = { type: tab };
        const trimmedQuery = query.trim();
        if (trimmedQuery) nextParams.q = trimmedQuery;
        if (tab !== 'all' && sortValue !== getDefaultSortValue(tab)) {
            nextParams.sort = sortValue;
        }

        const tabSupportsGeo = tab === 'places' || tab === 'items';
        const sortRequiresLocation = Boolean(getSortOption(tab, sortValue)?.requiresLocation);
        if (tabSupportsGeo && (geoEnabled || sortRequiresLocation)) {
            nextParams.geo = '1';
            nextParams.radius = String(radiusValue);
        }
        if (tab === 'items' && listIdParam) {
            nextParams.listId = listIdParam;
            if (listNameParam) nextParams.listName = listNameParam;
        }
        // La zona se conserva al cambiar de pestaña (en Listas y Usuarios no se aplica).
        if (zonesValue.length > 0) nextParams.zone = zonesValue.map(zoneKey);

        return nextParams;
    }, [activeSortOption.value, activeTab, effectiveGeoActive, geoRadius, queryParam, listIdParam, listNameParam, zones]);

    const handleZonesChange = useCallback((nextZones: Zone[]) => {
        setSearchParams(buildSearchParams({ zonesValue: nextZones }));
        setSelectedHitId(null);
    }, [buildSearchParams, setSearchParams]);

    const handleTabChange = useCallback((tab: string) => {
        const sortValue = resolveSortValue(tab, sortByTab[tab]);
        setSearchParams(buildSearchParams({ tab, sortValue }));
        // Solo cerrar el mapa si pasamos a una pestaña sin geo (users, lists)
        const newIsGeoTab = tab === 'places' || tab === 'items';
        if (!newIsGeoTab) setMapExpanded(false);
        setSelectedHitId(null);
    }, [buildSearchParams, setSearchParams, sortByTab]);

    const handleSortChange = useCallback((value: string) => {
        const option = getSortOption(activeTab, value);
        setSortByTab(prev => ({ ...prev, [activeTab]: option.value }));
        if (option.requiresLocation) {
            if (!location) requestLocation();
            setGeoActive(true);
        }
        setSearchParams(buildSearchParams({
            sortValue: option.value,
            geoEnabled: option.requiresLocation ? true : effectiveGeoActive,
        }));
        setSelectedHitId(null);
    }, [activeTab, buildSearchParams, effectiveGeoActive, location, requestLocation, setSearchParams]);

    const handleQueryChange = useCallback((nextQuery: string) => {
        setSearchParams(buildSearchParams({ query: nextQuery }), { replace: true });
    }, [buildSearchParams, setSearchParams]);

    // Portada (caja vacía): lo que se pulsa en ella se busca igual que si se escribiera y se enviara.
    const showLanding = activeTab === 'all' && !queryParam.trim();
    const handleLandingSearch = useCallback((nextQuery: string) => {
        const term = nextQuery.trim();
        if (!term) return;
        saveRecentSearch(term);
        handleQueryChange(term);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [handleQueryChange]);

    const handleMarkerClick = useCallback((id: string) => {
        setSelectedHitId(prev => prev === id ? null : id);
        const el = document.getElementById(`hit-${id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    const toggleGeo = useCallback(() => {
        const nextGeoActive = !effectiveGeoActive;
        let nextSortValue = activeSortOption.value;

        if (nextGeoActive) {
            const distanceSortValue = getDistanceSortValue(activeTab);
            if (!location) requestLocation();
            setGeoActive(true);
            if (distanceSortValue) {
                setSortByTab(prev => ({ ...prev, [activeTab]: distanceSortValue }));
                nextSortValue = distanceSortValue;
            }
        } else {
            setGeoActive(false);
            if (activeSortOption.requiresLocation) {
                const defaultSortValue = getDefaultSortValue(activeTab);
                setSortByTab(prev => ({ ...prev, [activeTab]: defaultSortValue }));
                nextSortValue = defaultSortValue;
            }
        }

        setSearchParams(buildSearchParams({
            sortValue: nextSortValue,
            geoEnabled: nextGeoActive,
        }));
        setSelectedHitId(null);
    }, [activeSortOption.requiresLocation, activeSortOption.value, activeTab, buildSearchParams, effectiveGeoActive, location, requestLocation, setSearchParams]);

    const handleGeoRadiusChange = useCallback((nextRadius: GeoRadius) => {
        setGeoRadius(nextRadius);
        setSearchParams(buildSearchParams({
            geoEnabled: true,
            radiusValue: nextRadius,
        }));
    }, [buildSearchParams, setSearchParams]);

    useEffect(() => {
        if (!activeSortOption?.requiresLocation || location) return;
        if (!location) requestLocation();
    }, [activeSortOption?.requiresLocation, location, requestLocation]);

    const parsedQuery = useMemo(() => SearchQueryParser.parse(queryParam), [queryParam]);
    const parsedAlgoliaFilters = useMemo(() => {
        const parts: string[] = [];
        Object.entries(parsedQuery.filters).forEach(([key, values]) => {
            let field = key;
            if (activeTab === 'lists' && key === 'category') field = 'categoryName';
            if (activeTab === 'places') { if (key === 'service') field = 'serviceOptions'; if (key === 'price') field = 'priceLevel'; }
            if (activeTab === 'items') {
                if (key === 'city') field = 'placeCity';
                if (key === 'userType') field = 'authorUserType';
                if (key === 'category') field = 'listCategoryName';
            }
            const g = values.map(v => `${field}:"${v}"`).join(' OR ');
            if (g) parts.push(`(${g})`);
        });
        return parts.join(' AND ');
    }, [parsedQuery, activeTab]);

    const defaultClosedFilter = useMemo(() => (
        includeClosedPlaces ? '' : getDefaultClosedFilter(activeTab)
    ), [activeTab, includeClosedPlaces]);

    // Sin la zona: con esto se calcula el árbol del selector de zona.
    const baseAlgoliaFilters = useMemo(() => (
        joinAlgoliaFilters([
            parsedAlgoliaFilters,
            defaultClosedFilter,
            activeTab === 'places' ? PLACES_WITH_REVIEWS_FILTER : '',
            activeTab === 'items' && listIdParam ? `listId:"${listIdParam.replace(/"/g, '')}"` : '',
        ])
    ), [parsedAlgoliaFilters, defaultClosedFilter, activeTab, listIdParam]);
    // «Mis preferencias»: se aplican solas y se pueden quitar mientras dura la búsqueda.
    const { prefs } = usePreferences();
    const [ignoredPrefs, setIgnoredPrefs] = useState<Record<string, boolean>>({});
    const prefRules = useMemo(
        () => searchPreferenceRules(prefs, activeTab).filter((rule) => !ignoredPrefs[rule.key]),
        [prefs, activeTab, ignoredPrefs],
    );
    const prefFilter = prefRules.map((rule) => rule.filter || '').filter(Boolean).join(' AND ');
    const prefOptionalFilters = useMemo(() => prefRules.flatMap((rule) => rule.optional || []), [prefRules]);
    const algoliaFilters = useMemo(() => (
        joinAlgoliaFilters([baseAlgoliaFilters, prefFilter, isGeoTab ? zonesFilter(activeTab, zones) : ''])
    ), [baseAlgoliaFilters, prefFilter, isGeoTab, activeTab, zones]);
    const selectedZoneLabel = zonesLabel(zones);

    // «#3 en Valladolid» solo cuando lo que se ve es el ranking de la Lista en
    // esa zona, igual que en la Lista: sin texto, sin otros filtros, sin radio
    // (sería «en la zona y a X km») y sin sitios cerrados.
    const rankEligible = activeTab === 'items'
        && Boolean(listIdParam)
        && !parsedQuery.cleanedQuery.trim()
        && !parsedAlgoliaFilters
        && !effectiveGeoActive
        && !includeClosedPlaces
        && (activeSortOption.value === 'grouped_items_by_score' || activeSortOption.value === 'grouped_items');
    const clearListScope = () => {
        const next = new URLSearchParams(searchParams);
        next.delete('listId');
        next.delete('listName');
        setSearchParams(next);
    };
    const activeGeoConfig = useMemo(() => {
        if (!isGeoTab || !effectiveGeoActive || !location) {
            return {};
        }
        return {
            aroundLatLng: `${location.latitude},${location.longitude}`,
            aroundRadius: geoRadius === 'all' ? ('all' as const) : geoRadius,
            // Ordenando por nota, el radio solo filtra: sin esto Algolia ordena
            // por cercanía antes que por nota (la Lista con radio ordena por nota).
            ...(activeSortOption.requiresLocation ? {} : { aroundPrecision: 20_000_000 }),
        };
    }, [activeSortOption.requiresLocation, effectiveGeoActive, geoRadius, isGeoTab, location]);

    const zoneBar = isGeoTab ? (
        <div className="flex flex-wrap items-center gap-1.5">
            <ZonePicker
                key={activeTab}
                tab={activeTab as 'items' | 'places'}
                zones={zones}
                onChange={handleZonesChange}
                query={parsedQuery.cleanedQuery}
                filters={baseAlgoliaFilters}
                geo={activeGeoConfig}
            />
            {activeTab === 'items' && listIdParam && (
                <button
                    type="button"
                    onClick={clearListScope}
                    title="Buscar en todas las Listas"
                    aria-label={`Quitar el filtro «En la Lista ${listNameParam || 'elegida'}»: buscar en todas las Listas`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--lt-text)] hover:opacity-80"
                >
                    <ListIcon className="w-3.5 h-3.5 shrink-0 text-[var(--lt-accent)]" aria-hidden />
                    <span className="truncate">En la Lista «{listNameParam || 'elegida'}»</span>
                    <X className="ml-0.5 w-3 h-3 text-[var(--lt-text-muted)]" aria-hidden />
                </button>
            )}
            {prefRules.map((rule) => (
                <button
                    key={rule.key}
                    type="button"
                    onClick={() => setIgnoredPrefs((prev) => ({ ...prev, [rule.key]: true }))}
                    aria-label={`Quitar ${rule.label} en esta búsqueda (es de tus preferencias)`}
                    title="De tus preferencias"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1.5 text-xs font-semibold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                >
                    {rule.label}
                    <X className="ml-0.5 w-3 h-3" aria-hidden />
                </button>
            ))}
        </div>
    ) : null;

    // Props comunes para SearchMapView
    const mapSharedProps = {
        activeTab,
        selectedHitId,
        hoveredHitId,
        onMarkerClick: handleMarkerClick,
        geoActive: effectiveGeoActive,
        geoRadius,
        location,
        onLocate: toggleGeo,
        locLoading,
        includeClosed: includeClosedPlaces,
    };

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] pt-safe-20 pb-28 md:pb-20">
            <InstantSearch
                searchClient={algoliaClient}
                indexName={INDEX_NAMES.lists}
                future={{ preserveSharedStateOnUnmount: true }}
            >
                {/* ── Header: search + tabs ────────────────────────────────── */}
                <div className="relative z-10 px-4 lg:px-8 pt-2 mb-4">
                    <div className="pointer-events-none absolute -top-20 right-0 -z-10 h-64 w-64 rounded-full opacity-80 blur-[90px]" style={{ backgroundColor: 'var(--lt-accent-soft)' }} aria-hidden="true" />
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--lt-text)]">Buscar</h1>
                    <p className="mt-0.5 mb-3 text-xs md:text-sm font-medium text-[var(--lt-text-muted)]">Listas, sitios, platos y gente con buen criterio.</p>
                    <CustomSearchBox rawQuery={queryParam} onQueryChange={handleQueryChange} hideEmptyRecents={showLanding} />

                    {/* Tabs */}
                    <div role="tablist" aria-label="Qué buscar" className="-mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto hide-scrollbar px-4 lg:mx-0 lg:px-0">
                        {['all', ...Object.keys(INDEX_NAMES)].map(key => {
                            const Icon = key === 'all' ? Search : (TAB_ICONS[key] || Search);
                            const isActive = activeTab === key;
                            return (
                                <button key={key} role="tab" aria-selected={isActive} onClick={() => handleTabChange(key)}
                                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap shrink-0 border ${isActive ? 'border-transparent lt-on-accent shadow-lg shadow-[var(--lt-accent-shadow)]' : 'border-[var(--lt-border)] bg-[var(--lt-card)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'}`}
                                    style={isActive ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}>
                                    <Icon className="w-4 h-4" /> {key === 'all' ? 'Todo' : (TAB_LABELS[key] || key)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <SearchErrorNotice />

                {/* ── Federated: "Todo" ─────────────────────────────────────── */}
                {showLanding ? (
                    // SearchLanding ya trae su margen (container px-4); lg:px-4 lo alinea con la cabecera.
                    <div className="lg:px-4">
                        <SearchLanding onSearch={handleLandingSearch} />
                    </div>
                ) : activeTab === 'all' ? (
                    <div className="px-4 lg:px-8">
                        <AllTabEmptyState hasQuery={parsedQuery.cleanedQuery.trim().length > 0} />
                        <FederatedSection indexName={INDEX_NAMES.lists} title="Listas" subtitle="Rankings con opinión propia" type="lists" icon={ListIcon} query={parsedQuery.cleanedQuery} onViewAll={() => handleTabChange('lists')} />
                        <FederatedSection indexName={INDEX_NAMES.places} title="Sitios" subtitle="Donde ir a comprobarlo" type="places" icon={MapIcon} query={parsedQuery.cleanedQuery} filters={joinAlgoliaFilters([getDefaultClosedFilter('places'), PLACES_WITH_REVIEWS_FILTER])} onViewAll={() => handleTabChange('places')} />
                        <FederatedSection indexName={INDEX_NAMES.users} title="Usuarios" subtitle="Gente que opina (y mucho)" type="users" icon={Users} query={parsedQuery.cleanedQuery} onViewAll={() => handleTabChange('users')} />
                        <FederatedSection indexName={INDEX_NAMES.items} title="Elementos" subtitle="Platos y cosas concretas" type="grouped_items" icon={MessageCircle} query={parsedQuery.cleanedQuery} filters={joinAlgoliaFilters([getDefaultClosedFilter('items'), HIDE_BOT_ONLY])} onViewAll={() => handleTabChange('items')} />
                    </div>
                ) : (
                    <Index indexName={activeIndexName}>
                        <ResultsConfigure
                            tab={activeTab}
                            query={parsedQuery.cleanedQuery}
                            filters={algoliaFilters}
                            geo={activeGeoConfig}
                            optionalFilters={prefOptionalFilters}
                        />

                        {/* ── Mobile filter modal ───────────────────────────── */}
                        {mobileFiltersOpen && (
                            <div className="fixed inset-0 z-[2000] lg:hidden">
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
                                <div ref={filtersRef} role="dialog" aria-modal="true" aria-label="Filtros" className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-3xl bg-[var(--lt-card-strong)] border-t border-[var(--lt-border)] shadow-2xl overflow-hidden animate-slide-up-modal">
                                    <div className="px-5 pt-3 pb-3 border-b border-[var(--lt-border)]">
                                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--lt-border-strong)]" />
                                        <div className="flex justify-between items-center gap-3">
                                            <div className="min-w-0">
                                                <h3 className="flex items-center gap-2 text-base font-bold text-[var(--lt-text)]">
                                                    <span className="w-6 h-6 rounded-md flex items-center justify-center bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                                        <SlidersHorizontal className="w-3.5 h-3.5" />
                                                    </span>
                                                    Filtros
                                                </h3>
                                                <p className="text-xs text-[var(--lt-text-muted)] mt-0.5">Afina la búsqueda sin salir de la lista.</p>
                                            </div>
                                            <button onClick={() => setMobileFiltersOpen(false)} aria-label="Cerrar filtros" className="p-2 rounded-full bg-[var(--lt-card)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"><X className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                    <div className="min-h-0 flex-1 p-4 overflow-y-auto overscroll-contain subtle-scrollbar">
                                        <FilterContent activeTab={activeTab} includeClosed={includeClosedPlaces} onIncludeClosedChange={setIncludeClosedPlaces} />
                                    </div>
                                    <div className="border-t border-[var(--lt-border)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                                        <button
                                            type="button"
                                            onClick={() => setMobileFiltersOpen(false)}
                                            className="w-full rounded-2xl py-3 text-sm font-bold lt-on-accent shadow-lg shadow-[var(--lt-accent-shadow)]"
                                            style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                                        >
                                            Ver resultados
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                            DESKTOP 3-PANEL: mapa expandido en tabs geo
                        ═══════════════════════════════════════════════════════ */}
                        {isGeoTab && mapExpanded && (
                            <div className="hidden lg:flex gap-4 px-4 lg:px-8" style={{ height: 'calc(100vh - 9rem)' }}>

                                {/* Panel izquierdo: filtros */}
                                <aside className="w-56 xl:w-64 flex-shrink-0 flex flex-col overflow-hidden min-h-0">
                                    <div className="rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card-strong-alpha)] backdrop-blur-xl p-3 flex-1 min-h-0 h-full overflow-y-auto overscroll-contain subtle-scrollbar [scrollbar-gutter:stable]">
                                        <h3 className="text-[var(--lt-text)] font-bold text-base mb-0.5 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-md flex items-center justify-center bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]"><SlidersHorizontal className="w-3.5 h-3.5" /></span>
                                            Filtros
                                        </h3>
                                        <p className="text-xs text-[var(--lt-text-muted)] mb-3">Combina tipo, ciudad y autor.</p>
                                        <FilterContent activeTab={activeTab} includeClosed={includeClosedPlaces} onIncludeClosedChange={setIncludeClosedPlaces} />
                                    </div>
                                </aside>

                                {/* Panel central: controles + mapa */}
                                <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden">
                                    <QuickFilters
                                        activeTab={activeTab}
                                        isGeoTab={isGeoTab}
                                        geoActive={effectiveGeoActive}
                                        locLoading={locLoading}
                                        onToggleGeo={toggleGeo}
                                    />
                                    {zoneBar}
                                    <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                                        <GeoControls
                                            isGeoTab={isGeoTab}
                                            geoActive={effectiveGeoActive}
                                            geoRadius={geoRadius}
                                            locLoading={locLoading}
                                            locError={locError}
                                            onRadiusChange={handleGeoRadiusChange}
                                        />
                                        <div className="ml-auto flex items-center gap-4">
                                            <ResultsCount />
                                            <SortControl activeTab={activeTab} value={activeSortOption.value} onChange={handleSortChange} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-h-0">
                                        <SearchMapView
                                            mode="full"
                                            {...mapSharedProps}
                                            onToggleExpand={() => setMapExpanded(false)}
                                        />
                                    </div>
                                </div>

                                {/* Panel derecho: resultados con scroll */}
                                <div className="w-72 xl:w-80 flex-shrink-0 flex flex-col overflow-hidden">
                                    <ActiveFiltersChips />
                                    <div className="flex-1 overflow-y-auto mt-2 pr-1">
                                        <CustomHits
                                            activeTab={activeTab}
                                            onTabChange={handleTabChange}
                                            selectedHitId={selectedHitId}
                                            onHoverHit={setHoveredHitId}
                                            onSelectHit={id => setSelectedHitId(prev => prev === id ? null : id)}
                                            listLayout={true}
                                            includeClosed={includeClosedPlaces}
                                            rankEligible={rankEligible}
                                            zoneLabel={selectedZoneLabel}
                                            onClearZone={() => handleZonesChange([])}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                            LAYOUT ESTÁNDAR: móvil siempre, desktop sin mapa expandido
                        ═══════════════════════════════════════════════════════ */}
                        <div className={`flex gap-0 px-4 lg:px-8 ${isGeoTab && mapExpanded ? 'lg:hidden' : ''}`}>

                            {/* LEFT PANEL: mini-map + filtros */}
                            <aside className="hidden lg:flex flex-col gap-4 w-64 xl:w-72 flex-shrink-0 mr-6">
                                <div className="sticky top-24 flex h-[calc(100vh-7rem)] flex-col gap-4 overflow-hidden">

                                    {/* Mini-map (solo tabs geo, solo cuando NO está expandido) */}
                                    {isGeoTab && !mapExpanded && (
                                        <SearchMapView
                                            mode="mini"
                                            {...mapSharedProps}
                                            onToggleExpand={() => setMapExpanded(true)}
                                        />
                                    )}

                                    {/* Filtros */}
                                    <div className="rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card-strong-alpha)] backdrop-blur-xl p-3 flex-1 min-h-0 overflow-y-auto overscroll-contain subtle-scrollbar [scrollbar-gutter:stable]">
                                        <h3 className="text-[var(--lt-text)] font-bold text-base mb-0.5 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-md flex items-center justify-center bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]"><SlidersHorizontal className="w-3.5 h-3.5" /></span>
                                            Filtros
                                        </h3>
                                        <p className="text-xs text-[var(--lt-text-muted)] mb-3">Combina varias señales.</p>
                                        <FilterContent activeTab={activeTab} includeClosed={includeClosedPlaces} onIncludeClosedChange={setIncludeClosedPlaces} />
                                    </div>
                                </div>
                            </aside>

                            {/* MAIN CONTENT */}
                            <div className="flex-1 min-w-0">
                                {/* Mobile: filtros + mapa + zona, en una fila */}
                                <div className="flex flex-wrap items-center gap-1.5 mb-2 lg:hidden">
                                    <FilterTrigger onClick={() => setMobileFiltersOpen(true)} />
                                    {isGeoTab && (
                                        <button
                                            type="button"
                                            onClick={() => setMapExpanded(p => !p)}
                                            aria-pressed={mapExpanded}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${mapExpanded ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-accent)]' : 'bg-[var(--lt-card)] border-[var(--lt-border)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'}`}>
                                            <MapIcon className="w-3.5 h-3.5 text-[var(--lt-accent)]" /> {mapExpanded ? 'Ocultar mapa' : 'Mapa'}
                                        </button>
                                    )}
                                    {zoneBar}
                                </div>
                                {zoneBar && <div className="hidden lg:block mb-2">{zoneBar}</div>}
                                <QuickFilters
                                    activeTab={activeTab}
                                    isGeoTab={isGeoTab}
                                    geoActive={effectiveGeoActive}
                                    locLoading={locLoading}
                                    onToggleGeo={toggleGeo}
                                />

                                {/* Controls bar */}
                                <div className="flex flex-wrap items-center gap-2 mb-2 mt-2">
                                    {/* Geo: radio de «Cerca de mí» */}
                                    <GeoControls
                                        isGeoTab={isGeoTab}
                                        geoActive={effectiveGeoActive}
                                        geoRadius={geoRadius}
                                        locLoading={locLoading}
                                        locError={locError}
                                        onRadiusChange={handleGeoRadiusChange}
                                    />

                                    {/* Contador + Ordenar */}
                                    <div className="ml-auto flex min-w-0 items-center gap-3">
                                        <ResultsCount />
                                        <SortControl activeTab={activeTab} value={activeSortOption.value} onChange={handleSortChange} />
                                    </div>
                                </div>

                                {/* Filtros activos */}
                                <ActiveFiltersChips />

                                {/* ── Mapa expandido (mobile) ───────────────── */}
                                {isGeoTab && mapExpanded && (
                                    <div className="mb-4 h-[60vh] min-h-[360px] overflow-hidden rounded-3xl border border-[var(--lt-border)]">
                                        <SearchMapView
                                            mode="full"
                                            {...mapSharedProps}
                                            onToggleExpand={() => setMapExpanded(false)}
                                        />
                                    </div>
                                )}

                                {/* ── Resultados ───────────────────────── */}
                                <div className={isGeoTab && mapExpanded ? 'mt-4' : 'mt-3'}>
                                    <CustomHits
                                        activeTab={activeTab}
                                        onTabChange={handleTabChange}
                                        selectedHitId={selectedHitId}
                                        onHoverHit={setHoveredHitId}
                                        onSelectHit={id => setSelectedHitId(prev => prev === id ? null : id)}
                                        includeClosed={includeClosedPlaces}
                                        rankEligible={rankEligible}
                                        zoneLabel={selectedZoneLabel}
                                        onClearZone={() => handleZonesChange([])}
                                    />
                                </div>
                            </div>
                        </div>
                    </Index>
                )}
            </InstantSearch>
        </div>
    );
};
