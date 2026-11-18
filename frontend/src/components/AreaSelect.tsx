import React from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { RANGE_STEPS_KM } from '../context/FilterContext';
import { distanceLabel, geoAreaLabel, LOCAL_LEVELS, nearestLabel, reachableRangeSteps, type AreaOption, type GeoLevel } from '../lib/geoAreas';

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
    /** Km hasta el elemento más cercano: no se ofrecen radios que no lleguen a él. */
    nearestKm?: number | null;
    /** 'pill' (botón con borde) o 'inline' (texto dentro de una frase, como un enlace). */
    variant?: 'pill' | 'inline';
}

export const EXPLORE_OPTION_VALUE = 'explore';

/**
 * Selector de zona. Primero, los radios de distancia de siempre; después, en la
 * Lista y la Home, solo lo que rodea a la persona (su ciudad, su comunidad y su
 * país). Otras zonas se exploran en Buscar.
 */
export const AreaSelect: React.FC<AreaSelectProps> = ({ value, range, options, onChange, mode = 'local', onExplore, nearestKm = null, variant = 'pill' }) => {
    const reachable = reachableRangeSteps(RANGE_STEPS_KM, nearestKm);
    const steps = range !== null && !reachable.includes(range) ? [range, ...reachable].sort((a, b) => a - b) : reachable;
    const levels: GeoLevel[] = ['city', 'province', 'region', 'country'];
    const isNear = value.startsWith('r:');
    const isFiltering = value !== 'r:all';
    const distanceGroup = nearestKm !== null ? `Distancia · lo más cerca está ${nearestLabel(nearestKm)}` : 'Distancia';

    const choices = (
        <>
            <optgroup label={distanceGroup}>
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
        </>
    );
    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        if (event.target.value === EXPLORE_OPTION_VALUE) { onExplore?.(); return; }
        onChange(event.target.value);
    };

    if (variant === 'inline') {
        // Se ve la frase («a menos de 200 km ▾»); el selector nativo va encima, invisible.
        const colon = value.indexOf(':');
        const label = value === 'r:all'
            ? 'sin límite de distancia'
            : isNear
                ? distanceLabel(Number(value.slice(2))).toLowerCase()
                : `en ${geoAreaLabel(value.slice(0, colon) as GeoLevel, value.slice(colon + 1))}`;
        return (
            <span className="relative inline-flex items-center gap-0.5 font-bold text-[var(--lt-accent)] cursor-pointer">
                <MapPin className="w-3 h-3 shrink-0" aria-hidden />
                <span className="underline decoration-dotted underline-offset-2">{label}</span>
                <ChevronDown className="w-3 h-3 shrink-0" aria-hidden />
                <select
                    value={value}
                    onChange={handleChange}
                    aria-label={isNear ? 'Distancia o zona' : 'Zona'}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none text-base"
                >
                    {choices}
                </select>
            </span>
        );
    }

    return (
        <label className={`relative inline-flex items-center gap-1.5 pl-3 pr-7 py-1.5 rounded-full text-xs font-bold border min-w-0 max-w-full cursor-pointer transition-colors ${isFiltering
            ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-[#fff] shadow-lg'
            : 'bg-[var(--lt-bg)] border-[var(--lt-border-strong)] text-[var(--lt-text-muted)]'}`}
        >
            <MapPin className="w-3 h-3 shrink-0" aria-hidden />
            <span className="sr-only">Zona</span>
            <select
                value={value}
                onChange={handleChange}
                className="appearance-none bg-transparent border-none p-0 pr-1 text-xs font-bold focus:outline-none focus:ring-0 cursor-pointer w-full min-w-0 max-w-[11rem] truncate text-inherit"
                style={{ color: 'inherit' }}
                aria-label={isNear ? 'Distancia o zona' : 'Zona'}
            >
                {choices}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2.5 pointer-events-none" aria-hidden />
        </label>
    );
};
