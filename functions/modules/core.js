// functions/modules/core.js

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const fetch = require("node-fetch");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { buildGroupedItemsForList } = require("./grouped-aggregator");

const db = getFirestore();

const MAX_PLACES_SUGGESTIONS = 8;
const MIN_LOCAL_RESULTS_THRESHOLD = 3;
const GOOGLE_NEARBY_RESULT_LIMIT = 6;
const GOOGLE_TEXT_RESULT_LIMIT = 6;
const MAX_LOCAL_NEARBY_DISTANCE_KM = 75;
const SERVER_MANAGED_LIST_FIELDS = new Set([
  'userId',
  'reviewCount',
  'reviewsCount',
  'followersCount',
  'commentsCount',
  'reactions',
  'createdAt',
  'updatedAt',
  'averageRating',
  'lastGoogleSync',
  'lastPhotoRefresh'
]);

const CATEGORY_TYPE_FALLBACKS = Object.freeze({
  'hmm-comida': ['restaurant', 'cafe', 'meal_takeaway', 'bar', 'meal_delivery']
});

const VALID_HTTPS_ERROR_CODES = new Set([
  'ok',
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
  'unauthenticated'
]);

const FRIENDLY_ERROR_MESSAGES = Object.freeze({
  'permission-denied': 'No tienes permisos para realizar esta acción.',
  'already-exists': 'Ya existe un recurso con estos datos.',
  'not-found': 'El recurso solicitado no está disponible.',
  'resource-exhausted': 'Has alcanzado el límite de esta operación. Inténtalo más tarde.',
  'deadline-exceeded': 'La operación tardó demasiado en completarse. Inténtalo de nuevo.',
  'unavailable': 'El servicio no está disponible temporalmente. Inténtalo nuevamente en unos minutos.'
});

function normalizeHttpsErrorCode(code, fallback = 'internal') {
  if (!code || typeof code !== 'string') {
    return fallback;
  }
  const normalized = code.toLowerCase();
  return VALID_HTTPS_ERROR_CODES.has(normalized) ? normalized : fallback;
}

function buildHttpsErrorFrom(error, fallbackMessage, fallbackCode = 'internal') {
  if (!error) {
    return new HttpsError(fallbackCode, fallbackMessage);
  }
  if (error instanceof HttpsError) {
    return error;
  }

  const normalizedCode = normalizeHttpsErrorCode(error.code, fallbackCode);
  const message = FRIENDLY_ERROR_MESSAGES[normalizedCode] || fallbackMessage;

  const details = {};
  if (error.message) {
    details.originalMessage = error.message;
  }
  if (error.status) {
    details.httpStatus = error.status;
  }
  if (error.response?.status) {
    details.httpStatus = error.response.status;
  }
  if (error.response?.data) {
    details.responseData = error.response.data;
  }

  return new HttpsError(normalizedCode, message, Object.keys(details).length ? details : undefined);
}

function sanitizeListPayload(data) {
  const safe = {};
  if (!data || typeof data !== 'object') {
    return safe;
  }
  for (const [key, value] of Object.entries(data)) {
    if (SERVER_MANAGED_LIST_FIELDS.has(key)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

function normalizeUserTypes(rawUserType) {
  if (Array.isArray(rawUserType)) {
    return rawUserType
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof rawUserType === 'string') {
    const normalized = rawUserType.trim();
    return normalized ? [normalized] : [];
  }
  return [];
}

async function assertJefeAccess(uid, permissionMessage = 'No tienes permiso para ejecutar esta operación.') {
  const userProfileDoc = await db.collection('users').doc(uid).get();
  const userTypes = normalizeUserTypes(userProfileDoc.data()?.userType);
  if (!userProfileDoc.exists || !userTypes.includes('jefe')) {
    throw new HttpsError('permission-denied', permissionMessage);
  }
  return userProfileDoc;
}

async function requireAuthFromRequest(req, res) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ message: 'No autorizado: falta token Bearer.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded;
  } catch (error) {
    logger.warn('requireAuthFromRequest: token inválido', { error: error.message });
    res.status(401).json({ message: 'No autorizado: token inválido.' });
    return null;
  }
}

// Helper: fetch place docs by IDs in chunks of 10 (Firestore 'in' limit)
async function getPlaceDocsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  const results = [];
  for (const chunk of chunks) {
    const snap = await db
      .collection('places')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    results.push(...snap.docs);
  }
  return results;
}

function sanitizeTypeArray(types, limit = 10) {
  if (!Array.isArray(types)) {
    return [];
  }
  const sanitized = [];
  for (const raw of types) {
    if (typeof raw !== 'string') {
      continue;
    }
    const value = raw.trim();
    if (!value) {
      continue;
    }
    sanitized.push(value.toLowerCase());
    if (sanitized.length >= limit) {
      break;
    }
  }
  return sanitized;
}

async function resolveGooglePhotoUrl(photoReference, apiKey, maxWidth = 800) {
  if (!photoReference || !apiKey) {
    return null;
  }

  const safeWidth = Math.min(Math.max(parseInt(maxWidth, 10) || 400, 1), 1600);
  const endpoint = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${safeWidth}&photoreference=${encodeURIComponent(photoReference)}&key=${apiKey}`;

  try {
    const response = await fetch(endpoint, { method: 'GET', redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers.get('location');
      if (redirectUrl) {
        return redirectUrl;
      }
    } else {
      logger.warn("resolveGooglePhotoUrl: respuesta inesperada del endpoint de fotos.", {
        status: response.status,
        statusText: response.statusText
      });
    }
  } catch (error) {
    logger.error("resolveGooglePhotoUrl: error al resolver la URL de la foto de Google.", {
      photoReference,
      error: error.message
    });
  }

  return null;
}

function buildAccessibilityPayload(accessibilityOptions) {
  if (!accessibilityOptions || typeof accessibilityOptions !== 'object') {
    return null;
  }

  const payload = {
    wheelchairAccessibleEntrance: accessibilityOptions.wheelchairAccessibleEntrance ?? null,
    wheelchairAccessibleSeating: accessibilityOptions.wheelchairAccessibleSeating ?? null,
    wheelchairAccessibleParking: accessibilityOptions.wheelchairAccessibleParking ?? null,
    wheelchairAccessibleRestroom: accessibilityOptions.wheelchairAccessibleRestroom ?? null,
    hearingLoop: accessibilityOptions.hearingLoop ?? null
  };

  const hasValue = Object.values(payload).some((value) => value !== null && value !== undefined);
  return hasValue ? payload : null;
}

function resolveAccessibilityPayload(accessibilityOptions, fallback) {
  const resolved = buildAccessibilityPayload(accessibilityOptions);
  if (resolved) {
    return resolved;
  }
  return fallback && typeof fallback === 'object' ? fallback : null;
}

async function fetchPlaceAccessibilityOptions(placeId, apiKey, languageCode = 'es') {
  if (!placeId || !apiKey) {
    return null;
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(languageCode)}`;
  const headers = {
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': 'accessibilityOptions'
  };

  try {
    const response = await fetch(url, { method: 'GET', headers });
    const data = await response.json();

    if (!response.ok || data?.error) {
      logger.warn("fetchPlaceAccessibilityOptions: error desde Places API.", {
        status: response.status,
        error: data?.error?.message || data?.error || response.statusText
      });
      return null;
    }

    return data.accessibilityOptions || null;
  } catch (error) {
    logger.warn("fetchPlaceAccessibilityOptions: error al contactar Places API.", {
      placeId,
      error: error.message
    });
    return null;
  }
}

function resolveText(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  if (typeof fallback === 'string') {
    const trimmed = fallback.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function resolveNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback;
  }
  return null;
}

function resolveTypeArray(types, fallback) {
  const primary = sanitizeTypeArray(types);
  if (primary.length) {
    return primary;
  }
  const secondary = sanitizeTypeArray(fallback);
  return secondary.length ? secondary : null;
}

function resolvePlaceLocation(result, existingData) {
  const resultLat = numberOrNull(result?.geometry?.location?.lat);
  const resultLon = numberOrNull(result?.geometry?.location?.lng);
  if (resultLat !== null && resultLon !== null) {
    return { latitude: resultLat, longitude: resultLon };
  }

  const existingLocation = existingData?.location || {};
  const existingCoordinates = existingData?.coordinates || {};
  const fallbackLat = numberOrNull(existingLocation.latitude ?? existingCoordinates.latitude);
  const fallbackLon = numberOrNull(existingLocation.longitude ?? existingCoordinates.longitude);
  if (fallbackLat !== null && fallbackLon !== null) {
    return { latitude: fallbackLat, longitude: fallbackLon };
  }

  return null;
}


function extractAddressFields(addressComponents) {
  const output = {
    city: null,
    region: null,
    country: null,
    postalCode: null,
    province: null
  };

  if (!Array.isArray(addressComponents)) {
    return output;
  }

  for (const component of addressComponents) {
    if (!component || !Array.isArray(component.types)) {
      continue;
    }
    if (component.types.includes('locality')) {
      output.city = component.long_name;
    }
    if (component.types.includes('administrative_area_level_1')) {
      output.region = component.long_name;
    }
    if (component.types.includes('country')) {
      output.country = component.long_name;
    }
    if (component.types.includes('postal_code')) {
      output.postalCode = component.long_name;
    }
  }

  if (output.postalCode) {
    const provinceCode = output.postalCode.substring(0, 2);
    output.province = provinceMap?.[provinceCode] || output.province;
  }

  return output;
}

function pruneNullishKeys(payload) {
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === null) {
      delete payload[key];
    }
  });
}

function extractTimestampDate(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (error) {
      logger.warn("extractTimestampDate: no se pudo convertir el timestamp.", error);
      return null;
    }
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

async function refreshPlaceMainImageFromSnapshot(docSnapshot, apiKey, { force = false, maxWidth = 800 } = {}) {
  if (!docSnapshot?.exists) {
    const error = new Error('El documento del lugar no existe.');
    error.code = 'not-found';
    throw error;
  }

  const placeData = docSnapshot.data() || {};
  const googlePlaceId = placeData.googlePlaceId || docSnapshot.id;
  if (!googlePlaceId) {
    const error = new Error('El documento no tiene googlePlaceId.');
    error.code = 'invalid-argument';
    throw error;
  }

  const lastRefreshDate = extractTimestampDate(placeData.lastPhotoRefresh);
  const hasLegacyUrl = typeof placeData.mainImageUrl === 'string'
    && placeData.mainImageUrl.includes('maps.googleapis.com/maps/api/place/photo');
  const shouldSkip = !force && !hasLegacyUrl && lastRefreshDate && (Date.now() - lastRefreshDate.getTime()) < (6 * 60 * 60 * 1000);

  if (shouldSkip) {
    return {
      skipped: true,
      photoUrl: placeData.mainImageUrl || null,
      photoReference: placeData.mainImagePhotoReference || null
    };
  }

  const fields = "photos";
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&key=${apiKey}&fields=${fields}&language=es`;

  const detailsResponse = await fetch(detailsUrl);
  const details = await detailsResponse.json();

  if (details.status !== "OK" || !details.result?.photos?.length) {
    const error = new Error(details.error_message || `Google Places devolvió ${details.status}`);
    error.code = details.status === 'NOT_FOUND' ? 'not-found' : 'unavailable';
    throw error;
  }

  const primaryPhotoReference = details.result.photos[0].photo_reference;
  const resolvedMainImageUrl = await resolveGooglePhotoUrl(primaryPhotoReference, apiKey, maxWidth);

  if (!resolvedMainImageUrl) {
    const error = new Error('No se pudo resolver la URL de la foto.');
    error.code = 'internal';
    throw error;
  }

  await docSnapshot.ref.update({
    mainImageUrl: resolvedMainImageUrl,
    mainImagePhotoReference: primaryPhotoReference,
    lastPhotoRefresh: FieldValue.serverTimestamp()
  });

  return { refreshed: true, photoUrl: resolvedMainImageUrl, photoReference: primaryPhotoReference };
}

async function refreshPlaceMainImageByIdInternal(placeId, options = {}) {
  if (!placeId) {
    const error = new Error('placeId es requerido.');
    error.code = 'invalid-argument';
    throw error;
  }
  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) {
    const error = new Error('GOOGLE_PLACES_API_KEY no está configurada.');
    error.code = 'internal';
    throw error;
  }
  const docSnapshot = await db.collection('places').doc(placeId).get();
  if (!docSnapshot.exists) {
    const error = new Error('El lugar solicitado no existe.');
    error.code = 'not-found';
    throw error;
  }
  return await refreshPlaceMainImageFromSnapshot(docSnapshot, apiKey, options);
}

let cachedGooglePlacesApiKey = null;
let cachedGooglePlacesApiKeyExpiresAt = 0;

async function getGooglePlacesApiKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) {
    return process.env.GOOGLE_PLACES_API_KEY;
  }

  const now = Date.now();
  if (cachedGooglePlacesApiKey && cachedGooglePlacesApiKeyExpiresAt > now) {
    return cachedGooglePlacesApiKey;
  }

  try {
    const secretDoc = await db.collection('config').doc('serverSecrets').get();
    if (secretDoc.exists) {
      const data = secretDoc.data() || {};
      if (typeof data.googlePlacesApiKey === 'string' && data.googlePlacesApiKey.trim()) {
        cachedGooglePlacesApiKey = data.googlePlacesApiKey.trim();
        cachedGooglePlacesApiKeyExpiresAt = now + (15 * 60 * 1000);
        return cachedGooglePlacesApiKey;
      }
    }
  } catch (error) {
    logger.error("getGooglePlacesApiKey: no se pudo leer config/serverSecrets.", error);
  }

  return null;
}

function parseCategoryTypesParam(raw) {
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  const parts = raw.split(',');
  return sanitizeTypeArray(parts);
}

async function resolveCategoryPlaceTypes(categoryId, rawTypesParam) {
  const fromQuery = parseCategoryTypesParam(rawTypesParam);
  if (fromQuery.length) {
    return fromQuery;
  }

  if (!categoryId) {
    return [];
  }

  try {
    const categoryDoc = await db.collection('categories').doc(categoryId).get();
    if (categoryDoc.exists) {
      const categoryData = categoryDoc.data() || {};
      const docArray = sanitizeTypeArray(categoryData.googlePlaceTypes);
      if (docArray.length) {
        return docArray;
      }
      if (typeof categoryData.googlePlaceType === 'string') {
        const single = sanitizeTypeArray([categoryData.googlePlaceType]);
        if (single.length) {
          return single;
        }
      }
      const alternative = sanitizeTypeArray(categoryData.placeTypes);
      if (alternative.length) {
        return alternative;
      }
    }
  } catch (error) {
    logger.error(`resolveCategoryPlaceTypes: Error retrieving category ${categoryId}`, error);
  }

  const fallback = CATEGORY_TYPE_FALLBACKS[categoryId];
  if (Array.isArray(fallback) && fallback.length) {
    return sanitizeTypeArray(fallback);
  }

  return [];
}

function normalizeForComparison(value) {
  if (!value) {
    return '';
  }
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function computeMatchScore(normalizedName, normalizedQuery) {
  if (!normalizedName || !normalizedQuery) {
    return 0;
  }
  if (normalizedName === normalizedQuery) {
    return 3;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 2;
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 1;
  }
  return 0;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAllowedTypesSet(categoryTypes) {
  const sanitized = sanitizeTypeArray(categoryTypes);
  return new Set(sanitized);
}

function buildLocalPlaceCandidate(doc, {
  normalizedQueryNoDiacritics,
  userLat,
  userLon,
  allowedTypesSet,
  maxDistanceKm
}) {
  const data = doc.data() || {};
  const normalizedName = normalizeForComparison(data.name || '');
  const matchScore = computeMatchScore(normalizedName, normalizedQueryNoDiacritics);
  const placeTypes = Array.isArray(data.types)
    ? data.types
      .map(type => (typeof type === 'string' ? type.toLowerCase() : ''))
      .filter(Boolean)
    : [];

  if (allowedTypesSet && allowedTypesSet.size > 0) {
    const matchesAllowedType = placeTypes.some(type => allowedTypesSet.has(type));
    if (!matchesAllowedType) {
      return null;
    }
  }

  const rawLocation = data.location || data.coordinates || {};
  const lat = numberOrNull(rawLocation.latitude);
  const lon = numberOrNull(rawLocation.longitude);
  let distanceInKm = null;
  if (lat !== null && lon !== null && Number.isFinite(userLat) && Number.isFinite(userLon)) {
    distanceInKm = getDistance(userLat, userLon, lat, lon);
  }
  if (typeof maxDistanceKm === 'number' && distanceInKm !== null && distanceInKm > maxDistanceKm) {
    return null;
  }

  const reviewsCount = Number.isFinite(data.reviewsCount)
    ? data.reviewsCount
    : (Number.isFinite(data.googleUserRatingsTotal) ? data.googleUserRatingsTotal : 0);

  const suggestion = {
    place_id: (typeof data.googlePlaceId === 'string' && data.googlePlaceId) ? data.googlePlaceId : doc.id,
    name: data.name || 'Lugar sin nombre',
    formatted_address: data.address || data.formatted_address || '',
    vicinity: data.address || data.formatted_address || '',
    geometry: {
      location: {
        lat,
        lng: lon
      }
    },
    types: Array.isArray(data.types) ? data.types : [],
    rating: Number.isFinite(data.googleRating)
      ? data.googleRating
      : (Number.isFinite(data.averageRating) ? data.averageRating : undefined),
    user_ratings_total: Number.isFinite(data.googleUserRatingsTotal)
      ? data.googleUserRatingsTotal
      : (Number.isFinite(data.reviewsCount) ? data.reviewsCount : undefined),
    listopicPlaceId: doc.id,
    source: 'listopic'
  };

  if (typeof data.googleMapsUrl === 'string' && data.googleMapsUrl) {
    suggestion.googleMapsUrl = data.googleMapsUrl;
  }
  if (typeof data.mainImageUrl === 'string' && data.mainImageUrl) {
    suggestion.mainImageUrl = data.mainImageUrl;
  }
  if (typeof data.website === 'string' && data.website) {
    suggestion.website = data.website;
  }
  if (typeof data.phone === 'string' && data.phone) {
    suggestion.international_phone_number = data.phone;
  }
  if (distanceInKm !== null) {
    suggestion.distanceInKm = Number(distanceInKm.toFixed(2));
  }

  return {
    suggestion,
    matchScore,
    distanceInKm,
    reviewsCount
  };
}

function sortLocalCandidates(a, b) {
  if (b.matchScore !== a.matchScore) {
    return b.matchScore - a.matchScore;
  }
  const aHasDistance = Number.isFinite(a.distanceInKm);
  const bHasDistance = Number.isFinite(b.distanceInKm);
  if (aHasDistance && bHasDistance && a.distanceInKm !== b.distanceInKm) {
    return a.distanceInKm - b.distanceInKm;
  }
  if (aHasDistance && !bHasDistance) {
    return -1;
  }
  if (!aHasDistance && bHasDistance) {
    return 1;
  }
  return (b.reviewsCount || 0) - (a.reviewsCount || 0);
}

function mergePlaceResults(primary, secondary, maxResults) {
  const combined = [];
  const seen = new Set();

  const register = (place) => {
    if (!place || typeof place !== 'object') {
      return;
    }
    const placeId = typeof place.place_id === 'string' && place.place_id
      ? place.place_id
      : (typeof place.listopicPlaceId === 'string' && place.listopicPlaceId ? place.listopicPlaceId : null);
    const key = placeId || `${place.geometry?.location?.lat ?? 'x'}:${place.geometry?.location?.lng ?? 'x'}:${place.name ?? ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    combined.push(place);
  };

  primary.forEach(register);
  secondary.forEach(register);

  if (combined.length > maxResults) {
    return combined.slice(0, maxResults);
  }
  return combined;
}

function filterGoogleResultsByTypes(results, allowedTypesSet) {
  if (!Array.isArray(results)) {
    return [];
  }
  if (!allowedTypesSet || allowedTypesSet.size === 0) {
    return results;
  }
  return results.filter(place => {
    if (!Array.isArray(place.types)) {
      return false;
    }
    return place.types.some(type => {
      if (typeof type !== 'string') {
        return false;
      }
      return allowedTypesSet.has(type.toLowerCase());
    });
  });
}

function annotateGoogleResult(place, userLat, userLon) {
  const clone = place ? { ...place } : {};
  clone.source = 'google';
  const lat = numberOrNull(place?.geometry?.location?.lat);
  const lon = numberOrNull(place?.geometry?.location?.lng);
  if (lat !== null && lon !== null && Number.isFinite(userLat) && Number.isFinite(userLon)) {
    const distance = getDistance(userLat, userLon, lat, lon);
    clone.distanceInKm = Number(distance.toFixed(2));
  }
  return clone;
}

async function searchListopicPlacesByName(query, {
  userLat,
  userLon,
  limit,
  categoryTypes
}) {
  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    return [];
  }

  const normalizedLower = trimmedQuery.toLowerCase();
  const normalizedForMatch = normalizeForComparison(trimmedQuery);
  const allowedTypesSet = buildAllowedTypesSet(categoryTypes);

  const fetchLimit = Math.min(Math.max(limit || 1, 1) * 3, 30);
  const candidates = [];

  try {
    const snapshot = await db
      .collection('places')
      .orderBy('name_normalized')
      .startAt(normalizedLower)
      .endAt(`${normalizedLower}\uf8ff`)
      .limit(fetchLimit)
      .get();

    snapshot.forEach(doc => {
      const candidate = buildLocalPlaceCandidate(doc, {
        normalizedQueryNoDiacritics: normalizedForMatch,
        userLat,
        userLon,
        allowedTypesSet,
        maxDistanceKm: null
      });
      if (candidate) {
        candidates.push(candidate);
      }
    });
  } catch (error) {
    logger.error('searchListopicPlacesByName: Error querying local places', error);
    return [];
  }

  candidates.sort(sortLocalCandidates);
  return candidates.slice(0, limit).map(entry => entry.suggestion);
}

