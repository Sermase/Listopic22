/**
 * Nombre, foto y dirección del negocio para las vistas previas de 📣 Promos.
 * Si la página ya los pasa, se usan; si no, se leen (con caché) de places/{id}.
 *
 *   const place = usePlacePreview(placeId, { name: placeName, photoUrl, address });
 */
import { useEffect, useState } from 'react';
import { getCachedDoc } from '../../../lib/queryCache';

export interface PlacePreview {
    name?: string;
    photoUrl?: string;
    address?: string;
}

const readString = (data: Record<string, unknown> | null, key: string): string | undefined => {
    const value = data?.[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
};

export function usePlacePreview(placeId: string, given: PlacePreview): PlacePreview {
    const provided = Boolean(given.name);
    const [fetched, setFetched] = useState<{ placeId: string; preview: PlacePreview } | null>(null);

    useEffect(() => {
        if (provided) return;
        let cancelled = false;
        getCachedDoc('places', placeId)
            .then((data) => {
                if (cancelled) return;
                setFetched({
                    placeId,
                    preview: {
                        name: readString(data, 'name'),
                        photoUrl: readString(data, 'userPhotoUrl') || readString(data, 'mainImageUrl'),
                        address: readString(data, 'address') || readString(data, 'formattedAddress'),
                    },
                });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [placeId, provided]);

    if (provided) return given;
    return fetched?.placeId === placeId ? { ...fetched.preview, ...stripEmpty(given) } : stripEmpty(given);
}

const stripEmpty = (preview: PlacePreview): PlacePreview => Object.fromEntries(
    Object.entries(preview).filter(([, value]) => typeof value === 'string' && value),
) as PlacePreview;
