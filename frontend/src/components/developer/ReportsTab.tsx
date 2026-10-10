/**
 * ReportsTab: «Centro de Moderación» de Developer (antes, inline en DeveloperPage).
 *
 * Vistas (?view=): 'pending' (por defecto, del más antiguo al más reciente, los
 * urgentes 🚨 primero, 50 por página) y 'resolved' (historial, del más reciente
 * al más antiguo, 25 por página, ?status= resolved | rejected; vacío = todos).
 * ?focus=<id> despliega ese reporte; si no estaba cargado se lee aparte, se
 * cambia a su vista y se fija arriba.
 *
 * Props (contrato de pestañas de DeveloperPage): DeveloperTabProps
 *   { focusId?, view?, status?, onNavigate({ view?, status?, focus? }) }
 *
 * Datos: services/adminQueues (fetchPending / fetchResolved / countEachStatus /
 * lookupExact) y services/reportModeration (escrituras). Tras cada decisión se
 * invalida ['developer'] (contadores de la barra lateral y de la bandeja).
 */
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle, ChevronDown, ExternalLink, Flag, RefreshCcw, X } from 'lucide-react';
import { db } from '../../firebase';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useInvalidateDeveloper } from '../../hooks/useDeveloperInbox';
import {
    REPORT_ISSUES,
    REPORT_TARGETS,
    countEachStatus,
    fetchPending,
    fetchResolved,
    lookupExact,
    looksLikeId,
    matchesSearch,
    toInboxItem,
    viewForStatus,
    type InboxItem,
    type QueueCursor,
    type QueuePage,
} from '../../services/adminQueues';
import {
    CLOSED_STATUS_LABELS,
    groupReportPlaceId,
    markGroupItemUnavailable,
    syncPlaceStatusFromGoogle,
    updateReportStatus,
    type PlaceClosedStatus,
    type ReportDecision,
} from '../../services/reportModeration';
import { formatDate, formatDateTime } from '../../utils/adminTime';
import { Button, Card } from '../ui';
import { AgeChip, LoadMoreButton, QueueToolbar, ResolvedMeta, StatusChip } from './queue';
import type { DeveloperTabProps } from './developerTabs';

type ReportsView = 'pending' | 'resolved';
type ArchiveFilter = 'all' | 'resolved' | 'rejected';
type RowMessage = { tone: 'success' | 'error'; text: string };

const PENDING_PAGE_SIZE = 50;
const RESOLVED_PAGE_SIZE = 25;
const REPORTS_KEY = ['adminQueue', 'reports'] as const;
const COUNTS_KEY = ['developer', 'reports', 'counts'] as const;
const REPORT_STATUSES = ['pending', 'resolved', 'rejected'] as const;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const errorMessage = (error: unknown): string =>
    (error instanceof Error && error.message ? error.message : 'error desconocido');

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
    if (!(key in record)) return record;
    const next = { ...record };
    delete next[key];
    return next;
};

const reportRowDomId = (id: string): string => `report-${id}`;

const TARGET_LINKS: Record<string, (id: string) => string> = {
    place: (id) => `/place/${id}`,
    user: (id) => `/profile/${id}`,
    list: (id) => `/list/${id}`,
};

const isClosedStatus = (value: string): value is PlaceClosedStatus =>
    value === 'permanently_closed' || value === 'temporarily_closed';

/** Cambios locales tras decidir (la fila se queda a la vista con su aviso hasta Actualizar). */
const decisionPatch = (
    status: ReportDecision,
    closedStatus: PlaceClosedStatus | undefined,
    note: string,
    actorUid: string | undefined,
): Record<string, unknown> => (status === 'pending'
    ? { status: 'pending', resolvedAt: null, resolvedBy: null, resolvedClosedStatus: null }
    : {
        status,
        resolvedAt: Date.now(),
        resolvedBy: actorUid || 'admin',
        ...(note ? { adminNotes: note } : {}),
        ...(closedStatus ? { resolvedClosedStatus: closedStatus } : {}),
    });

