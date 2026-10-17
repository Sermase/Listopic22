// Vista previa de enlaces (/s/...) y su imagen (/s/og/...).
const test = require('node:test');
const assert = require('node:assert/strict');
const firestoreAdmin = require('firebase-admin/firestore');
const { FakeFirestore } = require('./helpers/fake-firestore');

const db = new FakeFirestore();
firestoreAdmin.getFirestore = () => db;

const { ssrMeta } = require('../modules/ssr-meta');
const { renderShareImage, isAllowedImageUrl } = require('../modules/share-image');

const call = (path) => new Promise((resolve) => {
  const res = {
    headers: {},
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { resolve({ status: this.statusCode, headers: this.headers, body }); },
  };
  ssrMeta({ path, method: 'GET', headers: {}, get: () => undefined }, res);
});

const ogImage = (html) => (html.match(/property="og:image" content="([^"]+)"/) || [])[1];

test.before(async () => {
  await db.collection('places').doc('p1').set({ name: 'Casa Lucio', city: 'Madrid', averageRating: 9.2, publicHumanReviewsCount: 3 });
  await db.collection('lists').doc('pub').set({ name: 'Pizzas', isPublic: true, reviewCount: 2, averageRating: 8 });
  await db.collection('lists').doc('priv').set({ name: 'Secreta', isPublic: false });
  await db.collection('lists').doc('pub').collection('reviews').doc('r1').set({
    listId: 'pub', placeId: 'p1', placeName: 'Casa Lucio', placeCity: 'Madrid', itemName: 'Huevos rotos',
    overallRating: 9.5, visibility: 'public', userId: 'u1', comment: 'Brutales',
  });
  await db.collection('lists').doc('priv').collection('reviews').doc('r2').set({
    listId: 'priv', placeId: 'p1', itemName: 'Rabo', overallRating: 7, visibility: 'private', userId: 'u1', comment: 'Secreto',
  });
  await db.collection('publicProfiles').doc('u1').set({ displayName: 'Ser', username: 'ser', reviewsCount: 12, followersCount: 3 });
});

test('sitio: imagen generada con versión', async () => {
  const { body } = await call('/s/place/p1');
  assert.match(ogImage(body), /^https:\/\/listopic\.es\/s\/og\/place\/p1\?v=[0-9a-f]{10}$/);
  assert.match(body, /og:image:width" content="1200"/);
});

test('valoración pública: autor, plato, sitio y ciudad', async () => {
  const { body } = await call('/s/review/pub/r1');
  assert.match(body, /<title>Ser ha valorado Huevos rotos · 9\.5<\/title>/);
  assert.match(body, /en Casa Lucio, Madrid/);
  assert.match(ogImage(body), /\/s\/og\/review\/pub\/r1\?v=/);
  assert.match(body, /url=https:\/\/listopic\.es\/group\/p1\/Huevos%20rotos/);
});

test('valoración privada: sin autor ni comentario', async () => {
  const { body } = await call('/s/review/priv/r2');
  assert.doesNotMatch(body, /Ser|Secreto/);
  assert.match(ogImage(body), /\/s\/og\/review\/priv\/r2\?v=/, 'cae a la tarjeta del plato');
});

test('perfil y lista privada', async () => {
  const profile = await call('/s/profile/u1');
  assert.match(profile.body, /Ser \(@ser\) · Listopic/);
  assert.match(profile.body, /12 valoraciones · 3 seguidores/);
  const priv = await call('/s/list/priv');
  assert.doesNotMatch(priv.body, /Secreta/);
  assert.equal(ogImage(priv.body), 'https://listopic.es/s/og/app');
});

test('/s/og devuelve un JPEG 1200×630', async () => {
  const { status, headers, body } = await call('/s/og/review/pub/r1');
  assert.equal(status, 200);
  assert.equal(headers['Content-Type'], 'image/jpeg');
  assert.equal(body[0], 0xff);
  assert.equal(body[1], 0xd8);
  const generic = await call('/s/og/app');
  assert.equal(generic.status, 200);
});

test('solo descarga fotos de hosts permitidos (nada de la API de Places)', async () => {
  assert.equal(isAllowedImageUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg'), true);
  assert.equal(isAllowedImageUrl('https://lh3.googleusercontent.com/abc'), true);
  assert.equal(isAllowedImageUrl('https://maps.googleapis.com/maps/api/place/photo?key=x'), false);
  assert.equal(isAllowedImageUrl('https://places.googleapis.com/v1/places/x/photos/y/media'), false);
  assert.equal(isAllowedImageUrl('http://firebasestorage.googleapis.com/a.jpg'), false);
  assert.equal(isAllowedImageUrl('https://169.254.169.254/'), false);
  const jpeg = await renderShareImage('list', { title: 'Sin fotos', top: [{ name: 'A', score: 8 }] });
  assert.ok(jpeg.length > 1000);
});
