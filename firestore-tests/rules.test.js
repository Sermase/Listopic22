// Tests de reglas de Firestore para Listopic.
//
// Cada bloque "V*" cubre una vulnerabilidad: los casos ❌ son ataques que las
// reglas deben denegar y los casos ✅ son flujos reales de la app (payloads
// copiados del frontend) que no deben romperse.
//
// Ejecutar: npm test  (arranca el emulador de Firestore en el puerto 8181)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-listopic-rules';
const BUCKET_URL = 'https://firebasestorage.googleapis.com/v0/b/listopic.firebasestorage.app/o/places%2Fp2%2Fbob%2F1.jpg?alt=media';

let env;

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const jefe = () => as('jefe', { admin: true });
// Usuario anónimo de Pachote (mismo proyecto de Firebase).
const anonUser = (uid) => as(uid, { firebase: { sign_in_provider: 'anonymous' } });

const criteria = {
  carne: { type: 'slider', label: 'Carne', min: 0, max: 10, step: 0.5, ponderable: true },
  pan: { type: 'slider', label: 'Pan', min: 0, max: 10, step: 0.5, ponderable: true },
};

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (path, data) => setDoc(doc(db, path), data);
    await put('users/alice', { username: 'alice', displayName: 'Alice', reviewsCount: 2, level: 1, xp: 10, badges: [] });
    await put('users/bob', { username: 'bob', displayName: 'Bob', reviewsCount: 0, level: 1, xp: 0, badges: [] });
    await put('users/carol', { username: 'carol', displayName: 'Carol' });
    await put('users/jefe', { username: 'jefe', userType: ['jefe'] });

    await put('lists/pub', {
      name: 'Hamburguesas', userId: 'alice', isPublic: true, visibility: 'public', publicAccess: 'writer',
      editors: [], guests: [], criteriaDefinition: criteria, reviewCount: 2, averageRating: 8.5,
      criteriaAverages: { carne: 8.5 }, itemCount: 2,
    });
    await put('lists/priv', {
      name: 'Burgers con amigos', userId: 'alice', isPublic: false, visibility: 'private', publicAccess: 'reader',
      parentListId: 'pub', isSublist: true, editors: ['carol'], guests: ['gina'], criteriaDefinition: criteria,
      reviewCount: 1, averageRating: 9,
    });

    // B1: listas con pesos y valoraciones, y una madre con una Minilista.
    await put('lists/pesada', {
      name: 'Croquetas', userId: 'alice', isPublic: true, visibility: 'public', publicAccess: 'reader',
      editors: ['carol'], guests: [], criteriaDefinition: criteria, scoringWeights: { carne: 1, pan: 1 },
      reviewCount: 4, averageRating: 8,
    });
    await put('lists/vacia', {
      name: 'Gyozas', userId: 'alice', isPublic: true, visibility: 'public', publicAccess: 'reader',
      editors: [], guests: [], criteriaDefinition: criteria, scoringWeights: { carne: 1, pan: 1 }, reviewCount: 0,
    });
    await put('lists/miniPesada', {
      name: 'Croquetas · Valladolid', userId: 'bob', isPublic: true, visibility: 'public', publicAccess: 'reader',
      parentListId: 'pesada', isSublist: true, editors: [], guests: [],
      criteriaDefinition: { ...criteria, relleno: { type: 'slider', label: 'Relleno', ponderable: true } },
      scoringWeights: { carne: 1, pan: 1, relleno: 1 }, reviewCount: 0,
    });
    // V10: madre privada con una Minilista privada.
    await put('lists/madrePriv', {
      name: 'Tortillas secretas', userId: 'alice', isPublic: false, visibility: 'private', publicAccess: 'reader',
      editors: [], guests: [], criteriaDefinition: criteria, reviewCount: 0,
    });
    await put('lists/miniDePriv', {
      name: 'Tortillas · León', userId: 'bob', isPublic: false, visibility: 'private', publicAccess: 'reader',
      parentListId: 'madrePriv', isSublist: true, editors: [], guests: [], criteriaDefinition: criteria, reviewCount: 0,
    });

    const review = (extra) => ({
      userId: 'alice', authorId: 'alice', itemName: 'Smash', placeId: 'p1', overallRating: 8,
      scores: { carne: 8, pan: 8 }, comment: 'Muy buena', commentsCount: 0,
      reactionCounts: { like: 0, dislike: 0 }, createdAt: new Date(), ...extra,
    });
    await put('lists/pub/reviews/rPub', review({ listId: 'pub', visibility: 'public' }));
    await put('lists/pub/reviews/rPrivSub', review({ listId: 'pub', sublistId: 'priv', parentListId: 'pub', visibility: 'private' }));
    await put('lists/priv/reviews/rPrivDirect', review({ listId: 'priv', visibility: 'private' }));
    await put('lists/priv/reviews/rPrivDirect/comments/c1', { userId: 'alice', userName: 'Alice', text: 'secreto', createdAt: new Date() });
    await put('lists/priv/reviews/rPrivDirect/reactions/alice', { reaction: 'like', userId: 'alice', createdAt: new Date() });

    await put('places/p1', {
      name: 'Bar Manolo', reviewsCount: 3, averageRating: 8, followersCount: 1,
      userPhotoUrl: 'https://firebasestorage.googleapis.com/v0/b/listopic.firebasestorage.app/o/reviews%2Falice%2F1.jpg?alt=media',
    });
    await put('places/p2', { name: 'Playa', reviewsCount: 0, averageRating: null, followersCount: 0 });

    await put('chats/c1', { participants: ['alice', 'bob'], type: 'private', unreadCount: { alice: 0, bob: 0 } });
    await put('chats/g1', { participants: ['alice', 'bob'], type: 'group', groupName: 'Comilona', joinCode: 'abcd2345ef', unreadCount: {} });
    await put('chatInvites/abcd2345ef', { chatId: 'g1', groupName: 'Comilona', byName: 'Alice' });
    await put('chats/ajeno', { participants: ['bob', 'carol'], type: 'group', groupName: 'Otro', unreadCount: {} });
    // Pachote: «Riaño» está enlazado al grupo g1 (alice y bob); «Piso» es de un usuario anónimo.
    await put('pachoteGroups/riano', { name: 'Riaño', owner: 'alice', inviteToken: 'tok_riano_1234567890', chatId: 'g1', members: [], households: [] });
    await put('pachoteGroups/riano/access/alice', { role: 'admin', memberId: 'm1', joined: 1 });
    await put('pachoteGroups/riano/movs/x1', { id: 'x1', desc: 'Cena', amount: 4800, payer: 'm:m1' });
    await put('pachoteGroups/piso', { name: 'Piso', owner: 'anon1', inviteToken: 'tok_piso_12345678901', members: [], households: [] });
    await put('pachoteGroups/piso/access/anon1', { role: 'admin', memberId: null, joined: 1 });
    await put('chats/c1/messages/hola', { text: 'Hola', senderId: 'alice', type: 'text', readBy: ['alice'] });
    await put('chats/c1/messages/inv', {
      text: '🍽️ Te invito', senderId: 'alice', type: 'invite', readBy: ['alice'],
      invite: { itemName: 'Bravas', placeName: 'Docamar', when: 1000, responses: {} },
    });
    await put('chats/c1/messages/fechas', {
      text: '📅', senderId: 'alice', type: 'datepoll', readBy: ['alice'],
      datePoll: { options: [{ id: 'd1', when: 1000 }, { id: 'd2', when: 2000 }], votes: {} },
    });
    await put('chats/c1/messages/encuesta', {
      text: '🗳️', senderId: 'alice', type: 'poll', readBy: ['alice'],
      poll: { question: '¿Dónde comemos?', options: [{ id: 'o1', itemName: 'a', placeName: 'A' }, { id: 'o2', itemName: 'b', placeName: 'B' }], votes: {} },
    });

    await put('users/alice/archives/a1', { name: 'Quiero ir', itemCount: 1 });
    await put('users/alice/archives/a1/items/place_p1', { itemId: 'p1', type: 'place', name: 'Bar Manolo', route: '/place/p1' });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

