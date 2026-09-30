import React, { useState } from 'react';
import { useRefinementList } from 'react-instantsearch';
import { MapPin, X } from 'lucide-react';
import { geoAreaLabel, type GeoLevel } from '../../lib/geoAreas';
import { ZONE_LEVELS, zoneAttributes } from '../../lib/searchZones';

/**
 * Buscar: explorar cualquier zona (ciudad, provincia, comunidad o país), no
 * solo la tuya. Una sola zona a la vez. En la Lista y la Home solo se ofrece
 * el contexto local; aquí se elige libremente.
 */
export const ZoneExplorer: React.FC<{ tab: 'items' | 'places' }> = ({ tab }) => {
    const attrs = zoneAttributes(tab);
    const refinements: Record<GeoLevel, ReturnType<typeof useRefinementList>> = {
        city: useRefinementList({ attribute: attrs.city, limit: 100, sortBy: ['count:desc', 'name:asc'] }),
        province: useRefinementList({ attribute: attrs.province, limit: 100, sortBy: ['count:desc', 'name:asc'] }),
        region: useRefinementList({ attribute: attrs.region, limit: 100, sortBy: ['count:desc', 'name:asc'] }),
        country: useRefinementList({ attribute: attrs.country, limit: 100, sortBy: ['count:desc', 'name:asc'] }),
    };
    const active = ZONE_LEVELS
        .map(({ level }) => ({ level, item: refinements[level].items.find((i) => i.isRefined) }))
        .find((x) => x.item);
    const [level, setLevel] = useState<GeoLevel>(active?.level ?? 'city');
    const shownLevel = active?.level ?? level;
    const options = refinements[shownLevel].items;

    const clearAll = () => ZONE_LEVELS.forEach(({ level: l }) => {
        refinements[l].items.filter((i) => i.isRefined).forEach((i) => refinements[l].refine(i.value));
    });
    const choose = (value: string) => {
        clearAll();
        if (value) refinements[shownLevel].refine(value);
    };

    return (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Zona">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--lt-text-muted)]">
                <MapPin className="w-3.5 h-3.5" aria-hidden /> Zona
            </span>
            <div className="inline-flex rounded-full border border-[var(--lt-border)] p-0.5 bg-[var(--lt-bg)]">
                {ZONE_LEVELS.map(({ level: l, label }) => (
                    <button
                        key={l}
                        type="button"
                        aria-pressed={shownLevel === l}
                        onClick={() => { if (active) clearAll(); setLevel(l); }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${shownLevel === l ? 'bg-[var(--lt-accent)] text-white' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <select
                aria-label={`Elegir ${ZONE_LEVELS.find((x) => x.level === shownLevel)?.label.toLowerCase()}`}
                value={active?.item?.value ?? ''}
                onChange={(e) => choose(e.target.value)}
                className="min-w-0 max-w-[14rem] truncate rounded-full border border-[var(--lt-border)] bg-[var(--lt-bg)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]"
            >
                <option value="">{options.length ? 'Todas' : 'Sin datos todavía'}</option>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{geoAreaLabel(shownLevel, o.label)} ({o.count})</option>
                ))}
            </select>
            {active?.item && (
                <button type="button" onClick={clearAll} aria-label="Quitar zona" className="p-1 rounded-full text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};