const CLOSED_STATUS_TEXT: Record<PlaceClosedStatus, string> = {
    permanently_closed: 'cerrado permanentemente',
    temporarily_closed: 'cerrado temporalmente',
};

const successText = (status: ReportDecision, closedStatus?: PlaceClosedStatus): string => {
    if (status === 'pending') return '↩️ Reabierto: vuelve a Pendientes.';
    if (status === 'rejected') return '❌ Rechazado. Se ha avisado a quien lo reportó.';
    if (closedStatus) return `✅ Resuelto. Lugar marcado como ${CLOSED_STATUS_TEXT[closedStatus]}.`;
    return '✅ Resuelto. Se ha avisado a quien lo reportó.';
};

const noteLine = (note: string): string => (note ? ` Nota: “${note}”.` : ' Sin nota.');

export const ReportsTab: React.FC<DeveloperTabProps> = ({ focusId, view: viewParam, status: statusParam, onNavigate }) => {
    const { user } = useAuth();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const invalidateDeveloper = useInvalidateDeveloper();

    const view: ReportsView = viewParam === 'resolved' ? 'resolved' : 'pending';
    const archiveFilter: ArchiveFilter = view === 'resolved' && (statusParam === 'resolved' || statusParam === 'rejected')
        ? statusParam
        : 'all';
    const focus = focusId?.trim() || null;

    const [search, setSearch] = useState('');
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
    const [messages, setMessages] = useState<Record<string, RowMessage>>({});
    const [busyId, setBusyId] = useState<string | null>(null);
    const [syncingPlaceId, setSyncingPlaceId] = useState<string | null>(null);
    const [syncResults, setSyncResults] = useState<Record<string, string>>({});

    // ?focus= despliega el reporte (y cada nuevo focus vuelve a desplegar el suyo).
    const [expandedId, setExpandedId] = useState<string | null>(focus);
    const [lastFocus, setLastFocus] = useState<string | null>(focus);
    if (focus !== lastFocus) {
        setLastFocus(focus);
        if (focus) setExpandedId(focus);
    }

    const counts = useQuery({
        queryKey: COUNTS_KEY,
        queryFn: () => countEachStatus('reports', REPORT_STATUSES),
        staleTime: 60 * 1000,
    });

    const list = useInfiniteQuery({
        queryKey: [...REPORTS_KEY, 'list', view, archiveFilter],
        queryFn: ({ pageParam }) => (view === 'pending'
            ? fetchPending('reports', { cursor: pageParam, pageSize: PENDING_PAGE_SIZE })
            : fetchResolved('reports', {
                cursor: pageParam,
                pageSize: RESOLVED_PAGE_SIZE,
                statuses: archiveFilter === 'all' ? undefined : [archiveFilter],
            })),
        initialPageParam: null as QueueCursor | null,
        getNextPageParam: (lastPage: QueuePage) => (lastPage.hasMore && lastPage.cursor ? lastPage.cursor : undefined),
        staleTime: 30 * 1000,
    });

    const loaded = useMemo(() => {
        const seen = new Set<string>();
        const items = (list.data?.pages ?? []).flatMap((page) => page.items).filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
        // En la cola, los urgentes van siempre arriba (sort estable: se mantiene la antigüedad).
        return view === 'pending' ? [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent)) : items;
    }, [list.data, view]);
    const degraded = list.data?.pages.some((page) => page.degraded) ?? false;
    const focusLoaded = Boolean(focus && loaded.some((item) => item.id === focus));

    // El reporte enlazado no estaba entre lo cargado: se lee aparte.
    const focusQuery = useQuery({
        queryKey: [...REPORTS_KEY, 'focus', focus],
        queryFn: async () => {
            const snap = await getDoc(doc(db, 'reports', focus as string));
            return snap.exists() ? toInboxItem('reports', snap.id, snap.data() as Record<string, unknown>) : null;
        },
        enabled: Boolean(focus) && list.isSuccess && !focusLoaded,
        staleTime: 30 * 1000,
    });
    const focusItem = focus && !focusLoaded ? focusQuery.data ?? null : null;
    const focusView = focusItem ? viewForStatus('reports', focusItem.status) : null;

    // Si está en la otra vista, se cambia una sola vez por focus: ni después de verlo
    // ya cargado (p. ej. tras decidir y Actualizar) ni peleando con el usuario.
    const honoredFocus = useRef<string | null>(null);
    useEffect(() => {
        if (focus && focusLoaded) honoredFocus.current = focus;
    }, [focus, focusLoaded]);
    useEffect(() => {
        if (!focus || !focusView || focusView === view || honoredFocus.current === focus) return;
        honoredFocus.current = focus;
        onNavigate({ view: focusView, status: '' });
    }, [focus, focusView, view, onNavigate]);

    const pinned = focusItem && focusView === view ? focusItem : null;
    const term = search.trim();
    const deferredTerm = useDeferredValue(term);
    const lookup = useQuery({
        queryKey: [...REPORTS_KEY, 'lookup', deferredTerm],
        queryFn: () => lookupExact(deferredTerm, ['reports']),
        enabled: looksLikeId(deferredTerm),
        staleTime: 30 * 1000,
    });

    const withOverride = (item: InboxItem): InboxItem => {
        const patch = overrides[item.id];
        return patch ? toInboxItem('reports', item.id, { ...item.data, ...patch }) : item;
    };

    const rows = (pinned ? [pinned, ...loaded] : loaded).map(withOverride);
    const visibleRows = term ? rows.filter((item) => matchesSearch(item, term)) : rows;
    const exactRows = term && looksLikeId(term) && lookup.data
        ? lookup.data.filter((item) => !rows.some((row) => row.id === item.id)).map(withOverride)
        : [];
    const focusVisible = Boolean(focus && (visibleRows.some((item) => item.id === focus)));

    // Scroll hasta el reporte enlazado en cuanto aparece (una vez por focus).
    const scrolledFor = useRef<string | null>(null);
    useEffect(() => {
        if (!focus || !focusVisible || scrolledFor.current === focus) return;
        const handle = window.setTimeout(() => {
            scrolledFor.current = focus;
            document.getElementById(reportRowDomId(focus))?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        }, 80);
        return () => window.clearTimeout(handle);
    }, [focus, focusVisible]);

    const resetLocal = () => {
        setOverrides({});
        setMessages({});
    };

    const refresh = () => {
        resetLocal();
        void list.refetch();
        void invalidateDeveloper();
    };

    const runDecision = async (item: InboxItem, status: ReportDecision, closedStatus: PlaceClosedStatus | undefined, task: (note: string) => Promise<void>) => {
        const note = (notes[item.id] || '').trim();
        setBusyId(item.id);
        setMessages((prev) => without(prev, item.id));
        try {
            await task(note);
            setOverrides((prev) => ({ ...prev, [item.id]: decisionPatch(status, closedStatus, note, user?.uid) }));
            setNotes((prev) => without(prev, item.id));
            setMessages((prev) => ({ ...prev, [item.id]: { tone: 'success', text: successText(status, closedStatus) } }));
            // Lo cacheado ya no vale (otra vista, volver a la pestaña): se relee al usarlo,
            // sin recargar ahora la lista que se ve (la fila se queda con su aviso).
            void queryClient.invalidateQueries({ queryKey: REPORTS_KEY, refetchType: 'none' });
            void invalidateDeveloper();
        } catch (error) {
            console.error('ReportsTab: no se pudo actualizar el reporte', error);
            setMessages((prev) => ({ ...prev, [item.id]: { tone: 'error', text: `⚠️ No se pudo guardar: ${errorMessage(error)}` } }));
        } finally {
            setBusyId(null);
        }
    };

    const decide = async (item: InboxItem, status: ReportDecision, closedStatus?: PlaceClosedStatus) => {
        const note = (notes[item.id] || '').trim();
        if (status !== 'pending') {
            const ok = await confirm(status === 'rejected'
                ? {
                    title: '¿Rechazar el reporte?',
                    message: `Se avisará a quien lo reportó.${noteLine(note)}`,
                    confirmLabel: 'Rechazar',
                    destructive: true,
                }
                : {
                    title: closedStatus
                        ? `¿Marcar «${item.title}» como ${CLOSED_STATUS_TEXT[closedStatus]}?`
                        : '¿Marcar el reporte como resuelto?',
                    message: closedStatus
                        ? `Se marca el lugar y sus reseñas, y se avisa a quien lo reportó.${noteLine(note)}`
                        : `Se avisará a quien lo reportó.${noteLine(note)}`,
                    confirmLabel: 'Resolver',
                });
            if (!ok) return;
        }
        await runDecision(item, status, closedStatus, (finalNote) => updateReportStatus({
            reportId: item.id,
            report: item.data,
            status,
            closedStatus,
            notes: finalNote,
            actorUid: user?.uid,
        }));
    };

    const markUnavailable = async (item: InboxItem) => {
        const element = text(item.data.targetName) || item.title;
        const note = (notes[item.id] || '').trim();
        const ok = await confirm({
            title: `¿Marcar «${element}» como no disponible?`,
            message: `Se añade a los elementos no disponibles del lugar y el reporte queda resuelto.${noteLine(note)}`,
            confirmLabel: 'Marcar no disponible',
        });
        if (!ok) return;
        await runDecision(item, 'resolved', undefined, (finalNote) => markGroupItemUnavailable({
            reportId: item.id,
            report: item.data,
            notes: finalNote,
            actorUid: user?.uid,
        }));
    };

    const syncPlace = async (placeId: string) => {
        setSyncingPlaceId(placeId);
        try {
            const label = await syncPlaceStatusFromGoogle(placeId);
            setSyncResults((prev) => ({ ...prev, [placeId]: label }));
        } catch (error) {
            setSyncResults((prev) => ({ ...prev, [placeId]: `⚠️ ${errorMessage(error)}` }));
        } finally {
            setSyncingPlaceId(null);
        }
    };

    const countOf = (status: string): number | null => counts.data?.[status] ?? null;
    const resolvedCount = countOf('resolved');
    const rejectedCount = countOf('rejected');
    const archiveTotal = resolvedCount !== null && rejectedCount !== null ? resolvedCount + rejectedCount : null;
    const listTotal = view === 'pending' ? countOf('pending') : archiveFilter === 'all' ? archiveTotal : countOf(archiveFilter);
    const urgentLoaded = view === 'pending' ? rows.filter((item) => item.urgent && item.status === 'pending').length : 0;

    const renderRow = (item: InboxItem, extra?: { pinned?: boolean }) => (
        <ReportRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            focused={focus === item.id}
            pinned={Boolean(extra?.pinned)}
            onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
            note={notes[item.id] || ''}
            onNoteChange={(value) => setNotes((prev) => ({ ...prev, [item.id]: value }))}
            busy={busyId === item.id}
            message={messages[item.id]}
            onDecide={(status, closedStatus) => void decide(item, status, closedStatus)}
            onMarkUnavailable={() => void markUnavailable(item)}
            syncingPlaceId={syncingPlaceId}
            syncResults={syncResults}
            onSync={(placeId) => void syncPlace(placeId)}
        />
    );

    return (
        <div className="mx-auto max-w-6xl space-y-5">
            <div>
                <h2 className="flex items-center gap-2 text-2xl font-bold text-white">
                    <Flag className="h-6 w-6 text-red-500" aria-hidden="true" /> Centro de Moderación
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                    Reportes de la comunidad, del más antiguo al más reciente. Los urgentes 🚨 van siempre arriba.
                </p>
            </div>

            <QueueToolbar
                view={view}
                onViewChange={(nextView) => {
                    resetLocal();
                    onNavigate({ view: nextView, status: '', focus: null });
                }}
                pendingCount={countOf('pending')}
                resolvedLabel="Historial"
                filters={view === 'resolved' ? [
                    { value: 'resolved', label: 'Resueltos', emoji: '✅', count: resolvedCount },
                    { value: 'rejected', label: 'Rechazados', emoji: '❌', count: rejectedCount },
                    { value: 'all', label: 'Todos', count: archiveTotal },
                ] : undefined}
                filter={archiveFilter}
                onFilterChange={(value) => {
                    resetLocal();
                    onNavigate({ status: value === 'all' ? '' : value, focus: null });
                }}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Buscar por lugar, usuario, motivo o id"
                onRefresh={refresh}
                refreshing={list.isFetching}
                updatedAt={list.dataUpdatedAt || null}
                degraded={degraded}
            />

            {urgentLoaded > 0 && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300">
                    🚨 {urgentLoaded === 1 ? 'Hay 1 reporte urgente' : `Hay ${urgentLoaded} reportes urgentes`} (seguridad infantil, acoso o suplantación).
                </p>
            )}

            {focus && focusQuery.isSuccess && focusQuery.data === null && !focusLoaded && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
                    <span>🔎 No se encontró el reporte <code className="font-mono">{focus}</code>.</span>
                    <Button variant="ghost" size="sm" onClick={() => onNavigate({ focus: null })}>Quitar</Button>
                </div>
            )}

            {list.isError ? (
                <Card className="p-6 text-sm text-red-300">
                    <p>⚠️ No se pudieron cargar los reportes: {errorMessage(list.error)}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>Reintentar</Button>
                </Card>
            ) : list.isPending ? (
                <div className="space-y-3" aria-busy="true">
                    {[0, 1, 2].map((index) => (
                        <div key={index} className="h-20 animate-pulse rounded-xl border border-white/10 bg-[var(--lt-card-strong)]" />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {exactRows.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">🔎 Coincidencias exactas</p>
                            {exactRows.map((item) => renderRow(item))}
                        </div>
                    )}

                    {visibleRows.map((item) => renderRow(item, { pinned: pinned?.id === item.id }))}

                    {visibleRows.length === 0 && exactRows.length === 0 && (
                        <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)]/60 p-10 text-center">
                            <p className="text-3xl" aria-hidden="true">{term ? '🔎' : view === 'pending' ? '✨' : '🗂️'}</p>
                            <p className="mt-2 font-bold text-gray-300">
                                {term
                                    ? `Nada coincide con «${term}» entre lo cargado.`
                                    : view === 'pending'
                                        ? 'Todo al día. No hay reportes pendientes.'
                                        : 'Todavía no hay reportes en el historial con este filtro.'}
                            </p>
                            {term && looksLikeId(term) && lookup.isFetching && (
                                <p className="mt-1 text-xs text-gray-500">Buscando el id en el servidor…</p>
                            )}
                        </div>
                    )}

                    <LoadMoreButton
                        onClick={() => void list.fetchNextPage()}
                        hasMore={Boolean(list.hasNextPage)}
                        loading={list.isFetchingNextPage}
                        shown={loaded.length}
                        total={listTotal}
                        pageSize={view === 'pending' ? PENDING_PAGE_SIZE : RESOLVED_PAGE_SIZE}
                    />
                </div>
            )}
        </div>
    );
};

