// functions/modules/share-image.js
//
// Dibuja la imagen 1200×630 de la vista previa de enlaces (WhatsApp, Telegram,
// X…) para sitios, valoraciones, listas y perfiles, con el estilo «B · Noche»
// de la app: foto, nota con su color, nombre y marca. La sirve ssrMeta en
// /s/og/... como JPEG; Hosting la guarda en caché.

const path = require("path");
const fetch = require("node-fetch");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const W = 1200;
const H = 630;
const FONT = "Manrope";
const ASSETS = path.join(__dirname, "..", "assets", "share");

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  for (const weight of [500, 700, 800]) {
    GlobalFonts.registerFromPath(path.join(ASSETS, `Manrope-${weight}.ttf`), FONT);
  }
  fontsReady = true;
}

// Mismos tramos y colores que frontend/src/lib/scoreScale.ts (SCORE_BADGE).
const SCORE_BADGE = {
  top: { bg: "#047857", fg: "#ffffff" },
  good: { bg: "#34d399", fg: "#022c22" },
  ok: { bg: "#fbbf24", fg: "#451a03" },
  low: { bg: "#fb923c", fg: "#431407" },
  bad: { bg: "#dc2626", fg: "#ffffff" },
};
const scoreBadge = (score) => {
  if (score >= 9) return SCORE_BADGE.top;
  if (score >= 7) return SCORE_BADGE.good;
  if (score >= 5) return SCORE_BADGE.ok;
  if (score >= 3) return SCORE_BADGE.low;
  return SCORE_BADGE.bad;
};
const isScore = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

// Solo hosts de fotos gratuitos y nuestros: nada de la API de Places (se cobra
// por foto) ni direcciones arbitrarias.
const IMAGE_HOSTS = [
  /^firebasestorage\.googleapis\.com$/,
  /^storage\.googleapis\.com$/,
  /(^|\.)googleusercontent\.com$/,
  /(^|\.)ggpht\.com$/,
  /(^|\.)listopic\.es$/,
  /(^|\.)web\.app$/,
  /(^|\.)firebaseapp\.com$/,
];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function isAllowedImageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && IMAGE_HOSTS.some((re) => re.test(parsed.hostname));
  } catch (_) {
    return false;
  }
}

async function fetchImage(url) {
  if (!url || !isAllowedImageUrl(url)) return null;
  try {
    const response = await fetch(url, { timeout: 4000, size: MAX_IMAGE_BYTES });
    if (!response.ok) return null;
    return await loadImage(await response.buffer());
  } catch (_) {
    return null;
  }
}

let iconPromise = null;
const loadIcon = () => {
  if (!iconPromise) iconPromise = loadImage(path.join(ASSETS, "listopic-icon.png")).catch(() => null);
  return iconPromise;
};

// --- primitivas -------------------------------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCover(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function fit(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped.trimEnd()}…`;
}

// Parte el texto en como mucho `maxLines` líneas; reduce el tamaño si no cabe.
function layoutTitle(ctx, text, maxWidth, sizes, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  for (const size of sizes) {
    setFont(ctx, 800, size);
    const lines = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
      return { size, lines };
    }
  }
  const size = sizes[sizes.length - 1];
  setFont(ctx, 800, size);
  const lines = [];
  let rest = words.join(" ");
  for (let i = 0; i < maxLines && rest; i += 1) {
    if (i === maxLines - 1) {
      lines.push(fit(ctx, rest, maxWidth));
      break;
    }
    const parts = rest.split(" ");
    let line = parts.shift();
    while (parts.length && ctx.measureText(`${line} ${parts[0]}`).width <= maxWidth) line += ` ${parts.shift()}`;
    lines.push(line);
    rest = parts.join(" ");
  }
  return { size, lines };
}

function drawTitle(ctx, text, x, y, maxWidth, sizes, maxLines = 2) {
  const { size, lines } = layoutTitle(ctx, text, maxWidth, sizes, maxLines);
  setFont(ctx, 800, size);
  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "alphabetic";
  const lineHeight = Math.round(size * 1.04);
  lines.forEach((line, index) => ctx.fillText(line, x, y + size + index * lineHeight));
  return y + size + (lines.length - 1) * lineHeight;
}

