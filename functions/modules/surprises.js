'use strict';

// Sorpresas (huevos de Pascua). Dos llamadas:
// - claimSurpriseBadge: da una medalla secreta. Las define este archivo (se
//   crean en `badges` la primera vez). «Bien comido» se comprueba aquí; el resto
//   son bromas que pasan en el móvil y se fían de él.
// - tortillaPoll: las encuestas eternas («poll»): tortilla con o sin cebolla y
//   pizza con o sin piña. Un voto por cuenta y encuesta (se puede cambiar) y la
//   zona como celda de 0,1° (~10 km), nunca el punto exacto.
// - reviewSecretBadges (cada madrugada): repasa las medallas que se pueden
//   comprobar con los datos (Bien comido, Ave nocturna, Paladar de hierro, Juez
//   de la tortilla): las da a quien las merece y las quita a quien las perdió
//   (p. ej. borró la valoración). Las de minijuegos no se pueden comprobar: se quedan.
//   También repasa la escalera de temas (THEME_BADGES).
// - claimThemeBadges: da al momento las medallas de temas que ya se cumplen.
// - recalcSecretBadges: el mismo repaso de madrugada, lanzado por el Jefe desde Developer.
const { onCall, HttpsError } = require('./https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { rateLimit, assertJefeAccess, writeAuditLog } = require('./lib/auth');
const { userReviewDocs } = require('./lib/user-reviews');

const db = getFirestore();
const TIME_ZONE = 'Europe/Madrid';

const SECRET_BADGES = {
  BIEN_COMIDO: { surprise: 'abuela', name: 'Bien comido', icon: '👵', description: 'Tres valoraciones en un domingo. Tu abuela estaría orgullosa: desbloquea el tema Abuela.' },
  AVE_NOCTURNA: { surprise: 'lateNight', name: 'Ave nocturna', icon: '🌙', description: 'Valorar comida de después de fiesta de madrugada.' },
  CROQUETERO: { surprise: 'croqueta', name: 'Croquetero', icon: '🧆', description: 'Atrapar 20 croquetas en una partida de «Atrapa la croqueta».' },
  DETECTIVE: { surprise: 'lostPlate', name: 'Detective de platos', icon: '🔎', description: 'Encontrar el plato perdido.' },
  JUEZ_TORTILLA: { surprise: 'tortilla', name: 'Juez de la tortilla', icon: '⚔️', description: 'Votar en la encuesta eterna: ¿con o sin cebolla?' },
  PALADAR_DE_HIERRO: { surprise: 'spicy', name: 'Paladar de hierro', icon: '🌶️', description: 'Poner el picante al máximo.' },
};

const { THEME_BADGES, THEME_IDS, emptyThemeStats, addThemeStat, themeBadgesMet } = require('./lib/theme-badges');

const badgeMeta = (id) => SECRET_BADGES[id] || THEME_BADGES[id];

async function surpriseFlags() {
  const snap = await db.doc('config/app').get();
  const flags = snap.exists ? snap.get('surprises') : null;
  return flags && typeof flags === 'object' ? flags : {};
}

const flagOn = (flags, surprise) => flags[surprise] !== false && flags.secretBadges !== false;
const ladderOn = (flags) => flags.themeLadder !== false;
const badgeOn = (flags, id) => (THEME_BADGES[id] ? ladderOn(flags) : flagOn(flags, SECRET_BADGES[id].surprise));

async function surpriseEnabled(surprise) {
  return flagOn(await surpriseFlags(), surprise);
}

const themeBadgeDefinition = (meta) => ({
  name: meta.name,
  icon: meta.icon,
  description: meta.description,
  descriptionPublic: meta.description,
  logicNotes: 'Escalera de temas (functions/modules/surprises.js).',
  category: 'SPECIAL',
  type: 'custom',
  threshold: 0,
  xpReward: 15,
  active: true,
  rarity: 'rare',
  createdAt: FieldValue.serverTimestamp(),
});

const definitionOf = (id) => (THEME_BADGES[id] ? themeBadgeDefinition(THEME_BADGES[id]) : badgeDefinition(SECRET_BADGES[id]));

const badgeDefinition = (meta) => ({
  name: meta.name,
  icon: meta.icon,
  description: meta.description,
  descriptionPublic: 'Medalla secreta. ¿Cómo se conseguirá?',
  logicNotes: 'Sorpresa (functions/modules/surprises.js).',
  category: 'HIDDEN',
  type: 'custom',
  threshold: 0,
  xpReward: 25,
  active: true,
  rarity: 'epic',
  createdAt: FieldValue.serverTimestamp(),
});

const madridDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const madridWeekday = (date) => new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(date);

/** Tres valoraciones publicadas hoy, y hoy es domingo en Madrid. */
async function ateWellToday(uid) {
  const now = new Date();
  if (madridWeekday(now) !== 'Sun') return false;
  const today = madridDay(now);
  const docs = await userReviewDocs(db, 'userId', uid);
  const todays = docs.filter((d) => {
    const created = d.get('createdAt');
    return created && typeof created.toDate === 'function' && madridDay(created.toDate()) === today;
  });
  return todays.length >= 3;
}

const claimSurpriseBadge = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Entra para ganar medallas.');
  const id = String(request.data?.id || '');
  const meta = SECRET_BADGES[id];
  if (!meta) throw new HttpsError('invalid-argument', 'Esa medalla no existe.');

  const limit = await rateLimit('surpriseBadge', uid, 20, 3600);
  if (!limit.allowed) throw new HttpsError('resource-exhausted', 'Demasiados intentos.');
  if (!(await surpriseEnabled(meta.surprise))) return { awarded: false, already: false };
  if (id === 'BIEN_COMIDO' && !(await ateWellToday(uid))) return { awarded: false, already: false };

  const badgeRef = db.collection('badges').doc(id);
  const userRef = db.collection('users').doc(uid);
  const result = await db.runTransaction(async (tx) => {
    const [badgeSnap, userSnap] = await Promise.all([tx.get(badgeRef), tx.get(userRef)]);
    if (!userSnap.exists) return { awarded: false, already: false };
    const owned = Array.isArray(userSnap.get('badges')) && userSnap.get('badges').includes(id);
    if (!badgeSnap.exists) {
      tx.set(badgeRef, badgeDefinition(meta));
    } else if (badgeSnap.get('active') === false) {
      return { awarded: false, already: owned };
    }
    if (owned) return { awarded: false, already: true };
    tx.update(userRef, { badges: FieldValue.arrayUnion(id), lastBadgeEarnedAt: FieldValue.serverTimestamp() });
    return { awarded: true, already: false };
  });

  if (result.awarded) logger.info('Medalla secreta', { uid, id });
  return { ...result, name: meta.name, icon: meta.icon };
});

