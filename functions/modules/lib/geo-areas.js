// functions/modules/lib/geo-areas.js
//
// Ámbitos geográficos de un sitio: ciudad → provincia → CCAA → país.
// Google devuelve la CCAA en varios idiomas o formas («Euskadi», «Catalunya»,
// «Comunitat Valenciana»…). Aquí se normaliza a un nombre único para poder
// filtrar y hacer rankings por ámbito.

const CCAA_CANONICAL = [
  ['Andalucía', ['andalucia', 'andalusia']],
  ['Aragón', ['aragon']],
  ['Asturias', ['asturias', 'principado de asturias', 'principality of asturias']],
  ['Islas Baleares', ['islas baleares', 'illes balears', 'balearic islands', 'baleares']],
  ['Canarias', ['canarias', 'islas canarias', 'canary islands']],
  ['Cantabria', ['cantabria']],
  ['Castilla y León', ['castilla y leon', 'castile and leon', 'castilla-leon']],
  ['Castilla-La Mancha', ['castilla-la mancha', 'castilla la mancha', 'castile-la mancha']],
  ['Cataluña', ['cataluna', 'catalunya', 'catalonia']],
  ['Comunidad Valenciana', ['comunidad valenciana', 'comunitat valenciana', 'valencian community']],
  ['Extremadura', ['extremadura']],
  ['Galicia', ['galicia']],
  ['Comunidad de Madrid', ['comunidad de madrid', 'madrid', 'community of madrid']],
  ['Región de Murcia', ['region de murcia', 'murcia', 'region of murcia']],
  ['Navarra', ['navarra', 'comunidad foral de navarra', 'nafarroa', 'navarre']],
  ['País Vasco', ['pais vasco', 'euskadi', 'basque country', 'pais vasco/euskadi']],
  ['La Rioja', ['la rioja', 'rioja']],
  ['Ceuta', ['ceuta']],
  ['Melilla', ['melilla']],
];

const stripAccents = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');
const aliasKey = (value) => stripAccents(String(value || '').trim().toLowerCase()).replace(/\s+/g, ' ');

const CCAA_BY_ALIAS = new Map();
CCAA_CANONICAL.forEach(([canonical, aliases]) => {
  CCAA_BY_ALIAS.set(aliasKey(canonical), canonical);
  aliases.forEach((alias) => CCAA_BY_ALIAS.set(aliasKey(alias), canonical));
});

/** Nombre único de la CCAA; si no se reconoce (otro país), se devuelve tal cual. */
function normalizeCcaa(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return CCAA_BY_ALIAS.get(aliasKey(text)) || text;
}

/** Ciudad de los address_components de Google, con alternativas para pueblos sin «locality». */
function pickCity(addressComponents) {
  if (!Array.isArray(addressComponents)) return '';
  const byType = (type) => {
    const found = addressComponents.find((c) => c && Array.isArray(c.types) && c.types.includes(type));
    return found && typeof found.long_name === 'string' ? found.long_name : '';
  };
  return byType('locality') || byType('postal_town') || byType('administrative_area_level_4') || byType('administrative_area_level_3') || '';
}

const COUNTRY_ALIASES = new Map([['spain', 'España'], ['espana', 'España']]);

/** «Spain» → «España» (espejo de normalizeCountry en frontend/src/lib/geoAreas.ts). */
function normalizeCountry(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return COUNTRY_ALIASES.get(aliasKey(text)) || text;
}

module.exports = { normalizeCcaa, normalizeCountry, pickCity, CCAA_NAMES: CCAA_CANONICAL.map(([name]) => name) };
