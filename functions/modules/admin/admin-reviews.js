'use strict';

// Developer (solo jefe): buscar, ver y editar valoraciones (también el autor) y la ficha
// completa de un usuario. Todo con el SDK de administración: no depende de las reglas de
// Firestore ni del claim `admin` (las consultas del navegador las rechazaban: límite de
// 100 y la colección raíz `reviews/`). Cada cambio queda en adminAuditLog con antes y después.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');
const { userReviewDocs } = require('../lib/user-reviews');
const { hasRole } = require('../lib/author-roles');
const { checkBadges } = require('../gamification');
const { REVIEW_PATH, serialize, slimReview, matchesReviewQuery, scoringContext, buildReviewPatch } = require('../lib/review-admin');

const db = getFirestore();
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 5000;
const MAX_SCAN = 5000;
const str = (value) => (typeof value === 'string' ? value.trim() : '');
const clampLimit = (value) => Math.min(Math.max(Number(value) || DEFAULT_LIMIT, 1), MAX_LIMIT);

async function getAllDocs(collection, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const result = new Map();
  for (let i = 0; i < unique.length; i += 100) {
    const snaps = await db.getAll(...unique.slice(i, i + 100).map((id) => db.collection(collection).doc(id)));
    snaps.forEach((snap) => { if (snap.exists) result.set(snap.id, snap.data() || {}); });
  }
  return result;
}

const profileName = (profile) => str(profile && (profile.username || profile.displayName || profile.name)) || null;

/** Nombre de la Lista, del autor y del sitio (si la valoración no los guarda) para la tabla. */
async function enrich(reviews) {
  const [lists, profiles, places] = await Promise.all([
    getAllDocs('lists', reviews.flatMap((r) => [r.listId, r.sublistId])),
    getAllDocs('publicProfiles', reviews.map((r) => r.userId)),
    getAllDocs('places', reviews.filter((r) => !r.placeName).map((r) => r.placeId)),
  ]);
  return reviews.map((r) => ({
    ...r,
    placeName: r.placeName || str(places.get(r.placeId)?.name) || null,
    listName: str(lists.get(r.listId)?.name) || null,
    sublistName: r.sublistId ? str(lists.get(r.sublistId)?.name) || null : null,
    authorName: r.authorName || profileName(profiles.get(r.userId)),
    authorIsBot: hasRole(profiles.get(r.userId)?.userType, 'bot'),
  }));
}

/** Documentos de valoración según el filtro principal (el resto se filtra en memoria). */
async function reviewDocsFor({ userId, placeId, listId }) {
  if (userId) {
    const [byUser, byAuthor] = await Promise.all([userReviewDocs(db, 'userId', userId), userReviewDocs(db, 'authorId', userId)]);
    const unique = new Map([...byUser, ...byAuthor].map((d) => [d.ref.path, d]));
    return { docs: [...unique.values()], truncated: false };
  }
  if (placeId) {
    const snap = await db.collectionGroup('reviews').where('placeId', '==', placeId).limit(MAX_SCAN).get();
    return { docs: snap.docs, truncated: snap.size >= MAX_SCAN };
  }
  if (listId) {
    const snap = await db.collection('lists').doc(listId).collection('reviews').limit(MAX_SCAN).get();
    return { docs: snap.docs, truncated: snap.size >= MAX_SCAN };
  }
  // Sin filtro: se recorre por páginas (sin índices) hasta MAX_SCAN y se ordena aquí.
  const docs = [];
  let last = null;
  while (docs.length < MAX_SCAN) {
    let query = db.collectionGroup('reviews').limit(500);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;
    docs.push(...snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  return { docs, truncated: docs.length >= MAX_SCAN };
}

const adminSearchReviews = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  await assertJefeAccess(request.auth?.uid);
  const { userId, placeId, listId, text = '', visibility = '', full = false } = request.data || {};
  const limit = clampLimit(request.data?.limit);
  const { docs, truncated } = await reviewDocsFor({ userId: str(userId), placeId: str(placeId), listId: str(listId) });
  // full: además del resumen, el documento entero (la auditoría de Developer mira campos antiguos).
  const filtered = docs
    .map((d) => (full ? { ...serialize(d.data() || {}), ...slimReview(d.ref.path, d.data() || {}) } : slimReview(d.ref.path, d.data() || {})))
    .filter((r) => matchesReviewQuery(r, { text: str(text), visibility: visibility === 'public' || visibility === 'private' ? visibility : '' }))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return {
    reviews: await enrich(filtered.slice(0, limit)),
    total: filtered.length,
    scanned: docs.length,
    truncated,
  };
});

