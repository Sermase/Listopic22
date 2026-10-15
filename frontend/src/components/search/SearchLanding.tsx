import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { HeartHandshake, History, List as ListIcon, LocateFixed, MapPin, Sparkles, Users, Utensils } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useAuthPrompt } from '../../context/AuthPromptContext';
import { useLocation } from '../../hooks/useLocation';
import { CardCarousel } from '../CardCarousel';
import { HomeFeedCard } from '../home/HomeFeedCard';
import type { HomeFeedCard as HomeFeedCardData } from '../../lib/homeFeeds';
import {
    isBotType, pickNearby, rankTasteMatches, rankYourPeople, topListVisits,
    type FollowEntry, type ListVisit, type PersonRank, type TasteSuggestion,
} from '../../lib/searchLanding';
import { readListVisits, readRecentSearches } from '../../lib/searchLandingStorage';
import { PersonCard, RecentSearchChip } from './landing/LandingCards';
import {
    followingQueryKey, useFollowing, useLandingPool, useOwnTaste, useProfiles, useRecentChats,
} from './landing/useSearchLandingData';

const CARD_ITEM = 'w-auto';
const NO_BOTS: ReadonlySet<string> = new Set();

/**
 * Portada de Buscar: lo que se ve antes de escribir. Carruseles al estilo de la
 * Home; cada uno se oculta si no tiene nada que enseñar.
 */
