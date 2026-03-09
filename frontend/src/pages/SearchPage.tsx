import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
    InstantSearch,
    Configure,
    useSearchBox,
    useInfiniteHits,
    useRefinementList,
    Index
} from 'react-instantsearch';
import { Search, Map as MapIcon, Users, List as ListIcon, MessageCircle, Filter, X } from 'lucide-react';

import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import { SearchQueryParser } from '../services/SearchQueryParser';
import { ListItemCard } from '../components/ListItemCard';
// Note: You might need to import/create specific card adapters if the data shape differs significantly.

// --- Custom Search Box (Real-time) ---
const CustomSearchBox = (props: Record<string, unknown>) => {
    const { query, refine } = useSearchBox(props);
    const [inputValue, setInputValue] = useState(query);

    // Sync local input if query changes externally
    useEffect(() => {
        if (query !== inputValue) {
            setInputValue(query);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    // Debounced Refinement
    useEffect(() => {
        const timer = setTimeout(() => {
            if (inputValue !== query) {
                refine(inputValue);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [inputValue, refine, query]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        refine(inputValue);
    };

    return (
        <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
            <input
                type="text"
                value={inputValue}
                onChange={handleChange}
                placeholder="Buscar listas, usuarios, trastiendas (@user, #tag)..."
                className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-full py-4 pl-14 pr-6 text-white text-lg focus:outline-none focus:border-indigo-500 focus:bg-white/10 shadow-2xl placeholder-gray-400 transition-all hover:bg-white/10"
            />
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
            {inputValue && (
                <button type="button" onClick={() => { setInputValue(''); refine(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                    <X className="w-5 h-5" />
                </button>
            )}
        </form>
    );
};

// --- Custom Hits ---
const CustomHits = ({ activeTab }: { activeTab: string }) => {

    // Note: useInfiniteHits doesn't support 'limit' directly in the hook, 
    // but the parent <Configure hitsPerPage={limit} /> handles it.
    const { hits, isLastPage, showMore } = useInfiniteHits();

    // Filter Items by Image Requirement
    const filteredHits = useMemo(() => {
        if (activeTab === 'grouped_items' || activeTab === 'items') {
            return hits.filter((hit: any) =>
                hit.mainImageUrl || hit.photoUrl || hit.thumbnailUrl || hit.image || hit.coverImage || (hit.photos && hit.photos[0]) || hit.picture
            );
        }
        return hits;
    }, [hits, activeTab]);

    if (filteredHits.length === 0) {
        // For specific tabs, show "No results". For Federated (handled by parent logic typically, but here we can return null if we want strict emptiness)
        // If this is used inside FederatedSectionContent, returning null/message is handled there?
        // No, current logic returns message.
        if (activeTab === 'all') return null; // Should be handled by parent, but safe here.
        return (
            <div className="text-center py-10 text-gray-500">
                No se encontraron resultados en esta categoría.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(filteredHits as any[]).map((hit: any) => {
                    // Removed Console Log
                    return (
                        <div key={hit.objectID}>
                            {activeTab === 'users' ? (
                                // User Card Adapter
                                <Link to={`/profile/${hit.objectID}`} className="block group">
                                    <div className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:scale-105 transition-all duration-300 shadow-lg border border-white/5">
                                        <img src={hit.photoUrl || `https://ui-avatars.com/api/?name=${hit.username}`} className="w-16 h-16 rounded-full object-cover" />
                                        <div>
                                            <h3 className="text-white font-bold text-lg group-hover:text-indigo-400 transition-colors">{hit.username}</h3>
                                            {hit.bio && <p className="text-gray-400 text-sm line-clamp-1">{hit.bio}</p>}
                                            <div className="flex gap-2 mt-1 text-xs text-gray-500">
                                                <span>{hit.followersCount} seguidores</span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ) : activeTab === 'places' ? (
                                // Place Card Adapter - NOW USING RICH LISTITEMCARD
                                <ListItemCard
                                    item={{
                                        id: hit.objectID,
                                        name: hit.name || hit.itemName,
                                        photoUrl: hit.mainImageUrl || hit.photoUrl || hit.thumbnailUrl || hit.image || hit.coverImage || (hit.photos && hit.photos[0]) || hit.picture,
                                        avgRating: hit.averageRating || hit.avgScore || 0,
                                        reviewCount: hit.reviewCount || hit.itemCount || hit.userRatingsTotal || 0,
                                        placeId: hit.objectID, // For places, the ID is the placeID
                                        placeName: hit.name,
                                        placeCity: hit.city || hit.placeCity,
                                        // description: hit.description,
                                        // No specific author for places usually
                                    }}
                                    isGrid={true}
                                    groupingMode="place"
                                />
                            ) : (
                                // Generic/List Item Adapter
                                <ListItemCard
                                    item={{
                                        id: hit.objectID,
                                        name: hit.name || hit.itemName,
                                        photoUrl: hit.mainImageUrl || hit.photoUrl || hit.thumbnailUrl || hit.image || hit.coverImage || (hit.photos && hit.photos[0]) || hit.picture,
                                        avgRating: hit.averageRating || hit.avgScore || 0,
                                        reviewCount: hit.reviewCount || hit.itemCount || 0,
                                        placeId: hit.placeId, // For items
                                        placeName: hit.placeName, // For items
                                        placeCity: hit.placeCity || hit.city, // For items
                                        // description: hit.description,
                                        authorName: hit.authorName || hit.ownerName, // For lists
                                        authorPhoto: hit.authorPhoto || hit.ownerPhoto,
                                        listName: hit.listName, // For items
                                        listId: hit.listId, // For items (needed for link)
                                        followersCount: hit.followersCount, // For lists
                                        itemCount: hit.itemCount // For lists
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
                    );
                })}
            </div>
            {!isLastPage && (
                <div className="flex justify-center mt-8">
                    <button onClick={showMore} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold transition-colors">
                        Ver más
                    </button>
                </div>
            )}
        </div>
    );
};

// --- Federated Section Content ---
// Separated to access useHits/useInfiniteHits context
const FederatedSectionContent = ({ title, type, icon: Icon }: { title: string; type: string; icon: React.ElementType }) => {
    const { hits } = useInfiniteHits();

    // Check if there are any hits AFTER filtering rules (e.g. images for items)
    // We replicate the filter logic here or ensure CustomHits handles empty return gracefully.
    // If CustomHits returns null/empty when filteredHits is 0, we can just check hits length here?
    // WARNING: useInfiniteHits gives raw hits. If we suppress items without images in UI but they exist in hits,
    // we might render a header with empty content if ALL hits are image-less.
    // Let's apply valid hits check.

    const validHits = type === 'grouped_items'
        ? hits.filter((h: any) => h.mainImageUrl || h.photoUrl || h.thumbnailUrl || h.image || h.coverImage || (h.photos && h.photos[0]) || h.picture)
        : hits;

    if (validHits.length === 0) return null;

    return (
        <div className="mb-8">
            <div className="flex items-center gap-2 mb-4 px-1">
                <Icon className="w-5 h-5 text-indigo-400" />
                <h3 className="text-xl font-bold text-white">{title}</h3>
            </div>
            <CustomHits activeTab={type} />
            <div className="mt-4 text-center lg:text-left">
                {/* Link to tab could go here */}
            </div>
        </div>
    );
};


const FederatedSection = ({ indexName, title, type, icon: Icon }: { indexName: string; title: string; type: string; icon: React.ElementType }) => {
    return (
        <Index indexName={indexName}>
            <Configure hitsPerPage={3} />
            <FederatedSectionContent title={title} type={type} icon={Icon} />
        </Index>
    );
};

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

    // URL Params
    const queryParam = searchParams.get('q') || '';
    const typeParam = searchParams.get('type') || 'all'; // Default to 'all' now

    // Internal State
    const [activeTab, setActiveTab] = useState(typeParam);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);

    // Parse Query using Smart Parser
    const parsedQuery = useMemo(() => SearchQueryParser.parse(queryParam), [queryParam]);

    // Handle Tab Change
    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchParams({ q: queryParam, type: tab });
    };

    // Construct Filters string for Algolia
    // e.g. "city:Madrid AND priceLevel:2"
    const algoliaFilters = useMemo(() => {
        const parts: string[] = [];

        // Add User Filters from Smart Query
        Object.entries(parsedQuery.filters).forEach(([key, values]) => {
            let fieldName = key;
            // Basic mappings...
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

        if (activeTab === 'lists') {
            // parts.push('isPublic:true'); 
        }

        return parts.join(' AND ');
    }, [parsedQuery, activeTab]);


    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20 pt-24 px-4">

            <InstantSearch
                searchClient={algoliaClient}
                indexName={INDEX_NAMES.lists} // Primary index for 'all' or 'lists', usually lists is fine as base
                future={{ preserveSharedStateOnUnmount: true }}
            >
                {/* Global Configuration for the Main Index (or shared query) */}
                <Configure
                    query={parsedQuery.cleanedQuery}
                    filters={activeTab === 'all' ? '' : algoliaFilters} // Only apply specific filters on tabs for now, or careful handling
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
                            className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap capitalize ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            <Search className="w-4 h-4" /> Todo
                        </button>
                        {Object.keys(INDEX_NAMES).map(key => (
                            <button
                                key={key}
                                onClick={() => handleTabChange(key)}
                                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap capitalize ${activeTab === key ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {key === 'lists' && <ListIcon className="w-4 h-4" />}
                                {key === 'places' && <MapIcon className="w-4 h-4" />}
                                {key === 'users' && <Users className="w-4 h-4" />}
                                {key === 'grouped_items' && <MessageCircle className="w-4 h-4" />}
                                {key === 'items' ? 'Items' : key}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                {activeTab === 'all' ? (
                    // --- View: ALL (Federated) ---
                    <div className="container mx-auto max-w-7xl">
                        <FederatedSection indexName={INDEX_NAMES.lists} title="Listas Recomendadas" type="lists" icon={ListIcon} />
                        <FederatedSection indexName={INDEX_NAMES.places} title="Lugares" type="places" icon={MapIcon} />
                        <FederatedSection indexName={INDEX_NAMES.users} title="Usuarios" type="users" icon={Users} />
                        <FederatedSection indexName={INDEX_NAMES.items} title="Items & Platos" type="grouped_items" icon={MessageCircle} />
                    </div>
                ) : (
                    // --- View: Specific Tab (Sidebar + Grid) ---
                    <Index indexName={INDEX_NAMES[activeTab as keyof typeof INDEX_NAMES]}>
                        <div className="container mx-auto max-w-7xl flex flex-col lg:flex-row gap-8">
                            {/* Filters Sidebar (Desktop) */}
                            <div className={`lg:w-64 flex-shrink-0 ${isFiltersOpen ? 'block' : 'hidden lg:block'}`}>
                                <div className="glass-card rounded-2xl border border-white/10 p-5 sticky top-24 shadow-xl">
                                    <div className="flex justify-between items-center mb-4 lg:hidden">
                                        <h3 className="text-white font-bold">Filtros</h3>
                                        <button onClick={() => setIsFiltersOpen(false)}><X className="text-white" /></button>
                                    </div>

                                    {/* Facets per Tab */}
                                    {activeTab === 'lists' && (
                                        <>
                                            <CustomRefinementList attribute="availableTags" label="Etiquetas" />
                                            <CustomRefinementList attribute="categories" label="Categoría" />
                                            {/* Legacy Facets to add if index supports: minReviews, minFollowers */}
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
                                            <CustomRefinementList attribute="userType" label="Tipo Usuario" />
                                            {/* <CustomRefinementList attribute="badges" label="Insignias" /> */}
                                        </>
                                    )}
                                    {(activeTab === 'grouped_items' || activeTab === 'items') && (
                                        <>
                                            <CustomRefinementList attribute="placeCity" label="Ciudad" />
                                            <CustomRefinementList attribute="listName" label="Lista" />
                                            <CustomRefinementList attribute="tags" label="Etiquetas" />
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Results Area */}
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-4 lg:hidden">
                                    <button
                                        onClick={() => setIsFiltersOpen(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-[#151b2e] border border-white/10 rounded-lg text-white font-bold text-sm"
                                    >
                                        <Filter className="w-4 h-4" /> Filtros
                                    </button>
                                </div>

                                <CustomHits activeTab={activeTab} />
                            </div>
                        </div>
                    </Index>
                )}

            </InstantSearch>
        </div>
    );
};
