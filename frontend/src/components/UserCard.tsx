import React from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, MessageCircle } from 'lucide-react';
import { type UserProfileEntity } from '../hooks/useUserProfile';
import { getUserTypeGradient } from './UserAvatar';

interface UserCardProps {
    user: UserProfileEntity;
}

export const UserCard: React.FC<UserCardProps> = ({ user }) => {
    return (
        <Link to={`/profile/${user.uid}`} className="group relative bg-[var(--lt-card-strong)] rounded-xl p-6 flex flex-col items-center border border-white/5 hover:border-[var(--lt-accent-border)] transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--lt-accent-shadow)]">
            {/* Avatar */}
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getUserTypeGradient(user.userType)} p-1 mb-4 group-hover:scale-110 transition-transform`}>
                <div className="w-full h-full rounded-full bg-[var(--lt-card-strong)] overflow-hidden flex items-center justify-center border-2 border-[var(--lt-card-strong)]">
                    {user.photoUrl ? (
                        <img src={user.photoUrl} alt={user.displayName} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-2xl font-bold text-white">{user.displayName?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                </div>
            </div>

            {/* Info */}
            <div className="text-center w-full mb-4">
                <h3 className="text-lg font-bold text-white group-hover:text-[var(--lt-accent)] transition-colors truncate">
                    {user.displayName || 'Usuario'}
                </h3>
                <p className="text-sm text-gray-500 truncate">@{user.username || 'user'}</p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-gray-400 mb-4 bg-black/20 px-3 py-1.5 rounded-full">
                <span className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-[var(--lt-accent)]" />
                    {user.followersCount || 0} seguidores
                </span>
                {user.reviewsCount !== undefined && (
                    <span className="flex items-center gap-1.5 border-l border-white/10 pl-4">
                        <MessageCircle className="w-3 h-3 text-emerald-400" />
                        {user.reviewsCount} reseñas
                    </span>
                )}
            </div>

            {/* Bio */}
            {user.bio && (
                <p className="text-xs text-gray-400 text-center line-clamp-2 w-full mb-4 px-2">
                    {user.bio}
                </p>
            )}

            {/* Action Placeholder (Follow) */}
            <button className="mt-auto w-full py-2 rounded-lg bg-white/5 hover:bg-[var(--lt-accent)] text-[var(--lt-accent)] hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2">
                <UserPlus className="w-3 h-3" />
                Seguir
            </button>
        </Link>
    );
};
