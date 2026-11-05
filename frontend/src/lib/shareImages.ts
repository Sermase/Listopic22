/** Fotos entre las que se elige al crear la tarjeta de compartir. */

interface ReviewPhotos {
    photoUrl?: string | null;
    photoUrls?: string[] | null;
    placeMainImage?: string | null;
}

/** Reseña: sus propias fotos; la del sitio solo si la reseña no tiene ninguna. */
export const reviewCardImages = (review: ReviewPhotos): { imageUrl?: string; imageUrls: string[] } => {
    const own = Array.from(new Set([...(review.photoUrls || []), review.photoUrl].filter((value): value is string => Boolean(value))));
    const images = own.length ? own : [review.placeMainImage].filter((value): value is string => Boolean(value));
    return { imageUrl: images[0], imageUrls: images };
};
