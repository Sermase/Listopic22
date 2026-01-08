import React, { useState, useEffect, useRef } from 'react';
import { PlaceService, type PlaceResult } from '../services/PlaceService';
import { Search, MapPin, Loader, X } from 'lucide-react';

import { useLocation } from '../hooks/useLocation';

interface PlaceSearchProps {
    onSelect: (place: PlaceResult) => void;
    placeholder?: string;
    prefillValue?: string;
    onManualToggle?: () => void;
}

export const PlaceSearch: React.FC<PlaceSearchProps> = ({ onSelect, placeholder = "Ej: La Pizzería Genial", prefillValue, onManualToggle }) => {
    const { location, loading: locLoading } = useLocation();
    const [query, setQuery] = useState(prefillValue || '');
    const [results, setResults] = useState<PlaceResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (prefillValue) {
            setQuery(prefillValue);
        }
    }, [prefillValue]);

    // Unified Search Handler
    const handleSearch = async () => {
        setLoading(true);
        setResults([]);
        setIsOpen(false);

        try {
            // Case 1: Empty Query -> Search Nearby
            if (!query.trim()) {
                if (!location && !navigator.geolocation) {
                    setStatusMessage("Ubicación necesaria para búsqueda cercana.");
                    setLoading(false);
                    return;
                }

                setStatusMessage("Obteniendo ubicación...");

                // Use cached location or fetch fresh
                const lat = location?.latitude;
                const lng = location?.longitude;

                if (lat && lng) {
                    setStatusMessage("Buscando lugares cercanos...");
                    let data = await PlaceService.searchNearby(lat, lng);

                    // Sort by distance
                    data.sort((a, b) => {
                        if (a.distance === undefined) return 1;
                        if (b.distance === undefined) return -1;
                        return a.distance - b.distance;
                    });

                    setResults(data);
                    setIsOpen(true);
                    if (data.length === 0) setStatusMessage("No se encontraron lugares cercanos.");
                    else setStatusMessage(null);
                } else {
                    // Force refresh if hook didn't catch it yet
                    navigator.geolocation.getCurrentPosition(async (pos) => {
                        let data = await PlaceService.searchNearby(pos.coords.latitude, pos.coords.longitude);

                        // Sort by distance
                        data.sort((a, b) => {
                            if (a.distance === undefined) return 1;
                            if (b.distance === undefined) return -1;
                            return a.distance - b.distance;
                        });

                        setResults(data);
                        setIsOpen(true);
                        setLoading(false);
                        if (data.length === 0) setStatusMessage("No se encontraron lugares cercanos.");
                        else setStatusMessage(null);
                    }, (err) => {
                        console.warn("Geo error", err);
                        setStatusMessage("No se pudo obtener la ubicación.");
                        setLoading(false);
                    });
                    // Return here to wait for callback
                    return;
                }
            }
            // Case 2: Text Query -> Text Search
            else {
                if (query.length < 3) {
                    setStatusMessage("Introduce al menos 3 caracteres.");
                    setLoading(false);
                    return;
                }

                setStatusMessage(location ? "Buscando..." : "Buscando globalmente...");
                let data = await PlaceService.searchPlaces(query, location?.latitude, location?.longitude);

                // Smart Sort: Prioritize Relevance (Name Match) THEN Distance
                // 1. Exact/Partial Name Match
                // 2. Others
                const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                const exactMatches: PlaceResult[] = [];
                const others: PlaceResult[] = [];

                data.forEach(item => {
                    const normalizedName = item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    // Check if name includes query words (basic relevance)
                    if (normalizedName.includes(normalizedQuery)) {
                        exactMatches.push(item);
                    } else {
                        others.push(item);
                    }
                });

                // Sort both groups by distance
                const sortByDistance = (a: PlaceResult, b: PlaceResult) => {
                    if (a.distance === undefined) return 1;
                    if (b.distance === undefined) return -1;
                    return a.distance - b.distance;
                };

                exactMatches.sort(sortByDistance);
                others.sort(sortByDistance);

                // Combine: Matches first, then others
                setResults([...exactMatches, ...others]);

                setIsOpen(true);
                if (data.length === 0) {
                    setStatusMessage("No se encontraron resultados.");
                } else {
                    setStatusMessage(null);
                }
            }
        } catch (error) {
            console.error("Search error:", error);
            setStatusMessage("Error al buscar.");
        } finally {
            setLoading(false);
        }
    };

    // Removed handleNearby as it is integrated into handleSearch or manual toggle

    // Auto-search (Debounce) integration too for modern UX? User asked to replicate "how it works in old version".
    // Old version had explicit buttons but mostly relied on them. I'll keep explicit handlers as primary but maybe allow Enter key.
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    };

    // Click outside handler
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (place: PlaceResult) => {
        setQuery(place.name);
        setIsOpen(false);
        onSelect(place);
    };

    return (
        <div ref={wrapperRef} className="space-y-2">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className="w-full bg-[#0b1021] border border-white/10 rounded-lg py-3 pl-10 pr-10 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <div className="absolute left-3 top-3.5 text-gray-400">
                        <Search className="w-4 h-4" />
                    </div>

                    {/* Location Status Indicator */}
                    <div className="absolute right-3 top-3.5 flex items-center gap-2">
                        {query ? (
                            <button
                                onClick={() => { setQuery(''); setResults([]); setStatusMessage(null); }}
                                className="text-gray-500 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        ) : (
                            <div title={locLoading ? "Buscando GPS..." : location ? "Ubicación lista" : "Sin ubicación"}>
                                {locLoading ? (
                                    <Loader className="w-4 h-4 text-indigo-500 animate-spin" />
                                ) : location ? (
                                    <MapPin className="w-4 h-4 text-green-500/50" />
                                ) : (
                                    <MapPin className="w-4 h-4 text-gray-600" />
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleSearch}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                    {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="hidden sm:inline">Buscar</span>
                </button>
            </div>

            {/* Status / Error Message */}
            {statusMessage && (
                <div className="text-xs text-indigo-300 bg-indigo-500/10 p-2 rounded border border-indigo-500/20">
                    {statusMessage}
                </div>
            )}

            {/* Results Dropdown */}
            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full md:w-[500px] mt-1 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-fade-in max-h-60 overflow-y-auto custom-scrollbar">
                    {results.map((place) => (
                        <div
                            key={place.id}
                            onClick={() => handleSelect(place)}
                            className="p-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition-colors"
                        >
                            <div className="flex items-start gap-3">
                                <MapPin className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-white text-sm truncate pr-2">{place.name}</h4>
                                        {place.distance !== undefined && (
                                            <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                {place.distance < 1000
                                                    ? `${Math.round(place.distance)} m`
                                                    : `${(place.distance / 1000).toFixed(1)} km`}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 line-clamp-2">{place.address}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div className="p-2 bg-[#0b1021]/50 text-center flex justify-between items-center text-[10px] text-gray-500 px-4">
                        <span>OpenStreetMap Data</span>
                        {onManualToggle && (
                            <button onClick={onManualToggle} className="text-indigo-400 hover:text-indigo-300 underline">
                                ¿No lo encuentras? Añadir manual
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

