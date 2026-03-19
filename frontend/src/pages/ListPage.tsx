import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Link, useLocation as useRouterLocation } from 'react-router-dom';
import { Map as MapIcon, List as ListIcon, Plus, Heart, ArrowDownWideNarrow, Clock, Search, ChevronDown, MapPin, Store, Lock, Share2, ChevronRight, Edit3, ArrowLeft, MoreVertical, X } from 'lucide-react';
import { useListDetails } from '../hooks/useListDetails';
import { useUserProfile } from '../hooks/useUserProfile';
import { ListItemCard } from '../components/ListItemCard';
import { MapView } from '../components/MapView';
import { AddReviewForm } from '../components/AddReviewForm';
import { FilterModal } from '../components/FilterModal';
import { ShareListModal } from '../components/ShareListModal';
import { ShareModal } from '../components/ShareModal';
import { SublistsModal } from '../components/SublistsModal';
import { useAuth } from '../context/AuthContext';
import { getExpandedRangeValue, useFilters } from '../context/FilterContext';
import { useLike } from '../hooks/useLike';
import { useLocation } from '../hooks/useLocation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { buildCriteriaStats } from '../utils/shareCriteria';

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
    const { profile: currentUserProfile } = useUserProfile(user?.uid);
    const isJefe = Boolean(currentUserProfile && (
        (Array.isArray(currentUserProfile.userType) && currentUserProfile.userType.includes('jefe')) ||
        currentUserProfile.userType === 'jefe'
    ));
    const { location, calculateDistance, requestLocation } = useLocation();

    // Can manage (edit/permissions): jefe always; for sublists also the owner
    const canManageList = user && (list?.parentListId ? list.userId === user.uid : isJefe);

    const canAddReview = useMemo(() => {
        if (!user || !list) return false;
        if (list.userId === user.uid) return true;           // owner
        if (list.editors?.includes(user.uid)) return true;  // editor/collaborator (UID)
        if (list.isPublic && (list as any).publicAccess === 'writer') return true; // public write
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
    const [isPublicShareModalOpen, setIsPublicShareModalOpen] = useState(false);
    const [isSublistsModalOpen, setIsSublistsModalOpen] = useState(false);
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    const overflowBtnRef = useRef<HTMLButtonElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);


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
    const [showUnavailable, setShowUnavailable] = useState(false);

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
            placeClosedStatus?: string | null;
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
                    tags: [],
                    placeClosedStatus: (review as any).placeClosedStatus || null,
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
                    reviewsCount: 0,
                    placeClosedStatus: (review as any).placeClosedStatus || null,
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

        // Filter permanently closed places (unless toggle enabled)
        if (!showUnavailable) {
            result = result.filter(item => (item as any).placeClosedStatus !== 'permanently_closed');
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
    }, [filteredByTagItems, searchQuery, filters, range, location, showUnavailable]);

    const filteredMapItems = useMemo(() => {
        // Filter mapItems based on the SAME criteria as the list (or at least search/range)
        // Since mapItems are aggregated differently, we might need to filter differently.
        // Simplest approach: If mapItem's placeID is present in ANY of the filteredItemsAll, keep it?
        // Or re-apply filters (Search, Range, Rating).

        let result = mapItems;

        // Hide permanently closed places from map
        if (!showUnavailable) {
            result = result.filter(item => (item as any).placeClosedStatus !== 'permanently_closed');
        }

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
    }, [mapItems, searchQuery, filters, range, location, showUnavailable]);

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

    // Close actions overflow menu when clicking outside
    useEffect(() => {
        if (!isActionsMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
                setIsActionsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isActionsMenuOpen]);

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

    const listShareUrl = `${window.location.origin}/list/${list.id}`;
    const listTypeLabel = list.parentListId ? 'Sublista' : 'Lista';
    const listShareSubtitle = list.parentListId && parentListName
        ? `${listTypeLabel} de ${parentListName}`
        : listTypeLabel;
    const listShareImage = list.mainImageUrl || list.photoUrl || undefined;

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20 transition-colors duration-300">
            {/* Hero Section */}
            {/* Hero Section */}
            <div className="relative w-full h-[40vh] min-h-[300px] transition-all duration-700 group">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/60 to-black/40 z-10" />

                {/* Background Image & Overlay — overflow-hidden only on image wrapper */}
                {(list.mainImageUrl || list.photoUrl) ? (
                    <div className="absolute inset-0 overflow-hidden">
                        <img
                            src={list.mainImageUrl || list.photoUrl}
                            alt={list.name}
                            className="w-full h-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105"
                        />
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-[#0b1021] to-[#0b1021]">
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                    </div>
                )}

                {/* Back link for sublists — pinned top-left, below navbar */}
                {list.parentListId && (
                    <Link
                        to={`/list/${list.parentListId}`}
                        className="absolute top-16 sm:top-20 left-4 sm:left-6 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-white/80 hover:text-white hover:bg-black/60 text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {parentListName || 'Lista principal'}
                    </Link>
                )}

                <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 pb-10 sm:pb-14 z-10 max-w-7xl mx-auto w-full">

                    {/* Title & description */}
                    <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-bold text-white leading-tight mb-1 drop-shadow-lg">
                        {list.name}
                    </h1>
                    {list.description && (
                        <p className="text-gray-300/80 text-sm sm:text-base max-w-2xl line-clamp-2 leading-relaxed mb-3">
                            {list.description}
                        </p>
                    )}

                    {/* Status pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${list.parentListId ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'}`}>
                            {list.parentListId ? 'Sublista' : 'Lista'}
                        </span>
                        {/* Public/private only shown on sublists (user-owned) or to jefe */}
                        {(list.parentListId || isJefe) && (
                            list.isPublic ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Pública</span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> Privada
                                </span>
                            )
                        )}
                        {/* Role pill — only on sublists */}
                        {list.parentListId && (
                            user?.uid === list.userId ? (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Propietario</span>
                            ) : user && list.editors?.includes(user.uid) ? (
                                <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Editor</span>
                            ) : user && (list as any).publicAccess === 'writer' ? (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Colaborador</span>
                            ) : null
                        )}
                    </div>

                    {/* Bottom action bar */}
                    <div className="flex items-center justify-between gap-3">

                        {/* Left: author (sublists) + likes */}
                        <div className="flex items-center gap-2 min-w-0">
                            {list.parentListId && (
                                <Link
                                    to={`/profile/${list.userId}`}
                                    className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10 hover:bg-black/50 transition-colors shrink-0"
                                >
                                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-[9px] text-white font-bold">
                                        {list.authorName?.[0]?.toUpperCase() ?? '?'}
                                    </div>
                                    <span className="text-xs font-medium text-white/80 max-w-[100px] truncate">{list.authorName || 'Usuario'}</span>
                                </Link>
                            )}
                            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10 text-pink-400 text-xs font-bold shrink-0">
                                <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                                <span>{likeCount}</span>
                            </div>
                        </div>

                        {/* Right: actions */}
                        <div className="flex items-center gap-2 shrink-0">

                            {/* Primary CTA: Add Review — always visible */}
                            {canAddReview && (
                                <button
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden xs:inline">Añadir</span>
                                </button>
                            )}

                            {/* Desktop: secondary actions inline */}
                            <div className="hidden md:flex items-center gap-2">
                                {user && list.userId !== user.uid && (
                                    <button onClick={toggleLike} className={`px-3 py-2 text-sm font-bold rounded-xl border flex items-center gap-1.5 transition-all ${isLiked ? 'border-white/20 text-white hover:border-pink-500 hover:text-pink-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                                        <Heart className={`w-4 h-4 ${isLiked ? 'fill-current text-pink-400' : ''}`} />
                                        {isLiked ? 'Guardada' : 'Guardar'}
                                    </button>
                                )}
                                {!list.parentListId && (
                                    <button onClick={() => setIsSublistsModalOpen(true)} className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all">
                                        <ListIcon className="w-4 h-4" />
                                        Sublistas
                                        {sublists && sublists.length > 0 && (
                                            <span className="bg-indigo-500/20 px-1.5 py-0.5 rounded text-[10px] border border-indigo-500/30 text-indigo-200">{sublists.length}</span>
                                        )}
                                    </button>
                                )}
                                <button onClick={() => setIsPublicShareModalOpen(true)} className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-xl border border-white/10 flex items-center gap-1.5 transition-all">
                                    <Share2 className="w-4 h-4" /> Compartir
                                </button>
                                {canManageList && (
                                    <>
                                        <button onClick={() => setIsShareModalOpen(true)} className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-sm font-bold rounded-xl border border-indigo-500/20 flex items-center gap-1.5 transition-all">
                                            <Lock className="w-4 h-4" /> Permisos
                                        </button>
                                        <Link to={`/list/${list.id}/edit`} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-500/20">
                                            <Edit3 className="w-4 h-4" /> Editar
                                        </Link>
                                    </>
                                )}
                            </div>

                            {/* Mobile: overflow menu — fixed position to escape hero stacking context */}
                            <div className="md:hidden relative" ref={actionsMenuRef}>
                                <button
                                    ref={overflowBtnRef}
                                    onClick={() => {
                                        if (!isActionsMenuOpen && overflowBtnRef.current) {
                                            const rect = overflowBtnRef.current.getBoundingClientRect();
                                            setDropdownPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                                        }
                                        setIsActionsMenuOpen(v => !v);
                                    }}
                                    className="p-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-colors"
                                >
                                    {isActionsMenuOpen ? <X className="w-5 h-5" /> : <MoreVertical className="w-5 h-5" />}
                                </button>

                                {isActionsMenuOpen && dropdownPosition && (
                                    <div className="fixed w-52 bg-[#151b2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-1 z-[200]"
                                        style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
                                    >
                                        {user && list.userId !== user.uid && (
                                            <button
                                                onClick={() => { toggleLike(); setIsActionsMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left"
                                            >
                                                <Heart className={`w-4 h-4 shrink-0 ${isLiked ? 'fill-current text-pink-400' : ''}`} />
                                                {isLiked ? 'Quitar de guardados' : 'Guardar lista'}
                                            </button>
                                        )}
                                        {!list.parentListId && (
                                            <button
                                                onClick={() => { setIsSublistsModalOpen(true); setIsActionsMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left"
                                            >
                                                <ListIcon className="w-4 h-4 shrink-0 text-indigo-400" />
                                                Sublistas
                                                {sublists && sublists.length > 0 && (
                                                    <span className="ml-auto bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{sublists.length}</span>
                                                )}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setIsPublicShareModalOpen(true); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left"
                                        >
                                            <Share2 className="w-4 h-4 shrink-0 text-blue-400" />
                                            Compartir
                                        </button>
                                        {canManageList && (
                                            <>
                                                <button
                                                    onClick={() => { setIsShareModalOpen(true); setIsActionsMenuOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left"
                                                >
                                                    <Lock className="w-4 h-4 shrink-0 text-indigo-400" />
                                                    Permisos
                                                </button>
                                                <Link
                                                    to={`/list/${list.id}/edit`}
                                                    onClick={() => setIsActionsMenuOpen(false)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors"
                                                >
                                                    <Edit3 className="w-4 h-4 shrink-0 text-amber-400" />
                                                    Editar lista
                                                </Link>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map Collapsible */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 relative -mt-8 sm:-mt-12 z-20">
                <div className="glass-card rounded-xl overflow-hidden transition-all duration-300 shadow-2xl">
                    <div className="w-full p-3 flex items-center justify-between text-gray-300 bg-[#151b2e]/60 border-b border-white/5">
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

                            {/* Toggle cerrados/no disponibles */}
                            <button
                                onClick={() => setShowUnavailable(prev => !prev)}
                                className={`h-9 px-3 flex items-center gap-1.5 rounded-xl border transition-all text-xs font-bold active:scale-95 ${
                                    showUnavailable
                                        ? 'bg-red-500/20 border-red-500/30 text-red-400'
                                        : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                                }`}
                                title={showUnavailable ? 'Ocultar no disponibles' : 'Mostrar no disponibles'}
                            >
                                {showUnavailable ? '🔒' : '👁'} {showUnavailable ? 'Viendo todos' : 'No disp.'}
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
                isShareModalOpen && list && user && list.userId === user.uid && (
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

            <ShareModal
                isOpen={isPublicShareModalOpen}
                onClose={() => setIsPublicShareModalOpen(false)}
                title={`Compartir ${list.name}`}
                url={listShareUrl}
                text={`Mira esta ${list.parentListId ? 'sublista' : 'lista'} en Listopic: ${list.name}`}
                shareEntity={{
                    type: list.parentListId ? 'sublist' : 'list',
                    id: list.id,
                    title: list.name,
                    subtitle: listShareSubtitle,
                    route: `/list/${list.id}`,
                    url: listShareUrl,
                    imageUrl: listShareImage,
                    score: list.averageRating || list.avgScore,
                    reviewCount: list.reviewCount,
                    authorName: list.authorName,
                    criteriaStats: buildCriteriaStats(list.criteriaAverages, list.criteriaDefinition),
                }}
            />

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
