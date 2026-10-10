/**
 * Dibujitos y textos de la carta (spec §7). Solo presentación: los emoji se
 * calculan a partir de lo guardado y nunca se escriben en los datos, salvo el
 * emoji que el negocio elige a mano para una sección (prefijo del nombre).
 *
 *   sectionEmoji('Postres')            // '🍰'
 *   sectionEmoji('🍩 Dulces')          // '🍩' (elegido por el negocio)
 *   ingredientEmoji('Tomates cherry')  // '🍅'
 *   allergenHints(['queso', 'pan'], [])  // ['lacteos', 'gluten']
 *   itemCompletion(data, { sections })  // { percent: 60, checks: [...] }
 */
import { buildTagString } from '../../TagEmojiPicker';
import { ALLERGEN_OPTIONS, type ItemBusinessData, type ItemProposalStatus, type ItemProposalType } from '../../../services/BusinessProService';
import { foldText, type StatusMeta } from '../kit';

// El precio se normaliza igual que en el servidor (kit/price.ts).
export { formatPriceInput, MAX_PRICE_TEXT } from '../kit';

const foldWords = (value: string): string[] => foldText(value).replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter(Boolean);

/**
 * Una palabra que empieza por la clave («postre» → «Postres»); con espacios, el
 * texto seguido; con «=» delante, la palabra exacta o su plural («=pan» → «pan»,
 * «panes», pero no «panceta»).
 */
const matchesKeyword = (words: string[], folded: string, keyword: string): boolean => {
    if (keyword.startsWith('=')) {
        const base = keyword.slice(1);
        return words.some((word) => word === base || word === `${base}s` || word === `${base}es`);
    }
    return keyword.includes(' ') ? folded.includes(keyword) : words.some((word) => word.startsWith(keyword));
};

// ── Secciones ───────────────────────────────────────────────────────────────

export const DEFAULT_SECTION_EMOJI = '🍴';

/** Palabras (sin tildes ni mayúsculas) → emoji. Gana la primera regla que encaja. */
export const SECTION_EMOJI_RULES: ReadonlyArray<{ keywords: readonly string[]; emoji: string }> = [
    { keywords: ['menu del dia', 'menu diario'], emoji: '📅' },
    { keywords: ['infantil', 'ninos', 'peques'], emoji: '🧒' },
    { keywords: ['fuera de carta', 'especial', 'sugerencia'], emoji: '⭐' },
    { keywords: ['veggie', 'vegano', 'vegana', 'vegetariano', 'vegetariana'], emoji: '🌱' },
    { keywords: ['sushi', 'maki', 'nigiri'], emoji: '🍣' },
    { keywords: ['coctel', 'cocktail', 'copas', 'gin'], emoji: '🍸' },
    { keywords: ['cerveza', 'cervezas', 'birra'], emoji: '🍺' },
    { keywords: ['vino', 'vinos', 'bodega', 'cava'], emoji: '🍷' },
    { keywords: ['cafe', 'cafes', 'infusion', 'infusiones'], emoji: '☕' },
    { keywords: ['desayuno', 'desayunos', 'brunch', 'meriendas'], emoji: '🥐' },
    { keywords: ['bebida', 'bebidas', 'refresco', 'refrescos', 'zumos'], emoji: '🥤' },
    { keywords: ['postre', 'postres', 'dulce', 'dulces', 'tartas'], emoji: '🍰' },
    { keywords: ['ensalada', 'ensaladas'], emoji: '🥬' },
    { keywords: ['hamburguesa', 'hamburguesas', 'burger', 'burgers'], emoji: '🍔' },
    { keywords: ['pizza', 'pizzas'], emoji: '🍕' },
    { keywords: ['arroz', 'arroces', 'paella', 'paellas'], emoji: '🥘' },
    { keywords: ['pescado', 'pescados', 'marisco', 'mariscos'], emoji: '🐟' },
    { keywords: ['carne', 'carnes', 'brasa'], emoji: '🥩' },
    { keywords: ['principal', 'principales', 'segundo', 'segundos', 'primeros', 'platos'], emoji: '🍝' },
    { keywords: ['tapa', 'tapas', 'pinchos', 'montaditos'], emoji: '🫒' },
    { keywords: ['entrante', 'entrantes', 'racion', 'raciones', 'para compartir', 'picoteo'], emoji: '🥗' },
];

// Un emoji (con variaciones y uniones ZWJ) al principio del nombre, seguido de espacio.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*️?)\s+(.+)$/u;

