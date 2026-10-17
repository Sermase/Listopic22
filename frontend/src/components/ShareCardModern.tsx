import React, { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Check, Download, Share2, X } from 'lucide-react';
import { getShareEntityLabel, type ShareCriteriaStat, type ShareEntityPayload, type ShareProfileStat, type ShareRankItem } from '../types/share';
import { buildShareText } from '../utils/shareTexts';
import { buildShareRouteUrl, PUBLIC_ORIGIN } from '../utils/publicUrl';
import { SCORE_BADGE, SCORE_BAND_LABEL, SCORE_TEXT_ON_DARK, scoreBand } from '../lib/scoreScale';

export type ModernCardVariant = 'story' | 'portrait' | 'square' | 'landscape';

interface ShareCardModernProps {
    entity: ShareEntityPayload;
    variant: ModernCardVariant;
    triggerRef: React.MutableRefObject<() => void>;
    onRequestClose?: () => void;
}

const DIMENSIONS: Record<ModernCardVariant, { width: number; height: number }> = {
    story: { width: 1080, height: 1920 },
    portrait: { width: 1080, height: 1350 },
    square: { width: 1080, height: 1080 },
    landscape: { width: 1200, height: 630 },
};

const FONT = "'Manrope Variable', 'Manrope', 'Poppins', system-ui, -apple-system, sans-serif";
const BRAND_LOGO_URL = '/images/listopic-app-icon.png';

// Escala única de notas (lib/scoreScale), variante para fondo oscuro.
const scoreColor = (score?: number): string => SCORE_TEXT_ON_DARK[scoreBand(score)];

// Firebase Storage no manda CORS: sin él, el canvas no puede leer la foto. Si la
// descarga directa falla, se pide a nuestro proxy /s/img (ssrMeta), que sí lo manda.
const fetchImageBlob = async (url: string): Promise<Blob | null> => {
    const attempts = url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')
        ? [url]
        : [url, `${PUBLIC_ORIGIN}/s/img?u=${encodeURIComponent(url)}`];
    for (const attempt of attempts) {
        try {
            const response = await fetch(attempt);
            const type = response.headers.get('content-type') || '';
            if (response.ok && (type.startsWith('image/') || !type)) return await response.blob();
        } catch {
            // Siguiente intento.
        }
    }
    return null;
};

const loadImage = async (url?: string): Promise<HTMLImageElement | null> => {
    if (!url) return null;
    try {
        const blob = await fetchImageBlob(url);
        if (!blob) return null;
        const objectUrl = URL.createObjectURL(blob);
        return await new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
            };
            image.src = objectUrl;
        });
    } catch {
        return null;
    }
};

/** La primera foto que cargue: si la elegida falla, mejor otra que ninguna. */
const loadFirstImage = async (urls: (string | undefined)[]): Promise<HTMLImageElement | null> => {
    const unique = Array.from(new Set(urls.filter((url): url is string => Boolean(url)))).slice(0, 4);
    for (const url of unique) {
        const image = await loadImage(url);
        if (image) return image;
    }
    return null;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
};

const drawCover = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const scale = Math.max(w / image.width, h / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
};

const drawContain = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const scale = Math.min(w / image.width, h / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
};

const drawCircularImage = (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    centerX: number,
    centerY: number,
    radius: number,
    fallbackText: string,
) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    if (image) {
        drawCover(ctx, image, centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else {
        const gradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(1, '#a855f7');
        ctx.fillStyle = gradient;
        ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.round(radius * 0.9)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((fallbackText || 'L').slice(0, 1).toUpperCase(), centerX, centerY + radius * 0.04);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.76)';
    ctx.lineWidth = Math.max(3, radius * 0.035);
    ctx.stroke();
};

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let clipped = text;
    while (clipped.length > 2 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
    return `${clipped}…`;
};

const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number,
): string[] => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
            continue;
        }
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (words.length && lines.length === maxLines) {
        lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1], maxWidth);
    }
    return lines;
};

const layoutTitle = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    startSize: number,
    minSize: number,
    maxLines: number,
): { lines: string[]; fontSize: number } => {
    for (let size = startSize; size >= minSize; size -= 5) {
        ctx.font = `800 ${size}px ${FONT}`;
        const lines = wrapText(ctx, text, maxWidth, maxLines);
        if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
            return { lines, fontSize: size };
        }
    }
    ctx.font = `800 ${minSize}px ${FONT}`;
    return { lines: wrapText(ctx, text, maxWidth, maxLines), fontSize: minSize };
};

// --- Estilo «B · Noche»: fondo marino, foto que se funde, chapas de nota con
// el color de lib/scoreScale y barra de degradado de la marca abajo. ---------

const BG = '#0b1021';
const TEXT = '#f8fafc';
const MUTED = '#94a3b8';
const SOFT = '#cbd5e1';
const CYAN = '#67e8f9';
const INDIGO_SOFT = '#a5b4fc';

const setFont = (ctx: CanvasRenderingContext2D, weight: number, size: number, italic = false) => {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
};

const drawGlassPanel = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 28) => {
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = 'rgba(21,27,46,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
};

