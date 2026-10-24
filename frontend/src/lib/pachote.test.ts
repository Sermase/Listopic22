import { describe, expect, it } from 'vitest';
import { membersFromPeople, myRow, pachoteJoinUrl, pachoteMoney, pachoteToken, standing, type PachoteSummary } from './pachote';

describe('Pachote desde el chat', () => {
    it('la gente del chat pasa a Pachote con su nombre de pila y su usuario', () => {
        let n = 0;
        const members = membersFromPeople([
            { uid: 'u1', name: 'Ana García' },
            { uid: 'u2', name: 'Luis' },
            { uid: 'u3', name: 'Ana López' },
        ], () => `m${++n}`);
        expect(members.map((m) => [m.id, m.name, m.luid])).toEqual([
            ['m1', 'Ana García', 'u1'],
            ['m2', 'Luis', 'u2'],
            ['m3', 'Ana López', 'u3'],
        ]);
        expect(members[1]).toMatchObject({ hh: null, weight: 1 });
    });

    it('mi fila del resumen: por mi usuario o por la persona elegida en Pachote', () => {
        const s: PachoteSummary = {
            v: 1, spent: 9000, n: 2, tx: [], last: [],
            people: [
                { id: 'm1', name: 'Ana', luid: 'u1', bal: 3000, spent: 3000 },
                { id: 'm2', name: 'Luis', bal: -3000, spent: 3000 },
            ],
        };
        expect(myRow(s, 'u1')?.name).toBe('Ana');
        expect(myRow(s, 'u9', 'm2')?.name).toBe('Luis');
        expect(myRow(s, 'u9')).toBeNull();
        expect(myRow(undefined, 'u1')).toBeNull();
    });

    it('saldo en palabras y en euros', () => {
        expect(standing(1250)).toMatchObject({ label: 'Te deben', tone: 'pos' });
        expect(standing(-800, 'Debes a Ana')).toMatchObject({ label: 'Debes a Ana', tone: 'neg' });
        expect(standing(0)).toEqual({ label: 'En paz', amount: '', tone: 'zero' });
        expect(pachoteMoney(123450).replace(/\s/g, ' ')).toBe('1.234,50 €');
    });

    it('link de Pachote y token de 24 caracteres', () => {
        expect(pachoteJoinUrl('g1', 'tok')).toBe('https://pachote-78042.web.app/#join/g1/tok');
        const t = pachoteToken((k) => new Uint8Array(k).fill(3));
        expect(t).toHaveLength(24);
        expect(t).toBe('d'.repeat(24));
    });
});
