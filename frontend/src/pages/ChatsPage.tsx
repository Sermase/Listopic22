import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import { isLabAppEnabled } from '../lib/labApps';
import { ChatService, type Chat, type Message } from '../services/ChatService';
import { Send, MoreVertical, Search, MessageSquare, ArrowLeft, X, Users, User, ExternalLink, SquarePen, ChevronDown } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import type { ShareEntityPayload } from '../types/share';
import { getShareEntityLabel } from '../types/share';
import { getLocalRouteFromUrl, buildPublicRouteUrl } from '../utils/publicUrl';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { useToast } from '../context/ToastContext';
import { MessageBubble } from '../components/chat/MessageBubble';
import { EmojiPanel } from '../components/chat/EmojiPanel';
import { EventCard } from '../components/chat/EventCard';
import { EventSheet } from '../components/chat/EventSheet';
import { PollCard } from '../components/chat/PollCard';
import { DatePollCard } from '../components/chat/DatePollCard';
import { DatePollSheet } from '../components/chat/DatePollSheet';
import { InviteSheet, DateSheet } from '../components/chat/InviteSheet';
import { PollSheet } from '../components/chat/PollSheet';
import { RouletteSheet } from '../components/chat/RouletteSheet';
import { PinnedEvents } from '../components/chat/PinnedEvents';
import { NewChatSheet } from '../components/chat/NewChatSheet';
import { ChatSheet } from '../components/chat/ChatSheet';
import { Avatar, type Person } from '../components/chat/Avatars';
import { JoinLinkBox } from '../components/chat/JoinLinkBox';
import { JoinRequests } from '../components/chat/JoinRequests';
import { PachoteCard } from '../components/chat/PachoteCard';
import { PachotePanel } from '../components/chat/PachotePanel';
import { PachoteSheet } from '../components/chat/PachoteSheet';
import { PachoteService } from '../services/PachoteService';
import {
    QUEDADA_MS,
    chatDayLabel,
    dishRoute,
    eventNoteText,
    formatWhen,
    isEmojiOnly,
    startOfDay,
    upcomingEvents,
    type DishRef,
    type InviteStatus,
    type PlaceRef,
    type ReplyRef,
} from '../lib/chatExtras';

type ChatTool =
    | { kind: 'invite'; dish?: PlaceRef | null; when?: number; pollId?: string }
    | { kind: 'poll' }
    | { kind: 'datepoll' }
    | { kind: 'roulette' }
    | { kind: 'pachote' }
    | { kind: 'date'; messageId: string; mode: 'propose' | 'change' }
    | null;

type Profile = { displayName?: string; username?: string; name?: string; photoUrl?: string };

const GROUP_GAP_MS = 5 * 60 * 1000;
const msOf = (msg: Message) => (msg.createdAt?.seconds ? msg.createdAt.seconds * 1000 : Date.now());
const listTime = (seconds?: number) => {
    if (!seconds) return '';
    const ms = seconds * 1000;
    return startOfDay(ms) === startOfDay(Date.now())
        ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : chatDayLabel(ms);
};