const drawGlow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, w: number, h: number) => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(11,16,33,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
};

const drawBrand = (ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, size: number) => {
    if (logo) {
        ctx.save();
        roundRect(ctx, x, y, size, size, size * 0.26);
        ctx.clip();
        drawContain(ctx, logo, x, y, size, size);
        ctx.restore();
    }
    setFont(ctx, 800, Math.round(size * 0.56));
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Listopic', x + (logo ? size * 1.26 : 0), y + size / 2 + 1);
};

const drawBottomBar = (ctx: CanvasRenderingContext2D, w: number, h: number, thickness = 12) => {
    const bar = ctx.createLinearGradient(0, 0, w, 0);
    bar.addColorStop(0, '#22d3ee');
    bar.addColorStop(0.5, '#6366f1');
    bar.addColorStop(1, '#a855f7');
    ctx.fillStyle = bar;
    ctx.fillRect(0, h - thickness, w, thickness);
};

/** Chip índigo («Sitio», «Lista · 24 sitios»…). Devuelve su ancho. */
const drawChip = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSize: number) => {
    setFont(ctx, 800, fontSize);
    const height = Math.round(fontSize * 1.85);
    const width = ctx.measureText(text).width + fontSize * 1.7;
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = 'rgba(99,102,241,0.24)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(129,140,248,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#c7d2fe';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + fontSize * 0.85, y + height / 2 + 1);
    return width;
};

/** Chapa «8.4 /10» con el color de su tramo. Devuelve el ancho. */
const drawScorePill = (ctx: CanvasRenderingContext2D, score: number, x: number, y: number, size: number, withScale = true) => {
    const { bg, fg } = SCORE_BADGE[scoreBand(score)];
    const value = score.toFixed(1);
    setFont(ctx, 800, size);
    const valueWidth = ctx.measureText(value).width;
    setFont(ctx, 700, Math.round(size * 0.36));
    const scaleWidth = withScale ? ctx.measureText('/10').width + 8 : 0;
    const padX = Math.round(size * 0.3);
    const height = Math.round(size * 1.3);
    const width = padX * 2 + valueWidth + scaleWidth;
    roundRect(ctx, x, y, width, height, Math.round(size * 0.31));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const baseline = y + height / 2 + size * 0.36;
    setFont(ctx, 800, size);
    ctx.fillText(value, x + padX, baseline);
    if (withScale) {
        setFont(ctx, 700, Math.round(size * 0.36));
        ctx.globalAlpha = 0.85;
        ctx.fillText('/10', x + padX + valueWidth + 8, baseline);
        ctx.globalAlpha = 1;
    }
    return width;
};

/** Chincheta de mapa. */
const drawPin = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
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
    ctx.fillStyle = BG;
    ctx.fill();
};

/** «📍 Sitio · Ciudad» con el sitio en blanco y la ciudad en cian. */
const drawPlaceLine = (
    ctx: CanvasRenderingContext2D,
    place: string | undefined,
    city: string | undefined,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
) => {
    if (!place && !city) return 0;
    const pin = Math.round(size * 0.95);
    drawPin(ctx, x, y + (size - pin) / 2 + 2, pin, '#22d3ee');
    const textX = x + pin + size * 0.35;
    const room = maxWidth - (textX - x);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const middle = y + size / 2 + 2;
    if (place) {
        setFont(ctx, 800, size);
        ctx.fillStyle = TEXT;
        const placeText = fitText(ctx, place, city ? room * 0.66 : room);
        ctx.fillText(placeText, textX, middle);
        if (city) {
            const placeWidth = ctx.measureText(placeText).width;
            setFont(ctx, 800, Math.round(size * 0.92));
            ctx.fillStyle = CYAN;
            ctx.fillText(fitText(ctx, `· ${city}`, room - placeWidth - size * 0.35), textX + placeWidth + size * 0.35, middle);
        }
    } else if (city) {
        setFont(ctx, 800, size);
        ctx.fillStyle = CYAN;
        ctx.fillText(fitText(ctx, city, room), textX, middle);
    }
    return size + 4;
};

const drawTitleBlock = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    top: number,
    maxWidth: number,
    startSize: number,
    minSize: number,
    maxLines: number,
) => {
    const { lines, fontSize } = layoutTitle(ctx, text || 'Listopic', maxWidth, startSize, minSize, maxLines);
    setFont(ctx, 800, fontSize);
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lineHeight = fontSize * 1.04;
    lines.forEach((line, index) => ctx.fillText(line, x, top + index * lineHeight));
    return lines.length * lineHeight;
};

const titleHeightFor = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, minSize: number, maxLines: number) => {
    const { lines, fontSize } = layoutTitle(ctx, text || 'Listopic', maxWidth, startSize, minSize, maxLines);
    return lines.length * fontSize * 1.04;
};

