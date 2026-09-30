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
