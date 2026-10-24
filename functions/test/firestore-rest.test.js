const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fromDocument } = require('../modules/lib/firestore-rest');

test('fromDocument: valores REST de Firestore a objetos normales', () => {
  const doc = fromDocument({
    name: 'projects/p/databases/(default)/documents/groups/g1/movs/m1',
    fields: {
      desc: { stringValue: 'Cena' },
      amount: { integerValue: '4800' },
      w: { doubleValue: 0.5 },
      settle: { booleanValue: false },
      note: { nullValue: null },
      parts: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
      empty: { arrayValue: {} },
      shares: { mapValue: { fields: { a: { integerValue: '2400' } } } },
      at: { timestampValue: '2026-08-01T10:00:00Z' },
    },
  });
  assert.equal(doc.id, 'm1');
  assert.deepEqual({ ...doc.data, at: undefined }, {
    desc: 'Cena', amount: 4800, w: 0.5, settle: false, note: null, parts: ['a', 'b'], empty: [], shares: { a: 2400 }, at: undefined,
  });
  assert.equal(doc.data.at.toDate().toISOString(), '2026-08-01T10:00:00.000Z');
});
