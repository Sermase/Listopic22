// functions/modules/ssr-meta.js
//
// Open Graph dinámico para links compartidos. La SPA sirve siempre las mismas
// metaetiquetas, así que WhatsApp/Telegram/Twitter mostraban "Listopic" a
// secas para cualquier link. Solución: URLs de compartir /s/... reescritas a
// esta función (firebase.json), que responde un HTML mínimo con og:title,
// og:description y og:image reales de la entidad + redirección inmediata a la
// ruta de la SPA para humanos. Los bots leen las etiquetas; las personas ni lo
// notan.
//
// Rutas soportadas:
//   /s/place/{placeId}
//   /s/list/{listId}
//   /s/group/{placeId}/{itemName}
//   /s/profile/{userId}
//   /s/review/{listId}/{reviewId}
// /s/img?u={foto} (proxy con CORS para las tarjetas de la app)
// y la imagen de la vista previa de cada una en /s/og/{misma ruta}: un JPEG
// 1200×630 con foto, nota y marca (modules/share-image.js).

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("crypto");
const { renderShareImage, fetchImageBytes } = require("./share-image");

const db = getFirestore();

const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || "https://listopic.es").replace(/\/$/, "");

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const formatScore = (value) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : null);

function pickPlaceImage(place = {}) {
  const candidates = [place.userPhotoUrl, place.mainImageUrl, place.photoUrl];
  return candidates.find((url) => typeof url === "string" && url.startsWith("http")) || "";
}

async function buildPlaceMeta(placeId) {
  const snap = await db.collection("places").doc(placeId).get();
  if (!snap.exists) return null;
  const place = snap.data() || {};
  // Nota y nº de la nota pública (personas); sin ella, nada de nota (los bots no cuentan).
  const humanCount = Number(place.publicHumanReviewsCount ?? place.reviewsCount) || 0;
  const score = humanCount > 0 ? formatScore(place.averageRating ?? place.avgScore ?? place.rating) : null;
  const reviews = humanCount > 0 ? `${humanCount} reseñas` : null;
  return {
    title: `${place.name || "Lugar"} · Listopic`,
    description: [score ? `⭐ ${score}` : null, reviews, place.city || place.address || null]
      .filter(Boolean).join(" · ") || "Descúbrelo en Listopic.",
    image: pickPlaceImage(place),
    redirect: `/place/${encodeURIComponent(placeId)}`,
    card: {
      kind: "place",
      data: {
        title: place.name || "Lugar",
        chip: "Sitio",
        city: place.city || null,
        imageUrl: pickPlaceImage(place),
        score: score ? Number(score) : null,
        reviewCount: humanCount,
      },
    },
  };
}

async function buildListMeta(listId) {
  const snap = await db.collection("lists").doc(listId).get();
  if (!snap.exists) return null;
  const list = snap.data() || {};
  // Una lista privada no debe revelar nombre, autor ni portada en la vista
  // previa del enlace: se sirve la genérica y se redirige a la lista (la app
  // ya decide si quien abre el enlace tiene acceso).
  const isPublicList = list.isPublic === true || list.visibility === "public";
  if (!isPublicList) {
    return { ...DEFAULT_META, redirect: `/list/${encodeURIComponent(listId)}` };
  }
  const total = Number(list.reviewCount || list.itemCount) || 0;
  const count = total > 0 ? `${total} reseñas` : null;
  const average = formatScore(list.averageRating);
  const top = await fetchListTop(listId).catch(() => ({ top: [], more: 0 }));
  const cover = typeof list.mainImageUrl === "string" ? list.mainImageUrl : (typeof list.photoUrl === "string" ? list.photoUrl : "");
  return {
    title: `${list.name || "Lista"} · Listopic`,
    description: [count, average ? `media ⭐ ${average}` : null, list.authorName ? `por ${list.authorName}` : null]
      .filter(Boolean).join(" · ") || "Una lista de la comunidad Listopic.",
    image: cover,
    redirect: `/list/${encodeURIComponent(listId)}`,
    card: {
      kind: "list",
      data: {
        title: list.name || "Lista",
        count: total,
        average: average ? Number(average) : null,
        authorName: list.authorName || null,
        imageUrl: cover,
        top: top.top,
        more: top.more,
      },
    },
  };
}