const drawAuthorRow = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    avatar: HTMLImageElement | null,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
) => {
    const radius = Math.round(size * 0.9);
    drawCircularImage(ctx, avatar, x + radius, y + radius, radius, entity.authorName || 'L');
    const textX = x + radius * 2 + size * 0.45;
    setFont(ctx, 800, size);
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitText(ctx, entity.authorName || 'Alguien', maxWidth - (textX - x)), textX, y + radius + size * 0.1);
    setFont(ctx, 700, Math.round(size * 0.55));
    ctx.fillStyle = INDIGO_SOFT;
    ctx.fillText('ha valorado', textX, y + radius + size * 0.8);
    return radius * 2;
};

const drawCriteriaBars = (
    ctx: CanvasRenderingContext2D,
    criteria: ShareCriteriaStat[],
    x: number,
    y: number,
    width: number,
    rowHeight: number,
) => {
    const fontSize = Math.round(rowHeight * 0.46);
    criteria.forEach((stat, index) => {
        const rowY = y + index * rowHeight + rowHeight / 2;
        setFont(ctx, 700, fontSize);
        ctx.fillStyle = SOFT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fitText(ctx, stat.label || stat.key, width * 0.3), x, rowY);
        const barX = x + width * 0.33;
        const barW = width * 0.55;
        const barH = Math.max(12, Math.round(rowHeight * 0.26));
        roundRect(ctx, barX, rowY - barH / 2, barW, barH, barH / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fill();
        const ratio = Math.max(0.03, Math.min(1, stat.score / 10));
        const fill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        fill.addColorStop(0, '#6366f1');
        fill.addColorStop(1, '#a855f7');
        roundRect(ctx, barX, rowY - barH / 2, barW * ratio, barH, barH / 2);
        ctx.fillStyle = fill;
        ctx.fill();
        setFont(ctx, 800, fontSize);
        ctx.fillStyle = scoreColor(stat.score);
        ctx.textAlign = 'right';
        ctx.fillText(stat.score.toFixed(1), x + width, rowY);
    });
    return criteria.length * rowHeight;
};

const drawNonPonderable = (
    ctx: CanvasRenderingContext2D,
    criteria: ShareCriteriaStat[],
    x: number,
    y: number,
    width: number,
    height: number,
) => {
    drawGlassPanel(ctx, x, y, width, height, 25);
    const cellWidth = width / criteria.length;
    const radius = Math.min(43, height * 0.28, cellWidth * 0.24);
    criteria.forEach((stat, index) => {
        const centerX = x + cellWidth * index + cellWidth / 2;
        const centerY = y + radius + 20;
        const color = scoreColor(stat.score);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, stat.score / 10)));
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
        setFont(ctx, 800, Math.round(radius * 0.72));
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stat.score.toFixed(stat.score % 1 === 0 ? 0 : 1), centerX, centerY + 1);
        setFont(ctx, 700, Math.min(21, Math.max(16, cellWidth * 0.08)));
        ctx.fillStyle = SOFT;
        ctx.textBaseline = 'top';
        ctx.fillText(fitText(ctx, stat.label || stat.key, Math.max(70, cellWidth - 18)), centerX, centerY + radius + 13);
    });
};

const formatMetricValue = (value: string | number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
    return new Intl.NumberFormat('es', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
};

const drawProfileStats = (
    ctx: CanvasRenderingContext2D,
    stats: ShareProfileStat[],
    x: number,
    y: number,
    width: number,
    cellHeight: number,
    columns = 3,
) => {
    const rows = Math.ceil(stats.length / columns);
    const gap = 14;
    const cellWidth = (width - gap * (columns - 1)) / columns;
    stats.forEach((stat, index) => {
        const cellX = x + (index % columns) * (cellWidth + gap);
        const cellY = y + Math.floor(index / columns) * (cellHeight + gap);
        const isLevel = stat.key === 'level';
        roundRect(ctx, cellX, cellY, cellWidth, cellHeight, 24);
        ctx.fillStyle = isLevel ? 'rgba(99,102,241,0.24)' : 'rgba(21,27,46,0.82)';
        ctx.fill();
        ctx.strokeStyle = isLevel ? 'rgba(129,140,248,0.6)' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        setFont(ctx, 800, Math.round(cellHeight * 0.38));
        ctx.fillStyle = isLevel ? '#c7d2fe' : TEXT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatMetricValue(stat.value), cellX + cellWidth / 2, cellY + cellHeight * 0.4);
        setFont(ctx, 700, Math.round(cellHeight * 0.16));
        ctx.fillStyle = MUTED;
        ctx.fillText(fitText(ctx, stat.label, cellWidth - 18), cellX + cellWidth / 2, cellY + cellHeight * 0.76);
    });
    return rows * cellHeight + Math.max(0, rows - 1) * gap;
};

