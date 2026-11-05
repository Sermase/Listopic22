import React from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquare, Link2, Send, Search, Check, ChevronRight, MessagesSquare } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';

import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { renderThumb, type CardEntity } from './ShareCardModern';
import { ShareCardStudio } from './share/ShareCardStudio';
import { useMyAbilities } from '../hooks/useAbilities';
import { presetBadge } from '../config/badgePresets';
import { signatureFor } from '../lib/abilities';
import { defaultCardPalette, type CardPaletteId } from '../lib/shareCardPalettes';
import { useTheme } from '../context/ThemeContext';
import type { ReviewEntity } from '../hooks/useListDetails';
import { useAuth } from '../context/AuthContext';
import { ChatService, type Chat } from '../services/ChatService';
import { algoliaClient, INDEX_NAMES } from '../services/algoliaClient';
import type { ShareEntityPayload } from '../types/share';
import { db } from '../firebase';
import { buildShareCriteriaGroups } from '../utils/shareCriteria';
import { buildPublicUrl, buildShareRouteUrl, getLocalRouteFromUrl } from '../utils/publicUrl';
import { buildShareText } from '../utils/shareTexts';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useBackToClose } from '../hooks/useSheetDismiss';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { recordShareEvent, type AnalyticsShareChannel } from '../services/AnalyticsService';
import { useNavigate } from 'react-router-dom';
import { InviteSheet } from './chat/InviteSheet';
import type { PlaceRef } from '../lib/chatExtras';
import { haptic } from '../utils/haptics';

