/**
 * Dibujitos, textos y reglas de 📣 Promos (spec §8). Solo presentación: los
 * emoji se calculan a partir de lo guardado y no se escriben en los datos,
 * salvo los que el negocio pone a propósito en el título de una oferta o en el
 * mensaje de una campaña (plantillas y chips de ideas).
 *
 *   computeOfferStatus(offer)                 // 'live' | 'scheduled' | 'expired' | 'draft'
 *   toggleCondition('Solo en sala', chip)     // 'Solo en sala · No acumulable'
 *   formatDateRange('2026-10-05', '2026-10-12') // '5 oct → 12 oct'
 *   mergeCampaigns(placements, spotlights)    // filas de 📈 Resultados, recientes primero
 */
import {
    computeSpotlightImpulses,
    packDiscountPercent,
    SPOTLIGHT_RADIUS_STEP_KM,
    type BusinessOfferData,
    type ImpulsePack,
    type ItemSpotlight,
    type SponsoredMetrics,
    type SponsoredPlacement,
    type SponsoredPlacementStatus,
    type SpotlightPricing,
} from '../../../services/BusinessProService';
import type { StatusMeta } from '../kit';

// ── Límites del servidor (business-pro.js / sponsored.js) ───────────────────

export const MAX_OFFERS = 20;
export const MAX_OFFER_TITLE = 120;
export const MAX_OFFER_DESCRIPTION = 500;
export const MAX_OFFER_CONDITIONS = 300;
export const MAX_OFFER_URL = 500;
export const MAX_PLACEMENT_HEADLINE = 120;
export const MAX_OPEN_PLACEMENTS = 5;

// ── Subpestañas (?sub=) ─────────────────────────────────────────────────────

export type PromoSub = 'ofertas' | 'plato' | 'campanas' | 'resultados';

export const PROMO_SUBS: ReadonlyArray<{ value: PromoSub; emoji: string; label: string; caption: string }> = [
    { value: 'ofertas', emoji: '🎁', label: 'Ofertas', caption: 'Gratis con Pro' },
    { value: 'plato', emoji: '🍽️', label: 'Plato estrella', caption: 'Con impulsos ⚡' },
    { value: 'campanas', emoji: '🗺️', label: 'Portada y mapa', caption: 'Revisa un admin' },
    { value: 'resultados', emoji: '📈', label: 'Resultados', caption: 'Lo que has conseguido' },
];

export const parsePromoSub = (raw: string | null | undefined): PromoSub | null => (
    PROMO_SUBS.some((sub) => sub.value === raw) ? raw as PromoSub : null
);

// ── Números, euros y fechas (es-ES) ─────────────────────────────────────────

