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
    deleteField
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ShareEntityPayload } from '../types/share';
import { getShareEntityLabel } from '../types/share';
import {
    compact,
    formatWhen,
    invitePreviewText,
    type ChatInvite,
    type ChatPoll,
    type DishRef,
    type InviteStatus,
    type ReactionMap,
    type ReplyRef,
} from '../lib/chatExtras';

export interface Message {
    id?: string;
    text: string;
    senderId: string;
    createdAt?: FirestoreTimestampLike | null;
    readBy?: string[];
    type?: MessageType;
    metadata?: MessageMetadata;
    reactions?: ReactionMap;
    replyTo?: ReplyRef;
    invite?: ChatInvite;
    poll?: ChatPoll;
}

export type MessageType = 'text' | 'image' | 'share' | 'review-share' | 'invite' | 'poll';

export interface ShareMessageMetadata {
    share: ShareEntityPayload;
}

export type MessageMetadata = Record<string, unknown> & Partial<ShareMessageMetadata>;

export interface Chat {
    id: string;
    participants: string[];
    lastMessage?: string;
    lastMessageTimestamp?: FirestoreTimestampLike | null;
    unreadCount?: Record<string, number>;
    type: 'private' | 'group';
    groupName?: string;
    groupPhoto?: string;
}

interface FirestoreTimestampLike {
    seconds: number;
    nanoseconds?: number;
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
        type: MessageType = 'text',
        metadata?: MessageMetadata,
        extra?: Pick<Message, 'replyTo' | 'invite' | 'poll'>
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
        if (extra?.replyTo) payload.replyTo = compact(extra.replyTo);
        if (extra?.invite) payload.invite = compact(extra.invite);
        if (extra?.poll) payload.poll = extra.poll;

        await addDoc(messagesRef, {
            ...payload
        });

        const chatRef = doc(db, 'chats', chatId);
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
    subscribeToChats: (
        userId: string,
        callback: (chats: Chat[]) => void,
        onError?: (error: unknown) => void
    ) => {
        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', userId),
            orderBy('updatedAt', 'desc')
        );

        return onSnapshot(
            q,
            (snapshot) => {
                const chats = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Chat[];
                callback(chats);
            },
            (error) => {
                console.error('ChatService: failed to subscribe to chats', error);
                callback([]);
                onError?.(error);
            }
        );
    },

    // Listen to messages in a chat
    subscribeToMessages: (
        chatId: string,
        callback: (messages: Message[]) => void,
        onError?: (error: unknown) => void
    ) => {
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('createdAt', 'asc'),
            limit(100)
        );

        return onSnapshot(
            q,
            (snapshot) => {
                const messages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Message[];
                callback(messages);
            },
            (error) => {
                console.error('ChatService: failed to subscribe to messages', error);
                callback([]);
                onError?.(error);
            }
        );
    },

    addParticipant: async (chatId: string, newUserId: string) => {
        const chatRef = doc(db, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) return;
        const data = chatSnap.data();

        const updates: Record<string, unknown> = {
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

    /** Una reacción por persona; la misma otra vez la quita. */
    setReaction: async (chatId: string, messageId: string, userId: string, emoji: string | null) => {
        await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
            [`reactions.${userId}`]: emoji ? emoji : deleteField()
        });
    },

    sendInvite: async (chatId: string, senderId: string, invite: ChatInvite) => {
        await ChatService.sendMessage(chatId, senderId, invitePreviewText(invite), 'invite', undefined, {
            invite: { ...invite, responses: {} }
        });
    },

    /** Voy / No puedo / Otro día (con fecha). Deja además un mensaje que responde a la invitación. */
    respondInvite: async (
        chatId: string,
        message: Message,
        userId: string,
        status: InviteStatus,
        proposedAt?: number
    ) => {
        if (!message.id || !message.invite) return;
        await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
            [`invite.responses.${userId}`]: compact({ status, proposedAt, at: Date.now() })
        });
        const text = status === 'yes'
            ? '✅ ¡Voy!'
            : status === 'no'
                ? '❌ Esta vez no puedo'
                : `🗓️ ¿Y el ${formatWhen(proposedAt ?? message.invite.when)}?`;
        await ChatService.sendMessage(chatId, userId, text, 'text', undefined, {
            replyTo: { id: message.id, senderId: message.senderId, text: message.text }
        });
    },

    /** Quien invita cambia la fecha (o acepta la propuesta de alguien): las respuestas vuelven a empezar. */
    changeInviteDate: async (chatId: string, message: Message, when: number, acceptedFrom?: string) => {
        if (!message.id || !message.invite) return;
        await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
            'invite.when': when,
            'invite.responses': acceptedFrom ? { [acceptedFrom]: { status: 'yes', at: Date.now() } } : {}
        });
        await ChatService.sendMessage(chatId, message.senderId, `📅 Nueva fecha: ${formatWhen(when)}`, 'text', undefined, {
            replyTo: { id: message.id, senderId: message.senderId, text: message.text }
        });
    },

    sendPoll: async (chatId: string, senderId: string, options: DishRef[]) => {
        const poll: ChatPoll = {
            question: '¿Dónde comemos?',
            options: options.map((o, i) => ({ ...compact(o), id: `o${i + 1}` })),
            votes: {}
        };
        await ChatService.sendMessage(chatId, senderId, '🗳️ ¿Dónde comemos? Vota', 'poll', undefined, { poll });
    },

    votePoll: async (chatId: string, messageId: string, userId: string, optionId: string | null) => {
        await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
            [`poll.votes.${userId}`]: optionId ? optionId : deleteField()
        });
    },

    markChatAsRead: async (chatId: string, userId: string) => {
        const chatRef = doc(db, 'chats', chatId);
        await updateDoc(chatRef, {
            [`unreadCount.${userId}`]: 0
        });
    }
};
