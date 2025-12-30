import React from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus } from 'lucide-react';
import { type UserProfileEntity } from '../hooks/useUserProfile';

interface UserCardProps {
    user: UserProfileEntity;
}

export const UserCard: React.FC<UserCardProps> = ({ user }) => {
    return (
        <Link to={`/profile/${user.uid}`} className="group relative bg-[#151b2e] rounded-xl p-6 flex flex-col items-center border border-white/5 hover:border-indigo-500/50 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-1 mb-4 group-hover:scale-110 transition-transform">
                <div className="w-full h-full rounded-full bg-[#151b2e] overflow-hidden flex items-center justify-center border-2 border-[#151b2e]">
                    {user.photoUrl ? (
                        <img src={user.photoUrl} alt={user.displayName} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-2xl font-bold text-white">{user.displayName?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                </div>
            </div>

            {/* Info */}
            <div className="text-center w-full mb-4">
                <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                    {user.displayName || 'Usuario'}
                </h3>
                <p className="text-sm text-gray-500 truncate">@{user.username || 'user'}</p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-gray-400 mb-4 bg-black/20 px-3 py-1.5 rounded-full">
                <span className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-indigo-400" />
                    {user.followersCount || 0} seguidores
                </span>
            </div>

            {/* Bio */}
            {user.bio && (
                <p className="text-xs text-gray-400 text-center line-clamp-2 w-full mb-4 px-2">
                    {user.bio}
                </p>
            )}

            {/* Action Placeholder (Follow) */}
            <button className="mt-auto w-full py-2 rounded-lg bg-white/5 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2">
                <UserPlus className="w-3 h-3" />
                Seguir
            </button>
        </Link>
    );
};
