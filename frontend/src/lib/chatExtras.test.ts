import { describe, expect, it } from 'vitest';
import {
    buildDuelRows,
    buildIcs,
    dishFromHit,
    inviteAttendees,
    inviteIsPast,
    isEmojiOnly,
    mapsUrl,
    pendingProposals,
    pollTally,
    quickWhenOptions,
    reviewRoute,
    summarizeReactions,
    type ChatInvite,
} from './chatExtras';

const invite: ChatInvite = {
    itemName: 'Patatas bravas',
    placeName: 'Docamar',
    placeId: 'ChIJabc',
    placeCity: 'Madrid',
    listId: 'L1',
    when: new Date(2026, 9, 25, 14, 0).getTime(),
    responses: {
        ana: { status: 'yes', at: 1 },
        luis: { status: 'no', at: 2 },
        marta: { status: 'other', proposedAt: new Date(2026, 9, 26, 13, 30).getTime(), at: 3 },
    },
};

describe('chatExtras', () => {
    it('detecta mensajes solo de emojis (hasta 3)', () => {
        expect(isEmojiOnly('🍕')).toBe(true);
        expect(isEmojiOnly(' 😋🔥 ')).toBe(true);
        expect(isEmojiOnly('❤️')).toBe(true);
        expect(isEmojiOnly('👍🏽')).toBe(true);
        expect(isEmojiOnly('🍕🍕🍕🍕')).toBe(false);
        expect(isEmojiOnly('hola 🍕')).toBe(false);
        expect(isEmojiOnly('123')).toBe(false);
        expect(isEmojiOnly('')).toBe(false);
    });

    it('agrupa reacciones y marca la mía', () => {
        expect(summarizeReactions({ a: '😂', b: '😂', c: '🔥' }, 'c')).toEqual([
            { emoji: '😂', count: 2, mine: false },
            { emoji: '🔥', count: 1, mine: true },
        ]);
        expect(summarizeReactions(undefined)).toEqual([]);
    });

    it('saca el plato de un hit de Algolia', () => {
        const dish = dishFromHit({ itemName: 'Bravas', placeName: 'Docamar', placeId: 'p1', avgGeneralScore: 0, _geoloc: { lat: 1, lng: 2 }, thumbnailUrl: '' });
        expect(dish).toEqual({ itemName: 'Bravas', placeName: 'Docamar', placeId: 'p1', lat: 1, lng: 2 });
        expect(dishFromHit({ placeName: 'X' })).toBeNull();
    });

    it('enlaces: Maps, reseña', () => {
        expect(mapsUrl({ itemName: 'x', placeName: 'Docamar', placeCity: 'Madrid', placeId: 'ChIJabc' }))
            .toBe('https://www.google.com/maps/search/?api=1&query=Docamar%20Madrid&query_place_id=ChIJabc');
        expect(mapsUrl({ itemName: 'x', placeName: 'D', googleMapsUrl: 'https://maps/x' })).toBe('https://maps/x');
        expect(reviewRoute(invite)).toBe('/create-review?listId=L1&placeId=ChIJabc&itemName=Patatas+bravas');
    });

    it('asistentes, propuestas y si ya pasó', () => {
        expect(inviteAttendees(invite, 'yo')).toEqual(['yo', 'ana']);
        expect(pendingProposals(invite)).toEqual([{ uid: 'marta', proposedAt: invite.responses!.marta.proposedAt }]);
        expect(inviteIsPast(invite, invite.when + 60_000)).toBe(false);
        expect(inviteIsPast(invite, invite.when + 3 * 3600_000)).toBe(true);
    });

    it('atajos de fecha siempre en el futuro', () => {
        const now = new Date(2026, 9, 22, 12, 0).getTime(); // jueves
        const options = quickWhenOptions(now);
        expect(options.map((o) => o.label)).toEqual(['Hoy 21:00', 'Mañana 14:00', 'Mañana 21:00', 'Sábado 14:00']);
        options.forEach((o) => expect(o.ms).toBeGreaterThan(now));
        expect(quickWhenOptions(new Date(2026, 9, 22, 22, 0).getTime())[0].label).toBe('Mañana 14:00');
    });

    it('cuenta votos y ganador (sin ganador si hay empate)', () => {
        const poll = { question: '?', options: [{ id: 'o1', itemName: 'a', placeName: 'A' }, { id: 'o2', itemName: 'b', placeName: 'B' }] };
        expect(pollTally({ ...poll, votes: { x: 'o1', y: 'o1', z: 'o2' } })).toEqual({ counts: { o1: 2, o2: 1 }, total: 3, winnerId: 'o1' });
        expect(pollTally({ ...poll, votes: { x: 'o1', y: 'o2' } }).winnerId).toBeNull();
        expect(pollTally(poll).winnerId).toBeNull();
    });

    it('duelo: filas por criterio, mejor nota y fila final', () => {
        const rows = buildDuelRows(
            [['sabor', { label: 'Sabor' }], ['picante', { label: 'Picante', isPonderable: false }], ['nada', { label: 'Nada' }]],
            [
                { userId: 'a', overallRating: 8, scores: { sabor: 9, picante: 3 } },
                { userId: 'b', overallRating: 8, scores: { sabor: 7, picante: 8 } },
            ],
        );
        expect(rows.map((r) => r.id)).toEqual(['sabor', 'picante', '__overall']);
        expect(rows[0].best).toEqual([0]);
        expect(rows[1]).toMatchObject({ informative: true, best: [] });
        expect(rows[2].best).toEqual([0, 1]);
    });

    it('genera un .ics válido', () => {
        const ics = buildIcs({ ...invite, note: 'Pago yo, tú; la charla' }, 'm1');
        expect(ics).toContain('BEGIN:VEVENT');
        expect(ics).toContain('UID:m1@listopic.es');
        expect(ics).toContain(String.raw`DESCRIPTION:Pago yo\, tú\; la charla`);
    });
});
