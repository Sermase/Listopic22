import L from 'leaflet';

/**
 * Returns the hex color for a given rating score (0-10).
 * Matches legacy ListopicApp.uiUtils.getRatingHexColor logic.
 */
export const getRatingHexColor = (score: number | string): string => {
    const s = parseFloat(String(score));
    if (isNaN(s)) return '#CCCCCC'; // Default Gray
    if (s >= 9.0) return '#44d62c'; // High Green
    if (s >= 8.0) return '#44d62c'; // High Green (Legacy behavior often grouped 8-10) - adjusting to match legacy if it had granular steps
    if (s >= 7.0) return '#ffaa00'; // Orange/Yellowish
    if (s >= 6.0) return '#ffaa00'; // Orange
    if (s >= 5.0) return '#ffaa00'; // Fair
    if (s > 0) return '#ff4d4d'; // Red
    return '#CCCCCC';
};

/**
 * Creates a Leaflet DivIcon with the legacy SVG bubble design.
 */
export const createLegacyMarkerIcon = (score: number): L.DivIcon => {
    const color = getRatingHexColor(score);
    const uniqueGradientId = `grad-${Math.random().toString(36).substr(2, 9)}`;
    const scoreText = score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);

    // SVG mostly matches legacy createPlaceIconSvg
    const svgHtml = `
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
            <defs>
                <linearGradient id="${uniqueGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:${color}; stop-opacity:1" />
                    <stop offset="100%" style="stop-color:black; stop-opacity:0.4" />
                </linearGradient>
                <filter id="shadow-${uniqueGradientId}" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
                </filter>
            </defs>
            <path d="M20 0C9.5 0 1 8.5 1 19C1 31.5 18.5 48.5 20 50C21.5 48.5 39 31.5 39 19C39 8.5 30.5 0 20 0Z" 
                  fill="url(#${uniqueGradientId})" 
                  stroke="rgba(255,255,255,0.5)" 
                  stroke-width="1.5"
                  filter="url(#shadow-${uniqueGradientId})"/>
            <circle cx="20" cy="19" r="14" fill="white" fill-opacity="0.2"/>
            <text x="50%" y="43%" 
                  dominant-baseline="middle" 
                  text-anchor="middle" 
                  font-family="'Poppins', sans-serif" 
                  font-size="14" 
                  font-weight="700" 
                  fill="#FFFFFF"
                  style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                  ${scoreText}
            </text>
        </svg>
    `;

    return L.divIcon({
        html: svgHtml,
        className: 'legacy-map-marker', // We might need global CSS to ensure this has no default background
        iconSize: [40, 50],
        iconAnchor: [20, 50],
        popupAnchor: [0, -50]
    });
};
