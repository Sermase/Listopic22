import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
    MapPin, MessageSquare, List as ListIcon, Share2,
    Bookmark, Heart, Smartphone, Globe, Accessibility, Utensils, ShoppingBag, Bike, Clock, Coffee, Wine, Moon, Star, Plus, X, AlertTriangle, Image as ImageIcon, ZoomIn, LayoutGrid
} from 'lucide-react';
import { ShareModal } from '../components/ShareModal';
import { SaveToArchiveModal } from '../components/SaveToArchiveModal';
import { usePlaceDetails } from '../hooks/usePlaceDetails';
import { ReviewCard } from '../components/ReviewCard';
import { MapView } from '../components/MapView';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, increment, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { AddReviewForm } from '../components/AddReviewForm';
import { ReportModal } from '../components/ReportModal';
import { Lightbox } from '../components/Lightbox';

import { ListSelector } from '../components/ListSelector';

export const PlacePage: React.FC = () => {
    const { placeId } = useParams<{ placeId: string }>();
    const { place, loading, error, refresh } = usePlaceDetails(placeId);
    const { user } = useAuth();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const fromListId = searchParams.get('listId');

    const [activeTab, setActiveTab] = useState<'reviews' | 'lists' | 'dishes' | 'photos'>('reviews');
    const [reviewViewMode, setReviewViewMode] = useState<'list' | 'gallery'>('gallery');
    const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isFollowed, setIsFollowed] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);

    // Review Creation State
    const [isFlowOpen, setIsFlowOpen] = useState(false);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [selectedDishName, setSelectedDishName] = useState<string | null>(null);
    const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

    // Infinite Scroll State
    const [visibleCount, setVisibleCount] = useState(4);
    const loadMoreRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => prev + 5);
            }
        }, { threshold: 0.1 });

        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [activeTab, visibleCount]);

    // Compute suggested list IDs where this place is already present
    const suggestedListIds = useMemo(() => {
        if (!place?.relatedLists) return [];
        return place.relatedLists.map(l => l.id);
    }, [place?.relatedLists]);

    const handleEditReview = (review: any) => {
        setEditingReviewId(review.id);
        setIsFlowOpen(true);
    };

    const [reactionConfig, setReactionConfig] = useState<{ like?: string; dislike?: string } | null>(null);

    // Fetch Category Configuration for Reactions
    useEffect(() => {
        if (!place?.category) return;
        import('../services/CategoryService').then(({ CategoryService }) => {
            CategoryService.getCategory(place.category!).then(cat => {
                if (cat?.defaultCriteria?.rangos) {
                    setReactionConfig(cat.defaultCriteria.rangos);
                }
            });
        });
    }, [place?.category]);

    // ... (rest of the file remains similar until render)


    // Check if place is followed
    useEffect(() => {
        if (!user || !placeId) return;
        const checkFollow = async () => {
            try {
                const docRef = doc(db, 'users', user.uid, 'followingPlaces', placeId);
                const snap = await getDoc(docRef);
                setIsFollowed(snap.exists());
            } catch (e) {
                console.warn("Check follow error", e);
            }
        };
        checkFollow();
    }, [user, placeId]);

    const handleFollowToggle = async () => {
        if (!user || !placeId) return; // Prompt login if needed

        // Optimistic UI
        const prevState = isFollowed;
        setIsFollowed(!prevState);
        setFollowLoading(true);

        try {
            const followingPlaceRef = doc(db, 'users', user.uid, 'followingPlaces', placeId);

            // Backend Trigger 'onPlaceFollowingWrite' in 'social.js' handles:
            // 1. Updating user.followingPlacesCount
            // 2. Updating place.followersCount (and ensuring place doc exists)

            if (prevState) {
                // Unfollow (Trigger delete)
                await deleteDoc(followingPlaceRef);
            } else {
                // Follow (Trigger create)
                await setDoc(followingPlaceRef, {
                    placeId,
                    followedAt: serverTimestamp(),
                    placeName: place?.name || '',
                    placeAddress: place?.address || '',
                    placePhoto: place?.photoUrl || ''
                });
            }
        } catch (error) {
            console.error("Follow place error:", error);
            setIsFollowed(prevState); // Revert
        } finally {
            setFollowLoading(false);
        }
    };

    // --- Dishes Aggregation (Menu Mode: Platos) ---
    const dishes = useMemo(() => {
        if (!place?.reviews) return [];

        const dishMap: Record<string, { total: number; count: number; name: string; photos: string[]; listId?: string }> = {};

        place.reviews.forEach(r => {
            if (!r.itemName) return;
            const name = r.itemName.trim();
            const key = name.toLowerCase();

            if (!dishMap[key]) {
                dishMap[key] = { total: 0, count: 0, name: name, photos: [], listId: r.listId };
            }
            dishMap[key].total += r.overallRating;
            dishMap[key].count += 1;
            if (r.photoUrl) dishMap[key].photos.push(r.photoUrl);
            // Update listId fallback if missing
            if (!dishMap[key].listId && r.listId) dishMap[key].listId = r.listId;
        });

        return Object.values(dishMap).map(d => ({
            name: d.name,
            avg: d.total / d.count,
            count: d.count,
            photo: d.photos[0],
            listId: d.listId
        })).sort((a, b) => b.avg - a.avg);
    }, [place?.reviews]);


    // Aggregate Photos for Gallery
    const galleryPhotos = useMemo(() => {
        if (!place) return [];
        const set = new Set<string>();

        // 1. Place Photos
        const placeAny = place as any;
        if (placeAny.photos && Array.isArray(placeAny.photos)) {
            placeAny.photos.forEach((p: string) => p && set.add(p));
        } else if (place.photoUrl) {
            set.add(place.photoUrl);
        }

        // 2. Review Photos
        if (place.reviews) {
            place.reviews.forEach(r => {
                if (r.photoUrl) set.add(r.photoUrl);
            });
        }

        return Array.from(set);
    }, [place]);



    // Helper for Price Level
    const renderPriceLevel = (level?: number) => {
        if (!level && level !== 0) return null;
        // Map 0-4 to € symbols. If string e.g 'PRICE_LEVEL_EXPENSIVE', logic needed. 
        // Assuming number 0-4 or similar.
        const count = typeof level === 'number' ? level : 2;
        return (
            <div className="flex text-emerald-400 font-bold" title="Nivel de precio">
                {[...Array(5)].map((_, i) => (
                    <span key={i} className={i < count ? 'opacity-100' : 'opacity-30 text-gray-500'}>€</span>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0b1021] animate-pulse">
                {/* Hero skeleton */}
                <div className="h-[40vh] min-h-[300px] bg-white/5" />
                <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 relative z-10">
                    {/* Title & address */}
                    <div className="h-10 bg-white/10 rounded w-2/3 mb-3" />
                    <div className="h-5 bg-white/5 rounded w-1/3 mb-8" />
                    {/* Stats row */}
                    <div className="flex gap-4 mb-8">
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                    </div>
                    {/* Review cards */}
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-40 bg-white/5 rounded-2xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error || !place) {
        return (
            <div className="min-h-screen pt-32 px-4 text-center bg-[#0b1021]">
                <h2 className="text-2xl font-bold text-red-400">Lugar no encontrado</h2>
                <Link to="/search" className="text-indigo-400 mt-4 inline-block hover:underline">
                    Volver a buscar
                </Link>
            </div>
        );
    }


    // Dynamic Color for Score

    const handleShareClick = () => {
        setIsShareModalOpen(true);
    };

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20">
            {/* Hero */}
            <div className="relative h-[40vh] min-h-[300px] w-full overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/60 to-black/40 z-10" />

                {place.photoUrl ? (
                    <img src={place.photoUrl} alt={place.name} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-1000" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-gray-900 flex items-center justify-center">
                        <MapPin className="w-20 h-20 text-white/20" />
                    </div>
                )}

                <div className="absolute bottom-0 left-0 w-full p-4 sm:p-8 pb-12 sm:pb-16 z-20 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/60 to-transparent pt-20">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6 relative z-30">

                        {/* Title & Info */}
                        <div className="flex-1">
                            <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-white mb-2 shadow-sm text-shadow-lg leading-tight line-clamp-2">
                                {place.name}
                            </h1>
                            {place.closedStatus && (
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold mb-2 border ${
                                    place.closedStatus === 'permanently_closed'
                                        ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                        : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                }`}>
                                    <AlertTriangle className="w-4 h-4" />
                                    {place.closedStatus === 'permanently_closed' ? 'Cerrado permanentemente' : 'Cerrado temporalmente'}
                                </div>
                            )}
                            {place.address && (
                                <p className="text-gray-200 flex items-center gap-2 text-sm sm:text-lg max-w-2xl font-light line-clamp-1">
                                    <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                                    {place.address}
                                </p>
                            )}
                        </div>

                        {/* Ratings & Awards Row */}
                        <div className="flex flex-col items-start md:items-end gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Listopic Rating */}
                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border backdrop-blur-md ${place.avgScore >= 7
                                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                    : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                                    }`}>
                                    <Star className="w-4 h-4 fill-current" />
                                    <span>{place.avgScore.toFixed(1)}</span>
                                </div>

                                {/* Google Rating */}
                                {place.googleRating && (
                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-white/10 border border-white/10 text-white backdrop-blur-md">
                                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-white" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .533 5.333.533 12S5.867 24 12.48 24c3.44 0 6.053-1.147 8.16-3.293 2.133-2.133 2.827-5.28 2.827-7.893 0-.693-.053-1.52-.16-2.16h-10.827z" />
                                        </svg>
                                        <span>{place.googleRating.toFixed(1)}</span>
                                        {place.googleUserRatingCount && (
                                            <span className="text-xs text-gray-400 font-normal ml-0.5 opacity-70">({place.googleUserRatingCount})</span>
                                        )}
                                    </div>
                                )}

                                {
                                    /* Awards removed */
                                }

                                {/* Add Review Button (New) */}
                                <button
                                    onClick={() => {
                                        if (fromListId) {
                                            setSelectedListId(fromListId);
                                            setIsFlowOpen(true);
                                        } else {
                                            setSelectedListId(null);
                                            setIsFlowOpen(true);
                                        }
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 hover:scale-105 transition-all ml-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Añadir Reseña</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content: Flex Col on Mobile (Order control), Grid on Desktop */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 relative -mt-8 sm:-mt-12 z-20 flex flex-col lg:grid lg:grid-cols-12 gap-8">

                {/* Sidebar (Right on Desktop, Top on Mobile) */}
                {/* Order-1 on Mobile -> Renders FIRST. lg:order-last -> Renders RIGHT. */}
                <div className="order-1 lg:col-span-4 lg:order-last space-y-4 sm:space-y-6">

                    {/* 1. Actions Row */}
                    <div className="glass-card p-3 rounded-2xl grid grid-cols-4 gap-2 sm:gap-3 shadow-lg">
                        <button
                            onClick={() => setIsSaveModalOpen(true)}
                            className="flex flex-col items-center justify-center p-2 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                        >
                            <Bookmark className="w-5 h-5 mb-1 text-indigo-400" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Guardar</span>
                        </button>
                        <button
                            onClick={handleFollowToggle}
                            disabled={followLoading}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${isFollowed ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'} ${followLoading ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            <Heart className={`w-5 h-5 mb-1 ${isFollowed ? 'fill-current' : ''}`} />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">{isFollowed ? 'Seguido' : 'Seguir'}</span>
                        </button>
                        <button
                            onClick={handleShareClick}
                            className="flex flex-col items-center justify-center p-2 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all active:scale-95 active:bg-indigo-500/20 active:border-indigo-500/50"
                        >
                            <Share2 className="w-5 h-5 mb-1 text-indigo-400" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Compartir</span>
                        </button>
                        <button
                            onClick={() => setShowReportModal(true)}
                            className="flex flex-col items-center justify-center p-2 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all group/report"
                        >
                            <AlertTriangle className="w-5 h-5 mb-1 text-red-500/50 group-hover/report:text-red-500 transition-colors" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Reportar</span>
                        </button>
                    </div>

                    {/* 2. Map */}
                    {place.coords && (
                        <div className="glass-card rounded-2xl overflow-hidden shadow-xl relative group">
                            <div className="absolute top-3 right-3 z-10">
                                <a
                                    href={place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${place.coords.lat},${place.coords.lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-lg text-white text-xs font-bold flex items-center gap-2 hover:bg-indigo-600 transition-colors border border-white/10"
                                >
                                    <MapPin className="w-3 h-3" />
                                    Abrir en Google Maps
                                </a>
                            </div>
                            <div className="h-48 sm:h-64 relative z-0">
                                <MapView
                                    items={[{
                                        id: place.placeId,
                                        placeId: place.placeId,
                                        name: place.name,
                                        lat: place.coords.lat,
                                        lng: place.coords.lng,
                                        photoUrl: place.photoUrl,
                                        rating: place.avgScore,
                                        reviewsCount: place.reviewCount
                                    }]}
                                />
                            </div>
                        </div>
                    )}

                    {/* 3. Detailed Info (New Rich Data) */}
                    <div className="glass-card p-5 rounded-2xl space-y-4 shadow-lg">
                        <h3 className="font-bold text-white border-b border-white/5 pb-2 text-sm uppercase tracking-wider">Detalles</h3>

                        {/* Price & Features Grid */}
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-white/5">
                            {place.priceLevel !== undefined && (
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">Precio</span>
                                    {renderPriceLevel(place.priceLevel)}
                                </div>
                            )}

                            {place.accessibility && (
                                <div className="col-span-2 sm:col-span-1">
                                    <span className="text-xs text-gray-500 block mb-1">Accesibilidad</span>
                                    <div className="space-y-1">
                                        {place.accessibility.wheelchairAccessibleEntrance && (
                                            <div className="flex items-center gap-2 text-indigo-400 font-medium text-xs">
                                                <Accessibility className="w-4 h-4" />
                                                <span>Entrada adaptada</span>
                                            </div>
                                        )}
                                        {place.accessibility.wheelchairAccessibleRestroom && (
                                            <div className="flex items-center gap-2 text-indigo-400 font-medium text-xs">
                                                <Accessibility className="w-4 h-4" />
                                                <span>Baño adaptado</span>
                                            </div>
                                        )}
                                        {!place.accessibility.wheelchairAccessibleEntrance && !place.accessibility.wheelchairAccessibleRestroom && (
                                            <span className="text-gray-400 text-xs">-</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Options Chips */}
                        <div className="flex flex-wrap gap-2">
                            {place.options?.delivery && (
                                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Bike className="w-3 h-3" /> Delivery
                                </span>
                            )}
                            {place.options?.takeout && (
                                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <ShoppingBag className="w-3 h-3" /> Takeaway
                                </span>
                            )}
                            {place.options?.dineIn && (
                                <span className="px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Utensils className="w-3 h-3" /> Restaurante
                                </span>
                            )}
                            {place.options?.reservable && (
                                <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Reservas
                                </span>
                            )}
                            {place.options?.servesBreakfast && (
                                <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Coffee className="w-3 h-3" /> Desayuno
                                </span>
                            )}
                            {place.options?.servesLunch && (
                                <span className="px-3 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Utensils className="w-3 h-3" /> Comida
                                </span>
                            )}
                            {place.options?.servesDinner && (
                                <span className="px-3 py-1 bg-slate-500/10 text-slate-300 border border-slate-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Moon className="w-3 h-3" /> Cena
                                </span>
                            )}
                            {(place.options?.servesBeer || place.options?.servesWine) && (
                                <span className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Wine className="w-3 h-3" /> Alcohol
                                </span>
                            )}
                        </div>

                        {/* Contact Buttons */}
                        <div className="flex flex-col gap-3 pt-2">
                            {place.website && (
                                <a
                                    href={place.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 group"
                                >
                                    <Globe className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    Visitar Sitio Web
                                </a>
                            )}
                            {place.phone && (
                                <a
                                    href={`tel:${place.phone}`}
                                    className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-sm transition-all border border-white/10 group"
                                >
                                    <Smartphone className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    Llamar ({place.phone})
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Left: Content (Tabs) */}
                {/* Order-2 on Mobile -> Renders SECOND. lg:order-first -> Renders LEFT. */}
                <div className="order-2 lg:col-span-8 lg:order-first">
                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar px-1 py-2">
                        <button
                            onClick={() => setActiveTab('reviews')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'reviews'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <MessageSquare className="w-4 h-4" /> Opiniones ({place.reviews.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('dishes')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'dishes'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <ListIcon className="w-4 h-4" /> La Carta ({dishes.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab('lists')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'lists'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <Bookmark className="w-4 h-4" /> Listas ({place.relatedLists?.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab('photos')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'photos'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <ImageIcon className="w-4 h-4" /> Fotos ({galleryPhotos.length})
                        </button>
                    </div>



                    {activeTab === 'reviews' && (
                        <div className="animate-fade-in">
                            {/* Reviews header with view toggle */}
                            <div className="flex justify-end mb-4">
                                <div className="flex bg-black/20 rounded-xl p-0.5 border border-white/10">
                                    <button
                                        onClick={() => setReviewViewMode('list')}
                                        className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${reviewViewMode === 'list' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                        title="Vista lista"
                                    >
                                        <ListIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setReviewViewMode('gallery')}
                                        className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${reviewViewMode === 'gallery' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                        title="Vista galería"
                                    >
                                        <LayoutGrid className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {reviewViewMode === 'gallery' ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2">
                                    {place.reviews.slice(0, visibleCount).map(review => {
                                        const score = (review as any).overallRating || 0;
                                        const scoreColor = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
                                        const photoSrc = (review as any).photoUrl || (review as any).placeMainImage || null;
                                        const isPlaceImg = !(review as any).photoUrl && !!(review as any).placeMainImage;
                                        const isExpanded = expandedReviewId === (review as any).id;

                                        if (isExpanded) {
                                            return (
                                                <div key={(review as any).id} className="col-span-3 sm:col-span-4 lg:col-span-5 bg-[#151b2e] rounded-xl border border-indigo-500/50 p-2 sm:p-4 mb-2 shadow-2xl animate-fade-in relative">
                                                    <button
                                                        onClick={() => setExpandedReviewId(null)}
                                                        className="absolute top-2 right-2 z-10 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-colors"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                    <ReviewCard
                                                        review={review}
                                                        reactionConfig={reactionConfig || undefined}
                                                        onEdit={handleEditReview}
                                                        placeClosedStatus={place.closedStatus}
                                                    />
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={(review as any).id}
                                                onClick={() => setExpandedReviewId((review as any).id)}
                                                className="group relative aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer border border-[#0b1021] hover:border-indigo-500 transition-colors"
                                            >
                                                {photoSrc ? (
                                                    <img
                                                        src={photoSrc}
                                                        alt={(review as any).authorName || ''}
                                                        className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${isPlaceImg ? 'opacity-40 saturate-50' : ''}`}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-[#151b2e] to-[#0b1021] flex items-center justify-center">
                                                        <MessageSquare className="w-6 h-6 text-gray-600" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                                                    <p className="text-[10px] sm:text-xs text-white font-bold line-clamp-1 leading-tight">{(review as any).authorName || 'Anónimo'}</p>
                                                </div>
                                                <div className={`absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full ${scoreColor} flex items-center justify-center shadow-lg`}>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-white">{score.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {visibleCount < place.reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center col-span-3 sm:col-span-4 lg:col-span-5">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-6">
                                    {place.reviews.slice(0, visibleCount).map(review => (
                                        <ReviewCard
                                            key={(review as any).id}
                                            review={review}
                                            reactionConfig={reactionConfig || undefined}
                                            onEdit={handleEditReview}
                                            placeClosedStatus={place.closedStatus}
                                        />
                                    ))}
                                    {visibleCount < place.reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'dishes' && (
                        <div className="animate-fade-in">
                            {dishes && dishes.length > 0 ? (
                                <div className="bg-[#0d111f] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                                    {/* Menu header */}
                                    <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
                                        <Utensils className="w-5 h-5 text-indigo-400" />
                                        <span className="font-bold text-white tracking-wide text-sm uppercase">La Carta</span>
                                        <span className="ml-auto text-xs text-gray-500">{dishes.length} platos</span>
                                    </div>
                                    <div className="divide-y divide-white/5">
                                        {dishes.map((dish, idx) => {
                                            const isTop = dish.avg >= 8.5 && idx < 3;
                                            const scoreColor = dish.avg >= 8 ? 'text-emerald-400' : dish.avg >= 6 ? 'text-amber-400' : 'text-red-400';
                                            return (
                                                <Link
                                                    key={idx}
                                                    to={`/group/${placeId}/${encodeURIComponent(dish.name)}`}
                                                    className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 hover:bg-white/5 transition-colors group"
                                                >
                                                    {/* Rank */}
                                                    <span className="text-xs font-mono text-gray-600 w-4 shrink-0 text-right">{idx + 1}</span>

                                                    {/* Photo thumbnail */}
                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-800 overflow-hidden shrink-0">
                                                        {dish.photo ? (
                                                            <img src={dish.photo} alt={dish.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Utensils className="w-4 h-4 text-gray-600" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Name + meta */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors text-sm sm:text-base truncate">{dish.name}</span>
                                                            {isTop && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">★ Top</span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-500">{dish.count} {dish.count === 1 ? 'opinión' : 'opiniones'}</span>
                                                    </div>

                                                    {/* Score */}
                                                    <span className={`text-base sm:text-lg font-black font-mono ${scoreColor} shrink-0`}>{dish.avg.toFixed(1)}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-10 text-gray-500">
                                    No hay suficientes datos para mostrar la carta.
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'lists' && (
                        <div className="space-y-8 animate-fade-in">
                            {(() => {
                                const mainLists = place.relatedLists?.filter(l => !l.parentListId) || [];
                                const subLists = place.relatedLists?.filter(l => !!l.parentListId) || [];

                                if (mainLists.length === 0 && subLists.length === 0) {
                                    return (
                                        <div className="py-10 text-center text-gray-500 border border-dashed border-white/10 rounded-xl">
                                            Este lugar aún no ha sido añadido a otras listas públicas.
                                        </div>
                                    );
                                }

                                return (
                                    <>
                                        {mainLists.length > 0 && (
                                            <div>
                                                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                                    <ListIcon className="w-5 h-5 text-indigo-400" />
                                                    Listas ({mainLists.length})
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {mainLists.map((list: any) => (
                                                        <Link key={list.id} to={`/list/${list.id}`} className="block group">
                                                            <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all h-full flex flex-col">
                                                                <div className="h-32 bg-gray-800 relative">
                                                                    {list.photoUrl ? (
                                                                        <img src={list.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                            <ListIcon className="w-10 h-10 text-gray-600" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="p-4 flex-1 flex flex-col justify-between">
                                                                    <div>
                                                                        <h3 className="text-white font-bold text-lg mb-1 truncate">{list.name}</h3>
                                                                        <p className="text-gray-500 text-xs line-clamp-2">{list.description}</p>
                                                                    </div>
                                                                    <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                        {/* Hiding Author as requested */}
                                                                        <span className="text-xs text-indigo-400 font-medium group-hover:underline">Ver Lista</span>
                                                                        <span className="text-xs text-gray-500">{list.itemCount || 0} lugares</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {subLists.length > 0 && (
                                            <div>
                                                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                                    <div className="p-1 bg-purple-500/20 rounded text-purple-400"><ListIcon className="w-4 h-4" /></div>
                                                    Sublistas ({subLists.length})
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {subLists.map((list: any) => (
                                                        <Link key={list.id} to={`/list/${list.id}`} className="block group">
                                                            <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all h-full flex flex-col relative">
                                                                <div className="h-32 bg-gray-800 relative">
                                                                    {list.photoUrl ? (
                                                                        <img src={list.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                            <ListIcon className="w-10 h-10 text-gray-600" />
                                                                        </div>
                                                                    )}
                                                                    <div className="absolute top-2 right-2 p-1 bg-black/50 rounded backdrop-blur-md">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">Sublista</span>
                                                                    </div>
                                                                </div>
                                                                <div className="p-4 flex-1 flex flex-col justify-between">
                                                                    <div>
                                                                        <h3 className="text-white font-bold text-lg mb-1 truncate">{list.name}</h3>
                                                                        <p className="text-gray-500 text-xs line-clamp-2">{list.description}</p>
                                                                    </div>
                                                                    <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                        {/* Hiding Author */}
                                                                        <span className="text-xs text-purple-400 font-medium group-hover:underline">Ver Sublista</span>
                                                                        <span className="text-xs text-gray-500">{list.itemCount || 0} lugares</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )
                    }

                    {
                        activeTab === 'photos' && (
                            <div className="animate-fade-in">
                                {galleryPhotos.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {galleryPhotos.map((photo, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    setLightboxIndex(idx);
                                                    setIsLightboxOpen(true);
                                                }}
                                                className="aspect-square rounded-xl overflow-hidden bg-gray-800 cursor-pointer group relative border border-white/5 hover:border-indigo-500/50 transition-all"
                                            >
                                                <img src={photo} alt="Lugar" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                    <div className="bg-black/50 backdrop-blur-sm p-2 rounded-full text-white">
                                                        <ZoomIn className="w-5 h-5" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-16 text-center bg-[#151b2e] rounded-xl border border-dashed border-white/10">
                                        <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                        <h3 className="text-white font-bold">Sin fotos</h3>
                                        <p className="text-gray-500 text-sm">Aún no hay fotos de este lugar.</p>
                                    </div>
                                )}
                            </div>
                        )
                    }

                    <Lightbox
                        isOpen={isLightboxOpen}
                        onClose={() => setIsLightboxOpen(false)}
                        images={galleryPhotos}
                        initialIndex={lightboxIndex}
                    />
                </div >
            </main >

            <SaveToArchiveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                item={{
                    itemId: place.placeId,
                    type: 'place',
                    name: place.name,
                    subtitle: place.address,
                    route: `/place/${place.placeId}`,
                    photoUrl: place.photoUrl || undefined
                }}
            />

            {/* Review Creation Flow */}
            {/* Direct access to Form - internal list selection if needed */}
            {
                isFlowOpen && (
                    <AddReviewForm
                        listId={selectedListId}
                        onListChange={setSelectedListId}
                        prefillPlaceId={place.placeId}
                        prefillItemName={selectedDishName || undefined}
                        editReviewId={editingReviewId || undefined}
                        lockList={false}
                        onClose={() => {
                            setIsFlowOpen(false);
                            setSelectedListId(null);
                            setSelectedDishName(null);
                            setEditingReviewId(null);
                        }}
                        onSuccess={() => {
                            setIsFlowOpen(false);
                            setSelectedListId(null);
                            setSelectedDishName(null);
                            // Maybe refresh reviews? Realtime updates handle it.
                            if (refresh) refresh();
                        }}
                        suggestedListIds={suggestedListIds}
                    />
                )
            }
            {/* Share Modal */}
            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                title={`Compartir ${place.name}`}
                place={place}
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetId={place.placeId}
                targetName={place.name}
                targetType="place"
            />
        </div >
    );
};
