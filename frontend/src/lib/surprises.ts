/**
 * Sorpresas (huevos de Pascua): cosas escondidas que salen al hacer algo.
 *
 * Dos interruptores: Developer → Sorpresas apaga cada una para todo el mundo
 * (config/app.surprises[id] === false) y Preferencias → Sorpresas las apaga
 * todas en este dispositivo. Con «menos movimiento» del sistema, las
 * animaciones se quedan en un aviso quieto.
 */
import { foldText } from '../components/business/kit/text';
import type { HapticKind } from '../utils/haptics';

export type SurpriseId =
    | 'perfectTen'
    | 'brokenPlate'
    | 'spicy'
    | 'lateNight'
    | 'croqueta'
    | 'lostPlate'
    | 'shakeRoulette'
    | 'tortilla'
    | 'pizzaPoll'
    | 'secretBadges'
    | 'abuela'
    | 'themeLadder'
    | 'ansievi';

export interface SurpriseMeta {
    id: SurpriseId;
    emoji: string;
    name: string;
    how: string;
}

export const SURPRISES: readonly SurpriseMeta[] = [
    { id: 'perfectTen', emoji: '🎉', name: 'Lluvia del sobresaliente', how: 'Al valorar con un 9 o más llueve el emoji del plato.' },
    { id: 'brokenPlate', emoji: '💥', name: 'Plato roto', how: 'Con un suspenso (menos de 5), el plato cae y se rompe: «¡puaj!».' },
    { id: 'spicy', emoji: '🌶️', name: 'Picante', how: 'Picante al máximo: la pantalla tiembla medio segundo.' },
    { id: 'lateNight', emoji: '🌙', name: 'Madrugada', how: 'Valorar pizza, kebab o comida de fiesta entre las 3 y las 7.' },
    { id: 'croqueta', emoji: '🧆', name: 'Atrapa la croqueta', how: 'Tocar 7 veces seguidas la imagen de Istari Core.' },
    { id: 'lostPlate', emoji: '🍽️', name: 'Plato perdido', how: 'Minijuego en la página de enlace roto (404).' },
    { id: 'shakeRoulette', emoji: '📳', name: 'Agitar = ruleta', how: 'Agitar el móvil en Inicio: plato cercano con media de más de 8.' },
    { id: 'tortilla', emoji: '⚔️', name: 'Encuesta de la tortilla', how: 'Buscar «tortilla»: ¿con o sin cebolla?' },
    { id: 'pizzaPoll', emoji: '🍍', name: 'Encuesta de la piña', how: 'Buscar «piña» o «hawaiana»: ¿pizza con o sin piña?' },
    { id: 'secretBadges', emoji: '🏅', name: 'Medallas secretas', how: 'Medallas escondidas que se ganan con las sorpresas.' },
    { id: 'abuela', emoji: '👵', name: 'Tema Abuela', how: '3 valoraciones en un domingo: medalla «Bien comido» y tema Abuela.' },
    { id: 'themeLadder', emoji: '🎨', name: 'Escalera de temas', how: 'Cada tema se desbloquea con su medalla (Cálido → Fresco → Neón → Grafito → Atardecer → Laguna → Abuela). Apagada: todos libres salvo la Abuela.' },
    { id: 'ansievi', emoji: '💃', name: '«ansievi»', how: 'Buscar «ansievi» abre el Baile de los apegos.' },
];

export function isSurpriseOn(config: { surprises?: Partial<Record<string, boolean>> }, id: SurpriseId): boolean {
    return config.surprises?.[id] !== false && userWantsSurprises();
}

// ── Interruptor de cada dispositivo ─────────────────────────────────────────

const USER_KEY = 'listopic_surprises_off';

export function userWantsSurprises(): boolean {
    try {
        return localStorage.getItem(USER_KEY) !== '1';
    } catch {
        return true;
    }
}

