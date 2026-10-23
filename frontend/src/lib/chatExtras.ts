/**
 * Chat «con vida»: reacciones, respuestas, invitaciones a comer, encuestas
 * «¿Dónde comemos?» y el duelo de notas de la mesa. Aquí solo hay lógica pura
 * (sin Firebase) para poder probarla.
 */

export const QUICK_REACTIONS = ['😋', '🔥', '😂', '❤️', '👍', '🤢'] as const;

export const EMOJI_GROUPS: ReadonlyArray<{ label: string; emojis: string[] }> = [
    { label: 'Comida', emojis: ['🍕', '🍔', '🍟', '🌮', '🌯', '🥙', '🍣', '🍜', '🍝', '🥘', '🍳', '🥗', '🍤', '🥩', '🍗', '🧀', '🥐', '🍰', '🍩', '🍦', '🍫', '🍺', '🍷', '☕'] },
    { label: 'Caras', emojis: ['😋', '🤤', '😍', '🥰', '😂', '🤣', '😅', '😎', '🤩', '😱', '🥺', '😴', '🤢', '🤮', '🙄', '😏', '🤔', '🫠', '🥳', '😇'] },
    { label: 'Gestos', emojis: ['👍', '👎', '👌', '🙌', '👏', '🤝', '🙏', '💪', '🤌', '✌️', '🔥', '❤️', '💯', '✨', '⭐', '🎉', '📍', '📅', '⏰', '🍽️'] },
];

export type ReactionMap = Record<string, string>;

export interface ReplyRef {
    id: string;
    senderId: string;
    text: string;
}

export type InviteStatus = 'yes' | 'no' | 'other';

export interface InviteResponse {
    status: InviteStatus;
    /** Fecha propuesta (ms) cuando status = 'other'. */
    proposedAt?: number;
    at: number;
}

/** Plato de un sitio (sale del índice de elementos agrupados). */
export interface DishRef {
    itemName: string;
    placeName: string;
    placeId?: string;
    placeCity?: string;
    listId?: string;
    listName?: string;
    imageUrl?: string;
    score?: number;
    googleMapsUrl?: string;
    lat?: number;
    lng?: number;
}

export interface ChatInvite extends DishRef {
    /** Fecha y hora (ms). */
    when: number;
    note?: string;
    responses?: Record<string, InviteResponse>;
}

export interface PollOption extends DishRef {
    id: string;
}

export interface ChatPoll {
    question: string;
    options: PollOption[];
    votes?: Record<string, string>;
}

/** Hit del índice `grouped_items` → plato. */
export function dishFromHit(hit: Record<string, unknown>): DishRef | null {
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const itemName = str(hit.itemName);
    const placeName = str(hit.placeName) || str(hit.establishmentName);
    if (!itemName || !placeName) return null;
    const geo = (hit._geoloc && typeof hit._geoloc === 'object' ? hit._geoloc : {}) as Record<string, unknown>;
    const score = num(hit.avgGeneralScore);
    return compact({
        itemName,
        placeName,
        placeId: str(hit.placeId),
        placeCity: str(hit.placeCity),
        listId: str(hit.listId),
        listName: str(hit.listName),
        imageUrl: str(hit.thumbnailUrl),
        score: score && score > 0 ? score : undefined,
        googleMapsUrl: str(hit.googleMapsUrl),
        lat: num(geo.lat),
        lng: num(geo.lng),
    });
}

/** Firestore no admite `undefined`: fuera las claves vacías. */
export function compact<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

// ── Emojis ──────────────────────────────────────────────────────────────

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u;

/** «🍕» o «😋🔥» se pintan en grande (hasta 3 emojis, sin texto). */
export function isEmojiOnly(text: string | undefined | null): boolean {
    const trimmed = (text || '').trim();
    if (!trimmed || !EMOJI_ONLY.test(trimmed) || /^[\d#*\s]+$/.test(trimmed)) return false;
    const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
    const count = Segmenter
        ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed.replace(/\s+/g, ''))).length
        : Array.from(trimmed.replace(/\s+/g, '')).length;
    return count <= 3;
}

