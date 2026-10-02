/**
 * Zonas para filtrar y ordenar una Lista: radio de distancia (lo de siempre) y,
 * después, ciudad → provincia → comunidad autónoma → España.
 * La persona nunca ve la palabra «ámbito»: ve «A menos de 5 km», «Valladolid»,
 * «Valladolid provincia», «Castilla y León», «España».
 *
 * `normalizeCcaa` es espejo de functions/modules/lib/geo-areas.js.
 */
import { compareElementsByRank, type RankableStats } from './scoring';

export type GeoLevel = 'city' | 'province' | 'region' | 'country';
export const GEO_LEVELS: GeoLevel[] = ['city', 'province', 'region', 'country'];

export interface GeoFields {
    city?: string | null;
    province?: string | null;
    region?: string | null;
    country?: string | null;
}

export type ListArea = { kind: 'near' } | { kind: GeoLevel; value: string };

const CCAA_CANONICAL: Array<[string, string[]]> = [
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

const aliasKey = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

const CCAA_BY_ALIAS = new Map<string, string>();
CCAA_CANONICAL.forEach(([canonical, aliases]) => {
    CCAA_BY_ALIAS.set(aliasKey(canonical), canonical);
    aliases.forEach((alias) => CCAA_BY_ALIAS.set(aliasKey(alias), canonical));
});

export function normalizeCcaa(value: unknown): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    return CCAA_BY_ALIAS.get(aliasKey(text)) || text;
}

const COUNTRY_ALIASES = new Map([['spain', 'España'], ['espana', 'España']]);

const cleanText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** «Spain» → «España» (espejo en functions/modules/lib/geo-areas.js). */
export function normalizeCountry(value: unknown): string {
    const country = cleanText(value);
    return country ? COUNTRY_ALIASES.get(aliasKey(country)) || country : '';
}

/** Valor normalizado de un nivel ('' si el sitio no lo tiene). */
export function geoValue(fields: GeoFields | null | undefined, level: GeoLevel): string {
    if (!fields) return '';
    if (level === 'region') return normalizeCcaa(fields.region);
    if (level === 'country') return normalizeCountry(fields.country);
    return cleanText(fields[level]);
}

/** Texto que ve la persona para una zona geográfica. */
export function geoAreaLabel(level: GeoLevel, value: string): string {
    return level === 'province' ? `${value} provincia` : value;
}

export function matchesArea(fields: GeoFields | null | undefined, area: ListArea): boolean {
    if (area.kind === 'near') return true;
    return geoValue(fields, area.kind) === area.value;
}

export interface AreaOption {
    level: GeoLevel;
    value: string;
    label: string;
    count: number;
}

