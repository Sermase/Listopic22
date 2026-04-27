import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    InstantSearch,
    Configure,
    useSearchBox,
    useInfiniteHits,
    useRefinementList,
    useCurrentRefinements,
    useClearRefinements,
    useStats,
    Index
} from 'react-instantsearch';
import { Link } from 'react-router-dom';
import {
    Search, Map as MapIcon, Users, List as ListIcon, MessageCircle,
    X, Clock, ChevronRight, Star, LocateFixed, Loader2,
    ArrowUpDown, ChevronDown, SlidersHorizontal, ShieldCheck, Bot, Utensils,
    Coffee, Wine, Accessibility, Tags, MapPin, CircleDollarSign
} from 'lucide-react';

import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import { SearchQueryParser } from '../services/SearchQueryParser';
import { ListItemCard } from '../components/ListItemCard';
import { SearchMapView } from '../components/SearchMapView';
import { useLocation } from '../hooks/useLocation';
import { getPlaceTypeLabel, getPlaceTypeLabels } from '../utils/placeTypeLabels';

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_SEARCHES_KEY = 'listopic_recent_searches';

const TAB_LABELS: Record<string, string> = {
    lists: 'Listas', places: 'Lugares', users: 'Usuarios', items: 'Items',
};
const TAB_ICONS: Record<string, React.ElementType> = {
    lists: ListIcon, places: MapIcon, users: Users, items: MessageCircle,
};