export function setUserWantsSurprises(on: boolean): void {
    try {
        if (on) localStorage.removeItem(USER_KEY);
        else localStorage.setItem(USER_KEY, '1');
    } catch { /* sin almacenamiento */ }
}

export function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Efectos: cualquier pantalla los pide y SurpriseHost los pinta ──────────

export type SurpriseEffect =
    | { kind: 'rain'; emoji: string; title?: string }
    | { kind: 'broken'; title?: string }
    | { kind: 'shake' }
    /** `haptic`: cómo vibra al salir (por defecto, un toque suave). */
    | { kind: 'bubble'; emoji: string; text: string; haptic?: HapticKind }
    | { kind: 'croqueta'; gated?: boolean }
    | { kind: 'roulette' }
    | { kind: 'poll'; poll: PollId; side?: PollSide };

export const SURPRISE_EVENT = 'listopic:surprise';
/** Agitar otra vez con la ruleta abierta: otra vuelta. */
export const RESPIN_EVENT = 'listopic:roulette-respin';

export function fireSurprise(effect: SurpriseEffect): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<SurpriseEffect>(SURPRISE_EVENT, { detail: effect }));
}

// ── Al valorar ─────────────────────────────────────────────────────────────

const DISH_EMOJI: ReadonlyArray<[RegExp, string]> = [
    [/pizza/, '🍕'],
    [/kebab|durum|shawarma|doner/, '🥙'],
    [/hamburgues|burger/, '🍔'],
    [/brava|patata|fritas/, '🥔'],
    [/tortilla/, '🍳'],
    [/tarta|pastel|cheesecake/, '🍰'],
    [/croqueta/, '🧆'],
    [/sushi|maki|nigiri/, '🍣'],
    [/nacho|taco|burrito|mexican/, '🌮'],
    [/paella|arroz/, '🥘'],
    [/ramen|udon/, '🍜'],
    [/perrito|hot ?dog/, '🌭'],
    [/churro/, '🥖'],
    [/helado/, '🍨'],
    [/cafe|brunch/, '☕'],
    [/cerveza|cana|vermu/, '🍺'],
    [/ensaladilla|ensalada/, '🥗'],
    [/playa/, '🏖️'],
];

/** Emoji del plato a partir del nombre de la lista y del elemento. */
export function dishEmoji(...texts: Array<string | null | undefined>): string {
    const folded = foldText(texts.filter(Boolean).join(' '));
    return DISH_EMOJI.find(([re]) => re.test(folded))?.[1] ?? '😋';
}

/** Comida de después de salir: pizza, kebab, burger, perritos, churros… */
const PARTY_FOOD = /pizza|kebab|durum|shawarma|doner|hamburgues|burger|perrito|hot ?dog|churro|bocadillo|bocata|nacho|taco|burrito|patatas|fritas|alita|nugget|gofre|crepe/;

export function isPartyFood(...texts: Array<string | null | undefined>): boolean {
    return PARTY_FOOD.test(foldText(texts.filter(Boolean).join(' ')));
}

/** De 3:00 a 6:59, hora del móvil. */
export const isLateNight = (date: Date): boolean => date.getHours() >= 3 && date.getHours() < 7;

interface CriterionLike {
    id: string;
    label?: string;
    max?: number;
}

export interface ReviewSurpriseInput {
    overallRating: number | null;
    criteria: readonly CriterionLike[];
    scores: Record<string, number>;
    listName?: string | null;
    itemName?: string | null;
    tags?: readonly string[];
    now?: Date;
    abuela?: boolean;
}

export interface ReviewSurprise {
    id: SurpriseId;
    effect: SurpriseEffect;
}

