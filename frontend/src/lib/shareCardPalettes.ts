/** Colores de la tarjeta (siempre de fondo oscuro: el texto va en blanco), uno por tema. */
export type CardPaletteId = 'dark' | 'neon' | 'graphite' | 'warm' | 'cool' | 'sunset' | 'lagoon';

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
        label: 'Medianoche', bg: '#0d1431', bgRgb: '13,20,49', panelRgb: '24,32,66',
        accent: '#6366f1', accent2: '#a855f7', accentRgb: '99,102,241', accentSoft: '#a5b4fc', chipText: '#c7d2fe',
        highlight: '#67e8f9', pin: '#22d3ee', glow: 'rgba(49,46,129,0.95)', glow2: 'rgba(14,116,144,0.28)',
    },
    neon: {
        label: 'Neón', bg: '#170a28', bgRgb: '23,10,40', panelRgb: '36,18,58',
        accent: '#ec4899', accent2: '#8b5cf6', accentRgb: '236,72,153', accentSoft: '#f9a8d4', chipText: '#fbcfe8',
        highlight: '#f0abfc', pin: '#e879f9', glow: 'rgba(131,24,67,0.9)', glow2: 'rgba(91,33,182,0.35)',
    },
    graphite: {
        label: 'Pizarra', bg: '#26332e', bgRgb: '38,51,46', panelRgb: '50,66,60',
        accent: '#65a30d', accent2: '#0891b2', accentRgb: '101,163,13', accentSoft: '#d9f99d', chipText: '#ecfccb',
        highlight: '#bef264', pin: '#a3e635', glow: 'rgba(54,83,20,0.85)', glow2: 'rgba(14,116,144,0.3)',
    },
    warm: {
        label: 'Cálido', bg: '#3a1c13', bgRgb: '58,28,19', panelRgb: '76,38,26',
        accent: '#f97316', accent2: '#dc2626', accentRgb: '249,115,22', accentSoft: '#fdba74', chipText: '#fed7aa',
        highlight: '#fcd34d', pin: '#fb923c', glow: 'rgba(124,45,18,0.9)', glow2: 'rgba(153,27,27,0.3)',
    },
    cool: {
        // Fresco ahora es claro, pero la tarjeta pinta el texto en blanco: menta oscura con fresa.
        label: 'Fresco', bg: '#0f3d36', bgRgb: '15,61,54', panelRgb: '24,82,73',
        accent: '#14b8a6', accent2: '#e23d68', accentRgb: '20,184,166', accentSoft: '#99f6e4', chipText: '#ccfbf1',
        highlight: '#fda4af', pin: '#fb7185', glow: 'rgba(17,94,89,0.9)', glow2: 'rgba(226,61,104,0.35)',
    },
    sunset: {
        label: 'Atardecer', bg: '#4a2b52', bgRgb: '74,43,82', panelRgb: '94,55,103',
        accent: '#ff7a59', accent2: '#f43f5e', accentRgb: '255,122,89', accentSoft: '#ffc2ad', chipText: '#ffe4d6',
        highlight: '#fde68a', pin: '#ff8a65', glow: 'rgba(234,88,12,0.55)', glow2: 'rgba(190,24,93,0.4)',
    },
    lagoon: {
        label: 'Laguna', bg: '#1d5566', bgRgb: '29,85,102', panelRgb: '38,105,123',
        accent: '#f472b6', accent2: '#fb923c', accentRgb: '244,114,182', accentSoft: '#fbcfe8', chipText: '#fce7f3',
        highlight: '#fde047', pin: '#f9a8d4', glow: 'rgba(20,184,166,0.55)', glow2: 'rgba(219,39,119,0.35)',
    },
};

export const CARD_PALETTE_IDS = Object.keys(CARD_PALETTES) as CardPaletteId[];

/** El tema de la app si es oscuro; si no, «Medianoche». */
export const defaultCardPalette = (themeId?: string): CardPaletteId =>
    (CARD_PALETTE_IDS as string[]).includes(themeId || '') ? themeId as CardPaletteId : 'dark';
