/**
 * Modo concurso de una Minilista: el dueño pone los aspirantes (sitio + plato) y,
 * si la cierra, solo se valoran ellos y solo entre sus fechas.
 * Las reglas de Firestore (reviewContestOk) comprueban lo mismo con `candidateKeys`.
 */
import { normalizeItemName } from './listElements';
import { buildAreaOptions, geoAreaLabel, geoValue, matchesArea, type GeoFields, type GeoLevel } from './geoAreas';

export interface ContestCandidate {
    key: string;
    placeId: string;
    placeName: string;
    placeAddress?: string;
    itemName: string;
    /** Foto opcional del plato (list-images/{lista}/…). */
    photoUrl?: string;
    /** Coordenadas del sitio, para el mapa aunque nadie lo haya valorado. */
    lat?: number;
    lng?: number;
    /** Zona del sitio, para los filtros de ciudad/provincia del mapa. */
    city?: string;
    province?: string;
    region?: string;
    country?: string;
    /** Lo que declara quien lo apunta (mismos ids que «Apto para»). */
    diet?: ContestDiet[];
    /** Descripción corta del plato. */
    description?: string;
}

/** Detalles que se pueden declarar de un aspirante (mismos ids que aptOk / «Mis preferencias»). */
export const CONTEST_DIETS = [
    { id: 'glutenFree', label: 'Sin gluten', emoji: '🚫🌾' },
    { id: 'lactoseFree', label: 'Sin lactosa', emoji: '🚫🥛' },
    { id: 'vegetarian', label: 'Vegetariano', emoji: '🥦' },
    { id: 'vegan', label: 'Vegano', emoji: '🌱' },
] as const;
export type ContestDiet = (typeof CONTEST_DIETS)[number]['id'];
export const MAX_CANDIDATE_DESCRIPTION = 240;

/** Ids válidos, en el orden de CONTEST_DIETS (tolera basura). */
export function cleanDiet(value: unknown): ContestDiet[] {
    if (!Array.isArray(value)) return [];
    return CONTEST_DIETS.map((d) => d.id).filter((id) => value.includes(id));
}

/** «🚫🌾 Sin gluten», … para pintar como chapas. */
export const dietBadges = (value: unknown): string[] =>
    cleanDiet(value).map((id) => {
        const d = CONTEST_DIETS.find((x) => x.id === id)!;
        return `${d.emoji} ${d.label}`;
    });

export interface ContestSettings {
    closed?: boolean;
    startsAt?: { toMillis(): number } | null;
    endsAt?: { toMillis(): number } | null;
    /** Los platos siguen en la carta al acabar (si no, pasan a «ya no lo sirven»). */
    keepAvailable?: boolean;
    /** Lo pone el servidor al marcar los platos como no disponibles. */
    closedOutAt?: unknown;
}

export interface ContestListLike {
    parentListId?: unknown;
    contest?: ContestSettings | null;
    candidates?: ContestCandidate[] | null;
    candidateKeys?: string[] | null;
    official?: boolean;
    featureRequest?: ContestFeatureRequest | null;
}

/**
 * Destacar un concurso en Inicio: lo pide el dueño para una zona y lo acepta un jefe
 * (Developer → Mantenimiento → Concursos). No es patrocinado: es «Concurso destacado».
 */
export type FeatureStatus = 'pending' | 'approved' | 'rejected';
export interface ContestFeatureRequest {
    level: GeoLevel;
    value: string;
    status: FeatureStatus;
    requestedAt?: unknown;
    decidedAt?: unknown;
}

export const featureScopeLabel = (req: Pick<ContestFeatureRequest, 'level' | 'value'>): string =>
    geoAreaLabel(req.level, req.value);

/** Zonas que puede pedir el dueño, sacadas de sus aspirantes; la primera es la recomendada (provincia más repetida). */
export function featureScopeOptions(candidates: ReadonlyArray<GeoFields>): { level: GeoLevel; value: string; label: string }[] {
    const all = buildAreaOptions(candidates);
    const order: GeoLevel[] = ['province', 'city', 'region', 'country'];
    return order.flatMap((level) => all[level].map((o) => ({ level, value: o.value, label: geoAreaLabel(level, o.value) })));
}

