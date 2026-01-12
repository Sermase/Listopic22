import React, { useState, useMemo } from 'react';
import { useLists } from '../hooks/useLists';
import { useLocation } from '../hooks/useLocation';
import { ListCard } from '../components/ListCard';
import { Search, MapPin, Filter } from 'lucide-react';

export const ListView: React.FC = () => {
    const { lists, loading, error } = useLists();
    const { location, calculateDistance } = useLocation();

    // Filters state
    const [searchTerm, setSearchTerm] = useState('');
    const [maxDistance, setMaxDistance] = useState<number>(50); // km
    const [enableLocationFilter, setEnableLocationFilter] = useState(false);

    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // Derived state: Unique Tags from available lists
    const uniqueTags = useMemo(() => {
        if (!lists) return [];
        const tags = new Set<string>();
        lists.forEach(list => {
            list.availableTags?.forEach((tag: string) => {
                if (tag) tags.add(tag);
            });
        });
        return Array.from(tags).sort();
    }, [lists]);

    // Derived state: Filter lists
    const filteredLists = useMemo(() => {
        if (!lists) return [];

        return lists.filter(list => {
            // Text Search
            const matchesSearch = list.name.toLowerCase().includes(searchTerm.toLowerCase());
            if (!matchesSearch) return false;

            // Tag Filter
            if (selectedTag && (!list.availableTags || !list.availableTags.includes(selectedTag))) {
                return false;
            }

            // Location Filter
            if (enableLocationFilter && location) {
                // Check if list has location data
                if (list.lat === undefined || list.lng === undefined) return false;

                const dist = calculateDistance(list.lat, list.lng);
                return dist !== null && dist <= maxDistance;
            }

            return true;
        });
    }, [lists, searchTerm, enableLocationFilter, maxDistance, location, selectedTag]);

    return (
        <div className="min-h-screen pt-20 pb-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Explorar Listas</h1>
                    <p className="text-gray-400">Descubre las mejores colecciones de la comunidad.</p>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Buscar listas..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-[#151b2e] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50 w-full sm:w-64 transition-all"
                        />
                    </div>

                    <button
                        onClick={() => setEnableLocationFilter(!enableLocationFilter)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${enableLocationFilter ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-[#151b2e] border-white/10 text-gray-400 hover:border-white/20'}`}
                    >
                        <MapPin className="w-4 h-4" />
                        <span>Cerca de mí</span>
                    </button>
                </div>
            </div>

            {/* Tags Scrollbar */}
            {!loading && uniqueTags.length > 0 && (
                <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    <button
                        onClick={() => setSelectedTag(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
                            ${!selectedTag ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-[#151b2e] border-white/10 text-gray-400 hover:border-white/20'}`}
                    >
                        Todos
                    </button>
                    {uniqueTags.map(tag => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(tag === selectedTag ? null : tag)} // Toggle
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
                                ${selectedTag === tag ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-[#151b2e] border-white/10 text-gray-400 hover:border-white/20'}`}
                        >
                            #{tag}
                        </button>
                    ))}
                </div>
            )}

            {/* Range Slider (donditional) */}
            {enableLocationFilter && (
                <div className="mb-8 p-4 bg-[#151b2e] rounded-xl border border-white/10 animate-fade-in-down">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400 flex items-center gap-2">
                            <Filter className="w-3 h-3" /> Radio de búsqueda
                        </span>
                        <span className="text-indigo-400 font-bold text-sm">{maxDistance} km</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="200"
                        value={maxDistance}
                        onChange={(e) => setMaxDistance(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    {!location && (
                        <p className="text-xs text-red-400 mt-2">
                            ⚠️ Necesitamos tu ubicación para filtrar por distancia.
                        </p>
                    )}
                </div>
            )}

            {/* Results Grid */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-64 bg-[#151b2e] rounded-xl animate-pulse border border-white/5"></div>
                    ))}
                </div>
            ) : error ? (
                <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-lg text-center">
                    Error al cargar listas: {error}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredLists.map(list => (
                            <ListCard key={list.id} list={list} />
                        ))}
                    </div>
                    {filteredLists.length === 0 && (
                        <div className="text-center py-20">
                            <div className="w-16 h-16 bg-[#151b2e] rounded-full flex items-center justify-center mx-auto mb-4 text-gray-600">
                                <Search className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">No se encontraron resultados</h3>
                            <p className="text-gray-400">Intenta ajustar los filtros de búsqueda.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