/** 1240 → «1.240» (es-ES no agrupa los números de 4 cifras; aquí sí). */
export const formatCount = (value: number): string => {
    const rounded = Math.round(Number.isFinite(value) ? value : 0);
    const sign = rounded < 0 ? '-' : '';
    return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/** 0,6 → «0,6 km»; 2 → «2 km». */
export const formatKm = (km: number): string => `${String(Number(km.toFixed(1))).replace('.', ',')} km`;

/** CTR con coma: «4,5 %», o «—» sin vistas. */
export const formatCtr = (metrics: SponsoredMetrics): string => {
    if (!metrics.impressions) return '—';
    return `${((metrics.clicks / metrics.impressions) * 100).toFixed(1).replace('.', ',')} %`;
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const parseIsoDate = (value: string | undefined | null): { y: number; m: number; d: number } | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { y: Number(match[1]), m, d };
};

/** '2026-10-05' → «5 oct» (con el año si no es el de `now`). Texto tal cual si no es una fecha. */
export const formatShortDate = (value: string, now: Date = new Date()): string => {
    const date = parseIsoDate(value);
    if (!date) return value;
    const base = `${date.d} ${MONTHS[date.m - 1]}`;
    return date.y === now.getFullYear() ? base : `${base} ${date.y}`;
};

/** «5 oct → 12 oct» · «desde 5 oct» · «hasta 12 oct» · null sin fechas. */
export const formatDateRange = (startsAt?: string | null, endsAt?: string | null, now: Date = new Date()): string | null => {
    if (startsAt && endsAt) return `${formatShortDate(startsAt, now)} → ${formatShortDate(endsAt, now)}`;
    if (endsAt) return `hasta ${formatShortDate(endsAt, now)}`;
    if (startsAt) return `desde ${formatShortDate(startsAt, now)}`;
    return null;
};

/** Para la ficha pública: «Del 5 oct al 12 oct» · «Desde el 5 oct» · «Hasta el 12 oct». */
export const formatPublicDateRange = (startsAt?: string | null, endsAt?: string | null, now: Date = new Date()): string | null => {
    if (startsAt && endsAt) return `Del ${formatShortDate(startsAt, now)} al ${formatShortDate(endsAt, now)}`;
    if (endsAt) return `Hasta el ${formatShortDate(endsAt, now)}`;
    if (startsAt) return `Desde el ${formatShortDate(startsAt, now)}`;
    return null;
};

/**
 * «Hoy» tal y como lo calcula la ficha pública (usePlaceDetails, en UTC): así
 * el estado de una oferta coincide con lo que ve la gente.
 */
export const publicToday = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

// ── Ofertas ─────────────────────────────────────────────────────────────────

export type OfferDisplayStatus = 'live' | 'scheduled' | 'expired' | 'draft';

/** El estado guardado sigue siendo draft/active; esto es lo que de verdad se ve. */
export const computeOfferStatus = (
    offer: Pick<BusinessOfferData, 'status' | 'startsAt' | 'endsAt'>,
    today: string = publicToday(),
): OfferDisplayStatus => {
    if (offer.status !== 'active') return 'draft';
    if (offer.startsAt && offer.startsAt > today) return 'scheduled';
    if (offer.endsAt && offer.endsAt < today) return 'expired';
    return 'live';
};

export const OFFER_STATUS_META: Record<OfferDisplayStatus, StatusMeta> = {
    live: { emoji: '🟢', label: 'En vivo', tone: 'success' },
    scheduled: { emoji: '🗓️', label: 'Programada', tone: 'neutral' },
    expired: { emoji: '⌛', label: 'Caducada', tone: 'warning' },
    draft: { emoji: '📝', label: 'Borrador', tone: 'neutral' },
};

export interface OfferTemplate {
    key: string;
    emoji: string;
    label: string;
    /** Título que se rellena (con su emoji delante); vacío en «En blanco». */
    title: string;
}

export const OFFER_TEMPLATES: ReadonlyArray<OfferTemplate> = [
    { key: '2x1', emoji: '🍻', label: '2x1', title: '🍻 2x1 en cañas' },
    { key: 'descuento', emoji: '🏷️', label: 'Descuento', title: '🏷️ -20 % en la carta' },
    { key: 'happy-hour', emoji: '⏰', label: 'Happy hour', title: '⏰ Happy hour de 18 a 20 h' },
    { key: 'postre', emoji: '🍰', label: 'Postre gratis', title: '🍰 Postre gratis con el menú' },
    { key: 'invitacion', emoji: '🥂', label: 'Invitación', title: '🥂 Chupito de la casa' },
    { key: 'menu', emoji: '📋', label: 'Menú especial', title: '📋 Menú degustación' },
    { key: 'cumple', emoji: '🎂', label: 'Cumpleaños', title: '🎂 Tu cumple, la tarta la ponemos nosotros' },
    { key: 'familias', emoji: '👨‍👩‍👧', label: 'Familias', title: '👨‍👩‍👧 Menú infantil a 6 €' },
    { key: 'evento', emoji: '🎉', label: 'Evento', title: '🎉 Música en directo' },
    { key: 'blanco', emoji: '✏️', label: 'En blanco', title: '' },
];

/** Las tres que se ofrecen cuando aún no hay ninguna oferta. */
export const STARTER_TEMPLATE_KEYS: ReadonlyArray<string> = ['2x1', 'happy-hour', 'postre'];

export const offerTemplate = (key: string): OfferTemplate | undefined => OFFER_TEMPLATES.find((template) => template.key === key);

/** Emoji para el título de una oferta (además de los de las plantillas). */
export const OFFER_TITLE_EMOJI: ReadonlyArray<string> = [
    '🎟️', '🍻', '🏷️', '⏰', '🍰', '🥂', '📋', '🎂', '👨‍👩‍👧', '🎉',
    '🍕', '🍔', '🍷', '☕', '🍦', '🥘', '🍣', '🌮', '🎶', '🔥',
];

export const DEFAULT_OFFER_EMOJI = '🎟️';

// Un emoji (con variaciones, tonos y uniones ZWJ) al principio, seguido de espacio.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*️?)\s*(.*)$/su;

/** «🍻 2x1 en cañas» → { emoji: '🍻', text: '2x1 en cañas' }; sin emoji → { emoji: '', text }. */
export const splitLeadingEmoji = (value: string): { emoji: string; text: string } => {
    const trimmed = value.trim();
    const match = LEADING_EMOJI.exec(trimmed);
    return match ? { emoji: match[1], text: match[2].trim() } : { emoji: '', text: trimmed };
};

/** El emoji del principio del título, o 🎟️. */
export const offerEmoji = (title: string): string => splitLeadingEmoji(title).emoji || DEFAULT_OFFER_EMOJI;

/** Cambia (o pone) el emoji del principio de un texto, sin pasarse de `max`. */
export const withLeadingEmoji = (value: string, emoji: string, max: number = MAX_OFFER_TITLE): string => {
    const { text } = splitLeadingEmoji(value);
    return (text ? `${emoji} ${text}` : `${emoji} `).slice(0, max);
};

export interface ConditionChip {
    emoji: string;
    text: string;
}

export const CONDITION_CHIPS: ReadonlyArray<ConditionChip> = [
    { emoji: '🪑', text: 'Solo en sala' },
    { emoji: '🍺', text: 'Solo en barra' },
    { emoji: '🥡', text: 'Para llevar' },
    { emoji: '🚫', text: 'No acumulable' },
    { emoji: '📅', text: 'De lunes a jueves' },
    { emoji: '🌙', text: 'Solo cenas' },
    { emoji: '🕖', text: 'Hasta las 20:00' },
    { emoji: '👥', text: 'Mínimo 2 personas' },
    { emoji: '📞', text: 'Con reserva' },
    { emoji: '📱', text: 'Enseñando Listopic' },
];

export const CONDITION_SEPARATOR = ' · ';

const lower = (value: string) => value.toLocaleLowerCase('es');

/** ¿Está ya esa condición en el texto? (sin mayúsculas). */
export const hasCondition = (conditions: string, text: string): boolean => lower(conditions).includes(lower(text));

const tidyConditions = (value: string): string => value
    .replace(/\s*·\s*(?:·\s*)+/g, CONDITION_SEPARATOR)
    .replace(/^[\s·,;]+|[\s·,;]+$/g, '')
    .replace(/[ \t]{2,}/g, ' ');

/**
 * Pone o quita el texto de un chip en las condiciones (unidas con « · »).
 * Devuelve null si al ponerlo se pasaría de `max`.
 */
export const toggleCondition = (conditions: string, text: string, max: number = MAX_OFFER_CONDITIONS): string | null => {
    const index = lower(conditions).indexOf(lower(text));
    if (index >= 0) {
        return tidyConditions(conditions.slice(0, index) + CONDITION_SEPARATOR + conditions.slice(index + text.length));
    }
    const base = tidyConditions(conditions);
    const next = base ? `${base}${CONDITION_SEPARATOR}${text}` : text;
    return next.length > max ? null : next;
};

/** Ordena como la lista guardada (por título). */
export const sortOffers = <T extends { title: string }>(offers: T[]): T[] => (
    [...offers].sort((a, b) => a.title.localeCompare(b.title, 'es'))
);

/** ¿Es un enlace que el servidor guardará? (mismo criterio que sanitizeUrl). */
export const isValidOfferUrl = (value: string): boolean => {
    const raw = value.trim();
    if (!raw) return true;
    if (/\s/.test(raw)) return false;
    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
    } catch {
        return false;
    }
};

