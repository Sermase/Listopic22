/**
 * Modo concurso de una Minilista: el dueño pone los aspirantes (sitio + plato) y,
 * si la cierra, solo se valoran ellos y solo entre sus fechas.
 * Las reglas de Firestore (reviewContestOk) comprueban lo mismo con `candidateKeys`.
 */
import { normalizeItemName } from './listElements';

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
}

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