function drawBackground(ctx) {
  ctx.fillStyle = "#0b1021";
  ctx.fillRect(0, 0, W, H);
}

function drawGlow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(11,16,33,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Foto a la derecha que se funde con el fondo hacia la izquierda.
function drawSidePhoto(ctx, image, widthRatio = 0.6) {
  const pw = Math.round(W * widthRatio);
  if (image) drawCover(ctx, image, W - pw, 0, pw, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "rgba(11,16,33,1)");
  g.addColorStop(0.42, "rgba(11,16,33,0.92)");
  g.addColorStop(0.7, "rgba(11,16,33,0.25)");
  g.addColorStop(1, "rgba(11,16,33,0.05)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

async function drawBrand(ctx, x = 60, y = 50) {
  const icon = await loadIcon();
  if (icon) {
    ctx.save();
    roundRect(ctx, x, y, 52, 52, 14);
    ctx.clip();
    ctx.drawImage(icon, x, y, 52, 52);
    ctx.restore();
  }
  setFont(ctx, 800, 30);
  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "middle";
  ctx.fillText("Listopic", x + (icon ? 66 : 0), y + 27);
}

function drawBottomBar(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#22d3ee");
  g.addColorStop(0.5, "#6366f1");
  g.addColorStop(1, "#a855f7");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 10, W, 10);
}

function drawChip(ctx, text, x, y) {
  setFont(ctx, 800, 24);
  const w = ctx.measureText(text).width + 40;
  roundRect(ctx, x, y, w, 44, 22);
  ctx.fillStyle = "rgba(99,102,241,0.22)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(129,140,248,0.6)";
  ctx.stroke();
  ctx.fillStyle = "#c7d2fe";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 20, y + 23);
  return w;
}

// Chapa con la nota: «9.2 /10». Devuelve el ancho dibujado.
function drawScore(ctx, score, x, y, size = 84) {
  const { bg, fg } = scoreBadge(score);
  const value = score.toFixed(1);
  setFont(ctx, 800, size);
  const vw = ctx.measureText(value).width;
  setFont(ctx, 700, Math.round(size * 0.36));
  const sw = ctx.measureText("/10").width;
  const padX = Math.round(size * 0.3);
  const h = Math.round(size * 1.3);
  const w = padX * 2 + vw + 8 + sw;
  roundRect(ctx, x, y, w, h, Math.round(size * 0.31));
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "alphabetic";
  const base = y + h / 2 + size * 0.36;
  setFont(ctx, 800, size);
  ctx.fillText(value, x + padX, base);
  setFont(ctx, 700, Math.round(size * 0.36));
  ctx.globalAlpha = 0.85;
  ctx.fillText("/10", x + padX + vw + 8, base);
  ctx.globalAlpha = 1;
  return w;
}

function drawAvatar(ctx, image, cx, cy, r, fallback) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (image) drawCover(ctx, image, cx - r, cy - r, r * 2, r * 2);
  else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "#6366f1");
    g.addColorStop(1, "#a855f7");
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    setFont(ctx, 800, Math.round(r));
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(fallback || "L").slice(0, 1).toUpperCase(), cx, cy + r * 0.05);
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(3, r * 0.06);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.stroke();
}

// Chincheta de mapa dibujada (los emojis no tienen fuente en el servidor).
function drawPin(ctx, x, y, size, color) {
  const r = size * 0.36;
  const cx = x + size / 2;
  const cy = y + r + size * 0.04;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(cx, y + size);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = "#0b1021";
  ctx.fill();
}

// --- plantillas ---------------------------------------------------------------