// ---------------------------------------------------------------------------
describe('V1 · Listas privadas: seguir no da acceso', () => {
  it('❌ bob se auto-sigue la lista privada y la lee', async () => {
    const db = as('bob');
    await assertSucceeds(setDoc(doc(db, 'users/bob/followingLists/priv'), { followedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db, 'lists/priv')));
  });

  it('❌ bob sigue a alice y lee su lista privada', async () => {
    const db = as('bob');
    await assertSucceeds(setDoc(doc(db, 'users/bob/following/alice'), { type: 'user', followedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db, 'lists/priv')));
  });

  it('❌ tras seguir, bob lee reseñas, comentarios y reacciones privadas', async () => {
    const db = as('bob');
    await setDoc(doc(db, 'users/bob/following/alice'), { type: 'user' });
    await setDoc(doc(db, 'users/bob/followingLists/priv'), { followedAt: serverTimestamp() });
    await assertFails(getDoc(doc(db, 'lists/priv/reviews/rPrivDirect')));
    await assertFails(getDoc(doc(db, 'lists/pub/reviews/rPrivSub')));
    await assertFails(getDoc(doc(db, 'lists/priv/reviews/rPrivDirect/comments/c1')));
    await assertFails(getDoc(doc(db, 'lists/priv/reviews/rPrivDirect/reactions/alice')));
  });

  it('✅ dueña, editora, invitada y jefe leen la lista privada', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'lists/priv')));
    await assertSucceeds(getDoc(doc(as('carol'), 'lists/priv')));
    await assertSucceeds(getDoc(doc(as('gina'), 'lists/priv')));
    await assertSucceeds(getDoc(doc(jefe(), 'lists/priv')));
    await assertSucceeds(getDoc(doc(as('gina'), 'lists/pub/reviews/rPrivSub')));
    await assertSucceeds(getDoc(doc(as('carol'), 'lists/priv/reviews/rPrivDirect/comments/c1')));
  });

  it('✅ anónimo lee lista pública, reseña pública y el feed público', async () => {
    const db = anon();
    await assertSucceeds(getDoc(doc(db, 'lists/pub')));
    await assertSucceeds(getDoc(doc(db, 'lists/pub/reviews/rPub')));
    await assertSucceeds(getDocs(query(collectionGroup(db, 'reviews'), where('visibility', '==', 'public'), limit(20))));
  });

  it('✅ feed de Siguiendo (reseñas públicas de gente seguida)', async () => {
    const db = as('bob');
    await assertSucceeds(getDocs(query(
      collectionGroup(db, 'reviews'),
      where('visibility', '==', 'public'),
      where('userId', 'in', ['alice']),
      limit(10),
    )));
  });

  it('✅ bob sigue una lista pública', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'users/bob/followingLists/pub'), { followedAt: serverTimestamp() }));
  });
});

// ---------------------------------------------------------------------------
describe('V2 · Un editor no puede apropiarse de la lista', () => {
  it('❌ carol se pone como dueña', async () => {
    await assertFails(updateDoc(doc(as('carol'), 'lists/priv'), { userId: 'carol' }));
  });

  it('❌ carol cambia editores, invitados, visibilidad o acceso público', async () => {
    const db = as('carol');
    await assertFails(updateDoc(doc(db, 'lists/priv'), { editors: ['carol', 'mallory'] }));
    await assertFails(updateDoc(doc(db, 'lists/priv'), { guests: [] }));
    await assertFails(updateDoc(doc(db, 'lists/priv'), { visibility: 'public', isPublic: true }));
    await assertFails(updateDoc(doc(db, 'lists/priv'), { publicAccess: 'writer' }));
  });

  it('✅ carol edita nombre, descripción, criterios y etiquetas', async () => {
    await assertSucceeds(updateDoc(doc(as('carol'), 'lists/priv'), {
      name: 'Burgers del curro', description: 'Nuevo', criteriaDefinition: criteria, availableTags: ['🍔 Smash'],
      isPublic: false, publicAccess: 'reader', visibility: 'private',
    }));
  });

  it('✅ alice cambia la visibilidad de su lista (EditListForm)', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/priv'), {
      name: 'Burgers con amigos', description: '', isPublic: true, publicAccess: 'reader', visibility: 'public',
      criteriaDefinition: criteria, availableTags: [],
    }));
  });

  it('❌ alice transfiere su lista a otro usuario o la cambia de lista madre', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'lists/priv'), { userId: 'bob' }));
    await assertFails(updateDoc(doc(as('alice'), 'lists/priv'), { parentListId: 'otra' }));
  });

  it('✅ jefe corrige métricas de una lista', async () => {
    await assertSucceeds(updateDoc(doc(jefe(), 'lists/pub'), { reviewCount: 3, averageRating: 8.2 }));
  });

  it('✅ alice gestiona editores e invitados (ShareListModal)', async () => {
    const db = as('alice');
    await assertSucceeds(updateDoc(doc(db, 'lists/priv'), { editors: arrayUnion('bob') }));
    await assertSucceeds(updateDoc(doc(db, 'lists/priv'), { guests: arrayUnion('dave') }));
  });
});

// ---------------------------------------------------------------------------
describe('V3 · Métricas de lista solo las escribe el servidor', () => {
  const baseList = (extra = {}) => ({
    name: 'Tortillas', description: '', categoryId: 'comida', userId: 'alice', isPublic: true,
    visibility: 'public', publicAccess: 'reader', parentListId: null, authorName: 'Alice',
    mainImageUrl: '', photoUrl: '', criteriaDefinition: criteria, availableTags: [], fixedTags: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    itemCount: 0, groupedItemsCount: 0, viewCount: 0, likes: 0, followersCount: 0, commentsCount: 0,
    reviewCount: 0, averageRating: 0, criteriaAverages: {}, criteriaAveragesUpdatedAt: serverTimestamp(),
    reactions: {}, ...extra,
  });

  it('❌ crear una lista con métricas infladas', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'lists/fake1'), baseList({ reviewCount: 999 })));
    await assertFails(setDoc(doc(db, 'lists/fake2'), baseList({ averageRating: 9.9 })));
    await assertFails(setDoc(doc(db, 'lists/fake3'), baseList({ followersCount: 5000 })));
  });

  it('✅ crear lista con el payload real de CreateListForm', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'lists/real1'), baseList()));
  });

  it('✅ crear minilista con el payload real de CreateSublistPage', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'lists/mini1'), {
      name: 'Hamburguesas · Valladolid', description: '', categoryId: 'comida', parentListId: 'pub',
      isSublist: true, userId: 'bob', isPublic: true, visibility: 'public', publicAccess: 'reader',
      editors: [], authorName: 'Bob', photoUrl: '', mainImageUrl: '', criteriaDefinition: criteria,
      availableTags: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      itemCount: 0, viewCount: 0, likes: 0, followersCount: 0, averageRating: 0,
      criteriaAverages: {}, criteriaAveragesUpdatedAt: serverTimestamp(),
    }));
  });

  it('❌ alice modifica métricas de su propia lista', async () => {
    const db = as('alice');
    await assertFails(updateDoc(doc(db, 'lists/pub'), { averageRating: 10 }));
    await assertFails(updateDoc(doc(db, 'lists/pub'), { reviewCount: increment(1) }));
    await assertFails(updateDoc(doc(db, 'lists/pub'), { criteriaAverages: { carne: 10 } }));
    await assertFails(updateDoc(doc(db, 'lists/pub'), { itemCount: 50 }));
  });
});

