/**
 * BusinessClaimsManagerTab: «🏪 Solicitudes negocio» con el patrón Pendientes / Resueltas.
 *
 * - Pendientes: `status == 'pending'` del más antiguo al más reciente (50 por página),
 *   con el estado del lugar (getDoc places/{id}) para avisar de «Ya verificado ·
 *   propietario …» y de las solicitudes que compiten por el mismo lugar. Nota por
 *   fila; Rechazar exige motivo (8+); si aprobar quita la propiedad a otro usuario
 *   se pide confirmación y se envía `allowOwnerTransfer: true`.
 * - Resueltas: Aprobadas / Rechazadas / Todas con contador, del más reciente al
 *   más antiguo, 25 por página. Solo lectura, con historial de decisiones.
 * - Foco (`focusId`, alias `highlightClaimId`): lee la solicitud aunque no esté
 *   cargada, elige la vista según su estado, la fija arriba, la despliega y hace
 *   scroll hasta ella.
 *
 * Props (contrato de pestañas de DeveloperPage): DeveloperTabProps
 *   { focusId?, view?, status?, onNavigate({ view?, status?, focus? }) }
 * ?view= pending | resolved · ?status= approved | rejected (vacío = todas) · ?focus=<claimId>
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAdminNames, shortUid } from '../../hooks/useAdminNames';
import { useInvalidateDeveloper } from '../../hooks/useDeveloperInbox';
import {
    countEachStatus,
    fetchPending,
    fetchResolved,
    lookupExact,
    looksLikeId,
    matchesSearch,
    toInboxItem,
    type InboxItem,
    type QueueCursor,
    type QueuePage,
} from '../../services/adminQueues';
import { Button, Card } from '../ui';
import { LoadMoreButton, QueueToolbar, StatusChip, type QueueFilterOption } from './queue';
import type { DeveloperTabProps } from './developerTabs';
import { ClaimCard, type ClaimRowMessage } from './businessClaims/ClaimCard';
import {
    MIN_REJECT_NOTE_LENGTH,
    claimWarnings,
    claimantLabel,
    countPendingByPlace,
    markDecided,
    normalizeClaimsFilter,
    normalizeClaimsView,
    ownerToReplace,
    placeContextFromDoc,
    toClaim,
    viewOfStatus,
    type ClaimDecision,
    type ClaimsFilter,
    type ClaimsView,
    type PlaceContext,
} from './businessClaims/claimUtils';

const QUEUE = 'businessClaims' as const;
const PENDING_PAGE_SIZE = 50;
const RESOLVED_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

interface ListState {
    key: string | null;
    items: InboxItem[];
    cursor: QueueCursor | null;
    hasMore: boolean;
    degraded: boolean;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    loadedAt: number | null;
}

const EMPTY_LIST: ListState = {
    key: null,
    items: [],
    cursor: null,
    hasMore: false,
    degraded: false,
    loading: false,
    loadingMore: false,
    error: null,
    loadedAt: null,
};

type PageFetcher = (cursor: QueueCursor | null) => Promise<QueuePage>;

const mergeById = (current: InboxItem[], next: InboxItem[]): InboxItem[] => {
    const seen = new Set(current.map((item) => item.id));
    return [...current, ...next.filter((item) => !seen.has(item.id))];
};

/** Lista paginada con descarte de respuestas viejas (cambio de filtro, recarga). */
function usePagedList() {
    const [state, setState] = useState<ListState>(EMPTY_LIST);
    const requestRef = useRef(0);

    const load = useCallback(async (fetchPage: PageFetcher, key: string) => {
        const request = ++requestRef.current;
        setState((prev) => ({ ...prev, key, loading: true, loadingMore: false, error: null }));
        try {
            const page = await fetchPage(null);
            if (request !== requestRef.current) return;
            setState({
                ...EMPTY_LIST,
                key,
                items: page.items,
                cursor: page.cursor,
                hasMore: page.hasMore,
                degraded: page.degraded,
                loadedAt: Date.now(),
            });
        } catch (error) {
            if (request !== requestRef.current) return;
            console.error('BusinessClaimsManagerTab: no se pudo cargar la lista', error);
            setState((prev) => ({ ...prev, loading: false, error: 'No se pudieron cargar las solicitudes.' }));
        }
    }, []);

    const loadMore = useCallback(async (fetchPage: PageFetcher, cursor: QueueCursor | null) => {
        if (!cursor) return;
        const request = requestRef.current;
        setState((prev) => ({ ...prev, loadingMore: true, error: null }));
        try {
            const page = await fetchPage(cursor);
            if (request !== requestRef.current) return;
            setState((prev) => ({
                ...prev,
                items: mergeById(prev.items, page.items),
                cursor: page.cursor,
                hasMore: page.hasMore,
                degraded: prev.degraded || page.degraded,
                loadingMore: false,
            }));
        } catch (error) {
            if (request !== requestRef.current) return;
            console.error('BusinessClaimsManagerTab: no se pudieron cargar más', error);
            setState((prev) => ({ ...prev, loadingMore: false, error: 'No se pudieron cargar más solicitudes.' }));
        }
    }, []);

    const patch = useCallback((id: string, update: (item: InboxItem) => InboxItem) => {
        setState((prev) => (prev.items.some((item) => item.id === id)
            ? { ...prev, items: prev.items.map((item) => (item.id === id ? update(item) : item)) }
            : prev));
    }, []);

    return { state, load, loadMore, patch };
}

