import React from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { RANGE_STEPS_KM } from '../context/FilterContext';
import { distanceLabel, type AreaOption, type GeoLevel } from '../lib/geoAreas';

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
}

/**
 * Selector de zona de la Lista. Primero, los radios de distancia de siempre;
 * después, las ciudades, provincias, comunidades y países que hay en la Lista.
 */
export const AreaSelect: React.FC<AreaSelectProps> = ({ value, range, options, onChange }) => {
    const steps = range !== null && !RANGE_STEPS_KM.includes(range) ? [range, ...RANGE_STEPS_KM].sort((a, b) => a - b) : RANGE_STEPS_KM;
    const levels: GeoLevel[] = ['city', 'province', 'region', 'country'];
    const isNear = value.startsWith('r:');
    const isFiltering = value !== 'r:all';

    return (
        <label className={`relative inline-flex items-center gap-1.5 pl-3 pr-7 py-1.5 rounded-full text-xs font-bold border shrink-0 cursor-pointer transition-colors ${isFiltering
            ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-[#fff] shadow-lg'
            : 'bg-[var(--lt-bg)] border-[var(--lt-border-strong)] text-[var(--lt-text-muted)]'}`}
        >
            <MapPin className="w-3 h-3 shrink-0" aria-hidden />
            <span className="sr-only">Zona</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="appearance-none bg-transparent border-none p-0 pr-1 text-xs font-bold focus:outline-none focus:ring-0 cursor-pointer max-w-[9.5rem] truncate text-inherit"
                style={{ color: 'inherit' }}
                aria-label={isNear ? 'Distancia o zona' : 'Zona'}
            >
                <optgroup label="Distancia">
                    {steps.map((km) => <option key={km} value={`r:${km}`}>{distanceLabel(km)}</option>)}
                    <option value="r:all">Sin límite de distancia</option>
                </optgroup>
                {levels.map((level) => options[level].length > 0 && (
                    <optgroup key={level} label={GROUP_LABELS[level]}>
                        {options[level].map((option) => (
                            <option key={`${level}:${option.value}`} value={`${level}:${option.value}`}>
                                {option.label} ({option.count})
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2.5 pointer-events-none" aria-hidden />
        </label>
    );
};