// ---------------------------------------------------------------------------
describe('V4 · Un usuario no puede ascenderse a sí mismo', () => {
  it('❌ alice se escribe insignias, xp, nivel, contadores o rol', async () => {
    const db = as('alice');
    const ref = doc(db, 'users/alice');
    await assertFails(updateDoc(ref, { badges: ['CRITICO_SUPREMO'] }));
    await assertFails(updateDoc(ref, { xp: 999999 }));
    await assertFails(updateDoc(ref, { level: 50 }));
    await assertFails(updateDoc(ref, { followersCount: 100000 }));
    await assertFails(updateDoc(ref, { reviewsCount: increment(-1) }));
    await assertFails(updateDoc(ref, { listsCount: increment(1) }));
    await assertFails(updateDoc(ref, { userType: ['jefe'] }));
  });

  it('✅ alice edita su perfil, preferencias y estado de notificaciones', async () => {
    const db = as('alice');
    const ref = doc(db, 'users/alice');
    await assertSucceeds(updateDoc(ref, { bio: 'Crítica de hamburguesas', displayName: 'Alice B.' }));
    await assertSucceeds(setDoc(ref, { themePreference: 'light' }, { merge: true }));
    await assertSucceeds(updateDoc(ref, { mapLayerPreference: 'dark' }));
    await assertSucceeds(updateDoc(ref, { notifiedLevel: 2, notifiedBadges: arrayUnion('PRIMERA') }));
  });

  it('✅/❌ preferencias de uso: solo interruptores conocidos', async () => {
    const ref = doc(as('alice'), 'users/alice');
    await assertSucceeds(setDoc(ref, { uxPreferences: { glutenFree: true, vegetarian: false, showHelpTips: true } }, { merge: true }));
    await assertFails(setDoc(ref, { uxPreferences: { glutenFree: 'sí' } }, { merge: true }));
    await assertFails(setDoc(ref, { uxPreferences: { isAdmin: true } }, { merge: true }));
    await assertSucceeds(setDoc(ref, { uxPreferences: { vegan: true, allergens: ['gluten', 'huevo'], stepFree: true, accessibleRestroom: false, petFriendly: true } }, { merge: true }));
    await assertSucceeds(setDoc(ref, { uxPreferences: { lactoseFree: true, contribute: ['glutenFree', 'stepFree'] } }, { merge: true }));
    await assertFails(setDoc(ref, { uxPreferences: { allergens: 'gluten' } }, { merge: true }));
    await assertFails(setDoc(ref, { uxPreferences: { allergens: Array.from({ length: 15 }, (_, i) => `a${i}`) } }, { merge: true }));
  });

  it('✅/❌ dieta por defecto de una lista: solo vegetarian o none', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'lists/dietList'), { name: 'Tortillas', visibility: 'public', isPublic: true, userId: 'alice' });
    });
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/dietList'), { defaultDiet: 'vegetarian' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/dietList'), { defaultDiet: 'none' }));
    await assertFails(updateDoc(doc(as('alice'), 'lists/dietList'), { defaultDiet: 'carnivoro' }));
  });

  it('✅/❌ «Apto para»: respuestas privadas solo de reseñas propias', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'lists/l1'), { name: 'L', visibility: 'public', userId: 'alice' });
      await setDoc(doc(db, 'lists/l1/reviews/r1'), { userId: 'alice', placeId: 'p1', itemName: 'Bravas' });
      await setDoc(doc(db, 'lists/l1/reviews/r2'), { userId: 'bob', placeId: 'p1', itemName: 'Bravas' });
    });
    const ok = { listId: 'l1', answers: { glutenFree: 'yes', stepFree: 'no' }, updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/aptReports/r1'), ok));
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice/aptReports/r1')));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/aptReports/r1')));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/aptReports/r2'), ok));
    await assertFails(setDoc(doc(as('bob'), 'users/alice/aptReports/r1'), ok));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/aptReports/r1'), { ...ok, answers: { glutenFree: 'mucho' } }));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/aptReports/r1'), { ...ok, answers: { isAdmin: 'yes' } }));
    await assertSucceeds(deleteDoc(doc(as('alice'), 'users/alice/aptReports/r1')));
  });

  it('✅ alta de perfil con el payload real de UserProfileService', async () => {
    await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), {
      username: 'newbie', usernameLower: 'newbie', displayName: 'Newbie', name: '', surnames: '',
      location: '', residence: '', bio: '', email: 'n@example.com', emailLowerCase: 'n@example.com',
      defaultDistanceKm: 2, updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      usernameLockedAt: serverTimestamp(),
    }, { merge: true }));
  });

  it('❌ alta de perfil ya con insignias o nivel', async () => {
    await assertFails(setDoc(doc(as('cheater'), 'users/cheater'), { username: 'cheater', level: 99 }));
  });
});

// ---------------------------------------------------------------------------
describe('V11 · Aceptación de condiciones (RGPD): fecha del servidor y edad', () => {
  const acceptance = (overrides = {}) => ({
    legalAcceptance: { version: '2026-10-05', acceptedAt: serverTimestamp(), ageConfirmed: true, method: 'prompt', ...overrides },
  });

  it('✅ alta con el payload real de LegalService (registro con email)', async () => {
    await assertSucceeds(setDoc(doc(as('nuevo'), 'users/nuevo'), acceptance({ method: 'signup' }), { merge: true }));
  });

  it('✅ un usuario existente acepta la versión nueva', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice'), acceptance(), { merge: true }));
  });

  it('❌ fecha inventada, sin confirmar la edad o con campos extra', async () => {
    const ref = doc(as('alice'), 'users/alice');
    await assertFails(setDoc(ref, acceptance({ acceptedAt: new Date('2020-01-01') }), { merge: true }));
    await assertFails(setDoc(ref, acceptance({ ageConfirmed: false }), { merge: true }));
    await assertFails(setDoc(ref, acceptance({ method: 'jefe' }), { merge: true }));
    await assertFails(setDoc(ref, { legalAcceptance: { version: '2026-10-05', acceptedAt: serverTimestamp(), ageConfirmed: true, method: 'prompt', extra: 1 } }, { merge: true }));
  });

  it('❌ nadie escribe la aceptación de otra persona (tampoco un jefe)', async () => {
    await assertFails(setDoc(doc(as('bob'), 'users/alice'), acceptance(), { merge: true }));
    await assertFails(setDoc(doc(jefe(), 'users/alice'), acceptance(), { merge: true }));
  });
});

