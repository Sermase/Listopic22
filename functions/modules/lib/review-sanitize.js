'use strict';

// Lo que el autor de una reseña no debe poder decidir aunque escriba a mano en
// Firestore: notas fuera de 0–10 y su nombre, foto o insignia en la tarjeta.
// Las reglas ya frenan la nota general; las notas por criterio (`scores`) son un
// mapa que las reglas no pueden recorrer, y el autor se compara con su perfil.

const clamp10 = (v) => Math.min(10, Math.max(0, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const TRUSTED_PHOTO = [
  /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/listopic\.(firebasestorage\.app|appspot\.com)\//,
  /^https:\/\/lh\d\.googleusercontent\.com\//,
];

const asTypes = (value) => (Array.isArray(value) ? value : (typeof value === 'string' && value ? [value] : []))
  .filter((t) => typeof t === 'string').slice().sort();

function profileName(user) {
  const username = typeof user.username === 'string' ? user.username.trim() : '';
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  return username || displayName || 'Anónimo';
}

/**
 * Devuelve el parche a aplicar a la reseña (vacío si está bien).
 * @param {object} review datos de la reseña
 * @param {object|null} user users/{uid} del autor (null si ya no existe: no se toca la autoría)
 */
function reviewSanitizePatch(review, user) {
  const patch = {};
  if (!review) return patch;

  for (const key of ['overallRating', 'rating']) {
    if (isNum(review[key]) && clamp10(review[key]) !== review[key]) patch[key] = clamp10(review[key]);
  }

  if (review.scores && typeof review.scores === 'object' && !Array.isArray(review.scores)) {
    let changed = false;
    const scores = { ...review.scores };
    for (const [k, v] of Object.entries(scores)) {
      if (isNum(v) && clamp10(v) !== v) { scores[k] = clamp10(v); changed = true; }
    }
    if (changed) patch.scores = scores;
  }

  if (user) {
    const name = profileName(user);
    if (typeof review.authorName === 'string' && review.authorName !== name) patch.authorName = name;
    if (typeof review.authorUsername === 'string' && review.authorUsername !== name) patch.authorUsername = name;

    if ('authorUserType' in review
      && JSON.stringify(asTypes(review.authorUserType)) !== JSON.stringify(asTypes(user.userType))) {
      patch.authorUserType = user.userType ?? [];
    }

    const ownPhoto = typeof user.photoUrl === 'string' ? user.photoUrl : (typeof user.photoURL === 'string' ? user.photoURL : '');
    for (const key of ['authorPhoto', 'authorPhotoUrl']) {
      const photo = review[key];
      if (typeof photo === 'string' && photo && photo !== ownPhoto && !TRUSTED_PHOTO.some((re) => re.test(photo))) {
        patch[key] = ownPhoto;
      }
    }
  }

  return patch;
}

module.exports = { reviewSanitizePatch };
