import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLists } from '../hooks/useLists';
import { useUsers } from '../hooks/useUsers';
import { useReviews } from '../hooks/useReviews';
import { ReviewCard } from '../components/ReviewCard';
import { CardCarousel } from '../components/CardCarousel';
import { MapView } from '../components/MapView';
import { Map as MapIcon, ChevronDown, Heart, MapPin, List as ListIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocation } from '../hooks/useLocation';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

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

    // --- DATA FETCHING (Dynamic based on Tab) ---
    // Explore -> Top Rated/Trending; News -> Following
    const listSort = activeTab === 'explore' ? 'top_rated' : 'recent'; // Lists still use 'recent' for news
    const reviewSortParam = activeTab === 'explore' ? 'trending' : { type: 'following', followingIds };

    const { lists, loading: loadingLists } = useLists(listSort);
    const { reviews, loading: loadingReviews } = useReviews(reviewSortParam);
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
                        <div className="flex-1"></div>


                    </div>
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
                                        onClick={(e) => { e.stopPropagation(); toggleRange(); }}
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
                            items={filteredLists}
                            loading={loadingLists}
                            renderItem={(list: any) => (
                                <Link to={`/list/${list.id}`} className="block relative group h-40 md:h-48 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-10 origin-center">
                                    {(list.mainImageUrl || list.photoUrl) ? (
                                        <div className="absolute inset-0">
                                            <img src={list.mainImageUrl || list.photoUrl} alt={list.name} className="w-full h-full object-cover" />
                                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full bg-zinc-800" />
                                    )}

                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm">
                                        {list.itemCount}
                                    </div>
                                    <div className="absolute top-2 left-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                        #{list.ranking || 1}
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                        <h3 className="text-white font-bold text-sm leading-tight mb-1 drop-shadow-sm line-clamp-1">{list.name}</h3>

                                        {/* Tags - Tiny & Compact */}
                                        {list.availableTags && list.availableTags.length > 0 && (
                                            <div className="flex gap-1 overflow-hidden opacity-80 group-hover:opacity-100 transition-opacity">
                                                {list.availableTags.slice(0, 2).map((tag: string) => (
                                                    <span key={tag} className="text-[9px] text-gray-300 font-medium">
                                                        #{tag}
                                                    </span>
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
                                <div className="block relative group h-40 md:h-48 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-10 bg-zinc-900">
                                    {item.photoUrl ? (
                                        <div className="absolute inset-0">
                                            <img src={item.photoUrl} alt={item.itemName} className="w-full h-full object-cover" />
                                            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/50 to-transparent" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full bg-zinc-800" />
                                    )}

                                    <div className="absolute top-2 right-2 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                        {item.overallRating?.toFixed(1) || '-'}
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                        <h3 className="text-white font-bold text-sm mb-0.5 leading-tight line-clamp-1">{item.itemName}</h3>
                                        <div className="flex items-center text-[10px] text-gray-400 mb-1">
                                            <MapPin className="w-3 h-3 mr-1 opacity-70" />
                                            <span className="truncate max-w-[120px]">{item.placeName}</span>
                                        </div>
                                        {item.listName && (
                                            <span className="text-[9px] text-indigo-300 font-medium truncate opacity-90 block">
                                                en {item.listName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        />

                        {/* 3. Usuarios activos */}
                        <CardCarousel
                            title="Usuarios activos"
                            items={topUsers}
                            loading={loadingUsers}
                            itemClassName="w-auto mr-3"
                            renderItem={(user: any) => (
                                <Link to={`/profile/${user.uid}`} className="flex flex-col items-center gap-1 group p-2 rounded-md hover:bg-white/5 transition-colors w-24 md:w-32 shrink-0">
                                    <div className="relative w-16 h-16 md:w-20 md:h-20">
                                        <img src={user.photoUrl || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="User" className="w-full h-full rounded-full object-cover border-2 border-transparent group-hover:border-white transition-all" />
                                        <div className="absolute -bottom-1 -right-0 w-6 h-6 bg-black rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-gray-700">
                                            #1
                                        </div>
                                    </div>
                                    <div className="text-center w-full">
                                        <h4 className="text-white font-bold text-xs truncate w-full">{user.displayName}</h4>
                                        <p className="text-gray-500 text-[10px] truncate">@{user.username || 'user'}</p>
                                        <p className="text-[9px] text-indigo-400 font-medium mt-0.5">
                                            {user.publicListsCount || 0} Listas • {user.followersCount || 0} Seg.
                                        </p>
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
                                <div className="block relative group h-40 md:h-48 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-10 bg-zinc-900">
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
                                </div>
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
                                    {filteredItems.map((review: any) => (
                                        <ReviewCard key={review.id} review={review} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <CardCarousel
                            title="Reseñas que gustan"
                            items={filteredItems}
                            loading={loadingReviews}
                            renderItem={(review: any) => (
                                <div className="bg-[#191919] border border-white/5 rounded-xl p-4 h-full flex flex-col justify-between group hover:border-white/10 transition-colors">
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
                                        {review.photoUrl && <div className="h-24 w-full rounded-lg bg-gray-800 mb-2 overflow-hidden"><img src={review.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>}
                                        <p className="text-gray-300 text-sm line-clamp-2 italic">"{review.comment}"</p>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                </div>
            </div>
        </div>
    );
};
