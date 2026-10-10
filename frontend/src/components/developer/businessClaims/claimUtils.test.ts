import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async () => (await import('../../../test/firestoreMock')).firestoreMock);

import { toInboxItem } from '../../../services/adminQueues';
import { MINUTE_MS } from '../../../utils/adminTime';
import {
    buildClaimHistory,
    claimWarnings,
    countPendingByPlace,
    formatBytes,
    markDecided,
    normalizeClaimsFilter,
    normalizeClaimsView,
    ownerToReplace,
    phoneHref,
    placeContextFromDoc,
    safeWebsiteUrl,
    toClaim,
    viewOfStatus,
    type ClaimAuditEntry,
} from './claimUtils';

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime();
const ts = (ms: number) => ({ toMillis: () => ms });

const claimItem = (id: string, data: Record<string, unknown>) => toInboxItem('businessClaims', id, {
    userId: 'u-juan',
    userName: 'Juan López',
    placeId: 'p1',
    placeName: 'Bar Pepe',
    role: 'Propietario',
    contactEmail: 'juan@bar.es',
    message: 'Soy el dueño',
    status: 'pending',
    proofs: [],
    createdAt: ts(NOW - 2 * 60 * MINUTE_MS),
    ...data,
}, NOW);

describe('normalizar la URL', () => {
    it('cae en pendientes y en «todas» con valores desconocidos', () => {
        expect(normalizeClaimsView('resolved')).toBe('resolved');
        expect(normalizeClaimsView('history')).toBe('pending');
        expect(normalizeClaimsView(null)).toBe('pending');
        expect(normalizeClaimsFilter('approved')).toBe('approved');
        expect(normalizeClaimsFilter('rejected')).toBe('rejected');
        expect(normalizeClaimsFilter('')).toBe('all');
        expect(normalizeClaimsFilter('ended')).toBe('all');
        expect(viewOfStatus('pending')).toBe('pending');
        expect(viewOfStatus('approved')).toBe('resolved');
    });
});

describe('toClaim', () => {
    it('tipa el documento, descarta pruebas rotas y lee los reenvíos', () => {
        const claim = toClaim(claimItem('c1', {
            contactPhone: '600 111 222',
            website: 'barpepe.es',
            placeAddress: 'Calle Mayor 1',
            proofs: [{ name: 'cif.pdf', size: 2048, type: 'application/pdf', storagePath: 'a', downloadUrl: 'https://x/a' }, null, 'raro'],
            previousReviews: [{ status: 'rejected', adminNotes: 'Faltan pruebas', reviewedBy: 'u-ana', reviewedAt: ts(NOW - 3 * 24 * 60 * MINUTE_MS) }],
        }));
        expect(claim.contactPhone).toBe('600 111 222');
        expect(claim.website).toBe('barpepe.es');
        expect(claim.placeAddress).toBe('Calle Mayor 1');
        expect(claim.proofs).toHaveLength(1);
        expect(claim.createdAtMs).toBe(NOW - 2 * 60 * MINUTE_MS);
        expect(claim.previousReviews).toEqual([
            { status: 'rejected', adminNotes: 'Faltan pruebas', reviewedBy: 'u-ana', reviewedAtMs: NOW - 3 * 24 * 60 * MINUTE_MS, proofs: [] },
        ]);
    });
});

describe('avisos de una solicitud pendiente', () => {
    const claim = { userId: 'u-juan', status: 'pending' as const };

    it('avisa si el lugar ya tiene otro propietario y de las solicitudes que compiten', () => {
        const place = placeContextFromDoc({ businessVerified: true, businessOwnerUserId: 'u-ana' });
        expect(claimWarnings(claim, place, 2)).toEqual([
            { emoji: '⚠️', text: 'Ya verificado · propietario', tone: 'warning', userId: 'u-ana' },
            { emoji: '👥', text: '2 solicitudes para este lugar', tone: 'warning' },
        ]);
        expect(ownerToReplace(claim, place)).toBe('u-ana');
    });

    it('no pide transferir si el solicitante ya es el propietario o el lugar no está verificado', () => {
        const own = placeContextFromDoc({ businessVerified: true, businessOwnerUserId: 'u-juan' });
        expect(claimWarnings(claim, own, 1)).toEqual([{ emoji: 'ℹ️', text: 'Ya es el propietario', tone: 'info' }]);
        expect(ownerToReplace(claim, own)).toBeNull();
        const free = placeContextFromDoc({ businessVerified: false, businessManagerIds: ['u-juan'] });
        expect(claimWarnings(claim, free, 1)).toEqual([{ emoji: 'ℹ️', text: 'Ya es gestor del lugar', tone: 'info' }]);
        expect(ownerToReplace(claim, free)).toBeNull();
        expect(ownerToReplace(claim, undefined)).toBeNull();
    });

    it('marca el lugar borrado y no avisa en las resueltas', () => {
        expect(claimWarnings(claim, placeContextFromDoc(null), 1)).toEqual([{ emoji: '❓', text: 'El lugar ya no existe', tone: 'danger' }]);
        expect(claimWarnings({ userId: 'u-juan', status: 'approved' }, placeContextFromDoc(null), 3)).toEqual([]);
    });

    it('cuenta solo pendientes y sin repetir ids', () => {
        const counts = countPendingByPlace([
            { id: 'a', status: 'pending', placeId: 'p1' },
            { id: 'a', status: 'pending', placeId: 'p1' },
            { id: 'b', status: 'pending', placeId: 'p1' },
            { id: 'c', status: 'approved', placeId: 'p1' },
            { id: 'd', status: 'pending', placeId: 'p2' },
        ]);
        expect(counts.get('p1')).toBe(2);
        expect(counts.get('p2')).toBe(1);
    });
});

