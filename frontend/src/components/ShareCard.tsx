import React, { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, X } from 'lucide-react';
import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { type ReviewEntity } from '../hooks/useListDetails';
import type { ShareEntityPayload, ShareEntityType } from '../types/share';

export type ShareCardVariant = 'cinematic' | 'clean' | 'punchy';

interface ShareCardProps {
    place?: PlaceDetails;
    review?: ReviewEntity;
    shareEntity?: ShareEntityPayload;
    variant?: ShareCardVariant;
    triggerRef: React.MutableRefObject<() => void>;
}

type VariantTheme = {
    pageBg: string;
    cardBg: string;
    accent: string;
    accentSoft: string;
    border: string;
    pillBg: string;
    subtitle: string;
};

const VARIANT_THEMES: Record<ShareCardVariant, VariantTheme> = {
    cinematic: {
        pageBg: 'linear-gradient(165deg, #060b1a 0%, #0b1226 58%, #151f3f 100%)',
        cardBg: '#0d152d',
        accent: '#60a5fa',
        accentSoft: 'rgba(96,165,250,0.2)',
        border: 'rgba(148,163,184,0.28)',
        pillBg: 'rgba(10,18,36,0.68)',
        subtitle: '#cbd5e1',
    },
    clean: {
        pageBg: 'linear-gradient(165deg, #0a1020 0%, #151f36 58%, #1f2d49 100%)',
        cardBg: '#111b30',
        accent: '#93c5fd',
        accentSoft: 'rgba(148,197,253,0.18)',
        border: 'rgba(226,232,240,0.34)',
        pillBg: 'rgba(24,36,60,0.78)',
        subtitle: '#dbeafe',
    },
    punchy: {
        pageBg: 'linear-gradient(165deg, #081225 0%, #142445 58%, #1d2e59 100%)',
        cardBg: '#101b35',
        accent: '#22d3ee',
        accentSoft: 'rgba(34,211,238,0.25)',
        border: 'rgba(45,212,191,0.35)',
        pillBg: 'rgba(8,24,47,0.7)',
        subtitle: '#cffafe',
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

const isSupportedEntityType = (value: unknown): value is ShareEntityType => {
    return ['place', 'group', 'list', 'sublist', 'profile', 'app', 'review', 'link'].includes(String(value));
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
        try {
            clearBlobUrl(localImages.hero);
            clearBlobUrl(localImages.avatar);

            const [heroBlob, avatarBlob] = await Promise.all([
                loadAsBlobUrl(review?.photoUrl || place?.photoUrl || entity.imageUrl),
                loadAsBlobUrl(review?.authorPhoto || (entity.type === 'profile' ? entity.imageUrl : undefined)),
            ]);

            setLocalImages({ hero: heroBlob, avatar: avatarBlob });
            await new Promise((resolve) => setTimeout(resolve, 120));

            if (!captureRef.current) return;

            const canvas = await html2canvas(captureRef.current, {
                useCORS: true,
                scale: 2,
                backgroundColor: '#060b1a',
                logging: false,
                width: 540,
                height: 960,
                onclone: (clonedDocument) => {
                    const card = clonedDocument.querySelector('[data-story-canvas]');
                    if (card instanceof HTMLElement) {
                        card.style.width = '540px';
                        card.style.height = '960px';
                    }
                },
            });

            const dataUrl = canvas.toDataURL('image/png', 1.0);
            setPreviewImage(dataUrl);
            setIsPreviewOpen(true);
        } catch (error) {
            console.error('Share card generation error', error);
        } finally {
            setLoading(false);
        }
    };

    const downloadPreview = () => {
        if (!previewImage) return;
        const fileSlug = `${entity.type}-${entity.id || 'card'}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const anchor = document.createElement('a');
        anchor.href = previewImage;
        anchor.download = `listopic-story-${fileSlug || 'share'}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const titleText = entity.title || 'Listopic';
    const subtitleText = entity.subtitle || '';
    const descriptionText = (review?.comment || entity.description || '').trim();

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    left: '-9999px',
                    top: '0',
                    width: '540px',
                    height: '960px',
                    zIndex: -1,
                }}
            >
                <div
                    ref={captureRef}
                    data-story-canvas
                    style={{
                        width: '540px',
                        height: '960px',
                        position: 'relative',
                        overflow: 'hidden',
                        background: theme.pageBg,
                        fontFamily: "'Manrope', sans-serif",
                        color: '#ffffff',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            opacity: 0.95,
                            background: 'radial-gradient(circle at 16% 14%, rgba(255,255,255,0.08), transparent 36%)',
                        }}
                    />

                    {/* Safe zones based on Meta template guidance */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            paddingTop: '52px',
                            paddingBottom: '120px',
                            paddingLeft: '28px',
                            paddingRight: '28px',
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <div
                            style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '34px',
                                border: `1px solid ${theme.border}`,
                                background: theme.cardBg,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 28px 60px rgba(0,0,0,0.46)',
                            }}
                        >
                            <div style={{ position: 'relative', flex: '0 0 62%' }}>
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
                                            background: `linear-gradient(150deg, ${theme.accentSoft}, rgba(15,23,42,0.75))`,
                                        }}
                                    />
                                )}

                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.42) 100%)',
                                    }}
                                />

                                {entity.type === 'profile' && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            right: '16px',
                                            bottom: '-34px',
                                            width: '78px',
                                            height: '78px',
                                            borderRadius: '9999px',
                                            border: `3px solid ${theme.cardBg}`,
                                            background: '#1e293b',
                                            overflow: 'hidden',
                                            boxShadow: '0 12px 22px rgba(0,0,0,0.35)',
                                        }}
                                    >
                                        {avatarImage ? (
                                            <img src={avatarImage} alt={titleText} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '28px' }}>
                                                {(titleText || 'U').slice(0, 1).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div
                                style={{
                                    flex: '1 1 auto',
                                    padding: '22px 20px 18px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <h1
                                        style={{
                                            margin: 0,
                                            fontSize: titleText.length > 34 ? '30px' : '34px',
                                            lineHeight: 1.08,
                                            fontWeight: 900,
                                            wordBreak: 'break-word',
                                            letterSpacing: '-0.015em',
                                        }}
                                    >
                                        {titleText}
                                    </h1>

                                    {subtitleText && (
                                        <p
                                            style={{
                                                margin: 0,
                                                fontSize: '16px',
                                                lineHeight: 1.25,
                                                color: theme.subtitle,
                                                fontWeight: 600,
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
                                                fontSize: '13px',
                                                lineHeight: 1.4,
                                                color: '#dbeafe',
                                                opacity: 0.92,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 3,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {descriptionText}
                                        </p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px' }}>
                                    {hasScore ? (
                                        <div
                                            style={{
                                                width: '84px',
                                                height: '84px',
                                                borderRadius: '9999px',
                                                border: `2px solid ${scoreColor}`,
                                                background: 'rgba(15,23,42,0.55)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: `0 0 18px ${scoreColor}55`,
                                                flexShrink: 0,
                                            }}
                                        >
                                            <span style={{ fontSize: '31px', fontWeight: 900, lineHeight: 1 }}>{(score as number).toFixed(1)}</span>
                                            <span style={{ fontSize: '9px', letterSpacing: '0.09em', textTransform: 'uppercase', color: '#cbd5e1', fontWeight: 800 }}>Score</span>
                                        </div>
                                    ) : (
                                        <div style={{ width: '84px', height: '84px', flexShrink: 0 }} />
                                    )}

                                    <div style={{ textAlign: 'right', minWidth: 0 }}>
                                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', marginTop: '2px' }}>Listopic</div>
                                        <div style={{ fontSize: '11px', color: '#93c5fd', marginTop: '1px' }}>listopic.app</div>
                                    </div>
                                </div>
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
                            <div className="rounded-xl overflow-hidden border border-white/10 bg-black aspect-[9/16] shadow-lg">
                                <img src={previewImage} alt="Story preview" className="w-full h-full object-contain" />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={downloadPreview}
                                    className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Descargar PNG
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsPreviewOpen(false)}
                                    className="py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-colors"
                                >
                                    Cerrar
                                </button>
                            </div>

                            <p className="text-xs text-gray-400 text-center">
                                Descarga la imagen y súbela en Instagram Stories.
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
