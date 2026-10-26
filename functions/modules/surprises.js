'use strict';

// Sorpresas (huevos de Pascua). Dos llamadas:
// - claimSurpriseBadge: da una medalla secreta. Las define este archivo (se
//   crean en `badges` la primera vez). «Bien comido» se comprueba aquí; el resto
//   son bromas que pasan en el móvil y se fían de él.
// - tortillaPoll: la encuesta eterna «¿con o sin cebolla?». Un voto por cuenta
//   (se puede cambiar) y la zona como celda de 0,1° (~10 km), nunca el punto exacto.
// - reviewSecretBadges (cada madrugada): repasa las medallas que se pueden
//   comprobar con los datos (Bien comido, Ave nocturna, Paladar de hierro, Juez
//   de la tortilla): las da a quien las merece y las quita a quien las perdió
//   (p. ej. borró la valoración). Las de minijuegos no se pueden comprobar: se quedan.
const { onCall, HttpsError } = require('./https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { rateLimit } = require('./lib/auth');
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

async function surpriseFlags() {
  const snap = await db.doc('config/app').get();
  const flags = snap.exists ? snap.get('surprises') : null;
  return flags && typeof flags === 'object' ? flags : {};
}

const flagOn = (flags, surprise) => flags[surprise] !== false && flags.secretBadges !== false;

async function surpriseEnabled(surprise) {
  return flagOn(await surpriseFlags(), surprise);
}

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

const POLL_REF = () => db.doc('surpriseStats/tortilla');
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
  const side = request.data?.side;
  const cell = cellOf(request.data?.lat, request.data?.lng);
  const city = cleanCity(request.data?.city);

  if (side !== undefined && !SIDES.has(side)) throw new HttpsError('invalid-argument', 'Con o sin, no hay más.');
  if (side && !uid) throw new HttpsError('unauthenticated', 'Entra para votar.');
  if (side && !(await surpriseEnabled('tortilla'))) throw new HttpsError('failed-precondition', 'La encuesta está cerrada.');
  if (side) {
    const limit = await rateLimit('tortillaPoll', uid, 10, 3600);
    if (!limit.allowed) throw new HttpsError('resource-exhausted', 'Demasiados cambios de bando.');
  }

  const voteRef = uid ? db.collection('tortillaVotes').doc(uid) : null;
  return db.runTransaction(async (tx) => {
    const [pollSnap, voteSnap] = await Promise.all([tx.get(POLL_REF()), voteRef ? tx.get(voteRef) : Promise.resolve(null)]);
    const poll = pollSnap.exists ? pollSnap.data() : {};
    const total = tally(poll);
    const cells = poll.cells && typeof poll.cells === 'object' ? poll.cells : {};
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
      if (pollSnap.exists) tx.update(POLL_REF(), updates);
      else tx.set(POLL_REF(), { con: total.con, sin: total.sin, cells: Object.fromEntries(Object.entries(cells)), updatedAt: FieldValue.serverTimestamp() });
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

  reviewsSnap.forEach((docSnap) => {
    const parts = docSnap.ref.path.split('/');
    if (parts.length !== 4 || parts[0] !== 'lists') return;
    const r = docSnap.data() || {};
    const uid = typeof r.userId === 'string' ? r.userId : '';
    if (!uid) return;
    const list = lists.get(parts[1]) || {};
    const created = r.createdAt && typeof r.createdAt.toDate === 'function' ? r.createdAt.toDate() : null;

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
  return earned;
}

const CHECKABLE = ['BIEN_COMIDO', 'AVE_NOCTURNA', 'PALADAR_DE_HIERRO', 'JUEZ_TORTILLA'];

const reviewSecretBadges = onSchedule({ schedule: '40 4 * * *', timeZone: TIME_ZONE, timeoutSeconds: 300 }, async () => {
  const flags = await surpriseFlags();
  const active = CHECKABLE.filter((id) => flagOn(flags, SECRET_BADGES[id].surprise));
  if (!active.length) return;

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
      await snap.ref.set(badgeDefinition(SECRET_BADGES[id]));
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
  logger.info('Repaso de medallas secretas', { given, taken, users: uids.size });
});

module.exports = { claimSurpriseBadge, tortillaPoll, reviewSecretBadges };
