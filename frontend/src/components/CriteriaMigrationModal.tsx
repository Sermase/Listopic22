import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ArrowRight, FlaskConical, Scale } from 'lucide-react';
import { functions } from '../firebase';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { formatScore } from '../lib/scoreScale';

export interface MigrationCriterion {
    id: string;
    label: string;
}

interface CriteriaChange {
    weights: Record<string, number>;
    removeCriteria: string[];
}

interface SimulationResult {
    fingerprint: string;
    noChange: boolean;
    summary: {
        totalReviews: number;
        changedReviews: number;
        maxDelta: number;
        rankingMoves: number;
        minilistsAffected: number;
    };
    reviews: Array<{ id: string; itemName: string; sublistId: string | null; before: number | null; after: number | null }>;
    rankingChanges: Array<{ id: string; name: string; before: number | null; after: number }>;
}

interface CriteriaMigrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    listId: string;
    criteria: MigrationCriterion[];
    currentWeights: Record<string, number>;
    /** Aplicar está reservado a administradores; el resto solo simula. */
    canApply: boolean;
    onApplied: () => void;
}

const WEIGHT_LABELS = ['No cuenta', '×1', '×2', '×3'];
const SHOWN_ROWS = 30;

const errorMessage = (error: unknown) =>
    (error as { message?: string })?.message?.replace(/^.*?:\s*/, '') || 'No se ha podido completar.';

/**
 * Cambiar pesos o quitar criterios en una Lista que ya tiene valoraciones.
 * Primero se simula (nada se escribe) y se ve el antes/después; aplicar
 * recalcula en el servidor todas las valoraciones de la Lista y sus Minilistas.
 */
