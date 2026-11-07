const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateGroups } = require('../modules/grouped-aggregator');

const list = { id: 'l1', criteria: [] };
const review = (id, userId, at, extra = {}) => ({
  id, userId, listId: 'l1', placeId: 'p1', itemName: 'Bravas', overallRating: 8, visibility: 'public', createdAt: at, ...extra,
});

test('«Top reciente»: última valoración de personas, con fechas de Firestore, Date o texto', () => {
  const [group] = aggregateGroups('l1', list, [
    review('a', 'u1', { toMillis: () => Date.UTC(2026, 9, 1) }),
    review('b', 'u2', new Date(Date.UTC(2026, 10, 2))),
    review('c', 'u3', '2026-10-15T10:00:00Z'),
    review('d', 'bot1', new Date(Date.UTC(2026, 10, 5))),
  ], new Map(), new Set(['bot1']));
  assert.equal(group.lastReviewAtMs, Date.UTC(2026, 10, 2));
});

test('solo bots: cuenta la de los bots; sin fecha, null', () => {
  const [onlyBots] = aggregateGroups('l1', list, [review('d', 'bot1', { _seconds: 1_800_000_000 })], new Map(), new Set(['bot1']));
  assert.equal(onlyBots.lastReviewAtMs, 1_800_000_000_000);
  const [undated] = aggregateGroups('l1', list, [review('e', 'u1', undefined)], new Map(), new Set());
  assert.equal(undated.lastReviewAtMs, null);
});