async function renderPlace(ctx, data) {
  const photo = await fetchImage(data.imageUrl);
  drawSidePhoto(ctx, photo);
  await drawBrand(ctx);
  const x = 60;
  const maxW = 640;
  drawChip(ctx, data.chip || "Sitio", x, 150);
  const bottom = drawTitle(ctx, data.title, x, 214, maxW, [76, 68, 60, 52]);
  if (data.city) {
    drawPin(ctx, x, bottom + 20, 30, "#22d3ee");
    setFont(ctx, 700, 32);
    ctx.fillStyle = "#cbd5e1";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, data.city, maxW - 44), x + 42, bottom + 37);
  }
  const rowY = Math.max(bottom + 82, 420);
  if (isScore(data.score)) {
    const w = drawScore(ctx, data.score, x, rowY);
    if (data.reviewCount) {
      setFont(ctx, 700, 30);
      ctx.fillStyle = "#e2e8f0";
      ctx.textBaseline = "middle";
      ctx.fillText(`${data.reviewCount} ${data.reviewCount === 1 ? "valoración" : "valoraciones"}`, x + w + 24, rowY + 55);
    }
  } else {
    setFont(ctx, 700, 30);
    ctx.fillStyle = "#94a3b8";
    ctx.textBaseline = "middle";
    ctx.fillText("Opiniones reales con nota", x, rowY + 40);
  }
  drawBottomBar(ctx);
}

async function renderReview(ctx, data) {
  const [photo, avatar] = await Promise.all([fetchImage(data.imageUrl), fetchImage(data.authorPhoto)]);
  drawSidePhoto(ctx, photo, 0.56);
  await drawBrand(ctx);
  const x = 60;
  const maxW = 660;

  // Autor: lo primero que se ve.
  drawAvatar(ctx, avatar, x + 50, 178, 50, data.authorName);
  setFont(ctx, 800, 48);
  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "alphabetic";
  const name = fit(ctx, data.authorName || "Alguien", maxW - 124);
  ctx.fillText(name, x + 122, 176);
  setFont(ctx, 700, 26);
  ctx.fillStyle = "#a5b4fc";
  ctx.fillText("ha valorado", x + 122, 212);

  const bottom = drawTitle(ctx, data.title, x, 248, maxW, [54, 48, 44, 40]);

  // Sitio y ciudad, bien visibles.
  const placeY = bottom + 22;
  drawPin(ctx, x, placeY + 2, 38, "#22d3ee");
  setFont(ctx, 800, 40);
  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "alphabetic";
  const placeName = fit(ctx, data.placeName || "", maxW - 52);
  ctx.fillText(placeName, x + 52, placeY + 36);
  if (data.city) {
    const pw = ctx.measureText(placeName).width;
    setFont(ctx, 800, 38);
    ctx.fillStyle = "#67e8f9";
    const room = maxW - 52 - pw - 30;
    if (room > 80) ctx.fillText(fit(ctx, `· ${data.city}`, room), x + 52 + pw + 14, placeY + 36);
    else ctx.fillText(fit(ctx, data.city, maxW - 52), x + 52, placeY + 78);
  }

  const rowY = Math.max(placeY + (data.city ? 104 : 70), 460);
  if (isScore(data.score)) {
    const w = drawScore(ctx, data.score, x, Math.min(rowY, H - 130), 72);
    if (data.comment) {
      setFont(ctx, 500, 26);
      ctx.fillStyle = "#e2e8f0";
      ctx.textBaseline = "middle";
      const quoteW = maxW - w - 20;
      if (quoteW > 160) ctx.fillText(fit(ctx, `«${data.comment}»`, quoteW), x + w + 22, Math.min(rowY, H - 130) + 47);
    }
  }
  drawBottomBar(ctx);
}

