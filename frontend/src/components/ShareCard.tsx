import React, { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { type ReviewEntity } from '../hooks/useListDetails';
import type { ShareEntityPayload, ShareEntityType } from '../types/share';

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
    textPrimary: string;
    textSecondary: string;
    accent: string;
    badgeBg: string;
    badgeText: string;
    footerBg: string;
};

const VARIANT_THEMES: Record<ShareCardVariant, VariantTheme> = {
    cinematic: {
        cardBg: '#071225',
        textPrimary: '#f8fafc',
        textSecondary: '#bfdbfe',
        accent: '#60a5fa',
        badgeBg: 'rgba(96,165,250,0.18)',
        badgeText: '#bfdbfe',
        footerBg: 'rgba(7, 18, 37, 0.94)',
    },
    clean: {
        cardBg: '#ffffff',
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        accent: '#4f46e5',
        badgeBg: 'rgba(79,70,229,0.12)',
        badgeText: '#312e81',
        footerBg: 'rgba(255, 255, 255, 0.95)',
    },
    punchy: {
        cardBg: '#081328',
        textPrimary: '#ecfeff',
        textSecondary: '#a5f3fc',
        accent: '#22d3ee',
        badgeBg: 'rgba(34,211,238,0.16)',
        badgeText: '#67e8f9',
        footerBg: 'rgba(8, 19, 40, 0.95)',
    },
    spotify: {
        cardBg: '#07180e',
        textPrimary: '#f0fdf4',
        textSecondary: '#bbf7d0',
        accent: '#1db954',
        badgeBg: 'rgba(29,185,84,0.2)',
        badgeText: '#86efac',
        footerBg: 'rgba(7, 24, 14, 0.95)',
    },
};