export interface ReactionSummary {
    emoji: string;
    count: number;
    mine: boolean;
}

export function summarizeReactions(reactions: ReactionMap | undefined | null, uid?: string | null): ReactionSummary[] {
    if (!reactions || typeof reactions !== 'object') return [];
    const byEmoji = new Map<string, ReactionSummary>();
    Object.entries(reactions).forEach(([who, emoji]) => {
        if (typeof emoji !== 'string' || !emoji) return;
        const entry = byEmoji.get(emoji) || { emoji, count: 0, mine: false };
        entry.count += 1;
        if (who === uid) entry.mine = true;
        byEmoji.set(emoji, entry);
    });
    return Array.from(byEmoji.values()).sort((a, b) => b.count - a.count);
}

// ── Fechas ──────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** «sáb 25 oct · 14:00» */
export function formatWhen(ms: number): string {
    const d = new Date(ms);
    const day = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
    return `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toDatetimeLocal(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): number | null {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
}

const at = (base: Date, addDays: number, hour: number, minute = 0) => {
    const d = new Date(base);
    d.setDate(d.getDate() + addDays);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
};

/** Atajos de fecha: hoy a cenar, mañana a comer o cenar y el sábado a comer. */
export function quickWhenOptions(now: number = Date.now()): Array<{ label: string; ms: number }> {
    const base = new Date(now);
    const options: Array<{ label: string; ms: number }> = [];
    if (base.getHours() < 20) options.push({ label: 'Hoy 21:00', ms: at(base, 0, 21) });
    options.push({ label: 'Mañana 14:00', ms: at(base, 1, 14) });
    options.push({ label: 'Mañana 21:00', ms: at(base, 1, 21) });
    const toSaturday = (6 - base.getDay() + 7) % 7 || 7;
    if (toSaturday > 1) options.push({ label: 'Sábado 14:00', ms: at(base, toSaturday, 14) });
    return options;
}

/** La quedada ya pasó (2 h de margen para comer tranquilos). */
export const QUEDADA_MS = 2 * 60 * 60 * 1000;
export const inviteIsPast = (invite: Pick<ChatInvite, 'when'>, now: number = Date.now()) =>
    now > invite.when + QUEDADA_MS;

// ── Enlaces ─────────────────────────────────────────────────────────────

export const dishRoute = (dish: DishRef) =>
    dish.placeId ? `/group/${dish.placeId}/${encodeURIComponent(dish.itemName)}` : null;

export const placeRoute = (dish: DishRef) => (dish.placeId ? `/place/${dish.placeId}` : null);

export function mapsUrl(dish: DishRef): string {
    if (dish.googleMapsUrl) return dish.googleMapsUrl;
    const q = encodeURIComponent([dish.placeName, dish.placeCity].filter(Boolean).join(' '));
    const placeParam = dish.placeId && dish.placeId.startsWith('ChIJ') ? `&query_place_id=${dish.placeId}` : '';
    return `https://www.google.com/maps/search/?api=1&query=${q}${placeParam}`;
}

export function reviewRoute(dish: DishRef): string {
    const params = new URLSearchParams();
    if (dish.listId) params.set('listId', dish.listId);
    if (dish.placeId) params.set('placeId', dish.placeId);
    params.set('itemName', dish.itemName);
    return `/create-review?${params.toString()}`;
}

const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function inviteTitle(invite: DishRef): string {
    return `${invite.itemName} en ${invite.placeName}`;
}