/** La tarjeta en pequeño (Story), para invitar a crearla. */
const CardMiniPreview: React.FC<{ entity: CardEntity; palette: CardPaletteId }> = ({ entity, palette }) => {
    const [src, setSrc] = React.useState<string | null>(null);
    const key = `${palette}|${entity.imageUrl || ''}|${entity.title}`;
    React.useEffect(() => {
        let cancelled = false;
        renderThumb(entity, 'story', palette, 240)
            .then((url) => { if (!cancelled) setSrc(url); })
            .catch(() => { /* sin miniatura */ });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return (
        <span className="relative block h-[100px] w-[56px] shrink-0 -rotate-3 overflow-hidden rounded-xl bg-white/10 shadow-xl shadow-black/40 ring-1 ring-white/20 transition-transform group-hover:rotate-0 group-active:scale-95">
            {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-white/5" />}
        </span>
    );
};

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    url?: string;
    text?: string;
    place?: PlaceDetails;
    review?: ReviewEntity;
    shareEntity?: ShareEntityPayload;
    /** Sitio o plato al que se puede invitar a comer desde aquí. */
    inviteTarget?: PlaceRef;
    /** Platos del sitio para concretar la invitación. */
    inviteDishOptions?: Array<{ itemName: string; listId?: string }>;
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
    inviteTarget,
    inviteDishOptions,
}) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isInviteOpen, setIsInviteOpen] = React.useState(false);
    const { openAuthPrompt } = useAuthPrompt();
    useBodyScrollLock(isOpen);
    const { theme } = useTheme();
    const [cardPalette, setCardPalette] = React.useState<CardPaletteId>(() => defaultCardPalette(theme));
    const fallbackUrl = buildPublicUrl(url || (typeof window !== 'undefined' ? window.location.href : '/'));

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
    const [isStudioOpen, setIsStudioOpen] = React.useState(false);
    const [hydratedAuthorPhoto, setHydratedAuthorPhoto] = React.useState<string | undefined>(undefined);
    const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const inferLocalRoute = (rawUrl: string): string | undefined => {
        return getLocalRouteFromUrl(rawUrl);
    };

    const resolvedShareEntity = React.useMemo<ShareEntityPayload>(() => {
        if (shareEntity) {
            return {
                ...shareEntity,
                title: shareEntity.title || title,
                url: buildPublicUrl(shareEntity.url || fallbackUrl),
                route: shareEntity.route || inferLocalRoute(shareEntity.url || fallbackUrl),
            };
        }

        if (review) {
            const itemLabel = review.itemName || 'Elemento';
            const placeLabel = review.placeName || 'Lugar';
            const shareCriteria = buildShareCriteriaGroups(review.scores, review.criteriaDefinition);
            const route = review.placeId && itemLabel
                ? `/group/${review.placeId}/${encodeURIComponent(itemLabel)}`
                : inferLocalRoute(fallbackUrl);
            return {
                type: 'review',
                id: review.id,
                title: itemLabel,
                subtitle: placeLabel,
                description: review.comment,
                route,
                shareRoute: review.listId && review.id ? `/review/${review.listId}/${review.id}` : undefined,
                url: fallbackUrl,
                imageUrl: review.photoUrl || review.placeMainImage,
                imageUrls: [...(review.photoUrls || []), review.photoUrl, review.placeMainImage]
                    .filter((value): value is string => Boolean(value)),
                badgeLabel: review.listName,
                score: review.overallRating,
                authorId: review.userId || review.authorId,
                authorName: review.authorName,
                authorPhoto: review.authorPhoto,
                city: review.placeCity,
                criteriaStats: shareCriteria.ponderable,
                nonPonderableStats: shareCriteria.nonPonderable,
                tags: review.userTags || review.tags,
            };
        }

        if (place) {
            const route = place.placeId ? `/place/${place.placeId}` : inferLocalRoute(fallbackUrl);
            const placeImages = [
                place.photoUrl,
                ...(place.placePhotos || []).map((photo) => photo.url),
                ...place.reviews.flatMap((item) => [
                    ...(item.photoUrls || []),
                    item.photoUrl,
                ]),
            ].filter((value): value is string => Boolean(value));
            return {
                type: 'place',
                id: place.placeId,
                title: place.name || 'Lugar',
                subtitle: place.address || '',
                route,
                url: fallbackUrl,
                imageUrl: place.photoUrl,
                imageUrls: placeImages,
                score: place.avgScore,
                reviewCount: place.reviewCount,
                city: place.city,
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

    const availableImageUrls = React.useMemo(() => Array.from(new Set(
        [resolvedShareEntity.imageUrl, ...(resolvedShareEntity.imageUrls || [])]
            .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
            .map((value) => value.trim())
    )), [resolvedShareEntity.imageUrl, resolvedShareEntity.imageUrls]);

    React.useEffect(() => {
        if (!isOpen || resolvedShareEntity.authorPhoto || !resolvedShareEntity.authorId) {
            setHydratedAuthorPhoto(resolvedShareEntity.authorPhoto);
            return;
        }

        let cancelled = false;
        getDoc(doc(db, 'publicProfiles', resolvedShareEntity.authorId))
            .then((snapshot) => {
                if (cancelled || !snapshot.exists()) return;
                const data = snapshot.data();
                const photo = typeof data.photoUrl === 'string'
                    ? data.photoUrl
                    : (typeof data.photoURL === 'string' ? data.photoURL : undefined);
                if (photo) setHydratedAuthorPhoto(photo);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [isOpen, resolvedShareEntity.authorId, resolvedShareEntity.authorPhoto]);

    const cardEntity = React.useMemo<ShareEntityPayload>(() => ({
        ...resolvedShareEntity,
        imageUrl: availableImageUrls[0] || resolvedShareEntity.imageUrl,
        authorPhoto: hydratedAuthorPhoto || resolvedShareEntity.authorPhoto,
    }), [resolvedShareEntity, availableImageUrls, hydratedAuthorPhoto]);

    // Premios de medallas: marco de la foto y firma (solo en la tarjeta, no en lo que se manda al chat).
    const abilities = useMyAbilities();
    const canFrame = abilities.has('photoFrames') && availableImageUrls.length > 0
        && cardEntity.type !== 'profile' && !((cardEntity.type === 'list' || cardEntity.type === 'sublist') && cardEntity.rankItems?.length);
    const signature = abilities.has('cardSignature')
        ? signatureFor(abilities.prefs, abilities.earnedBadgeIds, presetBadge)
        : undefined;

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
        setIsStudioOpen(false);
        setHydratedAuthorPhoto(undefined);
    }, []);

    const handleRequestClose = React.useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        resetModalState();
        onClose();
    }, [onClose, resetModalState]);
    useBackToClose(isOpen, handleRequestClose);

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
                    const snap = await getDoc(doc(db, 'publicProfiles', uid));
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
                const hits = (response.results[0] as { hits?: UserSearchHit[] } | undefined)?.hits || [];
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

    // URL /s/... con Open Graph real para bots + texto con gancho por entidad.
    const externalShareUrl = buildShareRouteUrl(resolvedShareEntity.shareRoute || resolvedShareEntity.route) || fallbackUrl;
    const shareTextForExternal = `${text || buildShareText(resolvedShareEntity)} ${externalShareUrl}`.trim();

    const trackSuccessfulShare = (channel: AnalyticsShareChannel, count = 1) => {
        void recordShareEvent(cardEntity, channel, count).catch((error) => {
            // Compartir debe seguir funcionando aunque la analitica no este disponible.
            console.warn('No se pudo registrar el compartido.', error);
        });
    };

    const handleShare = async (platform: 'whatsapp' | 'clipboard' | 'image' | 'chat') => {
        if (platform === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodeURIComponent(shareTextForExternal)}`, '_blank', 'noopener,noreferrer');
            trackSuccessfulShare('whatsapp');
            return;
        }

        if (platform === 'clipboard') {
            try {
                await navigator.clipboard.writeText(shareTextForExternal);
                haptic('light');
                trackSuccessfulShare('clipboard');
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
            setStatusMessage(null);
            setIsStudioOpen(true);
            return;
        }

        if (platform === 'chat') {
            if (!user) {
                openAuthPrompt('compartir contenido en un chat');
                return;
            }
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
                { share: cardEntity }
            ))
        );

        const successCount = results.filter((row) => row.status === 'fulfilled').length;
        const failedCount = results.length - successCount;
        if (successCount > 0) trackSuccessfulShare('chat', successCount);

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

    const quickAction = 'flex flex-col items-center gap-1.5 rounded-2xl py-2 text-[var(--lt-text)] transition-colors hover:bg-white/5 active:scale-95';
    const quickIcon = 'grid h-12 w-12 place-items-center rounded-full';

    const modalContent = (
        <div className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={handleRequestClose}>
            <div className="bg-[var(--lt-card-strong)] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl p-5 lt-mobile-modal-panel sm:max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
                <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-black text-white">{title}</h3>
                        <p className="truncate text-xs text-gray-400 mt-0.5">{resolvedShareEntity.title}</p>
                    </div>
                    <button onClick={handleRequestClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-gray-400 hover:text-white" aria-label="Cerrar">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="mt-4 space-y-3">
                    {inviteTarget && (
                        <button
                            type="button"
                            onClick={() => (user ? setIsInviteOpen(true) : openAuthPrompt('invitar a comer'))}
                            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-[var(--lt-accent)] to-[var(--lt-accent)]/70 text-white shadow-lg shadow-[var(--lt-accent-shadow)] active:scale-[0.99] transition-transform text-left"
                        >
                            <span className="text-3xl">🍽️</span>
                            <span className="flex flex-col">
                                <span className="font-bold text-sm">Invitar a comer aquí</span>
                                <span className="text-xs opacity-85">Elige a quién y el día; le llega al chat</span>
                            </span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => void handleShare('image')}
                        className="group relative w-full overflow-hidden flex items-center gap-4 rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-4 py-3 text-left transition-colors hover:bg-[var(--lt-accent)]/20"
                    >
                        <CardMiniPreview entity={cardEntity} palette={cardPalette} />
                        <span className="min-w-0 flex-1">
                            <span className="block text-base font-black text-[var(--lt-text)]">Crear tarjeta</span>
                            <span className="mt-0.5 block text-xs leading-snug text-[var(--lt-text-muted)]">
                                Para Instagram, WhatsApp o donde quieras. Elige formato, tema{canFrame ? ', marco' : ''}{signature ? ' y firma' : ''}.
                            </span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--lt-accent)]" />
                    </button>

                    <div className="grid grid-cols-3 gap-1">
                        <button type="button" onClick={() => void handleShare('whatsapp')} className={quickAction}>
                            <span className={`${quickIcon} bg-[#25D366]/15 text-[#25D366]`}><MessageSquare className="h-5 w-5" /></span>
                            <span className="text-xs font-bold">WhatsApp</span>
                        </button>
                        <button type="button" onClick={() => void handleShare('clipboard')} className={quickAction}>
                            <span className={`${quickIcon} bg-white/10`}><Link2 className="h-5 w-5" /></span>
                            <span className="text-xs font-bold">Copiar enlace</span>
                        </button>
                        <button type="button" onClick={() => void handleShare('chat')} aria-pressed={isChatPanelOpen} className={quickAction}>
                            <span className={`${quickIcon} ${isChatPanelOpen ? 'bg-[var(--lt-accent)] text-white' : 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]'}`}><MessagesSquare className="h-5 w-5" /></span>
                            <span className="text-xs font-bold">Chat Listopic</span>
                        </button>
                    </div>
                </div>

                {isChatPanelOpen && (
                    <div className="mt-5 border border-white/10 rounded-xl bg-[var(--lt-bg-deep)] overflow-hidden">
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
                                                        ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)]'
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-700 border border-white/10 shrink-0">
                                                        {photo ? (
                                                            <img src={photo} alt={getChatDisplayName(chat)} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[var(--lt-accent)]">
                                                                {getChatDisplayName(chat).charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-semibold text-white truncate">{getChatDisplayName(chat)}</div>
                                                        <div className="text-[11px] text-gray-400 truncate">{chat.type === 'group' ? 'Grupo' : 'Chat privado'}</div>
                                                    </div>
                                                    {selected && <Check className="w-4 h-4 text-[var(--lt-accent)]" />}
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
                                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                                    />
                                </div>

                                {Object.keys(selectedUsersMap).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {Object.values(selectedUsersMap).map((selectedUser) => (
                                            <button
                                                type="button"
                                                key={selectedUser.objectID}
                                                onClick={() => toggleUser(selectedUser)}
                                                className="px-2 py-1 text-[11px] rounded-full bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-[var(--lt-accent)]"
                                            >
                                                @{selectedUser.username || selectedUser.displayName || selectedUser.name || 'usuario'} x
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {(isSearchingRecipients || recipientResults.length > 0 || recipientQuery.trim().length >= 2) && (
                                    <div className="mt-2 rounded-lg border border-white/10 bg-[var(--lt-bg)] max-h-44 overflow-y-auto">
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
                                                        className={`w-full flex items-center gap-3 px-3 py-2 border-b border-white/5 last:border-b-0 text-left transition-colors ${selected ? 'bg-[var(--lt-accent-soft)]' : 'hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-white/10 shrink-0">
                                                            {hit.photoUrl ? (
                                                                <img src={hit.photoUrl} alt={hit.username || hit.displayName || hit.name || 'Usuario'} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-[var(--lt-accent)]">
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
                                                        {selected && <Check className="w-4 h-4 text-[var(--lt-accent)]" />}
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
                                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)] resize-none"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={sendToSelectedChats}
                                disabled={isSendingToChat || totalSelections === 0}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

    if (isStudioOpen) {
        return (
            <ShareCardStudio
                entity={cardEntity}
                images={availableImageUrls}
                palette={cardPalette}
                onPaletteChange={setCardPalette}
                canFrame={canFrame}
                signature={signature}
                onClose={() => setIsStudioOpen(false)}
                onDone={() => trackSuccessfulShare('image')}
            />
        );
    }

    if (isInviteOpen && inviteTarget && user) {
        return (
            <InviteSheet
                initial={inviteTarget}
                pickRecipientFor={user.uid}
                dishOptions={inviteTarget.itemName ? [] : inviteDishOptions}
                onClose={() => setIsInviteOpen(false)}
                onSend={async (invite, target) => {
                    if (!target) return;
                    const chatId = 'chatId' in target ? target.chatId : await ChatService.createPrivateChat(user.uid, target.userId);
                    await ChatService.sendInvite(chatId, user.uid, invite);
                    onClose();
                    navigate(`/chats/${chatId}`);
                }}
            />
        );
    }

    if (typeof document === 'undefined') {
        return modalContent;
    }

    return createPortal(modalContent, document.body);
};
