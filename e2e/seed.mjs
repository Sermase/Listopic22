// Siembra los emuladores (proyecto demo-listopic) con el caso compartido de
// ranking (frontend/src/lib/listElements.vectors.json) y reindexa Algolia
// (simulado) con la Function real. Nunca toca producción: sin
// FIRESTORE_EMULATOR_HOST no arranca.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('seed: solo contra los emuladores (faltan FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST).');
  process.exit(1);
}

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, GeoPoint, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const PROJECT = 'demo-listopic';
const vectors = JSON.parse(readFileSync(fileURLToPath(new URL('../frontend/src/lib/listElements.vectors.json', import.meta.url)), 'utf8'));
// Versión vigente de Términos/Privacidad: sin ella, la app pide aceptarlas al entrar.
const legal = JSON.parse(readFileSync(fileURLToPath(new URL('../frontend/src/config/legal.json', import.meta.url)), 'utf8'));
export const PASSWORD = 'secreto-e2e';
const ALGOLIA = process.env.ALGOLIA_MOCK_URL || 'http://127.0.0.1:7700';

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

const COORDS = {
  p_vll1: [41.6523, -4.7245], p_vll2: [41.6535, -4.728], p_vll3: [41.649, -4.73], p_med: [41.312, -4.914],
  p_leon: [42.5987, -5.5671], p_mad: [40.4168, -3.7038], p_mad2: [40.417, -3.703], p_chain1: [41.65, -4.72], p_chain2: [40.42, -3.7],
};

const authors = [...new Set(vectors.reviews.map((r) => r.userId))];
const users = [
  { uid: 'duena', name: 'Dueña', types: ['basico'] },
  { uid: 'jefe', name: 'Jefa', types: ['basico', 'jefe'] },
  ...authors.map((uid) => ({ uid, name: uid === 'bot' ? 'ListopIA' : uid, types: vectors.botAuthorIds.includes(uid) ? ['basico', 'bot'] : ['basico'] })),
];

async function seed() {
  for (const u of users) {
    await auth.createUser({ uid: u.uid, email: `${u.uid}@e2e.test`, password: PASSWORD, displayName: u.name }).catch((e) => {
      if (e.code !== 'auth/uid-already-exists') throw e;
    });
    const profile = { username: u.name, displayName: u.name, userType: u.types };
    await db.doc(`users/${u.uid}`).set({
      ...profile, email: `${u.uid}@e2e.test`, createdAt: Timestamp.now(),
      legalAcceptance: { version: legal.version, acceptedAt: Timestamp.now(), ageConfirmed: true, method: 'signup' },
    });
    await db.doc(`publicProfiles/${u.uid}`).set({ ...profile, reviewsCount: 0 });
  }
  for (const [id, place] of Object.entries(vectors.places)) {
    const [lat, lng] = COORDS[id];
    await db.doc(`places/${id}`).set({ ...place, location: new GeoPoint(lat, lng), address: `${place.name}, ${place.city || ''}` });
  }
  const list = vectors.list;
  const base = { userId: 'duena', reviewCount: 0, editors: [], publicAccess: 'writer', availableTags: [], createdAt: Timestamp.now() };
  await db.doc('lists/bravas').set({ ...base, name: 'Patatas bravas', description: 'Caso E2E', isPublic: true, visibility: 'public', criteriaDefinition: list.criteriaDefinition, scoringWeights: list.scoringWeights });
  const picante = { label: 'Picante', order: 2 };
  await db.doc('lists/picantes').set({ ...base, name: 'Bravas picantes', isPublic: true, visibility: 'public', parentListId: 'bravas', criteriaDefinition: { ...list.criteriaDefinition, picante }, scoringWeights: { ...list.scoringWeights, picante: 1 } });
  await db.doc('lists/pruebas').set({ ...base, name: 'Pruebas E2E', isPublic: true, visibility: 'public', criteriaDefinition: list.criteriaDefinition, scoringWeights: list.scoringWeights });
  await db.doc('lists/secreta').set({ ...base, name: 'Bravas secretas', isPublic: false, visibility: 'private', parentListId: 'bravas', criteriaDefinition: list.criteriaDefinition, scoringWeights: list.scoringWeights });

  // Sitio solo con valoraciones de bots (fuera de «bravas»): sale en Buscar → Sitios
  // «Sin nota pública todavía»; con el filtro «Bots», su nota de bots.
  await db.doc('places/p_bots').set({ name: 'Bar Robot', city: 'Valladolid', province: 'Valladolid', region: 'Castilla y León', country: 'España', location: new GeoPoint(41.6511, -4.7262), address: 'Bar Robot, Valladolid' });
  await db.doc('lists/robots').set({ ...base, name: 'Robots E2E', isPublic: true, visibility: 'public', criteriaDefinition: list.criteriaDefinition, scoringWeights: list.scoringWeights });
  for (const [id, overallRating] of [['rb1', 7], ['rb2', 8]]) {
    await db.doc(`lists/robots/reviews/${id}`).set({
      userId: 'bot', placeId: 'p_bots', itemName: 'Bravas robot', visibility: 'public', overallRating, listId: 'robots',
      establishmentName: 'Bar Robot', authorUserType: ['basico', 'bot'], createdAt: Timestamp.fromMillis(1_790_000_000_000),
    });
  }

  for (const r of vectors.reviews) {
    const { id, createdAtMs, ...data } = r;
    const place = vectors.places[r.placeId];
    await db.doc(`lists/bravas/reviews/${id}`).set({
      ...data,
      listId: 'bravas',
      establishmentName: place.name,
      authorUserType: vectors.botAuthorIds.includes(r.userId) ? ['basico', 'bot'] : ['basico'],
      createdAt: Timestamp.fromMillis(1_790_000_000_000 + createdAtMs * 1000),
    });
  }
}