// ---------------------------------------------------------------------------
describe('V5 · Lugares: nada de Business Pro gratis ni notas falsas', () => {
  const fallbackPlace = (extra = {}) => ({
    name: 'Casa Pepe', name_normalized: 'casa pepe', address: 'C/ Mayor 1', address_normalized: 'c/ mayor 1',
    location: { latitude: 41.6, longitude: -4.7 }, coordinates: { latitude: 41.6, longitude: -4.7 },
    googlePlaceId: 'pNew', types: ['restaurant'], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    followersCount: 0, reviewsCount: 0, averageRating: null, ...extra,
  });

  it('❌ crear un lugar con campos de negocio o Stripe', async () => {
    const db = as('bob');
    await assertFails(setDoc(doc(db, 'places/pNew'), fallbackPlace({ businessTier: 'pro' })));
    await assertFails(setDoc(doc(db, 'places/pNew'), fallbackPlace({ businessOwnerUserId: 'bob', businessManagerIds: ['bob'] })));
    await assertFails(setDoc(doc(db, 'places/pNew'), fallbackPlace({ stripeSubscriptionId: 'sub_1' })));
  });

  it('❌ crear un lugar con contadores inflados', async () => {
    const db = as('bob');
    await assertFails(setDoc(doc(db, 'places/pNew'), fallbackPlace({ reviewsCount: 50 })));
    await assertFails(setDoc(doc(db, 'places/pNew'), fallbackPlace({ averageRating: 9.9 })));
  });

  it('✅ crear lugar con el payload de respaldo de AddReviewForm', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'places/pNew'), fallbackPlace()));
  });

  it('❌ cambiar nota, contadores o sincronización de un lugar existente', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'places/p1'), { averageRating: 1 }));
    await assertFails(updateDoc(doc(db, 'places/p1'), { reviewsCount: increment(-1) }));
    await assertFails(updateDoc(doc(db, 'places/p1'), { lastGoogleSync: serverTimestamp() }));
  });

  it('❌ sobrescribir una portada existente o usar un dominio externo', async () => {
    const db = as('bob');
    await assertFails(setDoc(doc(db, 'places/p1'), { userPhotoUrl: BUCKET_URL, lastUserPhotoAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, 'places/p2'), { userPhotoUrl: 'https://evil.example/x.jpg', lastUserPhotoAt: serverTimestamp() }, { merge: true }));
  });

  it('✅ poner portada de nuestro Storage en un lugar sin portada', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'places/p2'), { userPhotoUrl: BUCKET_URL, lastUserPhotoAt: serverTimestamp() }, { merge: true }));
  });

  it('✅ anónimo lee un lugar', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'places/p1')));
  });

  it('✅ jefe corrige un lugar', async () => {
    await assertSucceeds(updateDoc(doc(jefe(), 'places/p1'), { averageRating: 8.1 }));
  });
});

// ---------------------------------------------------------------------------
describe('V6 · Chats: no se puede expulsar ni reescribir participantes', () => {
  it('❌ bob expulsa a alice o reescribe la lista', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'chats/c1'), { participants: ['bob'] }));
    await assertFails(updateDoc(doc(db, 'chats/c1'), { participants: ['bob', 'mallory'] }));
  });

  it('❌ alguien ajeno lee el chat', async () => {
    await assertFails(getDoc(doc(as('mallory'), 'chats/c1')));
  });

  it('✅ bob envía mensaje y actualiza la vista previa (ChatService)', async () => {
    const db = as('bob');
    await assertSucceeds(setDoc(doc(db, 'chats/c1/messages/m1'), {
      text: 'Hola', senderId: 'bob', createdAt: serverTimestamp(), type: 'text', readBy: ['bob'],
    }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1'), {
      lastMessage: 'Hola', lastMessageTimestamp: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1'), { 'unreadCount.bob': 0 }));
  });

  it('✅ bob añade un participante (convierte el chat en grupo)', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'chats/c1'), {
      participants: arrayUnion('carol'), 'unreadCount.carol': 0, type: 'group', groupName: 'Nuevo Grupo',
      updatedAt: serverTimestamp(),
    }));
  });
});

// ---------------------------------------------------------------------------
describe('V6b · Chat con vida: reacciones, invitaciones y encuestas', () => {
  it('✅ bob reacciona, cambia y quita su reacción', async () => {
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/hola'), { 'reactions.bob': '😋' }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/hola'), { 'reactions.bob': '🔥' }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/hola'), { 'reactions.bob': deleteField() }));
  });

  it('❌ bob reacciona por alice, reescribe el texto o alguien ajeno reacciona', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'chats/c1/messages/hola'), { 'reactions.alice': '🤢' }));
    await assertFails(updateDoc(doc(as('bob'), 'chats/c1/messages/hola'), { text: 'Adiós' }));
    await assertFails(updateDoc(doc(as('bob'), 'chats/c1/messages/hola'), { 'reactions.bob': 'x'.repeat(40) }));
    await assertFails(updateDoc(doc(as('mallory'), 'chats/c1/messages/hola'), { 'reactions.mallory': '😂' }));
  });

  it('✅ bob responde a la invitación (voy / otra fecha)', async () => {
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/inv'), { 'invite.responses.bob': { status: 'yes', at: 1 } }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/inv'), { 'invite.responses.bob': { status: 'other', proposedAt: 2000, at: 2 } }));
  });

  it('❌ bob responde por alice, cambia la fecha o el plato', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/inv'), { 'invite.responses.alice': { status: 'no', at: 1 } }));
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/inv'), { 'invite.when': 5000 }));
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/inv'), { 'invite.itemName': 'Nada' }));
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/inv'), { 'invite.responses.bob': { status: 'quizás', at: 1 } }));
  });

  it('✅ bob está en duda; ✅ alice cancela; ❌ bob cancela la de alice', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'chats/c1/messages/inv'), { 'invite.responses.bob': { status: 'maybe', at: 5 } }));
    await assertFails(updateDoc(doc(as('bob'), 'chats/c1/messages/inv'), { 'invite.cancelled': true }));
    await assertFails(updateDoc(doc(as('alice'), 'chats/c1/messages/inv'), { 'invite.cancelled': 'sí' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'chats/c1/messages/inv'), { 'invite.cancelled': true }));
  });

  it('✅ bob fija una quedada en el chat y bob deja un aviso en gris', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'chats/c1'), { 'events.inv': { title: 'Bravas', when: 1000 } }));
    await assertSucceeds(setDoc(doc(as('bob'), 'chats/c1/messages/aviso'), {
      text: '✅ Bob va', senderId: 'bob', type: 'event', readBy: ['bob'], event: { kind: 'yes', inviteId: 'inv' },
    }));
  });

  it('✅ alice (quien invita) acepta otra fecha y reinicia las respuestas', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'chats/c1/messages/inv'), {
      'invite.when': 2000, 'invite.responses': { bob: { status: 'yes', at: 3 } },
    }));
  });

  it('✅ bob vota y quita su voto; ❌ vota por alice o cambia las opciones', async () => {
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/encuesta'), { 'poll.votes.bob': 'o2' }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/encuesta'), { 'poll.votes.bob': deleteField() }));
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/encuesta'), { 'poll.votes.alice': 'o1' }));
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/encuesta'), { 'poll.options': [] }));
  });
});

