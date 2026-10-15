import { describe, expect, it, vi } from 'vitest';

vi.mock('../../firebase', () => ({ db: {} }));

import { hitPhoto, pickReviewPhoto, placesNeedingPhoto } from './SearchResultPhotos';

describe('SearchResultPhotos', () => {
    it('elige la foto pública con mejor nota y nunca una privada', () => {
        expect(pickReviewPhoto([
            { visibility: 'public', overallRating: 6, photoUrl: 'https://x/a.jpg' },
            { visibility: 'private', overallRating: 10, photoUrl: 'https://x/secreta.jpg' },
            { visibility: 'public', overallRating: 9, photoUrls: ['https://x/b.jpg'] },
        ])).toBe('https://x/b.jpg');
        expect(pickReviewPhoto([{ visibility: 'public', photoUrl: 'https://maps.googleapis.com/maps/api/place/photo?x=1' }])).toBeNull();
    });

    it('solo consulta sitios con fotos de platos y sin foto propia, sin repetir y con tope', () => {
        const hits = [
            { objectID: 'a', hasPhoto: true },
            { objectID: 'b', hasPhoto: true, thumbnailUrl: 'https://x/b.jpg' },
            { objectID: 'c', hasPhoto: false },
            { objectID: 'd', hasPhoto: true },
            { objectID: 'a', hasPhoto: true },
            { objectID: 'e', hasPhoto: true },
        ];
        expect(placesNeedingPhoto(hits, new Map([['d', null]]))).toEqual(['a', 'e']);
        expect(placesNeedingPhoto(hits, new Map(), 1)).toEqual(['a']);
        expect(hitPhoto(hits[1])).toBe('https://x/b.jpg');
    });
});