async function buildGroupMeta(placeId, itemName) {
  const placeSnap = await db.collection("places").doc(placeId).get();
  if (!placeSnap.exists) return null;
  const place = placeSnap.data() || {};

  // Busca el item canónico por nombre para nota media y nº de reseñas.
  const normalized = String(itemName || "").trim();
  let score = null;
  let count = null;
  try {
    const itemsSnap = await db.collection("places").doc(placeId).collection("items").get();
    const lowered = normalized.toLowerCase();
    const match = itemsSnap.docs.find((docSnap) => {
      const item = docSnap.data() || {};
      if (String(item.canonicalName || "").toLowerCase() === lowered) return true;
      return Array.isArray(item.sourceNames)
        && item.sourceNames.some((source) => String(source?.name || "").toLowerCase() === lowered);
    });
    if (match) {
      const stats = match.data().stats || {};
      score = formatScore(stats.averageRating);
      count = Number(stats.reviewCount) > 0 ? `${stats.reviewCount} reseñas` : null;
    }
  } catch (_) { /* metadatos opcionales */ }

  return {
    title: `${normalized || "Plato"} en ${place.name || "un lugar"} · Listopic`,
    description: [score ? `⭐ ${score}` : null, count, place.city || null]
      .filter(Boolean).join(" · ") || `Opiniones reales sobre ${normalized} en Listopic.`,
    image: pickPlaceImage(place),
    redirect: `/group/${encodeURIComponent(placeId)}/${encodeURIComponent(normalized)}`,
    card: {
      kind: "group",
      data: {
        title: normalized || "Plato",
        chip: "Plato",
        city: [place.name, place.city].filter(Boolean).join(" · ") || null,
        imageUrl: pickPlaceImage(place),
        score: score ? Number(score) : null,
        reviewCount: count ? Number.parseInt(count, 10) : 0,
      },
    },
  };
}

// Las 3 mejores de la lista (por sitio), solo con valoraciones públicas.
const LIST_TOP_SAMPLE = 80;
async function fetchListTop(listId) {
  const [nested, root] = await Promise.all([
    db.collection("lists").doc(listId).collection("reviews")
      .where("visibility", "==", "public").limit(LIST_TOP_SAMPLE).get(),
    db.collection("reviews").where("listId", "==", listId)
      .where("visibility", "==", "public").limit(LIST_TOP_SAMPLE).get(),
  ]);
  const byPlace = new Map();
  const seen = new Set();
  [...nested.docs, ...root.docs].forEach((docSnap) => {
    if (seen.has(docSnap.id)) return;
    seen.add(docSnap.id);
    const review = docSnap.data() || {};
    const key = review.placeId || review.placeName;
    if (!key || typeof review.overallRating !== "number") return;
    const entry = byPlace.get(key) || { name: review.placeName || "", total: 0, count: 0, imageUrl: "" };
    entry.total += review.overallRating;
    entry.count += 1;
    if (!entry.imageUrl) {
      entry.imageUrl = [review.photoUrl, ...(Array.isArray(review.photoUrls) ? review.photoUrls : []), review.placeMainImage]
        .find((url) => typeof url === "string" && url.startsWith("http")) || "";
    }
    byPlace.set(key, entry);
  });
  const ranked = Array.from(byPlace.values())
    .map((entry) => ({ name: entry.name, score: Number((entry.total / entry.count).toFixed(1)), count: entry.count, imageUrl: entry.imageUrl }))
    .sort((a, b) => (b.score - a.score) || (b.count - a.count));
  const complete = nested.size < LIST_TOP_SAMPLE && root.size < LIST_TOP_SAMPLE;
  return {
    top: ranked.slice(0, 3).map(({ name, score, imageUrl }) => ({ name, score, imageUrl })),
    more: complete ? Math.max(0, ranked.length - 3) : 0,
  };
}

