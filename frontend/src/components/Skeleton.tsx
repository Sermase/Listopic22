import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rounded',
    ...props
}) => {
    let baseClass = 'bg-[#1c2438] animate-pulse';

    switch (variant) {
        case 'text':
            baseClass += ' rounded-md h-4 w-full';
            break;
        case 'circular':
            baseClass += ' rounded-full';
            break;
        case 'rectangular':
            baseClass += ' rounded-none';
            break;
        case 'rounded':
        default:
            baseClass += ' rounded-xl';
            break;
    }

    return (
        <div
            className={`${baseClass} ${className}`}
            {...props}
        />
    );
};
