import { geoAreaLabel, type GeoLevel } from './geoAreas';

/** Niveles de zona en Buscar (en la Lista y la Home solo hay contexto local). */
export const ZONE_LEVELS: Array<{ level: GeoLevel; label: string }> = [
    { level: 'city', label: 'Ciudad' },
    { level: 'province', label: 'Provincia' },
    { level: 'region', label: 'Comunidad' },
    { level: 'country', label: 'País' },
];

/** Atributos de Algolia de cada nivel: los sitios usan `city`…; los elementos, `placeCity`… */
export function zoneAttributes(tab: string): Record<GeoLevel, string> {
    return tab === 'places'
        ? { city: 'city', province: 'province', region: 'region', country: 'country' }
        : { city: 'placeCity', province: 'placeProvince', region: 'placeRegion', country: 'placeCountry' };
}

/**
 * Zona activa a partir de los filtros aplicados: «Valladolid», «Valladolid
 * provincia»… Solo si hay exactamente un valor en un único nivel.
 */
export function activeZoneLabel(tab: string, refinements: ReadonlyArray<{ attribute: string; refinements: ReadonlyArray<{ value: unknown }> }>): string | null {
    const attrs = zoneAttributes(tab);
    const hits = (Object.entries(attrs) as Array<[GeoLevel, string]>)
        .map(([level, attribute]) => ({ level, ref: refinements.find((r) => r.attribute === attribute) }))
        .filter((x) => x.ref && x.ref.refinements.length > 0);
    if (hits.length !== 1 || hits[0].ref!.refinements.length !== 1) return null;
    return geoAreaLabel(hits[0].level, String(hits[0].ref!.refinements[0].value));
}
