/**
 * ImpulsePricingEditor: sub-pestaña «💶 Precios» de «Patrocinios y Pro».
 *
 * - Lee config/sponsoredPricing al abrir la sub-pestaña (no antes).
 * - Si la lectura falla, no rellena con los valores por defecto: enseña el
 *   error y no deja guardar, para no sobrescribir la configuración real.
 *   Si el documento aún no existe, avisa de que se ven los valores por defecto.
 * - Marca «● Cambios sin guardar» y avisa antes de recargar o cerrar la página.
 * - Guarda con el callable adminUpdateSpotlightPricing, que valida en el servidor.
 *
 * Props
 *   onDirtyChange?: (dirty: boolean) => void     para marcar la sub-pestaña
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, RefreshCw, Save, X } from 'lucide-react';
import { db } from '../../../firebase';
import { formatEur } from '../../../config/planBeta';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useAdminName } from '../../../hooks/useAdminNames';
import {
    impulsesPriceEur,
    normalizeSpotlightPricing,
    packDiscountPercent,
    SPOTLIGHT_RADIUS_STEP_KM,
    updateSpotlightPricing,
    type SpotlightPricing,
} from '../../../services/BusinessProService';
import { formatDateTime, toMillis } from '../../../utils/adminTime';
import { Button, Card } from '../../ui';

export interface ImpulsePricingEditorProps {
    onDirtyChange?: (dirty: boolean) => void;
}

interface PricingSource {
    exists: boolean;
    updatedBy: string | null;
    updatedAtMs: number | null;
}

type Message = { type: 'success' | 'error' | 'info'; text: string };

const MAX_PACKS = 8;

const FIELDS: Array<[Exclude<keyof SpotlightPricing, 'packs'>, string, number]> = [
    ['pricePerImpulseEur', '€ por impulso', 0.001],
    ['minRadiusKm', 'Radio mínimo (km)', SPOTLIGHT_RADIUS_STEP_KM],
    ['maxRadiusKm', 'Radio máximo (km)', SPOTLIGHT_RADIUS_STEP_KM],
    ['maxIntensity', 'Intensidad máx. (×)', 1],
    ['maxDays', 'Días máx.', 1],
    ['minPurchaseImpulses', 'Compra mínima (impulsos)', 1],
];

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
        const text = (error as { message: string }).message.trim();
        if (text) return text;
    }
    return fallback;
};

const samePricing = (a: SpotlightPricing | null, b: SpotlightPricing | null): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

const MESSAGE_CLASS: Record<Message['type'], string> = {
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    error: 'border-red-500/25 bg-red-500/10 text-red-300',
    info: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
};

const inputClass = 'w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]';

export const ImpulsePricingEditor: React.FC<ImpulsePricingEditorProps> = ({ onDirtyChange }) => {
    const { user } = useAuth();
    const confirm = useConfirm();
    const [baseline, setBaseline] = useState<SpotlightPricing | null>(null);
    const [form, setForm] = useState<SpotlightPricing | null>(null);
    const [source, setSource] = useState<PricingSource | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<Message | null>(null);
    const requestRef = useRef(0);
    const updatedByName = useAdminName(source?.updatedBy ?? null);

    const dirty = baseline !== null && form !== null && !samePricing(form, baseline);

    const load = useCallback(async () => {
        const request = ++requestRef.current;
        setLoading(true);
        setLoadError(null);
        setMessage(null);
        try {
            const snap = await getDoc(doc(db, 'config', 'sponsoredPricing'));
            if (request !== requestRef.current) return;
            const data = snap.exists() ? snap.data() as Record<string, unknown> : null;
            const pricing = normalizeSpotlightPricing(data ?? {});
            setBaseline(pricing);
            setForm(pricing);
            setSource({
                exists: Boolean(data),
                updatedBy: typeof data?.updatedBy === 'string' ? data.updatedBy : null,
                updatedAtMs: toMillis(data?.updatedAt) || null,
            });
        } catch (error) {
            if (request !== requestRef.current) return;
            console.error('ImpulsePricingEditor: no se pudo leer config/sponsoredPricing', error);
            setLoadError(getErrorMessage(error, 'No se pudo leer la configuración de precios.'));
        } finally {
            if (request === requestRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    // Avisar al cerrar o recargar la página con cambios sin guardar.
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    const reload = async () => {
        if (dirty) {
            const discard = await confirm({
                title: '¿Descartar los cambios sin guardar?',
                message: 'Has cambiado precios que aún no has guardado. Si recargas, se pierden.',
                confirmLabel: 'Descartar y recargar',
                destructive: true,
            });
            if (!discard) return;
        }
        await load();
    };

    const discardChanges = () => {
        setForm(baseline);
        setMessage(null);
    };

    const save = async () => {
        if (!form || loadError || !dirty) return;
        setSaving(true);
        setMessage(null);
        try {
            const saved = normalizeSpotlightPricing({ ...(await updateSpotlightPricing(form)) });
            setBaseline(saved);
            setForm(saved);
            setSource({ exists: true, updatedBy: user?.uid ?? null, updatedAtMs: Date.now() });
            setMessage({ type: 'success', text: '✅ Precios guardados y validados en el servidor.' });
        } catch (error) {
            console.error('ImpulsePricingEditor: no se pudo guardar', error);
            setMessage({ type: 'error', text: `⚠️ ${getErrorMessage(error, 'No se pudieron guardar los precios.')}` });
        } finally {
            setSaving(false);
        }
    };

    const update = (patch: (prev: SpotlightPricing) => SpotlightPricing) => {
        setForm((prev) => (prev ? patch(prev) : prev));
    };

    const canSave = Boolean(form) && !loadError && dirty && !saving && !loading;
    const updatedAt = source?.updatedAtMs ? formatDateTime(source.updatedAtMs) : '';

    return (
        <Card className="space-y-5 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold text-white">
                        💶 Precio de los impulsos
                        {dirty && (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                                ● Cambios sin guardar
                            </span>
                        )}
                    </h3>
                    <p className="mt-1 text-sm text-gray-400">
                        1 impulso = 0,2 km de radio × 1 día × 1 papeleta. Una campaña gasta tramos × días × intensidad.
                        {form && (
                            <>
                                {' '}Ejemplo con estos precios: 1 km × 7 días × ×1 = 35 impulsos = {formatEur(impulsesPriceEur(form, 35))};
                                {' '}5 km × 10 días × ×4 = 1.000 impulsos = {formatEur(impulsesPriceEur(form, 1000))}.
                            </>
                        )}
                    </p>
                    {source?.exists && (updatedAt || source.updatedBy) && (
                        <p className="mt-1 text-xs text-gray-500">
                            🕒 Última actualización{updatedAt ? ` ${updatedAt}` : ''}{source.updatedBy && updatedByName ? ` por ${updatedByName}` : ''}
                        </p>
                    )}
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void reload()}
                    disabled={loading || saving}
                    leftIcon={<RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />}
                >
                    Recargar
                </Button>
            </div>

            {loadError && (
                <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    ⚠️ No se pudo leer la configuración de precios ({loadError}). «Guardar» queda desactivado para no
                    sobrescribirla con valores por defecto. Prueba con «Recargar».
                </div>
            )}

            {!loadError && source && !source.exists && (
                <p className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
                    ℹ️ Aún no hay precios guardados: ves los valores por defecto, que son los que usa el servidor.
                </p>
            )}

            {loading && !form ? (
                <div className="py-8 text-center text-sm text-gray-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                    Cargando precios…
                </div>
            ) : form && (
                <fieldset disabled={Boolean(loadError) || saving} className="space-y-5 disabled:opacity-60">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        {FIELDS.map(([key, label, step]) => (
                            <label key={key} className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={step}
                                    value={form[key]}
                                    onChange={(event) => {
                                        const value = Number(event.target.value) || 0;
                                        update((prev) => ({ ...prev, [key]: value }));
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>

                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">📦 Paquetes (salen más baratos que comprar suelto)</p>
                        <div className="mt-2 space-y-2">
                            {form.packs.map((pack, index) => {
                                const discount = packDiscountPercent(form, pack);
                                return (
                                    <div key={index} className="flex flex-wrap items-center gap-2">
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            aria-label={`Impulsos del paquete ${index + 1}`}
                                            value={pack.impulses}
                                            onChange={(event) => {
                                                const impulses = Math.floor(Number(event.target.value)) || 0;
                                                update((prev) => ({
                                                    ...prev,
                                                    packs: prev.packs.map((row, i) => (i === index ? { ...row, impulses } : row)),
                                                }));
                                            }}
                                            className="w-32 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                                        />
                                        <span className="text-xs text-gray-400">impulsos por</span>
                                        <input
                                            type="number"
                                            min={0.5}
                                            step={0.5}
                                            aria-label={`Precio del paquete ${index + 1}`}
                                            value={pack.priceEur}
                                            onChange={(event) => {
                                                const priceEur = Number(event.target.value) || 0;
                                                update((prev) => ({
                                                    ...prev,
                                                    packs: prev.packs.map((row, i) => (i === index ? { ...row, priceEur } : row)),
                                                }));
                                            }}
                                            className="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                                        />
                                        {discount < 0 ? (
                                            <span className="text-xs font-bold text-red-300">€ · más caro que suelto</span>
                                        ) : (
                                            <span className="text-xs text-gray-400">€ · {discount} % de descuento</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => update((prev) => ({ ...prev, packs: prev.packs.filter((_, i) => i !== index) }))}
                                            className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
                                            aria-label={`Quitar paquete ${index + 1}`}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                );
                            })}
                            {form.packs.length < MAX_PACKS && (
                                <button
                                    type="button"
                                    onClick={() => update((prev) => ({ ...prev, packs: [...prev.packs, { impulses: 1000, priceEur: 45 }] }))}
                                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                                >
                                    ➕ Añadir paquete
                                </button>
                            )}
                        </div>
                    </div>
                </fieldset>
            )}

            {message && (
                <div role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${MESSAGE_CLASS[message.type]}`}>
                    {message.text}
                </div>
            )}

            {form && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                    {dirty && (
                        <Button variant="ghost" size="md" onClick={discardChanges} disabled={saving}>
                            ↩️ Descartar cambios
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        size="md"
                        onClick={() => void save()}
                        disabled={!canSave}
                        loading={saving}
                        leftIcon={saving ? undefined : <Save className="h-4 w-4" />}
                        title={loadError ? 'No se puede guardar sin leer antes la configuración real' : !dirty ? 'No hay cambios que guardar' : undefined}
                    >
                        Guardar precios
                    </Button>
                </div>
            )}
        </Card>
    );
};
