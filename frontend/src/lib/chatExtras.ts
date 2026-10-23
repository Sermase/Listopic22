/**
 * Chat «con vida»: reacciones, respuestas, quedadas (invitaciones a comer),
 * encuestas «¿Dónde comemos?» y el duelo de notas de la mesa. Aquí solo hay
 * lógica pura (sin Firebase) para poder probarla.
 */

export const QUICK_REACTIONS = ['😋', '🔥', '😂', '❤️', '👍', '🤢'] as const;
/** Doble toque en un mensaje. */
export const DOUBLE_TAP_REACTION = '😋';

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

/** yes = voy · maybe = en duda · other = en duda y propone otra fecha · no = no voy. */
export type InviteStatus = 'yes' | 'maybe' | 'other' | 'no';

export interface InviteResponse {
    status: InviteStatus;
    /** Fecha propuesta (ms) cuando status = 'other'. */
    proposedAt?: number;
    at: number;
}

/** Un sitio y, si hay, un plato concreto. */
export interface PlaceRef {
    placeName: string;
    itemName?: string;
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

/** Plato de un sitio (sale del índice de elementos agrupados). */
export interface DishRef extends PlaceRef {
    itemName: string;
}

export interface ChatInvite extends PlaceRef {
    /** Fecha y hora (ms). */
    when: number;
    note?: string;
    responses?: Record<string, InviteResponse>;
    cancelled?: boolean;
}

export interface PollOption extends DishRef {
    id: string;
}

export interface ChatPoll {
    question: string;
    options: PollOption[];
    votes?: Record<string, string>;
}

/** Aviso en gris dentro del chat: lo que le pasa a una quedada o al grupo. */
export type ChatEventKind = 'yes' | 'maybe' | 'other' | 'no' | 'date' | 'cancel' | 'added';

export interface ChatEventNote {
    kind: ChatEventKind;
    /** Id del mensaje de la quedada. */
    inviteId?: string;
    title?: string;
    when?: number;
    /** Para «added»: a quién se añadió. */
    targetId?: string;
}

/** Resumen de una quedada guardado en el chat para fijarla arriba. */
export interface PinnedEvent {
    title: string;
    when: number;
    placeName?: string;
    imageUrl?: string;
    cancelled?: boolean;
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
const DAY_MS = 86_400_000;

export const formatTime = (ms: number) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** «sáb 25 oct · 14:00» */
export function formatWhen(ms: number): string {
    const day = new Date(ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
    return `${day} · ${formatTime(ms)}`;
}

/** «Sábado 25 de octubre» */
export function formatLongDay(ms: number): string {
    const text = new Date(ms).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

const dayDiff = (ms: number, now: number) => Math.round((startOfDay(ms) - startOfDay(now)) / DAY_MS);

/** Separadores del chat: «Hoy», «Ayer», «Lunes», «20 oct» o «20 oct 2025». */
export function chatDayLabel(ms: number, now: number = Date.now()): string {
    const diff = dayDiff(ms, now);
    if (diff === 0) return 'Hoy';
    if (diff === -1) return 'Ayer';
    const d = new Date(ms);
    if (diff > -7 && diff < 0) {
        const name = d.toLocaleDateString('es-ES', { weekday: 'long' });
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return d.toLocaleDateString('es-ES', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
}

/** «Hoy», «Mañana», «En 3 días», «Ya pasó». */
export function countdownLabel(when: number, now: number = Date.now()): string {
    if (inviteIsPast({ when }, now)) return 'Ya pasó';
    if (when <= now) return '¡Ahora!';
    const diff = dayDiff(when, now);
    if (diff === 0) {
        const hours = Math.round((when - now) / 3_600_000);
        return hours <= 1 ? 'En un rato' : `Hoy, en ${hours} h`;
    }
    if (diff === 1) return 'Mañana';
    return `En ${diff} días`;
}

/** Semanas del mes (lunes primero) para el calendario; null = hueco. */
export function monthMatrix(year: number, month: number): Array<Array<number | null>> {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const weeks: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

/** Horas de comida y cena para elegir de un toque. */
export const MEAL_TIMES = ['13:00', '13:30', '14:00', '14:30', '15:00', '20:30', '21:00', '21:30', '22:00'];

/** Junta un día (ms de cualquier hora) con «HH:MM». */
export function atTime(dayMs: number, time: string): number {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(dayMs);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.getTime();
}

/** La quedada ya pasó (2 h de margen para comer tranquilos). */
export const QUEDADA_MS = 2 * 60 * 60 * 1000;
export const inviteIsPast = (invite: Pick<ChatInvite, 'when'>, now: number = Date.now()) =>
    now > invite.when + QUEDADA_MS;

// ── Enlaces ─────────────────────────────────────────────────────────────

export const dishRoute = (ref: PlaceRef) =>
    ref.placeId && ref.itemName ? `/group/${ref.placeId}/${encodeURIComponent(ref.itemName)}` : null;

export const placeRoute = (ref: PlaceRef) => (ref.placeId ? `/place/${ref.placeId}` : null);

export function mapsUrl(ref: PlaceRef): string {
    if (ref.googleMapsUrl) return ref.googleMapsUrl;
    const q = encodeURIComponent([ref.placeName, ref.placeCity].filter(Boolean).join(' '));
    const placeParam = ref.placeId && ref.placeId.startsWith('ChIJ') ? `&query_place_id=${ref.placeId}` : '';
    return `https://www.google.com/maps/search/?api=1&query=${q}${placeParam}`;
}

export function reviewRoute(ref: PlaceRef): string {
    const params = new URLSearchParams();
    if (ref.listId) params.set('listId', ref.listId);
    if (ref.placeId) params.set('placeId', ref.placeId);
    if (ref.itemName) params.set('itemName', ref.itemName);
    return `/create-review?${params.toString()}`;
}

const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** «Bravas en Docamar» o, sin plato, «Docamar». */
export function inviteTitle(ref: PlaceRef): string {
    return ref.itemName ? `${ref.itemName} en ${ref.placeName}` : ref.placeName;
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

// ── Quedada ─────────────────────────────────────────────────────────────

/** Quién va: quien invita y quien dijo «Voy». */
export function inviteAttendees(invite: ChatInvite, senderId: string): string[] {
    const yes = Object.entries(invite.responses || {})
        .filter(([uid, r]) => uid !== senderId && r?.status === 'yes')
        .map(([uid]) => uid);
    return [senderId, ...yes];
}

export interface InviteGroups {
    going: string[];
    maybe: Array<{ uid: string; proposedAt?: number }>;
    no: string[];
    pending: string[];
}

/** Van / dudas / no van / sin responder (quien invita, siempre va). */
export function groupResponses(invite: ChatInvite, senderId: string, participants: string[] = []): InviteGroups {
    const responses = invite.responses || {};
    const groups: InviteGroups = { going: [senderId], maybe: [], no: [], pending: [] };
    Object.entries(responses)
        .filter(([uid]) => uid !== senderId)
        .sort(([, a], [, b]) => (a?.at || 0) - (b?.at || 0))
        .forEach(([uid, r]) => {
            if (r?.status === 'yes') groups.going.push(uid);
            else if (r?.status === 'no') groups.no.push(uid);
            else if (r?.status === 'maybe' || r?.status === 'other') {
                groups.maybe.push(r.status === 'other' && typeof r.proposedAt === 'number' && r.proposedAt !== invite.when
                    ? { uid, proposedAt: r.proposedAt }
                    : { uid });
            }
        });
    groups.pending = participants.filter((uid) => uid !== senderId && !(uid in responses));
    return groups;
}

/** Propuestas de otra fecha pendientes (la más reciente primero). */
export function pendingProposals(invite: ChatInvite): Array<{ uid: string; proposedAt: number }> {
    return Object.entries(invite.responses || {})
        .filter(([, r]) => r?.status === 'other' && typeof r.proposedAt === 'number' && r.proposedAt !== invite.when)
        .map(([uid, r]) => ({ uid, proposedAt: r.proposedAt as number, at: r.at }))
        .sort((a, b) => b.at - a.at)
        .map(({ uid, proposedAt }) => ({ uid, proposedAt }));
}

export function invitePreviewText(ref: PlaceRef): string {
    return ref.itemName ? `🍽️ Te invito a comer ${inviteTitle(ref)}` : `🍽️ Te invito a comer en ${ref.placeName}`;
}

export function pinnedFromInvite(invite: ChatInvite): PinnedEvent {
    return compact({
        title: inviteTitle(invite),
        when: invite.when,
        placeName: invite.placeName,
        imageUrl: invite.imageUrl,
        cancelled: invite.cancelled || undefined,
    });
}

/**
 * Quedadas que aún no han pasado, por fecha. Junta lo guardado en el chat
 * (`events`) con las invitaciones cargadas (las antiguas no estaban guardadas).
 */
export function upcomingEvents(
    stored: Record<string, PinnedEvent> | undefined | null,
    loaded: Array<{ id: string; invite: ChatInvite }>,
    now: number = Date.now(),
): Array<{ id: string } & PinnedEvent> {
    const byId = new Map<string, PinnedEvent>();
    Object.entries(stored || {}).forEach(([id, e]) => {
        if (e && typeof e.when === 'number') byId.set(id, e);
    });
    loaded.forEach(({ id, invite }) => byId.set(id, pinnedFromInvite(invite)));
    return Array.from(byId.entries())
        .map(([id, e]) => ({ id, ...e }))
        .filter((e) => !e.cancelled && !inviteIsPast(e, now))
        .sort((a, b) => a.when - b.when);
}

/** Texto del aviso en gris. `who` ya viene resuelto («Ana» o «Tú»). */
export function eventNoteText(note: ChatEventNote, who: string, target?: string): string {
    const me = who === 'Tú';
    const title = note.title ? ` a ${note.title}` : '';
    switch (note.kind) {
        case 'yes': return `✅ ${who} ${me ? 'vas' : 'va'}${title}`;
        case 'maybe': return `🤔 ${who} ${me ? 'estás' : 'está'} en duda`;
        case 'other': return `🗓️ ${who} ${me ? 'propones' : 'propone'} ${note.when ? formatWhen(note.when) : 'otro día'}`;
        case 'no': return `❌ ${who} no ${me ? 'puedes' : 'puede'} ir`;
        case 'date': return `📅 ${who} ${me ? 'has cambiado' : 'ha cambiado'} la fecha${note.when ? `: ${formatWhen(note.when)}` : ''}`;
        case 'cancel': return `🚫 ${who} ${me ? 'has cancelado' : 'ha cancelado'} la quedada${note.title ? ` (${note.title})` : ''}`;
        case 'added': return `👋 ${who} ${me ? 'has añadido' : 'ha añadido'} a ${target || 'alguien'}`;
        default: return who;
    }
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

// ── Platos del sitio y duelo de notas ───────────────────────────────────

const fold = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const sameItemName = (a: unknown, b: unknown) => fold(a) === fold(b) && fold(a) !== '';

export interface PlaceReviewLike {
    userId?: string;
    itemName?: string;
    overallRating?: number;
    photoUrl?: string;
    listId?: string;
    scores?: Record<string, unknown>;
    createdAt?: unknown;
}

export interface PlaceDishSummary {
    itemName: string;
    avg: number;
    count: number;
    photoUrl?: string;
    listId?: string;
}

/** Platos de un sitio con su media (de sus reseñas públicas), mejor nota primero. */
export function summarizePlaceDishes(reviews: PlaceReviewLike[]): PlaceDishSummary[] {
    type Acc = { name: string; sum: number; count: number; photoUrl?: string; lists: Map<string, number> };
    const byKey = new Map<string, Acc>();
    reviews.forEach((r) => {
        const key = fold(r.itemName);
        if (!key || typeof r.overallRating !== 'number' || !Number.isFinite(r.overallRating)) return;
        const entry: Acc = byKey.get(key) || { name: String(r.itemName).trim(), sum: 0, count: 0, lists: new Map() };
        entry.sum += r.overallRating;
        entry.count += 1;
        if (!entry.photoUrl && r.photoUrl) entry.photoUrl = r.photoUrl;
        if (r.listId) entry.lists.set(r.listId, (entry.lists.get(r.listId) || 0) + 1);
        byKey.set(key, entry);
    });
    return Array.from(byKey.values())
        .map((e) => ({
            itemName: e.name,
            avg: Math.round((e.sum / e.count) * 10) / 10,
            count: e.count,
            photoUrl: e.photoUrl,
            listId: Array.from(e.lists.entries()).sort((a, b) => b[1] - a[1])[0]?.[0],
        }))
        .sort((a, b) => b.avg - a.avg || b.count - a.count);
}

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

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Filas criterio × comensal; la última es la nota final. */
export function buildDuelRows(
    criteria: Array<[string, DuelCriterion]>,
    reviews: DuelReview[],
): DuelRow[] {
    const rows: DuelRow[] = criteria.map(([id, def]) => {
        const values = reviews.map((r) => numOrNull(r.scores?.[id]));
        const informative = def.isPonderable === false || def.weight === 0;
        return { id, label: def.label || id, informative, values, best: informative ? [] : bestOf(values) };
    }).filter((row) => row.values.some((v) => v !== null));
    const overall = reviews.map((r) => numOrNull(r.overallRating));
    rows.push({ id: '__overall', label: 'Nota final', informative: false, values: overall, best: bestOf(overall) });
    return rows;
}

const createdMs = (value: unknown): number => {
    const v = value as { toMillis?: () => number; seconds?: number } | null;
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (v && typeof v.seconds === 'number') return v.seconds * 1000;
    return 0;
};

/** La última reseña de cada comensal (de un plato o de todo el sitio). */
export function latestByUser<T extends PlaceReviewLike>(reviews: T[], users: string[], itemName?: string): Map<string, T> {
    const latest = new Map<string, T>();
    reviews.forEach((r) => {
        if (!r.userId || !users.includes(r.userId)) return;
        if (itemName && !sameItemName(r.itemName, itemName)) return;
        const key = itemName ? r.userId : `${r.userId}__${fold(r.itemName)}`;
        const prev = latest.get(key);
        if (prev && createdMs(prev.createdAt) >= createdMs(r.createdAt)) return;
        latest.set(key, r);
    });
    return latest;
}

/** Duelo de un sitio sin plato fijo: filas = platos, columnas = comensales. */
export function buildPlaceDuelRows(reviews: PlaceReviewLike[], users: string[]): DuelRow[] {
    const latest = latestByUser(reviews, users);
    const dishes = new Map<string, string>();
    latest.forEach((r) => {
        if (!dishes.has(fold(r.itemName))) dishes.set(fold(r.itemName), String(r.itemName).trim());
    });
    return Array.from(dishes.entries()).map(([key, label]) => {
        const values = users.map((u) => numOrNull(latest.get(`${u}__${key}`)?.overallRating));
        return { id: key, label, informative: false, values, best: bestOf(values) };
    }).filter((row) => row.values.some((v) => v !== null));
}
