const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DELETE,
  SERVER_TIMESTAMP,
  normalizeItemName,
  itemDocIdFromName,
  isBusinessCurated,
  buildAliasIndex,
  followMerged,
  resolveReview,
  planReviewStamp,
  planReassignStamp,
  planPlaceRebuild,
  hasCanonicalItemSignalChanged,
  seedRepairPlan,
  splitCuratedNames,
  sameItemName,
  createResolveContext,
} = require('../modules/lib/canonical-resolve');

const PLACE = 'ChIJc7hBUzEvQg0R_skP3Lbqgrc';
let clock = 0;

// Simula Firestore: aplica los marcadores del plan sobre documentos en memoria.
function applyPatch(doc, patch) {
  const next = { ...(doc || {}) };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value === DELETE) delete next[key];
    else if (value === SERVER_TIMESTAMP) {
      clock += 1;
      next[key] = { ms: clock, toMillis() { return this.ms; }, isEqual(other) { return other?.ms === this.ms; } };
    } else next[key] = value;
  });
  return next;
}

function review(id, data, listId = 'croquetas') {
  const refPath = data.refPath || `lists/${listId}/reviews/${id}`;
  return { id, refPath, fallbackListId: listId, placeId: PLACE, listId, ...data };
}

function makeState(items, reviews) {
  return {
    items: new Map(Object.entries(items).map(([id, item]) => [id, { id, ...item }])),
    reviews: new Map(reviews.map((entry) => [entry.refPath, entry])),
  };
}

function rebuild(state) {
  const plan = planPlaceRebuild({ reviews: Array.from(state.reviews.values()), itemsById: state.items });
  for (const write of plan.itemWrites) {
    const current = state.items.get(write.itemId) || { id: write.itemId };
    state.items.set(write.itemId, applyPatch(current, write.isNew ? write.createData : write.data));
  }
  for (const write of plan.emptyItemWrites) {
    state.items.set(write.itemId, applyPatch(state.items.get(write.itemId), write.data));
  }
  for (const stamp of plan.reviewStamps) {
    state.reviews.set(stamp.refPath, applyPatch(state.reviews.get(stamp.refPath), stamp.patch));
  }
  return plan;
}

// Estado de Ser tras aprobar «mover "1" a Croqueta prueba 1» (código antiguo)
// y después el renombrado a «Croqueta, la original» (código nuevo).
function serState() {
  return makeState({
    'croqueta-prueba-1': {
      canonicalName: 'Croqueta, la original',
      source: 'business',
      businessCreated: true,
      status: 'active',
      curatedAliasesNormalized: ['croqueta prueba 1', 'croqueta la original'],
      aliasesNormalized: ['1'],
      businessData: { group: 'Entrantes', price: '7,00 €', priceCents: 700, available: true },
      stats: { reviewCount: 1, ratingCount: 1, ratingTotal: 7, averageRating: 7, photoCount: 0, criteriaStats: {} },
      linkedListIds: ['croquetas'],
    },
    1: {
      canonicalName: '1',
      source: 'community',
      status: 'inactive',
      businessData: {},
      stats: { reviewCount: 0, ratingCount: 0, ratingTotal: 0, averageRating: null, photoCount: 0, criteriaStats: {} },
      linkedListIds: [],
    },
  }, [
    review('r1', {
      itemName: '1',
      itemNameLower: '1',
      canonicalItemId: 'croqueta-prueba-1',
      canonicalItemName: 'Croqueta prueba 1',
      overallRating: 7,
      authorName: 'Sermase',
    }),
  ]);
}

test('reasignar y renombrar (caso de Ser): la reseña "1" pasa a llamarse como el plato', () => {
  const state = serState();
  const plan = rebuild(state);
  const r1 = state.reviews.get('lists/croquetas/reviews/r1');

  assert.equal(r1.itemName, 'Croqueta, la original');
  assert.equal(r1.itemNameLower, 'croqueta, la original');
  assert.equal(r1.originalItemName, '1');
  assert.ok(r1.itemNameCanonicalizedAt);
  // El slug de "Croqueta, la original" no es el id del plato: se guarda el derivado.
  assert.equal(r1.canonicalItemId, 'croqueta-prueba-1');
  assert.equal(r1.canonicalItemFor, 'croqueta la original');
  assert.equal('canonicalItemName' in r1, false);
  assert.equal(plan.summary.renamedReviews, 1);
  assert.equal(plan.summary.stampedReviews, 1);

  const item = state.items.get('croqueta-prueba-1');
  assert.equal(item.canonicalName, 'Croqueta, la original');
  assert.equal(item.stats.reviewCount, 1);
  assert.equal(item.stats.averageRating, 7);
  assert.equal(item.businessData.price, '7,00 €');
  assert.deepEqual(item.sourceNames, [{ name: 'Croqueta, la original', count: 1 }]);
  // El "1" escrito no se convierte en alias del plato.
  assert.ok(!item.aliasesNormalized.includes('1'));
  assert.equal(state.items.get('1').status, 'inactive');

  const second = rebuild(state);
  assert.equal(second.reviewStamps.length, 0);
  assert.equal(second.summary.renamedReviews, 0);
});

