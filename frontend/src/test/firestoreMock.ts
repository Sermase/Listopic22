// Doble de `firebase/firestore` para tests de servicios: las funciones que
// construyen consultas devuelven objetos planos fáciles de inspeccionar y las
// lecturas (getDocs, getDoc, getCountFromServer) son vi.fn() que cada test programa.
//
//   vi.mock('../firebase', () => ({ db: {} }));
//   vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreMock);
import { vi } from 'vitest';

export type MockConstraint =
    | { type: 'where'; field: string; op: string; value: unknown }
    | { type: 'orderBy'; field: string; direction: string }
    | { type: 'limit'; value: number }
    | { type: 'startAfter'; cursor: unknown };

export interface MockQuery {
    kind: 'collection' | 'query';
    path: string;
    constraints: MockConstraint[];
}

export interface MockDocSnap {
    id: string;
    data: () => Record<string, unknown> | undefined;
    exists: () => boolean;
}

export const firestoreMock = {
    collection: vi.fn((_db: unknown, ...segments: string[]): MockQuery => ({ kind: 'collection', path: segments.join('/'), constraints: [] })),
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({ kind: 'doc', path: segments.join('/'), id: segments[segments.length - 1] })),
    where: vi.fn((field: string, op: string, value: unknown): MockConstraint => ({ type: 'where', field, op, value })),
    orderBy: vi.fn((field: string, direction = 'asc'): MockConstraint => ({ type: 'orderBy', field, direction })),
    limit: vi.fn((value: number): MockConstraint => ({ type: 'limit', value })),
    startAfter: vi.fn((cursor: unknown): MockConstraint => ({ type: 'startAfter', cursor })),
    query: vi.fn((ref: MockQuery, ...constraints: MockConstraint[]): MockQuery => ({
        kind: 'query',
        path: ref.path,
        constraints: [...ref.constraints, ...constraints],
    })),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    getCountFromServer: vi.fn(),
};

export const resetFirestoreMock = () => {
    firestoreMock.collection.mockClear();
    firestoreMock.doc.mockClear();
    firestoreMock.where.mockClear();
    firestoreMock.orderBy.mockClear();
    firestoreMock.limit.mockClear();
    firestoreMock.startAfter.mockClear();
    firestoreMock.query.mockClear();
    firestoreMock.getDocs.mockReset();
    firestoreMock.getDoc.mockReset();
    firestoreMock.getCountFromServer.mockReset();
};

export const ts = (ms: number) => ({ toMillis: () => ms });

export const mockDoc = (id: string, data: Record<string, unknown>): MockDocSnap => ({ id, data: () => data, exists: () => true });

export const missingDoc = (id: string): MockDocSnap => ({ id, data: () => undefined, exists: () => false });

export const mockSnap = (docs: MockDocSnap[]) => ({ docs, size: docs.length, empty: docs.length === 0 });

export const countSnap = (count: number) => ({ data: () => ({ count }) });

export const firestoreError = (code: string) => Object.assign(new Error(code), { code });

/** Valor del primer where(field, …) de una consulta del doble. */
export const whereOf = (q: MockQuery, field: string) =>
    q.constraints.find((c): c is Extract<MockConstraint, { type: 'where' }> => c.type === 'where' && c.field === field);

export const hasConstraint = (q: MockQuery, type: MockConstraint['type']) => q.constraints.some((c) => c.type === type);
