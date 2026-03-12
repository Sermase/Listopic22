import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { type ReviewEntity } from '../hooks/useListDetails';
import { getShareEntityLabel, type ShareCriteriaStat, type ShareEntityPayload, type ShareEntityType } from '../types/share';
import { useAppConfig } from '../context/AppConfigContext';
import { db } from '../firebase';
import { buildCriteriaStats } from '../utils/shareCriteria';

export type ShareCardVariant = 'cinematic' | 'clean' | 'punchy' | 'spotify';

interface ShareCardProps {
    place?: PlaceDetails;
    review?: ReviewEntity;
    shareEntity?: ShareEntityPayload;
    variant?: ShareCardVariant;
    triggerRef: React.MutableRefObject<() => void>;
    onRequestClose?: () => void;
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
    referenceStroke: string;
    referenceFill: string;
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
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
        shadow: '0 34px 90px rgba(2, 6, 23, 0.38)',
    },
    clean: {
        cardBg: '#f6f1e8',
        footerBg: 'rgba(247, 242, 234, 0.98)',
        heroFallback: 'linear-gradient(145deg, #efe7d8 0%, #e5dcc8 55%, #f7f3eb 100%)',
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#6b7280',
        accent: '#4f46e5',
        accentSoft: 'rgba(79,70,229,0.16)',
        border: 'rgba(51,65,85,0.14)',
        badgeBg: 'rgba(249, 246, 240, 0.9)',
        badgeText: '#312e81',
        panelBg: 'rgba(248, 244, 237, 0.92)',
        chipBg: 'rgba(79,70,229,0.06)',
        chipBorder: 'rgba(79,70,229,0.12)',
        referenceStroke: 'rgba(51,65,85,0.52)',
        referenceFill: 'rgba(51,65,85,0.06)',
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
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
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
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
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
const LANDSCAPE_EXPORT_WIDTH = 1600;
const LANDSCAPE_EXPORT_HEIGHT = 1200;
const LANDSCAPE_SWITCH_RATIO = 1.08;

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

const getCoverBackground = (src: string, position = 'center center'): React.CSSProperties => ({
    backgroundImage: `url(${JSON.stringify(src)})`,
    backgroundSize: 'cover',
    backgroundPosition: position,
    backgroundRepeat: 'no-repeat',
});

const loadImageDimensions = (source?: string): Promise<{ width: number; height: number }> => {
    if (!source) {
        return Promise.resolve({ width: 0, height: 0 });
    }

    return new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve({
            width: image.naturalWidth || 0,
            height: image.naturalHeight || 0,
        });
        image.onerror = () => resolve({ width: 0, height: 0 });
        image.src = source;
    });
};

