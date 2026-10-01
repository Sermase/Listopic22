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
 *   … --details                              (ruta de cada valoración que cambiaría)
 *
 * Reparar (escribe SOLO el campo `visibility`, nada más):
 *   … node scripts/audit-review-visibility.js --apply
 */
const admin = require('firebase-admin');

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const USER = (process.argv.find((a) => a.startsWith('--user=')) || '').slice('--user='.length);
const DETAILS = process.argv.includes('--details');

const listVisibility = (list) => (list && (list.isPublic === true || list.visibility === 'public') ? 'public' : 'private');

(async () => {
  const listsSnap = await db.collection('lists').get();
  const lists = new Map(listsSnap.docs.map((d) => [d.id, d.data() || {}]));
  const reviewsSnap = await db.collectionGroup('reviews').get();

  const profilesSnap = await db.collection('publicProfiles').get();
  const userName = new Map(profilesSnap.docs.map((d) => [d.id, d.data().username || d.data().displayName || d.id]));

  const mismatches = [];
  const perList = new Map(); // target → { name, total, pub, priv, missing, users:Set, changes:[] }
  const userRows = [];
  const orphan = [];
  reviewsSnap.forEach((doc) => {
    const r = doc.data() || {};
    const segments = doc.ref.path.split('/');
    const storedIn = segments[0] === 'lists' ? segments[1] : (r.listId || '');
    const target = typeof r.sublistId === 'string' && r.sublistId.trim() ? r.sublistId : storedIn;
    const targetList = lists.get(target);
    const author = r.userId || r.authorId || '?';
    const actual = r.visibility === undefined ? '(sin campo)' : r.visibility;
    if (!targetList) { orphan.push(doc.ref.path); return; }
    const expected = listVisibility(targetList);
    const row = { path: doc.ref.path, target, author, expected, actual, hasCreatedAt: !!r.createdAt, item: [r.itemName, r.placeName].filter(Boolean).join(' · ') };
    if (USER && author === USER) userRows.push(row);
    const entry = perList.get(target) || { name: targetList.name || target, listVisibility: expected, minilista: Boolean(targetList.parentListId), total: 0, pub: 0, priv: 0, missing: 0, users: new Map(), changes: [] };
    entry.total += 1;
    if (actual === 'public') entry.pub += 1; else if (actual === 'private') entry.priv += 1; else entry.missing += 1;
    if (actual !== expected) {
      mismatches.push(row);
      entry.changes.push(row);
      const name = userName.get(author) || author;
      entry.users.set(name, (entry.users.get(name) || 0) + 1);
    }
    perList.set(target, entry);
  });

  console.log(`Listas: ${lists.size} · valoraciones: ${reviewsSnap.size} · a cambiar: ${mismatches.length}\n`);
  console.log(['Lista', 'Visibilidad lista', 'Total', 'Públicas', 'Privadas', 'Sin campo', 'A cambiar', 'Usuarios afectados'].join(' | '));
  [...perList.values()].sort((a, b) => b.changes.length - a.changes.length || b.total - a.total).forEach((e) => {
    console.log([`${e.name}${e.minilista ? ' (Minilista)' : ''}`, e.listVisibility, e.total, e.pub, e.priv, e.missing, e.changes.length,
      [...e.users.entries()].map(([n, c]) => `${n} (${c})`).join(', ') || '—'].join(' | '));
  });
  if (DETAILS) {
    console.log('\nValoraciones que cambiaría el script:');
    mismatches.forEach((m) => console.log(`  ${m.path}  ${m.actual} → ${m.expected}  ${userName.get(m.author) || m.author}  ${m.item}`));
  }
  if (orphan.length) console.log(`\nValoraciones cuya lista ya no existe (no se tocan): ${orphan.length}`);

  if (USER) {
    const visible = userRows.filter((r) => r.actual === 'public' && r.hasCreatedAt);
    console.log(`\nPersona ${userName.get(USER) || USER}: ${userRows.length} valoraciones en Firestore; el perfil público muestra ${visible.length}.`);
    const reasons = new Map();
    userRows.filter((r) => !(r.actual === 'public' && r.hasCreatedAt)).forEach((r) => {
      const why = r.actual !== 'public' ? `visibility = ${r.actual}` : 'sin createdAt';
      const key = `${lists.get(r.target)?.name || r.target}: ${why}`;
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
