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
    arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';

export interface Message {
    id?: string;
    text: string;
    senderId: string;
    createdAt: any;
    readBy?: string[];
    type?: 'text' | 'image' | 'review-share';
    metadata?: any;
}

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
    sendMessage: async (chatId: string, senderId: string, text: string, type: 'text' | 'image' = 'text') => {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await addDoc(messagesRef, {
            text,
            senderId,
            createdAt: serverTimestamp(),
            type,
            readBy: [senderId]
        });

        // Update last message
        const chatRef = doc(db, 'chats', chatId);
        await updateDoc(chatRef, {
            lastMessage: text,
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
    }
};