// ── Plato estrella e impulsos ───────────────────────────────────────────────

/** Radio dentro de los límites del precio y en tramos de 0,2 km. */
export const clampRadius = (pricing: Pick<SpotlightPricing, 'minRadiusKm' | 'maxRadiusKm'>, km: number): number => {
    const clamped = Math.max(pricing.minRadiusKm, Math.min(pricing.maxRadiusKm, Number.isFinite(km) ? km : pricing.minRadiusKm));
    return Number((Math.round(clamped / SPOTLIGHT_RADIUS_STEP_KM) * SPOTLIGHT_RADIUS_STEP_KM).toFixed(1));
};

export interface RadiusPreset {
    key: string;
    emoji: string;
    label: string;
    km: number;
}

const RADIUS_PRESET_BASE: ReadonlyArray<{ key: string; emoji: string; label: string; km: number | null }> = [
    { key: 'barrio', emoji: '🚶', label: 'Barrio', km: 0.6 },
    { key: 'zona', emoji: '🚲', label: 'Zona', km: 2 },
    { key: 'ciudad', emoji: '🚇', label: 'Ciudad', km: 5 },
    { key: 'area', emoji: '🚗', label: 'Área', km: 10 },
    { key: 'maximo', emoji: '🗺️', label: 'Máximo', km: null },
];

