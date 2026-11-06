/**
 * Personajes y gracias de los temas (fase 2 de «temas con personalidad»).
 *
 * - Personaje: habla en los momentos clave (saludo del día en Inicio, título del
 *   formulario y al publicar). Solo la Abuela suelta frases sueltas cada pocos
 *   minutos. Medianoche y Mediodía no tienen personaje: son los temas sobrios.
 *   Cada persona puede callar el de cada tema en Preferencias → Tema (por dispositivo).
 * - Gracia: la animación de cada tema al publicar. La de Medianoche y Mediodía
 *   se gana con una medalla (ThemeContext → graceOn).
 */
import type { ThemeId } from '../context/ThemeContext';

export type GraceId = 'star' | 'sunrise' | 'sparks' | 'icecream' | 'neon' | 'chalk' | 'cheers' | 'gull';

export interface ThemeCharacter {
    theme: ThemeId;
    name: string;
    emoji: string;
    /** Saludo del día al entrar en Inicio (uno al azar). */
    greetings: readonly string[];
    /** Título del formulario de reseña nueva. */
    formTitle: string;
    /** Título del aviso al publicar. */
    published: string;
    /** Con un 9 o más (lluvia del sobresaliente). */
    ten: string;
    /** Con un suspenso (plato roto). */
    fail: string;
    /** Con la ración por los suelos (cantidad, ración o tamaño ≤ 4). */
    tiny: string;
    /** Lo que comenta al publicar, sin repetir hasta agotar el repertorio. */
    lines: readonly string[];
    /** Solo la Abuela: también habla sola cada 2 minutos o así. */
    chatty?: boolean;
}

