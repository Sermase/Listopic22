import React, { useEffect, useState } from 'react';
import { X, Bell, Heart, UserPlus, MessageSquare, Star, Trash2, Award } from 'lucide-react';
import { collection, query, orderBy, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

interface NotificationHistoryModalProps {
    onClose: () => void;
}

export const NotificationHistoryModal: React.FC<NotificationHistoryModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            if (!user) return;
            try {
                const q = query(
                    collection(db, 'users', user.uid, 'notifications'),
                    orderBy('updatedAt', 'desc')
                );
                const snap = await getDocs(q);
                setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (error) {
                console.error("Error fetching history:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [user]);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) return;

        // Optimistic update
        setNotifications(prev => prev.filter(n => n.id !== id));

        try {
            await deleteDoc(doc(db, 'users', user.uid, 'notifications', id));
        } catch (error) {
            console.error("Error deleting notification:", error);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'like':
            case 'review_like':
                return <Heart className="w-4 h-4 text-pink-500" />;
            case 'follow':
            case 'new_follower':
                return <UserPlus className="w-4 h-4 text-indigo-500" />;
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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in md:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[var(--lt-bg)] w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-none md:border border-white/10" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[var(--lt-card-strong)]">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Bell className="w-5 h-5 text-indigo-400" />
                        Histórico de Notificaciones
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[var(--lt-bg)]">
                    {loading ? (
                        <div className="py-20 text-center text-gray-500">Cargando historial...</div>
                    ) : notifications.length === 0 ? (
                        <div className="py-20 text-center text-gray-500 flex flex-col items-center gap-4">
                            <Bell className="w-12 h-12 opacity-20" />
                            <p>No hay notificaciones.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {notifications.map(notification => (
                                <div key={notification.id} className="group relative flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                                    <Link
                                        to={getLink(notification)}
                                        onClick={onClose}
                                        className="flex-1 flex items-start gap-4"
                                    >
                                        <div className="shrink-0 w-10 h-10 rounded-full bg-black/30 border border-white/10 flex items-center justify-center mt-1">
                                            {getIcon(notification.type)}
                                        </div>
                                        <div>
                                            <p className="text-gray-200 text-sm md:text-base leading-relaxed">
                                                {notification.message}
                                                {notification.count > 1 && (
                                                    <span className="ml-2 text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-medium">
                                                        ×{notification.count}
                                                    </span>
                                                )}
                                            </p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                                                <span>
                                                    {(notification.updatedAt?.seconds || notification.createdAt?.seconds)
                                                        ? new Date((notification.updatedAt?.seconds || notification.createdAt?.seconds) * 1000).toLocaleString()
                                                        : 'Fecha desconocida'}
                                                </span>
                                                {notification.placeName && <span className="text-indigo-400 font-medium">{notification.placeName}</span>}
                                            </div>
                                        </div>
                                    </Link>

                                    <button
                                        onClick={(e) => handleDelete(e, notification.id)}
                                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors absolute top-2 right-2 md:static md:opacity-0 md:group-hover:opacity-100"
                                        title="Eliminar notificación"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
