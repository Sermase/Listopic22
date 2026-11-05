// functions/modules/seo-page.js
//
// La SPA llega a Google igual en todas las páginas: título «Listopic», sin
// descripción y un spinner. Esta función sirve el mismo index.html de Hosting
// pero con la cabecera propia de cada sitio, lista o plato: título,
// descripción, canónica, Open Graph y datos estructurados (estrellas en
// Google). El cuerpo y el JS son los de siempre: la persona no nota nada.
//
// Rutas (reescritas en firebase.json): /place/{id}, /list/{id},
// /group/{placeId}/{plato}. Si algo falla, se sirve index.html tal cual.

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore } = require("firebase-admin/firestore");
const { resolveMeta } = require("./ssr-meta");

const db = getFirestore();
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || "https://listopic.es").replace(/\/$/, "");

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Dentro de <script type="application/ld+json"> no puede aparecer "</script>".
const jsonLd = (data) => JSON.stringify(data).replace(/</g, "\\u003c");

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
};

// Sin caché propia a propósito: cada despliegue cambia los nombres de los JS
// y un index.html viejo dejaría la página en blanco. Es un acierto de la CDN.
async function fetchShell() {
  const response = await fetch(`${PUBLIC_ORIGIN}/index.html`, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`index.html ${response.status}`);
  return response.text();
}

const coords = (place) => {
  const loc = place.location || place.coordinates || {};
  const lat = Number(loc.latitude ?? loc.lat ?? place.lat);
  const lng = Number(loc.longitude ?? loc.lng ?? place.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
};

const placeTitle = (place) => `${place.name || "Lugar"}${place.city ? ` (${place.city})` : ""}: notas y platos · Listopic`;

function restaurantLd(place, url) {
  const humanCount = Number(place.publicHumanReviewsCount ?? place.reviewsCount) || 0;
  const rating = Number(place.averageRating ?? place.avgScore ?? place.rating);
  const geo = coords(place);
  const image = [place.userPhotoUrl, place.mainImageUrl, place.photoUrl].find((u) => typeof u === "string" && u.startsWith("http"));
  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: place.name || "Lugar",
    url,
    ...(image ? { image } : {}),
    ...(place.address || place.city ? {
      address: {
        "@type": "PostalAddress",
        ...(place.address ? { streetAddress: place.address } : {}),
        ...(place.city ? { addressLocality: place.city } : {}),
        addressCountry: "ES",
      },
    } : {}),
    ...(geo ? { geo: { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng } } : {}),
  };
  // Solo notas de personas (los bots no cuentan) y en la escala de Listopic.
  if (humanCount > 0 && Number.isFinite(rating) && rating > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(rating.toFixed(1)),
      bestRating: 10,
      worstRating: 0,
      ratingCount: humanCount,
    };
  }
  return data;
}

function listLd(meta, url) {
  const top = (meta.card && meta.card.data && Array.isArray(meta.card.data.top)) ? meta.card.data.top : [];
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: meta.card && meta.card.data ? meta.card.data.title : meta.title,
    url,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: top.map((entry, index) => ({ "@type": "ListItem", position: index + 1, name: entry.name })),
  };
}

async function buildHead(segments) {
  const kind = segments[0];
  const meta = await resolveMeta(segments);
  // Lista privada o inexistente: resolveMeta da la genérica (sin card).
  if (!meta || !meta.card) return { noindex: true };
  const url = `${PUBLIC_ORIGIN}${meta.redirect}`;
  const image = meta.image || "";
  let title = meta.title;
  let description = meta.description;
  let ld = null;
  if (kind === "place") {
    const snap = await db.collection("places").doc(safeDecode(segments[1])).get();
    const place = snap.data() || {};
    title = placeTitle(place);
    ld = restaurantLd(place, url);
  } else if (kind === "list") {
    title = `${meta.card.data.title}: el ranking · Listopic`;
    description = `Ranking de ${meta.card.data.title} con notas reales de la comunidad. ${meta.description}`;
    ld = listLd(meta, url);
  } else if (kind === "group") {
    const where = meta.card.data.city ? ` en ${meta.card.data.city}` : "";
    title = `${meta.card.data.title}${where} · Listopic`;
    description = `Nota y opiniones reales de ${meta.card.data.title}${where}. ${meta.description}`;
  }
  return { title, description, url, image, ld };
}

function injectHead(shell, head) {
  // Fuera lo genérico de index.html que vamos a sustituir.
  let html = shell
    .replace(/\s*<meta name="description"[^>]*>/i, "")
    .replace(/\s*<meta property="og:(title|description|image|type|url)"[^>]*>/gi, "");
  if (head.noindex) {
    return html.replace("</head>", '  <meta name="robots" content="noindex" />\n</head>');
  }
  const tags = [
    `<meta name="description" content="${escapeHtml(head.description)}" data-ssr="1" />`,
    `<link rel="canonical" href="${escapeHtml(head.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(head.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(head.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(head.url)}" />`,
    head.image ? `<meta property="og:image" content="${escapeHtml(head.image)}" />` : "",
    head.ld ? `<script type="application/ld+json">${jsonLd(head.ld)}</script>` : "",
  ].filter(Boolean).join("\n  ");
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(head.title)}</title>\n  ${tags}`);
  return html;
}

const seoPage = onRequest({ invoker: "public", memory: "256MiB", timeoutSeconds: 15 }, async (req, res) => {
  const segments = req.path.split("/").filter(Boolean);
  let shell;
  try {
    shell = await fetchShell();
  } catch (error) {
    logger.error("seoPage: no se pudo leer index.html", { error: error.message });
    res.set("Cache-Control", "no-cache");
    res.status(503).send("Listopic no está disponible ahora mismo. Recarga en unos segundos.");
    return;
  }
  let html = shell;
  try {
    if (["place", "list", "group"].includes(segments[0]) && segments.length >= 2) {
      html = injectHead(shell, await buildHead(segments));
    }
  } catch (error) {
    logger.warn("seoPage: sin cabecera propia", { path: req.path, error: error.message });
  }
  res.set("Content-Type", "text/html; charset=utf-8");
  // Corta: el HTML apunta a los JS de este despliegue.
  res.set("Cache-Control", "public, max-age=0, s-maxage=300");
  res.status(200).send(html);
});

module.exports = { seoPage };
