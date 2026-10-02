const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAlgoliaCredentials, DEFAULT_ALGOLIA_APP_ID } = require('../modules/lib/algolia-credentials');

test('sin la clave de Algolia el módulo queda inactivo (null, sin lanzar)', () => {
  assert.equal(resolveAlgoliaCredentials({}), null);
  assert.equal(resolveAlgoliaCredentials({ apiKey: '   ' }), null);
  assert.equal(resolveAlgoliaCredentials(undefined), null);
});

test('App ID público por defecto; la clave solo viene del secret', () => {
  assert.deepEqual(resolveAlgoliaCredentials({ apiKey: 'k' }), { appId: DEFAULT_ALGOLIA_APP_ID, apiKey: 'k' });
  assert.deepEqual(resolveAlgoliaCredentials({ appId: 'OTRA', apiKey: 'k' }), { appId: 'OTRA', apiKey: 'k' });
});

test('las Functions de Algolia declaran el secret ALGOLIA_API_KEY', () => {
  // Por index.js, que inicializa Firebase (igual que al desplegar).
  const all = require('../index.js');
  const names = ['onListCreated', 'onListUpdated', 'onListDeleted', 'onPlaceCreated', 'onPlaceUpdated', 'onPlaceDeleted',
    'onUserCreated', 'onUserUpdated', 'onUserDeleted', 'syncGroupedItemsIndex', 'syncGroupedItemsRootReviews',
    'syncGroupedItemsOnListUpdate', 'syncGroupedItemsOnListDelete', 'adminBackfillAlgolia'];
  for (const name of names) {
    const fn = all[name];
    assert.ok(fn, `${name} no se exporta`);
    const secrets = (fn.__endpoint && fn.__endpoint.secretEnvironmentVariables) || [];
    assert.ok(secrets.some((s) => s.key === 'ALGOLIA_API_KEY'), `${name} sin el secret`);
  }
});
