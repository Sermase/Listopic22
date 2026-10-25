import React from 'react';
import { X, SlidersHorizontal, Star, Trash2, ChevronDown } from 'lucide-react';
import type { FilterState } from '../pages/ListPage';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { HelpTip } from './HelpTip';

const ACCESSIBILITY_FILTER_LABELS: Record<string, string> = {
    wheelchairAccessibleEntrance: 'Entrada accesible',
    wheelchairAccessibleSeating: 'Asientos accesibles',
    wheelchairAccessibleParking: 'Parking accesible',
    wheelchairAccessibleRestroom: 'Baño accesible',
    hearingLoop: 'Bucle auditivo',
};

type SortMode = 'rating' | 'newest' | 'oldest' | 'count';

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
    { id: 'rating', label: 'Mejor nota' },
    { id: 'count', label: 'Más reseñas' },
    { id: 'newest', label: 'Lo último' },
    { id: 'oldest', label: 'Lo primero' },
];

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    criteriaDefinition?: Record<string, { label: string; min?: number; max?: number; step?: number }>;
    sortMode: SortMode;
    setSortMode: (mode: SortMode) => void;
    availableTags: string[];
    selectedTags: string[];
    setSelectedTags: (tags: string[]) => void;
    showUnavailable?: boolean;
    setShowUnavailable?: (v: boolean) => void;
    showBotReviews?: boolean;
    setShowBotReviews?: (v: boolean) => void;
    criticOnly?: boolean;
    setCriticOnly?: (v: boolean) => void;
    groupByPlace?: boolean;
    setGroupByPlace?: (v: boolean) => void;
    /** Resultados con los filtros actuales (para el botón «Ver N»). */
    resultCount?: number;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">{children}</h3>
);

/** Interruptor con una línea de explicación debajo cuando la opción puede despistar. */
const ToggleRow: React.FC<{ label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, hint, checked, onChange }) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2.5 transition-colors hover:border-[var(--lt-accent-border)]">
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--lt-text)]">{label}</span>
            {hint && <span className="mt-0.5 block text-xs leading-snug text-[var(--lt-text-muted)]">{hint}</span>}
        </span>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-[var(--lt-accent)]' : 'bg-[var(--lt-border)]'}`}>
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
    </label>
);

const chipClass = (active: boolean) => `rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${active
    ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent)] lt-on-accent'
    : 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`;

