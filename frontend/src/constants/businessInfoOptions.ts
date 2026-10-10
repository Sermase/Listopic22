import type {
    BusinessAccessibilityInfo,
    BusinessCommercialInfo,
    BusinessContactInfo,
    BusinessDietaryInfo,
    BusinessFamilyInfo,
    BusinessHoursPeriod,
    BusinessPetsInfo,
    CrossContaminationRisk,
    DeliveryProvider,
    PetPolicy,
    ReservationProvider,
} from '../types/businessInfo';

// Catálogo de la Ficha del negocio: etiqueta y emoji de cada opción, en un solo
// sitio para la gestión (BusinessManagePage) y la página pública (PlacePage).
//
// - `value` es lo que se guarda en Firestore, igual que siempre: no cambiar.
// - `key` es el campo booleano de la sección.
// - El emoji es solo presentación: nunca se guarda.
// - `label` se entiende sola (chips públicos, resúmenes); `short` es la versión
//   corta para cuando ya va dentro de su grupo con título (fichas de la gestión).

export { ALLERGEN_OPTIONS, allergenLabel } from '../services/BusinessProService';

export type InfoTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'promo';

/** Opción guardada como texto (enum o elemento de una lista). */
export interface InfoOption<V extends string = string> {
    value: V;
    label: string;
    emoji: string;
    short?: string;
    hint?: string;
}

/** Campo booleano de una sección, que se marca con una ficha o un chip. */
export interface InfoFlag<K extends string = string> {
    key: K;
    label: string;
    emoji: string;
    short?: string;
    hint?: string;
    /** Marca pequeña sobre el emoji (p. ej. «sin» en 🥛 Sin lácteos). */
    cornerBadge?: string;
}

/** Claves booleanas de una sección (para tipar las fichas). */
export type BooleanKeys<T> = {
    [K in keyof T]-?: NonNullable<T[K]> extends boolean ? K : never;
}[keyof T] & string;

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda de textos guardados (mayúsculas y tildes no importan)
// ─────────────────────────────────────────────────────────────────────────────

export const normalizeOptionText = (text: string): string => text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Opción cuyo valor o etiqueta coincide con un texto guardado, si la hay. */
export const findOptionByText = <O extends InfoOption>(options: readonly O[], text: string): O | undefined => {
    const wanted = normalizeOptionText(text);
    if (!wanted) return undefined;
    return options.find((option) => normalizeOptionText(option.value) === wanted || normalizeOptionText(option.label) === wanted);
};

/** Opción de un valor exacto (enums). */
export const findOptionByValue = <O extends InfoOption>(options: readonly O[], value: string | undefined): O | undefined => (
    value ? options.find((option) => option.value === value) : undefined
);

// ─────────────────────────────────────────────────────────────────────────────
// 🪪 Identidad
// ─────────────────────────────────────────────────────────────────────────────

export interface LanguageOption extends InfoOption {
    /** Otras formas en que puede estar guardado (códigos ISO, nombres propios). */
    aliases: string[];
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
    { value: 'Español', label: 'Español', emoji: '🇪🇸', aliases: ['es', 'castellano', 'spanish'] },
    { value: 'Inglés', label: 'Inglés', emoji: '🇬🇧', aliases: ['en', 'english'] },
    { value: 'Francés', label: 'Francés', emoji: '🇫🇷', aliases: ['fr', 'français', 'french'] },
    { value: 'Alemán', label: 'Alemán', emoji: '🇩🇪', aliases: ['de', 'deutsch', 'german'] },
    { value: 'Italiano', label: 'Italiano', emoji: '🇮🇹', aliases: ['it', 'italian'] },
    { value: 'Portugués', label: 'Portugués', emoji: '🇵🇹', aliases: ['pt', 'português', 'portuguese'] },
    { value: 'Neerlandés', label: 'Neerlandés', emoji: '🇳🇱', aliases: ['nl', 'holandés', 'dutch'] },
    { value: 'Catalán', label: 'Catalán/Valenciano', emoji: '🗣️', aliases: ['ca', 'català', 'valenciano', 'valencià', 'catalán / valenciano'] },
    { value: 'Euskera', label: 'Euskera', emoji: '🗣️', aliases: ['eu', 'euskara', 'vasco'] },
    { value: 'Gallego', label: 'Gallego', emoji: '🗣️', aliases: ['gl', 'galego'] },
    { value: 'Chino', label: 'Chino', emoji: '🇨🇳', aliases: ['zh', 'mandarín'] },
    { value: 'Japonés', label: 'Japonés', emoji: '🇯🇵', aliases: ['ja'] },
    { value: 'Ruso', label: 'Ruso', emoji: '🇷🇺', aliases: ['ru'] },
    { value: 'Árabe', label: 'Árabe', emoji: '🇸🇦', aliases: ['ar'] },
];