async function fetchLocalPlacesByTypes(categoryTypes, {
  userLat,
  userLon,
  limit,
  maxDistanceKm
}) {
  const sanitizedTypes = sanitizeTypeArray(categoryTypes);
  if (!sanitizedTypes.length) {
    return [];
  }

  const allowedTypesSet = new Set(sanitizedTypes);
  const fetchLimit = Math.min(Math.max(limit || 1, 1) * 5, 50);
  const candidates = [];

  try {
    const snapshot = await db
      .collection('places')
      .where('types', 'array-contains-any', sanitizedTypes.slice(0, 10))
      .limit(fetchLimit)
      .get();

    snapshot.forEach(doc => {
      const candidate = buildLocalPlaceCandidate(doc, {
        normalizedQueryNoDiacritics: '',
        userLat,
        userLon,
        allowedTypesSet,
        maxDistanceKm
      });
      if (candidate) {
        candidates.push(candidate);
      }
    });
  } catch (error) {
    logger.error('fetchLocalPlacesByTypes: Error querying local places', error);
    return [];
  }

  candidates.sort(sortLocalCandidates);
  return candidates.slice(0, limit).map(entry => entry.suggestion);
}

const groupedReviews = onRequest(
  async (req, res) => {
    cors(req, res, async () => {
      const listId = req.query.listId;
      if (!listId) {
        return res.status(400).send({ error: "listId es requerido." });
      }

      let requesterUid = null;
      try {
        const listSnap = await db.collection('lists').doc(listId).get();
        if (!listSnap.exists) {
          return res.status(404).send({ error: "La lista no existe." });
        }
        const listData = listSnap.data() || {};
        const isPublic = listData.isPublic === true;
        if (!isPublic) {
          const decoded = await requireAuthFromRequest(req, res);
          if (!decoded) return;
          requesterUid = decoded.uid;
          const isOwner = listData.userId === requesterUid;
          let isJefe = false;
          let isFollower = false;

          try {
            const userDoc = await db.collection('users').doc(requesterUid).get();
            const userType = userDoc.exists ? userDoc.data().userType : null;
            if (Array.isArray(userType)) {
              isJefe = userType.includes('jefe');
            } else if (typeof userType === 'string') {
              isJefe = userType === 'jefe';
            }
          } catch (e) {
            logger.warn("groupedReviews: no se pudo leer userType", { uid: requesterUid, error: e.message });
          }

          if (!isOwner && !isJefe) {
            const followerRef = db.collection('lists').doc(listId).collection('followers').doc(requesterUid);
            const followingRef = db.collection('users').doc(requesterUid).collection('followingLists').doc(listId);
            const [followerSnap, followingSnap] = await Promise.all([
              followerRef.get(),
              followingRef.get()
            ]);
            isFollower = followerSnap.exists || followingSnap.exists;
          }

          if (!isOwner && !isJefe && !isFollower) {
            return res.status(403).send({ error: "No tienes permiso para ver esta lista." });
          }
        }
      } catch (authError) {
        logger.error("groupedReviews: error validando permisos", authError);
        return res.status(500).send({ error: "Error interno validando permisos." });
      }

      try {
        const { listData, groupedReviews } = await buildGroupedItemsForList(listId);
        const responseListData = listData || {};
        res.status(200).json({
          listName: responseListData.name || "Lista Desconocida",
          categoryId: responseListData.categoryId || null,
          criteria: responseListData.criteriaDefinition || {},
          tags: Array.isArray(responseListData.availableTags) ? responseListData.availableTags : [],
          groupedReviews: groupedReviews || []
        });
      } catch (error) {
        console.error("Error definitivo en groupedReviews:", error);
        res.status(500).send({ error: "El servidor se ha liado. Error interno.", details: error.message });
      }
    });
  });


// --- FUNCIÓN updateListReviewCount ---
// ESTA FUNCIÓN QUEDA OBSOLETA, LA NUEVA "updateAggregatesOnReviewChange" HACE ESTO Y MÁS.
// LA DEJAMOS COMENTADA POR SI ACASO, PERO LA NUEVA ES MEJOR.
/*
const updateListReviewCount = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const listRef = getFirestore().collection('lists').doc(listId);
  if (!event.data.before.exists && event.data.after.exists) {
      logger.info(`Nueva reseña creada en lista ${listId}, incrementando contador.`);
      return listRef.update({
          reviewCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
      });
  }
  else if (event.data.before.exists && !event.data.after.exists) {
      logger.info(`Reseña eliminada de lista ${listId}, decrementando contador.`);
      return listRef.update({
          reviewCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp()
      });
  }
  else {
      logger.info(`Reseña actualizada en lista ${listId}, contador no afectado.`);
      return null;
  }
});
*/

// --- FUNCIÓN placesNearbyRestaurants (MEJORADA) ---
const placesNearbyRestaurants = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const auth = await requireAuthFromRequest(req, res);
    if (!auth) return;
    const { latitude, longitude, categoryId, categoryTypes: rawCategoryTypes } = req.query;
    const apiKey = await getGooglePlacesApiKey();

    const userLat = numberOrNull(latitude);
    const userLon = numberOrNull(longitude);

    if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) {
      logger.warn("placesNearbyRestaurants: Latitud y longitud son requeridas.");
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!categoryId) {
      logger.warn("placesNearbyRestaurants: categoryId no fue proporcionado.");
      return res.status(400).json({ message: "El ID de la categoría es requerido." });
    }

    const categoryTypes = await resolveCategoryPlaceTypes(categoryId, rawCategoryTypes);
    const allowedTypesSet = buildAllowedTypesSet(categoryTypes);

    let localResults = [];
    try {
      localResults = await fetchLocalPlacesByTypes(categoryTypes, {
        userLat,
        userLon,
        limit: MAX_PLACES_SUGGESTIONS,
        maxDistanceKm: MAX_LOCAL_NEARBY_DISTANCE_KM
      });
    } catch (error) {
      logger.error('placesNearbyRestaurants: Error recuperando lugares locales', error);
    }

    if (!apiKey) {
      if (localResults.length) {
        logger.warn('placesNearbyRestaurants: API key no disponible, devolviendo resultados locales', { localCount: localResults.length });
        return res.status(200).json(localResults.slice(0, MAX_PLACES_SUGGESTIONS));
      }
      logger.error("placesNearbyRestaurants: GOOGLE_PLACES_API_KEY no está disponible.");
      return res.status(500).json({ message: "Error de configuración del servidor." });
    }

    if (localResults.length >= MIN_LOCAL_RESULTS_THRESHOLD) {
      logger.info('placesNearbyRestaurants: suficientes resultados locales, se evita llamada a Google', {
        categoryId,
        localCount: localResults.length
      });
      return res.status(200).json(localResults.slice(0, MAX_PLACES_SUGGESTIONS));
    }

    const typeForGoogle = (categoryTypes && categoryTypes.length)
      ? categoryTypes[0]
      : 'point_of_interest';

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${userLat},${userLon}&key=${apiKey}&language=es&rankby=distance&type=${encodeURIComponent(typeForGoogle)}`;
    logger.info("placesNearbyRestaurants: Fetching Google Places with rankby=distance", { url: url.replace(apiKey, "REDACTED_API_KEY"), categoryId });

    try {
      const placesResponse = await fetch(url);
      const placesData = await placesResponse.json();

      if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
        const rawResults = Array.isArray(placesData.results) ? placesData.results : [];
        const filteredGoogle = filterGoogleResultsByTypes(rawResults, allowedTypesSet)
          .slice(0, GOOGLE_NEARBY_RESULT_LIMIT)
          .map(place => annotateGoogleResult(place, userLat, userLon));

        const merged = mergePlaceResults(localResults, filteredGoogle, MAX_PLACES_SUGGESTIONS);
        res.status(200).json(merged);
      } else {
        logger.error("placesNearbyRestaurants: Error desde Google Places API", {
          status: placesData.status,
          error_message: placesData.error_message
        });
        res.status(500).json({
          message: `Error de la API de Google Places: ${placesData.status}`,
          details: placesData.error_message
        });
      }
    } catch (error) {
      logger.error("placesNearbyRestaurants: Error al contactar Google Places API", error);
      res.status(500).json({ message: "Error interno al buscar lugares cercanos." });
    }
  });
});

// --- FUNCIÓN placesTextSearch (MEJORADA CON REORDENAMIENTO) ---

// Función auxiliar para calcular la distancia entre dos puntos geográficos
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
};

const placesTextSearch = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const auth = await requireAuthFromRequest(req, res);
    if (!auth) return;
    const { query, latitude, longitude, categoryId, categoryTypes: rawCategoryTypes } = req.query;
    const apiKey = await getGooglePlacesApiKey();

    if (!query || !query.trim()) {
      return res.status(400).json({ message: "El término de búsqueda (query) es requerido." });
    }

    const trimmedQuery = query.trim();
    const userLat = numberOrNull(latitude);
    const userLon = numberOrNull(longitude);

    const categoryTypes = await resolveCategoryPlaceTypes(categoryId, rawCategoryTypes);
    const allowedTypesSet = buildAllowedTypesSet(categoryTypes);

    let localMatches = [];
    try {
      localMatches = await searchListopicPlacesByName(trimmedQuery, {
        userLat,
        userLon,
        limit: MAX_PLACES_SUGGESTIONS,
        categoryTypes
      });
    } catch (error) {
      logger.error('placesTextSearch: Error al buscar lugares locales', error);
      localMatches = [];
    }

    if (!apiKey) {
      if (localMatches.length) {
        logger.warn('placesTextSearch: API key no disponible, devolviendo resultados locales', {
          query: trimmedQuery,
          localCount: localMatches.length
        });
        return res.status(200).json(localMatches.slice(0, MAX_PLACES_SUGGESTIONS));
      }
      return res.status(500).json({ message: "Error de configuración del servidor." });
    }

    if (localMatches.length >= MIN_LOCAL_RESULTS_THRESHOLD) {
      logger.info('placesTextSearch: suficientes coincidencias locales, se evita llamada a Google', {
        query: trimmedQuery,
        localCount: localMatches.length,
        categoryId: categoryId || null
      });
      return res.status(200).json(localMatches.slice(0, MAX_PLACES_SUGGESTIONS));
    }

    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(trimmedQuery)}&key=${apiKey}&language=es`;
    const typeForGoogle = (categoryTypes && categoryTypes.length) ? categoryTypes[0] : 'establishment';
    url += `&type=${encodeURIComponent(typeForGoogle)}`;

    if (Number.isFinite(userLat) && Number.isFinite(userLon)) {
      url += `&location=${userLat},${userLon}&radius=40000`;
    }

    logger.info("placesTextSearch: Fetching Google Places", {
      url: url.replace(apiKey, "REDACTED_API_KEY"),
      categoryId: categoryId || null,
      query: trimmedQuery
    });

    try {
      const placesResponse = await fetch(url);
      const placesData = await placesResponse.json();

      if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
        const rawResults = Array.isArray(placesData.results) ? placesData.results : [];
        const filteredGoogle = filterGoogleResultsByTypes(rawResults, allowedTypesSet)
          .slice(0, GOOGLE_TEXT_RESULT_LIMIT)
          .map(place => annotateGoogleResult(place, userLat, userLon));

        const merged = mergePlaceResults(localMatches, filteredGoogle, MAX_PLACES_SUGGESTIONS);
        res.status(200).json(merged);
      } else {
        logger.error("placesTextSearch: Error desde Google Places API", {
          status: placesData.status,
          error_message: placesData.error_message
        });
        res.status(500).json({
          message: `Error de la API de Google Places: ${placesData.status}`,
          details: placesData.error_message
        });
      }
    } catch (error) {
      logger.error("placesTextSearch: Error al contactar Google Places API", error);
      res.status(500).json({ message: "Error interno al buscar lugares por texto." });
    }
  });
});


