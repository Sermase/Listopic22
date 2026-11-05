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
// Y las páginas de ranking /mejores y /mejores/{lista}/{ciudad}: HTML propio,
// sin la app, para que Google las lea sin ejecutar nada (lib/seo-rankings.js).

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore } = require("firebase-admin/firestore");
const { resolveMeta } = require("./ssr-meta");
const { loadRankings } = require("./lib/seo-rankings");

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


// ---------- Páginas de ranking (/mejores) ----------

const fmtScore = (value) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(1).replace(".", ",") : "–");
const todayEs = () => new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
const itemHref = (item) => (item.itemName
  ? `/group/${encodeURIComponent(item.placeId)}/${encodeURIComponent(item.itemName)}`
  : `/place/${encodeURIComponent(item.placeId)}`);

const PAGE_CSS = `
  :root { color-scheme: dark; --bg:#0b1021; --card:#141a33; --line:#252c4d; --text:#eef0ff; --muted:#9aa3c7; --accent:#f59e0b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:720px; margin:0 auto; padding:16px 16px 48px; }
  a { color:inherit; }
  header.top { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
  .brand { font-weight:800; text-decoration:none; font-size:20px; }
  .cta { background:var(--accent); color:#1a1200; text-decoration:none; padding:7px 13px; border-radius:999px; font-weight:700; font-size:14px; }
  .crumb { color:var(--muted); font-size:13px; margin-bottom:6px; }
  .crumb a { color:var(--muted); text-decoration:none; }
  h1 { font-size:27px; line-height:1.2; margin:0 0 6px; }
  .meta { color:var(--muted); font-size:13px; margin:0 0 14px; }
  .lead, .note { color:var(--muted); }
  .note { font-size:14px; }
  .hero { width:100%; height:220px; object-fit:cover; border-radius:16px; display:block; background:var(--line); }
  .intro { margin:16px 0; }
  .intro b { color:var(--accent); }
  .win { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; margin:18px 0; }
  .win .lab { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); font-weight:800; }
  .win h2 { margin:4px 0 8px; font-size:20px; }
  .win h2 a { text-decoration:none; }
  blockquote { margin:10px 0; padding:8px 12px; border-left:3px solid var(--accent); color:#dfe3ff; font-style:italic; }
  .bar { display:flex; align-items:center; gap:8px; font-size:14px; margin:6px 0; }
  .bl { width:96px; color:var(--muted); flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .track { flex:1; height:8px; background:var(--line); border-radius:9px; position:relative; }
  .fill { display:block; height:100%; background:var(--accent); border-radius:9px; }
  .avg { position:absolute; top:-3px; width:2px; height:14px; background:rgba(255,255,255,.6); }
  ol.rank { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:minmax(0,1fr); gap:9px; }
  ol.rank li { min-width:0; }
  ol.rank li a { display:flex; gap:11px; align-items:center; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:9px; text-decoration:none; min-width:0; }
  .pos { font-weight:800; width:22px; text-align:center; color:var(--muted); flex:none; }
  .ph { width:58px; height:58px; border-radius:10px; object-fit:cover; background:var(--line); flex:none; display:block; }
  .info { flex:1; min-width:0; overflow:hidden; }
  .name { font-weight:700; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sub { color:var(--muted); font-size:14px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .score { font-weight:800; font-size:19px; color:var(--accent); flex:none; }
  h2 { font-size:18px; margin:26px 0 10px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { border:1px solid var(--line); border-radius:999px; padding:6px 12px; font-size:14px; text-decoration:none; }
  .big { display:block; text-align:center; background:var(--accent); color:#1a1200; font-weight:800; border-radius:14px; padding:13px; margin-top:24px; text-decoration:none; }
  footer { margin-top:32px; color:var(--muted); font-size:13px; }
`;