async function buildProfileMeta(userId) {
  const snap = await db.collection("publicProfiles").doc(userId).get();
  if (!snap.exists) return { ...DEFAULT_META, redirect: `/profile/${encodeURIComponent(userId)}` };
  const profile = snap.data() || {};
  const name = profile.displayName || profile.name || profile.username || "Perfil";
  const handle = profile.username ? `@${profile.username}` : null;
  const location = typeof profile.location === "string" ? profile.location
    : (typeof profile.residence === "string" ? profile.residence : null);
  const reviews = Number(profile.reviewsCount) || 0;
  const followers = Number(profile.followersCount) || 0;
  const stats = [
    { label: reviews === 1 ? "valoración" : "valoraciones", value: reviews },
    { label: followers === 1 ? "seguidor" : "seguidores", value: followers },
  ];
  if (Number(profile.level) > 0) stats.push({ label: "nivel", value: Number(profile.level) });
  const photoUrl = typeof profile.photoUrl === "string" ? profile.photoUrl : "";
  return {
    title: `${name}${handle ? ` (${handle})` : ""} · Listopic`,
    description: [`${reviews} ${stats[0].label}`, `${followers} ${stats[1].label}`, location].filter(Boolean).join(" · "),
    image: photoUrl,
    redirect: `/profile/${encodeURIComponent(userId)}`,
    card: {
      kind: "profile",
      data: { title: name, subtitle: [handle, location].filter(Boolean).join(" · "), photoUrl, stats },
    },
  };
}

// Valoración concreta: autor, plato, sitio, ciudad y su nota. Solo si la
// valoración y su lista son públicas; si no, se cae a la del plato (sin autor).
async function buildReviewMeta(listId, reviewId) {
  const [listSnap, nestedSnap] = await Promise.all([
    db.collection("lists").doc(listId).get(),
    db.collection("lists").doc(listId).collection("reviews").doc(reviewId).get(),
  ]);
  const reviewSnap = nestedSnap.exists ? nestedSnap : await db.collection("reviews").doc(reviewId).get();
  if (!reviewSnap.exists) return null;
  const review = reviewSnap.data() || {};
  const list = listSnap.exists ? listSnap.data() || {} : {};
  const listIsPublic = list.isPublic === true || list.visibility === "public";
  const belongsToList = review.listId === listId || review.parentListId === listId || review.sublistId === listId || nestedSnap.exists;
  const groupRedirect = review.placeId && review.itemName
    ? `/group/${encodeURIComponent(review.placeId)}/${encodeURIComponent(review.itemName)}`
    : `/list/${encodeURIComponent(listId)}`;
  if (review.visibility !== "public" || !listIsPublic || !belongsToList) {
    if (review.placeId && review.itemName) {
      return buildGroupMeta(review.placeId, review.itemName).then((meta) => meta || { ...DEFAULT_META, redirect: groupRedirect });
    }
    return { ...DEFAULT_META, redirect: groupRedirect };
  }

  const authorId = review.userId || review.authorId;
  const [placeSnap, authorSnap] = await Promise.all([
    review.placeId ? db.collection("places").doc(review.placeId).get() : Promise.resolve(null),
    authorId ? db.collection("publicProfiles").doc(authorId).get() : Promise.resolve(null),
  ]);
  const place = placeSnap && placeSnap.exists ? placeSnap.data() || {} : {};
  const author = authorSnap && authorSnap.exists ? authorSnap.data() || {} : {};
  const authorName = author.displayName || author.username || review.authorName || "Alguien";
  const placeName = review.placeName || place.name || "";
  const city = review.placeCity || place.city || "";
  const item = review.itemName || placeName || "Valoración";
  const score = formatScore(review.overallRating);
  const comment = typeof review.comment === "string" ? review.comment.trim().replace(/\s+/g, " ") : "";
  const photo = [review.photoUrl, ...(Array.isArray(review.photoUrls) ? review.photoUrls : []), review.placeMainImage, pickPlaceImage(place)]
    .find((url) => typeof url === "string" && url.startsWith("http")) || "";
  return {
    title: `${authorName} ha valorado ${item}${score ? ` · ${score}` : ""}`,
    description: [placeName && city ? `en ${placeName}, ${city}` : (placeName ? `en ${placeName}` : null),
      comment ? `«${comment.length > 120 ? `${comment.slice(0, 117)}…` : comment}»` : null]
      .filter(Boolean).join(" · ") || "Opiniones reales con nota en Listopic.",
    image: photo,
    redirect: groupRedirect,
    card: {
      kind: "review",
      data: {
        title: item,
        placeName,
        city,
        authorName,
        authorPhoto: typeof author.photoUrl === "string" ? author.photoUrl : (review.authorPhoto || ""),
        imageUrl: photo,
        score: score ? Number(score) : null,
        comment,
      },
    },
  };
}

const DEFAULT_META = {
  title: "Listopic",
  description: "Recomendaciones reales de la comunidad: listas, lugares y platos con nota.",
  image: "",
  redirect: "/",
};

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
};

