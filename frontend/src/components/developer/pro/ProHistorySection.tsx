/**
 * ProHistorySection: sub-pestaña «🗂️ Historial» de «Patrocinios y Pro».
 *
 * Lo resuelto (aprobado, rechazado, finalizado), de solo lectura. Con los
 * filtros de estado (?status=) y de tipo (Carta, Campañas, Platos) se combinan
 * hasta tres consultas paginadas (`status in [...] orderBy createdAt desc`, 25
 * por página) y se mezclan por fecha (takeMerged). Cada fila enseña quién y
 * cuándo la cerró (ResolvedMeta), lo que aplicó la propuesta («🔀 3 reseñas
 * movidas»), los impulsos devueltos y si la cerró el proceso automático.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchResolved, type InboxItem } from '../../../services/adminQueues';
import { Button } from '../../ui';
import { LoadMoreButton } from '../queue';
import { ProRowCard } from './ProRowCard';
import {
    composeRows,
    createMergeSources,
    historySources,
    mergedHasMore,
    proRowDomId,
    takeMerged,
    toProRow,
    type HistoryFilter,
    type MergeFetcher,
    type MergeSource,
    type ProRow,
    type ProSectionProps,
} from './proUtils';

const HISTORY_PAGE_SIZE = 25;

const fetchSourcePage: MergeFetcher = (source) => fetchResolved(source.queue, {
    statuses: source.statuses,
    cursor: source.cursor,
    pageSize: HISTORY_PAGE_SIZE,
});

interface HistoryState {
    /** Filtros, refreshKey y reintento de los datos que se ven (null: aún nada). */
    key: string | null;
    /** Solo los filtros: con otros filtros, lo cargado no vale ni mientras llega lo nuevo. */
    filterKey: string | null;
    sources: MergeSource[];
    items: InboxItem[];
    loadingMore: boolean;
    loadedAt: number | null;
}

const EMPTY_STATE: HistoryState = { key: null, filterKey: null, sources: [], items: [], loadingMore: false, loadedAt: null };

const idOfKey = (key: string): string => key.slice(key.indexOf(':') + 1);

const appendUnique = (current: InboxItem[], next: InboxItem[]): InboxItem[] => {
    const seen = new Set(current.map((item) => item.key));
    return [...current, ...next.filter((item) => !seen.has(item.key))];
};

export interface ProHistorySectionProps extends ProSectionProps {
    status: HistoryFilter;
    /** Total con los filtros actuales (count), para «mostrando X de Y». */
    total: number | null;
}

export const ProHistorySection: React.FC<ProHistorySectionProps> = ({
    active,
    refreshKey,
    search,
    searching = false,
    kind,
    status,
    total,
    focusId,
    focusItem,
    exactItems,
    onMeta,
}) => {
    const [state, setState] = useState<HistoryState>(EMPTY_STATE);
    const [retry, setRetry] = useState(0);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const requestRef = useRef(0);
    const requestedKeyRef = useRef<string | null>(null);

    // Primera página al abrir el Historial y al cambiar un filtro, refreshKey o Reintentar
    // (solo si está a la vista).
    const filterKey = `${kind}|${status}`;
    const wantedKey = `${filterKey}|${refreshKey}|${retry}`;
    const loading = state.key !== wantedKey;
    useEffect(() => {
        if (!active || requestedKeyRef.current === wantedKey) return;
        requestedKeyRef.current = wantedKey;
        const request = ++requestRef.current;
        void takeMerged(createMergeSources(historySources(kind, status)), HISTORY_PAGE_SIZE, fetchSourcePage)
            .then(({ sources, items }) => {
                if (request !== requestRef.current) return;
                setState({ key: wantedKey, filterKey, sources, items, loadingMore: false, loadedAt: Date.now() });
            });
    }, [active, wantedKey, filterKey, kind, status]);

    const retryLoad = useCallback(() => setRetry((value) => value + 1), []);

    const loadMore = useCallback(async () => {
        const request = requestRef.current;
        setState((prev) => ({ ...prev, loadingMore: true }));
        const { sources, items } = await takeMerged(state.sources, HISTORY_PAGE_SIZE, fetchSourcePage);
        if (request !== requestRef.current) return;
        setState((prev) => ({ ...prev, sources, items: appendUnique(prev.items, items), loadingMore: false }));
    }, [state.sources]);

    const degraded = state.sources.some((source) => source.degraded);
    useEffect(() => {
        onMeta({ loading, loadedAt: state.loadedAt, degraded });
    }, [onMeta, loading, state.loadedAt, degraded]);

    const term = search.trim();
    const sameFilter = state.filterKey === filterKey;
    const loadedRows = useMemo(() => (sameFilter ? state.items.map(toProRow) : []), [sameFilter, state.items]);
    const rows: ProRow[] = useMemo(() => composeRows({
        loaded: loadedRows,
        view: 'history',
        kind,
        term,
        focusItem,
        exactItems,
        overrides: {},
        accepts: (item) => status === 'all' || item.status === status,
    }), [loadedRows, kind, term, focusItem, exactItems, status]);

    const scrolledRef = useRef<string | null>(null);
    useEffect(() => {
        if (!focusId) {
            scrolledRef.current = null;
            return;
        }
        if (!active || scrolledRef.current === focusId) return;
        const target = rows.find((row) => row.item.id === focusId);
        const element = target ? document.getElementById(proRowDomId(target.item)) : null;
        if (!element) return;
        scrolledRef.current = focusId;
        element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, [active, focusId, rows]);

    const toggle = useCallback((key: string) => {
        setExpanded((prev) => ({ ...prev, [key]: !(prev[key] ?? idOfKey(key) === focusId) }));
    }, [focusId]);

    const failed = state.sources.filter((source) => source.error);
    const emptyText = term
        ? searching ? '🔎 Buscando también en el servidor…' : `🔎 Nada coincide con «${term}».`
        : '🗂️ No hay nada archivado con estos filtros.';

    return (
        <div className="space-y-3">
            {failed.map((source) => (
                <div key={source.queue} role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    <span>⚠️ {source.error}</span>
                    <Button variant="secondary" size="sm" onClick={retryLoad} disabled={loading}>Reintentar</Button>
                </div>
            ))}

            {loading && rows.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                    ⏳ Cargando el historial…
                </div>
            ) : rows.length === 0 ? (
                (failed.length === 0 || term) && state.loadedAt !== null && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                        {emptyText}
                    </div>
                )
            ) : (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <ProRowCard
                            key={row.item.key}
                            row={row}
                            mode="history"
                            expanded={expanded[row.item.key] ?? row.item.id === focusId}
                            focused={row.item.id === focusId}
                            onToggle={toggle}
                        />
                    ))}
                </div>
            )}

            {!degraded && !term && !loading && state.loadedAt !== null && (
                <LoadMoreButton
                    onClick={() => void loadMore()}
                    hasMore={mergedHasMore(state.sources)}
                    loading={state.loadingMore}
                    shown={state.items.length}
                    total={total}
                    pageSize={HISTORY_PAGE_SIZE}
                />
            )}
        </div>
    );
};
