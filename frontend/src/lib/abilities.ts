/**
 * Medallas con premio: algunas medallas desbloquean una habilidad (adorno o comodidad,
 * nunca más peso en los rankings). Developer → Sorpresas → «Medallas con premio» apaga
 * la medalla (badges/{id}.active) o solo su premio (config/app.abilities[id] === false).
 * Sin medalla activa no hay premio. El Jefe las tiene todas para probarlas.
 */

export type AbilityId =
    | 'photoFilters'
    | 'photoFrames'
    | 'cardSignature'
    | 'customPin'
    | 'extraReactions'
    | 'pinnedReview'
    | 'goldRing'
    | 'colorRing';

export interface AbilityMeta {
    id: AbilityId;
    /** Medalla que la desbloquea. */
    badge: string;
    emoji: string;
    name: string;
    /** El premio, en una frase (ficha de la medalla). */
    prize: string;
    /** Dónde se usa. */
    where: string;
}

export const ABILITIES: AbilityMeta[] = [
    { id: 'colorRing', badge: 'CALENTANDO', emoji: '🎨', name: 'Aro de color', prize: 'un aro con el color de tu tema en tu foto de perfil', where: 'Se ve en tu perfil. Cámbialo en Preferencias → Mis premios.' },
    { id: 'photoFilters', badge: 'OJO_DE_HALCON', emoji: '🦅', name: 'Filtros de foto', prize: 'filtros para tus fotos: uno ahora y otro cada 7 fotos más (hasta 6)', where: 'Al subir una foto, en «Filtros».' },
    { id: 'cardSignature', badge: 'CRITICO_DE_BARRIO', emoji: '✍️', name: 'Firma en tarjetas', prize: 'tu firma escrita a mano en las tarjetas que compartes: una frase tuya o la de una de tus medallas', where: 'Compartir → Crear tarjeta. Elígela en Preferencias → Mis premios.' },
    { id: 'extraReactions', badge: 'RADAR_GASTRONOMICO', emoji: '🥘', name: 'Reacciones de comida', prize: 'seis reacciones extra en el chat (🥘🧆🍷🍕🌮🍰)', where: 'Al reaccionar a un mensaje del chat.' },
    { id: 'photoFrames', badge: 'ARCHIVO_VISUAL', emoji: '🖼️', name: 'Marcos de foto', prize: 'marcos para tus tarjetas: Polaroid y plato en mantel de cuadros', where: 'Compartir → Crear tarjeta → Marco.' },
    { id: 'customPin', badge: 'TROTAMUNDOS', emoji: '📍', name: 'Chincheta propia', prize: 'tu emoji en las chinchetas del mapa de tu perfil', where: 'Mapa de tu perfil. Elige el emoji en Preferencias → Mis premios.' },
    { id: 'pinnedReview', badge: 'LEYENDA_DEL_TENEDOR', emoji: '📌', name: 'Reseña fijada', prize: 'fijar tu reseña favorita arriba de tu perfil', where: 'Menú ⋯ de una reseña tuya → «Fijar en mi perfil».' },
    { id: 'goldRing', badge: 'GRAN_MAESTRE', emoji: '🏆', name: 'Aro dorado', prize: 'un aro dorado animado en tu foto de perfil', where: 'Se ve en tu perfil, para todos.' },
];

const BY_ID = new Map(ABILITIES.map((a) => [a.id, a] as const));
export const abilityMeta = (id: AbilityId): AbilityMeta => BY_ID.get(id)!;
export const abilityForBadge = (badgeId: string): AbilityMeta | undefined => ABILITIES.find((a) => a.badge === badgeId);

/** Lo que cada cual elige de sus premios (users.abilityPrefs, también en publicProfiles). */
export interface AbilityPrefs {
    /** Frase propia de la firma (SIGNATURE_MAX letras como mucho). */
    signature?: string;
    /** Firma con la frase de esta medalla (si está, manda sobre la frase propia). */
    signatureBadge?: string;
    /** Emoji de las chinchetas del mapa del perfil. */
    pinEmoji?: string;
    /** Reseña fijada: `${listId}/${reviewId}`. */
    pinnedReview?: string;
    /** Aro de la foto: dorado, color del tema o ninguno. */
    ring?: 'gold' | 'theme' | 'off';
}