async function resolveMeta(segments) {
  // segments: ['place', id] | ['list', id] | ['group', placeId, ...item] | ['profile', uid] | ['review', listId, reviewId]
  const kind = segments[0];
  const arg = (index) => decodeURIComponent(segments[index] || "");
  if (kind === "place" && segments.length >= 2) return buildPlaceMeta(arg(1));
  if (kind === "list" && segments.length >= 2) return buildListMeta(arg(1));
  if (kind === "group" && segments.length >= 3) return buildGroupMeta(arg(1), decodeURIComponent(segments.slice(2).join("/")));
  if (kind === "profile" && segments.length >= 2) return buildProfileMeta(arg(1));
  if (kind === "review" && segments.length >= 3) return buildReviewMeta(arg(1), arg(2));
  return null;
}

// La versión en la URL de la imagen cambia con sus datos: si cambia la nota o
// la foto, WhatsApp y la caché de Hosting piden una imagen nueva.
const cardVersion = (card) => crypto.createHash("sha1").update(JSON.stringify(card)).digest("hex").slice(0, 10);

const ssrMeta = onRequest({ invoker: "public", memory: "512MiB", timeoutSeconds: 30 }, async (req, res) => {
  const segments = req.path.split("/").filter(Boolean); // ['s', 'place', id, ...]

  // Proxy de fotos para las tarjetas que dibuja la app en el navegador: las de
  // Firebase Storage no traen CORS y el canvas no podría leerlas.
  if (segments[0] === "s" && segments[1] === "img") {
    const image = await fetchImageBytes(typeof req.query?.u === "string" ? req.query.u : "");
    if (!image) {
      res.set("Cache-Control", "public, max-age=60");
      res.status(404).send("");
      return;
    }
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Content-Type", image.contentType);
    res.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.status(200).send(image.buffer);
    return;
  }

  if (segments[0] === "s" && segments[1] === "og") {
    let ogMeta = null;
    try {
      ogMeta = await resolveMeta(segments.slice(2));
    } catch (error) {
      logger.warn("ssrMeta: fallo leyendo datos de la imagen", { path: req.path, error: error.message });
    }
    try {
      const card = ogMeta && ogMeta.card ? ogMeta.card : { kind: "default", data: {} };
      const jpeg = await renderShareImage(card.kind, card.data);
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", ogMeta && ogMeta.card ? "public, max-age=86400, s-maxage=604800" : "public, max-age=600, s-maxage=600");
      res.status(200).send(jpeg);
    } catch (error) {
      logger.error("ssrMeta: fallo dibujando la imagen", { path: req.path, error: error.message });
      res.status(500).send("");
    }
    return;
  }

  let meta = null;
  try {
    if (segments[0] === "s" && segments.length >= 3) meta = await resolveMeta(segments.slice(1));
  } catch (error) {
    logger.warn("ssrMeta: fallo construyendo metadatos", { path: req.path, error: error.message });
  }

  const resolved = meta || DEFAULT_META;
  const targetUrl = `${PUBLIC_ORIGIN}${resolved.redirect}`;
  const ogPath = segments.slice(1).map((part) => encodeURIComponent(safeDecode(part))).join("/");
  // Sin datos públicos (privado o inexistente): tarjeta genérica de la marca.
  const image = resolved.card
    ? `${PUBLIC_ORIGIN}/s/og/${ogPath}?v=${cardVersion(resolved.card)}`
    : (resolved.image || `${PUBLIC_ORIGIN}/s/og/app`);

  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(resolved.title)}</title>
  <meta name="description" content="${escapeHtml(resolved.description)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Listopic">
  <meta property="og:title" content="${escapeHtml(resolved.title)}">
  <meta property="og:description" content="${escapeHtml(resolved.description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  ${resolved.card || !resolved.image ? `<meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(resolved.title)}">` : ""}
  <meta property="og:url" content="${escapeHtml(targetUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(resolved.title)}">
  <meta name="twitter:description" content="${escapeHtml(resolved.description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <link rel="canonical" href="${escapeHtml(targetUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}">
</head>
<body>
  <p>Redirigiendo a <a href="${escapeHtml(targetUrl)}">${escapeHtml(resolved.title)}</a>…</p>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`);
});

module.exports = { ssrMeta, fetchListTop };
