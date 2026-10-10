/**
 * PlanHistorySection: segmento «🗂️ Historial» de Planes, legible (no JSON).
 *
 *   🗂️ Cambios de planes e impulsos   adminAuditLog where action in […] orderBy createdAt desc,
 *                                     25 por página; filtro por tipo (?status=) en el servidor.
 *                                     Sin índice (action, createdAt): 200 sin paginar y orden aproximado.
 *   💶 Compras de impulsos           impulsePurchases orderBy createdAt desc (solo con Todo o Impulsos)
 *
 * Props
 *   filter: HistoryFilter                         'all' | 'business' | 'premium' | 'impulses' | 'stripe'
 *   onManagePlace?: (placeId: string) => void     abre el panel del local
 */
import React, { useMemo } from 'react';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { cn } from '../../../lib/utils';
import { shortUid, useAdminNames } from '../../../hooks/useAdminNames';
import { formatDateTime } from '../../../utils/adminTime';
import { formatEur } from '../../../config/planBeta';
import { Button, Card } from '../../ui';
import { LoadMoreButton } from '../queue';
import {
    HISTORY_PAGE,
    PLANS_QUERY_KEY,
    PURCHASES_PAGE,
    fetchImpulsePurchases,
    fetchPlanHistory,
    type CursorPage,
    type PageCursor,
} from './planQueries';
import {
    PURCHASE_STATUS,
    describeHistoryEntry,
    formatImpulses,
    type HistoryFilter,
    type ImpulsePurchaseRow,
    type PlanHistoryEntry,
} from './planUtils';

export interface PlanHistorySectionProps {
    filter: HistoryFilter;
    onManagePlace?: (placeId: string) => void;
}

const ACTOR_LABELS: Record<string, string> = {
    system: '🤖 Automático',
    stripe: '💳 Stripe',
};

const NAME_STALE_MS = 30 * 60 * 1000;

/** Nombres de locales que el registro no guardó (getDoc cacheado por id). */
const usePlaceNames = (ids: string[]): Record<string, string> => {
    const idsKey = Array.from(new Set(ids.filter(Boolean))).sort().join('|');
    const unique = useMemo(() => (idsKey ? idsKey.split('|') : []), [idsKey]);
    const results = useQueries({
        queries: unique.map((id) => ({
            queryKey: ['placeName', id] as const,
            queryFn: async () => {
                const snap = await getDoc(doc(db, 'places', id));
                const data = snap.exists() ? snap.data() as Record<string, unknown> : {};
                return typeof data.name === 'string' && data.name.trim() ? data.name.trim() : '';
            },
            staleTime: NAME_STALE_MS,
            retry: 0,
        })),
    });
    const namesKey = results.map((result) => result.data ?? '').join('\u0000');
    return useMemo(() => {
        const loaded = namesKey.split('\u0000');
        const names: Record<string, string> = {};
        unique.forEach((id, index) => {
            if (loaded[index]) names[id] = loaded[index];
        });
        return names;
    }, [unique, namesKey]);
};

const linkClass = 'font-semibold text-[var(--lt-accent)] underline-offset-2 hover:underline';

const flatten = <T,>(pages: Array<CursorPage<T>> | undefined): T[] => (pages ?? []).flatMap((page) => page.rows);

