import React, { useEffect, useState } from 'react';
import { X, Bell, Heart, UserPlus, MessageSquare, Star } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { NotificationHistoryModal } from './NotificationHistoryModal';

interface NotificationModalProps {
    onClose: () => void;
    onOpenHistory: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ onClose, onOpenHistory }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    // showHistory removed, controlled by parent

    useEffect(() => {
        if (!user) return;

        // Subscribe to notifications
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error("NotificationModal snapshot error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleMarkAllRead = async () => {
        if (!user) return;
        const unreadBatch = notifications.filter(n => !n.read);
        if (unreadBatch.length === 0) return;

        const batch = writeBatch(db);
        unreadBatch.forEach(n => {
            batch.update(doc(db, 'users', user.uid, 'notifications', n.id), { read: true });
        });
        await batch.commit();
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'like': return <Heart className="w-4 h-4 text-pink-500" />;
            case 'follow': return <UserPlus className="w-4 h-4 text-indigo-500" />;
            case 'comment': return <MessageSquare className="w-4 h-4 text-blue-500" />;
            case 'system': return <Star className="w-4 h-4 text-amber-500" />;
            default: return <Bell className="w-4 h-4 text-gray-500" />;
        }
    };

    const getLink = (notification: any) => {
        if (notification.link) return notification.link;
        if (notification.type === 'follow' && notification.fromUserId) return `/profile/${notification.fromUserId}`;
        if (notification.type === 'like' && notification.placeId) return `/place/${notification.placeId}`; // Simplified
        return '#';
    }

    return (
        <div className="absolute top-12 right-0 w-80 md:w-96 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in origin-top-right">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-400" /> Notificaciones
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                        Marcar leídas
                    </button>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
                {loading ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
                ) : notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                        <Bell className="w-8 h-8 opacity-20" />
                        Sin notificaciones recientes
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {notifications.map(notification => (
                            <Link
                                key={notification.id}
                                to={getLink(notification)}
                                onClick={() => {
                                    // Mark as read on click
                                    if (!notification.read && user) {
                                        updateDoc(doc(db, 'users', user.uid, 'notifications', notification.id), { read: true });
                                    }
                                    onClose();
                                }}
                                className={`block p-4 hover:bg-white/5 transition-colors ${!notification.read ? 'bg-indigo-500/5' : ''}`}
                            >
                                <div className="flex gap-3">
                                    <div className={`mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-black/20 border border-white/5`}>
                                        {getIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-200 leading-snug">
                                            {notification.senderName && <span className="font-bold text-white">{notification.senderName} </span>}
                                            {notification.message || 'Nueva notificación'}
                                        </p>
                                        <span className="text-xs text-gray-500 mt-1 block">
                                            {notification.createdAt?.seconds ? new Date(notification.createdAt.seconds * 1000).toLocaleDateString() : 'Hace un momento'}
                                        </span>
                                    </div>
                                    {!notification.read && (
                                        <div className="mt-2 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-2 border-t border-white/10 bg-black/20 text-center">
                <button
                    onClick={onOpenHistory}
                    className="text-xs text-gray-400 hover:text-white transition-colors w-full py-1"
                >
                    Ver todas
                </button>
            </div>
        </div>
    );
};
