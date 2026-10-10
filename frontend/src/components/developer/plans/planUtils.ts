/**
 * planUtils: tipos, mapeadores y textos de la pestaña «Planes» de Developer
 * (funciones puras; las consultas están en planQueries.ts).
 *
 * API
 *   type PlansView = 'attention' | 'pro' | 'verified' | 'premium' | 'beta' | 'history'
 *   PLANS_VIEWS, DEFAULT_PLANS_VIEW = 'attention', normalizePlansView(value)
 *   PRO_FILTERS / HISTORY_FILTERS / BETA_FILTERS y normalizeProFilter / normalizeHistoryFilter / normalizeBetaFilter
 *   PlanPlace, mapPlanPlace(id, data, now?)          un local con su plan, saldo, nota y quién lo concedió
 *   PlanUser, mapPlanUser(id, data, now?)            un usuario con su premium
 *   isStripeManaged(place)                           igual que hasActiveStripeSubscription (admin-plans.js):
 *                                                    source 'stripe' + stripeSubscriptionId + estado activo
 *   isUserStripeManaged(user)
 *   planSourceKey(place) / userSourceKey(user)      'manual' | 'trial' | 'beta' | 'stripe' | null
 *   SOURCE_META[key] = { emoji, label }              textos legibles de la fuente (beta aparte)
 *   billingLabel(status)                             estado de Stripe en español
 *   PlanDuration, expiryBase(currentMs, now), computeExpiresAt(duration, customDate, baseMs, now),
 *   durationOptions(baseMs, now)                     opciones del selector con la fecha resultante
 *   parseCredits(text)                               { value } | { error }
 *   creditsConfirm(name, delta, balance)             título y texto del confirm (cantidad exacta y signo)
 *   creditsResultText(name, balance)                 «saldo total», no «de regalo»
 *   PLAN_HISTORY_ACTIONS, HISTORY_FILTER_ACTIONS, PlanHistoryEntry, describeHistoryEntry(entry)
 *   ImpulsePurchaseRow, mapImpulsePurchase(id, data)
 *   InterestRow, mapInterestRow(id, data)
 */
import { normalizeSearchText } from '../../../services/adminQueues';
import { formatDate, toMillis } from '../../../utils/adminTime';
import { formatEur } from '../../../config/planBeta';
import { getBusinessPlanFromPlace, PLAN_SOURCE_LABELS, type BusinessPlan, type BusinessPlanSource } from '../../../utils/businessPlan';

// ── Vistas y filtros (?view= y ?status=) ────────────────────────────────────

export type PlansView = 'attention' | 'pro' | 'verified' | 'premium' | 'beta' | 'history';

export const PLANS_VIEWS: readonly PlansView[] = ['attention', 'pro', 'verified', 'premium', 'beta', 'history'];

export const DEFAULT_PLANS_VIEW: PlansView = 'attention';

export const normalizePlansView = (value: string | null | undefined): PlansView =>
    (PLANS_VIEWS as readonly string[]).includes(value ?? '') ? value as PlansView : DEFAULT_PLANS_VIEW;

/** Vistas que listan locales (buscador de locales y foco por placeId). */
export const isPlaceView = (view: PlansView): boolean => view === 'attention' || view === 'pro' || view === 'verified';

export type PlanSourceKey = 'manual' | 'trial' | 'beta' | 'stripe';

export const SOURCE_META: Record<PlanSourceKey, { emoji: string; label: string }> = {
    manual: { emoji: '🤝', label: PLAN_SOURCE_LABELS.manual },
    trial: { emoji: '⏳', label: PLAN_SOURCE_LABELS.trial },
    beta: { emoji: '🧪', label: 'Prueba (beta)' },
    stripe: { emoji: '💳', label: PLAN_SOURCE_LABELS.stripe },
};

export type ProFilter = 'all' | PlanSourceKey;
export const PRO_FILTERS: readonly ProFilter[] = ['all', 'manual', 'trial', 'beta', 'stripe'];
export const normalizeProFilter = (value: string | null | undefined): ProFilter =>
    (PRO_FILTERS as readonly string[]).includes(value ?? '') ? value as ProFilter : 'all';