// ── Encuesta de la tortilla ────────────────────────────────────────────────

// Cada encuesta: su recuento en surpriseStats/{id} y sus votos en {votes}/{uid}.
const POLLS = {
  tortilla: { votes: 'tortillaVotes', surprise: 'tortilla' },
  pizza: { votes: 'pizzaVotes', surprise: 'pizzaPoll' },
};
const SIDES = new Set(['con', 'sin']);

function cellOf(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `${Math.round(lat * 10)}_${Math.round(lng * 10)}`;
}

const cleanCity = (value) => (typeof value === 'string' ? value.replace(/[<>]/g, '').trim().slice(0, 40) : '');
const tally = (v) => ({ con: Math.max(0, Number(v?.con) || 0), sin: Math.max(0, Number(v?.sin) || 0) });

const tortillaPoll = onCall(async (request) => {
  const uid = request.auth?.uid || null;
  const pollId = request.data?.poll === undefined ? 'tortilla' : request.data.poll;
  const poll = POLLS[pollId];
  if (!poll || !Object.prototype.hasOwnProperty.call(POLLS, pollId)) throw new HttpsError('invalid-argument', 'Esa encuesta no existe.');
  const pollRef = db.doc(`surpriseStats/${pollId}`);
  const side = request.data?.side;
  const cell = cellOf(request.data?.lat, request.data?.lng);
  const city = cleanCity(request.data?.city);

  if (side !== undefined && !SIDES.has(side)) throw new HttpsError('invalid-argument', 'Con o sin, no hay más.');
  if (side && !uid) throw new HttpsError('unauthenticated', 'Entra para votar.');
  if (side && !(await surpriseEnabled(poll.surprise))) throw new HttpsError('failed-precondition', 'La encuesta está cerrada.');
  if (side) {
    const limit = await rateLimit(`poll_${pollId}`, uid, 10, 3600);
    if (!limit.allowed) throw new HttpsError('resource-exhausted', 'Demasiados cambios de bando.');
  }

  const voteRef = uid ? db.collection(poll.votes).doc(uid) : null;
  return db.runTransaction(async (tx) => {
    const [pollSnap, voteSnap] = await Promise.all([tx.get(pollRef), voteRef ? tx.get(voteRef) : Promise.resolve(null)]);
    const stats = pollSnap.exists ? pollSnap.data() : {};
    const total = tally(stats);
    const cells = stats.cells && typeof stats.cells === 'object' ? stats.cells : {};
    const prev = voteSnap?.exists ? voteSnap.data() : null;
    let mine = prev && SIDES.has(prev.side) ? prev.side : null;
    let myCell = prev?.cell || cell;

    if (side && (side !== prev?.side || cell !== (prev?.cell || null))) {
      const updates = {};
      if (mine) {
        total[mine] = Math.max(0, total[mine] - 1);
        updates[mine] = FieldValue.increment(-1);
        if (prev.cell && cells[prev.cell]) {
          cells[prev.cell] = { ...cells[prev.cell], [mine]: Math.max(0, (Number(cells[prev.cell][mine]) || 0) - 1) };
          updates[`cells.${prev.cell}.${mine}`] = FieldValue.increment(-1);
        }
      }
      total[side] += 1;
      updates[side] = FieldValue.increment(1);
      myCell = cell || null;
      if (myCell) {
        const current = cells[myCell] || {};
        cells[myCell] = { ...current, [side]: (Number(current[side]) || 0) + 1 };
        updates[`cells.${myCell}.${side}`] = FieldValue.increment(1);
        if (city && !current.label) {
          cells[myCell].label = city;
          updates[`cells.${myCell}.label`] = city;
        }
      }
      updates.updatedAt = FieldValue.serverTimestamp();
      if (pollSnap.exists) tx.update(pollRef, updates);
      else tx.set(pollRef, { con: total.con, sin: total.sin, cells: Object.fromEntries(Object.entries(cells)), updatedAt: FieldValue.serverTimestamp() });
      tx.set(voteRef, { side, cell: myCell, updatedAt: FieldValue.serverTimestamp() });
      mine = side;
    }

    const zone = myCell && cells[myCell] ? { ...tally(cells[myCell]), label: cells[myCell].label || null } : null;
    return { total, zone, mine };
  });
});

