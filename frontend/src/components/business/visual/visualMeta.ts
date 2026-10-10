/**
 * Catálogo y reglas de 🎨 Imagen (spec §6): muestras de color, estilos de
 * portada, ideas de frase, validación de color y de enlace, y qué pasos están
 * listos. Sin React: lo usan la pestaña, la vista previa y los tests.
 */
import { EMPTY_VISUAL_DATA, type BusinessVisualData, type BusinessVisualStyle } from '../../../services/BusinessProService';

// ── Límites (los del servidor: business-pro.js) ──

/** heroText: el servidor recorta a 300. */
export const HERO_TEXT_MAX = 300;
/** En la ficha solo se ven 2 líneas: a partir de aquí, aviso. */
export const HERO_TEXT_SOFT_MAX = 120;
/** heroImageUrl: el servidor recorta a 500 (un enlace cortado ya no sirve). */
export const HERO_URL_MAX = 500;

// ── Pasos ──

export type VisualStepId = 'cover' | 'phrase' | 'color' | 'style';

export interface VisualStepMeta {
    id: VisualStepId;
    emoji: string;
    title: string;
    help: string;
}

export const VISUAL_STEPS: VisualStepMeta[] = [
    { id: 'cover', emoji: '📸', title: 'Portada', help: 'La foto grande de tu página. Que se vea tu local o tu plato estrella.' },
    { id: 'phrase', emoji: '💬', title: 'Tu frase', help: 'Una línea que cuente qué te hace especial.' },
    { id: 'color', emoji: '🎨', title: 'Tu color', help: 'El toque de color de tu página.' },
    { id: 'style', emoji: '🖌️', title: 'Estilo de portada', help: 'Cómo se ve la foto y el titular.' },
];

/** ¿Qué pasos tienen algo propio? El estilo cuenta si no es el de siempre. */
export const visualStepsDone = (data: BusinessVisualData): Record<VisualStepId, boolean> => ({
    cover: Boolean(data.heroImageUrl.trim()),
    phrase: Boolean(data.heroText.trim()),
    color: Boolean(data.accentColor),
    style: data.visualStyle !== EMPTY_VISUAL_DATA.visualStyle,
});

export const countStepsDone = (data: BusinessVisualData): number => (
    Object.values(visualStepsDone(data)).filter(Boolean).length
);

/** Todo en el look estándar de Listopic (nada propio). */
export const isStandardLook = (data: BusinessVisualData): boolean => (
    !data.heroImageUrl.trim()
    && !data.heroText.trim()
    && !data.accentColor
    && data.visualStyle === EMPTY_VISUAL_DATA.visualStyle
);

// ── 🎨 Color ──

export interface Swatch {
    /** '' = el color de Listopic (no se guarda ninguno). */
    value: string;
    emoji: string;
    name: string;
}

export const SWATCHES: Swatch[] = [
    { value: '', emoji: '🟣', name: 'Listopic' },
    { value: '#e4572e', emoji: '🍅', name: 'Tomate' },
    { value: '#f28c28', emoji: '🍊', name: 'Mandarina' },
    { value: '#e0a526', emoji: '🍯', name: 'Miel' },
    { value: '#8a9a3b', emoji: '🫒', name: 'Oliva' },
    { value: '#2f9e5b', emoji: '🌿', name: 'Albahaca' },
    { value: '#1f8ac0', emoji: '🌊', name: 'Mar' },
    { value: '#5b5bd6', emoji: '🫐', name: 'Arándano' },
    { value: '#8e44ad', emoji: '🍇', name: 'Uva' },
    { value: '#e05a8a', emoji: '🌸', name: 'Flor' },
    { value: '#8b5a3c', emoji: '🍫', name: 'Cacao' },
];

/** Valor de la tarjeta «🎨 El mío». */
export const CUSTOM_COLOR = 'custom';

export const HEX_ERROR = 'Usa un color tipo #e4572e';

const SHORT_HEX = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#?([0-9a-f]{6})$/i;

/**
 * Lo que escribe la persona → '#rrggbb' en minúsculas, o null si no es un
 * color. Acepta «#abc» (→ #aabbcc) y sin «#».
 */
export const normalizeHex = (input: string): string | null => {
    const text = input.trim();
    const short = SHORT_HEX.exec(text);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    const long = LONG_HEX.exec(text);
    return long ? `#${long[1].toLowerCase()}` : null;
};

/** Color guardado válido (lo que acepta el servidor). */
export const isValidAccent = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

