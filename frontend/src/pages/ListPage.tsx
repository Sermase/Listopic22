import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Share2, Map as MapIcon, List as ListIcon, Plus, Heart, ArrowDownWideNarrow, Clock, Search, ChevronDown, MapPin } from 'lucide-react';
import { useListDetails } from '../hooks/useListDetails';
import { ListItemCard } from '../components/ListItemCard';
import { MapView } from '../components/MapView';
import { AddReviewForm } from '../components/AddReviewForm';
import { FilterModal } from '../components/FilterModal';
import { useAuth } from '../context/AuthContext';
import { useLike } from '../hooks/useLike';
import { useLocation } from '../hooks/useLocation';

export interface FilterState {
    minRating: number;
    hasPhoto: boolean;
    visited: boolean;
    criteriaMin: Record<string, number>;
}

export const ListPage: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const [sortMode, setSortMode] = useState<'rating' | 'newest' | 'oldest' | 'count'>('rating');
    const { list, reviews, sublists, loading, error } = useListDetails(listId);
    const { user } = useAuth();
    const { location, requestLocation, calculateDistance } = useLocation();

    const [filters, setFilters] = useState<FilterState>({
        minRating: 0,
        hasPhoto: false,
        visited: false,
        criteriaMin: {}
    });
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);

    // Range State
    const [range, setRange] = useState<number | null>(() => {
        const saved = sessionStorage.getItem('sessionRange');
        return saved ? Number(saved) : null;
    });

    const handleRangeChange = (newRange: number | null) => {
        setRange(newRange);
        if (newRange) {
            sessionStorage.setItem('sessionRange', String(newRange));
        } else {
            sessionStorage.removeItem('sessionRange');
        }
    };

    const toggleRange = () => {
        if (!location) requestLocation();

        let next: number | null = null;
        if (range === null) next = 1;
        else if (range === 1) next = 5;
        else if (range === 5) next = 10;
        else if (range === 10) next = 50;
        else next = null;

        handleRangeChange(next);
    };

    const getRangeLabel = () => range === null ? "Sin rango" : `< ${range} km`;

    // list.likes might be undefined initially, defaulting to 0
    const { isLiked, likeCount, toggleLike } = useLike(listId || '', list?.likes || 0);

    // Filter & Search State
    const [searchQuery, setSearchQuery] = useState('');

    // --- Aggregation Logic (Legacy "Ranked List" View) ---
    const groupedItems = useMemo(() => {
        if (!reviews.length) return [];

        const groups: Record<string, {
            id: string;
            name: string;
            placeId?: string;
            placeName?: string;
            placeCity?: string;
            placeAddress?: string;
            photoUrl?: string;
            totalRating: number;
            count: number;
            criteriaSums: Record<string, number>;
            lat?: number;
            lng?: number;
            latestReviewAt: number; // Timestamp for sorting
            userHasReviewed: boolean;
            items: { name: string; score: number }[];
        }> = {};

        reviews.forEach(review => {
            const key = review.placeId || review.itemName.trim().toLowerCase();

            if (!groups[key]) {
                groups[key] = {
                    id: key,
                    name: review.placeName || review.itemName,
                    placeId: review.placeId,
                    placeName: review.placeName,
                    placeCity: review.placeCity,
                    placeAddress: review.placeAddress,
                    photoUrl: review.photoUrl,
                    totalRating: 0,
                    count: 0,
                    criteriaSums: {},
                    latestReviewAt: 0,
                    userHasReviewed: false,
                    items: [] // Store individual items for Map View
                };
            }

            const g = groups[key];
            g.totalRating += review.overallRating;
            g.count += 1;

            // Check if current user has reviewed this item
            if (user && (review.userId === user.uid || review.authorId === user.uid)) {
                g.userHasReviewed = true;
            }

            // Add item details for Map Popup
            g.items.push({
                name: review.itemName,
                score: review.overallRating
            });

            // Capture latest timestamp for "Newest" sort
            const createdAt = review.createdAt as any;
            let reviewTime = 0;

            if (createdAt?.toMillis) {
                reviewTime = createdAt.toMillis();
            } else if (createdAt instanceof Date) {
                reviewTime = createdAt.getTime();
            } else if (createdAt) {
                // Fallback for string or timestamp-like objects
                reviewTime = new Date(createdAt).getTime();
            }

            if (reviewTime > g.latestReviewAt) {
                g.latestReviewAt = reviewTime;
                // Logic to prioritize photo
                if (!g.photoUrl && review.photoUrl) g.photoUrl = review.photoUrl;
                // If still no photo, try place image
                if (!g.photoUrl && review.placeMainImage) g.photoUrl = review.placeMainImage;
            }

            // Prioritize photo from review if group has none (fallback)
            if (!g.photoUrl) {
                g.photoUrl = review.photoUrl || review.placeMainImage;
            }

            if (review.scores) {
                Object.entries(review.scores).forEach(([k, v]) => {
                    g.criteriaSums[k] = (g.criteriaSums[k] || 0) + v;
                });
            }

            // Capture coordinates if available (prioritize those with data)
            if ((!g.lat || !g.lng) && review.lat && review.lng) {
                g.lat = review.lat;
                g.lng = review.lng;
            }
        });

        // Convert to Array and Average
        return Object.values(groups).map(g => {
            const criteriaAverages: Record<string, number> = {};
            Object.keys(g.criteriaSums).forEach(k => {
                criteriaAverages[k] = g.criteriaSums[k] / g.count;
            });

            return {
                ...g,
                avgRating: g.totalRating / g.count,
                reviewCount: g.count,
                items: g.items.sort((a, b) => b.score - a.score),
                criteriaAverages,
                criteriaDefinition: list?.criteriaDefinition
            };
        }).sort((a, b) => {
            if (sortMode === 'rating') {
                if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
                return b.reviewCount - a.reviewCount; // Tie-breaker: popularity
            }
            if (sortMode === 'newest' || sortMode === 'oldest') {
                const diff = b.latestReviewAt - a.latestReviewAt;
                return sortMode === 'newest' ? diff : -diff;
            }
            // if (sortMode === 'count') return b.reviewCount - a.reviewCount;

            // Default
            return b.avgRating - a.avgRating;
        });

    }, [reviews, list, sortMode]);

    // --- Filtering Logic ---
    const filteredItemsAll = useMemo(() => {
        let result = groupedItems;

        // 1. Apply Smart Filters
        if (filters.minRating > 0) {
            result = result.filter(item => item.avgRating >= filters.minRating);
        }
        if (filters.hasPhoto) {
            result = result.filter(item => !!item.photoUrl);
        }
        if (filters.visited) {
            result = result.filter(item => item.userHasReviewed);
        }
        if (Object.keys(filters.criteriaMin).length > 0) {
            result = result.filter(item => {
                return Object.entries(filters.criteriaMin).every(([critKey, minScore]) => {
                    const score = item.criteriaAverages?.[critKey] || 0;
                    return score >= minScore;
                });
            });
        }

        // 2. Apply Search
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(lowerQ) ||
                (item.placeName && item.placeName.toLowerCase().includes(lowerQ))
            );
        }

        // 3. Apply Distance Range
        if (range !== null && location) {
            result = result.filter(item => {
                if (!item.lat || !item.lng) return false;
                const dist = calculateDistance(item.lat, item.lng);
                return dist !== null && dist <= range;
            });
        } else if (range !== null && !location) {
            // If range is active but no location, maybe show nothing or keep all?
            // Usually keeping all is confusing if user wants filtering. 
            // But usually requestLocation should have triggered.
            // We'll optimistically keep them or filter if we strictly want radius.
            // Let's filter nothing until location is found (user should see prompt).
        }

        return result;
    }, [groupedItems, searchQuery, filters, range, location]);

    // Pagination
    const PAGE_SIZE = 24;
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const filteredItems = useMemo(() => {
        return filteredItemsAll.slice(0, visibleCount);
    }, [filteredItemsAll, visibleCount]);

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + PAGE_SIZE);
    };

    if (loading) {
        return (
            <div className="min-h-screen pt-24 px-4 max-w-4xl mx-auto">
                <div className="h-8 w-1/3 bg-gray-800 rounded animate-pulse mb-4"></div>
                <div className="h-4 w-2/3 bg-gray-800 rounded animate-pulse mb-8"></div>
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-48 bg-gray-800 rounded-xl animate-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || !list) {
        return (
            <div className="min-h-screen pt-24 px-4 text-center">
                <h2 className="text-2xl font-bold text-red-400 mb-2">Error</h2>
                <p className="text-gray-400">{error || "Lista no encontrada"}</p>
                <Link to="/search" className="mt-4 inline-block text-indigo-400 hover:text-indigo-300">
                    Volver al buscador
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20 transition-colors duration-300">
            {/* Hero Section */}
            <div className="relative h-[250px] sm:h-[400px] w-full overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/30 to-black/30 z-10" />

                {(list.mainImageUrl || list.photoUrl) ? (
                    <img src={list.mainImageUrl || list.photoUrl} alt={list.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center">
                        <ListIcon className="w-20 h-20 text-white/20" />
                    </div>
                )}

                <div className="absolute top-24 left-4 z-20">
                    <Link to="/search" className="inline-flex items-center text-white/80 hover:text-white transition-colors bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-sm font-medium border border-white/10 hover:border-white/30">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Volver
                    </Link>
                </div>

                <div className="absolute bottom-0 left-0 w-full p-4 sm:p-8 z-20">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="flex-1">
                            {user && list.userId === user.uid && (
                                <Link
                                    to={`/list/${list.id}/edit`}
                                    className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-xs font-bold text-white transition-colors"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                                    Editar Lista
                                </Link>
                            )}
                            <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-white mb-2 shadow-sm text-shadow-lg leading-tight line-clamp-2">
                                {list.name}
                            </h1>
                            {list.description && (
                                <p className="text-gray-200 text-sm sm:text-lg max-w-2xl font-light line-clamp-2 mb-4">
                                    {list.description}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-4 text-sm">
                                <Link to={`/profile/${list.userId}`} className="flex items-center gap-2 group/author bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 hover:bg-black/50 transition-colors">
                                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 overflow-hidden">
                                        {list.authorName?.[0] ? (
                                            <span className="text-indigo-400 font-bold text-xs">{list.authorName[0]}</span>
                                        ) : (
                                            <MapIcon className="w-3 h-3 text-indigo-400" />
                                        )}
                                    </div>
                                    <span className="text-white font-medium">
                                        {list.authorName || "Anónimo"}
                                    </span>
                                </Link>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 text-white bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
                                        <span className="font-bold">{reviews.length}</span>
                                        <span className="text-gray-400 text-xs uppercase">Items</span>
                                    </div>
                                    <button onClick={toggleLike} className="flex items-center gap-1.5 text-white bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 hover:bg-black/50 transition-colors">
                                        <Heart className={`w-4 h-4 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-gray-400'}`} />
                                        <span className={`font-bold ${isLiked ? 'text-pink-500' : 'text-white'}`}>{likeCount}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map Collapsible */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
                <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden transition-all duration-300">
                    <div className="w-full p-3 flex items-center justify-between text-gray-300 bg-[#1e2538]/50">
                        <button
                            onClick={() => setIsMapOpen(!isMapOpen)}
                            className="flex items-center gap-2 hover:text-white transition-colors flex-1"
                        >
                            <MapIcon className="w-5 h-5 text-gray-400" />
                            <span className="font-bold text-sm">Mapa de la Lista</span>
                            <span className="text-xs text-gray-500 font-normal ml-2">({filteredItems.filter(i => i.lat).length} de {filteredItemsAll.length})</span>
                        </button>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={toggleRange}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border shrink-0 flex items-center gap-1.5 ${range !== null
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                                    : 'bg-[#0b1021] border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                <MapPin className="w-3 h-3" />
                                {getRangeLabel()}
                            </button>

                            <button
                                onClick={() => setIsMapOpen(!isMapOpen)}
                                className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-white transition-colors"
                            >
                                {isMapOpen ? 'Ocultar' : 'Ver Mapa'}
                                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMapOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className={`transition-all duration-500 ease-in-out ${isMapOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="h-[400px] w-full relative z-0">
                            {isMapOpen && <MapView items={filteredItems} mode="list" range={range} />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sublists Viewer (if any) */}
            {sublists && sublists.length > 0 && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <ListIcon className="w-4 h-4" /> Sublistas
                    </h3>
                    <div className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide snap-x">
                        {sublists.map(sublist => (
                            <Link key={sublist.id} to={`/list/${sublist.id}`} className="block group flex-shrink-0 snap-start">
                                <div className="w-64 bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all flex flex-col h-full">
                                    <div className="h-32 bg-gray-800 relative">
                                        {sublist.photoUrl ? (
                                            <img src={sublist.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                <ListIcon className="w-8 h-8 text-gray-600" />
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white">
                                            {sublist.itemCount} items
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <h4 className="text-white font-bold text-sm mb-1 truncate">{sublist.name}</h4>
                                        <p className="text-gray-500 text-[10px] line-clamp-2">{sublist.description || "Sin descripción"}</p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Content List */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">

                {/* Modern Toolbar */}
                <div className="sticky top-20 z-30 mb-8 mx-auto max-w-4xl">
                    <div className="bg-[#151b2e]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col sm:flex-row items-center justify-between gap-3 transition-all duration-300 hover:border-white/20">

                        {/* Search & Count */}
                        <div className="flex items-center flex-1 w-full gap-3 px-2">
                            <div className="bg-white/5 text-xs px-2.5 py-1 rounded-full text-indigo-300 font-bold border border-white/5 flex-shrink-0">
                                {filteredItems.length}
                            </div>
                            <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block"></div>
                            <div className="relative flex-1 group/search">
                                <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within/search:text-indigo-400 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Buscar en esta lista..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-transparent border-none p-0 pl-7 text-sm text-white placeholder:text-gray-600 focus:ring-0 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Actions Island */}
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">

                            {/* Filter */}
                            <button
                                onClick={() => setIsFilterModalOpen(true)}
                                className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-gray-400 hover:text-white transition-all active:scale-95"
                                title="Filtros"
                            >
                                <ArrowDownWideNarrow className="w-4 h-4 rotate-180" />
                            </button>

                            <div className="h-4 w-px bg-white/10 mx-1"></div>

                            {/* Sort */}
                            <div className="flex bg-black/20 rounded-xl p-0.5 border border-white/5">
                                <button
                                    onClick={() => setSortMode('rating')}
                                    className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${sortMode === 'rating' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                    title="Tops"
                                >
                                    <Heart className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setSortMode('newest')}
                                    className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${sortMode === 'newest' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                    title="Nuevos"
                                >
                                    <Clock className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* View */}
                            <div className="flex bg-black/20 rounded-xl p-0.5 border border-white/5">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <ListIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <div className="w-3.5 h-3.5 grid grid-cols-2 gap-0.5 opacity-80">
                                        <div className="bg-current rounded-[0.5px]"></div>
                                        <div className="bg-current rounded-[0.5px]"></div>
                                        <div className="bg-current rounded-[0.5px]"></div>
                                        <div className="bg-current rounded-[0.5px]"></div>
                                    </div>
                                </button>
                            </div>

                            {/* Add Actions */}
                            {user && (
                                <button
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="ml-2 h-9 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 hover:scale-105 transition-all"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Añadir</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="animate-fade-in">
                    {filteredItems.length > 0 ? (
                        <>
                            <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                                {filteredItems.map((item, idx) => (
                                    <ListItemCard key={item.id} item={item} rank={idx + 1} isGrid={viewMode === 'grid'} />
                                ))}
                            </div>

                            {/* Load More Button */}
                            {visibleCount < filteredItemsAll.length && (
                                <div className="mt-8 text-center">
                                    <button
                                        onClick={handleLoadMore}
                                        className="px-6 py-2 bg-[#151b2e] hover:bg-[#1e2538] border border-white/10 rounded-full text-indigo-400 hover:text-indigo-300 font-medium transition-colors shadow-lg"
                                    >
                                        Cargar más ({filteredItemsAll.length - visibleCount} restantes)
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-16 bg-[#151b2e]/30 rounded-2xl border border-dashed border-white/5">
                            <p className="text-gray-400 mb-4 text-lg">
                                {searchQuery ? 'No hay resultados para tu búsqueda.' : 'Esta lista está vacía o no hay elementos cerca.'}
                            </p>
                            {user && !searchQuery && (
                                <button
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline"
                                >
                                    ¡Añade la primera reseña!
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Add Modal */}
            {isAddModalOpen && listId && (
                <AddReviewForm
                    listId={listId}
                    onClose={() => setIsAddModalOpen(false)}
                    onSuccess={() => window.location.reload()}
                />
            )}

            <FilterModal
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                filters={filters}
                setFilters={setFilters}
                criteriaDefinition={list?.criteriaDefinition}
            />
        </div>
    );
};