// ---------------------------------------------------------------------------
describe('V6d · ¿Cuándo quedamos? (tipo Doodle)', () => {
  it('✅ bob marca y desmarca sus fechas; ❌ marca por alice, cambia fechas o un extraño vota', async () => {
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/fechas'), { 'datePoll.votes.bob.d1': 'yes' }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/fechas'), { 'datePoll.votes.bob.d2': 'maybe' }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/fechas'), { 'datePoll.votes.bob.d1': deleteField() }));
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/fechas'), { 'datePoll.votes.alice.d1': 'yes' }));
    await assertFails(updateDoc(doc(db, 'chats/c1/messages/fechas'), { 'datePoll.options': [] }));
    await assertFails(updateDoc(doc(as('mallory'), 'chats/c1/messages/fechas'), { 'datePoll.votes.mallory.d1': 'yes' }));
  });

  it('✅ bob la cierra con la quedada una vez; ❌ no se vuelve a cambiar', async () => {
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'chats/c1/messages/fechas'), { 'datePoll.inviteId': 'inv' }));
    await assertFails(updateDoc(doc(as('alice'), 'chats/c1/messages/fechas'), { 'datePoll.inviteId': 'otra' }));
  });
});

// ---------------------------------------------------------------------------
describe('V6c · Enlace de invitación a un grupo', () => {
  const join = (db, extra = {}) => updateDoc(doc(db, 'chats/g1'), { participants: arrayUnion('carol'), joinedWith: 'abcd2345ef', ...extra });

  it('✅ cualquiera lee la vista previa con el código, ❌ nadie lista los enlaces', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'chatInvites/abcd2345ef')));
    await assertFails(getDocs(collection(anon(), 'chatInvites')));
    await assertFails(getDocs(collection(as('carol'), 'chatInvites')));
  });

  it('✅ carol entra ella sola con el código y deja su aviso', async () => {
    const db = as('carol');
    await assertSucceeds(join(db, { updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'chats/g1/messages/hola-carol'), {
      text: '👋 Carol se ha unido con el enlace', senderId: 'carol', type: 'event', readBy: ['carol'], event: { kind: 'joined' },
    }));
  });

  it('❌ carol sin código, con otro código, metiendo a otra persona o tocando más cosas', async () => {
    const db = as('carol');
    await assertFails(updateDoc(doc(db, 'chats/g1'), { participants: arrayUnion('carol') }));
    await assertFails(updateDoc(doc(db, 'chats/g1'), { participants: arrayUnion('carol'), joinedWith: 'zzzz9999zz' }));
    await assertFails(updateDoc(doc(db, 'chats/g1'), { participants: arrayUnion('carol', 'mallory'), joinedWith: 'abcd2345ef' }));
    await assertFails(join(db, { groupName: 'Mío' }));
    await assertFails(join(db, { joinCode: 'otro123456' }));
    await assertFails(getDoc(doc(db, 'chats/g1')));
  });

  it('❌ no se entra con enlace a un chat privado ni a un grupo sin enlace', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'chats/c1'), { joinCode: 'abcd2345ef' }, { merge: true });
      await setDoc(doc(ctx.firestore(), 'chats/g2'), { participants: ['alice'], type: 'group', groupName: 'Sin enlace' });
    });
    await assertFails(updateDoc(doc(as('carol'), 'chats/c1'), { participants: arrayUnion('carol'), joinedWith: 'abcd2345ef' }));
    await assertFails(updateDoc(doc(as('carol'), 'chats/g2'), { participants: arrayUnion('carol'), joinedWith: '' }));
  });

  it('🙋 con aprobación: carol no entra sola, deja su solicitud y bob la ve y la acepta', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'chats/g1'), { joinApproval: true }, { merge: true });
    });
    const carol = as('carol');
    await assertFails(join(carol));
    await assertFails(setDoc(doc(carol, 'chats/g1/joinRequests/carol'), { name: 'Carol', code: 'zzzz9999zz', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('mallory'), 'chats/g1/joinRequests/carol'), { name: 'Carol', code: 'abcd2345ef', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(carol, 'chats/g1/joinRequests/carol'), { name: 'Carol', code: 'abcd2345ef', at: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(carol, 'chats/g1/joinRequests/carol')));
    await assertFails(getDocs(collection(carol, 'chats/g1/joinRequests')));
    await assertFails(updateDoc(doc(carol, 'chats/g1/joinRequests/carol'), { name: 'Otra' }));
    const bob = as('bob');
    await assertSucceeds(getDocs(collection(bob, 'chats/g1/joinRequests')));
    await assertSucceeds(updateDoc(doc(bob, 'chats/g1'), { participants: arrayUnion('carol') }));
    await assertSucceeds(deleteDoc(doc(bob, 'chats/g1/joinRequests/carol')));
  });

  it('❌ no se pide entrar a un grupo sin aprobación', async () => {
    await assertFails(setDoc(doc(as('carol'), 'chats/g1/joinRequests/carol'), { name: 'Carol', code: 'abcd2345ef', at: serverTimestamp() }));
  });

  it('✅ bob cambia el enlace (el viejo se borra); ❌ carol crea un enlace a un grupo ajeno', async () => {
    const db = as('bob');
    const batch = writeBatch(db);
    batch.update(doc(db, 'chats/g1'), { joinCode: 'nuevo23456' });
    batch.set(doc(db, 'chatInvites/nuevo23456'), { chatId: 'g1', groupName: 'Comilona', byName: 'Bob', createdAt: serverTimestamp() });
    batch.delete(doc(db, 'chatInvites/abcd2345ef'));
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(doc(as('carol'), 'chatInvites/robado1234'), { chatId: 'g1', groupName: 'Comilona', byName: 'Carol' }));
    await assertFails(setDoc(doc(as('bob'), 'chatInvites/noesel1234'), { chatId: 'g1', groupName: 'Comilona', byName: 'Bob' }));
  });
});

// ---------------------------------------------------------------------------
describe('V7 · Contadores de reseña: solo ±1 y sin tocar el contenido ajeno', () => {
  it('❌ bob pone 9999 me gusta o suma +5 comentarios', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'lists/pub/reviews/rPub'), { reactionCounts: { like: 9999, dislike: 0 } }));
    await assertFails(updateDoc(doc(db, 'lists/pub/reviews/rPub'), { commentsCount: 5 }));
  });

  it('✅ bob suma +1 al contador de comentarios de una reseña pública', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'lists/pub/reviews/rPub'), { commentsCount: increment(1) }));
  });

  it('✅ al borrar un comentario se resta 1', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'lists/pub/reviews/rPub'), { commentsCount: 2 }));
    await assertSucceeds(updateDoc(doc(as('bob'), 'lists/pub/reviews/rPub'), { commentsCount: increment(-1) }));
  });

  it('✅ bob suma +1 me gusta', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'lists/pub/reviews/rPub'), { 'reactionCounts.like': increment(1) }));
  });

  it('❌ bob edita el comentario o la nota de la reseña de alice', async () => {
    const db = as('bob');
    await assertFails(updateDoc(doc(db, 'lists/pub/reviews/rPub'), { comment: 'Mala' }));
    await assertFails(updateDoc(doc(db, 'lists/pub/reviews/rPub'), { overallRating: 1 }));
  });

  it('✅ bob da me gusta y comenta en una reseña pública', async () => {
    const db = as('bob');
    await assertSucceeds(setDoc(doc(db, 'lists/pub/reviews/rPub/reactions/bob'), { reaction: 'like', userId: 'bob', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'lists/pub/reviews/rPub/comments/cb'), { userId: 'bob', userName: 'Bob', userPhoto: '', text: '¡Top!', createdAt: serverTimestamp() }));
  });
});

