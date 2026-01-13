import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, writeBatch, doc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, Heart, MessageSquare, UserPlus, Info, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Notification {
    id: string;
    type: 'new_follower' | 'review_like' | 'review_comment' | 'place_closed';
    senderId?: string;
    senderName?: string;
    senderPhoto?: string;
    message: string;
    link?: string;
    read: boolean;
    createdAt: any;
    placeName?: string;
    preview?: string;
}

export const NotificationModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        // Listen to notifications
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            setNotifications(items);
            setLoading(false);

            // Mark visible unread as read
            const unreadBatch = items.filter(n => !n.read, []);
            if (unreadBatch.length > 0) {
                const batch = writeBatch(db);
                unreadBatch.forEach(n => {
                    batch.update(doc(db, 'users', user.uid, 'notifications', n.id), { read: true });
                });
                // We ignore batch commit errors here for UX smoothness
                batch.commit().catch(console.error);
            }
        });

        return () => unsubscribe();
    }, [user]);

    const getIcon = (type: string) => {
        switch (type) {
            case 'new_follower': return <UserPlus className="w-4 h-4 text-blue-400" />;
            case 'review_like': return <Heart className="w-4 h-4 text-pink-500" />;
            case 'review_comment': return <MessageSquare className="w-4 h-4 text-emerald-400" />;
            case 'place_closed': return <Info className="w-4 h-4 text-red-500" />;
            default: return <Bell className="w-4 h-4 text-gray-400" />;
        }
    };

    return (
        <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-[#0b1021] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#151b2e]">
                <h3 className="font-bold text-white">Notificaciones</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    <Check className="w-4 h-4" />
                </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Cargando...</div>
                ) : notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No tienes notificaciones.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {notifications.map(n => (
                            <Link
                                key={n.id}
                                to={n.link || '#'}
                                onClick={onClose}
                                className={`block p-4 hover:bg-white/5 transition-colors relative ${!n.read ? 'bg-indigo-500/5' : ''}`}
                            >
                                {!n.read && (
                                    <span className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
                                )}

                                <div className="flex gap-3">
                                    {/* Icon or Avatar */}
                                    <div className="shrink-0 mt-1">
                                        {n.senderPhoto ? (
                                            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 relative">
                                                <img src={n.senderPhoto} className="w-full h-full object-cover" />
                                                <div className="absolute -bottom-1 -right-1 bg-[#0b1021] rounded-full p-0.5">
                                                    {getIcon(n.type)}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                {getIcon(n.type)}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-200 leading-snug">
                                            <span className="font-bold text-white">{n.senderName}</span> {n.message}
                                            {n.placeName && <span className="text-indigo-300"> {n.placeName}</span>}
                                        </p>
                                        {n.preview && (
                                            <p className="text-xs text-gray-500 italic mt-1 truncate">"{n.preview}"</p>
                                        )}
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            {n.createdAt ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: es }) : 'Justo ahora'}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