const HistoryRow: React.FC<{
    entry: PlanHistoryEntry;
    names: Record<string, string>;
    placeNames: Record<string, string>;
    onManagePlace?: (placeId: string) => void;
}> = ({ entry, names, placeNames, onManagePlace }) => {
    const info = describeHistoryEntry(entry);
    const actor = entry.actorUid ? ACTOR_LABELS[entry.actorUid] ?? names[entry.actorUid] ?? shortUid(entry.actorUid) : '';
    const placeName = info.placeId ? info.placeName || placeNames[info.placeId] || shortUid(info.placeId) : '';
    const userName = info.userId ? info.userName || names[info.userId] || shortUid(info.userId) : '';
    return (
        <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 space-y-0.5">
                <p className="text-sm text-gray-200">
                    <span aria-hidden="true">{info.emoji}</span>{' '}
                    <span className="font-semibold text-white">{info.title}</span>
                    {info.placeId && (
                        <>
                            {' · '}
                            <a href={`/place/${encodeURIComponent(info.placeId)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                                {placeName}
                            </a>
                        </>
                    )}
                    {info.userId && !info.placeId && (
                        <>
                            {' · '}
                            <a href={`/profile/${encodeURIComponent(info.userId)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                                {userName}
                            </a>
                        </>
                    )}
                </p>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-400">
                    {actor && <span>por <span className="font-semibold text-gray-200">{actor}</span></span>}
                    {info.parts.map((part) => (
                        <React.Fragment key={part}>
                            <span aria-hidden="true" className="text-gray-500">·</span>
                            <span>{part}</span>
                        </React.Fragment>
                    ))}
                    {info.notes && (
                        <>
                            <span aria-hidden="true" className="text-gray-500">·</span>
                            <span className="break-words italic text-gray-300">“{info.notes}”</span>
                        </>
                    )}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <time className="text-xs tabular-nums text-gray-500">{formatDateTime(entry.createdAtMs)}</time>
                {info.placeId && onManagePlace && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onManagePlace(info.placeId as string)} title="Abrir el plan del local">
                        ⚙️
                    </Button>
                )}
            </div>
        </li>
    );
};

