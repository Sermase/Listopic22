import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChatService, type Chat, type Message } from '../services/ChatService';
import { Send, MoreVertical, Search, MessageSquare, ArrowLeft, UserPlus, X, Users, User, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';

export const ChatsPage: React.FC = () => {
    const { user } = useAuth();
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
    const [isSearching, setIsSearching] = useState(false);

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

    // Fetch User Details for Private Chats
    useEffect(() => {
        const fetchChatUsers = async () => {
            if (!user || chats.length === 0) return;

            const userIdsToFetch = new Set<string>();
            chats.forEach(c => {
                if (c.type === 'private') {
                    const targetId = c.participants.find(p => p !== user.uid);
                    if (targetId && !usersMap[targetId]) {
                        userIdsToFetch.add(targetId);
                    }
                }
            });

            if (userIdsToFetch.size === 0) return;

            const newUsers: Record<string, any> = {};
            await Promise.all(Array.from(userIdsToFetch).map(async (uid) => {
                try {
                    const snap = await getDoc(doc(db, 'users', uid));
                    if (snap.exists()) {
                        newUsers[uid] = snap.data();
                    } else {
                        // Fallback for deleted/missing users to prevent infinite refetch
                        newUsers[uid] = { displayName: 'Usuario Eliminado', name: 'Usuario Eliminado' };
                    }
                } catch (e) {
                    console.warn("Failed to fetch user", uid);
                    // On error, also set placeholder to avoid loop, or leave empty to retry
                    newUsers[uid] = { displayName: 'Usuario Desconocido' };
                }
            }));

            setUsersMap(prev => ({ ...prev, ...newUsers }));
        };

        fetchChatUsers();
    }, [chats, user]);

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
        } else {
            setActiveChat(null);
            setMobileView('list');
        }
    }, [chatId]);

    // Load messages for active chat
    useEffect(() => {
        if (!activeChat) return;
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

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !activeChat || !newMessage.trim()) return;

        try {
            await ChatService.sendMessage(activeChat, user.uid, newMessage);
            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
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

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pt-20 flex h-screen overflow-hidden">
            {/* Chat List Sidebar */}
            <div className={`w-full md:w-80 lg:w-96 bg-[#151b2e] border-r border-white/10 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#151b2e]">
                    <h1 className="text-xl font-bold text-white">Mensajes</h1>
                    <button
                        onClick={() => setIsGroupModalOpen(true)}
                        className="p-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-500 transition-colors"
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
                            className="w-full bg-[#0b1021] border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                                className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${activeChat === chat.id ? 'bg-indigo-900/20 border-l-4 border-l-indigo-500' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-700 border border-white/10 relative">
                                        {getChatPhoto(chat) ? (
                                            <img src={getChatPhoto(chat)!} alt="Chat" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-indigo-900/50 text-indigo-200 font-bold text-lg">
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
            <div className={`flex-1 flex flex-col bg-[#0b1021] ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
                {activeChat ? (
                    <>
                        {/* Header */}
                        <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 bg-[#151b2e]">
                            <div className="flex items-center gap-3">
                                <button onClick={() => navigate('/chats')} className="md:hidden text-gray-400 hover:text-white">
                                    <ArrowLeft className="w-6 h-6" />
                                </button>

                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden flex-shrink-0 border border-white/10">
                                    {activeChatObj && getChatPhoto(activeChatObj) ? (
                                        <img src={getChatPhoto(activeChatObj)!} alt="Chat" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-indigo-900/50">
                                            {activeChatObj?.type === 'group' ? <Users className="w-5 h-5 text-indigo-300" /> : <User className="w-5 h-5 text-indigo-300" />}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h2 className="text-white font-bold text-sm md:text-base">{activeChatObj ? getChatName(activeChatObj) : 'Conversación'}</h2>
                                    {activeChatObj?.type === 'group' ? (
                                        <span className="text-xs text-gray-500">{activeChatObj.participants.length} participantes</span>
                                    ) : (
                                        <span className="text-xs text-green-500 flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-green-500 text-green-500 animate-pulse"></span> En línea
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setIsInfoModalOpen(true)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
                            >
                                <MoreVertical className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${msg.senderId === user?.uid
                                        ? 'bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-500/10'
                                        : 'bg-[#1e2337] text-gray-200 rounded-bl-none border border-white/5'
                                        }`}>
                                        <p>{msg.text}</p>
                                        <span className="text-[10px] opacity-50 block text-right mt-1">
                                            {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <form onSubmit={handleSendMessage} className="p-4 bg-[#151b2e] border-t border-white/10">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Escribe un mensaje..."
                                    className="flex-1 bg-[#0b1021] border border-white/10 rounded-full px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-4 text-center">
                        <div className="w-20 h-20 bg-[#151b2e] rounded-full flex items-center justify-center mb-6 animate-pulse">
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                        <div className="bg-[#151b2e] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl overflow-hidden">
                            <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Users className="w-5 h-5 text-indigo-400" /> Crear Grupo
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
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 mb-6"
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
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
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
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                        <div className="bg-[#151b2e] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden">
                            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0b1021]/50">
                                <h2 className="text-lg font-bold text-white">Info. del Chat</h2>
                                <button onClick={() => setIsInfoModalOpen(false)} className="text-gray-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 text-center">
                                <div className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden border-2 border-indigo-500/30 mx-auto mb-4 relative group">
                                    {getChatPhoto(activeChatObj) ? (
                                        <img src={getChatPhoto(activeChatObj)!} alt="Chat" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-indigo-900/50">
                                            {activeChatObj.type === 'group' ? <Users className="w-8 h-8 text-indigo-300" /> : <User className="w-8 h-8 text-indigo-300" />}
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
                                                className="flex-1 bg-[#0b1021] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                            />
                                        </div>

                                        {/* Search Results Dropdown */}
                                        {(searchResults.length > 0 || isSearching) && participantInput.length >= 2 && (
                                            <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#0b1021] border border-white/10 rounded-lg shadow-xl overflow-hidden z-20 max-h-48 overflow-y-auto">
                                                {isSearching ? (
                                                    <div className="p-3 text-center text-xs text-gray-500">Buscando...</div>
                                                ) : (
                                                    searchResults.map((hit: any) => (
                                                        <button
                                                            key={hit.objectID}
                                                            onClick={async () => {
                                                                if (activeChatObj.participants.includes(hit.objectID)) {
                                                                    alert("Este usuario ya está en el chat");
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
                                                                    alert("Error al añadir participante");
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
                                                            {activeChatObj.participants.includes(hit.objectID) && <span className="text-xs text-indigo-400">En chat</span>}
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
        </div >
    );
};
