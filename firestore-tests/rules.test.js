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
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-listopic-rules';
const BUCKET_URL = 'https://firebasestorage.googleapis.com/v0/b/listopic.firebasestorage.app/o/places%2Fp2%2Fbob%2F1.jpg?alt=media';

let env;

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const jefe = () => as('jefe', { admin: true });

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
