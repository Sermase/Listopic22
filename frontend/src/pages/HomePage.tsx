import React, { useState } from 'react';
import { Search, Map as MapIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CardCarousel } from '../components/CardCarousel';
import { MapView } from '../components/MapView';
import { ReviewCard } from '../components/ReviewCard';
import { useAuth } from '../context/AuthContext';
import { useLists } from '../hooks/useLists';
import { useUsers } from '../hooks/useUsers';
import { useFollowingFeed } from '../hooks/useFollowingFeed';
export const HomePage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'explore' | 'news'>('explore');
    const [isMapOpen, setIsMapOpen] = useState(false);

    // Data Hooks
    const { lists: topLists, loading: loadingLists } = useLists('top_rated');
    const { users: topUsers, loading: loadingUsers } = useUsers();
    const { reviews: feedReviews, loading: loadingFeed, empty: feedEmpty } = useFollowingFeed();

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            {/* Hero Section */}
            <header className="relative pt-24 pb-8 px-6 text-center overflow-hidden">
                <div className="relative z-10 max-w-2xl mx-auto">
                    <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-4 animate-fade-in tracking-tight">
                        Descubre lo mejor <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                            de tu ciudad
                        </span>
                    </h1>
                    <p className="text-gray-400 text-lg md:text-xl max-w-lg mx-auto mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        Listas curadas por gente real. Sin algoritmos opacos.
                    </p>

                    {/* Tabs */}
                    <div className="inline-flex bg-white/5 p-1 rounded-full backdrop-blur-md border border-white/10 animate-fade-in" style={{ animationDelay: '0.2s' }}>
                        <button
                            onClick={() => setActiveTab('explore')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'explore'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Explorar
                        </button>
                        <button
                            onClick={() => setActiveTab('news')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'news'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Novedades
                        </button>
                    </div>
                </div>

                {/* Background Blobs */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-4xl opacity-30 pointer-events-none">
                    <div className="absolute top-20 left-10 w-64 h-64 bg-indigo-600 rounded-full mix-blend-screen filter blur-3xl animate-blob"></div>
                    <div className="absolute top-20 right-10 w-64 h-64 bg-cyan-500 rounded-full mix-blend-screen filter blur-3xl animate-blob" style={{ animationDelay: '2s' }}></div>
                </div>
            </header>

            {/* Map Accordion */}
            {/* Logic Fix: mb-0 when closed, mb-4 when open. */}
            <div className={`container mx-auto px-4 transition-all duration-300 ${isMapOpen ? 'mb-4' : 'mb-0'}`}>
                <button
                    onClick={() => setIsMapOpen(!isMapOpen)}
                    className="w-full bg-[#151b2e] border border-white/10 rounded-xl p-3 flex items-center justify-between text-white hover:border-indigo-500/50 transition-colors group"
                >
                    <div className="flex items-center">
                        <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400 group-hover:scale-110 transition-transform mr-3">
                            <MapIcon className="w-5 h-5" />
                        </div>
                        <span className="font-bold">Mapa Global</span>
                    </div>
                    {isMapOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </button>

                <div className={`grid transition-all duration-300 ease-in-out ${isMapOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                    <div className={`overflow-hidden min-h-0 rounded-2xl bg-[#151b2e] h-[400px] ${isMapOpen ? 'border border-white/10' : 'border-0'}`}>
                        {isMapOpen && <MapView items={[]} />} {/* Pass global items here later */}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            {activeTab === 'explore' ? (
                <main className="space-y-8 min-h-[50vh]">

                    {/* Top Lists Carousel */}
                    <CardCarousel
                        title="Listas Populares"
                        subtitle="Las colecciones más visitadas"
                        items={topLists}
                        loading={loadingLists}
                        renderItem={(list: any) => (
                            <Link to={`/list/${list.id}`} className="block w-full h-full">
                                <div className="w-full h-64 bg-[#151b2e] border border-white/10 rounded-xl p-4 hover:border-indigo-500/30 transition-colors cursor-pointer group">
                                    <div className="h-32 bg-gray-800 rounded-lg mb-4 overflow-hidden relative">
                                        {list.photoUrl ? (
                                            <img src={list.photoUrl} alt={list.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-700 text-gray-500">
                                                No Image
                                            </div>
                                        )}
                                        {list.avgScore && (
                                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-xs font-bold text-white">
                                                ⭐ {list.avgScore.toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="text-white font-bold text-lg mb-1 truncate">{list.name}</h3>
                                    <p className="text-gray-500 text-sm truncate">
                                        Por {list.authorName || 'Anónimo'} • {list.itemCount || 0} lugares
                                    </p>
                                </div>
                            </Link>
                        )}
                        viewAllLink="/search"
                    />

                    {/* Active Users Carousel */}
                    <CardCarousel
                        title="Curadores Destacados"
                        subtitle="Gente con buen gusto"
                        items={topUsers}
                        loading={loadingUsers}
                        renderItem={(u: any) => (
                            <Link to={`/profile/${u.uid}`} className="block w-full h-full">
                                <div className="w-full h-full bg-[#151b2e] border border-white/10 rounded-xl p-4 flex flex-col items-center hover:border-indigo-500/30 transition-colors">
                                    <div className="w-20 h-20 rounded-full bg-gray-700 mb-3 overflow-hidden border-2 border-indigo-500/20 p-1">
                                        <img src={u.photoUrl || "https://ui-avatars.com/api/?name=" + (u.displayName || "User")} alt="User" className="w-full h-full rounded-full object-cover" />
                                    </div>
                                    <h4 className="text-white font-bold mb-1 truncate max-w-full">{u.displayName || u.username || "Usuario"}</h4>
                                    <p className="text-indigo-400 text-xs font-bold mb-3 uppercase tracking-wider">
                                        {u.followersCount || 0} Seguidores
                                    </p>
                                    <button className="text-xs bg-white/5 hover:bg-white/10 text-white px-4 py-1.5 rounded-full transition-colors">
                                        Ver perfil
                                    </button>
                                </div>
                            </Link>
                        )}
                    />

                </main>
            ) : (
                <main className="container mx-auto px-4 animate-fade-in min-h-[50vh]">
                    {loadingFeed ? (
                        <div className="py-20 text-center text-gray-500">Cargando novedades...</div>
                    ) : feedEmpty ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 text-gray-500">
                                <Search className="w-8 h-8 opacity-50" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Tu feed está tranquilo</h3>
                            <p className="text-gray-400 max-w-sm">
                                Sigue a otros usuarios o listas para ver sus novedades aquí.
                            </p>
                            <Link to="/users" className="mt-6 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors shadow-lg shadow-indigo-500/20">
                                Descubrir gente
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                            {feedReviews.map(review => (
                                <ReviewCard key={review.id} review={review} />
                            ))}
                        </div>
                    )}
                </main>
            )}
        </div>
    );
};
