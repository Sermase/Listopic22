/**
 * «Apto para»: lo que aportan celíacos, intolerantes, gente en silla… Sus
 * respuestas son privadas (users/{uid}/aptReports/{reviewId}); el servidor las
 * suma de forma anónima en places/{placeId}.aptFor (functions/modules/lib/apt-for.js).
 */
export type AptKey = 'glutenFree' | 'lactoseFree' | 'vegetarian' | 'vegan' | 'stepFree' | 'accessibleRestroom' | 'petFriendly';
export type AptAnswer = 'yes' | 'no';
export type AptCounts = Partial<Record<AptAnswer, number>>;
export type AptFor = {
    place?: Partial<Record<AptKey, AptCounts>>;
    items?: Record<string, Partial<Record<AptKey, AptCounts>>>;
};

export const APT_ITEM_KEYS: AptKey[] = ['glutenFree', 'lactoseFree', 'vegetarian', 'vegan'];
export const APT_PLACE_KEYS: AptKey[] = ['stepFree', 'accessibleRestroom', 'petFriendly'];
export const APT_KEYS: AptKey[] = [...APT_ITEM_KEYS, ...APT_PLACE_KEYS];

/** Pregunta del formulario y cómo se lee el recuento. */
export const APT_QUESTIONS: Record<AptKey, { emoji: string; question: string; yes: string; no: string; who: string }> = {
    glutenFree: { emoji: '🌾', question: '¿Lo pediste sin gluten?', yes: 'Sin problemas', no: 'Me sentó mal', who: 'celíacos' },
    lactoseFree: { emoji: '🥛', question: '¿Lo pediste sin lactosa?', yes: 'Sin problemas', no: 'Me sentó mal', who: 'intolerantes a la lactosa' },
    vegetarian: { emoji: '🥦', question: '¿Era vegetariano?', yes: 'Sí', no: 'No', who: 'personas' },
    vegan: { emoji: '🌱', question: '¿Era vegano?', yes: 'Sí', no: 'No', who: 'personas' },
    stepFree: { emoji: '♿', question: '¿Entrada sin escalones?', yes: 'Sí', no: 'No', who: 'personas' },
    accessibleRestroom: { emoji: '♿', question: '¿Baño adaptado?', yes: 'Sí', no: 'No', who: 'personas' },
    petFriendly: { emoji: '🐾', question: '¿Admiten mascotas?', yes: 'Sí', no: 'No', who: 'personas' },
};

const count = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0);

/** Qué dice la gente: «yes» solo si nadie dice lo contrario (para un celíaco, un «me sentó mal» pesa). */
export function aptVerdict(counts: AptCounts | undefined | null): AptAnswer | 'mixed' | null {
    const yes = count(counts?.yes);
    const no = count(counts?.no);
    if (yes === 0 && no === 0) return null;
    if (no === 0) return 'yes';
    if (yes === 0) return 'no';
    return 'mixed';
}

/** «✅ 4 celíacos: sin problemas · ⚠️ 1: me sentó mal». Vacío si nadie ha dicho nada. */
export function aptSummary(key: AptKey, counts: AptCounts | undefined | null): string {
    const yes = count(counts?.yes);
    const no = count(counts?.no);
    if (!yes && !no) return '';
    const q = APT_QUESTIONS[key];
    const parts = [
        yes ? `✅ ${yes} ${q.who}: ${q.yes.toLowerCase()}` : '',
        no ? `⚠️ ${no}: ${q.no.toLowerCase()}` : '',
    ].filter(Boolean);
    return `${q.emoji} ${parts.join(' · ')}`;
}

export function itemAptCounts(aptFor: unknown, itemKey: string): Partial<Record<AptKey, AptCounts>> {
    const items = (aptFor as AptFor | null | undefined)?.items;
    return (items && typeof items === 'object' && items[itemKey]) || {};
}

/** Claves con veredicto «sí» de un elemento (sirven a los filtros de las listas). */
export function itemAptOk(aptFor: unknown, itemKey: string): AptKey[] {
    const counts = itemAptCounts(aptFor, itemKey);
    return APT_ITEM_KEYS.filter((key) => aptVerdict(counts[key]) === 'yes');
}

/**
 * Lo que dice la gente del sitio, con las claves de Google: sirve de respaldo a
 * los datos oficiales (Google o el local mandan si los hay).
 */
export function crowdPlaceSignals(aptFor: unknown): { accessibility: Record<string, boolean>; pets: Record<string, boolean> } {
    const place = (aptFor as AptFor | null | undefined)?.place || {};
    const accessibility: Record<string, boolean> = {};
    const pets: Record<string, boolean> = {};
    const set = (target: Record<string, boolean>, field: string, counts: AptCounts | undefined) => {
        const verdict = aptVerdict(counts);
        if (verdict === 'yes') target[field] = true;
        else if (verdict === 'no') target[field] = false;
    };
    set(accessibility, 'wheelchairAccessibleEntrance', place.stepFree);
    set(accessibility, 'wheelchairAccessibleRestroom', place.accessibleRestroom);
    set(pets, 'petFriendly', place.petFriendly);
    return { accessibility, pets };
}