export const SearchLanding: React.FC<{ onSearch: (query: string) => void }> = ({ onSearch }) => {
    const { user } = useAuth();
    const uid = user?.uid ?? null;
    const { openAuthPrompt } = useAuthPrompt();
    const { location, loading: locating, requestLocation } = useLocation();
    const queryClient = useQueryClient();
    // «Ahora» fijo mientras la portada está montada: el orden no baila en cada render.
    const [now] = useState(() => Date.now());

    // Del navegador: instantáneo y sin lecturas.
    const [recentSearches] = useState(readRecentSearches);
    const [frequentLists] = useState<ListVisit[]>(() => topListVisits(readListVisits()));
    const listCards = useMemo<HomeFeedCardData[]>(() => frequentLists.map((visit) => ({
        key: `list:${visit.id}`,
        kind: 'list',
        id: visit.id,
        title: visit.name,
        subtitle: visit.count > 1 ? `La has abierto ${visit.count} veces` : 'Abierta hace poco',
        photoUrl: visit.coverUrl,
        rating: null,
        count: visit.count,
        to: `/list/${visit.id}`,
        listId: visit.id,
    })), [frequentLists]);

    // Públicos: reseñas recientes → sitios y platos top cerca.
    const { reviews: pool, loading: poolLoading } = useLandingPool();
    // Bots fuera: lo dice authorUserType en cada reseña y, para la gente que se pinta, su perfil.
    const botIds = NO_BOTS;

    const origin = location ? { latitude: location.latitude, longitude: location.longitude } : null;
    const originKey = origin ? `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}` : '';
    const nearbyPlaces = useMemo(
        () => pickNearby(pool, 'place', { origin, now, botUserIds: botIds }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pool, originKey, now, botIds],
    );
    const nearbyDishes = useMemo(
        () => pickNearby(pool, 'dish', { origin, now, botUserIds: botIds }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pool, originKey, now, botIds],
    );
    const nearbyLabel = (radiusKm: number | null) => (radiusKm ? `A menos de ${radiusKm} km y con reseñas frescas` : 'Lo mejor valorado últimamente');
    const nearbyTitle = (base: string, radiusKm: number | null) => (radiusKm ? `${base} cerca` : `${base} del momento`);

    // Personales (con sesión).
    const { reviews: ownTaste, loading: ownLoading } = useOwnTaste(uid);
    const { following, loading: followingLoading } = useFollowing(uid);
    const { chats, loading: chatsLoading } = useRecentChats(uid);
    // Quien sigues desde aquí sigue en «Gente con tu gusto» (con su botón en «Siguiendo»).
    const [followedHere, setFollowedHere] = useState<Set<string>>(() => new Set());
    const [busyFollow, setBusyFollow] = useState<string | null>(null);
    const followingIds = useMemo(() => new Set(following.map((f) => f.uid)), [following]);

    const tasteMatches = useMemo<TasteSuggestion[]>(() => {
        if (!uid) return [];
        const exclude = new Set([...followingIds].filter((id) => !followedHere.has(id)));
        return rankTasteMatches(ownTaste, pool, { selfId: uid, exclude, botUserIds: botIds, k: 8 });
    }, [uid, ownTaste, pool, followingIds, followedHere, botIds]);

    const yourPeopleRaw = useMemo<PersonRank[]>(() => {
        if (!uid) return [];
        return rankYourPeople({ selfId: uid, following, chats, pool, botUserIds: botIds, now, k: 12 });
    }, [uid, following, chats, pool, botIds, now]);

    // Perfiles solo de quien se pinta (≤ 20, con caché): nombre, @usuario, foto y tipo.
    const shownIds = useMemo(() => [...tasteMatches.map((m) => m.uid), ...yourPeopleRaw.map((p) => p.uid)], [tasteMatches, yourPeopleRaw]);
    const { profiles, loading: profilesLoading } = useProfiles(shownIds);
    const profileOf = useCallback((id: string) => profiles[id], [profiles]);
    const notBot = useCallback((id: string) => !isBotType(profiles[id]?.userType), [profiles]);

    const tasteShown = useMemo(() => tasteMatches.filter((m) => notBot(m.uid)), [tasteMatches, notBot]);
    // Sin perfil público ni nombre conocido no se enseña (no hay a dónde llevar).
    const yourPeople = useMemo(() => yourPeopleRaw
        .filter((p) => notBot(p.uid) && (profiles[p.uid] || (!profilesLoading && p.name)))
        .slice(0, 8), [yourPeopleRaw, notBot, profiles, profilesLoading]);

    const toggleFollow = useCallback(async (target: string, meta: { name: string; photoUrl: string | null }) => {
        if (!uid) {
            openAuthPrompt('seguir a gente');
            return;
        }
        const isFollowing = followingIds.has(target);
        setBusyFollow(target);
        try {
            const ref = doc(db, 'users', uid, 'following', target);
            if (isFollowing) {
                await deleteDoc(ref);
            } else {
                await setDoc(ref, { uid: target, followedAt: new Date(), displayName: meta.name, photoUrl: meta.photoUrl ?? null });
                setFollowedHere((prev) => new Set(prev).add(target));
            }
            queryClient.setQueryData<FollowEntry[]>(followingQueryKey(uid), (prev = []) => (isFollowing
                ? prev.filter((f) => f.uid !== target)
                : [...prev, { uid: target, followedAt: new Date(), displayName: meta.name, photoUrl: meta.photoUrl }]));
        } catch (error) {
            console.warn('[SearchLanding] no se pudo seguir', error);
        } finally {
            setBusyFollow(null);
        }
    }, [uid, followingIds, openAuthPrompt, queryClient]);

    const renderPerson = (person: { uid: string; name: string; photoUrl: string | null }, extra: { affinity?: number; reason?: string; withFollow?: boolean }) => {
        const profile = profileOf(person.uid);
        const name = profile?.displayName || profile?.username || person.name || 'Alguien';
        const photoUrl = profile?.photoUrl || person.photoUrl;
        return (
            <PersonCard
                uid={person.uid}
                name={name}
                username={profile?.username}
                photoUrl={photoUrl}
                userType={profile?.userType}
                affinity={extra.affinity}
                reason={extra.reason}
                follow={extra.withFollow ? {
                    following: followingIds.has(person.uid),
                    busy: busyFollow === person.uid,
                    onToggle: () => { void toggleFollow(person.uid, { name, photoUrl: photoUrl ?? null }); },
                } : undefined}
            />
        );
    };

    return (
        <div className="space-y-1 pb-6 pt-2">
            {recentSearches.length > 0 && (
                <CardCarousel
                    title="Tus búsquedas"
                    subtitle="Por si te apetece repetir"
                    items={recentSearches}
                    itemClassName={CARD_ITEM}
                    icon={<History className="text-purple-300" />}
                    accentClass="bg-purple-500/20"
                    renderItem={(q: string) => <RecentSearchChip query={q} onSearch={onSearch} />}
                />
            )}

            <CardCarousel
                title="Tus listas de siempre"
                subtitle="Las que más abres, a mano"
                items={listCards}
                itemClassName={CARD_ITEM}
                icon={<ListIcon className="text-blue-400" />}
                accentClass="bg-blue-500/20"
                renderItem={(card: HomeFeedCardData) => <HomeFeedCard card={card} />}
            />

            {!location && !locating && (
                <div className="container mx-auto px-4 pt-1">
                    <button
                        type="button"
                        onClick={() => { void requestLocation(); }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lt-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--lt-accent)] transition-opacity hover:opacity-80"
                    >
                        <LocateFixed className="h-3.5 w-3.5" /> Usar mi ubicación para ver lo de cerca
                    </button>
                </div>
            )}

            <CardCarousel
                title={nearbyTitle('Sitios top', nearbyPlaces.radiusKm)}
                subtitle={nearbyLabel(nearbyPlaces.radiusKm)}
                items={nearbyPlaces.cards}
                loading={poolLoading}
                itemClassName={CARD_ITEM}
                icon={<MapPin className="text-emerald-300" />}
                accentClass="bg-emerald-500/20"
                renderItem={(card: HomeFeedCardData) => <HomeFeedCard card={card} />}
            />

            <CardCarousel
                title={nearbyTitle('Platos top', nearbyDishes.radiusKm)}
                subtitle={nearbyDishes.radiusKm ? 'Lo que más gusta por tu zona' : 'Los que más gustan ahora mismo'}
                items={nearbyDishes.cards}
                loading={poolLoading}
                itemClassName={CARD_ITEM}
                icon={<Utensils className="text-amber-400" />}
                accentClass="bg-amber-500/20"
                renderItem={(card: HomeFeedCardData) => <HomeFeedCard card={card} />}
            />

            {uid ? (
                <>
                    <CardCarousel
                        title="Gente con tu gusto"
                        subtitle="Puntúan parecido a ti. Igual os entendéis"
                        items={tasteShown}
                        loading={ownLoading || followingLoading || poolLoading}
                        itemClassName={CARD_ITEM}
                        icon={<HeartHandshake className="text-pink-300" />}
                        accentClass="bg-pink-500/20"
                        renderItem={(m: TasteSuggestion) => renderPerson(m, { affinity: m.score, reason: m.reason, withFollow: true })}
                    />
                    <CardCarousel
                        title="Tu gente"
                        subtitle="Con quien más te mueves"
                        items={yourPeople}
                        loading={followingLoading || chatsLoading || (profilesLoading && yourPeople.length === 0)}
                        itemClassName={CARD_ITEM}
                        icon={<Users className="text-cyan-300" />}
                        accentClass="bg-cyan-500/20"
                        renderItem={(p: PersonRank) => renderPerson(p, { reason: p.reason })}
                    />
                </>
            ) : (
                <div className="container mx-auto px-4 pt-2">
                    <div className="flex items-center gap-3 rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] p-4 shadow-lg">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                            <Sparkles className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[var(--lt-text)]">Con sesión, esto se pone personal</p>
                            <p className="text-xs text-[var(--lt-text-muted)]">Gente con tu gusto, tu gente y tus listas de siempre.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openAuthPrompt('ver tus sugerencias')}
                            className="lt-on-accent shrink-0 rounded-full bg-[var(--lt-accent)] px-3.5 py-1.5 text-xs font-bold shadow-md transition-opacity hover:opacity-90"
                        >
                            Entrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchLanding;
