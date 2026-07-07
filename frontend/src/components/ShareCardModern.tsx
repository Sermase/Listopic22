import React, { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Check, Download, Share2, X } from 'lucide-react';
import { getShareEntityLabel, type ShareEntityPayload } from '../types/share';
import { buildShareText } from '../utils/shareTexts';
import { buildShareRouteUrl } from '../utils/publicUrl';

export type ModernCardVariant = 'story' | 'square';

// ─────────────────────────────────────────────────────────────────────────────
// Tarjetas de compartir v2: dibujadas directamente en <canvas> con layout
// determinista — nada de html2canvas ni datos desencuadrados. Dos variantes
// cuidadas: Story (9:16) y Post cuadrado (1:1).
// ─────────────────────────────────────────────────────────────────────────────

interface ShareCardModernProps {
    entity: ShareEntityPayload;
    variant: ModernCardVariant;
    triggerRef: React.MutableRefObject<() => void>;
    onRequestClose?: () => void;
}

const DIMENSIONS: Record<ModernCardVariant, { width: number; height: number }> = {
    story: { width: 1080, height: 1920 },
    square: { width: 1080, height: 1080 },
};

const FONT = "'Manrope', 'Poppins', system-ui, -apple-system, sans-serif";

const scoreColor = (score?: number): string => {
    if (!Number.isFinite(score as number)) return '#94a3b8';
    if ((score as number) >= 9) return '#34d399';
    if ((score as number) >= 7) return '#84cc16';
    if ((score as number) >= 5) return '#facc15';
    return '#f87171';
};

const loadImage = async (url?: string): Promise<HTMLImageElement | null> => {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        return await new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
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

// Ajusta el tamaño de fuente hasta que el texto quepa en `maxLines` líneas.
const layoutTitle = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    startSize: number,
    minSize: number,
    maxLines: number,
): { lines: string[]; fontSize: number } => {
    for (let size = startSize; size >= minSize; size -= 6) {
        ctx.font = `900 ${size}px ${FONT}`;
        const words = text.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let current = '';
        let overflow = false;
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (ctx.measureText(candidate).width <= maxWidth) {
                current = candidate;
            } else if (current) {
                lines.push(current);
                current = word;
                if (lines.length === maxLines) { overflow = true; break; }
            } else {
                current = word;
            }
        }
        if (!overflow && current && lines.length < maxLines) lines.push(current);
        if (!overflow && lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
            return { lines, fontSize: size };
        }
    }
    // Última opción: recorta con elipsis.
    ctx.font = `900 ${minSize}px ${FONT}`;
    let clipped = text;
    while (clipped.length > 4 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
    return { lines: [`${clipped}…`], fontSize: minSize };
};

const drawFallbackBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#312e81');
    gradient.addColorStop(0.5, '#6d28d9');
    gradient.addColorStop(1, '#0e7490');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    // Burbujas suaves de decoración.
    [[0.15, 0.2, 260, 'rgba(255,255,255,0.08)'], [0.85, 0.15, 200, 'rgba(103,232,249,0.12)'], [0.75, 0.85, 320, 'rgba(240,171,252,0.10)']]
        .forEach(([fx, fy, r, color]) => {
            ctx.beginPath();
            ctx.arc(w * (fx as number), h * (fy as number), r as number, 0, Math.PI * 2);
            ctx.fillStyle = color as string;
            ctx.fill();
        });
};

