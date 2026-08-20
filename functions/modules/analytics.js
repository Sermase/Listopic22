// Analitica propia y agregada. No guarda IP, UID ni historiales individuales.
// La ubicacion de conexiones se reduce a una celda aproximada de 0,1 grados
// antes de almacenarse y solo se muestra al alcanzar un umbral de privacidad.

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { assertJefeAccess, rateLimit, rateLimitKey } = require("./lib/auth");
const { hasActiveBusinessPro } = require("./lib/business-plan");

const db = getFirestore();
const ANALYTICS_TIME_ZONE = "Europe/Madrid";
const VALID_DEVICES = new Set(["mobile", "tablet", "desktop"]);
const VALID_SOURCES = new Set(["direct", "internal", "search", "social", "external"]);
const VALID_SHARE_CHANNELS = new Set(["whatsapp", "clipboard", "image", "chat"]);
const VALID_SHARE_ENTITY_TYPES = new Set(["place", "group", "list", "sublist", "profile", "app", "review", "link"]);
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;
const EVENT_ID_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;
const MAX_PERIOD_DAILY_DOCS = 10000;
const MAX_HEATMAP_DOCS = 5000;
const MAX_REVIEW_BACKFILL = 20000;
const GEO_GRID_STEP_DEGREES = 0.1;
const GEO_PRIVACY_THRESHOLD = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 40);
const asString = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";

function analyticsDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return analyticsDate(date);
}

function datesForPeriod(days) {
  return Array.from({ length: days }, (_, index) => dateDaysAgo(days - index - 1));
}

function sanitizePath(value) {
  const raw = asString(value, 500).split(/[?#]/, 1)[0];
  const hasUnsafeCharacter = Array.from(raw).some((character) => character.charCodeAt(0) < 32 || character === "<" || character === ">");
  if (!raw || !raw.startsWith("/") || hasUnsafeCharacter) {
    throw new HttpsError("invalid-argument", "Ruta de pagina no valida.");
  }
  return raw.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function pageTypeForPath(path) {
  if (path === "/") return "home";
  if (path === "/search") return "search";
  if (/^\/list\/[^/]+$/.test(path)) return "list";
  if (/^\/place\/[^/]+$/.test(path)) return "place";
  if (/^\/group\/[^/]+(?:\/.*)?$/.test(path)) return "item";
  if (/^\/profile\/[^/]+$/.test(path)) return "profile";
  if (path === "/users") return "users";
  if (["/about", "/privacy", "/terms", "/child-safety", "/istari-core"].includes(path)) return "information";
  return "other";
}

function numericMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([, count]) => typeof count === "number" && Number.isFinite(count)));
}

function addNumericMap(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + value;
  });
}

function serializeAnalyticsDoc(data = {}) {
  return {
    path: typeof data.path === "string" ? data.path : "",
    title: typeof data.title === "string" ? data.title : "",
    pageType: typeof data.pageType === "string" ? data.pageType : "other",
    totalViews: Number(data.totalViews) || 0,
    uniqueSessions: Number(data.uniqueSessions) || 0,
    authenticatedViews: Number(data.authenticatedViews) || 0,
    anonymousViews: Number(data.anonymousViews) || 0,
    totalShares: Number(data.totalShares) || 0,
    shareActions: Number(data.shareActions) || 0,
    byDevice: numericMap(data.byDevice),
    bySource: numericMap(data.bySource),
    byShareChannel: numericMap(data.byShareChannel),
    byShareEntityType: numericMap(data.byShareEntityType),
    firstViewedAtMs: typeof data.firstViewedAt?.toMillis === "function" ? data.firstViewedAt.toMillis() : null,
    lastViewedAtMs: typeof data.lastViewedAt?.toMillis === "function" ? data.lastViewedAt.toMillis() : null,
    lastSharedAtMs: typeof data.lastSharedAt?.toMillis === "function" ? data.lastSharedAt.toMillis() : null,
  };
}

