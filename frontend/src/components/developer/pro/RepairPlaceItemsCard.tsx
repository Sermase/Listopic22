/**
 * RepairPlaceItemsCard: «🧹 Reparar cartas», en la sub-pestaña «🛠️ Herramientas»
 * de «Patrocinios y Pro».
 *
 * Llama al callable adminRepairPlaceItems, que pasa los datos antiguos al modelo
 * nuevo de la carta: las valoraciones movidas o renombradas llevan el nombre
 * oficial del elemento, se recuperan los nombres de renombres y fusiones
 * aprobados, se cierran duplicados y se actualizan los platos destacados.
 *
 *   🧪 Simular   solo cuenta lo que cambiaría (dryRun), sin tocar nada
 *   🧹 Aplicar   escribe, tras confirmar
 *
 * Con placeId repara un sitio; vacío, repasa los verificados y los que tienen
 * propuestas aprobadas (el servidor corta en 300 sitios o por tiempo, y lo avisa).
 * El resultado enseña los totales y solo los sitios con algo que contar
 * (cambios, conflictos, duplicados o errores); el resto se resume en una línea.
 */
import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import {
    adminRepairPlaceItems,
    type RepairPlaceItemsCounters,
    type RepairPlaceItemsPlace,
    type RepairPlaceItemsResult,
} from '../../../services/BusinessProService';
import { Button, Card } from '../../ui';

const REPAIR_COUNTER_LABELS: Array<{ key: keyof RepairPlaceItemsCounters; emoji: string; label: string }> = [
    { key: 'renamedReviews', emoji: '✏️', label: 'valoraciones renombradas' },
    { key: 'stampedReviews', emoji: '🏷️', label: 'valoraciones actualizadas' },
    { key: 'mergedItems', emoji: '🔀', label: 'elementos fusionados' },
    { key: 'deactivatedItems', emoji: '💤', label: 'elementos desactivados' },
    { key: 'fixedMergedItems', emoji: '🩹', label: 'fusiones corregidas' },
    { key: 'spotlightsUpdated', emoji: '🍽️', label: 'destacados actualizados' },
];

const repairPlaceHasNews = (row: RepairPlaceItemsPlace): boolean => Boolean(row.error)
    || row.conflicts.length > 0
    || row.duplicates.length > 0
    || REPAIR_COUNTER_LABELS.some(({ key }) => row[key] > 0);

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
        const text = (error as { message: string }).message.trim();
        if (text) return text;
    }
    return fallback;
};

const placesText = (count: number): string => `${count.toLocaleString('es-ES')} ${count === 1 ? 'sitio' : 'sitios'}`;

const RepairCounters: React.FC<{ counters: RepairPlaceItemsCounters }> = ({ counters }) => {
    const shown = REPAIR_COUNTER_LABELS.filter(({ key }) => counters[key] > 0);
    if (shown.length === 0) return <p className="text-xs text-gray-500">✨ Sin cambios</p>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {shown.map(({ key, emoji, label }) => (
                <span key={key} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
                    <span aria-hidden="true">{emoji}</span>
                    <span className="font-black tabular-nums text-white">{counters[key].toLocaleString('es-ES')}</span>
                    {label}
                </span>
            ))}
        </div>
    );
};