async function renderList(ctx, data) {
  drawBackground(ctx);
  drawGlow(ctx, 980, 120, 700, "rgba(49,46,129,0.85)");
  await drawBrand(ctx);
  const x = 60;
  const maxW = 560;
  const chip = data.count ? `Lista · ${data.count} ${data.count === 1 ? "valoración" : "valoraciones"}` : "Lista";
  drawChip(ctx, chip, x, 150);
  const bottom = drawTitle(ctx, data.title, x, 214, maxW, [68, 60, 52, 46], 3);
  const meta = [data.authorName ? `por ${data.authorName}` : null, isScore(data.average) ? `media ${data.average.toFixed(1)}` : null]
    .filter(Boolean).join(" · ");
  if (meta) {
    setFont(ctx, 700, 30);
    ctx.fillStyle = "#cbd5e1";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(fit(ctx, meta, maxW), x, bottom + 56);
  }

  // Mosaico 2×2 con el top 3 y lo que queda.
  const tiles = (data.top || []).slice(0, 3);
  const images = await Promise.all(tiles.map((tile) => fetchImage(tile.imageUrl)));
  if (!tiles.length) {
    const cover = await fetchImage(data.imageUrl);
    if (cover) {
      ctx.save();
      roundRect(ctx, 670, 60, 480, 510, 30);
      ctx.clip();
      drawCover(ctx, cover, 670, 60, 480, 510);
      ctx.restore();
    }
  }
  const size = 240;
  const gap = 18;
  const ox = W - 50 - size * 2 - gap;
  const oy = 60;
  const cells = tiles.length ? 4 : 0;
  for (let i = 0; i < cells; i += 1) {
    const cx = ox + (i % 2) * (size + gap);
    const cy = oy + Math.floor(i / 2) * (size + gap);
    ctx.save();
    roundRect(ctx, cx, cy, size, size, 26);
    ctx.clip();
    if (i < tiles.length && images[i]) drawCover(ctx, images[i], cx, cy, size, size);
    else {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(cx, cy, size, size);
    }
    ctx.restore();
    if (i < tiles.length) {
      const tile = tiles[i];
      if (!images[i]) {
        setFont(ctx, 800, 30);
        ctx.fillStyle = "#e2e8f0";
        ctx.textBaseline = "middle";
        ctx.fillText(fit(ctx, tile.name || "", size - 30), cx + 16, cy + size / 2 - 20);
      }
      if (isScore(tile.score)) drawScore(ctx, tile.score, cx + 14, cy + size - 70, 40);
    } else {
      const rest = Number(data.more) || 0;
      setFont(ctx, 800, rest > 0 ? 52 : 34);
      ctx.fillStyle = "#a5b4fc";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(rest > 0 ? `+${rest}` : "Ver lista", cx + size / 2, cy + size / 2);
      ctx.textAlign = "left";
    }
  }
  drawBottomBar(ctx);
}

async function renderProfile(ctx, data) {
  drawBackground(ctx);
  drawGlow(ctx, 900, 200, 650, "rgba(49,46,129,0.9)");
  await drawBrand(ctx);
  const avatar = await fetchImage(data.photoUrl);
  drawAvatar(ctx, avatar, 900, 290, 175, data.title);
  const x = 60;
  const maxW = 600;
  drawChip(ctx, "Perfil", x, 150);
  const bottom = drawTitle(ctx, data.title, x, 214, maxW, [76, 66, 56, 48]);
  if (data.subtitle) {
    setFont(ctx, 700, 30);
    ctx.fillStyle = "#cbd5e1";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(fit(ctx, data.subtitle, maxW), x, bottom + 50);
  }
  const stats = (data.stats || []).filter((stat) => stat.value !== undefined && stat.value !== null).slice(0, 3);
  let sx = x;
  const sy = Math.max(bottom + 140, 470);
  stats.forEach((stat) => {
    setFont(ctx, 800, 60);
    ctx.fillStyle = "#f8fafc";
    ctx.textBaseline = "alphabetic";
    const value = String(stat.value);
    const vw = ctx.measureText(value).width;
    ctx.fillText(value, sx, sy);
    setFont(ctx, 700, 24);
    ctx.fillStyle = "#94a3b8";
    const lw = ctx.measureText(stat.label).width;
    ctx.fillText(stat.label, sx, sy + 34);
    sx += Math.max(vw, lw) + 48;
  });
  drawBottomBar(ctx);
}

async function renderDefault(ctx) {
  drawBackground(ctx);
  drawGlow(ctx, 900, 200, 700, "rgba(49,46,129,0.9)");
  await drawBrand(ctx);
  drawTitle(ctx, "Recomendaciones reales con nota", 60, 200, 760, [72, 64], 2);
  setFont(ctx, 700, 32);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Listas, sitios y platos de la comunidad", 60, 430);
  drawBottomBar(ctx);
}

const RENDERERS = {
  place: renderPlace,
  group: renderPlace,
  review: renderReview,
  list: renderList,
  profile: renderProfile,
};

/** Devuelve un Buffer JPEG 1200×630. */
async function renderShareImage(kind, data = {}) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);
  const render = RENDERERS[kind] || renderDefault;
  await render(ctx, data);
  return canvas.encode("jpeg", 86);
}

module.exports = { renderShareImage, isAllowedImageUrl, SHARE_IMAGE_WIDTH: W, SHARE_IMAGE_HEIGHT: H };