const LATE_NIGHT_LINES = [
    '¿Kebab de madrugada? Aquí no juzgamos.',
    'Valoración de madrugada: el jurado está algo perjudicado.',
    'A estas horas todo sabe a gloria. Mañana lo confirmas.',
];

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Lo que toca enseñar al publicar una valoración (lo más gracioso primero). */
export function reviewSurprises(input: ReviewSurpriseInput): ReviewSurprise[] {
    const out: ReviewSurprise[] = [];
    const { overallRating, criteria, scores, listName, itemName } = input;
    const now = input.now ?? new Date();

    if (overallRating !== null && overallRating >= 9) {
        out.push({
            id: 'perfectTen',
            effect: { kind: 'rain', emoji: dishEmoji(listName, itemName), title: input.abuela ? '¡Así me gusta, que comas bien!' : overallRating >= 9.95 ? '¡Un 10! Que lo sepa el mundo' : '¡Sobresaliente! Que lo sepa el mundo' },
        });
    } else if (overallRating !== null && overallRating < 5) {
        out.push({ id: 'brokenPlate', effect: { kind: 'broken', title: input.abuela ? '¡Ay, hijo, qué disgusto!' : '¡Suspenso! ¡Puaj!' } });
    }

    const spicyMax = criteria.some((c) => {
        if (!/pican/.test(foldText(c.label || c.id))) return false;
        const score = scores[c.id];
        return typeof score === 'number' && score >= (c.max ?? 10);
    });
    if (spicyMax) out.push({ id: 'spicy', effect: { kind: 'shake' } });

    if (isLateNight(now) && isPartyFood(listName, itemName, ...(input.tags ?? []))) {
        out.push({ id: 'lateNight', effect: { kind: 'bubble', emoji: '🌙', text: pick(LATE_NIGHT_LINES) } });
    }

    if (input.abuela) {
        const tiny = criteria.some((c) => /cantidad|racion|tamano/.test(foldText(c.label || c.id))
            && typeof scores[c.id] === 'number' && scores[c.id] <= 4);
        if (tiny) out.push({ id: 'abuela', effect: { kind: 'bubble', emoji: '👵', text: 'Eso es muy poco, te vas a quedar con hambre.' } });
    }
    return out;
}

// ── La abuela (tema secreto) ────────────────────────────────────────────────

/** Cada cuánto habla la abuela con su tema puesto (unos 2 minutos, con algo de azar). */
export const ABUELA_EVERY_MS = { min: 100_000, max: 140_000 };

export const ABUELA_LINES: readonly string[] = [
    '¿Has comido? Estás en los huesos.',
    'Ponte una chaqueta, que refresca.',
    'Come pan, que llena.',
    'Eso con un huevo frito está mejor.',
    '¿Y pareja para cuándo?',
    'Tanto móvil, tanto móvil… te vas a quedar ciego.',
    'En mi época esto se hacía con una sartén y ya está.',
    'Llévate un táper, que sobra mucho.',
    'No me digas que no tienes hambre, que te conozco.',
    'Cómete la fruta, que tiene vitaminas.',
    'Muy bonito el restaurante, pero como en casa, en ningún sitio.',
    '¿Quieres que te haga unas croquetas?',
    'Endereza la espalda, que te vas a quedar chepa.',
    'Abrígate los pies, que el frío entra por ahí.',
    '¡Pero qué mayor estás!',
    'Eso no es cenar, eso es picar.',
    'Rebaña el plato, que el pan está para eso.',
    'El domingo hay cocido. Que lo sepas.',
    'Lo caro no siempre es lo bueno.',
    'Un poquito más, que no te va a hacer daño.',
    '¿Ya te vas? Si acabas de llegar.',
    'A mí esas pizzas con piña no me las traigas.',
    'Bebe agua, que no bebes nada.',
    'Eso es plato para un pajarito.',
    'No andes descalzo, que te enfrías.',
    'Dile a tu madre que luego la llamo.',
    'Te he guardado la mejor tajada.',
    'Con lo delgadito que estás y comiendo por ahí…',
    'La tortilla, con cebolla. Y no se hable más.',
    'Toma, para un café. No se lo digas a nadie.',
    'Llama cuando llegues, que me quedo con el corazón en un puño.',
    'Eso es de bote, que yo lo noto.',
    'El chorizo del pueblo es otra cosa.',
    'No dejes nada en el plato, que eso es pecado.',
    'Que no se te enfríe, que luego no está igual.',
    '¿Una reseña? Lo que tienes que hacer es comer más.',
    'Ese bar lo conocía yo cuando era una tienda de ultramarinos.',
    'Si tienes sed, es que tienes hambre.',
    'Antes de la siesta, una fruta. Después, lo que quieras.',
    'Nada de pedir a domicilio, que te hago yo un caldito.',
];

