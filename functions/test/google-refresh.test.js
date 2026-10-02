const test = require('node:test');
const assert = require('node:assert/strict');
const { GOOGLE_SKUS, ACTION_SKUS, billingMonth, usageRows } = require('../modules/lib/google-usage');
const { isOwnedPlace, googleRefreshSkipReason, latLngOf } = require('../modules/lib/place-refresh');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2);
const ts = (ms) => ({ toMillis: () => ms });

test('sitio con propietario: no se refresca solo', () => {
  assert.equal(isOwnedPlace({ businessOwnerUserId: 'u1' }), true);
  assert.equal(isOwnedPlace({ businessVerified: true }), true);
  assert.equal(isOwnedPlace({ businessManagerIds: ['u2'] }), true);
  assert.equal(isOwnedPlace({ businessClaimId: 'c1' }), false, 'una solicitud pendiente no lo hace suyo');
  assert.equal(isOwnedPlace({ businessOwnerUserId: '  ', businessManagerIds: [] }), false);
  assert.equal(googleRefreshSkipReason({ businessOwnerUserId: 'u1' }, NOW), 'propietario');
});

test('sin propietario: solo si el último refresco completo tiene 30 días o más', () => {
  assert.equal(googleRefreshSkipReason({ lastGoogleSync: ts(NOW - 5 * DAY) }, NOW), 'reciente');
  assert.equal(googleRefreshSkipReason({ lastGoogleSync: ts(NOW - 30 * DAY) }, NOW), null);
  assert.equal(googleRefreshSkipReason({}, NOW), null, 'nunca refrescado');
  // «Solo ubicación», estado o imagen no cuentan como refresco completo
  assert.equal(googleRefreshSkipReason({ lastGoogleRefreshAt: ts(NOW - DAY), lastGoogleSync: ts(NOW - 90 * DAY) }, NOW), null);
  assert.equal(googleRefreshSkipReason({ lastGoogleSync: { _seconds: (NOW - DAY) / 1000 } }, NOW), 'reciente');
});

test('ubicación desde GeoPoint o mapa', () => {
  assert.deepEqual(latLngOf({ latitude: 41.6, longitude: -4.7 }), { latitude: 41.6, longitude: -4.7 });
  assert.deepEqual(latLngOf({ _latitude: 41.6, _longitude: -4.7 }), { latitude: 41.6, longitude: -4.7 });
  assert.equal(latLngOf(null), null);
});

test('mes de facturación de Google (hora del Pacífico)', () => {
  assert.equal(billingMonth(new Date('2026-10-01T05:00:00Z')), '2026-09');
  assert.equal(billingMonth(new Date('2026-10-01T08:00:00Z')), '2026-10');
});

test('cada acción solo usa SKUs del catálogo', () => {
  for (const [action, skus] of Object.entries(ACTION_SKUS)) {
    for (const sku of skus) assert.ok(GOOGLE_SKUS[sku], `${action}: ${sku}`);
  }
});

test('filas de uso: restantes y coste estimado por encima del cupo gratis', () => {
  const rows = Object.fromEntries(usageRows({ details_photos: 1200, legacy_contact: 300, details_ids_only: 50 }).map((r) => [r.sku, r]));
  assert.deepEqual([rows.details_photos.remaining, rows.details_photos.estimatedUsd], [0, 1.4]); // 200 × 7 $/1000
  assert.deepEqual([rows.legacy_contact.remaining, rows.legacy_contact.estimatedUsd], [700, 0]);
  assert.deepEqual([rows.details_ids_only.remaining, rows.details_ids_only.estimatedUsd], [null, 0]);
  assert.equal(rows.geocoding.used, 0);
});