function assertReviewPath(path) {
  if (typeof path !== 'string' || !REVIEW_PATH.test(path)) throw new HttpsError('invalid-argument', 'Ruta de valoración no válida.');
}

async function loadReviewContext(path) {
  const snap = await db.doc(path).get();
  if (!snap.exists) throw new HttpsError('not-found', 'La valoración no existe.');
  const data = snap.data() || {};
  const slim = slimReview(path, data);
  const [listSnap, sublistSnap, placeSnap, authorSnap] = await Promise.all([
    slim.listId ? db.collection('lists').doc(slim.listId).get() : null,
    slim.sublistId ? db.collection('lists').doc(slim.sublistId).get() : null,
    slim.placeId ? db.collection('places').doc(slim.placeId).get() : null,
    slim.userId ? db.collection('publicProfiles').doc(slim.userId).get() : null,
  ]);
  const list = listSnap?.exists ? listSnap.data() : null;
  const sublist = sublistSnap?.exists ? sublistSnap.data() : null;
  return { snap, data, slim, list, sublist, place: placeSnap?.exists ? placeSnap.data() : null, author: authorSnap?.exists ? authorSnap.data() : null };
}

const listSummary = (id, list) => (list ? {
  id, name: list.name || id, visibility: list.visibility || (list.isPublic === false ? 'private' : 'public'),
  parentListId: list.parentListId || null, userId: list.userId || null,
} : null);

const adminGetReview = onCall(async (request) => {
  await assertJefeAccess(request.auth?.uid);
  const path = request.data?.path;
  assertReviewPath(path);
  const ctx = await loadReviewContext(path);
  const { criteria, weights } = scoringContext(ctx.list, ctx.sublist);
  return {
    review: { ...serialize(ctx.data), path, id: ctx.slim.id },
    list: listSummary(ctx.slim.listId, ctx.list),
    sublist: listSummary(ctx.slim.sublistId, ctx.sublist),
    place: ctx.place ? { id: ctx.slim.placeId, name: ctx.place.name || null, city: ctx.place.city || null, address: ctx.place.address || ctx.place.formatted_address || null } : null,
    author: ctx.author ? { uid: ctx.slim.userId, name: profileName(ctx.author), photoUrl: ctx.author.photoUrl || null, userType: ctx.author.userType || [] } : null,
    scoring: { criteria: serialize(criteria), weights: weights || null },
  };
});

// Mismo criterio que gamification.countReviewPhotos (y el recuento de Developer).
function countReviewPhotos(data) {
  for (const field of ['photos', 'images']) {
    if (Array.isArray(data[field])) {
      const count = data[field].filter((p) => typeof p === 'string' && p.trim()).length;
      if (count > 0) return count;
    }
  }
  return str(data.photoUrl) ? 1 : 0;
}

/** Valoraciones y fotos de una persona contadas de nuevo (tras cambiar el autor de una). */
async function recountAuthor(uid) {
  const [byUser, byAuthor] = await Promise.all([userReviewDocs(db, 'userId', uid), userReviewDocs(db, 'authorId', uid)]);
  const own = new Map();
  [...byUser, ...byAuthor].forEach((d) => {
    const data = d.data() || {};
    if ((str(data.userId) || str(data.authorId)) === uid && d.ref.path.startsWith('lists/')) own.set(d.ref.path, data);
  });
  const reviewsCount = own.size;
  const photosCount = [...own.values()].reduce((sum, data) => sum + countReviewPhotos(data), 0);
  await db.collection('users').doc(uid).set({ reviewsCount, reviewCount: reviewsCount, photosCount }, { merge: true });
  await checkBadges(uid).catch((error) => logger.warn(`adminUpdateReview: checkBadges(${uid}) falló`, { error: error.message }));
  return { uid, reviewsCount, photosCount };
}