describe('markDecided', () => {
    it('guarda estado, nota, quién y reviewedAt en local', () => {
        const decided = markDecided(claimItem('c1', {}), 'rejected', 'Faltan pruebas', 'u-admin', NOW);
        expect(decided.status).toBe('rejected');
        expect(decided.target.view).toBe('resolved');
        expect(decided.data).toMatchObject({ status: 'rejected', adminNotes: 'Faltan pruebas', reviewedBy: 'u-admin', reviewedAt: NOW });
        expect(toClaim(decided).reviewedAtMs).toBe(NOW);
    });
});

describe('buildClaimHistory', () => {
    const audit = (id: string, status: string, actorUid: string, atMs: number, extra: Record<string, unknown> = {}): ClaimAuditEntry => ({
        id,
        action: 'businessClaim.review',
        actorUid,
        createdAtMs: atMs,
        details: { claimId: 'c1', status, ...extra },
    });

    it('une la auditoría con las notas de la solicitud y ordena del más reciente al más antiguo', () => {
        const firstReview = NOW - 3 * 24 * 60 * MINUTE_MS;
        const secondReview = NOW - 10 * MINUTE_MS;
        const claim = toClaim(claimItem('c1', {
            status: 'approved',
            adminNotes: 'Todo en orden',
            reviewedBy: 'u-ana',
            reviewedAt: ts(secondReview - 1000),
            createdAt: ts(NOW - 24 * 60 * MINUTE_MS),
            previousReviews: [{ status: 'rejected', adminNotes: 'Faltan pruebas', reviewedBy: 'u-luis', reviewedAt: ts(firstReview) }],
        }));
        const history = buildClaimHistory(claim, [
            audit('a1', 'rejected', 'u-luis', firstReview + 2000),
            audit('a2', 'approved', 'u-ana', secondReview, { previousOwnerUserId: 'u-old' }),
        ]);
        expect(history.map((entry) => [entry.kind, entry.status, entry.notes])).toEqual([
            ['review', 'approved', 'Todo en orden'],
            ['submitted', 'pending', null],
            ['review', 'rejected', 'Faltan pruebas'],
        ]);
        expect(history[0].previousOwnerId).toBe('u-old');
        expect(history[1].action).toBe('resubmitted');
    });

    it('sin auditoría usa lo que guarda la solicitud', () => {
        const claim = toClaim(claimItem('c1', {
            status: 'rejected',
            adminNotes: 'No es el dueño',
            reviewedBy: 'u-ana',
            reviewedAt: ts(NOW - MINUTE_MS),
        }));
        const history = buildClaimHistory(claim, []);
        expect(history[0]).toMatchObject({ key: 'current', status: 'rejected', by: 'u-ana', notes: 'No es el dueño' });
        expect(history[1]).toMatchObject({ kind: 'submitted', action: 'submitted' });
    });
});

describe('contacto', () => {
    it('crea enlaces seguros de web y teléfono', () => {
        expect(safeWebsiteUrl('barpepe.es')).toBe('https://barpepe.es/');
        expect(safeWebsiteUrl('http://barpepe.es/carta')).toBe('http://barpepe.es/carta');
        expect(safeWebsiteUrl('javascript:alert(1)')).toBeNull();
        expect(safeWebsiteUrl('bar pepe')).toBeNull();
        expect(safeWebsiteUrl('')).toBeNull();
        expect(phoneHref('+34 600 111 222')).toBe('tel:+34600111222');
        expect(phoneHref('12')).toBeNull();
        expect(formatBytes(2048)).toBe('2 KB');
        expect(formatBytes(0)).toBe('');
    });
});
