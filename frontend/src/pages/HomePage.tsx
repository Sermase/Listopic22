import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getExpandedRangeValue, useFilters } from '../context/FilterContext';
import { useLists } from '../hooks/useLists';
import { useUsers } from '../hooks/useUsers';
import { useMemoryReviews, useReviews } from '../hooks/useReviews';
import { ReviewCard } from '../components/ReviewCard';
import { ReviewCardList } from '../components/ReviewCardList';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { ReviewCarouselItem } from '../components/ReviewCarouselItem';
import { CardCarousel } from '../components/CardCarousel';
import { SponsoredHomeSpotlight } from '../components/business/SponsoredHomeSpotlight';
import { SponsoredItemsCarousel } from '../components/business/SponsoredItemsCarousel';
import { computeTasteMatch } from '../utils/tasteMatch';
import { WeeklyDuelBanner } from '../components/WeeklyDuelBanner';
import { FullMapModal } from '../components/map/FullMapModal';
import { UserAvatar } from '../components/UserAvatar';
import { Map as MapIcon, Maximize2, List as ListIcon, MessageCircle, Users, Loader2, Star, Clock, TrendingUp, Gem, HeartHandshake, Rows3, Search, Utensils, Sparkles, Camera, Trophy, History } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLocation } from '../hooks/useLocation';
import { useQuery } from '@tanstack/react-query';
import { collection, collectionGroup, query, getDocs, limit, doc, getDoc, getDocFromServer, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { useToast } from '../context/ToastContext';
import { useAppConfig } from '../context/AppConfigContext';
import { Footer } from '../components/Footer';
import { PlacePhotoPlaceholder } from '../components/PlacePhotoPlaceholder';
import { FeaturedListCard } from '../components/home/FeaturedListCard';
import { HomeRanking, type RankingRow } from '../components/home/HomeRanking';
import { formatDistance } from '../utils/formatDistance';
import { HomeFeedCard } from '../components/home/HomeFeedCard';
import { buildSoulmateFeed } from '../lib/soulmateFeed';
import { buildHomeFeeds, homeFeedAreaKey, isJunkName, isPermanentlyClosed, type HomeFeedCard as HomeFeedCardData, type HomeFeedReview } from '../lib/homeFeeds';
import {
    completeUserProfileSetup,
    getUsernameGateStatus,
    isUserProfileServiceError,
    type UserProfileFormData,
} from '../services/UserProfileService';
import { USERNAME_MAX_LENGTH, isUsernameValid } from '../utils/username';
import { fetchUserReviewsFromAccessibleLists } from '../lib/reviewFallbacks';
import { compareByRank } from '../lib/scoring';
import { AreaSelect } from '../components/AreaSelect';
import { placeRating } from '../lib/placeRating';
import { AREA_STORAGE_KEY, buildAreaOptions, decodeArea, encodeArea, inferUserGeo, localAreaOptions, matchesArea, type GeoFields, type ListArea } from '../lib/geoAreas';
import { exploreSearchUrl } from '../lib/searchZones';

/* 
    HOMEPAGE (Legacy Screenshot Match + Functional Logic: Categories & Range)
*/

const HERO_SUBTITLE_TEMPLATES = [
    'Donde las [[listas]] empiezan a tomarse muy en [[serio]] su trabajo.',
    'El lugar donde tus [[gustos]] finalmente encuentran un [[orden]] razonable.',
    'Donde las [[ideas]] hacen [[fila]] educadamente antes de convertirse en ranking.',
    'El pequeño [[imperio]] donde tus [[opiniones]] gobiernan en paz.',
    'Aquí las [[listas]] se ponen [[elegantes]] antes de salir al mundo.',
    'Donde lo [[importante]] y lo [[trivial]] comparten la misma columna.',
    'El [[archivo]] internacional de tus preferencias más [[discutibles]].',
    'Un lugar [[tranquilo]] donde tus [[comparaciones]] pueden estirarse a gusto.',
    'Donde las ideas [[sueltas]] vienen a encontrar un [[número]].',
    'El [[spa]] donde los gustos [[cansados]] se reorganizan un poco.',
    'Donde las [[listas]] salen mejor [[peinadas]] de lo que entraron.',
    'El [[gimnasio]] donde tus [[prioridades]] entrenan para subir posiciones.',
    'Donde lo [[aleatorio]] empieza a parecer sorprendentemente [[lógico]].',
    'Tu pequeño [[observatorio]] personal de gustos y [[caprichos]].',
    'El [[club]] donde las [[comparaciones]] encuentran su público.',
    'Donde cada [[gusto]] encuentra, tarde o temprano, su [[casilla]].',
    'Un [[rincón]] donde el [[caos]] acepta sentarse un momento.',
    'El territorio [[neutral]] entre el caos creativo y el [[orden]] absoluto.',
    'Donde las [[opiniones]] dejan de vagar y consiguen [[numeración]] oficial.',
    'El [[santuario]] donde los [[rankings]] descansan entre debate y debate.',
    'Donde tus [[obsesiones]] finalmente consiguen [[ranking]] propio.',
    'Un lugar donde el [[mundo]] se entiende mejor en [[columnas]].',
    'Donde cada "esto va [[primero]]" encuentra apoyo [[institucional]].',
    'El pequeño [[país]] donde siempre cabe una [[lista]] más.',
    'Donde las [[comparaciones]] se toman un [[café]] antes de decidir.',
    'El [[laboratorio]] donde tus [[preferencias]] se ponen a prueba.',
    'Donde los [[gustos]] se alinean... o al menos lo [[intentan]].',
    'El [[hábitat]] natural de las [[listas]] que llevabas días pensando.',
    'Donde [[ordenar]] cosas empieza a parecer una gran [[idea]].',
    'El [[salón]] donde tus [[opiniones]] encuentran asiento numerado.',
    'Donde las [[listas]] crecen sanas y bien [[clasificadas]].',
    'Un [[mapa]] del mundo construido a base de [[preferencias]].',
    'Donde las [[ideas]] aprenden el noble arte de ponerse en [[fila]].',
    'El lugar donde el [[caos]] pierde por una pequeña [[ventaja]].',
    'Donde tus [[criterios]] encuentran [[luz]], aire y numeración.',
    'Un rincón [[amable]] para decidir qué va [[antes]] que qué.',
    'Donde cada [[ranking]] cuenta una pequeña [[historia]] personal.',
    'El lugar donde lo [[subjetivo]] se organiza con sorprendente [[dignidad]].',
    'Donde las [[listas]] encuentran su [[vocación]] definitiva.',
    'El pequeño [[museo]] de tus elecciones más [[curiosas]].',
    'Donde el [[orden]] empieza a parecer una aventura [[interesante]].',
    'Donde tus [[gustos]] se comparan [[amistosamente]] entre ellos.',
    'El país [[tranquilo]] donde las [[listas]] se multiplican sin prisa.',
    'Donde cada [[preferencia]] encuentra su [[escala]] adecuada.',
    'Un sitio [[perfecto]] para [[ordenar]] cosas que nadie pidió ordenar.',
    'Donde los [[rankings]] encuentran un [[hogar]] respetable.',
    'El [[observatorio]] donde tus [[gustos]] se miran con perspectiva.',
    'Donde las ideas [[dispersas]] empiezan a [[comportarse]].',
    'El pequeño [[parlamento]] donde votan tus [[preferencias]].',
    'Donde lo [[complicado]] se resuelve con [[columnas]] numeradas.',
    'Donde cada [[comparación]] encuentra su momento de [[gloria]].',
    'Un [[refugio]] tranquilo para tus listas más [[ambiciosas]].',
    'Donde el [[caos]] aprende lentamente a hacer [[cola]].',
    'El [[elegante]] arte de poner las ideas en [[fila]].',
    'Donde tus [[gustos]] encuentran su [[tamaño]] real.',
    'El punto [[exacto]] entre [[ordenar]] y entretenerse ordenando.',
    'Donde cada [[lista]] empieza a parecer [[inevitable]].',
    'Un lugar donde el [[mundo]] cabe cómodamente en [[rankings]].',
    'Donde tus [[criterios]] encuentran [[forma]] y estructura.',
    'El [[rincón]] donde las [[listas]] se sienten comprendidas.',
    'Donde las [[ideas]] encuentran su versión más [[ordenada]].',
    'El pequeño [[universo]] donde todo puede [[compararse]] con todo.',
    'Donde cada [[gusto]] tiene derecho a su [[posición]] oficial.',
    'Un lugar donde [[ordenar]] el mundo parece perfectamente [[razonable]].',
    'Donde las [[listas]] empiezan pequeñas y terminan [[legendarias]].',
    'El [[laboratorio]] donde nacen los [[rankings]] del futuro.',
    'Donde tus [[preferencias]] se convierten en [[conocimiento]] organizado.',
    'El sitio donde cada [[idea]] encuentra su lugar [[natural]].',
    'Donde los [[gustos]] encuentran [[equilibrio]] entre caos y criterio.',
    'Donde siempre empieza la [[próxima]] gran [[lista]].',
] as const;

const HERO_HIGHLIGHT_REGEX = /(\[\[[^\]]+\]\])/g;
const HERO_HIGHLIGHT_STYLES = ['text-[var(--lt-accent)]', 'text-[var(--lt-accent-2)]', 'text-[var(--lt-accent)]'] as const;
const HOME_LOADING_MESSAGES = [
    'Ajustando rankings con precisión artesanal...',
    'Buscando joyas ocultas cerca de ti...',
    'Ordenando gustos con paciencia diplomática...',
    'Calentando motores para la próxima recomendación...',
    'Poniendo criterio donde antes había caos...',
    'Preparando tu dosis de comparaciones finas...',
] as const;

const pickRandomHeroSubtitle = (): string => {
    return HERO_SUBTITLE_TEMPLATES[Math.floor(Math.random() * HERO_SUBTITLE_TEMPLATES.length)];
};

const toSafeNumber = (value: unknown): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
};

