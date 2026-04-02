import React from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquare, Copy, Send, Search, Check, Share2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';

import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { ShareCard, type ShareCardVariant } from './ShareCard';
import type { ReviewEntity } from '../hooks/useListDetails';
import { useAuth } from '../context/AuthContext';
import { ChatService, type Chat } from '../services/ChatService';
import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import type { ShareEntityPayload } from '../types/share';
import { db } from '../firebase';
import { buildCriteriaStats } from '../utils/shareCriteria';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    url?: string;
    text?: string;
    place?: PlaceDetails;
    review?: ReviewEntity;
    shareEntity?: ShareEntityPayload;
}

interface UserSearchHit {
    objectID: string;
    username?: string;
    displayName?: string;
    name?: string;
    photoUrl?: string;
    bio?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
    isOpen,
    onClose,
    title = 'Compartir',
    url,
    text = '',
    place,
    review,
    shareEntity,
}) => {
    const { user } = useAuth();
    const shareCardTriggerRef = React.useRef<() => void>(() => { });
    const fallbackUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

    const [isChatPanelOpen, setIsChatPanelOpen] = React.useState(false);
    const [chats, setChats] = React.useState<Chat[]>([]);
    const [privateUsersMap, setPrivateUsersMap] = React.useState<Record<string, Record<string, unknown>>>({});
    const [selectedChatIds, setSelectedChatIds] = React.useState<string[]>([]);
    const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
    const [selectedUsersMap, setSelectedUsersMap] = React.useState<Record<string, UserSearchHit>>({});
    const [recipientQuery, setRecipientQuery] = React.useState('');
    const [recipientResults, setRecipientResults] = React.useState<UserSearchHit[]>([]);
    const [isSearchingRecipients, setIsSearchingRecipients] = React.useState(false);
    const [chatNote, setChatNote] = React.useState('');
    const [isSendingToChat, setIsSendingToChat] = React.useState(false);
    const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
    const [statusTone, setStatusTone] = React.useState<'neutral' | 'success' | 'error'>('neutral');
    const [isCardStylePickerOpen, setIsCardStylePickerOpen] = React.useState(false);
    const [selectedCardVariant, setSelectedCardVariant] = React.useState<ShareCardVariant | null>(null);
    const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const cardVariantOptions: Array<{ id: ShareCardVariant; label: string; description: string; swatch: string }> = [
        {
            id: 'story',
            label: 'Story',
            description: 'Imagen a pantalla completa con score grande. Ideal para Instagram Stories.',
            swatch: 'linear-gradient(160deg, #0a0e1a 0%, #0f2040 55%, #1a3a6b 100%)',
        },
        {
            id: 'post',
            label: 'Post',
            description: 'Foto arriba, panel oscuro abajo con el score en tipografía dominante.',
            swatch: 'linear-gradient(160deg, #0d1220 0%, #1a2a44 50%, #f97316 100%)',
        },
        {
            id: 'editorial',
            label: 'Editorial',
            description: 'Foto a la izquierda, columna de criterios y score a la derecha.',
            swatch: 'linear-gradient(160deg, #0f0f1a 0%, #2a1858 55%, #a78bfa 100%)',
        },
        {
            id: 'clean',
            label: 'Polaroid',
            description: 'Fondo blanco, imagen centrada y datos limpios debajo.',
            swatch: 'linear-gradient(160deg, #ffffff 0%, #f0ece4 55%, #d8d0c4 100%)',
        },
    ];

    const inferLocalRoute = (rawUrl: string): string | undefined => {
        if (!rawUrl) return undefined;
        try {
            const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
            const parsed = new URL(rawUrl, baseOrigin);
            if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
                return `${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
        } catch {
            return undefined;
        }
        return undefined;
    };

    const resolvedShareEntity = React.useMemo<ShareEntityPayload>(() => {
        if (shareEntity) {
            return {
                ...shareEntity,
                title: shareEntity.title || title,
                url: shareEntity.url || fallbackUrl,
                route: shareEntity.route || inferLocalRoute(shareEntity.url || fallbackUrl),
            };
        }

        if (review) {
            const itemLabel = review.itemName || 'Elemento';
            const placeLabel = review.placeName || 'Lugar';
            const route = review.placeId && itemLabel
                ? `/group/${review.placeId}/${encodeURIComponent(itemLabel)}`
                : inferLocalRoute(fallbackUrl);
            return {
                type: 'review',
                id: review.id,
                title: itemLabel,
                subtitle: placeLabel,
                route,
                url: fallbackUrl,
                imageUrl: review.photoUrl || review.placeMainImage,
                badgeLabel: review.listName,
                score: review.overallRating,
                authorName: review.authorName,
                authorPhoto: review.authorPhoto,
                criteriaStats: buildCriteriaStats(review.scores, review.criteriaDefinition),
                tags: review.userTags || review.tags,
            };
        }

        if (place) {
            const route = place.placeId ? `/place/${place.placeId}` : inferLocalRoute(fallbackUrl);
            return {
                type: 'place',
                id: place.placeId,
                title: place.name || 'Lugar',
                subtitle: place.address || '',
                route,
                url: fallbackUrl,
                imageUrl: place.photoUrl,
                score: place.avgScore,
            };
        }

        return {
            type: 'link',
            title: title || 'Contenido',
            subtitle: text || '',
            route: inferLocalRoute(fallbackUrl),
            url: fallbackUrl,
        };
    }, [shareEntity, review, place, fallbackUrl, title, text]);

    const privateChatByUserId = React.useMemo<Record<string, string>>(() => {
        if (!user) return {};
        return chats.reduce((acc, chat) => {
            if (chat.type !== 'private') return acc;
            const targetId = chat.participants.find((participantId) => participantId !== user.uid);
            if (targetId) {
                acc[targetId] = chat.id;
            }
            return acc;
        }, {} as Record<string, string>);
    }, [chats, user]);

    const getPrivateName = (targetId: string) => {
        const profile = privateUsersMap[targetId] || {};
        return (
            (typeof profile.displayName === 'string' && profile.displayName) ||
            (typeof profile.username === 'string' && `@${profile.username}`) ||
            (typeof profile.name === 'string' && profile.name) ||
            'Chat privado'
        );
    };

    const getChatDisplayName = (chat: Chat) => {
        if (chat.type === 'group') return chat.groupName || 'Grupo';
        if (!user) return 'Chat privado';
        const targetId = chat.participants.find((participantId) => participantId !== user.uid);
        return targetId ? getPrivateName(targetId) : 'Chat privado';
    };

    const getChatDisplayPhoto = (chat: Chat): string | undefined => {
        if (chat.type === 'group') return chat.groupPhoto || undefined;
        if (!user) return undefined;
        const targetId = chat.participants.find((participantId) => participantId !== user.uid);
        if (!targetId) return undefined;
        const profile = privateUsersMap[targetId] || {};
        return typeof profile.photoUrl === 'string' ? profile.photoUrl : undefined;
    };

    const resetModalState = React.useCallback(() => {
        setIsChatPanelOpen(false);
        setSelectedChatIds([]);
        setSelectedUserIds([]);
        setSelectedUsersMap({});
        setRecipientQuery('');
        setRecipientResults([]);
        setChatNote('');
        setStatusMessage(null);
        setStatusTone('neutral');
        setIsSearchingRecipients(false);
        setIsCardStylePickerOpen(false);
        setSelectedCardVariant(null);
    }, []);

    const handleRequestClose = React.useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        resetModalState();
        onClose();
    }, [onClose, resetModalState]);

    React.useEffect(() => {
        if (!isOpen) {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
            setChats([]);
            setPrivateUsersMap({});
            resetModalState();
        }
    }, [isOpen, resetModalState]);

    React.useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleRequestClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleRequestClose]);

    React.useEffect(() => {
        if (!isOpen || !isChatPanelOpen || !user) return;
        const unsubscribe = ChatService.subscribeToChats(user.uid, (nextChats) => {
            setChats(nextChats);
        });
        return () => unsubscribe();
    }, [isOpen, isChatPanelOpen, user]);

    React.useEffect(() => {
        if (!isOpen || !isChatPanelOpen || !user || chats.length === 0) return;
        const privateTargetIds = Array.from(new Set(
            chats
                .filter((chat) => chat.type === 'private')
                .map((chat) => chat.participants.find((participantId) => participantId !== user.uid))
                .filter(Boolean)
        )) as string[];

        if (privateTargetIds.length === 0) {
            setPrivateUsersMap({});
            return;
        }

        let cancelled = false;
        const loadPrivateUserProfiles = async () => {
            const rows = await Promise.all(privateTargetIds.map(async (uid) => {
                try {
                    const snap = await getDoc(doc(db, 'users', uid));
                    if (!snap.exists()) return [uid, {}] as const;
                    return [uid, snap.data() as Record<string, unknown>] as const;
                } catch {
                    return [uid, {}] as const;
                }
            }));

            if (!cancelled) {
                setPrivateUsersMap(Object.fromEntries(rows));
            }
        };

        loadPrivateUserProfiles();
        return () => {
            cancelled = true;
        };
    }, [isOpen, isChatPanelOpen, chats, user]);

    React.useEffect(() => {
        if (!isOpen || !isChatPanelOpen || !user) return;
        const searchTerm = recipientQuery.trim();
        if (searchTerm.length < 2) {
            setRecipientResults([]);
            setIsSearchingRecipients(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingRecipients(true);
            try {
                const response = await algoliaClient.search({
                    requests: [{ indexName: INDEX_NAMES.users, query: searchTerm, hitsPerPage: 8 }]
                });
                const hits = ((response.results[0] as any)?.hits || []) as UserSearchHit[];
                setRecipientResults(
                    hits.filter((hit) => hit.objectID !== user.uid)
                );
            } catch (error) {
                console.error('Share modal search error:', error);
                setRecipientResults([]);
            } finally {
                setIsSearchingRecipients(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [recipientQuery, isOpen, isChatPanelOpen, user]);

    if (!isOpen) return null;

    const shareTextForExternal = text ? `${text} ${fallbackUrl}` : fallbackUrl;

    const handleShare = async (platform: 'whatsapp' | 'clipboard' | 'image' | 'chat') => {
        if (platform === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodeURIComponent(shareTextForExternal)}`, '_blank', 'noopener,noreferrer');
            return;
        }

        if (platform === 'clipboard') {
            try {
                await navigator.clipboard.writeText(shareTextForExternal);
                setStatusTone('success');
                setStatusMessage('Enlace copiado al portapapeles');
            } catch {
                setStatusTone('error');
                setStatusMessage('No se pudo copiar el enlace');
            }
            return;
        }

        if (platform === 'image') {
            setIsChatPanelOpen(false);
            setIsCardStylePickerOpen(true);
            setSelectedCardVariant(null);
            setStatusTone('neutral');
            setStatusMessage('Elige un estilo antes de generar la tarjeta');
            return;
        }

        if (platform === 'chat') {
            if (!user) {
                setStatusTone('error');
                setStatusMessage('Inicia sesion para compartir en chats');
                return;
            }
            setIsCardStylePickerOpen(false);
            setSelectedCardVariant(null);
            setIsChatPanelOpen((prev) => !prev);
            setStatusTone('neutral');
            setStatusMessage(null);
        }
    };

    const toggleChat = (chatId: string) => {
        setSelectedChatIds((prev) =>
            prev.includes(chatId)
                ? prev.filter((id) => id !== chatId)
                : [...prev, chatId]
        );
    };

    const handleGenerateCard = () => {
        if (!selectedCardVariant) {
            setStatusTone('error');
            setStatusMessage('Selecciona un estilo para la tarjeta');
            return;
        }

        setStatusTone('neutral');
        setStatusMessage(null);
        shareCardTriggerRef.current();
    };

    const toggleUser = (hit: UserSearchHit) => {
        setSelectedUserIds((prev) =>
            prev.includes(hit.objectID)
                ? prev.filter((id) => id !== hit.objectID)
                : [...prev, hit.objectID]
        );

        setSelectedUsersMap((prev) => {
            if (prev[hit.objectID]) {
                const clone = { ...prev };
                delete clone[hit.objectID];
                return clone;
            }
            return { ...prev, [hit.objectID]: hit };
        });
    };

    const sendToSelectedChats = async () => {
        if (!user || isSendingToChat) return;

        const selectedDestinationIds = new Set(selectedChatIds);
        for (const targetUserId of selectedUserIds) {
            if (targetUserId === user.uid) continue;
            const existingPrivateChatId = privateChatByUserId[targetUserId];
            if (existingPrivateChatId) {
                selectedDestinationIds.add(existingPrivateChatId);
                continue;
            }

            try {
                const newChatId = await ChatService.createPrivateChat(user.uid, targetUserId);
                selectedDestinationIds.add(newChatId);
            } catch (error) {
                console.error('Error creating private chat for share:', error);
            }
        }

        const destinations = Array.from(selectedDestinationIds);
        if (destinations.length === 0) {
            setStatusTone('error');
            setStatusMessage('Selecciona al menos un chat o usuario');
            return;
        }

        setIsSendingToChat(true);
        setStatusTone('neutral');
        setStatusMessage('Enviando...');

        const results = await Promise.allSettled(
            destinations.map((chatId) => ChatService.sendMessage(
                chatId,
                user.uid,
                chatNote.trim(),
                'share',
                { share: resolvedShareEntity }
            ))
        );

        const successCount = results.filter((row) => row.status === 'fulfilled').length;
        const failedCount = results.length - successCount;

        if (failedCount === 0) {
            setStatusTone('success');
            setStatusMessage(`Compartido en ${successCount} chat${successCount === 1 ? '' : 's'}`);
            closeTimeoutRef.current = setTimeout(() => {
                handleRequestClose();
            }, 450);
        } else if (successCount > 0) {
            setStatusTone('neutral');
            setStatusMessage(`Compartido en ${successCount}. Fallos: ${failedCount}`);
        } else {
            setStatusTone('error');
            setStatusMessage('No se pudo compartir en los chats seleccionados');
        }

        setIsSendingToChat(false);
    };

    const totalSelections = selectedChatIds.length + selectedUserIds.length;

    const modalContent = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={handleRequestClose}>
            <ShareCard
                place={place}
                review={review}
                shareEntity={resolvedShareEntity}
                variant={selectedCardVariant || 'story'}
                triggerRef={shareCardTriggerRef}
                onRequestClose={handleRequestClose}
            />

            <div className="bg-[#151b2e] rounded-2xl w-full max-w-xl border border-white/10 shadow-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <h3 className="text-xl font-bold text-white">{title}</h3>
                        <p className="text-xs text-gray-400 mt-1">
                            {resolvedShareEntity.title}
                        </p>
                    </div>
                    <button onClick={handleRequestClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5">
                    <button
                        onClick={() => void handleShare('whatsapp')}
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 transition-all"
                    >
                        <MessageSquare className="w-7 h-7 mb-2" />
                        <span className="font-bold text-sm">WhatsApp</span>
                    </button>
                    <button
                        onClick={() => void handleShare('clipboard')}
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
                    >
                        <Copy className="w-7 h-7 mb-2" />
                        <span className="font-bold text-sm">Copiar link</span>
                    </button>

                    <button
                        onClick={() => void handleShare('image')}
                        className="col-span-2 flex flex-row items-center justify-center p-4 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all gap-3"
                    >
                        <div className="bg-indigo-500/20 p-2 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="font-bold text-sm">Tarjeta imagen</span>
                            <span className="text-xs opacity-70">Previsualizar y descargar PNG</span>
                        </div>
                    </button>

                    <button
                        onClick={() => void handleShare('chat')}
                        className={`col-span-2 flex items-center justify-center gap-2 p-3.5 rounded-xl border transition-all ${isChatPanelOpen
                            ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                            : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                            }`}
                    >
                        <Share2 className="w-5 h-5" />
                        <span className="font-bold text-sm">Compartir en chat de Listopic</span>
                    </button>
                </div>

                {isCardStylePickerOpen && (
                    <div className="mt-5 border border-white/10 rounded-xl bg-[#0f1424] overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                            <div className="text-sm font-bold text-white">Estilo de tarjeta</div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCardStylePickerOpen(false);
                                    setSelectedCardVariant(null);
                                    setStatusTone('neutral');
                                    setStatusMessage(null);
                                }}
                                className="text-xs text-gray-400 hover:text-white"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {cardVariantOptions.map((option) => {
                                    const isSelected = selectedCardVariant === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setSelectedCardVariant(option.id)}
                                            className={`text-left rounded-xl border p-2.5 transition-all ${isSelected
                                                ? 'border-indigo-400 bg-indigo-500/15 shadow-lg shadow-indigo-500/20'
                                                : 'border-white/10 bg-white/5 hover:bg-white/10'
                                                }`}
                                        >
                                            <div
                                                className="h-14 rounded-lg border border-white/15 mb-2"
                                                style={{ background: option.swatch }}
                                            />
                                            <div className="text-sm font-bold text-white">{option.label}</div>
                                            <div className="text-[11px] text-gray-400 mt-1 leading-relaxed">{option.description}</div>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                onClick={handleGenerateCard}
                                disabled={!selectedCardVariant}
                                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Generar previsualizacion
                            </button>
                        </div>
                    </div>
                )}

                {isChatPanelOpen && (
                    <div className="mt-5 border border-white/10 rounded-xl bg-[#0f1424] overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                            <div className="text-sm font-bold text-white">Enviar a chats y usuarios</div>
                            <div className="text-xs text-gray-400">{totalSelections} seleccionado(s)</div>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">Tus chats</div>
                                {chats.length === 0 ? (
                                    <div className="text-xs text-gray-500">No hay chats cargados todavia.</div>
                                ) : (
                                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                        {chats.map((chat) => {
                                            const selected = selectedChatIds.includes(chat.id);
                                            const photo = getChatDisplayPhoto(chat);
                                            return (
                                                <button
                                                    type="button"
                                                    key={chat.id}
                                                    onClick={() => toggleChat(chat.id)}
                                                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${selected
                                                        ? 'bg-indigo-500/20 border-indigo-400/40'
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-700 border border-white/10 shrink-0">
                                                        {photo ? (
                                                            <img src={photo} alt={getChatDisplayName(chat)} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-indigo-200">
                                                                {getChatDisplayName(chat).charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-semibold text-white truncate">{getChatDisplayName(chat)}</div>
                                                        <div className="text-[11px] text-gray-400 truncate">{chat.type === 'group' ? 'Grupo' : 'Chat privado'}</div>
                                                    </div>
                                                    {selected && <Check className="w-4 h-4 text-indigo-300" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">Buscar usuarios</div>
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
                                    <input
                                        value={recipientQuery}
                                        onChange={(event) => setRecipientQuery(event.target.value)}
                                        placeholder="Username o nombre"
                                        className="w-full bg-[#0b1021] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>

                                {Object.keys(selectedUsersMap).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {Object.values(selectedUsersMap).map((selectedUser) => (
                                            <button
                                                type="button"
                                                key={selectedUser.objectID}
                                                onClick={() => toggleUser(selectedUser)}
                                                className="px-2 py-1 text-[11px] rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-200"
                                            >
                                                @{selectedUser.username || selectedUser.displayName || selectedUser.name || 'usuario'} x
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {(isSearchingRecipients || recipientResults.length > 0 || recipientQuery.trim().length >= 2) && (
                                    <div className="mt-2 rounded-lg border border-white/10 bg-[#0b1021] max-h-44 overflow-y-auto">
                                        {isSearchingRecipients ? (
                                            <div className="px-3 py-2 text-xs text-gray-500">Buscando...</div>
                                        ) : recipientResults.length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-gray-500">Sin resultados</div>
                                        ) : (
                                            recipientResults.map((hit) => {
                                                const selected = selectedUserIds.includes(hit.objectID);
                                                const hasExistingPrivateChat = Boolean(privateChatByUserId[hit.objectID]);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={hit.objectID}
                                                        onClick={() => toggleUser(hit)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 border-b border-white/5 last:border-b-0 text-left transition-colors ${selected ? 'bg-indigo-500/20' : 'hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-white/10 shrink-0">
                                                            {hit.photoUrl ? (
                                                                <img src={hit.photoUrl} alt={hit.username || hit.displayName || hit.name || 'Usuario'} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-indigo-200">
                                                                    {(hit.username || hit.displayName || hit.name || 'U').charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-semibold text-white truncate">{hit.username ? `@${hit.username}` : (hit.displayName || hit.name || 'Usuario')}</div>
                                                            <div className="text-[11px] text-gray-400 truncate">
                                                                {hasExistingPrivateChat ? 'Se usara chat privado existente' : 'Se creara chat privado'}
                                                            </div>
                                                        </div>
                                                        {selected && <Check className="w-4 h-4 text-indigo-300" />}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold block mb-2">Mensaje opcional</label>
                                <textarea
                                    value={chatNote}
                                    onChange={(event) => setChatNote(event.target.value)}
                                    rows={2}
                                    placeholder="Anade un mensaje con la tarjeta"
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={sendToSelectedChats}
                                disabled={isSendingToChat || totalSelections === 0}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-4 h-4" />
                                {isSendingToChat ? 'Enviando...' : 'Enviar al chat'}
                            </button>
                        </div>
                    </div>
                )}

                {statusMessage && (
                    <div className={`mt-4 text-xs rounded-lg px-3 py-2 border ${statusTone === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : statusTone === 'error'
                            ? 'bg-red-500/10 border-red-500/30 text-red-300'
                            : 'bg-white/5 border-white/10 text-gray-300'
                        }`}>
                        {statusMessage}
                    </div>
                )}
            </div>
        </div>
    );

    if (typeof document === 'undefined') {
        return modalContent;
    }

    return createPortal(modalContent, document.body);
};
