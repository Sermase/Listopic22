import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { useListRanks } from '../hooks/useListRanks';
import { distinctContextRanks } from '../lib/geoAreas';

interface ElementRanksProps {
    placeId: string;
    itemName: string;
    /** Listas donde está el elemento; la primera es la principal (de la que se viene). */
    listIds: ReadonlyArray<string>;
    listNames: Readonly<Record<string, string>>;
}

const MAX_LISTS = 3;

/**
 * Puesto del elemento en sus Listas: uno principal y bien visible
 * («#3 en Valladolid») y los más amplios como información secundaria
 * («#18 en Castilla y León · #126 en España»). Nada si no hay puesto.
 */
export const ElementRanks: React.FC<ElementRanksProps> = ({ placeId, itemName, listIds, listNames }) => {
    const shown = listIds.slice(0, MAX_LISTS);
    const ranks = useListRanks(shown);
    if (ranks.status !== 'ready') return null;
    const name = itemName.trim().toLowerCase();

    const rows = shown.map((listId) => {
        const element = (ranks.byList[listId] ?? []).find((e) => e.placeId === placeId && e.itemName.trim().toLowerCase() === name);
        if (!element) return null;
        const distinct = distinctContextRanks(element.contextRanks);
        const [main, ...rest] = distinct.length > 0 ? distinct.map((r) => r.label) : [`#${element.rank} en la Lista`];
        return { listId, main, rest };
    }).filter((row): row is { listId: string; main: string; rest: string[] } => row !== null);

    if (rows.length === 0) return null;

    return (
        <section aria-label="Puestos" className="bg-[var(--lt-card-strong)] p-4 rounded-xl border border-white/10 space-y-2">
            {rows.map((row) => (
                <div key={row.listId} className="flex items-start gap-3">
                    <Trophy className="w-5 h-5 text-[var(--lt-accent)] shrink-0 mt-0.5" aria-hidden />
                    <div className="min-w-0">
                        <p className="text-sm text-[var(--lt-text)]">
                            <span className="font-black text-[var(--lt-accent)]">{row.main}</span>
                            {' · '}
                            <Link to={`/list/${row.listId}`} className="font-semibold hover:underline">{listNames[row.listId] || 'Lista'}</Link>
                        </p>
                        {row.rest.length > 0 && (
                            <p className="text-xs text-[var(--lt-text-muted)]">{row.rest.join(' · ')}</p>
                        )}
                    </div>
                </div>
            ))}
        </section>
    );
};
