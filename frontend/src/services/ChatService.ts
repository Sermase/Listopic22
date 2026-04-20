import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    doc,
    updateDoc,
    getDocs,
    limit,
    getDoc,
    arrayUnion,
    increment
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ShareEntityPayload } from '../types/share';
import { getShareEntityLabel } from '../types/share';

export interface Message {
    id?: string;
    text: string;
    senderId: string;
    createdAt: any;
    readBy?: string[];
    type?: 'text' | 'image' | 'share' | 'review-share';
    metadata?: MessageMetadata;
}

export interface ShareMessageMetadata {
    share: ShareEntityPayload;
}

export type MessageMetadata = Record<string, unknown> & Partial<ShareMessageMetadata>;

export interface Chat {
    id: string;
    participants: string[];
    lastMessage?: string;
    lastMessageTimestamp?: any;
    unreadCount?: Record<string, number>;
    type: 'private' | 'group';
    groupName?: string;
    groupPhoto?: string;
}

export const ChatService = {
    // Create or get existing 1:1 chat
    createPrivateChat: async (currentUserId: string, targetUserId: string) => {
        // Check if chat already exists
        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', currentUserId),
            where('type', '==', 'private')
        );

        const snapshot = await getDocs(q);
        const existingChat = snapshot.docs.find(doc =>
            doc.data().participants.includes(targetUserId)
        );

        if (existingChat) {
            return existingChat.id;
        }

        // Create new
        const docRef = await addDoc(collection(db, 'chats'), {
            participants: [currentUserId, targetUserId],
            type: 'private',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            unreadCount: {
                [currentUserId]: 0,
                [targetUserId]: 0
            }
        });
        return docRef.id;
    },

    createGroupChat: async (creatorId: string, groupName: string, participantIds: string[]) => {
        const allParticipants = [...new Set([creatorId, ...participantIds])];

        const docRef = await addDoc(collection(db, 'chats'), {
            participants: allParticipants,
            type: 'group',
            groupName,
            groupPhoto: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            unreadCount: allParticipants.reduce((acc, uid) => ({ ...acc, [uid]: 0 }), {})
        });
        return docRef.id;
    },

    // Send a message
    sendMessage: async (
        chatId: string,
        senderId: string,
        text: string,
        type: 'text' | 'image' | 'share' | 'review-share' = 'text',
        metadata?: MessageMetadata
    ) => {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const safeText = typeof text === 'string' ? text : '';
        const payload: Record<string, unknown> = {
            text: safeText,
            senderId,
            createdAt: serverTimestamp(),
            type,
            readBy: [senderId]
        };

        if (metadata) {
            payload.metadata = metadata;
        }

        await addDoc(messagesRef, {
            ...payload
        });

        const chatRef = doc(db, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);
        const participants = chatSnap.exists() ? (chatSnap.data().participants || []) as string[] : [];
        let previewText = safeText.trim();
        if (!previewText && (type === 'share' || type === 'review-share')) {
            const shared = metadata?.share;
            if (shared && typeof shared === 'object' && typeof shared.type === 'string') {
                const candidateType = shared.type as ShareEntityPayload['type'];
                const validTypes: ShareEntityPayload['type'][] = ['place', 'group', 'list', 'sublist', 'profile', 'app', 'review', 'link'];
                const safeType = validTypes.includes(candidateType) ? candidateType : 'link';
                const rawLabel = getShareEntityLabel(safeType);
                const label = rawLabel.toLowerCase();
                const title = typeof (shared as ShareEntityPayload).title === 'string'
                    ? (shared as ShareEntityPayload).title.trim()
                    : '';
                previewText = title ? `Compartio ${label}: ${title}` : `Compartio ${label}`;
            } else {
                previewText = 'Compartio contenido';
            }
        }

        if (!previewText) {
            previewText = 'Nuevo mensaje';
        }

        await updateDoc(chatRef, {
            lastMessage: previewText,
            lastMessageTimestamp: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    },

    // Listen to user's chats
    subscribeToChats: (userId: string, callback: (chats: Chat[]) => void) => {
        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', userId),
            orderBy('updatedAt', 'desc')
        );

        return onSnapshot(q, (snapshot) => {
            const chats = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Chat[];
            callback(chats);
        });
    },

    // Listen to messages in a chat
    subscribeToMessages: (chatId: string, callback: (messages: Message[]) => void) => {
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('createdAt', 'asc'),
            limit(100)
        );

        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Message[];
            callback(messages);
        });
    },

    addParticipant: async (chatId: string, newUserId: string) => {
        const chatRef = doc(db, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) return;
        const data = chatSnap.data();

        const updates: any = {
            participants: arrayUnion(newUserId),
            [`unreadCount.${newUserId}`]: 0,
            updatedAt: serverTimestamp()
        };

        // Convert private to group if adding 3rd person
        if (data.type === 'private') {
            updates.type = 'group';
            updates.groupName = 'Nuevo Grupo'; // UI should provide this ideally, but auto-convert default
        }

        await updateDoc(chatRef, updates);
    },

    markChatAsRead: async (chatId: string, userId: string) => {
        const chatRef = doc(db, 'chats', chatId);
        await updateDoc(chatRef, {
            [`unreadCount.${userId}`]: 0
        });
    }
};
