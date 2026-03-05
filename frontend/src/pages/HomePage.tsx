import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getExpandedRangeValue, useFilters } from '../context/FilterContext';
import { useLists } from '../hooks/useLists';
import { useUsers } from '../hooks/useUsers';
import { useReviews } from '../hooks/useReviews';
import { ReviewCard } from '../components/ReviewCard';
import { ReviewCarouselItem } from '../components/ReviewCarouselItem';
import { CardCarousel } from '../components/CardCarousel';
import { MapView } from '../components/MapView';
import { Map as MapIcon, ChevronDown, Heart, MapPin, List as ListIcon, MessageCircle, Layers, Users, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocation } from '../hooks/useLocation';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { updateProfile } from 'firebase/auth';
import {
    completeUserProfileSetup,
    getUsernameGateStatus,
    isUserProfileServiceError,
    type UserProfileFormData,
} from '../services/UserProfileService';
import { USERNAME_MAX_LENGTH } from '../utils/username';

/* 
    HOMEPAGE (Legacy Screenshot Match + Functional Logic: Categories & Range)
*/

export const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { location, calculateDistance, requestLocation } = useLocation();
    const navigate = useNavigate();

    // UI State
    const [activeTab, setActiveTab] = useState<'explore' | 'news'>('explore');
    const [activeFilter, setActiveFilter] = useState('Todo'); // Category Filter

    // Global Distance Range State
    const { range, setRange, toggleRange, getRangeLabel } = useFilters();

    const [isMapOpen, setIsMapOpen] = useState(false);
    const [gateLoading, setGateLoading] = useState(false);
    const [showProfileGate, setShowProfileGate] = useState(false);
    const [gateSubmitting, setGateSubmitting] = useState(false);
    const [gateError, setGateError] = useState<string | null>(null);
    const [gateForm, setGateForm] = useState<UserProfileFormData>({
        username: '',
        displayName: '',
        name: '',
        surnames: '',
        location: '',
        bio: '',
    });

    useEffect(() => {
        let cancelled = false;

        const checkProfileGate = async () => {
            if (!user) {
                if (!cancelled) {
                    setGateLoading(false);
                    setShowProfileGate(false);
                    setGateError(null);
                }
                return;
            }

            setGateLoading(true);
            try {
                const status = await getUsernameGateStatus({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoUrl: user.photoURL,
                });

                if (cancelled) return;

                setGateForm(status.prefill);
                setShowProfileGate(status.requiresCompletion);
                if (status.requiresCompletion && status.reason === 'claim_conflict') {
                    setGateError('Ese nombre de usuario ya está ocupado. Elige otro para continuar.');
                } else {
                    setGateError(null);
                }
            } catch (error) {
                if (cancelled) return;
                console.error('[HomePage] Error validating username gate:', error);
                setShowProfileGate(true);
                setGateError('No se pudo validar tu perfil. Inténtalo de nuevo.');
            } finally {
                if (!cancelled) {
                    setGateLoading(false);
                }
            }
        };

        void checkProfileGate();

        return () => {
            cancelled = true;
        };
    }, [user?.uid, user?.email, user?.displayName, user?.photoURL]);

    const handleGateFieldChange = (field: keyof UserProfileFormData, value: string) => {
        setGateForm(prev => ({ ...prev, [field]: value }));
    };

    const handleCompleteProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!user) return;

        setGateSubmitting(true);
        setGateError(null);
        try {
            const result = await completeUserProfileSetup({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoUrl: user.photoURL,
            }, gateForm);

            if (user.displayName !== result.displayName) {
                await updateProfile(user, { displayName: result.displayName });
            }

            setShowProfileGate(false);
            setGateError(null);
        } catch (error) {
            if (isUserProfileServiceError(error)) {
                if (error.code === 'username-taken') {
                    setGateError('Ese nombre de usuario ya está en uso. Prueba otro.');
                } else if (error.code === 'username-immutable') {
                    setGateError('Tu username actual ya está bloqueado y no se puede cambiar.');
                } else {
                    setGateError(error.message || 'No se pudo guardar tu perfil.');
                }
            } else {
                console.error('[HomePage] Error completing profile gate:', error);
                setGateError('No se pudo guardar tu perfil. Inténtalo de nuevo.');
            }
        } finally {
            setGateSubmitting(false);
        }
    };

    // Following Logic
    const [followingIds, setFollowingIds] = useState<string[]>([]);
    useEffect(() => {
        if (!user) return;
        const fetchFollowing = async () => {
            const q = query(collection(db, 'users', user.uid, 'following'));
            const snap = await getDocs(q);
            setFollowingIds(snap.docs.map(d => d.id));
        };
        fetchFollowing();
    }, [user]);

    // Infinite Scroll / Pagination
    const [visibleCount, setVisibleCount] = useState(4);
    const loadMoreRef = React.useRef<HTMLDivElement>(null);

    // --- DATA FETCHING (Dynamic based on Tab) ---
    // Explore -> Top Rated/Trending; News -> Following
    const listSort = activeTab === 'explore' ? 'top_rated' : 'recent'; // Lists still use 'recent' for news

    const reviewSortParam = useMemo(() => {
        console.log(`[HomePage] Building reviewSortParam. Tab: ${activeTab}, followingIds length: ${followingIds.length}`);
        return activeTab === 'explore'
            ? { type: 'trending' as const, limit: 100 } // Fetch more for geo-filtering
            : { type: 'following' as const, followingIds, limit: 10 }; // Fetch a smaller chunk initially to allow pagination
    }, [activeTab, followingIds]);

    const { lists, loading: loadingLists } = useLists(listSort);
    const { reviews, loading: loadingReviews, fetchMore, hasMore, loadingMore } = useReviews(reviewSortParam);
    const { users: topUsers, loading: loadingUsers } = useUsers();

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                // Increase locally visible count
                setVisibleCount(prev => prev + 5);
                // Also trigger backend fetch if we are running out of local items and the backend has more
                if (activeTab === 'news' && !loadingMore && hasMore) {
                    fetchMore();
                }
            }
        }, { threshold: 0.5 });

        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [activeTab, visibleCount, hasMore, loadingMore, fetchMore]); // Re-attach when dependencies change
    // Reset count when tab/filter changes
    useEffect(() => {
        setVisibleCount(4);
    }, [activeTab, activeFilter]);

    // --- FILTERING LOGIC ---

    // 1. Helper: Check Category (User Request: Hmm/Woow/Yujuui are categories)
    const checkCategory = (item: any) => {
        if (activeFilter === 'Todo') return true;

        const catId = item.categoryId || item.category || '';
        const filterNorm = activeFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
        const catNorm = String(catId).toLowerCase().replace(/[^a-z0-9]/g, '');

        if (catNorm.includes(filterNorm)) return true;

        if (item.availableTags && Array.isArray(item.availableTags)) {
            if (item.availableTags.some((t: string) => t.toLowerCase().includes(filterNorm))) return true;
        }

        if (item.listCategory || item.category) {
            const itemCat = String(item.listCategory || item.category).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (itemCat.includes(filterNorm)) return true;
        }

        return false;
    };

    // 2. Helper: Check Distance
    const checkDistance = (lat?: number, lng?: number) => {
        if (!range || !location || !lat || !lng) return true;
        const dist = calculateDistance(lat, lng);
        if (dist === null) return true;
        return dist <= range;
    };

    // 3. Derived & Filtered Lists
    const filteredLists = useMemo(() => {
        return lists.filter(l => {
            const matchesCategory = checkCategory(l);
            const matchesDist = checkDistance(l.lat, l.lng);
            return matchesCategory && matchesDist;
        });
    }, [lists, activeFilter, range, location]);

    // 4. Derived & Filtered Items (Reviews)
    // We need the FULL list for calcs, not just the sliced one for display
    const reviewsInRange = useMemo(() => {
        return reviews.filter(r => {
            const matchesCategory = checkCategory(r);
            const lat = (r as any).placeLat || (r as any).lat;
            const lng = (r as any).placeLng || (r as any).lng;
            const matchesDist = checkDistance(lat, lng);
            return matchesCategory && matchesDist;
        });
    }, [reviews, activeFilter, range, location]);

    const filteredItems = useMemo(() => {
        const base = [...reviewsInRange];

        if (activeTab === 'news') {
            // Sort by Date Descending
            return base.sort((a, b) => {
                const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return dateB - dateA;
            });
        }

        // "Mejor en Listopic" (Best Rated items/reviews in range)
        return base
            .sort((a, b) => (b.placeAverageRating || b.overallRating || 0) - (a.placeAverageRating || a.overallRating || 0))
            .slice(0, 15);
    }, [reviewsInRange, activeTab]);

    // 4b. Carousel Reviews (Specific Logic: Last 2 Months + Top Liked + Filtered by Range/Cat)
    const carouselReviews = useMemo(() => {
        // "Reseñas que gustan" (Trending/Liked in range)
        return reviewsInRange
            .sort((a, b) => (b.reactionCounts?.like || 0) - (a.reactionCounts?.like || 0))
            .slice(0, 15);
    }, [reviewsInRange]);

    // 4c. Recent Reviews (Strictly by Date + In Range)
    const recentReviewsInRange = useMemo(() => {
        return [...reviewsInRange].sort((a, b) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return dateB - dateA;
        }).slice(0, 15);
    }, [reviewsInRange]);



    // --- MAP DATA ENRICHMENT ---
    // Fetch actual places from 'places' collection to populate Map beyond just Feed items
    const [extraPlaces, setExtraPlaces] = useState<any[]>([]);
    const [placesLimit, setPlacesLimit] = useState(20); // Start small for speed

    useEffect(() => {
        // Upgrade to full fetch after initial render (Background Loading)
        const timer = setTimeout(() => {
            setPlacesLimit(100);
        }, 2000); // Wait 2s to allow main content to settle
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const fetchExtraPlaces = async () => {
            try {
                // Fetch top rated and recent places to ensure map is populated
                // Note: Real geo-querying would be better, but for now we fetch a healthy batch
                const q = query(collection(db, 'places'), limit(placesLimit));
                const snap = await getDocs(q);

                const mapped = snap.docs.map(d => {
                    const data = d.data();
                    const lat = data.location?.latitude || data.coordinates?.latitude || data.lat;
                    const lng = data.location?.longitude || data.coordinates?.longitude || data.lng;
                    return {
                        id: d.id,
                        placeId: d.id,
                        name: data.name,
                        address: data.address || data.formatted_address,
                        photoUrl: data.mainImageUrl || data.photoUrl,
                        rating: data.averageRating || data.googleRating || 0,
                        reviewsCount: data.reviewsCount || 0,
                        lat, lng,
                        items: [] // No specific items for these unless we fetch subcollections
                    };
                }).filter(p => p.lat && p.lng && p.reviewsCount > 0); // Only places with location AND reviews

                setExtraPlaces(mapped);
            } catch (e) {
                console.error("Error fetching map places:", e);
            }
        };

        if (activeTab === 'explore') {
            fetchExtraPlaces();
        }
    }, [activeTab, placesLimit]);

    // 5. Derived Places (Unique from Reviews -> Filtered) + Extra Places
    const filteredPlaces = useMemo(() => {
        const uniquePlaces = new Map();

        // 1. Add places from Reviews (High priority - have rich item data)
        reviewsInRange.forEach(r => {
            if (r.placeId) {
                if (uniquePlaces.has(r.placeId)) {
                    const existing = uniquePlaces.get(r.placeId);
                    existing.reviewsCount = (existing.reviewsCount || 0) + 1;
                    if (!existing.photoUrl && (r.placeMainImage || r.photoUrl)) {
                        existing.photoUrl = r.placeMainImage || r.photoUrl;
                    }
                    uniquePlaces.set(r.placeId, existing);
                } else {
                    const lat = (r as any).placeLat;
                    const lng = (r as any).placeLng;
                    uniquePlaces.set(r.placeId, {
                        id: r.placeId,
                        placeId: r.placeId,
                        name: r.placeName || r.itemName,
                        address: r.placeAddress,
                        photoUrl: r.placeMainImage || r.photoUrl,
                        rating: r.placeAverageRating || r.overallRating,
                        reviewsCount: 1,
                        lat, lng,
                        items: [] // Can populate if needed
                    });
                }
            }
        });

        // 2. Add Extra Places (if not already present)
        extraPlaces.forEach(p => {
            if (!uniquePlaces.has(p.id)) {
                // Check distance filter for these too!
                if (checkDistance(p.lat, p.lng)) {
                    uniquePlaces.set(p.id, p);
                }
            }
        });

        // Sort: "Los lugares de más nota a menos."
        return Array.from(uniquePlaces.values()).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }, [reviewsInRange, extraPlaces, range, location, activeFilter]);

    const hasHomeMapCandidates = useMemo(() => {
        const filterNorm = activeFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchesCategory = (item: any) => {
            if (activeFilter === 'Todo') return true;

            const catId = item.categoryId || item.category || '';
            const catNorm = String(catId).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (catNorm.includes(filterNorm)) return true;

            if (item.availableTags && Array.isArray(item.availableTags)) {
                if (item.availableTags.some((t: string) => t.toLowerCase().includes(filterNorm))) return true;
            }

            if (item.listCategory || item.category) {
                const itemCat = String(item.listCategory || item.category).toLowerCase().replace(/[^a-z0-9]/g, '');
                if (itemCat.includes(filterNorm)) return true;
            }

            return false;
        };

        const reviewCandidates = reviews.some((review: any) => {
            if (!matchesCategory(review)) return false;
            const lat = review.placeLat || review.lat;
            const lng = review.placeLng || review.lng;
            return !!review.placeId && !!lat && !!lng;
        });

        const extraPlaceCandidates = extraPlaces.some((place: any) => !!place?.id && !!place?.lat && !!place?.lng);

        return reviewCandidates || extraPlaceCandidates;
    }, [reviews, extraPlaces, activeFilter]);

    useEffect(() => {
        if (activeTab !== 'explore') return;
        if (range === null || !location) return;
        if (loadingReviews) return;
        if (!hasHomeMapCandidates) return;
        if (filteredPlaces.length > 0) return;

        const nextRange = getExpandedRangeValue(range);
        if (nextRange !== range) {
            setRange(nextRange);
        }
    }, [activeTab, range, location, loadingReviews, hasHomeMapCandidates, filteredPlaces.length, setRange]);

    // 6. Derived Users (Synthesized from content IN RANGE)
    // "Así aparecerán usuarios, ordenados de más resñas dentro de ese rango a menos."
    const activeUsersInRange = useMemo(() => {
        const userStats = new Map<string, { count: number, user: any }>();

        // Agregate counts from REVIEWS visible in current range
        reviewsInRange.forEach(r => {
            const uid = r.userId || r.authorId;
            if (uid) {
                if (!userStats.has(uid)) {
                    // Try to find full metadata from topUsers if available, else build minimal
                    const meta = topUsers.find(u => u.uid === uid) || {
                        uid,
                        displayName: r.authorName || 'Usuario',
                        photoUrl: r.authorPhoto,
                        username: 'user',
                        followersCount: 0 // We don't use this for sorting anymore
                    };
                    userStats.set(uid, { count: 0, user: meta });
                }

                const entry = userStats.get(uid)!;
                entry.count++;
                // If we found a photo here and didn't have one, update it
                if (!entry.user.photoUrl && r.authorPhoto) {
                    entry.user.photoUrl = r.authorPhoto;
                }
            }
        });

        // Convert map to array, filter > 0, sort by count desc
        return Array.from(userStats.values())
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count)
            .map(item => ({
                ...item.user,
                reviewsInRangeCount: item.count // Attach the specific count
            }));

    }, [reviewsInRange, topUsers]);

    // 7. Lists with Range Stats
    const listsWithRangeStats = useMemo(() => {
        // Map lists to attach dynamic review count based on reviewsInRange
        return filteredLists.map(list => {
            // If Range is NULL (Infinite), use the static total count from DB to be accurate
            // regardless of how many reviews we have loaded in memory.
            if (range === null) {
                return {
                    ...list,
                    reviewsInRangeCount: list.reviewCount || 0
                };
            }

            // Otherwise, calculate based on loaded reviews (best effort for specific range)
            const count = reviewsInRange.filter(r => r.listId === list.id).length;
            return {
                ...list,
                reviewsInRangeCount: count
            };
        });
    }, [filteredLists, reviewsInRange, range]);


    const handleToggleRange = () => {
        if (!location) {
            requestLocation();
        }
        toggleRange();
    };

    if (user && gateLoading) {
        return (
            <div className="min-h-screen bg-[#0b1021] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
        );
    }

    if (user && showProfileGate) {
        return (
            <div className="min-h-screen bg-[#0b1021] px-4 py-12 flex items-center justify-center">
                <div className="w-full max-w-2xl bg-[#151b2e] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Completa tu perfil</h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Antes de entrar en Home necesitas un username válido.
                    </p>

                    <form onSubmit={handleCompleteProfileSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                Username (obligatorio)
                            </label>
                            <input
                                type="text"
                                value={gateForm.username}
                                onChange={(e) => handleGateFieldChange('username', e.target.value)}
                                maxLength={USERNAME_MAX_LENGTH}
                                required
                                className="w-full bg-[#0b1021] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                                placeholder="sin espacios, máximo 18"
                            />
                            <p className="text-[11px] text-amber-300 mt-2">
                                El username es único, no puede tener espacios y no se podrá cambiar después.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={gateForm.displayName}
                                    onChange={(e) => handleGateFieldChange('displayName', e.target.value)}
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                                    placeholder="por defecto será el username"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    value={gateForm.name}
                                    onChange={(e) => handleGateFieldChange('name', e.target.value)}
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                                    placeholder="opcional"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                    Apellidos
                                </label>
                                <input
                                    type="text"
                                    value={gateForm.surnames}
                                    onChange={(e) => handleGateFieldChange('surnames', e.target.value)}
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                                    placeholder="opcional"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                    Lugar
                                </label>
                                <input
                                    type="text"
                                    value={gateForm.location}
                                    onChange={(e) => handleGateFieldChange('location', e.target.value)}
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                                    placeholder="opcional"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                Biografía
                            </label>
                            <textarea
                                value={gateForm.bio}
                                onChange={(e) => handleGateFieldChange('bio', e.target.value)}
                                rows={4}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                                placeholder="opcional"
                            />
                        </div>

                        {gateError && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-200">
                                {gateError}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={gateSubmitting}
                            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {gateSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            Guardar y continuar
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20 font-sans">
            <div className="pt-24 px-4 pb-6">

                {/* Hero Section (Clean) */}
                <div className="max-w-4xl mx-auto mb-8 text-center pt-4">
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-3 select-none">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 drop-shadow-[0_0_25px_rgba(99,102,241,0.4)]">
                            LISTOPIC
                        </span>
                    </h1>
                    <p className="text-lg md:text-xl text-gray-400 font-light tracking-wide max-w-xl mx-auto">
                        Donde tus ideas cobran <span className="text-indigo-400 font-bold">vida</span> y el mundo las <span className="text-purple-400 font-bold">descubre</span>.
                    </p>
                </div>

                {/* Navigation Pills */}
                <div className="flex justify-center mt-8 gap-4">
                    <div className="inline-flex bg-[#151b2e] p-1 rounded-full border border-white/10">
                        <button
                            onClick={() => setActiveTab('explore')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'explore'
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Explorar
                        </button>
                        <button
                            onClick={() => setActiveTab('news')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'news'
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Novedades
                        </button>
                    </div>
                </div>

                {/* Filter Chips (Categories) */}
                <div className="flex flex-wrap justify-between items-center mt-8 gap-4">
                    <div className="flex-1"></div>


                </div>


                {/* Map Collapsible */}
                {activeTab === 'explore' && (
                    <div className="max-w-7xl mx-auto mb-8">
                        <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden transition-all duration-300">
                            <div className="w-full p-3 flex items-center justify-between text-gray-300 bg-[#1e2538]/50">
                                <button
                                    onClick={() => setIsMapOpen(!isMapOpen)}
                                    className="flex items-center gap-2 hover:text-white transition-colors flex-1 text-left"
                                >
                                    <MapIcon className="w-5 h-5 text-gray-400" />
                                    <span className="font-bold text-sm">Mapa</span>
                                </button>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleRange(); }}
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

                            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isMapOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                <div className="overflow-hidden min-h-0">
                                    <div className="h-[400px] border-t border-white/10 relative">
                                        <MapView items={filteredPlaces} mode="global" range={range} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="max-w-[95%] mx-auto space-y-1">


                    {activeTab === 'explore' && (<>
                        {/* 1. Listas */
                        }
                        {/* 1. Listas */}
                        <CardCarousel
                            title={activeTab === 'explore' ? "Listas con más reseñas" : "Listas Recientes"}
                            viewAllLink={`/search?type=lists&sort=${activeTab === 'explore' ? 'most_reviewed' : 'latest'}`}
                            items={activeTab === 'explore'
                                ? listsWithRangeStats.sort((a, b) => (b.reviewsInRangeCount ?? b.reviewCount ?? 0) - (a.reviewsInRangeCount ?? a.reviewCount ?? 0)).slice(0, 10)
                                : filteredLists}
                            loading={loadingLists}
                            renderItem={(list: any, index: number) => (
                                <Link to={`/list/${list.id}`} className="block relative group h-40 md:h-48 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-10 origin-center">
                                    {(list.mainImageUrl || list.photoUrl) ? (
                                        <div className="absolute inset-0">
                                            <img src={list.mainImageUrl || list.photoUrl} alt={list.name} className="w-full h-full object-cover" />
                                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full bg-zinc-800" />
                                    )}

                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm" title="Total de lugares en la lista">
                                        {list.itemCount}
                                    </div>
                                    <div className="absolute top-2 left-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                        #{index + 1}
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                        <h3 className="text-white font-bold text-sm leading-tight mb-1 drop-shadow-sm line-clamp-1">{list.name}</h3>

                                        {/* Stats Row: Reviews, Followers */}
                                        <div className="flex items-center gap-4 opacity-90 text-xs text-gray-300 font-medium">
                                            <div className="flex items-center gap-1.5" title="Reseñas dentro de tu rango de distancia">
                                                <MessageCircle className="w-3.5 h-3.5 text-indigo-400" />
                                                <span>{list.reviewsInRangeCount !== undefined ? list.reviewsInRangeCount : (list.reviewCount || 0)}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5" title="Seguidores de la lista">
                                                <Users className="w-3.5 h-3.5 text-rose-400" />
                                                <span>{list.followersCount || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            )}
                        />

                        {/* 2. Items */}
                        <CardCarousel
                            title={activeTab === 'explore' ? "Mejor en Listopic" : "Últimos Items"}
                            viewAllLink={`/search?type=items&sort=${activeTab === 'explore' ? 'top_rated' : 'latest'}`}
                            items={filteredItems} // filteredItems are likely top rated in 'explore' mode already via useReviews('trending')
                            loading={loadingReviews}
                            renderItem={(item: any) => (
                                <ReviewCarouselItem review={item} variant="item" />
                            )}
                        />

                        {/* 3. NEW: Reseñas Recientes (Strictly by Date) */}
                        <CardCarousel
                            title="Reseñas recientes"
                            viewAllLink="/search?type=items&sort=latest"
                            items={recentReviewsInRange}
                            loading={loadingReviews}
                            renderItem={(item: any) => (
                                <ReviewCarouselItem review={item} variant="review" />
                            )}
                        />

                        {/* 3. Usuarios activos */}
                        <CardCarousel
                            title="Usuarios activos"
                            viewAllLink="/search?type=users"
                            items={activeUsersInRange}
                            loading={loadingUsers} // Technically we are deriving this from reviews now, but loadingUsers is still a fine proxy or we could use loadingReviews
                            itemClassName="w-auto mr-3"
                            renderItem={(user: any) => (
                                <Link to={`/profile/${user.uid}`} className="flex flex-col items-center gap-1 group p-2 rounded-md hover:bg-white/5 transition-colors w-24 md:w-32 shrink-0">
                                    <div className="relative w-16 h-16 md:w-20 md:h-20">
                                        <img src={user.photoUrl || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="User" className="w-full h-full rounded-full object-cover border-2 border-transparent group-hover:border-white transition-all" />
                                    </div>
                                    <div className="text-center w-full">
                                        <h4 className="text-white font-bold text-xs truncate w-full">{user.displayName}</h4>
                                        <p className="text-gray-500 text-[10px] truncate">@{user.username || 'user'}</p>
                                        <p className="text-[9px] text-indigo-400 font-medium mt-0.5">
                                            {user.reviewsInRangeCount ?? 0} Reseñas
                                        </p>
                                    </div>
                                </Link>
                            )}
                        />

                        {/* 4. Lugares top */}
                        <CardCarousel
                            title={activeTab === 'explore' ? "Lugares top" : "Nuevos Lugares"}
                            viewAllLink={`/search?type=places&sort=${activeTab === 'explore' ? 'rating' : 'latest'}`}
                            items={filteredPlaces}
                            loading={loadingReviews}
                            renderItem={(place: any) => (
                                <Link to={`/place/${place.id}`} className="block relative group h-40 md:h-48 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-10 bg-zinc-900">
                                    {place.photoUrl ? (
                                        <div className="absolute inset-0">
                                            <img src={place.photoUrl} alt={place.name} className="w-full h-full object-cover" />
                                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full bg-blue-900/20" />
                                    )}

                                    <div className="absolute top-2 right-2 bg-teal-600 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm">
                                        {place.rating?.toFixed(1) || 9.5}
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                        <h3 className="text-white font-bold text-sm leading-tight mb-1 truncate">{place.name}</h3>
                                        <p className="text-gray-300 text-[10px] flex items-center gap-1 opacity-80">
                                            <MapPin className="w-3 h-3" /> {place.address?.split(',')[0]}
                                        </p>
                                    </div>
                                </Link>
                            )}
                        />


                    </>)}


                    {/* 5. Resenas / Feed */}
                    {activeTab === 'news' ? (
                        <div className="max-w-2xl mx-auto mt-12 pb-20">
                            {filteredItems.length === 0 ? (
                                <div className="text-center text-gray-500 py-10 border border-white/5 rounded-xl bg-white/5 mx-4">
                                    <p className="font-bold text-white mb-2">Tu feed está tranquilo</p>
                                    <p className="text-sm">No hay actividad reciente de personas que sigues.</p>
                                    <p className="text-xs mt-4 text-indigo-400">¡Explora y sigue a usuarios para ver sus reseñas aquí!</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {filteredItems.slice(0, visibleCount).map((review: any) => (
                                        <ReviewCard key={review.id} review={review} />
                                    ))}
                                    {(visibleCount < filteredItems.length || hasMore) && (
                                        <div ref={loadMoreRef} className="py-8 flex justify-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (

                        <CardCarousel
                            title="Reseñas que gustan"
                            viewAllLink="/search?type=items&sort=top_liked"
                            items={carouselReviews}
                            loading={loadingReviews}
                            itemClassName="w-auto"
                            renderItem={
                                (review: any) => (
                                    <ReviewCarouselItem review={review} />
                                )}
                        />
                    )}

                </div>
            </div>
        </div >
    );
};
