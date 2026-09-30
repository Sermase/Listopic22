#!/usr/bin/env node
/**
 * Valoraciones cuya `visibility` no coincide con la de su lista.
 *
 * Por qué importa: el perfil, la Lista y la Home solo leen
 * `visibility == 'public'`. Si una lista es pública pero sus valoraciones
 * dicen 'private' (o no tienen el campo), existen en Firestore pero no se ven.
 *
 * SOLO LECTURA por defecto:
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/audit-review-visibility.js
 *   … --user=TtU5VnnJGyNOzYMjcoAOPvhAap82   (detalle de una persona: qué ve su perfil y qué no)
 *
 * Reparar (escribe SOLO el campo `visibility`, nada más):
 *   … node scripts/audit-review-visibility.js --apply
 */
const admin = require('firebase-admin');

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const USER = (process.argv.find((a) => a.startsWith('--user=')) || '').slice('--user='.length);

const listVisibility = (list) => (list && (list.isPublic === true || list.visibility === 'public') ? 'public' : 'private');

(async () => {
  const listsSnap = await db.collection('lists').get();
  const lists = new Map(listsSnap.docs.map((d) => [d.id, d.data() || {}]));
  const reviewsSnap = await db.collectionGroup('reviews').get();

  const mismatches = [];
  const byList = new Map();
  const userRows = [];
  reviewsSnap.forEach((doc) => {
    const r = doc.data() || {};
    const segments = doc.ref.path.split('/');
    const storedIn = segments[0] === 'lists' ? segments[1] : (r.listId || '');
    const target = typeof r.sublistId === 'string' && r.sublistId.trim() ? r.sublistId : storedIn;
    const targetList = lists.get(target);
    const expected = targetList ? listVisibility(targetList) : null;
    const actual = r.visibility === undefined ? '(sin campo)' : r.visibility;
    const author = r.userId || r.authorId || '?';
    const row = { path: doc.ref.path, target, targetName: targetList?.name || '(lista borrada)', author, expected, actual, hasCreatedAt: !!r.createdAt, item: r.itemName || r.placeName || '' };
    if (USER && author === USER) userRows.push(row);
    if (expected && actual !== expected) {
      mismatches.push(row);
      const key = `${row.targetName} (${target}) → debería ser ${expected}`;
      const entry = byList.get(key) || new Map();
      entry.set(`${actual} · autor ${author}`, (entry.get(`${actual} · autor ${author}`) || 0) + 1);
      byList.set(key, entry);
    }
  });

  console.log(`Listas: ${lists.size} · valoraciones: ${reviewsSnap.size}`);
  console.log(`Con visibilidad distinta a la de su lista: ${mismatches.length}`);
  byList.forEach((entry, key) => {
    console.log(`\n  ${key}`);
    entry.forEach((count, label) => console.log(`    ${count} × ${label}`));
  });
  const orphan = [];
  reviewsSnap.forEach((doc) => {
    const r = doc.data() || {};
    const segments = doc.ref.path.split('/');
    const storedIn = segments[0] === 'lists' ? segments[1] : (r.listId || '');
    const target = typeof r.sublistId === 'string' && r.sublistId.trim() ? r.sublistId : storedIn;
    if (!lists.has(target)) orphan.push(doc.ref.path);
  });
  if (orphan.length) console.log(`\nValoraciones cuya lista ya no existe (no se tocan): ${orphan.length}`);

  if (USER) {
    const visible = userRows.filter((r) => r.actual === 'public' && r.hasCreatedAt);
    console.log(`\nPersona ${USER}: ${userRows.length} valoraciones en Firestore; el perfil público muestra ${visible.length}.`);
    const hidden = userRows.filter((r) => !(r.actual === 'public' && r.hasCreatedAt));
    const reasons = new Map();
    hidden.forEach((r) => {
      const why = r.actual !== 'public' ? `visibility = ${r.actual}` : 'sin createdAt';
      const key = `${r.targetName}: ${why}`;
      reasons.set(key, (reasons.get(key) || 0) + 1);
    });
    reasons.forEach((count, key) => console.log(`  ocultas ${count} × ${key}`));
  }

  if (!APPLY) {
    console.log('\nSimulación: no se ha escrito nada. Añade --apply para corregir solo `visibility`.');
    process.exit(0);
  }
  for (let i = 0; i < mismatches.length; i += 400) {
    const batch = db.batch();
    mismatches.slice(i, i + 400).forEach((m) => batch.update(db.doc(m.path), { visibility: m.expected }));
    await batch.commit();
  }
  console.log(`\nCorregidas: ${mismatches.length}. Después: Developer → «Recalcular TODAS las Listas» no es necesario (la nota no cambia).`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