test('una reseña nueva con el nombre nuevo va al plato renombrado, sin duplicado', () => {
  const state = serState();
  rebuild(state);
  const r2 = review('r2', { itemName: 'Croqueta, la original', itemNameLower: 'croqueta, la original', overallRating: 9 });
  state.reviews.set(r2.refPath, r2);
  const plan = rebuild(state);

  assert.equal(state.items.has('croqueta-la-original'), false);
  assert.equal(plan.itemWrites.some((write) => write.isNew), false);
  const item = state.items.get('croqueta-prueba-1');
  assert.equal(item.stats.reviewCount, 2);
  assert.equal(item.stats.averageRating, 8);
  const stamped = state.reviews.get(r2.refPath);
  assert.equal(stamped.itemName, 'Croqueta, la original');
  assert.equal(stamped.canonicalItemId, 'croqueta-prueba-1');
  assert.equal(stamped.canonicalItemFor, 'croqueta la original');
  assert.equal(stamped.originalItemName, undefined);
});

test('una reseña con el nombre antiguo se reescribe con el nombre actual', () => {
  const state = serState();
  const r3 = review('r3', { itemName: 'croqueta prueba 1', overallRating: 6 }, 'tapas');
  state.reviews.set(r3.refPath, r3);
  rebuild(state);
  const stamped = state.reviews.get(r3.refPath);
  assert.equal(stamped.itemName, 'Croqueta, la original');
  assert.equal(stamped.originalItemName, 'croqueta prueba 1');
  assert.equal(stamped.canonicalItemId, 'croqueta-prueba-1');
  assert.deepEqual(state.items.get('croqueta-prueba-1').linkedListIds, ['croquetas', 'tapas']);
});

test('los alias curados, el nombre y la ficha sobreviven a dos rebuilds', () => {
  const state = serState();
  rebuild(state);
  rebuild(state);
  const item = state.items.get('croqueta-prueba-1');
  assert.deepEqual(item.curatedAliasesNormalized, ['croqueta prueba 1', 'croqueta la original']);
  assert.equal(item.canonicalName, 'Croqueta, la original');
  assert.deepEqual(item.businessData, { group: 'Entrantes', price: '7,00 €', priceCents: 700, available: true });
  for (const alias of ['croqueta prueba 1', 'croqueta la original']) assert.ok(item.aliasesNormalized.includes(alias));
  assert.equal(item.source, 'business');
});

test('el rebuild no escribe campos del negocio en elementos existentes; un elemento nuevo sí nace completo', () => {
  const state = serState();
  state.reviews.set('lists/croquetas/reviews/r9', review('r9', { itemName: 'Bravas', overallRating: 5 }));
  const plan = planPlaceRebuild({ reviews: Array.from(state.reviews.values()), itemsById: state.items });
  const existing = plan.itemWrites.find((write) => write.itemId === 'croqueta-prueba-1');
  for (const field of ['canonicalName', 'businessData', 'source', 'curatedAliasesNormalized', 'mergedInto', 'createdAt']) {
    assert.equal(field in existing.data, false, field);
  }
  const created = plan.itemWrites.find((write) => write.itemId === 'bravas');
  assert.equal(created.isNew, true);
  assert.equal(created.createData.canonicalName, 'Bravas');
  assert.equal(created.createData.source, 'community');
  assert.deepEqual(created.createData.businessData, {});
  assert.equal(created.createData.createdAt, SERVER_TIMESTAMP);
  assert.equal('canonicalName' in created.data, false);
});

test('una errata fusionada va al destino y el origen sigue inactivo', () => {
  const items = {
    croqueta: { canonicalName: 'Croqueta', source: 'business', status: 'active', curatedAliasesNormalized: ['croqueta', 'croketa'] },
    croketa: { canonicalName: 'Croketa', source: 'community', status: 'inactive', mergedInto: 'croqueta', stats: { reviewCount: 0, ratingCount: 0, ratingTotal: 0, averageRating: null, photoCount: 0, criteriaStats: {} }, linkedListIds: [] },
  };
  const state = makeState(items, [review('r1', { itemName: 'Croketa', overallRating: 8 })]);
  const plan = rebuild(state);
  assert.equal(state.reviews.get('lists/croquetas/reviews/r1').itemName, 'Croqueta');
  assert.equal(state.reviews.get('lists/croquetas/reviews/r1').originalItemName, 'Croketa');
  assert.equal(state.items.get('croketa').status, 'inactive');
  assert.equal(plan.itemWrites.some((write) => write.itemId === 'croketa'), false);
  assert.equal(state.items.get('croqueta').stats.reviewCount, 1);

  // Fusión antigua sin alias curados: llega por slug + mergedInto.
  const legacy = makeState({
    ...items,
    croqueta: { canonicalName: 'Croqueta', source: 'community', status: 'active' },
  }, [review('r1', { itemName: 'croketa', overallRating: 8 })]);
  const resolution = resolveReview(legacy.reviews.get('lists/croquetas/reviews/r1'), { itemsById: legacy.items });
  assert.deepEqual(resolution, { itemId: 'croqueta', via: 'slug', followedMerge: true });
  rebuild(legacy);
  assert.equal(legacy.reviews.get('lists/croquetas/reviews/r1').itemName, 'Croqueta');
  assert.equal(legacy.items.get('croketa').status, 'inactive');
});