async function renderCard(entity: ShareEntityPayload, variant: ModernCardVariant): Promise<string> {
    const { width: W, height: H } = DIMENSIONS[variant];
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');

    if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch { /* seguimos con la fuente del sistema */ }
    }

    const [hero, avatar] = await Promise.all([
        loadImage(entity.imageUrl),
        loadImage(entity.authorPhoto),
    ]);

    const M = 72; // margen general
    const contentW = W - M * 2;
    const isStory = variant === 'story';

    // ── Fondo ──
    if (hero) {
        drawCover(ctx, hero, 0, 0, W, H);
        const top = ctx.createLinearGradient(0, 0, 0, H * 0.35);
        top.addColorStop(0, 'rgba(0,0,0,0.62)');
        top.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = top;
        ctx.fillRect(0, 0, W, H * 0.35);
        const bottom = ctx.createLinearGradient(0, H * (isStory ? 0.42 : 0.30), 0, H);
        bottom.addColorStop(0, 'rgba(4,6,16,0)');
        bottom.addColorStop(isStory ? 0.45 : 0.5, 'rgba(4,6,16,0.72)');
        bottom.addColorStop(1, 'rgba(4,6,16,0.96)');
        ctx.fillStyle = bottom;
        ctx.fillRect(0, 0, W, H);
    } else {
        drawFallbackBackground(ctx, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
    }

    // ── Chip superior: tipo de entidad ──
    const label = getShareEntityLabel(entity.type).toUpperCase();
    ctx.font = `800 30px ${FONT}`;
    const labelW = ctx.measureText(label).width;
    roundRect(ctx, M, M, labelW + 56, 64, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, M + 28, M + 34);

    // ── Bloque inferior (se apila de abajo hacia arriba) ──
    let cursorY = H - M;

    // Marca
    ctx.font = `900 34px ${FONT}`;
    const brand = 'Listopic';
    const brandW = ctx.measureText(brand).width;
    const dotR = 13;
    const brandBlockW = dotR * 2 + 16 + brandW;
    const brandX = W - M - brandBlockW;
    ctx.beginPath();
    ctx.arc(brandX + dotR, cursorY - 22, dotR, 0, Math.PI * 2);
    const brandGrad = ctx.createLinearGradient(brandX, cursorY - 44, brandX + 26, cursorY);
    brandGrad.addColorStop(0, '#06b6d4');
    brandGrad.addColorStop(1, '#6366f1');
    ctx.fillStyle = brandGrad;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(brand, brandX + dotR * 2 + 16, cursorY - 20);

    // Autor (a la izquierda de la marca)
    if (entity.authorName) {
        const avatarR = 34;
        const authorX = M;
        const authorCenterY = cursorY - 22;
        ctx.save();
        ctx.beginPath();
        ctx.arc(authorX + avatarR, authorCenterY, avatarR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        if (avatar) {
            drawCover(ctx, avatar, authorX, authorCenterY - avatarR, avatarR * 2, avatarR * 2);
        } else {
            ctx.fillStyle = '#4f46e5';
            ctx.fillRect(authorX, authorCenterY - avatarR, avatarR * 2, avatarR * 2);
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 34px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.fillText((entity.authorName || 'L').slice(0, 1).toUpperCase(), authorX + avatarR, authorCenterY + 2);
            ctx.textAlign = 'left';
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(authorX + avatarR, authorCenterY, avatarR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `800 32px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(entity.authorName, authorX + avatarR * 2 + 20, authorCenterY);
    }
    cursorY -= 108;

    // Criterios (hasta 4 barras)
    const criteria = (entity.criteriaStats || []).filter((stat) => Number.isFinite(stat.score)).slice(0, 4);
    if (criteria.length > 0) {
        const rowH = 64;
        const panelH = criteria.length * rowH + 40;
        roundRect(ctx, M, cursorY - panelH, contentW, panelH, 28);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();

        criteria.forEach((stat, index) => {
            const rowY = cursorY - panelH + 44 + index * rowH;
            const labelText = (stat.label || stat.key).slice(0, 20);
            ctx.font = `700 28px ${FONT}`;
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.textAlign = 'left';
            ctx.fillText(labelText, M + 32, rowY);

            const barX = M + contentW * 0.42;
            const barW = contentW * 0.42;
            roundRect(ctx, barX, rowY - 10, barW, 20, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.fill();
            const ratio = Math.max(0.04, Math.min(1, stat.score / 10));
            roundRect(ctx, barX, rowY - 10, barW * ratio, 20, 10);
            ctx.fillStyle = scoreColor(stat.score);
            ctx.fill();

            ctx.font = `900 30px ${FONT}`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'right';
            ctx.fillText(stat.score.toFixed(1), M + contentW - 32, rowY);
            ctx.textAlign = 'left';
        });
        cursorY -= panelH + 36;
    }

    // Subtítulo
    if (entity.subtitle) {
        ctx.font = `600 ${isStory ? 40 : 34}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        let subtitle = entity.subtitle;
        while (subtitle.length > 4 && ctx.measureText(subtitle).width > contentW) subtitle = `${subtitle.slice(0, -2)}…`;
        ctx.fillText(subtitle, M, cursorY - 16);
        cursorY -= isStory ? 72 : 62;
    }

    // Título (auto-ajustado, hasta 2-3 líneas)
    const title = entity.title || 'Listopic';
    const { lines, fontSize } = layoutTitle(ctx, title, contentW, isStory ? 108 : 84, 52, isStory ? 3 : 2);
    ctx.font = `900 ${fontSize}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        ctx.fillText(lines[i], M, cursorY - 20 - (lines.length - 1 - i) * (fontSize * 1.08));
    }
    ctx.shadowBlur = 0;
    cursorY -= lines.length * fontSize * 1.08 + 44;

    // Nota gigante en burbuja
    if (Number.isFinite(entity.score as number)) {
        const score = entity.score as number;
        const color = scoreColor(score);
        const bubbleH = isStory ? 176 : 150;
        const scoreText = score.toFixed(1);
        ctx.font = `900 ${isStory ? 118 : 100}px ${FONT}`;
        const scoreW = ctx.measureText(scoreText).width;
        ctx.font = `800 ${isStory ? 44 : 38}px ${FONT}`;
        const outOfW = ctx.measureText('/10').width;
        const bubbleW = scoreW + outOfW + 96;

        roundRect(ctx, M, cursorY - bubbleH, bubbleW, bubbleH, 40);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 34;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.font = `900 ${isStory ? 118 : 100}px ${FONT}`;
        ctx.fillStyle = color;
        ctx.fillText(scoreText, M + 44, cursorY - bubbleH / 2 + 6);
        ctx.font = `800 ${isStory ? 44 : 38}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.fillText('/10', M + 44 + scoreW + 12, cursorY - bubbleH / 2 + (isStory ? 30 : 26));
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
                await navigator.clipboard.writeText(`${text}`);
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
            <div
                className="flex max-h-full w-full max-w-sm flex-col gap-3"
                onClick={(event) => event.stopPropagation()}
            >
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
