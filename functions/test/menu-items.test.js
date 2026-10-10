const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_MENU_BATCH,
  sanitizeMenuOrder,
  sanitizeItemBusinessData,
  planMenuItemsBatch,
  businessListProblem,
} = require('../modules/lib/menu-items');

test('la ficha se reconstruye entera: lo que falta vuelve a su valor por defecto', () => {
  assert.deepEqual(sanitizeItemBusinessData({ price: '6,5' }), {
    group: '',
    price: '6,50 €',
    priceCents: 650,
    discount: '',
    ingredients: '',
    description: '',
    allergens: [],
    available: true,
    menuOrder: null,
  });
  assert.deepEqual(sanitizeItemBusinessData(null).menuOrder, null);
});

test('ficha completa: limpia textos, alérgenos válidos sin repetir y menuOrder', () => {
  const data = sanitizeItemBusinessData({
    group: '  Postres ',
    price: 'Según mercado',
    discount: '2x1',
    ingredients: 'queso, <b>galleta</b>',
    description: 'Tarta <script>',
    allergens: ['lacteos', 'gluten', 'lacteos', 'chocolate', 3],
    available: false,
    menuOrder: 2.7,
    extra: 'no se guarda',
  });
  assert.deepEqual(data, {
    group: 'Postres',
    price: 'Según mercado',
    priceCents: null,
    discount: '2x1',
    ingredients: 'queso, bgalleta/b',
    description: 'Tarta script',
    allergens: ['lacteos', 'gluten'],
    available: false,
    menuOrder: 2,
  });
});

test('keepMissingMenuOrder: sin la clave menuOrder no se escribe (apps anteriores)', () => {
  const keep = { keepMissingMenuOrder: true };
  assert.equal('menuOrder' in sanitizeItemBusinessData({ price: '6' }, keep), false);
  assert.equal(sanitizeItemBusinessData({ menuOrder: 3 }, keep).menuOrder, 3);
  assert.equal(sanitizeItemBusinessData({ menuOrder: null }, keep).menuOrder, null);
  assert.equal(sanitizeItemBusinessData({ price: '6' }).menuOrder, null);
});

test('menuOrder: entero de 0 a 9999 o null', () => {
  assert.equal(sanitizeMenuOrder(0), 0);
  assert.equal(sanitizeMenuOrder(5), 5);
  assert.equal(sanitizeMenuOrder(123456), 9999);
  assert.equal(sanitizeMenuOrder(-1), null);
  assert.equal(sanitizeMenuOrder('3'), null);
  assert.equal(sanitizeMenuOrder(Number.NaN), null);
  assert.equal(sanitizeMenuOrder(undefined), null);
  assert.equal(sanitizeMenuOrder(null), null);
});

test('lote de platos: 1 a 50 distintos, cada uno saneado', () => {
  const plan = planMenuItemsBatch([
    { itemId: 'croquetas', data: { group: 'Entrantes', price: '1,2', menuOrder: 0 } },
    { itemId: ' bravas ', data: { group: 'Entrantes', menuOrder: 1 } },
  ]);
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.items.map((entry) => entry.itemId), ['croquetas', 'bravas']);
  assert.equal(plan.items[0].data.price, '1,20 €');
  assert.equal(plan.items[1].data.menuOrder, 1);
  assert.equal(plan.items[1].data.available, true);
});

test('lote de platos: rechaza vacíos, demasiados, repetidos e ids no válidos', () => {
  assert.equal(planMenuItemsBatch([]).error.code, 'invalid-argument');
  assert.equal(planMenuItemsBatch(undefined).error.code, 'invalid-argument');
  const tooMany = Array.from({ length: MAX_MENU_BATCH + 1 }, (_, i) => ({ itemId: `p${i}`, data: {} }));
  assert.match(planMenuItemsBatch(tooMany).error.message, /50/);
  const max = Array.from({ length: MAX_MENU_BATCH }, (_, i) => ({ itemId: `p${i}`, data: {} }));
  assert.equal(planMenuItemsBatch(max).items.length, MAX_MENU_BATCH);
  assert.match(planMenuItemsBatch([{ itemId: 'a', data: {} }, { itemId: 'a', data: {} }]).error.message, /repetido/);
  assert.equal(planMenuItemsBatch([{ itemId: '', data: {} }]).error.code, 'invalid-argument');
  assert.equal(planMenuItemsBatch([{ itemId: 'a/b', data: {} }]).error.code, 'invalid-argument');
  assert.equal(planMenuItemsBatch([null]).error.code, 'invalid-argument');
});

test('lista para un plato nuevo: tiene que existir y ser pública', () => {
  assert.equal(businessListProblem({ name: 'Croquetas', isPublic: true }, null), null);
  assert.equal(businessListProblem({ name: 'Croquetas', visibility: 'public' }, null), null);
  assert.equal(businessListProblem(null, null).code, 'not-found');

  const privada = businessListProblem({ name: 'Mis favoritas', isPublic: false }, null);
  assert.equal(privada.code, 'failed-precondition');
  assert.match(privada.message, /«Mis favoritas» es privada/);

  // Una Minilista pública de una madre privada cuenta como privada.
  assert.equal(businessListProblem({ name: 'Mini', isPublic: true, parentListId: 'm' }, { isPublic: false }).code, 'failed-precondition');
  assert.equal(businessListProblem({ name: 'Mini', isPublic: true, parentListId: 'm' }, { isPublic: true }), null);

  assert.equal(businessListProblem({ name: 'Quiero ir', isPublic: true, type: 'archive' }, null).code, 'failed-precondition');
});
