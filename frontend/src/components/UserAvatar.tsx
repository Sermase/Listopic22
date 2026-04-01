import React from 'react';

interface UserAvatarProps {
    photoUrl?: string | null;
    displayName?: string;
    userType?: string | string[];
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}

const GRADIENT: Record<string, string> = {
    jefe:    'from-emerald-400 via-green-400 to-teal-400',
    critico: 'from-yellow-400 via-amber-400 to-orange-400',
    bot:     'from-slate-300 via-gray-300 to-zinc-400',
    default: 'from-indigo-500 via-purple-500 to-pink-500',
};

const SIZES = {
    xs: { wrap: 'w-6 h-6',   img: 'w-6 h-6',   pad: 'p-[1.5px]', text: 'text-[9px]' },
    sm: { wrap: 'w-8 h-8',   img: 'w-8 h-8',   pad: 'p-[2px]',   text: 'text-xs' },
    md: { wrap: 'w-10 h-10', img: 'w-10 h-10', pad: 'p-[2px]',   text: 'text-sm' },
    lg: { wrap: 'w-14 h-14', img: 'w-14 h-14', pad: 'p-[2.5px]', text: 'text-base' },
};

export function getUserTypeGradient(userType?: string | string[]): string {
    const types: string[] = Array.isArray(userType)
        ? userType
        : userType ? [userType] : [];
    if (types.includes('jefe'))    return GRADIENT.jefe;
    if (types.includes('critico')) return GRADIENT.critico;
    if (types.includes('bot'))     return GRADIENT.bot;
    return GRADIENT.default;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
    photoUrl,
    displayName,
    userType,
    size = 'md',
    className = '',
}) => {
    const gradient = getUserTypeGradient(userType);
    const s = SIZES[size];
    const initials = (displayName || 'U')[0].toUpperCase();
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'U')}&background=374151&color=fff`;

    return (
        <div className={`relative shrink-0 ${s.wrap} ${className}`}>
            {/* Glow blur */}
            <div className={`absolute inset-0 rounded-full bg-gradient-to-tr ${gradient} opacity-70 blur-[3px]`} />
            {/* Ring + image */}
            <div className={`relative ${s.wrap} rounded-full ${s.pad} bg-gradient-to-tr ${gradient}`}>
                <div className="w-full h-full rounded-full border-2 border-[#0b1021] overflow-hidden bg-gray-800">
                    <img
                        src={photoUrl || fallback}
                        alt={displayName || 'Usuario'}
                        className="w-full h-full object-cover"
                    />
                </div>
            </div>
        </div>
    );
};