// --- FUNCIÓN getPlaceDetailsFromGoogle ---

const provinceMap = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
  '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
  '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'La Coruña',
  '16': 'Cuenca', '17': 'Gerona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lérida',
  '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Orense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
  '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
  '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo',
  '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya', '49': 'Zamora', '50': 'Zaragoza',
  '51': 'Ceuta', '52': 'Melilla'
};

const getPlaceDetailsFromGoogle = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const decoded = await requireAuthFromRequest(req, res);
    if (!decoded) return;
    req.user = { uid: decoded.uid };

    const { placeid } = req.query;
    const apiKey = await getGooglePlacesApiKey();

    if (!placeid) {
      return res.status(400).json({ message: "El ID del lugar (placeid) es requerido." });
    }
    if (!apiKey) {
      logger.error("getPlaceDetailsFromGoogle: GOOGLE_PLACES_API_KEY no se encontró en las variables de entorno.");
      return res.status(500).json({ message: "Error de configuración del servidor (API Key no encontrada)." });
    }

    // Añadimos campos de accesibilidad y opciones de servicio (si el endpoint legacy los soporta, serán devueltos)
    // Usamos solo campos soportados por el endpoint legacy de Place Details
    const fields = "name,place_id,formatted_address,geometry,url,photos,price_level,website,international_phone_number,address_components,rating,user_ratings_total,types,business_status";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeid}&key=${apiKey}&fields=${fields}&language=es`;

    try {
      const placeDetailsResponse = await fetch(url);
      const placeDetailsData = await placeDetailsResponse.json();

      if (placeDetailsData.status === "OK") {
        const result = placeDetailsData.result;
        const placeRef = db.collection('places').doc(result.place_id);

        // 2. COMPROBAMOS SI EL DOCUMENTO YA EXISTE
        const docSnapshot = await placeRef.get();

        // ... (lógica para procesar la respuesta de Google, igual que antes)
        let city = '', region = '', country = '', postalCode = '', province = '';
        if (result.address_components) {
          for (const component of result.address_components) {
            if (component.types.includes('locality')) city = component.long_name;
            if (component.types.includes('administrative_area_level_1')) region = component.long_name;
            if (component.types.includes('country')) country = component.long_name;
            if (component.types.includes('postal_code')) postalCode = component.long_name;
          }
        }
        if (postalCode) {
          const provinceCode = postalCode.substring(0, 2);
          province = provinceMap[provinceCode] || '';
        }

        const existingData = docSnapshot.exists ? (docSnapshot.data() || {}) : {};
        const accessibilityOptions = await fetchPlaceAccessibilityOptions(result.place_id, apiKey);
        const previousMainImageUrl = existingData.mainImageUrl || null;
        const previousPhotoReference = existingData.mainImagePhotoReference || null;
        const primaryPhotoReference = (result.photos && result.photos.length > 0) ? result.photos[0].photo_reference : null;
        let resolvedMainImageUrl = previousMainImageUrl;
        let mainImagePhotoReference = previousPhotoReference;

        if (primaryPhotoReference) {
          const candidatePhotoUrl = await resolveGooglePhotoUrl(primaryPhotoReference, apiKey, 800);
          if (candidatePhotoUrl) {
            resolvedMainImageUrl = candidatePhotoUrl;
            mainImagePhotoReference = primaryPhotoReference;
          }
        }

        const placeDoc = {
          name: result.name,
          name_normalized: result.name.toLowerCase(),
          googlePlaceId: result.place_id,
          address: result.formatted_address,
          address_normalized: result.formatted_address ? result.formatted_address.toLowerCase() : '',
          coordinates: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
          location: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
          city: city,
          region: region,
          province: province,
          country: country,
          postalCode: postalCode,
          googleMapsUrl: result.url,
          website: result.website || null,
          phone: result.international_phone_number || null,
          priceLevel: result.price_level !== undefined ? result.price_level : null,
          googleRating: result.rating || 0, googleUserRatingsTotal: result.user_ratings_total || 0,
          types: result.types || [],
          mainImageUrl: resolvedMainImageUrl,
          mainImagePhotoReference: mainImagePhotoReference,
          // Nuevos campos estructurados
          // Estos campos pueden rellenarse vía otras fuentes o con endpoints v1 en el futuro
          accessibility: resolveAccessibilityPayload(accessibilityOptions, existingData.accessibility),
          serviceOptions: existingData.serviceOptions || null,
          googleBusinessStatus: result.business_status || null,
          closedStatus: result.business_status === 'CLOSED_PERMANENTLY' ? 'permanently_closed'
            : result.business_status === 'CLOSED_TEMPORARILY' ? 'temporarily_closed'
            : null,
          closedStatusUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(), lastGoogleSync: FieldValue.serverTimestamp(),
        };

        // 3. SI NO EXISTE, AÑADIMOS LOS CAMPOS DE CREACIÓN
        if (!docSnapshot.exists) {
          placeDoc.createdByUserId = req.user.uid;
          placeDoc.createdAt = FieldValue.serverTimestamp();
          placeDoc.followersCount = 0; // Inicializar campos específicos de la app
          placeDoc.reviewsCount = 0;
          placeDoc.averageRating = null; // null hasta que existan reseñas
        }

        // 4. Guardamos los datos. `merge: true` sigue siendo útil para no borrar otros campos.
        await placeRef.set(placeDoc, { merge: true });

        // 5. DEVOLVEMOS EL DOCUMENTO LIMPIO Y GUARDADO, NO EL RESULTADO BRUTO DE GOOGLE
        // Añadimos el ID al documento que devolvemos, ya que .data() no lo incluye.
        const finalDoc = { id: placeRef.id, ...placeDoc };
        res.status(200).json(finalDoc);
      } else {
        logger.error("Error desde Google Places API", { status: placeDetailsData.status, error_message: placeDetailsData.error_message });
        res.status(500).json({ message: `Error de la API de Google Places: ${placeDetailsData.status}`, details: placeDetailsData.error_message });
      }
    } catch (error) {
      logger.error("Error al contactar o procesar Google Places API", error);
      res.status(500).json({ message: "Error interno al buscar detalles del lugar.", error: error.message });
    }
  });
});

// --- FUNCIÓN CALLABLE: deleteListAndContent ---
const deleteOrOrphanList = onCall({ cors: true }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    logger.warn("deleteOrOrphanList: Intento de llamada no autenticado.");
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const callerUserId = contextAuth.uid;
  const listId = request.data.listId;

  if (!listId) {
    logger.warn(`deleteOrOrphanList: listId no proporcionado por el usuario ${callerUserId}.`);
    throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista (listId).');
  }

  logger.info(`deleteOrOrphanList: Usuario ${callerUserId} solicitando acción sobre lista ${listId}.`);
  const listRef = db.collection('lists').doc(listId);
  const reviewsRef = listRef.collection('reviews');

  try {
    const listDoc = await listRef.get();
    if (!listDoc.exists) {
      throw new HttpsError('not-found', 'La lista no existe.');
    }

    const listData = listDoc.data();
    if (listData.userId !== callerUserId) {
      throw new HttpsError('permission-denied', 'No tienes permiso para modificar esta lista.');
    }

    // --- INICIO DE LA NUEVA LÓGICA ---

    // Buscar si existen reseñas de OTROS usuarios en esta lista.
    const otherUserReviewsSnapshot = await reviewsRef.where('userId', '!=', callerUserId).limit(1).get();

    // Escenario 1: NO hay reseñas de otros usuarios. Procedemos a borrar todo.
    if (otherUserReviewsSnapshot.empty) {
      logger.info(`La lista ${listId} no tiene reseñas de otros usuarios. Procediendo con la eliminación completa.`);

      // Borrar todas las reseñas (que sabemos que son solo del propietario).
      const allReviewsSnapshot = await reviewsRef.get();
      if (!allReviewsSnapshot.empty) {
        const deleteBatch = db.batch();
        allReviewsSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();
        logger.info(`Eliminadas ${allReviewsSnapshot.size} reseñas del propietario de la lista ${listId}.`);
      }

      // Borrar la lista en sí.
      await listRef.delete();
      logger.info(`Lista ${listId} eliminada exitosamente por ${callerUserId}.`);

      return { success: true, message: 'La lista y todas tus reseñas han sido eliminadas.' };

      // Escenario 2: SÍ hay reseñas de otros. Procedemos a desvincular/archivar.
    } else {
      logger.info(`La lista ${listId} tiene reseñas de otros usuarios. Procediendo a desvincular al propietario ${callerUserId}.`);

      const ownerReviewsSnapshot = await reviewsRef.where('userId', '==', callerUserId).get();

      // Borrar solo las reseñas del propietario original.
      if (!ownerReviewsSnapshot.empty) {
        const deleteOwnerReviewsBatch = db.batch();
        ownerReviewsSnapshot.docs.forEach(doc => deleteOwnerReviewsBatch.delete(doc.ref));
        await deleteOwnerReviewsBatch.commit();
        logger.info(`Eliminadas ${ownerReviewsSnapshot.size} reseñas del propietario de la lista ${listId} para archivarla.`);
      }

      // Actualizar la lista para "orfanarla".
      await listRef.update({
        userId: null, // Desvinculamos al usuario.
        originalUserId: callerUserId, // Guardamos un registro de quién la creó.
        name: `[Archivada] ${listData.name}`, // Cambiamos el nombre para que sea visible su estado.
        updatedAt: FieldValue.serverTimestamp()
      });

      logger.info(`Lista ${listId} desvinculada del usuario ${callerUserId} y archivada.`);

      return { success: true, message: 'Te has desvinculado de la lista. Tus reseñas han sido eliminadas, pero la lista permanece activa para los demás usuarios.' };
    }
    // --- FIN DE LA NUEVA LÓGICA ---

  } catch (error) {
    logger.error(`Error en deleteOrOrphanList para lista ${listId} y usuario ${callerUserId}:`, error);
    throw buildHttpsErrorFrom(
      error,
      'No pudimos completar la acción solicitada en este momento. Inténtalo de nuevo más tarde.'
    );
  }
});

// --- FUNCIÓN CALLABLE: createList ---
const createList = onCall(async (request) => {
  const data = request.data || {};
  const contextAuth = request.auth;

  if (!contextAuth) {
    logger.warn("createList: Intento de llamada no autenticado.", { structuredData: true });
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para crear una lista.');
  }

  const userId = contextAuth.uid;
  const { listName, criteriaDefinition, availableTags, isPublic, categoryId } = data;

  if (!listName || typeof listName !== 'string' || listName.trim() === "") {
    logger.warn(`createList: listName no proporcionado o inválido por el usuario ${userId}.`, { listNameProvided: listName, structuredData: true });
    throw new HttpsError('invalid-argument', 'El nombre de la lista es obligatorio y debe ser una cadena de texto.');
  }

  const listsRef = db.collection('lists');
  try {
    // Comprobar si ya existe una lista con ese nombre para este usuario
    const existingListQuery = await listsRef
      .where('userId', '==', userId)
      .where('name', '==', listName.trim()) // Comparar con el nombre saneado
      .limit(1)
      .get();

    if (!existingListQuery.empty) {
      logger.warn(`createList: Usuario ${userId} intentó crear lista duplicada: "${listName.trim()}"`, { structuredData: true });
      throw new HttpsError('already-exists', 'Ya tienes una lista con ese nombre.');
    }

    // Si no existe, proceder a crear la lista
    const clientPayload = sanitizeListPayload({
      name: listName,
      criteriaDefinition,
      availableTags,
      isPublic,
      categoryId
    });

    const newListData = {
      ...clientPayload,
      name: listName.trim(),
      userId: userId,
      criteriaDefinition: criteriaDefinition || {},
      availableTags: Array.isArray(availableTags) ? availableTags.map(tag => String(tag).trim()).filter(tag => tag) : [],
      isPublic: typeof isPublic === 'boolean' ? isPublic : true, // Por defecto pública
      categoryId: categoryId || "defaultCategory",
      reviewCount: 0,
      reactions: {},
      commentsCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const newListRef = await listsRef.add(newListData);
    logger.info(`createList: Lista "${listName.trim()}" creada con ID ${newListRef.id} por el usuario ${userId}`, { structuredData: true });
    return { listId: newListRef.id, message: 'Lista creada con éxito' };

  } catch (error) {
    logger.error(`Error en createList para el usuario ${userId} al intentar crear lista "${listName}":`, error, { structuredData: true });
    throw buildHttpsErrorFrom(
      error,
      'No pudimos crear la lista en este momento. Inténtalo de nuevo más tarde.'
    );
  }
});


// --- NUEVA FUNCIÓN CALLABLE: createListWithValidation ---

const createListWithValidation = onCall(async (request) => {
  const data = request.data;
  const contextAuth = request.auth;

  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado para crear una lista.');
  }

  const userId = contextAuth.uid;
  const listName = data.name;

  if (!listName || typeof listName !== 'string' || listName.trim() === '') {
    throw new HttpsError('invalid-argument', 'El nombre de la lista es requerido.');
  }

  const listsRef = db.collection('lists');

  try {
    // 1. Verificar si ya existe una lista con ese nombre para este usuario
    const existingListQuery = await listsRef
      .where('userId', '==', userId)
      .where('name', '==', listName.trim())
      .limit(1)
      .get();

    if (!existingListQuery.empty) {
      throw new HttpsError('already-exists', `Ya tienes una lista llamada "${listName.trim()}".`);
    }

    // 2. Crear la lista si no existe
    const sanitized = sanitizeListPayload(data);
    const newListData = {
      ...sanitized, // Usamos datos permitidos enviados desde el cliente
      name: listName.trim(),
      userId: userId,
      reviewCount: 0,
      reactions: {},
      commentsCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const newListRef = await listsRef.add(newListData);

    return { listId: newListRef.id, message: '¡Lista creada con éxito!' };

  } catch (error) {
    logger.error(`Error en createListWithValidation para usuario ${userId}, lista "${listName}":`, error);
    throw buildHttpsErrorFrom(
      error,
      'No pudimos crear la lista en este momento. Inténtalo de nuevo más tarde.'
    );
  }
});

// --- NUEVA FUNCIÓN CALLABLE: createListWithValidation ---
const updateListWithValidation = onCall(async (request) => {
  const data = request.data;
  const contextAuth = request.auth;

  // 1. Verificar autenticación
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado para actualizar una lista.');
  }

  const { listId, data: listData } = data;

  if (!listId) {
    throw new HttpsError('invalid-argument', 'El ID de la lista es obligatorio.');
  }
  if (!listData.name || typeof listData.name !== 'string' || listData.name.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'El nombre de la lista no puede estar vacío.');
  }

  const userId = contextAuth.uid;
  const listRef = db.collection('lists').doc(listId);

  try {
    const doc = await listRef.get();

    if (!doc.exists) {
      throw new HttpsError('not-found', 'La lista que intentas editar no existe.');
    }

    // 2. ¡LA VERIFICACIÓN DE SEGURIDAD CLAVE!
    // Nos aseguramos de que solo el dueño pueda editar.
    if (doc.data().userId !== userId) {
      throw new HttpsError('permission-denied', 'No tienes permiso para editar esta lista.');
    }

    // 3. Preparar los datos para la actualización
    const sanitized = sanitizeListPayload(listData);
    const updatePayload = {
      ...sanitized, // Usamos los datos permitidos que nos envía el cliente
      name: (listData.name || '').trim(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // 4. Actualizar la lista
    await listRef.update(updatePayload);

    return {
      status: 'success',
      message: '¡Lista actualizada con éxito!',
    };

  } catch (error) {
    logger.error(`Error en updateListWithValidation para lista ${listId} por usuario ${userId}:`, error);
    throw buildHttpsErrorFrom(
      error,
      'No pudimos actualizar la lista en este momento. Inténtalo nuevamente más tarde.'
    );
  }
});

// NUEVA FUNCIÓN: reverseGeocode
const reverseGeocode = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const auth = await requireAuthFromRequest(req, res);
    if (!auth) return;
    const { lat, lon } = req.query;
    const apiKey = await getGooglePlacesApiKey();

    if (!lat || !lon) {
      logger.warn("reverseGeocode: Latitud (lat) y longitud (lon) son requeridas.", { query: req.query, structuredData: true });
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!apiKey) {
      logger.error("reverseGeocode: GOOGLE_PLACES_API_KEY no está disponible en la configuración.", { structuredData: true });
      return res.status(500).json({ message: "Error de configuración del servidor (API Key no encontrada)." });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}&language=es`;

    logger.info("reverseGeocode: Fetching Google Geocoding API", { url: url.replace(apiKey, "REDACTED_API_KEY"), structuredData: true });

    try {
      const geocodeResponse = await fetch(url);
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status === "OK" && geocodeData.results && geocodeData.results.length > 0) {
        const firstResult = geocodeData.results[0];
        const formattedAddress = firstResult.formatted_address;

        let region = '';
        let city = '';
        let postalCode = '';

        firstResult.address_components.forEach(component => {
          if (component.types.includes('administrative_area_level_2') && !region) {
            region = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1') && !region) {
            region = component.long_name;
          }
          if (component.types.includes('locality')) {
            city = component.long_name;
          }
          if (component.types.includes('postal_code')) {
            postalCode = component.long_name;
          }
        });

        res.status(200).json({
          address: formattedAddress,
          region: region,
          city: city,
          postalCode: postalCode
        });
      } else if (geocodeData.status === "ZERO_RESULTS") {
        logger.warn("reverseGeocode: Google Geocoding API devolvió ZERO_RESULTS para:", { lat, lon, structuredData: true });
        res.status(404).json({ message: "No se encontró dirección para las coordenadas proporcionadas." });
      } else {
        logger.error("reverseGeocode: Error desde Google Geocoding API", { status: geocodeData.status, error_message: geocodeData.error_message, structuredData: true });
        res.status(500).json({ message: `Error de la API de Geocodificación de Google: ${geocodeData.status}`, details: geocodeData.error_message });
      }
    } catch (error) {
      logger.error("reverseGeocode: Error al contactar Google Geocoding API", error, { structuredData: true });
      res.status(500).json({ message: "Error interno al obtener la dirección.", error: error.message });
    }
  });
});

