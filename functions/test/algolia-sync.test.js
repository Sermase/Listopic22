const test = require('node:test');
const assert = require('node:assert/strict');
const { syncAllObjects } = require('../modules/lib/algolia-sync');

const fakeIndex = (existing) => {
  const store = new Map(existing.map((o) => [o.objectID, o]));
  const calls = [];
  const waitable = (fn) => ({ wait: async () => fn() });
  return {
    store,
    calls,
    saveObjects: (objs) => waitable(() => { calls.push('save'); objs.forEach((o) => store.set(o.objectID, o)); }),
    deleteObjects: (ids) => waitable(() => { calls.push('delete'); ids.forEach((id) => store.delete(id)); }),
    browseObjects: async ({ batch, filters }) => {
      const listId = filters && /listId:"([^"]+)"/.exec(filters)[1];
      batch([...store.values()].filter((o) => !listId || o.listId === listId).map((o) => ({ objectID: o.objectID })));
    },
  };
};

test('guarda, luego borra solo lo que sobra; sin índice temporal', async () => {
  const index = fakeIndex([{ objectID: 'a' }, { objectID: 'viejo' }]);
  const result = await syncAllObjects(index, [{ objectID: 'a', v: 2 }, { objectID: 'b' }]);
  assert.deepEqual(result, { saved: 2, deleted: 1 });
  assert.deepEqual([...index.store.keys()].sort(), ['a', 'b']);
  assert.equal(index.store.get('a').v, 2);
  assert.deepEqual(index.calls, ['save', 'delete']); // nunca queda vacío
});

test('sin registros: vacía el índice', async () => {
  const index = fakeIndex([{ objectID: 'x' }]);
  assert.deepEqual(await syncAllObjects(index, []), { saved: 0, deleted: 1 });
  assert.equal(index.store.size, 0);
});

test('por Lista: solo borra los sobrantes de esa Lista y nunca la vacía', async () => {
  const index = fakeIndex([{ objectID: 'L1__a', listId: 'L1' }, { objectID: 'L1__viejo', listId: 'L1' }, { objectID: 'L2__x', listId: 'L2' }]);
  const result = await syncAllObjects(index, [{ objectID: 'L1__a', listId: 'L1', v: 2 }], { filters: 'listId:"L1"' });
  assert.deepEqual(result, { saved: 1, deleted: 1 });
  assert.deepEqual([...index.store.keys()].sort(), ['L1__a', 'L2__x']);
  assert.deepEqual(index.calls, ['save', 'delete']);
});
