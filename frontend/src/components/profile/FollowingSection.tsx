import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, documentId } from 'firebase/firestore';
import { db } from '../../firebase';
import { Link } from 'react-router-dom';

interface FollowingSectionProps {
    targetUserId: string;
    onNavigateToProfile?: () => void;
}

export const FollowingSection: React.FC<FollowingSectionProps> = ({
    targetUserId,
    onNavigateToProfile,
}) => {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchItems = async () => {
            setLoading(true);
            setItems([]);
            try {
                const qIds = query(collection(db, 'users', targetUserId, 'following'));
                const snapIds = await getDocs(qIds);

                if (snapIds.empty) {
                    setItems([]);
                    return;
                }

                const ids = snapIds.docs.map(d => d.id);

                const chunks: string[][] = [];
                for (let i = 0; i < ids.length; i += 10) {
                    chunks.push(ids.slice(i, i + 10));
                }

                const fetchedItems: any[] = [];

                for (const chunk of chunks) {
                    try {
                        const qDetails = query(
                            collection(db, 'users'),
                            where(documentId(), 'in', chunk)
                        );
                        const snapDetails = await getDocs(qDetails);
                        fetchedItems.push(...snapDetails.docs.map(d => ({ id: d.id, ...d.data() })));
                    } catch (e) {
                        console.warn('Error fetching followed users chunk', e);
                    }
                }

                const sortedItems = fetchedItems.sort((a, b) => {
                    const usernameA = (a.username || a.displayName || '').toString().toLowerCase();
                    const usernameB = (b.username || b.displayName || '').toString().toLowerCase();
                    return usernameA.localeCompare(usernameB, 'es');
                });

                setItems(sortedItems);
            } catch (err) {
                console.error('Error fetching following users', err);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, [targetUserId]);

    return (
        <div className="animate-fade-in">
            {loading ? (
                <div className="py-20 text-center text-gray-500">Cargando...</div>
            ) : items.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-white/5 rounded-xl bg-white/5">
                    <p className="text-gray-400 mb-1">Nada por aqui.</p>
                    <p className="text-xs text-gray-600">No sigues usuarios todavia.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map(item => {
                        const rawUsername = (item.username || item.displayName || item.name || 'usuario').toString();
                        const username = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
                        const fullName = [item.name, item.surnames]
                            .filter((part: string) => typeof part === 'string' && part.trim().length > 0)
                            .join(' ')
                            .trim();
                        const fallbackName = !fullName && item.displayName && item.displayName !== item.username
                            ? item.displayName
                            : '';
                        const nameLine = fullName || fallbackName || '';

                        return (
                            <Link
                                key={item.id}
                                to={`/profile/${item.id}`}
                                onClick={() => onNavigateToProfile?.()}
                                className="group flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-[#151b2e]/70 hover:border-indigo-500/40 hover:bg-white/5 transition-all"
                            >
                                <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-gray-800">
                                    <img
                                        src={item.photoUrl || item.photoURL || `https://ui-avatars.com/api/?name=${item.username || item.displayName || 'U'}`}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        alt={username}
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-white font-black text-base truncate">{username}</h4>
                                    {nameLine && (
                                        <p className="text-gray-400 text-xs truncate">{nameLine}</p>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