export type HistoryFilter = 'all' | 'business' | 'premium' | 'impulses' | 'stripe';
export const HISTORY_FILTERS: readonly HistoryFilter[] = ['all', 'business', 'premium', 'impulses', 'stripe'];
export const normalizeHistoryFilter = (value: string | null | undefined): HistoryFilter =>
    (HISTORY_FILTERS as readonly string[]).includes(value ?? '') ? value as HistoryFilter : 'all';

export type BetaFilter = 'all' | 'noPlace';
export const BETA_FILTERS: readonly BetaFilter[] = ['all', 'noPlace'];
export const normalizeBetaFilter = (value: string | null | undefined): BetaFilter =>
    value === 'noPlace' ? 'noPlace' : 'all';

// ── Locales ─────────────────────────────────────────────────────────────────

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const ACTIVE_STRIPE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);
export const BILLING_PROBLEM_STATUSES: readonly string[] = ['past_due', 'unpaid'];
export const CHECKOUT_STARTED = 'checkout_started';

export interface PlanPlace {
    id: string;
    name: string;
    address: string;
    businessVerified: boolean;
    plan: BusinessPlan;
    /** businessProActive/businessTier en el documento, aunque la fecha ya haya pasado. */
    proFlag: boolean;
    /** Pro con la fecha ya pasada: el proceso nocturno lo degradará. */
    expired: boolean;
    expiresAtMs: number;
    grantedBy: string | null;
    notes: string | null;
    updatedAtMs: number;
    /** Saldo total de impulsos (regalados y comprados). */
    spotlightCredits: number;
    stripeSubscriptionId: string | null;
    billingUpdatedAtMs: number;
    searchText: string;
}

export const mapPlanPlace = (id: string, data: Record<string, unknown>, now: number = Date.now()): PlanPlace => {
    const plan = getBusinessPlanFromPlace(data);
    const expiresAtMs = toMillis(data.businessPlanExpiresAt);
    const proFlag = data.businessProActive === true || data.businessTier === 'pro';
    const name = str(data.name) || str(data.displayName);
    const address = str(data.address) || str(data.formattedAddress);
    const credits = typeof data.spotlightCredits === 'number' && data.spotlightCredits > 0 ? Math.floor(data.spotlightCredits) : 0;
    return {
        id,
        name,
        address,
        businessVerified: data.businessVerified === true,
        plan,
        proFlag,
        expired: proFlag && expiresAtMs > 0 && expiresAtMs <= now,
        expiresAtMs,
        grantedBy: str(data.businessPlanGrantedBy) || null,
        notes: str(data.businessPlanNotes) || null,
        updatedAtMs: toMillis(data.businessPlanUpdatedAt),
        spotlightCredits: credits,
        stripeSubscriptionId: str(data.stripeSubscriptionId) || null,
        billingUpdatedAtMs: toMillis(data.businessBillingUpdatedAt),
        searchText: normalizeSearchText([name, address, id].join(' ')),
    };
};

export const placeLabel = (place: Pick<PlanPlace, 'id' | 'name'>): string => place.name || place.id;

/** Igual que hasActiveStripeSubscription en functions/modules/admin/admin-plans.js. */
export const isStripeManaged = (place: Pick<PlanPlace, 'plan' | 'stripeSubscriptionId'>): boolean =>
    place.plan.source === 'stripe'
    && Boolean(place.stripeSubscriptionId)
    && ACTIVE_STRIPE_STATUSES.has(place.plan.billingStatus ?? '');

export const planSourceKey = (place: Pick<PlanPlace, 'plan' | 'grantedBy'>): PlanSourceKey | null => {
    if (place.grantedBy === 'beta' && place.plan.source !== 'stripe') return 'beta';
    return place.plan.source;
};

const BILLING_LABELS: Record<string, string> = {
    active: 'activa',
    trialing: 'en prueba (Stripe)',
    past_due: 'pago atrasado',
    unpaid: 'impagada',
    canceled: 'cancelada',
    incomplete: 'incompleta',
    incomplete_expired: 'caducada sin pagar',
    paused: 'en pausa',
    checkout_started: 'checkout sin terminar',
};

export const billingLabel = (status: string | null | undefined): string => {
    const key = str(status);
    return BILLING_LABELS[key] || key || 'sin estado';
};

