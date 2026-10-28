import React, { useMemo, useState } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { createClusterIcon } from '../../utils/mapUtils';
import { animateMap } from '../../lib/mapMotion';
import { haptic } from '../../utils/haptics';

export interface ClusterPoint {
    id: string;
    lat: number;
    lng: number;
    /** Nota 0–10 para la media del círculo; sin nota no cuenta. */
    score?: number | null;
    /** Va siempre suelta (p. ej. los patrocinados). */
    alwaysVisible?: boolean;
}

/** A partir de este zoom (calle) ya no se agrupa: se ven todas las chinchetas. */
export const CLUSTER_MAX_ZOOM = 16;
/** Distancia en píxeles por debajo de la cual dos chinchetas se juntan en un círculo. */
const CLUSTER_RADIUS_PX = 54;

interface Cluster<T extends ClusterPoint> {
    key: string;
    members: T[];
    lat: number;
    lng: number;
    average: number | null;
}

function buildClusters<T extends ClusterPoint>(map: L.Map, points: T[], zoom: number): { singles: T[]; clusters: Cluster<T>[] } {
    if (zoom >= CLUSTER_MAX_ZOOM || points.length < 2) return { singles: points, clusters: [] };
    const singles: T[] = [];
    const pool: { point: T; px: L.Point }[] = [];
    for (const point of points) {
        if (point.alwaysVisible) singles.push(point);
        else pool.push({ point, px: map.project([point.lat, point.lng], zoom) });
    }
    // Primero las de más nota: son las que «tiran» del grupo y le dan su sitio.
    pool.sort((a, b) => (b.point.score ?? 0) - (a.point.score ?? 0));
    const used = new Array(pool.length).fill(false);
    // Rejilla del tamaño del radio: cada chincheta solo mira sus 9 casillas, no todas las demás.
    const cell = (v: number) => Math.floor(v / CLUSTER_RADIUS_PX);
    const grid = new Map<string, number[]>();
    pool.forEach(({ px }, index) => {
        const key = `${cell(px.x)}:${cell(px.y)}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(index); else grid.set(key, [index]);
    });
    const clusters: Cluster<T>[] = [];
    for (let i = 0; i < pool.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const group = [pool[i]];
        const cx = cell(pool[i].px.x);
        const cy = cell(pool[i].px.y);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (const j of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
                    if (!used[j] && pool[i].px.distanceTo(pool[j].px) <= CLUSTER_RADIUS_PX) {
                        used[j] = true;
                        group.push(pool[j]);
                    }
                }
            }
        }
        if (group.length === 1) {
            singles.push(group[0].point);
            continue;
        }
        const x = group.reduce((sum, g) => sum + g.px.x, 0) / group.length;
        const y = group.reduce((sum, g) => sum + g.px.y, 0) / group.length;
        const center = map.unproject([x, y], zoom);
        const scored = group.map((g) => g.point.score).filter((s): s is number => typeof s === 'number' && s > 0);
        clusters.push({
            key: group.map((g) => g.point.id).sort().join('|'),
            members: group.map((g) => g.point),
            lat: center.lat,
            lng: center.lng,
            average: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
        });
    }
    return { singles, clusters };
}

/**
 * Chinchetas que se agrupan en círculos al alejar el zoom. Cada mapa pinta sus
 * chinchetas sueltas como siempre (renderPin); al tocar un círculo se acerca hasta separarlas.
 */
export function ClusteredPins<T extends ClusterPoint>({ points, renderPin }: { points: T[]; renderPin: (point: T) => React.ReactNode }) {
    const map = useMap();
    const [zoom, setZoom] = useState(() => map.getZoom());
    useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

    const { singles, clusters } = useMemo(() => buildClusters(map, points, zoom), [map, points, zoom]);

    return (
        <>
            {singles.map((point) => <React.Fragment key={point.id}>{renderPin(point)}</React.Fragment>)}
            {clusters.map((cluster) => (
                <Marker
                    key={cluster.key}
                    position={[cluster.lat, cluster.lng]}
                    icon={createClusterIcon(cluster.members.length, cluster.average)}
                    eventHandlers={{
                        click: () => {
                            haptic('selection');
                            const bounds = L.latLngBounds(cluster.members.map((m) => [m.lat, m.lng] as [number, number]));
                            // Todas en el mismo punto (varias reseñas del mismo sitio): basta con llegar al zoom sin grupos.
                            const target = Math.max(map.getBoundsZoom(bounds, false, L.point(60, 60)), zoom + 2);
                            map.flyTo(bounds.getCenter(), Math.min(target, CLUSTER_MAX_ZOOM + 1), { animate: animateMap(), duration: 0.6 });
                        },
                    }}
                />
            ))}
        </>
    );
}