export function googleCalendarUrl(invite: ChatInvite): string {
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `🍽️ ${inviteTitle(invite)}`,
        dates: `${icsDate(invite.when)}/${icsDate(invite.when + QUEDADA_MS)}`,
        details: [invite.note, 'Quedada de Listopic'].filter(Boolean).join('\n'),
        location: [invite.placeName, invite.placeCity].filter(Boolean).join(', '),
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(invite: ChatInvite, uid: string): string {
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Listopic//Quedadas//ES',
        'BEGIN:VEVENT',
        `UID:${uid}@listopic.es`,
        `DTSTAMP:${icsDate(Date.now())}`,
        `DTSTART:${icsDate(invite.when)}`,
        `DTEND:${icsDate(invite.when + QUEDADA_MS)}`,
        `SUMMARY:${icsText(`🍽️ ${inviteTitle(invite)}`)}`,
        `LOCATION:${icsText([invite.placeName, invite.placeCity].filter(Boolean).join(', '))}`,
        invite.note ? `DESCRIPTION:${icsText(invite.note)}` : '',
        'END:VEVENT',
        'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
}

// ── Invitación ──────────────────────────────────────────────────────────

/** Quién va: quien invita y quien dijo «Voy». */
export function inviteAttendees(invite: ChatInvite, senderId: string): string[] {
    const yes = Object.entries(invite.responses || {})
        .filter(([uid, r]) => uid !== senderId && r?.status === 'yes')
        .map(([uid]) => uid);
    return [senderId, ...yes];
}

/** Propuestas de otra fecha pendientes (la más reciente primero). */
export function pendingProposals(invite: ChatInvite): Array<{ uid: string; proposedAt: number }> {
    return Object.entries(invite.responses || {})
        .filter(([, r]) => r?.status === 'other' && typeof r.proposedAt === 'number' && r.proposedAt !== invite.when)
        .map(([uid, r]) => ({ uid, proposedAt: r.proposedAt as number, at: r.at }))
        .sort((a, b) => b.at - a.at)
        .map(({ uid, proposedAt }) => ({ uid, proposedAt }));
}

// ── Encuesta ────────────────────────────────────────────────────────────

export function pollTally(poll: ChatPoll): { counts: Record<string, number>; total: number; winnerId: string | null } {
    const counts: Record<string, number> = Object.fromEntries(poll.options.map((o) => [o.id, 0]));
    Object.values(poll.votes || {}).forEach((optionId) => {
        if (optionId in counts) counts[optionId] += 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    let winnerId: string | null = null;
    let best = 0;
    poll.options.forEach((o) => {
        if (counts[o.id] > best) {
            best = counts[o.id];
            winnerId = o.id;
        } else if (counts[o.id] === best && best > 0) {
            winnerId = null;
        }
    });
    return { counts, total, winnerId };
}

// ── Duelo de notas ──────────────────────────────────────────────────────

export interface DuelCriterion {
    label?: string;
    order?: number;
    isPonderable?: boolean;
    weight?: number;
}

export interface DuelReview {
    userId: string;
    overallRating?: number;
    scores?: Record<string, unknown>;
}

export interface DuelRow {
    id: string;
    label: string;
    informative: boolean;
    values: Array<number | null>;
    /** Índices de las columnas con la nota más alta (si hay al menos dos notas). */
    best: number[];
}

const bestOf = (values: Array<number | null>) => {
    const present = values.filter((v): v is number => typeof v === 'number');
    if (present.length < 2) return [];
    const max = Math.max(...present);
    return values.flatMap((v, i) => (v === max ? [i] : []));
};

/** Filas criterio × comensal; la última es la nota final. */
export function buildDuelRows(
    criteria: Array<[string, DuelCriterion]>,
    reviews: DuelReview[],
): DuelRow[] {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const rows: DuelRow[] = criteria.map(([id, def]) => {
        const values = reviews.map((r) => num(r.scores?.[id]));
        const informative = def.isPonderable === false || def.weight === 0;
        return { id, label: def.label || id, informative, values, best: informative ? [] : bestOf(values) };
    }).filter((row) => row.values.some((v) => v !== null));
    const overall = reviews.map((r) => num(r.overallRating));
    rows.push({ id: '__overall', label: 'Nota final', informative: false, values: overall, best: bestOf(overall) });
    return rows;
}

/** Texto de la burbuja (vista previa y notificación). */
export function invitePreviewText(invite: DishRef): string {
    return `🍽️ Te invito a comer ${inviteTitle(invite)}`;
}
