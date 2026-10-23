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
    reviewRoute,
    groupResponses,
    upcomingEvents,
    eventNoteText,
    monthMatrix,
    atTime,
    chatDayLabel,
    countdownLabel,
    summarizePlaceDishes,
    buildPlaceDuelRows,
    invitePreviewText,
    inviteTitle,
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

    it('calendario: semanas con lunes primero y hora del día', () => {
        const oct = monthMatrix(2026, 9); // 1 oct 2026 es jueves
        expect(oct[0]).toEqual([null, null, null, 1, 2, 3, 4]);
        expect(oct.flat().filter((d) => d !== null)).toHaveLength(31);
        expect(oct.every((w) => w.length === 7)).toBe(true);
        expect(new Date(atTime(new Date(2026, 9, 25, 9).getTime(), '21:30')).getHours()).toBe(21);
    });

    it('etiquetas de día y cuenta atrás', () => {
        const now = new Date(2026, 9, 23, 12, 0).getTime();
        expect(chatDayLabel(now, now)).toBe('Hoy');
        expect(chatDayLabel(now - 86_400_000, now)).toBe('Ayer');
        expect(countdownLabel(new Date(2026, 9, 24, 14).getTime(), now)).toBe('Mañana');
        expect(countdownLabel(new Date(2026, 9, 26, 14).getTime(), now)).toBe('En 3 días');
        expect(countdownLabel(now - 5 * 3600_000, now)).toBe('Ya pasó');
    });

    it('agrupa respuestas: van, dudas (con propuesta), no y sin responder', () => {
        const groups = groupResponses({ ...invite, responses: { ...invite.responses, pepe: { status: 'maybe', at: 4 } } }, 'yo', ['yo', 'ana', 'luis', 'marta', 'pepe', 'eva']);
        expect(groups.going).toEqual(['yo', 'ana']);
        expect(groups.no).toEqual(['luis']);
        expect(groups.maybe).toEqual([{ uid: 'marta', proposedAt: invite.responses!.marta.proposedAt }, { uid: 'pepe' }]);
        expect(groups.pending).toEqual(['eva']);
    });

    it('fija las quedadas que no han pasado ni se han cancelado', () => {
        const now = invite.when - 86_400_000;
        const events = upcomingEvents(
            { a: { title: 'Viejo', when: now - 10 * 86_400_000 }, b: { title: 'Cancelado', when: now + 1000, cancelled: true }, c: { title: 'Luego', when: now + 3 * 86_400_000 } },
            [{ id: 'd', invite }],
            now,
        );
        expect(events.map((e) => e.id)).toEqual(['d', 'c']);
        expect(events[0].title).toBe('Patatas bravas en Docamar');
    });

    it('textos de avisos y de invitación sin plato', () => {
        expect(eventNoteText({ kind: 'yes', title: 'Bravas en Docamar' }, 'Ana')).toBe('✅ Ana va a Bravas en Docamar');
        expect(eventNoteText({ kind: 'yes' }, 'Tú')).toBe('✅ Tú vas');
        expect(eventNoteText({ kind: 'no' }, 'Luis')).toBe('❌ Luis no puede ir');
        expect(eventNoteText({ kind: 'added' }, 'Ana', 'Eva')).toBe('👋 Ana ha añadido a Eva');
        expect(inviteTitle({ placeName: 'Docamar' })).toBe('Docamar');
        expect(invitePreviewText({ placeName: 'Docamar' })).toBe('🍽️ Te invito a comer en Docamar');
        expect(reviewRoute({ placeName: 'Docamar', placeId: 'p1' })).toBe('/create-review?placeId=p1');
    });

    it('platos del sitio con su media y duelo por plato', () => {
        const reviews = [
            { userId: 'a', itemName: 'Bravas', overallRating: 9, listId: 'L' },
            { userId: 'b', itemName: ' bravás', overallRating: 7, listId: 'L' },
            { userId: 'a', itemName: 'Croquetas', overallRating: 6 },
            { userId: 'c', itemName: 'Croquetas', overallRating: 10 },
        ];
        expect(summarizePlaceDishes(reviews)).toEqual([
            { itemName: 'Bravas', avg: 8, count: 2, photoUrl: undefined, listId: 'L' },
            { itemName: 'Croquetas', avg: 8, count: 2, photoUrl: undefined, listId: undefined },
        ]);
        const rows = buildPlaceDuelRows(reviews, ['a', 'b']);
        expect(rows.map((r) => [r.label, r.values, r.best])).toEqual([
            ['Bravas', [9, 7], [0]],
            ['Croquetas', [6, null], []],
        ]);
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
