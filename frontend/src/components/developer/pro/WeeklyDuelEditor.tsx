/**
 * WeeklyDuelEditor: sub-pestaña «⚔️ Duelo» de «Patrocinios y Pro».
 *
 * La misma lógica que antes (el jefe escribe duels/{id} desde el cliente): ver
 * el duelo activo, crear uno nuevo (sustituye al activo) o finalizarlo. El
 * banner se enciende con el flag «Duelo de la semana» en Otros. Se carga al
 * abrir la sub-pestaña; si la lectura falla se avisa (en vez de decir que no
 * hay duelo) y no se deja crear otro, para no dejar dos duelos activos.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Loader2, RefreshCw, Swords } from 'lucide-react';
import { db } from '../../../firebase';
import { useConfirm } from '../../../context/ConfirmContext';
import { mapDuel, type Duel } from '../../../types/duel';
import { Button, Card } from '../../ui';

const EMPTY_FORM = {
    title: '',
    aLabel: '', aSublabel: '', aImageUrl: '', aLink: '',
    bLabel: '', bSublabel: '', bImageUrl: '', bLink: '',
};

type DuelForm = typeof EMPTY_FORM;
type Message = { type: 'success' | 'error'; text: string };

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
        const text = (error as { message: string }).message.trim();
        if (text) return text;
    }
    return fallback;
};

const inputClass = 'w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]';

export const WeeklyDuelEditor: React.FC = () => {
    const confirm = useConfirm();
    const [activeDuel, setActiveDuel] = useState<Duel | null>(null);
    const [form, setForm] = useState<DuelForm>(EMPTY_FORM);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<Message | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const snap = await getDocs(query(collection(db, 'duels'), where('status', '==', 'active'), limit(1)));
            setActiveDuel(snap.empty ? null : mapDuel(snap.docs[0].id, snap.docs[0].data() as Record<string, unknown>));
        } catch (error) {
            console.error('WeeklyDuelEditor: no se pudo leer el duelo activo', error);
            setLoadError(getErrorMessage(error, 'No se pudo leer el duelo activo.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const createDuel = async () => {
        if (!form.aLabel.trim() || !form.bLabel.trim()) {
            setMessage({ type: 'error', text: '⚠️ El duelo necesita los dos contendientes.' });
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            if (activeDuel) {
                await setDoc(doc(db, 'duels', activeDuel.id), { status: 'ended', endedAt: serverTimestamp() }, { merge: true });
            }
            const title = form.title.trim() || 'El Duelo de la semana';
            const ref = await addDoc(collection(db, 'duels'), {
                title,
                status: 'active',
                sideA: {
                    label: form.aLabel.trim(),
                    sublabel: form.aSublabel.trim() || null,
                    imageUrl: form.aImageUrl.trim() || null,
                    link: form.aLink.trim() || null,
                },
                sideB: {
                    label: form.bLabel.trim(),
                    sublabel: form.bSublabel.trim() || null,
                    imageUrl: form.bImageUrl.trim() || null,
                    link: form.bLink.trim() || null,
                },
                createdAt: serverTimestamp(),
            });
            setActiveDuel({
                id: ref.id,
                title,
                status: 'active',
                sideA: { label: form.aLabel.trim() },
                sideB: { label: form.bLabel.trim() },
            });
            setForm(EMPTY_FORM);
            setMessage({ type: 'success', text: '⚔️ Duelo activado. Recuerda tener encendido el flag en Otros.' });
        } catch (error) {
            console.error('WeeklyDuelEditor: no se pudo crear el duelo', error);
            setMessage({ type: 'error', text: `⚠️ ${getErrorMessage(error, 'No se pudo crear el duelo.')}` });
        } finally {
            setSaving(false);
        }
    };

    const endDuel = async () => {
        if (!activeDuel) return;
        const confirmed = await confirm({
            title: '🏁 ¿Finalizar el duelo?',
            message: `«${activeDuel.sideA.label}» 🆚 «${activeDuel.sideB.label}» deja de mostrarse.`,
            confirmLabel: 'Finalizar duelo',
            destructive: true,
        });
        if (!confirmed) return;
        setSaving(true);
        setMessage(null);
        try {
            await setDoc(doc(db, 'duels', activeDuel.id), { status: 'ended', endedAt: serverTimestamp() }, { merge: true });
            setActiveDuel(null);
            setMessage({ type: 'success', text: '🏁 Duelo finalizado.' });
        } catch (error) {
            setMessage({ type: 'error', text: `⚠️ ${getErrorMessage(error, 'No se pudo finalizar el duelo.')}` });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                        <Swords className="h-5 w-5 text-amber-300" />
                        Duelo de la semana
                    </h3>
                    <p className="mt-1 text-sm text-gray-400">
                        Dos platos rivales, la comunidad vota. El banner se enciende con el flag «Duelo de la semana» en Otros.
                    </p>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void load()}
                    disabled={loading || saving}
                    leftIcon={<RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />}
                >
                    Actualizar
                </Button>
            </div>

            {loadError ? (
                <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    ⚠️ {loadError} Sin saber si hay un duelo activo, crear otro queda desactivado. Prueba con «Actualizar».
                </div>
            ) : loading && !activeDuel ? (
                <div className="py-4 text-center text-sm text-gray-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                    Cargando…
                </div>
            ) : activeDuel ? (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white">{activeDuel.title || 'El Duelo de la semana'}</p>
                        <p className="mt-1 text-xs text-gray-400">{activeDuel.sideA.label} 🆚 {activeDuel.sideB.label}</p>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => void endDuel()} disabled={saving}>
                        🏁 Finalizar duelo
                    </Button>
                </div>
            ) : (
                <p className="rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-3 text-center text-sm text-gray-500">
                    No hay duelo activo.
                </p>
            )}

            <div className="grid gap-3">
                <input
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                    placeholder="Título (opcional): El Duelo de la semana en Madrid"
                    aria-label="Título del duelo"
                />
                <div className="grid gap-3 lg:grid-cols-2">
                    {(['a', 'b'] as const).map((side) => (
                        <div key={side} className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3">
                            <p className="text-xs font-black uppercase tracking-wider text-amber-300">Contendiente {side.toUpperCase()}</p>
                            <input
                                value={form[`${side}Label`]}
                                onChange={(event) => setForm({ ...form, [`${side}Label`]: event.target.value })}
                                className={inputClass}
                                placeholder="Plato (ej. Tarta de queso de Casa Paca)"
                                aria-label={`Plato del contendiente ${side.toUpperCase()}`}
                            />
                            <input
                                value={form[`${side}Sublabel`]}
                                onChange={(event) => setForm({ ...form, [`${side}Sublabel`]: event.target.value })}
                                className={inputClass}
                                placeholder="Subtítulo (ej. nota 8,9 · 24 reseñas)"
                                aria-label={`Subtítulo del contendiente ${side.toUpperCase()}`}
                            />
                            <input
                                value={form[`${side}ImageUrl`]}
                                onChange={(event) => setForm({ ...form, [`${side}ImageUrl`]: event.target.value })}
                                className={inputClass}
                                placeholder="URL de foto"
                                aria-label={`Foto del contendiente ${side.toUpperCase()}`}
                            />
                            <input
                                value={form[`${side}Link`]}
                                onChange={(event) => setForm({ ...form, [`${side}Link`]: event.target.value })}
                                className={inputClass}
                                placeholder="Enlace interno (ej. /group/{placeId}/{plato})"
                                aria-label={`Enlace del contendiente ${side.toUpperCase()}`}
                            />
                        </div>
                    ))}
                </div>
                {message && (
                    <div
                        role={message.type === 'error' ? 'alert' : 'status'}
                        className={message.type === 'success'
                            ? 'rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300'
                            : 'rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300'}
                    >
                        {message.text}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => void createDuel()}
                    disabled={saving || loading || Boolean(loadError)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-500 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                    {activeDuel ? 'Sustituir duelo activo' : 'Crear y activar duelo'}
                </button>
            </div>
        </Card>
    );
};
