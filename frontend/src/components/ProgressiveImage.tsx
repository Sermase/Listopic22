import React, { useEffect, useRef, useState } from 'react';

interface ProgressiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt?: string;
    containerClassName?: string;
    fallback?: React.ReactNode;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
    src,
    alt,
    className,
    containerClassName,
    fallback,
    onLoad: onLoadProp,
    onError: onErrorProp,
    ...props
}) => {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            setLoaded(false);
            setFailed(false);
            // Si la imagen ya estaba en cache, onLoad no se dispara.
            if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
                setLoaded(true);
            }
        });
        return () => { cancelled = true; };
    }, [src]);

    if (failed && fallback) {
        return (
            <div className={`relative overflow-hidden ${containerClassName || ''}`}>
                {fallback}
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden ${containerClassName || ''}`}>
            <div
                className={`absolute inset-0 bg-[#1c2438] transition-opacity duration-700 ${loaded ? 'opacity-0 pointer-events-none' : 'animate-pulse opacity-100'}`}
            />
            <img
                ref={imgRef}
                src={src}
                alt={alt || ''}
                onLoad={(e) => { setLoaded(true); onLoadProp?.(e); }}
                onError={(e) => {
                    setFailed(true);
                    onErrorProp?.(e);
                }}
                className={`block transition-opacity duration-700 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'} ${className || ''}`}
                {...props}
            />
        </div>
    );
};
