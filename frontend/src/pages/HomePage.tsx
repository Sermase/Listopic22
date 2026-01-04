import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLists } from '../hooks/useLists';
import { useUsers } from '../hooks/useUsers';
import { useReviews } from '../hooks/useReviews';
import { CardCarousel } from '../components/CardCarousel';
import { MapView } from '../components/MapView';
import { Map as MapIcon, ChevronDown, Heart, MapPin, List as ListIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocation } from '../hooks/useLocation';

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
    // Distance Range State (Persisted in Session)
    const [range, setRange] = useState<number | null>(() => {
        const saved = sessionStorage.getItem('sessionRange');
        return saved ? Number(saved) : null;
    });

    // Valid Ranges: 1, 5, 10, 50, null (Infinite)
    const handleRangeChange = (newRange: number | null) => {
        setRange(newRange);
        if (newRange) {
            sessionStorage.setItem('sessionRange', String(newRange));
        } else {
            sessionStorage.removeItem('sessionRange');
        }
    };
    const [isMapOpen, setIsMapOpen] = useState(false);

    // --- DATA FETCHING (Dynamic based on Tab) ---
    // Explore -> Top Rated/Trending; News -> Recent
    const listSort = activeTab === 'explore' ? 'top_rated' : 'recent';
    const reviewSort = activeTab === 'explore' ? 'trending' : 'recent';

    const { lists, loading: loadingLists } = useLists(listSort);
    const { reviews, loading: loadingReviews } = useReviews(reviewSort);
    const { users: topUsers, loading: loadingUsers } = useUsers();

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
    const filteredItems = useMemo(() => {
        return reviews.filter(r => {
            const matchesCategory = checkCategory(r);
            const lat = (r as any).placeLat || (r as any).lat;
            const lng = (r as any).placeLng || (r as any).lng;
            const matchesDist = checkDistance(lat, lng);
            return matchesCategory && matchesDist;
        }).slice(0, 10);
    }, [reviews, activeFilter, range, location]);

    // 5. Derived Places (Unique from Reviews -> Filtered)
    const filteredPlaces = useMemo(() => {
        const uniquePlaces = new Map();
        reviews.forEach(r => {
            if (r.placeId) {
                const lat = (r as any).placeLat;
                const lng = (r as any).placeLng;

                if (checkCategory(r) && checkDistance(lat, lng)) {
                    if (uniquePlaces.has(r.placeId)) {
                        const existing = uniquePlaces.get(r.placeId);
                        existing.reviewsCount = (existing.reviewsCount || 0) + 1;
                        // Prioritize having a photo
                        if (!existing.photoUrl && (r.placeMainImage || r.photoUrl)) {
                            existing.photoUrl = r.placeMainImage || r.photoUrl;
                        }
                        uniquePlaces.set(r.placeId, existing);
                    } else {
                        uniquePlaces.set(r.placeId, {
                            id: r.placeId,
                            name: r.placeName || r.itemName,
                            address: r.placeAddress,
                            photoUrl: r.placeMainImage || r.photoUrl,
                            rating: r.placeAverageRating || r.overallRating,
                            reviewsCount: 1,
                            lat, lng
                        });
                    }
                }
            }
        });
        return Array.from(uniquePlaces.values());
    }, [reviews, activeFilter, range, location]);

    // 6. Derived Users (Synthesized from content)
    const filteredUsers = useMemo(() => {
        const uniqueUsers = new Map();

        // Add users from Lists
        filteredLists.forEach(l => {
            if (l.userId && !uniqueUsers.has(l.userId)) {
                uniqueUsers.set(l.userId, {
                    uid: l.userId,
                    displayName: l.authorName || 'Usuario',
                    photoUrl: l.photoUrl, // List might not have user photo, but let's check if we have it or fallback
                    // ideally list should have authorPhoto, but if not we skip or use generic. 
                    // Actually lists usually have authorName. 
                    // Let's rely on what we have.
                    username: 'user',
                    followersCount: 0
                });
            }
        });

        // Add users from Reviews (better source as it has authorPhoto)
        filteredItems.forEach(r => {
            const uid = r.userId || r.authorId;
            if (uid && !uniqueUsers.has(uid)) {
                uniqueUsers.set(uid, {
                    uid,
                    displayName: r.authorName || 'Usuario',
                    photoUrl: r.authorPhoto,
                    username: 'user',
                    followersCount: 0
                });
            } else if (uid && uniqueUsers.has(uid)) {
                // Enhance existing if missing photo
                const existing = uniqueUsers.get(uid);
                if (!existing.photoUrl && r.authorPhoto) {
                    existing.photoUrl = r.authorPhoto;
                    uniqueUsers.set(uid, existing);
                }
            }
        });

        // If we still want to merge with "topUsers" to get real stats/bio if available:
        return Array.from(uniqueUsers.values()).map(u => {
            const realUser = topUsers.find(tu => tu.uid === u.uid);
            return realUser ? { ...u, ...realUser } : u;
        });
    }, [filteredLists, filteredItems, topUsers]);

    // Cycle Range Handler
    const toggleRange = () => {
        if (!location) {
            requestLocation();
        }

        let nextRange: number | null = null;
        if (range === null) nextRange = 1;
        else if (range === 1) nextRange = 5;
        else if (range === 5) nextRange = 10;
        else if (range === 10) nextRange = 50;
        else nextRange = null;

        handleRangeChange(nextRange);
    };

    const getRangeLabel = () => {
        if (range === null) return "Sin rango";
        return `< ${range} km`;
    };

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20 font-sans">
            <div className="pt-24 px-4 pb-6">

                {/* Hero Card */}
                <div className="max-w-5xl mx-auto mb-8">
                    <div className="relative bg-[#151b2e] border border-white/5 rounded-3xl p-12 text-center overflow-hidden shadow-2xl">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-indigo-900/20 blur-[100px] rounded-full pointer-events-none" />

                        <h1 className="relative z-10 text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 mb-4 tracking-tight" style={{ fontFamily: '"Inter", sans-serif' }}>
                            LISTOPIC
                        </h1>
                        <p className="relative z-10 text-gray-400 text-lg">
                            Crea tu lista y entra en el carrusel.
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
                        <div className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-2">
                            {['Todo', 'Hmm...', 'Woow!', 'Yujuui!'].map(filter => (
                                <button
                                    key={filter}
                                    onClick={() => setActiveFilter(filter)}
                                    className={`px-5 py-2 rounded-full text-xs font-bold border backdrop-blur-md transition-all duration-300 whitespace-nowrap shadow-lg ${activeFilter === filter
                                        ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-indigo-400/50 text-white shadow-indigo-500/20 scale-105'
                                        : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:border-white/20'
                                        }`}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 pl-2 border-l border-white/10">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Rango</span>
                            <button
                                onClick={toggleRange}
                                className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 shadow-lg ${range !== null
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/20 scale-105'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5'
                                    }`}
                            >
                                {getRangeLabel()}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Map Collapsible */}
                <div className="max-w-7xl mx-auto mb-8">
                    <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden transition-all duration-300">
                        <div
                            onClick={() => setIsMapOpen(!isMapOpen)}
                            className="w-full p-3 flex items-center justify-between text-gray-300 hover:bg-white/5 transition-colors cursor-pointer select-none"
                            role="button"
                            tabIndex={0}
                        >
                            <div className="flex items-center gap-2">
                                <MapIcon className="w-5 h-5 text-gray-400" />
                                <span className="font-bold text-sm">Mapa</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                {isMapOpen ? 'Plegar' : 'Desplegar'}
                                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMapOpen ? 'rotate-180' : ''}`} />
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

                <div className="max-w-[1400px] mx-auto space-y-8">

                    {/* 1. Listas */}
                    <CardCarousel
                        title={activeTab === 'explore' ? "Listas con más reseñas" : "Listas Recientes"}
                        items={filteredLists}
                        loading={loadingLists}
                        renderItem={(list: any) => (
                            <Link to={`/list/${list.id}`} className="block relative group h-48 rounded-xl overflow-hidden border border-white/10 bg-gray-900">
                                {(list.mainImageUrl || list.photoUrl) ? (
                                    <img src={list.mainImageUrl || list.photoUrl} alt={list.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-40 group-hover:scale-105 transition-all duration-500" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                                <div className="absolute top-2 right-2 bg-gray-900/80 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-gray-300 uppercase">
                                    {list.itemCount || 0} items
                                </div>
                                <div className="absolute top-2 left-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg">
                                    #{list.ranking || 1}
                                </div>
                                <div className="absolute bottom-3 left-3 right-3">
                                    <h3 className="text-white font-bold text-lg leading-tight mb-1 truncate">{list.name}</h3>
                                    <div className="flex items-center gap-3 text-xs text-gray-400 font-bold mb-2">
                                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {list.likes || 0}</span>
                                        <span className="flex items-center gap-1"><ListIcon className="w-3 h-3" /> {list.reviewCount || 0}</span>
                                    </div>

                                    {/* Tags */}
                                    {list.availableTags && list.availableTags.length > 0 && (
                                        <div className="flex gap-1 overflow-hidden">
                                            {list.availableTags.slice(0, 2).map((tag: string) => (
                                                <button
                                                    key={tag}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        navigate(`/search?q=${tag}`);
                                                    }}
                                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/10 hover:bg-white/20 text-white/80 transition-colors backdrop-blur-sm"
                                                >
                                                    #{tag}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        )}
                    />

                    {/* 2. Items */}
                    <CardCarousel
                        title={activeTab === 'explore' ? "Mejor en Listopic" : "Últimos Items"}
                        items={filteredItems}
                        loading={loadingReviews}
                        renderItem={(item: any) => (
                            <div className="block relative group h-48 rounded-xl overflow-hidden border border-white/10 bg-gray-900">
                                {item.photoUrl ? (
                                    <img src={item.photoUrl} alt={item.itemName} className="w-full h-full object-cover opacity-70 group-hover:opacity-50 transition-all duration-500" />
                                ) : (
                                    <div className="w-full h-full bg-slate-800" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                                <div className="absolute top-2 right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-xs font-black text-white shadow-lg border-2 border-white/10">
                                    {item.overallRating?.toFixed(1) || 9.0}
                                </div>
                                <div className="absolute bottom-3 left-3 right-3">
                                    <h3 className="text-white font-bold text-base mb-0.5 truncate">{item.itemName}</h3>
                                    <div className="flex items-center text-xs text-gray-400 mb-1.5">
                                        <MapPin className="w-3 h-3 mr-1" />
                                        <span className="truncate max-w-[150px]">{item.placeName}</span>
                                        {item.placeCity && (
                                            <>
                                                <span className="mx-1 opacity-50">•</span>
                                                <span className="text-gray-500 truncate">{item.placeCity}</span>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                                <ListIcon className="w-3 h-3" /> {item.listName}
                                            </span>
                                        </div>

                                        {/* Tags */}
                                        {item.tags && item.tags.length > 0 && (
                                            <div className="flex gap-1">
                                                {item.tags.slice(0, 2).map((tag: string) => (
                                                    <button
                                                        key={tag}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            navigate(`/search?q=${tag}`);
                                                        }}
                                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/10 hover:bg-white/20 text-white/80 transition-colors backdrop-blur-sm"
                                                    >
                                                        #{tag}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    />

                    {/* 3. Usuarios activos */}
                    <CardCarousel
                        title="Usuarios activos"
                        items={filteredUsers}
                        loading={loadingUsers}
                        renderItem={(user: any) => (
                            <Link to={`/profile/${user.uid}`} className="flex items-center gap-4 bg-[#151b2e] border border-white/10 p-4 rounded-xl h-24 hover:border-indigo-500/30 transition-colors">
                                <div className="relative">
                                    <img src={user.photoUrl || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="User" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/20" />
                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-gray-700">
                                        #1
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-white font-bold truncate">{user.displayName}</h4>
                                    <p className="text-indigo-400 text-xs truncate">@{user.username || 'user'}</p>
                                    <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold text-gray-500">
                                        <span className="flex items-center gap-1"><ListIcon className="w-3 h-3" /> {user.listsCount || 12}</span>
                                        <span className="flex items-center gap-1">★ {user.rating || 8.0}</span>
                                        <span className="flex items-center gap-1">♥ {user.likes || 0}</span>
                                    </div>
                                </div>
                            </Link>
                        )}
                    />

                    {/* 4. Lugares top */}
                    <CardCarousel
                        title={activeTab === 'explore' ? "Lugares top" : "Nuevos Lugares"}
                        items={filteredPlaces}
                        loading={loadingReviews}
                        renderItem={(place: any) => (
                            <div className="block relative group h-48 rounded-xl overflow-hidden border border-white/10 bg-gray-900">
                                {place.photoUrl ? (
                                    <img src={place.photoUrl} alt={place.name} className="w-full h-full object-cover opacity-70 group-hover:scale-110 transition-transform duration-700" />
                                ) : (
                                    <div className="w-full h-full bg-blue-900/20" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                                <div className="absolute top-2 right-2 bg-teal-500 px-2 py-0.5 rounded text-[10px] font-bold text-white">
                                    {place.rating?.toFixed(1) || 9.5}
                                </div>
                                <div className="absolute bottom-3 left-3 right-3 text-shadow">
                                    <h3 className="text-white font-bold text-base leading-tight mb-1 truncate">{place.name}</h3>
                                    <p className="text-gray-300 text-xs flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> {place.address?.split(',')[0]}
                                    </p>
                                </div>
                            </div>
                        )}
                    />

                    {/* 5. Resenas que gustan */}
                    <CardCarousel
                        title={activeTab === 'explore' ? "Reseñas que gustan" : "Reseñas Recientes"}
                        items={filteredItems}
                        loading={loadingReviews}
                        renderItem={(review: any) => (
                            <div className="bg-[#191919] border border-white/5 rounded-xl p-4 h-full flex flex-col justify-between">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <img src={review.authorPhoto || "https://ui-avatars.com/api/?name=User"} className="w-8 h-8 rounded-full" />
                                        <div className="text-xs">
                                            <div className="text-white font-bold">{review.authorName}</div>
                                            <div className="text-gray-500">@{review.authorName}</div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 font-bold text-xs">
                                        {review.overallRating}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    {review.photoUrl && <div className="h-24 w-full rounded-lg bg-gray-800 mb-2 overflow-hidden"><img src={review.photoUrl} className="w-full h-full object-cover" /></div>}
                                    <p className="text-gray-300 text-sm line-clamp-2 italic">"{review.comment}"</p>
                                </div>
                            </div>
                        )}
                    />

                </div>
            </div>
        </div>
    );
};