const RepairPlaceRow: React.FC<{ row: RepairPlaceItemsPlace }> = ({ row }) => (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-bold text-white">{row.placeName || row.placeId}</span>
            {row.placeId && (
                <a
                    href={`/place/${encodeURIComponent(row.placeId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/10 px-2 text-[11px] font-bold text-white hover:bg-white/15"
                    title="Abrir el lugar en otra pestaña"
                >
                    <ExternalLink className="h-3 w-3" />
                    Lugar
                </a>
            )}
        </div>
        {row.error ? (
            <p className="text-xs text-red-300">⚠️ {row.error}</p>
        ) : (
            <RepairCounters counters={row} />
        )}
        {row.conflicts.length > 0 && (
            <ul className="space-y-0.5 text-xs text-amber-300">
                {row.conflicts.map((conflict) => (
                    <li key={`c-${conflict.name}`}>
                        <span aria-hidden="true">⚠️ </span>
                        Conflicto «{conflict.name}»: {conflict.itemIds.join(', ')} (se queda {conflict.itemIds[0]})
                    </li>
                ))}
            </ul>
        )}
        {row.duplicates.length > 0 && (
            <ul className="space-y-0.5 text-xs text-gray-400">
                {row.duplicates.map((duplicate) => (
                    <li key={`d-${duplicate.name}`}>
                        <span aria-hidden="true">👯 </span>
                        Duplicado «{duplicate.name}»: {duplicate.itemIds.join(', ')}
                    </li>
                ))}
            </ul>
        )}
    </div>
);

export const RepairPlaceItemsCard: React.FC = () => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [placeId, setPlaceId] = useState('');
    const [running, setRunning] = useState<'dry' | 'apply' | null>(null);
    const [result, setResult] = useState<RepairPlaceItemsResult | null>(null);

    const run = async (dryRun: boolean) => {
        if (running) return;
        const target = placeId.trim();
        if (!dryRun) {
            const accepted = await confirm({
                title: target ? '¿Reparar la carta de este sitio?' : '¿Reparar todas las cartas?',
                message: target
                    ? `Se reescribirán las valoraciones y los elementos de ${target}. Conviene simular antes.`
                    : 'Se repararán los sitios verificados y los que tienen propuestas aprobadas (hasta 300). Conviene simular antes.',
                confirmLabel: 'Aplicar',
                destructive: true,
            });
            if (!accepted) return;
        }
        setRunning(dryRun ? 'dry' : 'apply');
        try {
            const response = await adminRepairPlaceItems({ placeId: target || undefined, dryRun });
            setResult(response);
            showToast({
                variant: 'success',
                message: dryRun ? '🧪 Simulación lista: no se ha cambiado nada.' : '🧹 Cartas reparadas.',
            });
        } catch (error) {
            console.error('RepairPlaceItemsCard: no se pudieron reparar las cartas', error);
            showToast({ variant: 'error', message: getErrorMessage(error, 'No se pudieron reparar las cartas.') });
        } finally {
            setRunning(null);
        }
    };

    const rowsWithNews = result ? result.places.filter(repairPlaceHasNews) : [];
    const quietPlaces = result ? result.places.length - rowsWithNews.length : 0;

    return (
        <Card className="space-y-4 p-4 sm:p-6">
            <div>
                <h3 className="text-lg font-bold text-white">🧹 Reparar cartas</h3>
                <p className="mt-1 max-w-3xl text-sm text-gray-400">
                    Pone al día los datos antiguos: las valoraciones movidas o renombradas pasan a llevar el nombre oficial del
                    elemento, se recuperan los nombres de renombres y fusiones aprobados, se cierran duplicados y se actualizan
                    los platos destacados. Sin sitio, repasa los verificados y los que tienen propuestas aprobadas.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    💡 Primero «Simular»: cuenta lo que cambiaría sin tocar nada. Si te cuadra, «Aplicar».
                </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                    value={placeId}
                    onChange={(event) => setPlaceId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') void run(true);
                    }}
                    aria-label="placeId del sitio a reparar"
                    placeholder="placeId (opcional, vacío para todos)"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[var(--lt-accent-border)]"
                />
                <div className="flex shrink-0 justify-end gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => void run(true)}
                        disabled={running !== null}
                        leftIcon={running === 'dry' ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden="true">🧪</span>}
                    >
                        Simular
                    </Button>
                    <Button
                        variant="danger"
                        onClick={() => void run(false)}
                        disabled={running !== null}
                        leftIcon={running === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden="true">🧹</span>}
                    >
                        Aplicar
                    </Button>
                </div>
            </div>

            {result && (
                <div className="space-y-3" data-testid="repair-result">
                    <div className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3 sm:p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                            <span aria-hidden="true">{result.dryRun ? '🧪 ' : '✅ '}</span>
                            {result.dryRun ? 'Simulación (no se ha cambiado nada)' : 'Aplicado'} · {placesText(result.totals.places)}
                        </p>
                        <RepairCounters counters={result.totals} />
                        {result.truncated && (
                            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                                ⚠️ Se cortó antes de terminar (máximo de sitios o de tiempo). Vuelve a lanzarlo para seguir.
                            </p>
                        )}
                    </div>
                    {rowsWithNews.map((row) => <RepairPlaceRow key={row.placeId} row={row} />)}
                    {quietPlaces > 0 && (
                        <p className="text-xs text-gray-500">
                            <span aria-hidden="true">😴 </span>
                            {quietPlaces.toLocaleString('es-ES')} {quietPlaces === 1 ? 'sitio sin cambios' : 'sitios sin cambios'}.
                        </p>
                    )}
                </div>
            )}
        </Card>
    );
};
