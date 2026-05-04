import React, { useEffect, useState, useMemo } from 'react';
import { X, Bell, Heart, UserPlus, MessageSquare, Star, Award } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface NotificationModalProps {
    onClose: () => void;
    onOpenHistory: () => void;
    mobile?: boolean;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
    onClose,
    onOpenHistory,
    mobile = false,
}) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    useBodyScrollLock(mobile);
    // showHistory removed, controlled by parent

    useEffect(() => {
        if (!user) return;

        // Subscribe to notifications
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('updatedAt', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter((n: any) => n.type !== 'new_message'));
            setLoading(false);
        }, (error) => {
            console.error("NotificationModal snapshot error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleMarkAllRead = async () => {
        if (!user) return;
        const unread = notifications.filter(n => !n.read);
        if (unread.length === 0) return;

        const batch = writeBatch(db);
        unread.forEach(n => {
            const ref = doc(db, 'users', user.uid, 'notifications', n.id);
            if (n.deletedOnRead) {
                batch.delete(ref);
            } else {
                batch.update(ref, { read: true });
            }
        });
        await batch.commit();
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'like':
            case 'review_like':
                return <Heart className="w-4 h-4 text-pink-500" />;
            case 'follow':
            case 'new_follower':
                return <UserPlus className="w-4 h-4 text-[var(--lt-accent)]" />;
            case 'comment':
            case 'review_comment':
            case 'new_message':
                return <MessageSquare className="w-4 h-4 text-blue-500" />;
            case 'list_follow':
                return <Bell className="w-4 h-4 text-cyan-500" />;
            case 'badge_earned':
                return <Award className="w-4 h-4 text-amber-400" />;
            case 'level_up':
            case 'system': return <Star className="w-4 h-4 text-amber-500" />;
            default: return <Bell className="w-4 h-4 text-gray-500" />;
        }
    };

    const getLink = (notification: any) => {
        if (notification.link) return notification.link;
        if ((notification.type === 'follow' || notification.type === 'new_follower') && (notification.fromUserId || notification.senderId)) {
            return `/profile/${notification.fromUserId || notification.senderId}`;
        }
        if ((notification.type === 'like' || notification.type === 'review_like') && notification.placeId) {
            return `/place/${notification.placeId}`;
        }
        if (notification.type === 'level_up' || notification.type === 'badge_earned') {
            return user ? `/profile/${user.uid}` : '#';
        }
        return '#';
    }

    const groupedNotifications = useMemo(() => {
        const groups: Record<string, any[]> = {};
        notifications.forEach(n => {
            const key = n.type + '__' + (n.link || n.fromUserId || n.placeId || '');
            if (!groups[key]) groups[key] = [];
            groups[key].push(n);
        });

        return Object.values(groups)
            .map(group => {
                if (group.length === 1) return group[0];
                const base = { ...group[0] };
                const senderNames = group.map(n => n.senderName).filter(Boolean);
                let senderText: string;
                if (senderNames.length === 2) {
                    senderText = `${senderNames[0]} y ${senderNames[1]}`;
                } else if (senderNames.length >= 3) {
                    senderText = `${senderNames[0]}, ${senderNames[1]} y ${senderNames.length - 2} más`;
                } else {
                    senderText = senderNames[0] || '';
                }
                base.senderName = senderText;
                base.groupCount = group.length;
                base.isGrouped = true;
                return base;
            })
            .sort((a, b) => {
                const aTs = a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0;
                const bTs = b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0;
                return bTs - aTs;
            });
    }, [notifications]);

    const mobileListContent = loading ? (
        <div className="py-10 text-center text-gray-500 text-sm">Cargando...</div>
    ) : notifications.length === 0 ? (
        <div className="py-10 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
            <Bell className="w-8 h-8 opacity-20" />
            Sin notificaciones recientes
        </div>
    ) : (
        <div className="space-y-1">
            {groupedNotifications.map(notification => (
                <Link
                    key={notification.id}
                    to={getLink(notification)}
                    onClick={() => {
                        if (!notification.read && user) {
                            if (notification.deletedOnRead) {
                                deleteDoc(doc(db, 'users', user.uid, 'notifications', notification.id));
                            } else {
                                updateDoc(doc(db, 'users', user.uid, 'notifications', notification.id), { read: true });
                            }
                        }
                        onClose();
                    }}
                    className={`block rounded-xl border p-3 transition-all ${!notification.read
                        ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)]'
                        : 'bg-white/5 border-transparent hover:bg-white/10'
                        }`}
                >
                    <div className="flex gap-3">
                        <div className="relative">
                            <div className="mt-0.5 shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-black/20 border border-white/5">
                                {getIcon(notification.type)}
                            </div>
                            {(notification.count > 1 || notification.groupCount > 1) && (
                                <span className="absolute -top-1 -right-1 bg-[var(--lt-accent)] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                    {notification.count || notification.groupCount}
                                </span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-200 leading-snug">
                                {notification.message || 'Nueva notificación'}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                                <span>
                                    {(notification.updatedAt?.seconds || notification.createdAt?.seconds)
                                        ? new Date((notification.updatedAt?.seconds || notification.createdAt?.seconds) * 1000).toLocaleDateString()
                                        : 'Hace un momento'}
                                </span>
                                {!notification.read && (
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                )}
                            </div>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );

    const panelContent = (
        <>
            <div className={`p-4 border-b border-white/10 flex items-center justify-between ${mobile ? 'bg-[var(--lt-card-strong)]' : 'bg-black/20'}`}>
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[var(--lt-accent)]" /> Notificaciones
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] uppercase font-bold text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors"
                    >
                        Marcar leídas
                    </button>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className={mobile ? "flex-1 overflow-y-auto bg-[var(--lt-bg)]" : "max-h-[400px] overflow-y-auto"}>
                {loading ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
                ) : notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                        <Bell className="w-8 h-8 opacity-20" />
                        Sin notificaciones recientes
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {groupedNotifications.map(notification => (
                            <Link
                                key={notification.id}
                                to={getLink(notification)}
                                onClick={() => {
                                    if (!notification.read && user) {
                                        if (notification.deletedOnRead) {
                                            deleteDoc(doc(db, 'users', user.uid, 'notifications', notification.id));
                                        } else {
                                            updateDoc(doc(db, 'users', user.uid, 'notifications', notification.id), { read: true });
                                        }
                                    }
                                    onClose();
                                }}
                                className={`block p-4 hover:bg-white/5 transition-colors ${!notification.read ? 'bg-[var(--lt-accent-soft)]' : ''}`}
                            >
                                <div className="flex gap-3">
                                    <div className="relative">
                                        <div className={`mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-black/20 border border-white/5`}>
                                            {getIcon(notification.type)}
                                        </div>
                                        {(notification.count > 1 || notification.groupCount > 1) && (
                                            <span className="absolute -top-1 -right-1 bg-[var(--lt-accent)] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                                {notification.count || notification.groupCount}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-200 leading-snug">
                                            {notification.message || 'Nueva notificación'}
                                        </p>
                                        <span className="text-xs text-gray-500 mt-1 block">
                                            {(notification.updatedAt?.seconds || notification.createdAt?.seconds) ? new Date((notification.updatedAt?.seconds || notification.createdAt?.seconds) * 1000).toLocaleDateString() : 'Hace un momento'}
                                        </span>
                                    </div>
                                    {!notification.read && (
                                        <div className="mt-2 w-2 h-2 rounded-full bg-[var(--lt-accent)] shrink-0" />
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <div className={`p-2 border-t border-white/10 text-center ${mobile ? 'bg-[var(--lt-card-strong)]' : 'bg-black/20'}`}>
                <button
                    onClick={onOpenHistory}
                    className="text-xs text-gray-400 hover:text-white transition-colors w-full py-1"
                >
                    Ver todas
                </button>
            </div>
        </>
    );

    if (mobile) {
        return (
            <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in md:p-4 pointer-events-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
                <div
                    className="bg-[var(--lt-card-strong)] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden flex flex-col lt-mobile-modal-panel sm:max-h-[80vh] mx-4"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[var(--lt-bg)]/50">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Bell className="w-5 h-5 text-[var(--lt-accent)]" />
                            Notificaciones
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleMarkAllRead}
                                className="text-[10px] uppercase font-bold text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors"
                            >
                                Marcar leÃ­das
                            </button>
                            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        {mobileListContent}
                    </div>

                    <div className="p-4 border-t border-white/5 bg-[var(--lt-bg)]/30">
                        <button
                            onClick={onOpenHistory}
                            className="w-full py-3 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white font-bold rounded-xl transition-colors shadow-lg shadow-[var(--lt-accent-shadow)]"
                        >
                            Ver todas
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="absolute top-12 right-0 w-80 md:w-96 bg-[var(--lt-card-strong)] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in origin-top-right pointer-events-auto">
            {panelContent}
        </div>
    );
};
