import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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
import {
    Search, Map as MapIcon, Users, List as ListIcon, MessageCircle,
    Filter, X, Clock, ChevronRight, Star, LocateFixed, Loader2
} from 'lucide-react';

import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import { SearchQueryParser } from '../services/SearchQueryParser';
import { ListItemCard } from '../components/ListItemCard';
import { useLocation } from '../hooks/useLocation';

const RECENT_SEARCHES_KEY = 'listopic_recent_searches';

const TAB_LABELS: Record<string, string> = {
    lists: 'Listas',
    places: 'Lugares',
    users: 'Usuarios',
    items: 'Items',
};

const FILTER_LABELS: Record<string, string> = {
    availableTags: 'Etiqueta',
    categories: 'Categoría',
    city: 'Ciudad',
    types: 'Tipo',
    priceLevel: 'Precio',
    serviceOptions: 'Servicio',
    accessibilityOptions: 'Accesibilidad',
    userType: 'Tipo usuario',
    badges: 'Insignia',
    placeCity: 'Ciudad',
    listName: 'Lista',
    groupTags: 'Etiqueta',
    residence: 'Residencia',
};

const EMPTY_STATE_MESSAGES: Record<string, { title: string; hint: string }> = {
    lists: { title: 'No se encontraron listas', hint: 'Prueba a buscar por nombre, etiqueta o categoría.' },
    places: { title: 'No se encontraron lugares', hint: 'Prueba otra ciudad o tipo de lugar.' },
    users: { title: 'No se encontraron usuarios', hint: 'Busca por nombre de usuario o prueba @nombre.' },
    items: { title: 'No se encontraron items', hint: 'Prueba con #etiqueta o busca directamente el nombre del plato.' },
    grouped_items: { title: 'No se encontraron items', hint: 'Prueba con #etiqueta o busca directamente el nombre del plato.' },
    all: { title: 'Sin resultados', hint: 'Prueba con otras palabras o cambia los filtros.' },
};

const getRecentSearches = (): string[] => {
    try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]'); }
    catch { return []; }
};

const saveRecentSearch = (term: string): void => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    const current = getRecentSearches().filter(s => s !== trimmed);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([trimmed, ...current].slice(0, 5)));
};

