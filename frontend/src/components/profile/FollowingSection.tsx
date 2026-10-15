import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, documentId, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { Link } from 'react-router-dom';
import { getUserTypeGradient } from '../UserAvatar';
import { MarqueeText } from '../ui/MarqueeText';

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
                            collection(db, 'publicProfiles'),
                            where(documentId(), 'in', chunk),
                            limit(10)
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
                <div className="py-20 text-center text-[var(--lt-text-muted)]">Cargando...</div>
            ) : items.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-[var(--lt-border-strong)] rounded-2xl bg-[var(--lt-card-strong-alpha)]">
                    <p className="text-sm font-bold text-[var(--lt-text)] mb-1">Nada por aqui.</p>
                    <p className="text-xs text-[var(--lt-text-muted)]">No sigues usuarios todavia.</p>
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
                                className="group flex items-center gap-3 p-2 pr-3 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong-alpha)] hover:border-[var(--lt-accent-border)] transition-all"
                            >
                                <div className={`w-14 h-14 rounded-lg overflow-hidden shrink-0 p-[2px] bg-gradient-to-tr ${getUserTypeGradient(item.userType)}`}>
                                    <div className="w-full h-full rounded-md overflow-hidden bg-[var(--lt-card-strong)] border border-[var(--lt-bg)]">
                                        <img
                                            src={item.photoUrl || item.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.username || item.displayName || 'U')}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                            alt={username}
                                        />
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <MarqueeText as="h4" text={username} className="text-[var(--lt-text)] font-black text-base" />
                                    {nameLine && (
                                        <p className="text-[var(--lt-text-muted)] text-xs truncate">{nameLine}</p>
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
