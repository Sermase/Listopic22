/**
 * Chivatazos de los personajes: de vez en cuando, en vez del saludo del día,
 * el personaje del tema dice algo útil con enlace («a 300 m tienes unas bravas
 * con un 8,8 y aún no las has probado»). Inicio deja preparados los chivatazos
 * con lo que ya ha cargado (sin lecturas extra) y SurpriseHost los dice.
 */
import type { ThemeCharacter } from './themeCharacters';

export interface CharacterTip {
    /** dish: plato cerca sin probar · friend: lo que le gustó a un colega · gem: sitio con mucha nota y poca fama. */
    kind: 'dish' | 'friend' | 'gem';
    key: string;
    title: string;
    place?: string;
    score?: number;
    /** Ya formateada: «a 300 m». */
    distance?: string;
    /** «Tu colega Cris le dio un 9». */
    friendNote?: string;
    count?: number;
    to: string;
}

const TIPS_KEY = 'listopic_chivatazos';
const LAST_KEY = 'listopic_chivatazo_ultimo';
const MAX_TIPS = 12;

/** Se guardan con la cuenta: «aún no lo has probado» es de quien los preparó. */
export function saveCharacterTips(uid: string, tips: readonly CharacterTip[]): void {
    if (!uid || !tips.length) return;
    try { localStorage.setItem(TIPS_KEY, JSON.stringify({ uid, tips: tips.slice(0, MAX_TIPS) })); } catch { /* sin almacenamiento */ }
}

export function readCharacterTips(uid: string | null | undefined): CharacterTip[] {
    if (!uid) return [];
    try {
        const saved = JSON.parse(localStorage.getItem(TIPS_KEY) || 'null') as { uid?: string; tips?: unknown } | null;
        if (!saved || saved.uid !== uid || !Array.isArray(saved.tips)) return [];
        return saved.tips.filter((t): t is CharacterTip => !!t && typeof t.title === 'string' && typeof t.to === 'string' && typeof t.key === 'string');
    } catch {
        return [];
    }
}

/** Uno al azar que no sea el último que se dijo; null si no hay. */
export function pickCharacterTip(tips: readonly CharacterTip[], roll = Math.random()): CharacterTip | null {
    if (!tips.length) return null;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_KEY); } catch { /* sin almacenamiento */ }
    const pool = tips.length > 1 ? tips.filter((t) => t.key !== last) : tips;
    const tip = pool[Math.floor(roll * pool.length) % pool.length];
    try { localStorage.setItem(LAST_KEY, tip.key); } catch { /* opcional */ }
    return tip;
}

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Cómo empieza cada personaje un chivatazo. */
const INTROS: Partial<Record<string, readonly string[]>> = {
    warm: ['Te paso un chivatazo de la parrilla:', 'Apunta, que esto sale al punto:'],
    cool: ['Sabor recomendado:', 'Te cuento un secreto:'],
    neon: ['AVISO:', 'ESTA NOCHE:'],
    graphite: ['Fuera de carta:', 'Le recomiendo:'],
    sunset: ['Para el vermú de hoy:', 'Un chivatazo:'],
    lagoon: ['Desde arriba lo veo claro:', 'Cotilleo de gaviota:'],
    abuela: ['Hijo, hazme caso:', 'Te lo digo yo:'],
};

/** El chivatazo en boca del personaje. */
export function tipText(character: ThemeCharacter, tip: CharacterTip, roll = Math.random()): string {
    const intros = INTROS[character.theme] ?? ['Un chivatazo:'];
    const intro = intros[Math.floor(roll * intros.length) % intros.length];
    const dish = lower(tip.title);
    const where = tip.place ? ` en ${tip.place}` : '';
    let body: string;
    if (tip.kind === 'friend' && tip.friendNote) {
        body = `${lower(tip.friendNote)} a ${dish}${where}. ¿Vas a ser menos?`;
    } else if (tip.kind === 'gem') {
        const count = tip.count ? ` y solo ${tip.count === 1 ? 'una reseña' : `${tip.count} reseñas`}` : '';
        body = `${tip.title} tiene un ${fmt(tip.score ?? 0)}${count}. Casi nadie lo conoce todavía.`;
    } else {
        const near = tip.distance ? `${tip.distance} tienes ${dish}${where}` : `${tip.place ? `en ${tip.place} tienen` : 'tienes cerca'} ${dish}`;
        body = `${near} con un ${fmt(tip.score ?? 0)}, y aún no lo has probado.`;
    }
    const text = `${intro} ${body}`;
    return character.theme === 'neon' ? text.toUpperCase() : text;
}