/** Zonas presentes en los elementos, por nivel y de más a menos elementos. */
export function buildAreaOptions(items: ReadonlyArray<GeoFields>): Record<GeoLevel, AreaOption[]> {
    const result = { city: [], province: [], region: [], country: [] } as Record<GeoLevel, AreaOption[]>;
    GEO_LEVELS.forEach((level) => {
        const counts = new Map<string, number>();
        items.forEach((item) => {
            const value = geoValue(item, level);
            if (value) counts.set(value, (counts.get(value) || 0) + 1);
        });
        result[level] = [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
            .map(([value, count]) => ({ level, value, count, label: geoAreaLabel(level, value) }));
    });
    return result;
}

// --- Guardar la zona elegida -----------------------------------------------------

export const AREA_STORAGE_KEY = 'listopic_list_area';

/** «A menos de 5 km», «A menos de 500 m». */
export const distanceLabel = (km: number): string =>
    km < 1 ? `A menos de ${Math.round(km * 1000)} m` : `A menos de ${km} km`;

export const encodeArea = (area: ListArea): string => (area.kind === 'near' ? 'near' : `${area.kind}:${area.value}`);

export function decodeArea(raw: string | null | undefined): ListArea {
    if (!raw || raw === 'near') return { kind: 'near' };
    const index = raw.indexOf(':');
    const kind = raw.slice(0, index) as GeoLevel;
    const value = raw.slice(index + 1);
    return index > 0 && GEO_LEVELS.includes(kind) && value ? { kind, value } : { kind: 'near' };
}

// --- Puesto con contexto («#3 en Valladolid») ------------------------------------

/** Por debajo de este número de elementos comparables no se presume de puesto. */
export const MIN_ELEMENTS_FOR_CONTEXT_RANK = 3;

export interface ContextRank {
    level: GeoLevel;
    value: string;
    rank: number;
    total: number;
    /** «#3 en Valladolid» */
    label: string;
}

export interface RankableGeoItem extends GeoFields, RankableStats {
    id: string;
}

/**
 * Puesto de cada elemento dentro de su ciudad, provincia, CCAA y país, con la
 * fórmula única de ranking. Solo se incluyen contextos con al menos
 * MIN_ELEMENTS_FOR_CONTEXT_RANK elementos.
 */
export function contextualRanks(items: ReadonlyArray<RankableGeoItem>): Map<string, ContextRank[]> {
    const result = new Map<string, ContextRank[]>();
    items.forEach((item) => result.set(item.id, []));
    GEO_LEVELS.forEach((level) => {
        const groups = new Map<string, RankableGeoItem[]>();
        items.forEach((item) => {
            const value = geoValue(item, level);
            if (!value) return;
            if (!groups.has(value)) groups.set(value, []);
            groups.get(value)!.push(item);
        });
        groups.forEach((group, value) => {
            if (group.length < MIN_ELEMENTS_FOR_CONTEXT_RANK) return;
            [...group].sort(compareElementsByRank).forEach((item, index) => {
                const label = `#${index + 1} en ${level === 'country' ? value : geoAreaLabel(level, value)}`;
                result.get(item.id)!.push({ level, value, rank: index + 1, total: group.length, label });
            });
        });
    });
    return result;
}

/**
 * El puesto principal: el contexto más concreto que aporte algo. Se salta la
 * zona que ya se está mirando y cualquier contexto con tantos elementos como
 * los que se ven (p. ej. «#4 en España» mirando toda la Lista).
 */
export function primaryContextRank(
    ranks: ReadonlyArray<ContextRank> | undefined,
    activeArea: ListArea,
    activeAreaTotal?: number,
): ContextRank | null {
    if (!ranks || ranks.length === 0) return null;
    const order: GeoLevel[] = ['city', 'province', 'region', 'country'];
    for (const level of order) {
        if (activeArea.kind === level) continue;
        const found = ranks.find((r) => r.level === level);
        if (!found) continue;
        // Mismos elementos que los que ya se ven: el número de la tarjeta ya lo dice.
        if (activeAreaTotal !== undefined && found.total === activeAreaTotal) continue;
        return found;
    }
    return null;
}

/** Quita contextos que tienen exactamente los mismos elementos que otro más concreto. */
export function distinctContextRanks(ranks: ReadonlyArray<ContextRank>): ContextRank[] {
    const seenTotals = new Set<number>();
    return ranks.filter((rank) => {
        if (seenTotals.has(rank.total)) return false;
        seenTotals.add(rank.total);
        return true;
    });
}

// --- Contexto local (Lista y Home) -------------------------------------------
// En la Lista y la Home solo se ofrece lo que rodea a la persona: radios de
// distancia y SU ciudad, SU comunidad y SU país. Explorar otras zonas se hace
// en Buscar. «Dónde estás» se deduce de los sitios más cercanos con ubicación
// (sin llamar a Google): la ciudad, si hay uno a menos de 15 km; la comunidad,
// a menos de 120 km; el país, a menos de 600 km.

export const LOCAL_LEVELS: GeoLevel[] = ['city', 'region', 'country'];
const LOCAL_MAX_KM: Record<GeoLevel, number> = { city: 15, province: 60, region: 120, country: 600 };

export interface LocatedGeo extends GeoFields {
    lat?: number | null;
    lng?: number | null;
}

export function haversineKm(a: { latitude: number; longitude: number }, lat: number, lng: number): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(lat - a.latitude);
    const dLng = toRad(lng - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Ciudad, comunidad y país de la persona, deducidos de los sitios cercanos. */
export function inferUserGeo(
    location: { latitude: number; longitude: number } | null | undefined,
    places: ReadonlyArray<LocatedGeo>,
): GeoFields | null {
    if (!location) return null;
    const located = places
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => ({ p, km: haversineKm(location, p.lat as number, p.lng as number) }))
        .sort((a, b) => a.km - b.km);
    const result: GeoFields = {};
    GEO_LEVELS.forEach((level) => {
        const nearest = located.find(({ p, km }) => km <= LOCAL_MAX_KM[level] && geoValue(p, level));
        if (nearest) result[level] = geoValue(nearest.p, level);
    });
    return Object.values(result).some(Boolean) ? result : null;
}

/**
 * Opciones de zona en contexto local: solo la ciudad, la comunidad y el país de
 * la persona. Sin ubicación: solo el país (o los países) de la Lista.
 */
export function localAreaOptions(all: Record<GeoLevel, AreaOption[]>, userGeo: GeoFields | null): Record<GeoLevel, AreaOption[]> {
    const pick = (level: GeoLevel) => {
        const mine = userGeo ? geoValue(userGeo, level) : '';
        return mine ? all[level].filter((o) => o.value === mine) : [];
    };
    return {
        city: pick('city'),
        province: [],
        region: pick('region'),
        country: userGeo ? pick('country') : all.country,
    };
}
