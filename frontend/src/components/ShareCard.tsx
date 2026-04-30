import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { type ReviewEntity } from '../hooks/useListDetails';
import { getShareEntityLabel, type ShareCriteriaStat, type ShareEntityPayload, type ShareEntityType } from '../types/share';
import { useAppConfig } from '../context/AppConfigContext';
import { db } from '../firebase';
import { buildCriteriaStats } from '../utils/shareCriteria';
import { buildPublicRouteUrl, buildPublicUrl, PUBLIC_ORIGIN } from '../utils/publicUrl';

export type ShareCardVariant = 'story' | 'post' | 'editorial' | 'clean' | 'neon' | 'signal' | 'aura' | 'metro';

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
    // Full-bleed story: image fills the whole card, all info floats on top
    story: {
        cardBg: '#0a0e1a',
        footerBg: 'rgba(10,14,26,0.96)',
        heroFallback: 'linear-gradient(145deg, #0b1730 0%, #0f2040 56%, #060e1c 100%)',
        textPrimary: '#ffffff',
        textSecondary: 'rgba(255,255,255,0.85)',
        textMuted: 'rgba(255,255,255,0.55)',
        accent: '#60a5fa',
        accentSoft: 'rgba(96,165,250,0.22)',
        border: 'rgba(255,255,255,0.14)',
        badgeBg: 'rgba(0,0,0,0.52)',
        badgeText: '#ffffff',
        panelBg: 'rgba(0,0,0,0.50)',
        chipBg: 'rgba(255,255,255,0.12)',
        chipBorder: 'rgba(255,255,255,0.16)',
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
        shadow: '0 40px 100px rgba(0,0,0,0.60)',
    },
    // Magazine post: image top 62%, dark panel with big typographic score
    post: {
        cardBg: '#0d1220',
        footerBg: '#0d1220',
        heroFallback: 'linear-gradient(145deg, #0d1830 0%, #18305a 52%, #0a1020 100%)',
        textPrimary: '#f8fafc',
        textSecondary: '#cbd5e1',
        textMuted: '#64748b',
        accent: '#f97316',
        accentSoft: 'rgba(249,115,22,0.18)',
        border: 'rgba(255,255,255,0.07)',
        badgeBg: 'rgba(0,0,0,0.58)',
        badgeText: '#ffffff',
        panelBg: 'rgba(13,18,32,0.94)',
        chipBg: 'rgba(249,115,22,0.10)',
        chipBorder: 'rgba(249,115,22,0.18)',
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
        shadow: '0 40px 100px rgba(0,0,0,0.55)',
    },
    // Editorial split: image left column, dark panel right with dominant score
    editorial: {
        cardBg: '#0f0f1a',
        footerBg: '#0f0f1a',
        heroFallback: 'linear-gradient(145deg, #1a1030 0%, #2a1858 52%, #0f0f1a 100%)',
        textPrimary: '#ffffff',
        textSecondary: 'rgba(255,255,255,0.82)',
        textMuted: 'rgba(255,255,255,0.50)',
        accent: '#a78bfa',
        accentSoft: 'rgba(167,139,250,0.18)',
        border: 'rgba(255,255,255,0.10)',
        badgeBg: 'rgba(0,0,0,0.48)',
        badgeText: 'rgba(255,255,255,0.92)',
        panelBg: 'rgba(20,12,42,0.97)',
        chipBg: 'rgba(167,139,250,0.12)',
        chipBorder: 'rgba(167,139,250,0.18)',
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
        shadow: '0 40px 100px rgba(0,0,0,0.58)',
    },
    // Polaroid: white card, image top 70%, clean info strip below
    clean: {
        cardBg: '#ffffff',
        footerBg: '#ffffff',
        heroFallback: 'linear-gradient(145deg, #e8e2d8 0%, #d8d0c4 55%, #f0ece4 100%)',
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#94a3b8',
        accent: '#0f172a',
        accentSoft: 'rgba(15,23,42,0.08)',
        border: 'rgba(15,23,42,0.08)',
        badgeBg: 'rgba(255,255,255,0.90)',
        badgeText: '#0f172a',
        panelBg: 'rgba(248,248,252,0.95)',
        chipBg: 'rgba(15,23,42,0.06)',
        chipBorder: 'rgba(15,23,42,0.10)',
        referenceStroke: 'rgba(15,23,42,0.50)',
        referenceFill: 'rgba(15,23,42,0.05)',
        shadow: '0 30px 80px rgba(15,23,42,0.20)',
    },
    neon: {
        cardBg: '#050816',
        footerBg: '#050816',
        heroFallback: 'radial-gradient(circle at 25% 20%, #22d3ee 0%, transparent 34%), radial-gradient(circle at 80% 70%, #ec4899 0%, transparent 36%), linear-gradient(145deg, #050816 0%, #111827 100%)',
        textPrimary: '#ffffff',
        textSecondary: 'rgba(255,255,255,0.84)',
        textMuted: 'rgba(255,255,255,0.54)',
        accent: '#22d3ee',
        accentSoft: 'rgba(34,211,238,0.16)',
        border: 'rgba(255,255,255,0.14)',
        badgeBg: 'rgba(5,8,22,0.68)',
        badgeText: '#ffffff',
        panelBg: 'rgba(5,8,22,0.74)',
        chipBg: 'rgba(255,255,255,0.12)',
        chipBorder: 'rgba(255,255,255,0.18)',
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
        shadow: '0 46px 120px rgba(5,8,22,0.72)',
    },
    signal: {
        cardBg: '#f8fafc',
        footerBg: '#f8fafc',
        heroFallback: 'linear-gradient(145deg, #dbeafe 0%, #e0f2fe 46%, #f8fafc 100%)',
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#64748b',
        accent: '#0f766e',
        accentSoft: 'rgba(15,118,110,0.10)',
        border: 'rgba(15,23,42,0.10)',
        badgeBg: 'rgba(255,255,255,0.92)',
        badgeText: '#0f172a',
        panelBg: 'rgba(255,255,255,0.94)',
        chipBg: 'rgba(15,118,110,0.08)',
        chipBorder: 'rgba(15,118,110,0.16)',
        referenceStroke: 'rgba(15,23,42,0.50)',
        referenceFill: 'rgba(15,23,42,0.05)',
        shadow: '0 30px 80px rgba(15,23,42,0.20)',
    },
    aura: {
        cardBg: '#07070a',
        footerBg: '#07070a',
        heroFallback: 'radial-gradient(circle at 20% 16%, #f0abfc 0%, transparent 30%), radial-gradient(circle at 80% 30%, #67e8f9 0%, transparent 32%), linear-gradient(160deg, #07070a 0%, #15131f 100%)',
        textPrimary: '#fbfbfb',
        textSecondary: 'rgba(255,255,255,0.78)',
        textMuted: 'rgba(255,255,255,0.48)',
        accent: '#f0abfc',
        accentSoft: 'rgba(240,171,252,0.16)',
        border: 'rgba(255,255,255,0.14)',
        badgeBg: 'rgba(255,255,255,0.10)',
        badgeText: '#ffffff',
        panelBg: 'rgba(7,7,10,0.78)',
        chipBg: 'rgba(255,255,255,0.10)',
        chipBorder: 'rgba(255,255,255,0.16)',
        referenceStroke: 'rgba(255,255,255,0.74)',
        referenceFill: 'rgba(255,255,255,0.06)',
        shadow: '0 50px 130px rgba(0,0,0,0.72)',
    },
    metro: {
        cardBg: '#f4f1ea',
        footerBg: '#f4f1ea',
        heroFallback: 'linear-gradient(135deg, #111827 0%, #334155 52%, #f4f1ea 100%)',
        textPrimary: '#101014',
        textSecondary: '#2f3137',
        textMuted: '#70747d',
        accent: '#e11d48',
        accentSoft: 'rgba(225,29,72,0.10)',
        border: 'rgba(16,16,20,0.12)',
        badgeBg: '#101014',
        badgeText: '#f8fafc',
        panelBg: '#f4f1ea',
        chipBg: 'rgba(16,16,20,0.06)',
        chipBorder: 'rgba(16,16,20,0.12)',
        referenceStroke: 'rgba(16,16,20,0.50)',
        referenceFill: 'rgba(16,16,20,0.05)',
        shadow: '0 36px 90px rgba(16,16,20,0.24)',
    },
};

