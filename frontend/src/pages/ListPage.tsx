import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useLocation as useRouterLocation } from 'react-router-dom';
import { Map as MapIcon, List as ListIcon, Plus, Heart, ArrowDownWideNarrow, Clock, Search, ChevronDown, MapPin, Store, Lock, Share2, ChevronRight, Edit3, ArrowLeft } from 'lucide-react';
import { useListDetails } from '../hooks/useListDetails';
import { ListItemCard } from '../components/ListItemCard';
import { MapView } from '../components/MapView';
import { AddReviewForm } from '../components/AddReviewForm';
import { FilterModal } from '../components/FilterModal';
import { ShareListModal } from '../components/ShareListModal';
import { SublistsModal } from '../components/SublistsModal';
import { useAuth } from '../context/AuthContext';
import { getExpandedRangeValue, useFilters } from '../context/FilterContext';
import { useLike } from '../hooks/useLike';
import { useLocation } from '../hooks/useLocation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface FilterState {
    minRating: number;
    hasPhoto: boolean;
    visited: boolean;
    criteriaMin: Record<string, number>;
}

export const ListPage: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const routerLocation = useRouterLocation();
    const [sortMode, setSortMode] = useState<'rating' | 'newest' | 'oldest' | 'count'>('rating');
    const { list, reviews, sublists, loading, error } = useListDetails(listId);
    const { user } = useAuth();
    const { location, calculateDistance, requestLocation } = useLocation();

    const canAddReview = useMemo(() => {
        if (!user || !list) return false;
        if (list.userId === user.uid) return true;
        if (list.editors?.includes(user.uid)) return true;
        if (list.isPublic && (list as any).publicAccess === 'writer') return true;
        if (list.userId === user.uid) return true;
        if (list.editors?.includes(user.uid)) return true;
        if (list.isPublic) return true; // Open to public (authenticated)
        return false;
    }, [user, list]);

    const [filters, setFilters] = useState<FilterState>({
        minRating: 0,
        hasPhoto: false,
        visited: false,
        criteriaMin: {}
    });
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [groupingMode, setGroupingMode] = useState<'place' | 'dish'>('dish');

    // Check for editId param
    const queryParams = new URLSearchParams(routerLocation.search);
    const editId = queryParams.get('editId');

    const [isAddModalOpen, setIsAddModalOpen] = useState(!!editId);
    const [editingReviewId, setEditingReviewId] = useState<string | undefined>(editId || undefined);

    // Update state if URL changes (e.g. navigation back/forward)
    React.useEffect(() => {
        const q = new URLSearchParams(routerLocation.search);
        const Eid = q.get('editId');
        if (Eid) {
            setEditingReviewId(Eid);
            setIsAddModalOpen(true);
        }
    }, [routerLocation.search]);

    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isSublistsModalOpen, setIsSublistsModalOpen] = useState(false);


    // Range State from Context
    const { range, setRange, toggleRange, getRangeLabel } = useFilters();

    const handleToggleRange = () => {
        if (!location) {
            requestLocation();
        }
        toggleRange();
    };

    // Ensure location is requested if a range is active, to prevent showing ALL items by default
    useEffect(() => {
        if (range !== null && !location) {
            requestLocation();
        }
    }, [range, location]);

    // list.likes might be undefined initially, defaulting to 0
    const { isLiked, likeCount, toggleLike } = useLike(listId || '', list?.likes || 0);

    // Filter & Search State
    const [searchQuery, setSearchQuery] = useState('');

    // Parent List Name (for Sublists)
    const [parentListName, setParentListName] = useState<string | null>(null);
    useEffect(() => {
        const fetchParentName = async () => {
            if (list?.parentListId) {
                try {
                    const snap = await getDoc(doc(db, 'lists', list.parentListId));
                    if (snap.exists()) {
                        setParentListName(snap.data().name);
                    }
                } catch (e) {
                    console.error("Error fetching parent list name", e);
                }
            }
        };
        fetchParentName();
    }, [list?.parentListId]);


    // --- Aggregation Logic (Ranked List View & Map Data) ---
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
            photoMaxLikes: number;
            maxScore: number; // Track max score for the pin
            allTags: string[]; // For consensus calculation
            tags: string[]; // Final consensus tags
        }> = {};

        reviews.forEach(review => {
            let key = review.placeId || (review.itemName ? review.itemName.trim().toLowerCase() : 'unknown');

            // Grouping Mode Logic
            if (groupingMode === 'dish') {
                key = review.placeId
                    ? `${review.placeId}_${(review.itemName || '').trim().toLowerCase()}`
                    : (review.itemName || '').trim().toLowerCase();
            }

            if (!groups[key]) {
                const itemName = review.itemName ? review.itemName : (review.placeName || 'Item sin nombre');
                groups[key] = {
                    id: key,
                    name: groupingMode === 'dish' ? itemName : (review.placeName || itemName),
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
                    items: [],
                    photoMaxLikes: -1,
                    maxScore: 0,
                    allTags: [],
                    tags: []
                };
            }

            const g = groups[key];
            g.totalRating += review.overallRating || 0;
            g.count += 1;

            if ((review.overallRating || 0) > g.maxScore) {
                g.maxScore = review.overallRating || 0;
            }

            if (user && (review.userId === user.uid || review.authorId === user.uid)) {
                g.userHasReviewed = true;
            }

            g.items.push({
                name: review.itemName || 'Item',
                score: review.overallRating || 0
            });

            // Handle Review Time for sorting
            const createdAt = review.createdAt as any;
            let reviewTime = 0;
            if (createdAt?.toMillis) {
                reviewTime = createdAt.toMillis();
            } else if (createdAt instanceof Date) {
                reviewTime = createdAt.getTime();
            } else if (createdAt) {
                reviewTime = new Date(createdAt).getTime();
            }
            if (reviewTime > g.latestReviewAt) {
                g.latestReviewAt = reviewTime;
            }

            // Handle Photo
            const currentLikes = review.reactionCounts?.like || 0;
            if (review.photoUrl || review.placeMainImage) {
                if (currentLikes > g.photoMaxLikes) {
                    g.photoMaxLikes = currentLikes;
                    g.photoUrl = review.photoUrl || review.placeMainImage;
                }
            }

            // Handle Criteria
            if (review.scores) {
                Object.entries(review.scores).forEach(([k, v]) => {
                    g.criteriaSums[k] = (g.criteriaSums[k] || 0) + v;
                });
            }

            // Handle Tags
            if (review.tags && Array.isArray(review.tags)) {
                g.allTags.push(...review.tags);
            }

            if ((!g.lat || !g.lng) && review.lat && review.lng) {
                g.lat = review.lat;
                g.lng = review.lng;
            }
        });

        // Finalize Groups (Averages + Tags Consensus)
        return Object.values(groups).map(g => {
            const criteriaAverages: Record<string, number> = {};
            const allowedCriteria = list?.criteriaDefinition ? Object.keys(list.criteriaDefinition) : null;

            Object.keys(g.criteriaSums).forEach(k => {
                if (allowedCriteria && !allowedCriteria.includes(k)) return;
                criteriaAverages[k] = g.criteriaSums[k] / g.count;
            });

            // 50% Rule for Tags
            const tagCounts: Record<string, number> = {};
            g.allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
            const minThreshold = Math.ceil(g.count / 2);
            /* Logic: "Al menos en la mitad". So >= g.count / 2.
               Math.ceil(20/2) = 10. 15/20 >= 10 -> OK. 2/20 >= 10 -> No.
               Math.ceil(1/2) = 1. 1/1 >= 1 -> OK.
            */
            const consensusTags = Object.entries(tagCounts)
                .filter(([_, count]) => count >= minThreshold)
                .map(([tag]) => tag).sort();

            return {
                ...g,
                avgRating: g.totalRating / g.count,
                reviewCount: g.count,
                items: g.items.sort((a, b) => b.score - a.score),
                criteriaAverages,
                criteriaDefinition: list?.criteriaDefinition,
                tags: consensusTags // Use calculated tags
            };
        }).sort((a, b) => {
            if (sortMode === 'rating') {
                if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
                return b.reviewCount - a.reviewCount;
            }
            if (sortMode === 'count') {
                return b.reviewCount - a.reviewCount;
            }
            if (sortMode === 'newest' || sortMode === 'oldest') {
                const diff = b.latestReviewAt - a.latestReviewAt;
                return sortMode === 'newest' ? diff : -diff;
            }
            return 0;
        });
    }, [reviews, list, groupingMode, sortMode, user]);

    // Unique Tags for Filter UI
    const availableGroupTags = useMemo(() => {
        const set = new Set<string>();
        groupedItems.forEach(g => g.tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [groupedItems]);

    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Filter Items
    // Filter Items by Tag
    const filteredByTagItems = useMemo(() => {
        if (selectedTags.length === 0) return groupedItems;
        return groupedItems.filter(item => item.tags.some(t => selectedTags.includes(t)));
    }, [groupedItems, selectedTags]);



    // Map Specific Data - Always grouped by Place, always has Items list
    const mapItems = useMemo(() => {
        if (!reviews.length) return [];
        const placeGroups: Record<string, any> = {};

        reviews.forEach(review => {
            if (!review.placeId) return; // Skip items without placeId for map

            if (!placeGroups[review.placeId]) {
                placeGroups[review.placeId] = {
                    id: review.placeId,
                    placeId: review.placeId,
                    name: review.placeName || review.itemName,
                    lat: review.lat,
                    lng: review.lng,
                    photoUrl: review.placeMainImage || review.photoUrl,
                    maxScore: 0,
                    items: [],
                    reviewsCount: 0
                };
            }

            const g = placeGroups[review.placeId];
            // Accumulate Items
            g.items.push({ name: review.itemName, score: review.overallRating });
            g.reviewsCount++;

            if (review.overallRating > g.maxScore) {
                g.maxScore = review.overallRating;
            }

            // Ensure coords
            if ((!g.lat || !g.lng) && review.lat && review.lng) {
                g.lat = review.lat;
                g.lng = review.lng;
            }

            // Ensure photo (naive)
            if (!g.photoUrl && (review.placeMainImage || review.photoUrl)) {
                g.photoUrl = review.placeMainImage || review.photoUrl;
            }
        });

        // Format for MapView
        return Object.values(placeGroups).map(g => ({
            ...g,
            rating: g.maxScore, // Override rating for Pin Color with Max Score
            items: g.items.sort((a: any, b: any) => b.score - a.score) // Sort items descending
        }));
    }, [reviews]);

    // --- Filtering Logic ---
    // --- Filtering Logic ---
    const filteredItemsAll = useMemo(() => {
        let result = filteredByTagItems;

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
    }, [filteredByTagItems, searchQuery, filters, range, location]);

    const filteredMapItems = useMemo(() => {
        // Filter mapItems based on the SAME criteria as the list (or at least search/range)
        // Since mapItems are aggregated differently, we might need to filter differently.
        // Simplest approach: If mapItem's placeID is present in ANY of the filteredItemsAll, keep it?
        // Or re-apply filters (Search, Range, Rating).

        let result = mapItems;

        if (filters.minRating > 0) {
            // Check if maxScore meets it? Or average? Assuming Max Score for now as it's the pin rating.
            result = result.filter(item => item.maxScore >= filters.minRating);
        }

        if (filters.hasPhoto) {
            result = result.filter(item => !!item.photoUrl);
        }

        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(lowerQ)
            ); // Map items are places, so searching by name is usually enough. Items names are also in the 'items' array if we wanted deep search.
        }

        if (range !== null && location) {
            result = result.filter(item => {
                if (!item.lat || !item.lng) return false;
                const dist = calculateDistance(item.lat, item.lng);
                return dist !== null && dist <= range;
            });
        }

        return result;
    }, [mapItems, searchQuery, filters, range, location]);

    const hasListMapCandidates = useMemo(() => {
        return mapItems.some((item: any) => !!item?.lat && !!item?.lng);
    }, [mapItems]);

    useEffect(() => {
        if (!isMapOpen) return;
        if (loading) return;
        if (range === null || !location) return;
        if (!hasListMapCandidates) return;
        if (filteredMapItems.length > 0) return;

        const nextRange = getExpandedRangeValue(range);
        if (nextRange !== range) {
            setRange(nextRange);
        }
    }, [isMapOpen, loading, range, location, hasListMapCandidates, filteredMapItems.length, setRange]);

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
        if (error === 'private') {
            return (
                <div className="min-h-screen pt-40 px-4 text-center">
                    <div className="bg-[#151b2e] border border-white/10 rounded-2xl p-8 max-w-md mx-auto">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-8 h-8 text-gray-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Lista Privada</h2>
                        <p className="text-gray-400 mb-6">
                            Esta lista es privada y no tienes permisos para verla.
                        </p>
                        <Link to="/search" className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors">
                            <Search className="w-4 h-4" />
                            Explorar otras listas
                        </Link>
                    </div>
                </div>
            );
        }

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
            {/* Hero Section */}
            <div className={`relative w-full ${list.mainImageUrl || list.photoUrl ? 'h-[40vh] min-h-[300px]' : 'h-[30vh] min-h-[250px]'} transition-all duration-700 overflow-hidden group`}>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/60 to-black/40 z-10" />

                {/* Background Image & Overlay */}
                {(list.mainImageUrl || list.photoUrl) ? (
                    <img
                        src={list.mainImageUrl || list.photoUrl}
                        alt={list.name}
                        className="w-full h-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-[#0b1021] to-[#0b1021]">
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                    </div>
                )}

                <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-8 z-10 max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row gap-6 md:items-end md:justify-between">
                        {/* Left Column: Title & Author */}
                        <div className="flex-1 space-y-4">
                            <div>
                                {list.parentListId && (
                                    <Link to={`/list/${list.parentListId}`} className="inline-flex items-center gap-1 text-indigo-300 hover:text-white text-xs font-bold uppercase tracking-wider mb-2 transition-colors">
                                        <ArrowLeft className="w-4 h-4" />
                                        Volver a {parentListName || 'Lista Principal'}
                                    </Link>
                                )}
                                <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-white mb-2 leading-tight shadow-sm text-shadow-lg">
                                    {list.name}
                                </h1>
                                {list.description && (
                                    <p className="text-gray-300 text-sm sm:text-base max-w-2xl line-clamp-2 md:line-clamp-3 leading-relaxed drop-shadow-md">
                                        {list.description}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-4">
                                {
                                    /* Author Badge - Only for Sublists */
                                }
                                {list.parentListId && (
                                    <Link to={`/profile/${list.userId}`} className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 hover:bg-black/50 transition-colors group/author">
                                        <div className="w-5 h-5 rounded-full bg-indigo-500 overflow-hidden flex items-center justify-center text-[10px] text-white font-bold border border-white/20">
                                            {list.authorName?.[0] ? list.authorName[0].toUpperCase() : '?'}
                                        </div>
                                        <span className="text-sm font-medium text-white/90 group-hover/author:text-white">
                                            {list.authorName || 'Usuario'}
                                        </span>
                                    </Link>
                                )}
                                <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-pink-500 font-bold text-sm">
                                    <Heart className={`w-3.5 h-3.5 ${user && (list as any).isLiked ? 'fill-current' : ''}`} />
                                    <span>{likeCount}</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Status Badges & Actions */}
                        <div className="flex flex-col gap-3 items-end w-full md:w-auto">
                            {/* Badges Row - Moved to Right */}
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Type Badge */}
                                <span className={`px-2.5 py-0.5 rounded-md border text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm ${list.parentListId ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}`}>
                                    {list.parentListId ? 'Sublista' : 'Lista'}
                                </span>

                                {list.isPublic ? (
                                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                                        Pública
                                    </span>
                                ) : (
                                    <span className="px-2.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm flex items-center gap-1">
                                        <Lock className="w-3 h-3" /> Privada
                                    </span>
                                )}

                                {/* Role Bubbles */}
                                {list.parentListId && user?.uid === list.userId && (
                                    <span className="px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                                        Propietario
                                    </span>
                                )}
                                {list.parentListId && !user && list.isPublic && (
                                    <span className="px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                                        Visitante
                                    </span>
                                )}
                                {(list.parentListId || (list.editors && list.editors.includes(user?.uid || ''))) && user && user.uid !== list.userId && (
                                    <>
                                        {list.editors?.includes(user?.uid) ? (
                                            <span className="px-2.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                                                Editor
                                            </span>
                                        ) : (list as any).publicAccess === 'writer' ? (
                                            <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                                                Colaborador
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                                                Lector
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Action Buttons Row */}
                            <div className="flex items-center gap-2">
                                {user && list.userId === user.uid && (
                                    <Link
                                        to={`/list/${list.id}/edit`}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                        <span className="hidden sm:inline">Editar</span>
                                    </Link>
                                )}

                                <button
                                    onClick={() => setIsShareModalOpen(true)}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-xl border border-white/10 backdrop-blur-md flex items-center gap-2 transition-all"
                                >
                                    <Share2 className="w-4 h-4" />
                                    <span className="hidden sm:inline">Compartir</span>
                                </button>

                                {/* Like/Follow Button */}
                                {user && list.userId !== user.uid && (
                                    <button
                                        onClick={toggleLike}
                                        className={`px-4 py-2 text-sm font-bold rounded-xl border flex items-center gap-2 transition-all ${isLiked
                                            ? 'bg-transparent border-white/20 text-white hover:border-pink-500 hover:text-pink-500'
                                            : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500'
                                            }`}
                                    >
                                        {isLiked ? (
                                            <>
                                                <Heart className="w-4 h-4 fill-current" />
                                                <span className="hidden sm:inline">Guardada</span>
                                            </>
                                        ) : (
                                            <>
                                                <Heart className="w-4 h-4" />
                                                <span className="hidden sm:inline">Guardar</span>
                                            </>
                                        )}
                                    </button>
                                )}

                                {/* Sublists Button (Only for Main Lists) */}
                                {!list.parentListId && (
                                    <button
                                        onClick={() => setIsSublistsModalOpen(true)}
                                        className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-sm font-bold rounded-xl backdrop-blur-md flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-indigo-500/10"
                                    >
                                        <ListIcon className="w-4 h-4" />
                                        <span>Sublistas</span>
                                        {sublists && sublists.length > 0 && (
                                            <span className="bg-indigo-500/20 px-1.5 py-0.5 rounded text-[10px] ml-1 border border-indigo-500/30 text-indigo-200">
                                                {sublists.length}
                                            </span>
                                        )}
                                    </button>
                                )}

                                {/* Add Review Button */}
                                {canAddReview && (
                                    <button
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 hover:scale-105 transition-all ml-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>Añadir Reseña</span>
                                    </button>
                                )}
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
                        </button>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleToggleRange}
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
                            {isMapOpen && <MapView items={filteredMapItems} mode="list" range={range} />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sublists Viewer - Moved to Header */}


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

                            {/* Grouping Toggle */}
                            <button
                                onClick={() => setGroupingMode(prev => prev === 'place' ? 'dish' : 'place')}
                                className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all ${groupingMode === 'place' ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                                title={groupingMode === 'place' ? "Agrupado por Lugar" : "Ver Platos Sueltos"}
                            >
                                <Store className="w-4 h-4" />
                            </button>

                            <div className="h-4 w-px bg-white/10 mx-1"></div>

                            {/* View Toggle */}
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
                            {canAddReview && (
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
                            <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col rounded-xl overflow-hidden border border-[var(--border-color)] divide-y divide-[var(--border-color)]"}>
                                {filteredItems.map((item, idx) => (
                                    <ListItemCard
                                        key={item.id}
                                        item={item}
                                        rank={idx + 1}
                                        isGrid={viewMode === 'grid'}
                                        groupingMode={groupingMode}
                                        listId={listId}
                                    />
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
                            {canAddReview && !searchQuery && (
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
            {
                isAddModalOpen && listId && (
                    <AddReviewForm
                        listId={listId}
                        editReviewId={editingReviewId}
                        lockList={true} // Always lock list on ListPage
                        onClose={() => {
                            setIsAddModalOpen(false);
                            setEditingReviewId(undefined);
                            // Clear param without reload
                            window.history.replaceState({}, '', `/list/${listId}`);
                        }}
                        onSuccess={() => window.location.reload()}
                    />
                )
            }

            {/* Share Modal */}
            {
                isShareModalOpen && list && user && (
                    <ShareListModal
                        isOpen={isShareModalOpen}
                        onClose={() => setIsShareModalOpen(false)}
                        listId={listId!}
                        listName={list.name}
                        currentGuests={list.guests || []}
                        currentEditors={list.editors || []}
                        ownerId={list.userId}
                        onUpdate={() => {
                            // No reload needed for UI, but if we want to refresh 'list' data in background we can.
                            // For now, we rely on local Modal state updates.
                            // window.location.reload() 
                        }}
                    />
                )
            }

            {/* Sublists Modal (Only for Main Lists) */}
            {
                isSublistsModalOpen && sublists && !list.parentListId && (
                    <SublistsModal
                        isOpen={isSublistsModalOpen}
                        onClose={() => setIsSublistsModalOpen(false)}
                        sublists={sublists}
                        listId={list.id}
                        listName={list.name}
                        parentCriteria={list.criteriaDefinition}
                        parentTags={list.availableTags}
                    />
                )
            }

            <FilterModal
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                filters={filters}
                setFilters={setFilters}
                criteriaDefinition={list?.criteriaDefinition}
                sortMode={sortMode}
                setSortMode={setSortMode}
                availableTags={availableGroupTags}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
            />
        </div >
    );
};