function serializePlaceDaily(data = {}, date = "") {
  return {
    date: typeof data.date === "string" ? data.date : date,
    reviews: Number(data.reviews) || 0,
    totalShares: Number(data.totalShares) || 0,
    shareActions: Number(data.shareActions) || 0,
    byShareChannel: numericMap(data.byShareChannel),
    byShareEntityType: numericMap(data.byShareEntityType),
  };
}

function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function quantizeCoordinate(value) {
  return Number((Math.round(value / GEO_GRID_STEP_DEGREES) * GEO_GRID_STEP_DEGREES).toFixed(1));
}

function placeIdFromPath(path) {
  const match = path.match(/^\/(?:place|group)\/([^/]+)/);
  if (!match) return "";
  try {
    return asString(decodeURIComponent(match[1]), 300);
  } catch (_) {
    return asString(match[1], 300);
  }
}

function reviewDate(data) {
  if (typeof data?.createdAt?.toDate === "function") return analyticsDate(data.createdAt.toDate());
  if (typeof data?.createdAt === "number") return analyticsDate(new Date(data.createdAt));
  if (typeof data?.createdAt === "string") {
    const parsed = new Date(data.createdAt);
    if (!Number.isNaN(parsed.getTime())) return analyticsDate(parsed);
  }
  return analyticsDate();
}

