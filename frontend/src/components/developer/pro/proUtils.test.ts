import { describe, expect, it, vi } from 'vitest';
import { toInboxItem, type InboxItem, type QueuePage } from '../../../services/adminQueues';
import {
    applyDecisionLocally,
    applyResultText,
    closingInfo,
    composeRows,
    createMergeSources,
    decisionConfirm,
    decisionSuccessText,
    decisionsFor,
    historySources,
    historyStatusCount,
    historyStatusOptions,
    kindCount,
    loadSources,
    mergedHasMore,
    normalizeHistoryFilter,
    normalizeKindFilter,
    normalizeProView,
    sortByEndsAt,
    sortOldestFirst,
    spotlightCost,
    sumCounts,
    takeMerged,
    toProRow,
    viewCount,
    viewOfItem,
    type MergeSource,
    type ProCounts,
    type ProQueueKey,
} from './proUtils';

vi.mock('../../../firebase', () => ({ db: {}, functions: {}, auth: {} }));

const NOW = new Date(2026, 9, 6, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const ts = (ms: number) => ({ toMillis: () => ms });

const item = (queue: ProQueueKey, id: string, data: Record<string, unknown>): InboxItem =>
    toInboxItem(queue, id, { placeId: 'p1', placeName: 'Bar Pepe', ...data }, NOW);

const proposal = (id: string, data: Record<string, unknown> = {}) => item('itemProposals', id, {
    type: 'merge',
    status: 'pending',
    payload: { sourceItemId: 'bravas', sourceItemName: 'Bravas', targetItemId: 'patatas-bravas', targetItemName: 'Patatas bravas' },
    createdAt: ts(NOW - DAY),
    ...data,
});

const placement = (id: string, data: Record<string, unknown> = {}) => item('sponsoredPlacements', id, {
    type: 'home',
    status: 'requested',
    headline: 'Desayunos 3€',
    createdAt: ts(NOW - DAY),
    ...data,
});

const spotlight = (id: string, data: Record<string, unknown> = {}) => item('sponsoredItemSpotlights', id, {
    itemName: 'Bravas',
    status: 'requested',
    radiusKm: 3,
    days: 7,
    units: 2,
    impulses: 140,
    creditsUsed: 120,
    billedImpulses: 20,
    totalPriceEur: 1,
    createdAt: ts(NOW - DAY),
    ...data,
});

const page = (items: InboxItem[], hasMore = false): QueuePage => ({ items, cursor: null, hasMore, degraded: false });

describe('vistas y filtros', () => {
    it('normaliza lo que llega por la URL', () => {
        expect(normalizeProView('history')).toBe('history');
        expect(normalizeProView('tools')).toBe('tools');
        expect(normalizeProView('loquesea')).toBe('inbox');
        expect(normalizeProView(null)).toBe('inbox');
        expect(normalizeKindFilter('proposal', 'active')).toBe('all');
        expect(normalizeKindFilter('spotlight', 'active')).toBe('spotlight');
    });

    it('solo ofrece los estados que existen para cada tipo', () => {
        expect(historyStatusOptions('all')).toEqual(['approved', 'rejected', 'ended']);
        expect(historyStatusOptions('proposal')).toEqual(['approved', 'rejected']);
        expect(historyStatusOptions('placement')).toEqual(['rejected', 'ended']);
        expect(normalizeHistoryFilter('approved', 'placement')).toBe('all');
        expect(normalizeHistoryFilter('ended', 'all')).toBe('ended');
        expect(normalizeHistoryFilter('pending', 'all')).toBe('all');
    });

    it('arma una consulta por cola con sus estados', () => {
        expect(historySources('all', 'all')).toEqual([
            { queue: 'itemProposals', statuses: ['approved', 'rejected'] },
            { queue: 'sponsoredPlacements', statuses: ['rejected', 'ended'] },
            { queue: 'sponsoredItemSpotlights', statuses: ['rejected', 'ended'] },
        ]);
        expect(historySources('all', 'approved')).toEqual([{ queue: 'itemProposals', statuses: ['approved'] }]);
        expect(historySources('spotlight', 'rejected')).toEqual([{ queue: 'sponsoredItemSpotlights', statuses: ['rejected'] }]);
    });

    it('sabe en qué sub-pestaña vive cada elemento', () => {
        expect(viewOfItem(proposal('a'))).toBe('inbox');
        expect(viewOfItem(proposal('a', { status: 'approved' }))).toBe('history');
        expect(viewOfItem(placement('b', { status: 'active' }))).toBe('active');
        expect(viewOfItem(spotlight('c', { status: 'ended' }))).toBe('history');
    });
});

describe('filas', () => {
    it('mapea cada cola a su tipo', () => {
        expect(toProRow(proposal('a')).kind).toBe('proposal');
        expect(toProRow(placement('b')).kind).toBe('placement');
        const row = toProRow(spotlight('c'));
        expect(row.kind).toBe('spotlight');
        if (row.kind === 'spotlight') expect(row.spotlight.creditsUsed).toBe(120);
    });

    it('separa los impulsos de regalo de los que se facturan', () => {
        const row = toProRow(spotlight('c'));
        if (row.kind !== 'spotlight') throw new Error('tipo');
        expect(spotlightCost(row.spotlight)).toEqual({ impulses: 140, gift: 120, billed: 20, totalEur: 1 });
        const allGift = toProRow(spotlight('d', { creditsUsed: 140, billedImpulses: undefined, totalPriceEur: 0 }));
        if (allGift.kind !== 'spotlight') throw new Error('tipo');
        expect(spotlightCost(allGift.spotlight)).toMatchObject({ gift: 140, billed: 0, totalEur: 0 });
    });

    it('ordena la bandeja por antigüedad y «En curso» por fecha de fin', () => {
        const rows = [
            placement('nofin', { status: 'active', createdAt: ts(NOW - 9 * DAY) }),
            spotlight('later', { status: 'active', endsAt: '2026-10-20' }),
            placement('soon', { status: 'active', endsAt: '2026-10-07' }),
        ].map(toProRow);
        expect(sortByEndsAt(rows).map((row) => row.item.id)).toEqual(['soon', 'later', 'nofin']);
        expect(sortOldestFirst(rows).map((row) => row.item.id)).toEqual(['nofin', 'later', 'soon']);
    });

    it('fija arriba el foco aunque no esté cargado o el filtro de tipo lo esconda', () => {
        const loaded = [toProRow(proposal('a')), toProRow(placement('b'))];
        const focus = spotlight('c');
        const rows = composeRows({ loaded, view: 'inbox', kind: 'proposal', term: '', focusItem: focus, exactItems: [], overrides: {} });
        expect(rows.map((row) => row.item.id)).toEqual(['c', 'a']);
        const hidden = composeRows({ loaded, view: 'inbox', kind: 'proposal', term: '', focusItem: placement('b'), exactItems: [], overrides: {} });
        expect(hidden.map((row) => row.item.id)).toEqual(['b', 'a']);
    });

    it('añade coincidencias exactas del servidor de esta sub-pestaña y aplica las filas decididas', () => {
        const loaded = [toProRow(proposal('a', { placeName: 'Café Sol' }))];
        const decided = applyDecisionLocally(loaded[0], 'reject', { uid: 'u1', notes: '', now: NOW });
        const rows = composeRows({
            loaded,
            view: 'inbox',
            kind: 'all',
            term: 'p1',
            focusItem: null,
            exactItems: [placement('x'), placement('y', { status: 'active' })],
            overrides: { [decided.item.key]: decided },
        });
        expect(rows.map((row) => [row.item.id, row.item.status])).toEqual([['a', 'rejected'], ['x', 'requested']]);
    });
});

describe('decisiones', () => {
    it('ofrece las decisiones de cada estado', () => {
        expect(decisionsFor(toProRow(proposal('a')))).toEqual(['reject', 'approve']);
        expect(decisionsFor(toProRow(placement('b')))).toEqual(['reject', 'activate']);
        expect(decisionsFor(toProRow(spotlight('c', { status: 'active' })))).toEqual(['end']);
        expect(decisionsFor(toProRow(spotlight('c', { status: 'ended' })))).toEqual([]);
    });

    it('una propuesta atascada en «applying» solo se reintenta; la que se está aplicando no se toca', () => {
        const stuck = toProRow(proposal('a', { status: 'applying', reviewedBy: 'u-ana', applyingAt: ts(NOW - 30 * 60 * 1000) }));
        expect(decisionsFor(stuck, NOW)).toEqual(['approve']);
        const fresh = toProRow(proposal('b', { status: 'applying', reviewedBy: 'u-ana', applyingAt: ts(NOW - 2 * 60 * 1000) }));
        expect(decisionsFor(fresh, NOW)).toEqual([]);
        expect(decisionsFor(toProRow(proposal('c', { status: 'approved' })), NOW)).toEqual([]);

        const retry = decisionConfirm(stuck, 'approve', '', NOW);
        expect(retry).toMatchObject({ title: '🔁 ¿Reintentar la propuesta?', confirmLabel: 'Reintentar' });
        expect(retry.message).toContain('Se quedó a medias al aplicarla');
        // Quién la está aplicando y desde cuándo.
        expect(closingInfo(stuck)).toEqual({ status: 'applying', by: 'u-ana', at: NOW - 30 * 60 * 1000 });
    });

    it('una campaña pedida cuyo último día ya pasó solo se rechaza (el servidor no la activa)', () => {
        expect(decisionsFor(toProRow(placement('b', { endsAt: '2026-10-05' })), NOW)).toEqual(['reject']);
        expect(decisionsFor(toProRow(placement('b', { endsAt: '2026-10-06' })), NOW)).toEqual(['reject', 'activate']);
        // Un plato recibe fechas nuevas al activarlo: las viejas de la solicitud no cuentan.
        expect(decisionsFor(toProRow(spotlight('c', { endsAt: '2026-07-17' })), NOW)).toEqual(['reject', 'activate']);
        expect(decisionConfirm(toProRow(placement('b', { endsAt: '2026-10-06' })), 'activate', '', NOW).message).not.toContain('ya pasó');
    });

    it('al activar un plato, el estado local recibe las fechas del periodo', () => {
        const row = applyDecisionLocally(toProRow(spotlight('c')), 'activate', { uid: 'u1', notes: '', now: NOW });
        if (row.kind !== 'spotlight') throw new Error('tipo');
        expect(row.spotlight.status).toBe('active');
        expect(row.spotlight.startsAt).toBe(new Date(NOW).toISOString().slice(0, 10));
        expect(row.spotlight.endsAt).toBe(new Date(NOW + 7 * DAY).toISOString().slice(0, 10));
        expect(row.spotlight.reviewedBy).toBe('u1');
        expect(row.spotlight.reviewedAtMs).toBe(NOW);
    });

    it('al rechazar un plato con regalo, marca los impulsos devueltos', () => {
        const before = toProRow(spotlight('c'));
        expect(decisionSuccessText(before, 'reject')).toContain('Hemos devuelto 120 impulsos');
        const row = applyDecisionLocally(before, 'reject', { uid: 'u1', notes: 'Foto borrosa', now: NOW });
        if (row.kind !== 'spotlight') throw new Error('tipo');
        expect(row.spotlight.creditsRefunded).toBe(true);
        expect(row.spotlight.adminNotes).toBe('Foto borrosa');
        expect(row.item.badges.map((badge) => badge.text)).toContain('120 impulsos devueltos');
    });

    it('el confirm enseña la nota que se va a enviar', () => {
        const withNote = decisionConfirm(toProRow(proposal('a')), 'reject', 'Son platos distintos');
        expect(withNote.message).toContain('“Son platos distintos”');
        expect(withNote.destructive).toBe(true);
        expect(decisionConfirm(toProRow(proposal('a')), 'approve', '').message).toContain('Sin nota para el negocio.');
        expect(decisionConfirm(toProRow(spotlight('c')), 'reject', '').message).toContain('Se devuelven 120 impulsos de regalo');
        expect(decisionConfirm(toProRow(spotlight('c', { itemInactive: true })), 'activate', '').message).toContain('⚠️ El plato ya no está en la carta');
        expect(decisionConfirm(toProRow(spotlight('c')), 'activate', '').message).not.toContain('ya no está en la carta');
    });
});

describe('quién cerró', () => {
    it('propuestas: reviewedBy/reviewedAt y lo que se aplicó', () => {
        const row = toProRow(proposal('a', { status: 'approved', reviewedBy: 'u-ana', reviewedAt: ts(NOW), applyResult: { reassignedReviews: 3 } }));
        expect(closingInfo(row)).toEqual({ status: 'approved', by: 'u-ana', at: NOW });
        if (row.kind !== 'proposal') throw new Error('tipo');
        expect(applyResultText(row.proposal)).toBe('🔀 3 reseñas movidas');
        const moved = toProRow(proposal('b', { type: 'reassign_review', status: 'approved', applyResult: { reassignedReviews: 1 } }));
        if (moved.kind === 'proposal') expect(applyResultText(moved.proposal)).toBe('↪️ 1 reseña movida');
        const renamed = toProRow(proposal('c', { type: 'rename', status: 'approved', applyResult: { renamed: true } }));
        if (renamed.kind === 'proposal') expect(applyResultText(renamed.proposal)).toBe('✏️ Nombre cambiado');
    });

    it('campañas cerradas por el proceso diario: 🤖 Automático', () => {
        const auto = toProRow(placement('b', { status: 'ended', endedAt: ts(NOW), reviewedBy: 'u-ana', reviewedAt: ts(NOW - DAY) }));
        expect(closingInfo(auto)).toEqual({ status: 'ended', by: 'system', at: NOW });
        const manual = toProRow(placement('c', { status: 'ended', reviewedBy: 'u-ana', reviewedAt: ts(NOW) }));
        expect(closingInfo(manual)).toEqual({ status: 'ended', by: 'u-ana', at: NOW });
        const withEndedBy = toProRow(spotlight('d', { status: 'ended', endedBy: 'u-luis', endedAt: ts(NOW) }));
        expect(closingInfo(withEndedBy)).toEqual({ status: 'ended', by: 'u-luis', at: NOW });
        const expired = toProRow(placement('e', { status: 'rejected', closedAt: ts(NOW) }));
        expect(closingInfo(expired)).toEqual({ status: 'rejected', by: 'system', at: NOW });
    });
});

describe('carga sin tragarse errores', () => {
    it('una cola que falla trae su error y las demás se ven', async () => {
        const results = await loadSources(['itemProposals', 'sponsoredItemSpotlights'], async (queue) => {
            if (queue === 'sponsoredItemSpotlights') throw new Error('permission-denied');
            return page([proposal('a')], true);
        });
        expect(results[0]).toMatchObject({ queue: 'itemProposals', hasMore: true, error: null });
        expect(results[0].items).toHaveLength(1);
        expect(results[1]).toMatchObject({ queue: 'sponsoredItemSpotlights', items: [], error: 'No se pudieron cargar los platos destacados.' });
    });
});

describe('historial mezclado', () => {
    const at = (days: number) => ts(NOW - days * DAY);

    it('mezcla tres consultas paginadas por fecha y pide más solo cuando hace falta', async () => {
        const data: Record<ProQueueKey, InboxItem[]> = {
            itemProposals: [1, 4, 5, 8].map((d) => proposal(`p${d}`, { status: 'approved', createdAt: at(d) })),
            sponsoredPlacements: [2, 6].map((d) => placement(`c${d}`, { status: 'ended', createdAt: at(d) })),
            sponsoredItemSpotlights: [3, 7].map((d) => spotlight(`s${d}`, { status: 'rejected', createdAt: at(d) })),
        };
        const fetchPage = vi.fn(async (source: MergeSource): Promise<QueuePage> => {
            const all = data[source.queue];
            const start = source.cursor ? all.findIndex((entry) => entry.id === (source.cursor as unknown as { id: string }).id) + 1 : 0;
            const slice = all.slice(start, start + 2);
            const hasMore = start + 2 < all.length;
            return { items: slice, cursor: hasMore ? ({ id: slice[slice.length - 1].id } as never) : null, hasMore, degraded: false };
        });

        const first = await takeMerged(createMergeSources(historySources('all', 'all')), 3, fetchPage);
        expect(first.items.map((entry) => entry.id)).toEqual(['p1', 'c2', 's3']);
        expect(fetchPage).toHaveBeenCalledTimes(3);
        expect(mergedHasMore(first.sources)).toBe(true);

        const second = await takeMerged(first.sources, 10, fetchPage);
        expect(second.items.map((entry) => entry.id)).toEqual(['p4', 'p5', 'c6', 's7', 'p8']);
        expect(mergedHasMore(second.sources)).toBe(false);
    });

    it('si una consulta falla, se marca su error y se sigue con las demás', async () => {
        const result = await takeMerged(createMergeSources(historySources('all', 'rejected')), 5, async (source) => {
            if (source.queue === 'sponsoredPlacements') throw new Error('boom');
            return page(source.queue === 'itemProposals' ? [proposal('p', { status: 'rejected' })] : []);
        });
        expect(result.items.map((entry) => entry.id)).toEqual(['p']);
        expect(result.sources.find((source) => source.queue === 'sponsoredPlacements')?.error).toBe('No se pudo cargar el historial de las campañas.');
        expect(mergedHasMore(result.sources)).toBe(false);
    });
});

describe('contadores', () => {
    const counts: ProCounts = {
        itemProposals: { pending: 2, applying: 1, approved: 10, rejected: 3 },
        sponsoredPlacements: { requested: 1, active: 4, rejected: 1, ended: 6 },
        sponsoredItemSpotlights: { requested: 1, active: 2, rejected: 2, ended: null },
    };

    it('suma por sub-pestaña, tipo y estado', () => {
        // La Bandeja cuenta también las propuestas que se están aplicando (como la lista).
        expect(viewCount(counts, 'inbox')).toBe(5);
        expect(kindCount(counts, 'inbox', 'proposal')).toBe(3);
        expect(viewCount(counts, 'active')).toBe(6);
        expect(kindCount(counts, 'history', 'proposal')).toBe(13);
        expect(kindCount(counts, 'history', 'placement', 'ended')).toBe(6);
        expect(historyStatusCount(counts, 'all', 'rejected')).toBe(6);
        expect(historyStatusCount(counts, 'all', 'approved')).toBe(10);
        // Un count desconocido no da un total falso.
        expect(historyStatusCount(counts, 'all', 'ended')).toBeNull();
        expect(viewCount(undefined, 'inbox')).toBeNull();
        expect(sumCounts([1, 2, 3])).toBe(6);
    });
});