export const isBillingProblem = (status: string | null | undefined): boolean =>
    BILLING_PROBLEM_STATUSES.includes(str(status));

/** Que coincida con todas las palabras del término (sin tildes ni mayúsculas). */
export const matchesTerm = (searchText: string, term: string): boolean => {
    const tokens = normalizeSearchText(term).split(' ').filter(Boolean);
    return tokens.every((token) => searchText.includes(token));
};

/** Con fecha primero (la que antes caduca), luego por nombre. */
export const compareByExpiry = (a: PlanPlace, b: PlanPlace): number => {
    const aMs = a.expiresAtMs || Number.MAX_SAFE_INTEGER;
    const bMs = b.expiresAtMs || Number.MAX_SAFE_INTEGER;
    return (aMs - bMs) || placeLabel(a).localeCompare(placeLabel(b), 'es');
};

export const compareByName = (a: PlanPlace, b: PlanPlace): number => placeLabel(a).localeCompare(placeLabel(b), 'es');

// ── Usuarios (premium) ──────────────────────────────────────────────────────

export interface PlanUser {
    id: string;
    username: string;
    displayName: string;
    email: string;
    premiumActive: boolean;
    /** premium.active en el documento, aunque ya haya caducado. */
    premiumFlag: boolean;
    premiumSource: BusinessPlanSource | null;
    premiumExpiresAtMs: number;
    premiumNotes: string | null;
    premiumGrantedBy: string | null;
    premiumUpdatedAtMs: number;
    searchText: string;
}

const asSource = (value: unknown): BusinessPlanSource | null =>
    value === 'manual' || value === 'trial' || value === 'stripe' ? value : null;

export const mapPlanUser = (id: string, data: Record<string, unknown>, now: number = Date.now()): PlanUser => {
    const premium = (data.premium && typeof data.premium === 'object' ? data.premium : {}) as Record<string, unknown>;
    const expiresAtMs = toMillis(premium.expiresAt);
    const flag = premium.active === true;
    const username = str(data.username);
    const displayName = str(data.displayName) || str(data.name);
    const email = str(data.email);
    return {
        id,
        username,
        displayName,
        email,
        premiumActive: flag && !(expiresAtMs > 0 && expiresAtMs <= now),
        premiumFlag: flag,
        premiumSource: asSource(premium.source),
        premiumExpiresAtMs: expiresAtMs,
        premiumNotes: str(premium.notes) || null,
        premiumGrantedBy: str(premium.grantedBy) || null,
        premiumUpdatedAtMs: toMillis(premium.updatedAt),
        searchText: normalizeSearchText([username ? `@${username}` : '', displayName, email, id].join(' ')),
    };
};

export const userLabel = (user: Pick<PlanUser, 'id' | 'username' | 'displayName' | 'email'>): string =>
    (user.username ? `@${user.username}` : user.displayName || user.email || user.id);

/** El backend no deja quitar premium con source 'stripe' y active (admin-plans.js). */
export const isUserStripeManaged = (user: Pick<PlanUser, 'premiumSource' | 'premiumFlag'>): boolean =>
    user.premiumSource === 'stripe' && user.premiumFlag;

export const userSourceKey = (user: Pick<PlanUser, 'premiumSource' | 'premiumGrantedBy'>): PlanSourceKey | null => {
    if (user.premiumGrantedBy === 'beta' && user.premiumSource !== 'stripe') return 'beta';
    return user.premiumSource;
};

// ── Duración de la concesión ────────────────────────────────────────────────

export type PlanDuration = 'indefinite' | '1m' | '3m' | 'custom';

/** Para extender: se cuenta desde la caducidad actual si aún no ha pasado. */
export const expiryBase = (currentExpiresMs: number, now: number = Date.now()): number =>
    (currentExpiresMs > now ? currentExpiresMs : now);

const addMonths = (baseMs: number, months: number): Date => {
    const date = new Date(baseMs);
    date.setMonth(date.getMonth() + months);
    return date;
};

/**
 * Fecha ISO de caducidad para adminSetBusinessPlan / adminSetUserPlan, o
 * undefined si es indefinida. Lanza Error con el texto para el admin.
 */
