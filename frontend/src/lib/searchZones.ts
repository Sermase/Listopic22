import { geoAreaLabel, type GeoLevel } from './geoAreas';

/** Una zona elegida en Buscar: «Comunidad de Madrid» (comunidad), «Segovia» (provincia)… */
export interface Zone {
    level: GeoLevel;
    value: string;
}

/** Niveles de mayor a menor, como se despliega el selector (en la Lista y la Home solo hay contexto local). */
export const ZONE_LEVELS: Array<{ level: GeoLevel; label: string }> = [
    { level: 'country', label: 'País' },
    { level: 'region', label: 'Comunidad' },
    { level: 'province', label: 'Provincia' },
    { level: 'city', label: 'Ciudad o pueblo' },
];

const LEVEL_ORDER: GeoLevel[] = ZONE_LEVELS.map((l) => l.level);

/** Atributos de Algolia de cada nivel: los sitios usan `city`…; los elementos, `placeCity`… */
export function zoneAttributes(tab: string): Record<GeoLevel, string> {
    return tab === 'places'
        ? { city: 'city', province: 'province', region: 'region', country: 'country' }
        : { city: 'placeCity', province: 'placeProvince', region: 'placeRegion', country: 'placeCountry' };
}

export const zoneKey = (zone: Zone) => `${zone.level}:${zone.value}`;

/** Enlace a Buscar (elementos por puntuación) con la Lista y la zona ya elegidas. */
export function exploreSearchUrl({ listId, listName, zone }: { listId?: string; listName?: string; zone?: Zone | null }): string {
    const params = new URLSearchParams({ type: 'items', sort: 'grouped_items_by_score' });
    if (listId) {
        params.set('listId', listId);
        if (listName) params.set('listName', listName);
    }
    if (zone) params.append('zone', zoneKey(zone));
    return `/search?${params.toString()}`;
}

/** Lee los parámetros `zone=nivel:valor` de la URL (sin repetidos ni niveles desconocidos). */
export function parseZones(raw: readonly string[]): Zone[] {
    const seen = new Set<string>();
    const zones: Zone[] = [];
    for (const item of raw) {
        const sep = item.indexOf(':');
        if (sep <= 0) continue;
        const level = item.slice(0, sep) as GeoLevel;
        const value = item.slice(sep + 1).trim();
        if (!LEVEL_ORDER.includes(level) || !value) continue;
        const zone = { level, value };
        if (seen.has(zoneKey(zone))) continue;
        seen.add(zoneKey(zone));
        zones.push(zone);
    }
    return zones;
}

const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Filtro de Algolia: cualquiera de las zonas (O), aunque sean de niveles
 * distintos. «Comunidad de Madrid + Segovia provincia» →
 * `(placeRegion:"Comunidad de Madrid" OR placeProvince:"Segovia")`.
 */
export function zonesFilter(tab: string, zones: readonly Zone[]): string {
    if (zones.length === 0) return '';
    const attrs = zoneAttributes(tab);
    return `(${zones.map((z) => `${attrs[z.level]}:${quote(z.value)}`).join(' OR ')})`;
}

/** «Valladolid», «Madrid + Barcelona», «3 zonas». */
export function zonesLabel(zones: readonly Zone[]): string | null {
    if (zones.length === 0) return null;
    if (zones.length <= 2) return zones.map((z) => geoAreaLabel(z.level, z.value)).join(' + ');
    return `${zones.length} zonas`;
}

export interface ZoneNode {
    level: GeoLevel;
    value: string;
    count: number;
    children: ZoneNode[];
}

export type ZoneRecord = Partial<Record<GeoLevel, string | null | undefined>>;

/**
 * Árbol país → comunidad → provincia → ciudad a partir de los resultados. Si a
 * un resultado le falta un nivel, el siguiente cuelga del anterior (una ciudad
 * sin provincia aparece dentro de su comunidad). `count` = resultados.
 */
export function buildZoneTree(records: readonly ZoneRecord[]): ZoneNode[] {
    const root: ZoneNode = { level: 'country', value: '', count: 0, children: [] };
    for (const record of records) {
        let parent = root;
        for (const level of LEVEL_ORDER) {
            const raw = record[level];
            const value = typeof raw === 'string' ? raw.trim() : '';
            if (!value) continue;
            let node = parent.children.find((c) => c.level === level && c.value === value);
            if (!node) {
                node = { level, value, count: 0, children: [] };
                parent.children.push(node);
            }
            node.count += 1;
            parent = node;
        }
    }
    const sort = (nodes: ZoneNode[]) => {
        nodes.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'es'));
        nodes.forEach((n) => sort(n.children));
    };
    sort(root.children);
    return root.children;
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Zonas del árbol cuyo nombre contiene el texto (sin tildes), con su ruta. */
export function searchZoneTree(nodes: readonly ZoneNode[], text: string): Array<{ node: ZoneNode; path: ZoneNode[] }> {
    const needle = fold(text.trim());
    if (!needle) return [];
    const out: Array<{ node: ZoneNode; path: ZoneNode[] }> = [];
    const walk = (list: readonly ZoneNode[], path: ZoneNode[]) => {
        for (const node of list) {
            if (fold(node.value).includes(needle)) out.push({ node, path });
            walk(node.children, [...path, node]);
        }
    };
    walk(nodes, []);
    return out.sort((a, b) => b.node.count - a.node.count);
}
