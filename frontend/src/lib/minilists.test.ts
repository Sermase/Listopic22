import { describe, expect, it } from 'vitest';
import { arrangeMinilists, cleanPodium, toMinilistCard } from './minilists';

const ts = (ms: number) => ({ toMillis: () => ms });
const NOW = Date.UTC(2026, 10, 18);
const DAY = 86_400_000;

describe('toMinilistCard', () => {
    it('lee el documento de Firestore', () => {
        const card = toMinilistCard({
            id: 'm1', name: 'Tartas de concurso', parentListId: 'tartas', mainImageUrl: 'https://x/c.jpg',
            authorName: 'Ser', authorPhotoUrl: 'https://x/a.jpg', isPublic: true, official: true,
            contest: { closed: true, startsAt: ts(NOW - DAY), endsAt: ts(NOW + DAY) },
            reviewCount: 9, participantsCount: 4, followersCount: 2,
            podium: [{ name: 'Tarta A', average: 9.1, photo: 'https://x/p.jpg' }, { name: '', average: 8 }],
            createdAt: ts(NOW - 3 * DAY),
        }, NOW);
        expect(card).toMatchObject({ id: 'm1', coverUrl: 'https://x/c.jpg', authorPhoto: 'https://x/a.jpg', official: true, contest: 'open', participantsCount: 4 });
        expect(card.podium).toHaveLength(1);
    });

    it('lee el resultado de Algolia (concurso como fecha de fin)', () => {
        const card = toMinilistCard({ objectID: 'm2', name: 'X', contest: true, contestEndsAtTimestamp: (NOW - DAY) / 1000, updatedAtTimestamp: NOW / 1000 }, NOW);
        expect(card).toMatchObject({ id: 'm2', contest: 'after', createdAtMs: NOW });
    });
});

describe('arrangeMinilists', () => {
    const base = toMinilistCard({ id: 'base', name: 'Base' }, NOW);
    const cards = [
        { ...base, id: 'vieja-popular', name: 'Bravas picantes', participantsCount: 10, createdAtMs: NOW - 9 * DAY },
        { ...base, id: 'nueva', name: 'Tártas raras', createdAtMs: NOW, userId: 'yo' },
        { ...base, id: 'concurso', name: 'Concurso', contest: 'open' as const, createdAtMs: NOW - 20 * DAY },
        { ...base, id: 'oficial', name: 'Oficial', official: true, createdAtMs: NOW - 5 * DAY, editors: ['yo'] },
    ];

    it('el concurso abierto siempre primero; destacadas por sello y participantes', () => {
        expect(arrangeMinilists([...cards], 'top').map((c) => c.id)).toEqual(['concurso', 'oficial', 'vieja-popular', 'nueva']);
        expect(arrangeMinilists([...cards], 'recent').map((c) => c.id)).toEqual(['concurso', 'nueva', 'oficial', 'vieja-popular']);
    });

    it('las mías (dueña o editora) y búsqueda sin acentos', () => {
        expect(arrangeMinilists([...cards], 'mine', { uid: 'yo' }).map((c) => c.id)).toEqual(['oficial', 'nueva']);
        expect(arrangeMinilists([...cards], 'top', { query: 'tartas' }).map((c) => c.id)).toEqual(['nueva']);
    });

    it('cleanPodium descarta lo raro y deja 3', () => {
        expect(cleanPodium([{ name: 'a', average: 9 }, { name: 'b', average: 8 }, { name: 'c', average: 7 }, { name: 'd', average: 6 }, null]).map((p) => p.name)).toEqual(['a', 'b', 'c']);
    });
});
