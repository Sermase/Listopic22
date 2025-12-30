import React, { useState } from 'react';
import { ArrowRight, Sparkles, LayoutGrid, Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLists } from '../hooks/useLists';
import { useUsers } from '../hooks/useUsers';
import { useReviews } from '../hooks/useReviews';
import { Carousel } from '../components/Carousel';
import { UserCarousel } from '../components/UserCarousel';
import { ReviewCard } from '../components/ReviewCard';

export const Home: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'discovery' | 'news'>('discovery');

    const { lists: recentLists, loading: recentLoading } = useLists('recent');
    const { lists: topLists, loading: topLoading } = useLists('top_rated');
    const { users: topUsers, loading: usersLoading } = useUsers();
    const { reviews: newReviews, loading: reviewsLoading } = useReviews('recent');

    return (
        <div className="min-h-screen bg-[#0b1021]">
            {/* Hero Section */}
            <div className="relative pt-32 pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full opacity-30 pointer-events-none">
                    <div className="absolute top-20 left-10 w-96 h-96 bg-indigo-500 rounded-full blur-[100px]" />
                    <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500 rounded-full blur-[100px]" />
                </div>

                <div className="relative max-w-4xl mx-auto text-center z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm mb-6 animate-fade-in-up">
                        <Sparkles className="w-4 h-4" />
                        <span>Nueva Versión Beta 2.0</span>
                    </div>

                    <h1 className="text-4xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight animate-fade-in-up delay-100">
                        Descubre y comparte <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">lo mejor de todo</span>
                    </h1>

                    <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto animate-fade-in-up delay-200">
                        Crea listas de tus cosas favoritas, encuentra recomendaciones auténticas y conecta con una comunidad que comparte tus gustos.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
                        <Link to="/create" className="px-8 py-4 rounded-full bg-white text-black font-bold text-lg hover:scale-105 transition-transform shadow-xl shadow-white/10 flex items-center gap-2">
                            Crear una lista
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                        <Link to="/search" className="px-8 py-4 rounded-full bg-white/5 text-white font-bold text-lg hover:bg-white/10 border border-white/10 backdrop-blur-sm transition-colors">
                            Explorar
                        </Link>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="sticky top-16 z-30 bg-[#0b1021]/80 backdrop-blur-md border-y border-white/5 mb-8">
                <div className="max-w-7xl mx-auto px-4 flex justify-center gap-8">
                    <button
                        onClick={() => setActiveTab('discovery')}
                        className={`flex items-center gap-2 py-4 border-b-2 transition-colors ${activeTab === 'discovery' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                        <LayoutGrid className="w-5 h-5" />
                        <span className="font-bold">Descubrir</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('news')}
                        className={`flex items-center gap-2 py-4 border-b-2 transition-colors ${activeTab === 'news' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                        <Newspaper className="w-5 h-5" />
                        <span className="font-bold">Novedades</span>
                    </button>
                </div>
            </div>

            {/* Content Tabs */}
            <div className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {activeTab === 'discovery' ? (
                    <div className="space-y-8 animate-fade-in">
                        <Carousel
                            title="🔥 Tendencias en Listopic"
                            lists={topLists}
                            loading={topLoading}
                        />

                        <UserCarousel
                            title="✨ Creadores Destacados"
                            users={topUsers}
                            loading={usersLoading}
                        />

                        <Carousel
                            title="🆕 Recién Agregadas"
                            lists={recentLists}
                            loading={recentLoading}
                        />
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        <h2 className="text-2xl font-bold text-white mb-6">Últimas Reseñas</h2>

                        {reviewsLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="h-48 bg-[#151b2e] rounded-xl animate-pulse border border-white/5"></div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {newReviews.map(review => (
                                    <ReviewCard key={review.id} review={review} />
                                ))}
                                {newReviews.length === 0 && (
                                    <p className="text-gray-500 col-span-full text-center py-12">No hay novedades recientes.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
