/**
 * PlanInterestStats: segmento «🧪 Beta «Lo quiero»» de Planes. Solo se monta
 * al abrir ese segmento (antes leía 2000 documentos cada vez que se abría Planes).
 *
 *   Tiles (consultas count):
 *     👋 Negocios que lo quieren   planInterest de business_pro, sin local y anuales
 *     🧪 Business Pro en prueba    places where businessPlanSource=='trial' && businessProActive==true
 *                                  (no planInterest.trialExpiresAt: así no cuenta pruebas retiradas o
 *                                  pasadas a Stripe y sí cuenta las de 1 o 3 meses dadas en Developer)
 *   Lista: los más recientes (planInterest orderBy lastAt desc, 25 por página) o, con
 *   el filtro «Sin local», los leads que aún no tienen local verificado. Cada fila
 *   enlaza al lugar y al usuario, y «⚙️ Plan» abre el panel del local.
 *
 * Props
 *   filter?: 'all' | 'noPlace'                    ?status= del segmento
 *   onManagePlace?: (placeId: string) => void
 */
import React, { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { shortUid, useAdminNames } from '../../hooks/useAdminNames';
import { formatDate, formatDateTime, formatUntil } from '../../utils/adminTime';
import { Button, Card } from '../ui';
import { LoadMoreButton } from './queue';
import {
    INTEREST_PAGE,
    PLANS_QUERY_KEY,
    fetchInterestPage,
    fetchInterestSummary,
    type PageCursor,
} from './plans/planQueries';
import type { BetaFilter, InterestRow } from './plans/planUtils';

export interface PlanInterestStatsProps {
    filter?: BetaFilter;
    onManagePlace?: (placeId: string) => void;
}

const num = (value: number | null | undefined): string => (typeof value === 'number' ? value.toLocaleString('es-ES') : '?');

const Tile: React.FC<{ emoji: string; label: string; value: number | null | undefined; hint?: string; loading?: boolean }> = ({ emoji, label, value, hint, loading }) => (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
            <span aria-hidden="true">{emoji}</span> {label}
        </p>
        <p className="mt-1 text-2xl font-black tabular-nums text-white">{loading ? '…' : num(value)}</p>
        {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
);

const linkClass = 'font-semibold text-[var(--lt-accent)] underline-offset-2 hover:underline';

const TrialText: React.FC<{ row: InterestRow }> = ({ row }) => {
    if (!row.trialGrantedAtMs && !row.trialExpiresAtMs) return null;
    if (row.trialActive) {
        return <span className="text-emerald-300">🧪 prueba hasta el {formatDate(row.trialExpiresAtMs)} ({formatUntil(row.trialExpiresAtMs)})</span>;
    }
    return <span className="text-gray-400">⌛ prueba terminada{row.trialExpiresAtMs ? ` el ${formatDate(row.trialExpiresAtMs)}` : ''}</span>;
};

const InterestItem: React.FC<{ row: InterestRow; names: Record<string, string>; onManagePlace?: (placeId: string) => void }> = ({ row, names, onManagePlace }) => (
    <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-gray-200">
                <span className="font-semibold text-white">{row.plan === 'premium' ? '👑 Premium' : '✨ Business Pro'}</span>
                <span aria-hidden="true" className="text-gray-500">·</span>
                {row.placeId ? (
                    <a href={`/place/${encodeURIComponent(row.placeId)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {row.placeName || shortUid(row.placeId)}
                    </a>
                ) : row.plan === 'business_pro' ? (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">👋 Sin local verificado</span>
                ) : null}
                <span aria-hidden="true" className="text-gray-500">·</span>
                <span className="text-gray-400">{row.billing === 'yearly' ? 'anual' : 'mensual'}{row.clicks > 1 ? ` · ${row.clicks} clics` : ''}</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-400">
                {row.userId && (
                    <span>
                        👤{' '}
                        <a href={`/profile/${encodeURIComponent(row.userId)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                            {names[row.userId] ?? shortUid(row.userId)}
                        </a>
                    </span>
                )}
                <TrialText row={row} />
            </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
            <time className="text-xs tabular-nums text-gray-500" title="Último «Lo quiero»">{formatDateTime(row.lastAtMs)}</time>
            {row.placeId && onManagePlace && (
                <Button variant="secondary" size="sm" className="h-7 px-2" onClick={() => onManagePlace(row.placeId as string)}>
                    ⚙️ Plan
                </Button>
            )}
        </div>
    </li>
);

export const PlanInterestStats: React.FC<PlanInterestStatsProps> = ({ filter = 'all', onManagePlace }) => {
    const summary = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'interestSummary'],
        queryFn: () => fetchInterestSummary(),
        staleTime: 60 * 1000,
    });
    const list = useInfiniteQuery({
        queryKey: [...PLANS_QUERY_KEY, 'interest', filter],
        queryFn: ({ pageParam }) => fetchInterestPage({ filter, cursor: pageParam }),
        initialPageParam: null as PageCursor | null,
        getNextPageParam: (last) => (last.hasMore ? last.cursor : undefined),
        staleTime: 60 * 1000,
    });

    const rows = useMemo(() => (list.data?.pages ?? []).flatMap((page) => page.rows), [list.data]);
    const names = useAdminNames(rows.map((row) => row.userId));
    const stats = summary.data;
    const loadingStats = summary.isPending;

    return (
        <div className="space-y-4">
            <Card className="p-4 sm:p-6">
                <h3 className="text-lg font-bold text-white">🧪 Beta «Lo quiero»</h3>
                <p className="mt-1 text-sm text-gray-400">Negocios que han pedido Business Pro gratis desde /planes o el paywall.</p>
                {summary.isError && <p className="mt-3 text-sm text-red-300">⚠️ No se pudieron cargar los totales.</p>}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Tile
                        emoji="👋"
                        label="Negocios que lo quieren"
                        value={stats?.interested}
                        loading={loadingStats}
                        hint={stats ? `${num(stats.withoutPlace)} aún sin local verificado · ${num(stats.yearly)} anual` : undefined}
                    />
                    <Tile
                        emoji="🧪"
                        label="Business Pro en prueba ahora"
                        value={stats?.trialsNow}
                        loading={loadingStats}
                        hint={stats ? `${num(stats.betaTrialsNow)} de la beta · ${num(stats.betaTrialsGranted)} pruebas de la beta concedidas en total` : undefined}
                    />
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                    «En prueba ahora» se cuenta en los locales: incluye las pruebas dadas desde Developer y no las retiradas ni las que ya pagan con Stripe.
                </p>
            </Card>

            <Card className="p-4 sm:p-6">
                <h3 className="text-lg font-bold text-white">
                    {filter === 'noPlace' ? '👋 Leads sin local verificado' : '🕒 Lo último'}
                </h3>
                {list.isError ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <span>⚠️ No se pudo cargar el interés por los planes.</span>
                        <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>Reintentar</Button>
                    </div>
                ) : list.isPending ? (
                    <p className="mt-4 text-sm text-gray-400">⏳ Cargando…</p>
                ) : rows.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                        {filter === 'noPlace' ? '✨ No hay leads sin local.' : '🧪 Todavía nadie ha pulsado «Lo quiero».'}
                    </p>
                ) : (
                    <ul className="mt-3 divide-y divide-white/5">
                        {rows.map((row) => <InterestItem key={row.id} row={row} names={names} onManagePlace={onManagePlace} />)}
                    </ul>
                )}
                {rows.length > 0 && (
                    <LoadMoreButton
                        onClick={() => void list.fetchNextPage()}
                        hasMore={list.hasNextPage}
                        loading={list.isFetchingNextPage}
                        shown={rows.length}
                        total={filter === 'noPlace' ? stats?.withoutPlace : stats?.interested}
                        pageSize={INTEREST_PAGE}
                    />
                )}
            </Card>
        </div>
    );
};
