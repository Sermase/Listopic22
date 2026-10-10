/**
 * PlanRows: chips y filas de la pestaña «Planes».
 *
 *   ProChip        «✨ Pro · Prueba (beta) · hasta 14/10» | «⌛ Pro caducado» | «Free»
 *   BillingChip    estado de Stripe («💳 Pago atrasado», «🛒 Checkout sin terminar»…)
 *   CreditsChip    «⚡ 120 impulsos» (saldo total)
 *   PremiumChip    «👑 Premium · Concedido manualmente · hasta 14/10» | «Free»
 *   PlanMetaLine   «👤 Concedido por Ana · 🔄 12/09 18:20 · “nota”» (solo lectura)
 *   PlanPlaceRow   un local: chips, contexto (p. ej. «⏳ Caduca el 14/10 (en 8 d)»), meta,
 *                  Lugar ↗, ⚙️ Gestionar y acciones extra; el aviso de la última acción va en la fila
 *   PlanUserRow    un usuario con premium: chips, meta, Perfil ↗ y ⚙️ Gestionar
 *   RowMessageBox  aviso de éxito o error dentro de la fila o del panel
 */
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useAdminName } from '../../../hooks/useAdminNames';
import { formatDate, formatDateTime } from '../../../utils/adminTime';
import { Button } from '../../ui';
import {
    SOURCE_META,
    billingLabel,
    formatImpulses,
    isBillingProblem,
    planSourceKey,
    placeLabel,
    userLabel,
    userSourceKey,
    type PlanPlace,
    type PlanUser,
    type RowMessage,
} from './planUtils';

const CHIP = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold';

export const ProChip: React.FC<{ place: PlanPlace; now?: number }> = ({ place, now }) => {
    if (place.plan.isPro) {
        const source = planSourceKey(place);
        const expiry = place.expiresAtMs ? formatDate(place.expiresAtMs, now) : '';
        return (
            <span className={cn(CHIP, 'border-amber-500/30 bg-amber-500/10 text-amber-300')}>
                <span aria-hidden="true">✨</span>
                Pro{source ? ` · ${SOURCE_META[source].label}` : ''}{expiry ? ` · hasta ${expiry}` : ''}
            </span>
        );
    }
    if (place.expired) {
        return (
            <span className={cn(CHIP, 'border-white/15 bg-white/5 text-gray-300')} title="El proceso nocturno lo pasará a Free">
                <span aria-hidden="true">⌛</span>
                Pro caducado el {formatDate(place.expiresAtMs, now)}
            </span>
        );
    }
    return <span className={cn(CHIP, 'border-white/15 bg-white/5 text-gray-400')}>Free</span>;
};

