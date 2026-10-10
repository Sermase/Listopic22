/**
 * PlansManagerTab: «Planes» en Developer, por segmentos sincronizados con ?view=
 * (en lugar de una sola página con controles globales):
 *
 *   ⚠️ Atención (N)        ⏳ Pro manual o de prueba que caduca en ≤14 días (con «⏩ Extender» y
 *                           «♾️ Pasar a indefinido»), 💳 pagos con problema y 🛒 checkouts sin terminar.
 *                           N = caducan + pagos (como el punto ámbar de la barra lateral).
 *   ✨ Pro activos (N)      businessProActive == true; chips de fuente (?status=manual|trial|beta|stripe),
 *                           quién lo concedió, último cambio, nota e impulsos. N = count real; si se
 *                           llega al límite, «mostrando X de Y».
 *   🏪 Verificados sin Pro  businessVerified == true y en cliente sin Pro.
 *   👑 Premium usuarios     users where premium.active == true (lista completa) y buscador uid/@username/email.
 *   🧪 Beta «Lo quiero»     PlanInterestStats, que solo se carga al abrir el segmento (?status=noPlace).
 *   🗂️ Historial            adminAuditLog legible y compras de impulsos (?status=business|premium|impulses|stripe).
 *
 * Buscar un local fuera de lo cargado: getDoc(places/<id>) exacto y prefijo de nombre.
 * Las acciones de cada fila van en PlanActionDrawer (duración, nota rellenada con la
 * actual, impulsos con confirmación exacta). Tras cada cambio se invalida ['developer'].
 *
 * Props (contrato de pestañas de DeveloperPage): DeveloperTabProps
 *   { focusId?, view?, status?, onNavigate({ view?, status?, focus? }) }
 *   focusId = placeId (o uid en «Premium usuarios»): se resalta, se fija arriba si no
 *   estaba cargado y se hace scroll hasta él.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAge, formatDate, formatUntil } from '../../utils/adminTime';
import { PLAN_EXPIRY_WINDOW_DAYS } from '../../hooks/useDeveloperInbox';
import { Button, Card } from '../ui';
import { QueueToolbar, type QueueFilterOption, type QueueViewOption } from './queue';
import type { DeveloperTabProps } from './developerTabs';
import { PlanActionDrawer, type PlanDrawerPreset, type PlanDrawerTarget } from './PlanActionDrawer';
import { PlanInterestStats } from './PlanInterestStats';
import { PlanHistorySection } from './plans/PlanHistorySection';
import { PlanPlaceRow, PlanUserRow } from './plans/PlanRows';
import {
    PLANS_QUERY_KEY,
    fetchAttention,
    fetchPlace,
    fetchPlaceList,
    fetchPremiumUsers,
    fetchProCount,
    fetchUser,
    planPlaceKey,
    planUserKey,
    searchPlaces,
    searchUsers,
    type AttentionSectionData,
} from './plans/planQueries';
import {
    PRO_FILTERS,
    SOURCE_META,
    billingLabel,
    isPlaceView,
    matchesTerm,
    normalizeBetaFilter,
    normalizeHistoryFilter,
    normalizePlansView,
    normalizeProFilter,
    planSourceKey,
    type PlanPlace,
    type PlanUser,
    type PlansView,
    type RowMessage,
} from './plans/planUtils';

const STALE_MS = 60 * 1000;
const SEARCH_DEBOUNCE_MS = 350;
const MIN_SERVER_SEARCH = 3;

interface DrawerState {
    target: PlanDrawerTarget;
    preset?: PlanDrawerPreset;
}

const useDebounced = (value: string, delayMs: number): string => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
};

// ── Bloques de presentación ─────────────────────────────────────────────────

const ErrorBox: React.FC<{ text: string; onRetry?: () => void }> = ({ text, onRetry }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        <span>⚠️ {text}</span>
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button>}
    </div>
);

const EmptyBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">{children}</p>
);

const LoadingBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">{children}</div>
);

const SectionCard: React.FC<{ title: string; count?: number; hint?: string; children: React.ReactNode }> = ({ title, count, hint, children }) => (
    <Card className="space-y-3 p-4 sm:p-6">
        <div>
            <h3 className="text-lg font-bold text-white">
                {title}
                {typeof count === 'number' && <span className="ml-1.5 text-base font-semibold text-gray-400">· {count}</span>}
            </h3>
            {hint && <p className="mt-0.5 text-sm text-gray-400">{hint}</p>}
        </div>
        {children}
    </Card>
);

const TruncatedNote: React.FC<{ loaded: number; total: number | null; what: string }> = ({ loaded, total, what }) => (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
        ⚠️ Mostrando {loaded.toLocaleString('es-ES')}{typeof total === 'number' ? ` de ${total.toLocaleString('es-ES')}` : ''} {what}.
        {' '}Busca por nombre o id para encontrar el resto.
    </p>
);

const attentionContext = {
    expiring: (place: PlanPlace) => (
        <>⏳ Caduca el <span className="tabular-nums">{formatDate(place.expiresAtMs)}</span> ({formatUntil(place.expiresAtMs)})</>
    ),
    billing: (place: PlanPlace) => (
        <>💳 Stripe: {billingLabel(place.plan.billingStatus)}{place.billingUpdatedAtMs ? <> desde el <span className="tabular-nums">{formatDate(place.billingUpdatedAtMs)}</span></> : null}</>
    ),
    checkouts: (place: PlanPlace) => (
        <>🛒 Empezó a pagar Business Pro{place.billingUpdatedAtMs ? <> el <span className="tabular-nums">{formatDate(place.billingUpdatedAtMs)}</span> ({formatAge(place.billingUpdatedAtMs)})</> : null} y no terminó</>
    ),
};

// ── Pestaña ─────────────────────────────────────────────────────────────────

export const PlansManagerTab: React.FC<DeveloperTabProps> = ({
    focusId,
    view: viewParam,
    status: statusParam,
    onNavigate: navigate,
}) => {
    const queryClient = useQueryClient();
    const view: PlansView = normalizePlansView(viewParam);
    const focus = focusId?.trim() || null;
    const placeView = isPlaceView(view);

    const proFilter = normalizeProFilter(statusParam);
    const betaFilter = normalizeBetaFilter(statusParam);
    const historyFilter = normalizeHistoryFilter(statusParam);

    const [search, setSearch] = useState('');
    const term = search.trim();
    const debounced = useDebounced(term, SEARCH_DEBOUNCE_MS);
    const [drawer, setDrawer] = useState<DrawerState | null>(null);
    const [messages, setMessages] = useState<Record<string, RowMessage>>({});
    const [notice, setNotice] = useState<string | null>(null);

    // ── Datos (react-query, todo bajo ['developer','plans']) ────────────────
    const attention = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'attention'],
        queryFn: () => fetchAttention(),
        staleTime: STALE_MS,
    });
    const proCount = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'proCount'],
        queryFn: () => fetchProCount(),
        staleTime: STALE_MS,
    });
    const proList = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'list', 'pro'],
        queryFn: () => fetchPlaceList('pro'),
        enabled: view === 'pro',
        staleTime: STALE_MS,
    });
    const verifiedList = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'list', 'verified'],
        queryFn: () => fetchPlaceList('verified'),
        enabled: view === 'verified',
        staleTime: STALE_MS,
    });
    const premiumList = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'premium'],
        queryFn: () => fetchPremiumUsers(),
        enabled: view === 'premium',
        staleTime: STALE_MS,
    });
    const serverSearchTerm = debounced.length >= MIN_SERVER_SEARCH ? debounced : '';
    const placeSearch = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'placeSearch', serverSearchTerm],
        queryFn: () => searchPlaces(serverSearchTerm),
        enabled: placeView && Boolean(serverSearchTerm),
        staleTime: STALE_MS,
    });
    const userSearch = useQuery({
        queryKey: [...PLANS_QUERY_KEY, 'userSearch', serverSearchTerm],
        queryFn: () => searchUsers(serverSearchTerm),
        enabled: view === 'premium' && Boolean(serverSearchTerm),
        staleTime: STALE_MS,
    });
    const focusPlace = useQuery({
        queryKey: planPlaceKey(focus ?? ''),
        queryFn: () => fetchPlace(focus as string),
        enabled: Boolean(focus) && placeView,
        staleTime: STALE_MS,
    });
    const focusUser = useQuery({
        queryKey: planUserKey(focus ?? ''),
        queryFn: () => fetchUser(focus as string),
        enabled: Boolean(focus) && view === 'premium',
        staleTime: STALE_MS,
    });
    const fetchingCount = useIsFetching({ queryKey: PLANS_QUERY_KEY });

    // ── Navegación ──────────────────────────────────────────────────────────
    const changeView = useCallback((next: string) => {
        setSearch('');
        setNotice(null);
        navigate({ view: next, status: '', focus: null });
    }, [navigate, setSearch, setNotice]);

    const changeFilter = useCallback((next: string) => {
        navigate({ status: next === 'all' ? '' : next, focus: null });
    }, [navigate]);

    const refresh = useCallback(() => {
        setMessages({});
        setNotice(null);
        void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    }, [queryClient, setMessages, setNotice]);

    const openPlace = useCallback((place: PlanPlace, preset?: PlanDrawerPreset) => {
        setDrawer({ target: { kind: 'place', place }, preset });
    }, [setDrawer]);

    const openUser = useCallback((user: PlanUser) => {
        setDrawer({ target: { kind: 'user', user } });
    }, [setDrawer]);

    /** Desde Beta e Historial: se lee el local y se abre su panel. */
    const openPlaceById = useCallback(async (placeId: string) => {
        setNotice(null);
        try {
            const place = await queryClient.fetchQuery({
                queryKey: planPlaceKey(placeId),
                queryFn: () => fetchPlace(placeId),
                staleTime: STALE_MS,
            });
            if (place) setDrawer({ target: { kind: 'place', place } });
            else setNotice(`🔎 El local ${placeId} ya no existe.`);
        } catch (error) {
            console.error('PlansManagerTab: no se pudo abrir el local', placeId, error);
            setNotice('⚠️ No se pudo abrir el local. Inténtalo de nuevo.');
        }
    }, [queryClient, setDrawer, setNotice]);

    const closeDrawer = useCallback(() => setDrawer(null), [setDrawer]);

    const rememberMessage = useCallback((id: string, message: RowMessage) => {
        setMessages((prev) => ({ ...prev, [id]: message }));
    }, [setMessages]);

    // ── Filas de los segmentos de locales ───────────────────────────────────
    const filterPlaces = useCallback((rows: PlanPlace[]) => (term ? rows.filter((place) => matchesTerm(place.searchText, term)) : rows), [term]);

    const attentionData = attention.data;
    const attentionSections = useMemo(() => (attentionData
        ? {
            expiring: filterPlaces(attentionData.expiring.rows),
            billing: filterPlaces(attentionData.billing.rows),
            checkouts: filterPlaces(attentionData.checkouts.rows),
        }
        : null), [attentionData, filterPlaces]);

    const proRows = useMemo(() => filterPlaces((proList.data?.rows ?? [])
        .filter((place) => proFilter === 'all' || planSourceKey(place) === proFilter)), [proList.data, proFilter, filterPlaces]);
    const verifiedRows = useMemo(() => filterPlaces(verifiedList.data?.rows ?? []), [verifiedList.data, filterPlaces]);

    const visiblePlaceIds = useMemo(() => {
        const ids = new Set<string>();
        if (view === 'attention' && attentionSections) {
            [...attentionSections.expiring, ...attentionSections.billing, ...attentionSections.checkouts].forEach((place) => ids.add(place.id));
        }
        if (view === 'pro') proRows.forEach((place) => ids.add(place.id));
        if (view === 'verified') verifiedRows.forEach((place) => ids.add(place.id));
        return ids;
    }, [view, attentionSections, proRows, verifiedRows]);

    // Se fija arriba solo cuando la lista de la vista ya está cargada (si no, parpadearía).
    const listReady = view === 'attention' ? attention.isSuccess
        : view === 'pro' ? proList.isSuccess
            : view === 'verified' ? verifiedList.isSuccess
                : false;
    const pinnedPlace = listReady && focus && focusPlace.data && !visiblePlaceIds.has(focus) ? focusPlace.data : null;
    const focusPlaceMissing = placeView && Boolean(focus) && focusPlace.isSuccess && focusPlace.data === null;

    const serverPlaces = useMemo(() => (placeView && serverSearchTerm === term
        ? (placeSearch.data ?? []).filter((place) => !visiblePlaceIds.has(place.id) && place.id !== pinnedPlace?.id)
        : []), [placeView, serverSearchTerm, term, placeSearch.data, visiblePlaceIds, pinnedPlace]);

    // ── Premium ─────────────────────────────────────────────────────────────
    const premiumRows = useMemo(() => {
        const rows = premiumList.data?.rows ?? [];
        return term ? rows.filter((user) => matchesTerm(user.searchText, term)) : rows;
    }, [premiumList.data, term]);
    const premiumIds = useMemo(() => new Set(premiumRows.map((user) => user.id)), [premiumRows]);
    const pinnedUser = view === 'premium' && premiumList.isSuccess && focus && focusUser.data && !premiumIds.has(focus) ? focusUser.data : null;
    const serverUsers = useMemo(() => (view === 'premium' && serverSearchTerm === term
        ? (userSearch.data ?? []).filter((user) => !premiumIds.has(user.id) && user.id !== pinnedUser?.id)
        : []), [view, serverSearchTerm, term, userSearch.data, premiumIds, pinnedUser]);

    const searchingServer = term.length >= MIN_SERVER_SEARCH
        && (debounced !== term || (placeView ? placeSearch.isFetching : view === 'premium' && userSearch.isFetching));

    // ── Scroll al enfocado ──────────────────────────────────────────────────
    const scrolledFocus = useRef<string | null>(null);
    useEffect(() => {
        if (!focus) {
            scrolledFocus.current = null;
            return;
        }
        const key = `${view}:${focus}`;
        if (scrolledFocus.current === key) return;
        const element = document.getElementById(view === 'premium' ? `plan-user-${focus}` : `plan-place-${focus}`);
        if (!element) return;
        scrolledFocus.current = key;
        element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });

    // ── Barra de herramientas ───────────────────────────────────────────────
    const attentionCount = attentionData ? attentionData.expiring.rows.length + attentionData.billing.rows.length : null;
    const views: QueueViewOption[] = [
        { value: 'attention', label: 'Atención', emoji: '⚠️', count: attentionCount },
        { value: 'pro', label: 'Pro activos', emoji: '✨', count: proCount.data ?? null },
        { value: 'verified', label: 'Verificados sin Pro', emoji: '🏪' },
        { value: 'premium', label: 'Premium usuarios', emoji: '👑' },
        { value: 'beta', label: 'Beta «Lo quiero»', emoji: '🧪' },
        { value: 'history', label: 'Historial', emoji: '🗂️' },
    ];

    const sourceCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        (proList.data?.rows ?? []).forEach((place) => {
            const key = planSourceKey(place) ?? 'unknown';
            counts[key] = (counts[key] ?? 0) + 1;
        });
        return counts;
    }, [proList.data]);

    let filters: QueueFilterOption[] | undefined;
    let filter: string | undefined;
    if (view === 'pro') {
        filter = proFilter;
        filters = PRO_FILTERS.map((value) => (value === 'all'
            ? { value, label: 'Todos', count: proList.data ? proList.data.rows.length : null }
            : { value, label: SOURCE_META[value].label, emoji: SOURCE_META[value].emoji, count: proList.data ? sourceCounts[value] ?? 0 : null }));
    } else if (view === 'beta') {
        filter = betaFilter;
        filters = [
            { value: 'all', label: 'Todos' },
            { value: 'noPlace', label: 'Sin local verificado', emoji: '👋' },
        ];
    } else if (view === 'history') {
        filter = historyFilter;
        filters = [
            { value: 'all', label: 'Todo' },
            { value: 'business', label: 'Business Pro', emoji: '✨' },
            { value: 'premium', label: 'Premium', emoji: '👑' },
            { value: 'impulses', label: 'Impulsos', emoji: '⚡' },
            { value: 'stripe', label: 'Stripe', emoji: '💳' },
        ];
    }

    const updatedAt = view === 'attention' ? attention.dataUpdatedAt
        : view === 'pro' ? proList.dataUpdatedAt
            : view === 'verified' ? verifiedList.dataUpdatedAt
                : view === 'premium' ? premiumList.dataUpdatedAt
                    : undefined;

    const searchable = placeView || view === 'premium';

    // ── Render de filas ─────────────────────────────────────────────────────
    const renderPlace = (place: PlanPlace, extra?: { context?: React.ReactNode; actions?: React.ReactNode }) => (
        <PlanPlaceRow
            key={place.id}
            place={place}
            focused={place.id === focus}
            context={extra?.context}
            actions={extra?.actions}
            message={messages[place.id]}
            onManage={(row) => openPlace(row)}
        />
    );

    const expiringActions = (place: PlanPlace) => (
        <>
            <Button variant="secondary" size="sm" onClick={() => openPlace(place, { duration: '1m', section: 'plan' })}>
                ⏩ Extender
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openPlace(place, { duration: 'indefinite', section: 'plan' })}>
                ♾️ Pasar a indefinido
            </Button>
        </>
    );

    const attentionBlock = (
        key: 'expiring' | 'billing' | 'checkouts',
        title: string,
        empty: string,
        hint?: string,
    ) => {
        const section: AttentionSectionData | undefined = attentionData?.[key];
        const rows = attentionSections?.[key] ?? [];
        return (
            <SectionCard key={key} title={title} count={section && !section.error ? section.rows.length : undefined} hint={hint}>
                {section?.error ? (
                    <ErrorBox text={`${section.error}.`} onRetry={() => void attention.refetch()} />
                ) : rows.length === 0 ? (
                    <EmptyBox>{term && section && section.rows.length > 0 ? `🔎 Nada coincide con «${term}».` : empty}</EmptyBox>
                ) : (
                    <div className="space-y-3">
                        {rows.map((place) => renderPlace(place, {
                            context: attentionContext[key](place),
                            actions: key === 'expiring' ? expiringActions(place) : undefined,
                        }))}
                    </div>
                )}
            </SectionCard>
        );
    };

    const searchFailed = Boolean(serverSearchTerm) && serverSearchTerm === term
        && (placeView ? placeSearch.isError : view === 'premium' && userSearch.isError);
    const serverResultsBlock = (view === 'premium' ? serverUsers.length > 0 : serverPlaces.length > 0) || searchingServer || searchFailed ? (
        <SectionCard
            title="🔎 En el servidor"
            hint={view === 'premium' ? 'Usuarios que coinciden por uid, @username o email.' : 'Locales que coinciden por id o empiezan por ese nombre (cualquier local, verificado o no).'}
        >
            {searchingServer && <p className="text-sm text-gray-400">⏳ Buscando…</p>}
            {searchFailed && !searchingServer && <p className="text-sm text-red-300">⚠️ No se pudo buscar en el servidor.</p>}
            <div className="space-y-3">
                {view === 'premium'
                    ? serverUsers.map((user) => (
                        <PlanUserRow key={user.id} user={user} focused={user.id === focus} message={messages[user.id]} onManage={openUser} />
                    ))
                    : serverPlaces.map((place) => renderPlace(place))}
            </div>
        </SectionCard>
    ) : null;

    const placeListBody = (
        list: typeof proList,
        rows: PlanPlace[],
        what: string,
        empty: string,
    ) => {
        if (list.isError) return <ErrorBox text="No se pudieron cargar los locales." onRetry={() => void list.refetch()} />;
        if (list.isPending) return <LoadingBox>⏳ Cargando locales…</LoadingBox>;
        return (
            <div className="space-y-3">
                {list.data.truncated && <TruncatedNote loaded={list.data.loaded} total={list.data.total} what={what} />}
                {rows.length === 0
                    ? <EmptyBox>{term ? `🔎 Nada coincide con «${term}» entre lo cargado.` : empty}</EmptyBox>
                    : rows.map((place) => renderPlace(place))}
            </div>
        );
    };

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <Card className="space-y-4 p-4 sm:p-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">✨ Planes</h2>
                    <p className="mt-1 text-sm text-gray-400">
                        Business Pro por local, premium por usuario e impulsos. Lo que pide atención va primero y cada cambio queda en «Historial».
                    </p>
                </div>
                <QueueToolbar
                    view={view}
                    onViewChange={changeView}
                    views={views}
                    filters={filters}
                    filter={filter}
                    onFilterChange={changeFilter}
                    search={searchable ? search : undefined}
                    onSearchChange={searchable ? setSearch : undefined}
                    searchPlaceholder={view === 'premium' ? 'uid, @username o email' : 'Nombre, dirección o id del local'}
                    onRefresh={refresh}
                    refreshing={fetchingCount > 0}
                    updatedAt={updatedAt || null}
                />
            </Card>

            {notice && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    <span>{notice}</span>
                    <Button variant="ghost" size="sm" onClick={() => setNotice(null)}>Cerrar</Button>
                </div>
            )}

            {focusPlaceMissing && focus && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    <span>🔎 No encuentro el local {focus}. Puede que el enlace esté mal.</span>
                    <Button variant="ghost" size="sm" onClick={() => navigate({ focus: null })}>Quitar</Button>
                </div>
            )}

            {pinnedPlace && (
                <SectionCard title="📌 Local enlazado" hint="No está en esta lista; lo traemos aparte.">
                    {renderPlace(pinnedPlace)}
                </SectionCard>
            )}

            {view === 'attention' && (
                attention.isPending ? <LoadingBox>⏳ Cargando lo que pide atención…</LoadingBox>
                    : attention.isError ? <ErrorBox text="No se pudo cargar «Atención»." onRetry={() => void attention.refetch()} />
                        : (
                            <>
                                {attentionCount === 0 && !term && (
                                    <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                                        ✨ Todo al día: nada caduca pronto y no hay pagos con problemas.
                                    </p>
                                )}
                                {attentionBlock(
                                    'expiring',
                                    `⏳ Business Pro que caduca en ${PLAN_EXPIRY_WINDOW_DAYS} días o menos`,
                                    `✨ Nada caduca en los próximos ${PLAN_EXPIRY_WINDOW_DAYS} días.`,
                                    'Concedidos a mano o pruebas (también las de la beta). Extiéndelos o pásalos a indefinido.',
                                )}
                                {attentionBlock('billing', '💳 Pagos con problema', '✨ Ningún pago con problemas.', 'Suscripciones de Stripe con el pago atrasado o impagado.')}
                                {attentionBlock(
                                    'checkouts',
                                    '🛒 Checkouts de Business Pro sin terminar',
                                    '✨ No hay checkouts a medias.',
                                    'Seguimiento: no cuenta en «Atención». Empezaron a pagar y no acabaron.',
                                )}
                            </>
                        )
            )}

            {view === 'pro' && (
                <SectionCard
                    title="✨ Business Pro activo"
                    count={proList.data ? proRows.length : undefined}
                    hint="Ordenados por caducidad: primero los que antes terminan."
                >
                    {placeListBody(proList, proRows, 'locales Pro', proFilter === 'all' ? '✨ Ningún local tiene Business Pro.' : '✨ Ninguno con esta fuente.')}
                </SectionCard>
            )}

            {view === 'verified' && (
                <SectionCard
                    title="🏪 Verificados sin Pro"
                    count={verifiedList.data ? verifiedRows.length : undefined}
                    hint="Negocios verificados en Free. Desde «⚙️ Gestionar» puedes darles Pro o regalarles impulsos."
                >
                    {placeListBody(verifiedList, verifiedRows, 'locales verificados (aquí solo salen los que no tienen Pro)', '✨ Todos los verificados tienen Pro.')}
                </SectionCard>
            )}

            {view === 'premium' && (
                <>
                    {pinnedUser && (
                        <SectionCard title="📌 Usuario enlazado">
                            <PlanUserRow user={pinnedUser} focused message={messages[pinnedUser.id]} onManage={openUser} />
                        </SectionCard>
                    )}
                    <SectionCard
                        title="👑 Premium activo"
                        count={premiumList.data ? premiumRows.length : undefined}
                        hint="Para dar premium a alguien, búscalo arriba por uid, @username o email."
                    >
                        {premiumList.isError ? (
                            <ErrorBox text="No se pudieron cargar los usuarios premium." onRetry={() => void premiumList.refetch()} />
                        ) : premiumList.isPending ? (
                            <LoadingBox>⏳ Cargando usuarios…</LoadingBox>
                        ) : (
                            <div className="space-y-3">
                                {premiumList.data.truncated && <TruncatedNote loaded={premiumList.data.loaded} total={premiumList.data.total} what="usuarios premium" />}
                                {premiumRows.length === 0
                                    ? <EmptyBox>{term ? `🔎 Nada coincide con «${term}» entre los premium.` : '👑 Nadie tiene premium ahora mismo.'}</EmptyBox>
                                    : premiumRows.map((user) => (
                                        <PlanUserRow key={user.id} user={user} focused={user.id === focus} message={messages[user.id]} onManage={openUser} />
                                    ))}
                            </div>
                        )}
                    </SectionCard>
                </>
            )}

            {searchable && serverResultsBlock}

            {view === 'beta' && <PlanInterestStats filter={betaFilter} onManagePlace={(placeId) => void openPlaceById(placeId)} />}

            {view === 'history' && <PlanHistorySection filter={historyFilter} onManagePlace={(placeId) => void openPlaceById(placeId)} />}

            <PlanActionDrawer
                target={drawer?.target ?? null}
                preset={drawer?.preset}
                onClose={closeDrawer}
                onDone={rememberMessage}
            />
        </div>
    );
};
