import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Map as MapIcon, Users, List as ListIcon, Loader } from 'lucide-react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export const SearchPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryParam = searchParams.get('q') || '';

    const [searchTerm, setSearchTerm] = useState(queryParam);
    const [activeTab, setActiveTab] = useState<'lists' | 'users' | 'places'>('lists');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

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
                const dbRef = collection(db, activeTab); // 'lists', 'users', 'places'

                if (!queryParam) {
                    // Empty state: show recent or popular
                    // For lists: order by createdAt desc
                    // For users: order by followersCount desc (if index exists) or simple limit
                    if (activeTab === 'lists') {
                        q = query(dbRef, where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(20));
                    } else if (activeTab === 'users') {
                        q = query(dbRef, limit(20)); // Simplest for now
                    } else {
                        q = query(dbRef, limit(20));
                    }
                } else {
                    // Search logic: Prefix match on 'name' or 'username'
                    // Note: Firestore is case-sensitive and needs exact field names.
                    // Lists: 'name'
                    // Users: 'username' or 'displayName' (Tricky without Algolia)
                    // Places: 'name'

                    const field = activeTab === 'users' ? 'username' : 'name';
                    const term = queryParam.toLowerCase(); // Assuming data is stored lower or we use a specific normalized field
                    // Using standard Firestore hack for prefix: startAt(term), endAt(term + '\uf8ff')
                    // THIS REQUIRED CASE-SENSITIVE MATCHING unless we have normalized fields.
                    // For this MVP, we will try standard '>=', '<=' on standard fields, appearing case-sensitive.

                    q = query(
                        dbRef,
                        where(field, '>=', term),
                        where(field, '<=', term + '\uf8ff'),
                        limit(20)
                    );

                    if (activeTab === 'lists') {
                        // Ideally filters for public, but compound query might need index
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
    }, [queryParam, activeTab]);

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
                <div className="inline-flex bg-[#151b2e] p-1 rounded-full border border-white/10">
                    <button
                        onClick={() => setActiveTab('lists')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'lists' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <ListIcon className="w-4 h-4" /> Listas
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <Users className="w-4 h-4" /> Usuarios
                    </button>
                    <button
                        onClick={() => setActiveTab('places')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'places' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <MapIcon className="w-4 h-4" /> Lugares
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
                                to={activeTab === 'users' ? `/profile/${item.uid || item.id}` : activeTab === 'lists' ? `/list/${item.id}` : `/place/${item.id}`}
                                className="block"
                            >
                                <div className="bg-[#151b2e] border border-white/10 rounded-xl p-4 hover:border-indigo-500/50 transition-all hover:-translate-y-1 h-full flex flex-col">
                                    {/* Conditional Rendering based on Type */}
                                    {activeTab === 'users' ? (
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
                                                {item.photoUrl && <img src={item.photoUrl} className="w-full h-full object-cover" />}
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