test('un plato de la carta que pierde su última reseña sigue activo con stats a cero', () => {
  const state = makeState({
    bravas: {
      canonicalName: 'Bravas',
      source: 'business',
      status: 'active',
      stats: { reviewCount: 1, ratingCount: 1, ratingTotal: 7, averageRating: 7, photoCount: 0, criteriaStats: { sabor: { count: 1, total: 7, average: 7 } } },
      linkedListIds: ['bravas'],
      businessData: { price: '5,00 €', priceCents: 500 },
    },
  }, []);
  const plan = rebuild(state);
  const item = state.items.get('bravas');
  assert.equal(item.status, 'active');
  assert.equal(item.stats.reviewCount, 0);
  assert.equal(item.stats.averageRating, null);
  assert.deepEqual(item.linkedListIds, []);
  assert.equal(plan.emptyItemWrites[0].deactivate, false);
  // Ya está a cero: la segunda pasada no escribe nada.
  assert.equal(rebuild(state).emptyItemWrites.length, 0);
});

test('un duplicado comunitario con el mismo nombre se fusiona con el plato curado', () => {
  const state = makeState({
    'croqueta-prueba-1': {
      canonicalName: 'Croqueta, la original',
      source: 'business',
      status: 'active',
      curatedAliasesNormalized: ['croqueta prueba 1', 'croqueta la original'],
    },
    'croqueta-la-original': {
      canonicalName: 'Croqueta, la original',
      source: 'community',
      status: 'active',
      businessData: {},
      stats: { reviewCount: 1, ratingCount: 1, ratingTotal: 9, averageRating: 9, photoCount: 0, criteriaStats: {} },
      linkedListIds: ['croquetas'],
    },
  }, [review('r2', { itemName: 'Croqueta, la original', overallRating: 9 })]);
  const plan = rebuild(state);
  assert.deepEqual(plan.conflicts, [{ name: 'croqueta la original', itemIds: ['croqueta-prueba-1', 'croqueta-la-original'] }]);
  const duplicate = state.items.get('croqueta-la-original');
  assert.equal(duplicate.status, 'inactive');
  assert.equal(duplicate.mergedInto, 'croqueta-prueba-1');
  assert.equal(duplicate.stats.reviewCount, 0);
  assert.equal(plan.summary.deactivatedItems, 1);
  assert.equal(plan.summary.mergedItems, 1);
  assert.equal(state.items.get('croqueta-prueba-1').stats.reviewCount, 1);
  assert.deepEqual(plan.duplicates, []);
  // Ya no hay conflicto: el duplicado está inactivo.
  assert.deepEqual(rebuild(state).conflicts, []);
});

test('si el autor edita el nombre después del estampado, la reseña se libera', () => {
  const state = serState();
  rebuild(state);
  const before = state.reviews.get('lists/croquetas/reviews/r1');
  const after = { ...before, itemName: 'Bravas', itemNameLower: 'bravas' };
  assert.equal(hasCanonicalItemSignalChanged(before, after), true);
  state.reviews.set(after.refPath, after);

  const resolution = resolveReview(after, { itemsById: state.items });
  assert.deepEqual(resolution, { itemId: 'bravas', via: 'slug', followedMerge: false });
  rebuild(state);
  const released = state.reviews.get(after.refPath);
  assert.equal(released.itemName, 'Bravas');
  assert.equal('canonicalItemId' in released, false);
  assert.equal('canonicalItemFor' in released, false);
  assert.equal(released.originalItemName, '1');
  assert.equal(state.items.get('bravas').stats.reviewCount, 1);
  // El plato de la carta se queda sin reseñas pero visible.
  assert.equal(state.items.get('croqueta-prueba-1').status, 'active');
  assert.equal(state.items.get('croqueta-prueba-1').stats.reviewCount, 0);
});

test('las escrituras del servidor no disparan otro rebuild; las del autor sí', () => {
  const state = serState();
  const before = state.reviews.get('lists/croquetas/reviews/r1');
  rebuild(state);
  const stamped = state.reviews.get('lists/croquetas/reviews/r1');
  assert.equal(hasCanonicalItemSignalChanged(before, stamped), false);
  // Solo derivados (sin renombrar).
  assert.equal(hasCanonicalItemSignalChanged(
    { itemName: 'Bravas', placeId: PLACE },
    { itemName: 'Bravas', placeId: PLACE, canonicalItemId: 'bravas-2', canonicalItemFor: 'bravas' },
  ), false);
  // Renombrado del servidor con otro cambio a la vez: sí.
  assert.equal(hasCanonicalItemSignalChanged(before, { ...stamped, overallRating: 9 }), true);
  // Cambio de nombre sin marca del servidor (autor o admin): sí.
  assert.equal(hasCanonicalItemSignalChanged(stamped, { ...stamped, itemName: 'Otra cosa' }), true);
  assert.equal(hasCanonicalItemSignalChanged(undefined, stamped), true);
  assert.equal(hasCanonicalItemSignalChanged(stamped, undefined), true);
  assert.equal(hasCanonicalItemSignalChanged(stamped, { ...stamped, scores: { sabor: 9 } }), true);
});