/** 🚶 Barrio 0,6 · 🚲 Zona 2 · 🚇 Ciudad 5 · 🚗 Área 10 · 🗺️ Máximo, ajustados al precio (sin repetidos). */
export const radiusPresetsFor = (pricing: Pick<SpotlightPricing, 'minRadiusKm' | 'maxRadiusKm'>): RadiusPreset[] => {
    const seen = new Set<number>();
    return RADIUS_PRESET_BASE.flatMap((preset) => {
        const km = clampRadius(pricing, preset.km ?? pricing.maxRadiusKm);
        if (seen.has(km)) return [];
        seen.add(km);
        return [{ key: preset.key, emoji: preset.emoji, label: preset.label, km }];
    });
};

/** Radio por defecto de los cálculos «≈ N días a 2 km». */
export const REFERENCE_RADIUS_KM = 2;

/** «≈ 25 min andando» · «≈ 20 min en bici» · «≈ 20 min en coche». */
export const reachLabel = (km: number): string => {
    const round5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);
    if (km <= 3) return `≈ ${round5(km * 12)} min andando`;
    if (km <= 8) return `≈ ${round5(km * 4)} min en bici`;
    return `≈ ${round5(km * 2)} min en coche`;
};

export const DURATION_PRESETS: ReadonlyArray<{ emoji: string; label: string; days: number }> = [
    { emoji: '☀️', label: '1 día', days: 1 },
    { emoji: '🎉', label: 'Finde', days: 3 },
    { emoji: '📆', label: '1 semana', days: 7 },
    { emoji: '🗓️', label: '2 semanas', days: 14 },
    { emoji: '🌙', label: '1 mes', days: 30 },
];

