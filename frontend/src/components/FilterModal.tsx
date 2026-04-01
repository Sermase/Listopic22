import React from 'react';
import { X, Sliders, Star, Trash2, Check, ArrowUpDown, EyeOff } from 'lucide-react';
import type { FilterState } from '../pages/ListPage';

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    criteriaDefinition?: Record<string, { label: string; min?: number; max?: number; step?: number }>;
    sortMode: 'rating' | 'newest' | 'oldest' | 'count';
    setSortMode: (mode: 'rating' | 'newest' | 'oldest' | 'count') => void;
    availableTags: string[];
    selectedTags: string[];
    setSelectedTags: (tags: string[]) => void;
    showUnavailable?: boolean;
    setShowUnavailable?: (v: boolean) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
    isOpen,
    onClose,
    filters,
    setFilters,
    criteriaDefinition,
    sortMode,
    setSortMode,
    availableTags,
    selectedTags,
    setSelectedTags,
    showUnavailable,
    setShowUnavailable,
}) => {
    const [activeTab, setActiveTab] = React.useState<'filters' | 'sort'>('filters');

    if (!isOpen) return null;

    const handleCriterionChange = (key: string, value: number) => {
        setFilters(prev => ({
            ...prev,
            criteriaMin: {
                ...prev.criteriaMin,
                [key]: value
            }
        }));
    };

    const clearFilters = () => {
        setFilters({
            minRating: 0,
            hasPhoto: false,
            visited: false,
            criteriaMin: {}
        });
        setSelectedTags([]);
    };

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[#151b2e] w-full sm:max-w-md sm:rounded-2xl shadow-2xl border-0 sm:border border-white/10 overflow-hidden flex flex-col max-h-[calc(100dvh-4rem)] sm:max-h-[90vh] rounded-t-2xl transition-all" onClick={e => e.stopPropagation()}>

                {/* Header with Tabs */}
                <div className="border-b border-white/10 bg-white/5 flex-shrink-0">
                    <div className="p-4 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Sliders className="w-5 h-5 text-indigo-400" /> Preferencias
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex px-4 gap-4">
                        <button
                            onClick={() => setActiveTab('filters')}
                            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex-1 text-center ${activeTab === 'filters' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                        >
                            Filtros
                        </button>
                        <button
                            onClick={() => setActiveTab('sort')}
                            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex-1 text-center ${activeTab === 'sort' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                        >
                            Ordenar
                        </button>
                    </div>
                </div>

                {/* Body - Scrollable */}
                <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-[#151b2e]">

                    {activeTab === 'filters' ? (
                        <>
                            {/* Tag Cloud */}
                            {availableTags && availableTags.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        Etiquetas
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setSelectedTags([])}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${selectedTags.length === 0 ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'}`}
                                        >
                                            Todas
                                        </button>
                                        {availableTags.map(tag => (
                                            <button
                                                key={tag}
                                                onClick={() => toggleTag(tag)}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${selectedTags.includes(tag) ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'}`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Global Rating Filter */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                        <Star className="w-4 h-4 text-yellow-500 fill-current" /> Nota Global Mínima
                                    </label>
                                    <span className="text-sm font-bold text-white bg-white/10 px-2.5 py-1 rounded-md min-w-[3rem] text-center">
                                        {filters.minRating > 0 ? filters.minRating.toFixed(1) : 'Anyone'}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    step="0.5"
                                    value={filters.minRating}
                                    onChange={(e) => setFilters(prev => ({ ...prev, minRating: parseFloat(e.target.value) }))}
                                    className="w-full accent-indigo-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-2 font-medium">
                                    <span>0</span>
                                    <span>5</span>
                                    <span>10</span>
                                </div>
                            </div>

                            {/* Criteria Filters */}
                            {criteriaDefinition && Object.keys(criteriaDefinition).length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">Por Criterio</h3>
                                    <div className="space-y-6">
                                        {Object.entries(criteriaDefinition).map(([key, def]) => {
                                            const currentVal = filters.criteriaMin[key] || 0;
                                            const min = def.min ?? 0;
                                            const max = def.max ?? 10;
                                            return (
                                                <div key={key}>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <label className="text-sm text-gray-300">{def.label}</label>
                                                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${currentVal > min ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'}`}>
                                                            {currentVal > min ? `> ${currentVal}` : 'Cualquiera'}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min={min}
                                                        max={max}
                                                        step={def.step ?? 0.5}
                                                        value={currentVal}
                                                        onChange={(e) => handleCriterionChange(key, parseFloat(e.target.value))}
                                                        className="w-full accent-emerald-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Toggles */}
                            <div className="space-y-3 pt-2">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-white/5 pb-2">Estado</h3>
                                <label className="flex items-center justify-between cursor-pointer group p-3 bg-white/5 rounded-xl transition-all hover:bg-white/10 border border-white/5">
                                    <span className="text-gray-300 text-sm font-medium">Visitados por mí</span>
                                    <div className={`w-11 h-6 rounded-full relative transition-colors ${filters.visited ? 'bg-indigo-600' : 'bg-gray-700 group-hover:bg-gray-600'}`}>
                                        <input type="checkbox" className="hidden" checked={filters.visited} onChange={(e) => setFilters(prev => ({ ...prev, visited: e.target.checked }))} />
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${filters.visited ? 'translate-x-6' : 'translate-x-1'}`}></div>
                                    </div>
                                </label>
                                <label className="flex items-center justify-between cursor-pointer group p-3 bg-white/5 rounded-xl transition-all hover:bg-white/10 border border-white/5">
                                    <span className="text-gray-300 text-sm font-medium">Con fotos</span>
                                    <div className={`w-11 h-6 rounded-full relative transition-colors ${filters.hasPhoto ? 'bg-indigo-600' : 'bg-gray-700 group-hover:bg-gray-600'}`}>
                                        <input type="checkbox" className="hidden" checked={filters.hasPhoto} onChange={(e) => setFilters(prev => ({ ...prev, hasPhoto: e.target.checked }))} />
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${filters.hasPhoto ? 'translate-x-6' : 'translate-x-1'}`}></div>
                                    </div>
                                </label>
                                {setShowUnavailable && (
                                    <label className="flex items-center justify-between cursor-pointer group p-3 bg-white/5 rounded-xl transition-all hover:bg-white/10 border border-white/5">
                                        <span className="text-gray-300 text-sm font-medium flex items-center gap-2">
                                            <EyeOff className="w-4 h-4 text-red-400" /> Mostrar no disponibles
                                        </span>
                                        <div className={`w-11 h-6 rounded-full relative transition-colors ${showUnavailable ? 'bg-red-600' : 'bg-gray-700 group-hover:bg-gray-600'}`}>
                                            <input type="checkbox" className="hidden" checked={!!showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${showUnavailable ? 'translate-x-6' : 'translate-x-1'}`}></div>
                                        </div>
                                    </label>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <ArrowUpDown className="w-3 h-3" /> Ordenar Por
                            </h3>
                            {[
                                { id: 'rating', label: 'Mejor Valorados', icon: <Star className="w-4 h-4" /> },
                                { id: 'newest', label: 'Más Recientes', icon: <Check className="w-4 h-4" /> },
                                { id: 'oldest', label: 'Más Antiguos', icon: <Check className="w-4 h-4" /> },
                                { id: 'count', label: 'Más Reseñados', icon: <Check className="w-4 h-4" /> }
                            ].map(option => (
                                <button
                                    key={option.id}
                                    onClick={() => setSortMode(option.id as any)}
                                    className={`w-full p-4 rounded-xl border text-left text-sm font-bold transition-all flex items-center justify-between group
                                        ${sortMode === option.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-[#0b1021] border-white/10 text-gray-400 hover:border-white/30 hover:text-white hover:bg-white/5'}`}
                                >
                                    <span className="flex items-center gap-3">
                                        {option.label}
                                    </span>
                                    {sortMode === option.id && <div className="w-2.5 h-2.5 rounded-full bg-white shadow-glow"></div>}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Spacer for bottom actions */}
                    <div className="h-4"></div>
                </div>

                {/* Footer Actions - Fixed Bottom */}
                <div className="border-t border-white/10 bg-[#0b1021] p-4 flex items-center justify-between gap-4 flex-shrink-0 z-10 safe-area-bottom">
                    <button
                        onClick={clearFilters}
                        className="px-4 py-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors text-sm font-bold flex items-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Limpiar</span>
                        <span className="sm:hidden">Reset</span>
                    </button>

                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-95 text-center"
                    >
                        Ver Resultados
                    </button>
                </div>

            </div>
        </div>
    );
};