// ===================================================================
// === NUEVAS FUNCIONES PARA CONTADORES Y DATOS AGREGADOS          ===
// ===================================================================

async function recalculateListReviewMetrics(listId) {
  if (!listId) {
    logger.warn('recalculateListReviewMetrics: listId es requerido');
    return null;
  }

  // Use the aggregator to get grouped items and tags
  // This ensures consistency between "Group Page" logic and "List Stats"
  let groupedResult = null;
  try {
    groupedResult = await buildGroupedItemsForList(listId);
  } catch (e) {
    logger.error(`Error building grouped items for list ${listId}`, e);
  }

  // Calculate Aggregates from Groups (Preferred) or fall back to raw reviews
  let availableTags = new Set();
  let itemCount = 0;

  if (groupedResult && groupedResult.groupedReviews) {
    groupedResult.groupedReviews.forEach(group => {
      if (Array.isArray(group.groupTags)) {
        group.groupTags.forEach(tag => availableTags.add(tag));
      }
    });
    itemCount = groupedResult.groupedReviews.length;
  }

  const listRef = db.collection('lists').doc(listId);
  const reviewsSnap = await listRef.collection('reviews').get();

  // existing logic for averages (keep it for historical consistency or replace with groupedResult averages?)
  // For now, keep existing logic for scores to be safe, but use groupedResult for Tags and ItemCount
  const criteriaTotals = {};
  const criteriaCounts = {};
  let totalOverall = 0;
  let overallCount = 0;

  reviewsSnap.forEach((doc) => {
    const data = doc.data() || {};
    const overall = data.overallRating;
    if (typeof overall === 'number' && Number.isFinite(overall)) {
      totalOverall += overall;
      overallCount += 1;
    }

    const scores = data.scores || {};
    Object.entries(scores).forEach(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        criteriaTotals[key] = (criteriaTotals[key] || 0) + value;
        criteriaCounts[key] = (criteriaCounts[key] || 0) + 1;
      }
    });
  });

  const criteriaAverages = {};
  Object.entries(criteriaTotals).forEach(([key, total]) => {
    const count = criteriaCounts[key] || 0;
    if (count > 0) {
      criteriaAverages[key] = Number((total / count).toFixed(2));
    }
  });

  const averageRating = overallCount > 0
    ? Number((totalOverall / overallCount).toFixed(2))
    : null;

  // Merge tags from reviews with tags already defined in the list document.
  // Never remove tags the owner defined — only add ones found in reviews.
  const listSnap = await listRef.get();
  const existingTags = listSnap.exists && Array.isArray(listSnap.data().availableTags)
    ? listSnap.data().availableTags
    : [];
  existingTags.forEach(tag => availableTags.add(tag));

  const updateData = {
    reviewCount: reviewsSnap.size,
    averageRating,
    criteriaAverages,
    criteriaAveragesUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    availableTags: Array.from(availableTags).sort(),
    itemCount: itemCount > 0 ? itemCount : undefined
  };

  await listRef.update(updateData);
  logger.info(`recalculateListReviewMetrics: ${listId} => r:${updateData.reviewCount} avg:${averageRating} tags:${updateData.availableTags?.length}`);

  return {
    reviewCount: reviewsSnap.size,
    averageRating,
    criteriaAverages,
    availableTags: updateData.availableTags
  };
}

/**
 * Trigger que se dispara cuando una reseña es creada o eliminada.
 * Actualiza los contadores de reseñas en los documentos de usuario, lugar y lista.
 */
const updateAggregatesOnReviewChange = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const reviewId = event.params.reviewId;
  let recalculateList = false;

  // Caso 1: CREACIÓN de reseña
  if (!event.data.before.exists && event.data.after.exists) {
    const newData = event.data.after.data();
    const { userId, placeId } = newData;

    if (!userId) {
      logger.warn(`La reseña ${reviewId} no tiene userId. No se puede actualizar contador de usuario.`);
      return null;
    }

    const batch = db.batch();

    // Actualizar contadores (+1)
    const listRef = db.collection('lists').doc(listId);
    batch.update(listRef, { reviewCount: FieldValue.increment(1) });
    logger.info(`Programando incremento de 'reviewCount' en lista ${listId}.`);

    const userRef = db.collection('users').doc(userId);
    batch.update(userRef, { reviewsCount: FieldValue.increment(1) });
    logger.info(`Programando incremento de 'reviewsCount' en usuario ${userId}.`);

    if (placeId) {
      const placeRef = db.collection('places').doc(placeId);
      batch.update(placeRef, { reviewsCount: FieldValue.increment(1) });
      logger.info(`Programando incremento de 'reviewsCount' en lugar ${placeId}.`);
    }

    try {
      await batch.commit();
      logger.info(`Contadores actualizados exitosamente para nueva reseña ${reviewId}.`);
    } catch (error) {
      logger.error("Error al actualizar contadores para nueva reseña:", error);
    }
    recalculateList = true;
  }

  // Caso 2: ELIMINACIÓN de reseña
  if (event.data.before.exists && !event.data.after.exists) {
    const oldData = event.data.before.data();
    const { userId, placeId } = oldData;

    if (!userId) {
      logger.warn(`La reseña eliminada ${reviewId} no tenía userId. No se puede actualizar contador de usuario.`);
      return null;
    }

    const batch = db.batch();

    // Actualizar contadores (-1)
    const listRef = db.collection('lists').doc(listId);
    batch.update(listRef, { reviewCount: FieldValue.increment(-1) });
    logger.info(`Programando decremento de 'reviewCount' en lista ${listId}.`);

    const userRef = db.collection('users').doc(userId);
    batch.update(userRef, { reviewsCount: FieldValue.increment(-1) });
    logger.info(`Programando decremento de 'reviewsCount' en usuario ${userId}.`);

    if (placeId) {
      const placeRef = db.collection('places').doc(placeId);
      batch.update(placeRef, { reviewsCount: FieldValue.increment(-1) });
      logger.info(`Programando decremento de 'reviewsCount' en lugar ${placeId}.`);
    }

    try {
      await batch.commit();
      logger.info(`Contadores actualizados exitosamente para reseña eliminada ${reviewId}.`);
    } catch (error) {
      logger.error("Error al actualizar contadores para reseña eliminada:", error);
    }
    recalculateList = true;
  }

  // Caso 3: ACTUALIZACIÓN de reseña
  if (event.data.before.exists && event.data.after.exists) {
    const oldData = event.data.before.data();
    const newData = event.data.after.data();

    const oldPlaceId = oldData.placeId;
    const newPlaceId = newData.placeId;

    // Solo proceder si cambió el placeId
    if (oldPlaceId !== newPlaceId) {
      logger.info(`Reseña ${reviewId} cambió de lugar: ${oldPlaceId || 'null'} -> ${newPlaceId || 'null'}`);

      const batch = db.batch();

      // Decrementar contador del lugar anterior (si existía)
      if (oldPlaceId) {
        const oldPlaceRef = db.collection('places').doc(oldPlaceId);
        batch.update(oldPlaceRef, { reviewsCount: FieldValue.increment(-1) });
        logger.info(`Programando decremento de 'reviewsCount' en lugar anterior ${oldPlaceId}.`);
      }

      // Incrementar contador del lugar nuevo (si existe)
      if (newPlaceId) {
        const newPlaceRef = db.collection('places').doc(newPlaceId);
        batch.update(newPlaceRef, { reviewsCount: FieldValue.increment(1) });
        logger.info(`Programando incremento de 'reviewsCount' en lugar nuevo ${newPlaceId}.`);
      }

      try {
        await batch.commit();
        logger.info(`Contadores de lugares actualizados exitosamente para reseña ${reviewId}.`);
      } catch (error) {
        logger.error("Error al actualizar contadores de lugares:", error);
      }
    } else {
      logger.info(`Reseña ${reviewId} actualizada sin cambio de lugar. No se modifican contadores.`);
    }
    recalculateList = true;
  }

  if (recalculateList) {
    try {
      await recalculateListReviewMetrics(listId);
    } catch (error) {
      logger.error(`updateAggregatesOnReviewChange: error al recalcular métricas de lista ${listId}`, error);
    }
    return null;
  }

  logger.warn(`Caso no manejado en updateAggregatesOnReviewChange para reseña ${reviewId}`);
  return null;
});


/**
* Trigger que se dispara cuando una lista es creada, actualizada o eliminada.
* Actualiza los contadores de listas públicas y privadas en el documento del usuario.
*/
const updateUserStatsOnListChange = onDocumentWritten("lists/{listId}", async (event) => {
  let userRef;
  let updates = {};

  // Caso 1: Se crea una lista NUEVA
  if (!event.data.before.exists && event.data.after.exists) {
    const listData = event.data.after.data();
    if (!listData.userId) return null; // Lista "huérfana", no hacer nada
    userRef = db.collection('users').doc(listData.userId);
    const fieldToIncrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
    updates[fieldToIncrement] = FieldValue.increment(1);
    logger.info(`Nueva lista creada por ${listData.userId}. Incrementando ${fieldToIncrement}.`);
  }
  // Caso 2: Se elimina una lista
  else if (event.data.before.exists && !event.data.after.exists) {
    const listData = event.data.before.data();
    if (!listData.userId) return null; // Lista "huérfana" eliminada, no hay usuario que actualizar
    userRef = db.collection('users').doc(listData.userId);
    const fieldToDecrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
    updates[fieldToDecrement] = FieldValue.increment(-1);
    logger.info(`Lista eliminada por ${listData.userId}. Decrementando ${fieldToDecrement}.`);
  }
  // Caso 3: Se actualiza una lista (nos interesa si cambia la privacidad o el dueño)
  else if (event.data.before.exists && event.data.after.exists) {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Cambio de propietario (cuando una lista se "orfana")
    if (beforeData.userId && !afterData.userId) {
      userRef = db.collection('users').doc(beforeData.userId);
      const fieldToDecrement = beforeData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[fieldToDecrement] = FieldValue.increment(-1);
      logger.info(`Lista desvinculada del usuario ${beforeData.userId}. Decrementando contadores.`);
    }
    // Cambio de privacidad
    else if (beforeData.isPublic !== afterData.isPublic) {
      if (!afterData.userId) return null;
      userRef = db.collection('users').doc(afterData.userId);
      const oldField = beforeData.isPublic ? 'publicListsCount' : 'privateListsCount';
      const newField = afterData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[oldField] = FieldValue.increment(-1);
      updates[newField] = FieldValue.increment(1);
      logger.info(`Visibilidad de lista cambiada por ${afterData.userId}. Actualizando contadores.`);
    } else {
      return null; // No hay cambio relevante, no hacemos nada
    }
  }

  if (userRef && Object.keys(updates).length > 0) {
    try {
      await userRef.update(updates);
      logger.info("Contadores de listas del usuario actualizados correctamente.");
    } catch (error) {
      logger.error("Error actualizando contadores de listas del usuario:", error);
    }
  }
});


/**
* Trigger que se dispara cuando un comentario es creado o eliminado.
* Actualiza el contador de comentarios en el documento de la lista y del usuario.
* (Asume que los comentarios están en lists/{listId}/comments/{commentId})
*/
const updateAggregatesOnCommentChange = onDocumentWritten("lists/{listId}/comments/{commentId}", async (event) => {
  if (event.data.before.exists && event.data.after.exists) {
    return null;
  }

  const change = event.data.after.exists ? 1 : -1;
  const listId = event.params.listId;
  const data = change === 1 ? event.data.after.data() : event.data.before.data();
  const userId = data.userId;

  const batch = db.batch();

  // Actualizar contador de la LISTA
  const listRef = db.collection('lists').doc(listId);
  batch.update(listRef, { commentsCount: FieldValue.increment(change) });
  logger.info(`Contador 'commentsCount' en lista ${listId} se actualizará en ${change}.`);

  // Actualizar contador del USUARIO (si tiene userId)
  if (userId) {
    const userRef = db.collection('users').doc(userId);
    batch.update(userRef, { commentsCount: FieldValue.increment(change) });
    logger.info(`Contador 'commentsCount' en usuario ${userId} se actualizará en ${change}.`);
  }

  try {
    await batch.commit();
    logger.info("Contadores de comentarios actualizados.");
  } catch (error) {
    logger.error("Error actualizando contadores de comentarios:", error);
  }
});


const toggleFollowUser = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado para seguir a otros usuarios.');
  }

  const currentUserId = contextAuth.uid;
  const userIdToFollow = request.data.userIdToFollow;

  if (!userIdToFollow) {
    throw new HttpsError('invalid-argument', 'Se requiere el ID del usuario a seguir (userIdToFollow).');
  }

  if (currentUserId === userIdToFollow) {
    throw new HttpsError('invalid-argument', 'No te puedes seguir a ti mismo, genio.');
  }

  const currentUserRef = db.collection('users').doc(currentUserId);
  const userToFollowRef = db.collection('users').doc(userIdToFollow);
  const followingRef = currentUserRef.collection('following').doc(userIdToFollow);
  const followerRef = userToFollowRef.collection('followers').doc(currentUserId);

  try {
    const doc = await followingRef.get();
    const batch = db.batch();

    if (doc.exists) {
      // --- Lógica para DEJAR DE SEGUIR ---
      batch.delete(followingRef);
      batch.delete(followerRef);

      await batch.commit();
      logger.info(`Usuario ${currentUserId} ha dejado de seguir a ${userIdToFollow}.`);
      return { status: 'unfollowed', message: 'Has dejado de seguir a este usuario.' };
    } else {
      // --- Lógica para SEGUIR ---
      batch.set(followingRef, { followedAt: FieldValue.serverTimestamp() });
      batch.set(followerRef, { followedAt: FieldValue.serverTimestamp() });

      await batch.commit();
      logger.info(`Usuario ${currentUserId} ahora sigue a ${userIdToFollow}.`);

      return { status: 'followed', message: 'Ahora sigues a este usuario.' };
    }
  } catch (error) {
    logger.error(`Error en toggleFollowUser para ${currentUserId} -> ${userIdToFollow}:`, error);
    throw new HttpsError('internal', 'Ocurrió un error al procesar la solicitud.');
  }
});

