import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
    updateDoc: vi.fn(),
    getDoc: vi.fn(),
    batchUpdate: vi.fn(),
    batchCommit: vi.fn(),
    callable: vi.fn(),
    searchReviews: vi.fn(),
}));

vi.mock('../firebase', () => ({ db: {}, functions: {} }));
vi.mock('./developerAdmin', () => ({ adminSearchReviews: fs.searchReviews }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => fs.callable }));
vi.mock('firebase/firestore', () => ({
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    updateDoc: fs.updateDoc,
    getDoc: fs.getDoc,
    deleteField: () => '<deleteField>',
    serverTimestamp: () => '<serverTimestamp>',
    arrayUnion: (...values: unknown[]) => ({ arrayUnion: values }),
    writeBatch: () => ({ update: fs.batchUpdate, commit: fs.batchCommit }),
}));

import { groupReportPlaceId, markGroupItemUnavailable, setItemAvailability, syncPlaceStatusFromGoogle, updateReportStatus } from './reportModeration';

beforeEach(() => {
    Object.values(fs).forEach((mock) => mock.mockReset());
    fs.updateDoc.mockResolvedValue(undefined);
    fs.batchCommit.mockResolvedValue(undefined);
});

describe('updateReportStatus', () => {
    it('Reabrir borra quién y cuándo se cerró', async () => {
        await updateReportStatus({ reportId: 'r1', report: {}, status: 'pending', notes: 'ignorada', actorUid: 'jefe' });
        expect(fs.updateDoc).toHaveBeenCalledTimes(1);
        expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'reports/r1' }, {
            status: 'pending',
            resolvedAt: '<deleteField>',
            resolvedBy: '<deleteField>',
            resolvedClosedStatus: '<deleteField>',
        });
    });

    it('Resolver guarda la hora del servidor, el jefe y la nota', async () => {
        await updateReportStatus({ reportId: 'r1', report: { targetType: 'review' }, status: 'rejected', notes: '  spam  ', actorUid: 'jefe' });
        expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'reports/r1' }, {
            status: 'rejected',
            resolvedAt: '<serverTimestamp>',
            resolvedBy: 'jefe',
            adminNotes: 'spam',
        });
    });

    it('Cerrar un lugar actualiza el lugar y sus reseñas por lotes', async () => {
        fs.searchReviews.mockResolvedValue({ reviews: [{ path: 'lists/l1/reviews/a' }, { path: 'lists/l2/reviews/b' }] });
        await updateReportStatus({
            reportId: 'r2',
            report: { targetType: 'place', targetId: 'p1' },
            status: 'resolved',
            closedStatus: 'permanently_closed',
            actorUid: 'jefe',
        });
        expect(fs.updateDoc).toHaveBeenNthCalledWith(1, { path: 'reports/r2' }, expect.objectContaining({ resolvedClosedStatus: 'permanently_closed' }));
        expect(fs.updateDoc).toHaveBeenNthCalledWith(2, { path: 'places/p1' }, {
            closedStatus: 'permanently_closed',
            closedStatusUpdatedAt: '<serverTimestamp>',
        });
        expect(fs.searchReviews).toHaveBeenCalledWith({ placeId: 'p1', limit: 5000 });
        expect(fs.batchUpdate).toHaveBeenCalledTimes(2);
        expect(fs.batchCommit).toHaveBeenCalledTimes(1);
    });
});

describe('markGroupItemUnavailable', () => {
    it('añade el elemento al lugar (sin repetir variantes del nombre) y resuelve el reporte', async () => {
        fs.getDoc.mockResolvedValue({ data: () => ({ unavailableItems: ['bravás', 'Tomate'] }) });
        await markGroupItemUnavailable({ reportId: 'r3', report: { targetType: 'group', targetId: 'p9_Bravas', targetName: 'Bravas' }, actorUid: 'jefe' });
        expect(fs.updateDoc).toHaveBeenNthCalledWith(1, { path: 'places/p9' }, { unavailableItems: ['Tomate', 'Bravas'], unavailableItemsUpdatedAt: '<serverTimestamp>' });
        expect(fs.updateDoc).toHaveBeenNthCalledWith(2, { path: 'reports/r3' }, expect.objectContaining({ status: 'resolved' }));
    });

    it('un reporte antiguo desde una reseña busca su sitio y su plato', async () => {
        fs.searchReviews.mockResolvedValue({ reviews: [{ id: 'rv1', placeId: 'p7', itemName: 'Pincho de feria' }] });
        fs.getDoc.mockResolvedValue({ data: () => ({}) });
        await markGroupItemUnavailable({ reportId: 'r4', report: { targetType: 'review', targetId: 'rv1', targetOwnerId: 'u1' } });
        expect(fs.searchReviews).toHaveBeenCalledWith({ userId: 'u1', limit: 5000 });
        expect(fs.updateDoc).toHaveBeenNthCalledWith(1, { path: 'places/p7' }, expect.objectContaining({ unavailableItems: ['Pincho de feria'] }));
    });

    it('«Vuelve a estar» quita el plato por nombre normalizado', async () => {
        fs.getDoc.mockResolvedValue({ data: () => ({ unavailableItems: ['Tomate ', 'Bravas'] }) });
        await setItemAvailability({ placeId: 'p9', itemName: 'tomate', unavailable: false });
        expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'places/p9' }, { unavailableItems: ['Bravas'], unavailableItemsUpdatedAt: '<serverTimestamp>' });
    });

    it('sin elemento no escribe nada', async () => {
        await expect(markGroupItemUnavailable({ reportId: 'r3', report: { targetId: 'p9_x' } })).rejects.toThrow();
        expect(fs.updateDoc).not.toHaveBeenCalled();
    });
});

describe('utilidades', () => {
    it('groupReportPlaceId separa el lugar del elemento', () => {
        expect(groupReportPlaceId('abc_Patatas bravas')).toBe('abc');
        expect(groupReportPlaceId('abc')).toBe('abc');
    });

    it('syncPlaceStatusFromGoogle devuelve un texto legible', async () => {
        fs.callable.mockResolvedValueOnce({ data: { closedStatus: 'temporarily_closed' } });
        await expect(syncPlaceStatusFromGoogle('p1')).resolves.toBe('⏰ Cerrado temporalmente');
        fs.callable.mockResolvedValueOnce({ data: { businessStatus: 'OPERATIONAL', closedStatus: null } });
        await expect(syncPlaceStatusFromGoogle('p1')).resolves.toBe('✅ Operativo (OPERATIONAL)');
    });
});
