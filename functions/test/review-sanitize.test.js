const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewSanitizePatch } = require('../modules/lib/review-sanitize');

const ana = { username: 'ana', displayName: 'Ana', userType: ['basico'], photoUrl: 'https://firebasestorage.googleapis.com/v0/b/listopic.firebasestorage.app/o/a.jpg' };

test('una reseña normal no se toca', () => {
  assert.deepEqual(reviewSanitizePatch({
    overallRating: 8.5, scores: { carne: 9, pan: 0, picante: 'mucho' },
    authorName: 'ana', authorUserType: ['basico'], authorPhoto: ana.photoUrl,
  }, ana), {});
});

test('notas fuera de 0–10 se recortan', () => {
  assert.deepEqual(reviewSanitizePatch({ overallRating: 999, scores: { carne: 999, pan: -50, sal: 7 } }, null), {
    overallRating: 10, scores: { carne: 10, pan: 0, sal: 7 },
  });
});

test('nombre, insignia y foto falsos vuelven a los del perfil', () => {
  assert.deepEqual(reviewSanitizePatch({
    authorName: 'Alice', authorUsername: 'Alice', authorUserType: ['jefe', 'critico'], authorPhoto: 'https://evil.example/a.png',
  }, ana), { authorName: 'ana', authorUsername: 'ana', authorUserType: ['basico'], authorPhoto: ana.photoUrl });
});

test('foto de Google y userType en texto valen', () => {
  assert.deepEqual(reviewSanitizePatch({
    authorName: 'ana', authorUserType: 'basico', authorPhoto: 'https://lh3.googleusercontent.com/a/xyz',
  }, { ...ana, userType: 'basico' }), {});
});

test('sin perfil (cuenta borrada) no se toca la autoría', () => {
  assert.deepEqual(reviewSanitizePatch({ authorName: 'Usuario eliminado', authorUserType: [] }, null), {});
});
