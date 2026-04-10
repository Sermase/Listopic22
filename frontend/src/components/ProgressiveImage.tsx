import React, { useState, useEffect, useRef } from 'react';

interface ProgressiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt?: string;
    containerClassName?: string;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({ src, alt, className, containerClassName, onLoad: onLoadProp, ...props }) => {
    const [loaded, setLoaded] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        setLoaded(false);
        // Si la imagen ya estaba en caché, onLoad no se dispara
        if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
            setLoaded(true);
        }
    }, [src]);

    return (
        <div className={`relative overflow-hidden ${containerClassName || ''}`}>
            {/* Skeleton Pulse */}
            <div
                className={`absolute inset-0 bg-[#1c2438] transition-opacity duration-700 ${loaded ? 'opacity-0 pointer-events-none' : 'animate-pulse opacity-100'}`}
            />
            {/* Image */}
            <img
                ref={imgRef}
                src={src}
                alt={alt || ''}
                onLoad={(e) => { setLoaded(true); onLoadProp?.(e); }}
                className={`transition-opacity duration-700 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'} ${className || ''}`}
                {...props}
            />
        </div>
    );
};
