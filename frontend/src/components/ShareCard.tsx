import React, { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { type ReviewEntity } from '../hooks/useListDetails';
import { getShareEntityLabel, type ShareCriteriaStat, type ShareEntityPayload, type ShareEntityType } from '../types/share';
import { buildCriteriaStats } from '../utils/shareCriteria';

export type ShareCardVariant = 'cinematic' | 'clean' | 'punchy' | 'spotify';

interface ShareCardProps {
    place?: PlaceDetails;
    review?: ReviewEntity;
    shareEntity?: ShareEntityPayload;
    variant?: ShareCardVariant;
    triggerRef: React.MutableRefObject<() => void>;
}

type VariantTheme = {
    cardBg: string;
    footerBg: string;
    heroFallback: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentSoft: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    panelBg: string;
    chipBg: string;
    chipBorder: string;
    shadow: string;
};

const VARIANT_THEMES: Record<ShareCardVariant, VariantTheme> = {
    cinematic: {
        cardBg: '#071225',
        footerBg: 'rgba(7, 18, 37, 0.96)',
        heroFallback: 'linear-gradient(145deg, #0b1730 0%, #10264a 56%, #071225 100%)',
        textPrimary: '#f8fafc',
        textSecondary: '#dbeafe',
        textMuted: '#bfdbfe',
        accent: '#60a5fa',
        accentSoft: 'rgba(96,165,250,0.28)',
        border: 'rgba(148,163,184,0.2)',
        badgeBg: 'rgba(8, 20, 42, 0.66)',
        badgeText: '#dbeafe',
        panelBg: 'rgba(6, 18, 37, 0.82)',
        chipBg: 'rgba(148,163,184,0.12)',
        chipBorder: 'rgba(148,163,184,0.14)',
        shadow: '0 34px 90px rgba(2, 6, 23, 0.38)',
    },
    clean: {
        cardBg: '#f8fafc',
        footerBg: 'rgba(255, 255, 255, 0.97)',
        heroFallback: 'linear-gradient(145deg, #e0e7ff 0%, #c7d2fe 55%, #eef2ff 100%)',
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#64748b',
        accent: '#4f46e5',
        accentSoft: 'rgba(79,70,229,0.2)',
        border: 'rgba(15,23,42,0.12)',
        badgeBg: 'rgba(255, 255, 255, 0.82)',
        badgeText: '#312e81',
        panelBg: 'rgba(255, 255, 255, 0.9)',
        chipBg: 'rgba(79,70,229,0.08)',
        chipBorder: 'rgba(79,70,229,0.12)',
        shadow: '0 28px 72px rgba(15, 23, 42, 0.16)',
    },
    punchy: {
        cardBg: '#081328',
        footerBg: 'rgba(8, 19, 40, 0.96)',
        heroFallback: 'linear-gradient(145deg, #0c1832 0%, #1d3a64 48%, #0f172a 100%)',
        textPrimary: '#ecfeff',
        textSecondary: '#cffafe',
        textMuted: '#a5f3fc',
        accent: '#22d3ee',
        accentSoft: 'rgba(34,211,238,0.26)',
        border: 'rgba(45,212,191,0.2)',
        badgeBg: 'rgba(6, 24, 41, 0.66)',
        badgeText: '#a5f3fc',
        panelBg: 'rgba(7, 24, 41, 0.8)',
        chipBg: 'rgba(34,211,238,0.1)',
        chipBorder: 'rgba(34,211,238,0.14)',
        shadow: '0 34px 90px rgba(8, 14, 35, 0.45)',
    },
    spotify: {
        cardBg: '#07180e',
        footerBg: 'rgba(7, 24, 14, 0.96)',
        heroFallback: 'linear-gradient(145deg, #0b1f13 0%, #14532d 52%, #052e16 100%)',
        textPrimary: '#f0fdf4',
        textSecondary: '#dcfce7',
        textMuted: '#bbf7d0',
        accent: '#22c55e',
        accentSoft: 'rgba(34,197,94,0.24)',
        border: 'rgba(74,222,128,0.22)',
        badgeBg: 'rgba(5, 24, 12, 0.7)',
        badgeText: '#bbf7d0',
        panelBg: 'rgba(5, 24, 12, 0.82)',
        chipBg: 'rgba(34,197,94,0.1)',
        chipBorder: 'rgba(74,222,128,0.12)',
        shadow: '0 34px 90px rgba(2, 12, 5, 0.42)',
    },
};

const DEFAULT_ENTITY: ShareEntityPayload = {
    type: 'link',
    title: 'Listopic',
    subtitle: 'Comparte recomendaciones reales',
    url: typeof window !== 'undefined' ? window.location.origin : '',
};

const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1600;

const isSupportedEntityType = (value: unknown): value is ShareEntityType => {
    return ['place', 'group', 'list', 'sublist', 'profile', 'app', 'review', 'link'].includes(String(value));
};

const clampScore = (value: number) => Math.max(0, Math.min(10, value));

const formatScore = (value?: number) => {
    if (!Number.isFinite(value as number)) return '--';
    return (value as number).toFixed(1);
};

const truncateLabel = (value: string, max = 12) => {
    if (!value) return '';
    return value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;
};

const formatReviewCount = (count?: number) => {
    if (!count || count <= 0) return null;
    return `${count} rese\u00f1a${count === 1 ? '' : 's'}`;
};

const scoreBubbleColor = (score?: number) => {
    if (!Number.isFinite(score as number)) return '#94a3b8';
    if ((score as number) >= 9) return '#34d399';
    if ((score as number) >= 7) return '#84cc16';
    if ((score as number) >= 5) return '#facc15';
    return '#f87171';
};

const toReadableDate = (review?: ReviewEntity): string | null => {
    if (!review?.createdAt) return null;
    try {
        const jsDate = typeof review.createdAt?.toDate === 'function' ? review.createdAt.toDate() : null;
        if (!jsDate) return null;
        return new Intl.DateTimeFormat('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        }).format(jsDate);
    } catch {
        return null;
    }
};

const getScoreLabel = (entityType: ShareEntityType) => {
    if (entityType === 'review') return 'NOTA';
    if (entityType === 'group' || entityType === 'list' || entityType === 'sublist') return 'MEDIA';
    return 'SCORE';
};

const normalizeTags = (values?: string[]) => {
    if (!values?.length) return [];
    return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).slice(0, 4);
};

const RadarChart: React.FC<{ stats: ShareCriteriaStat[]; accent: string; gridColor: string; textColor: string }> = ({
    stats,
    accent,
    gridColor,
    textColor,
}) => {
    if (stats.length < 3) return null;
    const size = 240;
    const center = 120;
    const radius = 74;
    const levels = [0.25, 0.5, 0.75, 1];
    const angleStep = (Math.PI * 2) / stats.length;

    const getPoint = (angle: number, currentRadius: number) => ({
        x: center + Math.cos(angle) * currentRadius,
        y: center + Math.sin(angle) * currentRadius,
    });

    const axes = stats.map((stat, index) => {
        const angle = (-Math.PI / 2) + (index * angleStep);
        const axisPoint = getPoint(angle, radius);
        const labelPoint = getPoint(angle, radius + 26);
        const cosine = Math.cos(angle);
        const anchor: 'start' | 'end' | 'middle' = cosine > 0.35 ? 'start' : cosine < -0.35 ? 'end' : 'middle';

        return {
            angle,
            axisPoint,
            labelPoint,
            anchor,
            label: truncateLabel(stat.label, 11),
        };
    });

    const gridPolygons = levels.map((level) => (
        axes
            .map(({ angle }) => {
                const point = getPoint(angle, radius * level);
                return `${point.x},${point.y}`;
            })
            .join(' ')
    ));

    const dataPolygon = axes
        .map(({ angle }, index) => {
            const point = getPoint(angle, radius * (clampScore(stats[index].score) / 10));
            return `${point.x},${point.y}`;
        })
        .join(' ');

    return (
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '188px', overflow: 'visible' }}>
            {gridPolygons.map((polygon, index) => (
                <polygon
                    key={`grid-${levels[index]}`}
                    points={polygon}
                    fill="none"
                    stroke={gridColor}
                    strokeWidth={index === gridPolygons.length - 1 ? 1.4 : 1}
                />
            ))}

            {axes.map(({ axisPoint }, index) => (
                <line
                    key={`axis-${index}`}
                    x1={center}
                    y1={center}
                    x2={axisPoint.x}
                    y2={axisPoint.y}
                    stroke={gridColor}
                    strokeWidth="1"
                />
            ))}

            <polygon
                points={dataPolygon}
                fill={accent}
                fillOpacity="0.18"
                stroke={accent}
                strokeWidth="3"
            />

            {axes.map(({ angle }, index) => {
                const point = getPoint(angle, radius * (clampScore(stats[index].score) / 10));
                return <circle key={`dot-${stats[index].key}`} cx={point.x} cy={point.y} r="4.8" fill={accent} />;
            })}

            {axes.map(({ labelPoint, anchor, label }, index) => (
                <text
                    key={`label-${stats[index].key}`}
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fill={textColor}
                    fontSize="12"
                    fontWeight="700"
                >
                    {label}
                </text>
            ))}
        </svg>
    );
};

