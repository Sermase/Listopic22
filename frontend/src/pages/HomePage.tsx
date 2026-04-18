import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getExpandedRangeValue, useFilters } from '../context/FilterContext';
import { useLists } from '../hooks/useLists';
import { useUsers } from '../hooks/useUsers';
import { useReviews } from '../hooks/useReviews';
import { ReviewCard } from '../components/ReviewCard';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { ReviewCarouselItem } from '../components/ReviewCarouselItem';
import { CardCarousel } from '../components/CardCarousel';
import { MapView } from '../components/MapView';
import { UserAvatar } from '../components/UserAvatar';
import { Map as MapIcon, ChevronDown, MapPin, List as ListIcon, MessageCircle, Users, Loader2, Dice5, Star, Clock, Flame, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocation } from '../hooks/useLocation';
import { collection, query, getDocs, limit, doc, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { useToast } from '../context/ToastContext';
import { useAppConfig } from '../context/AppConfigContext';
import { Footer } from '../components/Footer';
import {
    completeUserProfileSetup,
    getUsernameGateStatus,
    isUserProfileServiceError,
    type UserProfileFormData,
} from '../services/UserProfileService';
import { USERNAME_MAX_LENGTH, isUsernameValid } from '../utils/username';

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
const HERO_HIGHLIGHT_STYLES = ['text-indigo-400', 'text-purple-400', 'text-cyan-300'] as const;
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

export const HomePage: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const appConfig = useAppConfig();
    const { location, calculateDistance, requestLocation } = useLocation();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // UI State
    const [activeTab, setActiveTab] = useState<'explore' | 'news'>('explore');
    const [activeFilter, setActiveFilter] = useState('Todo'); // Category Filter

    // Global Distance Range State
    const { range, setRange, toggleRange, getRangeLabel } = useFilters();

    const [isMapOpen, setIsMapOpen] = useState(false);
    const [gateLoading, setGateLoading] = useState(true);
    const [showProfileGate, setShowProfileGate] = useState(false);
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
                    setGateError(null);
                }
                return;
            }

            setGateResolvedForUserId(null);
            setGateChecked(false);
            setShowProfileGate(false);
            setGateLoading(true);
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
                if (status.requiresCompletion && status.reason === 'claim_conflict') {
                    setGateError('Ese nombre de usuario ya está ocupado. Elige otro para continuar.');
                } else {
                    setGateError(null);
                }
            } catch (error) {
                if (cancelled) return;
                console.error('[HomePage] Error validating username gate:', error);
                setShowProfileGate(false);
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

        const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Record<string, unknown>;
            const candidateUsername = typeof data.username === 'string' ? data.username.trim() : '';
            if (isUsernameValid(candidateUsername)) {
                setShowProfileGate(false);
                setGateError(null);
            }
        });

        return () => unsubscribe();
    }, [user?.uid, showProfileGate]);

    useEffect(() => {
        if (!user || !showProfileGate || gateLoading) {
            setProfileGateVisible(false);
            return;
        }

        const timer = window.setTimeout(() => {
            setProfileGateVisible(true);
        }, 220);

        return () => {
            window.clearTimeout(timer);
        };
    }, [user?.uid, showProfileGate, gateLoading]);

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
    useEffect(() => {
        if (!user) return;
        const fetchFollowing = async () => {
            const q = query(collection(db, 'users', user.uid, 'following'));
            const snap = await getDocs(q);
            setFollowingIds(snap.docs.map(d => d.id));
        };
        fetchFollowing();
    }, [user]);

    // Infinite Scroll / Pagination
    const [visibleCount, setVisibleCount] = useState(4);
    const loadMoreRef = React.useRef<HTMLDivElement>(null);

    // --- DATA FETCHING (Dynamic based on Tab) ---
    // Explore -> Top Rated/Trending; News -> Following
    const listSort = activeTab === 'explore' ? 'top_rated' : 'recent'; // Lists still use 'recent' for news

    const reviewSortParam = useMemo(() => {
        console.log(`[HomePage] Building reviewSortParam. Tab: ${activeTab}, followingIds length: ${followingIds.length}`);
        if (activeTab === 'explore') {
            const months = appConfig.homeReviewsMonths;
            if (months > 0) {
                const sinceDate = new Date();
                sinceDate.setMonth(sinceDate.getMonth() - months);
                return { type: 'trending' as const, sinceDate };
            }
            return { type: 'trending' as const, limit: 1000 }; // 0 meses = sin límite temporal, cota de seguridad
        }
        return { type: 'following' as const, followingIds, limit: 10 };
    }, [activeTab, followingIds, appConfig.homeReviewsMonths]);

    const { lists, loading: loadingLists } = useLists(listSort);
    const { reviews, loading: loadingReviews, fetchMore, hasMore, loadingMore } = useReviews(reviewSortParam);

    const [botUserIds, setBotUserIds] = useState<Set<string>>(new Set());
    useEffect(() => {
        const fetchBots = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'users'), where('userType', 'array-contains', 'bot')));
                setBotUserIds(new Set(snap.docs.map(d => d.id)));
            } catch {
                // non-blocking
            }
        };
        fetchBots();
    }, []);
    const fetchMoreRef = React.useRef(fetchMore);
    const { users: topUsers, loading: loadingUsers } = useUsers();
    const homeContentLoading = loadingLists || loadingReviews || loadingUsers;

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
    const checkCategory = (item: any) => {
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
    };

    // 2. Helper: Check Distance
    const checkDistance = (lat?: number, lng?: number) => {
        if (!range || !location || !lat || !lng) return true;
        const dist = calculateDistance(lat, lng);
        if (dist === null) return true;
        return dist <= range;
    };

    // 3. Derived & Filtered Lists
    const filteredLists = useMemo(() => {
        return lists.filter(l => {
            const matchesCategory = checkCategory(l);
            const matchesDist = checkDistance(l.lat, l.lng);
            return matchesCategory && matchesDist;
        });
    }, [lists, activeFilter, range, location]);

    // 4. Derived & Filtered Items (Reviews)
    // We need the FULL list for calcs, not just the sliced one for display
    const reviewsInRange = useMemo(() => {
        return reviews.filter(r => {
            const uid = (r as any).userId || (r as any).authorId;
            if (uid && botUserIds.has(uid)) return false;
            const matchesCategory = checkCategory(r);
            const lat = (r as any).placeLat || (r as any).lat;
            const lng = (r as any).placeLng || (r as any).lng;
            const matchesDist = checkDistance(lat, lng);
            return matchesCategory && matchesDist;
        });
    }, [reviews, activeFilter, range, location, botUserIds]);

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

        // "Mejor en Listopic" (Best Rated items/reviews in range)
        return base
            .sort((a, b) => (b.placeAverageRating || b.overallRating || 0) - (a.placeAverageRating || a.overallRating || 0))
            .slice(0, 15);
    }, [reviewsInRange, activeTab]);

    // 4b. Carousel Reviews (Specific Logic: Last 2 Months + Top Liked + Filtered by Range/Cat)
    const carouselReviews = useMemo(() => {
        // "Reseñas que gustan" (Trending/Liked in range)
        return reviewsInRange
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
    // Fetch actual places from 'places' collection to populate Map beyond just Feed items
    const [extraPlaces, setExtraPlaces] = useState<any[]>([]);
    const [placesLimit, setPlacesLimit] = useState(20); // Start small for speed

    useEffect(() => {
        // Upgrade to full fetch after initial render (Background Loading)
        const timer = setTimeout(() => {
            setPlacesLimit(100);
        }, 2000); // Wait 2s to allow main content to settle
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const fetchExtraPlaces = async () => {
            try {
                // Fetch top rated and recent places to ensure map is populated
                // Note: Real geo-querying would be better, but for now we fetch a healthy batch
                const q = query(collection(db, 'places'), limit(placesLimit));
                const snap = await getDocs(q);

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
                        rating: data.averageRating || data.googleRating || 0,
                        reviewsCount: data.reviewsCount || 0,
                        closedStatus: data.closedStatus || null,
                        lat, lng,
                        items: [] // No specific items for these unless we fetch subcollections
                    };
                }).filter(p => p.lat && p.lng && p.reviewsCount > 0 && p.closedStatus !== 'permanently_closed'); // Only places with location AND reviews, exclude permanently closed

                setExtraPlaces(mapped);
            } catch (e) {
                console.error("Error fetching map places:", e);
            }
        };

        if (activeTab === 'explore') {
            fetchExtraPlaces();
        }
    }, [activeTab, placesLimit]);

    // 5. Derived Places (Unique from Reviews -> Filtered) + Extra Places
    const filteredPlaces = useMemo(() => {
        const uniquePlaces = new Map();

        // 1. Add places from Reviews (High priority - have rich item data)
        reviewsInRange.forEach(r => {
            if (r.placeId) {
                if (uniquePlaces.has(r.placeId)) {
                    const existing = uniquePlaces.get(r.placeId);
                    existing.reviewsCount = (existing.reviewsCount || 0) + 1;
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
                        reviewsCount: 1,
                        closedStatus: (r as any).placeClosedStatus || null,
                        lat, lng,
                        items: [] // Can populate if needed
                    });
                }
            }
        });

        // 2. Add Extra Places (if not already present, or update photo if missing)
        extraPlaces.forEach(p => {
            if (!uniquePlaces.has(p.id)) {
                // Check distance filter for these too!
                if (checkDistance(p.lat, p.lng)) {
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
            .sort((a, b) => (b.rating || 0) - (a.rating || 0));
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

    useEffect(() => {
        if (activeTab !== 'explore') return;
        if (range === null || !location) return;
        if (loadingReviews) return;
        if (!hasHomeMapCandidates) return;
        if (filteredPlaces.length > 0) return;

        const nextRange = getExpandedRangeValue(range);
        if (nextRange !== range) {
            setRange(nextRange);
        }
    }, [activeTab, range, location, loadingReviews, hasHomeMapCandidates, filteredPlaces.length, setRange]);

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

    }, [reviewsInRange, topUsers, range]);

    // 7. Lists with Range Stats
    const listsWithRangeStats = useMemo(() => {
        // Map lists to attach dynamic review count based on reviewsInRange
        return filteredLists.map(list => {
            // If Range is NULL (Infinite), use the static total count from DB to be accurate
            // regardless of how many reviews we have loaded in memory.
            if (range === null) {
                return {
                    ...list,
                    reviewsInRangeCount: list.reviewCount || 0
                };
            }

            // Otherwise, calculate based on loaded reviews (best effort for specific range)
            const count = reviewsInRange.filter(r => r.listId === list.id).length;
            return {
                ...list,
                reviewsInRangeCount: count
            };
        });
    }, [filteredLists, reviewsInRange, range]);

    const surpriseCandidates = useMemo(() => {
        const candidates: Array<{ route: string; label: string }> = [];

        filteredItems.slice(0, 25).forEach((review: any) => {
            if (review?.placeId && review?.itemName) {
                candidates.push({
                    route: `/group/${review.placeId}/${encodeURIComponent(review.itemName)}`,
                    label: `${review.itemName} · ${review.placeName || 'Grupo'}`,
                });
            }
        });

        filteredPlaces.slice(0, 15).forEach((place: any) => {
            const placeId = place?.placeId || place?.id;
            if (placeId) {
                candidates.push({
                    route: `/place/${placeId}`,
                    label: place?.name || 'Lugar sorpresa',
                });
            }
        });

        listsWithRangeStats.slice(0, 15).forEach((list: any) => {
            if (list?.id) {
                candidates.push({
                    route: `/list/${list.id}`,
                    label: list?.name || 'Lista sorpresa',
                });
            }
        });

        return candidates;
    }, [filteredItems, filteredPlaces, listsWithRangeStats]);

    const handleSurpriseChoice = () => {
        if (surpriseCandidates.length === 0) {
            showToast({
                variant: 'info',
                title: 'Sin opciones por ahora',
                message: 'No hay resultados en este rango. Prueba ampliarlo y volvemos a jugar.',
            });
            return;
        }

        const randomChoice = surpriseCandidates[Math.floor(Math.random() * surpriseCandidates.length)];
        showToast({
            variant: 'info',
            title: 'Modo sorpresa activado',
            message: `Te llevamos a: ${randomChoice.label}`,
            durationMs: 2200,
        });
        navigate(randomChoice.route);
    };


    const handleToggleRange = () => {
        if (!location) {
            requestLocation();
        }
        toggleRange();
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-[var(--lt-bg)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-[var(--lt-bg)] pb-20 font-sans">
                <div className="pt-safe-24 px-4 pb-6">

                    {/* Hero Section (Clean) */}
                    <div className="max-w-4xl mx-auto mb-10 text-center pt-8 relative z-10">
                        <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] animate-blob pointer-events-none -z-10" />
                        <div className="absolute top-10 right-1/4 w-72 h-72 bg-purple-500/20 rounded-full blur-[80px] animate-blob pointer-events-none -z-10" style={{ animationDelay: '2s' }} />
                        <h1 className="text-5xl md:text-[5.5rem] font-black tracking-tighter mb-4 select-none leading-[1.1]">
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 drop-shadow-md">
                                LISTOPIC
                            </span>
                        </h1>
                        <p className="text-lg md:text-2xl text-gray-400 font-light tracking-wide max-w-2xl mx-auto leading-relaxed">
                            {parsedHeroSubtitle.map((segment) => (
                                segment.isHighlight ? (
                                    <span key={segment.key} className={`${segment.className} font-bold`}>
                                        {segment.text}
                                    </span>
                                ) : (
                                    <React.Fragment key={segment.key}>{segment.text}</React.Fragment>
                                )
                            ))}
                        </p>

                    </div>

                    {/* Navigation Pills */}
                    <div className="flex justify-center mt-8 gap-4">
                        <div className="inline-flex bg-white/5 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-inner">
                            <button
                                onClick={() => setActiveTab('explore')}
                                className={`relative px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${activeTab === 'explore'
                                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_4px_14px_0_rgba(99,102,241,0.39)] scale-100'
                                    : 'text-gray-400 hover:text-white hover:bg-white/10 scale-[0.98]'
                                    }`}
                            >
                                Explorar
                            </button>
                            <button
                                onClick={() => setActiveTab('news')}
                                className={`relative px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${activeTab === 'news'
                                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_4px_14px_0_rgba(99,102,241,0.39)] scale-100'
                                    : 'text-gray-400 hover:text-white hover:bg-white/10 scale-[0.98]'
                                    }`}
                            >
                                Novedades
                            </button>
                        </div>
                    </div>

                    {homeContentLoading && (
                        <div className="mt-4 flex justify-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-[var(--lt-card-strong)]/90 text-sm text-gray-300">
                                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                                <span>{HOME_LOADING_MESSAGES[loadingMessageIndex]}</span>
                            </div>
                        </div>
                    )}

                    {/* Filter Chips (Categories) */}
                    <div className="flex flex-wrap justify-between items-center mt-8 gap-4">
                        <div className="flex-1"></div>


                    </div>


                    {/* Map Collapsible */}
                    {activeTab === 'explore' && (
                        <div className="max-w-7xl mx-auto mb-8">
                            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl overflow-hidden transition-all duration-300">
                                <div className="w-full p-3 flex items-center justify-between text-gray-300 bg-[#1e2538]/50">
                                    <button
                                        onClick={() => setIsMapOpen(!isMapOpen)}
                                        className="flex items-center gap-2 hover:text-white transition-colors flex-1 text-left"
                                    >
                                        <MapIcon className="w-5 h-5 text-gray-400" />
                                        <span className="font-bold text-sm">Mapa</span>
                                    </button>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleRange(); }}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border shrink-0 flex items-center gap-1.5 ${range !== null
                                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                                                : 'bg-[var(--lt-bg)] border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                                                }`}
                                        >
                                            <MapPin className="w-3 h-3" />
                                            {getRangeLabel()}
                                        </button>

                                        <button
                                            onClick={() => setIsMapOpen(!isMapOpen)}
                                            className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-white transition-colors"
                                        >
                                            {isMapOpen ? 'Ocultar' : 'Ver Mapa'}
                                            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMapOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isMapOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                    <div className="overflow-hidden min-h-0">
                                        <div className="h-[400px] border-t border-white/10 relative">
                                            <MapView items={filteredPlaces} mode="global" range={range} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="max-w-[95%] mx-auto space-y-1">


                        {activeTab === 'explore' && (<>
                            {/* 1. Listas */}
                            <CardCarousel
                                title={activeTab === 'explore' ? "Listas con más reseñas" : "Listas Recientes"}
                                viewAllLink={`/search?type=lists&sort=${activeTab === 'explore' ? 'most_reviewed' : 'latest'}`}
                                items={activeTab === 'explore'
                                    ? listsWithRangeStats.sort((a, b) => (b.reviewsInRangeCount ?? b.reviewCount ?? 0) - (a.reviewsInRangeCount ?? a.reviewCount ?? 0)).slice(0, 10)
                                    : filteredLists}
                                loading={loadingLists}
                                icon={<ListIcon className="w-5 h-5 text-blue-400" />}
                                accentClass="bg-blue-500/20"
                                renderItem={(list: any, index: number) => (
                                    <Link to={`/list/${list.id}`} className="block relative group h-40 md:h-48 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-10 origin-center">
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
                                            #{index + 1}
                                        </div>

                                        <div className="absolute bottom-0 left-0 right-0 p-3">
                                            <h3 className="text-white font-bold text-sm leading-tight mb-1 drop-shadow-sm line-clamp-1">{list.name}</h3>

                                            {/* Stats Row: Reviews, Followers */}
                                            <div className="flex items-center gap-4 opacity-90 text-xs text-gray-300 font-medium">
                                                <div className="flex items-center gap-1.5" title="Reseñas dentro de tu rango de distancia">
                                                    <MessageCircle className="w-3.5 h-3.5 text-indigo-400" />
                                                    <span>{list.reviewsInRangeCount !== undefined ? list.reviewsInRangeCount : (list.reviewCount || 0)}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5" title="Seguidores de la lista">
                                                    <Users className="w-3.5 h-3.5 text-rose-400" />
                                                    <span>{list.followersCount || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                )}
                            />

                            {/* 2. Items */}
                            <CardCarousel
                                title={activeTab === 'explore' ? "Mejor en Listopic" : "Últimos Items"}
                                viewAllLink={`/search?type=items&sort=${activeTab === 'explore' ? 'top_rated' : 'latest'}`}
                                items={filteredItems}
                                loading={loadingReviews}
                                icon={<Star className="w-5 h-5 text-amber-400" />}
                                accentClass="bg-amber-500/20"
                                renderItem={(item: any) => (
                                    <ReviewCarouselItem review={item} variant="item" />
                                )}
                            />

                            {/* 3. Reseñas Recientes */}
                            <CardCarousel
                                title="Reseñas recientes"
                                viewAllLink="/search?type=items&sort=latest"
                                items={recentReviewsInRange}
                                loading={loadingReviews}
                                icon={<Clock className="w-5 h-5 text-cyan-400" />}
                                accentClass="bg-cyan-500/20"
                                renderItem={(item: any) => (
                                    <ReviewCarouselItem review={item} variant="review" />
                                )}
                            />

                            {/* 4. Usuarios activos */}
                            <CardCarousel
                                title="Usuarios activos"
                                viewAllLink="/search?type=users"
                                items={activeUsersInRange}
                                loading={loadingUsers}
                                itemClassName="w-auto mr-3"
                                icon={<TrendingUp className="w-5 h-5 text-purple-400" />}
                                accentClass="bg-purple-500/20"
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
                                            <p className="text-[9px] text-indigo-400 font-medium mt-0.5">
                                                {u.reviewsInRangeCount ?? 0} Reseñas
                                            </p>
                                        </div>
                                    </Link>
                                )}
                            />

                            {/* 5. Lugares top */}
                            <CardCarousel
                                title={activeTab === 'explore' ? "Lugares top" : "Nuevos Lugares"}
                                viewAllLink={`/search?type=places&sort=${activeTab === 'explore' ? 'rating' : 'latest'}`}
                                items={filteredPlaces}
                                loading={loadingReviews}
                                icon={<Flame className="w-5 h-5 text-rose-400" />}
                                accentClass="bg-rose-500/20"
                                renderItem={(place: any) => (
                                    <Link to={`/place/${place.id}`} className="block relative group h-40 md:h-48 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-10 bg-zinc-900">
                                        {place.photoUrl ? (
                                            <div className="absolute inset-0">
                                                <ProgressiveImage src={place.photoUrl} alt={place.name} containerClassName="w-full h-full" className="w-full h-full object-cover" />
                                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full bg-blue-900/20" />
                                        )}

                                        <div className="absolute top-2 right-2 bg-teal-600 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm">
                                            {place.rating?.toFixed(1) || 9.5}
                                        </div>

                                        <div className="absolute bottom-0 left-0 right-0 p-3">
                                            <h3 className="text-white font-bold text-sm leading-tight mb-1 truncate">{place.name}</h3>
                                            <p className="text-gray-300 text-[10px] flex items-center gap-1 opacity-80">
                                                <MapPin className="w-3 h-3" /> {place.address?.split(',')[0]}
                                            </p>
                                        </div>
                                    </Link>
                                )}
                            />


                        </>)}


                        {/* 5. Resenas / Feed */}
                        {activeTab === 'news' ? (
                            <div className="max-w-2xl mx-auto mt-12 pb-20">
                                {(loadingReviews && filteredItems.length === 0) ? (
                                    <div className="flex justify-center py-16">
                                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
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
                                                                <div className="w-12 h-12 rounded-full mx-auto mb-2 bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
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
                                            <Link to="/search?type=lists" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                                                Explorar listas →
                                            </Link>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-8" key="feed">
                                        {filteredItems.slice(0, visibleCount).map((review: any) => (
                                            <ReviewCard key={review.id} review={review} />
                                        ))}
                                        {(visibleCount < filteredItems.length || hasMore) && (
                                            <div ref={loadMoreRef} className="py-8 flex justify-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (

                            <CardCarousel
                                title="Reseñas que gustan"
                                viewAllLink="/search?type=items&sort=top_liked"
                                items={carouselReviews}
                                loading={loadingReviews}
                                itemClassName="w-auto"
                                icon={<Star className="w-5 h-5 text-rose-400" />}
                                accentClass="bg-rose-500/20"
                                renderItem={(review: any) => (
                                    <ReviewCarouselItem review={review} />
                                )}
                            />
                        )}

                    </div>
                </div>

                {appConfig.showRandomChoiceButton && (
                    <button
                        type="button"
                        onClick={handleSurpriseChoice}
                        className="fixed bottom-5 right-4 sm:bottom-6 sm:right-5 z-40 h-11 w-11 rounded-full border-2 border-amber-300/90 bg-indigo-600 text-amber-100 shadow-lg shadow-amber-500/25 hover:bg-indigo-500 transition-colors flex items-center justify-center"
                        title="Plan al azar"
                        aria-label="Plan al azar"
                    >
                        <Dice5 className="w-4 h-4" />
                    </button>
                )}

                {/* Profile gate — overlay modal, solo aparece si el username es realmente inválido */}
                {user && showProfileGate && profileGateVisible && (
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
                                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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
                                            className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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
                                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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
                                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