function pageShell({ title, description, path, ld, body }) {
  const url = `${PUBLIC_ORIGIN}${path}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" type="image/svg+xml" href="/default_favicon.svg">
  <meta name="theme-color" content="#0b1021">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Listopic">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${PUBLIC_ORIGIN}/s/og/app">
  ${(Array.isArray(ld) ? ld : [ld]).filter(Boolean).map((data) => `<script type="application/ld+json">${jsonLd(data)}</script>`).join("\n  ")}
  <style>${PAGE_CSS}</style>
</head>
<body>
<main>
  <header class="top"><a class="brand" href="/">Listopic</a><a class="cta" href="/">Abrir la app</a></header>
${body}
  <footer>Notas de 0 a 10 que pone la gente en Listopic; las de prueba (bots) no cuentan. Actualizado el ${escapeHtml(todayEs())}.</footer>
</main>
</body>
</html>`;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const lowerFirst = (text) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

function introParagraph(ranking) {
  const [first, second, third] = ranking.top;
  if (!first) return "";
  const { standout, listRank, listTotal } = ranking.winner || {};
  const parts = [`Hemos ordenado ${plural(ranking.placeCount, "sitio", "sitios")} de ${escapeHtml(ranking.city)} con ${escapeHtml(lowerFirst(ranking.listName))} según las notas de quienes los han probado.`];
  let lead = `Ahora mismo manda <b>${escapeHtml(first.placeName)}</b> con un <b>${fmtScore(first.score)}</b>`;
  if (standout) {
    const diff = standout.value - standout.listAvg;
    lead += `, sobre todo por ${escapeHtml(lowerFirst(standout.label))}: un ${fmtScore(standout.value)}`;
    if (diff >= 0.3) lead += `, ${fmtScore(diff)} ${diff >= 0.95 && diff < 1.05 ? "punto" : "puntos"} por encima de la media de la lista`;
  }
  parts.push(`${lead}.`);
  const behind = [second, third].filter(Boolean).map((item) => `<b>${escapeHtml(item.placeName)}</b> (${fmtScore(item.score)})`);
  if (behind.length) parts.push(`Detrás, ${behind.join(" y ")}.`);
  if (listRank && listTotal > ranking.placeCount) parts.push(`En la lista completa es el <b>${listRank}.º de ${listTotal}</b>.`);
  return parts.join(" ");
}

function winnerCard(ranking) {
  const first = ranking.top[0];
  const winner = ranking.winner || {};
  if (!first) return "";
  const bars = (winner.criteria || []).slice(0, 6).map((criterion) => `<div class="bar"><span class="bl">${escapeHtml(criterion.label)}</span><span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, criterion.value * 10))}%"></span>${typeof criterion.listAvg === "number" ? `<span class="avg" style="left:${Math.max(0, Math.min(100, criterion.listAvg * 10))}%"></span>` : ""}</span><b>${fmtScore(criterion.value)}</b></div>`).join("");
  return `  <section class="win">
    <div class="lab">🏆 El que gana</div>
    <h2><a href="${escapeHtml(itemHref(first))}">${escapeHtml(first.placeName)}</a></h2>
    ${winner.quote ? `<blockquote>«${escapeHtml(winner.quote)}»</blockquote>` : ""}
    ${bars}
    ${bars ? '<div class="note">La rayita blanca es la media de la lista.</div>' : ""}
  </section>`;
}

const chips = (rows, label) => `<div class="chips">${rows.map((r) => `<a class="chip" href="${escapeHtml(r.path)}">${escapeHtml(label(r))}</a>`).join("")}</div>`;

function renderRanking(ranking, all) {
  const { listName, city } = ranking;
  const title = `${listName} en ${city}: ranking de los mejores sitios · Listopic`;
  const description = `Ranking de ${lowerFirst(listName)} en ${city}: ${plural(ranking.placeCount, "sitio", "sitios")} ordenados por ${plural(ranking.reviewCount, "valoración", "valoraciones")} de personas reales. ${ranking.top[0] ? `Ahora mismo gana ${ranking.top[0].placeName} con un ${fmtScore(ranking.top[0].score)}.` : ""}`.trim();
  const hero = ranking.top[0] && ranking.top[0].imageUrl
    ? `  <img class="hero" src="${escapeHtml(ranking.top[0].imageUrl)}" alt="${escapeHtml(`${listName} de ${ranking.top[0].placeName}`)}" onerror="this.remove()">`
    : "";
  const items = ranking.top.map((item, index) => `    <li><a href="${escapeHtml(itemHref(item))}">
      <span class="pos">${index + 1}</span>
      ${item.imageUrl ? `<img class="ph" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.itemName || item.placeName)}" loading="lazy" width="58" height="58" onerror="this.style.visibility='hidden'">` : '<span class="ph"></span>'}
      <span class="info"><span class="name">${escapeHtml(item.placeName)}</span><span class="sub">${plural(item.count, "valoración", "valoraciones")}</span></span>
      <span class="score">${fmtScore(item.score)}</span>
    </a></li>`).join("\n");
  const sameList = all.filter((r) => r.listSlug === ranking.listSlug && r.path !== ranking.path);
  const sameCity = all.filter((r) => r.citySlug === ranking.citySlug && r.path !== ranking.path);
  const labels = ranking.criteriaLabels || [];
  const body = `  <nav class="crumb"><a href="/mejores">Rankings</a> › <a href="/mejores/${escapeHtml(ranking.listSlug)}">${escapeHtml(listName)}</a> › ${escapeHtml(city)}</nav>
  <h1>${escapeHtml(listName)} en ${escapeHtml(city)}: el ranking</h1>
  <p class="meta">Actualizado el ${escapeHtml(todayEs())} · ${plural(ranking.placeCount, "sitio", "sitios")} · notas de gente real</p>
${hero}
  <p class="intro">${introParagraph(ranking)}</p>
${winnerCard(ranking)}
  <h2>El ranking completo</h2>
  <ol class="rank">
${items}
  </ol>
  ${ranking.provisional ? '<p class="note">⚠️ Provisional: la mayoría tiene menos de 3 valoraciones, así que el orden puede cambiar con las próximas.</p>' : ""}
  <h2>¿Cómo puntuamos?</h2>
  <p class="note">Cada persona pone nota de 0 a 10${labels.length ? ` a ${escapeHtml(labels.map(lowerFirst).join(", ").replace(/, ([^,]*)$/, " y $1"))}` : ""}. La nota final sale de esos criterios y, con más valoraciones, el puesto pesa más. Las cuentas de prueba no cuentan.</p>
  ${sameCity.length ? `<h2>Más rankings en ${escapeHtml(city)}</h2>${chips(sameCity, (r) => r.listName)}` : ""}
  ${sameList.length ? `<h2>${escapeHtml(listName)} en otras ciudades</h2>${chips(sameList, (r) => r.city)}` : ""}
  <a class="big" href="/list/${encodeURIComponent(ranking.listId)}">¿Conoces un sitio mejor? Valóralo en Listopic</a>`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${listName} en ${city}`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: ranking.top.length,
    itemListElement: ranking.top.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.itemName ? `${item.itemName} en ${item.placeName}` : item.placeName,
      url: `${PUBLIC_ORIGIN}${itemHref(item)}`,
    })),
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Rankings", item: `${PUBLIC_ORIGIN}/mejores` },
      { "@type": "ListItem", position: 2, name: listName, item: `${PUBLIC_ORIGIN}/mejores/${ranking.listSlug}` },
      { "@type": "ListItem", position: 3, name: city, item: `${PUBLIC_ORIGIN}${ranking.path}` },
    ],
  };
  return pageShell({ title, description, path: ranking.path, ld: [ld, breadcrumbs], body });
}