async function idToken(email) {
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  return (await res.json()).idToken;
}

async function callFunction(name, data, email) {
  const host = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
  const res = await fetch(`http://${host}/${PROJECT}/europe-west1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await idToken(email)}` },
    body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200) throw new Error(`${name}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.result;
}

async function algoliaRecords(indexName, filters) {
  const res = await fetch(`${ALGOLIA}/1/indexes/*/queries`, { method: 'POST', body: JSON.stringify({ requests: [{ indexName, filters, hitsPerPage: 1000 }] }) });
  return (await res.json()).results[0].hits;
}

// Triggers apagados mientras se siembra: si no, siguen reconstruyendo índices
// durante las pruebas. Después se recalcula todo explícitamente.
async function backgroundTriggers(enabled) {
  const hub = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';
  const res = await fetch(`http://${hub}/functions/${enabled ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' });
  if (!res.ok) throw new Error(`hub: HTTP ${res.status}`);
}

async function main() {
  await backgroundTriggers(false);
  try {
    await seed();
  } finally {
    await backgroundTriggers(true);
  }
  // Contadores de las Listas y reindexado de Algolia con las Functions reales.
  await callFunction('adminRecalculateAllLists', {}, 'jefe@e2e.test');
  // Contadores y notas de sitios (lib/place-rating.js) con la Function real.
  await callFunction('adminRecountReviewCounters', {}, 'jefe@e2e.test');
  const result = await callFunction('adminBackfillAlgolia', { collectionName: 'grouped_items' }, 'jefe@e2e.test');
  for (const collectionName of ['lists', 'places', 'users']) await callFunction('adminBackfillAlgolia', { collectionName }, 'jefe@e2e.test');
  const records = await algoliaRecords('grouped_items', 'listId:"bravas"');
  const expected = vectors.expected.elements.length + vectors.expected.botOnlyKeys.length;
  console.log(`seed: ${vectors.reviews.length} valoraciones; Algolia grouped_items de «bravas»: ${records.length}/${expected} (${JSON.stringify(result).slice(0, 120)})`);
  if (records.length !== expected) throw new Error('El reindexado no ha dejado los registros esperados.');
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