const adminUpdateReview = onCall({ timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid);
  const { path, changes = {}, reason = '' } = request.data || {};
  assertReviewPath(path);
  const ctx = await loadReviewContext(path);

  let authorChange;
  if (changes.authorUid !== undefined) {
    const newUid = str(changes.authorUid);
    const [userSnap, profileSnap] = await Promise.all([db.collection('users').doc(newUid || '_').get(), db.collection('publicProfiles').doc(newUid || '_').get()]);
    if (!newUid || !userSnap.exists) throw new HttpsError('not-found', 'El nuevo autor no existe.');
    const profile = { ...(userSnap.data() || {}), ...(profileSnap.exists ? profileSnap.data() : {}) };
    authorChange = { uid: newUid, name: profileName(profile), photoUrl: profile.photoUrl || profile.photoURL || null, userType: profile.userType || [] };
  }

  const { criteria, weights } = scoringContext(ctx.list, ctx.sublist);
  const { patch, changed, errors } = buildReviewPatch(ctx.data, {
    itemName: changes.itemName,
    comment: changes.comment,
    tags: changes.tags,
    scores: changes.scores,
    overallRating: changes.overallRating,
    author: authorChange,
  }, { criteria, weights });
  if (errors.length) throw new HttpsError('invalid-argument', errors.join(' '));
  if (changed.length === 0) return { changed: [], review: ctx.slim };

  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, serialize(ctx.data[k] ?? null)]));
  await ctx.snap.ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp(), adminEditedAt: FieldValue.serverTimestamp(), adminEditedBy: uid });
  await writeAuditLog(uid, 'reviews.adminUpdate', { path, changed, before, after: serialize(patch), reason: str(reason).slice(0, 500) });

  // Al cambiar el autor, los triggers solo miran al nuevo: se recuentan los dos.
  const recounted = [];
  if (changed.includes('author')) {
    const previous = str(ctx.data.userId) || str(ctx.data.authorId);
    for (const affected of [previous, authorChange.uid].filter(Boolean)) recounted.push(await recountAuthor(affected));
  }
  const after = await ctx.snap.ref.get();
  logger.info(`adminUpdateReview: ${path} (${changed.join(', ')}) por ${uid}`);
  return { changed, recounted, review: (await enrich([slimReview(path, after.data() || {})]))[0] };
});

const adminSearchUsers = onCall(async (request) => {
  await assertJefeAccess(request.auth?.uid);
  const term = str(request.data?.q).toLowerCase();
  const limit = Math.min(Math.max(Number(request.data?.limit) || 20, 1), 50);
  const users = db.collection('users');
  const found = new Map();
  const add = (snap) => snap.docs.forEach((d) => found.set(d.id, d.data() || {}));
  if (!term) {
    add(await users.orderBy('reviewsCount', 'desc').limit(limit).get());
  } else {
    const direct = await users.doc(str(request.data?.q)).get();
    if (direct.exists) found.set(direct.id, direct.data() || {});
    const prefix = (field) => users.where(field, '>=', term).where(field, '<=', `${term}`).limit(limit).get();
    const results = await Promise.allSettled([prefix('usernameLower'), prefix('emailLowerCase'), prefix('email')]);
    results.forEach((r) => { if (r.status === 'fulfilled') add(r.value); });
  }
  return {
    users: [...found.entries()].slice(0, limit).map(([id, u]) => ({
      uid: id,
      username: u.username || null,
      displayName: u.displayName || null,
      email: u.email || null,
      photoUrl: u.photoUrl || u.photoURL || null,
      userType: Array.isArray(u.userType) ? u.userType : (u.userType ? [u.userType] : []),
      reviewsCount: Number(u.reviewsCount) || 0,
      level: Number(u.level) || 0,
    })),
  };
});

