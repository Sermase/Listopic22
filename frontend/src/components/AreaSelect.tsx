import React from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { RANGE_STEPS_KM } from '../context/FilterContext';
import { distanceLabel, LOCAL_LEVELS, type AreaOption, type GeoLevel } from '../lib/geoAreas';

const GROUP_LABELS: Record<GeoLevel, string> = {
    city: 'Ciudad',
    province: 'Provincia',
    region: 'Comunidad autónoma',
    country: 'País',
};

interface AreaSelectProps {
    /** 'r:5' | 'r:all' | 'city:Valladolid' | … */
    value: string;
    range: number | null;
    options: Record<GeoLevel, AreaOption[]>;
    onChange: (value: string) => void;
    /**
     * 'local' (Lista y Home): radios y, en un grupo «Donde estás», tu ciudad,
     * tu comunidad y tu país. 'explore' (Buscar): todas las zonas por nivel.
     */
    mode?: 'local' | 'explore';
    /** En modo local, última opción: «Explorar otra zona en Buscar…». */
    onExplore?: () => void;
}

export const EXPLORE_OPTION_VALUE = 'explore';

/**
 * Selector de zona. Primero, los radios de distancia de siempre; después, en la
 * Lista y la Home, solo lo que rodea a la persona (su ciudad, su comunidad y su
 * país). Otras zonas se exploran en Buscar.
 */
export const AreaSelect: React.FC<AreaSelectProps> = ({ value, range, options, onChange, mode = 'local', onExplore }) => {
    const steps = range !== null && !RANGE_STEPS_KM.includes(range) ? [range, ...RANGE_STEPS_KM].sort((a, b) => a - b) : RANGE_STEPS_KM;
    const levels: GeoLevel[] = ['city', 'province', 'region', 'country'];
    const isNear = value.startsWith('r:');
    const isFiltering = value !== 'r:all';

    return (
        <label className={`relative inline-flex items-center gap-1.5 pl-3 pr-7 py-1.5 rounded-full text-xs font-bold border min-w-0 max-w-full cursor-pointer transition-colors ${isFiltering
            ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-[#fff] shadow-lg'
            : 'bg-[var(--lt-bg)] border-[var(--lt-border-strong)] text-[var(--lt-text-muted)]'}`}
        >
            <MapPin className="w-3 h-3 shrink-0" aria-hidden />
            <span className="sr-only">Zona</span>
            <select
                value={value}
                onChange={(event) => {
                    if (event.target.value === EXPLORE_OPTION_VALUE) { onExplore?.(); return; }
                    onChange(event.target.value);
                }}
                className="appearance-none bg-transparent border-none p-0 pr-1 text-xs font-bold focus:outline-none focus:ring-0 cursor-pointer w-full min-w-0 max-w-[11rem] truncate text-inherit"
                style={{ color: 'inherit' }}
                aria-label={isNear ? 'Distancia o zona' : 'Zona'}
            >
                <optgroup label="Distancia">
                    {steps.map((km) => <option key={km} value={`r:${km}`}>{distanceLabel(km)}</option>)}
                    <option value="r:all">Sin límite de distancia</option>
                </optgroup>
                {mode === 'local' ? (
                    LOCAL_LEVELS.some((level) => options[level].length > 0) && (
                        <optgroup label="Donde estás">
                            {LOCAL_LEVELS.flatMap((level) => options[level].map((option) => (
                                <option key={`${level}:${option.value}`} value={`${level}:${option.value}`}>
                                    {option.label} ({option.count})
                                </option>
                            )))}
                        </optgroup>
                    )
                ) : levels.map((level) => options[level].length > 0 && (
                    <optgroup key={level} label={GROUP_LABELS[level]}>
                        {options[level].map((option) => (
                            <option key={`${level}:${option.value}`} value={`${level}:${option.value}`}>
                                {option.label} ({option.count})
                            </option>
                        ))}
                    </optgroup>
                ))}
                {mode === 'local' && onExplore && (
                    <optgroup label="Otras zonas">
                        <option value={EXPLORE_OPTION_VALUE}>Explorar otra zona en Buscar…</option>
                    </optgroup>
                )}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2.5 pointer-events-none" aria-hidden />
        </label>
    );
};
