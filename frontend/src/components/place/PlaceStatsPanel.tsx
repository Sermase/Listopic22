import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { fetchListDetails, listDetailsQueryKey, type ReviewEntity } from '../../hooks/useListDetails';
import { distinctContextRanks } from '../../lib/geoAreas';
import { rankListElements, type RankedElement } from '../../lib/listElements';
import { averageScore } from '../../lib/scoring';
import { formatScore, scoreBadgeStyle } from '../../lib/scoreScale';
import { fetchBotAuthorIds } from '../../utils/authorRoles';

interface PlaceStatsPanelProps {
    placeId: string;
    reviews: ReviewEntity[];
    globalScore: number | null;
    reviewCount: number;
}

interface ListBreakdown {
    listId: string;
    listName: string;
    count: number;
    average: number | null;
}

type RanksState =
    | { status: 'loading' }
    | { status: 'ready'; byList: Record<string, RankedElement[]> }
    | { status: 'error' };

/**
 * Estadísticas de un sitio: nota Listopic global (provisional), desglose por
 * Lista y puesto de sus elementos en cada Lista (misma fórmula y mismos
 * filtros que la página de la Lista). Los puestos se calculan al abrir esta
 * pestaña porque exigen leer las Listas completas.
 */
export const PlaceStatsPanel: React.FC<PlaceStatsPanelProps> = ({ placeId, reviews, globalScore, reviewCount }) => {
    const queryClient = useQueryClient();
    const [ranks, setRanks] = useState<RanksState>({ status: 'loading' });

    const breakdown = useMemo<ListBreakdown[]>(() => {
        const byList = new Map<string, { name: string; scores: number[] }>();
        reviews.forEach((review) => {
            if (!review.listId) return;
            const entry = byList.get(review.listId) ?? { name: review.listName || 'Lista', scores: [] };
            if (typeof review.overallRating === 'number') entry.scores.push(review.overallRating);
            byList.set(review.listId, entry);
        });
        return [...byList.entries()]
            .map(([listId, e]) => ({ listId, listName: e.name, count: e.scores.length, average: averageScore(e.scores) }))
            .sort((a, b) => b.count - a.count);
    }, [reviews]);

    const listIdsKey = breakdown.map((b) => b.listId).join('|');

    useEffect(() => {
        let cancelled = false;
        const listIds = listIdsKey ? listIdsKey.split('|') : [];
        (async () => {
            try {
                const details = await Promise.all(listIds.map(async (listId) => {
                    try {
                        return [listId, await queryClient.fetchQuery({
                            queryKey: listDetailsQueryKey(listId),
                            queryFn: () => fetchListDetails(listId),
                            staleTime: 5 * 60 * 1000,
                        })] as const;
                    } catch {
                        return [listId, null] as const; // Lista privada o borrada: sin puestos.
                    }
                }));
                const authors = details.flatMap(([, d]) => d?.reviews.map((r) => r.userId || r.authorId || '') ?? []);
                const bots = await fetchBotAuthorIds(authors);
                const byList: Record<string, RankedElement[]> = {};
                details.forEach(([listId, d]) => {
                    if (!d) return;
                    byList[listId] = rankListElements(d.reviews, d.list, { excludeAuthorIds: bots });
                });
                if (!cancelled) setRanks({ status: 'ready', byList });
            } catch {
                if (!cancelled) setRanks({ status: 'error' });
            }
        })();
        return () => { cancelled = true; };
    }, [listIdsKey, queryClient]);

    return (
        <div className="space-y-4">
            <section className="glass-card rounded-2xl p-5 border border-[var(--lt-border)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Nota Listopic</p>
                <div className="mt-2 flex items-center gap-4">
                    {globalScore !== null && reviewCount > 0 ? (
                        <div className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-2xl font-black font-display" style={scoreBadgeStyle(globalScore)}>
                            {formatScore(Number(globalScore.toFixed(1)))}
                        </div>
                    ) : (
                        <div className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-2xl font-black bg-[var(--lt-border)] text-[var(--lt-text-muted)]">—</div>
                    )}
                    <div className="min-w-0">
                        <p className="font-bold text-[var(--lt-text)]">
                            {reviewCount} {reviewCount === 1 ? 'valoración' : 'valoraciones'} en {breakdown.length} {breakdown.length === 1 ? 'Lista' : 'Listas'}
                        </p>
                        <p className="mt-1 text-xs text-[var(--lt-text-muted)] flex items-start gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                            <span>
                                Provisional: media simple de todas las valoraciones de este sitio, en todas sus Listas.
                                Con más datos se revisará la fórmula.
                            </span>
                        </p>
                    </div>
                </div>
            </section>

            <section className="glass-card rounded-2xl p-5 border border-[var(--lt-border)]">
                <h3 className="text-sm font-bold text-[var(--lt-text)]">Por Lista</h3>
                {breakdown.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--lt-text-muted)]">Todavía no hay valoraciones de este sitio.</p>
                ) : (
                    <ul className="mt-3 divide-y divide-[var(--lt-border)]">
                        {breakdown.map((row) => {
                            const elements = ranks.status === 'ready'
                                ? (ranks.byList[row.listId] ?? []).filter((e) => e.placeId === placeId)
                                : [];
                            return (
                                <li key={row.listId} className="py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <Link to={`/list/${row.listId}`} className="font-semibold text-[var(--lt-text)] hover:text-[var(--lt-accent)] truncate">
                                            {row.listName}
                                        </Link>
                                        <div className="flex items-center gap-2 shrink-0 text-xs text-[var(--lt-text-muted)]">
                                            <span>{row.count} {row.count === 1 ? 'valoración' : 'valoraciones'}</span>
                                            {row.average !== null && (
                                                <span className="px-2 py-0.5 rounded-md font-bold" style={scoreBadgeStyle(row.average)}>
                                                    {row.average.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {ranks.status === 'loading' && (
                                        <div className="mt-2 h-3 w-40 lt-skeleton rounded" aria-label="Calculando puestos" />
                                    )}
                                    {ranks.status === 'ready' && elements.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {elements.map((element) => {
                                                const distinct = distinctContextRanks(element.contextRanks);
                                                const [main, ...rest] = distinct.length > 0
                                                    ? distinct
                                                    : [{ label: `#${element.rank} en la Lista` }];
                                                return (
                                                    <li key={element.id} className="text-xs">
                                                        <span className="text-[var(--lt-text)]">{element.itemName}</span>
                                                        {' · '}
                                                        <span className="font-semibold text-[var(--lt-accent)]">{main.label}</span>
                                                        {rest.length > 0 && (
                                                            <span className="text-[var(--lt-text-muted)]"> · {rest.map((r) => r.label).join(' · ')}</span>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {ranks.status === 'error' && (
                    <p className="mt-2 text-xs text-[var(--lt-text-muted)]">No se han podido calcular los puestos ahora mismo.</p>
                )}
                {ranks.status === 'ready' && (
                    <p className="mt-3 text-[11px] text-[var(--lt-text-muted)]">
                        Puestos como en cada Lista: sin bots ni sitios cerrados, con la misma fórmula de ranking.
                    </p>
                )}
            </section>
        </div>
    );
};
