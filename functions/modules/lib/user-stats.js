// functions/modules/lib/user-stats.js
// Recuento desde cero de lo que cuentan las medallas (valoraciones, fotos, sitios y
// listas de cada persona). Lo usa «Recalcular TODO» (gamification.js): los contadores
// guardados en users/{uid} se desvían con el tiempo (borrados masivos, cambios de
// autor, ediciones a mano en Developer) y con ellos las medallas no se quitaban.

const str = (value) => (typeof value === 'string' ? value.trim() : '');

// Mismo criterio que gamification.countReviewPhotos.
function countReviewPhotos(data) {
  if (!data || typeof data !== 'object') return 0;
  for (const field of ['photos', 'images']) {
    if (Array.isArray(data[field])) {
      const count = data[field].filter((photo) => typeof photo === 'string' && photo.trim().length > 0).length;
      if (count > 0) return count;
    }
  }
  return str(data.photoUrl) ? 1 : 0;
}

const emptyStats = () => ({ reviewsCount: 0, photosCount: 0, reviewedPlacesCount: 0, publicListsCount: 0, privateListsCount: 0 });

/**
 * reviews: [{ path, data }] de todo el grupo `reviews`; lists: [{ data }] de `lists`.
 * Solo cuentan las valoraciones de lists/{id}/reviews/{id} (la raíz `reviews/` es legacy).
 * Valoraciones y fotos: de quien la firma (userId, o authorId en las antiguas), como
 * recountAuthor. Sitios: solo por userId, como countReviewedPlaces (el repaso de cada día).
 */
function tallyUserStats(reviews, lists) {
  const byUser = new Map();
  const statsOf = (uid) => {
    if (!byUser.has(uid)) byUser.set(uid, { ...emptyStats(), places: new Set() });
    return byUser.get(uid);
  };

  (reviews || []).forEach(({ path, data }) => {
    const parts = String(path || '').split('/');
    if (parts.length !== 4 || parts[0] !== 'lists' || parts[2] !== 'reviews') return;
    const review = data || {};
    const author = str(review.userId) || str(review.authorId);
    if (!author) return;
    const stats = statsOf(author);
    stats.reviewsCount += 1;
    stats.photosCount += countReviewPhotos(review);
    const placeId = str(review.placeId);
    if (placeId && str(review.userId)) statsOf(str(review.userId)).places.add(placeId);
  });

  (lists || []).forEach(({ data }) => {
    const owner = str(data && data.userId);
    if (!owner) return;
    const stats = statsOf(owner);
    if (data.isPublic) stats.publicListsCount += 1;
    else stats.privateListsCount += 1;
  });

  return new Map([...byUser.entries()].map(([uid, { places, ...stats }]) => [uid, { ...stats, reviewedPlacesCount: places.size }]));
}

/** Lo que se escribe en users/{uid}: sin contadores sueltos que tapen a los de los triggers. */
function counterUpdates(stats, followersCount, followingCount) {
  const s = stats || emptyStats();
  return {
    reviewsCount: s.reviewsCount,
    reviewCount: s.reviewsCount,
    photosCount: s.photosCount,
    reviewedPlacesCount: s.reviewedPlacesCount,
    // Los triggers mantienen publicListsCount/privateListsCount y followingCount; listCount,
    // listsCount y followingUsersCount eran fotos fijas de recuentos viejos que ganaban siempre
    // (ver getListsCount y buildGamificationMetrics): se borran.
    publicListsCount: s.publicListsCount,
    privateListsCount: s.privateListsCount,
    followersCount,
    followingCount,
  };
}

const SHADOW_COUNTERS = ['listCount', 'listsCount', 'followingUsersCount'];

/** Campos que cambian respecto a lo guardado (para escribir y contarlo en el registro). */
function changedCounters(userData, updates) {
  const data = userData || {};
  const changes = Object.entries(updates)
    .filter(([key, value]) => data[key] !== value)
    .map(([key, value]) => ({ key, before: data[key] ?? null, after: value }));
  SHADOW_COUNTERS.forEach((key) => {
    if (data[key] !== undefined) changes.push({ key, before: data[key], after: null });
  });
  return changes;
}

module.exports = { tallyUserStats, counterUpdates, changedCounters, countReviewPhotos, SHADOW_COUNTERS };
