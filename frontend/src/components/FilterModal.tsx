import React from 'react';
import { X, Sliders, Star } from 'lucide-react';
import type { FilterState } from '../pages/ListPage';

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    criteriaDefinition?: Record<string, { label: string; min?: number; max?: number; step?: number }>;
}

export const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose, filters, setFilters, criteriaDefinition }) => {
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
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#151b2e] w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-indigo-400" /> Filtros
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-8">

                    {/* Global Rating Filter */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                <Star className="w-4 h-4 text-yellow-500 fill-current" /> Nota Global Mínima
                            </label>
                            <span className="text-sm font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                                {filters.minRating > 0 ? filters.minRating.toFixed(1) : 'Cualquiera'}
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
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0</span>
                            <span>5</span>
                            <span>10</span>
                        </div>
                    </div>

                    {/* Criteria Filters (Dynamic) */}
                    {criteriaDefinition && Object.keys(criteriaDefinition).length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">Por Criterio</h3>
                            <div className="space-y-5">
                                {Object.entries(criteriaDefinition).map(([key, def]) => {
                                    const currentVal = filters.criteriaMin[key] || 0;
                                    const min = def.min ?? 0;
                                    const max = def.max ?? 10;

                                    return (
                                        <div key={key}>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <label className="text-sm text-gray-300">{def.label}</label>
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${currentVal > min ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'}`}>
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
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-white/5 pb-2">Estado</h3>

                        <label className="flex items-center justify-between cursor-pointer group p-2 hover:bg-white/5 rounded-lg transition-colors">
                            <span className="text-gray-300 text-sm">Visitados por mí</span>
                            <div className={`w-10 h-6 rounded-full relative transition-colors ${filters.visited ? 'bg-indigo-600' : 'bg-gray-700 group-hover:bg-gray-600'}`}>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={filters.visited}
                                    onChange={(e) => setFilters(prev => ({ ...prev, visited: e.target.checked }))}
                                />
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${filters.visited ? 'translate-x-5' : 'translate-x-1'}`}></div>
                            </div>
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group p-2 hover:bg-white/5 rounded-lg transition-colors">
                            <span className="text-gray-300 text-sm">Con fotos</span>
                            <div className={`w-10 h-6 rounded-full relative transition-colors ${filters.hasPhoto ? 'bg-indigo-600' : 'bg-gray-700 group-hover:bg-gray-600'}`}>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={filters.hasPhoto}
                                    onChange={(e) => setFilters(prev => ({ ...prev, hasPhoto: e.target.checked }))}
                                />
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${filters.hasPhoto ? 'translate-x-5' : 'translate-x-1'}`}></div>
                            </div>
                        </label>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-white/5 flex gap-3">
                    <button
                        onClick={clearFilters}
                        className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Limpiar Todo
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-colors"
                    >
                        Ver Resultados
                    </button>
                </div>
            </div>
        </div>
    );
};