interface FocusResult {
    id: string;
    item: InboxItem | null;
    error: boolean;
}

interface ExactResult {
    term: string;
    items: InboxItem[];
    loading: boolean;
}

const getErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
        const text = (error as { message: string }).message.trim();
        if (text) return text;
    }
    return 'No se pudo revisar la solicitud.';
};

const isFailedPrecondition = (error: unknown): boolean => {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return typeof code === 'string' && code.endsWith('failed-precondition');
};

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const fetchPendingPage: PageFetcher = (cursor) => fetchPending(QUEUE, { cursor, pageSize: PENDING_PAGE_SIZE });

export const BusinessClaimsManagerTab: React.FC<DeveloperTabProps> = ({
    focusId,
    view: viewParam,
    status: statusParam,
    onNavigate: navigate,
}) => {
    const { user } = useAuth();
    const confirm = useConfirm();
    const invalidateDeveloper = useInvalidateDeveloper();

    // ── Navegación: la URL manda (DeveloperPage), la pestaña solo pide cambios ──
    const view: ClaimsView = normalizeClaimsView(viewParam);
    const filter: ClaimsFilter = normalizeClaimsFilter(statusParam);
    const focus = focusId?.trim() || null;

    // ── Datos ───────────────────────────────────────────────────────────────
    const { state: pendingList, load: loadPendingList, loadMore: loadMorePendingList, patch: patchPending } = usePagedList();
    const { state: resolvedList, load: loadResolvedList, loadMore: loadMoreResolvedList, patch: patchResolved } = usePagedList();
    const [resolvedVersion, setResolvedVersion] = useState(0);
    const [counts, setCounts] = useState<Record<string, number | null>>({});
    const [placeCtx, setPlaceCtx] = useState<Record<string, PlaceContext>>({});
    const [placeVersion, setPlaceVersion] = useState(0);
    const placeRequests = useRef(new Set<string>());
    const [focusResult, setFocusResult] = useState<FocusResult | null>(null);
    const [exact, setExact] = useState<ExactResult | null>(null);

    // ── Estado de las filas ─────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [messages, setMessages] = useState<Record<string, ClaimRowMessage>>({});
    const [busy, setBusy] = useState<{ id: string; decision: ClaimDecision } | null>(null);
    const [decidedIds, setDecidedIds] = useState<Record<string, true>>({});

    const fetchResolvedPage = useCallback<PageFetcher>((cursor) => fetchResolved(QUEUE, {
        statuses: filter === 'all' ? undefined : [filter],
        cursor,
        pageSize: RESOLVED_PAGE_SIZE,
    }), [filter]);

    const loadCounts = useCallback(async () => {
        setCounts(await countEachStatus(QUEUE));
    }, []);

    useEffect(() => {
        void loadCounts();
        void loadPendingList(fetchPendingPage, 'pending');
    }, [loadCounts, loadPendingList]);

    // Resueltas: se cargan al abrir la vista o al cambiar el filtro (y tras decidir o actualizar).
    const resolvedKey = `${filter}:${resolvedVersion}`;
    useEffect(() => {
        if (view !== 'resolved' || resolvedList.key === resolvedKey) return;
        void loadResolvedList(fetchResolvedPage, resolvedKey);
    }, [view, resolvedKey, resolvedList.key, loadResolvedList, fetchResolvedPage]);

    // Foco: se lee siempre la solicitud (puede no estar entre lo cargado o haber cambiado de estado).
    useEffect(() => {
        if (!focus) return;
        let cancelled = false;
        getDoc(doc(db, 'businessClaims', focus))
            .then((snap) => {
                if (cancelled) return;
                setFocusResult({
                    id: focus,
                    item: snap.exists() ? toInboxItem(QUEUE, snap.id, snap.data() as Record<string, unknown>) : null,
                    error: false,
                });
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('BusinessClaimsManagerTab: no se pudo leer la solicitud enfocada', error);
                setFocusResult({ id: focus, item: null, error: true });
            });
        return () => {
            cancelled = true;
        };
    }, [focus]);

    const focusItem = focusResult && focusResult.id === focus ? focusResult.item : null;
    const focusMissing = Boolean(focus && focusResult && focusResult.id === focus && !focusResult.item);

    // Si la solicitud enfocada está en la otra vista, se cambia una sola vez.
    const redirectedFocus = useRef<string | null>(null);
    useEffect(() => {
        if (!focus || !focusItem || redirectedFocus.current === focus) return;
        redirectedFocus.current = focus;
        const target = viewOfStatus(focusItem.status);
        if (target !== view) navigate({ view: target, focus });
    }, [focus, focusItem, view, navigate]);

    // Scroll a la solicitud enfocada en cuanto aparece.
    const scrolledFocus = useRef<string | null>(null);
    useEffect(() => {
        if (!focus) {
            scrolledFocus.current = null;
            redirectedFocus.current = null;
            return;
        }
        if (scrolledFocus.current === focus) return;
        const element = document.getElementById(`business-claim-${focus}`);
        if (!element) return;
        scrolledFocus.current = focus;
        element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });

    // Búsqueda exacta en servidor cuando el término parece un id.
    const term = search.trim();
    useEffect(() => {
        if (!looksLikeId(term)) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            setExact({ term, items: [], loading: true });
            lookupExact(term, [QUEUE])
                .then((items) => {
                    if (!cancelled) setExact({ term, items, loading: false });
                })
                .catch((error) => {
                    console.warn('BusinessClaimsManagerTab: búsqueda exacta fallida', error);
                    if (!cancelled) setExact({ term, items: [], loading: false });
                });
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [term]);
    const exactItems = useMemo(() => (exact && exact.term === term ? exact.items : []), [exact, term]);
    const exactLoading = Boolean(looksLikeId(term) && (!exact || exact.term !== term || exact.loading));

    // ── Contexto de los lugares de las pendientes ───────────────────────────
    const pendingPool = useMemo(() => {
        const pool = [...pendingList.items];
        if (focusItem) pool.push(focusItem);
        pool.push(...exactItems);
        return pool;
    }, [pendingList.items, focusItem, exactItems]);

    const placeIdsKey = useMemo(() => unique(pendingPool
        .filter((item) => item.status === 'pending')
        .map((item) => item.placeId || '')).sort().join('|'), [pendingPool]);

    useEffect(() => {
        const ids = placeIdsKey ? placeIdsKey.split('|') : [];
        const missing = ids.filter((id) => !placeRequests.current.has(id));
        if (missing.length === 0) return;
        missing.forEach((id) => placeRequests.current.add(id));
        void Promise.all(missing.map(async (placeId) => {
            try {
                const snap = await getDoc(doc(db, 'places', placeId));
                return [placeId, placeContextFromDoc(snap.exists() ? snap.data() as Record<string, unknown> : null)] as const;
            } catch (error) {
                console.warn('BusinessClaimsManagerTab: no se pudo leer el lugar', placeId, error);
                placeRequests.current.delete(placeId);
                return null;
            }
        })).then((entries) => {
            const loaded = entries.filter((entry): entry is readonly [string, PlaceContext] => entry !== null);
            if (loaded.length > 0) setPlaceCtx((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
        });
    }, [placeIdsKey, placeVersion]);

    const reloadPlace = useCallback(async (placeId: string) => {
        if (!placeId) return;
        try {
            const snap = await getDoc(doc(db, 'places', placeId));
            setPlaceCtx((prev) => ({
                ...prev,
                [placeId]: placeContextFromDoc(snap.exists() ? snap.data() as Record<string, unknown> : null),
            }));
        } catch (error) {
            console.warn('BusinessClaimsManagerTab: no se pudo releer el lugar', placeId, error);
        }
    }, []);

    const competingByPlace = useMemo(() => countPendingByPlace(pendingPool), [pendingPool]);
    const ownerNames = useAdminNames(Object.values(placeCtx).map((place) => place.ownerId));

    // ── Filas visibles ──────────────────────────────────────────────────────
    const belongsToView = useCallback((item: InboxItem): boolean => {
        if (view === 'pending') return item.status === 'pending' || Boolean(decidedIds[item.id]);
        if (item.status === 'pending') return false;
        return filter === 'all' || item.status === filter;
    }, [view, filter, decidedIds]);

    const list = view === 'pending' ? pendingList : resolvedList;

    const rows = useMemo(() => {
        const base = list.items;
        const baseIds = new Set(base.map((item) => item.id));
        // La enfocada se fija arriba en su vista aunque el filtro de estado no la incluya.
        const focusInView = focusItem !== null && (view === 'pending'
            ? focusItem.status === 'pending' || Boolean(decidedIds[focusItem.id])
            : focusItem.status !== 'pending');
        const pinned = focusItem && focusInView && !baseIds.has(focusItem.id) ? [focusItem] : [];
        let visible = [...pinned, ...base];
        if (term) {
            visible = visible.filter((item) => matchesSearch(item, term));
            const shown = new Set(visible.map((item) => item.id));
            exactItems.forEach((item) => {
                if (!shown.has(item.id) && !baseIds.has(item.id) && belongsToView(item)) {
                    visible.push(item);
                    shown.add(item.id);
                }
            });
        }
        return visible;
    }, [list.items, focusItem, view, decidedIds, belongsToView, term, exactItems]);

    const elsewhere = useMemo(() => {
        if (!term) return [];
        const shown = new Set(rows.map((item) => item.id));
        return exactItems.filter((item) => !shown.has(item.id) && !belongsToView(item));
    }, [term, rows, exactItems, belongsToView]);

    // ── Acciones ────────────────────────────────────────────────────────────
    const patchEverywhere = useCallback((id: string, update: (item: InboxItem) => InboxItem) => {
        patchPending(id, update);
        patchResolved(id, update);
        setFocusResult((prev) => (prev?.item?.id === id ? { ...prev, item: update(prev.item) } : prev));
        setExact((prev) => (prev && prev.items.some((item) => item.id === id)
            ? { ...prev, items: prev.items.map((item) => (item.id === id ? update(item) : item)) }
            : prev));
    }, [patchPending, patchResolved]);

    const setRowMessage = useCallback((id: string, message: ClaimRowMessage | null) => {
        setMessages((prev) => {
            const next = { ...prev };
            if (message) next[id] = message;
            else delete next[id];
            return next;
        });
    }, []);

    const refreshClaim = useCallback(async (id: string, placeId: string) => {
        try {
            const snap = await getDoc(doc(db, 'businessClaims', id));
            if (snap.exists()) {
                const fresh = toInboxItem(QUEUE, snap.id, snap.data() as Record<string, unknown>);
                patchEverywhere(id, () => fresh);
            }
        } catch (error) {
            console.warn('BusinessClaimsManagerTab: no se pudo releer la solicitud', id, error);
        }
        await reloadPlace(placeId);
    }, [patchEverywhere, reloadPlace]);

    const findItem = useCallback((id: string): InboxItem | null => (
        pendingList.items.find((item) => item.id === id)
        ?? (focusItem?.id === id ? focusItem : null)
        ?? exactItems.find((item) => item.id === id)
        ?? null
    ), [pendingList.items, focusItem, exactItems]);

    const decide = useCallback(async (claimId: string, decision: ClaimDecision) => {
        const item = findItem(claimId);
        if (!user || !item || busy) return;
        const claim = toClaim(item);
        if (claim.status !== 'pending') return;
        const adminNotes = (notes[claimId] ?? '').trim();
        if (decision === 'rejected' && adminNotes.length < MIN_REJECT_NOTE_LENGTH) {
            setRowMessage(claimId, {
                type: 'error',
                text: `✍️ Escribe el motivo del rechazo (${MIN_REJECT_NOTE_LENGTH} caracteres o más). Lo verá el solicitante.`,
            });
            return;
        }

        const place = claim.placeId ? placeCtx[claim.placeId] : undefined;
        const replacedOwner = decision === 'approved' ? ownerToReplace(claim, place) : null;
        const claimant = claimantLabel(claim);
        const placeName = claim.placeName || place?.name || 'este lugar';
        const ownerName = replacedOwner ? ownerNames[replacedOwner] || shortUid(replacedOwner) : '';
        const noteText = adminNotes ? ` Nota: “${adminNotes}”.` : ' Sin nota.';

        const confirmed = await confirm(decision === 'rejected'
            ? {
                title: '❌ ¿Rechazar la solicitud?',
                message: `${claimant} recibirá un aviso con este motivo: “${adminNotes}”.`,
                confirmLabel: 'Rechazar',
                destructive: true,
            }
            : replacedOwner
                ? {
                    title: '⚠️ ¿Transferir la propiedad?',
                    message: `Esto transfiere la propiedad de ${placeName} de ${ownerName} a ${claimant}.${place?.managerIds.includes(replacedOwner) ? ` ${ownerName} seguirá como gestor.` : ''}${noteText}`,
                    confirmLabel: 'Sí, transferir y aprobar',
                    destructive: true,
                }
                : {
                    title: '✅ ¿Aprobar la solicitud?',
                    message: `${claimant} podrá gestionar ${placeName} y recibirá un aviso.${noteText}`,
                    confirmLabel: 'Aprobar',
                });
        if (!confirmed) return;

        setBusy({ id: claimId, decision });
        setRowMessage(claimId, null);
        try {
            const reviewBusinessClaim = httpsCallable(functions, 'reviewBusinessClaim');
            await reviewBusinessClaim({
                claimId,
                status: decision,
                adminNotes,
                ...(replacedOwner ? { allowOwnerTransfer: true } : {}),
            });
            const now = Date.now();
            patchEverywhere(claimId, (current) => markDecided(current, decision, adminNotes, user.uid, now));
            setDecidedIds((prev) => ({ ...prev, [claimId]: true }));
            setCounts((prev) => ({
                ...prev,
                pending: typeof prev.pending === 'number' ? Math.max(0, prev.pending - 1) : prev.pending,
                [decision]: typeof prev[decision] === 'number' ? (prev[decision] as number) + 1 : prev[decision],
            }));
            setNotes((prev) => {
                const next = { ...prev };
                delete next[claimId];
                return next;
            });
            setExpanded((prev) => ({ ...prev, [claimId]: false }));
            if (decision === 'approved' && claim.placeId) {
                setPlaceCtx((prev) => {
                    const current = prev[claim.placeId] ?? placeContextFromDoc({});
                    return {
                        ...prev,
                        [claim.placeId]: {
                            ...current,
                            exists: true,
                            verified: true,
                            ownerId: claim.userId,
                            managerIds: unique([...current.managerIds, claim.userId]),
                            claimId,
                        },
                    };
                });
            }
            setRowMessage(claimId, {
                type: 'success',
                text: decision === 'approved'
                    ? `✅ Aprobada. ${claimant} ya puede gestionar ${placeName} y le hemos avisado.`
                    : `❌ Rechazada. Hemos avisado a ${claimant} con el motivo.`,
            });
            setResolvedVersion((value) => value + 1);
            void invalidateDeveloper();
        } catch (error) {
            console.error('BusinessClaimsManagerTab: review failed', error);
            setRowMessage(claimId, { type: 'error', text: `⚠️ ${getErrorMessage(error)}` });
            if (isFailedPrecondition(error)) void refreshClaim(claimId, claim.placeId);
        } finally {
            setBusy(null);
        }
    }, [findItem, user, busy, notes, placeCtx, ownerNames, confirm, setRowMessage, patchEverywhere, invalidateDeveloper, refreshClaim]);

    const toggle = useCallback((id: string) => {
        setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? id === focus) }));
    }, [focus]);

    const changeNote = useCallback((id: string, value: string) => {
        setNotes((prev) => ({ ...prev, [id]: value }));
    }, []);

    const refresh = useCallback(() => {
        placeRequests.current = new Set();
        setPlaceCtx({});
        setPlaceVersion((value) => value + 1);
        setMessages({});
        setDecidedIds({});
        setResolvedVersion((value) => value + 1);
        void loadCounts();
        void loadPendingList(fetchPendingPage, 'pending');
    }, [loadCounts, loadPendingList]);

    const loadMore = useCallback(() => {
        if (view === 'pending') void loadMorePendingList(fetchPendingPage, pendingList.cursor);
        else void loadMoreResolvedList(fetchResolvedPage, resolvedList.cursor);
    }, [view, loadMorePendingList, loadMoreResolvedList, fetchResolvedPage, pendingList.cursor, resolvedList.cursor]);

    // ── Toolbar ─────────────────────────────────────────────────────────────
    const pendingCount = typeof counts.pending === 'number'
        ? counts.pending
        : pendingList.loadedAt ? pendingList.items.filter((item) => item.status === 'pending').length : null;
    const approvedCount = typeof counts.approved === 'number' ? counts.approved : null;
    const rejectedCount = typeof counts.rejected === 'number' ? counts.rejected : null;
    const resolvedTotal = approvedCount !== null && rejectedCount !== null ? approvedCount + rejectedCount : null;
    const filters: QueueFilterOption[] | undefined = view === 'resolved'
        ? [
            { value: 'approved', label: 'Aprobadas', emoji: '✅', count: approvedCount },
            { value: 'rejected', label: 'Rechazadas', emoji: '❌', count: rejectedCount },
            { value: 'all', label: 'Todas', count: resolvedTotal },
        ]
        : undefined;
    const listTotal = view === 'pending'
        ? pendingCount
        : filter === 'approved' ? approvedCount : filter === 'rejected' ? rejectedCount : resolvedTotal;

    const emptyText = term
        ? exactLoading ? '🔎 Buscando también en el servidor…' : `🔎 Nada coincide con «${term}».`
        : view === 'pending'
            ? '✨ Todo al día. No hay solicitudes pendientes.'
            : '🗂️ No hay solicitudes en este filtro.';

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <Card className="space-y-4 p-4 sm:p-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">🏪 Solicitudes de negocio</h2>
                    <p className="mt-1 text-sm text-gray-400">
                        Revisa quién pide gestionar un lugar. Lo que apruebas o rechazas se archiva en «Resueltas».
                    </p>
                </div>
                <QueueToolbar
                    view={view}
                    onViewChange={(next) => navigate({ view: next, status: '', focus: null })}
                    pendingCount={pendingCount}
                    resolvedLabel="Resueltas"
                    filters={filters}
                    filter={filter}
                    onFilterChange={(next) => navigate({ status: next === 'all' ? '' : next, focus: null })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Lugar, persona, email, teléfono o id"
                    onRefresh={refresh}
                    refreshing={list.loading}
                    updatedAt={list.loadedAt}
                    degraded={list.degraded}
                />
            </Card>

            {focusMissing && focus && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    <span>
                        {focusResult?.error
                            ? `⚠️ No se pudo abrir la solicitud ${focus}.`
                            : `🔎 No encuentro la solicitud ${focus}. Puede que el enlace esté mal.`}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => navigate({ focus: null })}>Quitar</Button>
                </div>
            )}

            {elsewhere.length > 0 && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-[var(--lt-card-strong)] px-4 py-3 text-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">🔎 Fuera de esta vista</p>
                    {elsewhere.map((item) => (
                        <div key={item.key} className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{item.title}</span>
                            <StatusChip status={item.status} />
                            <span className="min-w-0 truncate text-gray-400">{item.subtitle}</span>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="ml-auto"
                                onClick={() => navigate({ view: viewOfStatus(item.status), status: '', focus: item.id })}
                            >
                                Abrir →
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {list.error && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    <span>⚠️ {list.error}</span>
                    <Button variant="secondary" size="sm" onClick={refresh}>Reintentar</Button>
                </div>
            )}

            {list.loading && rows.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                    ⏳ Cargando solicitudes…
                </div>
            ) : rows.length === 0 ? (
                !list.error && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                        {emptyText}
                    </div>
                )
            ) : (
                <div className="space-y-3">
                    {rows.map((item) => {
                        const claim = toClaim(item);
                        const place = claim.placeId ? placeCtx[claim.placeId] : undefined;
                        const badges = claim.status === 'pending'
                            ? [...item.badges, ...claimWarnings(claim, place, competingByPlace.get(claim.placeId) ?? 0)]
                            : [];
                        return (
                            <ClaimCard
                                key={item.key}
                                claim={claim}
                                badges={badges}
                                expanded={expanded[item.id] ?? item.id === focus}
                                focused={item.id === focus}
                                onToggle={toggle}
                                note={notes[item.id] ?? ''}
                                onNoteChange={changeNote}
                                busy={busy?.id === item.id ? busy.decision : null}
                                locked={busy !== null}
                                message={messages[item.id] ?? null}
                                onDecide={decide}
                                replacedOwnerId={ownerToReplace(claim, place)}
                            />
                        );
                    })}
                </div>
            )}

            {!list.degraded && list.loadedAt !== null && !term && (
                <LoadMoreButton
                    onClick={loadMore}
                    hasMore={list.hasMore}
                    loading={list.loadingMore}
                    shown={list.items.length}
                    total={listTotal}
                    pageSize={view === 'pending' ? PENDING_PAGE_SIZE : RESOLVED_PAGE_SIZE}
                />
            )}
        </div>
    );
};
