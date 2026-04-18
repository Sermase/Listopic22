import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useUsers } from '../hooks/useUsers';
import { UserCard } from '../components/UserCard';

export const UsersPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const { users, loading } = useUsers();

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] pt-safe-24 pb-20 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-12 text-center">
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
                        Comunidad Listopic
                    </h1>
                    <p className="text-gray-400 max-w-2xl mx-auto mb-8">
                        Descubre creadores, sigue a tus amigos y encuentra expertos en tus temas favoritos.
                    </p>

                    {/* Search Field */}
                    <div className="relative max-w-md mx-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-500" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar usuarios..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl leading-5 bg-[var(--lt-card-strong)] text-gray-300 placeholder-gray-500 focus:outline-none focus:bg-gray-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors shadow-lg"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {users.map(user => (
                            <UserCard key={user.uid} user={user as any} />
                        ))}

                        {users.length === 0 && (
                            <div className="col-span-full text-center py-12 text-gray-500 bg-[var(--lt-card-strong)]/50 rounded-xl border border-dashed border-white/5">
                                No se encontraron usuarios.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
