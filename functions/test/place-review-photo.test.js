const test = require('node:test');
const assert = require('node:assert/strict');
const { pickReviewPhoto } = require('../modules/lib/place-review-photo');

test('elige la foto de la valoración pública con mejor nota', () => {
  const url = pickReviewPhoto([
    { visibility: 'public', overallRating: 6, photoUrl: 'https://x/a.jpg' },
    { visibility: 'public', overallRating: 9, photoUrl: 'https://x/b.jpg' },
    { visibility: 'public', overallRating: 10 },
  ]);
  assert.equal(url, 'https://x/b.jpg');
});

test('nunca usa una valoración privada ni fotos de Google', () => {
  assert.equal(pickReviewPhoto([
    { visibility: 'private', overallRating: 10, photoUrl: 'https://x/secreta.jpg' },
    { visibility: 'public', overallRating: 8, photoUrl: 'https://maps.googleapis.com/maps/api/place/photo?ref=1' },
  ]), null);
});

test('acepta photoUrls y descarta lo que no es una URL', () => {
  assert.equal(pickReviewPhoto([
    { visibility: 'public', photoUrl: 'data:image/png;base64,xx' },
    { visibility: 'public', photoUrls: ['', 'https://x/c.jpg'] },
  ]), 'https://x/c.jpg');
  assert.equal(pickReviewPhoto(undefined), null);
});