// --- Custom Search Box ---
const CustomSearchBox = (props: Record<string, unknown>) => {
    const { query, refine } = useSearchBox(props);
    const [inputValue, setInputValue] = useState(query);
    const inputRef = useRef<HTMLInputElement>(null);
    const [focused, setFocused] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    useEffect(() => {
        if (query !== inputValue) setInputValue(query);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (inputValue !== query) refine(inputValue);
        }, 300);
        return () => clearTimeout(timer);
    }, [inputValue, refine, query]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value);

    const handleFocus = () => {
        setRecentSearches(getRecentSearches());
        setFocused(true);
    };

    const handleBlur = () => setTimeout(() => setFocused(false), 150);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveRecentSearch(inputValue);
        setRecentSearches(getRecentSearches());
        refine(inputValue);
    };

    const selectSuggestion = (term: string) => {
        setInputValue(term);
        saveRecentSearch(term);
        setRecentSearches(getRecentSearches());
        refine(term);
    };

    const showRecent = focused && recentSearches.length > 0 && !inputValue;
    const matchingRecent = focused && inputValue.length > 0
        ? recentSearches.filter(s => s.toLowerCase().includes(inputValue.toLowerCase()))
        : [];

    return (
        <div className="relative max-w-2xl mx-auto">
            <form onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="Buscar listas, lugares, usuarios... (@user, #tag)"
                    className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-full py-4 pl-14 pr-6 text-white text-lg focus:outline-none focus:border-indigo-500 focus:bg-white/10 shadow-2xl placeholder-gray-400 transition-all hover:bg-white/10"
                />
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                {inputValue && (
                    <button type="button" onClick={() => { setInputValue(''); refine(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                )}
            </form>
            {(showRecent || matchingRecent.length > 0) && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-[#151b2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                    {showRecent && (
                        <>
                            <p className="px-4 pt-3 pb-1 text-xs text-gray-500 uppercase tracking-wider font-semibold">Búsquedas recientes</p>
                            {recentSearches.map((term) => (
                                <button key={term} onMouseDown={() => selectSuggestion(term)}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                                    <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                    <span className="truncate">{term}</span>
                                </button>
                            ))}
                        </>
                    )}
                    {matchingRecent.length > 0 && (
                        <>
                            <p className="px-4 pt-3 pb-1 text-xs text-gray-500 uppercase tracking-wider font-semibold">Sugerencias</p>
                            {matchingRecent.map((term) => (
                                <button key={term} onMouseDown={() => selectSuggestion(term)}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                                    <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                    <span className="truncate">{term}</span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Active Filters Chips ---
const ActiveFiltersChips = () => {
    const { items } = useCurrentRefinements();
    const { refine: clearAll, canRefine } = useClearRefinements();

    if (!canRefine || items.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Filtros:</span>
            {items.map(item =>
                item.refinements.map(refinement => (
                    <button
                        key={`${item.attribute}-${refinement.value}`}
                        onClick={() => item.refine(refinement)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/20 border border-indigo-500/30 rounded-full text-xs text-indigo-300 hover:bg-indigo-600/40 transition-colors"
                    >
                        <span className="text-indigo-500 font-semibold">
                            {FILTER_LABELS[item.attribute] || item.attribute}:
                        </span>
                        {refinement.label}
                        <X className="w-3 h-3 text-indigo-400 ml-0.5" />
                    </button>
                ))
            )}
            <button
                onClick={clearAll}
                className="flex items-center gap-1 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
                Limpiar todo <X className="w-3 h-3" />
            </button>
        </div>
    );
};

// --- Empty State ---
const EmptyState = ({ activeTab, onTabChange }: { activeTab: string; onTabChange?: (tab: string) => void }) => {
    const msg = EMPTY_STATE_MESSAGES[activeTab] || EMPTY_STATE_MESSAGES.all;
    return (
        <div className="text-center py-16 px-4">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-white font-bold text-lg mb-1">{msg.title}</h3>
            <p className="text-gray-500 text-sm mb-6">{msg.hint}</p>
            {onTabChange && activeTab !== 'all' && (
                <div className="flex flex-wrap justify-center gap-2">
                    {Object.entries(TAB_LABELS)
                        .filter(([key]) => key !== activeTab)
                        .map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => onTabChange(key)}
                                className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                Buscar en {label}
                            </button>
                        ))}
                </div>
            )}
        </div>
    );
};

// --- User Hit Card ---
const UserHitCard = ({ hit }: { hit: any }) => (
    <Link to={`/profile/${hit.objectID}`} className="block group">
        <div className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:scale-[1.02] transition-all duration-300 shadow-lg border border-white/5">
            <div className="relative shrink-0">
                <img
                    src={hit.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(hit.username || '?')}&background=6366f1&color=fff`}
                    className="w-16 h-16 rounded-full object-cover border-2 border-white/10"
                    alt={hit.username}
                />
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="text-white font-bold text-base group-hover:text-indigo-400 transition-colors truncate">
                    {hit.username}
                </h3>
                {hit.bio && <p className="text-gray-400 text-sm line-clamp-1 mt-0.5">{hit.bio}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {hit.followersCount || 0} seg.
                    </span>
                    {(hit.reviewsCount || 0) > 0 && (
                        <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" /> {hit.reviewsCount} reseñas
                        </span>
                    )}
                </div>
                {hit.badges && hit.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {(hit.badges as string[]).slice(0, 3).map((badge: string) => (
                            <span key={badge} className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded text-[10px] font-bold">
                                {badge}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
        </div>
    </Link>
);

// --- Custom Hits ---
const CustomHits = ({ activeTab, onTabChange }: { activeTab: string; onTabChange?: (tab: string) => void }) => {
    const { hits, isLastPage, showMore } = useInfiniteHits();
    const loadMoreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting && !isLastPage) showMore(); },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [isLastPage, showMore]);

    if (hits.length === 0) {
        if (activeTab === 'all') return null;
        return <EmptyState activeTab={activeTab} onTabChange={onTabChange} />;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(hits as any[]).map((hit: any) => (
                    <div key={hit.objectID}>
                        {activeTab === 'users' ? (
                            <UserHitCard hit={hit} />
                        ) : activeTab === 'places' ? (
                            <ListItemCard
                                item={{
                                    id: hit.objectID,
                                    name: hit.name || hit.itemName,
                                    photoUrl: hit.mainImageUrl || hit.photoUrl || hit.thumbnailUrl,
                                    avgRating: hit.averageRating || hit.avgScore || 0,
                                    reviewCount: hit.reviewsCount || hit.reviewCount || 0,
                                    placeId: hit.objectID,
                                    placeName: hit.name,
                                    placeCity: hit.city || hit.placeCity,
                                    tags: hit.types || [],
                                }}
                                isGrid={true}
                                groupingMode="place"
                            />
                        ) : (
                            <ListItemCard
                                item={{
                                    id: hit.objectID,
                                    name: hit.name || hit.itemName,
                                    photoUrl: hit.mainImageUrl || hit.photoUrl || hit.thumbnailUrl,
                                    avgRating: hit.averageRating || hit.avgGeneralScore || hit.avgScore || 0,
                                    reviewCount: hit.reviewCount || hit.itemCount || 0,
                                    placeId: hit.placeId,
                                    placeName: hit.placeName,
                                    placeCity: hit.placeCity || hit.city,
                                    authorName: hit.authorName || hit.ownerName || hit.listOwnerName,
                                    authorPhoto: hit.authorPhoto || hit.ownerPhoto,
                                    listName: hit.listName,
                                    listId: hit.listId,
                                    followersCount: hit.followersCount,
                                    itemCount: hit.itemCount,
                                    tags: (activeTab === 'grouped_items' || activeTab === 'items')
                                        ? (hit.groupTags || [])
                                        : (hit.availableTags || []),
                                }}
                                isGrid={true}
                                groupingMode={
                                    activeTab === 'lists' ? 'list' :
                                        (activeTab === 'grouped_items' || activeTab === 'items') ? 'dish' :
                                            'place'
                                }
                            />
                        )}
                    </div>
                ))}
            </div>
            {!isLastPage && (
                <div ref={loadMoreRef} className="py-6 flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
                </div>
            )}
        </div>
    );
};

// --- Federated Section ---
const FederatedSectionContent = ({
    title, type, icon: Icon, onViewAll
}: {
    title: string; type: string; icon: React.ElementType; onViewAll: () => void;
}) => {
    const { hits } = useInfiniteHits();
    if (hits.length === 0) return null;

    return (
        <div className="mb-10">
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <span className="text-xs text-gray-600 font-medium">({hits.length})</span>
                </div>
                <button
                    onClick={onViewAll}
                    className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                >
                    Ver todos <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <CustomHits activeTab={type} />
        </div>
    );
};

const FederatedSection = ({
    indexName, title, type, icon, onViewAll
}: {
    indexName: string; title: string; type: string; icon: React.ElementType; onViewAll: () => void;
}) => (
    <Index indexName={indexName}>
        <Configure hitsPerPage={3} />
        <FederatedSectionContent title={title} type={type} icon={icon} onViewAll={onViewAll} />
    </Index>
);

// --- Results Count ---
const ResultsCount = () => {
    const { nbHits, processingTimeMS } = useStats();
    if (nbHits === 0) return null;
    return (
        <p className="text-xs text-gray-600 mb-3">
            {nbHits.toLocaleString('es')} resultado{nbHits !== 1 ? 's' : ''}
            <span className="ml-1 opacity-60">· {processingTimeMS}ms</span>
        </p>
    );
};

// --- Geo Search Bar ---
const GEO_RADIUS_OPTIONS = [
    { value: 2000, label: '2 km' },
    { value: 5000, label: '5 km' },
    { value: 10000, label: '10 km' },
    { value: 20000, label: '20 km' },
    { value: 50000, label: '50 km' },
];

const GeoSearchBar = ({
    active, onToggle, radius, onRadiusChange, locationLoading, locationError
}: {
    active: boolean;
    onToggle: () => void;
    radius: number;
    onRadiusChange: (r: number) => void;
    locationLoading: boolean;
    locationError: string | null;
}) => (
    <div className="flex items-center gap-2 flex-wrap mb-4">
        <button
            onClick={onToggle}
            disabled={locationLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                active
                    ? 'bg-emerald-600/80 border-emerald-500/60 text-white shadow-lg shadow-emerald-900/20'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
        >
            {locationLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <LocateFixed className="w-4 h-4" />
            }
            Cerca de mí
        </button>
        {active && !locationError && (
            <select
                value={radius}
                onChange={e => onRadiusChange(Number(e.target.value))}
                className="bg-[#151b2e] border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
                {GEO_RADIUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        )}
        {locationError && active && (
            <span className="text-xs text-red-400 flex items-center gap-1">
                <X className="w-3 h-3" /> {locationError}
            </span>
        )}
    </div>
);

// --- Custom Refinement List ---
const CustomRefinementList = (props: Record<string, unknown> & { attribute: string; label: string }) => {
    const { items, refine } = useRefinementList(props);
    if (items.length === 0) return null;

    return (
        <div className="mb-6">
            <h4 className="text-white font-bold mb-3 uppercase text-xs tracking-wider">{props.label}</h4>
            <div className="space-y-2">
                {items.map((item) => (
                    <label key={item.label} className="flex items-center gap-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={item.isRefined}
                            onChange={() => refine(item.value)}
                            className="w-4 h-4 rounded border-white/20 bg-black/30 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-transparent backdrop-blur-sm transition-colors"
                        />
                        <span className={`text-sm ${item.isRefined ? 'text-indigo-400 font-bold' : 'text-gray-400 group-hover:text-gray-300'}`}>
                            {item.label} <span className="text-gray-600 ml-1">({item.count})</span>
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
};


export const SearchPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const queryParam = searchParams.get('q') || '';
    const typeParam = searchParams.get('type') || 'all';

    const [activeTab, setActiveTab] = useState(typeParam);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [geoSearchActive, setGeoSearchActive] = useState(false);
    const [geoRadius, setGeoRadius] = useState(10000);

    const { location, error: locationError, loading: locationLoading, requestLocation } = useLocation();
    const isGeoTab = activeTab === 'places' || activeTab === 'items';

    const handleGeoToggle = () => {
        if (!geoSearchActive && !location) requestLocation();
        setGeoSearchActive(prev => !prev);
    };

    const parsedQuery = useMemo(() => SearchQueryParser.parse(queryParam), [queryParam]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchParams({ q: queryParam, type: tab });
    };

    const algoliaFilters = useMemo(() => {
        const parts: string[] = [];
        Object.entries(parsedQuery.filters).forEach(([key, values]) => {
            let fieldName = key;
            if (activeTab === 'places') {
                if (key === 'service') fieldName = 'serviceOptions';
                if (key === 'price') fieldName = 'priceLevel';
            }
            if (activeTab === 'grouped_items' || activeTab === 'items') {
                if (key === 'city') fieldName = 'placeCity';
            }
            const group = values.map(v => `${fieldName}:"${v}"`).join(' OR ');
            if (group) parts.push(`(${group})`);
        });
        return parts.join(' AND ');
    }, [parsedQuery, activeTab]);

    const TAB_ICONS: Record<string, React.ElementType> = {
        lists: ListIcon,
        places: MapIcon,
        users: Users,
        items: MessageCircle,
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20 pt-24 px-4">
            <InstantSearch
                searchClient={algoliaClient}
                indexName={INDEX_NAMES.lists}
                future={{ preserveSharedStateOnUnmount: true }}
            >
                <Configure
                    query={parsedQuery.cleanedQuery}
                    filters={activeTab === 'all' ? '' : algoliaFilters}
                    hitsPerPage={20}
                />

                {/* Hero Search */}
                <div className="max-w-4xl mx-auto mb-8 text-center">
                    <h1 className="text-3xl font-display font-bold text-white mb-6">
                        Explora todo en <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Listopic</span>
                    </h1>
                    <CustomSearchBox />
                </div>

                {/* Tabs */}
                <div className="flex justify-center mb-8">
                    <div className="inline-flex items-center bg-white/5 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-inner overflow-x-auto max-w-[90vw] gap-1 hide-scrollbar">
                        <button
                            onClick={() => handleTabChange('all')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Search className="w-4 h-4" /> Todo
                        </button>
                        {Object.keys(INDEX_NAMES).map(key => {
                            const Icon = TAB_ICONS[key] || Search;
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleTabChange(key)}
                                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === key ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {TAB_LABELS[key] || key}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content */}
                {activeTab === 'all' ? (
                    <div className="container mx-auto max-w-7xl">
                        <FederatedSection indexName={INDEX_NAMES.lists} title="Listas" type="lists" icon={ListIcon} onViewAll={() => handleTabChange('lists')} />
                        <FederatedSection indexName={INDEX_NAMES.places} title="Lugares" type="places" icon={MapIcon} onViewAll={() => handleTabChange('places')} />
                        <FederatedSection indexName={INDEX_NAMES.users} title="Usuarios" type="users" icon={Users} onViewAll={() => handleTabChange('users')} />
                        <FederatedSection indexName={INDEX_NAMES.items} title="Items" type="grouped_items" icon={MessageCircle} onViewAll={() => handleTabChange('items')} />
                    </div>
                ) : (
                    <Index indexName={INDEX_NAMES[activeTab as keyof typeof INDEX_NAMES]}>
                        {isGeoTab && geoSearchActive && location && (
                            <Configure
                                aroundLatLng={`${location.latitude},${location.longitude}`}
                                aroundRadius={geoRadius}
                            />
                        )}
                        <div className="container mx-auto max-w-7xl flex flex-col lg:flex-row gap-8">
                            {/* Filters Sidebar */}
                            <div className={`lg:w-64 flex-shrink-0 ${isFiltersOpen ? 'block' : 'hidden lg:block'}`}>
                                <div className="glass-card rounded-2xl border border-white/10 p-5 sticky top-24 shadow-xl">
                                    <div className="flex justify-between items-center mb-4 lg:hidden">
                                        <h3 className="text-white font-bold">Filtros</h3>
                                        <button onClick={() => setIsFiltersOpen(false)}><X className="text-white" /></button>
                                    </div>

                                    {activeTab === 'lists' && (
                                        <>
                                            <CustomRefinementList attribute="availableTags" label="Etiquetas" />
                                            <CustomRefinementList attribute="categories" label="Categoría" />
                                        </>
                                    )}
                                    {activeTab === 'places' && (
                                        <>
                                            <CustomRefinementList attribute="city" label="Ciudad" />
                                            <CustomRefinementList attribute="types" label="Tipo" />
                                            <CustomRefinementList attribute="priceLevel" label="Precio" />
                                            <CustomRefinementList attribute="serviceOptions" label="Servicios" />
                                            <CustomRefinementList attribute="accessibilityOptions" label="Accesibilidad" />
                                        </>
                                    )}
                                    {activeTab === 'users' && (
                                        <>
                                            <CustomRefinementList attribute="userType" label="Tipo de usuario" />
                                            <CustomRefinementList attribute="badges" label="Insignias" />
                                            <CustomRefinementList attribute="residence" label="Ciudad" />
                                        </>
                                    )}
                                    {(activeTab === 'grouped_items' || activeTab === 'items') && (
                                        <>
                                            <CustomRefinementList attribute="placeCity" label="Ciudad" />
                                            <CustomRefinementList attribute="listName" label="Lista" />
                                            <CustomRefinementList attribute="groupTags" label="Etiquetas" />
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Results Area */}
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-4 lg:hidden">
                                    <button
                                        onClick={() => setIsFiltersOpen(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-[#151b2e] border border-white/10 rounded-lg text-white font-bold text-sm"
                                    >
                                        <Filter className="w-4 h-4" /> Filtros
                                    </button>
                                </div>

                                {isGeoTab && (
                                    <GeoSearchBar
                                        active={geoSearchActive}
                                        onToggle={handleGeoToggle}
                                        radius={geoRadius}
                                        onRadiusChange={setGeoRadius}
                                        locationLoading={locationLoading}
                                        locationError={locationError}
                                    />
                                )}
                                <ActiveFiltersChips />
                                <ResultsCount />
                                <CustomHits activeTab={activeTab} onTabChange={handleTabChange} />
                            </div>
                        </div>
                    </Index>
                )}

            </InstantSearch>
        </div>
    );
};
