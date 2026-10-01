const test = require('node:test');
const assert = require('node:assert/strict');
const { userReviewDocs, isMissingIndex } = require('../modules/lib/user-reviews');

const doc = (id, data) => ({ id, data: () => data, ref: { path: `lists/l/reviews/${id}` } });
const ALL = [doc('1', { userId: 'ana' }), doc('2', { userId: 'bot' }), doc('3', { userId: 'ana' })];

const fakeDb = (whereFails) => ({
  collectionGroup: () => {
    const q = {
      _start: 0,
      where: (field, _op, value) => ({
        get: async () => {
          if (whereFails) { const e = new Error('9 FAILED_PRECONDITION: The query requires an index.'); e.code = 9; throw e; }
          return { docs: ALL.filter((d) => d.data()[field] === value) };
        },
      }),
      limit: () => q,
      startAfter: () => ({ ...q, get: async () => ({ empty: true, docs: [], size: 0 }) }),
      get: async () => ({ empty: false, docs: ALL, size: ALL.length }),
    };
    return q;
  },
});

test('con índice: consulta directa', async () => {
  assert.deepEqual((await userReviewDocs(fakeDb(false), 'userId', 'ana')).map((d) => d.id), ['1', '3']);
});

test('sin índice: recorre todo y filtra (no falla)', async () => {
  assert.deepEqual((await userReviewDocs(fakeDb(true), 'userId', 'ana')).map((d) => d.id), ['1', '3']);
});

test('detecta el error de índice', () => {
  assert.equal(isMissingIndex({ code: 9 }), true);
  assert.equal(isMissingIndex({ code: 7, message: 'permission' }), false);
});