// ── Fila ─────────────────────────────────────────────────────────────────────

interface ReportRowProps {
    item: InboxItem;
    expanded: boolean;
    focused: boolean;
    pinned: boolean;
    onToggle: () => void;
    note: string;
    onNoteChange: (value: string) => void;
    busy: boolean;
    message?: RowMessage;
    onDecide: (status: ReportDecision, closedStatus?: PlaceClosedStatus) => void;
    onMarkUnavailable: () => void;
    syncingPlaceId: string | null;
    syncResults: Record<string, string>;
    onSync: (placeId: string) => void;
}

const DetailLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">{children}</div>
);

const ReportRow: React.FC<ReportRowProps> = ({
    item,
    expanded,
    focused,
    pinned,
    onToggle,
    note,
    onNoteChange,
    busy,
    message,
    onDecide,
    onMarkUnavailable,
    syncingPlaceId,
    syncResults,
    onSync,
}) => {
    const data = item.data;
    const status = item.status;
    const isPending = status === 'pending';
    const issueType = text(data.issueType) || 'other';
    const targetType = text(data.targetType) || 'other';
    const issue = REPORT_ISSUES[issueType] || { emoji: '🚩', label: issueType };
    const target = REPORT_TARGETS[targetType] || REPORT_TARGETS.other;
    const targetId = text(data.targetId);
    const description = text(data.description);
    const reporterId = text(data.userId) || text(data.reportedByUserId) || text(data.reporterUid);
    const reporterName = text(data.userName) || text(data.reportedByName);
    const adminNotes = text(data.adminNotes);
    const closedStatus = text(data.resolvedClosedStatus);
    const targetHref = targetId && TARGET_LINKS[targetType] ? TARGET_LINKS[targetType](targetId) : null;
    const groupPlaceId = targetType === 'group' && targetId ? groupReportPlaceId(targetId) : null;
    const canMarkUnavailable = targetType === 'group' && isPending
        && (issueType === 'item_not_available' || issueType === 'incorrect_info');
    const isPlaceClosure = targetType === 'place' && issueType === 'place_closed';

    return (
        <div
            id={reportRowDomId(item.id)}
            className={cn(
                'overflow-hidden rounded-xl border transition-colors',
                expanded ? 'border-white/20 bg-[var(--lt-card-strong)]' : 'border-white/10 bg-[var(--lt-card-strong)]/60 hover:border-white/15',
                item.urgent && isPending && 'border-red-500/40',
                focused && 'ring-2 ring-[var(--lt-accent-border)]',
            )}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="flex w-full items-start gap-3 p-4 text-left"
            >
                <span className="mt-0.5 shrink-0 text-lg" aria-hidden="true">{target.emoji}</span>
                <span className="block min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-white">{item.title}</span>
                        <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">{target.label}</span>
                        {item.urgent && (
                            <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-300">🚨 Urgente</span>
                        )}
                        {pinned && (
                            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-gray-300">📌 Enlazado</span>
                        )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-400">
                        {issue.emoji} {issue.label} · {description || 'Sin descripción'}
                    </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusChip status={status} gender="m" />
                    {isPending
                        ? <AgeChip at={data.createdAt} urgent={item.urgent} />
                        : <span className="text-[11px] tabular-nums text-gray-500">{formatDate(data.createdAt)}</span>}
                </span>
                <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-gray-500 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
            </button>

            {!isPending && (
                <ResolvedMeta
                    className="-mt-2 px-4 pb-3 pl-12"
                    status={status}
                    by={text(data.resolvedBy) || null}
                    at={data.resolvedAt}
                    notes={expanded ? null : adminNotes}
                    gender="m"
                >
                    {isClosedStatus(closedStatus) ? <span>{CLOSED_STATUS_LABELS[closedStatus]}</span> : null}
                </ResolvedMeta>
            )}

            {message && !expanded && (
                <p
                    role="status"
                    className={cn('px-4 pb-3 pl-12 text-xs font-semibold', message.tone === 'success' ? 'text-emerald-300' : 'text-red-300')}
                >
                    {message.text}
                </p>
            )}

            {expanded && (
                <div className="space-y-4 border-t border-white/10 bg-black/20 p-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <DetailLabel>Objetivo</DetailLabel>
                            <div className="flex items-center gap-1.5 break-all font-mono text-xs text-[var(--lt-accent)]">
                                <span className="select-all">{targetId || 'Sin id'}</span>
                                {targetHref && (
                                    <a href={targetHref} target="_blank" rel="noopener noreferrer" aria-label="Abrir en otra pestaña" className="shrink-0 hover:opacity-80">
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                            </div>
                        </div>
                        <div>
                            <DetailLabel>Motivo</DetailLabel>
                            <div className="text-sm text-white">{issue.emoji} {issue.label}</div>
                        </div>
                        <div>
                            <DetailLabel>Reportado por</DetailLabel>
                            {reporterId ? (
                                <a
                                    href={`/profile/${reporterId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-[var(--lt-accent)]"
                                >
                                    {reporterName && <span className="font-semibold">{reporterName}</span>}
                                    <span className="select-all font-mono text-gray-400">{reporterId}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                            ) : (
                                <span className="text-xs text-gray-500">{reporterName || 'Anónimo'}</span>
                            )}
                        </div>
                        <div>
                            <DetailLabel>Fecha</DetailLabel>
                            <div className="text-sm tabular-nums text-gray-300">{formatDateTime(data.createdAt) || 'Sin fecha'}</div>
                        </div>
                    </div>

                    {description && (
                        <div>
                            <DetailLabel>Lo que cuenta quien reporta</DetailLabel>
                            <div className="whitespace-pre-wrap rounded-lg border border-white/5 bg-black/30 p-3 text-sm text-gray-200">{description}</div>
                        </div>
                    )}

                    {isPending ? (
                        <label className="block">
                            <DetailLabel>Nota interna (opcional)</DetailLabel>
                            <textarea
                                value={note}
                                onChange={(event) => onNoteChange(event.target.value)}
                                placeholder="Qué has comprobado o qué has hecho…"
                                className="h-16 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                            />
                        </label>
                    ) : adminNotes ? (
                        <div>
                            <DetailLabel>Nota del admin</DetailLabel>
                            <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-3 text-sm text-amber-300">{adminNotes}</div>
                        </div>
                    ) : null}

                    {targetType === 'place' && targetId && (
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onSync(targetId)}
                                disabled={syncingPlaceId === targetId}
                                leftIcon={<RefreshCcw className={cn('h-3.5 w-3.5', syncingPlaceId === targetId && 'animate-spin')} />}
                            >
                                Comprobar en Google Maps
                            </Button>
                            {syncResults[targetId] && <span className="text-xs text-gray-300">{syncResults[targetId]}</span>}
                        </div>
                    )}

                    {groupPlaceId && (
                        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/15 bg-amber-500/5 p-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Acciones sobre el elemento</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <a
                                    href={`/place/${groupPlaceId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-300 hover:bg-white/10"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" /> Ver lugar
                                </a>
                                {canMarkUnavailable && (
                                    <Button variant="secondary" size="sm" onClick={onMarkUnavailable} loading={busy}>
                                        🍽️ Marcar «{text(data.targetName) || item.title}» no disponible
                                    </Button>
                                )}
                                {issueType === 'place_closed' && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => onSync(groupPlaceId)}
                                        disabled={syncingPlaceId === groupPlaceId}
                                        leftIcon={<RefreshCcw className={cn('h-3.5 w-3.5', syncingPlaceId === groupPlaceId && 'animate-spin')} />}
                                    >
                                        Comprobar lugar en Google
                                    </Button>
                                )}
                                {syncResults[groupPlaceId] && <span className="text-xs text-gray-300">{syncResults[groupPlaceId]}</span>}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                        {isPending && isPlaceClosure && (
                            <>
                                <Button variant="danger" size="sm" onClick={() => onDecide('resolved', 'permanently_closed')} disabled={busy} leftIcon={<CheckCircle className="h-4 w-4" />}>
                                    Cerrado permanentemente
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => onDecide('resolved', 'temporarily_closed')} disabled={busy} leftIcon={<CheckCircle className="h-4 w-4" />}>
                                    Cerrado temporalmente
                                </Button>
                            </>
                        )}
                        {isPending && !isPlaceClosure && (
                            <Button variant="success" size="sm" onClick={() => onDecide('resolved')} loading={busy} leftIcon={<CheckCircle className="h-4 w-4" />}>
                                Resolver
                            </Button>
                        )}
                        {isPending && (
                            <Button variant="danger" size="sm" onClick={() => onDecide('rejected')} disabled={busy} leftIcon={<X className="h-4 w-4" />}>
                                Rechazar
                            </Button>
                        )}
                        {!isPending && (
                            <Button variant="secondary" size="sm" onClick={() => onDecide('pending')} loading={busy}>
                                ↩️ Reabrir
                            </Button>
                        )}
                    </div>

                    {message && (
                        <p role="status" className={cn('text-sm font-semibold', message.tone === 'success' ? 'text-emerald-300' : 'text-red-300')}>
                            {message.text}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
