const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMenuPrice } = require('../modules/lib/menu-price');

test('precios numéricos: formato español con dos decimales y céntimos', () => {
  const cases = [
    ['1,2', '1,20 €', 120],
    ['6.5€', '6,50 €', 650],
    ['€1.2', '1,20 €', 120],
    ['1,20 €', '1,20 €', 120],
    ['12', '12,00 €', 1200],
    ['1.234,5', '1.234,50 €', 123450],
    ['12 euros', '12,00 €', 1200],
    ['EUR 5', '5,00 €', 500],
    [',5', '0,50 €', 50],
    ['0', '0,00 €', 0],
    [6.5, '6,50 €', 650],
  ];
  for (const [input, price, priceCents] of cases) {
    assert.deepEqual(parseMenuPrice(input), { price, priceCents }, String(input));
  }
});

test('vacío: sin precio', () => {
  assert.deepEqual(parseMenuPrice(''), { price: '', priceCents: null });
  assert.deepEqual(parseMenuPrice('   '), { price: '', priceCents: null });
  assert.deepEqual(parseMenuPrice(undefined), { price: '', priceCents: null });
  assert.deepEqual(parseMenuPrice(null), { price: '', priceCents: null });
});

test('texto que no es un número se guarda tal cual (máx. 40) sin céntimos', () => {
  assert.deepEqual(parseMenuPrice('S/M'), { price: 'S/M', priceCents: null });
  assert.deepEqual(parseMenuPrice('  Según mercado '), { price: 'Según mercado', priceCents: null });
  assert.deepEqual(parseMenuPrice('1.2.3'), { price: '1.2.3', priceCents: null });
  assert.deepEqual(parseMenuPrice('-5'), { price: '-5', priceCents: null });
  assert.equal(parseMenuPrice('x'.repeat(60)).price.length, 40);
});
