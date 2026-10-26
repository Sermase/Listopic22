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
    deleteField,
    writeBatch,
    setDoc,
    deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ShareEntityPayload } from '../types/share';
import { getShareEntityLabel } from '../types/share';
import type { ChatPachoteLink } from '../lib/pachote';
import {
    compact,
    eventNoteText,
    inviteTitle,
    inviteIsPast,
    invitePreviewText,
    pinnedFromInvite,
    type ChatEventNote,
    type ChatInvite,
    type ChatPoll,
    type ChatDatePoll,
    type DateVote,
    datePollOptions,
    type DishRef,
    type PlaceRef,
    type InviteStatus,
    makeJoinCode,
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
    datePoll?: ChatDatePoll;
    event?: ChatEventNote;
    /** Tarjeta viva con las cuentas de un grupo de Pachote enlazado. */
    pachote?: { gid: string; name: string };
}

export type MessageType = 'text' | 'image' | 'share' | 'review-share' | 'invite' | 'poll' | 'datepoll' | 'event' | 'pachote';

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
    /** Código del enlace de invitación al grupo (/g/{código}), si está activo. */
    joinCode?: string;
    /** Con el enlace no se entra directo: alguien del grupo acepta la solicitud. */
    joinApproval?: boolean;
    /** Grupos de Pachote enlazados (id del grupo → nombre). */
    pachote?: Record<string, ChatPachoteLink>;
}

/** Lo que ve de una quedada quien recibe el enlace, antes de entrar al grupo. */
export interface JoinEventPreview {
    title: string;
    placeName?: string;
    placeCity?: string;
    imageUrl?: string;
    when: number;
    cancelled?: boolean;
}

/** Vista previa pública del enlace de invitación (chatInvites/{código}). */
export interface JoinInvite {
    chatId: string;
    groupName: string;
    byName: string;
    approval?: boolean;
    /** Quedadas compartidas por fuera con este enlace (/g/{código}?q={id}). */
    events?: Record<string, JoinEventPreview>;
}

const eventPreview = (invite: ChatInvite): JoinEventPreview => compact({
    title: inviteTitle(invite).slice(0, 120),
    placeName: invite.placeName,
    placeCity: invite.placeCity,
    imageUrl: invite.imageUrl,
    when: invite.when,
    cancelled: invite.cancelled || undefined,
});

/** Solicitud para entrar a un grupo con aprobación (chats/{id}/joinRequests/{uid}). */
export interface JoinRequest {
    uid: string;
    name: string;
}