export const THEME_CHARACTERS: Partial<Record<ThemeId, ThemeCharacter>> = {
    warm: {
        theme: 'warm',
        name: 'El Parrillero',
        emoji: '🧑‍🍳',
        greetings: [
            'Buenas. La brasa ya está lista, ¿qué ponemos?',
            'Hoy hay leña de encina. Tú verás.',
            'Llegas a tiempo: las ascuas están en su punto.',
        ],
        formTitle: '¿Qué ha salido de la brasa?',
        published: '¡Al punto!',
        ten: '¡Esto está de vicio! Ni yo lo hago mejor.',
        fail: 'Esto está más quemado que mi delantal.',
        tiny: 'Con esa ración no enciendo ni la parrilla.',
        lines: [
            'La carne no se pincha, que se desangra.',
            'Paciencia: lo bueno, a fuego lento.',
            'Sal gorda y poco más. Lo demás es disfrazar.',
            'El humo también es un ingrediente.',
            'Si chisporrotea, va bien.',
            'Vuelta y vuelta, y a la mesa.',
            'Las patatas, en las brasas y envueltas en papel. Como debe ser.',
            'Una buena chuleta no necesita salsa.',
            'A la brasa todo sabe a domingo.',
            'El pimiento asado, en su piel hasta el final.',
        ],
    },
    cool: {
        theme: 'cool',
        name: 'La Heladera',
        emoji: '🍦',
        greetings: [
            '¡Hola! ¿Cucurucho o tarrina?',
            'Hoy hay sabores nuevos. Prueba sin miedo.',
            'Pasa, pasa, que fuera hace calor.',
        ],
        formTitle: '¿De qué sabor ha sido hoy?',
        published: '¡Servida!',
        ten: '¡Esto es de doble bola con barquillo!',
        fail: 'Esto se ha derretido antes de llegar a la mesa.',
        tiny: 'Eso es una bola de muestra, no una ración.',
        lines: [
            'El pistacho de verdad no es verde fosforito.',
            'Si gotea por el cucurucho, es que está bueno.',
            'Primero se prueba con la paletita y luego se decide.',
            'Dos bolas: una segura y otra para arriesgar.',
            'El de turrón, aunque sea agosto.',
            'Nada de prisas: un helado se disfruta despacio.',
            'La nata, siempre aparte. Por si acaso.',
            '¿Con virutas? Venga, que hoy es fiesta.',
            'Lo de que el helado es solo de verano es un mito.',
            'Si dudas entre dos sabores, la respuesta es los dos.',
        ],
    },
    neon: {
        theme: 'neon',
        name: 'El Letrero',
        emoji: '💡',
        greetings: [
            'ABIERTO · HAMBRE 24 H',
            'SE SIRVEN CENAS HASTA TARDE',
            'HOY: BUENA MÚSICA Y MEJOR COMIDA',
        ],
        formTitle: 'LO QUE HAS CENADO',
        published: '★ PUBLICADO ★',
        ten: '★ LO MEJOR DE LA NOCHE ★',
        fail: 'FUERA DE SERVICIO',
        tiny: 'RACIÓN MINI · PRECIO MAXI',
        lines: [
            'ÚLTIMA RONDA EN LA BARRA',
            'COCINA ABIERTA · NO SE ACEPTAN DIETAS',
            'HAPPY HOUR: TODO EL RATO',
            'SE BUSCA CROQUETA PERDIDA',
            'PARA LLEVAR · O PARA QUEDARSE',
            'HOY NO SE CENA, SE CELEBRA',
            'TUBO FUNDIDO · DISCULPEN LAS MOLESTIAS',
            'PISTA DE BAILE AL FONDO',
            'NOCHE LARGA · HAMBRE CORTA',
            'AQUÍ SE VIENE CON HAMBRE',
        ],
    },
    graphite: {
        theme: 'graphite',
        name: 'El Camarero',
        emoji: '🤵',
        greetings: [
            '¡Buenas! ¿Qué va a ser?',
            'Le canto el menú: hoy hay de todo y todo bueno.',
            'Siéntese donde quiera, que ahora le atiendo.',
        ],
        formTitle: '¿Qué le pongo?',
        published: '¡Marchando!',
        ten: '¡Una de matrícula de honor para la mesa tres!',
        fail: '¡Devuelta a cocina, que esto no sale así!',
        tiny: '¿Eso es una tapa o una muestra gratuita?',
        lines: [
            '¡Una de bravas y dos cañas!',
            'De primero, de segundo, y postre o café.',
            'El pan va aparte, pero se lo pongo igual.',
            '¡Oído, cocina!',
            'El menú del día: el mejor invento de este país.',
            'Cuidado, que quema.',
            '¿Le cobro todo junto o por separado?',
            'Lo de la pizarra está escrito con cariño y alguna falta.',
            '¡Ojo, que salen calamares!',
            'Si algo no le gusta, me lo dice a mí, que para eso estoy.',
        ],
    },
    sunset: {
        theme: 'sunset',
        name: 'El del Vermú',
        emoji: '🥃',
        greetings: [
            'Llega la mejor hora del día.',
            'Un vermú y unas aceitunas, ¿te hace?',
            'El sol se va y aquí seguimos.',
        ],
        formTitle: '¿Qué ha caído con el vermú?',
        published: '¡Salud!',
        ten: 'Esto pide otra ronda. Invito yo.',
        fail: 'Ni con un vermú se arregla esto.',
        tiny: 'Eso es el aperitivo del aperitivo.',
        lines: [
            'Vermú de grifo, con su rodaja y su aceituna.',
            'La terraza, mirando al oeste. Siempre.',
            'Una gilda y se arregla el día.',
            'A estas horas todo el mundo es un poco filósofo.',
            'El sifón, que no falte.',
            'Una ronda más y nos vamos. Eso dicen todos.',
            'Los mejillones en lata son alta cocina.',
            'Hora dorada: hasta las fotos de comida salen bien.',
            'Las patatas de bolsa también cuentan como cena.',
            '¿Otra? Bueno, venga, la última.',
        ],
    },
    lagoon: {
        theme: 'lagoon',
        name: 'La Gaviota',
        emoji: '🐦',
        greetings: [
            'Hola. ¿Traes patatas?',
            'Qué buen día de playa para robar bocadillos.',
            'Te estaba esperando. Bueno, a ti no: a tu comida.',
        ],
        formTitle: '¿Qué tienes ahí? ¿Lo compartes?',
        published: '¡Graaa! Publicada.',
        ten: 'Esto lo robo yo. Ahora mismo.',
        fail: 'Ni yo me lo comería. Y me como cualquier cosa.',
        tiny: 'Con eso no tengo ni para el pico.',
        lines: [
            'Esa patata no te la vas a comer, ¿verdad?',
            'Yo solo miro. De momento.',
            'Las sombrillas no me dan miedo.',
            'El chiringuito de la derecha tira las sardinas. Lo sé de buena fuente.',
            '¡Graaa! Perdón, me emociono.',
            'No es robar si nadie lo estaba vigilando.',
            'Un espeto de sardinas, por favor. Bueno, cinco.',
            'Cuidado con el helado, que vuelo bajo.',
            'El mar da hambre. A mí, más.',
            'Los gofres también son marisco si te los comes en la playa.',
        ],
    },
    abuela: {
        theme: 'abuela',
        name: 'La Abuela',
        emoji: '👵',
        greetings: ['¿Has comido? Estás en los huesos.'],
        formTitle: '¿Qué has comido, hijo?',
        published: '¡Muy bien, hijo!',
        ten: '¡Así me gusta, que comas bien!',
        fail: '¡Ay, hijo, qué disgusto!',
        tiny: 'Eso es muy poco, te vas a quedar con hambre.',
        // Sus frases sueltas son ABUELA_LINES (lib/surprises.ts).
        lines: [],
        chatty: true,
    },
};

/** La gracia (animación al publicar) de cada tema. La Abuela ya tiene las suyas. */
export const THEME_GRACES: Partial<Record<ThemeId, { id: GraceId; name: string }>> = {
    dark: { id: 'star', name: 'Estrella fugaz' },
    light: { id: 'sunrise', name: 'Sol de mediodía' },
    warm: { id: 'sparks', name: 'Chispazo' },
    cool: { id: 'icecream', name: 'Helado de notas' },
    neon: { id: 'neon', name: 'Letrero que se enciende' },
    graphite: { id: 'chalk', name: 'Escrito a tiza' },
    sunset: { id: 'cheers', name: 'Brindis' },
    lagoon: { id: 'gull', name: 'La gaviota' },
};