function renderListLanding(rows) {
  const { listName, listSlug, listId } = rows[0];
  const items = rows.map((r) => `    <li><a href="${escapeHtml(r.path)}">
      ${r.top[0] && r.top[0].imageUrl ? `<img class="ph" src="${escapeHtml(r.top[0].imageUrl)}" alt="" loading="lazy" width="58" height="58" onerror="this.style.visibility='hidden'">` : '<span class="ph"></span>'}
      <span class="info"><span class="name">${escapeHtml(r.city)}</span><span class="sub">${plural(r.placeCount, "sitio", "sitios")}${r.top[0] ? ` · gana ${escapeHtml(r.top[0].placeName)}` : ""}</span></span>
      <span class="score">${r.top[0] ? fmtScore(r.top[0].score) : ""}</span>
    </a></li>`).join("\n");
  const body = `  <nav class="crumb"><a href="/mejores">Rankings</a> › ${escapeHtml(listName)}</nav>
  <h1>${escapeHtml(listName)}: rankings por ciudad</h1>
  <p class="meta">Actualizado el ${escapeHtml(todayEs())}</p>
  <p class="intro">Dónde comer ${escapeHtml(lowerFirst(listName))} en cada ciudad, según las notas de la gente que ya ha ido.</p>
  <ol class="rank">
${items}
  </ol>
  <a class="big" href="/list/${encodeURIComponent(listId)}">Ver la lista completa en Listopic</a>`;
  return pageShell({
    title: `${listName}: rankings por ciudad · Listopic`,
    description: `Rankings de ${lowerFirst(listName)} en ${rows.map((r) => r.city).join(", ")}, con notas reales de la comunidad Listopic.`,
    path: `/mejores/${listSlug}`,
    ld: null,
    body,
  });
}

