import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useLocation } from '../../hooks/useLocation';
import type { DishRef } from '../../lib/chatExtras';
import { searchDishes } from '../../lib/chatDishSearch';
import { DishRow } from './DishRow';

export const DishPicker: React.FC<{ onPick: (dish: DishRef) => void; exclude?: DishRef[] }> = ({ onPick, exclude = [] }) => {
    const { location } = useLocation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DishRef[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const dishes = await searchDishes(query.trim(), location);
                if (!cancelled) setResults(dishes);
            } catch (error) {
                console.error('DishPicker: búsqueda fallida', error);
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, query ? 300 : 0);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query, location]);

    const isExcluded = (d: DishRef) => exclude.some((e) => e.itemName === d.itemName && e.placeName === d.placeName);

    return (
        <div>
            <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Plato o sitio: bravas, Docamar…"
                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                />
            </div>
            <p className="text-[11px] text-gray-500 mt-2 mb-1">{query ? 'Resultados' : 'Cerca de ti'}</p>
            <div className="space-y-1">
                {loading && results.length === 0 && <p className="text-xs text-gray-500 py-3 text-center">Buscando…</p>}
                {!loading && results.length === 0 && <p className="text-xs text-gray-500 py-3 text-center">No hay platos con ese nombre.</p>}
                {results.filter((d) => !isExcluded(d)).map((dish) => (
                    <button
                        key={`${dish.listId}-${dish.placeName}-${dish.itemName}`}
                        type="button"
                        onClick={() => onPick(dish)}
                        className="w-full text-left rounded-xl p-1.5 hover:bg-white/5 transition-colors"
                    >
                        <DishRow dish={dish} />
                    </button>
                ))}
            </div>
        </div>
    );
};