export type JoinResult = { chatId: string; status: 'joined' | 'member' | 'pending' };

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
        extra?: Pick<Message, 'replyTo' | 'invite' | 'poll' | 'datePoll' | 'event' | 'pachote'>
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
        if (extra?.datePoll) payload.datePoll = compact(extra.datePoll);
        if (extra?.event) payload.event = compact(extra.event);
        if (extra?.pachote) payload.pachote = extra.pachote;

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
                // Con la caché del dispositivo, la primera respuesta puede llegar vacía antes que el servidor: no se pinta «vacío» por error.
                if (snapshot.empty && snapshot.metadata.fromCache) return;
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
                // Con la caché del dispositivo, la primera respuesta puede llegar vacía antes que el servidor: no se pinta «vacío» por error.
                if (snapshot.empty && snapshot.metadata.fromCache) return;
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

    renameGroup: async (chatId: string, groupName: string, joinCode?: string) => {
        const name = groupName.trim().slice(0, 60);
        const batch = writeBatch(db);
        batch.update(doc(db, 'chats', chatId), { groupName: name, updatedAt: serverTimestamp() });
        if (joinCode) batch.update(doc(db, 'chatInvites', joinCode), { groupName: name });
        await batch.commit();
    },

    /** Crea (o cambia) el enlace de invitación; el anterior deja de valer. */
    createJoinLink: async (chatId: string, groupName: string, byName: string, oldCode?: string, approval = false) => {
        const code = makeJoinCode();
        const batch = writeBatch(db);
        batch.update(doc(db, 'chats', chatId), { joinCode: code });
        batch.set(doc(db, 'chatInvites', code), { chatId, groupName, byName, approval, createdAt: serverTimestamp() });
        if (oldCode) batch.delete(doc(db, 'chatInvites', oldCode));
        await batch.commit();
        return code;
    },

    disableJoinLink: async (chatId: string, code: string) => {
        const batch = writeBatch(db);
        batch.update(doc(db, 'chats', chatId), { joinCode: deleteField() });
        batch.delete(doc(db, 'chatInvites', code));
        await batch.commit();
    },

    setJoinApproval: async (chatId: string, code: string, approval: boolean) => {
        const batch = writeBatch(db);
        batch.update(doc(db, 'chats', chatId), { joinApproval: approval });
        batch.update(doc(db, 'chatInvites', code), { approval });
        await batch.commit();
    },

    getJoinInvite: async (code: string): Promise<JoinInvite | null> => {
        const snap = await getDoc(doc(db, 'chatInvites', code));
        return snap.exists() ? (snap.data() as JoinInvite) : null;
    },

    /** Entrar al grupo con el enlace (o pedirlo, si el grupo aprueba antes). */
    joinByLink: async (code: string, user: { uid: string; name: string }): Promise<JoinResult | null> => {
        const invite = await ChatService.getJoinInvite(code);
        if (!invite) return null;
        const chatId = invite.chatId;
        const chatRef = doc(db, 'chats', chatId);
        const member = await getDoc(chatRef).then((snap) => snap.exists(), () => false);
        if (member) return { chatId, status: 'member' };
        if (invite.approval) {
            const requestRef = doc(db, 'chats', chatId, 'joinRequests', user.uid);
            const asked = await getDoc(requestRef).then((snap) => snap.exists(), () => false);
            if (!asked) await setDoc(requestRef, { name: user.name.slice(0, 80), code, at: serverTimestamp() });
            return { chatId, status: 'pending' };
        }
        await updateDoc(chatRef, { participants: arrayUnion(user.uid), joinedWith: code, updatedAt: serverTimestamp() });
        const event: ChatEventNote = { kind: 'joined' };
        await ChatService.sendMessage(chatId, user.uid, eventNoteText(event, user.name), 'event', undefined, { event });
        return { chatId, status: 'joined' };
    },

    listenJoinRequests: (chatId: string, callback: (requests: JoinRequest[]) => void) =>
        onSnapshot(
            collection(db, 'chats', chatId, 'joinRequests'),
            (snap) => callback(snap.docs.map((d) => ({ uid: d.id, name: String(d.data().name || 'Alguien') }))),
            () => callback([])
        ),

    answerJoinRequest: async (chatId: string, request: JoinRequest, accept: boolean, by: { uid: string; name: string }) => {
        if (accept) await ChatService.addParticipant(chatId, request.uid, { ...by, targetName: request.name });
        await deleteDoc(doc(db, 'chats', chatId, 'joinRequests', request.uid));
    },

    /** Enlace para invitar a una quedada a gente de fuera: el del grupo (se crea si no hay) apuntando a la quedada. */
    shareEventLink: async (chat: Chat, message: Message, byName: string): Promise<string> => {
        if (!message.id || !message.invite) throw new Error('No es una quedada');
        const code = chat.joinCode || await ChatService.createJoinLink(chat.id, chat.groupName || 'Grupo', byName, undefined, Boolean(chat.joinApproval));
        const current = await ChatService.getJoinInvite(code);
        const stale = Object.entries(current?.events || {})
            .filter(([id, e]) => id !== message.id && (!e || typeof e.when !== 'number' || inviteIsPast(e)))
            .map(([id]) => id);
        await updateDoc(doc(db, 'chatInvites', code), {
            [`events.${message.id}`]: eventPreview(message.invite),
            ...Object.fromEntries(stale.map((id) => [`events.${id}`, deleteField()])),
        });
        return `/g/${code}?q=${message.id}`;
    },

    /** Si la quedada se compartió por fuera, su vista previa sigue la fecha nueva o la cancelación. */
    refreshEventPreview: async (code: string | undefined, message: Message) => {
        if (!code || !message.id || !message.invite) return;
        const current = await ChatService.getJoinInvite(code);
        if (!current?.events?.[message.id]) return;
        await updateDoc(doc(db, 'chatInvites', code), { [`events.${message.id}`]: eventPreview(message.invite) });
    },

    /** «Me apunto» desde el enlace de la quedada, ya dentro del grupo. */
    joinEventFromLink: async (chatId: string, messageId: string, user: { uid: string; name: string }) => {
        const snap = await getDoc(doc(db, 'chats', chatId, 'messages', messageId));
        if (!snap.exists()) return;
        const message = { id: snap.id, ...snap.data() } as Message;
        const invite = message.invite;
        if (!invite || invite.cancelled || inviteIsPast(invite) || message.senderId === user.uid) return;
        if (invite.responses?.[user.uid]?.status === 'yes') return;
        await ChatService.respondInvite(chatId, message, user, 'yes');
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

    sendDatePoll: async (chatId: string, senderId: string, whens: number[], place?: PlaceRef | null) => {
        const datePoll: ChatDatePoll = { options: datePollOptions(whens), votes: {} };
        if (place) datePoll.place = compact(place);
        const where = place ? ` en ${place.placeName}` : '';
        await ChatService.sendMessage(chatId, senderId, `📅 ¿Cuándo quedamos${where}? Marca tus fechas`, 'datepoll', undefined, { datePoll });
    },

    voteDate: async (chatId: string, messageId: string, userId: string, optionId: string, vote: DateVote | null) => {
        await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
            [`datePoll.votes.${userId}.${optionId}`]: vote ? vote : deleteField()
        });
    },

    /** La fecha elegida ya es quedada: la encuesta se cierra apuntando a ella. */
    linkDatePollInvite: async (chatId: string, messageId: string, inviteId: string) => {
        await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { 'datePoll.inviteId': inviteId });
    },

    markChatAsRead: async (chatId: string, userId: string) => {
        const chatRef = doc(db, 'chats', chatId);
        await updateDoc(chatRef, {
            [`unreadCount.${userId}`]: 0
        });
    }
};
