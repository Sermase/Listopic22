const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aptDeltas, cleanAnswers } = require('../modules/lib/apt-for');

test('cleanAnswers: solo claves y valores conocidos', () => {
  assert.deepEqual(cleanAnswers({ glutenFree: 'yes', stepFree: 'maybe', isAdmin: 'yes' }), { glutenFree: 'yes' });
});

test('aptDeltas: alta, cambio y baja', () => {
  const a = { placeId: 'p1', itemKey: 'bravas', answers: { glutenFree: 'yes', stepFree: 'no' } };
  assert.deepEqual(aptDeltas(null, a), { p1: { place: { stepFree: { no: 1 } }, items: { bravas: { glutenFree: { yes: 1 } } } } });
  const b = { ...a, answers: { glutenFree: 'no', stepFree: 'no' } };
  assert.deepEqual(aptDeltas(a, b), { p1: { place: {}, items: { bravas: { glutenFree: { yes: -1, no: 1 } } } } });
  assert.deepEqual(aptDeltas(a, a), {});
  assert.deepEqual(aptDeltas(a, null), { p1: { place: { stepFree: { no: -1 } }, items: { bravas: { glutenFree: { yes: -1 } } } } });
});

test('aptDeltas: lo del plato sin elemento no cuenta', () => {
  assert.deepEqual(aptDeltas(null, { placeId: 'p1', itemKey: '', answers: { vegan: 'yes' } }), {});
});
