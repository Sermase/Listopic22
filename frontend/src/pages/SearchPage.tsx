import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Map as MapIcon, Users, List as ListIcon, Loader, MessageCircle } from 'lucide-react';
import { collection, query, where, getDocs, limit, orderBy, collectionGroup } from 'firebase/firestore';
import { db } from '../firebase';

export const SearchPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryParam = searchParams.get('q') || '';
    const typeParam = searchParams.get('type') as 'lists' | 'users' | 'places' | 'reviews' | null;
    const sortParam = searchParams.get('sort');

    const [searchTerm, setSearchTerm] = useState(queryParam);
    const [activeTab, setActiveTab] = useState<'lists' | 'users' | 'places' | 'reviews'>(typeParam || 'lists');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Sync activeTab with URL type param if it changes externally
    useEffect(() => {
        if (typeParam && typeParam !== activeTab) {
            setActiveTab(typeParam);
        }
    }, [typeParam]);

    // Update URL when tab changes or search
    const updateUrl = (term: string, tab: string) => {
        const params: any = {};
        if (term) params.q = term;
        if (tab) params.type = tab;
        if (sortParam) params.sort = sortParam;
        setSearchParams(params);
    };

    const handleTabChange = (tab: 'lists' | 'users' | 'places' | 'reviews') => {
        setActiveTab(tab);
        updateUrl(searchTerm, tab);
    };

    // Update URL when local search term changes (debounced ideally, but direct for now)
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchParams({ q: searchTerm });
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setResults([]);
            try {
                let q;

                // Base Collection Reference
                let dbRef;
                if (activeTab === 'reviews') {
                    dbRef = collectionGroup(db, 'reviews');
                } else {
                    dbRef = collection(db, activeTab);
                }

                if (!queryParam) {
                    // Empty state: show recent or popular based on 'sort'
                    if (activeTab === 'lists') {
                        if (sortParam === 'most_reviewed') {
                            // Ideally needs index: isPublic desc, reviewCount desc
                            q = query(dbRef, where('isPublic', '==', true), orderBy('reviewCount', 'desc'), limit(20));
                        } else {
                            q = query(dbRef, where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(20));
                        }
                    } else if (activeTab === 'reviews') {
                        if (sortParam === 'top_liked') {
                            // Note: This requires an index on reactionCounts.like DESC
                            q = query(dbRef, orderBy('reactionCounts.like', 'desc'), limit(20));
                        } else {
                            q = query(dbRef, orderBy('createdAt', 'desc'), limit(20));
                        }
                    } else if (activeTab === 'places') {
                        if (sortParam === 'rating') {
                            q = query(dbRef, orderBy('averageRating', 'desc'), limit(20));
                        } else {
                            q = query(dbRef, limit(20));
                        }
                    } else {
                        q = query(dbRef, limit(20)); // Users
                    }
                } else {
                    // Search logic: Prefix match on 'name' or 'username'
                    const field = activeTab === 'users' ? 'username' : (activeTab === 'reviews' ? 'itemName' : 'name');
                    const term = queryParam.toLowerCase();
                    // Note: This needs exact match or prefix hack. For real search -> Algolia/Elastic

                    q = query(
                        dbRef,
                        where(field, '>=', term),
                        where(field, '<=', term + '\uf8ff'),
                        limit(20)
                    );

                    if (activeTab === 'lists') {
                        // q = query(q, where('isPublic', '==', true)); 
                    }
                }

                const snap = await getDocs(q);
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setResults(data);

            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [queryParam, activeTab, sortParam]);

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20 pt-24 px-4">
            {/* Hero Search */}
            <div className="max-w-4xl mx-auto mb-8 text-center">
                <h1 className="text-3xl font-display font-bold text-white mb-6">
                    Explora todo en <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Listopic</span>
                </h1>

                <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar listas, usuarios, cafeterías..."
                        className="w-full bg-[#151b2e] border border-white/10 rounded-full py-4 pl-14 pr-6 text-white text-lg focus:outline-none focus:border-indigo-500 shadow-xl placeholder-gray-500"
                    />
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                </form>
            </div>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
                <div className="inline-flex bg-[#151b2e] p-1 rounded-full border border-white/10 overflow-x-auto max-w-[90vw]">
                    <button
                        onClick={() => handleTabChange('lists')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'lists' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <ListIcon className="w-4 h-4" /> Listas
                    </button>
                    <button
                        onClick={() => handleTabChange('reviews')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'reviews' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <MessageCircle className="w-4 h-4" /> Reseñas
                    </button>
                    <button
                        onClick={() => handleTabChange('places')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'places' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <MapIcon className="w-4 h-4" /> Lugares
                    </button>
                    <button
                        onClick={() => handleTabChange('users')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <Users className="w-4 h-4" /> Usuarios
                    </button>
                </div>
            </div>

            {/* Results Grid */}
            <div className="container mx-auto max-w-6xl">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        No se encontraron resultados para "{queryParam}".
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {results.map((item) => (
                            <Link
                                key={item.id}
                                to={
                                    activeTab === 'users' ? `/profile/${item.uid || item.id}` :
                                        activeTab === 'lists' ? `/list/${item.id}` :
                                            activeTab === 'places' ? `/place/${item.id}` :
                                                item.placeId ? `/group/${item.placeId}/${encodeURIComponent(item.itemName || '')}` : '#'
                                }
                                className="block h-full"
                            >
                                <div className="bg-[#151b2e] border border-white/10 rounded-xl p-4 hover:border-indigo-500/50 transition-all hover:-translate-y-1 h-full flex flex-col">
                                    {/* Conditional Rendering based on Type */}
                                    {activeTab === 'reviews' ? (
                                        <>
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <img src={item.authorPhoto || "https://ui-avatars.com/api/?name=User"} className="w-8 h-8 rounded-full bg-gray-700" />
                                                    <div className="overflow-hidden">
                                                        <div className="text-white font-bold text-sm truncate">{item.authorName || 'Anónimo'}</div>
                                                        <div className="text-gray-500 text-xs truncate">@{item.authorName || 'user'}</div>
                                                    </div>
                                                </div>
                                                <div className="px-2 py-0.5 rounded bg-white/10 text-white font-bold text-xs">
                                                    {item.overallRating?.toFixed(1) || '-'}
                                                </div>
                                            </div>
                                            {item.photoUrl && (
                                                <div className="h-32 w-full rounded-lg bg-gray-800 mb-3 overflow-hidden">
                                                    <img src={item.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                </div>
                                            )}
                                            <h3 className="text-white font-bold text-sm mb-1 line-clamp-1">{item.itemName}</h3>
                                            <p className="text-gray-400 text-xs line-clamp-2 italic mb-auto">"{item.comment}"</p>
                                        </>
                                    ) : activeTab === 'users' ? (
                                        <div className="flex items-center gap-4">
                                            <img
                                                src={item.photoUrl || `https://ui-avatars.com/api/?name=${item.displayName || 'U'}`}
                                                alt="Avatar"
                                                className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500/20"
                                            />
                                            <div>
                                                <h3 className="font-bold text-white text-lg">{item.displayName || item.username || 'Usuario'}</h3>
                                                <p className="text-indigo-400 text-sm">@{item.username || 'user'}</p>
                                                <div className="flex gap-2 mt-2 text-xs text-gray-500">
                                                    <span>{item.followersCount || 0} Seguidores</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : activeTab === 'lists' ? (
                                        <>
                                            <div className="h-40 bg-gray-800 rounded-lg mb-4 overflow-hidden relative">
                                                {(item.mainImageUrl || item.photoUrl) && <img src={item.mainImageUrl || item.photoUrl} className="w-full h-full object-cover" />}
                                                {item.avgScore && (
                                                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-xs font-bold text-white">
                                                        ⭐ {item.avgScore.toFixed(1)}
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-white text-lg mb-1">{item.name}</h3>
                                            <p className="text-sm text-gray-400 mb-2 line-clamp-2">{item.description}</p>
                                            <div className="mt-auto pt-2 border-t border-white/5 flex justify-between items-center text-xs text-gray-500">
                                                <span>{item.itemCount || 0} items</span>
                                                <span>{item.authorName}</span>
                                            </div>
                                        </>
                                    ) : (
                                        // Places
                                        <>
                                            <div className="h-40 bg-gray-800 rounded-lg mb-4 overflow-hidden relative">
                                                {item.mainImageUrl && <img src={item.mainImageUrl} className="w-full h-full object-cover" />}
                                            </div>
                                            <h3 className="font-bold text-white text-lg mb-1">{item.name}</h3>
                                            <p className="text-sm text-gray-400">{item.address || item.city}</p>
                                        </>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