/** Frase de la abuela sin repetir hasta agotar el repertorio. */
export function abuelaLine(): string {
    const KEY = 'listopic_abuela_dichas';
    let said: number[] = [];
    try { said = JSON.parse(localStorage.getItem(KEY) || '[]') as number[]; } catch { /* sin almacenamiento */ }
    let left = ABUELA_LINES.map((_, i) => i).filter((i) => !said.includes(i));
    if (!left.length) { said = []; left = ABUELA_LINES.map((_, i) => i); }
    const i = pick(left);
    try { localStorage.setItem(KEY, JSON.stringify([...said, i])); } catch { /* opcional */ }
    return ABUELA_LINES[i];
}

// ── Buscador ────────────────────────────────────────────────────────────────

export type PollId = 'tortilla' | 'pizza';
export type PollSide = 'con' | 'sin';

export const POLL_SURPRISE: Record<PollId, SurpriseId> = { tortilla: 'tortilla', pizza: 'pizzaPoll' };

/**
 * Encuesta que despierta una búsqueda: «tortilla» (con o sin cebolla) y «piña»
 * o «hawaiana» (pizza con o sin piña). Si la búsqueda ya dice el bando, se marca.
 */
export function pollQuery(query: string): { poll: PollId; side?: PollSide } | null {
    const q = foldText(query).replace(/\s+/g, ' ').trim();
    if (/tortilla/.test(q)) {
        const m = /(con|sin) cebolla/.exec(q);
        return { poll: 'tortilla', side: m ? (m[1] as PollSide) : undefined };
    }
    if (/\bpinas?\b|hawai/.test(q)) {
        if (/sin pina/.test(q)) return { poll: 'pizza', side: 'sin' };
        return { poll: 'pizza', side: /con pina|hawai/.test(q) ? 'con' : undefined };
    }
    return null;
}

const VOTED_KEY = 'listopic_polls_voted';

/** Encuestas ya votadas en este dispositivo: el buscador ya no las vuelve a abrir solas. */
export function pollVotedHere(poll: PollId): boolean {
    try { return (JSON.parse(localStorage.getItem(VOTED_KEY) || '[]') as string[]).includes(poll); } catch { return false; }
}

export function markPollVoted(poll: PollId): void {
    try {
        const list = JSON.parse(localStorage.getItem(VOTED_KEY) || '[]') as string[];
        if (!list.includes(poll)) localStorage.setItem(VOTED_KEY, JSON.stringify([...list, poll]));
    } catch { /* opcional */ }
}

export const isAnsieviQuery = (query: string): boolean => foldText(query).trim() === 'ansievi';

/** Pase para abrir el Baile de los apegos aunque el laboratorio esté oculto. */
export const LAB_EGG_KEY = 'listopic_lab_egg';

// ── Toques seguidos (imagen de Istari Core) ──────────────────────────────────────────────────

/** Devuelve una función que cuenta toques y avisa al llegar a `count` en `windowMs`. */
export function tapCounter(count: number, windowMs: number, onHit: () => void): () => void {
    let taps: number[] = [];
    return () => {
        const now = Date.now();
        taps = [...taps.filter((t) => now - t < windowMs), now];
        if (taps.length >= count) {
            taps = [];
            onHit();
        }
    };
}
