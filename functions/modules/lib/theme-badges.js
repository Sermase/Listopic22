'use strict';

// Escalera de temas: cada medalla desbloquea un tema (frontend/src/context/ThemeContext.tsx,
// en el mismo orden). Se comprueban con las valoraciones; si se borra la que la dio, se pierde.
// La usan claimThemeBadges (al momento) y el repaso de madrugada (functions/modules/surprises.js).

const TIME_ZONE = 'Europe/Madrid';
const madridDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const madridHour = (date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hour12: false }).format(date)) % 24;

const THEME_BADGES = {
  TEMA_CALIDO: { theme: 'warm', name: 'Primer bocado', icon: '🔥', description: 'Tu primera valoración. Desbloquea el tema Cálido.', met: (s) => s.reviews >= 1 },
  TEMA_FRESCO: { theme: 'cool', name: 'Aire fresco', icon: '🌿', description: 'Valorar en 3 sitios distintos. Desbloquea el tema Fresco.', met: (s) => s.places.size >= 3 },
  TEMA_NEON: { theme: 'neon', name: 'Noche de ciudad', icon: '💜', description: '10 valoraciones hechas después de las 21 h. Desbloquea el tema Neón.', met: (s) => s.night >= 10 },
  TEMA_GRAFITO: { theme: 'graphite', name: 'Ojo de lince', icon: '🖤', description: '25 valoraciones con foto. Desbloquea el tema Grafito.', met: (s) => s.photos >= 25 },
  TEMA_ATARDECER: { theme: 'sunset', name: 'Hora dorada', icon: '🌇', description: '20 valoraciones entre las 18 y las 22 h, en 8 días distintos. Desbloquea el tema Atardecer.', met: (s) => s.golden >= 20 && s.goldenDays.size >= 8 },
  TEMA_LAGUNA: { theme: 'lagoon', name: 'Culo inquieto', icon: '🏝️', description: 'Valorar en 40 sitios distintos. Desbloquea el tema Laguna.', met: (s) => s.places.size >= 40 },
};
const THEME_IDS = Object.keys(THEME_BADGES);

const emptyThemeStats = () => ({ reviews: 0, places: new Set(), night: 0, photos: 0, golden: 0, goldenDays: new Set() });

const hasPhoto = (r) => ['photos', 'images'].some((k) => Array.isArray(r[k]) && r[k].some((u) => typeof u === 'string' && u.trim()))
  || (typeof r.photoUrl === 'string' && r.photoUrl.trim().length > 0);

/** Suma una valoración (lists/{id}/reviews/{id}) a la cuenta de la escalera de temas. */
function addThemeStat(stats, r) {
  stats.reviews += 1;
  const place = (typeof r.placeId === 'string' && r.placeId.trim()) || (typeof r.placeName === 'string' && r.placeName.trim().toLowerCase());
  if (place) stats.places.add(place);
  if (hasPhoto(r)) stats.photos += 1;
  const created = r.createdAt && typeof r.createdAt.toDate === 'function' ? r.createdAt.toDate() : null;
  if (!created) return;
  const hour = madridHour(created);
  if (hour >= 21 || hour < 3) stats.night += 1;
  if (hour >= 18 && hour < 22) {
    stats.golden += 1;
    stats.goldenDays.add(madridDay(created));
  }
}

const themeBadgesMet = (stats) => THEME_IDS.filter((id) => THEME_BADGES[id].met(stats));

module.exports = { THEME_BADGES, THEME_IDS, emptyThemeStats, addThemeStat, themeBadgesMet };
