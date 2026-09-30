// Las fotos se suben siempre con un nombre único (marca de tiempo), así que
// nunca cambian: el navegador y la CDN de Google pueden guardarlas un año.
// Antes Storage las servía con "private, max-age=0" y se descargaban de nuevo
// en cada visita.
export const IMMUTABLE_UPLOAD_CACHE_CONTROL = 'public, max-age=31536000, immutable';