function reviewGeo(data) {
  const lat = coordinate(data?.placeLat ?? data?.lat, -90, 90);
  const lng = coordinate(data?.placeLng ?? data?.lng, -180, 180);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

async function assertBusinessAnalyticsAccess(placeId, uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesion.");
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");

  const placeSnap = await db.collection("places").doc(placeId).get();
  if (!placeSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
  const place = placeSnap.data() || {};

  let isAdmin = false;
  try {
    await assertJefeAccess(uid);
    isAdmin = true;
  } catch (_) {
    isAdmin = false;
  }
  const managers = Array.isArray(place.businessManagerIds) ? place.businessManagerIds : [];
  const canManage = place.businessOwnerUserId === uid || managers.includes(uid);
  if (!isAdmin && !canManage) throw new HttpsError("permission-denied", "No puedes consultar este negocio.");
  if (!isAdmin && !hasActiveBusinessPro(place)) {
    throw new HttpsError("permission-denied", "Las estadisticas avanzadas requieren Business Pro.");
  }
  return place;
}

const recordPageView = onCall({ invoker: "public" }, async (request) => {
  const path = sanitizePath(request.data?.path);
  const sessionId = asString(request.data?.sessionId, 128);
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Sesion de analitica no valida.");
  }

  const device = VALID_DEVICES.has(request.data?.device) ? request.data.device : "desktop";
  const source = VALID_SOURCES.has(request.data?.source) ? request.data.source : "direct";
  const title = asString(request.data?.title, 140).replace(/[<>]/g, "");
  const pageType = pageTypeForPath(path);
  if (pageType === "other") {
    throw new HttpsError("invalid-argument", "La ruta no pertenece a una pagina publica medible.");
  }
  const isAuthenticated = Boolean(request.auth?.uid);

  const rawRateKey = rateLimitKey(request.rawRequest, request.auth);
  const rate = await rateLimit("pageAnalytics", hash(rawRateKey), 120, 60);
  if (!rate.allowed) throw new HttpsError("resource-exhausted", "Demasiadas visitas registradas.");

  const date = analyticsDate();
  const pageId = hash(path);
  const sessionHash = hash(sessionId);
  const pageTotalRef = db.collection("pageAnalyticsTotals").doc(pageId);
  const pageDailyRef = db.collection("pageAnalyticsDaily").doc(`${date}_${pageId}`);
  const globalTotalRef = db.collection("pageAnalyticsGlobal").doc("all");
  const globalDailyRef = db.collection("pageAnalyticsGlobalDaily").doc(date);
  const pageSessionRef = db.collection("pageAnalyticsSessionMarkers").doc(hash(`${date}|${pageId}|${sessionHash}`));
  const globalSessionRef = db.collection("pageAnalyticsSessionMarkers").doc(hash(`${date}|all|${sessionHash}`));

  await db.runTransaction(async (tx) => {
    const [pageSessionSnap, globalSessionSnap, pageTotalSnap, globalTotalSnap] = await Promise.all([
      tx.get(pageSessionRef),
      tx.get(globalSessionRef),
      tx.get(pageTotalRef),
      tx.get(globalTotalRef),
    ]);
    const isNewPageSession = !pageSessionSnap.exists;
    const isNewGlobalSession = !globalSessionSnap.exists;
    const common = {
      totalViews: FieldValue.increment(1),
      uniqueSessions: FieldValue.increment(isNewPageSession ? 1 : 0),
      authenticatedViews: FieldValue.increment(isAuthenticated ? 1 : 0),
      anonymousViews: FieldValue.increment(isAuthenticated ? 0 : 1),
      byDevice: { [device]: FieldValue.increment(1) },
      bySource: { [source]: FieldValue.increment(1) },
      lastViewedAt: FieldValue.serverTimestamp(),
    };
    tx.set(pageTotalRef, {
      ...common,
      path,
      title: title || path,
      pageType,
      ...(!pageTotalSnap.exists ? { firstViewedAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    tx.set(pageDailyRef, { ...common, pageId, path, title: title || path, pageType, date }, { merge: true });
    tx.set(globalTotalRef, {
      totalViews: FieldValue.increment(1),
      uniqueSessions: FieldValue.increment(isNewGlobalSession ? 1 : 0),
      authenticatedViews: FieldValue.increment(isAuthenticated ? 1 : 0),
      anonymousViews: FieldValue.increment(isAuthenticated ? 0 : 1),
      byDevice: { [device]: FieldValue.increment(1) },
      bySource: { [source]: FieldValue.increment(1) },
      lastViewedAt: FieldValue.serverTimestamp(),
      ...(!globalTotalSnap.exists ? { firstViewedAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    tx.set(globalDailyRef, {
      date,
      totalViews: FieldValue.increment(1),
      uniqueSessions: FieldValue.increment(isNewGlobalSession ? 1 : 0),
      authenticatedViews: FieldValue.increment(isAuthenticated ? 1 : 0),
      anonymousViews: FieldValue.increment(isAuthenticated ? 0 : 1),
      byDevice: { [device]: FieldValue.increment(1) },
      bySource: { [source]: FieldValue.increment(1) },
      lastViewedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const markerData = {
      date,
      expiresAt: Timestamp.fromMillis(Date.now() + (40 * DAY_MS)),
    };
    if (isNewPageSession) tx.set(pageSessionRef, markerData);
    if (isNewGlobalSession) tx.set(globalSessionRef, markerData);
  });

  return { ok: true };
});

const recordShareEvent = onCall({ invoker: "public" }, async (request) => {
  const path = sanitizePath(request.data?.path);
  const pageType = pageTypeForPath(path);
  const channel = asString(request.data?.channel, 20);
  const entityType = asString(request.data?.entityType, 20);
  const eventId = asString(request.data?.eventId, 128);
  const title = asString(request.data?.title, 140).replace(/[<>]/g, "") || path;
  const shareCount = Math.min(20, Math.max(1, Math.floor(Number(request.data?.count) || 1)));
  if (pageType === "other" || !VALID_SHARE_CHANNELS.has(channel) || !VALID_SHARE_ENTITY_TYPES.has(entityType) || !EVENT_ID_PATTERN.test(eventId)) {
    throw new HttpsError("invalid-argument", "Evento de compartido no valido.");
  }

  const rawRateKey = rateLimitKey(request.rawRequest, request.auth);
  const rate = await rateLimit("shareAnalytics", hash(rawRateKey), 60, 60);
  if (!rate.allowed) throw new HttpsError("resource-exhausted", "Demasiados compartidos registrados.");

  const date = analyticsDate();
  const pageId = hash(path);
  const placeId = placeIdFromPath(path);
  const markerRef = db.collection("shareEventMarkers").doc(hash(eventId));
  const pageTotalRef = db.collection("pageAnalyticsTotals").doc(pageId);
  const pageDailyRef = db.collection("pageAnalyticsDaily").doc(`${date}_${pageId}`);
  const globalTotalRef = db.collection("pageAnalyticsGlobal").doc("all");
  const globalDailyRef = db.collection("pageAnalyticsGlobalDaily").doc(date);
  const placeDailyRef = placeId
    ? db.collection("placeAnalyticsDaily").doc(`${date}_${hash(placeId)}`)
    : null;

  let counted = false;
  await db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return;
    counted = true;
    const common = {
      totalShares: FieldValue.increment(shareCount),
      shareActions: FieldValue.increment(1),
      byShareChannel: { [channel]: FieldValue.increment(shareCount) },
      byShareEntityType: { [entityType]: FieldValue.increment(shareCount) },
      lastSharedAt: FieldValue.serverTimestamp(),
    };
    tx.set(pageTotalRef, { ...common, path, title, pageType }, { merge: true });
    tx.set(pageDailyRef, { ...common, pageId, path, title, pageType, date }, { merge: true });
    tx.set(globalTotalRef, common, { merge: true });
    tx.set(globalDailyRef, { ...common, date }, { merge: true });
    if (placeDailyRef) {
      tx.set(placeDailyRef, { ...common, date, placeId }, { merge: true });
    }
    tx.set(markerRef, {
      date,
      expiresAt: Timestamp.fromMillis(Date.now() + (40 * DAY_MS)),
    });
  });

  return { counted, count: counted ? shareCount : 0 };
});

const recordConnectionLocation = onCall({ invoker: "public" }, async (request) => {
  const sessionId = asString(request.data?.sessionId, 128);
  const rawLat = coordinate(request.data?.lat, -90, 90);
  const rawLng = coordinate(request.data?.lng, -180, 180);
  if (!SESSION_ID_PATTERN.test(sessionId) || rawLat === null || rawLng === null) {
    throw new HttpsError("invalid-argument", "Ubicacion de analitica no valida.");
  }

  const rawRateKey = rateLimitKey(request.rawRequest, request.auth);
  const rate = await rateLimit("connectionGeoAnalytics", hash(rawRateKey), 10, 24 * 60 * 60);
  if (!rate.allowed) throw new HttpsError("resource-exhausted", "Demasiados registros de ubicacion.");

  const lat = quantizeCoordinate(rawLat);
  const lng = quantizeCoordinate(rawLng);
  const date = analyticsDate();
  const cellId = `${lat.toFixed(1)}_${lng.toFixed(1)}`;
  const markerRef = db.collection("connectionGeoMarkers").doc(hash(`${date}|${sessionId}`));
  const dailyRef = db.collection("connectionGeoDaily").doc(`${date}_${hash(cellId)}`);
  let counted = false;

  await db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return;
    counted = true;
    tx.set(dailyRef, {
      date,
      cellId,
      lat,
      lng,
      sessions: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(markerRef, {
      date,
      expiresAt: Timestamp.fromMillis(Date.now() + (40 * DAY_MS)),
    });
  });
  return { counted };
});

const getPageAnalytics = onCall({ invoker: "public" }, async (request) => {
  await assertJefeAccess(request.auth?.uid, "Solo un jefe puede consultar las estadisticas.");
  const path = sanitizePath(request.data?.path);
  const days = Math.min(90, Math.max(1, Math.floor(Number(request.data?.days) || 30)));
  const pageId = hash(path);
  const dates = datesForPeriod(days);
  const refs = dates.map((date) => db.collection("pageAnalyticsDaily").doc(`${date}_${pageId}`));
  const [totalSnap, ...dailySnaps] = await db.getAll(db.collection("pageAnalyticsTotals").doc(pageId), ...refs);

  return {
    path,
    days,
    total: serializeAnalyticsDoc(totalSnap.exists ? totalSnap.data() : { path, pageType: pageTypeForPath(path) }),
    daily: dailySnaps.map((snap, index) => ({ date: dates[index], ...serializeAnalyticsDoc(snap.exists ? snap.data() : {}) })),
  };
});

const getAnalyticsOverview = onCall({ invoker: "public" }, async (request) => {
  await assertJefeAccess(request.auth?.uid, "Solo un jefe puede consultar las estadisticas.");
  const days = Math.min(90, Math.max(1, Math.floor(Number(request.data?.days) || 30)));
  const fromDate = dateDaysAgo(days - 1);
  const dates = datesForPeriod(days);
  const globalDailyRefs = dates.map((date) => db.collection("pageAnalyticsGlobalDaily").doc(date));

  const [globalTotalSnap, pageDailySnap, ...globalDailySnaps] = await Promise.all([
    db.collection("pageAnalyticsGlobal").doc("all").get(),
    db.collection("pageAnalyticsDaily").where("date", ">=", fromDate).limit(MAX_PERIOD_DAILY_DOCS).get(),
    ...globalDailyRefs.map((ref) => ref.get()),
  ]);

  const pages = new Map();
  pageDailySnap.docs.forEach((docSnap) => {
    const row = serializeAnalyticsDoc(docSnap.data());
    const current = pages.get(row.path) || {
      path: row.path,
      title: row.title,
      pageType: row.pageType,
      totalViews: 0,
      uniqueSessions: 0,
      authenticatedViews: 0,
      anonymousViews: 0,
      totalShares: 0,
      shareActions: 0,
      byDevice: {},
      bySource: {},
      byShareChannel: {},
      byShareEntityType: {},
    };
    current.title = row.title || current.title;
    current.totalViews += row.totalViews;
    current.uniqueSessions += row.uniqueSessions;
    current.authenticatedViews += row.authenticatedViews;
    current.anonymousViews += row.anonymousViews;
    current.totalShares += row.totalShares;
    current.shareActions += row.shareActions;
    addNumericMap(current.byDevice, row.byDevice);
    addNumericMap(current.bySource, row.bySource);
    addNumericMap(current.byShareChannel, row.byShareChannel);
    addNumericMap(current.byShareEntityType, row.byShareEntityType);
    pages.set(row.path, current);
  });

  return {
    days,
    fromDate,
    coverageCapped: pageDailySnap.size >= MAX_PERIOD_DAILY_DOCS,
    allTime: serializeAnalyticsDoc(globalTotalSnap.exists ? globalTotalSnap.data() : {}),
    daily: globalDailySnaps.map((snap, index) => ({ date: dates[index], ...serializeAnalyticsDoc(snap.exists ? snap.data() : {}) })),
    topPages: Array.from(pages.values())
      .sort((a, b) => b.totalViews - a.totalViews || b.totalShares - a.totalShares)
      .slice(0, 100),
  };
});

const getBusinessPlaceAnalytics = onCall({ invoker: "public" }, async (request) => {
  const placeId = asString(request.data?.placeId, 300);
  await assertBusinessAnalyticsAccess(placeId, request.auth?.uid);
  const days = Math.min(90, Math.max(1, Math.floor(Number(request.data?.days) || 30)));
  const dates = datesForPeriod(days);
  const path = `/place/${placeId}`;
  const pageId = hash(path);
  const pageRefs = dates.map((date) => db.collection("pageAnalyticsDaily").doc(`${date}_${pageId}`));
  const placeRefs = dates.map((date) => db.collection("placeAnalyticsDaily").doc(`${date}_${hash(placeId)}`));
  const [totalSnap, ...dailySnaps] = await db.getAll(
    db.collection("pageAnalyticsTotals").doc(pageId),
    ...pageRefs,
    ...placeRefs,
  );
  const pageSnaps = dailySnaps.slice(0, dates.length);
  const placeSnaps = dailySnaps.slice(dates.length);
  return {
    placeId,
    days,
    page: {
      path,
      days,
      total: serializeAnalyticsDoc(totalSnap.exists ? totalSnap.data() : { path, pageType: "place" }),
      daily: pageSnaps.map((snap, index) => ({ date: dates[index], ...serializeAnalyticsDoc(snap.exists ? snap.data() : {}) })),
    },
    relatedDaily: placeSnaps.map((snap, index) => serializePlaceDaily(snap.exists ? snap.data() : {}, dates[index])),
  };
});

const onReviewCreatedAnalytics = onDocumentCreated("lists/{listId}/reviews/{reviewId}", async (event) => {
  const review = event.data?.data() || {};
  const placeId = asString(review.placeId, 300);
  const geo = reviewGeo(review);
  if (!placeId || !geo) return;

  const date = reviewDate(review);
  const markerRef = db.collection("reviewAnalyticsMarkers").doc(hash(event.data.ref.path));
  const geoRef = db.collection("reviewGeoDaily").doc(`${date}_${hash(placeId)}`);
  const placeDailyRef = db.collection("placeAnalyticsDaily").doc(`${date}_${hash(placeId)}`);

  await db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return;
    tx.set(geoRef, {
      date,
      placeId,
      placeName: asString(review.placeName, 140) || placeId,
      lat: geo.lat,
      lng: geo.lng,
      reviews: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(placeDailyRef, {
      date,
      placeId,
      reviews: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(markerRef, {
      date,
      expiresAt: Timestamp.fromMillis(Date.now() + (400 * DAY_MS)),
    });
  });
});

const getAnalyticsHeatmaps = onCall({ invoker: "public" }, async (request) => {
  await assertJefeAccess(request.auth?.uid, "Solo un jefe puede consultar los mapas de analitica.");
  const days = Math.min(365, Math.max(1, Math.floor(Number(request.data?.days) || 30)));
  const fromDate = dateDaysAgo(days - 1);
  const [connectionSnap, reviewSnap] = await Promise.all([
    db.collection("connectionGeoDaily").where("date", ">=", fromDate).limit(MAX_HEATMAP_DOCS).get(),
    db.collection("reviewGeoDaily").where("date", ">=", fromDate).limit(MAX_HEATMAP_DOCS).get(),
  ]);

  const connectionCells = new Map();
  connectionSnap.docs.forEach((docSnap) => {
    const row = docSnap.data();
    const cellId = asString(row.cellId, 80);
    const lat = coordinate(row.lat, -90, 90);
    const lng = coordinate(row.lng, -180, 180);
    if (!cellId || lat === null || lng === null) return;
    const current = connectionCells.get(cellId) || { id: cellId, lat, lng, count: 0 };
    current.count += Number(row.sessions) || 0;
    connectionCells.set(cellId, current);
  });

  const reviewPlaces = new Map();
  reviewSnap.docs.forEach((docSnap) => {
    const row = docSnap.data();
    const placeId = asString(row.placeId, 300);
    const lat = coordinate(row.lat, -90, 90);
    const lng = coordinate(row.lng, -180, 180);
    if (!placeId || lat === null || lng === null) return;
    const current = reviewPlaces.get(placeId) || {
      id: placeId,
      placeId,
      label: asString(row.placeName, 140) || placeId,
      lat,
      lng,
      count: 0,
    };
    current.count += Number(row.reviews) || 0;
    reviewPlaces.set(placeId, current);
  });

  const allConnectionCells = Array.from(connectionCells.values());
  const visibleConnections = allConnectionCells.filter((row) => row.count >= GEO_PRIVACY_THRESHOLD);
  const suppressedConnections = allConnectionCells
    .filter((row) => row.count < GEO_PRIVACY_THRESHOLD)
    .reduce((sum, row) => sum + row.count, 0);

  return {
    days,
    fromDate,
    privacyThreshold: GEO_PRIVACY_THRESHOLD,
    coverageCapped: connectionSnap.size >= MAX_HEATMAP_DOCS || reviewSnap.size >= MAX_HEATMAP_DOCS,
    suppressedConnections,
    connections: visibleConnections.sort((a, b) => b.count - a.count),
    reviews: Array.from(reviewPlaces.values()).filter((row) => row.count > 0).sort((a, b) => b.count - a.count),
  };
});

const adminBackfillReviewHeatmap = onCall({ invoker: "public", timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  await assertJefeAccess(request.auth?.uid, "Solo un jefe puede reconstruir el mapa de resenas.");
  const snapshot = await db.collectionGroup("reviews").limit(MAX_REVIEW_BACKFILL).get();
  const groups = new Map();
  let skipped = 0;

  snapshot.docs.forEach((docSnap) => {
    const review = docSnap.data() || {};
    const placeId = asString(review.placeId, 300);
    const geo = reviewGeo(review);
    if (!placeId || !geo) {
      skipped += 1;
      return;
    }
    const date = reviewDate(review);
    const key = `${date}|${placeId}`;
    const current = groups.get(key) || {
      date,
      placeId,
      placeName: asString(review.placeName, 140) || placeId,
      lat: geo.lat,
      lng: geo.lng,
      reviews: 0,
    };
    current.reviews += 1;
    groups.set(key, current);
  });

  const rows = Array.from(groups.values());
  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = db.batch();
    rows.slice(offset, offset + 200).forEach((row) => {
      const suffix = `${row.date}_${hash(row.placeId)}`;
      batch.set(db.collection("reviewGeoDaily").doc(suffix), {
        ...row,
        backfilledAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(db.collection("placeAnalyticsDaily").doc(suffix), {
        date: row.date,
        placeId: row.placeId,
        reviews: row.reviews,
        backfilledAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }

  return {
    scanned: snapshot.size,
    aggregatedRows: rows.length,
    skipped,
    coverageCapped: snapshot.size >= MAX_REVIEW_BACKFILL,
  };
});

async function deleteExpiredMarkers(collectionName) {
  let deleted = 0;
  for (let batchNumber = 0; batchNumber < 10; batchNumber += 1) {
    const snapshot = await db.collection(collectionName)
      .where("expiresAt", "<=", Timestamp.now())
      .limit(400)
      .get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < 400) break;
  }
  return deleted;
}

const cleanupAnalyticsMarkers = onSchedule({
  schedule: "15 3 * * *",
  timeZone: ANALYTICS_TIME_ZONE,
  timeoutSeconds: 300,
}, async () => {
  const [pageMarkers, sponsoredMarkers, shareMarkers, connectionMarkers, reviewMarkers] = await Promise.all([
    deleteExpiredMarkers("pageAnalyticsSessionMarkers"),
    deleteExpiredMarkers("sponsoredEventMarkers"),
    deleteExpiredMarkers("shareEventMarkers"),
    deleteExpiredMarkers("connectionGeoMarkers"),
    deleteExpiredMarkers("reviewAnalyticsMarkers"),
  ]);
  logger.info("analytics: marcadores temporales eliminados", {
    pageMarkers,
    sponsoredMarkers,
    shareMarkers,
    connectionMarkers,
    reviewMarkers,
  });
});

module.exports = {
  recordPageView,
  recordShareEvent,
  recordConnectionLocation,
  getPageAnalytics,
  getAnalyticsOverview,
  getBusinessPlaceAnalytics,
  getAnalyticsHeatmaps,
  adminBackfillReviewHeatmap,
  onReviewCreatedAnalytics,
  cleanupAnalyticsMarkers,
};