// ---------------------------------------------------------------------------
describe('V8 · Guardarraíles de regresión', () => {
  it('✅ alice gestiona sus colecciones; ❌ bob no puede verlas', async () => {
    await assertSucceeds(getDocs(collection(as('alice'), 'users/alice/archives')));
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/archives/a1/items/place_p2'), { itemId: 'p2', type: 'place', name: 'Playa', route: '/place/p2', placeId: 'p2' }));
    await assertFails(getDocs(collection(as('bob'), 'users/alice/archives')));
  });

  it('❌ consulta de reseñas de un usuario con límite 200; ✅ con 100', async () => {
    const db = as('bob');
    await assertFails(getDocs(query(collectionGroup(db, 'reviews'), where('userId', '==', 'alice'), where('visibility', '==', 'public'), limit(200))));
    await assertSucceeds(getDocs(query(collectionGroup(db, 'reviews'), where('userId', '==', 'alice'), where('visibility', '==', 'public'), limit(100))));
  });

  it('✅ alice crea una reseña en una lista pública abierta', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'lists/pub/reviews/rNew'), {
      listId: 'pub', userId: 'bob', authorId: 'bob', visibility: 'public', itemName: 'Clásica',
      itemNameLower: 'clásica', placeId: 'p1', overallRating: 7.5, scores: { carne: 7, pan: 8 },
      comment: '', reactionCounts: { like: 0, dislike: 0 }, commentsCount: 0, createdAt: serverTimestamp(),
    }));
  });

  it('❌ reseña pública dentro de una minilista privada', async () => {
    await assertFails(setDoc(doc(as('carol'), 'lists/pub/reviews/rLeak'), {
      listId: 'pub', sublistId: 'priv', parentListId: 'pub', userId: 'carol', visibility: 'public',
      itemName: 'Smash', placeId: 'p1', overallRating: 9, scores: { carne: 9, pan: 9 },
      createdAt: serverTimestamp(),
    }));
  });

  it('✅ reserva de nombre de usuario propio', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'usernameClaims/bobby'), { uid: 'bob', usernameLower: 'bobby', username: 'Bobby' }));
  });

  it('✅ alice borra su propia reseña', async () => {
    await assertSucceeds(deleteDoc(doc(as('alice'), 'lists/pub/reviews/rPub')));
  });
});

// ---------------------------------------------------------------------------
describe('V12 · Consultas de reseñas: las privadas de una Minilista no se cuelan', () => {
  // rPrivSub es privada, de la Minilista privada «priv», y se guarda en la Lista
  // madre pública «pub». Leerla de una en una ya fallaba; en consulta, no.
  it('❌ bob lista la subcolección de la Lista madre sin filtrar por visibilidad', async () => {
    const reviews = collection(as('bob'), 'lists/pub/reviews');
    await assertFails(getDocs(reviews));
    await assertFails(getDocs(query(reviews, limit(20))));
    await assertFails(getDocs(query(reviews, where('userId', '==', 'alice'), limit(20))));
  });

  it('❌ bob pide por collectionGroup las reseñas de la Lista madre o de alice', async () => {
    const group = collectionGroup(as('bob'), 'reviews');
    await assertFails(getDocs(query(group, where('listId', '==', 'pub'), limit(50))));
    await assertFails(getDocs(query(group, where('userId', '==', 'alice'), limit(50))));
  });

  it('✅ bob y anónimo listan las públicas (Lista, perfil y filtro por Lista)', async () => {
    await assertSucceeds(getDocs(query(collection(anon(), 'lists/pub/reviews'), where('visibility', '==', 'public'))));
    await assertSucceeds(getDocs(query(collection(as('bob'), 'lists/pub/reviews'), where('userId', '==', 'alice'), where('visibility', '==', 'public'), limit(20))));
    await assertSucceeds(getDocs(query(collectionGroup(as('bob'), 'reviews'), where('listId', '==', 'pub'), where('visibility', '==', 'public'), limit(50))));
  });

  it('✅ carol (editora de la Minilista) lista sus privadas en la Lista madre (useListDetails)', async () => {
    await assertSucceeds(getDocs(query(collection(as('carol'), 'lists/pub/reviews'), where('sublistId', '==', 'priv'), where('visibility', '==', 'private'))));
    await assertFails(getDocs(query(collection(as('bob'), 'lists/pub/reviews'), where('sublistId', '==', 'priv'), where('visibility', '==', 'private'))));
  });

  it('✅ miembros de una lista privada la listan entera; ❌ bob no', async () => {
    await assertSucceeds(getDocs(collection(as('carol'), 'lists/priv/reviews')));
    await assertSucceeds(getDocs(query(collection(as('gina'), 'lists/priv/reviews'), where('visibility', '==', 'private'))));
    await assertFails(getDocs(collection(as('bob'), 'lists/priv/reviews')));
  });

  it('✅ alice lista las suyas (perfil propio, archivo) y un jefe todo', async () => {
    await assertSucceeds(getDocs(query(collection(as('alice'), 'lists/pub/reviews'), where('userId', '==', 'alice'))));
    await assertSucceeds(getDocs(query(collectionGroup(as('alice'), 'reviews'), where('userId', '==', 'alice'), limit(100))));
    await assertSucceeds(getDocs(collection(jefe(), 'lists/pub/reviews')));
  });
});

// ---------------------------------------------------------------------------
describe('V9 · Criterios y pesos (B1): Minilistas comparables y nota bloqueada', () => {
  const extra = { type: 'slider', label: 'Bechamel', min: 0, max: 10, step: 0.5, ponderable: true };
  const miniPayload = (criteriaDefinition, extraFields = {}) => ({
    name: 'Croquetas · León', description: '', categoryId: 'comida', parentListId: 'pesada', isSublist: true,
    userId: 'bob', isPublic: true, visibility: 'public', publicAccess: 'reader', editors: [], authorName: 'Bob',
    photoUrl: '', mainImageUrl: '', criteriaDefinition, availableTags: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), itemCount: 0, viewCount: 0, likes: 0,
    followersCount: 0, averageRating: 0, criteriaAverages: {}, criteriaAveragesUpdatedAt: serverTimestamp(),
    ...extraFields,
  });

  it('✅ crear Minilista con todos los criterios de la madre y pesos (CreateSublistPage)', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'lists/miniOk'), miniPayload(
      { ...criteria, bechamel: extra }, { scoringWeights: { carne: 1, pan: 1, bechamel: 1 } },
    )));
  });

  it('❌ crear Minilista sin algún criterio de la madre', async () => {
    await assertFails(setDoc(doc(as('bob'), 'lists/miniMal'), miniPayload({ carne: criteria.carne })));
  });

  it('❌ quitar a una Minilista un criterio heredado', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'lists/miniPesada'), {
      criteriaDefinition: { carne: criteria.carne, relleno: { type: 'slider', label: 'Relleno', ponderable: true } },
    }));
  });

  it('✅ renombrar y añadir criterios en una lista con valoraciones (no cambian notas)', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/pesada'), {
      criteriaDefinition: { ...criteria, carne: { ...criteria.carne, label: 'Carne (jugosidad)' }, bechamel: extra },
      scoringWeights: { carne: 1, pan: 1, bechamel: 1 },
    }));
  });

  it('❌ con valoraciones: quitar un criterio', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'lists/pesada'), {
      criteriaDefinition: { carne: criteria.carne }, scoringWeights: { carne: 1 },
    }));
  });

  it('❌ con valoraciones: cambiar si un criterio cuenta (peso) o su peso', async () => {
    const db = as('alice');
    await assertFails(updateDoc(doc(db, 'lists/pesada'), { scoringWeights: { carne: 1, pan: 0 } }));
    await assertFails(updateDoc(doc(db, 'lists/pesada'), { scoringWeights: { carne: 3, pan: 1 } }));
    await assertFails(updateDoc(doc(as('carol'), 'lists/pesada'), { scoringWeights: { carne: 1, pan: 0 } }));
  });

  it('✅ sin valoraciones: el dueño cambia criterios y pesos libremente', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/vacia'), {
      criteriaDefinition: { carne: criteria.carne }, scoringWeights: { carne: 1 },
    }));
  });

  it('✅ lista antigua con valoraciones y sin pesos: primera edición guarda los pesos (EditListForm)', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/pub'), {
      name: 'Hamburguesas', criteriaDefinition: { ...criteria, carne: { ...criteria.carne, order: 0 } },
      scoringWeights: { carne: 1, pan: 1 },
    }));
  });

  it('✅ jefe (migración del servidor) puede cambiar pesos con valoraciones', async () => {
    await assertSucceeds(updateDoc(doc(jefe(), 'lists/pesada'), { scoringWeights: { carne: 2, pan: 1 } }));
  });
});