const SENSITIVE_USER_FIELDS = ['fcmTokens', 'fcmToken', 'pushTokens', 'stripeCustomerId', 'stripeSubscriptionId'];

async function safeCount(query) {
  try { return (await query.count().get()).data().count; } catch (_) { return null; }
}

const adminUserOverview = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  await assertJefeAccess(request.auth?.uid);
  const uid = str(request.data?.uid);
  if (!uid) throw new HttpsError('invalid-argument', 'Falta el usuario.');
  const userRef = db.collection('users').doc(uid);
  const [userSnap, profileSnap] = await Promise.all([userRef.get(), db.collection('publicProfiles').doc(uid).get()]);
  if (!userSnap.exists) throw new HttpsError('not-found', 'El usuario no existe.');
  const user = { ...(userSnap.data() || {}) };
  SENSITIVE_USER_FIELDS.forEach((f) => delete user[f]);

  const [reviewSet, listsSnap, followers, following, followingLists, photosSnap, ownedPlaces, managedPlaces] = await Promise.all([
    reviewDocsFor({ userId: uid }),
    db.collection('lists').where('userId', '==', uid).get(),
    safeCount(userRef.collection('followers')),
    safeCount(userRef.collection('following')),
    safeCount(userRef.collection('followingLists')),
    db.collectionGroup('photos').where('userId', '==', uid).limit(200).get().catch(() => null),
    db.collection('places').where('businessOwnerUserId', '==', uid).limit(50).get().catch(() => null),
    db.collection('places').where('businessManagerIds', 'array-contains', uid).limit(50).get().catch(() => null),
  ]);

  const reviews = (await enrich(reviewSet.docs.map((d) => slimReview(d.ref.path, d.data() || {}))))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const rated = reviews.filter((r) => typeof r.overallRating === 'number');
  const lists = listsSnap.docs.map((d) => {
    const l = d.data() || {};
    return { id: d.id, name: l.name || d.id, visibility: l.visibility || (l.isPublic === false ? 'private' : 'public'), parentListId: l.parentListId || null, reviewCount: Number(l.reviewCount) || 0, itemCount: Number(l.itemCount) || 0, followersCount: Number(l.followersCount) || 0 };
  });
  const places = new Map();
  [ownedPlaces, managedPlaces].forEach((snap) => snap?.docs.forEach((d) => places.set(d.id, { id: d.id, name: (d.data() || {}).name || d.id })));

  return {
    user: { uid, ...serialize(user) },
    publicProfile: profileSnap.exists ? serialize(profileSnap.data()) : null,
    stats: {
      reviews: reviews.length,
      publicReviews: reviews.filter((r) => r.visibility === 'public').length,
      privateReviews: reviews.filter((r) => r.visibility === 'private').length,
      withPhotos: reviews.filter((r) => r.photos.length > 0).length,
      averageRating: rated.length ? Math.round((rated.reduce((s, r) => s + r.overallRating, 0) / rated.length) * 100) / 100 : null,
      places: new Set(reviews.map((r) => r.placeId).filter(Boolean)).size,
      lists: lists.filter((l) => !l.parentListId).length,
      minilists: lists.filter((l) => l.parentListId).length,
      followers,
      following,
      followingLists,
      placePhotos: photosSnap ? photosSnap.size : null,
      // Lo que guarda el documento (para ver si está desfasado frente a lo contado).
      storedReviewsCount: Number(user.reviewsCount) || 0,
      storedPhotosCount: Number(user.photosCount) || 0,
    },
    reviews,
    lists,
    placePhotos: photosSnap ? photosSnap.docs.map((d) => ({ path: d.ref.path, ...serialize(d.data() || {}) })) : [],
    businessPlaces: [...places.values()],
  };
});

module.exports = { adminSearchReviews, adminGetReview, adminUpdateReview, adminSearchUsers, adminUserOverview };