const DEFAULT_ENTITY: ShareEntityPayload = {
    type: 'link',
    title: 'Listopic',
    subtitle: 'Comparte recomendaciones reales',
    url: PUBLIC_ORIGIN,
};

const VARIANT_DIMENSIONS: Record<ShareCardVariant, { width: number; height: number; previewRatio: string }> = {
    story: { width: 1080, height: 1920, previewRatio: '9 / 16' },
    post: { width: 1080, height: 1350, previewRatio: '4 / 5' },
    editorial: { width: 1080, height: 1350, previewRatio: '4 / 5' },
    clean: { width: 1080, height: 1080, previewRatio: '1 / 1' },
    neon: { width: 1080, height: 1920, previewRatio: '9 / 16' },
    signal: { width: 1080, height: 1080, previewRatio: '1 / 1' },
    aura: { width: 1080, height: 1920, previewRatio: '9 / 16' },
    metro: { width: 1080, height: 1350, previewRatio: '4 / 5' },
};

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

const deltaColor = (delta: number) => delta > 0 ? '#34d399' : delta < 0 ? '#f87171' : '#94a3b8';
const deltaSign = (delta: number) => delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);

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
    variant = 'story',
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
    const CARD_GENERATION_TIMEOUT_MS = 20000;

    const entity = useMemo<ShareEntityPayload>(() => {
        if (shareEntity && isSupportedEntityType(shareEntity.type)) return shareEntity;
        if (review) {
            const reviewUrl = buildPublicRouteUrl(`/group/${review.placeId || ''}/${encodeURIComponent(review.itemName || '')}`);
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
                authorUserType: (review as any).authorUserType,
                city: review.placeCity,
                criteriaStats: buildCriteriaStats(review.scores, review.criteriaDefinition),
                tags: review.userTags || review.tags,
            };
        }
        if (place) {
            const placeUrl = buildPublicRouteUrl(`/place/${place.placeId}`);
            return {
                type: 'place',
                id: place.placeId,
                title: place.name || 'Lugar',
                subtitle: place.address || '',
                description: place.reviewCount ? `${place.reviewCount} rese\u00f1as publicadas` : '',
                route: place.placeId ? `/place/${place.placeId}` : undefined,
                url: placeUrl,
                imageUrl: place.photoUrl,
                city: place.city,
                score: place.avgScore,
            };
        }
        return DEFAULT_ENTITY;
    }, [place, review, shareEntity]);

    const theme = VARIANT_THEMES[variant] || VARIANT_THEMES.story;
    const score = review?.overallRating ?? place?.avgScore ?? entity.score;
    const scoreColor = scoreBubbleColor(score);
    const heroImage = localImages.hero || review?.photoUrl || place?.photoUrl || entity.imageUrl || '';
    const avatarImage = localImages.avatar || review?.authorPhoto || entity.authorPhoto || (entity.type === 'profile' ? entity.imageUrl || '' : '');
    const hasScore = Number.isFinite(score as number);
    const createdAtLabel = toReadableDate(review);

    const isReviewShare = entity.type === 'review' || Boolean(review);
    const titleText = entity.title || 'Listopic';
    const subtitleText = entity.subtitle || '';
    const descriptionText = (review?.comment || entity.description || '').trim();
    const authorLabel = review?.authorName || entity.authorName || (entity.type === 'profile' ? entity.title : 'Comunidad Listopic');
    const cityLabel = entity.city || review?.placeCity || place?.city || '';
    const placeLabel = isReviewShare ? (review?.placeName || entity.subtitle || '') : '';
    const locationLine = [placeLabel, cityLabel].filter(Boolean).join(' · ');
    const authorUserType = entity.authorUserType || (review as any)?.authorUserType;
    const authorGradient = (() => {
        const types: string[] = Array.isArray(authorUserType) ? authorUserType : authorUserType ? [authorUserType] : [];
        if (types.includes('jefe')) return 'linear-gradient(135deg, #34d399, #4ade80, #2dd4bf)';
        if (types.includes('critico')) return 'linear-gradient(135deg, #facc15, #f59e0b, #fb923c)';
        if (types.includes('bot')) return 'linear-gradient(135deg, #cbd5e1, #94a3b8, #a1a1aa)';
        return 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)';
    })();

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

    const { width: exportWidth, height: exportHeight, previewRatio: previewAspectRatio } = VARIANT_DIMENSIONS[variant];
    const reviewCountLabel = formatReviewCount(entity.reviewCount);
    const entityLabel = getShareEntityLabel(entity.type);
    const scoreLabel = getScoreLabel(entity.type);
    const tagList = normalizeTags(entity.tags || review?.userTags || review?.tags);
    const brandName = config.appName || 'Listopic';
    // Per-variant title font sizes
    const storyTitleSize = titleText.length > 40 ? '70px' : titleText.length > 22 ? '86px' : '104px';
    const postTitleSize = titleText.length > 50 ? '42px' : titleText.length > 30 ? '54px' : '66px';
    const editorialTitleSize = titleText.length > 50 ? '26px' : titleText.length > 30 ? '34px' : '42px';
    const cleanTitleSize = titleText.length > 40 ? '36px' : titleText.length > 22 ? '46px' : '54px';
    const infoChips = [
        entityLabel,
        entity.badgeLabel && entity.badgeLabel !== entityLabel ? entity.badgeLabel : null,
        !isReviewShare ? reviewCountLabel : null,
    ].filter((value): value is string => Boolean(value));

    // Helper: find reference (list average) score for a given criterion key
    const getRefScore = (key: string): number | null => {
        if (!referenceCriteriaStats?.length) return null;
        const ref = referenceCriteriaStats.find(r => r.key === key);
        return ref != null && Number.isFinite(ref.score) ? ref.score : null;
    };

    const footerDescription = descriptionText || (
        isReviewShare
            ? 'Una rese\u00f1a real compartida desde la comunidad Listopic.'
            : entity.type === 'group'
                ? 'Resumen visual con medias agregadas a partir de las rese\u00f1as del grupo.'
                : entity.type === 'list' || entity.type === 'sublist'
                    ? 'Tarjeta compartible con el tono y las medias principales de la lista.'
                    : 'Compartido desde Listopic.'
    );

    const loadAsDataUrl = async (url?: string): Promise<string> => {
        if (!url) return '';
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch {
            return url;
        }
    };

    const captureDirectly = async (node: HTMLDivElement) => {
        if (document.fonts?.ready) {
            try { await document.fonts.ready; } catch { /* ignore */ }
        }
        return html2canvas(node, {
            useCORS: true,
            scale: 2,
            backgroundColor: null,
            logging: false,
            width: exportWidth,
            height: exportHeight,
            windowWidth: exportWidth,
            windowHeight: exportHeight,
        });
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
            if (!frameDocument) throw new Error('No iframe document available');

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
                try { await frameDocument.fonts.ready; } catch { /* ignore */ }
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
        } catch {
            // Fallback: capture directly without iframe (needed for Android WebView)
            return captureDirectly(node);
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
            const [heroData, avatarData] = await withTimeout(
                Promise.all([
                    loadAsDataUrl(review?.photoUrl || place?.photoUrl || entity.imageUrl),
                    loadAsDataUrl(review?.authorPhoto || entity.authorPhoto || (entity.type === 'profile' ? entity.imageUrl : undefined)),
                ]),
                CARD_GENERATION_TIMEOUT_MS,
                'Tiempo de espera agotado al preparar las imagenes.',
            );

            setLocalImages({ hero: heroData, avatar: avatarData });
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (!captureRef.current) return;

            const canvas = await withTimeout(
                Capacitor.isNativePlatform() ? captureDirectly(captureRef.current) : renderIsolatedCanvas(captureRef.current),
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
            if (Capacitor.isNativePlatform()) {
                const base64Data = previewImage.split(',')[1];
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });
                await Share.share({
                    title: titleText,
                    text: subtitleText || 'Compartido desde Listopic',
                    url: savedFile.uri,
                    dialogTitle: 'Compartir Listopic'
                });
                setShareFeedback('Tarjeta compartida');
                return;
            }

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

            const fallbackUrl = buildPublicUrl(entity.url || (typeof window !== 'undefined' ? window.location.href : '/'));
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
                        fontFamily: "'Manrope', sans-serif",
                        padding: variant === 'clean' ? '0' : '28px',
                        boxSizing: 'border-box',
                    }}
                >
                    {/* ─── STORY: full-bleed 9:16 ─── */}
                    {variant === 'story' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '56px', overflow: 'hidden',
                            background: theme.cardBg, boxShadow: theme.shadow,
                        }}>
                            {heroImage
                                ? <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} />
                                : <div style={{ position: 'absolute', inset: 0, background: theme.heroFallback }} />
                            }
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.97) 100%)' }} />

                            {/* Top: RESEÑA label (reviews) or category chips (other) */}
                            <div style={{ position: 'absolute', top: '56px', left: '54px', right: '54px' }}>
                                {isReviewShare ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        {/* "RESEÑA" pill */}
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center',
                                            padding: '0 22px', height: '46px', borderRadius: '9999px',
                                            background: 'rgba(0,0,0,0.54)', border: '1px solid rgba(255,255,255,0.20)',
                                            color: '#ffffff', fontSize: '19px', fontWeight: 800,
                                            letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                                            alignSelf: 'flex-start',
                                        }}>RESEÑA</div>

                                        {/* Author row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            {/* Avatar with gradient ring */}
                                            <div style={{
                                                width: '64px', height: '64px', borderRadius: '16px',
                                                padding: '2px', flexShrink: 0,
                                                background: authorGradient,
                                            }}>
                                                <div style={{
                                                    width: '100%', height: '100%', borderRadius: '14px',
                                                    overflow: 'hidden', background: '#1e293b',
                                                }}>
                                                    {avatarImage
                                                        ? <div style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} />
                                                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '24px' }}>
                                                            {(authorLabel || 'L').slice(0, 1).toUpperCase()}
                                                        </div>
                                                    }
                                                </div>
                                            </div>

                                            {/* Author info */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', lineHeight: 1, textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                                                    {authorLabel}
                                                </div>
                                                {locationLine && (
                                                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'rgba(255,255,255,0.72)', lineHeight: 1 }}>
                                                        {locationLine}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                        {infoChips.map((chip) => (
                                            <div key={chip} style={{
                                                padding: '0 22px', height: '46px', borderRadius: '9999px',
                                                background: 'rgba(0,0,0,0.54)', border: '1px solid rgba(255,255,255,0.20)',
                                                color: '#ffffff', fontSize: '19px', fontWeight: 800,
                                                display: 'inline-flex', alignItems: 'center',
                                                letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                                            }}>{chip}</div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Bottom: score + title + author strip */}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 56px 60px' }}>
                                {hasScore && (
                                    <div style={{ marginBottom: '22px' }}>
                                        <div style={{
                                            fontSize: '152px', fontWeight: 900, lineHeight: 0.85,
                                            color: scoreColor, letterSpacing: '-0.04em',
                                            fontVariantNumeric: 'tabular-nums',
                                            textShadow: `0 0 70px ${scoreColor}44`,
                                        }}>{formatScore(score)}</div>
                                        <div style={{ marginTop: '10px', fontSize: '18px', fontWeight: 900, color: 'rgba(255,255,255,0.48)', letterSpacing: '0.26em', textTransform: 'uppercase' as const }}>
                                            {scoreLabel}
                                        </div>
                                    </div>
                                )}
                                <h1 style={{
                                    margin: 0, fontSize: storyTitleSize, fontWeight: 900, lineHeight: 0.93,
                                    letterSpacing: '-0.03em', color: '#ffffff', wordBreak: 'break-word', maxWidth: '88%',
                                    textShadow: '0 2px 28px rgba(0,0,0,0.45)',
                                }}>{titleText}</h1>
                                {subtitleText && (
                                    <p style={{ margin: '22px 0 0', fontSize: '27px', fontWeight: 600, color: 'rgba(255,255,255,0.74)', letterSpacing: '-0.01em' }}>
                                        {subtitleText}
                                    </p>
                                )}
                                {/* Criteria with reference delta */}
                                {criteriaStats.length > 0 && (
                                    <div style={{
                                        marginTop: '28px', padding: '20px 24px', borderRadius: '24px',
                                        background: 'rgba(0,0,0,0.48)', border: '1px solid rgba(255,255,255,0.10)',
                                        display: 'flex', flexDirection: 'column',
                                    }}>
                                        {criteriaStats.map((stat, i) => {
                                            const ref = getRefScore(stat.key);
                                            const delta = ref != null ? stat.score - ref : null;
                                            return (
                                                <div key={stat.key} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '9px 0',
                                                    borderBottom: i < criteriaStats.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                                                }}>
                                                    <span style={{ fontSize: '18px', fontWeight: 600, color: 'rgba(255,255,255,0.75)', flex: 1 }}>{truncateLabel(stat.label, 22)}</span>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexShrink: 0 }}>
                                                        {delta != null && (
                                                            <span style={{ fontSize: '15px', fontWeight: 700, color: deltaColor(delta) }}>{deltaSign(delta)}</span>
                                                        )}
                                                        <span style={{ fontSize: '22px', fontWeight: 900, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
                                                            {formatScore(stat.score)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {tagList.length > 0 && criteriaStats.length === 0 && (
                                    <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                        {tagList.map((tag) => (
                                            <div key={tag} style={{
                                                padding: '0 18px', height: '40px', borderRadius: '9999px',
                                                background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.20)',
                                                color: 'rgba(255,255,255,0.90)', fontSize: '17px', fontWeight: 700,
                                                display: 'inline-flex', alignItems: 'center',
                                            }}>#{truncateLabel(tag, 18)}</div>
                                        ))}
                                    </div>
                                )}
                                {/* Brand strip (author already shown top for reviews) */}
                                <div style={{
                                    marginTop: '44px', display: 'flex', alignItems: 'center',
                                    justifyContent: isReviewShare ? 'flex-end' : 'space-between', gap: '16px',
                                    padding: '18px 24px', borderRadius: '28px',
                                    background: 'rgba(0,0,0,0.50)', border: '1px solid rgba(255,255,255,0.12)',
                                }}>
                                    {!isReviewShare && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
                                            <div style={{
                                                width: '60px', height: '60px', borderRadius: '9999px', overflow: 'hidden',
                                                border: '2px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.14)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#ffffff', fontWeight: 900, fontSize: '24px', flexShrink: 0,
                                            }}>
                                                {avatarImage
                                                    ? <div role="img" aria-label={authorLabel} style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} />
                                                    : (authorLabel || 'L').slice(0, 1).toUpperCase()
                                                }
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '25px', fontWeight: 800, color: '#ffffff', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {authorLabel}
                                                </div>
                                                {createdAtLabel && (
                                                    <div style={{ fontSize: '17px', fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginTop: '5px' }}>
                                                        {createdAtLabel}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
                                        {config.logoType === 'image' && config.logoUrl
                                            ? <img src={config.logoUrl} alt={brandName} style={{ width: '34px', height: '34px', objectFit: 'contain' }} />
                                            : (
                                                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 52%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <div style={{ width: '13px', height: '13px', borderRadius: '9999px', background: '#ffffff' }} />
                                                </div>
                                            )
                                        }
                                        <div style={{ fontSize: '21px', fontWeight: 900, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.02em' }}>{brandName}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── POST: magazine 4:5, image top + dark panel ─── */}
                    {variant === 'post' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '44px', overflow: 'hidden',
                            background: theme.cardBg, boxShadow: theme.shadow,
                            display: 'flex', flexDirection: 'column',
                        }}>
                            {/* Image section */}
                            <div style={{ position: 'relative', height: '828px', flexShrink: 0 }}>
                                {heroImage
                                    ? <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} />
                                    : <div style={{ position: 'absolute', inset: 0, background: theme.heroFallback }} />
                                }
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 32%, rgba(0,0,0,0.90) 100%)' }} />

                                {/* Category badges */}
                                <div style={{ position: 'absolute', top: '36px', left: '42px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                    {infoChips.map((chip) => (
                                        <div key={chip} style={{
                                            padding: '0 18px', height: '38px', borderRadius: '9999px',
                                            background: 'rgba(0,0,0,0.58)', border: '1px solid rgba(255,255,255,0.16)',
                                            color: '#ffffff', fontSize: '15px', fontWeight: 800,
                                            display: 'inline-flex', alignItems: 'center',
                                            letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                        }}>{chip}</div>
                                    ))}
                                </div>

                                {/* Title (left) + BIG score (right) */}
                                <div style={{ position: 'absolute', bottom: '28px', left: '42px', right: '42px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px' }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <h1 style={{
                                            margin: 0, fontSize: postTitleSize, fontWeight: 900, lineHeight: 0.93,
                                            letterSpacing: '-0.03em', color: '#ffffff', wordBreak: 'break-word',
                                            textShadow: '0 2px 20px rgba(0,0,0,0.5)',
                                        }}>{titleText}</h1>
                                        {subtitleText && (
                                            <p style={{ margin: '14px 0 0', fontSize: '22px', fontWeight: 600, color: 'rgba(255,255,255,0.70)' }}>
                                                {subtitleText}
                                            </p>
                                        )}
                                    </div>
                                    {hasScore && (
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{
                                                fontSize: '128px', fontWeight: 900, lineHeight: 0.85,
                                                color: theme.accent, letterSpacing: '-0.05em',
                                                fontVariantNumeric: 'tabular-nums',
                                                textShadow: `0 0 56px ${theme.accent}44`,
                                            }}>{formatScore(score)}</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: 'rgba(255,255,255,0.44)', letterSpacing: '0.24em', textTransform: 'uppercase' as const, marginTop: '6px' }}>
                                                {scoreLabel}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer panel */}
                            <div style={{
                                flex: 1, background: theme.footerBg,
                                borderTop: `3px solid ${theme.accent}`,
                                padding: '28px 42px 32px',
                                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px',
                            }}>
                                {/* Criteria stats if available, else description */}
                                {criteriaStats.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                        {criteriaStats.map((stat, i) => {
                                            const ref = getRefScore(stat.key);
                                            const delta = ref != null ? stat.score - ref : null;
                                            return (
                                                <div key={stat.key} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '12px 0',
                                                    borderBottom: i < criteriaStats.length - 1 ? `1px solid ${theme.border}` : 'none',
                                                }}>
                                                    <span style={{ fontSize: '18px', fontWeight: 600, color: theme.textSecondary, flex: 1 }}>{truncateLabel(stat.label, 24)}</span>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexShrink: 0 }}>
                                                        {delta != null && (
                                                            <span style={{ fontSize: '14px', fontWeight: 700, color: deltaColor(delta) }}>{deltaSign(delta)}</span>
                                                        )}
                                                        <span style={{ fontSize: '24px', fontWeight: 900, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>
                                                            {formatScore(stat.score)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
                                        {tagList.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {tagList.map((tag) => (
                                                    <div key={tag} style={{
                                                        padding: '0 16px', height: '38px', borderRadius: '9999px',
                                                        background: theme.chipBg, border: `1px solid ${theme.chipBorder}`,
                                                        color: theme.accent, fontSize: '16px', fontWeight: 700,
                                                        display: 'inline-flex', alignItems: 'center',
                                                    }}>#{truncateLabel(tag, 20)}</div>
                                                ))}
                                            </div>
                                        )}
                                        <p style={{
                                            margin: 0, color: theme.textSecondary, fontSize: '20px', fontWeight: 500, lineHeight: 1.5,
                                        }}>{footerDescription}</p>
                                    </div>
                                )}

                                {/* Author + brand */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                        <div style={{
                                            width: '52px', height: '52px', borderRadius: '13px',
                                            padding: '2px', background: authorGradient, flexShrink: 0,
                                        }}>
                                            <div style={{
                                                width: '100%', height: '100%', borderRadius: '11px', overflow: 'hidden',
                                                background: theme.cardBg,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: theme.textPrimary, fontWeight: 900, fontSize: '20px',
                                            }}>
                                                {avatarImage
                                                    ? <div role="img" aria-label={authorLabel} style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} />
                                                    : (authorLabel || 'L').slice(0, 1).toUpperCase()
                                                }
                                            </div>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ color: theme.textPrimary, fontSize: '20px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {authorLabel}
                                            </div>
                                            <div style={{ color: theme.textMuted, fontSize: '13px', fontWeight: 600 }}>
                                                {locationLine || createdAtLabel || 'Compartido desde Listopic'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                        {config.logoType === 'image' && config.logoUrl
                                            ? <img src={config.logoUrl} alt={brandName} style={{ width: '38px', height: '38px', objectFit: 'contain' }} />
                                            : (
                                                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 52%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <div style={{ width: '15px', height: '15px', borderRadius: '9999px', background: '#ffffff' }} />
                                                </div>
                                            )
                                        }
                                        <div>
                                            <div style={{ color: theme.textPrimary, fontSize: '20px', fontWeight: 900, letterSpacing: '-0.02em' }}>{brandName}</div>
                                            <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em' }}>listopic.app</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── EDITORIAL: split columns 4:5 ─── */}
                    {variant === 'editorial' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '44px', overflow: 'hidden',
                            background: theme.cardBg, boxShadow: theme.shadow,
                            display: 'flex', flexDirection: 'row',
                        }}>
                            {/* Left: image */}
                            <div style={{ position: 'relative', width: '622px', flexShrink: 0 }}>
                                {heroImage
                                    ? <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} />
                                    : <div style={{ position: 'absolute', inset: 0, background: theme.heroFallback }} />
                                }
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)' }} />
                                <div style={{ position: 'absolute', top: '36px', left: '36px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                    {infoChips.map((chip) => (
                                        <div key={chip} style={{
                                            padding: '0 16px', height: '36px', borderRadius: '9999px',
                                            background: 'rgba(0,0,0,0.56)', border: '1px solid rgba(255,255,255,0.16)',
                                            color: '#ffffff', fontSize: '14px', fontWeight: 800,
                                            display: 'inline-flex', alignItems: 'center',
                                            letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                        }}>{chip}</div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: editorial panel */}
                            <div style={{
                                flex: 1, background: theme.panelBg,
                                padding: '46px 38px 46px 40px',
                                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                            }}>
                                {/* Brand */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                    {config.logoType === 'image' && config.logoUrl
                                        ? <img src={config.logoUrl} alt={brandName} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                                        : (
                                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 52%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '9999px', background: '#ffffff' }} />
                                            </div>
                                        )
                                    }
                                    <div style={{ fontSize: '16px', fontWeight: 900, color: theme.textMuted }}>{brandName}</div>
                                </div>

                                {/* Center: score + title + criteria */}
                                <div>
                                    {hasScore && (
                                        <>
                                            <div style={{
                                                fontSize: '160px', fontWeight: 900, lineHeight: 0.85,
                                                color: theme.textPrimary, letterSpacing: '-0.05em',
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>{formatScore(score)}</div>
                                            <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '48px', height: '4px', borderRadius: '2px', background: theme.accent }} />
                                                <span style={{ fontSize: '13px', fontWeight: 900, color: theme.textMuted, letterSpacing: '0.22em', textTransform: 'uppercase' as const }}>
                                                    {scoreLabel}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    <h1 style={{
                                        margin: hasScore ? '26px 0 0' : '0',
                                        fontSize: editorialTitleSize, fontWeight: 900, lineHeight: 1.0,
                                        letterSpacing: '-0.02em', color: theme.textPrimary, wordBreak: 'break-word',
                                    }}>{titleText}</h1>
                                    {subtitleText && (
                                        <p style={{ margin: '13px 0 0', fontSize: '17px', fontWeight: 600, color: theme.textMuted, lineHeight: 1.4 }}>
                                            {subtitleText}
                                        </p>
                                    )}
                                    {criteriaStats.length > 0 && (
                                        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column' }}>
                                            {criteriaStats.map((stat, i) => {
                                                const ref = getRefScore(stat.key);
                                                const delta = ref != null ? stat.score - ref : null;
                                                return (
                                                    <div key={stat.key} style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        gap: '10px', padding: '11px 0',
                                                        borderBottom: i < criteriaStats.length - 1 ? `1px solid ${theme.border}` : 'none',
                                                    }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textSecondary, flex: 1 }}>{truncateLabel(stat.label, 20)}</span>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexShrink: 0 }}>
                                                            {delta != null && (
                                                                <span style={{ fontSize: '13px', fontWeight: 700, color: deltaColor(delta) }}>{deltaSign(delta)}</span>
                                                            )}
                                                            <span style={{ fontSize: '20px', fontWeight: 900, color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                                                                {formatScore(stat.score)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Author */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                                    <div style={{ background: authorGradient, borderRadius: '13px', padding: '2px', flexShrink: 0 }}>
                                        <div style={{
                                            width: '42px', height: '42px', borderRadius: '11px', overflow: 'hidden',
                                            background: theme.accentSoft,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: theme.textPrimary, fontWeight: 900, fontSize: '18px',
                                        }}>
                                            {avatarImage
                                                ? <div role="img" aria-label={authorLabel} style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} />
                                                : (authorLabel || 'L').slice(0, 1).toUpperCase()
                                            }
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '17px', fontWeight: 800, color: theme.textPrimary, lineHeight: 1 }}>{authorLabel}</div>
                                        {(locationLine || createdAtLabel) && (
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textMuted, marginTop: '3px' }}>
                                                {locationLine || createdAtLabel}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── CLEAN: polaroid 1:1 ─── */}
                    {variant === 'clean' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '36px', overflow: 'hidden',
                            background: '#ffffff', boxShadow: theme.shadow,
                            display: 'flex', flexDirection: 'column',
                        }}>
                            {/* Image */}
                            <div style={{ position: 'relative', height: '520px', flexShrink: 0 }}>
                                {heroImage
                                    ? <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} />
                                    : <div style={{ position: 'absolute', inset: 0, background: theme.heroFallback }} />
                                }
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 70%, rgba(0,0,0,0.22) 100%)' }} />
                                <div style={{ position: 'absolute', top: '28px', left: '28px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {infoChips.map((chip) => (
                                        <div key={chip} style={{
                                            padding: '0 16px', height: '34px', borderRadius: '9999px',
                                            background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(0,0,0,0.08)',
                                            color: '#0f172a', fontSize: '13px', fontWeight: 800,
                                            display: 'inline-flex', alignItems: 'center',
                                            letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                                        }}>{chip}</div>
                                    ))}
                                </div>
                            </div>

                            {/* White info strip */}
                            <div style={{
                                flex: 1, background: '#ffffff',
                                padding: '24px 32px 28px',
                                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px',
                            }}>
                                {/* Title + score */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <h1 style={{
                                            margin: 0, fontSize: cleanTitleSize, fontWeight: 900, lineHeight: 0.95,
                                            letterSpacing: '-0.03em', color: '#0f172a', wordBreak: 'break-word',
                                        }}>{titleText}</h1>
                                        {subtitleText && (
                                            <p style={{ margin: '10px 0 0', fontSize: '17px', fontWeight: 600, color: '#64748b', lineHeight: 1.3 }}>
                                                {subtitleText}
                                            </p>
                                        )}
                                    </div>
                                    {hasScore && (
                                        <div style={{
                                            width: '82px', height: '82px', borderRadius: '9999px',
                                            border: `3px solid ${scoreColor}`, background: `${scoreColor}14`,
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <span style={{ fontSize: '28px', fontWeight: 900, color: scoreColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                                {formatScore(score)}
                                            </span>
                                            <span style={{ fontSize: '10px', fontWeight: 800, color: scoreColor, letterSpacing: '0.12em', opacity: 0.8 }}>
                                                {scoreLabel}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Criteria stats — all, with reference delta */}
                                {criteriaStats.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {criteriaStats.map((stat, i) => {
                                            const ref = getRefScore(stat.key);
                                            const delta = ref != null ? stat.score - ref : null;
                                            return (
                                                <div key={stat.key} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '8px 0',
                                                    borderBottom: i < criteriaStats.length - 1 ? '1px solid rgba(15,23,42,0.07)' : 'none',
                                                }}>
                                                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569', flex: 1 }}>{truncateLabel(stat.label, 26)}</span>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', flexShrink: 0 }}>
                                                        {delta != null && (
                                                            <span style={{ fontSize: '12px', fontWeight: 700, color: deltaColor(delta) }}>{deltaSign(delta)}</span>
                                                        )}
                                                        <span style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                                                            {formatScore(stat.score)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Tags */}
                                {tagList.length > 0 && criteriaStats.length === 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                                        {tagList.map((tag) => (
                                            <div key={tag} style={{
                                                padding: '0 12px', height: '30px', borderRadius: '9999px',
                                                background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.10)',
                                                color: '#475569', fontSize: '12px', fontWeight: 700,
                                                display: 'inline-flex', alignItems: 'center',
                                            }}>#{truncateLabel(tag, 20)}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Author + brand */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                        <div style={{ background: authorGradient, borderRadius: '11px', padding: '2px', flexShrink: 0 }}>
                                            <div style={{
                                                width: '38px', height: '38px', borderRadius: '9px', overflow: 'hidden',
                                                background: 'rgba(15,23,42,0.06)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#0f172a', fontWeight: 900, fontSize: '17px',
                                            }}>
                                                {avatarImage
                                                    ? <div role="img" aria-label={authorLabel} style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} />
                                                    : (authorLabel || 'L').slice(0, 1).toUpperCase()
                                                }
                                            </div>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {authorLabel}
                                            </div>
                                            {(locationLine || createdAtLabel) && (
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                                                    {locationLine || createdAtLabel}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                        {config.logoType === 'image' && config.logoUrl
                                            ? <img src={config.logoUrl} alt={brandName} style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                                            : (
                                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 52%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <div style={{ width: '12px', height: '12px', borderRadius: '9999px', background: '#ffffff' }} />
                                                </div>
                                            )
                                        }
                                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{brandName}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {variant === 'neon' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '60px', overflow: 'hidden',
                            background: theme.cardBg, boxShadow: theme.shadow,
                        }}>
                            {heroImage
                                ? <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} />
                                : <div style={{ position: 'absolute', inset: 0, background: theme.heroFallback }} />
                            }
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,8,22,0.18) 0%, rgba(5,8,22,0.40) 44%, rgba(5,8,22,0.98) 100%)' }} />
                            <div style={{ position: 'absolute', inset: '30px', borderRadius: '46px', border: '2px solid rgba(255,255,255,0.16)' }} />
                            <div style={{ position: 'absolute', top: '56px', left: '56px', right: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px' }}>
                                <div style={{
                                    height: '46px', padding: '0 20px', borderRadius: '999px',
                                    background: 'rgba(5,8,22,0.62)', border: '1px solid rgba(255,255,255,0.18)',
                                    color: '#ffffff', fontSize: '17px', fontWeight: 900,
                                    letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                                    display: 'inline-flex', alignItems: 'center',
                                }}>
                                    {getShareEntityLabel(entity.type)}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {config.logoType === 'image' && config.logoUrl
                                        ? <img src={config.logoUrl} alt={brandName} style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                                        : <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #22d3ee, #6366f1, #ec4899)' }} />
                                    }
                                    <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: '19px', fontWeight: 900 }}>{brandName}</span>
                                </div>
                            </div>

                            <div style={{ position: 'absolute', left: '58px', right: '58px', bottom: '62px' }}>
                                {hasScore && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', marginBottom: '28px' }}>
                                        <div style={{
                                            fontSize: '176px', fontWeight: 950, lineHeight: 0.78,
                                            color: '#ffffff', letterSpacing: '-0.08em',
                                            fontVariantNumeric: 'tabular-nums',
                                            textShadow: `0 0 42px ${scoreColor}, 0 0 120px ${scoreColor}55`,
                                        }}>{formatScore(score)}</div>
                                        <div style={{ paddingBottom: '16px', color: 'rgba(255,255,255,0.54)', fontSize: '17px', fontWeight: 900, letterSpacing: '0.24em', textTransform: 'uppercase' as const }}>
                                            {scoreLabel}
                                        </div>
                                    </div>
                                )}
                                <h1 style={{
                                    margin: 0, color: '#ffffff', fontSize: storyTitleSize,
                                    fontWeight: 950, lineHeight: 0.92, letterSpacing: '-0.05em',
                                    textShadow: '0 4px 32px rgba(0,0,0,0.62)',
                                }}>{titleText}</h1>
                                {subtitleText && (
                                    <p style={{ margin: '20px 0 0', color: 'rgba(255,255,255,0.76)', fontSize: '28px', fontWeight: 700, lineHeight: 1.2 }}>
                                        {subtitleText}
                                    </p>
                                )}
                                <div style={{
                                    marginTop: '34px', padding: '20px', borderRadius: '28px',
                                    background: 'rgba(5,8,22,0.68)', border: '1px solid rgba(255,255,255,0.16)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                                        <div style={{ width: '54px', height: '54px', borderRadius: '16px', padding: '2px', background: authorGradient, flexShrink: 0 }}>
                                            <div style={{ width: '100%', height: '100%', borderRadius: '14px', overflow: 'hidden', background: '#111827', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 900 }}>
                                                {avatarImage ? <div role="img" aria-label={authorLabel} style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} /> : (authorLabel || 'L').slice(0, 1).toUpperCase()}
                                            </div>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ color: '#ffffff', fontSize: '20px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{authorLabel}</div>
                                            <div style={{ color: 'rgba(255,255,255,0.50)', fontSize: '14px', fontWeight: 700 }}>{locationLine || createdAtLabel || 'Compartido desde Listopic'}</div>
                                        </div>
                                    </div>
                                    {tagList.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                            {tagList.slice(0, 2).map((tag) => (
                                                <span key={tag} style={{ height: '30px', padding: '0 12px', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', color: '#ffffff', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>#{truncateLabel(tag, 12)}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {variant === 'signal' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '38px', overflow: 'hidden',
                            background: '#f8fafc', boxShadow: theme.shadow,
                            display: 'grid', gridTemplateRows: '612px 1fr',
                        }}>
                            <div style={{ position: 'relative', margin: '26px 26px 0', borderRadius: '28px', overflow: 'hidden', background: theme.heroFallback }}>
                                {heroImage && <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} />}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.02) 52%, rgba(0,0,0,0.46) 100%)' }} />
                                <div style={{ position: 'absolute', left: '24px', top: '24px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {infoChips.slice(0, 3).map((chip) => (
                                        <span key={chip} style={{
                                            height: '34px', padding: '0 14px', borderRadius: '999px',
                                            background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(15,23,42,0.08)',
                                            color: '#0f172a', fontSize: '12px', fontWeight: 900,
                                            letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                                            display: 'inline-flex', alignItems: 'center',
                                        }}>{chip}</span>
                                    ))}
                                </div>
                                {hasScore && (
                                    <div style={{
                                        position: 'absolute', right: '24px', bottom: '24px',
                                        width: '118px', height: '118px', borderRadius: '30px',
                                        background: '#ffffff', border: '1px solid rgba(15,23,42,0.08)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 22px 46px rgba(15,23,42,0.22)',
                                    }}>
                                        <span style={{ color: scoreColor, fontSize: '42px', fontWeight: 950, lineHeight: 1, letterSpacing: '-0.05em' }}>{formatScore(score)}</span>
                                        <span style={{ marginTop: '5px', color: '#64748b', fontSize: '10px', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' as const }}>{scoreLabel}</span>
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: '30px 34px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '18px' }}>
                                <div>
                                    <h1 style={{ margin: 0, color: '#0f172a', fontSize: cleanTitleSize, fontWeight: 950, lineHeight: 0.92, letterSpacing: '-0.05em' }}>{titleText}</h1>
                                    {subtitleText && (
                                        <p style={{ margin: '12px 0 0', color: '#475569', fontSize: '18px', fontWeight: 700, lineHeight: 1.32 }}>{subtitleText}</p>
                                    )}
                                </div>
                                {criteriaStats.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}>
                                        {criteriaStats.slice(0, 4).map((stat) => (
                                            <div key={stat.key} style={{ borderRadius: '16px', background: '#ffffff', border: '1px solid rgba(15,23,42,0.08)', padding: '12px 14px' }}>
                                                <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 800 }}>{truncateLabel(stat.label, 18)}</div>
                                                <div style={{ marginTop: '4px', color: '#0f172a', fontSize: '22px', fontWeight: 950 }}>{formatScore(stat.score)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', borderTop: '1px solid rgba(15,23,42,0.08)', paddingTop: '18px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '14px', padding: '2px', background: authorGradient, flexShrink: 0 }}>
                                            <div style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden', background: '#e2e8f0', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>
                                                {avatarImage ? <div role="img" aria-label={authorLabel} style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} /> : (authorLabel || 'L').slice(0, 1).toUpperCase()}
                                            </div>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ color: '#0f172a', fontSize: '16px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{authorLabel}</div>
                                            <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700 }}>{locationLine || createdAtLabel || 'Listopic'}</div>
                                        </div>
                                    </div>
                                    <div style={{ color: '#0f172a', fontSize: '18px', fontWeight: 950, letterSpacing: '-0.03em' }}>{brandName}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {variant === 'aura' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '64px', overflow: 'hidden',
                            background: theme.cardBg, boxShadow: theme.shadow,
                        }}>
                            <div style={{ position: 'absolute', inset: 0, background: theme.heroFallback }} />
                            <div style={{ position: 'absolute', inset: '34px', borderRadius: '48px', border: '1px solid rgba(255,255,255,0.16)' }} />

                            <div style={{
                                position: 'absolute', top: '72px', left: '58px', right: '58px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                                <div style={{
                                    height: '38px', padding: '0 16px', borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)',
                                    color: 'rgba(255,255,255,0.78)', fontSize: '13px', fontWeight: 900,
                                    letterSpacing: '0.18em', textTransform: 'uppercase' as const,
                                    display: 'inline-flex', alignItems: 'center',
                                }}>
                                    {getShareEntityLabel(entity.type)}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '18px', fontWeight: 900, letterSpacing: '-0.02em' }}>
                                    {brandName}
                                </div>
                            </div>

                            <div style={{
                                position: 'absolute', top: '146px', left: '58px', right: '58px', height: '810px',
                                borderRadius: '44px', overflow: 'hidden',
                                boxShadow: '0 42px 90px rgba(0,0,0,0.48)',
                                background: theme.heroFallback,
                            }}>
                                {heroImage && <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} />}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.02) 42%, rgba(0,0,0,0.48) 100%)' }} />
                                {hasScore && (
                                    <div style={{
                                        position: 'absolute', right: '28px', bottom: '28px',
                                        minWidth: '132px', height: '132px', borderRadius: '36px',
                                        background: 'rgba(7,7,10,0.74)', border: '1px solid rgba(255,255,255,0.18)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        backdropFilter: 'blur(22px)',
                                    }}>
                                        <span style={{ color: '#ffffff', fontSize: '46px', fontWeight: 950, lineHeight: 1, letterSpacing: '-0.06em' }}>{formatScore(score)}</span>
                                        <span style={{ marginTop: '7px', color: 'rgba(255,255,255,0.46)', fontSize: '10px', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' as const }}>{scoreLabel}</span>
                                    </div>
                                )}
                            </div>

                            <div style={{ position: 'absolute', left: '58px', right: '58px', bottom: '64px' }}>
                                <h1 style={{
                                    margin: 0, color: '#ffffff', fontSize: storyTitleSize,
                                    fontWeight: 950, lineHeight: 0.90, letterSpacing: '-0.06em',
                                    maxWidth: '96%',
                                }}>{titleText}</h1>
                                {subtitleText && (
                                    <p style={{ margin: '18px 0 0', color: 'rgba(255,255,255,0.66)', fontSize: '25px', fontWeight: 650, lineHeight: 1.25 }}>
                                        {subtitleText}
                                    </p>
                                )}

                                <div style={{
                                    marginTop: '34px', padding: '18px 20px', borderRadius: '28px',
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                                        <div style={{ width: '52px', height: '52px', borderRadius: '999px', padding: '2px', background: authorGradient, flexShrink: 0 }}>
                                            <div style={{
                                                width: '100%', height: '100%', borderRadius: '999px', overflow: 'hidden',
                                                background: '#18181b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 900, fontSize: '20px',
                                            }}>
                                                {avatarImage ? <div role="img" aria-label={authorLabel} style={{ width: '100%', height: '100%', ...getCoverBackground(avatarImage) }} /> : (authorLabel || 'L').slice(0, 1).toUpperCase()}
                                            </div>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ color: '#ffffff', fontSize: '19px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{authorLabel}</div>
                                            <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: '13px', fontWeight: 700 }}>{locationLine || createdAtLabel || 'Listopic'}</div>
                                        </div>
                                    </div>
                                    <div style={{ color: theme.accent, fontSize: '13px', fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>
                                        guardar idea
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {variant === 'metro' && (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%',
                            borderRadius: '0', overflow: 'hidden',
                            background: '#f4f1ea', boxShadow: theme.shadow,
                        }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(16,16,20,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(16,16,20,0.08) 1px, transparent 1px)', backgroundSize: '54px 54px' }} />
                            <div style={{ position: 'absolute', top: '42px', left: '42px', right: '42px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ color: '#101014', fontSize: '22px', fontWeight: 950, letterSpacing: '-0.04em' }}>{brandName}</div>
                                <div style={{ color: '#101014', fontSize: '12px', fontWeight: 950, letterSpacing: '0.22em', textTransform: 'uppercase' as const }}>
                                    {getShareEntityLabel(entity.type)}
                                </div>
                            </div>

                            <div style={{
                                position: 'absolute', top: '104px', left: '42px', width: '626px', height: '610px',
                                background: '#101014', overflow: 'hidden',
                            }}>
                                {heroImage ? <div role="img" aria-label={titleText} style={{ position: 'absolute', inset: 0, ...getCoverBackground(heroImage) }} /> : <div style={{ position: 'absolute', inset: 0, background: theme.heroFallback }} />}
                            </div>

                            <div style={{
                                position: 'absolute', top: '104px', right: '42px', width: '328px', height: '610px',
                                background: '#101014', color: '#f8fafc',
                                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                padding: '28px', boxSizing: 'border-box',
                            }}>
                                <div>
                                    <div style={{ width: '74px', height: '8px', background: theme.accent, marginBottom: '30px' }} />
                                    <div style={{ color: 'rgba(255,255,255,0.58)', fontSize: '13px', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' as const }}>
                                        {scoreLabel}
                                    </div>
                                    {hasScore && (
                                        <div style={{ marginTop: '12px', color: '#ffffff', fontSize: '116px', fontWeight: 950, lineHeight: 0.82, letterSpacing: '-0.09em' }}>
                                            {formatScore(score)}
                                        </div>
                                    )}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: '15px', fontWeight: 750, lineHeight: 1.35 }}>
                                    {locationLine || createdAtLabel || 'Compartido desde Listopic'}
                                </div>
                            </div>

                            <div style={{ position: 'absolute', left: '42px', right: '42px', top: '760px' }}>
                                <h1 style={{
                                    margin: 0, color: '#101014', fontSize: titleText.length > 45 ? '62px' : titleText.length > 26 ? '78px' : '96px',
                                    fontWeight: 950, lineHeight: 0.88, letterSpacing: '-0.075em',
                                    maxWidth: '930px',
                                }}>{titleText}</h1>
                                {subtitleText && (
                                    <p style={{ margin: '22px 0 0', color: '#343741', fontSize: '27px', fontWeight: 750, lineHeight: 1.18, maxWidth: '760px' }}>
                                        {subtitleText}
                                    </p>
                                )}
                            </div>

                            <div style={{ position: 'absolute', left: '42px', right: '42px', bottom: '42px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                {(criteriaStats.length > 0 ? criteriaStats.slice(0, 3) : [
                                    { key: 'autor', label: authorLabel, score: Number(score || 0) },
                                    { key: 'sitio', label: locationLine || subtitleText || 'Listopic', score: Number(score || 0) },
                                    { key: 'fecha', label: createdAtLabel || 'Ahora', score: Number(score || 0) },
                                ]).map((stat) => (
                                    <div key={stat.key} style={{ borderTop: '6px solid #101014', paddingTop: '14px' }}>
                                        <div style={{ color: '#70747d', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.10em' }}>
                                            {truncateLabel(stat.label, 20)}
                                        </div>
                                        <div style={{ marginTop: '10px', color: '#101014', fontSize: '34px', fontWeight: 950, letterSpacing: '-0.05em' }}>
                                            {criteriaStats.length > 0 ? formatScore(stat.score) : 'LISTOPIC'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isPreviewOpen && previewImage && (
                <div
                    className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
                    onClick={() => setIsPreviewOpen(false)}
                >
                    <div
                        className="bg-[var(--lt-card-strong)] rounded-2xl w-full border border-white/10 overflow-hidden shadow-2xl"
                        style={{ maxWidth: variant === 'editorial' ? '680px' : (variant === 'story' || variant === 'neon' || variant === 'aura') ? '380px' : '430px' }}
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
                                    className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white font-bold transition-colors"
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
                    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5 shadow-2xl text-center">
                        <div className="mx-auto h-12 w-12 rounded-2xl animate-spin border-t-2 border-[var(--lt-accent-border)] bg-white/5"></div>
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
