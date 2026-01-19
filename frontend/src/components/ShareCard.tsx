import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { X } from 'lucide-react';
import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { type ReviewEntity } from '../hooks/useListDetails';

interface ShareCardProps {
    place?: PlaceDetails;
    review?: ReviewEntity;
    triggerRef: React.MutableRefObject<() => void>;
}

export const ShareCard: React.FC<ShareCardProps> = ({ place, review, triggerRef }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isFallbackOpen, setIsFallbackOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // State for pre-loaded blob URLs (CORS bypass)
    const [localImages, setLocalImages] = useState({
        main: '',
        author: '',
    });

    // Determine content source
    const mainPhotoUrl = review?.photoUrl || place?.photoUrl;
    const authorPhotoUrl = review?.authorPhoto;

    // Pre-load images as Blobs to bypass CORS during capture
    const preloadImages = async () => {
        const loadBlob = async (url?: string) => {
            if (!url) return '';
            const cacheBustedUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
            try {
                // Append time param to bypass cache if needed
                const response = await fetch(cacheBustedUrl);
                const blob = await response.blob();
                return URL.createObjectURL(blob);
            } catch (e) {
                console.warn("Failed to preload image:", url, e);
                return cacheBustedUrl; // Fallback to original with cache buster to force fresh CORS request in html2canvas
            }
        };

        const [mainBlob, authorBlob] = await Promise.all([
            loadBlob(mainPhotoUrl),
            loadBlob(authorPhotoUrl)
        ]);

        setLocalImages({ main: mainBlob, author: authorBlob });
    };

    // Expose the generate function to the parent
    triggerRef.current = async () => {
        if (!cardRef.current || loading) return;
        setLoading(true);

        try {
            // 1. Preload images
            await preloadImages();

            // 2. Wait a tick for React to render the new blob URLs
            await new Promise(resolve => setTimeout(resolve, 500));

            // 3. Capture
            if (!cardRef.current) throw new Error("Card ref missing");

            const canvas = await html2canvas(cardRef.current, {
                useCORS: true,
                scale: 2, // 2x is enough for 1080x1920
                backgroundColor: '#0b1021',
                logging: false,
                width: 540, // Capture at logical size
                height: 960,
                onclone: (clonedDoc) => {
                    const clonedElement = clonedDoc.querySelector('[data-share-card]');
                    if (clonedElement instanceof HTMLElement) {
                        clonedElement.style.width = '540px';
                        clonedElement.style.height = '960px';
                        clonedElement.style.transform = 'none';
                        clonedElement.style.position = 'relative';
                        clonedElement.style.left = '0';
                        clonedElement.style.top = '0';
                    }
                }
            });

            const dataUrl = canvas.toDataURL('image/png', 1.0);

            // Cleanup Blobs
            if (localImages.main && localImages.main.startsWith('blob:')) URL.revokeObjectURL(localImages.main);
            if (localImages.author && localImages.author.startsWith('blob:')) URL.revokeObjectURL(localImages.author);

            // Convert Base64 to Blob for sharing
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `share_${place?.placeId || 'review'}.png`, { type: 'image/png' });

            // Check if Web Share API supports file sharing
            try {
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: review ? `Reseña de ${review.itemName}` : place?.name,
                        text: review
                            ? `Mira esta reseña de ${review.itemName} en ${place?.name || 'Listopic'}`
                            : `Mira este lugar en Listopic: ${place?.name}`,
                        files: [file],
                    });
                } else {
                    throw new Error("Share API not supported or validation failed");
                }
            } catch (shareError) {
                console.warn("Share failed, showing fallback:", shareError);
                setGeneratedImage(dataUrl);
                setIsFallbackOpen(true);
            }
        } catch (error) {
            console.error("Error generating or sharing card:", error);
        } finally {
            setLoading(false);
        }
    };

    // Helper for score color
    const getScoreColor = (score?: number) => {
        if (!score) return '#9ca3af';
        if (score >= 9) return '#34d399'; // Emerald
        if (score >= 7) return '#a3e635'; // Lime
        if (score >= 5) return '#facc15'; // Yellow
        return '#f87171'; // Red
    };

    const scoreColor = getScoreColor(review ? review.overallRating : place?.avgScore);

    // Generate Radar Chart Logic
    const ChartComponent = () => {
        if (!review?.scores || !review.criteriaDefinition) return null;

        const criteriaKeys = Object.keys(review.scores);
        // Only show chart if we have enough data, otherwise it looks broken
        if (criteriaKeys.length < 3) return null;

        const size = 180; // Slightly smaller to fit comment
        const center = size / 2;
        const radius = (size / 2) - 10;
        const angleSlice = (Math.PI * 2) / criteriaKeys.length;

        const getCoords = (value: number, index: number, max: number = 10) => {
            const angle = index * angleSlice - Math.PI / 2;
            const r = (value / max) * radius;
            return {
                x: center + r * Math.cos(angle),
                y: center + r * Math.sin(angle)
            };
        };

        const levels = [3, 6, 9]; // Simplified grid
        const pathPoints = criteriaKeys.map((key, i) => {
            const score = review.scores![key] || 0;
            const label = review.criteriaDefinition![key]; // Keep for max ref if needed
            const max = label?.max || 10;
            const { x, y } = getCoords(score, i, max);
            return `${x},${y}`;
        }).join(' ');

        return (
            <div style={{ position: 'relative', width: size, height: size, margin: '0 0' }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
                    {/* Background Web */}
                    {levels.map((level) => {
                        const points = criteriaKeys.map((_, i) => {
                            const { x, y } = getCoords(level, i, 10);
                            return `${x},${y}`;
                        }).join(' ');
                        return <polygon key={level} points={points} fill="none" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={1} />;
                    })}

                    {/* Axis Lines */}
                    {criteriaKeys.map((_, i) => {
                        const { x, y } = getCoords(10, i, 10);
                        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#ffffff" strokeOpacity={0.1} strokeWidth={1} />;
                    })}

                    {/* Data Polygon */}
                    <polygon
                        points={pathPoints}
                        fill={`${scoreColor}40`} // Dynamic color with opacity
                        stroke={scoreColor}
                        strokeWidth={2}
                        strokeLinejoin="round"
                    />

                    {/* Simple Dots for Vertexes (No Labels) */}
                    {criteriaKeys.map((key, i) => {
                        const score = review.scores![key] || 0;
                        const labelDef = review.criteriaDefinition![key];
                        const max = labelDef?.max || 10;
                        const { x, y } = getCoords(score, i, max);
                        return <circle key={key} cx={x} cy={y} r={3} fill={scoreColor} />;
                    })}
                </svg>
            </div>
        );
    };

    return (
        <>
            {/* CAPTURE CONTAINER */}
            <div
                style={{
                    position: 'fixed',
                    left: '-9999px',
                    top: '0',
                    zIndex: -1,
                    width: '540px',
                    height: '960px',
                }}
            >
                <div
                    ref={cardRef}
                    data-share-card
                    style={{
                        width: '540px',
                        height: '960px',
                        backgroundColor: '#0b1021', // Dark Navy Background
                        position: 'relative',
                        overflow: 'hidden',
                        fontFamily: "'Manrope', sans-serif",
                        color: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {/* 1. BACKGROUND IMAGE (Top 65%) */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '65%', zIndex: 0 }}>
                        {localImages.main || mainPhotoUrl ? (
                            <img
                                src={localImages.main || mainPhotoUrl}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                alt="Background"
                            />
                        ) : (
                            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #1e1b4b, #312e81)' }} />
                        )}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to bottom, rgba(11,16,33,0) 0%, rgba(11,16,33,0.1) 40%, rgba(11,16,33,0.8) 70%, #0b1021 100%)'
                        }} />
                    </div>

                    {/* 2. MAIN CONTENT AREA */}
                    <div style={{
                        position: 'relative',
                        zIndex: 10,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '32px'
                    }}>

                        {/* INFO BODY */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px',
                            background: 'rgba(11, 16, 33, 0.6)',
                            backdropFilter: 'blur(4px)',
                            borderRadius: '32px',
                            padding: '24px',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                        }}>

                            {/* Header: Title & Location */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
                                {/* Badges Row */}
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {review?.placeCity && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '8px'
                                        }}>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {review.placeCity.toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    {review?.listName && (
                                        <div style={{
                                            background: '#4f46e5', padding: '4px 10px', borderRadius: '8px',
                                            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)'
                                        }}>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                                                {review.listName}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <h1 style={{
                                    fontSize: review?.itemName?.length && review.itemName.length > 20 ? '32px' : '40px',
                                    fontWeight: 900,
                                    lineHeight: 1.1,
                                    color: '#fff',
                                    textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                                }}>
                                    {review?.itemName || place?.name}
                                </h1>
                                <span style={{ fontSize: '15px', color: '#94a3b8', fontWeight: 500 }}>
                                    @{review?.placeName || place?.name}
                                </span>
                            </div>

                            {/* Middle: Chart + Score */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                                {/* Chart Area */}
                                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                    {review?.scores ? <ChartComponent /> : <div style={{ width: 50 }} />}
                                </div>

                                {/* Score Bubble */}
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100px',
                                    height: '100px',
                                    borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${scoreColor}20, ${scoreColor}05)`,
                                    border: `2px solid ${scoreColor}`,
                                    boxShadow: `0 0 20px ${scoreColor}40`,
                                    marginLeft: '16px'
                                }}>
                                    <span style={{ fontSize: '42px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                                        {(review ? review.overallRating : place?.avgScore)?.toFixed(1)}
                                    </span>
                                    <span style={{ fontSize: '10px', color: scoreColor, fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                                        Puntuación
                                    </span>
                                </div>
                            </div>

                            {/* Comment (Truncated) */}
                            {review?.comment && (
                                <div style={{
                                    background: 'rgba(0,0,0,0.2)',
                                    borderRadius: '16px',
                                    padding: '16px',
                                    borderTop: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <p style={{
                                        fontSize: '14px',
                                        lineHeight: 1.5,
                                        color: '#e2e8f0',
                                        fontStyle: 'italic',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        margin: 0
                                    }}>
                                        "{review.comment}"
                                    </p>
                                </div>
                            )}

                        </div>

                        {/* FOOTER */}
                        <div style={{
                            marginTop: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0 8px'
                        }}>
                            {/* Author */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {localImages.author || authorPhotoUrl ? (
                                    <img src={localImages.author || authorPhotoUrl} style={{ width: '40px', height: '40px', borderRadius: '50%', border: `2px solid ${scoreColor}`, objectFit: 'cover' }} alt="User" />
                                ) : (
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: scoreColor, color: '#0b1021', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                        {review?.authorName?.[0] || 'U'}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                                        {review?.authorName || 'Usuario'}
                                    </span>
                                </div>
                            </div>

                            {/* Branding */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.9 }}>
                                <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: 'linear-gradient(to top right, #06b6d4, #4f46e5)' }} />
                                <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.05em', color: 'white' }}>Listopic</span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* FALLBACK MODAL (For Android WebView / Desktop) */}
            {isFallbackOpen && generatedImage && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in" onClick={() => setIsFallbackOpen(false)}>
                    <div className="bg-[#151b2e] rounded-2xl w-full max-w-sm border border-white/10 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-white font-bold">Tarjeta Lista</h3>
                            <button onClick={() => setIsFallbackOpen(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-4">
                            {/* Preview Image */}
                            <div className="rounded-xl overflow-hidden border border-white/10 shadow-lg relative aspect-[9/16] w-full max-h-[60vh] bg-black">
                                <img src={generatedImage} alt="Share Card" className="w-full h-full object-contain" />
                            </div>

                            <p className="text-center text-gray-400 text-xs">
                                Mantén pulsada la imagen para compartirla en Instagram Stories
                            </p>

                            <button
                                onClick={() => setIsFallbackOpen(false)}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading Overlay */}
            {loading && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white/10 p-4 rounded-2xl animate-spin border-t-2 border-indigo-500 w-12 h-12"></div>
                </div>
            )}
        </>
    );
};
