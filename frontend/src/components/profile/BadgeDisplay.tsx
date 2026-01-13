import React from 'react';
import { useBadges } from '../../hooks/useBadges';
import { Tag } from 'lucide-react';

interface BadgeDisplayProps {
    earnedBadgeIds?: string[];
    showEmpty?: boolean;
}

export const BadgeDisplay: React.FC<BadgeDisplayProps> = ({ earnedBadgeIds = [], showEmpty = false }) => {
    const { badges, loading } = useBadges();

    if (loading) return null; // Or a small skeleton

    if (!earnedBadgeIds || earnedBadgeIds.length === 0) {
        if (!showEmpty) return null;
        return <div className="text-xs text-gray-500 italic">Sin medallas aún</div>;
    }

    // Filter only earned and active badges (unless we want to show historical ones even if inactive)
    const earnedBadges = earnedBadgeIds
        .map(id => badges.find(b => b.id === id))
        .filter(b => !!b); // Remove undefined (if badge definition deleted)

    if (earnedBadges.length === 0 && !showEmpty) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {earnedBadges.map((badge) => (
                <div
                    key={badge!.id}
                    className="group relative flex items-center justify-center p-1.5 bg-[#151b2e] border border-white/10 rounded-lg hover:border-amber-500/50 transition-colors cursor-help"
                    title={`${badge!.name}: ${badge!.descriptionPublic}`}
                >
                    {badge!.imageUrl ? (
                        <img src={badge!.imageUrl} alt={badge!.name} className="w-8 h-8 object-contain" />
                    ) : (
                        <Tag className="w-6 h-6 text-amber-500" />
                    )}

                    {/* Tooltip on Hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-black/90 backdrop-blur border border-white/10 rounded-lg p-2 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        <div className="text-indigo-400 font-bold text-xs mb-1">{badge!.name}</div>
                        <div className="text-[10px] text-gray-300 leading-tight">{badge!.descriptionPublic}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};