export const SIGNATURE_MAX = 40;
/** Ideas para la firma (también sirven de ejemplo). */
export const SIGNATURE_SUGGESTIONS = [
    'Si no cruje, no es croqueta',
    'Probado y aprobado',
    'Aquí se viene a comer',
    'Con pan, que no falte',
    'La tortilla, poco hecha',
    'Primero el plato, luego la foto',
] as const;
export const PIN_EMOJIS = ['🍕', '🍔', '🌮', '🍣', '🥘', '🍤', '🥐', '🍰', '🍷', '🍺', '☕', '🌶️', '🦅', '🐙', '👑', '⭐'] as const;
export const EXTRA_REACTIONS = ['🥘', '🧆', '🍷', '🍕', '🌮', '🍰'] as const;

export const sanitizeAbilityPrefs = (value: unknown): AbilityPrefs => {
    if (!value || typeof value !== 'object') return {};
    const raw = value as Record<string, unknown>;
    const out: AbilityPrefs = {};
    if (typeof raw.signature === 'string' && raw.signature.trim()) out.signature = raw.signature.trim().slice(0, SIGNATURE_MAX);
    if (typeof raw.signatureBadge === 'string' && raw.signatureBadge) out.signatureBadge = raw.signatureBadge.slice(0, 64);
    if (typeof raw.pinEmoji === 'string' && raw.pinEmoji) out.pinEmoji = raw.pinEmoji.slice(0, 16);
    if (typeof raw.pinnedReview === 'string' && raw.pinnedReview.includes('/')) out.pinnedReview = raw.pinnedReview.slice(0, 200);
    if (raw.ring === 'gold' || raw.ring === 'theme' || raw.ring === 'off') out.ring = raw.ring;
    return out;
};

export interface AbilityGateInput {
    /** config/app.abilities: `false` = premio apagado. */
    abilitiesConfig?: Partial<Record<string, boolean>>;
    /** Medallas apagadas en Developer. */
    inactiveBadges: ReadonlySet<string>;
}

/** ¿Tiene esta persona (por sus medallas) la habilidad, con lo encendido en Developer? */
export function abilityAllowed(id: AbilityId, badges: readonly string[] | undefined, gate: AbilityGateInput, isJefe = false): boolean {
    const meta = BY_ID.get(id);
    if (!meta) return false;
    if (gate.abilitiesConfig?.[id] === false) return false;
    if (gate.inactiveBadges.has(meta.badge)) return false;
    return isJefe || (badges || []).includes(meta.badge);
}

/** Filtros de foto: uno con la medalla (7 fotos) y otro cada 7 fotos más, hasta 6. */
export const PHOTOS_PER_FILTER = 7;
export const MAX_FILTERS = 6;
export const unlockedFilterCount = (photosCount: number, isJefe = false): number =>
    isJefe ? MAX_FILTERS : Math.max(1, Math.min(MAX_FILTERS, Math.floor((Number(photosCount) || 0) / PHOTOS_PER_FILTER)));

/** El aro que lleva la foto: lo elegido si se puede; si no, el mejor que tenga. */
export function ringFor(prefs: AbilityPrefs | undefined, hasGold: boolean, hasColor: boolean): 'gold' | 'theme' | null {
    const pick = prefs?.ring;
    if (pick === 'off') return null;
    if (pick === 'gold' && hasGold) return 'gold';
    if (pick === 'theme' && hasColor) return 'theme';
    if (hasGold) return 'gold';
    if (hasColor) return 'theme';
    return null;
}

/** Lo que pinta la firma en la tarjeta: la frase de la medalla elegida o la propia. */
export interface SignatureContent {
    text: string;
    /** Con frase de medalla: «📝 Crítico de Barrio». */
    badge?: string;
}

export function signatureFor(
    prefs: AbilityPrefs | undefined,
    earnedBadgeIds: readonly string[],
    badgeInfo: (id: string) => { name: string; icon: string; description: string } | undefined,
): SignatureContent | undefined {
    const badgeId = prefs?.signatureBadge;
    // Solo una medalla que tenga de verdad (las reglas no pueden comprobarlo).
    const badge = badgeId && earnedBadgeIds.includes(badgeId) ? badgeInfo(badgeId) : undefined;
    if (badge?.description) return { text: badge.description, badge: `${badge.icon} ${badge.name}` };
    const own = prefs?.signature?.trim();
    return own ? { text: own.slice(0, SIGNATURE_MAX) } : undefined;
}
