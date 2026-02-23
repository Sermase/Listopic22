import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { createPortal } from 'react-dom';

interface LightboxProps {
    isOpen: boolean;
    onClose: () => void;
    images: string[];
    initialIndex?: number;
}

export const Lightbox: React.FC<LightboxProps> = ({ isOpen, onClose, images, initialIndex = 0 }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);
    const [isZoomed, setIsZoomed] = useState(false);

    // Sync index if initial changes (e.g. reopening)
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
            setScale(1);
            setIsZoomed(false);
        }
    }, [isOpen, initialIndex]);

    // Keyboard Navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };

        window.addEventListener('keydown', handleKeyDown);
        // Lock body scroll
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, currentIndex]);

    const handlePrev = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
        resetZoom();
    };

    const handleNext = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
        resetZoom();
    };

    const resetZoom = () => {
        setScale(1);
        setIsZoomed(false);
    };

    const toggleZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isZoomed) {
            setScale(1);
            setIsZoomed(false);
        } else {
            setScale(2);
            setIsZoomed(true);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center animate-fade-in"
            onClick={onClose}
        >
            {/* Toolbar */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent">
                <span className="text-white/80 text-sm font-mono">
                    {currentIndex + 1} / {images.length}
                </span>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleZoom}
                        className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"
                    >
                        {isZoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Navigation Buttons (Desktop) */}
            <button
                onClick={handlePrev}
                className="absolute left-4 z-50 p-3 bg-black/50 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-all hidden sm:flex backdrop-blur-sm border border-white/5"
            >
                <ChevronLeft className="w-8 h-8" />
            </button>

            <button
                onClick={handleNext}
                className="absolute right-4 z-50 p-3 bg-black/50 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-all hidden sm:flex backdrop-blur-sm border border-white/5"
            >
                <ChevronRight className="w-8 h-8" />
            </button>

            {/* Main Image Container */}
            <div
                className="relative w-full h-full flex items-center justify-center p-4 sm:p-12 overflow-hidden"
            >
                <img
                    key={currentIndex} // Force re-render for animation
                    src={images[currentIndex]}
                    alt={`Gallery ${currentIndex}`}
                    className="max-w-full max-h-full object-contain shadow-2xl transition-transform duration-300 ease-out select-none"
                    style={{
                        transform: `scale(${scale})`,
                        cursor: isZoomed ? 'zoom-out' : 'zoom-in'
                    }}
                    onClick={toggleZoom}
                    draggable={false}
                />
            </div>

            {/* Mobile Thumb Strip (Optional - kept simple for now) */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] pb-2 scrollbar-hide z-50">
                {images.map((img, idx) => (
                    <button
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); resetZoom(); }}
                        className={`w-10 h-10 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === currentIndex ? 'border-indigo-500 opacity-100 scale-110' : 'border-transparent opacity-40 hover:opacity-80'
                            }`}
                    >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                ))}
            </div>
        </div>,
        document.body
    );
};
