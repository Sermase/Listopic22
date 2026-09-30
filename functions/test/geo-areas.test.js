const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCcaa, pickCity, CCAA_NAMES } = require('../modules/lib/geo-areas');

test('normaliza alias de CCAA vistos en datos reales', () => {
  assert.equal(normalizeCcaa('Euskadi'), 'País Vasco');
  assert.equal(normalizeCcaa('País Vasco'), 'País Vasco');
  assert.equal(normalizeCcaa('Catalunya'), 'Cataluña');
  assert.equal(normalizeCcaa('Comunitat Valenciana'), 'Comunidad Valenciana');
  assert.equal(normalizeCcaa('  castilla y leon '), 'Castilla y León');
  assert.equal(normalizeCcaa('Comunidad de Madrid'), 'Comunidad de Madrid');
});

test('fuera de España o vacío: se respeta', () => {
  assert.equal(normalizeCcaa('Île-de-France'), 'Île-de-France');
  assert.equal(normalizeCcaa(''), '');
  assert.equal(normalizeCcaa(null), '');
});

test('hay 19 CCAA y ciudades autónomas', () => {
  assert.equal(CCAA_NAMES.length, 19);
});

test('ciudad: locality y, si no hay, alternativas', () => {
  assert.equal(pickCity([{ types: ['locality'], long_name: 'Valladolid' }]), 'Valladolid');
  assert.equal(pickCity([{ types: ['administrative_area_level_4'], long_name: 'Guadarrama' }]), 'Guadarrama');
  assert.equal(pickCity([{ types: ['route'], long_name: 'Calle Mayor' }]), '');
  assert.equal(pickCity(null), '');
});