describe('V10 · Una Minilista no es más pública que su Lista madre', () => {
  const mini = (extra) => ({
    name: 'Tortillas · Bilbao', description: '', categoryId: 'comida', parentListId: 'madrePriv', isSublist: true,
    userId: 'bob', publicAccess: 'reader', editors: [], authorName: 'Bob', photoUrl: '', mainImageUrl: '',
    criteriaDefinition: criteria, availableTags: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    itemCount: 0, viewCount: 0, likes: 0, followersCount: 0, averageRating: 0, criteriaAverages: {},
    criteriaAveragesUpdatedAt: serverTimestamp(), ...extra,
  });

  it('❌ crear Minilista pública con la madre privada', async () => {
    await assertFails(setDoc(doc(as('bob'), 'lists/miniPub'), mini({ isPublic: true, visibility: 'public' })));
  });

  it('✅ crear Minilista privada con la madre privada', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'lists/miniOkPriv'), mini({ isPublic: false, visibility: 'private' })));
  });

  it('❌ hacer pública una Minilista de madre privada (también un jefe)', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'lists/miniDePriv'), { isPublic: true, visibility: 'public' }));
    await assertFails(updateDoc(doc(jefe(), 'lists/miniDePriv'), { isPublic: true, visibility: 'public' }));
  });

  it('✅ editar otra cosa de esa Minilista sigue permitido', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'lists/miniDePriv'), { name: 'Tortillas · León centro' }));
  });

  it('✅ con la madre pública, la Minilista puede pasar a pública', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/priv'), { isPublic: true, visibility: 'public' }));
  });

  it('✅ la madre puede pasar a privada (el servidor cierra sus Minilistas)', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'lists/pesada'), { isPublic: false, visibility: 'private' }));
  });
});

describe('Beta de planes: el interés y la prueba gratis solo los escribe el servidor', () => {
  it('❌ bob se apunta a mano en planInterest o lee el de otros', async () => {
    await assertFails(setDoc(doc(as('bob'), 'planInterest/premium_user_bob'), { plan: 'premium', userId: 'bob' }));
    await assertFails(getDocs(collection(as('bob'), 'planInterest')));
  });

  it('❌ bob se activa premium a sí mismo', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'users/bob'), { premium: { active: true, source: 'trial' } }));
  });

  it('✅ un jefe lee los registros de interés', async () => {
    await assertSucceeds(getDocs(collection(jefe(), 'planInterest')));
  });
});

describe('Impulsos: las compras y el saldo solo los escribe el servidor', () => {
  it('❌ bob se apunta una compra pagada o lee las de otros', async () => {
    await assertFails(setDoc(doc(as('bob'), 'impulsePurchases/cs_test_1'), { placeId: 'p1', impulses: 100000, status: 'paid' }));
    await assertFails(getDocs(collection(as('bob'), 'impulsePurchases')));
  });

  it('✅ un jefe lee las compras de impulsos', async () => {
    await assertSucceeds(getDocs(collection(jefe(), 'impulsePurchases')));
  });
});

describe('Developer: las colas «Pendientes / Resueltos» las lee el jefe y nadie más', () => {
  const seedQueues = () => env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const at = (d) => new Date(`2026-10-0${d}T10:00:00Z`);
    await setDoc(doc(db, 'businessClaims/c1'), { userId: 'alice', placeId: 'p1', status: 'pending', createdAt: at(1) });
    await setDoc(doc(db, 'businessClaims/c2'), { userId: 'carol', placeId: 'p1', status: 'rejected', createdAt: at(2) });
    await setDoc(doc(db, 'itemProposals/ip1'), { createdBy: 'alice', placeId: 'p1', status: 'pending', createdAt: at(1) });
    await setDoc(doc(db, 'itemProposals/ip2'), { createdBy: 'alice', placeId: 'p1', status: 'applying', reviewedBy: 'jefe', createdAt: at(2) });
    await setDoc(doc(db, 'sponsoredPlacements/sp1'), { createdBy: 'alice', placeId: 'p1', status: 'requested', createdAt: at(1), endsAt: '2026-10-01' });
    await setDoc(doc(db, 'sponsoredPlacements/sp2'), { createdBy: 'alice', placeId: 'p1', status: 'active', createdAt: at(2), endsAt: '2026-10-30' });
    await setDoc(doc(db, 'sponsoredItemSpotlights/ss1'), { createdBy: 'alice', placeId: 'p1', status: 'requested', createdAt: at(1) });
    await setDoc(doc(db, 'reports/r1'), { reportedBy: 'bob', status: 'resolved', createdAt: at(1), resolvedAt: at(2), resolvedBy: 'jefe', resolvedClosedStatus: 'resolved' });
    await setDoc(doc(db, 'adminAuditLog/a1'), { action: 'businessClaim.review', actorUid: 'jefe', details: { claimId: 'c2' }, createdAt: at(2) });
  });

  const queues = (db) => [
    query(collection(db, 'businessClaims'), where('status', '==', 'pending'), orderBy('createdAt', 'asc'), limit(50)),
    query(collection(db, 'businessClaims'), where('status', 'in', ['approved', 'rejected']), orderBy('createdAt', 'desc'), limit(25)),
    // La bandeja de propuestas incluye las que se están aplicando (adminQueues: pendingStatuses).
    query(collection(db, 'itemProposals'), where('status', 'in', ['pending', 'applying']), orderBy('createdAt', 'asc'), limit(50)),
    query(collection(db, 'sponsoredPlacements'), where('status', '==', 'requested'), orderBy('createdAt', 'asc'), limit(50)),
    query(collection(db, 'sponsoredItemSpotlights'), where('status', '==', 'requested'), orderBy('createdAt', 'asc'), limit(50)),
    query(collection(db, 'reports'), where('status', 'in', ['resolved', 'rejected']), orderBy('createdAt', 'desc'), limit(25)),
  ];

  it('✅ un jefe lista y cuenta cada cola por estado, y lee el historial de una solicitud', async () => {
    await seedQueues();
    const db = jefe();
    for (const q of queues(db)) {
      await assertSucceeds(getDocs(q));
      await assertSucceeds(getCountFromServer(q));
    }
    await assertSucceeds(getCountFromServer(query(collection(db, 'sponsoredPlacements'), where('status', 'in', ['active', 'requested']), where('endsAt', '<', '2026-10-07'))));
    await assertSucceeds(getDocs(query(collection(db, 'adminAuditLog'), where('details.claimId', '==', 'c2'))));
    await assertSucceeds(getDocs(query(collection(db, 'adminAuditLog'), where('action', 'in', ['businessPlan.manualGrant', 'businessPlan.expired']), orderBy('createdAt', 'desc'), limit(50))));
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
  });

  it('❌ bob no puede listar ni contar las colas de otros', async () => {
    await seedQueues();
    const db = as('bob');
    for (const q of queues(db)) {
      await assertFails(getDocs(q));
      await assertFails(getCountFromServer(q));
    }
    await assertFails(getDocs(query(collection(db, 'adminAuditLog'), where('details.claimId', '==', 'c2'))));
  });

  it('✅ un jefe reabre un reporte borrando quién y cuándo lo resolvió; ❌ bob no', async () => {
    await seedQueues();
    const reopen = { status: 'pending', resolvedAt: deleteField(), resolvedBy: deleteField(), resolvedClosedStatus: deleteField() };
    await assertFails(updateDoc(doc(as('bob'), 'reports/r1'), reopen));
    await assertSucceeds(updateDoc(doc(jefe(), 'reports/r1'), reopen));
  });
});