export const ChatsPage: React.FC = () => {
    const { user, isJefe } = useAuth();
    const config = useAppConfig();
    // Developer → Proyectos → Pachote «🙈 Oculta» quita las cuentas del chat (las tarjetas ya enviadas siguen).
    const pachoteOn = isLabAppEnabled(config, 'pachote', isJefe);
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { chatId } = useParams();
    const [chats, setChats] = useState<Chat[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [activeChat, setActiveChat] = useState<string | null>(chatId || null);
    const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
    const [usersMap, setUsersMap] = useState<Record<string, Profile>>({});
    const [listQuery, setListQuery] = useState('');
    const [newChatOpen, setNewChatOpen] = useState(false);

    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [participantInput, setParticipantInput] = useState('');
    const [addingParticipant, setAddingParticipant] = useState(false);
    const [groupNameDraft, setGroupNameDraft] = useState('');
    const [searchResults, setSearchResults] = useState<Array<{ objectID: string; username?: string; name?: string; displayName?: string; photoUrl?: string; image?: string; bio?: string }>>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Chat «con vida»
    const [replyingTo, setReplyingTo] = useState<ReplyRef | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [tool, setTool] = useState<ChatTool>(null);
    const [openEvent, setOpenEvent] = useState<{ id: string; focus?: 'duel' } | null>(null);
    const [pachoteOpen, setPachoteOpen] = useState<string | null>(null);
    const [fetchedEvent, setFetchedEvent] = useState<Message | null>(null);
    const [unseen, setUnseen] = useState(0);
    const [atBottom, setAtBottom] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lastCountRef = useRef(0);
    const pendingJumpRef = useRef(true);

    useBodyScrollLock(isInfoModalOpen);
    const viewport = useVisualViewport();

    // Buscar gente para añadir al grupo
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!participantInput.trim() || participantInput.length < 2) {
                setSearchResults([]);
                return;
            }
            setIsSearching(true);
            try {
                const response = await algoliaClient.search({
                    requests: [{ indexName: INDEX_NAMES.users, query: participantInput, hitsPerPage: 5 }]
                });
                setSearchResults((response.results[0] as { hits?: typeof searchResults }).hits || []);
            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setIsSearching(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [participantInput]);

    // Perfiles: el otro de cada chat privado, todos los del chat abierto y yo.
    const profileIds = useMemo(() => {
        if (!user) return [];
        return Array.from(new Set([
            user.uid,
            ...chats.filter(c => c.type === 'private').map(c => c.participants.find(p => p !== user.uid)),
            ...(chats.find(c => c.id === activeChat)?.participants || []),
        ].filter(Boolean))).sort() as string[];
    }, [chats, user, activeChat]);
    const profileKey = profileIds.join(',');

    useEffect(() => {
        if (!profileKey) return;
        const unsubs = profileKey.split(',').map((uid) => onSnapshot(doc(db, 'publicProfiles', uid), (snap) => {
            setUsersMap(prev => ({
                ...prev,
                [uid]: snap.exists() ? snap.data() as Profile : { displayName: 'Usuario eliminado' }
            }));
        }, () => {
            setUsersMap(prev => ({ ...prev, [uid]: prev[uid] || { displayName: 'Alguien' } }));
        }));
        return () => unsubs.forEach(unsub => unsub());
    }, [profileKey]);

    useEffect(() => {
        if (!user) return;
        return ChatService.subscribeToChats(user.uid, setChats);
    }, [user]);

    useEffect(() => {
        if (chatId) {
            setActiveChat(chatId);
            setMobileView('chat');
            if (user) {
                deleteDoc(doc(db, 'users', user.uid, 'notifications', `msg_${chatId}`)).catch(() => {});
            }
        } else {
            setActiveChat(null);
            setMobileView('list');
        }
    }, [chatId, user]);

    useEffect(() => {
        if (!activeChat) return;
        setReplyingTo(null);
        setEmojiOpen(false);
        setToolsOpen(false);
        setOpenEvent(null);
        setPachoteOpen(null);
        setUnseen(0);
        setMessages([]);
        lastCountRef.current = 0;
        pendingJumpRef.current = true;
        const unsubscribe = ChatService.subscribeToMessages(activeChat, setMessages);
        if (user) ChatService.markChatAsRead(activeChat, user.uid).catch(console.error);
        return () => unsubscribe();
    }, [activeChat, user]);

    useEffect(() => {
        if (!user || !activeChat || messages.length === 0) return;
        const hasIncoming = messages.some(msg => msg.senderId !== user.uid && !(msg.readBy || []).includes(user.uid));
        if (hasIncoming) ChatService.markChatAsRead(activeChat, user.uid).catch(console.error);
    }, [messages, activeChat, user]);

    // Al abrir, al final; después solo si ya estabas abajo o el mensaje es tuyo.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el || messages.length === 0) return;
        const added = messages.length - lastCountRef.current;
        lastCountRef.current = messages.length;
        const last = messages[messages.length - 1];
        if (pendingJumpRef.current) {
            pendingJumpRef.current = false;
            el.scrollTop = el.scrollHeight;
            return;
        }
        if (added <= 0) return;
        if (atBottom || last?.senderId === user?.uid) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } else {
            setUnseen((n) => n + added);
        }
    }, [messages, atBottom, user]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        setAtBottom(near);
        if (near) setUnseen(0);
    };
    const scrollToBottom = () => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        setUnseen(0);
    };

    const profileName = (uid: string) => {
        const p = usersMap[uid];
        return p?.displayName || p?.username || p?.name || 'Alguien';
    };
    const nameOf = useCallback((uid: string) => (uid === user?.uid ? 'Tú' : profileName(uid).split(' ')[0]), [user, usersMap]); // eslint-disable-line react-hooks/exhaustive-deps
    const personOf = (uid: string): Person => ({ name: uid === user?.uid ? 'Tú' : profileName(uid).split(' ')[0], photoUrl: usersMap[uid]?.photoUrl });
    const me = () => ({ uid: user!.uid, name: profileName(user!.uid) !== 'Alguien' ? profileName(user!.uid) : (user?.displayName || 'Alguien') });

    const getChatName = (chat: Chat) => {
        if (chat.type === 'group') return chat.groupName || 'Grupo sin nombre';
        const targetId = chat.participants.find(p => p !== user?.uid);
        if (targetId && usersMap[targetId]) return profileName(targetId);
        return targetId ? '…' : 'Chat';
    };
    const getChatPhoto = (chat: Chat) => {
        if (chat.type === 'group') return chat.groupPhoto || null;
        const targetId = chat.participants.find(p => p !== user?.uid);
        return (targetId && usersMap[targetId]?.photoUrl) || null;
    };

    const activeChatObj = chats.find(c => c.id === activeChat);
    const participants = activeChatObj?.participants || [];
    const chatPeople = participants.map((uid) => ({ uid, name: profileName(uid) }));
    const activePrivateParticipantId = activeChatObj?.type === 'private' ? activeChatObj.participants.find(p => p !== user?.uid) || null : null;
    const activePrivateUser = activePrivateParticipantId ? usersMap[activePrivateParticipantId] : null;

    const visibleChats = useMemo(() => {
        const q = listQuery.trim().toLowerCase();
        if (!q) return chats;
        return chats.filter((c) => `${getChatName(c)} ${c.lastMessage || ''}`.toLowerCase().includes(q));
    }, [chats, listQuery, usersMap]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadedInvites = useMemo(() => messages
        .filter((m): m is Message & { id: string; invite: NonNullable<Message['invite']> } => m.type === 'invite' && !!m.invite && !!m.id)
        .map((m) => ({ id: m.id, invite: m.invite })), [messages]);
    const pinned = useMemo(() => upcomingEvents(activeChatObj?.events, loadedInvites), [activeChatObj?.events, loadedInvites]);

    // Las quedadas fijadas que ya pasaron hace un día se quitan del chat.
    useEffect(() => {
        if (!activeChat || !activeChatObj?.events) return;
        const stale = Object.entries(activeChatObj.events)
            .filter(([, e]) => !e || typeof e.when !== 'number' || Date.now() > e.when + QUEDADA_MS + 86_400_000)
            .map(([id]) => id);
        if (stale.length) ChatService.prunePastEvents(activeChat, stale).catch(() => undefined);
    }, [activeChat, activeChatObj?.events]);

    // La quedada abierta: de los mensajes cargados o, si es antigua, leída aparte.
    const eventMessage = openEvent ? (messages.find((m) => m.id === openEvent.id) || (fetchedEvent?.id === openEvent.id ? fetchedEvent : null)) : null;
    useEffect(() => {
        if (!openEvent || !activeChat || messages.some((m) => m.id === openEvent.id)) return;
        return onSnapshot(doc(db, 'chats', activeChat, 'messages', openEvent.id), (snap) => {
            if (snap.exists()) setFetchedEvent({ id: snap.id, ...snap.data() } as Message);
        }, () => undefined);
    }, [openEvent, activeChat, messages]);

    const runChatAction = async (action: () => Promise<unknown>, errorMessage = 'No se pudo hacer. Inténtalo otra vez.') => {
        try {
            await action();
        } catch (error) {
            console.error('Chat:', error);
            showToast({ variant: 'error', message: errorMessage });
        }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!user || !activeChat || !newMessage.trim()) return;
        const text = newMessage;
        setNewMessage('');
        setReplyingTo(null);
        setEmojiOpen(false);
        await runChatAction(
            () => ChatService.sendMessage(activeChat, user.uid, text, 'text', undefined, replyingTo ? { replyTo: replyingTo } : undefined),
            'No se pudo enviar el mensaje.'
        );
    };

    // Campo de texto que crece (hasta 5 líneas). Intro envía en ordenador; en móvil, salto de línea.
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        // Oculto (lista de chats en el móvil) mide 0: se ajusta al mostrarse. El borde también cuenta.
        if (!el.scrollHeight) return;
        el.style.height = `${Math.min(el.scrollHeight + el.offsetHeight - el.clientHeight, 120)}px`;
    }, [newMessage, activeChat, mobileView]);
    const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
        if (e.key === 'Enter' && !e.shiftKey && !coarse) {
            e.preventDefault();
            void handleSendMessage();
        }
    };

    const startReply = (msg: Message) => {
        if (!msg.id) return;
        const text = (msg.text || '').trim();
        setReplyingTo({ id: msg.id, senderId: msg.senderId, text: text.length > 140 ? `${text.slice(0, 140)}…` : text });
        textareaRef.current?.focus();
    };

    const scrollToMessage = (id: string) => {
        const el = document.getElementById(`msg-${id}`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('animate-pulse');
        setTimeout(() => el.classList.remove('animate-pulse'), 1200);
    };

    const parseSharedEntity = (msg: Message): ShareEntityPayload | null => {
        const rawShare = msg.metadata && typeof msg.metadata === 'object' ? (msg.metadata as Record<string, unknown>).share : null;
        if (!rawShare || typeof rawShare !== 'object') return null;
        const share = rawShare as Record<string, unknown>;
        const title = typeof share.title === 'string' ? share.title.trim() : '';
        const url = typeof share.url === 'string' ? share.url.trim() : '';
        const type = typeof share.type === 'string' ? share.type.trim() : 'link';
        if (!title || !url) return null;
        const allowedTypes = new Set<ShareEntityPayload['type']>(['place', 'group', 'list', 'sublist', 'profile', 'app', 'review', 'link']);
        return {
            type: allowedTypes.has(type as ShareEntityPayload['type']) ? (type as ShareEntityPayload['type']) : 'link',
            title,
            url,
            id: typeof share.id === 'string' ? share.id : undefined,
            subtitle: typeof share.subtitle === 'string' ? share.subtitle : undefined,
            description: typeof share.description === 'string' ? share.description : undefined,
            route: typeof share.route === 'string' ? share.route : undefined,
            imageUrl: typeof share.imageUrl === 'string' ? share.imageUrl : undefined,
            badgeLabel: typeof share.badgeLabel === 'string' ? share.badgeLabel : undefined,
            score: typeof share.score === 'number' ? share.score : (Number.isFinite(Number(share.score)) ? Number(share.score) : undefined),
        };
    };

    const openSharedEntity = (shared: ShareEntityPayload) => {
        if (shared.route) {
            navigate(shared.route);
            return;
        }
        try {
            const localRoute = getLocalRouteFromUrl(shared.url);
            if (localRoute) {
                navigate(localRoute);
                return;
            }
            window.open(new URL(shared.url, window.location.origin).toString(), '_blank', 'noopener,noreferrer');
        } catch {
            window.open(shared.url, '_blank', 'noopener,noreferrer');
        }
    };

    const shareDishToChat = async (dish: DishRef) => {
        if (!user || !activeChat) return;
        const route = dishRoute(dish) || '';
        await ChatService.sendMessage(activeChat, user.uid, '🎰 Me ha salido esto en la ruleta', 'share', {
            share: {
                type: 'group',
                title: `${dish.itemName} · ${dish.placeName}`,
                subtitle: [dish.placeCity, dish.listName].filter(Boolean).join(' · ') || undefined,
                route: route || undefined,
                url: buildPublicRouteUrl(route || '/'),
                imageUrl: dish.imageUrl,
                score: dish.score,
            } as ShareEntityPayload,
        });
    };

    const respond = (msg: Message, status: InviteStatus, proposedAt?: number) => {
        if (!user || !activeChat) return;
        if (msg.invite?.responses?.[user.uid]?.status === status && status !== 'other') return;
        void runChatAction(() => ChatService.respondInvite(activeChat, msg, me(), status, proposedAt));
    };

    const findMessage = (id: string) => messages.find((m) => m.id === id) || (fetchedEvent?.id === id ? fetchedEvent : null);

    const renderMessage = (msg: Message, index: number) => {
        if (!msg.id || !user || !activeChat) return null;
        const isOwnMessage = msg.senderId === user.uid;
        const prev = messages[index - 1];
        const next = messages[index + 1];
        const ms = msOf(msg);
        const newDay = !prev || startOfDay(msOf(prev)) !== startOfDay(ms);
        const joinsPrev = !newDay && prev && prev.type !== 'event' && prev.senderId === msg.senderId && ms - msOf(prev) < GROUP_GAP_MS;
        const joinsNext = next && next.type !== 'event' && next.senderId === msg.senderId && msOf(next) - ms < GROUP_GAP_MS && startOfDay(msOf(next)) === startOfDay(ms);
        const showSenderName = activeChatObj?.type === 'group' && !isOwnMessage && !joinsPrev && msg.type !== 'event';
        const time = msg.createdAt?.seconds ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…';

        const separator = newDay ? (
            <div className="flex justify-center my-3">
                <span className="text-[11px] font-semibold text-gray-400 bg-white/5 rounded-full px-3 py-1">{chatDayLabel(ms)}</span>
            </div>
        ) : null;

        if (msg.type === 'event' && msg.event) {
            const note = msg.event;
            const text = eventNoteText(note, nameOf(msg.senderId), note.targetId ? nameOf(note.targetId) : undefined);
            return (
                <div key={msg.id} id={`msg-${msg.id}`}>
                    {separator}
                    <div className="flex justify-center my-1.5">
                        <button
                            type="button"
                            disabled={!note.inviteId}
                            onClick={() => note.inviteId && setOpenEvent({ id: note.inviteId })}
                            className="max-w-[85%] text-[12px] text-gray-400 bg-white/[0.04] rounded-full px-3 py-1 text-center enabled:hover:text-gray-200"
                        >
                            {text} <span className="text-gray-600">· {time}</span>
                        </button>
                    </div>
                </div>
            );
        }

        const sharedEntity = parseSharedEntity(msg);
        const isShareMessage = (msg.type === 'share' || msg.type === 'review-share') && Boolean(sharedEntity);
        const shareLabel = sharedEntity ? (sharedEntity.badgeLabel || getShareEntityLabel(sharedEntity.type)) : 'Contenido';
        const bigEmoji = msg.type !== 'invite' && msg.type !== 'poll' && msg.type !== 'datepoll' && msg.type !== 'pachote' && !isShareMessage && !msg.replyTo && isEmojiOnly(msg.text);
        const isCard = (msg.type === 'invite' && msg.invite) || (msg.type === 'poll' && msg.poll) || (msg.type === 'datepoll' && msg.datePoll) || (msg.type === 'pachote' && msg.pachote);
        const corner = isOwnMessage
            ? (joinsNext ? 'rounded-br-lg' : 'rounded-br-md') + (joinsPrev ? ' rounded-tr-lg' : '')
            : (joinsNext ? 'rounded-bl-lg' : 'rounded-bl-md') + (joinsPrev ? ' rounded-tl-lg' : '');

        let body: React.ReactNode;
        if (msg.type === 'invite' && msg.invite) {
            body = (
                <EventCard
                    invite={msg.invite}
                    senderId={msg.senderId}
                    uid={user.uid}
                    participants={participants}
                    personOf={personOf}
                    onOpen={(focus) => setOpenEvent({ id: msg.id!, focus })}
                    onRespond={(status) => respond(msg, status)}
                />
            );
        } else if (msg.type === 'poll' && msg.poll) {
            body = (
                <PollCard
                    poll={msg.poll}
                    uid={user.uid}
                    isMine={isOwnMessage}
                    nameOf={nameOf}
                    onVote={(optionId) => runChatAction(() => ChatService.votePoll(activeChat, msg.id!, user.uid, optionId))}
                    onInviteWinner={(dish) => setTool({ kind: 'invite', dish })}
                />
            );
        } else if (msg.type === 'datepoll' && msg.datePoll) {
            const datePoll = msg.datePoll;
            body = (
                <DatePollCard
                    poll={datePoll}
                    uid={user.uid}
                    participants={participants}
                    personOf={personOf}
                    nameOf={nameOf}
                    onVote={(optionId, vote) => runChatAction(() => ChatService.voteDate(activeChat, msg.id!, user.uid, optionId, vote))}
                    onConvert={(row) => setTool({ kind: 'invite', dish: datePoll.place ?? null, when: row.when, pollId: msg.id })}
                    onOpenEvent={(id) => setOpenEvent({ id })}
                />
            );
        } else if (msg.type === 'pachote' && msg.pachote) {
            const card = msg.pachote;
            body = <PachoteCard gid={card.gid} name={card.name} uid={user.uid} onOpen={() => setPachoteOpen(card.gid)} />;
        } else if (bigEmoji) {
            body = <p className="text-5xl leading-tight px-1 animate-fade-in" title={time}>{msg.text.trim()}</p>;
        } else {
            body = (
                <div className={`rounded-3xl ${corner} px-3.5 py-2 ${isOwnMessage
                    ? 'bg-[var(--lt-accent)] text-white shadow-md shadow-[var(--lt-accent-shadow)]'
                    : 'bg-[var(--lt-card-strong)] text-gray-100 border border-white/5'}`}>
                    {msg.replyTo && (
                        <button
                            type="button"
                            onClick={() => scrollToMessage(msg.replyTo!.id)}
                            className={`block w-full text-left mb-1 pl-2 border-l-2 rounded-sm text-xs ${isOwnMessage ? 'border-white/60 text-white/80' : 'border-[var(--lt-accent)] text-gray-400'}`}
                        >
                            <span className="font-bold">{nameOf(msg.replyTo.senderId)}</span>
                            <span className="block truncate">{msg.replyTo.text || '…'}</span>
                        </button>
                    )}
                    {isShareMessage && sharedEntity ? (
                        <div className="space-y-2">
                            {msg.text?.trim() && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                            <button
                                type="button"
                                onClick={() => openSharedEntity(sharedEntity)}
                                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${isOwnMessage ? 'bg-white/10 border-white/20 hover:bg-white/15' : 'bg-[var(--lt-bg-deep)] border-white/10 hover:bg-[var(--lt-card)]'}`}
                            >
                                <div className="flex items-start gap-3">
                                    {sharedEntity.imageUrl ? (
                                        <img src={sharedEntity.imageUrl} alt={sharedEntity.title} className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-xs font-bold shrink-0">
                                            {shareLabel.slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[10px] uppercase tracking-wider opacity-75 font-bold">{shareLabel}</div>
                                        <div className="text-sm font-bold truncate">{sharedEntity.title}</div>
                                        {sharedEntity.subtitle && <div className="text-xs opacity-80 truncate">{sharedEntity.subtitle}</div>}
                                    </div>
                                    <ExternalLink className="w-3.5 h-3.5 opacity-70 shrink-0 mt-0.5" />
                                </div>
                            </button>
                        </div>
                    ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    )}
                    <span className="text-[10px] opacity-50 block text-right mt-0.5">{time}</span>
                </div>
            );
        }

        return (
            <div key={msg.id} className={joinsPrev ? 'mt-0.5' : 'mt-3'}>
                {separator}
                {showSenderName && <p className="text-[11px] text-gray-500 ml-11 mb-0.5">{profileName(msg.senderId)}</p>}
                <div className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    {activeChatObj?.type === 'group' && !isOwnMessage && (
                        <span className="w-7 shrink-0">{!joinsNext && <Avatar person={personOf(msg.senderId)} size={28} />}</span>
                    )}
                    <div className="min-w-0 flex-1">
                        <MessageBubble
                            messageId={msg.id}
                            isOwn={isOwnMessage}
                            uid={user.uid}
                            reactions={msg.reactions}
                            onReact={(emoji) => runChatAction(() => ChatService.setReaction(activeChat, msg.id!, user.uid, emoji))}
                            onReply={() => startReply(msg)}
                            wide={Boolean(isCard)}
                        >
                            {body}
                        </MessageBubble>
                        {isCard && !joinsNext && <p className={`text-[10px] text-gray-500 mt-0.5 ${isOwnMessage ? 'text-right mr-1' : 'ml-1'}`}>{time}</p>}
                    </div>
                </div>
            </div>
        );
    };

    const dateTool = tool?.kind === 'date' ? findMessage(tool.messageId) : null;

    return (
        // Ocupa justo lo visible (sin barras del navegador ni teclado) para que la barra de escribir no se corte.
        <div
            className={`fixed inset-x-0 top-0 h-[100dvh] bg-[var(--lt-bg)] flex overflow-hidden ${mobileView === 'chat'
                ? 'pt-[env(safe-area-inset-top)] md:pt-[calc(env(safe-area-inset-top)+5rem)]'
                : 'pt-[calc(env(safe-area-inset-top)+5rem)]'}`}
            style={viewport ? { height: viewport.height, top: viewport.top } : undefined}
        >
            {/* Lista de chats */}
            <div className={`w-full md:w-80 lg:w-96 bg-[var(--lt-card-strong)] border-r border-white/10 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
                <div className="px-4 pt-4 pb-3 flex justify-between items-center">
                    <h1 className="text-2xl font-extrabold text-white">Mensajes</h1>
                    <button
                        onClick={() => setNewChatOpen(true)}
                        className="p-2.5 bg-[var(--lt-accent)] rounded-full text-white shadow-md shadow-[var(--lt-accent-shadow)] active:scale-95 transition-transform"
                        title="Nuevo chat"
                        aria-label="Nuevo chat"
                    >
                        <SquarePen className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-4 pb-3">
                    <div className="relative">
                        <input
                            type="search"
                            value={listQuery}
                            onChange={(e) => setListQuery(e.target.value)}
                            placeholder="Buscar chats…"
                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                        />
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
                    {visibleChats.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">{listQuery ? 'Ningún chat coincide.' : 'Aún no tienes chats.'}</p>
                            {!listQuery && (
                                <button type="button" onClick={() => setNewChatOpen(true)} className="mt-3 text-sm font-bold text-[var(--lt-accent)]">Empieza uno 💬</button>
                            )}
                        </div>
                    ) : (
                        visibleChats.map(chat => {
                            const unread = chat.unreadCount?.[user?.uid || ''] || 0;
                            const next = upcomingEvents(chat.events, [])[0];
                            const photo = getChatPhoto(chat);
                            return (
                                <button
                                    type="button"
                                    key={chat.id}
                                    onClick={() => navigate(`/chats/${chat.id}`)}
                                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-white/5 ${activeChat === chat.id ? 'bg-[var(--lt-accent-soft)]' : ''}`}
                                >
                                    <span className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-[var(--lt-accent-soft)] flex items-center justify-center text-[var(--lt-accent)] font-bold text-lg">
                                        {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : chat.type === 'group' ? <Users className="w-5 h-5" /> : getChatName(chat).charAt(0).toUpperCase()}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex justify-between items-baseline gap-2">
                                            <span className={`text-sm truncate ${unread ? 'font-extrabold text-white' : 'font-semibold text-gray-100'}`}>{getChatName(chat)}</span>
                                            <span className={`text-[10px] whitespace-nowrap ${unread ? 'text-[var(--lt-accent)] font-bold' : 'text-gray-500'}`}>{listTime(chat.lastMessageTimestamp?.seconds)}</span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <span className={`text-xs truncate flex-1 ${unread ? 'text-gray-200' : 'text-gray-400'}`}>{chat.lastMessage || 'Nueva conversación'}</span>
                                            {unread > 0 && (
                                                <span className="bg-[var(--lt-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unread}</span>
                                            )}
                                        </span>
                                        {next && <span className="mt-1 inline-block text-[10px] font-semibold text-[var(--lt-accent)] bg-[var(--lt-accent-soft)] rounded-full px-2 py-0.5 truncate max-w-full">📅 {formatWhen(next.when)} · {next.title}</span>}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Conversación */}
            <div className={`flex-1 flex flex-col min-w-0 bg-[var(--lt-bg)] ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
                {activeChat && user ? (
                    <>
                        <div className="h-16 border-b border-white/10 flex items-center justify-between px-3 bg-[var(--lt-card-strong)] sticky top-0 z-20">
                            <div className="flex items-center gap-2 min-w-0">
                                <button onClick={() => navigate('/chats')} className="md:hidden p-1.5 text-gray-400 hover:text-white" aria-label="Volver">
                                    <ArrowLeft className="w-6 h-6" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => (activePrivateParticipantId ? navigate(`/profile/${activePrivateParticipantId}`) : setIsInfoModalOpen(true))}
                                    className="flex items-center gap-3 min-w-0 hover:opacity-90"
                                    title={activePrivateParticipantId ? 'Ver perfil' : 'Info del grupo'}
                                >
                                    <span className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[var(--lt-accent-soft)] flex items-center justify-center">
                                        {activeChatObj && getChatPhoto(activeChatObj)
                                            ? <img src={getChatPhoto(activeChatObj)!} alt="" className="w-full h-full object-cover" />
                                            : activeChatObj?.type === 'group' ? <Users className="w-5 h-5 text-[var(--lt-accent)]" /> : <User className="w-5 h-5 text-[var(--lt-accent)]" />}
                                    </span>
                                    <span className="text-left min-w-0">
                                        <span className="block text-white font-bold text-sm md:text-base truncate">{activeChatObj ? getChatName(activeChatObj) : 'Conversación'}</span>
                                        <span className="block text-xs text-gray-500 truncate">
                                            {activeChatObj?.type === 'group'
                                                ? participants.map((p) => nameOf(p)).join(', ')
                                                : activePrivateUser?.username ? `@${activePrivateUser.username}` : ''}
                                        </span>
                                    </span>
                                </button>
                            </div>
                            <button onClick={() => setIsInfoModalOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors" aria-label="Info del chat">
                                <MoreVertical className="w-5 h-5" />
                            </button>
                        </div>

                        <PinnedEvents events={pinned} onOpen={(id) => setOpenEvent({ id })} />
                        {activeChatObj?.type === 'group' && <JoinRequests key={activeChatObj.id} chatId={activeChatObj.id} me={me()} />}

                        <div className="relative flex-1 min-h-0">
                            <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-3 pt-2 pb-4">
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 px-6">
                                        <span className="text-5xl mb-3">👋</span>
                                        <p className="text-sm">Saluda, o invita a comer con el botón 🍽️.</p>
                                        {activeChatObj?.type === 'group' && (
                                            <div className="w-full max-w-xs mt-5 text-left">
                                                <p className="text-xs text-gray-400 mb-2 text-center">Invita a tu gente al grupo:</p>
                                                <JoinLinkBox chat={activeChatObj} byName={me().name} />
                                            </div>
                                        )}
                                    </div>
                                )}
                                {messages.map(renderMessage)}
                            </div>
                            {!atBottom && (
                                <button
                                    type="button"
                                    onClick={scrollToBottom}
                                    className="absolute right-4 bottom-3 w-10 h-10 rounded-full bg-[var(--lt-card-strong)] border border-white/10 shadow-xl flex items-center justify-center text-white"
                                    aria-label="Ir al final"
                                >
                                    <ChevronDown className="w-5 h-5" />
                                    {unseen > 0 && <span className="absolute -top-1.5 -right-1 bg-[var(--lt-accent)] text-[10px] font-bold rounded-full px-1.5 py-0.5">{unseen}</span>}
                                </button>
                            )}
                        </div>

                        <div className="bg-[var(--lt-card-strong)] border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
                            {replyingTo && (
                                <div className="flex items-center gap-2 px-4 pt-2">
                                    <div className="flex-1 min-w-0 pl-2 border-l-2 border-[var(--lt-accent)] text-xs">
                                        <p className="font-bold text-[var(--lt-accent)]">Respondiendo a {nameOf(replyingTo.senderId)}</p>
                                        <p className="text-gray-400 truncate">{replyingTo.text || '…'}</p>
                                    </div>
                                    <button type="button" onClick={() => setReplyingTo(null)} className="p-1 text-gray-400 hover:text-white" aria-label="Cancelar respuesta">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                            {toolsOpen && (
                                <div className={`grid ${pachoteOn ? 'grid-cols-5' : 'grid-cols-4'} gap-1.5 px-3 pt-3 animate-fade-in`}>
                                    {[
                                        { label: 'Invitar a comer', icon: '🍽️', open: () => setTool({ kind: 'invite' }) },
                                        { label: '¿Cuándo quedamos?', icon: '📅', open: () => setTool({ kind: 'datepoll' }) },
                                        { label: '¿Dónde comemos?', icon: '🗳️', open: () => setTool({ kind: 'poll' }) },
                                        { label: 'Ruleta del antojo', icon: '🎰', open: () => setTool({ kind: 'roulette' }) },
                                        ...(pachoteOn ? [{ label: 'Cuentas', icon: '💸', open: () => setTool({ kind: 'pachote' }) }] : []),
                                    ].map((t) => (
                                        <button
                                            key={t.label}
                                            type="button"
                                            onClick={() => { setToolsOpen(false); t.open(); }}
                                            className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 hover:bg-white/10 py-3 px-0.5 text-[10px] leading-tight text-center font-semibold text-gray-200"
                                        >
                                            <span className="text-2xl">{t.icon}</span>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {emojiOpen && <EmojiPanel onPick={(emoji) => setNewMessage((m) => m + emoji)} />}
                            <form onSubmit={handleSendMessage} className={`flex items-end gap-1.5 p-2.5 ${viewport?.keyboard ? '' : 'pb-[calc(0.625rem+env(safe-area-inset-bottom))]'}`}>
                                <button
                                    type="button"
                                    onClick={() => { setEmojiOpen((v) => !v); setToolsOpen(false); }}
                                    className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xl transition-colors ${emojiOpen ? 'bg-white/15' : 'hover:bg-white/10'}`}
                                    aria-label="Emojis"
                                >
                                    😊
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setToolsOpen((v) => !v); setEmojiOpen(false); }}
                                    className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xl transition-colors ${toolsOpen ? 'bg-white/15' : 'hover:bg-white/10'}`}
                                    aria-label="Invitar, encuesta o ruleta"
                                >
                                    🍽️
                                </button>
                                <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={onComposerKey}
                                    onFocus={() => { setEmojiOpen(false); setToolsOpen(false); }}
                                    placeholder="Escribe un mensaje..."
                                    className="flex-1 min-w-0 resize-none bg-[var(--lt-bg)] border border-white/10 rounded-3xl px-4 py-2.5 text-white leading-5 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="w-10 h-10 shrink-0 flex items-center justify-center bg-[var(--lt-accent)] text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-90"
                                    aria-label="Enviar"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-4 text-center">
                        <span className="text-6xl mb-4">💬</span>
                        <h2 className="text-xl font-bold text-white mb-2">Tus conversaciones</h2>
                        <p className="max-w-md">Elige un chat o empieza uno nuevo. Desde el chat puedes invitar a comer 🍽️.</p>
                    </div>
                )}
            </div>

            {user && newChatOpen && (
                <NewChatSheet
                    uid={user.uid}
                    onClose={() => setNewChatOpen(false)}
                    onPrivate={async (userId) => {
                        const id = await ChatService.createPrivateChat(user.uid, userId);
                        navigate(`/chats/${id}`);
                    }}
                    onGroup={async (name, userIds) => {
                        const id = await ChatService.createGroupChat(user.uid, name, userIds);
                        // Grupo nuevo con su enlace listo para compartir.
                        await ChatService.createJoinLink(id, name, me().name).catch(console.error);
                        navigate(`/chats/${id}`);
                    }}
                />
            )}

            {user && activeChat && tool?.kind === 'invite' && (
                <InviteSheet
                    initial={tool.dish}
                    initialWhen={tool.when}
                    onClose={() => setTool(null)}
                    onSend={(invite) => runChatAction(async () => {
                        const id = await ChatService.sendInvite(activeChat, user.uid, invite);
                        if (tool.pollId) await ChatService.linkDatePollInvite(activeChat, tool.pollId, id);
                    }, 'No se pudo enviar la invitación.')}
                />
            )}
            {user && activeChat && tool?.kind === 'poll' && (
                <PollSheet
                    onClose={() => setTool(null)}
                    onSend={(options) => runChatAction(() => ChatService.sendPoll(activeChat, user.uid, options), 'No se pudo enviar la encuesta.')}
                />
            )}
            {user && activeChat && tool?.kind === 'datepoll' && (
                <DatePollSheet
                    onClose={() => setTool(null)}
                    onSend={(whens, place) => runChatAction(() => ChatService.sendDatePoll(activeChat, user.uid, whens, place), 'No se pudo enviar la encuesta.')}
                />
            )}
            {user && activeChat && tool?.kind === 'roulette' && (
                <RouletteSheet
                    onClose={() => setTool(null)}
                    onInvite={(dish) => setTool({ kind: 'invite', dish })}
                    onShare={(dish) => runChatAction(() => shareDishToChat(dish))}
                />
            )}
            {user && activeChatObj && tool?.kind === 'pachote' && (
                <ChatSheet title="💸 Cuentas" onClose={() => setTool(null)}>
                    <PachotePanel
                        chat={activeChatObj}
                        chatName={getChatName(activeChatObj)}
                        me={me()}
                        people={chatPeople}
                        onOpen={(gid) => { setTool(null); setPachoteOpen(gid); }}
                    />
                </ChatSheet>
            )}
            {user && activeChat && pachoteOpen && (
                <PachoteSheet
                    gid={pachoteOpen}
                    chatId={activeChat}
                    uid={user.uid}
                    personOf={personOf}
                    onShare={() => {
                        const name = activeChatObj?.pachote?.[pachoteOpen]?.name || 'las cuentas';
                        setPachoteOpen(null);
                        void runChatAction(() => PachoteService.shareCard(activeChat, user.uid, pachoteOpen, name), 'No se pudo enviar.');
                    }}
                    onClose={() => setPachoteOpen(null)}
                />
            )}
            {user && activeChat && tool?.kind === 'date' && dateTool?.invite && (
                <DateSheet
                    title={tool.mode === 'change' ? '📅 Cambiar fecha' : '🗓️ Proponer otro día'}
                    cta={tool.mode === 'change' ? 'Cambiar' : 'Proponer'}
                    initial={tool.mode === 'change' ? dateTool.invite.when : undefined}
                    onClose={() => setTool(null)}
                    onSend={(when) => runChatAction(() => (tool.mode === 'change'
                        ? ChatService.changeInviteDate(activeChat, dateTool, me(), when)
                        : ChatService.respondInvite(activeChat, dateTool, me(), 'other', when)))}
                />
            )}
            {user && activeChat && openEvent && eventMessage?.invite && eventMessage.id && (
                <EventSheet
                    invite={eventMessage.invite}
                    messageId={eventMessage.id}
                    senderId={eventMessage.senderId}
                    uid={user.uid}
                    participants={participants}
                    personOf={personOf}
                    focus={openEvent.focus}
                    onClose={() => setOpenEvent(null)}
                    onRespond={(status) => respond(eventMessage, status)}
                    onProposeDate={() => setTool({ kind: 'date', messageId: eventMessage.id!, mode: 'propose' })}
                    onChangeDate={() => setTool({ kind: 'date', messageId: eventMessage.id!, mode: 'change' })}
                    onAcceptProposal={(from, when) => runChatAction(() => ChatService.changeInviteDate(activeChat, eventMessage, me(), when, from))}
                    onCancel={() => runChatAction(() => ChatService.cancelInvite(activeChat, eventMessage, me()))}
                />
            )}

            {isInfoModalOpen && activeChatObj && user && createPortal(
                <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setIsInfoModalOpen(false); }}>
                    <div className="bg-[var(--lt-card-strong)] rounded-3xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden lt-mobile-modal-panel overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-white/5 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">{activeChatObj.type === 'group' ? 'Grupo' : 'Chat'}</h2>
                            <button onClick={() => setIsInfoModalOpen(false)} className="text-gray-400 hover:text-white" aria-label="Cerrar">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="text-center">
                                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[var(--lt-accent-border)] mx-auto mb-3 bg-[var(--lt-accent-soft)] flex items-center justify-center">
                                    {getChatPhoto(activeChatObj)
                                        ? <img src={getChatPhoto(activeChatObj)!} alt="" className="w-full h-full object-cover" />
                                        : activeChatObj.type === 'group' ? <Users className="w-8 h-8 text-[var(--lt-accent)]" /> : <User className="w-8 h-8 text-[var(--lt-accent)]" />}
                                </div>
                                {activeChatObj.type === 'group' ? (
                                    <form
                                        className="flex gap-2 mb-5"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            if (groupNameDraft.trim()) void runChatAction(() => ChatService.renameGroup(activeChatObj.id, groupNameDraft, activeChatObj.joinCode));
                                        }}
                                    >
                                        <input
                                            value={groupNameDraft || activeChatObj.groupName || ''}
                                            onChange={(e) => setGroupNameDraft(e.target.value)}
                                            maxLength={60}
                                            aria-label="Nombre del grupo"
                                            className="flex-1 min-w-0 bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2 text-white text-center font-bold focus:outline-none focus:border-[var(--lt-accent-border)]"
                                        />
                                        {groupNameDraft.trim() && groupNameDraft !== activeChatObj.groupName && (
                                            <button type="submit" className="px-3 rounded-xl bg-[var(--lt-accent)] text-white text-sm font-bold">Guardar</button>
                                        )}
                                    </form>
                                ) : (
                                    <h3 className="text-xl font-bold text-white mb-5">{getChatName(activeChatObj)}</h3>
                                )}
                            </div>

                            {activeChatObj.type === 'group' && <JoinLinkBox chat={activeChatObj} byName={me().name} />}

                            {pachoteOn && (
                                <PachotePanel
                                    chat={activeChatObj}
                                    chatName={getChatName(activeChatObj)}
                                    me={me()}
                                    people={chatPeople}
                                    onOpen={(gid) => { setIsInfoModalOpen(false); setPachoteOpen(gid); }}
                                />
                            )}

                            <h4 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Participantes ({participants.length})</h4>
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1 mb-5">
                                {participants.map(pid => (
                                    <button key={pid} type="button" onClick={() => pid !== user.uid && navigate(`/profile/${pid}`)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left">
                                        <Avatar person={personOf(pid)} size={32} />
                                        <span className="text-sm text-gray-200">{pid === user.uid ? 'Tú' : profileName(pid)}</span>
                                    </button>
                                ))}
                            </div>

                            <h4 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Añadir a alguien</h4>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={participantInput}
                                    onChange={(e) => setParticipantInput(e.target.value)}
                                    placeholder="Buscar por nombre o @usuario…"
                                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                                />
                                {(searchResults.length > 0 || isSearching) && participantInput.length >= 2 && (
                                    <div className="absolute bottom-full mb-2 left-0 right-0 bg-[var(--lt-bg)] border border-white/10 rounded-xl shadow-xl overflow-hidden z-20 max-h-48 overflow-y-auto">
                                        {isSearching ? (
                                            <div className="p-3 text-center text-xs text-gray-500">Buscando…</div>
                                        ) : (
                                            searchResults.map((hit) => (
                                                <button
                                                    key={hit.objectID}
                                                    onClick={async () => {
                                                        if (participants.includes(hit.objectID)) {
                                                            showToast({ variant: "info", message: "Esa persona ya está en el chat." });
                                                            return;
                                                        }
                                                        setAddingParticipant(true);
                                                        await runChatAction(
                                                            () => ChatService.addParticipant(activeChatObj.id, hit.objectID, { ...me(), targetName: hit.displayName || hit.username || hit.name || 'alguien' }),
                                                            'No se pudo añadir a esa persona.'
                                                        );
                                                        setParticipantInput('');
                                                        setSearchResults([]);
                                                        setAddingParticipant(false);
                                                    }}
                                                    className="w-full text-left p-3 hover:bg-white/5 flex items-center gap-3 transition-colors border-b border-white/5 last:border-0"
                                                    disabled={addingParticipant}
                                                >
                                                    <Avatar person={{ name: hit.displayName || hit.username || hit.name || '?', photoUrl: hit.photoUrl || hit.image }} size={32} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-white truncate">{hit.displayName || hit.username || hit.name}</p>
                                                        {hit.username && <p className="text-xs text-gray-500 truncate">@{hit.username}</p>}
                                                    </div>
                                                    {participants.includes(hit.objectID) && <span className="text-xs text-[var(--lt-accent)]">En el chat</span>}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            {activeChatObj.type === 'private' && (
                                <p className="text-[10px] text-gray-500 mt-2">Añadir a alguien convierte este chat en un grupo.</p>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
