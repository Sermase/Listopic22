/**
 * Escala única de color y texto para las notas (0–10) en toda la app.
 * Tramos al estilo de las notas del colegio: 9 sobresaliente, 7 notable, 5 aprobado.
 *
 * - Chapas (número sobre fondo de color, mapas, tarjetas para compartir):
 *   SCORE_BADGE[band] → { bg, fg } con contraste AA en ambos sentidos.
 * - Número suelto sobre el fondo del tema: scoreTextColor() → var(--lt-score-*),
 *   definido por tema en index.css.
 */

export type ScoreBand = 'top' | 'good' | 'ok' | 'low' | 'bad' | 'none';

export const SCORE_BAND_MIN: Record<Exclude<ScoreBand, 'none'>, number> = {
    top: 9,
    good: 7,
    ok: 5,
    low: 3,
    bad: 0,
};

export const SCORE_BADGE: Record<ScoreBand, { bg: string; fg: string }> = {
    top: { bg: '#047857', fg: '#ffffff' },
    good: { bg: '#34d399', fg: '#022c22' },
    ok: { bg: '#fbbf24', fg: '#451a03' },
    low: { bg: '#fb923c', fg: '#431407' },
    bad: { bg: '#dc2626', fg: '#ffffff' },
    none: { bg: '#94a3b8', fg: '#0f172a' },
};

/** Número de nota sobre fondo claro (mapas, popups, tema claro). Igual que --lt-score-* en .theme-light. */
export const SCORE_TEXT_ON_LIGHT: Record<ScoreBand, string> = {
    top: '#047857',
    good: '#15803d',
    ok: '#b45309',
    low: '#c2410c',
    bad: '#b91c1c',
    none: '#475569',
};

/** Número de nota sobre fondo oscuro (tarjetas para compartir, temas oscuros). Igual que --lt-score-* oscuro. */
export const SCORE_TEXT_ON_DARK: Record<ScoreBand, string> = {
    top: '#34d399',
    good: '#86efac',
    ok: '#fbbf24',
    low: '#fb923c',
    bad: '#f87171',
    none: '#94a3b8',
};

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
    top: 'Excelente',
    good: 'Muy bueno',
    ok: 'Bueno',
    low: 'Regular',
    bad: 'Mejorable',
    none: 'Sin nota',
};

export const SCORE_BAND_EMOJI: Record<ScoreBand, string> = {
    top: '🤩',
    good: '😍',
    ok: '😊',
    low: '😐',
    bad: '😬',
    none: '·',
};

export function scoreBand(score: unknown): ScoreBand {
    if (typeof score !== 'number' || !Number.isFinite(score)) return 'none';
    if (score >= SCORE_BAND_MIN.top) return 'top';
    if (score >= SCORE_BAND_MIN.good) return 'good';
    if (score >= SCORE_BAND_MIN.ok) return 'ok';
    if (score >= SCORE_BAND_MIN.low) return 'low';
    return 'bad';
}

export const scoreBadge = (score: unknown) => SCORE_BADGE[scoreBand(score)];

/** Estilo para una chapa de nota (fondo + número). */
export const scoreBadgeStyle = (score: unknown): { backgroundColor: string; color: string } => {
    const { bg, fg } = scoreBadge(score);
    return { backgroundColor: bg, color: fg };
};

/** Color para un número de nota escrito sobre el fondo del tema (cambia con el tema). */
export const scoreTextColor = (score: unknown) => `var(--lt-score-${scoreBand(score)})`;

/** "8.3", "10", "—". Un decimal como mucho, sin ceros de relleno en enteros. */
export function formatScore(score: unknown): string {
    if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** Paradas del degradado continuo: los mismos colores de las chapas, pero sin saltos entre tramos. */
const SCORE_GRADIENT_STOPS: [number, string][] = [
    [0, SCORE_BADGE.bad.bg],
    [3, SCORE_BADGE.low.bg],
    [5, SCORE_BADGE.ok.bg],
    [7, SCORE_BADGE.good.bg],
    [9, SCORE_BADGE.top.bg],
];

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Color gradual para una media (círculos que agrupan chinchetas): un 6,2 cae entre
 * el amarillo del 5 y el verde del 7. Sin nota, gris. El texto va blanco u oscuro según el fondo.
 */
export function scoreGradient(score: unknown): { bg: string; fg: string } {
    if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) return SCORE_BADGE.none;
    const s = Math.min(score, 10);
    let rgb = hexToRgb(SCORE_GRADIENT_STOPS[SCORE_GRADIENT_STOPS.length - 1][1]);
    for (let i = 1; i < SCORE_GRADIENT_STOPS.length; i++) {
        const [hi, hiColor] = SCORE_GRADIENT_STOPS[i];
        if (s > hi) continue;
        const [lo, loColor] = SCORE_GRADIENT_STOPS[i - 1];
        const t = (s - lo) / (hi - lo);
        const a = hexToRgb(loColor);
        const b = hexToRgb(hiColor);
        rgb = a.map((v, k) => Math.round(v + (b[k] - v) * t));
        break;
    }
    const [r, g, b] = rgb;
    // Luminancia aproximada: con fondos claros (amarillo, verde claro) el número va oscuro.
    const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
    return { bg: `rgb(${r}, ${g}, ${b})`, fg: light ? '#0f172a' : '#ffffff' };
}