const FILTER_LABELS: Record<string, string> = {
    availableTags: 'Etiqueta', categoryId: 'Categoría', categoryName: 'Categoría', city: 'Ciudad',
    types: 'Tipo', priceLevel: 'Precio', serviceOptions: 'Servicio',
    accessibilityOptions: 'Accesibilidad', userType: 'Tipo', badges: 'Insignia',
    listCategoryId: 'Categoría', authorUserType: 'Tipo de usuario', placeCity: 'Ciudad', listName: 'Lista', groupTags: 'Tag', residence: 'Ciudad',
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

const FACET_VALUE_ALLOWLIST: Record<string, string[]> = {
    userType: ['bot', 'jefe', 'critico', 'critic'],
    authorUserType: ['bot', 'jefe', 'critico', 'critic', 'experto'],
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
};

const EMPTY_MESSAGES: Record<string, { title: string; hint: string }> = {
    lists: { title: 'No hay listas', hint: 'Prueba por nombre, etiqueta o categoría.' },
    places: { title: 'No hay lugares', hint: 'Prueba otra ciudad o tipo.' },
    users: { title: 'No hay usuarios', hint: 'Busca por nombre o prueba @nombre.' },
    items: { title: 'No hay items', hint: 'Prueba #etiqueta o el nombre del plato.' },
    grouped_items: { title: 'No hay items', hint: 'Prueba #etiqueta o el nombre del plato.' },
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
    types?: string[];
    availableTags?: string[];
    level?: number;
    xp?: number;
};

interface FilterSectionConfig {
    attribute: string;
    label: string;
    icon: React.ElementType;
    limit?: number;
    defaultOpen?: boolean;
    dependsOn?: string;
}

const FILTER_SECTIONS: Record<string, FilterSectionConfig[]> = {
    lists: [
        { attribute: 'categoryName', label: 'Categoría', icon: ListIcon, defaultOpen: true },
        { attribute: 'availableTags', label: 'Etiquetas', icon: Tags, defaultOpen: true },
    ],
    places: [
        { attribute: 'city', label: 'Ciudad', icon: MapPin, defaultOpen: true },
        { attribute: 'accessibilityOptions', label: 'Accesibilidad', icon: Accessibility, defaultOpen: true },
        { attribute: 'types', label: 'Tipo', icon: Utensils, defaultOpen: true },
        { attribute: 'priceLevel', label: 'Precio', icon: CircleDollarSign },
        { attribute: 'serviceOptions', label: 'Servicios', icon: Coffee },
    ],
    users: [
        { attribute: 'userType', label: 'Tipo', icon: ShieldCheck, defaultOpen: true },
        { attribute: 'residence', label: 'Ciudad', icon: MapPin },
    ],
    items: [
        { attribute: 'listCategoryName', label: 'Categoría', icon: Tags, defaultOpen: true },
        { attribute: 'listName', label: 'Lista', icon: ListIcon, dependsOn: 'listCategoryName' },
        { attribute: 'authorUserType', label: 'Tipo de usuario', icon: ShieldCheck, defaultOpen: true },
        { attribute: 'placeCity', label: 'Ciudad', icon: MapPin, defaultOpen: true },
        { attribute: 'groupTags', label: 'Etiquetas', icon: Tags },
    ],
    grouped_items: [
        { attribute: 'listCategoryName', label: 'Categoría', icon: Tags, defaultOpen: true },
        { attribute: 'listName', label: 'Lista', icon: ListIcon, dependsOn: 'listCategoryName' },
        { attribute: 'authorUserType', label: 'Tipo de usuario', icon: ShieldCheck, defaultOpen: true },
        { attribute: 'placeCity', label: 'Ciudad', icon: MapPin, defaultOpen: true },
        { attribute: 'groupTags', label: 'Etiquetas', icon: Tags },
    ],
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
        { value: 'places_by_rating', indexName: 'places_by_rating', label: 'Valoración' },
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

function normalizeSearchTab(tab: string) {
    if (tab === 'grouped_items') return 'items';
    if (tab === 'all' || Object.prototype.hasOwnProperty.call(INDEX_NAMES, tab)) return tab;
    return 'all';
}

type GeoRadius = number | 'all';

const GEO_RADIUS_OPTIONS = [
    { value: 2000, label: '2 km' }, { value: 5000, label: '5 km' },
    { value: 10000, label: '10 km' }, { value: 20000, label: '20 km' },
    { value: 50000, label: '50 km' }, { value: 'all', label: 'Sin límite' },
];

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
};

const CustomSearchBox = ({ rawQuery = '', onQueryChange, ...props }: CustomSearchBoxProps) => {
    const { refine } = useSearchBox(props);
    const [val, setVal] = useState(rawQuery);
    const [focused, setFocused] = useState(false);
    const [recents, setRecents] = useState<string[]>([]);
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => { if (rawQuery !== val) setVal(rawQuery); }, [rawQuery]); // eslint-disable-line
    useEffect(() => {
        const t = setTimeout(() => {
            refine(SearchQueryParser.parse(val).cleanedQuery);
            onQueryChange?.(val);
        }, 300);
        return () => clearTimeout(t);
    }, [val, refine, onQueryChange]);

    const select = (term: string) => {
        setVal(term);
        saveRecentSearch(term);
        setRecents(getRecentSearches());
        refine(SearchQueryParser.parse(term).cleanedQuery);
        onQueryChange?.(term);
    };
    const showRecent = focused && !val && recents.length > 0;
    const matchRecent = focused && val ? recents.filter(s => s.toLowerCase().includes(val.toLowerCase())) : [];

    return (
        <div className="relative w-full">
            <form onSubmit={e => {
                e.preventDefault();
                saveRecentSearch(val);
                refine(SearchQueryParser.parse(val).cleanedQuery);
                onQueryChange?.(val);
            }}>
                <input ref={ref} type="text" value={val}
                    onChange={e => setVal(e.target.value)}
                    onFocus={() => { setRecents(getRecentSearches()); setFocused(true); }}
                    onBlur={() => setTimeout(() => setFocused(false), 150)}
                    placeholder="Buscar listas, lugares, usuarios... (@user, #tag)"
                    className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl py-4 pl-14 pr-10 text-white text-base focus:outline-none focus:border-[var(--lt-accent-border)] focus:bg-white/10 placeholder-gray-500 transition-all"
                />
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                {val && (
                    <button type="button" onClick={() => { setVal(''); refine(''); onQueryChange?.(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </form>
            {(showRecent || matchRecent.length > 0) && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-[var(--lt-card-strong)] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                    {showRecent && recents.map(t => (
                        <button key={t} onMouseDown={() => select(t)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-300 hover:bg-white/5 transition-colors">
                            <Clock className="w-4 h-4 text-gray-600 shrink-0" /><span className="truncate text-sm">{t}</span>
                        </button>
                    ))}
                    {matchRecent.map(t => (
                        <button key={t} onMouseDown={() => select(t)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-300 hover:bg-white/5 transition-colors">
                            <Search className="w-4 h-4 text-gray-600 shrink-0" /><span className="truncate text-sm">{t}</span>
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
        <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-gray-500" />
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="bg-transparent border-0 text-sm focus:outline-none cursor-pointer pr-1 text-gray-400 hover:text-white"
            >
                {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
};

// ─── Active Filters Chips ─────────────────────────────────────────────────────

const ActiveFiltersChips = () => {
    const { items } = useCurrentRefinements();
    const { refine: clearAll, canRefine } = useClearRefinements();
    if (!canRefine || items.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-2 mt-3">
            {items.map(item => item.refinements.map(r => (
                <button key={`${item.attribute}-${r.value}`}
                    onClick={() => item.refine(r)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] rounded-full text-xs text-[var(--lt-accent)] hover:bg-[var(--lt-accent)]/40 transition-colors">
                    <span className="font-semibold text-[var(--lt-accent)]">{FILTER_LABELS[item.attribute] || item.attribute}:</span>
                    {formatFacetLabel(item.attribute, r.label)}
                    <X className="w-3 h-3 ml-0.5" />
                </button>
            )))}
            <button onClick={clearAll} className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-full text-xs text-red-400 hover:bg-red-500/20 transition-colors">
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
        <span className="text-xs text-gray-600">
            {nbHits.toLocaleString('es')} resultado{nbHits !== 1 ? 's' : ''}
            <span className="opacity-50 ml-1">· {processingTimeMS}ms</span>
        </span>
    );
};

// ─── Refinement List ──────────────────────────────────────────────────────────

function formatFacetLabel(attribute: string, label: string) {
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

const CustomRefinementList = ({ attribute, label, icon: Icon, limit = 8, defaultOpen = false, dependsOn }: FilterSectionConfig) => {
    const { items, refine } = useRefinementList({ attribute, limit, showMore: true, showMoreLimit: 24 });
    const { items: currentRefinements } = useCurrentRefinements();
    const [isOpen, setIsOpen] = useState(defaultOpen);
    if (dependsOn && !hasActiveRefinement(currentRefinements, dependsOn)) return null;

    const allowlist = FACET_VALUE_ALLOWLIST[attribute];
    const visibleItems = allowlist
        ? items.filter(item => allowlist.includes(String(item.value)))
        : items;

    if (visibleItems.length === 0) return null;
    const selectedCount = visibleItems.filter(item => item.isRefined).length;

    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
            >
                <span className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--lt-accent)] shrink-0">
                    <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white leading-tight">{label}</span>
                    <span className="block text-[11px] text-gray-500">
                        {selectedCount > 0 ? `${selectedCount} activo${selectedCount > 1 ? 's' : ''}` : `${visibleItems.length} opciones`}
                    </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="px-3.5 pb-3 flex flex-wrap gap-2">
                {visibleItems.map(item => (
                    <button
                        type="button"
                        key={String(item.value)}
                        onClick={() => refine(item.value)}
                        className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                            item.isRefined
                                ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                                : 'bg-white/5 border-white/10 text-gray-300 hover:border-[var(--lt-accent-border)] hover:text-white'
                        }`}
                    >
                        {formatFacetLabel(attribute, item.label)}
                        <span className={item.isRefined ? 'ml-1 text-white/70' : 'ml-1 text-gray-600'}>
                            {item.count}
                        </span>
                    </button>
                ))}
                </div>
            )}
        </section>
    );
};

// ─── Filter Content ───────────────────────────────────────────────────────────

const FilterContent = ({ activeTab }: { activeTab: string }) => {
    const sections = FILTER_SECTIONS[activeTab] || [];
    return (
        <div className="space-y-3">
            {sections.map(section => (
                <CustomRefinementList key={section.attribute} {...section} />
            ))}
        </div>
    );
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState = ({ activeTab, onTabChange }: { activeTab: string; onTabChange?: (t: string) => void }) => {
    const msg = EMPTY_MESSAGES[activeTab] || EMPTY_MESSAGES.all;
    return (
        <div className="text-center py-20 px-4">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-white font-bold mb-1">{msg.title}</h3>
            <p className="text-gray-500 text-sm mb-6">{msg.hint}</p>
            {onTabChange && activeTab !== 'all' && (
                <div className="flex flex-wrap justify-center gap-2">
                    {Object.entries(TAB_LABELS).filter(([k]) => k !== activeTab).map(([k, l]) => (
                        <button key={k} onClick={() => onTabChange(k)}
                            className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm text-gray-400 hover:text-white transition-colors">
                            Buscar en {l}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── User Hit Card ────────────────────────────────────────────────────────────

const UserHitCard = ({ hit, selected, onHover }: { hit: SearchHit; selected: boolean; onHover: (id: string | null) => void }) => {
    const displayName = hit.displayName || hit.username || '?';
    const level = Math.max(1, hit.level || 1);
    return (
        <Link to={`/profile/${hit.objectID}`}
            id={`hit-${hit.objectID}`}
            onMouseEnter={() => onHover(hit.objectID)}
            onMouseLeave={() => onHover(null)}
            className={`block group rounded-2xl p-4 flex items-center gap-3 hover:scale-[1.01] transition-all duration-200 shadow-lg border glass-card ${selected ? 'border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent)]' : 'border-white/5'}`}>
            <img src={hit.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`}
                className="w-14 h-14 rounded-full object-cover border-2 border-white/10 shrink-0" alt={displayName} />
            <div className="min-w-0 flex-1">
                <h3 className="text-white font-bold text-sm group-hover:text-[var(--lt-accent)] transition-colors truncate">{displayName}</h3>
                {hit.username && hit.displayName && hit.username !== hit.displayName && (
                    <p className="text-[var(--lt-accent)]/70 text-xs truncate">@{hit.username}</p>
                )}
                {hit.bio && <p className="text-gray-400 text-xs line-clamp-1 mt-0.5">{hit.bio}</p>}
                <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-gray-500">
                    <span className="flex items-center gap-0.5 rounded-full bg-white/5 border border-white/10 px-2 py-0.5">
                        Nv. {level}
                    </span>
                    <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {hit.followersCount || 0}</span>
                    <span className="flex items-center gap-0.5"><Star className="w-3 h-3" /> {hit.reviewsCount || 0}</span>
                </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-700 shrink-0" />
        </Link>
    );
};

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
}

const CustomHits: React.FC<HitsProps> = ({ activeTab, onTabChange, selectedHitId, onHoverHit, onSelectHit, listLayout = false, noInfiniteScroll = false }) => {
    const { hits, isLastPage, showMore } = useInfiniteHits();
    const sentinelRef = useRef<HTMLDivElement>(null);
    const hover = onHoverHit ?? (() => {});
    const visibleHits = useMemo(() => {
        const typedHits = hits as SearchHit[];
        if (activeTab !== 'places') return typedHits;
        return typedHits.filter(hit => (hit.reviewsCount ?? hit.reviewCount ?? 0) > 0);
    }, [activeTab, hits]);

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
        return <EmptyState activeTab={activeTab} onTabChange={onTabChange} />;
    }

    return (
        <div>
            <div className={listLayout ? 'flex flex-col gap-3' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'}>
                {visibleHits.map(hit => {
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
                            className={`rounded-2xl transition-all duration-200 cursor-pointer ${selected ? 'ring-2 ring-[var(--lt-accent)] ring-offset-2 ring-offset-transparent' : ''}`}
                        >
                            <ListItemCard
                                item={{
                                    id: hit.objectID,
                                    name: hit.name ?? hit.itemName ?? 'Resultado',
                                    photoUrl: hit.thumbnailUrl ?? hit.mainImageUrl ?? hit.photoUrl ?? hit.coverUrl ?? hit.imageUrl,
                                    avgRating: hit.averageRating ?? hit.avgGeneralScore ?? 0,
                                    reviewCount: hit.reviewsCount ?? hit.reviewCount ?? hit.itemCount ?? 0,
                                    placeId: activeTab === 'places' ? hit.objectID : hit.placeId,
                                    placeName: hit.placeName || (activeTab === 'places' ? hit.name : undefined),
                                    placeCity: hit.city || hit.placeCity,
                                    authorName: hit.authorName || hit.ownerName || hit.listOwnerName,
                                    authorPhoto: hit.authorPhoto || hit.ownerPhoto,
                                    listName: hit.listName,
                                    listId: hit.listId,
                                    followersCount: hit.followersCount,
                                    itemCount: hit.itemCount,
                                    tags: (activeTab === 'grouped_items' || activeTab === 'items')
                                        ? [hit.listCategoryName, ...(hit.groupTags || [])].filter((tag): tag is string => Boolean(tag))
                                        : activeTab === 'places' ? getPlaceTypeLabels(hit.types || [], 4)
                                        : [hit.categoryName, ...(hit.availableTags || [])].filter((tag): tag is string => Boolean(tag)),
                                }}
                                isGrid={!listLayout}
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
                <div ref={sentinelRef} className="py-8 flex justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--lt-accent-border)]" />
                </div>
            )}
        </div>
    );
};

// ─── Federated Section ────────────────────────────────────────────────────────

const FedSectionContent = ({ title, type, icon: Icon, onViewAll }: { title: string; type: string; icon: React.ElementType; onViewAll: () => void }) => {
    const { hits } = useInfiniteHits();
    const visibleCount = type === 'places'
        ? (hits as SearchHit[]).filter(hit => (hit.reviewsCount ?? hit.reviewCount ?? 0) > 0).length
        : hits.length;
    if (visibleCount === 0) return null;
    return (
        <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[var(--lt-accent)]" />
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <span className="text-xs text-gray-700">({visibleCount})</span>
                </div>
                <button onClick={onViewAll} className="flex items-center gap-1 text-sm text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">
                    Ver todos <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <CustomHits activeTab={type} noInfiniteScroll />
        </div>
    );
};

const FederatedSection = ({
    indexName,
    title,
    type,
    icon,
    onViewAll,
    filters,
    query,
}: {
    indexName: string;
    title: string;
    type: string;
    icon: React.ElementType;
    onViewAll: () => void;
    filters?: string;
    query?: string;
}) => (
    <Index indexName={indexName}>
        <Configure hitsPerPage={3} filters={filters} query={query} />
        <FedSectionContent title={title} type={type} icon={icon} onViewAll={onViewAll} />
    </Index>
);

// ─── Geo Controls (reutilizable) ──────────────────────────────────────────────

const GeoControls = ({
    isGeoTab, geoActive, geoRadius, locLoading, locError,
    onToggleGeo, onRadiusChange,
}: {
    isGeoTab: boolean;
    geoActive: boolean;
    geoRadius: GeoRadius;
    locLoading: boolean;
    locError: string | null;
    onToggleGeo: () => void;
    onRadiusChange: (v: GeoRadius) => void;
}) => {
    if (!isGeoTab) return null;
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={onToggleGeo}
                disabled={locLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${geoActive ? 'bg-emerald-600/80 border-emerald-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
            >
                {locLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                Cerca de mí
            </button>
            {geoActive && !locError && (
                <select
                    value={geoRadius}
                    onChange={e => onRadiusChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-[var(--lt-card-strong)] border border-white/10 rounded-full px-3 py-1.5 text-xs text-white focus:outline-none"
                >
                    {GEO_RADIUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            )}
            {locError && geoActive && <span className="text-xs text-red-400">{locError}</span>}
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
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition-all active:scale-95 ${
                activeCount > 0
                    ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:border-[var(--lt-accent-border)] hover:text-white'
            }`}
        >
            <SlidersHorizontal className="w-4 h-4" />
            Filtros
            {activeCount > 0 && (
                <span className="min-w-5 h-5 rounded-full bg-white/20 px-1.5 text-[11px] flex items-center justify-center">
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
            className={`shrink-0 flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                isActive
                    ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                    : isAvailable
                        ? 'bg-white/5 border-white/10 text-gray-300 hover:border-[var(--lt-accent-border)] hover:text-white'
                        : 'bg-white/[0.02] border-white/5 text-gray-700 cursor-not-allowed'
            }`}
        >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {item && <span className={isActive ? 'text-white/70' : 'text-gray-600'}>{item.count}</span>}
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
    const showReviewUserTypes = activeTab === 'items' || activeTab === 'grouped_items';
    const showPlaceTypes = activeTab === 'places';

    if (!isGeoTab && !showReviewUserTypes && !showPlaceTypes) return null;

    return (
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {isGeoTab && (
                <button
                    type="button"
                    onClick={onToggleGeo}
                    disabled={locLoading}
                    className={`shrink-0 flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                        geoActive
                            ? 'bg-emerald-600/90 border-emerald-400/50 text-white shadow-lg shadow-emerald-900/30'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:border-emerald-400/40 hover:text-white'
                    }`}
                >
                    {locLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
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
    const typeParam = normalizeSearchTab(searchParams.get('type') || 'all');
    const sortParam = searchParams.get('sort') || '';

    const [sortByTab, setSortByTab] = useState<Record<string, string>>(() => (
        typeParam === 'all' ? {} : { [typeParam]: resolveSortValue(typeParam, sortParam) }
    ));
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [geoActive, setGeoActive] = useState(false);
    const [geoRadius, setGeoRadius] = useState<GeoRadius>(10000);
    const [mapExpanded, setMapExpanded] = useState(false);
    const [selectedHitId, setSelectedHitId] = useState<string | null>(null);
    const [hoveredHitId, setHoveredHitId] = useState<string | null>(null);

    const { location, error: locError, loading: locLoading, requestLocation } = useLocation();
    const activeTab = typeParam;
    const isGeoTab = activeTab === 'places' || activeTab === 'items';
    const activeSortOption = getSortOption(activeTab, sortParam || sortByTab[activeTab]);
    const activeIndexName = activeSortOption?.indexName || INDEX_NAMES.lists;
    const effectiveGeoActive = geoActive || Boolean(activeSortOption?.requiresLocation);

    const handleTabChange = useCallback((tab: string) => {
        const sortValue = resolveSortValue(tab, sortByTab[tab]);
        const nextParams: Record<string, string> = { type: tab };
        if (queryParam) nextParams.q = queryParam;
        if (tab !== 'all' && sortValue !== getDefaultSortValue(tab)) nextParams.sort = sortValue;
        setSearchParams(nextParams);
        // Solo cerrar el mapa si pasamos a una pestaña sin geo (users, lists)
        const newIsGeoTab = tab === 'places' || tab === 'items';
        if (!newIsGeoTab) setMapExpanded(false);
        setSelectedHitId(null);
    }, [queryParam, setSearchParams, sortByTab]);

    const handleSortChange = useCallback((value: string) => {
        const option = getSortOption(activeTab, value);
        setSortByTab(prev => ({ ...prev, [activeTab]: option.value }));
        if (option.requiresLocation) {
            if (!location) requestLocation();
            setGeoActive(true);
        }
        const nextParams: Record<string, string> = { type: activeTab };
        if (queryParam) nextParams.q = queryParam;
        if (option.value !== getDefaultSortValue(activeTab)) nextParams.sort = option.value;
        setSearchParams(nextParams);
        setSelectedHitId(null);
    }, [activeTab, location, queryParam, requestLocation, setSearchParams]);

    const handleQueryChange = useCallback((nextQuery: string) => {
        const nextParams: Record<string, string> = { type: activeTab };
        const trimmedQuery = nextQuery.trim();
        if (trimmedQuery) nextParams.q = trimmedQuery;
        if (activeTab !== 'all' && activeSortOption.value !== getDefaultSortValue(activeTab)) {
            nextParams.sort = activeSortOption.value;
        }
        setSearchParams(nextParams, { replace: true });
    }, [activeSortOption.value, activeTab, setSearchParams]);

    const handleMarkerClick = useCallback((id: string) => {
        setSelectedHitId(prev => prev === id ? null : id);
        const el = document.getElementById(`hit-${id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    const toggleGeo = useCallback(() => {
        if (!geoActive && !location) requestLocation();
        setGeoActive(p => !p);
    }, [geoActive, location, requestLocation]);

    useEffect(() => {
        if (!activeSortOption?.requiresLocation || location) return;
        if (!location) requestLocation();
    }, [activeSortOption?.requiresLocation, location, requestLocation]);

    const parsedQuery = useMemo(() => SearchQueryParser.parse(queryParam), [queryParam]);
    const algoliaFilters = useMemo(() => {
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

    const activeGeoConfig = useMemo(() => {
        if (!isGeoTab || !effectiveGeoActive || !location) {
            return {};
        }
        return {
            aroundLatLng: `${location.latitude},${location.longitude}`,
            aroundRadius: geoRadius === 'all' ? ('all' as const) : geoRadius,
        };
    }, [effectiveGeoActive, geoRadius, isGeoTab, location]);

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
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pt-safe-20 pb-20">
            <InstantSearch
                searchClient={algoliaClient}
                indexName={INDEX_NAMES.lists}
                future={{ preserveSharedStateOnUnmount: true }}
            >
                {/* ── Header: search + tabs ────────────────────────────────── */}
                <div className="px-4 lg:px-8 mb-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex-1"><CustomSearchBox rawQuery={queryParam} onQueryChange={handleQueryChange} /></div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
                        <button onClick={() => handleTabChange('all')}
                            className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'all' ? 'bg-[var(--lt-accent)] text-white shadow-lg' : 'text-gray-400 hover:text-white bg-white/5 border border-white/10'}`}>
                            <Search className="w-4 h-4" /> Todo
                        </button>
                        {Object.keys(INDEX_NAMES).map(key => {
                            const Icon = TAB_ICONS[key] || Search;
                            return (
                                <button key={key} onClick={() => handleTabChange(key)}
                                    className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === key ? 'bg-[var(--lt-accent)] text-white shadow-lg' : 'text-gray-400 hover:text-white bg-white/5 border border-white/10'}`}>
                                    <Icon className="w-4 h-4" /> {TAB_LABELS[key] || key}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Federated: "Todo" ─────────────────────────────────────── */}
                {activeTab === 'all' ? (
                    <div className="px-4 lg:px-8">
                        <FederatedSection indexName={INDEX_NAMES.lists} title="Listas" type="lists" icon={ListIcon} query={parsedQuery.cleanedQuery} onViewAll={() => handleTabChange('lists')} />
                        <FederatedSection indexName={INDEX_NAMES.places} title="Lugares" type="places" icon={MapIcon} query={parsedQuery.cleanedQuery} onViewAll={() => handleTabChange('places')} />
                        <FederatedSection indexName={INDEX_NAMES.users} title="Usuarios" type="users" icon={Users} query={parsedQuery.cleanedQuery} onViewAll={() => handleTabChange('users')} />
                        <FederatedSection indexName={INDEX_NAMES.items} title="Items" type="grouped_items" icon={MessageCircle} query={parsedQuery.cleanedQuery} onViewAll={() => handleTabChange('items')} />
                    </div>
                ) : (
                    <Index indexName={activeIndexName}>
                        <Configure
                            query={parsedQuery.cleanedQuery}
                            filters={algoliaFilters}
                            hitsPerPage={20}
                            {...activeGeoConfig}
                        />

                        {/* ── Mobile filter modal ───────────────────────────── */}
                        {mobileFiltersOpen && (
                            <div className="fixed inset-0 z-[2000] lg:hidden">
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
                                <div className="absolute inset-x-0 bottom-0 max-h-[82dvh] rounded-t-3xl bg-[var(--lt-card-strong)] border-t border-white/10 shadow-2xl overflow-hidden animate-slide-up-modal">
                                    <div className="px-5 pt-3 pb-4 border-b border-white/10 bg-white/[0.03]">
                                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h3 className="text-white font-bold flex items-center gap-2">
                                                    <SlidersHorizontal className="w-4 h-4 text-[var(--lt-accent)]" />
                                                    Filtros
                                                </h3>
                                                <p className="text-xs text-gray-500 mt-0.5">Afina la búsqueda sin salir de la lista.</p>
                                            </div>
                                            <button onClick={() => setMobileFiltersOpen(false)} className="p-2 rounded-full bg-white/5 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                    <div className="p-4 overflow-y-auto max-h-[calc(82dvh-88px)]">
                                        <FilterContent activeTab={activeTab} />
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
                                    <div className="glass-card rounded-2xl border border-white/10 p-4 overflow-y-auto flex-1 min-h-0">
                                        <h3 className="text-white font-bold text-sm mb-1 flex items-center gap-2">
                                            <SlidersHorizontal className="w-4 h-4 text-[var(--lt-accent)]" />
                                            Filtros
                                        </h3>
                                        <p className="text-xs text-gray-500 mb-4">Combina tipo, ciudad y autor.</p>
                                        <FilterContent activeTab={activeTab} />
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
                                    <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                                        <GeoControls
                                            isGeoTab={isGeoTab}
                                            geoActive={effectiveGeoActive}
                                            geoRadius={geoRadius}
                                            locLoading={locLoading}
                                            locError={locError}
                                            onToggleGeo={toggleGeo}
                                            onRadiusChange={setGeoRadius}
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
                                    <div className="glass-card rounded-2xl border border-white/10 p-4 overflow-y-auto flex-1 min-h-0">
                                        <h3 className="text-white font-bold text-sm mb-1 flex items-center gap-2">
                                            <SlidersHorizontal className="w-4 h-4 text-[var(--lt-accent)]" />
                                            Filtros
                                        </h3>
                                        <p className="text-xs text-gray-500 mb-4">Combina varias señales.</p>
                                        <FilterContent activeTab={activeTab} />
                                    </div>
                                </div>
                            </aside>

                            {/* MAIN CONTENT */}
                            <div className="flex-1 min-w-0">
                                <QuickFilters
                                    activeTab={activeTab}
                                    isGeoTab={isGeoTab}
                                    geoActive={effectiveGeoActive}
                                    locLoading={locLoading}
                                    onToggleGeo={toggleGeo}
                                />

                                {/* Controls bar */}
                                <div className="flex flex-wrap items-center gap-3 mb-3 mt-3">
                                    {/* Mobile: filtros + mapa */}
                                    <div className="flex items-center gap-2 lg:hidden">
                                        <FilterTrigger onClick={() => setMobileFiltersOpen(true)} />
                                        {isGeoTab && (
                                            <button
                                                onClick={() => setMapExpanded(p => !p)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${mapExpanded ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-accent)]' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                                                <MapIcon className="w-4 h-4" /> Mapa
                                            </button>
                                        )}
                                    </div>

                                    {/* Geo: cerca de mí */}
                                    <GeoControls
                                        isGeoTab={isGeoTab}
                                        geoActive={effectiveGeoActive}
                                        geoRadius={geoRadius}
                                        locLoading={locLoading}
                                        locError={locError}
                                        onToggleGeo={toggleGeo}
                                        onRadiusChange={setGeoRadius}
                                    />

                                    {/* Ordenar + Contador */}
                                    <div className="ml-auto flex items-center gap-4">
                                        <ResultsCount />
                                        <SortControl activeTab={activeTab} value={activeSortOption.value} onChange={handleSortChange} />
                                    </div>
                                </div>

                                {/* Filtros activos */}
                                <ActiveFiltersChips />

                                {/* ── Mapa expandido (mobile) ───────────────── */}
                                {isGeoTab && mapExpanded && (
                                    <div className="mb-6 h-[65vh] min-h-[400px]">
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