describe('V12 · Pachote en el mismo Firebase: anónimos solo en Pachote', () => {
  it('❌ un anónimo no escribe ni lee nada privado de Listopic', async () => {
    const db = anonUser('anon1');
    await assertFails(setDoc(doc(db, 'users/anon1'), { username: 'anon1', displayName: 'Anon' }));
    await assertFails(setDoc(doc(db, 'lists/nueva'), { name: 'Bravas', userId: 'anon1', isPublic: true }));
    await assertFails(setDoc(doc(db, 'chats/nuevo'), { participants: ['anon1', 'bob'], type: 'private' }));
    await assertFails(getDoc(doc(db, 'chats/c1')));
    await assertFails(updateDoc(doc(db, 'chats/g1'), { participants: ['alice', 'bob', 'anon1'], joinedWith: 'abcd2345ef' }));
    // Control: el mismo uid con cuenta de verdad sí puede.
    await assertSucceeds(setDoc(doc(as('anon1'), 'chats/nuevo'), { participants: ['anon1', 'bob'], type: 'private' }));
    // Lo público se sigue leyendo como sin sesión.
    await assertSucceeds(getDoc(doc(db, 'lists/pub')));
  });

  it('✅ un anónimo crea su grupo de Pachote, su acceso y su lista de grupos', async () => {
    const db = anonUser('anon2');
    await assertSucceeds(setDoc(doc(db, 'pachoteGroups/viaje'), { name: 'Viaje', owner: 'anon2', inviteToken: 'tok_viaje_123456789', members: [], households: [] }));
    await assertSucceeds(setDoc(doc(db, 'pachoteGroups/viaje/access/anon2'), { role: 'admin', memberId: null, joined: 1 }));
    await assertSucceeds(setDoc(doc(db, 'pachoteUsers/anon2'), { groups: { viaje: { joined: 1 } } }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'pachoteGroups/viaje/movs/g1'), { id: 'g1', desc: 'Gasolina', amount: 6000 }));
    await assertFails(getDoc(doc(db, 'pachoteUsers/anon1')));
  });

  it('✅ entra con el link vigente como editor; ❌ con uno viejo o como administrador', async () => {
    const db = anonUser('anon3');
    await assertFails(setDoc(doc(db, 'pachoteGroups/piso/access/anon3'), { role: 'editor', token: 'viejo_123456789012', joined: 1 }));
    await assertFails(setDoc(doc(db, 'pachoteGroups/piso/access/anon3'), { role: 'admin', token: 'tok_piso_12345678901', joined: 1 }));
    await assertFails(getDoc(doc(db, 'pachoteGroups/piso')));
    await assertSucceeds(setDoc(doc(db, 'pachoteGroups/piso/access/anon3'), { role: 'editor', token: 'tok_piso_12345678901', memberId: null, joined: 1 }));
    await assertSucceeds(getDoc(doc(db, 'pachoteGroups/piso')));
    await assertSucceeds(setDoc(doc(db, 'pachoteGroups/piso/movs/m9'), { id: 'm9', desc: 'Luz', amount: 3000 }));
    await assertFails(updateDoc(doc(db, 'pachoteGroups/piso'), { inviteToken: 'mio_1234567890123456' }));
    await assertSucceeds(updateDoc(doc(db, 'pachoteGroups/piso'), { summary: { v: 1, spent: 3000 } }));
  });

  it('✅ los del chat enlazado leen la ficha y entran sin link; ❌ los de fuera no', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'pachoteGroups/riano')));
    await assertFails(getDocs(collection(as('bob'), 'pachoteGroups/riano/movs')));
    await assertFails(getDoc(doc(as('carol'), 'pachoteGroups/riano')));
    await assertFails(setDoc(doc(as('carol'), 'pachoteGroups/riano/access/carol'), { role: 'editor', joined: 1 }));
    await assertFails(setDoc(doc(as('bob'), 'pachoteGroups/riano/access/bob'), { role: 'admin', joined: 1 }));
    await assertSucceeds(setDoc(doc(as('bob'), 'pachoteGroups/riano/access/bob'), { role: 'editor', memberId: 'm2', joined: 1 }));
    await assertSucceeds(getDocs(collection(as('bob'), 'pachoteGroups/riano/movs')));
  });

  it('✅ crear cuentas desde un chat propio; ❌ enlazar a un chat ajeno o que un editor cambie el enlace', async () => {
    const nuevo = { name: 'Cañas', owner: 'alice', inviteToken: 'tok_canas_123456789', chatId: 'g1', members: [], households: [] };
    await assertSucceeds(setDoc(doc(as('alice'), 'pachoteGroups/canas'), nuevo));
    await assertSucceeds(setDoc(doc(as('alice'), 'pachoteGroups/canas/access/alice'), { role: 'admin', memberId: null, joined: 1 }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'chats/g1'), { 'pachote.canas': { name: 'Cañas' } }));
    await assertFails(setDoc(doc(as('alice'), 'pachoteGroups/otras'), { ...nuevo, chatId: 'ajeno' }));
    await assertFails(setDoc(doc(anonUser('anon4'), 'pachoteGroups/otras'), { ...nuevo, owner: 'anon4', chatId: 'g1' }));
    await assertFails(updateDoc(doc(as('alice'), 'pachoteGroups/riano'), { chatId: 'ajeno' }));
    await assertFails(updateDoc(doc(as('alice'), 'pachoteGroups/piso'), { name: 'x' }));
    await assertSucceeds(setDoc(doc(as('bob'), 'pachoteGroups/riano/access/bob'), { role: 'editor', memberId: null, joined: 1 }));
    await assertFails(updateDoc(doc(as('bob'), 'pachoteGroups/riano'), { chatId: deleteField() }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'pachoteGroups/riano'), { chatId: deleteField() }));
  });
});
