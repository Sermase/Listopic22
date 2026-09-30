const test = require('node:test');
const assert = require('node:assert/strict');
const { syncMinilistCriteria } = require('../modules/lib/minilist-criteria');

const sabor = { type: 'slider', label: 'Sabor', ponderable: true };
const textura = { type: 'slider', label: 'Textura', ponderable: true };
const precio = { type: 'slider', label: 'Precio', ponderable: false };
const relleno = { type: 'slider', label: 'Relleno', ponderable: true };

test('la madre añade un criterio: la Minilista lo hereda con su peso', () => {
  const r = syncMinilistCriteria({
    parentBefore: { sabor }, parentAfter: { sabor, precio }, parentWeights: { sabor: 1, precio: 0 },
    child: { sabor, relleno }, childWeights: { sabor: 1, relleno: 1 },
  });
  assert.deepEqual(Object.keys(r.criteriaDefinition).sort(), ['precio', 'relleno', 'sabor']);
  assert.deepEqual(r.scoringWeights, { sabor: 1, relleno: 1, precio: 0 });
  assert.equal(r.changed, true);
});

test('la madre quita un criterio: se quita de la Minilista, sus propios se conservan', () => {
  const r = syncMinilistCriteria({
    parentBefore: { sabor, textura }, parentAfter: { sabor }, parentWeights: { sabor: 1 },
    child: { sabor, textura, relleno }, childWeights: { sabor: 1, textura: 1, relleno: 1 },
  });
  assert.deepEqual(Object.keys(r.criteriaDefinition).sort(), ['relleno', 'sabor']);
  assert.deepEqual(r.scoringWeights, { sabor: 1, relleno: 1 });
});

test('la madre renombra: la Minilista recibe la definición de la madre', () => {
  const renamed = { ...sabor, label: 'Sabor (intensidad)' };
  const r = syncMinilistCriteria({
    parentBefore: { sabor }, parentAfter: { sabor: renamed }, parentWeights: { sabor: 1 },
    child: { sabor }, childWeights: { sabor: 1 },
  });
  assert.equal(r.criteriaDefinition.sabor.label, 'Sabor (intensidad)');
  assert.equal(r.changed, true);
});

test('los pesos heredados siguen a la madre aunque la Minilista tuviera otros', () => {
  const r = syncMinilistCriteria({
    parentBefore: { sabor, textura }, parentAfter: { sabor, textura }, parentWeights: { sabor: 1, textura: 0 },
    child: { sabor, textura }, childWeights: { sabor: 1, textura: 1 },
  });
  assert.equal(r.scoringWeights.textura, 0);
  assert.equal(r.changed, true);
});

test('reparar una Minilista a la que le faltan criterios de la madre', () => {
  const r = syncMinilistCriteria({
    parentBefore: { sabor, textura }, parentAfter: { sabor, textura }, parentWeights: null,
    child: { sabor, relleno }, childWeights: null,
  });
  assert.deepEqual(Object.keys(r.criteriaDefinition).sort(), ['relleno', 'sabor', 'textura']);
  assert.deepEqual(r.scoringWeights, { sabor: 1, relleno: 1, textura: 1 });
});

test('sin cambios reales no se reescribe nada', () => {
  const r = syncMinilistCriteria({
    parentBefore: { sabor }, parentAfter: { sabor }, parentWeights: { sabor: 1 },
    child: { sabor, relleno }, childWeights: { sabor: 1, relleno: 1 },
  });
  assert.equal(r.changed, false);
});