function renderIndex(all) {
  const byCity = new Map();
  all.forEach((r) => {
    const rows = byCity.get(r.city) || [];
    rows.push(r);
    byCity.set(r.city, rows);
  });
  const sections = [...byCity].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([city, rows]) => `  <h2>${escapeHtml(city)}</h2>
  ${chips(rows, (r) => `${r.listName} · ${r.placeCount}`)}`).join("\n");
  const body = `  <h1>Los rankings de Listopic</h1>
  <p class="lead">Cada plato, ciudad a ciudad, ordenado por las notas de la gente que lo ha probado.</p>
${sections || '  <p class="lead">Todavía no hay rankings con sitios suficientes.</p>'}`;
  return pageShell({
    title: "Rankings de platos por ciudad · Listopic",
    description: "Dónde comer las mejores bravas, tortillas, hamburguesas y más en cada ciudad, según notas reales de la comunidad Listopic.",
    path: "/mejores",
    ld: null,
    body,
  });
}

async function serveRanking(segments, res) {
  const all = await loadRankings();
  let html = null;
  if (segments.length === 1) html = renderIndex(all);
  else if (segments.length === 2) {
    const listSlug = safeDecode(segments[1]).toLowerCase();
    const rows = all.filter((r) => r.listSlug === listSlug);
    if (rows.length) html = renderListLanding(rows);
  } else {
    const path = `/mejores/${segments.slice(1, 3).map(safeDecode).join("/")}`.toLowerCase();
    const ranking = all.find((r) => r.path === path);
    if (ranking) html = renderRanking(ranking, all);
  }
  res.set("Content-Type", "text/html; charset=utf-8");
  if (!html) {
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(404).send(pageShell({
      title: "Ranking no encontrado · Listopic",
      description: "Este ranking todavía no tiene sitios suficientes.",
      path: "/mejores",
      ld: null,
      body: '  <h1>Este ranking aún no existe</h1>\n  <p class="lead">Todavía no hay sitios suficientes valorados. <a href="/mejores">Ver todos los rankings</a>.</p>',
    }).replace("<head>", '<head>\n  <meta name="robots" content="noindex">'));
    return;
  }
  res.set("Cache-Control", "public, max-age=600, s-maxage=3600");
  res.status(200).send(html);
}

const seoPage = onRequest({ invoker: "public", memory: "256MiB", timeoutSeconds: 30 }, async (req, res) => {
  const segments = req.path.split("/").filter(Boolean);
  if (segments[0] === "mejores") {
    try {
      await serveRanking(segments, res);
    } catch (error) {
      logger.error("seoPage: fallo en ranking", { path: req.path, error: error.message });
      res.set("Cache-Control", "no-cache");
      res.status(500).send("");
    }
    return;
  }
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