/** Pie con la dirección y una flecha: invita a abrir el enlace. */
const drawFooter = (ctx: CanvasRenderingContext2D, entity: ShareEntityPayload, x: number, bottom: number, width: number, compact: boolean) => {
    const height = compact ? 92 : 124;
    const y = bottom - height;
    drawGlassPanel(ctx, x, y, width, height, compact ? 24 : 30);
    const lead = entity.type === 'list' || entity.type === 'sublist' ? 'Ver la lista entera' : 'listopic.es';
    const sub = entity.type === 'list' || entity.type === 'sublist' ? 'listopic.es' : 'Opiniones reales con nota';
    setFont(ctx, 800, compact ? 28 : 34);
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(lead, x + 34, y + height / 2 - 2);
    setFont(ctx, 700, compact ? 22 : 26);
    ctx.fillStyle = MUTED;
    ctx.fillText(sub, x + 34, y + height / 2 + (compact ? 28 : 34));
    // Flecha ↗
    const ax = x + width - (compact ? 62 : 74);
    const ay = y + height / 2;
    const s = compact ? 16 : 20;
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = compact ? 5 : 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax - s, ay + s);
    ctx.lineTo(ax + s, ay - s);
    ctx.moveTo(ax - s * 0.4, ay - s);
    ctx.lineTo(ax + s, ay - s);
    ctx.lineTo(ax + s, ay + s * 0.4);
    ctx.stroke();
    ctx.lineCap = 'butt';
    return height;
};

const isList = (entity: ShareEntityPayload) => entity.type === 'list' || entity.type === 'sublist';
const hasScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

const elementCountLabel = (entity: ShareEntityPayload) => {
    const count = entity.elementCount || 0;
    return count > 0 ? `${count} ${count === 1 ? 'elemento' : 'elementos'}` : '';
};

const typeChipLabel = (entity: ShareEntityPayload) => {
    if (isList(entity)) {
        const base = entity.type === 'sublist' ? 'Minilista' : 'Lista';
        const count = elementCountLabel(entity);
        return count ? `${base} · ${count}` : base;
    }
    return getShareEntityLabel(entity.type);
};

const paintBackground = (
    ctx: CanvasRenderingContext2D,
    hero: HTMLImageElement | null,
    entity: ShareEntityPayload,
    width: number,
    height: number,
    photoRatio: number,
) => {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);
    const usePhoto = hero && entity.type !== 'profile' && !(isList(entity) && entity.rankItems?.length);
    if (!usePhoto) {
        drawGlow(ctx, width * 0.85, height * 0.12, Math.max(width, height) * 0.7, 'rgba(49,46,129,0.95)', width, height);
        drawGlow(ctx, width * 0.05, height * 0.9, Math.max(width, height) * 0.45, 'rgba(14,116,144,0.28)', width, height);
        return;
    }
    const photoHeight = Math.round(height * photoRatio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, photoHeight);
    ctx.clip();
    drawCover(ctx, hero, 0, 0, width, photoHeight);
    ctx.restore();
    const top = ctx.createLinearGradient(0, 0, 0, height * 0.22);
    top.addColorStop(0, 'rgba(11,16,33,0.6)');
    top.addColorStop(1, 'rgba(11,16,33,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, height * 0.22);
    const fade = ctx.createLinearGradient(0, photoHeight * 0.45, 0, photoHeight);
    fade.addColorStop(0, 'rgba(11,16,33,0)');
    fade.addColorStop(0.6, 'rgba(11,16,33,0.7)');
    fade.addColorStop(1, BG);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, photoHeight + 1);
};

const drawRankRows = (
    ctx: CanvasRenderingContext2D,
    items: ShareRankItem[],
    images: (HTMLImageElement | null)[],
    x: number,
    y: number,
    width: number,
    rowHeight: number,
    gap: number,
) => {
    items.forEach((item, index) => {
        const rowY = y + index * (rowHeight + gap);
        drawGlassPanel(ctx, x, rowY, width, rowHeight, rowHeight * 0.2);
        const pad = Math.round(rowHeight * 0.13);
        setFont(ctx, 800, Math.round(Math.min(rowHeight * 0.36, 64)));
        ctx.fillStyle = INDIGO_SOFT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), x + pad + rowHeight * 0.2, rowY + rowHeight / 2);
        const photoX = x + pad + rowHeight * 0.45;
        const photoSize = rowHeight - pad * 2;
        ctx.save();
        roundRect(ctx, photoX, rowY + pad, photoSize, photoSize, photoSize * 0.18);
        ctx.clip();
        if (images[index]) drawCover(ctx, images[index] as HTMLImageElement, photoX, rowY + pad, photoSize, photoSize);
        else {
            ctx.fillStyle = 'rgba(99,102,241,0.3)';
            ctx.fillRect(photoX, rowY + pad, photoSize, photoSize);
        }
        ctx.restore();
        let right = x + width - pad;
        if (hasScore(item.score)) {
            const size = Math.round(Math.min(rowHeight * 0.3, 54));
            setFont(ctx, 800, size);
            const pillWidth = ctx.measureText(item.score.toFixed(1)).width + Math.round(size * 0.6);
            drawScorePill(ctx, item.score, right - pillWidth, rowY + rowHeight / 2 - size * 0.65, size, false);
            right -= pillWidth + pad;
        }
        const textX = photoX + photoSize + pad;
        const textWidth = right - textX;
        setFont(ctx, 800, Math.round(Math.min(rowHeight * 0.24, 44)));
        ctx.fillStyle = TEXT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(fitText(ctx, item.title, textWidth), textX, rowY + rowHeight / 2 - (item.subtitle ? 2 : -rowHeight * 0.08));
        if (item.subtitle) {
            setFont(ctx, 700, Math.round(Math.min(rowHeight * 0.17, 30)));
            ctx.fillStyle = MUTED;
            ctx.fillText(fitText(ctx, item.subtitle, textWidth), textX, rowY + rowHeight / 2 + rowHeight * 0.22);
        }
    });
    return items.length * rowHeight + Math.max(0, items.length - 1) * gap;
};

