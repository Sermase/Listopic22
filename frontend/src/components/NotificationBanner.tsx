import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Heart, UserPlus, MessageSquare, Star, Award, List } from 'lucide-react';
import { useNotificationBanner } from '../context/NotificationBannerContext';

const ICON_MAP: Record<string, React.ReactNode> = {
    new_message: <MessageSquare className="w-3.5 h-3.5 text-blue-400" />,
    new_follower: <UserPlus className="w-3.5 h-3.5 text-[var(--lt-accent)]" />,
    review_like: <Heart className="w-3.5 h-3.5 text-pink-400" />,
    review_comment: <MessageSquare className="w-3.5 h-3.5 text-blue-400" />,
    list_follow: <List className="w-3.5 h-3.5 text-cyan-400" />,
    level_up: <Star className="w-3.5 h-3.5 text-amber-400" />,
    badge_earned: <Award className="w-3.5 h-3.5 text-amber-400" />,
};

export const NotificationBanner: React.FC = () => {
    const { current, dismiss } = useNotificationBanner();
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        if (!current) {
            setVisible(false);
            setFading(false);
            return;
        }

        // Aparecer
        setFading(false);
        setVisible(true);

        // Esperar 1.5s → fade out → dismiss
        const fadeTimer = setTimeout(() => setFading(true), 1500);
        const dismissTimer = setTimeout(() => dismiss(), 1500 + 400);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(dismissTimer);
        };
    }, [current, dismiss]);

    if (!current || !visible) return null;

    const handleClick = () => {
        dismiss();
        if (current.link) navigate(current.link);
    };

    const icon = ICON_MAP[current.type] || <Bell className="w-3.5 h-3.5 text-gray-400" />;

    return (
        <div
            onClick={handleClick}
            className="fixed left-1/2 z-[9998] cursor-pointer"
            style={{
                top: 'calc(env(safe-area-inset-top) + 68px)',
                transform: 'translateX(-50%)',
                transition: 'opacity 400ms ease',
                opacity: fading ? 0 : 1,
                pointerEvents: fading ? 'none' : 'auto',
            }}
        >
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 shadow-xl max-w-[300px]">
                {current.senderPhoto ? (
                    <img
                        src={current.senderPhoto}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                    />
                ) : (
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                        {icon}
                    </div>
                )}
                <span className="text-white text-xs font-medium truncate">{current.message}</span>
                <div className="shrink-0">{icon}</div>
            </div>
        </div>
    );
};