/** Días de plato estrella que da un saldo a un radio dado con ×1. */
export const daysAtRadius = (pricing: SpotlightPricing, impulses: number, km: number = REFERENCE_RADIUS_KM): number => {
    const perDay = computeSpotlightImpulses(pricing, { radiusKm: clampRadius(pricing, km), days: 1, intensity: 1 });
    return perDay > 0 ? Math.floor(Math.max(0, impulses) / perDay) : 0;
};

export const PACK_EMOJI: ReadonlyArray<string> = ['🪙', '💰', '💎', '🚀'];

export const packEmoji = (index: number): string => PACK_EMOJI[Math.min(index, PACK_EMOJI.length - 1)] || '🪙';

/** «Más elegido» para el segundo paquete y «Mejor precio» para el de más descuento. */
export const packRibbon = (pricing: SpotlightPricing, packs: ReadonlyArray<ImpulsePack>, index: number): string | null => {
    if (packs.length >= 3 && index === 1) return 'Más elegido';
    const discounts = packs.map((pack) => packDiscountPercent(pricing, pack));
    const best = Math.max(...discounts);
    if (best > 0 && discounts.indexOf(best) === index && index !== 1) return 'Mejor precio';
    return null;
};

// ── Campañas (📈 Resultados) ────────────────────────────────────────────────

export const CAMPAIGN_STATUS_META: Record<SponsoredPlacementStatus, StatusMeta> = {
    requested: { emoji: '⏳', label: 'En revisión', tone: 'warning' },
    active: { emoji: '🟢', label: 'En marcha', tone: 'success' },
    ended: { emoji: '✅', label: 'Terminada', tone: 'neutral' },
    rejected: { emoji: '❌', label: 'Rechazada', tone: 'danger' },
};

export type CampaignFilter = 'all' | SponsoredPlacementStatus;

export const CAMPAIGN_FILTERS: ReadonlyArray<{ value: CampaignFilter; emoji?: string; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'requested', emoji: '⏳', label: 'En revisión' },
    { value: 'active', emoji: '🟢', label: 'En marcha' },
    { value: 'ended', emoji: '✅', label: 'Terminadas' },
    { value: 'rejected', emoji: '❌', label: 'Rechazadas' },
];

export const PLACEMENT_TYPE_META: Record<SponsoredPlacement['type'], { emoji: string; label: string }> = {
    home: { emoji: '🏠', label: 'Portada' },
    search: { emoji: '🗺️', label: 'Mapa' },
};

export type CampaignRow =
    | { kind: 'placement'; id: string; status: SponsoredPlacementStatus; createdAtMs: number; placement: SponsoredPlacement }
    | { kind: 'spotlight'; id: string; status: SponsoredPlacementStatus; createdAtMs: number; spotlight: ItemSpotlight };

/** Portada, mapa y platos estrella juntos, los más recientes primero. */
export const mergeCampaigns = (placements: SponsoredPlacement[], spotlights: ItemSpotlight[]): CampaignRow[] => [
    ...placements.map((placement): CampaignRow => ({
        kind: 'placement', id: placement.id, status: placement.status, createdAtMs: placement.createdAtMs, placement,
    })),
    ...spotlights.map((spotlight): CampaignRow => ({
        kind: 'spotlight', id: spotlight.id, status: spotlight.status, createdAtMs: spotlight.createdAtMs, spotlight,
    })),
].sort((a, b) => b.createdAtMs - a.createdAtMs);

/** Cuánto lleva una campaña con fechas (0-100), o null si no tiene las dos. */
export const campaignProgress = (startsAt: string | undefined, endsAt: string | undefined, today: string): number | null => {
    const start = parseIsoDate(startsAt);
    const end = parseIsoDate(endsAt);
    const now = parseIsoDate(today);
    if (!start || !end || !now) return null;
    const toDay = (date: { y: number; m: number; d: number }) => Date.UTC(date.y, date.m - 1, date.d) / 86_400_000;
    const total = toDay(end) - toDay(start) + 1;
    if (total <= 0) return null;
    const elapsed = toDay(now) - toDay(start) + 1;
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
};

