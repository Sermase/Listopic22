import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChatService, type Chat, type Message } from '../services/ChatService';
import { Send, MoreVertical, Search, MessageSquare, ArrowLeft, UserPlus, X, Users, User, ExternalLink } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import type { ShareEntityPayload } from '../types/share';
import { getShareEntityLabel } from '../types/share';
import { getLocalRouteFromUrl } from '../utils/publicUrl';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useToast } from '../context/ToastContext';
import { MessageBubble } from '../components/chat/MessageBubble';
import { EmojiPanel } from '../components/chat/EmojiPanel';
import { InviteCard } from '../components/chat/InviteCard';
import { PollCard } from '../components/chat/PollCard';
import { InviteSheet, DateSheet } from '../components/chat/InviteSheet';
import { PollSheet } from '../components/chat/PollSheet';
import { RouletteSheet } from '../components/chat/RouletteSheet';
import { DuelModal } from '../components/chat/DuelModal';
import { buildPublicRouteUrl } from '../utils/publicUrl';
import { dishRoute, inviteAttendees, isEmojiOnly, type DishRef, type ReplyRef } from '../lib/chatExtras';

type ChatTool =
    | { kind: 'invite'; dish?: DishRef | null }
    | { kind: 'poll' }
    | { kind: 'roulette' }
    | { kind: 'date'; message: Message; mode: 'propose' | 'change' }
    | { kind: 'duel'; message: Message }
    | null;