test('segunda pasada sin cambios: cero estampados en todos los casos', () => {
  const state = makeState({
    'croqueta-prueba-1': { canonicalName: 'Croqueta, la original', source: 'business', status: 'active', curatedAliasesNormalized: ['croqueta prueba 1', 'croqueta la original'] },
    croketa: { canonicalName: 'Croketa', source: 'community', status: 'inactive', mergedInto: 'croqueta-prueba-1' },
  }, [
    review('a', { itemName: '1', canonicalItemId: 'croqueta-prueba-1', canonicalItemName: 'Croqueta prueba 1', overallRating: 7 }),
    review('b', { itemName: 'Croqueta prueba 1', overallRating: 6 }),
    review('c', { itemName: 'croketa', overallRating: 5 }),
    review('d', { itemName: 'Croqueta, la original', overallRating: 8 }),
    review('e', { itemName: 'Bravas', overallRating: 4 }),
    review('f', { itemName: 'Pan', canonicalItemId: 'no-existe' }),
  ]);
  const first = rebuild(state);
  assert.equal(first.summary.renamedReviews, 3);
  const second = rebuild(state);
  assert.equal(second.reviewStamps.length, 0);
  assert.equal(second.emptyItemWrites.length, 0);
  // Un enlace antiguo a un elemento que no existe se descarta.
  assert.equal('canonicalItemId' in state.reviews.get('lists/croquetas/reviews/f'), false);
});

test('copias root + anidada: se cuentan una vez y se estampan las dos', () => {
  const state = serState();
  const root = { ...state.reviews.get('lists/croquetas/reviews/r1'), refPath: 'reviews/r1' };
  state.reviews.set('reviews/r1', root);
  const plan = rebuild(state);
  assert.equal(plan.summary.reviewCount, 1);
  assert.equal(plan.summary.stampedReviews, 1);
  assert.deepEqual(plan.reviewStamps.map((stamp) => stamp.refPath).sort(), ['lists/croquetas/reviews/r1', 'reviews/r1']);
  assert.equal(state.items.get('croqueta-prueba-1').stats.reviewCount, 1);
  assert.equal(state.reviews.get('reviews/r1').itemName, 'Croqueta, la original');
});

test('conflictos de alias: siempre el mismo ganador, sea cual sea el orden', () => {
  const entries = [
    ['x-community', { canonicalName: 'Patatas bravas', source: 'community', status: 'active' }],
    ['patatas-bravas', { canonicalName: 'Patatas bravas', source: 'community', status: 'active' }],
    ['b-business', { canonicalName: 'Bravas de la casa', source: 'business', status: 'active', curatedAliasesNormalized: ['patatas bravas'] }],
    ['a-alias', { canonicalName: 'Otra', source: 'community', status: 'active', curatedAliasesNormalized: ['patatas bravas'] }],
    ['gone', { canonicalName: 'Patatas bravas', source: 'business', status: 'inactive' }],
  ];
  const forward = buildAliasIndex(new Map(entries));
  const backward = buildAliasIndex(new Map(entries.slice().reverse()));
  assert.deepEqual(forward.conflicts, backward.conflicts);
  assert.deepEqual(Array.from(forward.index.entries()).sort(), Array.from(backward.index.entries()).sort());
  // Curado por el negocio > nombre canónico frente a alias > id = slug > id menor.
  // a-alias cuenta como curado (tiene alias curados) pero solo por alias.
  assert.deepEqual(forward.conflicts[0], {
    name: 'patatas bravas',
    itemIds: ['a-alias', 'b-business', 'patatas-bravas', 'x-community'],
  });
  assert.equal(forward.index.get('patatas bravas'), 'a-alias');

  const tie = buildAliasIndex({
    'c-2': { canonicalName: 'Caña', status: 'active' },
    'c-1': { canonicalName: 'Caña', status: 'active' },
  });
  assert.equal(tie.index.get('cana'), 'c-1');
  const slugWins = buildAliasIndex({
    'a-1': { canonicalName: 'Caña', status: 'active' },
    cana: { canonicalName: 'caña', status: 'active' },
  });
  assert.equal(slugWins.index.get('cana'), 'cana');
});

test('isBusinessCurated ignora los valores por defecto de la ficha', () => {
  assert.equal(isBusinessCurated({ source: 'community', businessData: { available: true, updatedAt: 1, updatedBy: 'u', price: '', allergens: [], priceCents: null } }), false);
  assert.equal(isBusinessCurated({ source: 'community', businessData: { available: false } }), true);
  assert.equal(isBusinessCurated({ source: 'community', businessData: { price: '3,00 €' } }), true);
  assert.equal(isBusinessCurated({ source: 'community', curatedAliasesNormalized: ['x'] }), true);
  assert.equal(isBusinessCurated({ source: 'business' }), true);
  assert.equal(isBusinessCurated({ businessCreated: true }), true);
});