/** «🍩 Dulces» → { icon: '🍩', label: 'Dulces' }; «Postres» → { icon: '', label: 'Postres' }. */
export const splitSectionName = (name: string): { icon: string; label: string } => {
    const match = LEADING_EMOJI.exec(name.trim());
    return match ? { icon: match[1], label: match[2].trim() } : { icon: '', label: name.trim() };
};

/** Nombre guardado de una sección con el emoji que eligió el negocio (o sin él). */
export const buildSectionName = (icon: string, label: string): string => buildTagString(icon, label);

/** Emoji de una sección: el elegido por el negocio o el de la primera regla que encaja. */
export const sectionEmoji = (name: string): string => {
    const { icon, label } = splitSectionName(name);
    if (icon) return icon;
    const words = foldWords(label);
    const folded = words.join(' ');
    const rule = SECTION_EMOJI_RULES.find((entry) => entry.keywords.some((keyword) => matchesKeyword(words, folded, keyword)));
    return rule?.emoji || DEFAULT_SECTION_EMOJI;
};

/** Texto de la sección sin el emoji elegido (para títulos con su propia baldosa de emoji). */
export const sectionLabel = (name: string): string => splitSectionName(name).label || name;

/** ¿Ya hay otra sección que se llama igual (sin contar el emoji, tildes ni mayúsculas)? */
export const sectionNameTaken = (sections: readonly string[], name: string, except?: string): string | null => {
    const key = foldText(sectionLabel(name));
    return sections.find((entry) => entry !== except && foldText(sectionLabel(entry)) === key) ?? null;
};

/** Nombre de sección limpio, como lo deja el servidor (sin < ni >). */
export const cleanSectionName = (raw: string): string => raw.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

/** Chips rápidos de «＋ Nueva sección» (se ocultan si ya existe). */
export const QUICK_SECTIONS: readonly string[] = [
    'Entrantes', 'Principales', 'Postres', 'Bebidas', 'Menú del día', 'Especiales', 'Vinos',
    'Cafés', 'Tapas', 'Pizzas', 'Hamburguesas', 'Desayunos', 'Menú infantil',
];

/** «✨ Crear secciones típicas» (una sola llamada). */
export const TYPICAL_SECTIONS: readonly string[] = ['Entrantes', 'Principales', 'Postres', 'Bebidas'];

/** Emoji para elegir a mano el de una sección. */
export const SECTION_EMOJI_CHOICES: readonly string[] = [
    '🥗', '🫒', '🍝', '🥩', '🐟', '🦐', '🥘', '🍕', '🍔', '🌮', '🍣', '🍜', '🥬', '🧀', '🍰', '🍦',
    '🍫', '🥐', '🍳', '☕', '🥤', '🍷', '🍺', '🍸', '🧉', '📅', '⭐', '🧒', '🌱', '🔥', '🌶️', '🍴',
];

// ── Ingredientes ────────────────────────────────────────────────────────────

/** Palabra (sin tildes) con la que empieza alguna palabra del ingrediente → emoji. */
export const INGREDIENT_EMOJI: ReadonlyArray<{ keywords: readonly string[]; emoji: string }> = [
    { keywords: ['bacon', 'beicon', 'panceta', 'tocino'], emoji: '🥓' },
    { keywords: ['queso', 'mozzarella', 'parmesano', 'burrata', 'cheddar', 'feta'], emoji: '🧀' },
    { keywords: ['tomate'], emoji: '🍅' },
    { keywords: ['huevo', 'yema'], emoji: '🥚' },
    { keywords: ['pollo', 'pavo'], emoji: '🍗' },
    { keywords: ['ternera', 'vaca', 'buey', 'carne', 'solomillo', 'chuleton', 'cerdo', 'jamon', 'chorizo'], emoji: '🥩' },
    { keywords: ['gamba', 'langostino', 'carabinero', 'cigala'], emoji: '🦐' },
    { keywords: ['salmon', 'atun', 'bacalao', 'merluza', 'pescado', 'anchoa', 'boqueron', 'sardina'], emoji: '🐟' },
    { keywords: ['patata'], emoji: '🥔' },
    { keywords: ['cebolla', 'cebolleta', 'puerro'], emoji: '🧅' },
    { keywords: ['=ajo', 'ajillo', 'alioli'], emoji: '🧄' },
    { keywords: ['pimiento', 'piquillo'], emoji: '🫑' },
    { keywords: ['champinon', 'seta', 'boletus', 'hongo', 'trufa'], emoji: '🍄' },
    { keywords: ['aguacate', 'guacamole'], emoji: '🥑' },
    { keywords: ['limon', 'lima'], emoji: '🍋' },
    { keywords: ['chocolate', 'cacao'], emoji: '🍫' },
    { keywords: ['nata', 'leche', 'mantequilla', 'yogur', 'bechamel'], emoji: '🥛' },
    { keywords: ['harina', 'trigo'], emoji: '🌾' },
    { keywords: ['arroz'], emoji: '🍚' },
    { keywords: ['pasta', 'espagueti', 'macarron', 'tallarin', 'lasana'], emoji: '🍝' },
    { keywords: ['lechuga', 'rucula', 'canonigo', 'espinaca'], emoji: '🥬' },
    { keywords: ['zanahoria'], emoji: '🥕' },
    { keywords: ['maiz'], emoji: '🌽' },
    { keywords: ['miel'], emoji: '🍯' },
    { keywords: ['fresa', 'frambuesa', 'frutos rojos'], emoji: '🍓' },
    { keywords: ['aceituna', 'oliva'], emoji: '🫒' },
    { keywords: ['=pan', 'picos', 'tostada', 'baguette', 'chapata'], emoji: '🍞' },
    { keywords: ['galleta'], emoji: '🍪' },
    { keywords: ['cafe'], emoji: '☕' },
    { keywords: ['guindilla', 'chile', 'jalapeno', 'picante'], emoji: '🌶️' },
];