/**
 * El plato de una campaña abierta salió de la carta sin fusión (el servidor la
 * marca itemInactive): no se sirve hasta que el equipo la revise.
 */
export const SPOTLIGHT_ITEM_INACTIVE_NOTICE = 'Este plato ya no está en tu carta: la campaña está en pausa hasta que el equipo la revise.';

export const isSpotlightPaused = (spotlight: Pick<ItemSpotlight, 'itemInactive' | 'status'>): boolean => (
    spotlight.itemInactive && (spotlight.status === 'requested' || spotlight.status === 'active')
);

/** Días de una campaña de plato (las antiguas iban por semanas). */
export const spotlightDays = (spotlight: Pick<ItemSpotlight, 'days' | 'weeks'>): number | null => (
    spotlight.days ?? (spotlight.weeks ? spotlight.weeks * 7 : null)
);

/** Plural sencillo: plural(1, 'oferta') → '1 oferta'; plural(3, 'oferta') → '3 ofertas'. */
export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string => (
    `${formatCount(count)} ${count === 1 ? singular : pluralForm}`
);

// ── Portada y mapa ──────────────────────────────────────────────────────────

export const HEADLINE_IDEAS: ReadonlyArray<{ emoji: string; text: string }> = [
    { emoji: '🍂', text: 'Nueva carta de temporada' },
    { emoji: '🎉', text: '¡Reabrimos!' },
    { emoji: '☀️', text: 'Terraza abierta' },
    { emoji: '🎶', text: 'Música en directo' },
    { emoji: '👨‍🍳', text: 'Nuevo chef' },
    { emoji: '🥘', text: 'Plato del mes' },
];

// ── Formularios ─────────────────────────────────────────────────────────────

/** Los campos guardables de una oferta (sin el id). */
export const offerData = (offer: BusinessOfferData): BusinessOfferData => ({
    title: offer.title,
    description: offer.description,
    conditions: offer.conditions,
    ctaUrl: offer.ctaUrl,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    status: offer.status,
});

/** Lo que se envía al guardar: textos recortados como en el servidor. */
export const cleanOfferData = (offer: BusinessOfferData): BusinessOfferData => ({
    title: offer.title.trim().slice(0, MAX_OFFER_TITLE),
    description: offer.description.trim().slice(0, MAX_OFFER_DESCRIPTION),
    conditions: tidyConditions(offer.conditions).slice(0, MAX_OFFER_CONDITIONS),
    ctaUrl: offer.ctaUrl.trim().slice(0, MAX_OFFER_URL),
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    status: offer.status === 'active' ? 'active' : 'draft',
});

/** Campaña de plato estrella que se está preparando (y el paso del asistente). */
export interface SpotlightPlan {
    step: 1 | 2 | 3;
    itemId: string;
    radiusKm: number;
    days: number;
    intensity: number;
}

export const DEFAULT_SPOTLIGHT_PLAN: SpotlightPlan = { step: 1, itemId: '', radiusKm: REFERENCE_RADIUS_KM, days: 7, intensity: 1 };

/** El plan dentro de los límites del precio actual. */
export const clampPlan = (pricing: SpotlightPricing, plan: SpotlightPlan): SpotlightPlan => ({
    ...plan,
    radiusKm: clampRadius(pricing, plan.radiusKm),
    days: Math.max(1, Math.min(pricing.maxDays, Math.floor(plan.days) || 1)),
    intensity: Math.max(1, Math.min(pricing.maxIntensity, Math.floor(plan.intensity) || 1)),
});

/** Campaña de 🗺️ Portada y mapa que se está preparando. */
export interface PlacementDraft {
    type: SponsoredPlacement['type'];
    headline: string;
    startsAt: string;
    endsAt: string;
}

export const EMPTY_PLACEMENT_DRAFT: PlacementDraft = { type: 'home', headline: '', startsAt: '', endsAt: '' };