const PurchaseRow: React.FC<{ purchase: ImpulsePurchaseRow; names: Record<string, string>; placeNames: Record<string, string> }> = ({ purchase, names, placeNames }) => {
    const meta = PURCHASE_STATUS[purchase.status] ?? { emoji: '•', label: purchase.status, className: 'border-white/15 bg-white/5 text-gray-300' };
    const placeName = purchase.placeId ? purchase.placeName || placeNames[purchase.placeId] || shortUid(purchase.placeId) : '';
    return (
        <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 text-sm text-gray-200">
                    <span className="font-semibold text-white">💶 {formatImpulses(purchase.impulses)}</span>
                    {purchase.amountEur !== null && <span className="tabular-nums">{formatEur(purchase.amountEur)}</span>}
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold', meta.className)}>
                        <span aria-hidden="true">{meta.emoji}</span>{meta.label}
                    </span>
                </p>
                <p className="text-xs text-gray-400">
                    {purchase.placeId && (
                        <a href={`/place/${encodeURIComponent(purchase.placeId)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                            {placeName}
                        </a>
                    )}
                    {purchase.userId && <span> · por {names[purchase.userId] ?? shortUid(purchase.userId)}</span>}
                    {purchase.paidAtMs > 0 && <span> · pagada el {formatDateTime(purchase.paidAtMs)}</span>}
                </p>
            </div>
            <time className="shrink-0 text-xs tabular-nums text-gray-500">{formatDateTime(purchase.createdAtMs)}</time>
        </li>
    );
};

export const PlanHistorySection: React.FC<PlanHistorySectionProps> = ({ filter, onManagePlace }) => {
    const history = useInfiniteQuery({
        queryKey: [...PLANS_QUERY_KEY, 'history', filter],
        queryFn: ({ pageParam }) => fetchPlanHistory({ filter, cursor: pageParam }),
        initialPageParam: null as PageCursor | null,
        getNextPageParam: (last) => (last.hasMore ? last.cursor : undefined),
        staleTime: 60 * 1000,
    });
    const showPurchases = filter === 'all' || filter === 'impulses';
    const purchases = useInfiniteQuery({
        queryKey: [...PLANS_QUERY_KEY, 'purchases'],
        queryFn: ({ pageParam }) => fetchImpulsePurchases({ cursor: pageParam }),
        initialPageParam: null as PageCursor | null,
        getNextPageParam: (last) => (last.hasMore ? last.cursor : undefined),
        enabled: showPurchases,
        staleTime: 60 * 1000,
    });

    const entries = useMemo(() => flatten(history.data?.pages), [history.data]);
    const purchaseRows = useMemo(() => flatten(purchases.data?.pages), [purchases.data]);
    const degraded = history.data?.pages.some((page) => page.degraded) ?? false;

    const uids = useMemo(() => [
        ...entries.flatMap((entry) => [entry.actorUid, describeHistoryEntry(entry).userId]),
        ...purchaseRows.map((purchase) => purchase.userId),
    ].filter((uid): uid is string => Boolean(uid) && !ACTOR_LABELS[uid as string]), [entries, purchaseRows]);
    const names = useAdminNames(uids);
    const missingPlaceIds = useMemo(() => [
        ...entries.map((entry) => describeHistoryEntry(entry)).filter((info) => info.placeId && !info.placeName).map((info) => info.placeId as string),
        ...purchaseRows.filter((purchase) => purchase.placeId && !purchase.placeName).map((purchase) => purchase.placeId as string),
    ], [entries, purchaseRows]);
    const placeNames = usePlaceNames(missingPlaceIds);

    return (
        <div className="space-y-4">
            <Card className="p-4 sm:p-6">
                <h3 className="text-lg font-bold text-white">🗂️ Cambios de planes e impulsos</h3>
                <p className="mt-1 text-sm text-gray-400">Concesiones, retiradas, caducidades, pruebas de la beta, impulsos y avisos de Stripe.</p>
                {degraded && (
                    <p className="mt-3 inline-block rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                        ⚠️ Índice en construcción, orden aproximado
                    </p>
                )}
                {history.isError ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <span>⚠️ No se pudo cargar el historial.</span>
                        <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>Reintentar</Button>
                    </div>
                ) : history.isPending ? (
                    <p className="mt-4 text-sm text-gray-400">⏳ Cargando historial…</p>
                ) : entries.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                        🗂️ Todavía no hay cambios de este tipo.
                    </p>
                ) : (
                    <ul className="mt-3 divide-y divide-white/5">
                        {entries.map((entry) => (
                            <HistoryRow key={entry.id} entry={entry} names={names} placeNames={placeNames} onManagePlace={onManagePlace} />
                        ))}
                    </ul>
                )}
                {!degraded && entries.length > 0 && (
                    <LoadMoreButton
                        onClick={() => void history.fetchNextPage()}
                        hasMore={history.hasNextPage}
                        loading={history.isFetchingNextPage}
                        shown={entries.length}
                        pageSize={HISTORY_PAGE}
                    />
                )}
            </Card>

            {showPurchases && (
                <Card className="p-4 sm:p-6">
                    <h3 className="text-lg font-bold text-white">💶 Compras de impulsos</h3>
                    <p className="mt-1 text-sm text-gray-400">Pagos con Stripe. «Sin pagar» es un checkout que no se terminó.</p>
                    {purchases.isError ? (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            <span>⚠️ No se pudieron cargar las compras.</span>
                            <Button variant="secondary" size="sm" onClick={() => void purchases.refetch()}>Reintentar</Button>
                        </div>
                    ) : purchases.isPending ? (
                        <p className="mt-4 text-sm text-gray-400">⏳ Cargando compras…</p>
                    ) : purchaseRows.length === 0 ? (
                        <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                            💶 Aún no hay compras de impulsos.
                        </p>
                    ) : (
                        <ul className="mt-3 divide-y divide-white/5">
                            {purchaseRows.map((purchase) => (
                                <PurchaseRow key={purchase.id} purchase={purchase} names={names} placeNames={placeNames} />
                            ))}
                        </ul>
                    )}
                    {purchaseRows.length > 0 && (
                        <LoadMoreButton
                            onClick={() => void purchases.fetchNextPage()}
                            hasMore={purchases.hasNextPage}
                            loading={purchases.isFetchingNextPage}
                            shown={purchaseRows.length}
                            pageSize={PURCHASES_PAGE}
                        />
                    )}
                </Card>
            )}
        </div>
    );
};