const SCORE_BUBBLE = (score?: number) => {
    if (!Number.isFinite(score as number)) return '#94a3b8';
    if ((score as number) >= 9) return '#34d399';
    if ((score as number) >= 7) return '#84cc16';
    if ((score as number) >= 5) return '#facc15';
    return '#f87171';
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

const toReadableDate = (review?: ReviewEntity): string | null => {
    if (!review?.createdAt) return null;
    try {
        const jsDate = typeof review.createdAt?.toDate === 'function'
            ? review.createdAt.toDate()
            : null;
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

export const ShareCard: React.FC<ShareCardProps> = ({
    place,
    review,
    shareEntity,
    variant = 'cinematic',
    triggerRef,
}) => {
    const captureRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [shareFeedback, setShareFeedback] = useState<string | null>(null);
    const [localImages, setLocalImages] = useState<{ hero: string; avatar: string }>({ hero: '', avatar: '' });

    const entity = useMemo<ShareEntityPayload>(() => {
        if (shareEntity && isSupportedEntityType(shareEntity.type)) {
            return shareEntity;
        }

        if (review) {
            const reviewUrl = typeof window !== 'undefined'
                ? `${window.location.origin}/group/${review.placeId || ''}/${encodeURIComponent(review.itemName || '')}`
                : '';
            return {
                type: 'review',
                id: review.id,
                title: review.itemName || 'Reseña',
                subtitle: review.placeName || 'Lugar',
                description: review.comment || '',
                route: review.placeId && review.itemName ? `/group/${review.placeId}/${encodeURIComponent(review.itemName)}` : undefined,
                url: reviewUrl,
                imageUrl: review.photoUrl || review.placeMainImage,
                score: review.overallRating,
            };
        }

        if (place) {
            const placeUrl = typeof window !== 'undefined' ? `${window.location.origin}/place/${place.placeId}` : '';
            return {
                type: 'place',
                id: place.placeId,
                title: place.name || 'Lugar',
                subtitle: place.address || '',
                description: place.reviewCount ? `${place.reviewCount} reseñas publicadas` : '',
                route: place.placeId ? `/place/${place.placeId}` : undefined,
                url: placeUrl,
                imageUrl: place.photoUrl,
                score: place.avgScore,
            };
        }

        return DEFAULT_ENTITY;
    }, [shareEntity, review, place]);

    const theme = VARIANT_THEMES[variant] || VARIANT_THEMES.cinematic;
    const score = review?.overallRating ?? place?.avgScore ?? entity.score;
    const scoreColor = SCORE_BUBBLE(score);
    const heroImage = localImages.hero || review?.photoUrl || place?.photoUrl || entity.imageUrl || '';
    const avatarImage = localImages.avatar || review?.authorPhoto || (entity.type === 'profile' ? entity.imageUrl || '' : '');
    const hasScore = Number.isFinite(score as number);
    const createdAtLabel = toReadableDate(review);

    const titleText = entity.title || 'Listopic';
    const subtitleText = entity.subtitle || '';
    const descriptionText = (review?.comment || entity.description || '').trim();
    const authorLabel = review?.authorName || (entity.type === 'profile' ? entity.title : 'Comunidad Listopic');

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
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
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
                loadAsBlobUrl(review?.authorPhoto || (entity.type === 'profile' ? entity.imageUrl : undefined)),
            ]);

            setLocalImages({ hero: heroBlob, avatar: avatarBlob });
            await new Promise((resolve) => setTimeout(resolve, 100));

            if (!captureRef.current) return;

            const canvas = await html2canvas(captureRef.current, {
                useCORS: true,
                scale: 2,
                backgroundColor: null,
                logging: false,
                width: EXPORT_WIDTH,
                height: EXPORT_HEIGHT,
            });

            const dataUrl = canvas.toDataURL('image/png', 1.0);
            setPreviewImage(dataUrl);
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

            await navigator.clipboard.writeText(entity.url || (typeof window !== 'undefined' ? window.location.href : ''));
            setShareFeedback('Tu dispositivo no soporta compartir imagen. Copiamos el enlace.');
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
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '56px',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '58px',
                            overflow: 'hidden',
                            background: theme.cardBg,
                            border: `2px solid ${theme.accent}33`,
                            boxShadow: '0 26px 80px rgba(0,0,0,0.28)',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
                            {heroImage ? (
                                <img
                                    src={heroImage}
                                    alt={titleText}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        background: `linear-gradient(145deg, ${theme.accent}33, ${theme.cardBg})`,
                                    }}
                                />
                            )}

                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0.08) 44%, rgba(0,0,0,0.02) 100%)',
                                }}
                            />

                            <div style={{ position: 'absolute', top: '30px', left: '30px', right: '30px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 16px',
                                        borderRadius: '999px',
                                        background: theme.badgeBg,
                                        color: theme.badgeText,
                                        fontWeight: 800,
                                        fontSize: '20px',
                                        letterSpacing: '0.02em',
                                    }}
                                >
                                    Listopic
                                </div>

                                {hasScore && (
                                    <div
                                        style={{
                                            width: '106px',
                                            height: '106px',
                                            borderRadius: '9999px',
                                            border: `4px solid ${scoreColor}`,
                                            background: 'rgba(2,6,23,0.64)',
                                            color: '#fff',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: `0 0 24px ${scoreColor}66`,
                                        }}
                                    >
                                        <span style={{ fontWeight: 900, fontSize: '40px', lineHeight: 1 }}>{(score as number).toFixed(1)}</span>
                                        <span style={{ fontWeight: 800, fontSize: '12px', letterSpacing: '0.08em', opacity: 0.9 }}>SCORE</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div
                            style={{
                                flex: '0 0 auto',
                                padding: '30px 32px 34px',
                                background: theme.footerBg,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '18px',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <h1
                                    style={{
                                        margin: 0,
                                        color: theme.textPrimary,
                                        fontSize: titleText.length > 42 ? '48px' : '56px',
                                        lineHeight: 1.03,
                                        letterSpacing: '-0.015em',
                                        fontWeight: 900,
                                        wordBreak: 'break-word',
                                    }}
                                >
                                    {titleText}
                                </h1>

                                {subtitleText && (
                                    <p
                                        style={{
                                            margin: 0,
                                            color: theme.textSecondary,
                                            fontWeight: 700,
                                            fontSize: '29px',
                                            lineHeight: 1.2,
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {subtitleText}
                                    </p>
                                )}

                                {descriptionText && (
                                    <p
                                        style={{
                                            margin: 0,
                                            color: theme.textSecondary,
                                            opacity: 0.95,
                                            fontWeight: 500,
                                            fontSize: '23px',
                                            lineHeight: 1.35,
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {descriptionText}
                                    </p>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                    <div
                                        style={{
                                            width: '56px',
                                            height: '56px',
                                            borderRadius: '9999px',
                                            overflow: 'hidden',
                                            background: `${theme.accent}2b`,
                                            border: `2px solid ${theme.accent}55`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: theme.badgeText,
                                            fontWeight: 900,
                                            fontSize: '22px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {avatarImage ? (
                                            <img src={avatarImage} alt={authorLabel} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            (authorLabel || 'L').slice(0, 1).toUpperCase()
                                        )}
                                    </div>

                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '22px', fontWeight: 700, color: theme.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '540px' }}>
                                            {authorLabel}
                                        </div>
                                        <div style={{ fontSize: '17px', fontWeight: 600, color: theme.textSecondary }}>
                                            {createdAtLabel ? `Reseña • ${createdAtLabel}` : 'Compartido desde Listopic'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ fontSize: '19px', color: theme.accent, fontWeight: 900, letterSpacing: '0.02em' }}>listopic.app</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isPreviewOpen && previewImage && (
                <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in" onClick={() => setIsPreviewOpen(false)}>
                    <div className="bg-[#151b2e] rounded-2xl w-full max-w-md border border-white/10 overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="p-4 border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-white font-bold">Previsualización</h3>
                            <button onClick={() => setIsPreviewOpen(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="rounded-xl overflow-hidden border border-white/10 bg-black aspect-[3/4] shadow-lg">
                                <img src={previewImage} alt="Story preview" className="w-full h-full object-contain" />
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
