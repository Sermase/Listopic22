/**
 * Lo que la vista previa de 🎨 Imagen necesita del lugar para parecerse a la
 * ficha pública: nombre, dirección, nota, la foto que se ve sin portada y las
 * fotos del local (para «Elegir de las fotos del local»).
 *
 * La foto de respaldo sigue el mismo orden que usePlaceDetails (sin las
 * reseñas): userPhotoUrl → última foto subida → mainImageUrl → photos[].
 * Si algo falla, la vista previa sigue con lo que haya (nunca bloquea).
 */
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../../firebase';
import { placeRating } from '../../../lib/placeRating';
import { firstUsablePlaceImage } from '../../../utils/placeImages';

export interface ShowcasePhoto {
    id: string;
    url: string;
    caption?: string;
}

export interface PlaceShowcase {
    loading: boolean;
    name?: string;
    address?: string;
    /** La foto que se ve en la cabecera pública si no hay portada. */
    photoUrl?: string;
    /** Nota pública (personas) y nº de valoraciones. */
    rating: { average: number | null; count: number };
    photos: ShowcasePhoto[];
    photosFailed: boolean;
}

/** Igual que la consulta de usePlaceDetails, con menos fotos. */
export const SHOWCASE_PHOTOS_LIMIT = 24;

const EMPTY: Omit<PlaceShowcase, 'loading'> = { rating: { average: null, count: 0 }, photos: [], photosFailed: false };

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

export function usePlaceShowcase(placeId: string): PlaceShowcase {
    const [state, setState] = useState<{ placeId: string; data: Omit<PlaceShowcase, 'loading'> } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const [placeSnap, photosSnap] = await Promise.all([
                getDoc(doc(db, 'places', placeId)).catch((error) => {
                    console.warn('usePlaceShowcase: place failed', error);
                    return null;
                }),
                getDocs(query(collection(db, 'places', placeId, 'photos'), orderBy('createdAt', 'desc'), limit(SHOWCASE_PHOTOS_LIMIT))).catch((error) => {
                    console.warn('usePlaceShowcase: photos failed', error);
                    return null;
                }),
            ]);
            if (cancelled) return;
            const place = placeSnap?.exists() ? placeSnap.data() as Record<string, unknown> : null;
            const photos: ShowcasePhoto[] = (photosSnap?.docs || []).flatMap((photoDoc) => {
                const data = photoDoc.data() as Record<string, unknown>;
                const url = firstUsablePlaceImage(data.url);
                return url ? [{ id: photoDoc.id, url, caption: str(data.caption) }] : [];
            });
            const rating = place ? placeRating(place) : null;
            setState({
                placeId,
                data: {
                    name: str(place?.name),
                    address: str(place?.formattedAddress) ?? str(place?.address),
                    photoUrl: firstUsablePlaceImage(place?.userPhotoUrl, photos[0]?.url, place?.mainImageUrl, place?.photos),
                    rating: { average: rating?.average ?? null, count: rating?.count ?? 0 },
                    photos,
                    photosFailed: photosSnap == null,
                },
            });
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    if (!state || state.placeId !== placeId) return { loading: true, ...EMPTY };
    return { loading: false, ...state.data };
}
