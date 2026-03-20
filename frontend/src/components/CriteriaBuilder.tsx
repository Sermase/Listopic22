import React from 'react';
import { Plus, X, Sliders, Lock } from 'lucide-react';

export interface Criterion {
    id: string;
    label: string;
    minLabel: string;
    maxLabel: string;
    isPonderable: boolean;
    step?: number;
    locked?: boolean;
}

interface CriteriaBuilderProps {
    criteria: Criterion[];
    onChange: (criteria: Criterion[]) => void;
    lockedIds?: string[];
}

export const CriteriaBuilder: React.FC<CriteriaBuilderProps> = ({ criteria, onChange, lockedIds = [] }) => {

    const addCriterion = () => {
        const newCriterion: Criterion = {
            id: Date.now().toString(),
            label: '',
            minLabel: 'Malo',
            maxLabel: 'Excelente',
            isPonderable: true,
            step: 0.5
        };
        onChange([...criteria, newCriterion]);
    };

    const removeCriterion = (id: string) => {
        const item = criteria.find(c => c.id === id);
        if (lockedIds.includes(id) || item?.locked) return;
        onChange(criteria.filter(c => c.id !== id));
    };

    const updateCriterion = (id: string, field: keyof Criterion, value: any) => {
        const item = criteria.find(c => c.id === id);
        if (lockedIds.includes(id) || item?.locked) return;
        onChange(criteria.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        ));
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                Criterios de Evaluación
            </h3>
            <p className="text-sm text-gray-400">
                Define qué aspectos se valorarán en esta lista (ej. Sabor, Ambiente, Precio).
            </p>

            <div className="space-y-3">
                {criteria.map((criterion) => {
                    const isLocked = lockedIds.includes(criterion.id) || criterion.locked;
                    return (
                        <div key={criterion.id} className={`bg-[#151b2e] p-4 rounded-xl border ${isLocked ? 'border-indigo-500/30' : 'border-white/5'} animate-fade-in relative group`}>
                            {!isLocked && (
                                <button
                                    type="button"
                                    onClick={() => removeCriterion(criterion.id)}
                                    className="absolute top-2 right-2 p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            {isLocked && (
                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-bold rounded border border-indigo-500/30 flex items-center gap-1">
                                    <Lock className="w-3 h-3" /> Heredado
                                </div>
                            )}

                            <div className="space-y-3">
                                {/* Row 1: name + ponderable + step */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">
                                            Nombre del Criterio {isLocked && '(Heredado)'}
                                        </label>
                                        <input
                                            type="text"
                                            value={criterion.label}
                                            onChange={(e) => updateCriterion(criterion.id, 'label', e.target.value)}
                                            placeholder="Ej: Calidad del Café"
                                            disabled={isLocked}
                                            className={`w-full bg-[#0b1021] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        />
                                    </div>

                                    <div className="flex items-center gap-4 mt-6 flex-wrap">
                                        <label className={`flex items-center gap-2 ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                                            <input
                                                type="checkbox"
                                                checked={criterion.isPonderable}
                                                onChange={(e) => updateCriterion(criterion.id, 'isPonderable', e.target.checked)}
                                                disabled={isLocked}
                                                className={`w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-[#0b1021] ${isLocked ? 'cursor-not-allowed' : ''}`}
                                            />
                                            <span className="text-sm text-gray-300">Afecta al promedio {isLocked && '(Fijo)'}</span>
                                        </label>
                                        <div className={`flex items-center gap-2 ${isLocked ? 'opacity-50' : ''}`}>
                                            <span className="text-xs text-gray-400">Paso:</span>
                                            <select
                                                value={criterion.step ?? 0.5}
                                                onChange={(e) => updateCriterion(criterion.id, 'step', parseFloat(e.target.value))}
                                                disabled={isLocked}
                                                className={`bg-[#0b1021] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500 ${isLocked ? 'cursor-not-allowed' : ''}`}
                                            >
                                                <option value={0.1}>0.1</option>
                                                <option value={0.25}>0.25</option>
                                                <option value={0.5}>0.5</option>
                                                <option value={1}>1</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: min/max labels */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Etiqueta mínimo</label>
                                        <input
                                            type="text"
                                            value={criterion.minLabel}
                                            onChange={(e) => updateCriterion(criterion.id, 'minLabel', e.target.value)}
                                            placeholder="Ej: Malo"
                                            disabled={isLocked}
                                            className={`w-full bg-[#0b1021] border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-xs focus:outline-none focus:border-indigo-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Etiqueta máximo</label>
                                        <input
                                            type="text"
                                            value={criterion.maxLabel}
                                            onChange={(e) => updateCriterion(criterion.id, 'maxLabel', e.target.value)}
                                            placeholder="Ej: Excelente"
                                            disabled={isLocked}
                                            className={`w-full bg-[#0b1021] border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-xs focus:outline-none focus:border-indigo-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                onClick={addCriterion}
                className="w-full py-3 border border-dashed border-white/20 rounded-xl text-gray-400 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
            >
                <Plus className="w-4 h-4" /> Agregar Criterio
            </button>
        </div>
    );
};