const resolveChatParticipants = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  const rawIdentifiers = request.data && request.data.identifiers;
  if (!Array.isArray(rawIdentifiers) || rawIdentifiers.length === 0) {
    throw new HttpsError('invalid-argument', 'Debes proporcionar los identificadores de los usuarios.');
  }

  const normalizeIdentifier = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    let cleaned = value.trim();
    cleaned = cleaned.replace(/^[@#]+/, '');
    cleaned = cleaned.replace(/[\s,;]+$/, '');
    return cleaned.trim();
  };

  const identifiers = rawIdentifiers
    .map(normalizeIdentifier)
    .filter(identifier => identifier.length > 0);

  if (!identifiers.length) {
    throw new HttpsError('invalid-argument', 'Debes proporcionar identificadores válidos.');
  }

  const results = [];
  const seen = new Set();

  for (const identifier of identifiers) {
    const dedupeKey = identifier.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    let userDoc = null;

    try {
      if (identifier.includes('@') && identifier.includes('.')) {
        const lowered = identifier.toLowerCase();
        const emailSnapshot = await db.collection('users').where('email', '==', lowered).limit(1).get();
        if (!emailSnapshot.empty) {
          userDoc = emailSnapshot.docs[0];
        } else if (lowered !== identifier) {
          const originalSnapshot = await db.collection('users').where('email', '==', identifier).limit(1).get();
          if (!originalSnapshot.empty) {
            userDoc = originalSnapshot.docs[0];
          }
        }
      }

      if (!userDoc) {
        const usernameSnapshot = await db.collection('users').where('username', '==', identifier).limit(1).get();
        if (!usernameSnapshot.empty) {
          userDoc = usernameSnapshot.docs[0];
        }
      }

      if (!userDoc) {
        const possibleDoc = await db.collection('users').doc(identifier).get();
        if (possibleDoc.exists) {
          userDoc = possibleDoc;
        }
      }

      if (userDoc && userDoc.exists) {
        if (userDoc.id === contextAuth.uid) {
          continue; // No incluimos al propio usuario
        }
        if (results.some(existing => existing.uid === userDoc.id)) {
          continue;
        }
        const data = userDoc.data();
        results.push({
          uid: userDoc.id,
          username: data.username || '',
          displayName: data.displayName || '',
          email: data.email || '',
          photoUrl: data.photoUrl || ''
        });
      }
    } catch (error) {
      logger.error(`resolveChatParticipants: error buscando identificador ${identifier}`, error);
    }
  }

  return { users: results };
});

// En functions/index.js, reemplaza la función getPlacesForList entera por esta:

const getPlacesForList = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }
  const listId = request.data.listId;
  if (!listId) {
    throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista.');
  }

  try {
    const reviewsSnapshot = await db.collection('lists').doc(listId).collection('reviews').get();
    if (reviewsSnapshot.empty) {
      return { places: [] };
    }

    // Agrupamos reseñas por placeId para calcular la media
    const placesAggregates = {};

    reviewsSnapshot.forEach(doc => {
      const review = doc.data();
      const placeId = review.placeId;
      if (!placeId) return;

      if (!placesAggregates[placeId]) {
        placesAggregates[placeId] = {
          totalScore: 0,
          count: 0,
          placeId,
          items: new Map()
        };
      }

      const aggregate = placesAggregates[placeId];
      const overallRating = typeof review.overallRating === 'number' ? review.overallRating : 0;
      aggregate.totalScore += overallRating;
      aggregate.count++;

      const rawItemName = typeof review.itemName === 'string' ? review.itemName.trim() : '';
      const itemName = rawItemName || 'General';
      const itemAggregate = aggregate.items.get(itemName) || { total: 0, count: 0, name: itemName };
      itemAggregate.total += overallRating;
      itemAggregate.count += 1;
      aggregate.items.set(itemName, itemAggregate);
    });

    const placeIds = Object.keys(placesAggregates);
    if (placeIds.length === 0) {
      return { places: [] };
    }

    const placeDocs = await getPlaceDocsByIds(placeIds);

    const placesForMap = [];
    placeDocs.forEach(doc => {
      const place = doc.data();
      const aggregate = placesAggregates[doc.id];

      if (place.location && place.location.latitude && place.location.longitude) {
        const itemAverages = Array.from(aggregate.items.values()).map(itemAgg => {
          const avg = itemAgg.count > 0 ? Number((itemAgg.total / itemAgg.count).toFixed(1)) : 0;
          return {
            name: itemAgg.name,
            avgGeneralScore: avg,
            itemCount: itemAgg.count
          };
        }).sort((a, b) => {
          if ((b.avgGeneralScore || 0) === (a.avgGeneralScore || 0)) {
            return (b.itemCount || 0) - (a.itemCount || 0);
          }
          return (b.avgGeneralScore || 0) - (a.avgGeneralScore || 0);
        });

        const topItems = itemAverages.slice(0, 3);
        const bestItemScore = topItems.length > 0 ? topItems[0].avgGeneralScore : 0;
        const avgGeneralScore = aggregate.count > 0
          ? Number((aggregate.totalScore / aggregate.count).toFixed(1))
          : 0;

        placesForMap.push({
          id: doc.id,
          name: place.name,
          location: place.location,
          mainImageUrl: place.mainImageUrl || null,
          avgGeneralScore,
          bestItemScore,
          topItems
        });
      }
    });

    return { places: placesForMap };

  } catch (error) {
    logger.error(`Error en getPlacesForList para lista ${listId}:`, error);
    throw new HttpsError('internal', 'No se pudieron obtener los lugares para el mapa.');
  }
});

const getPlaceDetails = onCall(async (request) => {
  // --- Usamos 'request' como parámetro, al estilo V2 ---
  logger.info("Función getPlaceDetails invocada. Payload recibido:", request.data);

  // Obtenemos los datos de request.data
  const placeId = request.data.placeId;

  if (!placeId) {
    logger.error("Error en getPlaceDetails: placeId no encontrado en el payload.", {
      payloadRecibido: request.data,
      auth: request.auth // La autenticación ahora es request.auth
    });
    throw new HttpsError('invalid-argument', 'El ID del lugar es requerido.');
  }

  try {
    // 1. Obtener datos básicos del lugar
    let placeDoc = await db.collection('places').doc(placeId).get();
    if (!placeDoc.exists) {
      // Fallback: buscar por googlePlaceId
      const altSnap = await db.collection('places').where('googlePlaceId', '==', placeId).limit(1).get();
      if (!altSnap.empty) {
        placeDoc = altSnap.docs[0];
      }
    }
    if (!placeDoc.exists) {
      throw new HttpsError('not-found', 'El lugar no fue encontrado.');
    }
    const placeData = { id: placeDoc.id, ...placeDoc.data() };

    // 2. Obtener todas las reseñas asociadas a este lugar (ordenadas por creación más reciente)
    const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();
    const allReviews = reviewsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? Date.parse(a.createdAt) : 0);
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? Date.parse(b.createdAt) : 0);
        return tB - tA;
      });

    // 3. Agrupar reseñas por itemName para la pestaña "Grupos"
    const groupedByItem = {};
    allReviews.forEach(review => {
      const itemName = review.itemName || "General";
      if (!groupedByItem[itemName]) {
        groupedByItem[itemName] = {
          itemName: itemName,
          establishmentName: placeData.name,
          placeId: placeId,
          listId: review.listId, // Ojo: esto tomará el listId de la última reseña del grupo
          itemCount: 0,
          totalGeneralScore: 0,
          avgScores: {},
          criteriaTotals: {},
          criteriaCounts: {},
          allTags: [],
          thumbnailUrl: review.photoUrl // Tomamos la foto de la primera reseña que encontramos
        };
      }
      const group = groupedByItem[itemName];
      group.itemCount++;
      group.totalGeneralScore += review.overallRating || 0;
      if (review.userTags) group.allTags.push(...review.userTags);
      if (review.scores) {
        for (const [critKey, score] of Object.entries(review.scores)) {
          group.criteriaTotals[critKey] = (group.criteriaTotals[critKey] || 0) + score;
          group.criteriaCounts[critKey] = (group.criteriaCounts[critKey] || 0) + 1;
        }
      }
    });

    const groupCards = Object.values(groupedByItem).map(group => {
      group.avgGeneralScore = group.itemCount > 0 ? parseFloat((group.totalGeneralScore / group.itemCount).toFixed(1)) : 0;
      group.groupTags = [...new Set(group.allTags)].slice(0, 5);
      for (const critKey in group.criteriaTotals) {
        group.avgScores[critKey] = group.criteriaTotals[critKey] / group.criteriaCounts[critKey];
      }
      delete group.criteriaTotals;
      delete group.criteriaCounts;
      delete group.allTags;
      delete group.totalGeneralScore;
      return group;
    });

    // 4. Devolver todo el paquete de datos
    return {
      placeInfo: placeData,
      groups: groupCards,
      latestReviews: allReviews.slice(0, 10)
    };

  } catch (error) {
    logger.error(`Error en getPlaceDetails para placeId ${placeId}:`, error);
    throw new HttpsError('internal', 'No se pudieron obtener los detalles del lugar.');
  }
});

// En functions/index.js

const getGroupsForPlace = onRequest(async (req, res) => {
  // *** LA SOLUCIÓN CLAVE: Envolvemos todo en cors ***
  cors(req, res, async () => {
    try {
      // En funciones onRequest, los datos vienen en req.body.data
      const { placeId } = req.body.data;

      if (!placeId) {
        logger.error("getGroupsForPlace: placeId no fue proporcionado en el cuerpo de la petición.");
        // Devolvemos un error usando res.status()
        return res.status(400).json({ error: "La función debe ser llamada con un 'placeId'." });
      }

      const groupsSnapshot = await db.collection("groups")
        .where("members", "array-contains", placeId).get();

      if (groupsSnapshot.empty) {
        logger.log(`No se encontraron grupos para el placeId: ${placeId}`);
        // Devolvemos la respuesta correcta usando res.json()
        return res.status(200).json({ data: [] });
      }

      const groupPromises = groupsSnapshot.docs.map(async (groupDoc) => {
        const groupData = groupDoc.data();
        const listId = groupData.listId;
        let listName = "Lista no especificada";

        if (listId) {
          const listDoc = await db.collection("lists").doc(listId).get();
          if (listDoc.exists) {
            listName = listDoc.data().name;
          } else {
            listName = "Lista eliminada";
          }
        }

        return {
          id: groupDoc.id,
          name: groupData.name,
          icon: groupData.icon || "fa-users",
          listName: listName,
        };
      });

      const enrichedGroups = await Promise.all(groupPromises);
      // Devolvemos la respuesta correcta en un objeto { data: ... }
      return res.status(200).json({ data: enrichedGroups });

    } catch (error) {
      logger.error("Error al buscar grupos para el lugar:", error);
      // Devolvemos un error usando res.status()
      return res.status(500).json({ error: "No se pudieron obtener los grupos." });
    }
  });
});

const updatePlaceAggregates = onDocumentWritten("reviews/{reviewId}", async (event) => {
  // Hemos usado un collectionGroup, por lo que el path es "reviews/{reviewId}"
  // Si tus reseñas estuvieran en "lists/{listId}/reviews/{reviewId}", el path sería ese.
  // ¡Asegúrate de que el path coincide con tu estructura!

  let placeId = null;
  let needsRecalculation = false;

  // Se crea o borra una reseña, o cambia su puntuación
  if (event.data.before.exists || event.data.after.exists) {
    const beforeData = event.data.before.data() || {};
    const afterData = event.data.after.data() || {};

    // Si se crea/borra o si la puntuación general cambia, recalculamos.
    if (beforeData.overallRating !== afterData.overallRating) {
      needsRecalculation = true;
    }
    placeId = afterData.placeId || beforeData.placeId;
  }

  if (!needsRecalculation || !placeId) {
    logger.info(`No se requiere recálculo para la reseña. PlaceId: ${placeId}, NeedsRecalculation: ${needsRecalculation}`);
    return null;
  }

  logger.info(`Recalculando agregados para el lugar: ${placeId}`);

  // 1. Obtenemos TODAS las reseñas para ese lugar
  const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();

  const reviews = reviewsSnapshot.docs.map(doc => doc.data());

  if (reviews.length === 0) {
    // Si no quedan reseñas, reseteamos los contadores
    await db.collection('places').doc(placeId).update({
      reviewsCount: 0,
      averageRating: null // O 0, como prefieras
    });
    logger.info(`No quedan reseñas para ${placeId}. Contadores reseteados.`);
    return null;
  }

  // 2. Calculamos la nueva media
  const totalRating = reviews.reduce((sum, review) => sum + (review.overallRating || 0), 0);
  const averageRating = totalRating / reviews.length;
  const reviewsCount = reviews.length;

  // 3. Actualizamos el documento del lugar
  await db.collection('places').doc(placeId).update({
    reviewsCount: reviewsCount,
    averageRating: parseFloat(averageRating.toFixed(2)) // Guardamos con 2 decimales
  });

  logger.info(`Agregados para ${placeId} actualizados: ${reviewsCount} reseñas, valoración media ${averageRating.toFixed(2)}.`);
  return null;
});

/**
 * Trigger que se dispara cuando una reseña cambia en CUALQUIER lista,
 * para recalcular la valoración media y el contador de reseñas del LUGAR al que pertenece.
 */
const updatePlaceAggregatesOnReviewChange = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  const placeIdToDecrement = beforeData?.placeId;
  const placeIdToIncrement = afterData?.placeId;

  // Si el placeId no ha cambiado (solo se ha editado el texto, por ejemplo),
  // pero la puntuación sí, recalculamos para ese único lugar.
  if (placeIdToDecrement && placeIdToDecrement === placeIdToIncrement) {
    if (beforeData.overallRating !== afterData.overallRating) {
      await recalculateAggregatesForPlace(placeIdToIncrement);
    } else {
      logger.info(`La reseña ${event.params.reviewId} se actualizó sin cambiar la puntuación. No se requiere recálculo.`);
    }
  } else {
    // Si el placeId ha cambiado, se ha creado o se ha borrado una reseña,
    // actualizamos los contadores de los lugares implicados.
    if (placeIdToDecrement) {
      await recalculateAggregatesForPlace(placeIdToDecrement);
    }
    if (placeIdToIncrement) {
      await recalculateAggregatesForPlace(placeIdToIncrement);
    }
  }
  return null;
});

// --- Función auxiliar para mantener el código limpio y reutilizable ---
async function recalculateAggregatesForPlace(placeId) {
  if (!placeId) {
    logger.warn("recalculateAggregatesForPlace fue llamada sin un placeId.");
    return;
  }

  logger.info(`Recalculando agregados para el lugar: ${placeId}.`);

  const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();
  const reviews = reviewsSnapshot.docs.map(doc => doc.data());

  let averageRating = null;
  const reviewsCount = reviews.length;

  if (reviewsCount > 0) {
    const totalRating = reviews.reduce((sum, review) => sum + (review.overallRating || 0), 0);
    averageRating = parseFloat((totalRating / reviewsCount).toFixed(2));
  }

  const placeRef = db.collection('places').doc(placeId);
  try {
    await placeRef.update({
      reviewsCount: reviewsCount,
      averageRating: averageRating
    });
    logger.info(`Agregados para ${placeId} actualizados: ${reviewsCount} reseñas, valoración media ${averageRating}.`);
  } catch (error) {
    logger.error(`Error al actualizar el documento del lugar ${placeId}:`, error);
  }
}

function replaceTagInArray(values, fromTag, toTag) {
  if (!Array.isArray(values)) {
    return { changed: false, value: values };
  }
  const fromTrimmed = typeof fromTag === 'string' ? fromTag.trim() : '';
  const toTrimmed = typeof toTag === 'string' ? toTag.trim() : '';
  let changed = false;
  const mapped = values.reduce((acc, tag) => {
    if (typeof tag !== 'string') {
      return acc;
    }
    const trimmed = tag.trim();
    if (!trimmed) {
      return acc;
    }
    let next = trimmed;
    if (trimmed === fromTrimmed) {
      next = toTrimmed;
      changed = true;
    }
    acc.push(next);
    return acc;
  }, []);

  if (!changed) {
    return { changed: false, value: values };
  }

  const deduped = [];
  const seen = new Set();
  mapped.forEach(tag => {
    if (!seen.has(tag)) {
      seen.add(tag);
      deduped.push(tag);
    }
  });

  return { changed: true, value: deduped };
}

function buildListTagUpdate(listData, fromTag, toTag) {
  const updatePayload = {};
  let changed = false;

  const available = replaceTagInArray(listData?.availableTags, fromTag, toTag);
  if (available.changed) {
    updatePayload.availableTags = available.value;
    changed = true;
  }

  const fixed = replaceTagInArray(listData?.fixedTags, fromTag, toTag);
  if (fixed.changed) {
    updatePayload.fixedTags = fixed.value;
    changed = true;
  }

  const tagsDefinition = listData?.tagsDefinition;
  if (tagsDefinition && typeof tagsDefinition === 'object' && !Array.isArray(tagsDefinition)) {
    const nextDefinition = { ...tagsDefinition };
    let definitionChanged = false;

    const fixedDef = replaceTagInArray(tagsDefinition.fixed, fromTag, toTag);
    if (fixedDef.changed) {
      nextDefinition.fixed = fixedDef.value;
      definitionChanged = true;
    }

    const availableDef = replaceTagInArray(tagsDefinition.userAvailable, fromTag, toTag);
    if (availableDef.changed) {
      nextDefinition.userAvailable = availableDef.value;
      definitionChanged = true;
    }

    if (definitionChanged) {
      updatePayload.tagsDefinition = nextDefinition;
      changed = true;
    }
  }

  return { changed, updatePayload };
}