const drawVerticalProfile = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    portrait: HTMLImageElement | null,
    variant: Exclude<ModernCardVariant, 'landscape'>,
    width: number,
) => {
    const margin = 64;
    const isStory = variant === 'story';
    const radius = isStory ? 240 : variant === 'portrait' ? 158 : 132;
    const centerY = isStory ? 600 : variant === 'portrait' ? 330 : 285;
    ctx.beginPath();
    ctx.arc(width / 2, centerY, radius + 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(129,140,248,0.16)';
    ctx.fill();
    drawCircularImage(ctx, portrait, width / 2, centerY, radius, entity.title);

    const titleTop = centerY + radius + (isStory ? 58 : 38);
    const { lines, fontSize } = layoutTitle(ctx, entity.title, width - margin * 2, isStory ? 88 : 70, 48, 2);
    setFont(ctx, 800, fontSize);
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => ctx.fillText(line, width / 2, titleTop + index * fontSize * 1.08));
    let cursorY = titleTop + lines.length * fontSize * 1.08 + 16;
    if (entity.subtitle) {
        setFont(ctx, 700, isStory ? 36 : 29);
        ctx.fillStyle = SOFT;
        ctx.fillText(fitText(ctx, entity.subtitle, width - margin * 2), width / 2, cursorY);
        cursorY += isStory ? 78 : 58;
    } else {
        cursorY += isStory ? 38 : 24;
    }
    const stats = (entity.profileStats || []).slice(0, variant === 'square' ? 3 : 6);
    if (stats.length) drawProfileStats(ctx, stats, margin, cursorY, width - margin * 2, isStory ? 150 : 104);
};

/** Lista con top 3: de arriba abajo, título y filas del ranking. */
const drawVerticalList = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    images: (HTMLImageElement | null)[],
    variant: Exclude<ModernCardVariant, 'landscape'>,
    width: number,
    bottomLimit: number,
) => {
    const margin = 64;
    const isStory = variant === 'story';
    const contentWidth = width - margin * 2;
    let y = isStory ? 230 : 170;
    const chip = entity.authorName && !isStory ? typeChipLabel(entity) : (entity.authorName ? `El top de ${entity.authorName}` : typeChipLabel(entity));
    drawChip(ctx, chip, margin, y, isStory ? 32 : 26);
    y += (isStory ? 32 : 26) * 1.85 + (isStory ? 30 : 22);
    y += drawTitleBlock(ctx, entity.title, margin, y, contentWidth, isStory ? 100 : variant === 'portrait' ? 80 : 68, 48, 2);
    const meta = [
        isStory && entity.authorName ? elementCountLabel(entity) : (entity.authorName ? `por ${entity.authorName}` : ''),
        hasScore(entity.score) ? `media ${entity.score.toFixed(1)}` : '',
    ].filter(Boolean);
    if (meta.length) {
        setFont(ctx, 700, isStory ? 36 : 30);
        ctx.fillStyle = SOFT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(fitText(ctx, meta.join(' · '), contentWidth), margin, y + 14);
        y += (isStory ? 36 : 30) + 14;
    }
    y += isStory ? 60 : 36;
    const items = (entity.rankItems || []).slice(0, 3);
    const gap = isStory ? 24 : 16;
    const available = bottomLimit - y;
    const rowHeight = Math.min(isStory ? 240 : 150, Math.floor((available - gap * (items.length - 1)) / Math.max(1, items.length)));
    if (rowHeight >= 80) drawRankRows(ctx, items, images, margin, y, contentWidth, rowHeight, gap);
};

