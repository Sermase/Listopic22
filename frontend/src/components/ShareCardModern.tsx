import React, { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Check, Download, Share2, X } from 'lucide-react';
import { getShareEntityLabel, type ShareCriteriaStat, type ShareEntityPayload, type ShareProfileStat } from '../types/share';
import { buildShareText } from '../utils/shareTexts';
import { buildShareRouteUrl } from '../utils/publicUrl';

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

const FONT = "'Manrope', 'Poppins', system-ui, -apple-system, sans-serif";
const BRAND_LOGO_URL = '/images/listopic-app-icon.png';

const scoreColor = (score?: number): string => {
    if (!Number.isFinite(score as number)) return '#94a3b8';
    if ((score as number) >= 9) return '#34d399';
    if ((score as number) >= 7) return '#84cc16';
    if ((score as number) >= 5) return '#facc15';
    return '#fb7185';
};

const loadImage = async (url?: string): Promise<HTMLImageElement | null> => {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const objectUrl = URL.createObjectURL(await response.blob());
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
        gradient.addColorStop(0, '#2563eb');
        gradient.addColorStop(1, '#9333ea');
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

const drawFallbackBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#0f766e');
    gradient.addColorStop(0.46, '#312e81');
    gradient.addColorStop(1, '#7e22ce');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    [
        [0.12, 0.18, 250, 'rgba(103,232,249,0.12)'],
        [0.88, 0.14, 220, 'rgba(255,255,255,0.08)'],
        [0.72, 0.88, 340, 'rgba(240,171,252,0.11)'],
    ].forEach(([fx, fy, r, color]) => {
        ctx.beginPath();
        ctx.arc(w * (fx as number), h * (fy as number), r as number, 0, Math.PI * 2);
        ctx.fillStyle = color as string;
        ctx.fill();
    });
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
        ctx.font = `900 ${size}px ${FONT}`;
        const lines = wrapText(ctx, text, maxWidth, maxLines);
        if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
            return { lines, fontSize: size };
        }
    }
    ctx.font = `900 ${minSize}px ${FONT}`;
    return { lines: wrapText(ctx, text, maxWidth, maxLines), fontSize: minSize };
};

const drawGlassPanel = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 28) => {
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = 'rgba(5,8,20,0.68)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();
};

const drawBrand = (
    ctx: CanvasRenderingContext2D,
    logo: HTMLImageElement | null,
    right: number,
    top: number,
    compact = false,
) => {
    const logoSize = compact ? 48 : 58;
    const fontSize = compact ? 27 : 32;
    ctx.font = `900 ${fontSize}px ${FONT}`;
    const brandWidth = ctx.measureText('Listopic').width;
    const x = right - logoSize - 14 - brandWidth;
    if (logo) {
        drawContain(ctx, logo, x, top, logoSize, logoSize);
    } else {
        roundRect(ctx, x, top, logoSize, logoSize, 14);
        const fallback = ctx.createLinearGradient(x, top, x + logoSize, top + logoSize);
        fallback.addColorStop(0, '#14b8a6');
        fallback.addColorStop(1, '#7e22ce');
        ctx.fillStyle = fallback;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${fontSize}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('L', x + logoSize / 2, top + logoSize / 2 + 1);
    }
    ctx.font = `900 ${fontSize}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Listopic', x + logoSize + 14, top + logoSize / 2 + 1);
};

const drawTypeChip = (ctx: CanvasRenderingContext2D, entity: ShareEntityPayload, x: number, y: number, compact = false) => {
    const label = getShareEntityLabel(entity.type).toUpperCase();
    const fontSize = compact ? 24 : 28;
    const height = compact ? 50 : 58;
    ctx.font = `900 ${fontSize}px ${FONT}`;
    const width = ctx.measureText(label).width + 44;
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = 'rgba(3,6,18,0.64)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 22, y + height / 2 + 1);
};

const drawAuthor = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    avatar: HTMLImageElement | null,
    x: number,
    centerY: number,
    maxWidth: number,
    compact = false,
) => {
    if (!entity.authorName) return;
    const radius = compact ? 26 : 32;
    drawCircularImage(ctx, avatar, x + radius, centerY, radius, entity.authorName);
    ctx.font = `800 ${compact ? 25 : 29}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, entity.authorName, maxWidth - radius * 2 - 18), x + radius * 2 + 18, centerY);
};

