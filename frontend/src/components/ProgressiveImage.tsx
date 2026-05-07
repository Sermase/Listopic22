import React, { useEffect, useRef, useState } from 'react';

const FIREBASE_STORAGE_HOST = 'firebasestorage.googleapis.com';

const getFirebaseStorageRetryUrl = (src: string): string | null => {
    try {
        const url = new URL(src);
        if (!url.hostname.includes(FIREBASE_STORAGE_HOST) || !url.searchParams.has('token')) {
            return null;
        }
        url.searchParams.delete('token');
        return url.toString();
    } catch {
        return null;
    }
};

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
    const [effectiveSrc, setEffectiveSrc] = useState(src);
    const imgRef = useRef<HTMLImageElement>(null);
    const retriedFirebaseStorageRef = useRef(false);

    useEffect(() => {
        setEffectiveSrc(src);
        retriedFirebaseStorageRef.current = false;
    }, [src]);

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
    }, [effectiveSrc]);

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
                className={`absolute inset-0 bg-gray-200 dark:bg-[#1c2438] transition-opacity duration-700 ${loaded ? 'opacity-0 pointer-events-none' : 'animate-pulse opacity-100'}`}
            />
            <img
                ref={imgRef}
                src={effectiveSrc}
                alt={alt || ''}
                loading={props.loading ?? 'lazy'}
                decoding={props.decoding ?? 'async'}
                onLoad={(e) => { setLoaded(true); onLoadProp?.(e); }}
                onError={(e) => {
                    const retrySrc = getFirebaseStorageRetryUrl(effectiveSrc);
                    if (!retriedFirebaseStorageRef.current && retrySrc && retrySrc !== effectiveSrc) {
                        retriedFirebaseStorageRef.current = true;
                        setLoaded(false);
                        setFailed(false);
                        setEffectiveSrc(retrySrc);
                        return;
                    }

                    setFailed(true);
                    onErrorProp?.(e);
                }}
                className={`block transition-opacity duration-700 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'} ${className || ''}`}
                {...props}
            />
        </div>
    );
};
