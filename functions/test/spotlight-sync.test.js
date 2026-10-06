const test = require('node:test');
const assert = require('node:assert/strict');
const { GeoPoint } = require('firebase-admin/firestore');
const { spotlightCenterFromPlace, resolveSpotlightItem, buildSpotlightSyncPatch } = require('../modules/lib/spotlight-sync');

test('centro de la campaña: todas las formas de coordenadas de places/', () => {
  const expected = { lat: 40.4, lng: -3.7 };
  assert.deepEqual(spotlightCenterFromPlace({ location: new GeoPoint(40.4, -3.7) }), expected);
  assert.deepEqual(spotlightCenterFromPlace({ location: { latitude: 40.4, longitude: -3.7 } }), expected);
  assert.deepEqual(spotlightCenterFromPlace({ location: { _latitude: 40.4, _longitude: -3.7 } }), expected);
  assert.deepEqual(spotlightCenterFromPlace({ coordinates: { lat: 40.4, lng: -3.7 } }), expected);
  assert.deepEqual(spotlightCenterFromPlace({ coordinates: new GeoPoint(40.4, -3.7) }), expected);
  assert.deepEqual(spotlightCenterFromPlace({ geopoint: { latitude: 40.4, longitude: -3.7 } }), expected);
  assert.deepEqual(spotlightCenterFromPlace({ lat: 40.4, lng: -3.7 }), expected);
  // location vacía o rota: se prueba la siguiente forma.
  assert.deepEqual(spotlightCenterFromPlace({ location: {}, coordinates: { latitude: 40.4, longitude: -3.7 } }), expected);
});

test('centro de la campaña: null si no hay coordenadas válidas', () => {
  assert.equal(spotlightCenterFromPlace(null), null);
  assert.equal(spotlightCenterFromPlace({}), null);
  assert.equal(spotlightCenterFromPlace({ location: { latitude: '40.4', longitude: '-3.7' } }), null);
  assert.equal(spotlightCenterFromPlace({ location: { latitude: NaN, longitude: 1 } }), null);
  assert.equal(spotlightCenterFromPlace({ lat: 95, lng: 1 }), null);
  assert.equal(spotlightCenterFromPlace({ lat: 40, lng: 190 }), null);
});

const items = () => new Map([
  ['croqueta-prueba-1', {
    canonicalName: 'Croqueta, la original',
    status: 'active',
    linkedListIds: ['croquetas'],
    stats: { averageRating: 7, reviewCount: 1 },
  }],
  ['croketa', { canonicalName: 'Croketa', status: 'inactive', mergedInto: 'croqueta-prueba-1' }],
  ['uno', { canonicalName: '1', status: 'inactive' }],
]);

test('patrocinado al día: sin cambios no hay parche', () => {
  const spotlight = {
    itemId: 'croqueta-prueba-1',
    itemName: 'Croqueta, la original',
    linkedListIds: ['croquetas'],
    itemAverageRating: 7,
    itemReviewCount: 1,
  };
  assert.equal(buildSpotlightSyncPatch(spotlight, items()), null);
});

test('patrocinado tras un renombrado y nuevas reseñas: nombre, listas y stats', () => {
  const patch = buildSpotlightSyncPatch({
    itemId: 'croqueta-prueba-1',
    itemName: 'Croqueta prueba 1',
    linkedListIds: [],
    itemAverageRating: null,
    itemReviewCount: 0,
  }, items());
  assert.deepEqual(patch, {
    itemName: 'Croqueta, la original',
    linkedListIds: ['croquetas'],
    itemAverageRating: 7,
    itemReviewCount: 1,
  });
});

test('patrocinado de un plato fusionado: pasa al plato destino', () => {
  const patch = buildSpotlightSyncPatch({
    itemId: 'croketa',
    itemName: 'Croketa',
    linkedListIds: ['croquetas'],
    itemAverageRating: 7,
    itemReviewCount: 1,
  }, items());
  assert.deepEqual(patch, { itemId: 'croqueta-prueba-1', itemName: 'Croqueta, la original' });
  assert.equal(resolveSpotlightItem({ itemId: 'croketa' }, items()).itemId, 'croqueta-prueba-1');
});

test('patrocinado de un plato inactivo sin destino o borrado: se marca, sin reembolso', () => {
  assert.deepEqual(buildSpotlightSyncPatch({ itemId: 'uno', itemName: '1' }, items()), { itemInactive: true });
  assert.deepEqual(buildSpotlightSyncPatch({ itemId: 'borrado', itemName: 'X' }, items()), { itemInactive: true });
  assert.equal(buildSpotlightSyncPatch({ itemId: 'uno', itemName: '1', itemInactive: true }, items()), null);
  assert.equal(resolveSpotlightItem({ itemId: 'uno' }, items()), null);
  // Si el plato vuelve, se quita la marca.
  const back = buildSpotlightSyncPatch({
    itemId: 'croqueta-prueba-1',
    itemName: 'Croqueta, la original',
    linkedListIds: ['croquetas'],
    itemAverageRating: 7,
    itemReviewCount: 1,
    itemInactive: true,
  }, items());
  assert.deepEqual(back, { itemInactive: false });
});