/** Sitio, plato o valoración: se apila de abajo arriba, encima del pie. */
const drawVerticalContent = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    avatar: HTMLImageElement | null,
    variant: Exclude<ModernCardVariant, 'landscape'>,
    width: number,
    bottom: number,
) => {
    const margin = 64;
    const contentWidth = width - margin * 2;
    const isStory = variant === 'story';
    const isSquare = variant === 'square';
    const isReview = entity.type === 'review';
    let cursorY = bottom;

    const extras = (entity.nonPonderableStats || []).filter((item) => Number.isFinite(item.score))
        .slice(0, isSquare ? 0 : 4);
    if (extras.length && isStory) {
        const panelHeight = 150;
        cursorY -= panelHeight;
        drawNonPonderable(ctx, extras, margin, cursorY, contentWidth, panelHeight);
        cursorY -= 30;
    }

    if (isReview && entity.description && !isSquare) {
        const fontSize = isStory ? 38 : 30;
        setFont(ctx, 500, fontSize, true);
        const lines = wrapText(ctx, `«${entity.description}»`, contentWidth, 2);
        const blockHeight = lines.length * fontSize * 1.3;
        cursorY -= blockHeight;
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((line, index) => ctx.fillText(line, margin, cursorY + index * fontSize * 1.3));
        cursorY -= isStory ? 40 : 28;
    }

    const criteria = (entity.criteriaStats || []).filter((item) => Number.isFinite(item.score))
        .slice(0, isStory ? 4 : isSquare ? 0 : 3);
    if (criteria.length) {
        const rowHeight = isStory ? 62 : 52;
        cursorY -= criteria.length * rowHeight;
        drawCriteriaBars(ctx, criteria, margin, cursorY, contentWidth, rowHeight);
        cursorY -= isStory ? 34 : 24;
    }

    if (hasScore(entity.score)) {
        const size = isStory ? 120 : isSquare ? 84 : 96;
        const pillHeight = Math.round(size * 1.3);
        cursorY -= pillHeight;
        const pillWidth = drawScorePill(ctx, entity.score, margin, cursorY, size);
        const band = scoreBand(entity.score);
        const side = isReview ? SCORE_BAND_LABEL[band] : (entity.reviewCount ? `${entity.reviewCount} ${entity.reviewCount === 1 ? 'valoración' : 'valoraciones'}` : SCORE_BAND_LABEL[band]);
        const sideSub = isReview ? '' : SCORE_BAND_LABEL[band];
        setFont(ctx, 800, isStory ? 40 : 32);
        ctx.fillStyle = isReview ? SCORE_TEXT_ON_DARK[band] : SOFT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const sideX = margin + pillWidth + 28;
        if (sideSub && sideSub !== side) {
            ctx.fillText(fitText(ctx, side, contentWidth - pillWidth - 28), sideX, cursorY + pillHeight / 2 - (isStory ? 24 : 19));
            ctx.fillStyle = SCORE_TEXT_ON_DARK[band];
            ctx.fillText(sideSub, sideX, cursorY + pillHeight / 2 + (isStory ? 24 : 19));
        } else {
            ctx.fillText(fitText(ctx, side, contentWidth - pillWidth - 28), sideX, cursorY + pillHeight / 2);
        }
        cursorY -= isStory ? 40 : 28;
    }

    // Sitio y ciudad: en la valoración, bien grandes.
    const placeSize = isReview ? (isStory ? 54 : isSquare ? 38 : 44) : (isStory ? 40 : 32);
    const placeName = isReview ? entity.subtitle : undefined;
    const city = entity.city || (!isReview ? entity.subtitle : undefined);
    if (placeName || city) {
        cursorY -= placeSize + 4;
        drawPlaceLine(ctx, placeName, city, margin, cursorY, contentWidth, placeSize);
        cursorY -= isStory ? 26 : 18;
    }

    const titleStart = isReview ? (isStory ? 86 : isSquare ? 60 : 68) : (isStory ? 116 : isSquare ? 80 : 92);
    const titleLines = isStory ? 3 : 2;
    const titleHeight = titleHeightFor(ctx, entity.title, contentWidth, titleStart, 44, titleLines);
    cursorY -= titleHeight;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 20;
    drawTitleBlock(ctx, entity.title, margin, cursorY, contentWidth, titleStart, 44, titleLines);
    ctx.shadowBlur = 0;
    cursorY -= isStory ? 30 : 20;

    if (isReview && entity.authorName) {
        const size = isStory ? 62 : isSquare ? 42 : 50;
        const rowHeight = Math.round(size * 1.8);
        cursorY -= rowHeight;
        drawAuthorRow(ctx, entity, avatar, margin, cursorY, contentWidth, size);
    } else if (!isReview) {
        const fontSize = isStory ? 32 : 26;
        cursorY -= fontSize * 1.85;
        drawChip(ctx, typeChipLabel(entity), margin, cursorY, fontSize);
    }
};

const drawSidePhoto = (ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, width: number, height: number, ratio: number) => {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);
    const photoWidth = Math.round(width * ratio);
    if (image) drawCover(ctx, image, width - photoWidth, 0, photoWidth, height);
    const fade = ctx.createLinearGradient(0, 0, width, 0);
    fade.addColorStop(0, 'rgba(11,16,33,1)');
    fade.addColorStop(0.42, 'rgba(11,16,33,0.92)');
    fade.addColorStop(0.7, 'rgba(11,16,33,0.25)');
    fade.addColorStop(1, 'rgba(11,16,33,0.05)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);
};