/** Luminancia relativa (WCAG) de '#rrggbb': 0 negro … 1 blanco. */
export const hexLuminance = (hex: string): number | null => {
    if (!isValidAccent(hex)) return null;
    const channel = (offset: number) => {
        const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

/** Aviso si el color casi no se verá en algún tema. */
export const luminanceWarning = (hex: string): string | null => {
    const luminance = hexLuminance(hex);
    if (luminance == null) return null;
    if (luminance < 0.08) return '🌑 Muy oscuro: casi no se verá en modo oscuro';
    if (luminance > 0.85) return '☀️ Muy claro: casi no se verá en modo claro';
    return null;
};

/** Qué tarjeta de color corresponde a un valor guardado. */
export const colorChoiceOf = (accentColor: string): string => {
    if (!accentColor) return '';
    const value = accentColor.toLowerCase();
    return SWATCHES.some((swatch) => swatch.value === value) ? value : CUSTOM_COLOR;
};

/** «🍅 Tomate», «🟣 Listopic» o el hex. */
export const colorLabel = (accentColor: string): string => {
    const swatch = SWATCHES.find((entry) => entry.value === accentColor.toLowerCase());
    return swatch ? `${swatch.emoji} ${swatch.name}` : accentColor;
};

// ── 🖌️ Estilo ──

export interface StyleOption {
    value: BusinessVisualStyle;
    emoji: string;
    title: string;
    subtitle: string;
}

export const STYLE_OPTIONS: StyleOption[] = [
    { value: 'editorial', emoji: '📰', title: 'Editorial', subtitle: 'El de siempre: titular grande, aire de revista' },
    { value: 'clean', emoji: '🤍', title: 'Limpio', subtitle: 'Foto luminosa, poco filtro' },
    { value: 'warm', emoji: '🔥', title: 'Cálido', subtitle: 'Tonos tostados, como una sobremesa' },
    { value: 'night', emoji: '🌙', title: 'Noche', subtitle: 'Oscuro y con brillo, para bares y cócteles' },
];

export const styleOption = (style: BusinessVisualStyle): StyleOption => (
    STYLE_OPTIONS.find((option) => option.value === style) ?? STYLE_OPTIONS[0]
);

// ── 💬 Frase ──

export interface PhraseIdea {
    emoji: string;
    /** Lo que se escribe en la frase (sin el emoji: el emoji solo decora el chip). */
    text: string;
}

export const PHRASE_IDEAS: PhraseIdea[] = [
    { emoji: '🥘', text: 'Cocina de mercado, hecha cada mañana' },
    { emoji: '🌅', text: 'Terraza con vistas para alargar la sobremesa' },
    { emoji: '🥐', text: 'Brunch todos los fines de semana' },
    { emoji: '🍷', text: 'Vinos naturales y tapas de autor' },
    { emoji: '🐶', text: 'Aquí tu perro también es bienvenido' },
    { emoji: '🎶', text: 'Música en directo los jueves' },
    { emoji: '🌱', text: 'Opciones veganas en toda la carta' },
    { emoji: '👨‍👩‍👧', text: 'Pensado para venir en familia' },
];

/** Emoji para la frase (se escriben en el texto: los elige la persona). */
export const PHRASE_EMOJI: string[] = [
    '😋', '🍽️', '🥘', '🍕', '🍣', '🍔', '🌮', '🥗', '🥐', '🍰',
    '☕', '🍷', '🍺', '🍸', '🌱', '🐶', '🎶', '🌅', '☀️', '🔥',
    '✨', '❤️', '🎉', '🏡',
];

// ── 📸 Portada ──

export const COVER_TIPS: Array<{ emoji: string; text: string }> = [
    { emoji: '☀️', text: 'Luz natural' },
    { emoji: '🍽️', text: 'Tu plato estrella o tu sala' },
    { emoji: '🔤', text: 'Sin textos encima' },
];

export const BAD_IMAGE_LINK = 'Ese enlace no parece una imagen 🤔';

/**
 * Enlace pegado → URL http(s) completa (como hace el servidor: sin protocolo se
 * le pone https://), o un error. Que sea una imagen de verdad lo comprueba
 * después `probeImage`.
 */
export const normalizeImageUrl = (input: string): { url: string } | { error: string } => {
    const text = input.trim();
    if (!text) return { error: 'Pega el enlace de una foto.' };
    if (/\s/.test(text)) return { error: BAD_IMAGE_LINK };
    const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    let url: URL;
    try {
        url = new URL(withProtocol);
    } catch {
        return { error: BAD_IMAGE_LINK };
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname.includes('.')) return { error: BAD_IMAGE_LINK };
    const href = url.toString();
    if (href.length > HERO_URL_MAX) return { error: `Ese enlace es demasiado largo (máximo ${HERO_URL_MAX} caracteres).` };
    return { url: href };
};

// ── Resúmenes de las tarjetas cerradas (móvil) ──

const shorten = (text: string, max: number): string => {
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

export const stepSummary = (step: VisualStepId, data: BusinessVisualData): string => {
    switch (step) {
        case 'cover':
            return data.heroImageUrl ? 'foto propia ✅' : 'la foto del local';
        case 'phrase':
            return data.heroText.trim() ? `«${shorten(data.heroText, 32)}»` : 'sin frase';
        case 'color':
            return data.accentColor ? colorLabel(data.accentColor) : '🟣 Listopic';
        case 'style': {
            const option = styleOption(data.visualStyle);
            return `${option.emoji} ${option.title}`;
        }
    }
};
