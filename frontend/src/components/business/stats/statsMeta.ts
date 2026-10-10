/**
 * Dibujitos y textos de 📊 Estadísticas (spec §9). Solo presentación: las
 * claves son las que guarda la analítica (functions/modules/analytics.js) y
 * nunca se escriben emoji en los datos.
 *
 *   SOURCE_META.search                  // { emoji: '🔎', label: 'Buscadores' }
 *   metaFor(SHARE_ENTITY_META, 'otra')  // clave desconocida → { emoji: '✨', label: 'otra' }
 */
import type { AnalyticsDevice, AnalyticsShareChannel, AnalyticsSource } from '../../../services/AnalyticsService';
import type { ScoreBand } from '../../../lib/scoreScale';

export interface EmojiMeta {
    emoji: string;
    label: string;
}

/** Lo que se pide al servidor: 2 periodos de 30 días (el callable admite hasta 90). */
export const STATS_FETCH_DAYS = 60;

export type StatsPeriod = '7' | '30';

export const STATS_PERIODS: ReadonlyArray<{ value: StatsPeriod; days: number; emoji: string; label: string }> = [
    { value: '7', days: 7, emoji: '📅', label: '7 días' },
    { value: '30', days: 30, emoji: '🗓️', label: '30 días' },
];

export const periodDays = (period: StatsPeriod): number => (period === '7' ? 7 : 30);

/** Pestañas a las que mandan los atajos de 📊 (titulares, «Mejorar su ficha», campañas). */
export type StatsGoToTab = 'items' | 'sponsored';

/** De dónde llega la visita (`bySource`). */
export const SOURCE_META: Record<AnalyticsSource, EmojiMeta> = {
    search: { emoji: '🔎', label: 'Buscadores' },
    internal: { emoji: '🧭', label: 'Navegando por Listopic' },
    direct: { emoji: '🔗', label: 'Enlace directo' },
    social: { emoji: '📱', label: 'Redes sociales' },
    external: { emoji: '🌐', label: 'Otras webs' },
};
export const SOURCE_ORDER: readonly AnalyticsSource[] = ['search', 'internal', 'direct', 'social', 'external'];

/** Con qué aparato (`byDevice`). */
export const DEVICE_META: Record<AnalyticsDevice, EmojiMeta> = {
    mobile: { emoji: '📱', label: 'Móvil' },
    desktop: { emoji: '💻', label: 'Ordenador' },
    tablet: { emoji: '📲', label: 'Tablet' },
};
export const DEVICE_ORDER: readonly AnalyticsDevice[] = ['mobile', 'desktop', 'tablet'];

/** Por dónde comparten (`byShareChannel`). */
export const SHARE_CHANNEL_META: Record<AnalyticsShareChannel, EmojiMeta> = {
    whatsapp: { emoji: '💚', label: 'WhatsApp' },
    clipboard: { emoji: '🔗', label: 'Enlace copiado' },
    image: { emoji: '🖼️', label: 'Tarjeta con foto' },
    chat: { emoji: '💬', label: 'Chat de Listopic' },
};
export const SHARE_CHANNEL_ORDER: readonly AnalyticsShareChannel[] = ['whatsapp', 'clipboard', 'image', 'chat'];

/** Qué comparten (`byShareEntityType`; el servidor admite también profile, app y link). */
export const SHARE_ENTITY_META: Record<string, EmojiMeta> = {
    place: { emoji: '📍', label: 'Tu ficha' },
    group: { emoji: '🍽️', label: 'Un plato' },
    review: { emoji: '⭐', label: 'Una valoración' },
    list: { emoji: '📋', label: 'Una Lista' },
    sublist: { emoji: '📎', label: 'Una minilista' },
    profile: { emoji: '👤', label: 'Un perfil' },
    app: { emoji: '📲', label: 'Listopic' },
    link: { emoji: '🔗', label: 'Un enlace' },
};
export const SHARE_ENTITY_ORDER: readonly string[] = ['place', 'group', 'review', 'list', 'sublist'];

/** Meta de una clave, o la propia clave con un emoji genérico si no la conocemos. */
export const metaFor = (map: Record<string, EmojiMeta>, key: string): EmojiMeta => map[key] ?? { emoji: '✨', label: key };

/** Tramos del termómetro de notas, de mejor a peor (los de lib/scoreScale). */
export const SCORE_BANDS: readonly Exclude<ScoreBand, 'none'>[] = ['top', 'good', 'ok', 'low', 'bad'];

/** Días de la semana, empezando en lunes (índice 0 = lunes). */
export const WEEKDAYS: ReadonlyArray<{ short: string; name: string; plural: string }> = [
    { short: 'L', name: 'lunes', plural: 'lunes' },
    { short: 'M', name: 'martes', plural: 'martes' },
    { short: 'X', name: 'miércoles', plural: 'miércoles' },
    { short: 'J', name: 'jueves', plural: 'jueves' },
    { short: 'V', name: 'viernes', plural: 'viernes' },
    { short: 'S', name: 'sábado', plural: 'sábados' },
    { short: 'D', name: 'domingo', plural: 'domingos' },
];

/** Abreviaturas para «sáb 4 oct» (índice de Date#getUTCDay: 0 = domingo). */
export const WEEKDAY_ABBR: readonly string[] = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MONTH_ABBR: readonly string[] = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** Valoraciones mínimas para que un plato entre en «Mejor nota» o en el titular. */
export const MIN_RATINGS_FOR_STAR = 3;

/** Opiniones que se ven de entrada y como mucho en «🗣️ Lo último que dicen». */
export const LATEST_REVIEWS_COLLAPSED = 3;
export const LATEST_REVIEWS_EXPANDED = 10;

/** 🏆: podio (3) + filas compactas hasta 5; «Con margen de mejora» hasta 3. */
export const TOP_ITEMS_LIMIT = 5;
export const IMPROVE_ITEMS_LIMIT = 3;

/** Campañas que se listan en 📣 antes de mandar a Promos. */
export const CAMPAIGN_ROWS_LIMIT = 5;

/** Semanas completas para «📅 Tus días fuertes» (así cada día de la semana sale las mismas veces). */
export const WEEKDAY_WINDOW_DAYS = 56;