export const computeExpiresAt = (
    duration: PlanDuration,
    customDate: string,
    baseMs: number,
    now: number = Date.now(),
): string | undefined => {
    if (duration === '1m') return addMonths(baseMs, 1).toISOString();
    if (duration === '3m') return addMonths(baseMs, 3).toISOString();
    if (duration === 'custom') {
        if (!customDate) throw new Error('📅 Elige la fecha de caducidad.');
        const date = new Date(`${customDate}T23:59:59`);
        if (Number.isNaN(date.getTime()) || date.getTime() <= now) {
            throw new Error('📅 La fecha de caducidad debe ser futura.');
        }
        return date.toISOString();
    }
    return undefined;
};

export interface DurationOption {
    value: PlanDuration;
    label: string;
}

export const durationOptions = (baseMs: number, now: number = Date.now()): DurationOption[] => {
    const extending = baseMs > now;
    const more = extending ? ' más' : '';
    return [
        { value: 'indefinite', label: '♾️ Indefinida' },
        { value: '1m', label: `1 mes${more} (hasta el ${formatDate(addMonths(baseMs, 1).getTime(), now)})` },
        { value: '3m', label: `3 meses${more} (hasta el ${formatDate(addMonths(baseMs, 3).getTime(), now)})` },
        { value: 'custom', label: '📅 Hasta una fecha concreta' },
    ];
};

/** Texto del resultado para el confirm: «hasta el 14/11 (queda como «Periodo de prueba»)». */
export const durationSummary = (expiresAt: string | undefined, now: number = Date.now()): string => (expiresAt
    ? `Hasta el ${formatDate(expiresAt, now)}, queda como «${PLAN_SOURCE_LABELS.trial}».`
    : `Sin fecha de fin, queda como «${PLAN_SOURCE_LABELS.manual}».`);

// ── Impulsos ────────────────────────────────────────────────────────────────

export const MAX_CREDITS_CHANGE = 100000;

export const parseCredits = (text: string): { value: number } | { error: string } => {
    const trimmed = text.trim();
    if (!trimmed) return { error: '⚡ Indica cuántos impulsos (negativo para retirar).' };
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value === 0) return { error: '⚡ Escribe un número entero distinto de 0 (negativo para retirar).' };
    if (Math.abs(value) > MAX_CREDITS_CHANGE) return { error: '⚡ Como mucho 100.000 impulsos de una vez.' };
    return { value };
};

const n = (value: number): string => value.toLocaleString('es-ES');

const impulses = (value: number): string => `${n(value)} impulso${Math.abs(value) === 1 ? '' : 's'}`;

export const creditsConfirm = (
    name: string,
    delta: number,
    balance: number,
    note?: string,
): { title: string; message: string; confirmLabel: string; destructive: boolean } => {
    const after = Math.max(0, balance + delta);
    const noteText = note?.trim() ? ` Motivo: “${note.trim()}”.` : '';
    const floorText = balance + delta < 0 ? ' (el saldo no baja de 0)' : '';
    if (delta > 0) {
        return {
            title: `🎁 ¿Regalar ${impulses(delta)} a ${name}?`,
            message: `Saldo total ahora: ${impulses(balance)}. Después: ${impulses(after)}.${noteText}`,
            confirmLabel: `Regalar ${n(delta)}`,
            destructive: false,
        };
    }
    return {
        title: `➖ ¿Retirar ${impulses(-delta)} a ${name}?`,
        message: `Saldo total ahora: ${impulses(balance)}. Después: ${impulses(after)}${floorText}.${noteText}`,
        confirmLabel: `Retirar ${n(-delta)}`,
        destructive: true,
    };
};

export const creditsResultText = (name: string, balance: number): string =>
    `⚡ Hecho. Saldo total de ${name}: ${impulses(balance)} (regalados y comprados).`;

export const formatImpulses = impulses;

// ── Historial (adminAuditLog) ───────────────────────────────────────────────

export const HISTORY_FILTER_ACTIONS: Record<Exclude<HistoryFilter, 'all'>, readonly string[]> = {
    business: ['businessPlan.manualGrant', 'businessPlan.manualRevoke', 'businessPlan.expired', 'businessPlan.betaTrial'],
    premium: ['userPlan.manualGrant', 'userPlan.manualRevoke', 'userPlan.expired', 'userPlan.betaTrial'],
    impulses: ['sponsored.creditsGranted', 'sponsored.impulsesPurchased'],
    stripe: ['businessPro.subscriptionUpdated', 'businessPro.checkoutCreated'],
};