export const ShareCard: React.FC<ShareCardProps> = ({ place, review, shareEntity, variant = 'cinematic', triggerRef }) => {
    const captureRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [shareFeedback, setShareFeedback] = useState<string | null>(null);
    const [localImages, setLocalImages] = useState<{ hero: string; avatar: string }>({ hero: '', avatar: '' });

    const entity = useMemo<ShareEntityPayload>(() => {
        if (shareEntity && isSupportedEntityType(shareEntity.type)) return shareEntity;
        if (review) {
            const reviewUrl = typeof window !== 'undefined'
                ? `${window.location.origin}/group/${review.placeId || ''}/${encodeURIComponent(review.itemName || '')}`
                : '';
            return {
                type: 'review',
                id: review.id,
                title: review.itemName || 'Rese\u00f1a',
                subtitle: review.placeName || 'Lugar',
                description: review.comment || '',
                route: review.placeId && review.itemName ? `/group/${review.placeId}/${encodeURIComponent(review.itemName)}` : undefined,
                url: reviewUrl,
                imageUrl: review.photoUrl || review.placeMainImage,
                badgeLabel: review.listName,
                score: review.overallRating,
                authorName: review.authorName,
                authorPhoto: review.authorPhoto,
                criteriaStats: buildCriteriaStats(review.scores, review.criteriaDefinition),
                tags: review.userTags || review.tags,
            };
        }
        if (place) {
            const placeUrl = typeof window !== 'undefined' ? `${window.location.origin}/place/${place.placeId}` : '';
            return {
                type: 'place',
                id: place.placeId,
                title: place.name || 'Lugar',
                subtitle: place.address || '',
                description: place.reviewCount ? `${place.reviewCount} rese\u00f1as publicadas` : '',
                route: place.placeId ? `/place/${place.placeId}` : undefined,
                url: placeUrl,
                imageUrl: place.photoUrl,
                score: place.avgScore,
            };
        }
        return DEFAULT_ENTITY;
    }, [place, review, shareEntity]);

    const theme = VARIANT_THEMES[variant] || VARIANT_THEMES.cinematic;
    const score = review?.overallRating ?? place?.avgScore ?? entity.score;
    const scoreColor = scoreBubbleColor(score);
    const heroImage = localImages.hero || review?.photoUrl || place?.photoUrl || entity.imageUrl || '';
    const avatarImage = localImages.avatar || review?.authorPhoto || entity.authorPhoto || (entity.type === 'profile' ? entity.imageUrl || '' : '');
    const hasScore = Number.isFinite(score as number);
    const createdAtLabel = toReadableDate(review);

    const titleText = entity.title || 'Listopic';
    const subtitleText = entity.subtitle || '';
    const descriptionText = (review?.comment || entity.description || '').trim();
    const authorLabel = review?.authorName || entity.authorName || (entity.type === 'profile' ? entity.title : 'Comunidad Listopic');

    const criteriaStats = useMemo(() => {
        if (entity.criteriaStats?.length) {
            return entity.criteriaStats
                .map((stat) => ({
                    ...stat,
                    label: stat.label || stat.key,
                    score: clampScore(Number(stat.score)),
                }))
                .filter((stat) => Number.isFinite(stat.score))
                .slice(0, 6);
        }

        return buildCriteriaStats(review?.scores, review?.criteriaDefinition);
    }, [entity.criteriaStats, review]);

    const radarStats = criteriaStats.slice(0, 5);
    const summaryStats = criteriaStats.slice(0, 4);
    const hasRadar = radarStats.length >= 3;
    const isReviewShare = entity.type === 'review' || Boolean(review);
    const reviewCountLabel = formatReviewCount(entity.reviewCount);
    const entityLabel = getShareEntityLabel(entity.type);
    const scoreLabel = getScoreLabel(entity.type);
    const tagList = normalizeTags(entity.tags || review?.userTags || review?.tags);
    const titleFontSize = titleText.length > 54 ? '52px' : titleText.length > 38 ? '62px' : '74px';
    const authorNameSize = titleText.length > 44 ? '32px' : '38px';
    const heroTextMaxWidth = hasRadar ? '58%' : '76%';
    const chartHeading = isReviewShare
        ? 'Criterios valorados'
        : entity.type === 'group'
            ? 'Medias del grupo'
            : entity.type === 'list' || entity.type === 'sublist'
                ? 'Medias de la lista'
                : 'Datos destacados';

    const infoChips = [
        entityLabel,
        entity.badgeLabel && entity.badgeLabel !== entityLabel ? entity.badgeLabel : null,
        !isReviewShare ? reviewCountLabel : null,
    ].filter((value): value is string => Boolean(value));

    const footerFacts = [
        createdAtLabel || null,
        reviewCountLabel,
        criteriaStats.length ? `${criteriaStats.length} criterio${criteriaStats.length === 1 ? '' : 's'}` : null,
    ].filter((value): value is string => Boolean(value));

    const footerDescription = descriptionText || (
        isReviewShare
            ? 'Una rese\u00f1a real compartida desde la comunidad Listopic.'
            : entity.type === 'group'
                ? 'Resumen visual con medias agregadas a partir de las rese\u00f1as del grupo.'
                : entity.type === 'list' || entity.type === 'sublist'
                    ? 'Tarjeta compartible con el tono y las medias principales de la lista.'
                    : 'Compartido desde Listopic.'
    );

    const loadAsBlobUrl = async (url?: string): Promise<string> => {
        if (!url) return '';
        const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
        try {
            const response = await fetch(cacheBustedUrl);
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch {
            return cacheBustedUrl;
        }
    };

    const clearBlobUrl = (url?: string) => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    };

    const renderIsolatedCanvas = async (node: HTMLDivElement) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.position = 'fixed';
        iframe.style.left = '-200vw';
        iframe.style.top = '0';
        iframe.style.width = `${EXPORT_WIDTH}px`;
        iframe.style.height = `${EXPORT_HEIGHT}px`;
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        try {
            const frameDocument = iframe.contentDocument;
            if (!frameDocument) {
                throw new Error('No iframe document available');
            }

            frameDocument.open();
            frameDocument.write('<!DOCTYPE html><html><head></head><body style="margin:0;background:transparent;"></body></html>');
            frameDocument.close();

            const fontLink = frameDocument.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap';
            frameDocument.head.appendChild(fontLink);

            const clonedNode = node.cloneNode(true) as HTMLDivElement;
            clonedNode.style.margin = '0';
            frameDocument.body.appendChild(clonedNode);

            const images = Array.from(frameDocument.images);
            await Promise.all(images.map((image) => (
                image.complete
                    ? Promise.resolve()
                    : new Promise<void>((resolve) => {
                        image.onload = () => resolve();
                        image.onerror = () => resolve();
                    })
            )));

            if (frameDocument.fonts?.ready) {
                try {
                    await frameDocument.fonts.ready;
                } catch {
                    // Ignore font loading issues and continue with fallback fonts.
                }
            }

            return await html2canvas(clonedNode, {
                useCORS: true,
                scale: 2,
                backgroundColor: null,
                logging: false,
                width: EXPORT_WIDTH,
                height: EXPORT_HEIGHT,
                windowWidth: EXPORT_WIDTH,
                windowHeight: EXPORT_HEIGHT,
            });
        } finally {
            iframe.remove();
        }
    };

    triggerRef.current = async () => {
        if (!captureRef.current || loading) return;

        setLoading(true);
        setShareFeedback(null);

        try {
            clearBlobUrl(localImages.hero);
            clearBlobUrl(localImages.avatar);

            const [heroBlob, avatarBlob] = await Promise.all([
                loadAsBlobUrl(review?.photoUrl || place?.photoUrl || entity.imageUrl),
                loadAsBlobUrl(review?.authorPhoto || entity.authorPhoto || (entity.type === 'profile' ? entity.imageUrl : undefined)),
            ]);

            setLocalImages({ hero: heroBlob, avatar: avatarBlob });
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (!captureRef.current) return;

            const canvas = await renderIsolatedCanvas(captureRef.current);

            setPreviewImage(canvas.toDataURL('image/png', 1.0));
            setIsPreviewOpen(true);
        } catch (error) {
            console.error('Share card generation error', error);
            setShareFeedback('No se pudo generar la tarjeta.');
        } finally {
            setLoading(false);
        }
    };

    const downloadPreview = () => {
        if (!previewImage) return;
        const fileSlug = `${entity.type}-${entity.id || 'card'}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const anchor = document.createElement('a');
        anchor.href = previewImage;
        anchor.download = `listopic-card-${fileSlug || 'share'}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const dataUrlToFile = async (dataUrl: string, filename: string) => {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        return new File([blob], filename, { type: 'image/png' });
    };

    const sharePreview = async () => {
        if (!previewImage) return;
        const fileSlug = `${entity.type}-${entity.id || 'card'}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const fileName = `listopic-card-${fileSlug || 'share'}.png`;

        try {
            const file = await dataUrlToFile(previewImage, fileName);
            const canShareFiles = typeof navigator !== 'undefined'
                && typeof navigator.canShare === 'function'
                && navigator.canShare({ files: [file] });

            if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && canShareFiles) {
                await navigator.share({
                    files: [file],
                    title: titleText,
                    text: subtitleText || 'Compartido desde Listopic',
                });
                setShareFeedback('Tarjeta compartida');
                return;
            }

            const fallbackUrl = entity.url || (typeof window !== 'undefined' ? window.location.href : '');
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(fallbackUrl);
                setShareFeedback('Tu dispositivo no soporta compartir imagen. Copiamos el enlace.');
                return;
            }

            setShareFeedback('No se pudo compartir la tarjeta ahora mismo.');
        } catch {
            setShareFeedback('No se pudo compartir la tarjeta ahora mismo.');
        }
    };

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    left: '-9999px',
                    top: 0,
                    width: `${EXPORT_WIDTH}px`,
                    height: `${EXPORT_HEIGHT}px`,
                    zIndex: -1,
                }}
            >
                <div
                    ref={captureRef}
                    style={{
                        width: `${EXPORT_WIDTH}px`,
                        height: `${EXPORT_HEIGHT}px`,
                        position: 'relative',
                        background: 'transparent',
                        fontFamily: "'Manrope', sans-serif",
                        padding: '36px',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            borderRadius: '58px',
                            overflow: 'hidden',
                            background: theme.cardBg,
                            border: `1px solid ${theme.border}`,
                            boxShadow: theme.shadow,
                            display: 'grid',
                            gridTemplateRows: 'minmax(0, 1fr) auto',
                        }}
                    >
                        <div style={{ position: 'relative', minHeight: 0 }}>
                            {heroImage ? (
                                <img
                                    src={heroImage}
                                    alt={titleText}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: theme.heroFallback }} />
                            )}

                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'linear-gradient(180deg, rgba(2,6,23,0.16) 0%, rgba(2,6,23,0.3) 32%, rgba(2,6,23,0.78) 100%)',
                                }}
                            />
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '-90px',
                                    right: '-60px',
                                    width: '320px',
                                    height: '320px',
                                    borderRadius: '9999px',
                                    background: `radial-gradient(circle, ${theme.accentSoft} 0%, transparent 72%)`,
                                }}
                            />
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: '-110px',
                                    left: '-70px',
                                    width: '360px',
                                    height: '360px',
                                    borderRadius: '9999px',
                                    background: `radial-gradient(circle, ${theme.accentSoft} 0%, transparent 72%)`,
                                }}
                            />
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '30px',
                                    left: '30px',
                                    right: '30px',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: '16px',
                                }}
                            >
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxWidth: '72%' }}>
                                    {infoChips.map((chip) => (
                                        <div
                                            key={chip}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                padding: '10px 16px',
                                                borderRadius: '999px',
                                                background: theme.badgeBg,
                                                color: theme.badgeText,
                                                border: `1px solid ${theme.border}`,
                                                fontWeight: 800,
                                                fontSize: '18px',
                                            }}
                                        >
                                            {chip}
                                        </div>
                                    ))}
                                </div>

                                {hasScore && (
                                    <div
                                        style={{
                                            width: '124px',
                                            height: '124px',
                                            borderRadius: '9999px',
                                            border: `4px solid ${scoreColor}`,
                                            background: 'rgba(2,6,23,0.82)',
                                            display: 'grid',
                                            placeItems: 'center',
                                            boxShadow: `0 0 28px ${scoreColor}55`,
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                textAlign: 'center',
                                                transform: 'translateY(-1px)',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    color: '#ffffff',
                                                    fontWeight: 900,
                                                    fontSize: '44px',
                                                    lineHeight: 1,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}
                                            >
                                                {formatScore(score)}
                                            </span>
                                            <span
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    color: '#dbeafe',
                                                    fontWeight: 800,
                                                    fontSize: '12px',
                                                    letterSpacing: '0.18em',
                                                    lineHeight: 1,
                                                    marginTop: '6px',
                                                }}
                                            >
                                                {scoreLabel}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {hasRadar && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        right: '30px',
                                        bottom: '32px',
                                        width: '328px',
                                        padding: '18px 18px 16px',
                                        borderRadius: '28px',
                                        background: theme.panelBg,
                                        border: `1px solid ${theme.border}`,
                                        boxShadow: '0 24px 48px rgba(2,6,23,0.24)',
                                    }}
                                >
                                    <div style={{ color: theme.textPrimary, fontSize: '16px', fontWeight: 800, letterSpacing: '0.03em' }}>
                                        {chartHeading}
                                    </div>
                                    <div style={{ color: theme.textMuted, fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                                        Vista r\u00e1pida de los criterios destacados
                                    </div>
                                    <div style={{ marginTop: '14px' }}>
                                        <RadarChart
                                            stats={radarStats}
                                            accent={theme.accent}
                                            gridColor={theme.border}
                                            textColor={theme.textSecondary}
                                        />
                                    </div>
                                </div>
                            )}

                            <div
                                style={{
                                    position: 'absolute',
                                    left: '32px',
                                    bottom: '34px',
                                    maxWidth: heroTextMaxWidth,
                                    color: '#f8fafc',
                                    textShadow: '0 10px 24px rgba(2, 6, 23, 0.44)',
                                }}
                            >
                                <h1
                                    style={{
                                        margin: 0,
                                        fontSize: titleFontSize,
                                        lineHeight: 0.98,
                                        letterSpacing: '-0.03em',
                                        fontWeight: 900,
                                        wordBreak: 'break-word',
                                    }}
                                >
                                    {titleText}
                                </h1>

                                {subtitleText && (
                                    <p
                                        style={{
                                            margin: '14px 0 0',
                                            color: 'rgba(255,255,255,0.88)',
                                            fontWeight: 700,
                                            fontSize: '28px',
                                            lineHeight: 1.2,
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {subtitleText}
                                    </p>
                                )}

                                {isReviewShare && (
                                    <div
                                        style={{
                                            marginTop: '26px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            padding: '16px 20px',
                                            borderRadius: '28px',
                                            background: 'rgba(7, 18, 37, 0.44)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            boxShadow: '0 18px 30px rgba(2,6,23,0.24)',
                                            maxWidth: '100%',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '74px',
                                                height: '74px',
                                                borderRadius: '9999px',
                                                overflow: 'hidden',
                                                border: '2px solid rgba(255,255,255,0.2)',
                                                background: 'rgba(255,255,255,0.08)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 900,
                                                fontSize: '28px',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {avatarImage ? (
                                                <img
                                                    src={avatarImage}
                                                    alt={authorLabel}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                (authorLabel || 'L').slice(0, 1).toUpperCase()
                                            )}
                                        </div>

                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.68)' }}>
                                                RESE\u00d1A DE
                                            </div>
                                            <div
                                                style={{
                                                    marginTop: '6px',
                                                    fontSize: authorNameSize,
                                                    fontWeight: 900,
                                                    lineHeight: 0.98,
                                                    wordBreak: 'break-word',
                                                }}
                                            >
                                                {authorLabel}
                                            </div>
                                            <div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 700, color: 'rgba(255,255,255,0.74)' }}>
                                                {createdAtLabel ? `Publicada el ${createdAtLabel}` : 'Compartida desde Listopic'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div
                            style={{
                                background: theme.footerBg,
                                borderTop: `1px solid ${theme.border}`,
                                padding: '28px 32px 34px',
                                display: 'grid',
                                gridTemplateColumns: summaryStats.length > 0 ? 'minmax(0, 1.1fr) minmax(0, 0.9fr)' : '1fr',
                                gap: '20px',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                                <p
                                    style={{
                                        margin: 0,
                                        color: theme.textSecondary,
                                        fontWeight: 600,
                                        fontSize: '22px',
                                        lineHeight: 1.45,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 4,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {footerDescription}
                                </p>

                                {tagList.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {tagList.map((tag) => (
                                            <div
                                                key={tag}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '999px',
                                                    background: theme.chipBg,
                                                    border: `1px solid ${theme.chipBorder}`,
                                                    color: theme.textPrimary,
                                                    fontSize: '15px',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                #{truncateLabel(tag, 20)}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!isReviewShare && (entity.authorName || avatarImage) && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                        <div
                                            style={{
                                                width: '52px',
                                                height: '52px',
                                                borderRadius: '9999px',
                                                overflow: 'hidden',
                                                background: theme.accentSoft,
                                                border: `1px solid ${theme.border}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: theme.textPrimary,
                                                fontWeight: 900,
                                                fontSize: '20px',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {avatarImage ? (
                                                <img
                                                    src={avatarImage}
                                                    alt={authorLabel}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                (authorLabel || 'L').slice(0, 1).toUpperCase()
                                            )}
                                        </div>

                                        <div style={{ minWidth: 0 }}>
                                            <div
                                                style={{
                                                    color: theme.textPrimary,
                                                    fontSize: '20px',
                                                    fontWeight: 800,
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                {authorLabel}
                                            </div>
                                            <div style={{ color: theme.textMuted, fontSize: '15px', fontWeight: 700 }}>
                                                Compartido desde Listopic
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {summaryStats.length > 0 && (
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                        gap: '10px',
                                        alignContent: 'start',
                                    }}
                                >
                                    {summaryStats.map((stat) => (
                                        <div
                                            key={stat.key}
                                            style={{
                                                padding: '14px 14px 12px',
                                                borderRadius: '22px',
                                                background: theme.chipBg,
                                                border: `1px solid ${theme.chipBorder}`,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                                                <span
                                                    style={{
                                                        color: theme.textPrimary,
                                                        fontSize: '14px',
                                                        fontWeight: 800,
                                                        lineHeight: 1.15,
                                                    }}
                                                >
                                                    {truncateLabel(stat.label, 16)}
                                                </span>
                                                <span
                                                    style={{
                                                        color: theme.textPrimary,
                                                        fontSize: '20px',
                                                        fontWeight: 900,
                                                        flexShrink: 0,
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}
                                                >
                                                    {formatScore(stat.score)}
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    marginTop: '12px',
                                                    height: '8px',
                                                    borderRadius: '999px',
                                                    background: 'rgba(148,163,184,0.18)',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        width: `${clampScore(stat.score) * 10}%`,
                                                        borderRadius: '999px',
                                                        background: theme.accent,
                                                    }}
                                                />
                                            </div>
                                            {typeof stat.count === 'number' && stat.count > 0 && (
                                                <div style={{ marginTop: '8px', color: theme.textMuted, fontSize: '12px', fontWeight: 700 }}>
                                                    {stat.count} voto{stat.count === 1 ? '' : 's'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div
                                style={{
                                    gridColumn: '1 / -1',
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    justifyContent: 'space-between',
                                    gap: '18px',
                                    paddingTop: '4px',
                                }}
                            >
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {footerFacts.map((fact) => (
                                        <div
                                            key={fact}
                                            style={{
                                                padding: '8px 12px',
                                                borderRadius: '999px',
                                                background: theme.chipBg,
                                                border: `1px solid ${theme.chipBorder}`,
                                                color: theme.textMuted,
                                                fontSize: '14px',
                                                fontWeight: 800,
                                            }}
                                        >
                                            {fact}
                                        </div>
                                    ))}
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ color: theme.textPrimary, fontSize: '22px', fontWeight: 900, letterSpacing: '-0.03em' }}>
                                        Listopic
                                    </div>
                                    <div style={{ color: theme.textMuted, fontSize: '13px', fontWeight: 700, marginTop: '4px', letterSpacing: '0.06em' }}>
                                        listopic.app
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isPreviewOpen && previewImage && (
                <div
                    className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
                    onClick={() => setIsPreviewOpen(false)}
                >
                    <div
                        className="bg-[#151b2e] rounded-2xl w-full max-w-md border border-white/10 overflow-hidden shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="p-4 border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-white font-bold">Previsualizaci\u00f3n</h3>
                            <button onClick={() => setIsPreviewOpen(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="rounded-xl overflow-hidden border border-white/10 bg-black aspect-[3/4] shadow-lg">
                                <img src={previewImage} alt="Card preview" className="w-full h-full object-contain" />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={downloadPreview}
                                    className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Descargar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void sharePreview()}
                                    className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold hover:bg-emerald-500/30 transition-colors"
                                >
                                    <Share2 className="w-4 h-4" /> Compartir
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsPreviewOpen(false)}
                                    className="py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-colors"
                                >
                                    Cerrar
                                </button>
                            </div>

                            {shareFeedback && (
                                <div className="text-xs rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-gray-300 flex items-center gap-2">
                                    {shareFeedback.includes('Copiamos') ? <Copy className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                                    <span>{shareFeedback}</span>
                                </div>
                            )}

                            <p className="text-xs text-gray-400 text-center">
                                PNG sin fondo para pegar en stories y elegir el fondo dentro de Instagram.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white/10 p-4 rounded-2xl animate-spin border-t-2 border-indigo-500 w-12 h-12"></div>
                </div>
            )}
        </>
    );
};