test('followMerged: solo sigue inactivos, máximo 5 saltos, sin ciclos ni destinos inexistentes', () => {
  const items = new Map([
    ['a', { status: 'inactive', mergedInto: 'b' }],
    ['b', { status: 'inactive', mergedInto: 'c' }],
    ['c', { status: 'active' }],
    ['loop1', { status: 'inactive', mergedInto: 'loop2' }],
    ['loop2', { status: 'inactive', mergedInto: 'loop1' }],
    ['activeMerged', { status: 'active', mergedInto: 'c' }],
    ['orphan', { status: 'inactive', mergedInto: 'missing' }],
  ]);
  assert.equal(followMerged('a', items), 'c');
  assert.equal(followMerged('loop1', items), 'loop2');
  assert.equal(followMerged('activeMerged', items), 'activeMerged');
  assert.equal(followMerged('orphan', items), 'orphan');
  assert.equal(followMerged('nope', items), 'nope');
  const chain = new Map(Array.from({ length: 8 }, (_, i) => [`n${i}`, { status: 'inactive', mergedInto: `n${i + 1}` }]));
  chain.set('n8', { status: 'active' });
  assert.equal(followMerged('n0', chain), 'n5');
});

test('planReviewStamp: devuelve null cuando no hay nada que cambiar', () => {
  const items = new Map([['bravas', { canonicalName: 'Bravas', status: 'active' }]]);
  const plain = { itemName: 'bravas!', placeId: PLACE };
  const resolution = resolveReview(plain, { itemsById: items });
  assert.equal(resolution.via, 'alias');
  assert.equal(planReviewStamp(plain, resolution, items.get('bravas')), null);
});

test('planReassignStamp: nombre del destino, texto original guardado y derivados listos', () => {
  const patch = planReassignStamp({ itemName: '1', canonicalItemName: 'viejo' }, 'croqueta-prueba-1', { canonicalName: 'Croqueta, la original' });
  assert.equal(patch.itemName, 'Croqueta, la original');
  assert.equal(patch.itemNameLower, 'croqueta, la original');
  assert.equal(patch.originalItemName, '1');
  assert.equal(patch.itemNameCanonicalizedAt, SERVER_TIMESTAMP);
  assert.equal(patch.canonicalItemId, 'croqueta-prueba-1');
  assert.equal(patch.canonicalItemFor, 'croqueta la original');
  assert.equal(patch.canonicalItemName, DELETE);
  const sameSlug = planReassignStamp({ itemName: 'x', originalItemName: 'primero' }, 'bravas', { canonicalName: 'Bravas' });
  assert.equal(sameSlug.canonicalItemId, DELETE);
  assert.equal('originalItemName' in sameSlug, false);
});

test('reparación: siembra alias de renombrados y fusiones, arregla fusiones reactivadas y restaura enlaces perdidos', () => {
  const items = new Map(Object.entries({
    // Renombrado con el código antiguo: sin alias curados.
    'croqueta-prueba-1': { id: 'croqueta-prueba-1', canonicalName: 'Croqueta, la original', source: 'business', status: 'active', aliasesNormalized: ['1'], createdBy: 'ser' },
    // Duplicado comunitario creado por una reseña con el nombre nuevo.
    'croqueta-la-original': { id: 'croqueta-la-original', canonicalName: 'Croqueta, la original', source: 'community', status: 'active', stats: { reviewCount: 1 } },
    // Fusión antigua reactivada por una reseña nueva.
    'reggina-rosa': { id: 'reggina-rosa', canonicalName: 'Reggina rosa', source: 'community', status: 'active', mergedInto: 'regina-rossa', aliasesNormalized: ['reggina rosa'] },
    'regina-rossa': { id: 'regina-rossa', canonicalName: 'Regina rossa', source: 'community', status: 'active' },
    // El negocio volvió a crear un plato fusionado después de la fusión.
    tortilla: { id: 'tortilla', canonicalName: 'Tortilla', source: 'business', createdBy: 'ser', createdAt: 3000, status: 'active', mergedInto: 'tortilla-de-patata' },
    'tortilla-de-patata': { id: 'tortilla-de-patata', canonicalName: 'Tortilla de patata', source: 'community', status: 'active' },
  }));
  const proposals = [
    { type: 'rename', reviewedAt: 2000, payload: { itemId: 'croqueta-prueba-1', currentName: 'Croqueta prueba 1', newName: 'Croqueta, la original' } },
    { type: 'reassign_review', reviewedAt: 1000, payload: { reviewId: 'r1', reviewPath: 'lists/old/reviews/r1', reviewItemName: '1', targetItemId: 'croqueta-prueba-1' } },
    { type: 'merge', reviewedAt: 500, payload: { sourceItemId: 'reggina-rosa', sourceItemName: 'Reggina rosa', targetItemId: 'regina-rossa' } },
    { type: 'merge', reviewedAt: 1500, payload: { sourceItemId: 'tortilla', sourceItemName: 'Tortilla', targetItemId: 'tortilla-de-patata' } },
  ];
  const reviews = [
    // La reseña movida perdió su enlace al cambiarla de lista.
    review('r1', { itemName: '1', overallRating: 7 }, 'croquetas'),
    review('r2', { itemName: 'Croqueta, la original', overallRating: 9 }),
    review('r3', { itemName: 'reggina rosa', overallRating: 6 }, 'pizzas'),
    review('r4', { itemName: 'Tortilla', overallRating: 8 }, 'tortillas'),
  ];

  const seed = seedRepairPlan({ itemsById: items, proposals, reviews });
  assert.equal(seed.fixedMergedItems, 2);
  assert.deepEqual(seed.reviewPins, [{ refPath: 'lists/croquetas/reviews/r1', reviewId: 'r1', itemId: 'croqueta-prueba-1' }]);
  const byId = Object.fromEntries(seed.itemPatches.map((patch) => [patch.itemId, patch]));
  assert.deepEqual(byId['croqueta-prueba-1'].addCuratedAliases, ['croqueta la original', 'croqueta prueba 1']);
  assert.equal(byId['reggina-rosa'].status, 'inactive');
  // El destino de la fusión queda curado: también guarda su propio nombre.
  assert.deepEqual(byId['regina-rossa'].addCuratedAliases, ['reggina rosa', 'regina rossa']);
  assert.equal(byId.tortilla.clearMergedInto, true);
  assert.equal(seed.itemsById.get('tortilla').status, 'active');

  const plan = planPlaceRebuild({ reviews: seed.reviews, itemsById: seed.itemsById });
  const stampFor = (id) => plan.reviewStamps.find((stamp) => stamp.reviewId === id);
  assert.equal(stampFor('r1').patch.itemName, 'Croqueta, la original');
  assert.equal(stampFor('r1').patch.originalItemName, '1');
  assert.equal(stampFor('r2').patch.canonicalItemId, 'croqueta-prueba-1');
  assert.equal(stampFor('r3').patch.itemName, 'Regina rossa');
  assert.equal(stampFor('r4'), undefined);
  assert.equal(plan.itemsAfter.get('croqueta-la-original').status, 'inactive');
  assert.equal(plan.itemsAfter.get('croqueta-la-original').mergedInto, 'croqueta-prueba-1');
  assert.equal(plan.itemsAfter.get('tortilla').stats.reviewCount, 1);
  assert.deepEqual(plan.duplicates, []);
  assert.deepEqual(plan.activeMergedItems, []);
});

