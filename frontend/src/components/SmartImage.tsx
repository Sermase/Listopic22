import React, { useState, useEffect } from 'react';
import { getOptimizedImageUrl } from '../utils/imageUtils';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string | undefined | null;
    width?: number; // Target width for optimization
    fallbackSrc?: string; // If both optimized and original fail
}

export const SmartImage: React.FC<SmartImageProps> = ({
    src,
    width = 400,
    className,
    alt,
    fallbackSrc,
    ...props
}) => {
    const [currentSrc, setCurrentSrc] = useState<string | undefined>(undefined);
    const [error, setError] = useState(false);
    const [usingOptimized, setUsingOptimized] = useState(false);

    useEffect(() => {
        if (!src) {
            setCurrentSrc(fallbackSrc);
            return;
        }

        const optimized = getOptimizedImageUrl(src, width);

        // If optimized is different/available, try it first
        if (optimized && optimized !== src) {
            setCurrentSrc(optimized);
            setUsingOptimized(true);
            setError(false);
        } else {
            // No optimization possible/needed, use original
            setCurrentSrc(src);
            setUsingOptimized(false);
            setError(false);
        }
    }, [src, width, fallbackSrc]);

    const handleError = () => {
        if (usingOptimized && src) {
            // If optimized failed, try original
            console.warn(`[SmartImage] Thumb failed, falling back to original: ${src}`);
            setCurrentSrc(src);
            setUsingOptimized(false);
        } else {
            // If original also failed (or we were already using original), show fallback or broken
            setError(true);
            if (fallbackSrc) setCurrentSrc(fallbackSrc);
        }
    };

    if (!currentSrc || error && !fallbackSrc) {
        // Render placeholder or return null? 
        // Let's render a gray div with same class to keep layout
        return <div className={`bg-gray-800 animate-pulse ${className}`} />;
    }

    return (
        <img
            src={currentSrc}
            alt={alt}
            className={`${className} ${error ? 'opacity-50 grayscale' : ''}`}
            onError={handleError}
            loading="lazy"
            {...props}
        />
    );
};
