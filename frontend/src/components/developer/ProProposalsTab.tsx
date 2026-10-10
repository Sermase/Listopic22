/**
 * ProProposalsTab: «📣 Patrocinios y Pro» con sub-pestañas en lugar de 6 tarjetas.
 *
 *   📥 Bandeja (N)    lo que falta por decidir: propuestas de carta `pending`, campañas y
 *                     platos `requested`, del más antiguo al más reciente, con nota por fila
 *   🟢 En curso (N)   campañas y platos `active` por fecha de fin, métricas y «Finalizar»
 *   🗂️ Historial      lo resuelto, de solo lectura: chips de estado (?status=) y de tipo
 *   💶 Precios        editor de precios de impulsos (se carga al abrirlo)
 *   ⚔️ Duelo          Duelo de la semana
 *   🛠️ Herramientas   herramientas autónomas: «🧹 Reparar cartas» (pro/ProToolsSection)
 *
 * Las sub-pestañas ya abiertas siguen montadas (ocultas): al cambiar de una a
 * otra no se pierden las notas escritas ni los precios sin guardar.
 *
 * Props (contrato de pestañas de DeveloperPage): DeveloperTabProps
 *   { focusId?, view?, status?, onNavigate({ view?, status?, focus? }) }
 * ?view= inbox | active | history | pricing | duel | tools (por defecto inbox)
 * ?status= approved | rejected | ended (solo Historial; vacío = todas)
 * ?focus=<id> de una propuesta, campaña o plato: se lee del servidor, se abre
 * su sub-pestaña, se fija arriba, se despliega y se hace scroll hasta ella.
 *
 * Tras cada decisión: invalidateQueries(['developer']) (contadores de la barra
 * lateral, bandeja «Pendientes» y los contadores de esta pestaña).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { cn } from '../../lib/utils';
import { useInvalidateDeveloper } from '../../hooks/useDeveloperInbox';
import { QUEUES, lookupExact, looksLikeId, toInboxItem, type InboxItem } from '../../services/adminQueues';
import { Button, Card } from '../ui';
import { QueueToolbar, StatusChip, allStatusLabel, statusEmoji, statusLabel, type QueueFilterOption, type QueueViewOption } from './queue';
import type { DeveloperTabProps } from './developerTabs';
import { ProInboxSection } from './pro/ProInboxSection';
import { ProActiveSection } from './pro/ProActiveSection';
import { ProHistorySection } from './pro/ProHistorySection';
import { ImpulsePricingEditor } from './pro/ImpulsePricingEditor';
import { WeeklyDuelEditor } from './pro/WeeklyDuelEditor';
import { ProToolsSection } from './pro/ProToolsSection';
import {
    KINDS_BY_VIEW,
    KIND_META,
    PRO_COUNTS_KEY,
    PRO_QUEUES,
    QUEUE_KIND,
    fetchProCounts,
    historyStatusCount,
    historyStatusOptions,
    isProQueue,
    isProQueueView,
    kindCount,
    normalizeHistoryFilter,
    normalizeKindFilter,
    normalizeProView,
    sameMeta,
    viewCount,
    viewOfItem,
    type ProKindFilter,
    type ProQueueView,
    type ProSectionProps,
    type ProView,
    type SectionMeta,
} from './pro/proUtils';

const SEARCH_DEBOUNCE_MS = 350;
const COUNTS_STALE_MS = 60 * 1000;
const QUEUE_VIEWS: readonly ProQueueView[] = ['inbox', 'active', 'history'];
const NO_ITEMS: InboxItem[] = [];

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

const VIEW_LABEL: Record<ProQueueView, string> = {
    inbox: 'Bandeja',
    active: 'En curso',
    history: 'Historial',
};

const KindChips: React.FC<{ options: QueueFilterOption[]; value: string; onChange: (value: string) => void }> = ({ options, value, onChange }) => (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        {options.map((option) => {
            const selected = option.value === value;
            return (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                        selected
                            ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]'
                            : 'border-white/10 bg-white/5 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]',
                    )}
                >
                    {option.emoji && <span aria-hidden="true">{option.emoji}</span>}
                    {option.label}
                    {typeof option.count === 'number' && <span className="tabular-nums opacity-70">{option.count.toLocaleString('es-ES')}</span>}
                </button>
            );
        })}
    </div>
);

export const ProProposalsTab: React.FC<DeveloperTabProps> = ({
    focusId,
    view: viewParam,
    status: statusParam,
    onNavigate,
}) => {
    const queryClient = useQueryClient();
    const invalidateDeveloper = useInvalidateDeveloper();

    // ── Navegación: la URL manda (DeveloperPage), la pestaña solo pide cambios ──
    const view: ProView = normalizeProView(viewParam);
    const queueView: ProQueueView | null = isProQueueView(view) ? view : null;
    const focus = focusId?.trim() || null;

    // Sub-pestañas ya abiertas: siguen montadas para no perder notas ni cambios.
    const [visited, setVisited] = useState<ProView[]>(() => [view]);
    if (!visited.includes(view)) setVisited([...visited, view]);

    const [search, setSearch] = useState('');
    const [kindByView, setKindByView] = useState<Partial<Record<ProQueueView, ProKindFilter>>>({});
    const kindOf = useCallback((target: ProQueueView) => normalizeKindFilter(kindByView[target], target), [kindByView]);
    const historyKind = kindOf('history');
    const historyFilter = normalizeHistoryFilter(statusParam, historyKind);

    const [versions, setVersions] = useState<Record<ProQueueView, number>>({ inbox: 0, active: 0, history: 0 });
    const [metaByView, setMetaByView] = useState<Partial<Record<ProQueueView, SectionMeta>>>({});
    const [pricingDirty, setPricingDirty] = useState(false);

    const { data: counts } = useQuery({
        queryKey: PRO_COUNTS_KEY,
        queryFn: fetchProCounts,
        staleTime: COUNTS_STALE_MS,
        refetchOnWindowFocus: true,
    });

    // ── Estado que comunican las secciones ──────────────────────────────────
    const handleMeta = useCallback((target: ProQueueView, meta: SectionMeta) => {
        setMetaByView((prev) => (sameMeta(prev[target], meta) ? prev : { ...prev, [target]: meta }));
    }, []);

    // Tras decidir en una sub-pestaña, las otras se recargan al volver a ellas.
    const handleDecided = useCallback((from: ProQueueView) => {
        setVersions((prev) => {
            const next = { ...prev };
            QUEUE_VIEWS.forEach((target) => {
                if (target !== from) next[target] += 1;
            });
            return next;
        });
        void invalidateDeveloper();
    }, [invalidateDeveloper]);

    const handlers = useMemo(() => Object.fromEntries(QUEUE_VIEWS.map((target) => [target, {
        onMeta: (meta: SectionMeta) => handleMeta(target, meta),
        onDecided: () => handleDecided(target),
    }])) as Record<ProQueueView, Pick<ProSectionProps, 'onMeta' | 'onDecided'>>, [handleMeta, handleDecided]);

    // «🧹 Reparar cartas» puede renombrar platos o marcarlos retirados: las tres
    // colas se recargan al volver a ellas (los contadores los invalida la tarjeta).
    const handleToolsChanged = useCallback(() => {
        setVersions((prev) => ({ inbox: prev.inbox + 1, active: prev.active + 1, history: prev.history + 1 }));
    }, []);

    const refresh = useCallback(() => {
        if (!queueView) return;
        setVersions((prev) => ({ ...prev, [queueView]: prev[queueView] + 1 }));
        void queryClient.invalidateQueries({ queryKey: PRO_COUNTS_KEY });
    }, [queueView, queryClient]);

    // ── Foco: se lee del servidor (puede no estar cargado o haber cambiado de estado) ──
    const [focusResult, setFocusResult] = useState<FocusResult | null>(null);
    useEffect(() => {
        if (!focus || focus.includes('/')) return;
        let cancelled = false;
        void Promise.allSettled(PRO_QUEUES.map(async (queue) => {
            const snap = await getDoc(doc(db, QUEUES[queue].collection, focus));
            return snap.exists() ? toInboxItem(queue, snap.id, snap.data() as Record<string, unknown>) : null;
        })).then((results) => {
            if (cancelled) return;
            let item: InboxItem | null = null;
            results.forEach((result) => {
                if (result.status === 'fulfilled' && result.value && !item) item = result.value;
                if (result.status === 'rejected') console.error('ProProposalsTab: no se pudo leer el elemento enfocado', result.reason);
            });
            setFocusResult({ id: focus, item, error: !item && results.some((result) => result.status === 'rejected') });
        });
        return () => {
            cancelled = true;
        };
    }, [focus]);

    const focusItem = focusResult && focusResult.id === focus ? focusResult.item : null;
    const focusMissing = Boolean(focus && (focus.includes('/') || (focusResult?.id === focus && !focusResult.item)));

    // Si el elemento enfocado vive en otra sub-pestaña, se cambia una sola vez.
    const redirectedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!focus) {
            redirectedRef.current = null;
            return;
        }
        if (!focusItem || redirectedRef.current === focus) return;
        redirectedRef.current = focus;
        const target = viewOfItem(focusItem);
        if (target !== view) onNavigate({ view: target, status: '', focus });
    }, [focus, focusItem, view, onNavigate]);

    // ── Búsqueda exacta en servidor cuando el término parece un id ──────────
    const term = search.trim();
    const [exact, setExact] = useState<ExactResult | null>(null);
    useEffect(() => {
        if (!looksLikeId(term)) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            setExact({ term, items: [], loading: true });
            lookupExact(term, PRO_QUEUES)
                .then((items) => {
                    if (!cancelled) setExact({ term, items, loading: false });
                })
                .catch((error) => {
                    console.warn('ProProposalsTab: búsqueda exacta fallida', error);
                    if (!cancelled) setExact({ term, items: [], loading: false });
                });
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [term]);
    const exactItems = useMemo(() => (exact && exact.term === term ? exact.items : NO_ITEMS), [exact, term]);
    const searching = looksLikeId(term) && (!exact || exact.term !== term || exact.loading);

    const elsewhere = useMemo(() => (term && queueView
        ? exactItems.filter((item) => viewOfItem(item) !== queueView)
        : NO_ITEMS), [term, queueView, exactItems]);

    // ── Cabecera: sub-pestañas, filtros y contadores ────────────────────────
    const views: QueueViewOption[] = [
        { value: 'inbox', label: 'Bandeja', emoji: '📥', count: viewCount(counts, 'inbox') },
        { value: 'active', label: 'En curso', emoji: '🟢', count: viewCount(counts, 'active') },
        { value: 'history', label: 'Historial', emoji: '🗂️' },
        { value: 'pricing', label: pricingDirty ? 'Precios •' : 'Precios', emoji: '💶' },
        { value: 'duel', label: 'Duelo', emoji: '⚔️' },
        { value: 'tools', label: 'Herramientas', emoji: '🛠️' },
    ];

    const historyGender = historyKind === 'spotlight' ? 'm' : 'f';
    const statusFilters: QueueFilterOption[] | undefined = view === 'history'
        ? [
            ...historyStatusOptions(historyKind).map((status) => ({
                value: status,
                label: statusLabel(status, { gender: historyGender, plural: true }),
                emoji: statusEmoji(status),
                count: historyStatusCount(counts, historyKind, status),
            })),
            { value: 'all', label: allStatusLabel(historyGender), count: viewCount(counts, 'history', historyKind) },
        ]
        : undefined;

    const kind = queueView ? kindOf(queueView) : 'all';
    const kindOptions: QueueFilterOption[] = queueView
        ? [
            { value: 'all', label: 'Todo', count: viewCount(counts, queueView, 'all', historyFilter) },
            ...KINDS_BY_VIEW[queueView].map((entry) => ({
                value: entry,
                label: KIND_META[entry].label,
                emoji: KIND_META[entry].emoji,
                count: kindCount(counts, queueView, entry, historyFilter),
            })),
        ]
        : [];

    const changeKind = (value: string) => {
        if (!queueView) return;
        const next = normalizeKindFilter(value, queueView);
        setKindByView((prev) => ({ ...prev, [queueView]: next }));
        // Un estado que no existe para ese tipo (p. ej. «Aprobadas» en campañas) se quita de la URL.
        if (queueView === 'history' && historyFilter !== 'all' && normalizeHistoryFilter(historyFilter, next) === 'all') {
            onNavigate({ status: '', focus: null });
        }
    };

    const meta = queueView ? metaByView[queueView] : undefined;

    const sectionProps = (target: ProQueueView): ProSectionProps => ({
        active: view === target,
        refreshKey: versions[target],
        search,
        searching,
        kind: kindOf(target),
        focusId: view === target ? focus : null,
        focusItem: view === target ? focusItem : null,
        exactItems: view === target ? exactItems : NO_ITEMS,
        ...handlers[target],
    });

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <Card className="space-y-4 p-4 sm:p-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">📣 Patrocinios y Pro</h2>
                    <p className="mt-1 text-sm text-gray-400">
                        Propuestas de carta de los negocios, campañas en home y búsquedas y platos destacados con impulsos.
                        Lo que apruebas, rechazas o finalizas queda archivado en «Historial».
                    </p>
                </div>
                <QueueToolbar
                    view={view}
                    onViewChange={(next) => onNavigate({ view: next, status: '', focus: null })}
                    views={views}
                    filters={statusFilters}
                    filter={historyFilter}
                    onFilterChange={(next) => onNavigate({ status: next === 'all' ? '' : next, focus: null })}
                    search={queueView ? search : undefined}
                    onSearchChange={queueView ? setSearch : undefined}
                    searchPlaceholder="Lugar, plato, titular, usuario o id"
                    onRefresh={queueView ? refresh : undefined}
                    refreshing={meta?.loading ?? false}
                    updatedAt={meta?.loadedAt ?? null}
                    degraded={meta?.degraded ?? false}
                />
                {queueView && <KindChips options={kindOptions} value={kind} onChange={changeKind} />}
            </Card>

            {focusMissing && focus && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    <span>
                        {focusResult?.error
                            ? `⚠️ No se pudo abrir ${focus}.`
                            : `🔎 No encuentro ninguna propuesta, campaña ni plato con el id ${focus}. Puede que el enlace esté mal.`}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => onNavigate({ focus: null })}>Quitar</Button>
                </div>
            )}

            {elsewhere.length > 0 && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-[var(--lt-card-strong)] px-4 py-3 text-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">🔎 En otras sub-pestañas</p>
                    {elsewhere.map((item) => {
                        const target = viewOfItem(item);
                        return (
                            <div key={item.key} className="flex flex-wrap items-center gap-2">
                                <span aria-hidden="true">{item.emoji}</span>
                                <span className="font-semibold text-white">{item.title}</span>
                                <StatusChip status={item.status} gender={isProQueue(item.queue) ? KIND_META[QUEUE_KIND[item.queue]].gender : 'f'} />
                                <span className="min-w-0 truncate text-gray-400">{item.subtitle}</span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="ml-auto"
                                    onClick={() => onNavigate({ view: target, status: '', focus: item.id })}
                                >
                                    Abrir en {VIEW_LABEL[target]} →
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}

            {visited.includes('inbox') && (
                <div hidden={view !== 'inbox'}>
                    <ProInboxSection {...sectionProps('inbox')} />
                </div>
            )}
            {visited.includes('active') && (
                <div hidden={view !== 'active'}>
                    <ProActiveSection {...sectionProps('active')} />
                </div>
            )}
            {visited.includes('history') && (
                <div hidden={view !== 'history'}>
                    <ProHistorySection
                        {...sectionProps('history')}
                        status={historyFilter}
                        total={viewCount(counts, 'history', historyKind, historyFilter)}
                    />
                </div>
            )}
            {visited.includes('pricing') && (
                <div hidden={view !== 'pricing'}>
                    <ImpulsePricingEditor onDirtyChange={setPricingDirty} />
                </div>
            )}
            {visited.includes('duel') && (
                <div hidden={view !== 'duel'}>
                    <WeeklyDuelEditor />
                </div>
            )}
            {visited.includes('tools') && (
                <div hidden={view !== 'tools'}>
                    <ProToolsSection onDataChanged={handleToolsChanged} />
                </div>
            )}
        </div>
    );
};