test('reparación dos veces: la segunda no cambia nada ni vuelve a fusionar un plato recreado', () => {
  const items = new Map(Object.entries({
    'croqueta-prueba-1': { id: 'croqueta-prueba-1', canonicalName: 'Croqueta, la original', source: 'business', status: 'active', createdBy: 'ser' },
    'reggina-rosa': { id: 'reggina-rosa', canonicalName: 'Reggina rosa', source: 'community', status: 'active', mergedInto: 'regina-rossa' },
    'regina-rossa': { id: 'regina-rossa', canonicalName: 'Regina rossa', source: 'community', status: 'active' },
    // Recreado con el alta antigua (merge: true): activo y con el mergedInto viejo.
    tortilla: { id: 'tortilla', canonicalName: 'Tortilla', source: 'business', createdBy: 'ser', createdAt: 3000, status: 'active', mergedInto: 'tortilla-de-patata' },
    'tortilla-de-patata': { id: 'tortilla-de-patata', canonicalName: 'Tortilla de patata', source: 'community', status: 'active' },
    // Revivido con el alta nueva (sin mergedInto) después de una fusión antigua.
    croketa: { id: 'croketa', canonicalName: 'Croketa', source: 'business', businessCreated: true, createdBy: 'ser', createdAt: 4000, status: 'active', curatedAliasesNormalized: ['croketa'] },
    croqueta: { id: 'croqueta', canonicalName: 'Croqueta', source: 'community', status: 'active' },
  }));
  const proposals = [
    { type: 'rename', reviewedAt: 2000, payload: { itemId: 'croqueta-prueba-1', currentName: 'Croqueta prueba 1', newName: 'Croqueta, la original' } },
    { type: 'merge', reviewedAt: 500, payload: { sourceItemId: 'reggina-rosa', sourceItemName: 'Reggina rosa', targetItemId: 'regina-rossa' } },
    { type: 'merge', reviewedAt: 1500, payload: { sourceItemId: 'tortilla', sourceItemName: 'Tortilla', targetItemId: 'tortilla-de-patata' } },
    { type: 'merge', reviewedAt: 1000, payload: { sourceItemId: 'croketa', sourceItemName: 'Croketa', targetItemId: 'croqueta' } },
  ];
  const state = makeState({}, [
    review('r1', { itemName: 'Tortilla', overallRating: 8 }, 'tortillas'),
    review('r2', { itemName: 'Croketa', overallRating: 7 }, 'croquetas'),
    review('r3', { itemName: 'reggina rosa', overallRating: 6 }, 'pizzas'),
  ]);
  state.items = new Map(Array.from(items.entries()).map(([id, item]) => [id, { ...item }]));

  // Aplica lo sembrado como hace adminRepairPlaceItems y luego el rebuild.
  const runRepair = () => {
    const seed = seedRepairPlan({ itemsById: state.items, proposals, reviews: Array.from(state.reviews.values()) });
    for (const patch of seed.itemPatches) {
      const item = { ...state.items.get(patch.itemId) };
      item.curatedAliasesNormalized = Array.from(new Set([...(item.curatedAliasesNormalized || []), ...patch.addCuratedAliases]));
      if (patch.status) item.status = patch.status;
      if (patch.clearMergedInto) delete item.mergedInto;
      else if (patch.mergedInto) item.mergedInto = patch.mergedInto;
      state.items.set(patch.itemId, item);
    }
    return { seed, plan: rebuild(state) };
  };

  const first = runRepair();
  assert.equal(state.items.get('tortilla').status, 'active');
  assert.equal(state.items.get('croketa').status, 'active');
  assert.equal(state.items.get('reggina-rosa').status, 'inactive');

  const second = runRepair();
  assert.deepEqual(second.seed.itemPatches, []);
  assert.equal(second.seed.fixedMergedItems, 0);
  assert.equal(second.plan.reviewStamps.length, 0);
  assert.equal(second.plan.emptyItemWrites.length, 0);
  // Los platos recreados por el negocio siguen activos y con sus reseñas.
  for (const itemId of ['tortilla', 'croketa']) {
    const item = state.items.get(itemId);
    assert.equal(item.status, 'active', itemId);
    assert.equal(item.mergedInto, undefined, itemId);
    assert.equal(item.stats.reviewCount, 1, itemId);
  }
  assert.equal(state.reviews.get('lists/tortillas/reviews/r1').itemName, 'Tortilla');
  assert.equal(state.reviews.get('lists/croquetas/reviews/r2').itemName, 'Croketa');
  assert.ok(first.plan.summary.renamedReviews >= 1);
});

