import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/** Mensajes sin leer en todos mis chats (la cabecera y la barra de abajo escuchan la misma consulta: Firestore la comparte). */
export function useUnreadChats(uid: string | undefined): number {
    const [state, setState] = useState<{ uid?: string; total: number }>({ total: 0 });

    useEffect(() => {
        if (!uid) return;
        const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', uid), limit(50));
        return onSnapshot(chatsQuery, (snapshot) => {
            let total = 0;
            snapshot.docs.forEach((chatDoc) => {
                const unread = (chatDoc.data() as { unreadCount?: Record<string, unknown> }).unreadCount?.[uid];
                if (typeof unread === 'number') total += unread;
            });
            setState({ uid, total });
        }, (error) => {
            console.error('Chats sin leer:', error);
        });
    }, [uid]);

    return uid && state.uid === uid ? state.total : 0;
}
