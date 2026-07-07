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

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore } = require("firebase-admin/firestore");

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
  const score = formatScore(place.avgScore || place.rating);
  const reviews = Number(place.reviewsCount) > 0 ? `${place.reviewsCount} reseñas` : null;
  return {
    title: `${place.name || "Lugar"} · Listopic`,
    description: [score ? `⭐ ${score}` : null, reviews, place.city || place.address || null]
      .filter(Boolean).join(" · ") || "Descúbrelo en Listopic.",
    image: pickPlaceImage(place),
    redirect: `/place/${encodeURIComponent(placeId)}`,
  };
}

async function buildListMeta(listId) {
  const snap = await db.collection("lists").doc(listId).get();
  if (!snap.exists) return null;
  const list = snap.data() || {};
  const count = Number(list.reviewCount || list.itemCount) > 0 ? `${list.reviewCount || list.itemCount} reseñas` : null;
  const average = formatScore(list.averageRating);
  return {
    title: `${list.name || "Lista"} · Listopic`,
    description: [count, average ? `media ⭐ ${average}` : null, list.authorName ? `por ${list.authorName}` : null]
      .filter(Boolean).join(" · ") || "Una lista de la comunidad Listopic.",
    image: typeof list.mainImageUrl === "string" ? list.mainImageUrl : (typeof list.photoUrl === "string" ? list.photoUrl : ""),
    redirect: `/list/${encodeURIComponent(listId)}`,
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
  };
}

const DEFAULT_META = {
  title: "Listopic",
  description: "Recomendaciones reales de la comunidad: listas, lugares y platos con nota.",
  image: "",
  redirect: "/",
};

const ssrMeta = onRequest({ invoker: "public" }, async (req, res) => {
  const segments = req.path.split("/").filter(Boolean); // ['s', 'place', id, ...]
  let meta = null;

  try {
    if (segments[0] === "s" && segments.length >= 3) {
      const kind = segments[1];
      if (kind === "place") meta = await buildPlaceMeta(decodeURIComponent(segments[2]));
      else if (kind === "list") meta = await buildListMeta(decodeURIComponent(segments[2]));
      else if (kind === "group" && segments.length >= 4) {
        meta = await buildGroupMeta(decodeURIComponent(segments[2]), decodeURIComponent(segments.slice(3).join("/")));
      }
    }
  } catch (error) {
    logger.warn("ssrMeta: fallo construyendo metadatos", { path: req.path, error: error.message });
  }

  const resolved = meta || DEFAULT_META;
  const targetUrl = `${PUBLIC_ORIGIN}${resolved.redirect}`;

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
  ${resolved.image ? `<meta property="og:image" content="${escapeHtml(resolved.image)}">` : ""}
  <meta property="og:url" content="${escapeHtml(targetUrl)}">
  <meta name="twitter:card" content="${resolved.image ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(resolved.title)}">
  <meta name="twitter:description" content="${escapeHtml(resolved.description)}">
  ${resolved.image ? `<meta name="twitter:image" content="${escapeHtml(resolved.image)}">` : ""}
  <link rel="canonical" href="${escapeHtml(targetUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}">
</head>
<body>
  <p>Redirigiendo a <a href="${escapeHtml(targetUrl)}">${escapeHtml(resolved.title)}</a>…</p>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`);
});

module.exports = { ssrMeta };