test('nombres sin letras latinas: cada plato recibe sus reseñas y un renombrado no se pierde en el siguiente rebuild', () => {
  // Alta de «寿司» y «🍺» (sin-nombre y sin-nombre-2) y reseñas con esos nombres.
  const state = makeState({
    'sin-nombre': { canonicalName: '寿司', source: 'business', status: 'active', curatedAliasesNormalized: [] },
    'sin-nombre-2': { canonicalName: '🍺', source: 'business', status: 'active', curatedAliasesNormalized: [] },
    croqueta: { canonicalName: 'Croqueta', source: 'business', status: 'active', curatedAliasesNormalized: ['croqueta'] },
  }, [
    review('a', { itemName: '🍺', overallRating: 8 }),
    review('b', { itemName: '寿司', overallRating: 6 }),
    review('c', { itemName: 'Croqueta', overallRating: 7 }),
  ]);
  rebuild(state);
  assert.equal(state.items.get('sin-nombre').stats.reviewCount, 1);
  assert.equal(state.items.get('sin-nombre-2').stats.reviewCount, 1);
  assert.equal(state.reviews.get('lists/croquetas/reviews/a').canonicalItemId, 'sin-nombre-2');
  assert.equal(state.reviews.get('lists/croquetas/reviews/a').canonicalItemFor, '');

  // Renombrado aprobado a un nombre sin letras latinas.
  state.items.set('croqueta', { ...state.items.get('croqueta'), canonicalName: 'ラーメン', curatedAliasesNormalized: ['croqueta'] });
  rebuild(state);
  assert.equal(state.reviews.get('lists/croquetas/reviews/c').itemName, 'ラーメン');
  const second = rebuild(state);
  assert.equal(second.reviewStamps.length, 0);
  assert.equal(second.itemWrites.some((write) => write.isNew), false);
  assert.equal(state.items.get('croqueta').stats.reviewCount, 1);
  assert.equal(state.reviews.get('lists/croquetas/reviews/c').canonicalItemId, 'croqueta');
});

test('renombrar entre nombres sin letras latinas (🍺 → 🍷) conserva las reseñas sin crear un plato nuevo', () => {
  const state = makeState({
    'sin-nombre': { canonicalName: '寿司', source: 'business', status: 'active', curatedAliasesNormalized: [] },
    'sin-nombre-2': { canonicalName: '🍺', source: 'business', status: 'active', curatedAliasesNormalized: [], curatedRawAliases: ['🍺'] },
  }, [
    review('a', { itemName: '🍺', overallRating: 8 }),
    review('b', { itemName: '寿司', overallRating: 6 }),
  ]);
  rebuild(state);
  assert.equal(state.items.get('sin-nombre-2').stats.reviewCount, 1);

  // Lo que escribe applyRename: el nombre nuevo y los antiguos como alias crudos.
  const aliases = splitCuratedNames(['🍺', '🍺', '🍷']);
  assert.deepEqual(aliases.normalized, []);
  const item = state.items.get('sin-nombre-2');
  state.items.set('sin-nombre-2', {
    ...item,
    canonicalName: '🍷',
    curatedRawAliases: Array.from(new Set([...(item.curatedRawAliases || []), ...aliases.raw])),
  });
  rebuild(state);
  assert.equal(state.reviews.get('lists/croquetas/reviews/a').itemName, '🍷');
  assert.equal(state.reviews.get('lists/croquetas/reviews/a').originalItemName, '🍺');
  assert.equal(state.items.get('sin-nombre-2').stats.reviewCount, 1);
  assert.equal(state.items.get('sin-nombre').stats.reviewCount, 1);
  assert.equal(Array.from(state.items.keys()).some((id) => !['sin-nombre', 'sin-nombre-2'].includes(id)), false);
  const second = rebuild(state);
  assert.equal(second.reviewStamps.length, 0);
  assert.equal(second.itemWrites.some((write) => write.isNew), false);

  // Una reseña nueva con el nombre antiguo también va al plato renombrado.
  state.reviews.set('lists/croquetas/reviews/n', review('n', { itemName: '🍺', overallRating: 9 }));
  rebuild(state);
  assert.equal(state.items.get('sin-nombre-2').stats.reviewCount, 2);
  assert.equal(state.reviews.get('lists/croquetas/reviews/n').itemName, '🍷');
});

