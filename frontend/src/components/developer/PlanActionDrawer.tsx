/**
 * PlanActionDrawer: panel lateral con las acciones de UNA fila de «Planes»
 * (sustituye a los controles globales de duración, notas e impulsos).
 *
 *   Local:   estado actual (plan, quién lo concedió, último cambio, nota, saldo, Stripe) y
 *            «🏢 Gestor negocios →» a su tarjeta (equipo y solicitud de origen)
 *            ✨ Business Pro: duración (contada desde la caducidad actual si aún no ha
 *               pasado), nota rellenada con la nota actual (al quitar Pro no se pierde),
 *               Activar / Guardar / Quitar Pro. Si lo gestiona Stripe (source 'stripe' +
 *               stripeSubscriptionId + estado activo, como el backend) no se toca aquí.
 *            ⚡ Impulsos: cantidad (negativa para retirar) con confirmación de la cantidad
 *               exacta y del signo; el resultado habla de «saldo total».
 *   Usuario: 👑 Premium con la misma duración y nota.
 *
 * Al abrir relee el documento (para no rellenar con datos viejos) y tras cada
 * cambio invalida ['developer'] (pestaña, bandeja y contadores).
 *
 * Props
 *   target: PlanDrawerTarget | null      { kind: 'place', place } | { kind: 'user', user }; null = cerrado
 *   preset?: { duration?: PlanDuration; section?: 'plan' | 'credits' }
 *                                        «⏩ Extender» abre con 1 mes; «♾️ Pasar a indefinido», con indefinida
 *   onClose: () => void
 *   onDone?: (id: string, message: RowMessage) => void   para repetir el aviso en la fila
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useConfirm } from '../../context/ConfirmContext';
import { useInvalidateDeveloper } from '../../hooks/useDeveloperInbox';
import { useAdminName } from '../../hooks/useAdminNames';
import { adminSetBusinessPlan, adminSetUserPlan } from '../../services/PlanAdminService';
import { adminGrantSpotlightCredits } from '../../services/BusinessProService';
import { formatDate, formatDateTime, formatUntil } from '../../utils/adminTime';
import { Button, IconButton } from '../ui';
import { fetchPlace, fetchUser, planPlaceKey, planUserKey } from './plans/planQueries';
import { BillingChip, CreditsChip, PremiumChip, ProChip, RowMessageBox } from './plans/PlanRows';
import {
    SOURCE_META,
    billingLabel,
    computeExpiresAt,
    creditsConfirm,
    creditsResultText,
    durationOptions,
    durationSummary,
    expiryBase,
    formatImpulses,
    getErrorMessage,
    isStripeManaged,
    isUserStripeManaged,
    parseCredits,
    placeLabel,
    planSourceKey,
    userLabel,
    userSourceKey,
    type PlanDuration,
    type PlanPlace,
    type PlanUser,
    type RowMessage,
} from './plans/planUtils';

export type PlanDrawerTarget =
    | { kind: 'place'; place: PlanPlace }
    | { kind: 'user'; user: PlanUser };

export type PlanDrawerSection = 'plan' | 'credits';

export interface PlanDrawerPreset {
    duration?: PlanDuration;
    section?: PlanDrawerSection;
}

export interface PlanActionDrawerProps {
    target: PlanDrawerTarget | null;
    preset?: PlanDrawerPreset;
    onClose: () => void;
    onDone?: (id: string, message: RowMessage) => void;
}

type Busy = 'save' | 'revoke' | 'credits' | null;

const inputClass = 'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[var(--lt-accent-border)]';
const labelClass = 'mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-gray-200">{children}</dd>
    </div>
);

const Missing: React.FC<{ text: string }> = ({ text }) => <span className="text-gray-500">{text}</span>;

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode; sectionRef?: React.Ref<HTMLElement> }> = ({ title, hint, children, sectionRef }) => (
    <section ref={sectionRef} className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-3 sm:p-4">
        <div>
            <h3 className="text-sm font-bold text-white">{title}</h3>
            {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
        </div>
        {children}
    </section>
);

const ActorName: React.FC<{ uid: string | null }> = ({ uid }) => {
    const name = useAdminName(uid);
    return name ? <>{name}</> : <Missing text="Nadie" />;
};

/** Duración + fecha concreta, compartido por Business Pro y premium. */
const DurationPicker: React.FC<{
    idPrefix: string;
    baseMs: number;
    duration: PlanDuration;
    onDuration: (value: PlanDuration) => void;
    customDate: string;
    onCustomDate: (value: string) => void;
    disabled?: boolean;
}> = ({ idPrefix, baseMs, duration, onDuration, customDate, onCustomDate, disabled }) => (
    <div className="grid gap-3 sm:grid-cols-2">
        <label className={cn('block', duration !== 'custom' && 'sm:col-span-2')}>
            <span className={labelClass}>⏱️ Duración</span>
            <select
                id={`${idPrefix}-duration`}
                value={duration}
                disabled={disabled}
                onChange={(event) => onDuration(event.target.value as PlanDuration)}
                className={inputClass}
            >
                {durationOptions(baseMs).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </label>
        {duration === 'custom' && (
            <label className="block">
                <span className={labelClass}>📅 Caduca el</span>
                <input
                    type="date"
                    value={customDate}
                    disabled={disabled}
                    onChange={(event) => onCustomDate(event.target.value)}
                    className={inputClass}
                />
            </label>
        )}
    </div>
);

/** La nota sigue a la del documento (que se relee al abrir) hasta que el admin la edita. */
const useSyncedNote = (current: string | null): [string, (value: string) => void] => {
    const [edited, setEdited] = useState<string | null>(null);
    return [edited ?? current ?? '', setEdited];
};

interface PanelProps {
    preset?: PlanDrawerPreset;
    onDone?: (id: string, message: RowMessage) => void;
    setConfirming: (value: boolean) => void;
}

// ── Local ───────────────────────────────────────────────────────────────────

const PlacePanel: React.FC<PanelProps & { initial: PlanPlace }> = ({ initial, preset, onDone, setConfirming }) => {
    const confirm = useConfirm();
    const invalidateDeveloper = useInvalidateDeveloper();
    const idPrefix = useId();
    const { data, isFetching } = useQuery({
        queryKey: planPlaceKey(initial.id),
        queryFn: () => fetchPlace(initial.id),
        initialData: initial,
        staleTime: 0,
    });
    const place = data ?? initial;
    const missing = data === null;
    const name = placeLabel(place);
    const stripeManaged = isStripeManaged(place);
    const source = planSourceKey(place);

    const [duration, setDuration] = useState<PlanDuration>(
        preset?.duration ?? (place.plan.isPro && place.expiresAtMs ? '1m' : 'indefinite'),
    );
    const [customDate, setCustomDate] = useState('');
    const [note, setNote] = useSyncedNote(place.notes);
    const [credits, setCredits] = useState('');
    const [creditsNote, setCreditsNote] = useState('');
    const [busy, setBusy] = useState<Busy>(null);
    const [message, setMessage] = useState<RowMessage | null>(null);
    const creditsRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (preset?.section === 'credits') creditsRef.current?.scrollIntoView?.({ block: 'start' });
    }, [preset?.section]);

    const report = (next: RowMessage) => {
        setMessage(next);
        onDone?.(place.id, next);
    };

    const ask = async (options: Parameters<typeof confirm>[0]) => {
        setConfirming(true);
        try {
            return await confirm(options);
        } finally {
            setConfirming(false);
        }
    };

    // Extender cuenta desde la caducidad actual si aún no ha pasado; si no, desde ahora.
    const baseMs = expiryBase(place.plan.isPro ? place.expiresAtMs : 0);
    const extending = place.expiresAtMs > 0 && baseMs === place.expiresAtMs;

    const savePlan = async () => {
        if (busy || stripeManaged) return;
        let expiresAt: string | undefined;
        try {
            expiresAt = computeExpiresAt(duration, customDate, baseMs);
        } catch (error) {
            setMessage({ type: 'error', text: getErrorMessage(error, '📅 Revisa la fecha.') });
            return;
        }
        const trimmed = note.trim();
        const ok = await ask({
            title: place.plan.isPro ? `💾 ¿Guardar Business Pro de ${name}?` : `✨ ¿Activar Business Pro en ${name}?`,
            message: `${durationSummary(expiresAt)} ${trimmed ? `Nota: “${trimmed}”.` : 'Sin nota.'}`,
            confirmLabel: place.plan.isPro ? 'Guardar' : 'Activar Pro',
        });
        if (!ok) return;
        setBusy('save');
        setMessage(null);
        try {
            const result = await adminSetBusinessPlan({ placeId: place.id, active: true, expiresAt, notes: trimmed || undefined });
            report({
                type: 'success',
                text: `✨ Business Pro activo en ${name} ${result.expiresAt ? `hasta el ${formatDate(result.expiresAt)}` : 'sin fecha de fin'}.`,
            });
            await invalidateDeveloper();
        } catch (error) {
            console.error('PlanActionDrawer: adminSetBusinessPlan failed', error);
            report({ type: 'error', text: `⚠️ ${getErrorMessage(error, 'No se pudo actualizar el plan.')}` });
        } finally {
            setBusy(null);
        }
    };

    const revokePlan = async () => {
        if (busy || stripeManaged) return;
        const trimmed = note.trim();
        const ok = await ask({
            title: `🚫 ¿Quitar Business Pro a ${name}?`,
            message: trimmed
                ? `Pasará a Free. La nota del local quedará así: “${trimmed}”.`
                : 'Pasará a Free. La nota está vacía, así que se borrará la del local.',
            confirmLabel: 'Quitar Pro',
            destructive: true,
        });
        if (!ok) return;
        setBusy('revoke');
        setMessage(null);
        try {
            await adminSetBusinessPlan({ placeId: place.id, active: false, notes: trimmed || undefined });
            report({ type: 'success', text: `🚫 ${name} ya no tiene Business Pro.` });
            await invalidateDeveloper();
        } catch (error) {
            console.error('PlanActionDrawer: revoke failed', error);
            report({ type: 'error', text: `⚠️ ${getErrorMessage(error, 'No se pudo quitar el plan.')}` });
        } finally {
            setBusy(null);
        }
    };

    const parsedCredits = parseCredits(credits);
    const creditsValue = 'value' in parsedCredits ? parsedCredits.value : 0;

    const grantCredits = async () => {
        if (busy) return;
        if ('error' in parsedCredits) {
            setMessage({ type: 'error', text: parsedCredits.error });
            return;
        }
        const delta = parsedCredits.value;
        const ok = await ask(creditsConfirm(name, delta, place.spotlightCredits, creditsNote));
        if (!ok) return;
        setBusy('credits');
        setMessage(null);
        try {
            const result = await adminGrantSpotlightCredits(place.id, delta, creditsNote.trim() || undefined);
            report({ type: 'success', text: creditsResultText(name, result.balance) });
            setCredits('');
            setCreditsNote('');
            await invalidateDeveloper();
        } catch (error) {
            console.error('PlanActionDrawer: adminGrantSpotlightCredits failed', error);
            report({ type: 'error', text: `⚠️ ${getErrorMessage(error, 'No se pudieron cambiar los impulsos.')}` });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <ProChip place={place} />
                <BillingChip status={place.plan.billingStatus} />
                <CreditsChip credits={place.spotlightCredits} />
                {!place.businessVerified && <span className="text-xs text-gray-400">❔ Sin verificar</span>}
                {isFetching && <span className="text-xs text-gray-500">⏳ Actualizando…</span>}
            </div>
            {missing && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    🔎 Este local ya no existe en la base de datos.
                </p>
            )}

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="✨ Plan">
                    {place.plan.isPro
                        ? <>Pro{source ? ` · ${SOURCE_META[source].emoji} ${SOURCE_META[source].label}` : ''}</>
                        : place.expired ? 'Pro caducado (pasa a Free esta noche)' : 'Free'}
                </Field>
                <Field label="📅 Caduca">
                    {place.expiresAtMs
                        ? <span className="tabular-nums">{formatDate(place.expiresAtMs)} <span className="text-gray-500">({formatUntil(place.expiresAtMs)})</span></span>
                        : <Missing text={place.plan.isPro ? 'Sin fecha de fin' : 'No aplica'} />}
                </Field>
                <Field label="👤 Concedido por">
                    {place.plan.isPro || place.proFlag ? <ActorName uid={place.grantedBy} /> : <Missing text="No aplica" />}
                </Field>
                <Field label="🔄 Último cambio del plan">
                    {place.updatedAtMs ? <span className="tabular-nums">{formatDateTime(place.updatedAtMs)}</span> : <Missing text="Sin fecha" />}
                </Field>
                <Field label="📝 Nota actual">
                    {place.notes ? <span className="italic">“{place.notes}”</span> : <Missing text="Sin nota" />}
                </Field>
                <Field label="⚡ Saldo total de impulsos">
                    {formatImpulses(place.spotlightCredits)} <span className="text-gray-500">(regalados y comprados)</span>
                </Field>
                {(place.plan.billingStatus || place.stripeSubscriptionId) && (
                    <Field label="💳 Stripe">
                        {billingLabel(place.plan.billingStatus)}
                        {place.stripeSubscriptionId && <span className="block break-all font-mono text-xs text-gray-500">{place.stripeSubscriptionId}</span>}
                    </Field>
                )}
                <Field label="🆔 Lugar">
                    <a href={`/place/${encodeURIComponent(place.id)}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs text-[var(--lt-accent)] hover:underline">
                        {place.id} ↗
                    </a>
                </Field>
                <Field label="👥 Equipo">
                    <Link
                        to={`/developer?tab=businessManagers&focus=${encodeURIComponent(place.id)}`}
                        className="text-sm font-semibold text-[var(--lt-accent)] hover:underline"
                    >
                        🏢 Gestor negocios →
                    </Link>
                </Field>
            </dl>

            <Section
                title="✨ Business Pro"
                hint={extending
                    ? 'Para extender, la duración se cuenta desde la caducidad actual.'
                    : 'Con fecha de fin queda como «Periodo de prueba»; sin fecha, «Concedido manualmente».'}
            >
                {stripeManaged ? (
                    <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
                        💳 Lo gestiona Stripe (suscripción {billingLabel(place.plan.billingStatus)}). Cámbialo o cancélalo desde Stripe: el plan se actualizará solo.
                    </p>
                ) : (
                    <>
                        <DurationPicker
                            idPrefix={idPrefix}
                            baseMs={baseMs}
                            duration={duration}
                            onDuration={setDuration}
                            customDate={customDate}
                            onCustomDate={setCustomDate}
                            disabled={busy !== null || missing}
                        />
                        <label className="block">
                            <span className={labelClass}>📝 Nota del plan (motivo)</span>
                            <textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                maxLength={500}
                                disabled={busy !== null || missing}
                                className={cn(inputClass, 'min-h-16')}
                                placeholder="Prueba interna, cortesía, prensa..."
                            />
                            <span className="mt-1 block text-[11px] text-gray-500">
                                Empieza con la nota actual. Se guarda en el local al activar y también al quitar Pro.
                            </span>
                        </label>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            {place.plan.isPro && (
                                <Button variant="danger" size="sm" onClick={revokePlan} loading={busy === 'revoke'} disabled={busy !== null || missing}>
                                    🚫 Quitar Pro
                                </Button>
                            )}
                            <Button variant="primary" size="sm" onClick={savePlan} loading={busy === 'save'} disabled={busy !== null || missing}>
                                {place.plan.isPro ? (duration === 'indefinite' ? '♾️ Guardar como indefinido' : '⏩ Guardar nueva fecha') : '✨ Activar Pro'}
                            </Button>
                        </div>
                    </>
                )}
            </Section>

            <Section
                sectionRef={creditsRef}
                title="⚡ Impulsos"
                hint={`Saldo total ahora: ${formatImpulses(place.spotlightCredits)} (regalados y comprados). Se gastan solos al pedir campañas.`}
            >
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                    <label className="block">
                        <span className={labelClass}>Cantidad</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            step={1}
                            min={-100000}
                            max={100000}
                            value={credits}
                            onChange={(event) => setCredits(event.target.value)}
                            disabled={busy !== null || missing}
                            className={inputClass}
                            placeholder="100 o -50"
                        />
                    </label>
                    <label className="block">
                        <span className={labelClass}>Motivo (queda en el historial)</span>
                        <input
                            value={creditsNote}
                            onChange={(event) => setCreditsNote(event.target.value)}
                            maxLength={300}
                            disabled={busy !== null || missing}
                            className={inputClass}
                            placeholder="Invitación, compensación..."
                        />
                    </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {[50, 100, 500].map((amount) => (
                        <button
                            key={amount}
                            type="button"
                            onClick={() => setCredits(String(amount))}
                            disabled={busy !== null || missing}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-gray-300 hover:text-white disabled:opacity-50"
                        >
                            +{amount}
                        </button>
                    ))}
                </div>
                <div className="flex justify-end">
                    <Button
                        variant={creditsValue < 0 ? 'danger' : 'secondary'}
                        size="sm"
                        onClick={grantCredits}
                        loading={busy === 'credits'}
                        disabled={busy !== null || missing || creditsValue === 0}
                    >
                        {creditsValue < 0
                            ? `➖ Retirar ${formatImpulses(-creditsValue)}`
                            : creditsValue > 0 ? `🎁 Regalar ${formatImpulses(creditsValue)}` : '🎁 Regalar impulsos'}
                    </Button>
                </div>
            </Section>

            <RowMessageBox message={message} />
        </div>
    );
};

// ── Usuario ─────────────────────────────────────────────────────────────────

const UserPanel: React.FC<PanelProps & { initial: PlanUser }> = ({ initial, preset, onDone, setConfirming }) => {
    const confirm = useConfirm();
    const invalidateDeveloper = useInvalidateDeveloper();
    const idPrefix = useId();
    const { data, isFetching } = useQuery({
        queryKey: planUserKey(initial.id),
        queryFn: () => fetchUser(initial.id),
        initialData: initial,
        staleTime: 0,
    });
    const user = data ?? initial;
    const missing = data === null;
    const name = userLabel(user);
    const stripeManaged = isUserStripeManaged(user);
    const source = userSourceKey(user);

    const [duration, setDuration] = useState<PlanDuration>(
        preset?.duration ?? (user.premiumActive && user.premiumExpiresAtMs ? '1m' : 'indefinite'),
    );
    const [customDate, setCustomDate] = useState('');
    const [note, setNote] = useSyncedNote(user.premiumNotes);
    const [busy, setBusy] = useState<Busy>(null);
    const [message, setMessage] = useState<RowMessage | null>(null);

    const report = (next: RowMessage) => {
        setMessage(next);
        onDone?.(user.id, next);
    };

    const ask = async (options: Parameters<typeof confirm>[0]) => {
        setConfirming(true);
        try {
            return await confirm(options);
        } finally {
            setConfirming(false);
        }
    };

    const baseMs = expiryBase(user.premiumActive ? user.premiumExpiresAtMs : 0);
    const extending = user.premiumExpiresAtMs > 0 && baseMs === user.premiumExpiresAtMs;

    const save = async (active: boolean) => {
        if (busy || (!active && stripeManaged)) return;
        let expiresAt: string | undefined;
        if (active) {
            try {
                expiresAt = computeExpiresAt(duration, customDate, baseMs);
            } catch (error) {
                setMessage({ type: 'error', text: getErrorMessage(error, '📅 Revisa la fecha.') });
                return;
            }
        }
        const trimmed = note.trim();
        const ok = await ask(active
            ? {
                title: user.premiumActive ? `💾 ¿Guardar el premium de ${name}?` : `👑 ¿Activar premium a ${name}?`,
                message: `${durationSummary(expiresAt)} ${trimmed ? `Nota: “${trimmed}”.` : 'Sin nota.'}`,
                confirmLabel: user.premiumActive ? 'Guardar' : 'Activar premium',
            }
            : {
                title: `🚫 ¿Quitar premium a ${name}?`,
                message: trimmed ? `La nota quedará así: “${trimmed}”.` : 'La nota está vacía, así que se borrará.',
                confirmLabel: 'Quitar premium',
                destructive: true,
            });
        if (!ok) return;
        setBusy(active ? 'save' : 'revoke');
        setMessage(null);
        try {
            const result = await adminSetUserPlan({ userId: user.id, active, expiresAt, notes: trimmed || undefined });
            report({
                type: 'success',
                text: active
                    ? `👑 Premium activo para ${name} ${result.expiresAt ? `hasta el ${formatDate(result.expiresAt)}` : 'sin fecha de fin'}.`
                    : `🚫 ${name} ya no tiene premium.`,
            });
            await invalidateDeveloper();
        } catch (error) {
            console.error('PlanActionDrawer: adminSetUserPlan failed', error);
            report({ type: 'error', text: `⚠️ ${getErrorMessage(error, 'No se pudo actualizar el premium.')}` });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <PremiumChip user={user} />
                {isFetching && <span className="text-xs text-gray-500">⏳ Actualizando…</span>}
            </div>
            {missing && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    🔎 Este usuario ya no existe.
                </p>
            )}
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="👑 Premium">
                    {user.premiumActive
                        ? <>Activo{source ? ` · ${SOURCE_META[source].emoji} ${SOURCE_META[source].label}` : ''}</>
                        : 'Free'}
                </Field>
                <Field label="📅 Caduca">
                    {user.premiumExpiresAtMs
                        ? <span className="tabular-nums">{formatDate(user.premiumExpiresAtMs)} <span className="text-gray-500">({formatUntil(user.premiumExpiresAtMs)})</span></span>
                        : <Missing text={user.premiumActive ? 'Sin fecha de fin' : 'No aplica'} />}
                </Field>
                <Field label="👤 Concedido por">
                    {user.premiumFlag ? <ActorName uid={user.premiumGrantedBy} /> : <Missing text="No aplica" />}
                </Field>
                <Field label="🔄 Último cambio">
                    {user.premiumUpdatedAtMs ? <span className="tabular-nums">{formatDateTime(user.premiumUpdatedAtMs)}</span> : <Missing text="Sin fecha" />}
                </Field>
                <Field label="📝 Nota actual">
                    {user.premiumNotes ? <span className="italic">“{user.premiumNotes}”</span> : <Missing text="Sin nota" />}
                </Field>
                <Field label="✉️ Email">{user.email || <Missing text="Sin email" />}</Field>
                <Field label="🆔 Usuario">
                    <a href={`/profile/${encodeURIComponent(user.id)}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs text-[var(--lt-accent)] hover:underline">
                        {user.id} ↗
                    </a>
                </Field>
            </dl>

            <Section
                title="👑 Premium personal"
                hint={extending
                    ? 'Para extender, la duración se cuenta desde la caducidad actual.'
                    : 'Con fecha de fin queda como «Periodo de prueba»; sin fecha, «Concedido manualmente».'}
            >
                <DurationPicker
                    idPrefix={idPrefix}
                    baseMs={baseMs}
                    duration={duration}
                    onDuration={setDuration}
                    customDate={customDate}
                    onCustomDate={setCustomDate}
                    disabled={busy !== null || missing}
                />
                <label className="block">
                    <span className={labelClass}>📝 Nota (motivo)</span>
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={500}
                        disabled={busy !== null || missing}
                        className={cn(inputClass, 'min-h-16')}
                        placeholder="Prueba interna, cortesía, prensa..."
                    />
                </label>
                {stripeManaged && (
                    <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
                        💳 Lo paga con Stripe: para quitarlo, cancela la suscripción desde Stripe.
                    </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {user.premiumActive && (
                        <Button variant="danger" size="sm" onClick={() => save(false)} loading={busy === 'revoke'} disabled={busy !== null || missing || stripeManaged}>
                            🚫 Quitar premium
                        </Button>
                    )}
                    <Button variant="primary" size="sm" onClick={() => save(true)} loading={busy === 'save'} disabled={busy !== null || missing}>
                        {user.premiumActive ? (duration === 'indefinite' ? '♾️ Guardar como indefinido' : '⏩ Guardar nueva fecha') : '👑 Activar premium'}
                    </Button>
                </div>
            </Section>

            <RowMessageBox message={message} />
        </div>
    );
};

// ── Panel ───────────────────────────────────────────────────────────────────

export const PlanActionDrawer: React.FC<PlanActionDrawerProps> = ({ target, preset, onClose, onDone }) => {
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    // Mientras hay un confirm abierto, Esc lo cierra a él, no al panel.
    const confirming = useRef(false);
    const setConfirming = useCallback((value: boolean) => {
        confirming.current = value;
    }, []);
    const open = target !== null;

    useEffect(() => {
        if (!open) return;
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !confirming.current) onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!target) return null;

    const key = target.kind === 'place' ? `place:${target.place.id}` : `user:${target.user.id}`;
    const title = target.kind === 'place'
        ? <>🏪 {placeLabel(target.place)}</>
        : <>👤 {userLabel(target.user)}</>;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button type="button" className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" aria-label="Cerrar el panel" onClick={onClose} />
            <aside
                className="relative flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[var(--lt-card-strong)] shadow-2xl"
                style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                            {target.kind === 'place' ? '⚙️ Plan del local' : '⚙️ Premium del usuario'}
                        </p>
                        <h2 id={titleId} className="truncate text-lg font-bold text-white">{title}</h2>
                    </div>
                    <IconButton ref={closeRef} label="Cerrar" icon={<X className="h-5 w-5" />} variant="ghost" size="sm" onClick={onClose} />
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                    {target.kind === 'place'
                        ? <PlacePanel key={key} initial={target.place} preset={preset} onDone={onDone} setConfirming={setConfirming} />
                        : <UserPanel key={key} initial={target.user} preset={preset} onDone={onDone} setConfirming={setConfirming} />}
                </div>
            </aside>
        </div>,
        document.body,
    );
};