const drawScorePill = (ctx: CanvasRenderingContext2D, score: number, x: number, y: number, compact = false) => {
    const height = compact ? 82 : 112;
    const width = compact ? 195 : 250;
    const valueSize = compact ? 56 : 78;
    const color = scoreColor(score);
    roundRect(ctx, x, y, width, height, compact ? 25 : 32);
    ctx.fillStyle = 'rgba(3,6,18,0.7)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = compact ? 3 : 4;
    ctx.stroke();
    ctx.font = `900 ${valueSize}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(score.toFixed(1), x + (compact ? 24 : 30), y + height / 2);
    ctx.font = `800 ${compact ? 25 : 31}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText('/10', x + (compact ? 126 : 164), y + height / 2 + (compact ? 8 : 11));
};

const drawCriteriaBars = (
    ctx: CanvasRenderingContext2D,
    criteria: ShareCriteriaStat[],
    x: number,
    y: number,
    width: number,
    rowHeight: number,
) => {
    const panelHeight = criteria.length * rowHeight + 34;
    drawGlassPanel(ctx, x, y, width, panelHeight, 25);
    criteria.forEach((stat, index) => {
        const rowY = y + 30 + index * rowHeight;
        const labelWidth = width * 0.38;
        ctx.font = `700 ${rowHeight >= 64 ? 27 : 23}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.84)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fitText(ctx, stat.label || stat.key, labelWidth), x + 24, rowY);
        const barX = x + width * 0.43;
        const barW = width * 0.39;
        roundRect(ctx, barX, rowY - 8, barW, 16, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fill();
        const ratio = Math.max(0.025, Math.min(1, stat.score / 10));
        roundRect(ctx, barX, rowY - 8, barW * ratio, 16, 8);
        ctx.fillStyle = scoreColor(stat.score);
        ctx.fill();
        ctx.font = `900 ${rowHeight >= 64 ? 27 : 23}px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.fillText(stat.score.toFixed(1), x + width - 24, rowY);
    });
    return panelHeight;
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
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, stat.score / 10)));
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.font = `900 ${Math.round(radius * 0.72)}px ${FONT}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stat.score.toFixed(stat.score % 1 === 0 ? 0 : 1), centerX, centerY + 1);
        ctx.font = `700 ${Math.min(21, Math.max(16, cellWidth * 0.08))}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.textBaseline = 'top';
        const label = fitText(ctx, stat.label || stat.key, Math.max(70, cellWidth - 18));
        ctx.fillText(label, centerX, centerY + radius + 13);
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
        const column = index % columns;
        const row = Math.floor(index / columns);
        const cellX = x + column * (cellWidth + gap);
        const cellY = y + row * (cellHeight + gap);
        roundRect(ctx, cellX, cellY, cellWidth, cellHeight, 24);
        ctx.fillStyle = stat.key === 'level' ? 'rgba(245,158,11,0.24)' : 'rgba(4,8,22,0.62)';
        ctx.fill();
        ctx.strokeStyle = stat.key === 'level' ? 'rgba(251,191,36,0.62)' : 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `900 ${Math.round(cellHeight * 0.38)}px ${FONT}`;
        ctx.fillStyle = stat.key === 'level' ? '#fbbf24' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatMetricValue(stat.value), cellX + cellWidth / 2, cellY + cellHeight * 0.4);
        ctx.font = `800 ${Math.round(cellHeight * 0.16)}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        ctx.fillText(fitText(ctx, stat.label, cellWidth - 18), cellX + cellWidth / 2, cellY + cellHeight * 0.76);
    });
    return rows * cellHeight + Math.max(0, rows - 1) * gap;
};

const paintBackground = (
    ctx: CanvasRenderingContext2D,
    hero: HTMLImageElement | null,
    entity: ShareEntityPayload,
    width: number,
    height: number,
) => {
    if (hero && entity.type !== 'profile') {
        drawCover(ctx, hero, 0, 0, width, height);
    } else {
        drawFallbackBackground(ctx, width, height);
    }
    const top = ctx.createLinearGradient(0, 0, 0, height * 0.36);
    top.addColorStop(0, 'rgba(3,6,18,0.72)');
    top.addColorStop(1, 'rgba(3,6,18,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, height * 0.42);
    const bottom = ctx.createLinearGradient(0, height * 0.24, 0, height);
    bottom.addColorStop(0, 'rgba(3,6,18,0)');
    bottom.addColorStop(0.52, 'rgba(3,6,18,0.64)');
    bottom.addColorStop(1, 'rgba(3,6,18,0.97)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 0, width, height);
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
    const radius = isStory ? 205 : variant === 'portrait' ? 158 : 132;
    const centerY = isStory ? 420 : variant === 'portrait' ? 300 : 255;
    ctx.beginPath();
    ctx.arc(width / 2, centerY, radius + 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.11)';
    ctx.fill();
    drawCircularImage(ctx, portrait, width / 2, centerY, radius, entity.title);

    const titleTop = centerY + radius + (isStory ? 58 : 38);
    const { lines, fontSize } = layoutTitle(ctx, entity.title, width - margin * 2, isStory ? 88 : 70, 48, 2);
    ctx.font = `900 ${fontSize}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => ctx.fillText(line, width / 2, titleTop + index * fontSize * 1.08));
    let cursorY = titleTop + lines.length * fontSize * 1.08 + 16;
    if (entity.subtitle) {
        ctx.font = `700 ${isStory ? 36 : 29}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        ctx.fillText(fitText(ctx, entity.subtitle, width - margin * 2), width / 2, cursorY);
        cursorY += isStory ? 78 : 58;
    } else {
        cursorY += isStory ? 38 : 24;
    }

    const stats = (entity.profileStats || []).slice(0, 6);
    if (stats.length) {
        drawProfileStats(ctx, stats, margin, cursorY, width - margin * 2, isStory ? 132 : 104);
    }
};

const drawVerticalContent = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    avatar: HTMLImageElement | null,
    variant: Exclude<ModernCardVariant, 'landscape'>,
    width: number,
    height: number,
) => {
    const margin = 64;
    const contentWidth = width - margin * 2;
    const isStory = variant === 'story';
    const isSquare = variant === 'square';
    let cursorY = height - margin;

    if (entity.authorName) {
        drawAuthor(ctx, entity, avatar, margin, cursorY - 32, contentWidth * 0.68, false);
        cursorY -= 96;
    }

    const extras = (entity.nonPonderableStats || []).filter((item) => Number.isFinite(item.score))
        .slice(0, isSquare ? 3 : 4);
    if (extras.length) {
        const panelHeight = isStory ? 162 : 140;
        cursorY -= panelHeight;
        drawNonPonderable(ctx, extras, margin, cursorY, contentWidth, panelHeight);
        cursorY -= 22;
    }

    const criteria = (entity.criteriaStats || []).filter((item) => Number.isFinite(item.score))
        .slice(0, isStory ? 4 : isSquare ? 2 : 3);
    if (criteria.length) {
        const rowHeight = isStory ? 64 : 55;
        const panelHeight = criteria.length * rowHeight + 34;
        cursorY -= panelHeight;
        drawCriteriaBars(ctx, criteria, margin, cursorY, contentWidth, rowHeight);
        cursorY -= 22;
    }

    if (entity.description && !isSquare) {
        const panelHeight = isStory ? 124 : 100;
        cursorY -= panelHeight;
        drawGlassPanel(ctx, margin, cursorY, contentWidth, panelHeight, 24);
        const fontSize = isStory ? 28 : 23;
        ctx.font = `600 italic ${fontSize}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const lines = wrapText(ctx, `“${entity.description}”`, contentWidth - 48, 2);
        lines.forEach((line, index) => ctx.fillText(line, margin + 24, cursorY + 22 + index * fontSize * 1.35));
        cursorY -= 22;
    }

    const metaParts = [
        entity.reviewCount ? `${entity.reviewCount} reseña${entity.reviewCount === 1 ? '' : 's'}` : '',
        entity.city || '',
    ].filter(Boolean);
    if (metaParts.length) {
        ctx.font = `800 ${isStory ? 28 : 23}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fitText(ctx, metaParts.join('  •  '), contentWidth), margin, cursorY);
        cursorY -= isStory ? 52 : 42;
    }

    if (entity.subtitle) {
        ctx.font = `700 ${isStory ? 38 : 31}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.76)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fitText(ctx, entity.subtitle, contentWidth), margin, cursorY);
        cursorY -= isStory ? 61 : 50;
    }

    const { lines, fontSize } = layoutTitle(ctx, entity.title || 'Listopic', contentWidth, isStory ? 94 : 76, 48, isStory ? 3 : 2);
    const titleHeight = lines.length * fontSize * 1.06;
    cursorY -= titleHeight;
    ctx.font = `900 ${fontSize}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.48)';
    ctx.shadowBlur = 22;
    lines.forEach((line, index) => ctx.fillText(line, margin, cursorY + index * fontSize * 1.06));
    ctx.shadowBlur = 0;
    cursorY -= isStory ? 34 : 24;

    if (Number.isFinite(entity.score as number)) {
        const compact = !isStory;
        const scoreHeight = compact ? 82 : 112;
        cursorY -= scoreHeight;
        drawScorePill(ctx, entity.score as number, margin, cursorY, compact);
    }
};

const drawLandscape = (
    ctx: CanvasRenderingContext2D,
    entity: ShareEntityPayload,
    hero: HTMLImageElement | null,
    avatar: HTMLImageElement | null,
    logo: HTMLImageElement | null,
    width: number,
    height: number,
) => {
    const margin = 48;
    drawTypeChip(ctx, entity, margin, margin, true);
    drawBrand(ctx, logo, width - margin, margin, true);

    if (entity.type === 'profile') {
        drawCircularImage(ctx, hero, 174, 302, 112, entity.title);
        const titleLayout = layoutTitle(ctx, entity.title, 785, 68, 48, 2);
        ctx.font = `900 ${titleLayout.fontSize}px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        titleLayout.lines.forEach((line, index) => ctx.fillText(line, 330, 157 + index * titleLayout.fontSize * 1.05));
        const titleBottom = 157 + titleLayout.lines.length * titleLayout.fontSize * 1.05;
        if (entity.subtitle) {
            ctx.font = `700 28px ${FONT}`;
            ctx.fillStyle = 'rgba(255,255,255,0.68)';
            ctx.fillText(fitText(ctx, entity.subtitle, 785), 330, titleBottom + 8);
        }
        const stats = (entity.profileStats || []).slice(0, 6);
        if (stats.length) drawProfileStats(ctx, stats, 330, Math.max(320, titleBottom + 58), 820, 92, 3);
        return;
    }

    const leftX = margin;
    const leftWidth = 670;
    const titleLayout = layoutTitle(ctx, entity.title, leftWidth, 66, 46, 2);
    ctx.font = `900 ${titleLayout.fontSize}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    titleLayout.lines.forEach((line, index) => ctx.fillText(line, leftX, 150 + index * titleLayout.fontSize * 1.04));
    let cursorY = 150 + titleLayout.lines.length * titleLayout.fontSize * 1.04 + 10;
    if (entity.subtitle) {
        ctx.font = `700 28px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.74)';
        ctx.fillText(fitText(ctx, entity.subtitle, leftWidth), leftX, cursorY);
        cursorY += 47;
    }
    if (Number.isFinite(entity.score as number)) {
        drawScorePill(ctx, entity.score as number, leftX, cursorY, true);
    }
    if (entity.authorName) drawAuthor(ctx, entity, avatar, leftX, height - 54, 500, true);

    const panelX = 780;
    const panelWidth = width - margin - panelX;
    const criteria = (entity.criteriaStats || []).filter((item) => Number.isFinite(item.score)).slice(0, 4);
    const extras = (entity.nonPonderableStats || []).filter((item) => Number.isFinite(item.score)).slice(0, 3);
    let panelY = 143;
    if (criteria.length) {
        const panelHeight = drawCriteriaBars(ctx, criteria, panelX, panelY, panelWidth, 52);
        panelY += panelHeight + 16;
    }
    if (extras.length && panelY + 126 < height - 18) {
        drawNonPonderable(ctx, extras, panelX, panelY, panelWidth, 126);
    }
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

    const [hero, avatar, logo] = await Promise.all([
        loadImage(entity.imageUrl),
        loadImage(entity.authorPhoto),
        loadImage(BRAND_LOGO_URL),
    ]);

    paintBackground(ctx, hero, entity, width, height);

    if (variant === 'landscape') {
        drawLandscape(ctx, entity, hero, avatar, logo, width, height);
    } else {
        const margin = 64;
        drawTypeChip(ctx, entity, margin, margin);
        drawBrand(ctx, logo, width - margin, margin);
        if (entity.type === 'profile') {
            drawVerticalProfile(ctx, entity, hero, variant, width);
        } else {
            drawVerticalContent(ctx, entity, avatar, variant, width, height);
        }
    }

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
        const shareUrl = buildShareRouteUrl(entity.route) || entity.url || '';
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
