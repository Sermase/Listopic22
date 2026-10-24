// Pachote (cuentas de grupo, pachote-78042.web.app) vive en el mismo Firebase.
// Un grupo de Pachote puede enlazarse a un chat de Listopic: los del chat ven
// su ficha y su resumen de saldos, que calcula y guarda la propia Pachote.

export const PACHOTE_URL = 'https://pachote-78042.web.app/';

export interface PachoteMember {
    id: string;
    name: string;
    /** Usuario de Listopic que es esta persona (si el grupo se creó desde un chat). */
    luid?: string | null;
    hh?: string | null;
    weight?: number;
    photo?: string;
    inactive?: boolean;
}

export interface PachoteSummaryPerson {
    id: string;
    name: string;
    luid?: string | null;
    /** Céntimos: positivo, le deben; negativo, debe. */
    bal: number;
    /** Cómo lo diría Pachote a esa persona («Te deben», «Debes a Ana»…). */
    lab?: string;
    /** Lo que le ha tocado pagar de los gastos (su parte). */
    spent: number;
}

export interface PachoteSummaryTx {
    from: string;
    to: string;
    amt: number;
}

export interface PachoteSummaryItem {
    desc: string;
    amt: number;
    by: string;
    date: string;
    cat?: string;
}

/** Resumen que Pachote guarda en el grupo enlazado (pachoteGroups/{id}.summary). */
export interface PachoteSummary {
    v: number;
    /** Total gastado, en céntimos. */
    spent: number;
    /** Número de gastos. */
    n: number;
    people: PachoteSummaryPerson[];
    tx: PachoteSummaryTx[];
    last: PachoteSummaryItem[];
}

export interface PachoteGroup {
    id: string;
    name: string;
    emoji?: string;
    desc?: string;
    members: PachoteMember[];
    chatId?: string;
    inviteToken?: string;
    closed?: boolean;
    updated?: number;
    summary?: PachoteSummary;
}

/** Lo que el chat guarda de cada grupo enlazado (chats/{id}.pachote.{grupo}). */
export interface ChatPachoteLink {
    name: string;
    emoji?: string;
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true });

/** Céntimos → «1.234,50 €». */
export const pachoteMoney = (cents: number) => eur.format((cents || 0) / 100);

/** Enlace que abre el grupo en Pachote (si no estabas, entras con él). */
export const pachoteJoinUrl = (gid: string, token?: string) => (token ? `${PACHOTE_URL}#join/${gid}/${token}` : PACHOTE_URL);

/** Ids como los de Pachote: hora en base 36 y un poco de azar. */
export const pachoteId = (extra = 0) =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + (extra ? Math.random().toString(36).slice(2, 2 + extra) : '');

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Link de invitación de Pachote: 24 caracteres. */
export function pachoteToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
    return Array.from(random(24), (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

/** La gente del chat como personas de Pachote: el nombre de pila y, si se repite, el nombre entero. */
export function membersFromPeople(people: Array<{ uid: string; name: string }>, makeId: () => string = () => pachoteId(2)): PachoteMember[] {
    const first = (n: string) => n.trim().split(/\s+/)[0] || 'Alguien';
    const count: Record<string, number> = {};
    people.forEach((p) => { const k = first(p.name).toLowerCase(); count[k] = (count[k] || 0) + 1; });
    return people.map((p) => ({
        id: makeId(),
        name: (count[first(p.name).toLowerCase()] > 1 ? p.name.trim() : first(p.name)).slice(0, 40),
        luid: p.uid,
        hh: null,
        weight: 1,
    }));
}

/** Mi fila en el resumen: por mi usuario de Listopic o por la persona que elegí en Pachote. */
export function myRow(summary: PachoteSummary | undefined, uid: string, memberId?: string | null): PachoteSummaryPerson | null {
    if (!summary) return null;
    return summary.people.find((p) => (memberId && p.id === memberId) || (p.luid && p.luid === uid)) || null;
}

/** El miembro de Pachote que soy yo, por mi usuario de Listopic. */
export const memberOfUser = (group: PachoteGroup | null | undefined, uid: string) =>
    group?.members?.find((m) => m.luid === uid) || null;

export type Tone = 'pos' | 'neg' | 'zero';

/** «Te deben 12 €», «Debes 8 €» o «En paz», con su color. */
export function standing(bal: number, lab?: string): { label: string; amount: string; tone: Tone } {
    const tone: Tone = bal > 0 ? 'pos' : bal < 0 ? 'neg' : 'zero';
    const label = lab || (tone === 'pos' ? 'Te deben' : tone === 'neg' ? 'Debes' : 'En paz');
    return { label, amount: bal ? pachoteMoney(Math.abs(bal)) : '', tone };
}

export const toneClass: Record<Tone, string> = {
    pos: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30',
    neg: 'text-rose-300 bg-rose-500/10 border-rose-400/30',
    zero: 'text-gray-300 bg-white/5 border-white/10',
};

/** El texto de la vista previa del chat al compartir las cuentas. */
export const pachoteCardText = (name: string) => `💸 ¿Cómo vamos de cuentas en «${name}»?`;