/** Banner 1200×630: misma composición que la vista previa de WhatsApp. */
const drawLandscape = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    hero: HTMLImageElement | null,
    avatar: HTMLImageElement | null,
    logo: HTMLImageElement | null,
    rankImages: (HTMLImageElement | null)[],
    width: number,
    height: number,
) => {
    const x = 60;
    const isReview = entity.type === 'review';
    const listWithTop = isList(entity) && (entity.rankItems?.length || 0) > 0;

    if (entity.type === 'profile') {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, width, height);
        drawGlow(ctx, 900, 200, 650, 'rgba(49,46,129,0.95)', width, height);
        drawBrand(ctx, logo, x, 50, 52);
        drawCircularImage(ctx, hero, 900, 300, 170, entity.title);
        drawChip(ctx, 'Perfil', x, 150, 24);
        const titleHeight = drawTitleBlock(ctx, entity.title, x, 214, 600, 76, 48, 2);
        if (entity.subtitle) {
            setFont(ctx, 700, 30);
            ctx.fillStyle = SOFT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(fitText(ctx, entity.subtitle, 600), x, 214 + titleHeight + 10);
        }
        const stats = (entity.profileStats || []).slice(0, 3);
        if (stats.length) drawProfileStats(ctx, stats, x, Math.max(214 + titleHeight + 70, 410), 620, 120, 3);
        drawBottomBar(ctx, width, height, 10);
        return;
    }

    if (listWithTop) {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, width, height);
        drawGlow(ctx, 980, 120, 700, 'rgba(49,46,129,0.9)', width, height);
    } else {
        drawSidePhoto(ctx, hero, width, height, isReview ? 0.56 : 0.6);
    }
    drawBrand(ctx, logo, x, 50, 52);
    const maxWidth = listWithTop ? 560 : 660;

    if (isReview) {
        drawAuthorRow(ctx, entity, avatar, x, 128, maxWidth, 46);
        const titleHeight = drawTitleBlock(ctx, entity.title, x, 248, maxWidth, 54, 40, 2);
        const placeY = 248 + titleHeight + 18;
        drawPlaceLine(ctx, entity.subtitle, entity.city, x, placeY, maxWidth, 38);
        if (hasScore(entity.score)) {
            const pillY = Math.min(Math.max(placeY + 70, 450), height - 130);
            const pillWidth = drawScorePill(ctx, entity.score, x, pillY, 72);
            if (entity.description) {
                setFont(ctx, 500, 26, true);
                ctx.fillStyle = '#e2e8f0';
                ctx.textBaseline = 'middle';
                const room = maxWidth - pillWidth - 22;
                if (room > 160) ctx.fillText(fitText(ctx, `«${entity.description}»`, room), x + pillWidth + 22, pillY + 47);
            }
        }
        drawBottomBar(ctx, width, height, 10);
        return;
    }

    drawChip(ctx, typeChipLabel(entity), x, 150, 24);
    const titleHeight = drawTitleBlock(ctx, entity.title, x, 214, maxWidth, listWithTop ? 68 : 76, 46, listWithTop ? 3 : 2);
    let y = 214 + titleHeight + 18;
    if (listWithTop) {
        const meta = [entity.authorName ? `por ${entity.authorName}` : '', hasScore(entity.score) ? `media ${entity.score.toFixed(1)}` : '']
            .filter(Boolean).join(' · ');
        if (meta) {
            setFont(ctx, 700, 30);
            ctx.fillStyle = SOFT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(fitText(ctx, meta, maxWidth), x, y);
        }
        const items = (entity.rankItems || []).slice(0, 3);
        const size = 240;
        const gap = 18;
        const ox = width - 50 - size * 2 - gap;
        for (let i = 0; i < 4; i += 1) {
            const cx = ox + (i % 2) * (size + gap);
            const cy = 60 + Math.floor(i / 2) * (size + gap);
            ctx.save();
            roundRect(ctx, cx, cy, size, size, 26);
            ctx.clip();
            if (i < items.length && rankImages[i]) drawCover(ctx, rankImages[i] as HTMLImageElement, cx, cy, size, size);
            else {
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fillRect(cx, cy, size, size);
            }
            ctx.restore();
            if (i < items.length) {
                if (!rankImages[i]) {
                    setFont(ctx, 800, 28);
                    ctx.fillStyle = '#e2e8f0';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(fitText(ctx, items[i].title, size - 30), cx + 16, cy + size / 2 - 20);
                }
                const score = items[i].score;
                if (hasScore(score)) drawScorePill(ctx, score, cx + 14, cy + size - 70, 40);
            } else {
                const rest = Math.max(0, (entity.elementCount || 0) - items.length);
                setFont(ctx, 800, rest > 0 ? 52 : 34);
                ctx.fillStyle = INDIGO_SOFT;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(rest > 0 ? `+${rest}` : 'Ver lista', cx + size / 2, cy + size / 2);
            }
        }
        drawBottomBar(ctx, width, height, 10);
        return;
    }

    const city = entity.city || entity.subtitle;
    if (city) {
        drawPlaceLine(ctx, undefined, city, x, y, maxWidth, 32);
        y += 50;
    }
    if (hasScore(entity.score)) {
        const pillY = Math.max(y + 30, 420);
        const pillWidth = drawScorePill(ctx, entity.score, x, pillY, 84);
        if (entity.reviewCount) {
            setFont(ctx, 700, 30);
            ctx.fillStyle = '#e2e8f0';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${entity.reviewCount} ${entity.reviewCount === 1 ? 'valoración' : 'valoraciones'}`, x + pillWidth + 24, pillY + 55);
        }
    }
    drawBottomBar(ctx, width, height, 10);
};

async function renderCard(entity: ShareEntityPayload, variant: ModernCardVariant): Promise<string> {
    const { width, height } = DIMENSIONS[variant];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');

    if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch { /* La fuente del sistema mantiene el layout. */ }
    }

    const rankItems = isList(entity) ? (entity.rankItems || []).slice(0, 3) : [];
    const [hero, avatar, logo, ...rankImages] = await Promise.all([
        loadFirstImage([entity.imageUrl, ...(entity.imageUrls || [])]),
        loadImage(entity.authorPhoto),
        loadImage(BRAND_LOGO_URL),
        ...rankItems.map((item) => loadImage(item.imageUrl)),
    ]);

    if (variant === 'landscape') {
        drawLandscape(ctx, entity, hero, avatar, logo, rankImages, width, height);
        return canvas.toDataURL('image/png', 1.0);
    }

    const isStory = variant === 'story';
    const margin = 64;
    paintBackground(ctx, hero, entity, width, height, isStory ? 0.62 : variant === 'portrait' ? 0.6 : 0.64);
    drawBrand(ctx, logo, margin, margin, isStory ? 70 : 56);

    const showFooter = variant !== 'square';
    const barHeight = 12;
    const footerBottom = height - barHeight - (isStory ? 70 : 48);
    const footerHeight = showFooter ? drawFooter(ctx, entity, margin, footerBottom, width - margin * 2, !isStory) : 0;
    const contentBottom = showFooter ? footerBottom - footerHeight - (isStory ? 48 : 32) : height - barHeight - 52;

    if (entity.type === 'profile') {
        drawVerticalProfile(ctx, entity, hero, variant, width);
    } else if (rankItems.length) {
        drawVerticalList(ctx, entity, rankImages, variant, width, contentBottom);
    } else {
        drawVerticalContent(ctx, entity, avatar, variant, width, contentBottom);
    }
    drawBottomBar(ctx, width, height, barHeight);

    return canvas.toDataURL('image/png', 1.0);
}

export const ShareCardModern: React.FC<ShareCardModernProps> = ({ entity, variant, triggerRef, onRequestClose }) => {
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const busyRef = useRef(false);

    triggerRef.current = async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setLoading(true);
        setFeedback(null);
        try {
            const image = await renderCard(entity, variant);
            setPreviewImage(image);
            setIsOpen(true);
        } catch (error) {
            console.error('ShareCardModern: render failed', error);
            setFeedback('No se pudo generar la tarjeta.');
        } finally {
            busyRef.current = false;
            setLoading(false);
        }
    };

    const fileName = `listopic-${entity.type}-${(entity.id || 'card').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'share'}.png`;

    const download = () => {
        if (!previewImage) return;
        const anchor = document.createElement('a');
        anchor.href = previewImage;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const share = async () => {
        if (!previewImage) return;
        const shareUrl = buildShareRouteUrl(entity.shareRoute || entity.route) || entity.url || '';
        const text = `${buildShareText(entity)} ${shareUrl}`.trim();
        try {
            if (Capacitor.isNativePlatform()) {
                const saved = await Filesystem.writeFile({
                    path: fileName,
                    data: previewImage.split(',')[1],
                    directory: Directory.Cache,
                });
                await Share.share({ title: entity.title, text, url: saved.uri, dialogTitle: 'Compartir Listopic' });
                setFeedback('Tarjeta compartida');
                return;
            }
            const blob = await (await fetch(previewImage)).blob();
            const file = new File([blob], fileName, { type: 'image/png' });
            if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: entity.title, text });
                setFeedback('Tarjeta compartida');
                return;
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                setFeedback('Tu dispositivo no comparte imágenes: copiamos el texto con el enlace.');
                return;
            }
            setFeedback('No se pudo compartir la tarjeta.');
        } catch {
            setFeedback('No se pudo compartir la tarjeta.');
        }
    };

    const close = () => {
        setIsOpen(false);
        setPreviewImage(null);
        setFeedback(null);
        onRequestClose?.();
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-[300] grid place-items-center bg-black/70 backdrop-blur-sm">
                <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] px-6 py-5 text-sm font-bold text-white">
                    Generando tarjeta...
                </div>
            </div>
        );
    }

    if (!isOpen || !previewImage) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={close}>
            <div className="flex max-h-full w-full max-w-lg flex-col gap-3" onClick={(event) => event.stopPropagation()}>
                <img
                    src={previewImage}
                    alt="Tarjeta para compartir"
                    className="max-h-[70vh] w-full rounded-2xl border border-white/15 object-contain shadow-2xl"
                />
                {feedback && (
                    <p className="rounded-xl border border-white/15 bg-black/60 px-4 py-2 text-center text-xs font-bold text-white">
                        <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />
                        {feedback}
                    </p>
                )}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={share}
                        className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-sm font-black text-white shadow-lg"
                    >
                        <Share2 className="mr-1.5 inline h-4 w-4" />
                        Compartir
                    </button>
                    <button
                        type="button"
                        onClick={download}
                        className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white"
                    >
                        <Download className="mr-1.5 inline h-4 w-4" />
                        Guardar
                    </button>
                    <button
                        type="button"
                        onClick={close}
                        className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-white"
                        aria-label="Cerrar"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};
