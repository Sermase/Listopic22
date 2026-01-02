import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Share2, Map, List as ListIcon, Plus, Heart, ArrowDownWideNarrow, Clock, Search } from 'lucide-react';
import { useListDetails } from '../hooks/useListDetails';
import { ListItemCard } from '../components/ListItemCard';
import { MapView } from '../components/MapView';
import { AddReviewForm } from '../components/AddReviewForm';
import { FilterModal } from '../components/FilterModal';
import { useAuth } from '../context/AuthContext';
import { useLike } from '../hooks/useLike';

export interface FilterState {
    minRating: number;
    hasPhoto: boolean;
    visited: boolean;
    criteriaMin: Record<string, number>;
}

export const ListPage: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const [sortMode, setSortMode] = useState<'rating' | 'newest' | 'oldest' | 'count'>('rating');
    const { list, reviews, loading, error } = useListDetails(listId);
    const { user } = useAuth();

    const [filters, setFilters] = useState<FilterState>({
        minRating: 0,
        hasPhoto: false,
        visited: false,
        criteriaMin: {}
    });
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'map'>('list');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

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
                    userHasReviewed: false
                };
            }

            const g = groups[key];
            g.totalRating += review.overallRating;
            g.count += 1;

            // Check if current user has reviewed this item
            if (user && (review.userId === user.uid || review.authorId === user.uid)) {
                g.userHasReviewed = true;
            }

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
        if (!searchQuery) return result;
        const lowerQ = searchQuery.toLowerCase();
        return result.filter(item =>
            item.name.toLowerCase().includes(lowerQ) ||
            (item.placeName && item.placeName.toLowerCase().includes(lowerQ))
        );
    }, [groupedItems, searchQuery, filters]);

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
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20 transition-colors duration-300">
            {/* Header / Hero */}
            <div className="relative pt-24 pb-12 px-4 sm:px-6 border-b border-white/5 overflow-hidden group">
                {/* Background Blur Cover */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-[var(--bg-primary)] opacity-90 z-10 transition-colors duration-300" />
                    {list.photoUrl ? (
                        <img src={list.photoUrl} className="w-full h-full object-cover blur-3xl opacity-30 scale-110" alt="Cover Blur" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-900/20 via-[var(--bg-primary)] to-purple-900/20" />
                    )}
                </div>

                <div className="relative z-10 max-w-6xl mx-auto">
                    <Link to="/search" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors group/back">
                        <ArrowLeft className="w-4 h-4 mr-2 group-hover/back:-translate-x-1 transition-transform" />
                        Volver
                    </Link>

                    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
                        {/* List Main Info */}
                        <div className="flex flex-col md:flex-row gap-6 items-start lg:col-span-2">
                            <div className="w-full md:w-40 md:h-40 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 shrink-0 bg-gray-800 flex items-center justify-center aspect-square text-white">
                                {list.photoUrl ? (
                                    <img src={list.photoUrl} alt={list.name} className="w-full h-full object-cover" />
                                ) : (
                                    <ListIcon className="w-16 h-16 text-gray-600" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h1 className="text-4xl md:text-6xl font-display font-bold text-[var(--text-primary)] mb-4 leading-none tracking-tight">
                                    {list.name}
                                </h1>
                                {list.description && (
                                    <p className="text-xl text-[var(--text-secondary)] mb-6 max-w-3xl leading-relaxed">
                                        {list.description}
                                    </p>
                                )}
                                <div className="flex flex-wrap items-center gap-6">
                                    <Link to={`/profile/${list.userId}`} className="flex items-center gap-2 group/author">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                                            <span className="text-indigo-400 font-bold">{list.authorName?.[0] || "?"}</span>
                                        </div>
                                        <span className="text-[var(--text-primary)] font-medium group-hover/author:text-indigo-400 transition-colors">
                                            Por {list.authorName || "Anónimo"}
                                        </span>
                                    </Link>

                                    {/* Owner Actions */}
                                    {user && list.userId === user.uid && (
                                        <Link
                                            to={`/list/${list.id}/edit`}
                                            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-bold text-indigo-300 transition-colors"
                                        >
                                            Editar Lista
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col">
                            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Items</span>
                            <span className="text-2xl font-bold text-white">{reviews.length}</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col">
                            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Nota Media</span>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold text-white">
                                    {(reviews.reduce((acc, r) => acc + r.overallRating, 0) / (reviews.length || 1)).toFixed(1)}
                                </span>
                                <span className="text-yellow-500 text-sm">⭐</span>
                            </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col cursor-pointer hover:bg-white/10 transition-colors" onClick={toggleLike}>
                            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Likes</span>
                            <div className="flex items-center gap-2">
                                <Heart className={`w-5 h-5 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-gray-400'}`} />
                                <span className={`text-2xl font-bold ${isLiked ? 'text-pink-500' : 'text-white'}`}>{likeCount}</span>
                            </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col">
                            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Visitas</span>
                            <span className="text-2xl font-bold text-white">--</span> {/* Placeholder for now */}
                        </div>
                    </div>

                    {/* Photo Carousel (aggregated) */}
                    {reviews.some(r => r.photoUrl || r.placeMainImage) && (
                        <div className="mt-8">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Galería</h3>
                            <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide snap-x">
                                {reviews
                                    .filter(r => r.photoUrl || r.placeMainImage)
                                    .slice(0, 10) // Limit to 10 photos
                                    .map((r, i) => (
                                        <div key={i} className="flex-shrink-0 w-48 h-32 rounded-lg overflow-hidden border border-white/10 snap-start bg-gray-900">
                                            <img src={r.photoUrl || r.placeMainImage} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" alt="" />
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Content List */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">

                {/* Toolbar: Stats & Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Ranking
                        <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-indigo-300 border border-white/5">
                            {filteredItems.length}
                        </span>
                    </h2>

                    <div className="flex flex-col sm:flex-row items-stretch gap-3">
                        {/* Search Bar */}
                        <div className="relative group/search">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within/search:text-indigo-400 transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full sm:w-48 bg-[#151b2e] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600"
                            />
                        </div>

                        {/* Filter Button */}
                        <button
                            onClick={() => setIsFilterModalOpen(true)}
                            className="bg-[#151b2e] p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-indigo-500/50 transition-colors"
                            title="Filtros avanzados"
                        >
                            <ArrowDownWideNarrow className="w-4 h-4 rotate-180" /> {/* Using Icon as placeholder for filter slider look */}
                        </button>

                        {/* Sort Controls */}
                        <div className="bg-[#151b2e] p-1 rounded-lg flex border border-white/10 shrink-0">
                            <button
                                onClick={() => setSortMode('rating')}
                                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${sortMode === 'rating' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                title="Por Nota"
                            >
                                <ArrowDownWideNarrow className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setSortMode('newest')}
                                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${sortMode === 'newest' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                title="Recientes"
                            >
                                <Clock className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Add Button - Only if authenticated (and strictly if owner, but open for mvp) */}
                        {user && (
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Añadir</span>
                            </button>
                        )}

                        {/* View Toggle */}
                        <div className="bg-[#151b2e] p-1 rounded-lg flex border border-white/10 shrink-0">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                title="Ver lista"
                            >
                                <ListIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                title="Ver cuadrícula"
                            >
                                <div className="w-4 h-4 grid grid-cols-2 gap-0.5">
                                    <div className="bg-current rounded-[1px]"></div>
                                    <div className="bg-current rounded-[1px]"></div>
                                    <div className="bg-current rounded-[1px]"></div>
                                    <div className="bg-current rounded-[1px]"></div>
                                </div>
                            </button>
                            <button
                                onClick={() => setViewMode('map')}
                                className={`p-2 rounded-md transition-colors ${viewMode === 'map' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                title="Ver mapa"
                            >
                                <Map className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {viewMode === 'map' ? (
                    <div className="animate-fade-in">
                        <MapView items={reviews} />
                        <div className="mt-4 text-xs text-gray-500 text-center">
                            Mostrando elementos con ubicación válida.
                        </div>
                    </div>
                ) : (
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
                                    {searchQuery ? 'No hay resultados para tu búsqueda.' : 'Esta lista está vacía.'}
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
                )}
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
