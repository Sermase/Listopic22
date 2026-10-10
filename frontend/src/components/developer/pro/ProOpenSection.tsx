/**
 * ProOpenSection: lo que está abierto en «Patrocinios y Pro».
 *
 *   mode 'inbox'   Bandeja: propuestas `pending`, campañas y platos `requested`,
 *                  del más antiguo al más reciente. Activar, Rechazar, Aprobar.
 *   mode 'active'  En curso: campañas y platos `active`, ordenados por fecha de fin
 *                  (avisos 🧹 vencida sin cerrar y ∞ sin fecha de fin). Finalizar.
 *
 * Cada cola se pide por separado (orderBy createdAt asc, 100 como mucho): si una
 * falla se ve su error en la sección y las demás se muestran igual. Si hay más
 * de 100, se avisa. Las filas decididas se quedan en su sitio con el estado
 * nuevo y el aviso de la decisión hasta la siguiente recarga.
 *
 * La usan ProInboxSection y ProActiveSection.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchActive, fetchPending } from '../../../services/adminQueues';
import { Button } from '../../ui';
import { ProRowCard } from './ProRowCard';
import { useProDecisions } from './useProDecisions';
import {
    KIND_META,
    PRO_QUEUES,
    QUEUE_KIND,
    composeRows,
    loadSources,
    proRowDomId,
    sortByEndsAt,
    sortOldestFirst,
    toProRow,
    type ProQueueKey,
    type ProRow,
    type ProSectionProps,
    type SourceResult,
} from './proUtils';

const OPEN_PAGE_SIZE = 100;

type OpenMode = 'inbox' | 'active';

interface OpenModeConfig {
    queues: readonly ProQueueKey[];
    fetchPage: (queue: ProQueueKey) => ReturnType<typeof fetchPending>;
    sort: (rows: ProRow[]) => ProRow[];
    loadingText: string;
    emptyText: string;
}

const MODE_CONFIG: Record<OpenMode, OpenModeConfig> = {
    inbox: {
        queues: PRO_QUEUES,
        fetchPage: (queue) => fetchPending(queue, { pageSize: OPEN_PAGE_SIZE }),
        sort: sortOldestFirst,
        loadingText: '⏳ Cargando la bandeja…',
        emptyText: '✨ Todo al día. No hay nada pendiente de decidir.',
    },
    active: {
        queues: ['sponsoredPlacements', 'sponsoredItemSpotlights'],
        fetchPage: (queue) => fetchActive(queue, { pageSize: OPEN_PAGE_SIZE }),
        sort: sortByEndsAt,
        loadingText: '⏳ Cargando las campañas en curso…',
        emptyText: '😴 No hay campañas ni platos en curso.',
    },
};

interface OpenState {
    /** refreshKey/reintento de los datos que se ven (null: aún nada). */
    key: string | null;
    rows: ProRow[];
    sources: SourceResult[];
    loadedAt: number | null;
}

const EMPTY_STATE: OpenState = { key: null, rows: [], sources: [], loadedAt: null };

const idOfKey = (key: string): string => key.slice(key.indexOf(':') + 1);

export const ProOpenSection: React.FC<ProSectionProps & { mode: OpenMode }> = ({
    mode,
    active,
    refreshKey,
    search,
    searching = false,
    kind,
    focusId,
    focusItem,
    exactItems,
    onDecided,
    onMeta,
}) => {
    const config = MODE_CONFIG[mode];
    const [state, setState] = useState<OpenState>(EMPTY_STATE);
    const [retry, setRetry] = useState(0);
    const [overrides, setOverrides] = useState<Record<string, ProRow>>({});
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const requestRef = useRef(0);
    const requestedKeyRef = useRef<string | null>(null);

    const patchRow = useCallback((row: ProRow) => {
        setOverrides((prev) => ({ ...prev, [row.item.key]: row }));
    }, []);
    const { notes, setNote, messages, clearMessages, busy, decide } = useProDecisions({ onPatch: patchRow, onDecided });

    // Se carga al abrir la sub-pestaña y cuando cambia refreshKey (Actualizar, o una
    // decisión en otra sub-pestaña) o se pulsa Reintentar, solo si está a la vista.
    const wantedKey = `${refreshKey}:${retry}`;
    const loading = state.key !== wantedKey;
    useEffect(() => {
        if (!active || requestedKeyRef.current === wantedKey) return;
        requestedKeyRef.current = wantedKey;
        const request = ++requestRef.current;
        void loadSources(config.queues, config.fetchPage).then((sources) => {
            if (request !== requestRef.current) return;
            setOverrides({});
            clearMessages();
            setState({
                key: wantedKey,
                rows: config.sort(sources.flatMap((source) => source.items).map(toProRow)),
                sources,
                loadedAt: Date.now(),
            });
        });
    }, [active, wantedKey, config, clearMessages]);

    const retryLoad = useCallback(() => setRetry((value) => value + 1), []);

    const degraded = state.sources.some((source) => source.degraded);
    useEffect(() => {
        onMeta({ loading, loadedAt: state.loadedAt, degraded });
    }, [onMeta, loading, state.loadedAt, degraded]);

    const term = search.trim();
    const rows = useMemo(() => composeRows({
        loaded: state.rows,
        view: mode,
        kind,
        term,
        focusItem,
        exactItems,
        overrides,
    }), [state.rows, mode, kind, term, focusItem, exactItems, overrides]);

    // Scroll a la fila enfocada en cuanto aparece.
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
    const truncated = state.sources.filter((source) => source.hasMore);
    const overdue = mode === 'active'
        ? rows.filter((row) => row.item.status === 'active' && row.item.badges.some((badge) => badge.emoji === '🧹')).length
        : 0;

    const emptyText = term
        ? searching ? '🔎 Buscando también en el servidor…' : `🔎 Nada coincide con «${term}».`
        : kind !== 'all' ? '✨ Nada por aquí con este filtro.' : config.emptyText;

    return (
        <div className="space-y-3">
            {failed.map((source) => (
                <div key={source.queue} role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    <span>⚠️ {source.error}</span>
                    <Button variant="secondary" size="sm" onClick={retryLoad} disabled={loading}>Reintentar</Button>
                </div>
            ))}

            {truncated.map((source) => (
                <p key={source.queue} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
                    ⚠️ {KIND_META[QUEUE_KIND[source.queue]].label}: hay más de {OPEN_PAGE_SIZE} y aquí se ven solo los {OPEN_PAGE_SIZE} más antiguos.
                </p>
            ))}

            {overdue > 0 && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
                    🧹 {overdue === 1 ? 'Hay 1 vencida sin cerrar' : `Hay ${overdue} vencidas sin cerrar`}. Puedes finalizarla{overdue === 1 ? '' : 's'} desde aquí.
                </p>
            )}

            {loading && rows.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                    {config.loadingText}
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
                            mode={mode}
                            expanded={expanded[row.item.key] ?? row.item.id === focusId}
                            focused={row.item.id === focusId}
                            onToggle={toggle}
                            note={notes[row.item.key] ?? ''}
                            onNoteChange={setNote}
                            busy={busy?.key === row.item.key ? busy.decision : null}
                            locked={busy !== null}
                            message={messages[row.item.key] ?? null}
                            onDecide={(target, decision) => void decide(target, decision)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