export const CriteriaMigrationModal: React.FC<CriteriaMigrationModalProps> = ({
    isOpen, onClose, listId, criteria, currentWeights, canApply, onApplied,
}) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [weights, setWeights] = useState<Record<string, number>>(currentWeights);
    const [removed, setRemoved] = useState<string[]>([]);
    const [simulation, setSimulation] = useState<SimulationResult | null>(null);
    const [busy, setBusy] = useState<'simulate' | 'apply' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const change = useMemo<CriteriaChange>(() => ({
        weights: Object.fromEntries(Object.entries(weights).filter(([id, w]) => !removed.includes(id) && w !== (currentWeights[id] ?? 1))),
        removeCriteria: removed,
    }), [weights, removed, currentWeights]);
    const hasChanges = Object.keys(change.weights).length > 0 || change.removeCriteria.length > 0;
    const remainingCounting = criteria.filter((c) => !removed.includes(c.id) && (weights[c.id] ?? 0) > 0).length;

    const resetSimulation = () => { setSimulation(null); setError(null); };

    const setWeight = (id: string, value: number) => {
        setWeights((prev) => ({ ...prev, [id]: value }));
        resetSimulation();
    };

    const toggleRemoved = (id: string) => {
        setRemoved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
        resetSimulation();
    };

    const simulate = async () => {
        setBusy('simulate');
        setError(null);
        try {
            const fn = httpsCallable<{ listId: string; change: CriteriaChange }, SimulationResult>(functions, 'simulateCriteriaChange');
            const { data } = await fn({ listId, change });
            setSimulation(data);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    const apply = async () => {
        if (!simulation) return;
        const ok = await confirm({
            title: 'Aplicar y recalcular',
            message: `Se recalcularán ${simulation.summary.changedReviews} valoraciones con los pesos nuevos. La nota anterior de cada una queda guardada.`,
            confirmLabel: 'Aplicar',
        });
        if (!ok) return;
        setBusy('apply');
        setError(null);
        try {
            const fn = httpsCallable(functions, 'applyCriteriaChange', { timeout: 540000 });
            await fn({ listId, change, fingerprint: simulation.fingerprint });
            showToast({ variant: 'success', message: 'Pesos aplicados y valoraciones recalculadas.' });
            onApplied();
        } catch (e) {
            setError(errorMessage(e));
            setSimulation(null);
        } finally {
            setBusy(null);
        }
    };

    const changedRows = simulation?.reviews ?? [];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={<span className="flex items-center gap-2"><Scale className="w-4 h-4" /> Cambiar pesos</span>}>
            <div className="space-y-5 p-4 text-sm text-[var(--lt-text)]">
                <p className="text-[var(--lt-text-muted)]">
                    Esta Lista ya tiene valoraciones. Aquí puedes cambiar cuánto cuenta cada criterio o quitar alguno.
                    Primero verás cómo cambian las notas y el ranking; nada se guarda hasta aplicar.
                    Las Minilistas se actualizan igual. Quitar un criterio no borra las puntuaciones ya puestas.
                </p>

                <ul className="divide-y divide-[var(--lt-border)] rounded-xl border border-[var(--lt-border)]">
                    {criteria.map((criterion) => {
                        const isRemoved = removed.includes(criterion.id);
                        const current = currentWeights[criterion.id] ?? 1;
                        return (
                            <li key={criterion.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span className={`font-semibold ${isRemoved ? 'line-through text-[var(--lt-text-muted)]' : ''}`}>
                                    {criterion.label}
                                    <span className="ml-2 text-[11px] font-normal text-[var(--lt-text-muted)]">ahora {WEIGHT_LABELS[current] ?? `×${current}`}</span>
                                </span>
                                <span className="flex items-center gap-2">
                                    <select
                                        aria-label={`Peso de ${criterion.label}`}
                                        value={weights[criterion.id] ?? current}
                                        disabled={isRemoved}
                                        onChange={(e) => setWeight(criterion.id, Number(e.target.value))}
                                        className="bg-[var(--lt-bg)] border border-[var(--lt-border)] rounded px-2 py-1 text-xs"
                                    >
                                        {WEIGHT_LABELS.map((label, value) => <option key={value} value={value}>{label}</option>)}
                                    </select>
                                    <label className="flex items-center gap-1 text-xs text-[var(--lt-text-muted)]">
                                        <input type="checkbox" checked={isRemoved} onChange={() => toggleRemoved(criterion.id)} />
                                        Quitar
                                    </label>
                                </span>
                            </li>
                        );
                    })}
                </ul>

                {remainingCounting === 0 && (
                    <p role="alert" className="text-xs text-red-400">Al menos un criterio tiene que contar para la nota.</p>
                )}

                <Button
                    variant="secondary"
                    leftIcon={<FlaskConical className="w-4 h-4" />}
                    loading={busy === 'simulate'}
                    disabled={!hasChanges || remainingCounting === 0 || busy !== null}
                    onClick={simulate}
                >
                    Simular
                </Button>

                {error && <p role="alert" className="text-xs text-red-400">{error}</p>}

                {simulation && (
                    <section aria-label="Resultado de la simulación" className="space-y-3 rounded-xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] p-3">
                        {simulation.noChange ? (
                            <p>Con este cambio no cambia ninguna nota.</p>
                        ) : (
                            <p className="font-semibold">
                                {simulation.summary.changedReviews} de {simulation.summary.totalReviews} valoraciones cambian de nota
                                {simulation.summary.changedReviews > 0 && <> · cambio máximo {formatScore(Number(simulation.summary.maxDelta.toFixed(1)))}</>}
                                {' · '}{simulation.summary.rankingMoves} {simulation.summary.rankingMoves === 1 ? 'elemento cambia' : 'elementos cambian'} de puesto
                                {simulation.summary.minilistsAffected > 0 && <> · {simulation.summary.minilistsAffected} Minilistas se actualizan</>}
                            </p>
                        )}

                        {changedRows.length > 0 && (
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)] mb-1">Notas antes → después</h4>
                                <ul className="max-h-48 overflow-y-auto space-y-0.5 text-xs">
                                    {changedRows.slice(0, SHOWN_ROWS).map((row) => (
                                        <li key={row.id} className="flex justify-between gap-2">
                                            <span className="truncate">{row.itemName || 'Sin nombre'}{row.sublistId ? ' (Minilista)' : ''}</span>
                                            <span className="shrink-0 tabular-nums flex items-center gap-1">
                                                {row.before !== null ? formatScore(row.before) : '—'}
                                                <ArrowRight className="w-3 h-3" aria-label="pasa a" />
                                                <strong>{row.after !== null ? formatScore(row.after) : '—'}</strong>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                {changedRows.length > SHOWN_ROWS && (
                                    <p className="text-[11px] text-[var(--lt-text-muted)] mt-1">y {simulation.summary.changedReviews - SHOWN_ROWS} más.</p>
                                )}
                            </div>
                        )}

                        {simulation.rankingChanges.length > 0 && (
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)] mb-1">Puestos en la Lista</h4>
                                <ul className="max-h-40 overflow-y-auto space-y-0.5 text-xs">
                                    {simulation.rankingChanges.map((row) => (
                                        <li key={row.id} className="flex justify-between gap-2">
                                            <span className="truncate">{row.name}</span>
                                            <span className="shrink-0 tabular-nums">#{row.before ?? '—'} → <strong>#{row.after}</strong></span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {!simulation.noChange && (canApply ? (
                            <Button variant="primary" loading={busy === 'apply'} disabled={busy !== null} onClick={apply}>
                                Aplicar y recalcular
                            </Button>
                        ) : (
                            <p className="text-xs text-[var(--lt-text-muted)]">
                                Aplicar el cambio lo hace un administrador de Listopic. Pídeselo indicando esta Lista y los pesos que quieres.
                            </p>
                        ))}
                    </section>
                )}
            </div>
        </Modal>
    );
};