test('fusionar un plato sin letras latinas pasa su nombre como alias crudo al destino', () => {
  const state = makeState({
    'sin-nombre': { canonicalName: '寿司', source: 'business', status: 'active', curatedAliasesNormalized: [] },
    sushi: { canonicalName: 'Sushi', source: 'business', status: 'active', curatedAliasesNormalized: ['sushi'] },
  }, [review('a', { itemName: '寿司', overallRating: 8 })]);
  rebuild(state);
  // Lo que escribe applyMerge: origen inactivo y sus nombres en el destino.
  const aliases = splitCuratedNames(['寿司']);
  state.items.set('sin-nombre', { ...state.items.get('sin-nombre'), status: 'inactive', mergedInto: 'sushi' });
  state.items.set('sushi', { ...state.items.get('sushi'), curatedRawAliases: aliases.raw });
  rebuild(state);
  assert.equal(state.items.get('sushi').stats.reviewCount, 1);
  assert.equal(state.reviews.get('lists/croquetas/reviews/a').itemName, 'Sushi');
  // Un plato nuevo «寿司» ya tiene dueño: no se duplica.
  assert.equal(createResolveContext(state.items).rawNameIndex.get('寿司'), 'sushi');
});

test('splitCuratedNames y sameItemName separan nombres normalizables de los crudos', () => {
  assert.deepEqual(splitCuratedNames(['Croqueta', ' croqueta ', '寿司', '寿司', '', null]), { normalized: ['croqueta'], raw: ['寿司'] });
  assert.equal(sameItemName('Croquetá', 'croqueta'), true);
  assert.equal(sameItemName('🍺', '🍷'), false);
  assert.equal(sameItemName('寿司', ' 寿司 '), true);
});

test('normalizeItemName e itemDocIdFromName siguen igual (reexportados por canonical-items)', () => {
  assert.equal(normalizeItemName('  Croquetón   de Carabineros!! '), 'croqueton de carabineros');
  assert.equal(itemDocIdFromName('Croqueta, la original'), 'croqueta-la-original');
  assert.equal(itemDocIdFromName('寿司'), 'sin-nombre');
});

test('lista elegida por el negocio (businessListIds): se conserva con y sin reseñas', () => {
  const state = makeState({
    'tarta-de-queso': {
      canonicalName: 'Tarta de queso',
      source: 'business',
      businessCreated: true,
      status: 'active',
      curatedAliasesNormalized: ['tarta de queso'],
      businessListIds: ['tartas'],
      linkedListIds: ['tartas'],
      businessData: { group: 'Postres', price: '6,50 €', priceCents: 650, available: true, menuOrder: null },
      stats: { reviewCount: 0, ratingCount: 0, ratingTotal: 0, averageRating: null, photoCount: 0, criteriaStats: {} },
    },
  }, []);

  // Sin reseñas: sigue activo con su lista y sin escrituras.
  let plan = rebuild(state);
  assert.equal(plan.emptyItemWrites.length, 0);
  assert.equal(state.items.get('tarta-de-queso').status, 'active');
  assert.deepEqual(state.items.get('tarta-de-queso').linkedListIds, ['tartas']);

  // Llega una reseña desde otra lista: se suman las dos.
  state.reviews.set('lists/postres/reviews/r1', review('r1', { itemName: 'Tarta de queso', overallRating: 9 }, 'postres'));
  plan = rebuild(state);
  assert.deepEqual(state.items.get('tarta-de-queso').linkedListIds, ['postres', 'tartas']);
  assert.equal(state.items.get('tarta-de-queso').stats.reviewCount, 1);
  assert.equal(plan.itemWrites[0].isNew, false);
  assert.equal('businessListIds' in plan.itemWrites[0].data, false);

  // Se borra la reseña: vuelve a solo la lista del negocio, sigue activo.
  state.reviews.delete('lists/postres/reviews/r1');
  plan = rebuild(state);
  const item = state.items.get('tarta-de-queso');
  assert.deepEqual(item.linkedListIds, ['tartas']);
  assert.deepEqual(item.businessListIds, ['tartas']);
  assert.equal(item.status, 'active');
  assert.equal(item.stats.reviewCount, 0);
  assert.equal(rebuild(state).emptyItemWrites.length, 0);
});

test('lista del negocio en un elemento con linkedListIds viejos: el rebuild los corrige', () => {
  const state = makeState({
    pulpo: {
      canonicalName: 'Pulpo',
      source: 'business',
      status: 'active',
      businessListIds: ['pulpos'],
      businessData: {},
      stats: { reviewCount: 0, ratingCount: 0, ratingTotal: 0, averageRating: null, photoCount: 0, criteriaStats: {} },
    },
  }, []);
  const plan = rebuild(state);
  assert.equal(plan.emptyItemWrites.length, 1);
  assert.deepEqual(state.items.get('pulpo').linkedListIds, ['pulpos']);
});

test('la ficha por defecto con menuOrder null no cuenta como curada; un orden sí', () => {
  const defaults = { group: '', price: '', priceCents: null, discount: '', ingredients: '', description: '', allergens: [], available: true, menuOrder: null };
  assert.equal(isBusinessCurated({ source: 'community', businessData: defaults }), false);
  assert.equal(isBusinessCurated({ source: 'community', businessData: { ...defaults, menuOrder: 0 } }), true);
});
