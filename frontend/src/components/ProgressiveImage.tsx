import React, { useState, useEffect } from 'react';

interface ProgressiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt?: string;
    containerClassName?: string;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({ src, alt, className, containerClassName, ...props }) => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        setLoaded(false); // reset if src changes
    }, [src]);

    return (
        <div className={`relative overflow-hidden ${containerClassName || ''}`}>
            {/* Skeleton Pulse */}
            <div
                className={`absolute inset-0 bg-[#1c2438] animate-pulse transition-opacity duration-700 ${loaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            />
            {/* Image */}
            <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                className={`transition-opacity duration-700 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'} ${className || ''}`}
                {...props}
            />
        </div>
    );
};
