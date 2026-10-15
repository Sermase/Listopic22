import L from 'leaflet';
import { SCORE_BADGE, formatScore, scoreBand } from '../lib/scoreScale';

// ─── Capas de mapa disponibles ────────────────────────────────────────────────
export type MapLayerId = 'standard' | 'light' | 'dark' | 'satellite';

export interface MapLayerConfig {
    label: string;
    emoji: string;
    url: string;
    attribution: string;
    tileFilter?: string; // filtro CSS opcional para el tile pane
}

// CARTO dejó de servir sus mapas base sin clave: devolvía mosaicos con la marca
// "API KEY REQUIRED" en lugar de calles (comprobado el 30/09/2026). Mientras se
// decide un proveedor definitivo (ver Mejoras/siguiente-fase.md), las capas usan
// el callejero público de Esri, el mismo proveedor que ya servía la vista satélite.
const ESRI_STREET_MAP_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ESRI_STREET_MAP_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin, USGS, NGA, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS User Community';

export const MAP_LAYERS: Record<MapLayerId, MapLayerConfig> = {
    standard: {
        label: 'Estándar',
        emoji: '🗺️',
        url: ESRI_STREET_MAP_URL,
        attribution: ESRI_STREET_MAP_ATTRIBUTION,
    },
    light: {
        label: 'Claro',
        emoji: '☀️',
        url: ESRI_STREET_MAP_URL,
        attribution: ESRI_STREET_MAP_ATTRIBUTION,
        tileFilter: 'saturate(0.35) brightness(1.06) contrast(0.95)',
    },
    dark: {
        label: 'Oscuro',
        emoji: '🌑',
        url: ESRI_STREET_MAP_URL,
        attribution: ESRI_STREET_MAP_ATTRIBUTION,
        tileFilter: 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.45)',
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

export interface MapPinOptions {
    /** Nota 0–10; sin nota (o 0) el pin es un punto gris, sin número. */
    score?: number | null;
    /** Colecciones del perfil: emoji sobre blanco con el borde del color de la colección. */
    emoji?: string | null;
    color?: string | null;
    sponsored?: boolean;
    highlighted?: boolean;
}

/** Lo que asoma el pico por debajo de la chapa (ver .lt-pin::after en index.css). */
const PIN_TIP = 7;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Pin único para todos los mapas (Home, Buscar, perfil, listas, sitio): una chapa con
 * la nota en la escala de color de la app y un pico que marca el punto exacto.
 * Es HTML con clases de index.css (.lt-pin), así el tamaño se ajusta al texto.
 */
export const createMapPinIcon = ({ score, emoji, color, sponsored = false, highlighted = false }: MapPinOptions = {}): L.DivIcon => {
    const s = typeof score === 'number' && Number.isFinite(score) && score > 0 ? score : null;
    const classes = ['lt-pin'];
    let style = '';
    let label = '';
    // Tamaño fijo por tipo: el marcador de Leaflet ocupa lo mismo que el pin
    // (se puede tocar, enfocar y ver en las pruebas) y el pico cae en el punto.
    let width: number;
    let height: number;
    if (emoji || color) {
        classes.push('lt-pin--emoji');
        style = `--pin-ring:${escapeHtml(color || '#6366f1')};`;
        label = escapeHtml(emoji || '📍');
        width = 30;
        height = 30;
    } else if (s === null) {
        // Sin nota: un punto, para no llenar el mapa de interrogantes.
        classes.push('lt-pin--none');
        width = 14;
        height = 14;
    } else {
        const { bg, fg } = SCORE_BADGE[scoreBand(s)];
        style = `--pin-bg:${bg};--pin-fg:${fg};`;
        label = formatScore(s);
        width = label.length >= 3 ? 34 : 28;
        height = 24;
    }
    if (sponsored) {
        classes.push('lt-pin--sponsored');
        label = `<span class="lt-pin__star" aria-hidden="true">★</span>${label}`;
        width += 14;
    }
    if (highlighted) classes.push('lt-pin--hl');
    const total = height + PIN_TIP;

    return L.divIcon({
        html: `<div class="${classes.join(' ')}" style="${style}height:${height}px">${label}</div>`,
        className: 'lt-pin-icon',
        iconSize: [width, total],
        iconAnchor: [width / 2, total],
        popupAnchor: [0, -total],
    });
};

/** Punto de «tu ubicación», igual en todos los mapas. */
export const createUserLocationIcon = (): L.DivIcon => L.divIcon({
    html: '<div class="lt-user-dot"><span class="lt-user-dot__pulse"></span></div>',
    className: 'lt-pin-icon',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});
