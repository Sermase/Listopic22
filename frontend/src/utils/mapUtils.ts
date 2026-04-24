import L from 'leaflet';

// ─── Capas de mapa disponibles ────────────────────────────────────────────────
export type MapLayerId = 'standard' | 'light' | 'dark' | 'satellite';

export interface MapLayerConfig {
    label: string;
    emoji: string;
    url: string;
    attribution: string;
    tileFilter?: string; // filtro CSS opcional para el tile pane
}

export const MAP_LAYERS: Record<MapLayerId, MapLayerConfig> = {
    standard: {
        label: 'Estándar',
        emoji: '🗺️',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    light: {
        label: 'Claro',
        emoji: '☀️',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        tileFilter: 'brightness(0.84) saturate(0.55) contrast(1.05)',
    },
    dark: {
        label: 'Oscuro',
        emoji: '🌑',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    satellite: {
        label: 'Satelital',
        emoji: '🛰️',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
};

export const DEFAULT_MAP_LAYER: MapLayerId = 'standard';
export const MAP_LAYER_STORAGE_KEY = 'listopic_map_layer';

/**
 * Devuelve colores para un rating (0-10).
 */
export const getRatingColor = (score: number | string): { bg: string; glow: string; border: string } => {
    const s = parseFloat(String(score));
    if (isNaN(s) || s === 0) return { bg: '#94a3b8', glow: 'rgba(148,163,184,0.4)', border: '#94a3b8' };
    if (s >= 8.5) return { bg: '#059669', glow: 'rgba(5,150,105,0.5)', border: '#059669' };
    if (s >= 7) return { bg: '#10b981', glow: 'rgba(16,185,129,0.45)', border: '#10b981' };
    if (s >= 5.5) return { bg: '#f59e0b', glow: 'rgba(245,158,11,0.45)', border: '#f59e0b' };
    if (s >= 4) return { bg: '#f97316', glow: 'rgba(249,115,22,0.45)', border: '#f97316' };
    return { bg: '#ef4444', glow: 'rgba(239,68,68,0.45)', border: '#ef4444' };
};

/** @deprecated */
export const getRatingHexColor = (score: number | string): string => getRatingColor(score).bg;

/**
 * Marcador estilo "lollipop": círculo blanco con borde de color + tallo fino.
 * El texto del score aparece en el color del rating — muy legible y moderno.
 */
export const createRatingMarkerIcon = (score: number): L.DivIcon => {
    const s = isNaN(score) ? 0 : score;
    const { bg } = getRatingColor(s);
    const scoreText = s === 0 ? '?' : (s % 1 === 0 ? s.toFixed(0) : s.toFixed(1));

    const r = 14;          // radio del círculo
    const cx = 15;         // centro x (r + 1 stroke)
    const cy = 15;         // centro y
    const stemTop = cy + r + 1;
    const stemBot = stemTop + 13;
    const dotCy = stemBot + 2.5;
    const totalW = 30;
    const totalH = Math.ceil(dotCy + 3);

    const fontSize = scoreText.length >= 3 ? 10 : 12;
    const filterId = `sm-${scoreText.replace('.', '')}`;

    const svgHtml = `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" overflow="visible">
  <defs>
    <filter id="${filterId}" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${bg}" flood-opacity="0.35"/>
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.18)" flood-opacity="1"/>
    </filter>
  </defs>
  <!-- Tallo -->
  <line x1="${cx}" y1="${stemTop}" x2="${cx}" y2="${stemBot}"
        stroke="${bg}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
  <!-- Punto inferior -->
  <circle cx="${cx}" cy="${dotCy}" r="2.5" fill="${bg}" opacity="0.85"/>
  <!-- Círculo blanco con borde de color -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${bg}"
          stroke-width="2.5" filter="url(#${filterId})"/>
  <!-- Score en color del rating -->
  <text x="${cx}" y="${cy + 1}"
        dominant-baseline="middle" text-anchor="middle"
        font-family="'Poppins','Inter',system-ui,sans-serif"
        font-size="${fontSize}" font-weight="800" fill="${bg}">
    ${scoreText}
  </text>
</svg>`;

    return L.divIcon({
        html: svgHtml,
        className: 'rating-marker',
        iconSize: [totalW, totalH],
        iconAnchor: [cx, totalH],
        popupAnchor: [0, -(totalH + 4)]
    });
};

export const createLegacyMarkerIcon = createRatingMarkerIcon;

/**
 * Marcador personalizado para colecciones que usa un emoji y un color.
 */
export const createEmojiMarkerIcon = (emoji: string, color: string): L.DivIcon => {
    const bg = color || '#6366f1';

    const r = 16;
    const cx = 16;
    const cy = 16;
    const stemTop = cy + r + 1;
    const stemBot = stemTop + 12;
    const dotCy = stemBot + 3;
    const totalW = 32;
    const totalH = Math.ceil(dotCy + 3);

    const filterId = `emj-${Math.random().toString(36).substr(2, 6)}`;

    const svgHtml = `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" overflow="visible">
  <defs>
    <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${bg}" flood-opacity="0.4"/>
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.18)" flood-opacity="1"/>
    </filter>
  </defs>
  <line x1="${cx}" y1="${stemTop}" x2="${cx}" y2="${stemBot}" stroke="${bg}" stroke-width="2.5" stroke-linecap="round" />
  <circle cx="${cx}" cy="${dotCy}" r="3" fill="${bg}" opacity="0.9"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${bg}" stroke-width="2.5" filter="url(#${filterId})"/>
  <text x="${cx}" y="${cy + 2}" dominant-baseline="middle" text-anchor="middle" font-size="16">${emoji || '📍'}</text>
</svg>`;

    return L.divIcon({
        html: svgHtml,
        className: 'emoji-marker',
        iconSize: [totalW, totalH],
        iconAnchor: [cx, totalH],
        popupAnchor: [0, -(totalH + 4)]
    });
};