// ── Repaso de madrugada ────────────────────────────────────────────────────

const fold = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Igual que frontend/src/lib/surprises.ts (isPartyFood).
const PARTY_FOOD = /pizza|kebab|durum|shawarma|doner|hamburgues|burger|perrito|hot ?dog|churro|bocadillo|bocata|nacho|taco|burrito|patatas|fritas|alita|nugget|gofre|crepe/;
const madridHour = (date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hour12: false }).format(date)) % 24;

function criteriaOf(definition) {
  if (Array.isArray(definition)) return definition.filter((c) => c && c.id);
  if (definition && typeof definition === 'object') return Object.entries(definition).map(([id, c]) => ({ ...(c || {}), id }));
  return [];
}

/** Medallas comprobables que merece cada persona hoy, según sus valoraciones y su voto. */
async function earnedFromData() {
  const [reviewsSnap, listsSnap, votesSnap] = await Promise.all([
    db.collectionGroup('reviews').get(),
    db.collection('lists').get(),
    db.collection('tortillaVotes').get(),
  ]);
  const lists = new Map(listsSnap.docs.map((d) => [d.id, d.data() || {}]));
  const earned = new Map();
  const give = (uid, id) => {
    if (!earned.has(uid)) earned.set(uid, new Set());
    earned.get(uid).add(id);
  };
  const sundays = new Map();
  const themeStats = new Map();

  reviewsSnap.forEach((docSnap) => {
    const parts = docSnap.ref.path.split('/');
    if (parts.length !== 4 || parts[0] !== 'lists') return;
    const r = docSnap.data() || {};
    // Las antiguas pueden llevar solo authorId.
    const uid = (typeof r.userId === 'string' && r.userId) || (typeof r.authorId === 'string' && r.authorId) || '';
    if (!uid) return;
    // Las de una Minilista se guardan en la lista madre, pero cuentan con la Minilista (como al valorar).
    const list = (typeof r.sublistId === 'string' && lists.get(r.sublistId)) || lists.get(parts[1]) || {};
    const created = r.createdAt && typeof r.createdAt.toDate === 'function' ? r.createdAt.toDate() : null;
    if (!themeStats.has(uid)) themeStats.set(uid, emptyThemeStats());
    addThemeStat(themeStats.get(uid), r);

    const scores = r.scores && typeof r.scores === 'object' ? r.scores : {};
    const spicy = criteriaOf(list.criteriaDefinition).some((c) => /pican/.test(fold(c.label || c.id))
      && typeof scores[c.id] === 'number' && scores[c.id] >= (typeof c.max === 'number' ? c.max : 10));
    if (spicy) give(uid, 'PALADAR_DE_HIERRO');

    if (!created) return;
    const hour = madridHour(created);
    const food = fold([list.name, r.itemName, ...(Array.isArray(r.tags) ? r.tags : [])].join(' '));
    if (hour >= 3 && hour < 7 && PARTY_FOOD.test(food)) give(uid, 'AVE_NOCTURNA');

    if (madridWeekday(created) === 'Sun') {
      const key = `${uid}|${madridDay(created)}`;
      sundays.set(key, (sundays.get(key) || 0) + 1);
      if (sundays.get(key) >= 3) give(uid, 'BIEN_COMIDO');
    }
  });

  votesSnap.forEach((d) => {
    if (SIDES.has(d.get('side'))) give(d.id, 'JUEZ_TORTILLA');
  });
  themeStats.forEach((stats, uid) => themeBadgesMet(stats).forEach((id) => give(uid, id)));
  return earned;
}