/**
 * Hoja de filtros de una Lista: todo en una sola pantalla que se desplaza, lo
 * habitual arriba y lo fino (criterios, accesibilidad) en desplegables.
 */
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
    showBotReviews,
    setShowBotReviews,
    criticOnly,
    setCriticOnly,
    groupByPlace,
    setGroupByPlace,
    resultCount,
}) => {
    useBodyScrollLock(isOpen);
    const panelRef = useSheetDismiss(onClose, isOpen);

    if (!isOpen) return null;

    const handleCriterionChange = (key: string, value: number) => {
        setFilters(prev => ({ ...prev, criteriaMin: { ...prev.criteriaMin, [key]: value } }));
    };

    const clearFilters = () => {
        setFilters({
            minRating: 0,
            hasPhoto: false,
            glutenFree: false,
            petFriendly: false,
            visited: false,
            accessibility: {},
            criteriaMin: {}
        });
        setSelectedTags([]);
        setShowBotReviews?.(false);
        setCriticOnly?.(false);
        setGroupByPlace?.(false);
        setShowUnavailable?.(false);
    };

    const toggleTag = (tag: string) => {
        setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]);
    };

    const criteriaActive = Object.values(filters.criteriaMin || {}).filter(v => v > 0).length;
    const accessibilityActive = Object.values(filters.accessibility || {}).filter(Boolean).length;

    return (
        <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={panelRef} role="dialog" aria-label="Filtros" className="bg-[var(--lt-card-strong)] w-full sm:max-w-md sm:rounded-2xl shadow-2xl border-0 sm:border border-[var(--lt-border)] overflow-hidden flex flex-col lt-mobile-modal-panel sm:max-h-[90vh] rounded-t-2xl" onClick={e => e.stopPropagation()}>

                <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--lt-border)] px-4 py-3">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--lt-text)]">
                        <SlidersHorizontal className="h-5 w-5 text-[var(--lt-accent)]" /> Filtros <HelpTip topic="filtros" />
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-2 text-[var(--lt-text-muted)] transition-colors hover:bg-[var(--lt-glass)] hover:text-[var(--lt-text)]">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-4">
                    <div>
                        <SectionTitle>Ordenar</SectionTitle>
                        <div className="flex flex-wrap gap-2">
                            {SORT_OPTIONS.map(option => (
                                <button key={option.id} type="button" aria-pressed={sortMode === option.id} onClick={() => setSortMode(option.id)} className={chipClass(sortMode === option.id)}>
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <SectionTitle>Nota mínima</SectionTitle>
                            <span className="flex items-center gap-1 text-sm font-bold text-[var(--lt-text)]">
                                <Star className="h-3.5 w-3.5 fill-current text-amber-400" />
                                {filters.minRating > 0 ? filters.minRating.toFixed(1).replace('.', ',') : 'Cualquiera'}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.5"
                            value={filters.minRating}
                            onChange={(e) => setFilters(prev => ({ ...prev, minRating: parseFloat(e.target.value) }))}
                            aria-label="Nota mínima"
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[var(--lt-border)] accent-[var(--lt-accent)]"
                        />
                    </div>

                    {availableTags && availableTags.length > 0 && (
                        <div>
                            <SectionTitle>Etiquetas</SectionTitle>
                            <div className="flex flex-wrap gap-2">
                                {availableTags.map(tag => (
                                    <button key={tag} type="button" aria-pressed={selectedTags.includes(tag)} onClick={() => toggleTag(tag)} className={chipClass(selectedTags.includes(tag))}>
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <SectionTitle>Qué ver</SectionTitle>
                        {setGroupByPlace && (
                            <ToggleRow label="Agrupar por sitio" hint="Junta en una fila los platos de un mismo sitio." checked={!!groupByPlace} onChange={setGroupByPlace} />
                        )}
                        <ToggleRow label="Con fotos" checked={filters.hasPhoto} onChange={(v) => setFilters(prev => ({ ...prev, hasPhoto: v }))} />
                        <ToggleRow label="Donde ya he estado" hint="Solo lo que tú ya has reseñado." checked={filters.visited} onChange={(v) => setFilters(prev => ({ ...prev, visited: v }))} />
                        {setCriticOnly && (
                            <ToggleRow label="Solo críticos" hint="Solo reseñas de gente con la insignia de crítico." checked={!!criticOnly} onChange={setCriticOnly} />
                        )}
                        {setShowBotReviews && (
                            <ToggleRow label="Incluir reseñas de bots" hint="Listopic añade reseñas automáticas para arrancar; por defecto no se ven." checked={!!showBotReviews} onChange={setShowBotReviews} />
                        )}
                        {setShowUnavailable && (
                            <ToggleRow label="Incluir no disponibles" hint="Platos retirados de la carta y sitios cerrados." checked={!!showUnavailable} onChange={setShowUnavailable} />
                        )}
                    </div>

                    <div className="space-y-2">
                        <SectionTitle>Dieta y más</SectionTitle>
                        <ToggleRow label="Sin gluten" hint="Según lo que marca la gente: no es una garantía para alérgicos." checked={filters.glutenFree} onChange={(v) => setFilters(prev => ({ ...prev, glutenFree: v }))} />
                        <ToggleRow label="Admite mascotas" checked={filters.petFriendly} onChange={(v) => setFilters(prev => ({ ...prev, petFriendly: v }))} />
                    </div>

                    {criteriaDefinition && Object.keys(criteriaDefinition).length > 0 && (
                        <details className="group rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)]" open={criteriaActive > 0}>
                            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-[var(--lt-text)]">
                                <span>
                                    Afinar por criterio {criteriaActive > 0 && <span className="text-[var(--lt-accent)]">· {criteriaActive}</span>}
                                    <span className="mt-0.5 block text-xs font-normal text-[var(--lt-text-muted)]">Nota mínima en cada cosa que puntúa esta lista.</span>
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--lt-text-muted)] transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="space-y-4 px-3 pb-3">
                                {Object.entries(criteriaDefinition).map(([key, def]) => {
                                    const currentVal = filters.criteriaMin[key] || 0;
                                    const min = def.min ?? 0;
                                    const max = def.max ?? 10;
                                    return (
                                        <div key={key}>
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-sm text-[var(--lt-text)]">{def.label}</span>
                                                <span className={`text-xs font-bold ${currentVal > min ? 'text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)]'}`}>
                                                    {currentVal > min ? `≥ ${currentVal}` : 'Cualquiera'}
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min={min}
                                                max={max}
                                                step={def.step ?? 0.5}
                                                value={currentVal}
                                                aria-label={`Mínimo en ${def.label}`}
                                                onChange={(e) => handleCriterionChange(key, parseFloat(e.target.value))}
                                                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--lt-border)] accent-[var(--lt-accent)]"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </details>
                    )}

                    <details className="group rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)]" open={accessibilityActive > 0}>
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-[var(--lt-text)]">
                            <span>Accesibilidad {accessibilityActive > 0 && <span className="text-[var(--lt-accent)]">· {accessibilityActive}</span>}</span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--lt-text-muted)] transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="flex flex-wrap gap-2 px-3 pb-3">
                            {Object.entries(ACCESSIBILITY_FILTER_LABELS).map(([key, label]) => {
                                const active = Boolean(filters.accessibility?.[key]);
                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        aria-pressed={active}
                                        onClick={() => setFilters(prev => ({ ...prev, accessibility: { ...(prev.accessibility || {}), [key]: !active } }))}
                                        className={chipClass(active)}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </details>
                </div>

                <div className="flex flex-shrink-0 items-center gap-3 border-t border-[var(--lt-border)] bg-[var(--lt-bg)] p-4 safe-area-bottom">
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--lt-text-muted)] transition-colors hover:bg-[var(--lt-glass)] hover:text-[var(--lt-text)]"
                    >
                        <Trash2 className="h-4 w-4" /> Limpiar
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-xl px-6 py-3 text-center font-bold lt-on-accent shadow-lg transition-transform active:scale-95"
                        style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                    >
                        {typeof resultCount === 'number' ? `Ver ${resultCount} ${resultCount === 1 ? 'resultado' : 'resultados'}` : 'Ver resultados'}
                    </button>
                </div>
            </div>
        </div>
    );
};