export const PLAN_HISTORY_ACTIONS: readonly string[] = [
    ...HISTORY_FILTER_ACTIONS.business,
    ...HISTORY_FILTER_ACTIONS.premium,
    ...HISTORY_FILTER_ACTIONS.impulses,
    ...HISTORY_FILTER_ACTIONS.stripe,
];

export const historyActionsFor = (filter: HistoryFilter): readonly string[] =>
    (filter === 'all' ? PLAN_HISTORY_ACTIONS : HISTORY_FILTER_ACTIONS[filter]);

export interface PlanHistoryEntry {
    id: string;
    action: string;
    actorUid: string | null;
    createdAtMs: number;
    details: Record<string, unknown>;
}

export const mapHistoryEntry = (id: string, data: Record<string, unknown>): PlanHistoryEntry => ({
    id,
    action: str(data.action),
    actorUid: str(data.actorUid) || null,
    createdAtMs: toMillis(data.createdAt),
    details: data.details && typeof data.details === 'object' ? data.details as Record<string, unknown> : {},
});

export interface HistoryDescription {
    emoji: string;
    title: string;
    /** Local o usuario afectado (para el enlace y el nombre). */
    placeId: string | null;
    placeName: string | null;
    userId: string | null;
    userName: string | null;
    parts: string[];
    notes: string | null;
}

const sourceText = (value: unknown): string => {
    const source = asSource(value);
    return source ? PLAN_SOURCE_LABELS[source] : '';
};

const untilText = (value: unknown): string => {
    const ms = toMillis(value);
    return ms ? `hasta el ${formatDate(ms)}` : 'sin fecha de fin';
};

const billingPeriod = (value: unknown): string => (value === 'yearly' ? 'anual' : value === 'monthly' ? 'mensual' : '');

export const describeHistoryEntry = (entry: PlanHistoryEntry): HistoryDescription => {
    const d = entry.details;
    const base: HistoryDescription = {
        emoji: '•',
        title: entry.action,
        placeId: str(d.placeId) || null,
        placeName: str(d.placeName) || null,
        userId: str(d.userId) || null,
        userName: str(d.username) ? `@${str(d.username)}` : null,
        parts: [],
        notes: str(d.notes) || null,
    };
    const credits = typeof d.credits === 'number' ? d.credits : 0;
    switch (entry.action) {
        case 'businessPlan.manualGrant':
            return { ...base, emoji: '✨', title: 'Business Pro concedido', parts: [untilText(d.expiresAt)] };
        case 'businessPlan.manualRevoke':
            return { ...base, emoji: '🚫', title: 'Business Pro retirado' };
        case 'businessPlan.expired':
            return { ...base, emoji: '⌛', title: 'Business Pro caducado', parts: [sourceText(d.previousSource) && `era ${sourceText(d.previousSource)}`].filter(Boolean) };
        case 'businessPlan.betaTrial':
            return { ...base, emoji: '🧪', title: 'Prueba de la beta activada', parts: [untilText(d.expiresAt), billingPeriod(d.billing)].filter(Boolean) };
        case 'userPlan.manualGrant':
            return { ...base, emoji: '👑', title: 'Premium concedido', parts: [untilText(d.expiresAt)] };
        case 'userPlan.manualRevoke':
            return { ...base, emoji: '🚫', title: 'Premium retirado' };
        case 'userPlan.expired':
            return { ...base, emoji: '⌛', title: 'Premium caducado', parts: [sourceText(d.previousSource) && `era ${sourceText(d.previousSource)}`].filter(Boolean) };
        case 'userPlan.betaTrial':
            return { ...base, emoji: '🧪', title: 'Prueba de premium (beta) activada', userId: base.userId ?? entry.actorUid, parts: [untilText(d.expiresAt), billingPeriod(d.billing)].filter(Boolean) };
        case 'sponsored.creditsGranted': {
            const balance = typeof d.previousBalance === 'number' && typeof d.newBalance === 'number'
                ? `saldo total ${n(d.previousBalance)} → ${n(d.newBalance)}`
                : '';
            return credits >= 0
                ? { ...base, emoji: '🎁', title: `${impulses(credits)} regalados`, parts: [balance].filter(Boolean) }
                : { ...base, emoji: '➖', title: `${impulses(-credits)} retirados`, parts: [balance].filter(Boolean) };
        }
        case 'sponsored.impulsesPurchased': {
            const amount = typeof d.amountTotalCents === 'number' ? formatEur(d.amountTotalCents / 100) : '';
            const count = typeof d.impulses === 'number' ? d.impulses : 0;
            return { ...base, emoji: '💶', title: `Compra de ${impulses(count)}`, parts: [amount].filter(Boolean) };
        }
        case 'businessPro.subscriptionUpdated':
            return { ...base, emoji: '💳', title: `Suscripción de Stripe: ${billingLabel(str(d.status))}`, parts: [str(d.stripeEventType)].filter(Boolean) };
        case 'businessPro.checkoutCreated':
            return { ...base, emoji: '🛒', title: 'Checkout de Business Pro iniciado' };
        default:
            return base;
    }
};