export const BillingChip: React.FC<{ status: string | null }> = ({ status }) => {
    if (!status) return null;
    if (isBillingProblem(status)) {
        return <span className={cn(CHIP, 'border-red-500/30 bg-red-500/10 text-red-300')}>💳 Stripe: {billingLabel(status)}</span>;
    }
    if (status === 'checkout_started') {
        return <span className={cn(CHIP, 'border-white/15 bg-white/5 text-gray-300')}>🛒 Checkout sin terminar</span>;
    }
    return <span className={cn(CHIP, 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300')}>💳 Stripe: {billingLabel(status)}</span>;
};

export const CreditsChip: React.FC<{ credits: number }> = ({ credits }) => (credits > 0
    ? (
        <span className={cn(CHIP, 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400')} title="Saldo total: regalados y comprados">
            <span aria-hidden="true">⚡</span>
            {formatImpulses(credits)}
        </span>
    )
    : null);

export const PremiumChip: React.FC<{ user: PlanUser; now?: number }> = ({ user, now }) => {
    if (!user.premiumActive) {
        return user.premiumFlag && user.premiumExpiresAtMs
            ? <span className={cn(CHIP, 'border-white/15 bg-white/5 text-gray-300')}>⌛ Premium caducado el {formatDate(user.premiumExpiresAtMs, now)}</span>
            : <span className={cn(CHIP, 'border-white/15 bg-white/5 text-gray-400')}>Free</span>;
    }
    const source = userSourceKey(user);
    const expiry = user.premiumExpiresAtMs ? formatDate(user.premiumExpiresAtMs, now) : '';
    return (
        <span className={cn(CHIP, 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300')}>
            <span aria-hidden="true">👑</span>
            Premium{source ? ` · ${SOURCE_META[source].label}` : ''}{expiry ? ` · hasta ${expiry}` : ''}
        </span>
    );
};

const Separator: React.FC = () => <span aria-hidden="true" className="text-gray-500">·</span>;

export const PlanMetaLine: React.FC<{
    grantedBy?: string | null;
    grantedLabel?: string;
    updatedAtMs?: number;
    notes?: string | null;
    className?: string;
}> = ({ grantedBy, grantedLabel = 'Concedido por', updatedAtMs, notes, className }) => {
    const name = useAdminName(grantedBy ?? null);
    const when = updatedAtMs ? formatDateTime(updatedAtMs) : '';
    if (!name && !when && !notes) return null;
    const parts: React.ReactNode[] = [];
    if (name) parts.push(<span key="by">👤 {grantedLabel} <span className="font-semibold text-gray-200">{name}</span></span>);
    if (when) parts.push(<span key="at" className="tabular-nums" title="Último cambio del plan">🔄 {when}</span>);
    if (notes) parts.push(<span key="notes" className="break-words italic text-gray-300">“{notes}”</span>);
    return (
        <p className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400', className)}>
            {parts.map((part, index) => (
                <React.Fragment key={index}>
                    {index > 0 && <Separator />}
                    {part}
                </React.Fragment>
            ))}
        </p>
    );
};

export const RowMessageBox: React.FC<{ message: RowMessage | null | undefined; className?: string }> = ({ message, className }) => (message
    ? (
        <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                message.type === 'success'
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/25 bg-red-500/10 text-red-300',
                className,
            )}
        >
            {message.text}
        </div>
    )
    : null);

const linkButtonClass = 'inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/15';

export interface PlanPlaceRowProps {
    place: PlanPlace;
    focused?: boolean;
    /** Línea de contexto bajo el nombre (Atención: caducidad, problema de pago…). */
    context?: React.ReactNode;
    /** Botones extra antes de «Gestionar» (Extender, Pasar a indefinido). */
    actions?: React.ReactNode;
    message?: RowMessage | null;
    onManage: (place: PlanPlace) => void;
    now?: number;
}

export const PlanPlaceRow: React.FC<PlanPlaceRowProps> = ({ place, focused = false, context, actions, message, onManage, now }) => {
    const showGrant = place.plan.isPro || place.proFlag;
    return (
        <article
            id={`plan-place-${place.id}`}
            data-testid={`plan-place-${place.id}`}
            className={cn(
                'scroll-mt-24 rounded-xl border bg-black/15 transition-colors',
                focused ? 'border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent-border)]' : 'border-white/10',
            )}
        >
            <div className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true">🏪</span>
                        <span className="min-w-0 truncate font-bold text-white">{placeLabel(place)}</span>
                        <ProChip place={place} now={now} />
                        <BillingChip status={place.plan.billingStatus} />
                        <CreditsChip credits={place.spotlightCredits} />
                        {!place.businessVerified && (
                            <span className={cn(CHIP, 'border-white/15 bg-white/5 text-gray-400')}>❔ Sin verificar</span>
                        )}
                    </div>
                    {context && <div className="mt-1 text-sm text-gray-300">{context}</div>}
                    <p className="mt-1 text-xs text-gray-500">
                        <span className="break-all font-mono">{place.id}</span>
                        {place.address && <span> · {place.address}</span>}
                    </p>
                    <PlanMetaLine
                        className="mt-1.5"
                        grantedBy={showGrant ? place.grantedBy : null}
                        updatedAtMs={place.updatedAtMs}
                        notes={place.notes}
                    />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                    <a
                        href={`/place/${encodeURIComponent(place.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkButtonClass}
                        title="Abrir el lugar en otra pestaña"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Lugar
                    </a>
                    <Button variant="secondary" size="sm" onClick={() => onManage(place)}>
                        ⚙️ Gestionar
                    </Button>
                </div>
            </div>
            {message && <RowMessageBox message={message} className="mx-3 mb-3 sm:mx-4 sm:mb-4" />}
        </article>
    );
};

export interface PlanUserRowProps {
    user: PlanUser;
    focused?: boolean;
    message?: RowMessage | null;
    onManage: (user: PlanUser) => void;
    now?: number;
}

export const PlanUserRow: React.FC<PlanUserRowProps> = ({ user, focused = false, message, onManage, now }) => {
    const subtitle = [user.username && user.displayName ? user.displayName : '', user.email].filter(Boolean).join(' · ');
    return (
        <article
            id={`plan-user-${user.id}`}
            data-testid={`plan-user-${user.id}`}
            className={cn(
                'scroll-mt-24 rounded-xl border bg-black/15 transition-colors',
                focused ? 'border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent-border)]' : 'border-white/10',
            )}
        >
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true">👤</span>
                        <span className="min-w-0 truncate font-bold text-white">{userLabel(user)}</span>
                        <PremiumChip user={user} now={now} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                        {subtitle && <span>{subtitle} · </span>}
                        <span className="break-all font-mono">{user.id}</span>
                    </p>
                    <PlanMetaLine
                        className="mt-1.5"
                        grantedBy={user.premiumFlag ? user.premiumGrantedBy : null}
                        updatedAtMs={user.premiumUpdatedAtMs}
                        notes={user.premiumNotes}
                    />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <a
                        href={`/profile/${encodeURIComponent(user.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkButtonClass}
                        title="Abrir el perfil en otra pestaña"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Perfil
                    </a>
                    <Button variant="secondary" size="sm" onClick={() => onManage(user)}>
                        ⚙️ Gestionar
                    </Button>
                </div>
            </div>
            {message && <RowMessageBox message={message} className="mx-3 mb-3 sm:mx-4 sm:mb-4" />}
        </article>
    );
};
