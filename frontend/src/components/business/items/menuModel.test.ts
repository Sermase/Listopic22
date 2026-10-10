import { describe, expect, it, vi } from 'vitest';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

import {
    buildBoard,
    chunk,
    compareMenuRows,
    findItemByName,
    groupProposalsByWhen,
    itemBusinessDataFrom,
    planDropMoves,
    proposalWhen,
    UNSECTIONED,
} from './menuModel';

const item = (id: string, businessData: Record<string, unknown> = {}, extra: Partial<CanonicalPlaceItem> = {}): CanonicalPlaceItem => ({
    id,
    canonicalName: id.charAt(0).toUpperCase() + id.slice(1),
    status: 'active',
    businessData,
    stats: { reviewCount: 0, averageRating: null },
    ...extra,
});

describe('itemBusinessDataFrom', () => {
    it('devuelve siempre la ficha completa (lo que falte, por defecto)', () => {
        expect(itemBusinessDataFrom(item('flan', { price: '3 €', available: false, menuOrder: 2 }))).toEqual({
            group: '',
            price: '3 €',
            discount: '',
            ingredients: '',
            description: '',
            allergens: [],
            available: false,
            menuOrder: 2,
        });
        expect(itemBusinessDataFrom(null).menuOrder).toBeNull();
        expect(itemBusinessDataFrom(item('x', { allergens: ['huevo', 3], menuOrder: 'uno' }))).toMatchObject({ allergens: ['huevo'], menuOrder: null });
    });
});

describe('orden dentro de una sección', () => {
    it('primero los que ordenó el negocio, luego por nota y por nombre', () => {
        const rows = [
            { name: 'Bravas', rating: 9, menuOrder: null },
            { name: 'Alioli', rating: 6, menuOrder: 1 },
            { name: 'Croquetas', rating: 7, menuOrder: 0 },
            { name: 'Aceitunas', rating: 9, menuOrder: null },
            { name: 'Pan', rating: null, menuOrder: null },
        ];
        expect([...rows].sort(compareMenuRows).map((row) => row.name)).toEqual(['Croquetas', 'Alioli', 'Aceitunas', 'Bravas', 'Pan']);
    });

    it('el tablero agrupa por secciones y manda al cajón lo que no tiene sección o tiene una que ya no existe', () => {
        const board = buildBoard([
            item('croquetas', { group: 'Entrantes', menuOrder: 1 }),
            item('bravas', { group: 'Entrantes', menuOrder: 0 }),
            item('flan', { group: 'Dulces' }),
            item('pulpo'),
        ], ['Entrantes', 'Postres']);
        expect(board.sections.map((section) => [section.name, section.items.map((row) => row.id)])).toEqual([
            ['Entrantes', ['bravas', 'croquetas']],
            ['Postres', []],
        ]);
        expect(board.unsectioned.map((row) => row.id).sort()).toEqual(['flan', 'pulpo']);
    });
});

describe('planDropMoves', () => {
    const items = [
        item('croquetas', { group: 'Entrantes' }),
        item('bravas', { group: 'Entrantes' }),
        item('flan', { group: 'Postres', menuOrder: 0 }),
        item('pulpo'),
    ];
    const byId = new Map(items.map((row) => [row.id, row]));
    const before = { [UNSECTIONED]: ['pulpo'], Entrantes: ['croquetas', 'bravas'], Postres: ['flan'] };

    it('soltar donde estaba no guarda nada', () => {
        expect(planDropMoves('bravas', 'Entrantes', before, before, byId)).toEqual([]);
    });

    it('ordenar dentro de una sección fija el puesto de todos los que cambian', () => {
        const after = { ...before, Entrantes: ['bravas', 'croquetas'] };
        expect(planDropMoves('bravas', 'Entrantes', before, after, byId)).toEqual([
            { itemId: 'bravas', group: 'Entrantes', menuOrder: 0 },
            { itemId: 'croquetas', group: 'Entrantes', menuOrder: 1 },
        ]);
    });

    it('a otra sección: cambia su sección y solo se reescriben los puestos que cambian', () => {
        const after = { ...before, [UNSECTIONED]: [], Postres: ['flan', 'pulpo'] };
        expect(planDropMoves('pulpo', 'Postres', before, after, byId)).toEqual([
            { itemId: 'pulpo', group: 'Postres', menuOrder: 1 },
        ]);
    });

    it('al cajón «Sin sección» solo cambia la sección; dentro del cajón no hay nada que guardar', () => {
        const after = { ...before, [UNSECTIONED]: ['pulpo', 'flan'], Postres: [] };
        expect(planDropMoves('flan', UNSECTIONED, before, after, byId)).toEqual([{ itemId: 'flan', group: '', menuOrder: null }]);
        expect(planDropMoves('pulpo', UNSECTIONED, before, before, byId)).toEqual([]);
    });
});

describe('findItemByName', () => {
    const items = [
        item('croqueta-1', {}, { canonicalName: 'Croqueta, la original', curatedAliasesNormalized: ['croqueta de jamon'] } as Partial<CanonicalPlaceItem>),
        item('viejo', {}, { canonicalName: 'Viejo', status: 'inactive' }),
        item('sushi', {}, { canonicalName: '寿司' }),
    ];
    it('encuentra el plato por nombre o por uno de sus nombres curados, sin tildes ni mayúsculas', () => {
        expect(findItemByName(items, 'croqueta LA original')?.id).toBe('croqueta-1');
        expect(findItemByName(items, 'Croqueta de jamón')?.id).toBe('croqueta-1');
        expect(findItemByName(items, 'Croqueta de jamón', 'croqueta-1')).toBeNull();
        expect(findItemByName(items, 'Viejo')).toBeNull();
        expect(findItemByName(items, '寿司')?.id).toBe('sushi');
        expect(findItemByName(items, '  ')).toBeNull();
    });
});

describe('historial de propuestas', () => {
    const now = new Date(2026, 9, 7, 12, 0, 0);
    it('agrupa en Hoy, Esta semana y Antes', () => {
        expect(proposalWhen(new Date(2026, 9, 7, 0, 5).getTime(), now)).toBe('today');
        expect(proposalWhen(new Date(2026, 9, 2, 10).getTime(), now)).toBe('week');
        expect(proposalWhen(new Date(2026, 8, 20).getTime(), now)).toBe('older');
        expect(proposalWhen(0, now)).toBe('older');
        const groups = groupProposalsByWhen([
            { id: 'a', placeId: 'p', type: 'merge', payload: {}, status: 'pending', createdAtMs: new Date(2026, 8, 1).getTime() },
            { id: 'b', placeId: 'p', type: 'rename', payload: {}, status: 'approved', createdAtMs: now.getTime() },
        ], now);
        expect(groups.map((group) => [group.label, group.proposals.map((p) => p.id)])).toEqual([['Hoy', ['b']], ['Antes', ['a']]]);
    });
});

describe('chunk', () => {
    it('parte en lotes del tamaño pedido', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(chunk([], 50)).toEqual([]);
    });
});
