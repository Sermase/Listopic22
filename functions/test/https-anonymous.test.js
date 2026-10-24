const { test } = require('node:test');
const assert = require('node:assert/strict');
const { onCall, isAnonymous } = require('../modules/https');

test('onCall: una sesión anónima (Pachote) llega como sin sesión', async () => {
  const fn = onCall({ region: 'europe-west1' }, (request) => request.auth?.uid || null);
  const anon = { uid: 'a1', token: { firebase: { sign_in_provider: 'anonymous' } } };
  const real = { uid: 'ana', token: { firebase: { sign_in_provider: 'password' } } };
  assert.equal(isAnonymous(anon), true);
  assert.equal(isAnonymous(real), false);
  assert.equal(await fn.run({ data: {}, auth: anon }), null);
  assert.equal(await fn.run({ data: {}, auth: real }), 'ana');
  assert.equal(await onCall((r) => r.data.x).run({ data: { x: 7 }, auth: anon }), 7);
});