const CHECKABLE = ['BIEN_COMIDO', 'AVE_NOCTURNA', 'PALADAR_DE_HIERRO', 'JUEZ_TORTILLA'];

/** Da las medallas comprobables a quien las merece y se las quita a quien ya no. */
async function syncCheckableBadges() {
  const flags = await surpriseFlags();
  const active = [...CHECKABLE, ...THEME_IDS].filter((id) => badgeOn(flags, id));
  if (!active.length) return { given: 0, taken: 0, users: 0 };

  const earned = await earnedFromData();
  const holders = await db.collection('users').where('badges', 'array-contains-any', active).get();
  const owned = new Map(holders.docs.map((d) => [d.id, new Set((d.get('badges') || []).filter((b) => active.includes(b)))]));
  const uids = new Set([...owned.keys(), ...earned.keys()]);

  // Definición de cada medalla que se vaya a dar (por si nadie la había pedido aún).
  const badgeSnaps = await Promise.all(active.map((id) => db.collection('badges').doc(id).get()));
  const usable = new Set();
  await Promise.all(badgeSnaps.map(async (snap, i) => {
    const id = active[i];
    if (!snap.exists) {
      await snap.ref.set(definitionOf(id));
      usable.add(id);
    } else if (snap.get('active') !== false) {
      usable.add(id);
    }
  }));

  let given = 0;
  let taken = 0;
  const writer = db.bulkWriter();
  for (const uid of uids) {
    const has = owned.get(uid) || new Set();
    const should = new Set([...(earned.get(uid) || [])].filter((id) => usable.has(id)));
    const add = [...should].filter((id) => !has.has(id));
    const remove = [...has].filter((id) => !(earned.get(uid) || new Set()).has(id));
    if (!add.length && !remove.length) continue;
    const ref = db.collection('users').doc(uid);
    if (!owned.has(uid)) {
      // Quien no tenía ninguna: solo si la cuenta existe.
      const snap = await ref.get();
      if (!snap.exists) continue;
    }
    if (add.length) writer.update(ref, { badges: FieldValue.arrayUnion(...add), lastBadgeEarnedAt: FieldValue.serverTimestamp() });
    if (remove.length) writer.update(ref, { badges: FieldValue.arrayRemove(...remove) });
    given += add.length;
    taken += remove.length;
  }
  await writer.close();
  const result = { given, taken, users: uids.size };
  logger.info('Repaso de medallas secretas y de temas', result);
  return result;
}