const getErrorCode = (error: unknown): string | null => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        return typeof code === 'string' ? code : null;
    }
    return null;
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
const HIDDEN_GEM_MIN_RATING = 8.4;
// Carruseles antiguos de la Home (listas, joyas, recientes, usuarios, que gustan).
// Apagados desde que llegaron los de lib/homeFeeds; poner a true para recuperarlos.
const SHOW_LEGACY_HOME_CAROUSELS = false;
// Carruseles de lib/homeFeeds que se pintan. Apagados (no borrados) para dejar
// la Home en 4 bloques; poner a true para recuperar cada uno.
const HOME_FEEDS_VISIBLE: Record<string, boolean> = {
    platos: false,
    recuerdos: false,
    ranking: false,
    joyas: true,
    listas: false,
    novedades: false,
    resenas: true,
};
const VISIBLE_HOME_FEEDS = Object.keys(HOME_FEEDS_VISIBLE).filter((id) => HOME_FEEDS_VISIBLE[id]);
// Si cerca hay menos sitios que esto, la Home amplía el radio un escalón.
const MIN_NEARBY_PLACES = 5;
const MAX_AUTO_RANGE_KM = 10;

// Aspecto y enlace «Ver todo» de cada carrusel de lib/homeFeeds.
/** Categoría de comida («Hmm...»): solo sus listas cuentan como platos. */
const FOOD_CATEGORY_ID = 'comida_hmm';

const HOME_FEED_LOOK: Record<string, { icon: React.ReactNode; accentClass: string; searchType: 'lists' | 'places' | 'items'; searchSort?: string }> = {
    platos: { icon: <Utensils className="w-5 h-5 text-amber-400" />, accentClass: 'bg-amber-500/20', searchType: 'items', searchSort: 'top_rated' },
    joyas: { icon: <Gem className="w-5 h-5 text-emerald-300" />, accentClass: 'bg-emerald-500/20', searchType: 'places', searchSort: 'rating' },
    listas: { icon: <ListIcon className="w-5 h-5 text-blue-400" />, accentClass: 'bg-blue-500/20', searchType: 'lists', searchSort: 'most_reviewed' },
    novedades: { icon: <Sparkles className="w-5 h-5 text-cyan-300" />, accentClass: 'bg-cyan-500/20', searchType: 'places', searchSort: 'latest' },
    resenas: { icon: <Camera className="w-5 h-5 text-rose-400" />, accentClass: 'bg-rose-500/20', searchType: 'items', searchSort: 'latest' },
    recuerdos: { icon: <History className="w-5 h-5 text-purple-300" />, accentClass: 'bg-purple-500/20', searchType: 'items' },
    ranking: { icon: <Trophy className="w-5 h-5 text-yellow-400" />, accentClass: 'bg-yellow-500/20', searchType: 'items', searchSort: 'top_rated' },
    default: { icon: <Star className="w-5 h-5 text-amber-400" />, accentClass: 'bg-amber-500/20', searchType: 'items' },
};
const FAVORITE_REVIEW_MIN_RATING = 7.5;
const formatRangeKm = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);