/**
 * Medianoche y Mediodía no tienen personaje: su gracia (la animación) se gana con
 * una medalla (functions/modules/lib/theme-badges.js; ThemeContext → graceUnlocked).
 * Los demás temas la tienen siempre.
 */
export interface ThemePerk { badge: string; medal: string; icon: string; hint: string; what: string }

export const THEME_PERKS: Partial<Record<ThemeId, ThemePerk>> = {
    dark: {
        badge: 'ANIM_MEDIANOCHE',
        medal: 'Cielo estrellado',
        icon: '🌠',
        hint: 'Haz 30 valoraciones.',
        what: 'Estrellas fugaces en Medianoche: al publicar y, de vez en cuando, cruzando el cielo.',
    },
    light: {
        badge: 'ANIM_MEDIODIA',
        medal: 'Sol de mediodía',
        icon: '☀️',
        hint: 'Haz 10 valoraciones entre las 13 y las 16 h.',
        what: 'En Mediodía el sol sale al publicar y sigue la hora real por el cielo.',
    },
};

// ── Callar al personaje de un tema (por dispositivo) ───────────────────────

const MUTED_KEY = 'listopic_characters_off';

function readMuted(): ThemeId[] {
    try {
        const list = JSON.parse(localStorage.getItem(MUTED_KEY) || '[]');
        return Array.isArray(list) ? list.filter((t): t is ThemeId => typeof t === 'string') : [];
    } catch {
        return [];
    }
}

export function isCharacterMuted(theme: ThemeId): boolean {
    return readMuted().includes(theme);
}

export function setCharacterMuted(theme: ThemeId, muted: boolean): void {
    const rest = readMuted().filter((t) => t !== theme);
    try {
        localStorage.setItem(MUTED_KEY, JSON.stringify(muted ? [...rest, theme] : rest));
    } catch { /* sin almacenamiento: vale para esta visita */ }
}

/** El personaje que habla con este tema puesto, o null (no tiene, o está callado). */
export function activeCharacter(theme: ThemeId): ThemeCharacter | null {
    const character = THEME_CHARACTERS[theme];
    return character && !isCharacterMuted(theme) ? character : null;
}

/** Una frase del repertorio sin repetir hasta agotarlo (cuenta por tema, en este dispositivo). */
export function characterLine(character: ThemeCharacter): string | null {
    const lines = character.lines;
    if (!lines.length) return null;
    const key = `listopic_dichas_${character.theme}`;
    let said: number[] = [];
    try { said = JSON.parse(localStorage.getItem(key) || '[]') as number[]; } catch { /* sin almacenamiento */ }
    let left = lines.map((_, i) => i).filter((i) => !said.includes(i));
    if (!left.length) { said = []; left = lines.map((_, i) => i); }
    const i = left[Math.floor(Math.random() * left.length)];
    try { localStorage.setItem(key, JSON.stringify([...said, i])); } catch { /* opcional */ }
    return lines[i];
}

export const pickGreeting = (character: ThemeCharacter): string =>
    character.greetings[Math.floor(Math.random() * character.greetings.length)];

// ── Helado de notas: una bola por criterio, del color de su nota ───────────

const SCOOP_COLORS: ReadonlyArray<[number, string]> = [
    [9, '#f9a8d4'], // fresa
    [8, '#fde68a'], // vainilla
    [7, '#a7f3d0'], // menta
    [6, '#fed7aa'], // melocotón
    [5, '#d6bfa8'], // café con leche
    [0, '#8b5e3c'], // chocolate (los suspensos, para que endulce)
];

/** Colores de las bolas (como mucho 5), de abajo arriba. */
export function scoopColors(scores: Record<string, number>, criteria: readonly { id: string; max?: number }[]): string[] {
    const colors = criteria
        .map((c) => {
            const score = scores[c.id];
            if (typeof score !== 'number' || Number.isNaN(score)) return null;
            const outOfTen = (score / (c.max || 10)) * 10;
            return SCOOP_COLORS.find(([min]) => outOfTen >= min)?.[1] ?? SCOOP_COLORS[SCOOP_COLORS.length - 1][1];
        })
        .filter((c): c is string => c !== null);
    return colors.slice(0, 5);
}

// ── La gaviota: patatas que le quitas ───────────────────────────────────────

const FRIES_KEY = 'listopic_gaviota_patatas';

/** Suma una patata rescatada y devuelve cuántas llevas. */
export function rescueFry(): number {
    let n = 0;
    try { n = Number(localStorage.getItem(FRIES_KEY) || '0') || 0; } catch { /* sin almacenamiento */ }
    n += 1;
    try { localStorage.setItem(FRIES_KEY, String(n)); } catch { /* opcional */ }
    return n;
}
