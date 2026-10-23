'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reviewSlotKey, keeperId } = require('../modules/lib/review-uniqueness');

const base = { userId: 'u1', listId: 'L', placeId: 'P', itemName: 'Bravas', visibility: 'public' };

test('mismo hueco con tildes y signos; Minilista pública comparte hueco', () => {
  assert.equal(reviewSlotKey(base), reviewSlotKey({ ...base, itemName: 'bravás!', sublistId: 'S' }));
});

test('Minilista privada es otro hueco', () => {
  assert.notEqual(reviewSlotKey(base), reviewSlotKey({ ...base, visibility: 'private', sublistId: 'S' }));
});

test('sin plato no hay clave', () => {
  assert.equal(reviewSlotKey({ ...base, itemName: '' }), null);
});

test('se conserva la más antigua y, a igualdad, el id menor', () => {
  const ts = (ms) => ({ toMillis: () => ms });
  assert.equal(keeperId([{ id: 'b', createdAt: ts(2) }, { id: 'a', createdAt: ts(5) }]), 'b');
  assert.equal(keeperId([{ id: 'b', createdAt: ts(2) }, { id: 'a', createdAt: ts(2) }]), 'a');
});
