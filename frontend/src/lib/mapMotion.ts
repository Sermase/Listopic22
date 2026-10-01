import type L from 'leaflet';

const hasSize = (map: L.Map) => {
    const size = map.getSize();
    return size.x > 0 && size.y > 0;
};

/**
 * Ejecuta un encuadre (flyTo, fitBounds…) solo cuando el mapa tiene tamaño.
 * Con el contenedor oculto (0×0, p. ej. el minimapa de Buscar en móvil)
 * Leaflet calcula coordenadas NaN y lanza «Invalid LatLng object»; en ese caso
 * se aplaza hasta el primer `resize` con tamaño real. Devuelve la limpieza.
 */
export function whenMapSized(map: L.Map, move: () => void): () => void {
    if (hasSize(map)) {
        move();
        return () => {};
    }
    const onResize = () => {
        if (!hasSize(map)) return;
        map.off('resize', onResize);
        move();
    };
    map.on('resize', onResize);
    return () => { map.off('resize', onResize); };
}