async function fetchReviewDocsByTag(tag) {
  try {
    const snapshot = await db.collectionGroup('reviews')
      .where('userTags', 'array-contains', tag)
      .get();
    return { docs: snapshot.docs, usedFallback: false };
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : error?.code;
    if (code === 9 || code === 'failed-precondition') {
      logger.warn('adminReplaceTag: collectionGroup query failed, fallback to per-list queries.', { code });
      const listSnapshot = await db.collection('lists').get();
      const listRefs = listSnapshot.docs.map(doc => doc.ref);
      const docs = [];
      const chunkSize = 10;

      for (let i = 0; i < listRefs.length; i += chunkSize) {
        const chunk = listRefs.slice(i, i + chunkSize);
        const chunkSnapshots = await Promise.all(chunk.map(ref =>
          ref.collection('reviews').where('userTags', 'array-contains', tag).get()
        ));
        chunkSnapshots.forEach(chunkSnap => {
          chunkSnap.forEach(doc => docs.push(doc));
        });
      }

      return { docs, usedFallback: true };
    }
    throw error;
  }
}

const adminReplaceTag = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  try {
    await assertJefeAccess(contextAuth.uid, 'No tienes permiso para ejecutar esta operacion.');
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminReplaceTag: Error al verificar permisos", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { fromTag, toTag, targets, dryRun } = request.data || {};
  const fromTrimmed = typeof fromTag === 'string' ? fromTag.trim() : '';
  const toTrimmed = typeof toTag === 'string' ? toTag.trim() : '';

  if (!fromTrimmed || !toTrimmed) {
    throw new HttpsError('invalid-argument', 'fromTag y toTag son obligatorios.');
  }
  if (fromTrimmed === toTrimmed) {
    throw new HttpsError('invalid-argument', 'Las etiquetas deben ser diferentes.');
  }

  const targetValue = typeof targets === 'string' ? targets : 'lists-reviews';
  const applyLists = targetValue === 'lists' || targetValue === 'lists-reviews' || targetValue === 'both';
  const applyReviews = targetValue === 'reviews' || targetValue === 'lists-reviews' || targetValue === 'both';
  const shouldDryRun = Boolean(dryRun);

  const summary = {
    fromTag: fromTrimmed,
    toTag: toTrimmed,
    dryRun: shouldDryRun,
    listsMatched: 0,
    listsUpdated: 0,
    reviewsMatched: 0,
    reviewsUpdated: 0
  };

  const commitBatchIfNeeded = async (batchState) => {
    if (batchState.count === 0) return;
    await batchState.batch.commit();
    batchState.batch = db.batch();
    batchState.count = 0;
  };

  if (applyLists) {
    const listsSnapshot = await db.collection('lists').get();
    const batchState = { batch: db.batch(), count: 0 };

    for (const doc of listsSnapshot.docs) {
      const listData = doc.data() || {};
      const { changed, updatePayload } = buildListTagUpdate(listData, fromTrimmed, toTrimmed);
      if (!changed) {
        continue;
      }
      summary.listsMatched += 1;
      if (!shouldDryRun) {
        batchState.batch.update(doc.ref, updatePayload);
        batchState.count += 1;
        if (batchState.count >= 450) {
          await commitBatchIfNeeded(batchState);
        }
      }
    }

    if (!shouldDryRun) {
      await commitBatchIfNeeded(batchState);
      summary.listsUpdated = summary.listsMatched;
    } else {
      summary.listsUpdated = summary.listsMatched;
    }
  }

  if (applyReviews) {
    const { docs: reviewDocs, usedFallback } = await fetchReviewDocsByTag(fromTrimmed);
    if (usedFallback) {
      logger.info('adminReplaceTag: usando fallback per-list para reseñas.');
    }

    const batchState = { batch: db.batch(), count: 0 };
    for (const doc of reviewDocs) {
      const reviewData = doc.data() || {};
      const updated = replaceTagInArray(reviewData.userTags, fromTrimmed, toTrimmed);
      if (!updated.changed) {
        continue;
      }
      summary.reviewsMatched += 1;
      if (!shouldDryRun) {
        batchState.batch.update(doc.ref, { userTags: updated.value });
        batchState.count += 1;
        if (batchState.count >= 450) {
          await commitBatchIfNeeded(batchState);
        }
      }
    }

    if (!shouldDryRun) {
      await commitBatchIfNeeded(batchState);
      summary.reviewsUpdated = summary.reviewsMatched;
    } else {
      summary.reviewsUpdated = summary.reviewsMatched;
    }
  }

  logger.info('adminReplaceTag completado', summary);
  return summary;
});

const adminUpdateAllPlaces = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  // Admin check
  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminUpdateAllPlaces: Error al verificar permisos de admin", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) {
    logger.error("adminUpdateAllPlaces: GOOGLE_PLACES_API_KEY no está disponible.");
    throw new HttpsError('internal', 'Error de configuración del servidor (Places API Key no encontrada).');
  }

  const placesRef = db.collection('places');
  let batch = db.batch();
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let writeCount = 0;

  try {
    const snapshot = await placesRef.get();
    const places = snapshot.docs;

    for (const doc of places) {
      const placeData = doc.data();
      const placeId = placeData.googlePlaceId || doc.id; // Fallback to doc id when missing.

      if (!placeId) {
        skippedCount++;
        continue;
      }

      // Campos soportados por Place Details legacy
      const fields = "name,place_id,formatted_address,geometry,url,photos,price_level,website,international_phone_number,vicinity,address_components,rating,user_ratings_total,types";
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=${fields}&language=es`;

      try {
        const response = await fetch(url);
        const details = await response.json();

        if (details.status === "OK" && details.result) {
          const result = details.result;
          const accessibilityOptions = await fetchPlaceAccessibilityOptions(placeId, apiKey);
          const addressFields = extractAddressFields(result.address_components);
          const resolvedName = resolveText(result.name, placeData.name);
          const resolvedAddress = resolveText(result.formatted_address, placeData.formatted_address || placeData.address);
          const resolvedLocation = resolvePlaceLocation(result, placeData);
          const resolvedTypes = resolveTypeArray(result.types, placeData.types);
          const resolvedGooglePlaceId = resolveText(result.place_id, placeData.googlePlaceId || placeId);
          const resolvedGoogleMapsUrl = resolveText(result.url, placeData.googleMapsUrl);
          const resolvedWebsite = resolveText(result.website, placeData.website);
          const resolvedPhone = resolveText(result.international_phone_number, placeData.phone);
          const resolvedVicinity = resolveText(result.vicinity, placeData.vicinity);
          const resolvedNameNormalized = resolvedName
            ? resolvedName.toLowerCase()
            : resolveText(placeData.name_normalized, null);
          const resolvedAddressNormalized = resolvedAddress
            ? resolvedAddress.toLowerCase()
            : resolveText(placeData.address_normalized, null);
          const resolvedCity = resolveText(addressFields.city, placeData.city);
          const resolvedRegion = resolveText(addressFields.region, placeData.region);
          const resolvedProvince = resolveText(addressFields.province, placeData.province);
          const resolvedCountry = resolveText(addressFields.country, placeData.country);
          const resolvedPostalCode = resolveText(addressFields.postalCode, placeData.postalCode);
          const previousPhotoReference = placeData.mainImagePhotoReference || null;
          const previousMainImageUrl = placeData.mainImageUrl || null;
          const primaryPhotoReference = (result.photos && result.photos.length > 0) ? result.photos[0].photo_reference : null;
          let resolvedMainImageUrl = previousMainImageUrl;
          let mainImagePhotoReference = previousPhotoReference;

          if (primaryPhotoReference) {
            const candidatePhotoUrl = await resolveGooglePhotoUrl(primaryPhotoReference, apiKey, 400);
            if (candidatePhotoUrl) {
              resolvedMainImageUrl = candidatePhotoUrl;
              mainImagePhotoReference = primaryPhotoReference;
            }
          }

          const updateData = {
            name: resolvedName,
            name_normalized: resolvedNameNormalized,
            googlePlaceId: resolvedGooglePlaceId,
            formatted_address: resolvedAddress,
            address: resolvedAddress,
            address_normalized: resolvedAddressNormalized,
            city: resolvedCity,
            region: resolvedRegion,
            province: resolvedProvince,
            country: resolvedCountry,
            postalCode: resolvedPostalCode,
            googleMapsUrl: resolvedGoogleMapsUrl,
            mainImageUrl: resolvedMainImageUrl,
            mainImagePhotoReference: mainImagePhotoReference,
            priceLevel: resolveNumber(result.price_level, placeData.priceLevel),
            website: resolvedWebsite,
            phone: resolvedPhone,
            vicinity: resolvedVicinity,
            googleRating: resolveNumber(result.rating, placeData.googleRating),
            googleUserRatingsTotal: resolveNumber(result.user_ratings_total, placeData.googleUserRatingsTotal),
            types: resolvedTypes,
            // Accesibilidad via Places API v1; el resto se preserva.
            accessibility: resolveAccessibilityPayload(accessibilityOptions, placeData.accessibility),
            serviceOptions: placeData.serviceOptions || null,
            updatedAt: FieldValue.serverTimestamp(),
            lastGoogleSync: FieldValue.serverTimestamp()
          };

          if (resolvedLocation) {
            updateData.location = resolvedLocation;
            updateData.coordinates = resolvedLocation;
          }

          pruneNullishKeys(updateData);

          batch.update(doc.ref, updateData);
          writeCount++;
          updatedCount++;

          if (writeCount >= 499) {
            await batch.commit();
            batch = db.batch();
            writeCount = 0;
          }
        } else {
          logger.error(`Error fetching details for placeId ${placeId}: ${details.status} - ${details.error_message || ''}`);
          errorCount++;
        }
      } catch (fetchError) {
        logger.error(`Exception fetching details for placeId ${placeId}:`, fetchError);
        errorCount++;
      }
    }

    if (writeCount > 0) {
      await batch.commit();
    }

    logger.info(`adminUpdateAllPlaces successful. Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    return { success: true, updated: updatedCount, skipped: skippedCount, errors: errorCount };

  } catch (error) {
    logger.error("Error masivo en adminUpdateAllPlaces:", error);
    throw new HttpsError('internal', 'Un error ocurrió durante la actualización masiva.');
  }
});

const adminAuditStatistics = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  const startTime = Date.now();
  const summary = {
    checked: { places: 0, users: 0, lists: 0 },
    updated: { places: 0, users: 0, lists: 0, groupedItems: 0 },
    errors: []
  };
  const details = {
    places: [],
    users: [],
    lists: [],
    groupedItems: []
  };

  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('adminAuditStatistics: Error al verificar permisos de admin', error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const safeNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

  // --- AUDITAR LUGARES ---
  try {
    const placesSnap = await db.collection('places').get();
    summary.checked.places = placesSnap.size;

    for (const doc of placesSnap.docs) {
      const data = doc.data() || {};
      const updates = {};
      const diffs = [];

      try {
        const [reviewsCountSnap, followersCountSnap] = await Promise.all([
          db.collectionGroup('reviews').where('placeId', '==', doc.id).count().get(),
          doc.ref.collection('followers').count().get(),
        ]);

        const actualReviewCount = safeNumber(reviewsCountSnap.data().count);
        const actualFollowersCount = safeNumber(followersCountSnap.data().count);

        const storedReviewCount = safeNumber(data.reviewsCount);
        if (storedReviewCount !== actualReviewCount) {
          updates.reviewsCount = actualReviewCount;
          diffs.push({ field: 'reviewsCount', previous: storedReviewCount, value: actualReviewCount });
        }

        const storedFollowersCount = safeNumber(data.followersCount);
        if (storedFollowersCount !== actualFollowersCount) {
          updates.followersCount = actualFollowersCount;
          diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
        }

        if (diffs.length > 0) {
          await doc.ref.update(updates);
          summary.updated.places += 1;
          details.places.push({
            id: doc.id,
            name: data.name || null,
            diffs
          });
        }
      } catch (error) {
        logger.error(`adminAuditStatistics: Error auditando lugar ${doc.id}`, error);
        summary.errors.push({ type: 'place', id: doc.id, message: error.message });
      }
    }
  } catch (error) {
    logger.error('adminAuditStatistics: Error obteniendo lugares', error);
    summary.errors.push({ type: 'places', id: null, message: error.message });
  }

  // --- AUDITAR LISTAS ---
  try {
    const listsSnap = await db.collection('lists').get();
    summary.checked.lists = listsSnap.size;

    for (const doc of listsSnap.docs) {
      const data = doc.data() || {};
      const updates = {};
      const diffs = [];
      let groupedItemsDiffAdded = false;

      try {
        const [followersSnap, commentsSnap] = await Promise.all([
          doc.ref.collection('followers').count().get(),
          doc.ref.collection('comments').count().get().catch(() => ({ data: () => ({ count: 0 }) })),
        ]);

        // Contadores basados en reseñas y grupos
        let reviewCount = 0;
        let groupedItemsCount = 0;
        try {
          const aggregation = await buildGroupedItemsForList(doc.id);
          reviewCount = Array.isArray(aggregation.reviews) ? aggregation.reviews.length : 0;
          groupedItemsCount = Array.isArray(aggregation.groupedReviews) ? aggregation.groupedReviews.length : 0;
        } catch (error) {
          logger.error(`adminAuditStatistics: Error generando grupos para lista ${doc.id}`, error);
          summary.errors.push({ type: 'list-grouped', id: doc.id, message: error.message });
        }

        // Contador de comentarios (incluye foro)
        let forumMessagesCount = 0;
        try {
          const forumCountSnap = await db.collection('listForums').doc(doc.id).collection('messages').count().get();
          forumMessagesCount = safeNumber(forumCountSnap.data().count);
        } catch (error) {
          logger.error(`adminAuditStatistics: Error contando mensajes de foro para lista ${doc.id}`, error);
          summary.errors.push({ type: 'list-forum', id: doc.id, message: error.message });
        }

        const commentsLegacyCount = safeNumber(commentsSnap.data().count);
        const totalCommentsCount = commentsLegacyCount + forumMessagesCount;

        const actualFollowersCount = safeNumber(followersSnap.data().count);

        const storedReviewCount = safeNumber(data.reviewCount);
        if (storedReviewCount !== reviewCount) {
          updates.reviewCount = reviewCount;
          diffs.push({ field: 'reviewCount', previous: storedReviewCount, value: reviewCount });
        }

        const storedFollowersCount = safeNumber(data.followersCount);
        if (storedFollowersCount !== actualFollowersCount) {
          updates.followersCount = actualFollowersCount;
          diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
        }

        const storedCommentsCount = safeNumber(data.commentsCount);
        if (storedCommentsCount !== totalCommentsCount) {
          updates.commentsCount = totalCommentsCount;
          diffs.push({ field: 'commentsCount', previous: storedCommentsCount, value: totalCommentsCount });
        }

        const storedGroupedItemsCount = safeNumber(data.groupedItemsCount);
        if (Number.isFinite(groupedItemsCount) && storedGroupedItemsCount !== groupedItemsCount) {
          updates.groupedItemsCount = groupedItemsCount;
          diffs.push({ field: 'groupedItemsCount', previous: storedGroupedItemsCount, value: groupedItemsCount });
          groupedItemsDiffAdded = true;
        }

        if (diffs.length > 0) {
          await doc.ref.update(updates);
          summary.updated.lists += 1;
          if (groupedItemsDiffAdded) {
            summary.updated.groupedItems += 1;
            details.groupedItems.push({
              listId: doc.id,
              name: data.name || null,
              newValue: updates.groupedItemsCount,
              previousValue: storedGroupedItemsCount
            });
          }
          details.lists.push({
            id: doc.id,
            name: data.name || null,
            diffs
          });
        }
      } catch (error) {
        logger.error(`adminAuditStatistics: Error auditando lista ${doc.id}`, error);
        summary.errors.push({ type: 'list', id: doc.id, message: error.message });
      }
    }
  } catch (error) {
    logger.error('adminAuditStatistics: Error obteniendo listas', error);
    summary.errors.push({ type: 'lists', id: null, message: error.message });
  }

  // --- AUDITAR USUARIOS ---
  try {
    const usersSnap = await db.collection('users').get();
    summary.checked.users = usersSnap.size;

    for (const doc of usersSnap.docs) {
      const data = doc.data() || {};
      const updates = {};
      const diffs = [];

      try {
        const [reviewsCountSnap, followersSnap, followingSnap, publicListsSnap, privateListsSnap] = await Promise.all([
          db.collectionGroup('reviews').where('userId', '==', doc.id).count().get(),
          doc.ref.collection('followers').count().get(),
          doc.ref.collection('following').count().get(),
          db.collection('lists').where('userId', '==', doc.id).where('isPublic', '==', true).count().get(),
          db.collection('lists').where('userId', '==', doc.id).where('isPublic', '==', false).count().get(),
        ]);

        const actualReviewsCount = safeNumber(reviewsCountSnap.data().count);
        const actualFollowersCount = safeNumber(followersSnap.data().count);
        const actualFollowingCount = safeNumber(followingSnap.data().count);
        const actualPublicListsCount = safeNumber(publicListsSnap.data().count);
        const actualPrivateListsCount = safeNumber(privateListsSnap.data().count);

        let commentsCount = 0;
        try {
          const commentsSnap = await db.collectionGroup('comments').where('userId', '==', doc.id).count().get();
          commentsCount += safeNumber(commentsSnap.data().count);
        } catch (error) {
          logger.error(`adminAuditStatistics: Error contando comentarios clásicos para usuario ${doc.id}`, error);
          summary.errors.push({ type: 'user-comments', id: doc.id, message: error.message });
        }
        try {
          const forumCommentsSnap = await db.collectionGroup('messages').where('userId', '==', doc.id).count().get();
          commentsCount += safeNumber(forumCommentsSnap.data().count);
        } catch (error) {
          logger.error(`adminAuditStatistics: Error contando mensajes de foro para usuario ${doc.id}`, error);
          summary.errors.push({ type: 'user-forum-comments', id: doc.id, message: error.message });
        }

        const storedReviewsCount = safeNumber(data.reviewsCount);
        if (storedReviewsCount !== actualReviewsCount) {
          updates.reviewsCount = actualReviewsCount;
          diffs.push({ field: 'reviewsCount', previous: storedReviewsCount, value: actualReviewsCount });
        }

        const storedFollowersCount = safeNumber(data.followersCount);
        if (storedFollowersCount !== actualFollowersCount) {
          updates.followersCount = actualFollowersCount;
          diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
        }

        const storedFollowingCount = safeNumber(data.followingCount);
        if (storedFollowingCount !== actualFollowingCount) {
          updates.followingCount = actualFollowingCount;
          diffs.push({ field: 'followingCount', previous: storedFollowingCount, value: actualFollowingCount });
        }

        const storedPublicListsCount = safeNumber(data.publicListsCount);
        if (storedPublicListsCount !== actualPublicListsCount) {
          updates.publicListsCount = actualPublicListsCount;
          diffs.push({ field: 'publicListsCount', previous: storedPublicListsCount, value: actualPublicListsCount });
        }

        const storedPrivateListsCount = safeNumber(data.privateListsCount);
        if (storedPrivateListsCount !== actualPrivateListsCount) {
          updates.privateListsCount = actualPrivateListsCount;
          diffs.push({ field: 'privateListsCount', previous: storedPrivateListsCount, value: actualPrivateListsCount });
        }

        if (Number.isFinite(commentsCount)) {
          const storedCommentsCount = safeNumber(data.commentsCount);
          if (storedCommentsCount !== commentsCount) {
            updates.commentsCount = commentsCount;
            diffs.push({ field: 'commentsCount', previous: storedCommentsCount, value: commentsCount });
          }
        }

        if (diffs.length > 0) {
          await doc.ref.update(updates);
          summary.updated.users += 1;
          details.users.push({
            id: doc.id,
            name: data.displayName || data.username || null,
            diffs
          });
        }
      } catch (error) {
        logger.error(`adminAuditStatistics: Error auditando usuario ${doc.id}`, error);
        summary.errors.push({ type: 'user', id: doc.id, message: error.message });
      }
    }
  } catch (error) {
    logger.error('adminAuditStatistics: Error obteniendo usuarios', error);
    summary.errors.push({ type: 'users', id: null, message: error.message });
  }

  const durationMs = Date.now() - startTime;
  logger.info('adminAuditStatistics finalizado', { summary, durationMs });

  return {
    summary: {
      ...summary,
      durationMs,
      completedAt: new Date().toISOString()
    },
    details
  };
});