/** Idioma del catálogo para un texto guardado («español», «es», «Catalán»...). */
export const findLanguageOption = (stored: string): LanguageOption | undefined => {
    const wanted = normalizeOptionText(stored);
    if (!wanted) return undefined;
    return LANGUAGE_OPTIONS.find((option) => [option.value, option.label, ...option.aliases]
        .some((text) => normalizeOptionText(text) === wanted));
};

/** Ideas que insertan un comienzo de frase en la descripción. */
export const DESCRIPTION_IDEAS: Array<{ emoji: string; label: string; text: string }> = [
    { emoji: '✨', label: 'Especialidad de la casa', text: 'Nuestra especialidad es ' },
    { emoji: '🕰️', label: 'Desde cuándo abrís', text: 'Abrimos en ' },
    { emoji: '🎶', label: 'Ambiente', text: 'El ambiente es ' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 📞 Contacto
// ─────────────────────────────────────────────────────────────────────────────

export const CONTACT_FIELDS: Array<{ key: keyof BusinessContactInfo; label: string; emoji: string }> = [
    { key: 'phone', label: 'Teléfono', emoji: '📞' },
    { key: 'website', label: 'Web', emoji: '🌐' },
    { key: 'email', label: 'Email', emoji: '✉️' },
    { key: 'instagram', label: 'Instagram', emoji: '📸' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🛎️ Cocina, pagos y servicios
// ─────────────────────────────────────────────────────────────────────────────

export type PriceRange = NonNullable<BusinessCommercialInfo['priceRange']>;

export const PRICE_RANGE_OPTIONS: Array<InfoOption<PriceRange> & { symbol: string }> = [
    { value: 'low', label: 'Económico', emoji: '🪙', symbol: '€' },
    { value: 'medium', label: 'Medio', emoji: '💶', symbol: '€€' },
    { value: 'high', label: 'Alto', emoji: '💰', symbol: '€€€' },
    { value: 'premium', label: 'Premium', emoji: '💎', symbol: '€€€€' },
];

export const CUISINE_OPTIONS: InfoOption[] = [
    { value: 'Española', label: 'Española', emoji: '🥘' },
    { value: 'Mediterránea', label: 'Mediterránea', emoji: '🫒' },
    { value: 'Tapas', label: 'Tapas', emoji: '🍢' },
    { value: 'Bar', label: 'Bar', emoji: '🍺' },
    { value: 'Cafetería', label: 'Cafetería', emoji: '☕' },
    { value: 'Brunch', label: 'Brunch', emoji: '🥞' },
    { value: 'Italiana', label: 'Italiana', emoji: '🍝' },
    { value: 'Pizza', label: 'Pizza', emoji: '🍕' },
    { value: 'Hamburguesas', label: 'Hamburguesas', emoji: '🍔' },
    { value: 'Mexicana', label: 'Mexicana', emoji: '🌮' },
    { value: 'Japonesa', label: 'Japonesa', emoji: '🍱' },
    { value: 'Sushi', label: 'Sushi', emoji: '🍣' },
    { value: 'China', label: 'China', emoji: '🥡' },
    { value: 'India', label: 'India', emoji: '🍛' },
    { value: 'Vegana', label: 'Vegana', emoji: '🌱' },
    { value: 'Vegetariana', label: 'Vegetariana', emoji: '🥗' },
    { value: 'Sin gluten', label: 'Sin gluten', emoji: '🌾' },
    { value: 'Coctelería', label: 'Coctelería', emoji: '🍸' },
];

/** `common`: las «Más habituales», siempre a la vista; el resto va plegado. */
export const PAYMENT_OPTIONS: Array<InfoOption & { common?: boolean }> = [
    { value: 'Tarjeta', label: 'Tarjeta', emoji: '💳', common: true },
    { value: 'Efectivo', label: 'Efectivo', emoji: '💶', common: true },
    { value: 'Contactless', label: 'Contactless', emoji: '📶', common: true },
    { value: 'Bizum', label: 'Bizum', emoji: '📲', common: true },
    { value: 'Apple Pay', label: 'Apple Pay', emoji: '📱' },
    { value: 'Google Pay', label: 'Google Pay', emoji: '📱' },
    { value: 'PayPal', label: 'PayPal', emoji: '🅿️' },
    { value: 'Pago online', label: 'Pago online', emoji: '🌐' },
    { value: 'Pago en app', label: 'Pago en app', emoji: '📲' },
    { value: 'Ticket Restaurant', label: 'Ticket Restaurant', emoji: '🎟️' },
    { value: 'Cheque gourmet', label: 'Cheque gourmet', emoji: '🧾' },
    { value: 'Sodexo', label: 'Sodexo', emoji: '🎫' },
    { value: 'Transferencia', label: 'Transferencia', emoji: '🏦' },
    { value: 'Visa', label: 'Visa', emoji: '💳' },
    { value: 'Mastercard', label: 'Mastercard', emoji: '💳' },
    { value: 'American Express', label: 'American Express', emoji: '💳' },
    { value: 'Contra reembolso', label: 'Contra reembolso', emoji: '📦' },
];

export interface ServiceGroup {
    id: 'eat' | 'moments' | 'drinks' | 'events' | 'family' | 'comfort' | 'arrival';
    emoji: string;
    title: string;
    options: InfoOption[];
}

export const SERVICE_GROUPS: ServiceGroup[] = [
    {
        id: 'eat',
        emoji: '🍽️',
        title: 'Comer y reservar',
        options: [
            { value: 'Comer en local', label: 'Comer en local', emoji: '🍽️' },
            { value: 'Reservas', label: 'Reservas', emoji: '📅', hint: 'Configura el botón en 📅 Reservas →' },
            { value: 'Terraza', label: 'Terraza', emoji: '⛱️' },
            { value: 'Para llevar', label: 'Para llevar', emoji: '🥡' },
        ],
    },
    {
        id: 'moments',
        emoji: '⏰',
        title: 'Momentos del día',
        options: [
            { value: 'Desayunos', label: 'Desayunos', emoji: '🥐' },
            { value: 'Brunch', label: 'Brunch', emoji: '🥞' },
            { value: 'Comidas', label: 'Comidas', emoji: '🍲' },
            { value: 'Cenas', label: 'Cenas', emoji: '🌙' },
            { value: 'Menú del día', label: 'Menú del día', emoji: '📋' },
            { value: 'Menú infantil', label: 'Menú infantil', emoji: '🧸' },
        ],
    },
    {
        id: 'drinks',
        emoji: '🍷',
        title: 'Bebidas',
        options: [
            { value: 'Café', label: 'Café', emoji: '☕' },
            { value: 'Copas', label: 'Copas', emoji: '🥃' },
            { value: 'Cócteles', label: 'Cócteles', emoji: '🍸' },
            { value: 'Vino', label: 'Vino', emoji: '🍷' },
            { value: 'Cerveza', label: 'Cerveza', emoji: '🍺' },
        ],
    },
    {
        id: 'events',
        emoji: '🎉',
        title: 'Ambiente y eventos',
        options: [
            { value: 'Música en directo', label: 'Música en directo', emoji: '🎸' },
            { value: 'Eventos privados', label: 'Eventos privados', emoji: '🎉' },
            { value: 'Catering', label: 'Catering', emoji: '🧑‍🍳' },
            { value: 'Cumpleaños', label: 'Cumpleaños', emoji: '🎂' },
            { value: 'Apto para grupos', label: 'Apto para grupos', emoji: '👥' },
            { value: 'Zona tranquila', label: 'Zona tranquila', emoji: '🤫' },
            { value: 'Zona fumadores', label: 'Zona fumadores', emoji: '🚬' },
        ],
    },
    {
        id: 'family',
        emoji: '👨‍👩‍👧',
        title: 'Familias',
        options: [
            { value: 'Apto para familias', label: 'Apto para familias', emoji: '👨‍👩‍👧' },
            { value: 'Tronas', label: 'Tronas', emoji: '🪑' },
        ],
    },
    {
        id: 'comfort',
        emoji: '🛋️',
        title: 'Comodidades',
        options: [
            { value: 'WiFi', label: 'WiFi', emoji: '📶' },
            { value: 'Enchufes', label: 'Enchufes', emoji: '🔌' },
            { value: 'Aire acondicionado', label: 'Aire acondicionado', emoji: '❄️' },
            { value: 'Calefacción', label: 'Calefacción', emoji: '🔥' },
            { value: 'Televisión', label: 'Televisión', emoji: '📺' },
            { value: 'Vistas', label: 'Vistas', emoji: '🌅' },
            { value: 'Azotea', label: 'Azotea', emoji: '🏙️' },
        ],
    },
    {
        id: 'arrival',
        emoji: '🚗',
        title: 'Llegada',
        options: [
            { value: 'Parking', label: 'Parking', emoji: '🅿️' },
            { value: 'Parking cercano', label: 'Parking cercano', emoji: '🚗' },
            { value: 'Aparcacoches', label: 'Aparcacoches', emoji: '🔑' },
        ],
    },
];

export const SERVICE_OPTIONS: InfoOption[] = SERVICE_GROUPS.flatMap((group) => group.options);

// ─────────────────────────────────────────────────────────────────────────────
// ♿ Accesibilidad
// ─────────────────────────────────────────────────────────────────────────────

export type AccessibilityFlagKey = BooleanKeys<BusinessAccessibilityInfo>;

export interface AccessibilityGroup {
    id: 'mobility' | 'visual' | 'hearing' | 'cognitive';
    emoji: string;
    title: string;
    help?: string;
    options: Array<InfoFlag<AccessibilityFlagKey>>;
}

export const ACCESSIBILITY_GROUPS: AccessibilityGroup[] = [
    {
        id: 'mobility',
        emoji: '♿',
        title: 'Movilidad',
        help: 'Personas con silla de ruedas o movilidad reducida.',
        options: [
            { key: 'stepFreeEntrance', label: 'Entrada sin escalones', emoji: '🚪', hint: 'Una persona en silla de ruedas puede entrar sin necesidad de ayuda externa ni rampa portátil.' },
            { key: 'accessibleBathroom', label: 'Baño adaptado', emoji: '🚻', hint: 'Con espacio suficiente para giro de silla y barras de apoyo.' },
            { key: 'rampAvailable', label: 'Rampa permanente', emoji: '🛤️' },
            { key: 'wheelchairFriendlyTables', label: 'Mesas para silla de ruedas', emoji: '🪑' },
            { key: 'elevator', label: 'Ascensor', emoji: '🛗', hint: 'Si el local tiene varias plantas.' },
            { key: 'accessibleParking', label: 'Aparcamiento PMR', emoji: '🅿️', hint: 'Propio o cercano.' },
            { key: 'bathroomGrabBars', label: 'Barras de apoyo en el baño', short: 'Barras de apoyo', emoji: '🦾' },
        ],
    },
    {
        id: 'visual',
        emoji: '🦯',
        title: 'Visión',
        help: 'Personas ciegas o con baja visión.',
        options: [
            { key: 'guideDogsWelcome', label: 'Perros guía bienvenidos', short: 'Perros guía', emoji: '🦮' },
            { key: 'brailleMenu', label: 'Carta en braille', emoji: '⠿' },
            { key: 'largePrintMenu', label: 'Carta en letra grande', short: 'Letra grande', emoji: '🔍' },
            { key: 'digitalMenuScreenReader', label: 'Carta digital accesible', emoji: '📱', hint: 'El QR o web del menú se lee correctamente con TalkBack (Android) o VoiceOver (iOS).' },
        ],
    },
    {
        id: 'hearing',
        emoji: '🦻',
        title: 'Audición',
        help: 'Personas sordas o con baja audición.',
        options: [
            { key: 'hearingLoop', label: 'Bucle magnético', emoji: '🦻', hint: 'Sistema que conecta directamente con audífonos en modo T para oír al personal con claridad.' },
            { key: 'visualMenu', label: 'Carta visual', emoji: '🖼️', hint: 'Se puede pedir sin depender de oír al camarero recitar la carta o las opciones.' },
            { key: 'quietEnvironment', label: 'Poco ruido', emoji: '🤫' },
            { key: 'signLanguageStaff', label: 'Personal con lengua de signos', short: 'Lengua de signos', emoji: '🤟' },
        ],
    },
    {
        id: 'cognitive',
        emoji: '🧩',
        title: 'Cognitiva y sensorial',
        help: 'Incluye personas con TEA.',
        options: [
            { key: 'pictogramMenu', label: 'Carta con pictogramas', short: 'Pictogramas', emoji: '🧩' },
            { key: 'easyReadMenu', label: 'Carta en lectura fácil', short: 'Lectura fácil', emoji: '📖', hint: 'Texto sencillo, frases cortas e imágenes de apoyo. Pensado para personas con dificultades de lectura o comprensión.' },
            { key: 'sensoryFriendlyArea', label: 'Zona con poca estimulación', short: 'Zona tranquila', emoji: '🌿' },
        ],
    },
];

export const ACCESSIBILITY_OPTIONS: Array<InfoFlag<AccessibilityFlagKey>> = ACCESSIBILITY_GROUPS.flatMap((group) => group.options);

// ─────────────────────────────────────────────────────────────────────────────
// 👨‍👩‍👧 Familias
// ─────────────────────────────────────────────────────────────────────────────

export type FamilyFlagKey = BooleanKeys<BusinessFamilyInfo>;

export const FAMILY_OPTIONS: Array<InfoFlag<FamilyFlagKey>> = [
    { key: 'babyChanging', label: 'Cambiador para bebés', short: 'Cambiador', emoji: '🚼' },
    { key: 'familyRestroom', label: 'Baño familiar', emoji: '🚻' },
    { key: 'highChairs', label: 'Tronas', emoji: '🪑' },
    { key: 'kidsMenu', label: 'Menú infantil', emoji: '🧒' },
    { key: 'playArea', label: 'Zona de juegos', emoji: '🛝' },
    { key: 'strollerFriendly', label: 'Se entra con carrito', emoji: '👶' },
    { key: 'bottleWarming', label: 'Calientan biberones', emoji: '🍼' },
    { key: 'breastfeedingFriendly', label: 'Espacio para amamantar', emoji: '🤱' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🐾 Mascotas
// ─────────────────────────────────────────────────────────────────────────────

export type PetFlagKey = BooleanKeys<BusinessPetsInfo>;

export const PET_POLICY_OPTIONS: Array<InfoOption<PetPolicy>> = [
    { value: 'allowed', label: 'Todas las mascotas bienvenidas', short: 'Todas bienvenidas', emoji: '🐾' },
    { value: 'dogs_only', label: 'Solo perros', emoji: '🐶' },
    { value: 'terrace_only', label: 'Solo en terraza', emoji: '☀️' },
    { value: 'assistance_only', label: 'Solo perros de asistencia', emoji: '🦮' },
    { value: 'not_allowed', label: 'No se admiten mascotas', short: 'No se admiten', emoji: '🚫' },
    { value: 'unknown', label: 'Sin indicar', emoji: '🤷' },
];

/** Políticas con las que tiene sentido preguntar «¿Qué les ofrecéis?». */
export const PET_POLICIES_WITH_AMENITIES: PetPolicy[] = ['allowed', 'dogs_only', 'terrace_only'];

/** Lo que ofrece el local a las mascotas (fichas del paso 2). */
export const PET_AMENITY_OPTIONS: Array<InfoFlag<PetFlagKey>> = [
    { key: 'indoorAllowed', label: 'Mascotas también dentro', short: 'También dentro', emoji: '🏠' },
    { key: 'waterBowls', label: 'Cuencos de agua', emoji: '💧' },
    { key: 'treatsAvailable', label: 'Chuches para mascotas', short: 'Chuches', emoji: '🦴' },
    { key: 'petMenu', label: 'Menú para mascotas', emoji: '🍖' },
    { key: 'requiresLeash', label: 'Correa obligatoria', emoji: '🦮' },
    { key: 'sizeRestrictions', label: 'Límite de tamaño', emoji: '📏' },
];

/** Booleanos que se derivan de la política (no se marcan a mano). */
export const PET_POLICY_FLAGS: Array<InfoFlag<PetFlagKey>> = [
    { key: 'petFriendly', label: 'Admite mascotas', emoji: '🐾' },
    { key: 'allowsDogs', label: 'Admite perros', emoji: '🐶' },
    { key: 'allowsCats', label: 'Admite gatos', emoji: '🐱' },
    { key: 'terraceOnly', label: 'Solo en terraza', emoji: '☀️' },
    { key: 'assistanceDogsOnly', label: 'Solo perros de asistencia', emoji: '🦮' },
];

/**
 * Condiciones habituales. `value` es el texto guardado; la etiqueta es más corta.
 * `legacy`: ya lo cubre otra opción (la ficha de correa); se muestra solo si está guardado.
 */
export const PET_CONDITION_OPTIONS: Array<InfoOption & { legacy?: boolean }> = [
    { value: 'Solo perros pequeños', label: 'Solo perros pequeños', emoji: '🐕' },
    { value: 'Solo con correa', label: 'Solo con correa', emoji: '🦮', legacy: true },
    { value: 'No se permite subir a sillas', label: 'No subir a sillas', emoji: '🪑' },
    { value: 'Evitar horas de mucha afluencia', label: 'Evitar horas punta', emoji: '⏰' },
    { value: 'Consultar antes de reservar', label: 'Consultar antes', emoji: '📞' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🥗 Alérgenos y dietas
// ─────────────────────────────────────────────────────────────────────────────

export type DietaryFlagKey = BooleanKeys<BusinessDietaryInfo>;

/** Escalera «sin gluten»: marcar la segunda marca también la primera. */
export const GLUTEN_OPTIONS: Array<InfoFlag<DietaryFlagKey>> = [
    { key: 'glutenFreeOptions', label: 'Opciones sin gluten', short: 'Algunas opciones', emoji: '🌾' },
    { key: 'manyGlutenFreeOptions', label: 'Muchos platos sin gluten', short: 'Muchos platos', emoji: '🌾🌾' },
    { key: 'glutenFreeMenu', label: 'Carta o sección sin gluten', emoji: '📋' },
];

export const CROSS_CONTAMINATION_OPTIONS: Array<InfoOption<CrossContaminationRisk> & { tone: InfoTone }> = [
    { value: 'unknown', label: 'Sin indicar', emoji: '❔', tone: 'neutral' },
    { value: 'possible', label: 'Puede haber trazas', emoji: '⚠️', tone: 'warning' },
    { value: 'controlled', label: 'Protocolo contra la contaminación cruzada', short: 'Protocolo para evitarla', emoji: '🛡️', tone: 'neutral' },
    { value: 'dedicated', label: 'Zona o preparación separada', emoji: '✅', tone: 'success' },
];

export const DIET_OPTIONS: Array<InfoFlag<DietaryFlagKey>> = [
    { key: 'vegetarianOptions', label: 'Vegetariano', emoji: '🥦' },
    { key: 'veganOptions', label: 'Vegano', emoji: '🌱' },
    { key: 'dairyFreeOptions', label: 'Sin lácteos', emoji: '🥛', cornerBadge: 'sin' },
    { key: 'nutFreeOptions', label: 'Sin frutos secos', emoji: '🌰', cornerBadge: 'sin' },
    { key: 'eggFreeOptions', label: 'Sin huevo', emoji: '🥚', cornerBadge: 'sin' },
];

export const ALLERGEN_INFO_OPTIONS: Array<InfoFlag<DietaryFlagKey>> = [
    { key: 'allergenMenuAvailable', label: 'Carta de alérgenos disponible', emoji: '📋' },
    { key: 'staffCanAdviseAllergens', label: 'El personal informa de alérgenos', short: 'El personal informa', emoji: '🧑‍🍳' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🕒 Horarios
// ─────────────────────────────────────────────────────────────────────────────

/** `day` es el índice guardado en weeklySchedule (0 = lunes). */
export const WEEKDAY_OPTIONS: Array<{ day: number; label: string; short: string }> = [
    { day: 0, label: 'Lunes', short: 'L' },
    { day: 1, label: 'Martes', short: 'M' },
    { day: 2, label: 'Miércoles', short: 'X' },
    { day: 3, label: 'Jueves', short: 'J' },
    { day: 4, label: 'Viernes', short: 'V' },
    { day: 5, label: 'Sábado', short: 'S' },
    { day: 6, label: 'Domingo', short: 'D' },
];

/** Nombre de cada turno por posición (1.º comida, 2.º cena). */
export const SHIFT_LABELS: Array<{ emoji: string; label: string }> = [
    { emoji: '🌞', label: 'Comida' },
    { emoji: '🌙', label: 'Cena' },
];

export const MAX_SHIFTS_PER_DAY = 4;

export const HOURS_PRESETS: Array<{ id: string; emoji: string; label: string; periods: BusinessHoursPeriod[] }> = [
    { id: 'cafe', emoji: '☕', label: 'Cafetería', periods: [{ open: '08:00', close: '20:00' }] },
    { id: 'restaurant', emoji: '🍽️', label: 'Restaurante', periods: [{ open: '13:00', close: '16:00' }, { open: '20:00', close: '23:30' }] },
    { id: 'bar', emoji: '🍸', label: 'Bar de copas', periods: [{ open: '19:00', close: '02:00' }] },
];

// ─────────────────────────────────────────────────────────────────────────────
// 📅 Reservas
// ─────────────────────────────────────────────────────────────────────────────

export const RESERVATION_PROVIDER_OPTIONS: Array<InfoOption<ReservationProvider>> = [
    { value: 'covermanager', label: 'CoverManager', emoji: '🍽️' },
    { value: 'thefork', label: 'TheFork', emoji: '🍴' },
    { value: 'opentable', label: 'OpenTable', emoji: '🪑' },
    { value: 'zenchef', label: 'Zenchef', emoji: '👨‍🍳' },
    { value: 'resy', label: 'Resy', emoji: '🗽' },
    { value: 'google', label: 'Google Reserve', emoji: '🔍' },
    { value: 'custom', label: 'Otro / propio', emoji: '🔗' },
];

export const RESERVATION_BUTTON_TEXTS = ['Reservar mesa', 'Reservar', 'Pedir cita'];

export const DEFAULT_RESERVATION_BUTTON_TEXT = 'Reservar mesa';

// ─────────────────────────────────────────────────────────────────────────────
// 🛵 Delivery
// ─────────────────────────────────────────────────────────────────────────────

export const DELIVERY_PROVIDER_OPTIONS: Array<InfoOption<DeliveryProvider>> = [
    { value: 'glovo', label: 'Glovo', emoji: '🟡' },
    { value: 'justeat', label: 'Just Eat', emoji: '🧡' },
    { value: 'ubereats', label: 'Uber Eats', emoji: '🚗' },
    { value: 'deliveroo', label: 'Deliveroo', emoji: '🦘' },
    { value: 'deliverect', label: 'Deliverect', emoji: '🔌' },
    { value: 'own', label: 'Web propia', emoji: '🏠' },
    { value: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
    { value: 'custom', label: 'Otro', emoji: '🔗' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Límites del backend (sanitizeBusinessInfoData en functions/modules/business-claims.js)
// ─────────────────────────────────────────────────────────────────────────────

export const INFO_LIMITS = {
    displayName: 120,
    description: 1400,
    languages: 12,
    cuisineTypes: 20,
    paymentMethods: 20,
    services: 30,
    petRestrictions: 20,
    allergens: 20,
    deliveryLinks: 8,
    deliveryLabel: 60,
    reservationButtonText: 50,
    crossContaminationNotes: 700,
    /** Notas de accesibilidad, familias, horarios y delivery. */
    notes: 700,
    /** Notas de mascotas y de alérgenos y dietas. */
    longNotes: 900,
} as const;