export const ChatsPage: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { chatId } = useParams();
    const [chats, setChats] = useState<Chat[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [activeChat, setActiveChat] = useState<string | null>(chatId || null);
    const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Group Creation State
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [usersMap, setUsersMap] = useState<Record<string, any>>({});

    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [participantInput, setParticipantInput] = useState('');
    const [addingParticipant, setAddingParticipant] = useState(false);

    // Search State
    const [searchResults, setSearchResults] = useState<any[]>([]);
    // Chat «con vida»
    const [replyingTo, setReplyingTo] = useState<ReplyRef | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [tool, setTool] = useState<ChatTool>(null);
    const [isSearching, setIsSearching] = useState(false);
    useBodyScrollLock(isGroupModalOpen || isInfoModalOpen);

    // Debounced Search Effect
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
                setSearchResults((response.results[0] as any).hits);
            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [participantInput]);

    // Real-time user details (incl. online presence) for private chats
    useEffect(() => {
        if (!user || chats.length === 0) return;

        // Privados (nombre y foto en la lista) y todos los del chat abierto (invitaciones, encuestas, grupos).
        const privateTargets = Array.from(new Set([
            ...chats
                .filter(c => c.type === 'private')
                .map(c => c.participants.find(p => p !== user.uid)),
            ...(chats.find(c => c.id === activeChat)?.participants || []).filter(p => p !== user.uid)
        ].filter(Boolean))) as string[];

        if (privateTargets.length === 0) return;

        const unsubs = privateTargets.map((uid) => onSnapshot(doc(db, 'publicProfiles', uid), (snap) => {
            setUsersMap(prev => ({
                ...prev,
                [uid]: snap.exists()
                    ? snap.data()
                    : { displayName: 'Usuario Eliminado', name: 'Usuario Eliminado', isOnline: false }
            }));
        }, () => {
            setUsersMap(prev => ({
                ...prev,
                [uid]: prev[uid] || { displayName: 'Usuario Desconocido', isOnline: false }
            }));
        }));

        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, [chats, user, activeChat]);

    // Initial load of chats
    useEffect(() => {
        if (!user) return;
        const unsubscribe = ChatService.subscribeToChats(user.uid, (data) => {
            setChats(data);
        });
        return () => unsubscribe();
    }, [user]);

    // Handle URL param sync
    useEffect(() => {
        if (chatId) {
            setActiveChat(chatId);
            setMobileView('chat');
            // Borrar notificación de chat al abrirlo
            if (user) {
                deleteDoc(doc(db, 'users', user.uid, 'notifications', `msg_${chatId}`)).catch(() => {});
            }
        } else {
            setActiveChat(null);
            setMobileView('list');
        }
    }, [chatId, user]);

    // Load messages for active chat
    useEffect(() => {
        if (!activeChat) return;
        setReplyingTo(null);
        setEmojiOpen(false);
        setToolsOpen(false);
        const unsubscribe = ChatService.subscribeToMessages(activeChat, (data) => {
            setMessages(data);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });

        // Mark as read when opening
        if (user) {
            ChatService.markChatAsRead(activeChat, user.uid).catch(console.error);
        }

        return () => unsubscribe();
    }, [activeChat, user]);

    useEffect(() => {
        if (!user || !activeChat || messages.length === 0) return;
        const hasIncoming = messages.some(msg => msg.senderId !== user.uid && !(msg.readBy || []).includes(user.uid));
        if (hasIncoming) {
            ChatService.markChatAsRead(activeChat, user.uid).catch(console.error);
        }
    }, [messages, activeChat, user]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !activeChat || !newMessage.trim()) return;

        try {
            await ChatService.sendMessage(activeChat, user.uid, newMessage, 'text', undefined, replyingTo ? { replyTo: replyingTo } : undefined);
            setNewMessage('');
            setReplyingTo(null);
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    const nameOf = (uid: string) => {
        if (uid === user?.uid) return 'Tú';
        const p = usersMap[uid];
        return (p?.displayName || p?.username || p?.name || 'Alguien').split(' ')[0];
    };

    const runChatAction = async (action: () => Promise<void>, errorMessage = 'No se pudo hacer. Inténtalo otra vez.') => {
        try {
            await action();
        } catch (error) {
            console.error('Chat:', error);
            showToast({ variant: 'error', message: errorMessage });
        }
    };

    const startReply = (msg: Message) => {
        if (!msg.id) return;
        const text = (msg.text || '').trim();
        setReplyingTo({ id: msg.id, senderId: msg.senderId, text: text.length > 140 ? `${text.slice(0, 140)}…` : text });
    };

    const scrollToMessage = (id: string) => {
        const el = document.getElementById(`msg-${id}`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('animate-pulse');
        setTimeout(() => el.classList.remove('animate-pulse'), 1200);
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

    const getChatName = (chat: Chat) => {
        if (chat.type === 'group') return chat.groupName || 'Grupo sin nombre';

        const targetId = chat.participants.find(p => p !== user?.uid);
        if (targetId && usersMap[targetId]) {
            return usersMap[targetId].displayName || usersMap[targetId].username || usersMap[targetId].name || 'Usuario';
        }

        // If we have a target ID but no data yet, it's loading or failed
        if (targetId) return 'Usuario...';

        return `Chat`;
    };

    const getChatPhoto = (chat: Chat) => {
        if (chat.type === 'group') return chat.groupPhoto || null; // Return null to show default icon

        const targetId = chat.participants.find(p => p !== user?.uid);
        if (targetId && usersMap[targetId]) {
            return usersMap[targetId].photoUrl || null;
        }
        return null; // Default
    };

    const activeChatObj = chats.find(c => c.id === activeChat);
    const activePrivateParticipantId = useMemo(() => {
        if (!activeChatObj || activeChatObj.type !== 'private') return null;
        return activeChatObj.participants.find(p => p !== user?.uid) || null;
    }, [activeChatObj, user]);
    const activePrivateUser = activePrivateParticipantId ? usersMap[activePrivateParticipantId] : null;

    const goToActivePrivateProfile = () => {
        if (!activePrivateParticipantId) return;
        navigate(`/profile/${activePrivateParticipantId}`);
    };

    const parseSharedEntity = (msg: Message): ShareEntityPayload | null => {
        const rawMetadata = msg.metadata;
        if (!rawMetadata || typeof rawMetadata !== 'object') return null;

        const rawShare = (rawMetadata as Record<string, unknown>).share;
        if (!rawShare || typeof rawShare !== 'object') return null;

        const share = rawShare as Record<string, unknown>;
        const title = typeof share.title === 'string' ? share.title.trim() : '';
        const url = typeof share.url === 'string' ? share.url.trim() : '';
        const type = typeof share.type === 'string' ? share.type.trim() : 'link';
        if (!title || !url) return null;

        const allowedTypes = new Set<ShareEntityPayload['type']>([
            'place',
            'group',
            'list',
            'sublist',
            'profile',
            'app',
            'review',
            'link'
        ]);
        const normalizedType: ShareEntityPayload['type'] = allowedTypes.has(type as ShareEntityPayload['type'])
            ? (type as ShareEntityPayload['type'])
            : 'link';

        return {
            type: normalizedType,
            title,
            url,
            id: typeof share.id === 'string' ? share.id : undefined,
            subtitle: typeof share.subtitle === 'string' ? share.subtitle : undefined,
            description: typeof share.description === 'string' ? share.description : undefined,
            route: typeof share.route === 'string' ? share.route : undefined,
            imageUrl: typeof share.imageUrl === 'string' ? share.imageUrl : undefined,
            badgeLabel: typeof share.badgeLabel === 'string' ? share.badgeLabel : undefined,
            score: typeof share.score === 'number'
                ? share.score
                : (Number.isFinite(Number(share.score)) ? Number(share.score) : undefined),
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
            const parsedUrl = new URL(shared.url, window.location.origin);
            window.open(parsedUrl.toString(), '_blank', 'noopener,noreferrer');
        } catch {
            window.open(shared.url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pt-safe-20 flex h-screen overflow-hidden">
            {/* Chat List Sidebar */}
            <div className={`w-full md:w-80 lg:w-96 bg-[var(--lt-card-strong)] border-r border-white/10 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[var(--lt-card-strong)]">
                    <h1 className="text-xl font-bold text-white">Mensajes</h1>
                    <button
                        onClick={() => setIsGroupModalOpen(true)}
                        className="p-2 bg-[var(--lt-accent)] rounded-lg text-white hover:bg-[var(--lt-accent)] transition-colors"
                        title="Crear Grupo"
                    >
                        <UserPlus className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-4 pb-4 border-b border-white/10">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Buscar chats..."
                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                        />
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {chats.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No tienes chats activos.</p>
                        </div>
                    ) : (
                        chats.map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => navigate(`/chats/${chat.id}`)}
                                className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${activeChat === chat.id ? 'bg-[var(--lt-accent-soft)] border-l-4 border-l-[var(--lt-accent-border)]' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-700 border border-white/10 relative">
                                        {getChatPhoto(chat) ? (
                                            <img src={getChatPhoto(chat)!} alt="Chat" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] font-bold text-lg">
                                                {getChatName(chat).charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h3 className="font-bold text-white text-sm truncate">{getChatName(chat)}</h3>
                                            {chat.lastMessageTimestamp && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2">
                                                        {new Date(chat.lastMessageTimestamp?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {(chat.unreadCount?.[user?.uid || ''] || 0) > 0 && (
                                                        <span className="mt-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                                            {chat.unreadCount?.[user?.uid || ''] || 0}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-gray-400 text-xs truncate">{chat.lastMessage || 'Nueva conversación'}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col bg-[var(--lt-bg)] ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
                {activeChat ? (
                    <>
                        {/* Header */}
                        <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 bg-[var(--lt-card-strong)] sticky top-0 z-20">
                            <div className="flex items-center gap-3 min-w-0">
                                <button onClick={() => navigate('/chats')} className="md:hidden text-gray-400 hover:text-white">
                                    <ArrowLeft className="w-6 h-6" />
                                </button>

                                <button
                                    type="button"
                                    onClick={goToActivePrivateProfile}
                                    disabled={!activePrivateParticipantId}
                                    className={`flex items-center gap-3 min-w-0 ${activePrivateParticipantId ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                                    title={activePrivateParticipantId ? 'Ver perfil' : undefined}
                                >
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden flex-shrink-0 border border-white/10">
                                        {activeChatObj && getChatPhoto(activeChatObj) ? (
                                            <img src={getChatPhoto(activeChatObj)!} alt="Chat" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-[var(--lt-accent-soft)]">
                                                {activeChatObj?.type === 'group' ? <Users className="w-5 h-5 text-[var(--lt-accent)]" /> : <User className="w-5 h-5 text-[var(--lt-accent)]" />}
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-left min-w-0">
                                        <h2 className="text-white font-bold text-sm md:text-base truncate">{activeChatObj ? getChatName(activeChatObj) : 'Conversación'}</h2>
                                        {activeChatObj?.type === 'group' ? (
                                            <span className="text-xs text-gray-500">{activeChatObj.participants.length} participantes</span>
                                        ) : (
                                            // El indicador "En línea" siempre decía "Desconectado" (la presencia
                                            // no llegaba al perfil público); se muestra el @usuario.
                                            activePrivateUser?.username ? (
                                                <span className="text-xs text-gray-500 truncate block">@{activePrivateUser.username}</span>
                                            ) : null
                                        )}
                                    </div>
                                </button>
                            </div>
                            <button
                                onClick={() => setIsInfoModalOpen(true)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
                            >
                                <MoreVertical className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
                            {messages.map((msg, index) => {
                                if (!msg.id || !user) return null;
                                const isOwnMessage = msg.senderId === user.uid;
                                const prev = messages[index - 1];
                                const showSenderName = activeChatObj?.type === 'group' && !isOwnMessage && prev?.senderId !== msg.senderId;
                                const sharedEntity = parseSharedEntity(msg);
                                const isShareMessage = (msg.type === 'share' || msg.type === 'review-share') && Boolean(sharedEntity);
                                const shareLabel = sharedEntity
                                    ? (sharedEntity.badgeLabel || getShareEntityLabel(sharedEntity.type))
                                    : 'Contenido';
                                const shareCardClass = isOwnMessage
                                    ? 'bg-white/10 border-white/20 hover:bg-white/15'
                                    : 'bg-[var(--lt-bg-deep)] border-white/10 hover:bg-[var(--lt-card)]';
                                const time = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...';
                                const bigEmoji = msg.type !== 'invite' && msg.type !== 'poll' && !isShareMessage && !msg.replyTo && isEmojiOnly(msg.text);
                                const isCard = (msg.type === 'invite' && msg.invite) || (msg.type === 'poll' && msg.poll);

                                let body: React.ReactNode;
                                if (msg.type === 'invite' && msg.invite) {
                                    const invite = msg.invite;
                                    body = (
                                        <InviteCard
                                            invite={invite}
                                            messageId={msg.id}
                                            senderId={msg.senderId}
                                            uid={user.uid}
                                            nameOf={nameOf}
                                            onRespond={(status) => runChatAction(() => ChatService.respondInvite(activeChat, msg, user.uid, status))}
                                            onProposeDate={() => setTool({ kind: 'date', message: msg, mode: 'propose' })}
                                            onChangeDate={() => setTool({ kind: 'date', message: msg, mode: 'change' })}
                                            onAcceptProposal={(from, when) => runChatAction(() => ChatService.changeInviteDate(activeChat, msg, when, from))}
                                            onOpenDuel={() => setTool({ kind: 'duel', message: msg })}
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
                                } else if (bigEmoji) {
                                    body = <p className="text-5xl leading-tight px-1 animate-fade-in" title={time}>{msg.text.trim()}</p>;
                                } else {
                                    body = (
                                        <div className={`rounded-3xl px-3.5 py-2 ${isOwnMessage
                                            ? 'bg-[var(--lt-accent)] text-white rounded-br-md shadow-md shadow-[var(--lt-accent-shadow)]'
                                            : 'bg-[var(--lt-card-strong)] text-gray-100 rounded-bl-md border border-white/5'
                                            }`}>
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
                                                        className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${shareCardClass}`}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            {sharedEntity.imageUrl ? (
                                                                <img
                                                                    src={sharedEntity.imageUrl}
                                                                    alt={sharedEntity.title}
                                                                    className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-xs font-bold shrink-0">
                                                                    {shareLabel.slice(0, 2).toUpperCase()}
                                                                </div>
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-[10px] uppercase tracking-wider opacity-75 font-bold">{shareLabel}</div>
                                                                <div className="text-sm font-bold truncate">{sharedEntity.title}</div>
                                                                {sharedEntity.subtitle && (
                                                                    <div className="text-xs opacity-80 truncate">{sharedEntity.subtitle}</div>
                                                                )}
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
                                    <div key={msg.id}>
                                        {showSenderName && <p className="text-[11px] text-gray-500 ml-3 mb-0.5 mt-2">{nameOf(msg.senderId)}</p>}
                                        <MessageBubble
                                            messageId={msg.id}
                                            isOwn={isOwnMessage}
                                            uid={user.uid}
                                            reactions={msg.reactions}
                                            onReact={(emoji) => runChatAction(() => ChatService.setReaction(activeChat, msg.id!, user.uid, emoji))}
                                            onReply={() => startReply(msg)}
                                        >
                                            {body}
                                        </MessageBubble>
                                        {isCard && <p className={`text-[10px] text-gray-500 mt-0.5 ${isOwnMessage ? 'text-right mr-1' : 'ml-1'}`}>{time}</p>}
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="bg-[var(--lt-card-strong)] border-t border-white/10">
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
                                <div className="grid grid-cols-3 gap-2 px-3 pt-3">
                                    {[
                                        { label: 'Invitar a comer', icon: '🍽️', open: () => setTool({ kind: 'invite' }) },
                                        { label: '¿Dónde comemos?', icon: '🗳️', open: () => setTool({ kind: 'poll' }) },
                                        { label: 'Ruleta del antojo', icon: '🎰', open: () => setTool({ kind: 'roulette' }) },
                                    ].map((t) => (
                                        <button
                                            key={t.label}
                                            type="button"
                                            onClick={() => { setToolsOpen(false); t.open(); }}
                                            className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 hover:bg-white/10 py-3 text-[11px] font-semibold text-gray-200"
                                        >
                                            <span className="text-2xl">{t.icon}</span>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {emojiOpen && <EmojiPanel onPick={(emoji) => setNewMessage((m) => m + emoji)} />}
                            <form onSubmit={handleSendMessage} className="flex items-center gap-1.5 p-3">
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
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onFocus={() => { setEmojiOpen(false); setToolsOpen(false); }}
                                    placeholder="Escribe un mensaje..."
                                    className="flex-1 min-w-0 bg-[var(--lt-bg)] border border-white/10 rounded-full px-4 py-2.5 text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
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
                        <div className="w-20 h-20 bg-[var(--lt-card-strong)] rounded-full flex items-center justify-center mb-6 animate-pulse">
                            <MessageSquare className="w-10 h-10 opacity-50" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Tus conversaciones</h2>
                        <p className="max-w-md">Selecciona un chat de la lista o busca un usuario para comenzar a enviarle mensajes.</p>
                    </div>
                )}
            </div>

            {/* Create Group Modal */}
            {
                isGroupModalOpen && (
                    <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setIsGroupModalOpen(false); }}>
                        <div className="bg-[var(--lt-card-strong)] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl overflow-hidden lt-mobile-modal-panel overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Users className="w-5 h-5 text-[var(--lt-accent)]" /> Crear Grupo
                                </h2>
                                <button onClick={() => setIsGroupModalOpen(false)} className="text-gray-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6">
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre del Grupo</label>
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="Ej. Amigos de Listopic"
                                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--lt-accent-border)] mb-6"
                                />

                                <button
                                    onClick={async () => {
                                        if (!user || !newGroupName.trim()) return;
                                        setIsCreatingGroup(true);
                                        try {
                                            // Create group with just creator for now. User can add others later (TODO)
                                            const chatId = await ChatService.createGroupChat(user.uid, newGroupName, []);
                                            setIsGroupModalOpen(false);
                                            setNewGroupName('');
                                            navigate(`/chats/${chatId}`);
                                        } catch (e) {
                                            console.error(e);
                                        } finally {
                                            setIsCreatingGroup(false);
                                        }
                                    }}
                                    disabled={isCreatingGroup || !newGroupName.trim()}
                                    className="w-full bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {isCreatingGroup ? 'Creando...' : 'Crear Grupo'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* Chat Info Modal */}
            {
                isInfoModalOpen && activeChatObj && (
                    <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) setIsInfoModalOpen(false); }}>
                        <div className="bg-[var(--lt-card-strong)] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden lt-mobile-modal-panel overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[var(--lt-bg)]/50">
                                <h2 className="text-lg font-bold text-white">Info. del Chat</h2>
                                <button onClick={() => setIsInfoModalOpen(false)} className="text-gray-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 text-center">
                                <div className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden border-2 border-[var(--lt-accent-border)] mx-auto mb-4 relative group">
                                    {getChatPhoto(activeChatObj) ? (
                                        <img src={getChatPhoto(activeChatObj)!} alt="Chat" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[var(--lt-accent-soft)]">
                                            {activeChatObj.type === 'group' ? <Users className="w-8 h-8 text-[var(--lt-accent)]" /> : <User className="w-8 h-8 text-[var(--lt-accent)]" />}
                                        </div>
                                    )}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-1">{getChatName(activeChatObj)}</h3>
                                <p className="text-sm text-gray-500 mb-6 capitalize">{activeChatObj.type === 'private' ? 'Chat Privado' : 'Grupo'}</p>

                                <div className="text-left mb-6">
                                    <h4 className="text-xs font-bold uppercase text-gray-400 mb-3 tracking-wider">Participantes ({activeChatObj.participants.length})</h4>
                                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                        {activeChatObj.participants.map(pid => {
                                            const p = usersMap[pid] || { displayName: 'Usuario...' };
                                            return (
                                                <div key={pid} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                                                    <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                                                        {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" /> : <User className="w-4 h-4 m-2 text-gray-400" />}
                                                    </div>
                                                    <span className="text-sm text-gray-200">{pid === user?.uid ? 'Tú' : (p.displayName || p.username || p.name)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="border-t border-white/5 pt-4">
                                    <h4 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider text-left">Añadir participante</h4>
                                    <div className="relative">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={participantInput}
                                                onChange={(e) => setParticipantInput(e.target.value)}
                                                placeholder="Buscar usuario (nombre, email)..."
                                                className="flex-1 bg-[var(--lt-bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                                            />
                                        </div>

                                        {/* Search Results Dropdown */}
                                        {(searchResults.length > 0 || isSearching) && participantInput.length >= 2 && (
                                            <div className="absolute bottom-full mb-2 left-0 right-0 bg-[var(--lt-bg)] border border-white/10 rounded-lg shadow-xl overflow-hidden z-20 max-h-48 overflow-y-auto">
                                                {isSearching ? (
                                                    <div className="p-3 text-center text-xs text-gray-500">Buscando...</div>
                                                ) : (
                                                    searchResults.map((hit: any) => (
                                                        <button
                                                            key={hit.objectID}
                                                            onClick={async () => {
                                                                if (activeChatObj.participants.includes(hit.objectID)) {
                                                                    showToast({ variant: "info", message: "Esa persona ya está en el chat." });
                                                                    return;
                                                                }

                                                                setAddingParticipant(true);
                                                                try {
                                                                    await ChatService.addParticipant(activeChatObj.id, hit.objectID);
                                                                    setParticipantInput('');
                                                                    setSearchResults([]);
                                                                    // Optional: Close modal or show success feedback
                                                                } catch (e) {
                                                                    console.error(e);
                                                                    showToast({ variant: "error", message: "No se pudo añadir a esa persona." });
                                                                } finally {
                                                                    setAddingParticipant(false);
                                                                }
                                                            }}
                                                            className="w-full text-left p-3 hover:bg-white/5 flex items-center gap-3 transition-colors border-b border-white/5 last:border-0"
                                                            disabled={addingParticipant}
                                                        >
                                                            <img src={hit.photoUrl || hit.image || `https://ui-avatars.com/api/?name=${hit.username}`} className="w-8 h-8 rounded-full object-cover" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-bold text-white truncate">{hit.username || hit.name}</p>
                                                                <p className="text-xs text-gray-500 truncate">{hit.bio || 'Sin biografía'}</p>
                                                            </div>
                                                            {activeChatObj.participants.includes(hit.objectID) && <span className="text-xs text-[var(--lt-accent)]">En chat</span>}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {activeChatObj.type === 'private' && (
                                        <p className="text-[10px] text-gray-500 mt-2 text-left">
                                            * Añadir a alguien convertirá este chat en un grupo.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            {user && activeChat && tool?.kind === 'invite' && (
                <InviteSheet
                    initialDish={tool.dish}
                    onClose={() => setTool(null)}
                    onSend={(invite) => runChatAction(() => ChatService.sendInvite(activeChat, user.uid, invite), 'No se pudo enviar la invitación.')}
                />
            )}
            {user && activeChat && tool?.kind === 'poll' && (
                <PollSheet
                    onClose={() => setTool(null)}
                    onSend={(options) => runChatAction(() => ChatService.sendPoll(activeChat, user.uid, options), 'No se pudo enviar la encuesta.')}
                />
            )}
            {user && activeChat && tool?.kind === 'roulette' && (
                <RouletteSheet
                    onClose={() => setTool(null)}
                    onInvite={(dish) => setTool({ kind: 'invite', dish })}
                    onShare={(dish) => runChatAction(() => shareDishToChat(dish))}
                />
            )}
            {user && activeChat && tool?.kind === 'date' && tool.message.invite && (
                <DateSheet
                    title={tool.mode === 'change' ? '📅 Cambiar fecha' : '🗓️ Proponer otro día'}
                    initial={tool.mode === 'change' ? tool.message.invite.when : undefined}
                    onClose={() => setTool(null)}
                    onSend={(when) => runChatAction(() => tool.mode === 'change'
                        ? ChatService.changeInviteDate(activeChat, tool.message, when)
                        : ChatService.respondInvite(activeChat, tool.message, user.uid, 'other', when))}
                />
            )}
            {user && tool?.kind === 'duel' && tool.message.invite && (
                <DuelModal
                    invite={tool.message.invite}
                    attendees={inviteAttendees(tool.message.invite, tool.message.senderId)}
                    uid={user.uid}
                    nameOf={nameOf}
                    onClose={() => setTool(null)}
                />
            )}
        </div >
    );
};