// ── Compras de impulsos (impulsePurchases) ──────────────────────────────────

export interface ImpulsePurchaseRow {
    id: string;
    placeId: string | null;
    placeName: string | null;
    userId: string | null;
    impulses: number;
    amountEur: number | null;
    status: string;
    createdAtMs: number;
    paidAtMs: number;
}

export const mapImpulsePurchase = (id: string, data: Record<string, unknown>): ImpulsePurchaseRow => {
    const cents = typeof data.amountTotalCents === 'number'
        ? data.amountTotalCents
        : typeof data.amountCents === 'number' ? data.amountCents : null;
    return {
        id,
        placeId: str(data.placeId) || null,
        placeName: str(data.placeName) || null,
        userId: str(data.userId) || null,
        impulses: typeof data.impulses === 'number' ? data.impulses : 0,
        amountEur: cents !== null ? cents / 100 : typeof data.priceEur === 'number' ? data.priceEur : null,
        status: str(data.status) || 'pending',
        createdAtMs: toMillis(data.createdAt),
        paidAtMs: toMillis(data.paidAt),
    };
};

export const PURCHASE_STATUS: Record<string, { emoji: string; label: string; className: string }> = {
    paid: { emoji: '✅', label: 'Pagada', className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' },
    pending: { emoji: '⏳', label: 'Sin pagar', className: 'border-amber-500/30 bg-amber-500/15 text-amber-300' },
    expired: { emoji: '⌛', label: 'Caducada', className: 'border-white/15 bg-white/5 text-gray-300' },
    failed: { emoji: '❌', label: 'Fallida', className: 'border-red-500/30 bg-red-500/15 text-red-300' },
};

// ── Beta «Lo quiero» (planInterest) ─────────────────────────────────────────

export interface InterestRow {
    id: string;
    plan: 'premium' | 'business_pro';
    billing: 'monthly' | 'yearly';
    placeId: string | null;
    placeName: string | null;
    userId: string | null;
    clicks: number;
    lastAtMs: number;
    trialGrantedAtMs: number;
    trialExpiresAtMs: number;
    /** La prueba sigue en marcha cuando se leyó. */
    trialActive: boolean;
}

export const mapInterestRow = (id: string, data: Record<string, unknown>, now: number = Date.now()): InterestRow => ({
    id,
    plan: data.plan === 'premium' ? 'premium' : 'business_pro',
    billing: data.billing === 'yearly' ? 'yearly' : 'monthly',
    placeId: str(data.placeId) || null,
    placeName: str(data.placeName) || null,
    userId: str(data.userId) || null,
    clicks: typeof data.clicks === 'number' ? data.clicks : 1,
    lastAtMs: toMillis(data.lastAt),
    trialGrantedAtMs: toMillis(data.trialGrantedAt),
    trialExpiresAtMs: toMillis(data.trialExpiresAt),
    trialActive: toMillis(data.trialExpiresAt) > now,
});

export interface RowMessage {
    type: 'success' | 'error';
    text: string;
}

export const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        const text = (error as { message: string }).message.trim();
        if (text) return text;
    }
    return fallback;
};