const adminGetCollection = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  // Admin check
  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminGetCollection: Error al verificar permisos de admin", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const collectionName = request.data.collectionName;
  const allowedCollections = ['users', 'lists', 'places', 'categories', 'listForums', 'reviews'];

  if (!collectionName || !allowedCollections.includes(collectionName)) {
    throw new HttpsError('invalid-argument', 'Nombre de colección no válido o no permitido.');
  }

  try {
    const snapshot = await db.collection(collectionName).get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { data: data };
  } catch (error) {
    logger.error(`Error masivo en adminGetCollection para la colección ${collectionName}:`, error);
    throw new HttpsError('internal', `Un error ocurrió al obtener la colección ${collectionName}.`);
  }
});

const adminUpdateSinglePlace = onCall({ cors: true }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  // Comprobación de rol de administrador (¡importante!)
  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminUpdateSinglePlace: Error al verificar permisos", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { documentId, googlePlaceId } = request.data;
  if (!documentId || !googlePlaceId) {
    throw new HttpsError('invalid-argument', 'Se requieren documentId y googlePlaceId.');
  }

  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) {
    logger.error("adminUpdateSinglePlace: GOOGLE_PLACES_API_KEY no está disponible.");
    throw new HttpsError('internal', 'Error de configuración del servidor.');
  }

  const placeRef = db.collection('places').doc(documentId);
  const fields = "name,place_id,formatted_address,geometry,url,photos,price_level,website,international_phone_number,vicinity,address_components,rating,user_ratings_total,types";
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&key=${apiKey}&fields=${fields}&language=es`;

  try {
    const response = await fetch(url);
    const details = await response.json();

    if (details.status === "OK" && details.result) {
      const result = details.result;
      const existingDoc = await placeRef.get();
      const existingData = existingDoc.exists ? (existingDoc.data() || {}) : {};
      const accessibilityOptions = await fetchPlaceAccessibilityOptions(googlePlaceId, apiKey);
      const addressFields = extractAddressFields(result.address_components);
      const resolvedName = resolveText(result.name, existingData.name);
      const resolvedAddress = resolveText(result.formatted_address, existingData.formatted_address || existingData.address);
      const resolvedLocation = resolvePlaceLocation(result, existingData);
      const resolvedTypes = resolveTypeArray(result.types, existingData.types);
      const resolvedGooglePlaceId = resolveText(result.place_id, existingData.googlePlaceId || googlePlaceId);
      const resolvedGoogleMapsUrl = resolveText(result.url, existingData.googleMapsUrl);
      const resolvedWebsite = resolveText(result.website, existingData.website);
      const resolvedPhone = resolveText(result.international_phone_number, existingData.phone);
      const resolvedVicinity = resolveText(result.vicinity, existingData.vicinity);
      const resolvedNameNormalized = resolvedName
        ? resolvedName.toLowerCase()
        : resolveText(existingData.name_normalized, null);
      const resolvedAddressNormalized = resolvedAddress
        ? resolvedAddress.toLowerCase()
        : resolveText(existingData.address_normalized, null);
      const resolvedCity = resolveText(addressFields.city, existingData.city);
      const resolvedRegion = resolveText(addressFields.region, existingData.region);
      const resolvedProvince = resolveText(addressFields.province, existingData.province);
      const resolvedCountry = resolveText(addressFields.country, existingData.country);
      const resolvedPostalCode = resolveText(addressFields.postalCode, existingData.postalCode);
      const previousMainImageUrl = existingData.mainImageUrl || null;
      const previousPhotoReference = existingData.mainImagePhotoReference || null;
      const primaryPhotoReference = (result.photos && result.photos.length > 0) ? result.photos[0].photo_reference : null;
      let resolvedMainImageUrl = previousMainImageUrl;
      let mainImagePhotoReference = previousPhotoReference;

      if (primaryPhotoReference) {
        const candidatePhotoUrl = await resolveGooglePhotoUrl(primaryPhotoReference, apiKey, 400);
        if (candidatePhotoUrl) {
          resolvedMainImageUrl = candidatePhotoUrl;
          mainImagePhotoReference = primaryPhotoReference;
        }
      }

      const updateData = {
        name: resolvedName,
        name_normalized: resolvedNameNormalized,
        googlePlaceId: resolvedGooglePlaceId,
        formatted_address: resolvedAddress,
        address: resolvedAddress,
        address_normalized: resolvedAddressNormalized,
        city: resolvedCity,
        region: resolvedRegion,
        province: resolvedProvince,
        country: resolvedCountry,
        postalCode: resolvedPostalCode,
        googleMapsUrl: resolvedGoogleMapsUrl,
        mainImageUrl: resolvedMainImageUrl,
        mainImagePhotoReference: mainImagePhotoReference,
        priceLevel: resolveNumber(result.price_level, existingData.priceLevel),
        website: resolvedWebsite,
        phone: resolvedPhone,
        vicinity: resolvedVicinity,
        googleRating: resolveNumber(result.rating, existingData.googleRating),
        googleUserRatingsTotal: resolveNumber(result.user_ratings_total, existingData.googleUserRatingsTotal),
        types: resolvedTypes,
        accessibility: resolveAccessibilityPayload(accessibilityOptions, existingData.accessibility),
        updatedAt: FieldValue.serverTimestamp(),
        lastGoogleSync: FieldValue.serverTimestamp()
      };

      if (resolvedLocation) {
        updateData.location = resolvedLocation;
        updateData.coordinates = resolvedLocation;
      }

      pruneNullishKeys(updateData);

      await placeRef.update(updateData);
      logger.info(`Lugar ${documentId} actualizado exitosamente por ${contextAuth.uid}.`);
      return { success: true, message: "Lugar actualizado." };
    } else {
      logger.error(`Error de Google API para placeId ${googlePlaceId}: ${details.status}`);
      throw new HttpsError('internal', `Error de Google API: ${details.status}`);
    }
  } catch (error) {
    logger.error(`Excepción actualizando el lugar ${documentId}:`, error);
    throw new HttpsError('internal', 'Ocurrió una excepción al actualizar el lugar.');
  }
});

const refreshPlaceMainImage = onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'OPTIONS') {
      res.set('Allow', 'GET,POST,OPTIONS');
      return res.status(405).json({ message: 'Método no permitido.' });
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    try {
      const placeId = req.method === 'GET'
        ? (req.query.placeId || req.query.documentId || req.query.id)
        : (req.body?.placeId || req.body?.documentId || req.body?.id);

      if (!placeId) {
        return res.status(400).json({ message: 'placeId es requerido.' });
      }

      const force = req.method === 'POST'
        ? Boolean(req.body?.force)
        : req.query.force === '1';
      const maxWidthParam = req.method === 'POST'
        ? req.body?.maxWidth
        : req.query.maxWidth;
      const maxWidth = maxWidthParam ? parseInt(maxWidthParam, 10) : undefined;

      const result = await refreshPlaceMainImageByIdInternal(placeId, { force, maxWidth });
      return res.status(200).json({
        photoUrl: result.photoUrl || null,
        refreshed: !!result.refreshed,
        skipped: !!result.skipped
      });
    } catch (error) {
      const status = error.code === 'not-found'
        ? 404
        : error.code === 'invalid-argument'
          ? 400
          : 500;
      return res.status(status).json({
        message: error.message || 'No se pudo refrescar la imagen del lugar.'
      });
    }
  });
});

const refreshStalePlacePhotos = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'Europe/Madrid'
  },
  async () => {
    const apiKey = await getGooglePlacesApiKey();
    if (!apiKey) {
      logger.error("refreshStalePlacePhotos: GOOGLE_PLACES_API_KEY no está configurada.");
      return;
    }

    try {
      const snapshot = await db
        .collection('places')
        .orderBy('lastPhotoRefresh', 'asc')
        .limit(15)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data() || {};
        const legacyUrl = typeof data.mainImageUrl === 'string'
          && data.mainImageUrl.includes('maps.googleapis.com/maps/api/place/photo');
        const lastRefreshDate = extractTimestampDate(data.lastPhotoRefresh);
        const shouldRefresh = legacyUrl || !lastRefreshDate || (Date.now() - lastRefreshDate.getTime()) > (48 * 60 * 60 * 1000);
        if (!shouldRefresh) {
          continue;
        }

        try {
          await refreshPlaceMainImageFromSnapshot(doc, apiKey, { force: true, maxWidth: 800 });
          logger.info(`refreshStalePlacePhotos: foto actualizada para ${doc.id}`);
        } catch (error) {
          logger.warn(`refreshStalePlacePhotos: fallo al refrescar ${doc.id}`, error);
        }
      }
    } catch (error) {
      logger.error("refreshStalePlacePhotos: error inesperado al iterar lugares.", error);
    }
  }
);


const adminFixPlaceDocument = onCall({ cors: true }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  try {
    await assertJefeAccess(contextAuth.uid, 'No tienes permiso para ejecutar esta operacion.');
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminFixPlaceDocument: Error al verificar permisos", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { sourceId: rawSourceId, targetId: rawTargetId, dryRun = false } = request.data || {};
  if (!rawSourceId || typeof rawSourceId !== 'string') {
    throw new HttpsError('invalid-argument', 'Se requiere sourceId.');
  }

  const sourceId = rawSourceId.trim();
  if (!sourceId) {
    throw new HttpsError('invalid-argument', 'sourceId no puede estar vacio.');
  }

  const sourceRef = db.collection('places').doc(sourceId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    throw new HttpsError('not-found', `El lugar ${sourceId} no existe.`);
  }
  const sourceData = sourceSnap.data() || {};

  const inferredTargetId = typeof rawTargetId === 'string' && rawTargetId.trim()
    ? rawTargetId.trim()
    : (typeof sourceData.googlePlaceId === 'string' ? sourceData.googlePlaceId.trim() : '');

  if (!inferredTargetId) {
    throw new HttpsError('failed-precondition', 'No se pudo determinar el targetId (googlePlaceId ausente).');
  }

  const targetId = inferredTargetId;

  if (targetId === sourceId) {
    return {
      success: true,
      summary: {
        sourceId,
        targetId,
        message: 'El documento ya coincide con su googlePlaceId.',
        reviewsUpdated: 0,
        followersMoved: 0,
        followersFinalCount: sourceData.followersCount || 0,
        dryRun: !!dryRun,
        skipped: true
      }
    };
  }

  const targetRef = db.collection('places').doc(targetId);
  const targetSnap = await targetRef.get();
  const targetData = targetSnap.exists ? (targetSnap.data() || {}) : null;

  const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', sourceId).get();
  const reviewPaths = reviewsSnapshot.docs.map(doc => doc.ref.path);

  const sourceFollowersSnap = await sourceRef.collection('followers').get();
  const sourceFollowerIds = sourceFollowersSnap.docs.map(doc => doc.id);

  let existingTargetFollowerIds = [];
  if (targetSnap.exists) {
    const targetFollowersSnap = await targetRef.collection('followers').get();
    existingTargetFollowerIds = targetFollowersSnap.docs.map(doc => doc.id);
  }

  const summary = {
    sourceId,
    targetId,
    reviewsToUpdate: reviewPaths.length,
    followersToMove: sourceFollowerIds.length,
    targetExistsBefore: targetSnap.exists,
    dryRun: !!dryRun
  };

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      summary,
      reviewPaths,
      sourceFollowerIds,
      existingTargetFollowerIds
    };
  }

  const mergedData = targetData ? { ...targetData } : {};
  const keysToSkip = new Set(['reviewsCount', 'averageRating', 'followersCount', 'id']);

  Object.entries(sourceData).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (key === 'googlePlaceId') {
      return;
    }
    if (keysToSkip.has(key)) {
      if (!Object.prototype.hasOwnProperty.call(mergedData, key) || mergedData[key] === null || typeof mergedData[key] === 'undefined') {
        mergedData[key] = value;
      }
      return;
    }
    if (key === 'createdAt') {
      if (!mergedData.createdAt) {
        mergedData.createdAt = value;
      }
      return;
    }
    mergedData[key] = value;
  });

  mergedData.googlePlaceId = targetId;
  mergedData.updatedAt = FieldValue.serverTimestamp();

  await targetRef.set(mergedData, { merge: true });

  const followerIdSet = new Set(existingTargetFollowerIds);
  let followersMoved = 0;

  for (const followerDoc of sourceFollowersSnap.docs) {
    const followerId = followerDoc.id;
    const followerData = followerDoc.data() || {};

    followerIdSet.add(followerId);

    const batch = db.batch();
    batch.set(
      targetRef.collection('followers').doc(followerId),
      { ...followerData, migratedFrom: sourceId },
      { merge: true }
    );
    batch.delete(followerDoc.ref);

    const userFollowingCollection = db.collection('users').doc(followerId).collection('following');
    const oldFollowRef = userFollowingCollection.doc(sourceId);
    const newFollowRef = userFollowingCollection.doc(targetId);

    const oldFollowSnap = await oldFollowRef.get();
    if (oldFollowSnap.exists) {
      const followData = oldFollowSnap.data() || {};
      batch.set(
        newFollowRef,
        {
          ...followData,
          placeId: targetId,
          migratedFrom: sourceId,
          migratedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      batch.delete(oldFollowRef);
    } else {
      batch.set(
        newFollowRef,
        {
          placeId: targetId,
          migratedFrom: sourceId,
          migratedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    await batch.commit();
    followersMoved += 1;
  }

  await targetRef.update({
    followersCount: followerIdSet.size,
    updatedAt: FieldValue.serverTimestamp()
  });

  const BATCH_LIMIT = 400;
  let reviewsUpdated = 0;
  for (let i = 0; i < reviewsSnapshot.docs.length; i += BATCH_LIMIT) {
    const slice = reviewsSnapshot.docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    slice.forEach(doc => {
      batch.update(doc.ref, {
        placeId: targetId,
        migratedFromPlaceId: sourceId,
        migratedAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    reviewsUpdated += slice.length;
  }

  const subcollections = await sourceRef.listCollections();
  const extraSubcollections = subcollections
    .map(col => col.id)
    .filter(id => id !== 'followers');

  if (extraSubcollections.length > 0) {
    logger.warn('adminFixPlaceDocument: Subcolecciones adicionales no migradas automaticamente.', {
      sourceId,
      subcollections: extraSubcollections
    });
  }

  try {
    await recalculateAggregatesForPlace(targetId);
  } catch (aggError) {
    logger.error(`adminFixPlaceDocument: Error recalculando agregados para ${targetId}`, aggError);
  }

  try {
    await db.collection('deleted_items').add({
      ...sourceData,
      originalCollection: 'places',
      migratedTo: targetId,
      deletedAt: FieldValue.serverTimestamp()
    });
  } catch (archiveError) {
    logger.warn("adminFixPlaceDocument: No se pudo archivar el documento eliminado.", archiveError);
  }

  await sourceRef.delete();

  return {
    success: true,
    summary: {
      ...summary,
      reviewsUpdated,
      followersMoved,
      followersFinalCount: followerIdSet.size,
      extraSubcollections
    }
  };
});


const adminAuditPlaceIdConsistency = onCall({ cors: true }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminAuditPlaceIdConsistency: Error al verificar permisos", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  try {
    const snapshot = await db.collection('places').get();
    const totalDocs = snapshot.size;

    const missingGooglePlaceId = [];
    const mismatchedIds = [];
    const duplicateTracker = new Map();

    snapshot.forEach(doc => {
      const data = doc.data() || {};
      const googlePlaceId = typeof data.googlePlaceId === 'string' ? data.googlePlaceId.trim() : '';

      if (!googlePlaceId) {
        missingGooglePlaceId.push({
          id: doc.id,
          name: data.name || null
        });
        return;
      }

      if (doc.id !== googlePlaceId) {
        mismatchedIds.push({
          id: doc.id,
          googlePlaceId,
          name: data.name || null
        });
      }

      const existing = duplicateTracker.get(googlePlaceId);
      if (existing) {
        existing.push(doc.id);
      } else {
        duplicateTracker.set(googlePlaceId, [doc.id]);
      }
    });

    const duplicateGroups = [];
    duplicateTracker.forEach((docIds, googlePlaceId) => {
      if (docIds.length > 1) {
        duplicateGroups.push({
          googlePlaceId,
          documentIds: docIds,
          count: docIds.length
        });
      }
    });

    const summary = {
      totalDocs,
      matchingCount: totalDocs - mismatchedIds.length - missingGooglePlaceId.length,
      mismatchedCount: mismatchedIds.length,
      missingGooglePlaceIdCount: missingGooglePlaceId.length,
      duplicateGroupCount: duplicateGroups.length,
      duplicateDocumentCount: duplicateGroups.reduce((acc, group) => acc + group.count, 0)
    };

    logger.info("adminAuditPlaceIdConsistency completado", summary);

    return {
      success: true,
      summary,
      mismatchedIds,
      missingGooglePlaceId,
      duplicateGroups
    };
  } catch (error) {
    logger.error("Error en adminAuditPlaceIdConsistency:", error);
    throw new HttpsError('internal', 'No se pudo completar la auditoría de IDs.');
  }
});


const toggleFollowPlace = onCall({ cors: true }, async (request) => {
  const contextAuth = request.auth;
  const { placeId } = request.data;

  if (!contextAuth) {
    logger.warn("toggleFollowPlace: Intento de llamada no autenticado.");
    throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para seguir un lugar.');
  }
  const userId = contextAuth.uid;

  if (!placeId) {
    logger.warn(`toggleFollowPlace: placeId no proporcionado por el usuario ${userId}.`);
    throw new HttpsError('invalid-argument', 'Se requiere el ID del lugar (placeId).');
  }

  const placeRef = db.collection('places').doc(placeId);
  const placeFollowerRef = placeRef.collection('followers').doc(userId);
  const userFollowingRef = db.collection('users').doc(userId).collection('followingPlaces');
  const userFollowDoc = userFollowingRef.doc(placeId);

  try {
    const placeDoc = await placeRef.get();
    if (!placeDoc.exists) {
      throw new HttpsError('not-found', 'El lugar no existe.');
    }

    const followDoc = await userFollowDoc.get();
    const batch = db.batch();
    let status = 'unfollowed';
    let message = 'Dejaste de seguir el lugar.';

    if (followDoc.exists) {
      logger.info(`Usuario ${userId} deja de seguir el lugar ${placeId}.`);
      batch.delete(userFollowDoc);
      batch.delete(placeFollowerRef);
    } else {
      logger.info(`Usuario ${userId} comienza a seguir el lugar ${placeId}.`);
      batch.set(userFollowDoc, {
        placeId: placeId,
        followedAt: FieldValue.serverTimestamp()
      });
      batch.set(placeFollowerRef, { userId, followedAt: FieldValue.serverTimestamp() });
      status = 'followed';
      message = 'Ahora sigues este lugar.';
    }

    await batch.commit();
    // Añadimos el estado aquí.
    return { status, message };

  } catch (error) {
    logger.error(`Error en toggleFollowPlace para usuario ${userId} y lugar ${placeId}:`, error);
    if (error.code) {
      throw error;
    }
    throw new HttpsError('internal', 'Ocurrió un error inesperado al seguir/dejar de seguir el lugar.', error.message);
  }
});

// --- FUNCIÓN CALLABLE: toggleFollowList ---
const toggleFollowList = onCall({ cors: true }, async (request) => {
  const contextAuth = request.auth;
  const { listId } = request.data || {};

  if (!contextAuth) {
    logger.warn("toggleFollowList: llamada no autenticada.");
    throw new HttpsError('unauthenticated', 'Debes estar autenticado para seguir una lista.');
  }
  if (!listId) {
    logger.warn(`toggleFollowList: listId no proporcionado por el usuario ${contextAuth.uid}.`);
    throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista (listId).');
  }

  const userId = contextAuth.uid;
  const listRef = db.collection('lists').doc(listId);
  const userRef = db.collection('users').doc(userId);
  const userFollowingListRef = userRef.collection('followingLists').doc(listId);
  const listFollowerRef = listRef.collection('followers').doc(userId);

  try {
    const listDoc = await listRef.get();
    if (!listDoc.exists) {
      throw new HttpsError('not-found', 'La lista no existe.');
    }
    const listData = listDoc.data();
    // Si la lista es privada y no es del usuario, no permitir seguir
    if (listData.isPublic === false && listData.userId !== userId) {
      throw new HttpsError('permission-denied', 'No puedes seguir una lista privada.');
    }

    const already = await userFollowingListRef.get();
    const batch = db.batch();
    let status = 'unfollowed';
    let message = 'Has dejado de seguir esta lista.';

    if (already.exists) {
      batch.delete(userFollowingListRef);
      batch.delete(listFollowerRef);
    } else {
      batch.set(userFollowingListRef, { listId, followedAt: FieldValue.serverTimestamp() });
      batch.set(listFollowerRef, { userId, followedAt: FieldValue.serverTimestamp() });
      status = 'followed';
      message = 'Ahora sigues esta lista.';
    }

    await batch.commit();
    return { status, message };
  } catch (error) {
    logger.error(`Error en toggleFollowList para usuario ${userId} y lista ${listId}:`, error);
    if (error.code) throw error;
    throw new HttpsError('internal', 'Ocurrió un error al seguir/dejar de seguir la lista.', error.message);
  }
});

// --- FUNCIÓN CALLABLE: adminUpdateSingleListAggregates ---
const adminUpdateSingleListAggregates = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }
  // Admin check
  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminUpdateSingleListAggregates: Error al verificar permisos", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { listId } = request.data || {};
  if (!listId) {
    throw new HttpsError('invalid-argument', 'Se requiere listId.');
  }

  const listRef = db.collection('lists').doc(listId);
  try {
    const [listMetrics, forumMsgsSnap, followersSnap] = await Promise.all([
      recalculateListReviewMetrics(listId),
      db.collection('listForums').doc(listId).collection('messages').get(),
      listRef.collection('followers').get()
    ]);

    const commentsCount = forumMsgsSnap.size;
    const followersCount = followersSnap.size;

    await listRef.update({
      commentsCount,
      followersCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`adminUpdateSingleListAggregates: ${listId} => r:${listMetrics?.reviewCount} c:${commentsCount} f:${followersCount}`);
    return { success: true, commentsCount, followersCount, ...(listMetrics || {}) };
  } catch (e) {
    logger.error(`adminUpdateSingleListAggregates error para ${listId}:`, e);
    throw new HttpsError('internal', 'Error al recalcular agregados de la lista.');
  }
});

const adminRecalculateListAverages = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }
  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminRecalculateListAverages: Error al verificar permisos", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { listId } = request.data || {};
  if (!listId) {
    throw new HttpsError('invalid-argument', 'Se requiere listId.');
  }

  try {
    const metrics = await recalculateListReviewMetrics(listId);
    return { success: true, ...(metrics || {}), listId };
  } catch (error) {
    logger.error(`adminRecalculateListAverages error para ${listId}:`, error);
    throw new HttpsError('internal', 'Error al recalcular medias de la lista.');
  }
});

// Mantener commentsCount sincronizado con los mensajes del foro
const updateAggregatesOnForumMessageChange = onDocumentWritten("listForums/{listId}/messages/{messageId}", async (event) => {
  // Ignorar actualizaciones que no cambian el número de mensajes
  if (event.data.before.exists && event.data.after.exists) return null;
  const listId = event.params.listId;
  try {
    const forumMsgsSnap = await db.collection('listForums').doc(listId).collection('messages').get();
    const commentsCount = forumMsgsSnap.size;
    await db.collection('lists').doc(listId).update({ commentsCount });
    logger.info(`commentsCount actualizado para lista ${listId}: ${commentsCount}`);
  } catch (e) {
    logger.error(`Error actualizando commentsCount para lista ${listId}:`, e);
  }
  return null;
});

const adminRecalculatePlaceStats = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }
  // Admin check
  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("adminRecalculatePlaceStats: Error al verificar permisos", error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { placeId } = request.data || {};
  if (!placeId) {
    return { success: false, error: 'Se requiere placeId.' };
  }

  try {
    await recalculateAggregatesForPlace(placeId);
    // Fetch updated to return
    const p = await db.collection('places').doc(placeId).get();
    return { success: true, ...p.data() };
  } catch (e) {
    logger.error(`adminRecalculatePlaceStats error para ${placeId}:`, e);
    throw new HttpsError('internal', 'Error al recalcular agregados del lugar.');
  }
});

// --- Bulk Operations ---
const adminRecalculateAllLists = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Auth required.');

  try {
    await assertJefeAccess(contextAuth.uid, 'Admin only.');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const listsSnap = await db.collection('lists').get();
  const results = { total: listsSnap.size, success: 0, failed: 0, errors: [] };

  for (const doc of listsSnap.docs) {
    try {
      const listId = doc.id;
      const reviewsSnap = await db.collection('lists').doc(listId).collection('reviews').get();
      const reviews = reviewsSnap.docs.map(r => r.data());

      let totalScore = 0;
      let count = 0;
      reviews.forEach(r => {
        if (typeof r.overallRating === 'number') {
          totalScore += r.overallRating;
          count++;
        }
      });
      const avgScore = count > 0 ? parseFloat((totalScore / count).toFixed(1)) : 0;

      const uniqueItems = new Set();
      reviews.forEach(r => {
        const key = r.placeId ? `${r.placeId}_${r.itemName || ''}` : r.id;
        uniqueItems.add(key);
      });

      await db.collection('lists').doc(listId).update({
        avgScore,
        reviewCount: count,
        itemCount: uniqueItems.size
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({ id: doc.id, error: error.message });
    }
  }

  return results;
});

const adminRecalculateAllPlaces = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Auth required.');
  try {
    await assertJefeAccess(contextAuth.uid, 'Admin only.');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const placesSnap = await db.collection('places').get();
  const results = { total: placesSnap.size, success: 0, failed: 0, errors: [] };

  for (const doc of placesSnap.docs) {
    try {
      await recalculateAggregatesForPlace(doc.id);
      results.success++;
    } catch (e) {
      results.failed++;
      results.errors.push({ id: doc.id, error: e.message });
    }
  }
  return results;
});

async function recalculateAggregatesForUser(userId) {
  const reviewsSnap = await db.collectionGroup('reviews').where('userId', '==', userId).get();
  const canonicalReviewKeys = new Set();
  reviewsSnap.forEach((docSnap) => {
    const pathSegments = docSnap.ref.path.split('/');
    const isCanonicalListReviewPath =
      pathSegments.length === 4 &&
      pathSegments[0] === 'lists' &&
      pathSegments[2] === 'reviews';

    if (!isCanonicalListReviewPath) return;

    const listId = pathSegments[1] || '';
    canonicalReviewKeys.add(`${listId}:${docSnap.id}`);
  });
  const reviewCount = canonicalReviewKeys.size;

  const listsSnap = await db.collection('lists').where('userId', '==', userId).get();
  const listCount = listsSnap.size;

  const followersSnap = await db.collection('users').doc(userId).collection('followers').get();
  const followersCount = followersSnap.size;

  const followingSnap = await db.collection('users').doc(userId).collection('following').get();
  const followingCount = followingSnap.size;

  const followingListsSnap = await db.collection('users').doc(userId).collection('followingLists').get();
  const followingListsCount = followingListsSnap.size;

  await db.collection('users').doc(userId).set({
    reviewsCount: reviewCount,
    reviewCount,
    listCount,
    followersCount,
    followingCount,
    followingUsersCount: followingCount,
    followingListsCount,
    lastStatsRecalc: FieldValue.serverTimestamp()
  }, { merge: true });

  return { reviewCount, reviewsCount: reviewCount, listCount, followersCount, followingCount, followingListsCount };
}

const adminRecalculateAllUsers = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Resulta que necesitas estar logueado.');

  try {
    await assertJefeAccess(contextAuth.uid, 'Solo los jefes pueden hacer esto.');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const usersSnap = await db.collection('users').get();
  const results = { total: usersSnap.size, success: 0, failed: 0, errors: [] };

  for (const doc of usersSnap.docs) {
    try {
      await recalculateAggregatesForUser(doc.id);
      results.success++;
    } catch (e) {
      results.failed++;
      results.errors.push({ id: doc.id, error: e.message });
    }
  }
  return results;
});

module.exports = {
  groupedReviews,
  placesNearbyRestaurants,
  placesTextSearch,
  getPlaceDetailsFromGoogle,
  deleteOrOrphanList,
  createList,
  createListWithValidation,
  updateListWithValidation,
  reverseGeocode,
  updateAggregatesOnReviewChange,
  updateUserStatsOnListChange,
  updateAggregatesOnCommentChange,
  toggleFollowUser,
  resolveChatParticipants,
  getPlacesForList,
  getPlaceDetails,
  getGroupsForPlace,
  updatePlaceAggregates,
  updatePlaceAggregatesOnReviewChange,
  adminAuditStatistics,
  adminReplaceTag,
  adminUpdateAllPlaces,
  adminGetCollection,
  adminUpdateSinglePlace,
  adminFixPlaceDocument,
  adminAuditPlaceIdConsistency,
  adminUpdateSingleListAggregates,
  adminRecalculateListAverages,
  adminRecalculatePlaceStats,
  adminRecalculateAllLists,
  adminRecalculateAllPlaces,
  adminRecalculateAllUsers,
  refreshPlaceMainImage,
  refreshStalePlacePhotos,
  updateAggregatesOnForumMessageChange,
  toggleFollowPlace,
  toggleFollowList,
  getDistance,
};