export const HomePage: React.FC = () => {
    // No se espera a la sesión para pintar: el contenido público carga en
    // paralelo y las secciones personales aparecen cuando se resuelve.
    const { user } = useAuth();
    const appConfig = useAppConfig();
    const { location, calculateDistance, requestLocation } = useLocation();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // UI State
    const [activeTab, setActiveTab] = useState<'explore' | 'news'>('explore');
    const [activeFilter, setActiveFilter] = useState('Todo'); // Category Filter

    // Global Distance Range State
    const { range: chosenRange, setRange } = useFilters();
    // Si cerca hay poco, la Home amplía el radio por su cuenta: la elección guardada no se toca.
    const [widenedRange, setWidenedRange] = useState<number | null | undefined>(undefined);
    // Si el usuario elige la distancia a mano, se respeta aunque salga poco.
    const userPickedRangeRef = React.useRef(false);
    useEffect(() => { setWidenedRange(undefined); }, [chosenRange]);
    const range = widenedRange !== undefined ? widenedRange : chosenRange;

    // Zona (compartida con la Lista): radio o tu ciudad / comunidad / país.
    const [area, setArea] = useState<ListArea>(() => {
        try { return decodeArea(localStorage.getItem(AREA_STORAGE_KEY)); } catch { return { kind: 'near' }; }
    });
    useEffect(() => {
        try { localStorage.setItem(AREA_STORAGE_KEY, encodeArea(area)); } catch { /* opcional */ }
    }, [area]);

    const [isMapOpen, setIsMapOpen] = useState(false);
    const [gateLoading, setGateLoading] = useState(true);
    const [showProfileGate, setShowProfileGate] = useState(false);
    const [profileGateReason, setProfileGateReason] = useState<'missing_or_invalid' | 'claim_conflict' | null>(null);
    const [gateChecked, setGateChecked] = useState(false);
    const [gateResolvedForUserId, setGateResolvedForUserId] = useState<string | null>(null);
    const [gateSubmitting, setGateSubmitting] = useState(false);
    const [gateError, setGateError] = useState<string | null>(null);
    const [profileGateVisible, setProfileGateVisible] = useState(false);
    const [gateForm, setGateForm] = useState<UserProfileFormData>({
        username: '',
        displayName: '',
        name: '',
        surnames: '',
        location: '',
        bio: '',
    });
    const [heroSubtitle] = useState<string>(() => pickRandomHeroSubtitle());
    const [homeSearch, setHomeSearch] = useState('');
    // Semilla del día (fecha local): los carruseles rotan cada día, no en cada render.
    const [feedSeed] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [loadingMessageIndex, setLoadingMessageIndex] = useState<number>(() => Math.floor(Math.random() * HOME_LOADING_MESSAGES.length));

    const parsedHeroSubtitle = useMemo(() => {
        let highlightIndex = 0;
        return heroSubtitle
            .split(HERO_HIGHLIGHT_REGEX)
            .filter(Boolean)
            .map((segment, index) => {
                const tokenMatch = segment.match(/^\[\[([\s\S]+)\]\]$/);
                if (!tokenMatch) {
                    return {
                        key: `plain-${index}`,
                        text: segment,
                        isHighlight: false,
                        className: '',
                    };
                }

                const className = HERO_HIGHLIGHT_STYLES[highlightIndex % HERO_HIGHLIGHT_STYLES.length];
                highlightIndex += 1;
                return {
                    key: `highlight-${index}`,
                    text: tokenMatch[1],
                    isHighlight: true,
                    className,
                };
            });
    }, [heroSubtitle]);

    useEffect(() => {
        let cancelled = false;

        const checkProfileGate = async () => {
            if (!user) {
                if (!cancelled) {
                    setGateLoading(false);
                    setGateChecked(true);
                    setGateResolvedForUserId(null);
                    setShowProfileGate(false);
                    setProfileGateReason(null);
                    setGateError(null);
                }
                return;
            }

            setGateResolvedForUserId(null);
            setGateChecked(false);
            setShowProfileGate(false);
            setProfileGateReason(null);
            setGateLoading(true);

            // Fast cache-first check: if local Firestore cache already has a valid username,
            // skip the gate entirely to avoid false-positive flashes caused by claim-check timing.
            try {
                const cachedSnap = await getDoc(doc(db, 'users', user.uid));
                if (cancelled) return;
                if (cachedSnap.exists()) {
                    const cachedUsername = typeof cachedSnap.data().username === 'string'
                        ? cachedSnap.data().username.trim() : '';
                    if (isUsernameValid(cachedUsername)) {
                        setGateLoading(false);
                        setGateChecked(true);
                        setGateResolvedForUserId(user.uid);
                        return;
                    }
                }
            } catch {
                // Cache unavailable — fall through to full server check
            }

            try {
                const status = await getUsernameGateStatus({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoUrl: user.photoURL,
                });

                if (cancelled) return;

                setGateForm(status.prefill);
                setShowProfileGate(status.requiresCompletion);
                setProfileGateReason(status.requiresCompletion ? status.reason ?? 'missing_or_invalid' : null);
                if (status.requiresCompletion && status.reason === 'claim_conflict') {
                    setGateError('Ese nombre de usuario ya está ocupado. Elige otro para continuar.');
                } else {
                    setGateError(null);
                }
            } catch (error) {
                if (cancelled) return;
                console.error('[HomePage] Error validating username gate:', error);
                setShowProfileGate(false);
                setProfileGateReason(null);
                setGateError(null);
            } finally {
                if (!cancelled) {
                    setGateLoading(false);
                    setGateChecked(true);
                    setGateResolvedForUserId(user.uid);
                }
            }
        };

        void checkProfileGate();

        return () => {
            cancelled = true;
        };
    }, [user?.uid]);

    useEffect(() => {
        if (!user || !showProfileGate) return;

        const unsubscribe = onSnapshot(
            doc(db, 'users', user.uid),
            (snap) => {
                if (!snap.exists()) return;
                const data = snap.data() as Record<string, unknown>;
                const candidateUsername = typeof data.username === 'string' ? data.username.trim() : '';
                if (isUsernameValid(candidateUsername)) {
                    setShowProfileGate(false);
                    setProfileGateReason(null);
                    setGateError(null);
                }
            },
            (error) => {
                console.error('[HomePage] Error watching username gate:', error);
            }
        );

        return () => unsubscribe();
    }, [user?.uid, showProfileGate]);

    useEffect(() => {
        if (!user || !showProfileGate || gateLoading || !gateChecked || gateResolvedForUserId !== user.uid) {
            setProfileGateVisible(false);
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            if (profileGateReason === 'missing_or_invalid') {
                try {
                    const snap = await getDocFromServer(doc(db, 'users', user.uid));
                    if (cancelled) return;
                    const data = snap.exists() ? snap.data() as Record<string, unknown> : null;
                    const username = typeof data?.username === 'string' ? data.username.trim() : '';
                    if (isUsernameValid(username)) {
                        setShowProfileGate(false);
                        setProfileGateReason(null);
                        setGateError(null);
                        setProfileGateVisible(false);
                        return;
                    }
                } catch (error) {
                    if (cancelled) return;
                    console.warn('[HomePage] Skipping username gate after failed pre-open check:', error);
                    setShowProfileGate(false);
                    setProfileGateReason(null);
                    setProfileGateVisible(false);
                    return;
                }
            }
            if (cancelled) return;
            setProfileGateVisible(true);
        }, 350);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [user?.uid, showProfileGate, gateLoading, gateChecked, gateResolvedForUserId, profileGateReason]);

    const handleGateFieldChange = (field: keyof UserProfileFormData, value: string) => {
        setGateForm(prev => ({ ...prev, [field]: value }));
    };

    const handleCompleteProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!user) return;

        setGateSubmitting(true);
        setGateError(null);
        try {
            const result = await completeUserProfileSetup({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoUrl: user.photoURL,
            }, gateForm);

            if (user.displayName !== result.displayName) {
                await updateProfile(user, { displayName: result.displayName });
            }

            setShowProfileGate(false);
            setProfileGateReason(null);
            setProfileGateVisible(false);
            setGateError(null);
        } catch (error) {
            if (isUserProfileServiceError(error)) {
                if (error.code === 'username-taken') {
                    setGateError('Ese nombre de usuario ya está en uso. Prueba otro.');
                } else if (error.code === 'username-immutable') {
                    setGateError('Tu username actual ya está bloqueado y no se puede cambiar.');
                } else {
                    setGateError(error.message || 'No se pudo guardar tu perfil.');
                }
            } else {
                console.error('[HomePage] Error completing profile gate:', error);
                setGateError('No se pudo guardar tu perfil. Inténtalo de nuevo.');
            }
        } finally {
            setGateSubmitting(false);
        }
    };

    // Following Logic
    const [followingIds, setFollowingIds] = useState<string[]>([]);
    const userUid = user?.uid;
    useEffect(() => {
        if (!userUid) {
            setFollowingIds([]);
            return;
        }
        const fetchFollowing = async () => {
            const q = query(collection(db, 'users', userUid, 'following'));
            const snap = await getDocs(q);
            setFollowingIds(snap.docs.map(d => d.id));
        };
        fetchFollowing();
    }, [userUid]);

    // Infinite Scroll / Pagination
    const [visibleCount, setVisibleCount] = useState(4);
    const [feedViewMode, setFeedViewMode] = useState<'full' | 'list'>('full');
    const loadMoreRef = React.useRef<HTMLDivElement>(null);

    // --- DATA FETCHING (Dynamic based on Tab) ---
    // Explore -> Top Rated/Trending; News -> Following
    const listSort = activeTab === 'explore' ? 'top_rated' : 'recent'; // Lists still use 'recent' for news

    const reviewSortParam = useMemo(() => {
        if (activeTab === 'explore') {
            const months = appConfig.homeReviewsMonths;
            if (months > 0) {
                const sinceDate = new Date();
                sinceDate.setMonth(sinceDate.getMonth() - months);
                return { type: 'trending' as const, sinceDate };
            }
            return { type: 'trending' as const, limit: 1000 }; // 0 meses = sin límite temporal, cota de seguridad
        }
        if (!user || followingIds.length === 0) {
            return { type: 'recent' as const, limit: 20 };
        }
        return { type: 'following' as const, followingIds, limit: 10 };
    }, [activeTab, followingIds, appConfig.homeReviewsMonths, user]);

    const { lists, loading: loadingLists } = useLists(listSort);
    const { reviews, loading: loadingReviews, fetchMore, hasMore, loadingMore } = useReviews(reviewSortParam);

    const [botUserIds, setBotUserIds] = useState<Set<string>>(new Set());
    useEffect(() => {
        const fetchBots = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'publicProfiles'), where('userType', 'array-contains', 'bot'), limit(50)));
                setBotUserIds(new Set(snap.docs.map(d => d.id)));
            } catch (error) {
                console.warn('[HomePage] Error loading bot profiles:', error);
            }
        };
        fetchBots();
    }, []);
    const fetchMoreRef = React.useRef(fetchMore);
    const { users: topUsers, loading: loadingUsers } = useUsers();
    const homeContentLoading = loadingLists || loadingReviews || loadingUsers;
    const [ownTasteReviews, setOwnTasteReviews] = useState<any[]>([]);
    const [loadingOwnTaste, setLoadingOwnTaste] = useState(false);

    useEffect(() => {
        if (!user?.uid || !appConfig.showAffinityCarousel) {
            setOwnTasteReviews([]);
            setLoadingOwnTaste(false);
            return;
        }

        let cancelled = false;
        const fetchOwnTaste = async () => {
            setLoadingOwnTaste(true);
            try {
                const snap = await getDocs(query(
                    collectionGroup(db, 'reviews'),
                    where('userId', '==', user.uid),
                    limit(60)
                ));
                if (cancelled) return;
                setOwnTasteReviews(snap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    listId: (d.data() as any).listId || d.ref.parent.parent?.id,
                })));
            } catch (error) {
                if (getErrorCode(error) !== 'permission-denied') {
                    console.warn('[HomePage] Error fetching own taste reviews:', error);
                }

                try {
                    const fallbackReviews = await fetchUserReviewsFromAccessibleLists(user.uid, 60);
                    if (!cancelled) setOwnTasteReviews(fallbackReviews);
                } catch (fallbackError) {
                    console.warn('[HomePage] Error fetching own taste reviews fallback:', fallbackError);
                    if (!cancelled) setOwnTasteReviews([]);
                }
            } finally {
                if (!cancelled) setLoadingOwnTaste(false);
            }
        };

        fetchOwnTaste();
        return () => {
            cancelled = true;
        };
    }, [appConfig.showAffinityCarousel, user?.uid]);

    useEffect(() => {
        if (!homeContentLoading) return;
        const intervalId = window.setInterval(() => {
            setLoadingMessageIndex((prev) => (prev + 1) % HOME_LOADING_MESSAGES.length);
        }, 2400);
        return () => window.clearInterval(intervalId);
    }, [homeContentLoading]);

    useEffect(() => { fetchMoreRef.current = fetchMore; }, [fetchMore]);

    const activeTabRef = React.useRef(activeTab);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
    const hasMoreRef = React.useRef(hasMore);
    useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
    const loadingMoreRef = React.useRef(loadingMore);
    useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);

    const isFetchingRef = React.useRef(false);
    useEffect(() => { if (!loadingMore) isFetchingRef.current = false; }, [loadingMore]);

    useEffect(() => {
        if (loadingReviews) return;
        const target = loadMoreRef.current;
        if (!target) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => prev + 5);
                if (activeTabRef.current === 'news' && hasMoreRef.current && !isFetchingRef.current && !loadingMoreRef.current) {
                    isFetchingRef.current = true;
                    fetchMoreRef.current();
                }
            }
        }, { threshold: 0.1 });

        observer.observe(target);
        return () => observer.disconnect();
    }, [activeTab, loadingReviews, reviews.length > 0]);
    // Reset count when tab/filter changes
    useEffect(() => {
        setVisibleCount(4);
    }, [activeTab, activeFilter]);

    // --- FILTERING LOGIC ---

    // 1. Helper: Check Category (User Request: Hmm/Woow/Yujuui are categories)
    const checkCategory = useCallback((item: any) => {
        if (activeFilter === 'Todo') return true;

        const catId = item.categoryId || item.category || '';
        const filterNorm = activeFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
        const catNorm = String(catId).toLowerCase().replace(/[^a-z0-9]/g, '');

        if (catNorm.includes(filterNorm)) return true;

        if (item.availableTags && Array.isArray(item.availableTags)) {
            if (item.availableTags.some((t: string) => t.toLowerCase().includes(filterNorm))) return true;
        }

        if (item.listCategory || item.category) {
            const itemCat = String(item.listCategory || item.category).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (itemCat.includes(filterNorm)) return true;
        }

        return false;
    }, [activeFilter]);

    // Zona en contexto local: tu ciudad, comunidad y país, deducidos de los
    // sitios valorados más cercanos. Otras zonas, en Buscar.
    // Un punto por sitio (el número de cada zona son sitios, como en el mapa).
    const reviewGeoPoints = useMemo(() => {
        const byPlace = new Map<string, GeoFields & { lat?: number; lng?: number }>();
        reviews.forEach((r) => {
            const key = r.placeId || r.id;
            if (byPlace.has(key)) return;
            const { placeLat, placeLng } = r as { placeLat?: number; placeLng?: number };
            byPlace.set(key, { city: r.placeCity, province: r.placeProvince, region: r.placeRegion, country: r.placeCountry, lat: placeLat, lng: placeLng });
        });
        return [...byPlace.values()];
    }, [reviews]);
    const userGeo = useMemo(() => inferUserGeo(location, reviewGeoPoints), [location, reviewGeoPoints]);
    const areaOptions = useMemo(() => localAreaOptions(buildAreaOptions(reviewGeoPoints), userGeo), [reviewGeoPoints, userGeo]);
    const areaFilter = useMemo<ListArea>(() => {
        if (area.kind === 'near') return area;
        return areaOptions[area.kind].some((o) => o.value === area.value) ? area : { kind: 'near' };
    }, [area, areaOptions]);
    const handleAreaSelect = (value: string) => {
        setWidenedRange(undefined);
        userPickedRangeRef.current = true;
        if (value.startsWith('r:')) {
            const raw = value.slice(2);
            setArea({ kind: 'near' });
            setRange(raw === 'all' ? null : Number(raw));
            if (raw !== 'all' && !location) requestLocation();
            return;
        }
        setArea(decodeArea(value));
    };

    // 2. Helper: Check Distance
    const checkDistance = useCallback((lat?: number, lng?: number, geo?: GeoFields) => {
        // Zona elegida (tu ciudad, comunidad o país): manda sobre el radio.
        if (areaFilter.kind !== 'near') return geo ? matchesArea(geo, areaFilter) : true;
        if (!range || !location || !lat || !lng) return true;
        const dist = calculateDistance(lat, lng);
        if (dist === null) return true;
        return dist <= range;
    }, [range, location, calculateDistance, areaFilter]);

    // 3. Derived & Filtered Lists
    const filteredLists = useMemo(() => {
        return lists.filter(l => {
            const matchesCategory = checkCategory(l);
            // Las listas no tienen zona: con una zona elegida no se filtran.
            const matchesDist = areaFilter.kind !== 'near' || checkDistance(l.lat, l.lng);
            return matchesCategory && matchesDist;
        });
    }, [lists, activeFilter, range, location, areaFilter, checkDistance]);

    // 4. Derived & Filtered Items (Reviews)
    // We need the FULL list for calcs, not just the sliced one for display
    const reviewsInRange = useMemo(() => {
        return reviews.filter(r => {
            const uid = (r as any).userId || (r as any).authorId;
            if (uid && botUserIds.has(uid)) return false;
            const matchesCategory = checkCategory(r);
            const lat = (r as any).placeLat || (r as any).lat;
            const lng = (r as any).placeLng || (r as any).lng;
            const matchesDist = checkDistance(lat, lng, { city: r.placeCity, province: r.placeProvince, region: r.placeRegion, country: r.placeCountry });
            return matchesCategory && matchesDist;
        });
    }, [reviews, activeFilter, range, location, botUserIds, checkDistance]);

    // «Recuerdos»: tus reseñas de hace un tiempo, con la misma zona y categoría.
    const myMemories = useMemoryReviews(activeTab === 'explore' ? user?.uid : null);
    const memoriesInRange = useMemo(() => myMemories.filter((r) => {
        const geo = r as { placeLat?: number; lat?: number; placeLng?: number; lng?: number };
        return checkCategory(r) && checkDistance(geo.placeLat || geo.lat, geo.placeLng || geo.lng, {
            city: r.placeCity, province: r.placeProvince, region: r.placeRegion, country: r.placeCountry,
        });
    }), [myMemories, checkCategory, checkDistance]);

    const filteredItems = useMemo(() => {
        const base = [...reviewsInRange];

        if (activeTab === 'news') {
            // Sort by Date Descending
            return base.sort((a, b) => {
                const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return dateB - dateA;
            });
        }

        // "Mejor en Listopic": ranking único (lib/scoring) con la nota del sitio y
        // su número de reseñas; si el sitio aún no tiene nota, la de la reseña.
        const rankStats = (r: { placeAverageRating?: unknown; placeReviewsCount?: unknown; overallRating?: unknown }) => (typeof r.placeAverageRating === 'number'
            ? { average: r.placeAverageRating, count: r.placeReviewsCount ?? 1 }
            : { average: r.overallRating, count: 1 });
        return base
            .sort((a, b) => compareByRank(rankStats(a), rankStats(b)))
            .slice(0, 15);
    }, [reviewsInRange, activeTab]);

    // 4b. Carousel Reviews (Specific Logic: Last 2 Months + Top Liked + Filtered by Range/Cat)
    const carouselReviews = useMemo(() => {
        // "Reseñas que gustan" (Trending/Liked in range)
        return [...reviewsInRange]
            .sort((a, b) => (b.reactionCounts?.like || 0) - (a.reactionCounts?.like || 0))
            .slice(0, 15);
    }, [reviewsInRange]);

    // 4c. Recent Reviews (Strictly by Date + In Range)
    const recentReviewsInRange = useMemo(() => {
        return [...reviewsInRange].sort((a, b) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return dateB - dateA;
        }).slice(0, 15);
    }, [reviewsInRange]);



    // --- MAP DATA ENRICHMENT ---
    // Sitios extra para el mapa, «Sitios» y joyas: una sola lectura de 100 que
    // se guarda 10 min (antes 20 + 100 en cada visita a Inicio).
    const extraPlacesQuery = useQuery({
        queryKey: ['home-extra-places'],
        enabled: activeTab === 'explore',
        staleTime: 10 * 60 * 1000,
        queryFn: async () => {
            const snap = await getDocs(query(collection(db, 'places'), limit(100)));
            const mapped = snap.docs.map(d => {
                const data = d.data();
                const lat = data.location?.latitude || data.coordinates?.latitude || data.lat;
                const lng = data.location?.longitude || data.coordinates?.longitude || data.lng;
                return {
                    id: d.id,
                    placeId: d.id,
                    name: data.name,
                    address: data.address || data.formatted_address,
                    photoUrl: data.thumbnailUrl || data.mainImageUrl || data.photoUrl || data.coverUrl || data.imageUrl,
                    // Solo la nota pública de Listopic (personas); nunca la de Google en su lugar.
                    rating: placeRating(data).average ?? 0,
                    botRating: placeRating(data).bots?.average ?? null,
                    // Actividad visible (también bots): el sitio sale aunque no tenga nota pública.
                    reviewsCount: placeRating(data).visibleCount,
                    closedStatus: data.closedStatus || null,
                    lat, lng,
                    geo: { city: data.city || '', province: data.province || '', region: data.region || '', country: data.country || '' },
                    items: [] // No specific items for these unless we fetch subcollections
                };
            }).filter(p => p.lat && p.lng && p.reviewsCount > 0 && p.closedStatus !== 'permanently_closed'); // Only places with location AND reviews, exclude permanently closed
            return mapped;
        },
    });
    const extraPlaces = useMemo<any[]>(() => extraPlacesQuery.data ?? [], [extraPlacesQuery.data]);

    // 5. Derived Places (Unique from Reviews -> Filtered) + Extra Places
    const filteredPlaces = useMemo(() => {
        const uniquePlaces = new Map();

        // 1. Add places from Reviews (High priority - have rich item data)
        reviewsInRange.forEach(r => {
            if (r.placeId) {
                if (uniquePlaces.has(r.placeId)) {
                    const existing = uniquePlaces.get(r.placeId);
                    existing.reviewsCount = (existing.reviewsCount || 0) + 1;
                    const listName = ((r as { listName?: string }).listName || '').trim();
                    if (listName && existing.tags && !existing.tags.includes(listName)) existing.tags.push(listName);
                    if (!existing.photoUrl && (r.placeMainImage || r.photoUrl)) {
                        existing.photoUrl = r.placeMainImage || r.photoUrl;
                    }
                    uniquePlaces.set(r.placeId, existing);
                } else {
                    const lat = (r as any).placeLat;
                    const lng = (r as any).placeLng;
                    uniquePlaces.set(r.placeId, {
                        id: r.placeId,
                        placeId: r.placeId,
                        name: r.placeName || r.itemName,
                        address: r.placeAddress,
                        photoUrl: r.placeMainImage || r.photoUrl,
                        rating: r.placeAverageRating || r.overallRating,
                        placeReviewsCount: (r as { placeReviewsCount?: number }).placeReviewsCount,
                        reviewsCount: 1,
                        closedStatus: (r as any).placeClosedStatus || null,
                        lat, lng,
                        items: [], // Can populate if needed
                        tags: [((r as { listName?: string }).listName || '').trim()].filter(Boolean),
                        // Sacado de una reseña: su nota puede ser la de esa reseña, no la media pública.
                        fromReviews: true
                    });
                }
            }
        });

        // 2. Add Extra Places (if not already present, or update photo if missing)
        extraPlaces.forEach(p => {
            if (!uniquePlaces.has(p.id)) {
                // Check distance filter for these too!
                if (checkDistance(p.lat, p.lng, p.geo)) {
                    uniquePlaces.set(p.id, p);
                }
            } else if (!uniquePlaces.get(p.id).photoUrl && p.photoUrl) {
                const existing = uniquePlaces.get(p.id);
                existing.photoUrl = p.photoUrl;
                uniquePlaces.set(p.id, existing);
            }
        });

        // Sort: "Los lugares de más nota a menos." — exclude permanently closed from map
        return Array.from(uniquePlaces.values())
            .filter(p => p.closedStatus !== 'permanently_closed')
            .sort((a, b) => compareByRank(
                { average: a.rating, count: a.placeReviewsCount ?? a.reviewsCount ?? 1 },
                { average: b.rating, count: b.placeReviewsCount ?? b.reviewsCount ?? 1 },
            ));
    }, [reviewsInRange, extraPlaces, range, location, activeFilter]);

    const hasHomeMapCandidates = useMemo(() => {
        const filterNorm = activeFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchesCategory = (item: any) => {
            if (activeFilter === 'Todo') return true;

            const catId = item.categoryId || item.category || '';
            const catNorm = String(catId).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (catNorm.includes(filterNorm)) return true;

            if (item.availableTags && Array.isArray(item.availableTags)) {
                if (item.availableTags.some((t: string) => t.toLowerCase().includes(filterNorm))) return true;
            }

            if (item.listCategory || item.category) {
                const itemCat = String(item.listCategory || item.category).toLowerCase().replace(/[^a-z0-9]/g, '');
                if (itemCat.includes(filterNorm)) return true;
            }

            return false;
        };

        const reviewCandidates = reviews.some((review: any) => {
            if (!matchesCategory(review)) return false;
            const lat = review.placeLat || review.lat;
            const lng = review.placeLng || review.lng;
            return !!review.placeId && !!lat && !!lng;
        });

        const extraPlaceCandidates = extraPlaces.some((place: any) => !!place?.id && !!place?.lat && !!place?.lng);

        return reviewCandidates || extraPlaceCandidates;
    }, [reviews, extraPlaces, activeFilter]);

    const hiddenGemPlaces = useMemo(() => {
        return filteredPlaces
            .map((place: any) => {
                const rating = toSafeNumber(place.rating || place.averageRating || place.googleRating);
                const reviewsCount = toSafeNumber(place.reviewsCount || place.reviewCount);
                const distanceKm = location && place.lat && place.lng ? calculateDistance(place.lat, place.lng) : null;
                const gemScore =
                    rating * 16 +
                    Math.max(0, 5 - reviewsCount) * 9 +
                    (distanceKm !== null ? Math.max(0, 12 - distanceKm) : 0);

                return {
                    ...place,
                    rating,
                    reviewsCount,
                    distanceKm,
                    gemScore,
                };
            })
            .filter((place: any) =>
                place.rating >= HIDDEN_GEM_MIN_RATING &&
                place.reviewsCount > 0 &&
                place.reviewsCount <= 5 &&
                place.closedStatus !== 'permanently_closed'
            )
            .sort((a: any, b: any) => b.gemScore - a.gemScore)
            .slice(0, 12);
    }, [calculateDistance, filteredPlaces, location]);

    useEffect(() => {
        if (activeTab !== 'explore') return;
        if (areaFilter.kind !== 'near' || range === null || !location) return;
        if (loadingReviews) return;
        if (!hasHomeMapCandidates) return;
        if (filteredPlaces.length >= MIN_NEARBY_PLACES) return;
        if (userPickedRangeRef.current) return;

        // Se amplía escalón a escalón, pero nunca más allá de MAX_AUTO_RANGE_KM: el Inicio sigue siendo «cerca».
        const nextRange = getExpandedRangeValue(range);
        if (nextRange !== null && nextRange <= MAX_AUTO_RANGE_KM && nextRange !== range) {
            setWidenedRange(nextRange);
        }
    }, [activeTab, range, location, loadingReviews, hasHomeMapCandidates, filteredPlaces.length, areaFilter.kind]);

    // 6. Derived Users (Synthesized from content IN RANGE)
    const activeUsersInRange = useMemo(() => {
        // Sin rango activo: usar reviewsCount real del documento de usuario (dato exacto)
        if (range === null) {
            return topUsers
                .filter(u => (u.reviewsCount || 0) > 0 && !botUserIds.has(u.uid))
                .map(u => ({
                    ...u,
                    reviewsInRangeCount: u.reviewsCount || 0
                }));
        }

        // Con rango activo: derivar conteo de las reseñas fetched dentro del rango
        const userStats = new Map<string, { count: number, user: any }>();

        reviewsInRange.forEach(r => {
            const uid = (r as any).userId || (r as any).authorId;
            if (uid) {
                if (!userStats.has(uid)) {
                    const meta = topUsers.find(u => u.uid === uid) || {
                        uid,
                        displayName: (r as any).authorName || 'Usuario',
                        photoUrl: (r as any).authorPhoto,
                        username: 'user',
                        followersCount: 0
                    };
                    userStats.set(uid, { count: 0, user: meta });
                }
                const entry = userStats.get(uid)!;
                entry.count++;
                if (!entry.user.photoUrl && (r as any).authorPhoto) {
                    entry.user.photoUrl = (r as any).authorPhoto;
                }
            }
        });

        return Array.from(userStats.values())
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count)
            .map(item => ({
                ...item.user,
                reviewsInRangeCount: item.count
            }));

    }, [botUserIds, reviewsInRange, topUsers, range]);

    // Match de sabor: solo usuarios con lugares valorados en común contigo.
    // Sin coincidencias reales no hay porcentaje (computeTasteMatch → null),
    // así que alguien muy activo pero sin sitios compartidos ya no aparece.
    const affinityUsers = useMemo(() => {
        const userById = new Map(topUsers.map((topUser: any) => [topUser.uid, topUser]));
        const getReviewUserId = (review: any) => review.userId || review.authorId || '';

        const ownTasteSource = ownTasteReviews.length > 0
            ? ownTasteReviews
            : reviewsInRange.filter((review: any) => getReviewUserId(review) === user?.uid);
        if (ownTasteSource.length === 0) return [];

        const reviewsByUser = new Map<string, { meta: any; reviews: any[] }>();
        reviewsInRange.forEach((review: any) => {
            const uid = getReviewUserId(review);
            if (!uid || uid === user?.uid || botUserIds.has(uid)) return;
            if (!reviewsByUser.has(uid)) {
                reviewsByUser.set(uid, {
                    meta: userById.get(uid) || {
                        uid,
                        displayName: review.authorName || 'Usuario',
                        photoUrl: review.authorPhoto,
                        username: 'user',
                        followersCount: 0,
                        reviewsCount: 0,
                    },
                    reviews: [],
                });
            }
            const entry = reviewsByUser.get(uid)!;
            entry.reviews.push(review);
            if (!entry.meta.photoUrl && review.authorPhoto) entry.meta.photoUrl = review.authorPhoto;
        });

        return Array.from(reviewsByUser.values())
            .map((entry) => {
                const match = computeTasteMatch(ownTasteSource, entry.reviews);
                if (!match) return null;
                return {
                    ...entry.meta,
                    affinityScore: match.score,
                    affinityReason: match.reason,
                    reviewsInRangeCount: entry.reviews.length,
                };
            })
            .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
            .sort((a: any, b: any) => b.affinityScore - a.affinityScore)
            .slice(0, 12);
    }, [botUserIds, ownTasteReviews, reviewsInRange, topUsers, user?.uid]);

    // «Les encantó»: los platos top de tus almas gemelas que tú aún no has probado (lib/soulmateFeed).
    const soulmateCards = useMemo(() => {
        if (affinityUsers.length === 0) return [];
        const own = ownTasteReviews.length > 0
            ? ownTasteReviews
            : reviewsInRange.filter((review: any) => (review.userId || review.authorId) === user?.uid);
        return buildSoulmateFeed(affinityUsers, reviewsInRange as HomeFeedReview[], own as HomeFeedReview[]);
    }, [affinityUsers, ownTasteReviews, reviewsInRange, user?.uid]);

    // 7. Lists with Range Stats
    const listsWithRangeStats = useMemo(() => {
        // Map lists to attach dynamic review count based on reviewsInRange
        return filteredLists.map(list => {
            // If Range is NULL (Infinite), use the static total count from DB to be accurate
            // regardless of how many reviews we have loaded in memory.
            if (range === null) {
                return {
                    ...list,
                    reviewsInRangeCount: list.reviewCount || list.reviewsCount || 0
                };
            }

            // Otherwise, calculate based on loaded reviews (best effort for specific range)
            const count = reviewsInRange.filter(r => r.listId === list.id).length;
            return {
                ...list,
                reviewsInRangeCount: count || list.reviewCount || list.reviewsCount || 0
            };
        });
    }, [filteredLists, reviewsInRange, range]);

    const listCarouselItems = useMemo(() => {
        const byId = new Map<string, any>();

        listsWithRangeStats.forEach((list: any) => {
            if (!list?.id) return;
            byId.set(list.id, {
                ...list,
                reviewsInRangeCount: toSafeNumber(list.reviewsInRangeCount ?? list.reviewCount ?? list.reviewsCount),
            });
        });

        reviewsInRange.forEach((review: any) => {
            const listId = review.listId;
            if (!listId) return;

            const existing = byId.get(listId);
            if (existing) {
                existing.reviewsInRangeCount = Math.max(
                    toSafeNumber(existing.reviewsInRangeCount ?? existing.reviewCount ?? existing.reviewsCount),
                    1,
                );
                if (!existing.thumbnailUrl && !existing.mainImageUrl && !existing.photoUrl && !existing.coverUrl && !existing.imageUrl) {
                    existing.photoUrl = review.placeMainImage || review.photoUrl || review.photoUrls?.[0];
                }
                byId.set(listId, existing);
                return;
            }

            byId.set(listId, {
                id: listId,
                name: review.listName || review.category || 'Lista',
                description: '',
                userId: review.userId || review.authorId || '',
                authorName: review.authorName,
                photoUrl: review.placeMainImage || review.photoUrl || review.photoUrls?.[0] || '',
                thumbnailUrl: review.placeMainImage || review.photoUrl || review.photoUrls?.[0] || '',
                isPublic: true,
                visibility: 'public',
                itemCount: 0,
                groupedItemsCount: 0,
                followersCount: 0,
                commentsCount: 0,
                reviewCount: 1,
                reviewsCount: 1,
                reviewsInRangeCount: 1,
                averageRating: review.overallRating || 0,
                availableTags: [],
                criteriaAverages: {},
                reactions: {},
                categoryId: review.categoryId || review.listCategoryId,
                category: review.category || review.listCategoryName,
            });
        });

        return Array.from(byId.values())
            .filter((list: any) => Boolean(list.id && list.name))
            .sort((a: any, b: any) =>
                toSafeNumber(b.reviewsInRangeCount ?? b.reviewCount ?? b.reviewsCount) -
                toSafeNumber(a.reviewsInRangeCount ?? a.reviewCount ?? a.reviewsCount)
            )
            .slice(0, 10);
    }, [listsWithRangeStats, reviewsInRange]);

    const surpriseCandidates = useMemo(() => {
        type SurpriseCandidate = {
            route: string;
            label: string;
            reason: string;
            score: number;
            badge?: string;
        };
        const candidates: SurpriseCandidate[] = [];
        const seenRoutes = new Set<string>();
        const addCandidate = (candidate: SurpriseCandidate) => {
            if (seenRoutes.has(candidate.route)) return;
            seenRoutes.add(candidate.route);
            candidates.push({ ...candidate, score: clampScore(candidate.score) });
        };

        filteredItems.slice(0, 35).forEach((review: any) => {
            if (!review?.placeId || !review?.itemName) return;
            const rating = toSafeNumber(review.placeAverageRating || review.overallRating);
            const likes = toSafeNumber(review.reactionCounts?.like);
            const reviewCount = toSafeNumber(review.reviewCount || review.reviewsCount || 1);
            const authorBoost = botUserIds.has(review.userId || review.authorId) ? -20 : 0;
            const score = rating * 8 + Math.log1p(likes) * 12 + Math.log1p(reviewCount) * 5 + authorBoost;
            addCandidate({
                route: `/group/${review.placeId}/${encodeURIComponent(review.itemName)}`,
                label: `${review.itemName} · ${review.placeName || 'Grupo'}`,
                reason: likes > 0
                    ? `${rating ? rating.toFixed(1) : 'Buena nota'} y ${likes} me gusta`
                    : `${rating ? rating.toFixed(1) : 'Buena nota'} en una reseña cercana`,
                score,
                badge: likes >= 3 ? 'Está gustando' : undefined,
            });
        });

        filteredPlaces.slice(0, 30).forEach((place: any) => {
            const placeId = place?.placeId || place?.id;
            if (!placeId) return;
            const rating = toSafeNumber(place.rating || place.averageRating || place.googleRating);
            const reviewsCount = toSafeNumber(place.reviewsCount || place.reviewCount);
            const isHiddenGem = rating >= HIDDEN_GEM_MIN_RATING && reviewsCount > 0 && reviewsCount <= 4;
            const distanceKm = location && place.lat && place.lng ? calculateDistance(place.lat, place.lng) : null;
            const distanceBoost = distanceKm !== null ? Math.max(0, 18 - distanceKm * 2) : 0;
            const score = rating * 10 + Math.log1p(reviewsCount) * 10 + distanceBoost + (isHiddenGem ? 18 : 0);
            addCandidate({
                route: `/place/${placeId}`,
                label: place?.name || 'Sitio sorpresa',
                reason: isHiddenGem
                    ? `Joya oculta: ${rating.toFixed(1)} con pocas reseñas`
                    : `${rating ? rating.toFixed(1) : 'Buena pinta'} · ${reviewsCount || 1} ${reviewsCount === 1 ? 'reseña' : 'reseñas'}`,
                score,
                badge: isHiddenGem ? 'Joya oculta' : undefined,
            });
        });

        listsWithRangeStats.slice(0, 25).forEach((list: any) => {
            if (!list?.id) return;
            const rating = toSafeNumber(list.averageRating || list.avgScore);
            const reviewsCount = toSafeNumber(list.reviewsInRangeCount ?? list.reviewCount ?? list.reviewsCount);
            const followers = toSafeNumber(list.followersCount || list.likes);
            const score = rating * 7 + Math.log1p(reviewsCount) * 12 + Math.log1p(followers) * 7;
            addCandidate({
                route: `/list/${list.id}`,
                label: list?.name || 'Lista sorpresa',
                reason: reviewsCount > 0
                    ? `${reviewsCount} ${reviewsCount === 1 ? 'reseña' : 'reseñas'} en esta lista`
                    : 'Lista con buena actividad',
                score,
                badge: followers >= 5 ? 'Popular' : undefined,
            });
        });

        return candidates
            .filter(candidate => candidate.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);
    }, [botUserIds, calculateDistance, filteredItems, filteredPlaces, listsWithRangeStats, location]);

    const handleSurpriseChoice = useCallback(() => {
        if (surpriseCandidates.length === 0) {
            showToast({
                variant: 'info',
                title: 'Sin opciones por ahora',
                message: 'No hay resultados en este rango. Prueba ampliarlo y volvemos a jugar.',
            });
            return;
        }

        const weightedPool = surpriseCandidates.flatMap((candidate, index) => {
            const weight = Math.max(1, Math.ceil((surpriseCandidates.length - index) / 3));
            return Array.from({ length: weight }, () => candidate);
        });
        const randomChoice = weightedPool[Math.floor(Math.random() * weightedPool.length)] || surpriseCandidates[0];
        showToast({
            variant: 'info',
            title: randomChoice.badge ? `Sorpresa: ${randomChoice.badge}` : 'Sorpresa inteligente',
            message: `${randomChoice.label} · ${randomChoice.reason}`,
            durationMs: 2800,
        });
        navigate(randomChoice.route);
    }, [navigate, showToast, surpriseCandidates]);

    useEffect(() => {
        if (searchParams.get('surprise') !== '1' || !appConfig.showRandomChoiceButton || surpriseCandidates.length === 0) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('surprise');
        setSearchParams(nextParams, { replace: true });
        handleSurpriseChoice();
    }, [appConfig.showRandomChoiceButton, handleSurpriseChoice, searchParams, setSearchParams, surpriseCandidates.length]);


    const buildCarouselSearchLink = useCallback((type: 'lists' | 'places' | 'users' | 'items', sort?: string) => {
        const params = new URLSearchParams({ type });
        if (sort) {
            params.set('sort', sort);
        }
        if ((type === 'places' || type === 'items') && range !== null) {
            params.set('geo', '1');
            params.set('radius', String(Math.round(range * 1000)));
        }
        return `/search?${params.toString()}`;
    }, [range]);

    // Ranking de platos: cada plato (sitio + nombre) con su media y nº de reseñas.
    // «Platos» solo con listas de comida: una playa no es un plato.
    const nonDishListIds = useMemo(() => new Set(
        lists.filter((l: any) => typeof l.categoryId === 'string' && l.categoryId && l.categoryId !== FOOD_CATEGORY_ID).map((l: any) => l.id as string),
    ), [lists]);

    const rankedDishes = useMemo<RankingRow[]>(() => {
        const groups = new Map<string, { row: RankingRow; sum: number; count: number; friendScore: number }>();
        const following = new Set(followingIds);
        // «Tu colega X le dio un 9»: la mejor nota de alguien a quien sigues.
        const noteFriend = (group: { row: RankingRow; friendScore: number }, r: { userId?: string; authorId?: string; authorName?: string; userName?: string; overallRating: number }) => {
            const uid = r.userId || r.authorId;
            if (!uid || uid === user?.uid || !following.has(uid) || r.overallRating <= group.friendScore) return;
            const name = String(r.authorName || r.userName || '').trim();
            if (!name) return;
            group.friendScore = r.overallRating;
            group.row.friendNote = `Tu colega ${name} le dio un ${Number(r.overallRating.toFixed(1)).toLocaleString('es-ES')}`;
        };
        reviewsInRange.forEach((r: any) => {
            if (!r.placeId || typeof r.overallRating !== 'number' || !Number.isFinite(r.overallRating)) return;
            if (r.visibility && r.visibility !== 'public') return;
            if (isPermanentlyClosed(r.placeClosedStatus)) return;
            if (r.listId && nonDishListIds.has(r.listId)) return;
            const name = String(r.itemName || '').trim();
            if (!name || isJunkName(name)) return;
            const key = `${r.placeId}::${name.toLowerCase()}`;
            const existing = groups.get(key);
            if (existing) {
                existing.sum += r.overallRating;
                existing.count += 1;
                if (!existing.row.imageUrl && (r.photoUrl || r.placeMainImage)) existing.row.imageUrl = r.photoUrl || r.placeMainImage;
                noteFriend(existing, r);
                return;
            }
            const lat = r.placeLat || r.lat;
            const lng = r.placeLng || r.lng;
            const group = {
                sum: r.overallRating,
                count: 1,
                friendScore: -1,
                row: {
                    key,
                    to: `/group/${r.placeId}/${encodeURIComponent(name)}`,
                    title: name,
                    subtitle: r.placeName && r.placeName !== name ? r.placeName : (r.placeCity || undefined),
                    imageUrl: r.photoUrl || r.placeMainImage || undefined,
                    score: null,
                    distanceLabel: location && lat && lng ? formatDistance(calculateDistance(lat, lng)) : undefined,
                } as RankingRow,
            };
            noteFriend(group, r);
            groups.set(key, group);
        });
        return Array.from(groups.values())
            .map((g) => ({ ...g, average: g.sum / g.count }))
            .sort((a, b) => compareByRank({ average: a.average, count: a.count }, { average: b.average, count: b.count }))
            .slice(0, 10)
            .map((g) => ({ ...g.row, score: g.average, count: g.count }));
    }, [reviewsInRange, followingIds, user?.uid, location, calculateDistance, nonDishListIds]);

    const rankedPlaces = useMemo<RankingRow[]>(() => filteredPlaces.slice(0, 10).map((place: any) => ({
        key: place.id,
        to: `/place/${place.id}`,
        title: place.name || 'Sitio',
        subtitle: place.address?.split(',')[0] || undefined,
        imageUrl: place.photoUrl || undefined,
        score: typeof place.rating === 'number' ? place.rating : null,
        count: place.placeReviewsCount ?? place.reviewsCount,
        distanceLabel: location && place.lat && place.lng ? formatDistance(calculateDistance(place.lat, place.lng)) : undefined,
    })), [filteredPlaces, location, calculateDistance]);

    const homeFeeds = useMemo(() => buildHomeFeeds({
        reviews: reviewsInRange as unknown as HomeFeedReview[],
        // Los sitios sacados de reseñas los reconstruye homeFeeds con reseñas ya limpias.
        places: filteredPlaces.filter((place: { fromReviews?: boolean }) => !place.fromReviews),
        lists,
        users: topUsers,
        botUserIds,
        seed: feedSeed,
        areaKey: homeFeedAreaKey(areaFilter, range),
        userId: user?.uid ?? null,
        memories: memoriesInRange as unknown as HomeFeedReview[],
        only: VISIBLE_HOME_FEEDS,
        // Lo que ya enseña el ranking (top 5 de cada pestaña) no se repite abajo.
        exclude: {
            placeIds: rankedPlaces.slice(0, 5).map((row) => row.key),
            dishKeys: rankedDishes.slice(0, 5).map((row) => row.key),
        },
    }), [reviewsInRange, filteredPlaces, lists, topUsers, botUserIds, feedSeed, areaFilter, range, user?.uid, memoriesInRange, rankedPlaces, rankedDishes]);
    const firstName = (user?.displayName || '').trim().split(/\s+/)[0];
    const greeting = user ? `Hola${firstName ? `, ${firstName}` : ''}` : 'Bienvenido a Listopic';

    return (
        <>
            <div className="min-h-screen bg-[var(--lt-bg)] pb-20 font-sans">
                <div className="pt-safe-24 px-4 pb-6">

                    {/* Cabecera: saludo, frase con gancho y buscador */}
                    <div className="max-w-4xl mx-auto pt-2 sm:pt-6 relative z-10">
                        <div className="absolute -top-16 right-0 w-72 h-72 rounded-full blur-[90px] pointer-events-none -z-10 opacity-80" style={{ backgroundColor: 'var(--lt-accent-soft)' }} />
                        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--lt-text)]">
                            {user ? `${greeting} 👋` : greeting}
                        </h1>
                        {/* Con sesión basta el saludo; sin sesión, la frase en una línea pequeña. */}
                        {!user && <p className="mt-0.5 text-sm font-medium text-[var(--lt-text-muted)] [text-wrap:balance]">
                            {parsedHeroSubtitle.map((segment) => (
                                segment.isHighlight ? (
                                    <span key={segment.key} className={segment.className}>
                                        {segment.text}
                                    </span>
                                ) : (
                                    <React.Fragment key={segment.key}>{segment.text}</React.Fragment>
                                )
                            ))}
                        </p>}
                        <form
                            role="search"
                            onSubmit={(event) => {
                                event.preventDefault();
                                const q = homeSearch.trim();
                                navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
                            }}
                            className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] pl-4 pr-1.5 py-1.5 backdrop-blur-xl transition-colors focus-within:border-[var(--lt-accent-border)]"
                        >
                            <Search className="w-5 h-5 shrink-0 text-[var(--lt-accent)]" aria-hidden="true" />
                            <label htmlFor="home-search" className="sr-only">Buscar en Listopic</label>
                            <input
                                id="home-search"
                                type="search"
                                enterKeyHint="search"
                                autoComplete="off"
                                value={homeSearch}
                                onChange={(event) => setHomeSearch(event.target.value)}
                                placeholder="Busca platos, sitios o listas"
                                className="min-w-0 flex-1 bg-transparent py-2 text-sm sm:text-base text-[var(--lt-text)] placeholder:text-[var(--lt-text-muted)] outline-none"
                            />
                            <button
                                type="submit"
                                className="shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold lt-on-accent transition-opacity hover:opacity-90"
                                style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                            >
                                Buscar
                            </button>
                        </form>
                    </div>

                    {/* Navigation Pills */}
                    <div className="max-w-4xl mx-auto flex flex-col items-center mt-6 gap-3">
                        <div className="inline-flex bg-white/5 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-inner">
                            <button
                                onClick={() => setActiveTab('explore')}
                                className={`relative px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${activeTab === 'explore'
                                    ? 'text-white scale-100'
                                    : 'text-gray-400 hover:text-white hover:bg-white/10 scale-[0.98]'
                                    }`}
                                style={activeTab === 'explore' ? { backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 4px 14px 0 var(--lt-accent-shadow)' } : undefined}
                            >
                                Explorar
                            </button>
                            <button
                                onClick={() => setActiveTab('news')}
                                className={`relative px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${activeTab === 'news'
                                    ? 'text-white scale-100'
                                    : 'text-gray-400 hover:text-white hover:bg-white/10 scale-[0.98]'
                                    }`}
                                style={activeTab === 'news' ? { backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 4px 14px 0 var(--lt-accent-shadow)' } : undefined}
                            >
                                Novedades
                            </button>
                        </div>
                        {activeTab === 'news' && (
                            <div className="flex w-full justify-end">
                                <div className="flex bg-black/20 rounded-xl p-0.5 border border-white/10">
                                <button
                                    onClick={() => setFeedViewMode('full')}
                                    className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${feedViewMode === 'full' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                    title="Vista detallada"
                                >
                                    <Rows3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setFeedViewMode('list')}
                                    className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${feedViewMode === 'list' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                    title="Vista lista"
                                >
                                    <ListIcon className="w-3.5 h-3.5" />
                                </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {homeContentLoading && (
                        <div className="mt-4 flex justify-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-[var(--lt-card-strong)]/90 text-sm text-gray-300">
                                <Loader2 className="w-4 h-4 text-[var(--lt-accent)] animate-spin" />
                                <span>{HOME_LOADING_MESSAGES[loadingMessageIndex]}</span>
                            </div>
                        </div>
                    )}

                    {/* Map Collapsible */}
                    {activeTab === 'explore' && (
                        <div className="max-w-4xl mx-auto mt-6">
                            <div className="bg-[var(--lt-card)] border border-[var(--lt-border)] rounded-2xl overflow-hidden backdrop-blur-xl transition-all duration-300">
                                <div className="w-full p-3 flex items-center justify-between text-[var(--lt-text-muted)]">
                                    <button
                                        onClick={() => setIsMapOpen(true)}
                                        className="flex items-center gap-2 hover:text-white transition-colors shrink-0 text-left"
                                    >
                                        <MapIcon className="w-5 h-5 text-gray-400" />
                                        <span className="font-bold text-sm">Mapa</span>
                                    </button>

                                    <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0 flex-1 ml-2">
                                        <AreaSelect
                                            value={areaFilter.kind === 'near' ? `r:${(location && range) || 'all'}` : encodeArea(areaFilter)}
                                            range={range}
                                            options={areaOptions}
                                            onChange={handleAreaSelect}
                                            onExplore={() => navigate(exploreSearchUrl({ zone: areaFilter.kind === 'near' ? null : { level: areaFilter.kind, value: areaFilter.value } }))}
                                        />

                                        <button
                                            onClick={() => setIsMapOpen(true)}
                                            className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-white transition-colors whitespace-nowrap shrink-0" aria-label="Ver mapa"
                                        >
                                            <span className="hidden sm:inline">Ver mapa</span>
                                            <Maximize2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/* A pantalla completa: solo se monta (y descarga Leaflet) cuando se abre. */}
                            <FullMapModal
                                isOpen={isMapOpen}
                                onClose={() => setIsMapOpen(false)}
                                title={areaFilter.kind === 'near' ? 'Cerca de ti' : areaFilter.value}
                                subtitle={`${filteredPlaces.length} ${filteredPlaces.length === 1 ? 'sitio' : 'sitios'}${areaFilter.kind === 'near' && range && location ? ` a menos de ${range} km` : ''}`}
                                items={filteredPlaces}
                                range={areaFilter.kind === 'near' && location ? range : null}
                            />
                        </div>
                    )}

                    {/* Aviso cuando la Home ha ampliado el radio porque cerca había poco */}
                    {activeTab === 'explore' && widenedRange !== undefined && chosenRange !== null && (
                        <p className="max-w-4xl mx-auto mt-2 px-1 text-xs font-medium text-[var(--lt-text-muted)]">
                            🔭 Poco a {formatRangeKm(chosenRange)}: te enseño hasta {widenedRange === null ? 'cualquier distancia' : formatRangeKm(widenedRange)}.
                        </p>
                    )}

                    {/* Duelo de la semana (flag en Developer → Otros) */}
                    {activeTab === 'explore' && appConfig.showWeeklyDuel && <WeeklyDuelBanner />}

                    {/* Destacados patrocinados (Business Pro, aprobados por admin) */}
                    {activeTab === 'explore' && <SponsoredHomeSpotlight />}
                    {activeTab === 'explore' && <SponsoredItemsCarousel className="mx-auto mt-6 w-full max-w-4xl" />}

                    {/* Portada y ranking: lo primero que se ve al bajar */}
                    {activeTab === 'explore' && (
                        <div className="max-w-4xl mx-auto mt-6 mb-8 space-y-8">
                            <HomeRanking
                                dishes={rankedDishes}
                                places={rankedPlaces}
                                dishesLink={buildCarouselSearchLink('items', 'top_rated')}
                                placesLink={buildCarouselSearchLink('places', 'rating')}
                                loading={loadingReviews}
                            />
                        </div>
                    )}

                    <div className="max-w-[95%] mx-auto space-y-1">


                        {activeTab === 'explore' && (<>
                            {/* Carruseles nuevos (lib/homeFeeds): en tu zona y rotando cada día. */}
                            {homeFeeds.feeds.filter((feed) => HOME_FEEDS_VISIBLE[feed.id] ?? false).map((feed) => {
                                const look = HOME_FEED_LOOK[feed.id] ?? HOME_FEED_LOOK.default;
                                return (
                                    <CardCarousel
                                        key={feed.id}
                                        title={feed.title}
                                        viewAllLink={feed.viewAllTo ?? buildCarouselSearchLink(look.searchType, look.searchSort)}
                                        items={feed.items}
                                        itemClassName="w-auto"
                                        icon={look.icon}
                                        accentClass={look.accentClass}
                                        renderItem={(card: HomeFeedCardData) => <HomeFeedCard card={card} />}
                                    />
                                );
                            })}

                            {homeFeeds.featuredList && (
                                <div className="max-w-4xl mx-auto pt-6">
                                    <FeaturedListCard list={homeFeeds.featuredList} />
                                </div>
                            )}

                            {/* 1. Listas */}
                            {SHOW_LEGACY_HOME_CAROUSELS && <CardCarousel
                                title={activeTab === 'explore' ? "Más listas con movimiento" : "Listas recientes"}
                                viewAllLink={buildCarouselSearchLink('lists', activeTab === 'explore' ? 'most_reviewed' : 'latest')}
                                items={activeTab === 'explore'
                                    ? listCarouselItems.slice(1)
                                    : filteredLists}
                                loading={(loadingLists || loadingReviews) && (activeTab === 'explore' ? listCarouselItems.length <= 1 : filteredLists.length === 0)}
                                icon={<ListIcon className="w-5 h-5 text-blue-400" />}
                                accentClass="bg-blue-500/20"
                                renderItem={(list: any, index: number) => (
                                    <Link to={`/list/${list.id}`} className="lt-media-card block relative group h-40 md:h-48 rounded-md overflow-hidden border border-white/5 shadow-lg transition-all duration-300 transform hover:scale-105 hover:z-10 origin-center">
                                        {(list.thumbnailUrl || list.mainImageUrl || list.photoUrl || list.coverUrl || list.imageUrl) ? (
                                            <div className="absolute inset-0">
                                                <ProgressiveImage src={list.thumbnailUrl || list.mainImageUrl || list.photoUrl || list.coverUrl || list.imageUrl} alt={list.name} containerClassName="w-full h-full" className="w-full h-full object-cover" />
                                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full bg-zinc-800" />
                                        )}

                                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm" title="Total de lugares en la lista">
                                            {list.itemCount}
                                        </div>
                                        <div className="absolute top-2 left-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                            #{index + 2}
                                        </div>

                                        <div className="absolute bottom-0 left-0 right-0 p-3">
                                            <h3 className="text-white font-bold text-sm leading-tight mb-1 drop-shadow-sm line-clamp-1">{list.name}</h3>

                                            {/* Stats Row: Reviews, Followers */}
                                            <div className="flex items-center gap-4 opacity-90 text-xs text-gray-300 font-medium">
                                                <div className="flex items-center gap-1.5" title="Reseñas dentro de tu rango de distancia">
                                                    <MessageCircle className="w-3.5 h-3.5 text-[var(--lt-accent)]" />
                                                    <span>{list.reviewsInRangeCount !== undefined ? list.reviewsInRangeCount : (list.reviewCount || list.reviewsCount || 0)}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5" title="Seguidores de la lista">
                                                    <Users className="w-3.5 h-3.5 text-rose-400" />
                                                    <span>{list.followersCount || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                )}
                            />}

                            {/* 2b. Joyas ocultas */}
                            {SHOW_LEGACY_HOME_CAROUSELS && <CardCarousel
                                title="Joyas ocultas"
                                subtitle="Buena nota y pocas reseñas."
                                viewAllLink={buildCarouselSearchLink('places', 'rating')}
                                items={hiddenGemPlaces}
                                loading={loadingReviews}
                                icon={<Gem className="w-5 h-5 text-emerald-300" />}
                                accentClass="bg-emerald-500/20"
                                itemClassName="w-[calc(100vw-2rem)] min-w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] md:w-auto md:min-w-[270px] md:max-w-none"
                                renderItem={(place: any) => {
                                    const placeId = place.placeId || place.id;
                                    return (
                                        <Link
                                            to={`/place/${placeId}`}
                                            className="group block h-44 sm:h-48 md:h-56 rounded-md overflow-hidden border border-emerald-300/15 bg-[var(--lt-card-strong)] shadow-lg transition-all duration-300 hover:scale-105 hover:border-emerald-300/40 hover:shadow-emerald-500/10"
                                        >
                                            <div className="relative h-full">
                                                {place.photoUrl ? (
                                                    <ProgressiveImage
                                                        src={place.photoUrl}
                                                        alt={place.name}
                                                        containerClassName="absolute inset-0"
                                                        className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0">
                                                        <PlacePhotoPlaceholder />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                                                <div className="absolute left-2.5 top-2.5 rounded-full border border-emerald-200/30 bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-100 backdrop-blur sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]">
                                                    Joya oculta
                                                </div>
                                                <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-black text-white backdrop-blur sm:right-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-xs">
                                                    <Star className="w-3 h-3 fill-amber-300 text-amber-300 sm:w-3.5 sm:h-3.5" />
                                                    {place.rating.toFixed(1)}
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                                                    <h3 className="line-clamp-1 text-sm font-black leading-tight text-white drop-shadow sm:line-clamp-2 sm:text-base">
                                                        {place.name || 'Sitio por descubrir'}
                                                    </h3>
                                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-gray-200 sm:mt-2 sm:gap-2 sm:text-xs">
                                                        <span>{place.reviewsCount} {place.reviewsCount === 1 ? 'reseña' : 'reseñas'}</span>
                                                        {place.distanceKm !== null && (
                                                            <>
                                                                <span className="text-gray-500">·</span>
                                                                <span>{place.distanceKm.toFixed(place.distanceKm < 10 ? 1 : 0)} km</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    {place.address && (
                                                        <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400 sm:mt-1 sm:text-xs">
                                                            {place.address}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                }}
                            />}

                            {/* 3. Reseñas Recientes */}
                            {SHOW_LEGACY_HOME_CAROUSELS && <CardCarousel
                                title="Reseñas recientes"
                                viewAllLink={buildCarouselSearchLink('items', 'latest')}
                                items={recentReviewsInRange}
                                loading={loadingReviews}
                                icon={<Clock className="w-5 h-5 text-cyan-400" />}
                                accentClass="bg-cyan-500/20"
                                renderItem={(item: any) => (
                                    <ReviewCarouselItem review={item} variant="review" />
                                )}
                            />}

                            {appConfig.showAffinityCarousel && (
                                <CardCarousel
                                    title="Almas gemelas"
                                    subtitle="Perfiles que puntuan parecido a ti."
                                    viewAllLink={buildCarouselSearchLink('users')}
                                    items={affinityUsers}
                                    loading={loadingUsers || loadingOwnTaste}
                                    itemClassName="min-w-[220px] md:min-w-[250px]"
                                    icon={<HeartHandshake className="w-5 h-5 text-pink-300" />}
                                    accentClass="bg-pink-500/20"
                                    renderItem={(u: any) => (
                                        <Link
                                            to={`/profile/${u.uid}`}
                                            className="block h-36 rounded-md border border-pink-300/15 bg-[var(--lt-card-strong)] p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:border-pink-300/40 hover:bg-white/[0.06]"
                                        >
                                            <div className="flex items-start gap-3">
                                                <UserAvatar
                                                    photoUrl={u.photoUrl}
                                                    displayName={u.displayName}
                                                    userType={u.userType}
                                                    size="lg"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <h4 className="truncate text-sm font-black text-white">{u.displayName || 'Usuario'}</h4>
                                                            <p className="truncate text-[11px] text-gray-500">@{u.username || 'user'}</p>
                                                        </div>
                                                        <span className="shrink-0 rounded-full bg-pink-500/20 px-2 py-1 text-[10px] font-black text-pink-100">
                                                            {u.affinityScore}%
                                                        </span>
                                                    </div>
                                                    <p className="mt-3 line-clamp-2 text-xs font-semibold leading-snug text-gray-300">
                                                        {u.affinityReason}
                                                    </p>
                                                    <p className="mt-2 text-[10px] font-bold text-[var(--lt-accent)]">
                                                        {u.reviewsInRangeCount ?? 0} {u.reviewsInRangeCount === 1 ? 'reseña' : 'reseñas'} en el radar
                                                    </p>
                                                </div>
                                            </div>
                                        </Link>
                                    )}
                                />
                            )}

                            {appConfig.showAffinityCarousel && soulmateCards.length > 0 && (
                                <CardCarousel
                                    title="Les encantó"
                                    subtitle="Platos top de tus almas gemelas."
                                    viewAllLink={buildCarouselSearchLink('users')}
                                    items={soulmateCards}
                                    itemClassName="w-auto"
                                    icon={<HeartHandshake className="w-5 h-5 text-pink-300" />}
                                    accentClass="bg-pink-500/20"
                                    renderItem={(card: HomeFeedCardData) => <HomeFeedCard card={card} />}
                                />
                            )}

                            {/* 5. Usuarios activos */}
                            {SHOW_LEGACY_HOME_CAROUSELS && <CardCarousel
                                title="Usuarios activos"
                                viewAllLink={buildCarouselSearchLink('users')}
                                items={activeUsersInRange}
                                loading={loadingUsers}
                                itemClassName="w-auto mr-3"
                                icon={<TrendingUp className="w-5 h-5 text-[var(--lt-accent-2)]" />}
                                accentClass="bg-[var(--lt-accent-soft)]"
                                renderItem={(u: any) => (
                                    <Link to={`/profile/${u.uid}`} className="flex flex-col items-center gap-1 group p-2 rounded-md hover:bg-white/5 transition-colors w-24 md:w-32 shrink-0">
                                        <UserAvatar
                                            photoUrl={u.photoUrl}
                                            displayName={u.displayName}
                                            userType={u.userType}
                                            size="lg"
                                        />
                                        <div className="text-center w-full mt-1">
                                            <h4 className="text-white font-bold text-xs truncate w-full">{u.displayName}</h4>
                                            <p className="text-gray-500 text-[10px] truncate">@{u.username || 'user'}</p>
                                            <p className="text-[9px] text-[var(--lt-accent)] font-medium mt-0.5">
                                                {u.reviewsInRangeCount ?? 0} Reseñas
                                            </p>
                                        </div>
                                    </Link>
                                )}
                            />}

                        </>)}


                        {/* 5. Resenas / Feed */}
                        {activeTab === 'news' ? (
                            <div className="max-w-2xl mx-auto mt-12 pb-20">
                                {(loadingReviews && filteredItems.length === 0) ? (
                                    <div className="flex justify-center py-16">
                                        <Loader2 className="w-6 h-6 text-[var(--lt-accent)] animate-spin" />
                                    </div>
                                ) : filteredItems.length === 0 ? (
                                    <div className="text-gray-500 py-10 border border-white/5 rounded-xl bg-white/5 mx-4 px-4">
                                        <p className="font-bold text-white mb-1 text-center">Tu feed está tranquilo</p>
                                        <p className="text-sm text-center mb-4">Sigue a estas personas para ver sus reseñas aquí</p>
                                        {topUsers.length > 0 && !loadingUsers && (
                                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                                {topUsers
                                                    .filter((topUser: any) => topUser.uid !== user?.uid)
                                                    .slice(0, 5)
                                                    .map((topUser: any) => (
                                                        <Link
                                                            key={topUser.uid}
                                                            to={`/profile/${topUser.uid}`}
                                                            className="bg-white/5 border border-white/10 rounded-xl p-3 text-center w-28 shrink-0 hover:bg-white/10 transition-colors"
                                                        >
                                                            {topUser.photoURL ? (
                                                                <ProgressiveImage
                                                                    src={topUser.photoURL}
                                                                    alt={topUser.displayName || topUser.username || '?'}
                                                                    containerClassName="w-12 h-12 rounded-full mx-auto mb-2 overflow-hidden"
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: 'var(--lt-accent)' }}>
                                                                    {(topUser.displayName || topUser.username || '?')[0].toUpperCase()}
                                                                </div>
                                                            )}
                                                            <p className="text-white text-xs font-semibold truncate">
                                                                {topUser.displayName || topUser.username || 'Usuario'}
                                                            </p>
                                                            <p className="text-gray-500 text-[10px] mt-0.5">
                                                                {topUser.followersCount ?? 0} seguidores
                                                            </p>
                                                        </Link>
                                                    ))}
                                            </div>
                                        )}
                                        <div className="text-center mt-4">
                                            <Link to="/search?type=lists" className="text-xs text-[var(--lt-accent)] hover:opacity-80 transition-opacity">
                                                Explorar listas →
                                            </Link>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={feedViewMode === 'list' ? 'flex flex-col gap-3' : 'space-y-5 sm:space-y-8'} key="feed">
                                        {filteredItems.slice(0, visibleCount).map((review: any) => (
                                            feedViewMode === 'list'
                                                ? <ReviewCardList key={review.id} review={review} />
                                                : <ReviewCard key={review.id} review={review} />
                                        ))}
                                        {(visibleCount < filteredItems.length || hasMore) && (
                                            <div ref={loadMoreRef} className="py-8 flex justify-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent)]"></div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : SHOW_LEGACY_HOME_CAROUSELS ? (

                            <CardCarousel
                                title="Reseñas que gustan"
                                viewAllLink={buildCarouselSearchLink('items', 'top_liked')}
                                items={carouselReviews}
                                loading={loadingReviews}
                                itemClassName="w-auto"
                                icon={<Star className="w-5 h-5 text-rose-400" />}
                                accentClass="bg-rose-500/20"
                                renderItem={(review: any) => (
                                    <ReviewCarouselItem review={review} />
                                )}
                            />
                        ) : null}

                    </div>
                </div>

                {/* Profile gate — overlay modal, solo aparece si el username es realmente inválido */}
                {user && showProfileGate && profileGateVisible && gateChecked && gateResolvedForUserId === user.uid && (
                    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-12">
                        <div className="w-full max-w-2xl bg-[var(--lt-card-strong)] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
                            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Completa tu perfil</h2>
                            <p className="text-gray-400 text-sm mb-6">
                                Antes de continuar necesitas un username válido.
                            </p>

                            <form onSubmit={handleCompleteProfileSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                        Username (obligatorio)
                                    </label>
                                    <input
                                        type="text"
                                        value={gateForm.username}
                                        onChange={(e) => handleGateFieldChange('username', e.target.value)}
                                        maxLength={USERNAME_MAX_LENGTH}
                                        required
                                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                        placeholder="sin espacios, máximo 18"
                                    />
                                    <p className="text-[11px] text-amber-300 mt-2">
                                        El username es único, no puede tener espacios y no se podrá cambiar después.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                            Display Name
                                        </label>
                                        <input
                                            type="text"
                                            value={gateForm.displayName}
                                            onChange={(e) => handleGateFieldChange('displayName', e.target.value)}
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                            placeholder="por defecto será el username"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                            Nombre
                                        </label>
                                        <input
                                            type="text"
                                            value={gateForm.name}
                                            onChange={(e) => handleGateFieldChange('name', e.target.value)}
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                            placeholder="opcional"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                            Apellidos
                                        </label>
                                        <input
                                            type="text"
                                            value={gateForm.surnames}
                                            onChange={(e) => handleGateFieldChange('surnames', e.target.value)}
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                            placeholder="opcional"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                            Lugar
                                        </label>
                                        <input
                                            type="text"
                                            value={gateForm.location}
                                            onChange={(e) => handleGateFieldChange('location', e.target.value)}
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                            placeholder="opcional"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                                        Biografía
                                    </label>
                                    <textarea
                                        value={gateForm.bio}
                                        onChange={(e) => handleGateFieldChange('bio', e.target.value)}
                                        rows={4}
                                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                        placeholder="opcional"
                                    />
                                </div>

                                {gateError && (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-200">
                                        {gateError}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={gateSubmitting}
                                    className="w-full py-3 rounded-xl text-white font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2" style={{ backgroundColor: 'var(--lt-accent)' }}
                                >
                                    {gateSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Guardar y continuar
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div >
            <Footer />
        </>
    );
};