/** Concurso aceptado, no terminado y de la zona de quien mira (su ubicación o la zona elegida en Inicio). */
export function isFeaturedContestFor(
    list: ContestListLike,
    viewer: { geo: GeoFields | null; area?: { kind: GeoLevel; value: string } | null },
    now = Date.now(),
): boolean {
    const req = list.featureRequest;
    if (!req || req.status !== 'approved' || !req.level || !req.value) return false;
    if (!isClosedContest(list) || contestPhase(list.contest, now) === 'after') return false;
    const scope = { kind: req.level, value: req.value } as const;
    if (viewer.geo && matchesArea(viewer.geo, scope)) return true;
    // Sin provincia/comunidad deducida: vale estar en la ciudad de un aspirante de esa zona.
    const viewerCity = geoValue(viewer.geo, 'city');
    if (viewerCity && (list.candidates || []).some((c) => geoValue(c, 'city') === viewerCity && matchesArea(c, scope))) return true;
    // Zona elegida a mano en Inicio: dentro de la del concurso (o la misma).
    const area = viewer.area;
    return Boolean(area && area.kind === req.level && area.value === req.value);
}

export const MAX_CANDIDATES = 100;

/** Clave que miran las reglas: igual que `placeId + '|' + itemNameLower` de la reseña. */
export const candidateKey = (placeId: string, itemName: string): string =>
    `${placeId}|${itemName.trim().toLowerCase()}`;

/** Clave para cruzar con los elementos ya valorados (tolera tildes y signos). */
export const candidateMatchKey = (placeId: string | undefined, itemName: string | undefined): string =>
    `${placeId ?? ''}|${normalizeItemName(itemName)}`;

export const isMinilistLike = (list: ContestListLike | null | undefined): boolean =>
    typeof list?.parentListId === 'string' && list.parentListId.length > 0;

export const isClosedContest = (list: ContestListLike | null | undefined): boolean =>
    isMinilistLike(list) && list?.contest?.closed === true;

const ms = (value: { toMillis(): number } | null | undefined): number | null =>
    value && typeof value.toMillis === 'function' ? value.toMillis() : null;

export type ContestPhase = 'before' | 'open' | 'after';

export function contestPhase(contest: ContestSettings | null | undefined, now = Date.now()): ContestPhase {
    const start = ms(contest?.startsAt);
    const end = ms(contest?.endsAt);
    if (start !== null && now < start) return 'before';
    if (end !== null && now > end) return 'after';
    return 'open';
}

const dayFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** «del 17 nov al 23 nov», «hasta el 23 nov» o null sin fechas. */
export function contestDatesLabel(contest: ContestSettings | null | undefined): string | null {
    const start = ms(contest?.startsAt);
    const end = ms(contest?.endsAt);
    if (start !== null && end !== null) return `del ${dayFmt.format(start)} al ${dayFmt.format(end)}`;
    if (end !== null) return `hasta el ${dayFmt.format(end)}`;
    if (start !== null) return `desde el ${dayFmt.format(start)}`;
    return null;
}

/** Por qué no se puede valorar ese plato en esta Minilista, o null si se puede. */
export function contestBlockReason(
    list: ContestListLike | null | undefined,
    entry: { placeId?: string | null; itemName?: string | null },
    now = Date.now(),
): string | null {
    if (!isClosedContest(list)) return null;
    const phase = contestPhase(list?.contest, now);
    const dates = contestDatesLabel(list?.contest);
    if (phase === 'before') return `El concurso aún no ha empezado${dates ? ` (${dates})` : ''}.`;
    if (phase === 'after') return 'El concurso ya ha terminado: no se pueden añadir ni cambiar valoraciones.';
    const keys = list?.candidateKeys ?? [];
    if (!entry.placeId || !entry.itemName || !keys.includes(candidateKey(entry.placeId, entry.itemName))) {
        return 'En este concurso solo se valoran sus aspirantes.';
    }
    return null;
}

/** Fecha «AAAA-MM-DD» del input a inicio o fin de ese día en hora local. */
export function dayToDate(day: string, edge: 'start' | 'end'): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const [y, m, d] = day.split('-').map(Number);
    return edge === 'start' ? new Date(y, m - 1, d, 0, 0, 0, 0) : new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function dateToDay(value: { toMillis(): number } | null | undefined): string {
    const t = ms(value);
    if (t === null) return '';
    const date = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