const reviewSecretBadges = onSchedule({ schedule: '40 4 * * *', timeZone: TIME_ZONE, timeoutSeconds: 300 }, async () => {
  await syncCheckableBadges();
});

const recalcSecretBadges = onCall({ timeoutSeconds: 300 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Entra primero.');
  await assertJefeAccess(uid);
  const result = await syncCheckableBadges();
  await writeAuditLog(uid, 'recalcSecretBadges', result);
  return result;
});

/** Al publicar (y al abrir la app): da al momento las medallas de temas que ya se cumplen. */
const claimThemeBadges = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Entra para ganar medallas.');
  const limit = await rateLimit('themeBadges', uid, 30, 3600);
  if (!limit.allowed) throw new HttpsError('resource-exhausted', 'Demasiados intentos.');
  if (!ladderOn(await surpriseFlags())) return { awarded: [] };

  const stats = emptyThemeStats();
  // Las antiguas pueden llevar solo authorId: se miran las dos y cada una cuenta una vez.
  const [byUser, byAuthor] = await Promise.all([userReviewDocs(db, 'userId', uid), userReviewDocs(db, 'authorId', uid)]);
  const docs = [...new Map([...byUser, ...byAuthor].map((d) => [d.ref.path, d])).values()];
  docs.forEach((d) => {
    const parts = d.ref.path.split('/');
    if (parts.length === 4 && parts[0] === 'lists') addThemeStat(stats, d.data() || {});
  });
  const met = themeBadgesMet(stats);
  if (!met.length) return { awarded: [] };

  const userRef = db.collection('users').doc(uid);
  const [userSnap, ...badgeSnaps] = await Promise.all([userRef.get(), ...met.map((id) => db.collection('badges').doc(id).get())]);
  if (!userSnap.exists) return { awarded: [] };
  const owned = new Set(Array.isArray(userSnap.get('badges')) ? userSnap.get('badges') : []);
  const add = [];
  await Promise.all(badgeSnaps.map(async (snap, i) => {
    const id = met[i];
    if (!snap.exists) await snap.ref.set(definitionOf(id));
    else if (snap.get('active') === false) return;
    if (!owned.has(id)) add.push(id);
  }));
  if (!add.length) return { awarded: [] };
  await userRef.update({ badges: FieldValue.arrayUnion(...add), lastBadgeEarnedAt: FieldValue.serverTimestamp() });
  logger.info('Medallas de temas', { uid, add });
  return { awarded: add.map((id) => ({ id, name: badgeMeta(id).name, icon: badgeMeta(id).icon, theme: THEME_BADGES[id].theme })) };
});

module.exports = { claimSurpriseBadge, tortillaPoll, reviewSecretBadges, recalcSecretBadges, claimThemeBadges };