export const DEFAULT_INGREDIENT_EMOJI = '🔸';


export const ingredientEmoji = (ingredient: string): string => {
    const words = foldWords(ingredient);
    const folded = words.join(' ');
    const rule = INGREDIENT_EMOJI.find((entry) => entry.keywords.some((keyword) => matchesKeyword(words, folded, keyword)));
    return rule?.emoji || DEFAULT_INGREDIENT_EMOJI;
};

export const MAX_INGREDIENTS_TEXT = 300;

/** «queso, tomate , ,pan» → ['queso', 'tomate', 'pan'] (sin repetidos). */
export const splitIngredients = (text: string): string[] => {
    const seen = new Set<string>();
    return text.split(',').map((entry) => entry.trim()).filter((entry) => {
        const key = foldText(entry);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/** Se guarda como el texto de siempre: separado por comas. */
export const joinIngredients = (list: string[]): string => list.join(', ');

// ── Alérgenos ───────────────────────────────────────────────────────────────

/** Pistas por ingrediente: solo sugerencias, nunca se marcan solas. */
export const ALLERGEN_HINTS: Readonly<Record<string, readonly string[]>> = {
    gluten: ['harina', '=pan', 'pasta', 'trigo', 'galleta', 'rebozad', 'empanad', 'cerveza', 'cebada', 'centeno', 'avena', 'cuscus', 'bizcocho', 'masa', 'pizza', 'picos', 'tostada', 'croissant', 'espagueti', 'macarron', 'tallarin', 'lasana'],
    lacteos: ['queso', 'leche', 'nata', 'mantequilla', 'yogur', 'bechamel', 'mozzarella', 'parmesano', 'burrata', 'cheddar', 'feta', 'helado'],
    huevo: ['huevo', 'yema', 'mayonesa', 'alioli', 'tortilla', 'merengue'],
    pescado: ['salmon', 'atun', 'bacalao', 'merluza', 'anchoa', 'boqueron', 'sardina', 'pescado', 'dorada', 'lubina', 'rape'],
    crustaceos: ['gamba', 'langostino', 'cigala', 'bogavante', 'langosta', 'cangrejo', 'carabinero', 'necora', 'buey de mar'],
    moluscos: ['mejillon', 'almeja', 'calamar', 'pulpo', 'sepia', 'chipiron', 'ostra', 'berberecho', 'vieira', 'navaja'],
    frutos_secos: ['nuez', 'nueces', 'almendra', 'avellana', 'pistacho', 'anacardo', 'pinon', 'macadamia'],
    cacahuetes: ['cacahuete', '=mani'],
    soja: ['soja', 'tofu', 'edamame', 'miso'],
    sesamo: ['sesamo', 'ajonjoli', 'tahini', 'hummus'],
    mostaza: ['mostaza'],
    apio: ['apio'],
    sulfitos: ['vino', 'vinagre'],
    altramuces: ['altramuz', 'altramuces'],
};

/** Alérgenos que parecen ir en los ingredientes y aún no están marcados (en el orden de la lista oficial). */
export const allergenHints = (ingredients: string[], marked: string[]): string[] => {
    const markedSet = new Set(marked);
    const parsed = ingredients.map((ingredient) => {
        const words = foldWords(ingredient);
        return { words, folded: words.join(' ') };
    });
    return ALLERGEN_OPTIONS
        .map((option) => option.value)
        .filter((value) => !markedSet.has(value) && (ALLERGEN_HINTS[value] || []).some((keyword) => (
            parsed.some(({ words, folded }) => matchesKeyword(words, folded, keyword))
        )));
};

export const allergenOption = (value: string) => ALLERGEN_OPTIONS.find((option) => option.value === value);

// ── Promociones ─────────────────────────────────────────────────────────────

/** Rellenan el texto de «🏷️ Promoción» (se guarda solo el texto). */
export const PROMO_PRESETS: ReadonlyArray<{ emoji: string; text: string }> = [
    { emoji: '🎁', text: '2x1' },
    { emoji: '💸', text: '-10 %' },
    { emoji: '💸', text: '-20 %' },
    { emoji: '🕐', text: 'Happy hour' },
    { emoji: '🆕', text: 'Novedad' },
    { emoji: '👨‍🍳', text: 'Recomendado' },
    { emoji: '🔥', text: 'Solo hoy' },
];

export const MAX_DISCOUNT_TEXT = 80;
export const MAX_DESCRIPTION_TEXT = 500;
export const MAX_ITEM_NAME = 120;
export const MAX_SECTION_NAME = 40;

// ── Progreso de la carta ────────────────────────────────────────────────────

export type CartaCheckKey = 'section' | 'price' | 'description' | 'allergens' | 'ingredients';

export const CARTA_CHECKS: ReadonlyArray<{ key: CartaCheckKey; emoji: string; label: string; missing: string }> = [
    { key: 'section', emoji: '📂', label: 'Sección', missing: 'ponle sección' },
    { key: 'price', emoji: '💶', label: 'Precio', missing: 'añade el precio' },
    { key: 'description', emoji: '📝', label: 'Descripción', missing: 'añade una descripción' },
    { key: 'allergens', emoji: '⚠️', label: 'Alérgenos', missing: 'marca los alérgenos' },
    { key: 'ingredients', emoji: '🥕', label: 'Ingredientes', missing: 'añade ingredientes' },
];

export interface ItemCompletion {
    checks: Record<CartaCheckKey, boolean>;
    done: number;
    total: number;
    percent: number;
    /** Lo primero que falta, para el empujoncito. */
    nextMissing: (typeof CARTA_CHECKS)[number] | null;
}

/**
 * Las 5 comprobaciones de un plato. La sección cuenta solo si existe en la
 * carta; los alérgenos, con uno marcado o con el «✅ Revisado: sin alérgenos» local.
 */
export const itemCompletion = (
    data: Pick<ItemBusinessData, 'group' | 'price' | 'description' | 'allergens' | 'ingredients'>,
    { sections, reviewedNoAllergens = false }: { sections: readonly string[]; reviewedNoAllergens?: boolean },
): ItemCompletion => {
    const checks: Record<CartaCheckKey, boolean> = {
        section: Boolean(data.group) && sections.includes(data.group),
        price: Boolean(data.price.trim()),
        description: Boolean(data.description.trim()),
        allergens: data.allergens.length > 0 || reviewedNoAllergens,
        ingredients: Boolean(data.ingredients.trim()),
    };
    const done = CARTA_CHECKS.filter((check) => checks[check.key]).length;
    return {
        checks,
        done,
        total: CARTA_CHECKS.length,
        percent: Math.round((done / CARTA_CHECKS.length) * 100),
        nextMissing: CARTA_CHECKS.find((check) => !checks[check.key]) || null,
    };
};

/** Nivel de la carta según su progreso medio. */
export const cartaLevel = (percent: number): string => {
    if (percent > 90) return '⭐ Carta de estrella';
    if (percent > 60) return '👨‍🍳 Casi lista';
    if (percent > 25) return '🍳 Cocinando';
    return '🌱 Empezando';
};

// ── Propuestas ──────────────────────────────────────────────────────────────

export const PROPOSAL_STATUS_META: Record<ItemProposalStatus, StatusMeta> = {
    pending: { emoji: '⏳', label: 'Pendiente', tone: 'warning' },
    // Unos segundos, mientras el equipo de Listopic la aplica.
    applying: { emoji: '⚙️', label: 'Aplicándose', tone: 'accent' },
    approved: { emoji: '✅', label: 'Aprobada', tone: 'success' },
    rejected: { emoji: '❌', label: 'Rechazada', tone: 'danger' },
};

export const PROPOSAL_TYPE_META: Record<ItemProposalType, { emoji: string; label: string }> = {
    merge: { emoji: '🔗', label: 'Fusión' },
    rename: { emoji: '✏️', label: 'Renombre' },
    reassign_review: { emoji: '↔️', label: 'Mover valoración' },
};

/** El servidor admite 20 propuestas pendientes por negocio. */
export const MAX_PENDING_PROPOSALS = 20;
