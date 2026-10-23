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
    eventNoteText,
    inviteTitle,
    invitePreviewText,
    pinnedFromInvite,
    type ChatEventNote,
    type ChatInvite,
    type ChatPoll,
    type DishRef,
    type InviteStatus,
    type PinnedEvent,
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
    event?: ChatEventNote;
}

export type MessageType = 'text' | 'image' | 'share' | 'review-share' | 'invite' | 'poll' | 'event';

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
    /** Quedadas abiertas, fijadas arriba del chat (id del mensaje → resumen). */
    events?: Record<string, PinnedEvent>;
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
        extra?: Pick<Message, 'replyTo' | 'invite' | 'poll' | 'event'>
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
        if (extra?.event) payload.event = compact(extra.event);

        const messageRef = await addDoc(messagesRef, {
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
        return messageRef;
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

    addParticipant: async (chatId: string, newUserId: string, by?: { uid: string; name: string; targetName: string }) => {
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
        if (by) {
            const event: ChatEventNote = { kind: 'added', targetId: newUserId };
            await ChatService.sendMessage(chatId, by.uid, eventNoteText(event, by.name, by.targetName), 'event', undefined, { event });
        }
    },

    renameGroup: async (chatId: string, groupName: string) => {
        await updateDoc(doc(db, 'chats', chatId), { groupName: groupName.trim().slice(0, 60), updatedAt: serverTimestamp() });
    },

    /** Una reacción por persona; la misma otra vez la quita. */
    setReaction: async (chatId: string, messageId: string, userId: string, emoji: string | null) => {
        await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
            [`reactions.${userId}`]: emoji ? emoji : deleteField()
        });
    },

    /** La quedada se envía y se fija arriba del chat hasta que pase. */
    sendInvite: async (chatId: string, senderId: string, invite: ChatInvite) => {
        const ref = await ChatService.sendMessage(chatId, senderId, invitePreviewText(invite), 'invite', undefined, {
            invite: { ...invite, responses: {} }
        });
        await updateDoc(doc(db, 'chats', chatId), { [`events.${ref.id}`]: pinnedFromInvite(invite) }).catch(() => undefined);
        return ref.id;
    },

    /** Voy / En duda / Otro día (con fecha) / No. Deja un aviso en gris. */
    respondInvite: async (
        chatId: string,
        message: Message,
        user: { uid: string; name: string },
        status: InviteStatus,
        proposedAt?: number
    ) => {
        if (!message.id || !message.invite) return;
        await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
            [`invite.responses.${user.uid}`]: compact({ status, proposedAt, at: Date.now() })
        });
        const event: ChatEventNote = compact({ kind: status, inviteId: message.id, title: inviteTitle(message.invite), when: proposedAt });
        await ChatService.sendMessage(chatId, user.uid, eventNoteText(event, user.name), 'event', undefined, { event });
    },

    /** Quien invita cambia la fecha (o acepta la propuesta de alguien): las respuestas vuelven a empezar. */
    changeInviteDate: async (chatId: string, message: Message, sender: { uid: string; name: string }, when: number, acceptedFrom?: string) => {
        if (!message.id || !message.invite) return;
        await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
            'invite.when': when,
            'invite.responses': acceptedFrom ? { [acceptedFrom]: { status: 'yes', at: Date.now() } } : {}
        });
        await updateDoc(doc(db, 'chats', chatId), { [`events.${message.id}`]: pinnedFromInvite({ ...message.invite, when }) }).catch(() => undefined);
        const event: ChatEventNote = { kind: 'date', inviteId: message.id, title: inviteTitle(message.invite), when };
        await ChatService.sendMessage(chatId, sender.uid, eventNoteText(event, sender.name), 'event', undefined, { event });
    },

    cancelInvite: async (chatId: string, message: Message, sender: { uid: string; name: string }) => {
        if (!message.id || !message.invite) return;
        await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), { 'invite.cancelled': true });
        await updateDoc(doc(db, 'chats', chatId), { [`events.${message.id}`]: deleteField() }).catch(() => undefined);
        const event: ChatEventNote = { kind: 'cancel', inviteId: message.id, title: inviteTitle(message.invite) };
        await ChatService.sendMessage(chatId, sender.uid, eventNoteText(event, sender.name), 'event', undefined, { event });
    },

    /** Quita del chat las quedadas fijadas que ya pasaron. */
    prunePastEvents: async (chatId: string, ids: string[]) => {
        if (!ids.length) return;
        await updateDoc(doc(db, 'chats', chatId), Object.fromEntries(ids.map((id) => [`events.${id}`, deleteField()])));
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
