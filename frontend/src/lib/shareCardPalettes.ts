/** Colores de la tarjeta, sacados de los temas oscuros de la app. */
export type CardPaletteId = 'dark' | 'neon' | 'graphite' | 'warm' | 'cool';

export interface CardPalette {
    label: string;
    bg: string;
    bgRgb: string;
    panelRgb: string;
    accent: string;
    accent2: string;
    accentRgb: string;
    accentSoft: string;
    chipText: string;
    highlight: string;
    pin: string;
    glow: string;
    glow2: string;
}

export const CARD_PALETTES: Record<CardPaletteId, CardPalette> = {
    dark: {
        label: 'Noche', bg: '#0b1021', bgRgb: '11,16,33', panelRgb: '21,27,46',
        accent: '#6366f1', accent2: '#a855f7', accentRgb: '99,102,241', accentSoft: '#a5b4fc', chipText: '#c7d2fe',
        highlight: '#67e8f9', pin: '#22d3ee', glow: 'rgba(49,46,129,0.95)', glow2: 'rgba(14,116,144,0.28)',
    },
    neon: {
        label: 'Neón', bg: '#12081a', bgRgb: '18,8,26', panelRgb: '31,16,41',
        accent: '#ec4899', accent2: '#8b5cf6', accentRgb: '236,72,153', accentSoft: '#f9a8d4', chipText: '#fbcfe8',
        highlight: '#f0abfc', pin: '#e879f9', glow: 'rgba(131,24,67,0.9)', glow2: 'rgba(91,33,182,0.35)',
    },
    graphite: {
        label: 'Grafito', bg: '#050506', bgRgb: '5,5,6', panelRgb: '20,20,23',
        accent: '#38bdf8', accent2: '#818cf8', accentRgb: '56,189,248', accentSoft: '#bae6fd', chipText: '#e0f2fe',
        highlight: '#7dd3fc', pin: '#38bdf8', glow: 'rgba(39,39,42,0.95)', glow2: 'rgba(12,74,110,0.3)',
    },
    warm: {
        label: 'Cálido', bg: '#1a0f0c', bgRgb: '26,15,12', panelRgb: '42,24,18',
        accent: '#f97316', accent2: '#dc2626', accentRgb: '249,115,22', accentSoft: '#fdba74', chipText: '#fed7aa',
        highlight: '#fcd34d', pin: '#fb923c', glow: 'rgba(124,45,18,0.9)', glow2: 'rgba(153,27,27,0.3)',
    },
    cool: {
        label: 'Fresco', bg: '#031a20', bgRgb: '3,26,32', panelRgb: '12,42,50',
        accent: '#14b8a6', accent2: '#06b6d4', accentRgb: '20,184,166', accentSoft: '#99f6e4', chipText: '#ccfbf1',
        highlight: '#5eead4', pin: '#2dd4bf', glow: 'rgba(17,94,89,0.9)', glow2: 'rgba(14,116,144,0.35)',
    },
};

export const CARD_PALETTE_IDS = Object.keys(CARD_PALETTES) as CardPaletteId[];

/** El tema de la app si es oscuro; si no, «Noche». */
export const defaultCardPalette = (themeId?: string): CardPaletteId =>
    (CARD_PALETTE_IDS as string[]).includes(themeId || '') ? themeId as CardPaletteId : 'dark';