const RadarChart: React.FC<{
    stats: ShareCriteriaStat[];
    referenceStats?: ShareCriteriaStat[];
    accent: string;
    gridColor: string;
    referenceStroke: string;
    referenceFill: string;
    maxSize?: number;
}> = ({
    stats,
    referenceStats,
    accent,
    gridColor,
    referenceStroke,
    referenceFill,
    maxSize = 320,
}) => {
    if (stats.length < 3) return null;
    const size = 320;
    const center = 160;
    const radius = 124;
    const levels = [0.25, 0.5, 0.75, 1];
    const angleStep = (Math.PI * 2) / stats.length;

    const getPoint = (angle: number, currentRadius: number) => ({
        x: center + Math.cos(angle) * currentRadius,
        y: center + Math.sin(angle) * currentRadius,
    });

    const axes = stats.map((stat, index) => {
        const angle = (-Math.PI / 2) + (index * angleStep);
        const axisPoint = getPoint(angle, radius);

        return {
            angle,
            axisPoint,
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

    const alignedReference = referenceStats
        ?.map((reference) => {
            const axis = stats.find((stat) => stat.key === reference.key);
            return axis ? reference : null;
        })
        .filter((reference): reference is ShareCriteriaStat => Boolean(reference));

    const dataPolygon = axes
        .map(({ angle }, index) => {
            const point = getPoint(angle, radius * (clampScore(stats[index].score) / 10));
            return `${point.x},${point.y}`;
        })
        .join(' ');

    const referencePolygon = axes
        .map(({ angle }, index) => {
            const match = alignedReference?.find((reference) => reference.key === stats[index].key);
            const point = getPoint(angle, radius * (clampScore(match?.score || 0) / 10));
            return `${point.x},${point.y}`;
        })
        .join(' ');

    return (
        <div style={{ width: '100%', maxWidth: `${maxSize}px`, aspectRatio: '1 / 1', margin: '0 auto' }}>
            <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%', display: 'block' }}>
                {gridPolygons.map((polygon, index) => (
                    <polygon
                        key={`grid-${levels[index]}`}
                        points={polygon}
                        fill="none"
                        stroke={gridColor}
                        strokeWidth={index === gridPolygons.length - 1 ? 1.5 : 1}
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

                {alignedReference && alignedReference.length > 0 && (
                    <>
                        <polygon
                            points={referencePolygon}
                            fill={referenceFill}
                            stroke={referenceStroke}
                            strokeWidth="2"
                            strokeDasharray="6 5"
                        />
                        {axes.map(({ angle }, index) => {
                            const match = alignedReference.find((reference) => reference.key === stats[index].key);
                            const point = getPoint(angle, radius * (clampScore(match?.score || 0) / 10));
                            return (
                                <circle
                                    key={`reference-dot-${stats[index].key}`}
                                    cx={point.x}
                                    cy={point.y}
                                    r="3.5"
                                    fill={referenceStroke}
                                />
                            );
                        })}
                    </>
                )}

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
            </svg>
        </div>
    );
};

export const ShareCard: React.FC<ShareCardProps> = ({
    place,
    review,
    shareEntity,
    variant = 'cinematic',
    triggerRef,
    onRequestClose,
}) => {
    const config = useAppConfig();
    const captureRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [shareFeedback, setShareFeedback] = useState<string | null>(null);
    const [localImages, setLocalImages] = useState<{ hero: string; avatar: string }>({ hero: '', avatar: '' });
    const [referenceCriteriaStats, setReferenceCriteriaStats] = useState<ShareCriteriaStat[]>([]);
    const [referenceLabel, setReferenceLabel] = useState<string>('');
    const [heroSize, setHeroSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const CARD_GENERATION_TIMEOUT_MS = 20000;

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
                .slice(0, 8);
        }

        return buildCriteriaStats(review?.scores, review?.criteriaDefinition);
    }, [entity.criteriaStats, review]);

    useEffect(() => {
        const source = review?.photoUrl || place?.photoUrl || entity.imageUrl;
        if (!source) {
            setHeroSize({ width: 0, height: 0 });
            return;
        }

        let cancelled = false;
        void loadImageDimensions(source).then((dimensions) => {
            if (!cancelled) {
                setHeroSize(dimensions);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [entity.imageUrl, place?.photoUrl, review?.photoUrl]);

    useEffect(() => {
        if (entity.referenceCriteriaStats?.length) {
            setReferenceCriteriaStats(entity.referenceCriteriaStats);
            setReferenceLabel(entity.referenceLabel || 'Media de la lista');
            return;
        }

        if (entity.type !== 'review' || !review?.listId) {
            setReferenceCriteriaStats([]);
            setReferenceLabel('');
            return;
        }

        let isCancelled = false;

        const loadReferenceStats = async () => {
            try {
                const listSnap = await getDoc(doc(db, 'lists', review.listId));
                if (!listSnap.exists() || isCancelled) return;

                const listData = listSnap.data() as {
                    name?: string;
                    criteriaAverages?: Record<string, number>;
                    criteriaDefinition?: Record<string, { label?: string }> | Array<{ id?: string; label?: string }>;
                };

                const stats = buildCriteriaStats(listData.criteriaAverages, listData.criteriaDefinition);
                if (!isCancelled) {
                    setReferenceCriteriaStats(stats);
                    setReferenceLabel(listData.name || 'Media de la lista');
                }
            } catch {
                if (!isCancelled) {
                    setReferenceCriteriaStats([]);
                    setReferenceLabel('');
                }
            }
        };

        void loadReferenceStats();

        return () => {
            isCancelled = true;
        };
    }, [entity.referenceCriteriaStats, entity.referenceLabel, entity.type, review?.listId]);

    const radarStats = criteriaStats.slice(0, 8);
    const summaryStats = criteriaStats.slice(0, 4);
    const hasRadar = radarStats.length >= 3;
    const hasFooterInsights = hasRadar || summaryStats.length > 0;
    const isReviewShare = entity.type === 'review' || Boolean(review);
    const heroAspectRatio = heroSize.width > 0 && heroSize.height > 0 ? heroSize.width / heroSize.height : 0;
    const isLandscapeCard = heroAspectRatio >= LANDSCAPE_SWITCH_RATIO;
    const exportWidth = isLandscapeCard ? LANDSCAPE_EXPORT_WIDTH : EXPORT_WIDTH;
    const exportHeight = isLandscapeCard ? LANDSCAPE_EXPORT_HEIGHT : EXPORT_HEIGHT;
    const previewAspectRatio = isLandscapeCard ? '4 / 3' : '3 / 4';
    const reviewCountLabel = formatReviewCount(entity.reviewCount);
    const entityLabel = getShareEntityLabel(entity.type);
    const scoreLabel = getScoreLabel(entity.type);
    const tagList = normalizeTags(entity.tags || review?.userTags || review?.tags);
    const brandName = config.appName || 'Listopic';
    const radarPanelSize = isLandscapeCard ? 286 : 238;
    const titleFontSize = isLandscapeCard
        ? (titleText.length > 54 ? '58px' : titleText.length > 38 ? '70px' : '84px')
        : (titleText.length > 54 ? '52px' : titleText.length > 38 ? '62px' : '74px');
    const authorNameSize = titleText.length > 44 ? '32px' : '38px';
    const heroTextMaxWidth = isLandscapeCard ? '72%' : '80%';
    const alignedReferenceStats = radarStats
        .map((stat) => {
            const match = referenceCriteriaStats.find((reference) => reference.key === stat.key);
            return match ? { ...match, label: stat.label } : null;
        })
        .filter((stat): stat is ShareCriteriaStat => Boolean(stat));
    const referenceSummaryStats = summaryStats
        .map((stat) => {
            const match = referenceCriteriaStats.find((reference) => reference.key === stat.key);
            return match ? { ...match, label: stat.label } : null;
        })
        .filter((stat): stat is ShareCriteriaStat => Boolean(stat));

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
        iframe.style.width = `${exportWidth}px`;
        iframe.style.height = `${exportHeight}px`;
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
                width: exportWidth,
                height: exportHeight,
                windowWidth: exportWidth,
                windowHeight: exportHeight,
            });
        } finally {
            iframe.remove();
        }
    };

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
            return await Promise.race([
                promise,
                new Promise<T>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
                }),
            ]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    };

    triggerRef.current = async () => {
        if (!captureRef.current || loading) return;

        setLoading(true);
        setShareFeedback(null);

        try {
            clearBlobUrl(localImages.hero);
            clearBlobUrl(localImages.avatar);

            const [heroBlob, avatarBlob] = await withTimeout(
                Promise.all([
                    loadAsBlobUrl(review?.photoUrl || place?.photoUrl || entity.imageUrl),
                    loadAsBlobUrl(review?.authorPhoto || entity.authorPhoto || (entity.type === 'profile' ? entity.imageUrl : undefined)),
                ]),
                CARD_GENERATION_TIMEOUT_MS,
                'Tiempo de espera agotado al preparar las imagenes.',
            );

            setLocalImages({ hero: heroBlob, avatar: avatarBlob });
            const nextHeroSource = heroBlob || review?.photoUrl || place?.photoUrl || entity.imageUrl;
            if (nextHeroSource) {
                const measuredHeroSize = await withTimeout(
                    loadImageDimensions(nextHeroSource),
                    CARD_GENERATION_TIMEOUT_MS,
                    'Tiempo de espera agotado al medir la imagen.',
                );
                if (measuredHeroSize.width > 0 && measuredHeroSize.height > 0) {
                    setHeroSize(measuredHeroSize);
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (!captureRef.current) return;

            const canvas = await withTimeout(
                renderIsolatedCanvas(captureRef.current),
                CARD_GENERATION_TIMEOUT_MS,
                'Tiempo de espera agotado al generar la tarjeta.',
            );

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
                    width: `${exportWidth}px`,
                    height: `${exportHeight}px`,
                    zIndex: -1,
                }}
            >
                <div
                    ref={captureRef}
                    style={{
                        width: `${exportWidth}px`,
                        height: `${exportHeight}px`,
                        position: 'relative',
                        background: 'transparent',
                        fontFamily: "'Manrope', sans-serif",
                        padding: isLandscapeCard ? '28px' : '36px',
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
                                <div
                                    role="img"
                                    aria-label={titleText}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        ...getCoverBackground(heroImage),
                                    }}
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
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxWidth: isLandscapeCard ? '78%' : '72%' }}>
                                    {infoChips.map((chip) => (
                                        <div
                                            key={chip}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                height: '48px',
                                                padding: '0 18px',
                                                borderRadius: '999px',
                                                background: theme.badgeBg,
                                                color: theme.badgeText,
                                                border: `1px solid ${theme.border}`,
                                                fontWeight: 800,
                                                fontSize: '18px',
                                                lineHeight: 1.05,
                                                textAlign: 'center',
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
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
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
                                                gap: '2px',
                                                transform: 'translateY(-2px)',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    color: '#ffffff',
                                                    fontWeight: 900,
                                                    fontSize: '44px',
                                                    lineHeight: 0.9,
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
                                                }}
                                            >
                                                {scoreLabel}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

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
                                            gap: '14px',
                                            padding: '15px 18px',
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
                                                <div
                                                    role="img"
                                                    aria-label={authorLabel}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        ...getCoverBackground(avatarImage),
                                                    }}
                                                />
                                            ) : (
                                                (authorLabel || 'L').slice(0, 1).toUpperCase()
                                            )}
                                        </div>

                                        <div
                                            style={{
                                                minWidth: 0,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                textAlign: 'center',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: authorNameSize,
                                                    fontWeight: 900,
                                                    lineHeight: 1,
                                                    wordBreak: 'break-word',
                                                }}
                                            >
                                                {authorLabel}
                                            </div>
                                            <div style={{ marginTop: '6px', fontSize: '17px', fontWeight: 700, color: 'rgba(255,255,255,0.74)', lineHeight: 1.1 }}>
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
                                padding: isLandscapeCard ? '22px 28px 26px' : '22px 26px 28px',
                                display: 'grid',
                                gridTemplateColumns: hasFooterInsights
                                    ? (isLandscapeCard ? 'minmax(0, 1.62fr) minmax(300px, 0.46fr)' : 'minmax(0, 1.38fr) minmax(252px, 0.58fr)')
                                    : '1fr',
                                gap: isLandscapeCard ? '16px' : '14px',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                                <p
                                    style={{
                                        margin: 0,
                                        color: theme.textSecondary,
                                        fontWeight: 600,
                                        fontSize: '22px',
                                        lineHeight: 1.48,
                                        display: '-webkit-box',
                                        WebkitLineClamp: isLandscapeCard ? 5 : 6,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        paddingBottom: '8px',
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
                                                    padding: '0 12px',
                                                    borderRadius: '999px',
                                                    background: theme.chipBg,
                                                    border: `1px solid ${theme.chipBorder}`,
                                                    color: theme.textPrimary,
                                                    fontSize: '15px',
                                                    fontWeight: 700,
                                                    lineHeight: 1.05,
                                                    height: '38px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
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
                                                <div
                                                    role="img"
                                                    aria-label={authorLabel}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        ...getCoverBackground(avatarImage),
                                                    }}
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

                            {hasRadar ? (
                                <div
                                    style={{
                                        padding: isLandscapeCard ? '10px 10px' : '10px',
                                        borderRadius: '24px',
                                        background: theme.panelBg,
                                        border: `1px solid ${theme.border}`,
                                        boxShadow: '0 14px 28px rgba(2,6,23,0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        alignSelf: 'start',
                                    }}
                                    aria-label={alignedReferenceStats.length > 0 ? `${referenceLabel || 'Media de la lista'} comparada con la ${'rese\u00f1a'}` : 'Resumen de criterios'}
                                >
                                    <RadarChart
                                        stats={radarStats}
                                        referenceStats={alignedReferenceStats}
                                        accent={theme.accent}
                                        gridColor={theme.border}
                                        referenceStroke={theme.referenceStroke}
                                        referenceFill={theme.referenceFill}
                                        maxSize={radarPanelSize}
                                    />
                                </div>
                            ) : summaryStats.length > 0 ? (
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
                                                minHeight: '112px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
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
                                                    position: 'relative',
                                                }}
                                            >
                                                {referenceSummaryStats.find((reference) => reference.key === stat.key) && (
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            bottom: 0,
                                                            left: `${clampScore(referenceSummaryStats.find((reference) => reference.key === stat.key)?.score || 0) * 10}%`,
                                                            width: '3px',
                                                            marginLeft: '-1px',
                                                            background: theme.referenceStroke,
                                                            boxShadow: `0 0 5px ${theme.referenceStroke}`,
                                                            zIndex: 2,
                                                        }}
                                                    />
                                                )}
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
                            ) : null}

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
                                                padding: '0 12px',
                                                borderRadius: '999px',
                                                background: theme.chipBg,
                                                border: `1px solid ${theme.chipBorder}`,
                                                color: theme.textMuted,
                                                fontSize: '14px',
                                                fontWeight: 800,
                                                lineHeight: 1.05,
                                                height: '38px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            {fact}
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'right', flexShrink: 0 }}>
                                    {config.logoType === 'image' && config.logoUrl ? (
                                        <img
                                            src={config.logoUrl}
                                            alt={brandName}
                                            style={{ width: '42px', height: '42px', objectFit: 'contain', flexShrink: 0 }}
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                position: 'relative',
                                                width: '42px',
                                                height: '42px',
                                                borderRadius: '14px',
                                                background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 52%, #4f46e5 100%)',
                                                boxShadow: '0 12px 26px rgba(37,99,235,0.28)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <div style={{ width: '16px', height: '16px', borderRadius: '999px', background: '#ffffff' }} />
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ color: theme.textPrimary, fontSize: '22px', fontWeight: 900, letterSpacing: '-0.03em' }}>
                                            {brandName}
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
            </div>

            {isPreviewOpen && previewImage && (
                <div
                    className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
                    onClick={() => setIsPreviewOpen(false)}
                >
                    <div
                        className="bg-[#151b2e] rounded-2xl w-full border border-white/10 overflow-hidden shadow-2xl"
                        style={{ maxWidth: isLandscapeCard ? '960px' : '430px' }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="p-4 border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-white font-bold">{'Previsualizaci\u00f3n'}</h3>
                            <button onClick={() => setIsPreviewOpen(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div
                                className="rounded-xl overflow-hidden border border-white/10 bg-black shadow-lg"
                                style={{ aspectRatio: previewAspectRatio }}
                            >
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
                                PNG listo para reutilizar en stories, posts o envíos directos.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#151b2e] p-5 shadow-2xl text-center">
                        <div className="mx-auto h-12 w-12 rounded-2xl animate-spin border-t-2 border-indigo-500 bg-white/5"></div>
                        <div className="mt-4 text-sm font-bold text-white">
                            Generando tarjeta
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
                            Si tarda demasiado, puedes cerrar y volver a intentarlo.
                        </div>
                        <button
                            type="button"
                            onClick={() => onRequestClose?.()}
                            className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
