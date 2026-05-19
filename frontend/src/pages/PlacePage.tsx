import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
    MapPin, MessageSquare, List as ListIcon, Share2,
    Bookmark, Heart, Smartphone, Globe, Accessibility, Utensils, ShoppingBag, Bike, Clock, Coffee, Wine, Moon, Star, Plus, AlertTriangle, Image as ImageIcon, ZoomIn, LayoutGrid, Rows3, ChevronUp, ChevronDown, BriefcaseBusiness, Check, Mail, Instagram, CreditCard, CalendarCheck, ExternalLink, X, PawPrint, Baby
} from 'lucide-react';
import { ShareModal } from '../components/ShareModal';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { SaveToArchiveModal } from '../components/SaveToArchiveModal';
import { usePlaceDetails } from '../hooks/usePlaceDetails';
import { PlaceService } from '../services/PlaceService';
import { ReviewCard } from '../components/ReviewCard';
import { ReviewCardList } from '../components/ReviewCardList';
import { MapView } from '../components/MapView';
import { useAuth } from '../context/AuthContext';
import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { AddReviewForm } from '../components/AddReviewForm';
import { ReportModal } from '../components/ReportModal';
import { Lightbox } from '../components/Lightbox';
import { PlacePhotoPlaceholder } from '../components/PlacePhotoPlaceholder';
import { PlacePhotoUploadModal } from '../components/PlacePhotoUploadModal';
import type { ReviewEntity } from '../hooks/useListDetails';
import { EntityHero } from '../components/EntityHero';
import { BusinessClaimModal } from '../components/BusinessClaimModal';
import type { BusinessClaim } from '../services/BusinessClaimService';
import { CROSS_CONTAMINATION_LABELS, DELIVERY_PROVIDER_LABELS, PET_POLICY_LABELS, PRICE_RANGE_LABELS } from '../constants/businessOptions';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

type PlaceReview = ReviewEntity & {
    placeMainImage?: string;
};

const instagramHref = (value: string) => (
    value.startsWith('http://') || value.startsWith('https://')
        ? value
        : `https://instagram.com/${value.replace(/^@/, '')}`
);

const splitHoursLine = (line: string) => {
    const separator = line.indexOf(':');
    if (separator < 0) return { day: '', hours: line };
    return {
        day: line.slice(0, separator).trim(),
        hours: line.slice(separator + 1).trim(),
    };
};

const providerLabel = (provider?: string) => {
    const labels: Record<string, string> = {
        covermanager: 'CoverManager',
        thefork: 'TheFork',
        opentable: 'OpenTable',
        zenchef: 'Zenchef',
        resy: 'Resy',
        google: 'Google Reserve',
        custom: 'Reservas',
    };
    return provider ? labels[provider] || 'Reservas' : 'Reservas';
};

const deliveryProviderLabel = (provider?: string) => (
    provider ? DELIVERY_PROVIDER_LABELS[provider] || 'Delivery' : 'Delivery'
);

const languageLabel = (language: string) => {
    const labels: Record<string, string> = {
        es: 'Español',
        en: 'Inglés',
        ca: 'Catalán',
        eu: 'Euskera',
        gl: 'Gallego',
        fr: 'Francés',
        it: 'Italiano',
        de: 'Alemán',
        pt: 'Portugués',
    };
    return labels[language.toLowerCase()] || language;
};

const nonCommercialServiceLabels = new Set([
    'Opciones vegetarianas',
    'Opciones veganas',
    'Sin gluten',
    'Sin lactosa',
    'Pet friendly',
    'Entrega a domicilio',
    'Recogida en local',
    'Pedidos online',
    'Pago en mesa',
    'Acceso sin escalón',
    'Acceso sin escalÃ³n',
    'Bano adaptado',
    'Baño adaptado',
    'BaÃ±o adaptado',
    'Cambiador para bebés',
    'Cambiador para bebÃ©s',
]);

type RelatedList = {
    id: string;
    name: string;
    description?: string;
    parentListId?: string;
    photoUrl?: string;
    itemCount?: number;
};

type PlaceWithPhotos = {
    photos?: string[];
};

type GalleryPhotoItem = {
    url: string;
    caption?: string;
    source: 'place' | 'review' | 'legacy';
};

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object') {
        const maybeError = error as { message?: unknown };
        if (typeof maybeError.message === 'string') return maybeError.message;
    }
    return fallback;
};

export const PlacePage: React.FC = () => {
    const { placeId } = useParams<{ placeId: string }>();
    const { place, loading, error, refresh } = usePlaceDetails(placeId);
    const { user } = useAuth();

    // OG meta tags for social sharing
    useEffect(() => {
        if (!place) return;
        const title = `${place.name} — Listopic`;
        document.title = title;
        const setMeta = (prop: string, content: string) => {
            let el = document.querySelector(`meta[property="${prop}"]`);
            if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
            el.setAttribute('content', content);
        };
        setMeta('og:title', title);
        setMeta('og:description', `${place.reviewCount} reseñas · ${place.address || place.name}`);
        setMeta('og:url', window.location.href);
        setMeta('og:type', 'website');
        if (place.photoUrl) setMeta('og:image', place.photoUrl);
        return () => { document.title = 'Listopic'; };
    }, [place]);
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const fromListId = searchParams.get('listId');
    const focusedReviewId = searchParams.get('reviewId');

    const [heroReady, setHeroReady] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<'reviews' | 'lists' | 'dishes' | 'photos'>('dishes');
    const [reviewViewMode, setReviewViewMode] = useState<'list' | 'full' | 'gallery'>('list');
    const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isFollowed, setIsFollowed] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [isPlacePhotoUploadOpen, setIsPlacePhotoUploadOpen] = useState(false);
    const [isBusinessClaimOpen, setIsBusinessClaimOpen] = useState(false);
    const [isReservationOpen, setIsReservationOpen] = useState(false);
    const [isBusinessDetailsExpanded, setIsBusinessDetailsExpanded] = useState(false);
    const [isAccessibilityExpanded, setIsAccessibilityExpanded] = useState(false);
    const [isFamilyExpanded, setIsFamilyExpanded] = useState(false);
    const [isPetsExpanded, setIsPetsExpanded] = useState(false);
    const [isDietaryExpanded, setIsDietaryExpanded] = useState(false);
    const [isDeliveryExpanded, setIsDeliveryExpanded] = useState(false);
    const [businessClaims, setBusinessClaims] = useState<BusinessClaim[]>([]);
    const [loadingBusinessClaims, setLoadingBusinessClaims] = useState(false);

    // Review Creation State
    const [isFlowOpen, setIsFlowOpen] = useState(false);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [selectedDishName, setSelectedDishName] = useState<string | null>(null);
    const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

    // Infinite Scroll State
    const [visibleCount, setVisibleCount] = useState(4);
    const loadMoreRef = React.useRef<HTMLDivElement>(null);
    useBodyScrollLock(isReservationOpen);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => prev + 5);
            }
        }, { threshold: 0.1 });

        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [activeTab, visibleCount]);

    useEffect(() => {
        if (!expandedReviewId) return;
        requestAnimationFrame(() => {
            document
                .getElementById(`expanded-review-${expandedReviewId}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [expandedReviewId]);

    useEffect(() => {
        if (!focusedReviewId) return;
        setActiveTab('reviews');
        setReviewViewMode('gallery');
        setExpandedReviewId(focusedReviewId);
    }, [focusedReviewId]);

    useEffect(() => {
        if (!focusedReviewId || !place?.reviews?.length) return;
        const reviewIndex = place.reviews.findIndex((review) => review.id === focusedReviewId);
        if (reviewIndex >= 0) {
            setVisibleCount(prev => Math.max(prev, reviewIndex + 1));
        }
    }, [focusedReviewId, place?.reviews]);

    useEffect(() => {
        if (!user || !placeId) {
            setBusinessClaims([]);
            return;
        }

        let cancelled = false;
        const loadClaims = async () => {
            setLoadingBusinessClaims(true);
            try {
                const snap = await getDocs(query(
                    collection(db, 'businessClaims'),
                    where('userId', '==', user.uid),
                    where('placeId', '==', placeId),
                ));
                if (cancelled) return;
                const claims = snap.docs
                    .map((claimDoc) => ({ id: claimDoc.id, ...(claimDoc.data() as Omit<BusinessClaim, 'id'>) }))
                    .sort((a, b) => {
                        const aSeconds = typeof (a.createdAt as { seconds?: unknown })?.seconds === 'number'
                            ? (a.createdAt as { seconds: number }).seconds
                            : 0;
                        const bSeconds = typeof (b.createdAt as { seconds?: unknown })?.seconds === 'number'
                            ? (b.createdAt as { seconds: number }).seconds
                            : 0;
                        return bSeconds - aSeconds;
                    });
                setBusinessClaims(claims);
            } catch (error) {
                console.warn('Failed to load business claims for place', error);
                if (!cancelled) setBusinessClaims([]);
            } finally {
                if (!cancelled) setLoadingBusinessClaims(false);
            }
        };

        void loadClaims();
        return () => {
            cancelled = true;
        };
    }, [placeId, user]);

    // Compute suggested list IDs where this place is already present
    const suggestedListIds = useMemo(() => {
        if (!place?.relatedLists) return [];
        return place.relatedLists.map(l => l.id);
    }, [place?.relatedLists]);

    const handleEditReview = (review: ReviewEntity) => {
        setEditingReviewId(review.id);
        setIsFlowOpen(true);
    };

    const [reactionConfig, setReactionConfig] = useState<{ like?: string; dislike?: string } | null>(null);

    // Fetch Category Configuration for Reactions
    useEffect(() => {
        if (!place?.category) return;
        import('../services/CategoryService').then(({ CategoryService }) => {
            CategoryService.getCategory(place.category!).then(cat => {
                setReactionConfig(CategoryService.getReactionConfig(cat));
            });
        });
    }, [place?.category]);

    // ... (rest of the file remains similar until render)


    // Check if place is followed
    useEffect(() => {
        if (!user || !placeId) return;
        const checkFollow = async () => {
            try {
                const docRef = doc(db, 'users', user.uid, 'followingPlaces', placeId);
                const snap = await getDoc(docRef);
                setIsFollowed(snap.exists());
            } catch (e) {
                console.warn("Check follow error", e);
            }
        };
        checkFollow();
    }, [user, placeId]);

    const handleFollowToggle = async () => {
        if (!user || !placeId) return; // Prompt login if needed

        // Optimistic UI
        const prevState = isFollowed;
        setIsFollowed(!prevState);
        setFollowLoading(true);

        try {
            const followingPlaceRef = doc(db, 'users', user.uid, 'followingPlaces', placeId);

            // Backend Trigger 'onPlaceFollowingWrite' in 'social.js' handles:
            // 1. Updating user.followingPlacesCount
            // 2. Updating place.followersCount (and ensuring place doc exists)

            if (prevState) {
                // Unfollow (Trigger delete)
                await deleteDoc(followingPlaceRef);
            } else {
                // Follow (Trigger create)
                await setDoc(followingPlaceRef, {
                    placeId,
                    followedAt: serverTimestamp(),
                    placeName: place?.name || '',
                    placeAddress: place?.address || '',
                    placePhoto: place?.photoUrl || ''
                });
            }
        } catch (error) {
            console.error("Follow place error:", error);
            setIsFollowed(prevState); // Revert
        } finally {
            setFollowLoading(false);
        }
    };

    // --- Dishes Aggregation (Menu Mode: Platos) ---
    const dishes = useMemo(() => {
        if (!place?.reviews) return [];

        const dishMap: Record<string, { total: number; count: number; name: string; photos: string[]; listId?: string }> = {};

        place.reviews.forEach(r => {
            if (!r.itemName) return;
            const name = r.itemName.trim();
            const key = name.toLowerCase();

            if (!dishMap[key]) {
                dishMap[key] = { total: 0, count: 0, name: name, photos: [], listId: r.listId };
            }
            dishMap[key].total += r.overallRating;
            dishMap[key].count += 1;
            if (r.photoUrl) dishMap[key].photos.push(r.photoUrl);
            // Update listId fallback if missing
            if (!dishMap[key].listId && r.listId) dishMap[key].listId = r.listId;
        });

        return Object.values(dishMap).map(d => ({
            name: d.name,
            avg: d.total / d.count,
            count: d.count,
            photo: d.photos[0],
            listId: d.listId
        })).sort((a, b) => b.avg - a.avg);
    }, [place?.reviews]);


    // Aggregate Photos for Gallery
    const galleryItems = useMemo<GalleryPhotoItem[]>(() => {
        if (!place) return [];
        const items = new Map<string, GalleryPhotoItem>();
        const addPhoto = (url: unknown, item: Omit<GalleryPhotoItem, 'url'>) => {
            if (typeof url !== 'string' || !url.trim()) return;
            const cleanUrl = url.trim();
            if (!items.has(cleanUrl)) items.set(cleanUrl, { url: cleanUrl, ...item });
        };

        place.placePhotos?.forEach(photo => {
            addPhoto(photo.url, {
                caption: photo.caption || (photo.userName ? `Foto de ${photo.userName}` : undefined),
                source: 'place',
            });
        });

        const placeWithPhotos = place as typeof place & PlaceWithPhotos;
        if (placeWithPhotos.photos && Array.isArray(placeWithPhotos.photos)) {
            placeWithPhotos.photos.forEach((p) => addPhoto(p, { source: 'legacy' }));
        } else if (place.photoUrl) {
            addPhoto(place.photoUrl, { source: 'legacy' });
        }

        if (place.reviews) {
            place.reviews.forEach(r => {
                const reviewPhotos = Array.isArray(r.photoUrls) && r.photoUrls.length > 0
                    ? r.photoUrls
                    : [r.photoUrl];
                reviewPhotos.forEach(photoUrl => {
                    addPhoto(photoUrl, {
                        caption: r.itemName || r.authorName || 'Foto de reseña',
                        source: 'review',
                    });
                });
            });
        }

        return Array.from(items.values());
    }, [place]);
    const galleryPhotos = useMemo(() => galleryItems.map(item => item.url), [galleryItems]);
    const latestBusinessClaim = businessClaims[0] || null;
    const isBusinessClaimed = Boolean(place?.businessVerified || place?.businessClaimId);
    const businessClaimStatusLabel: Record<BusinessClaim['status'], string> = {
        pending: 'Pendiente',
        approved: 'Aprobada',
        rejected: 'Rechazada',
    };
    const businessClaimStatusClass: Record<BusinessClaim['status'], string> = {
        pending: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
        approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
        rejected: 'bg-red-500/15 text-red-300 border-red-500/25',
    };



    // Helper for Price Level
    const renderPriceLevel = (level?: number) => {
        if (!level && level !== 0) return null;
        // Map 0-4 to € symbols. If string e.g 'PRICE_LEVEL_EXPENSIVE', logic needed. 
        // Assuming number 0-4 or similar.
        const count = typeof level === 'number' ? level : 2;
        return (
            <div className="flex text-emerald-400 font-bold" title="Nivel de precio">
                {[...Array(5)].map((_, i) => (
                    <span key={i} className={i < count ? 'opacity-100' : 'opacity-30 text-gray-500'}>€</span>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--lt-bg)] animate-pulse">
                {/* Hero skeleton */}
                <div className="h-[40vh] min-h-[300px] bg-white/5" />
                <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 relative z-10">
                    {/* Title & address */}
                    <div className="h-10 bg-white/10 rounded w-2/3 mb-3" />
                    <div className="h-5 bg-white/5 rounded w-1/3 mb-8" />
                    {/* Stats row */}
                    <div className="flex gap-4 mb-8">
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                    </div>
                    {/* Review cards */}
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-40 bg-white/5 rounded-2xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const handleSyncFromGoogle = async () => {
        if (!placeId || !user) return;
        setSyncing(true);
        setSyncError(null);
        try {
            const idToken = await user.getIdToken();
            await PlaceService.ensurePlaceSyncedWithBackend(placeId, idToken);
            await refresh();
        } catch (err: unknown) {
            setSyncError(getErrorMessage(err, 'Error al sincronizar con Google'));
        } finally {
            setSyncing(false);
        }
    };

    if (error || !place) {
        return (
            <div className="min-h-screen pt-safe-32 px-4 text-center bg-[var(--lt-bg)]">
                <MapPin className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Lugar no encontrado</h2>
                <p className="text-gray-400 mb-6 max-w-sm mx-auto text-sm">
                    Este lugar aún no está en Listopic.
                    {user ? ' Puedes sincronizarlo desde Google Maps.' : ' Inicia sesión para añadirlo.'}
                </p>
                {syncError && <p className="text-red-400 text-sm mb-4">{syncError}</p>}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {user && (
                        <button
                            onClick={handleSyncFromGoogle}
                            disabled={syncing}
                            className="px-5 py-2 rounded-lg bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-50 text-white font-bold transition-colors flex items-center gap-2 mx-auto"
                        >
                            {syncing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <MapPin className="w-4 h-4" />}
                            {syncing ? 'Sincronizando...' : 'Sincronizar desde Google'}
                        </button>
                    )}
                    <Link to="/search" className="px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--lt-accent)] font-bold transition-colors flex items-center gap-2 justify-center">
                        Volver a buscar
                    </Link>
                </div>
            </div>
        );
    }


    // Dynamic Color for Score

    const handleShareClick = () => {
        setIsShareModalOpen(true);
    };

    const reservations = place.resolvedBusinessInfo?.reservations;
    const reservationEnabled = reservations?.enabled === true && Boolean(reservations.embedUrl || reservations.externalUrl);
    const reservationEmbedUrl = reservations?.embedUrl;
    const reservationFallbackUrl = reservations?.externalUrl || place.website || reservations?.embedUrl;
    const reservationButtonText = reservations?.buttonText || 'Reservar mesa';
    const openReservationFallback = () => {
        if (!reservationFallbackUrl) return;
        window.open(reservationFallbackUrl, '_blank', 'noopener,noreferrer');
    };
    const handleReservationClick = () => {
        if (reservationEmbedUrl) {
            setIsReservationOpen(true);
            return;
        }
        openReservationFallback();
    };
    const deliveries = place.resolvedBusinessInfo?.deliveries;
    const deliveryLinks = deliveries?.enabled === true ? (deliveries.links || []).filter((link) => Boolean(link.url)) : [];
    const hasDeliveryInfo = deliveryLinks.length > 0 || Boolean(deliveries?.notes);
    const commercialInfo = place.resolvedBusinessInfo?.commercial;
    const visibleCommercialServices = (commercialInfo?.services || []).filter((service) => !nonCommercialServiceLabels.has(service));
    const hasServiceInfo = Boolean(
        commercialInfo?.priceRange ||
        commercialInfo?.cuisineTypes?.length ||
        visibleCommercialServices.length ||
        place.options?.delivery ||
        place.options?.takeout ||
        place.options?.dineIn ||
        place.options?.reservable ||
        place.options?.servesBreakfast ||
        place.options?.servesLunch ||
        place.options?.servesDinner ||
        place.options?.servesBeer ||
        place.options?.servesWine
    );
    const hasContactInfo = Boolean(place.website || place.phone || place.email || place.instagram);
    const dietary = place.resolvedBusinessInfo?.dietary;
    const pets = place.resolvedBusinessInfo?.pets;
    const petOptions = place.petOptions;
    const accessibilityInfo = place.resolvedBusinessInfo?.accessibility;
    const familyInfo = place.resolvedBusinessInfo?.family;
    const languages = place.resolvedBusinessInfo?.identity?.languages?.filter(Boolean) || [];
    const hasPetInfo = Boolean(
        pets?.petFriendly ||
        pets?.allowsDogs ||
        pets?.allowsCats ||
        pets?.terraceOnly ||
        pets?.indoorAllowed ||
        pets?.assistanceDogsOnly ||
        pets?.waterBowls ||
        pets?.treatsAvailable ||
        pets?.petMenu ||
        pets?.sizeRestrictions ||
        pets?.requiresLeash ||
        (pets?.petPolicy && pets.petPolicy !== 'unknown') ||
        pets?.restrictions?.length ||
        pets?.notes ||
        petOptions?.petFriendly ||
        petOptions?.allowsDogs ||
        petOptions?.allowsCats ||
        petOptions?.terraceOnly ||
        petOptions?.indoorAllowed ||
        petOptions?.assistanceDogsOnly ||
        petOptions?.waterBowls ||
        petOptions?.requiresLeash
    );
    const hasDietaryInfo = Boolean(dietary && (
        dietary.glutenFreeOptions ||
        dietary.manyGlutenFreeOptions ||
        dietary.glutenFreeMenu ||
        (dietary.crossContaminationRisk && dietary.crossContaminationRisk !== 'unknown') ||
        dietary.crossContaminationNotes ||
        dietary.vegetarianOptions ||
        dietary.veganOptions ||
        dietary.dairyFreeOptions ||
        dietary.nutFreeOptions ||
        dietary.eggFreeOptions ||
        dietary.allergenMenuAvailable ||
        dietary.staffCanAdviseAllergens ||
        dietary.notes
    ));

    const accessibilityMobilityKeys: Array<[keyof NonNullable<typeof accessibilityInfo>, string]> = [
        ['stepFreeEntrance', 'Entrada sin escalones'],
        ['accessibleBathroom', 'Baño adaptado'],
        ['rampAvailable', 'Rampa permanente'],
        ['wheelchairFriendlyTables', 'Mesas para silla de ruedas'],
        ['elevator', 'Ascensor'],
        ['accessibleParking', 'Aparcamiento PMR'],
        ['bathroomGrabBars', 'Barras de apoyo en baño'],
    ];
    const accessibilityVisualKeys: Array<[keyof NonNullable<typeof accessibilityInfo>, string]> = [
        ['guideDogsWelcome', 'Perros guía bienvenidos'],
        ['brailleMenu', 'Carta en braille'],
        ['largePrintMenu', 'Carta letra grande'],
        ['digitalMenuScreenReader', 'Carta digital con lector de pantalla'],
    ];
    const accessibilityHearingKeys: Array<[keyof NonNullable<typeof accessibilityInfo>, string]> = [
        ['hearingLoop', 'Bucle magnético'],
        ['visualMenu', 'Carta visual completa'],
        ['quietEnvironment', 'Entorno tranquilo'],
        ['signLanguageStaff', 'Personal con LSE'],
    ];
    const accessibilityCognitiveKeys: Array<[keyof NonNullable<typeof accessibilityInfo>, string]> = [
        ['pictogramMenu', 'Carta con pictogramas'],
        ['easyReadMenu', 'Carta en lectura fácil'],
        ['sensoryFriendlyArea', 'Zona poco estimulante'],
    ];
    const hasOwnAccessibility = Boolean(
        accessibilityInfo && (
            Object.entries(accessibilityInfo).some(([key, value]) => key !== 'notes' && value === true) ||
            (accessibilityInfo.notes && accessibilityInfo.notes.trim().length > 0)
        )
    );
    const googleA11yEquivalents: Partial<Record<keyof NonNullable<typeof accessibilityInfo>, boolean | undefined>> = {
        stepFreeEntrance: place.accessibility?.wheelchairAccessibleEntrance === true,
        accessibleBathroom: place.accessibility?.wheelchairAccessibleRestroom === true,
        wheelchairFriendlyTables: place.accessibility?.wheelchairAccessibleSeating === true,
        accessibleParking: place.accessibility?.wheelchairAccessibleParking === true,
        hearingLoop: place.accessibility?.hearingLoop === true,
    };
    const accessibilityBlocks = [
        { id: 'mobility', title: 'Movilidad', items: accessibilityMobilityKeys },
        { id: 'visual', title: 'Personas ciegas o con baja visión', items: accessibilityVisualKeys },
        { id: 'hearing', title: 'Personas sordas o con baja audición', items: accessibilityHearingKeys },
        { id: 'cognitive', title: 'Cognitiva, sensorial y TEA', items: accessibilityCognitiveKeys },
    ].map((block) => ({
        ...block,
        active: block.items
            .filter(([key]) => {
                if (hasOwnAccessibility) return Boolean(accessibilityInfo?.[key]);
                return Boolean(googleA11yEquivalents[key]);
            })
            .map(([, label]) => label),
    }));
    const hasAccessibilityRichInfo = accessibilityBlocks.some((block) => block.active.length > 0) || Boolean(accessibilityInfo?.notes);
    const accessibilityFromGoogleOnly = !hasOwnAccessibility && hasAccessibilityRichInfo;

    const familyEntries: Array<[keyof NonNullable<typeof familyInfo>, string]> = [
        ['babyChanging', 'Cambiador para bebés'],
        ['familyRestroom', 'Baño familiar'],
        ['highChairs', 'Tronas para niños'],
        ['kidsMenu', 'Menú o platos infantiles'],
        ['playArea', 'Zona de juegos / parque infantil'],
        ['strollerFriendly', 'Apto para entrar con carrito'],
        ['bottleWarming', 'Calientan biberones'],
        ['breastfeedingFriendly', 'Espacio para amamantar'],
    ];
    const activeFamilyEntries = familyInfo
        ? familyEntries.filter(([key]) => Boolean(familyInfo[key])).map(([, label]) => label)
        : [];
    const hasFamilyInfo = activeFamilyEntries.length > 0 || Boolean(familyInfo?.notes);

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] pb-20">
            {/* Hero */}
            <EntityHero
                imageUrl={place.photoUrl}
                alt={place.name}
                ready={heroReady}
                onImageLoad={() => setHeroReady(true)}
                fallback={<PlacePhotoPlaceholder />}
            >

                        {/* Title & Info */}
                        <div className="lt-entity-hero-title flex-1">
                            <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-white mb-2 leading-tight line-clamp-2">
                                {place.name}
                            </h1>
                            {place.closedStatus && (
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold mb-2 border ${place.closedStatus === 'permanently_closed'
                                        ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                        : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                    }`}>
                                    <AlertTriangle className="w-4 h-4" />
                                    {place.closedStatus === 'permanently_closed' ? 'Cerrado permanentemente' : 'Cerrado temporalmente'}
                                </div>
                            )}
                            {place.address && (
                                <p className="text-gray-200 flex items-center gap-2 text-sm sm:text-lg max-w-2xl font-light line-clamp-1">
                                    <MapPin className="w-4 h-4 text-[var(--lt-accent)] shrink-0" />
                                    {place.address}
                                </p>
                            )}
                        </div>

                        {/* Ratings & Awards Row */}
                        <div className="flex flex-col items-start md:items-end gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Listopic Rating */}
                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border backdrop-blur-md ${place.avgScore >= 7
                                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                    : 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-accent)]'
                                    }`}>
                                    <Star className="w-4 h-4 fill-current" />
                                    <span>{place.avgScore.toFixed(1)}</span>
                                </div>

                                {
                                    /* Awards removed */
                                }

                                {/* Add Review Button (New) */}
                                <button
                                    onClick={() => {
                                        if (fromListId) {
                                            setSelectedListId(fromListId);
                                            setIsFlowOpen(true);
                                        } else {
                                            setSelectedListId(null);
                                            setIsFlowOpen(true);
                                        }
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 hover:scale-105 transition-all ml-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Añadir reseña</span>
                                </button>
                                <button
                                    onClick={() => setIsPlacePhotoUploadOpen(true)}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-all"
                                >
                                    <ImageIcon className="w-4 h-4 text-[var(--lt-accent)]" />
                                    <span>Añadir fotos</span>
                                </button>
                            </div>
                        </div>
            </EntityHero>

            {/* Main Content: Flex Col on Mobile (Order control), Grid on Desktop */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 relative -mt-8 sm:-mt-12 z-20 flex flex-col lg:grid lg:grid-cols-12 gap-8">

                {/* Sidebar (Right on Desktop, Top on Mobile) */}
                {/* Order-1 on Mobile -> Renders FIRST. lg:order-last -> Renders RIGHT. */}
                <div className="order-1 lg:col-span-4 lg:order-last space-y-4 sm:space-y-6">

                    {/* 1. Actions Row */}
                    <div className="glass-card p-3 rounded-2xl grid grid-cols-5 gap-2 sm:gap-3 shadow-lg">
                        <button
                            onClick={() => setIsSaveModalOpen(true)}
                            className="lt-secondary-action flex flex-col items-center justify-center p-2 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                        >
                            <Bookmark className="w-5 h-5 mb-1 text-[var(--lt-accent)]" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Guardar</span>
                        </button>
                        <button
                            onClick={handleFollowToggle}
                            disabled={followLoading}
                            className={`lt-secondary-action flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${isFollowed ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'} ${followLoading ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            <Heart className={`w-5 h-5 mb-1 ${isFollowed ? 'fill-current' : ''}`} />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">{isFollowed ? 'Seguido' : 'Seguir'}</span>
                        </button>
                        <button
                            onClick={handleShareClick}
                            className="lt-secondary-action flex flex-col items-center justify-center p-2 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all active:scale-95 active:bg-[var(--lt-accent-soft)] active:border-[var(--lt-accent-border)]"
                        >
                            <Share2 className="w-5 h-5 mb-1 text-[var(--lt-accent)]" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Compartir</span>
                        </button>
                        <button
                            onClick={() => setIsPlacePhotoUploadOpen(true)}
                            className="lt-secondary-action flex flex-col items-center justify-center p-2 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                        >
                            <ImageIcon className="w-5 h-5 mb-1 text-[var(--lt-accent)]" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Fotos</span>
                        </button>
                        <button
                            onClick={() => setShowReportModal(true)}
                            className="lt-report-action flex flex-col items-center justify-center p-2 rounded-xl border border-white/5 bg-white/5 text-[var(--lt-text-muted)] hover:bg-red-500/10 hover:text-red-500 transition-all group/report"
                        >
                            <AlertTriangle className="w-5 h-5 mb-1 text-red-500/50 group-hover/report:text-red-500 transition-colors" />
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Reportar</span>
                        </button>
                    </div>

                    {/* 2. Map */}
                    {place.coords && (
                        <div className="glass-card rounded-2xl overflow-hidden shadow-xl relative group">
                            <div className="absolute top-3 right-3 z-10">
                                <a
                                    href={place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${place.coords.lat},${place.coords.lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-lg text-white text-xs font-bold flex items-center gap-2 hover:bg-[var(--lt-accent)] transition-colors border border-white/10"
                                >
                                    <MapPin className="w-3 h-3" />
                                    Abrir en Google Maps
                                </a>
                            </div>
                            <div className="h-48 sm:h-64 relative z-0">
                                <MapView
                                    items={[{
                                        id: place.placeId,
                                        placeId: place.placeId,
                                        name: place.name,
                                        lat: place.coords.lat,
                                        lng: place.coords.lng,
                                        photoUrl: place.photoUrl,
                                        rating: place.avgScore,
                                        reviewsCount: place.reviewCount
                                    }]}
                                />
                            </div>
                        </div>
                    )}

                    {/* 3. Detailed Info (New Rich Data) */}
                    <div className="glass-card p-5 rounded-2xl space-y-4 shadow-lg">
                        <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
                            <h3 className="font-bold text-white text-sm uppercase tracking-wider">Detalles</h3>
                            <button
                                type="button"
                                onClick={() => setIsBusinessDetailsExpanded((value) => !value)}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-[var(--lt-text-muted)] sm:hidden"
                            >
                                {isBusinessDetailsExpanded ? 'Ocultar' : 'Ver'}
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isBusinessDetailsExpanded ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        <div className={`${isBusinessDetailsExpanded ? 'block' : 'hidden'} space-y-4 sm:block`}>

                        {place.businessDescription && (
                            <p className="rounded-xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] p-3 text-sm leading-relaxed text-[var(--lt-text)]">
                                {place.businessDescription}
                            </p>
                        )}

                        {languages.length > 0 && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <h4 className="flex items-center gap-2 text-sm font-black text-[var(--lt-text)]">
                                    <Globe className="h-5 w-5 text-[var(--lt-accent)]" />
                                    Idiomas
                                </h4>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {languages.map((language) => (
                                        <span key={language} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-[var(--lt-text)]">
                                            {languageLabel(language)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {reservationEnabled && (
                            <button
                                type="button"
                                onClick={handleReservationClick}
                                className="flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--lt-accent)] px-4 py-3 text-sm font-black text-white shadow-lg shadow-[var(--lt-accent-shadow)] hover:brightness-110 transition"
                            >
                                <CalendarCheck className="h-5 w-5" />
                                {reservationButtonText}
                            </button>
                        )}

                        <div className="border-b border-white/5 pb-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">
                                    <Clock className="w-4 h-4 text-[var(--lt-accent)]" />
                                    Horario
                                </h4>
                                {place.businessOpenStatus && (
                                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${place.businessOpenStatus.isOpen
                                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                        : 'border-rose-400/30 bg-rose-500/10 text-rose-300'
                                    }`}>
                                        {place.businessOpenStatus.label}
                                        {place.businessOpenStatus.detail ? ` · ${place.businessOpenStatus.detail}` : ''}
                                    </span>
                                )}
                            </div>
                            {place.openingHours?.length ? (
                                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/10">
                                    {place.openingHours.map((line) => {
                                        const parsed = splitHoursLine(line);
                                        return (
                                            <div key={line} className="flex items-center justify-between gap-4 border-b border-white/5 px-3 py-2 last:border-b-0">
                                                <span className="text-xs font-bold text-[var(--lt-text-muted)]">{parsed.day || 'Día'}</span>
                                                <span className="text-sm font-semibold text-[var(--lt-text)]">{parsed.hours}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-sm font-semibold text-[var(--lt-text-muted)]">
                                    Sin horario definido
                                </div>
                            )}
                            {place.resolvedBusinessInfo?.hours?.notes && (
                                <p className="mt-2 text-xs text-[var(--lt-text-muted)]">{place.resolvedBusinessInfo.hours.notes}</p>
                            )}
                        </div>

                        {/* Price & Features Grid */}
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-white/5">
                            {place.priceLevel !== undefined && (
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">Precio</span>
                                    {renderPriceLevel(place.priceLevel)}
                                </div>
                            )}

                            {(hasOwnAccessibility || place.accessibility) && (() => {
                                const stepFree = hasOwnAccessibility
                                    ? accessibilityInfo?.stepFreeEntrance
                                    : place.accessibility?.wheelchairAccessibleEntrance;
                                const accessibleBath = hasOwnAccessibility
                                    ? accessibilityInfo?.accessibleBathroom
                                    : place.accessibility?.wheelchairAccessibleRestroom;
                                if (!stepFree && !accessibleBath) {
                                    return (
                                        <div className="col-span-2 sm:col-span-1">
                                            <span className="text-xs text-gray-500 block mb-1">Accesibilidad</span>
                                            <span className="text-gray-400 text-xs">-</span>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="col-span-2 sm:col-span-1">
                                        <span className="text-xs text-gray-500 block mb-1">Accesibilidad</span>
                                        <div className="space-y-1">
                                            {stepFree && (
                                                <div className="flex items-center gap-2 text-[var(--lt-accent)] font-medium text-xs">
                                                    <Accessibility className="w-4 h-4" />
                                                    <span>Entrada sin escalones</span>
                                                </div>
                                            )}
                                            {accessibleBath && (
                                                <div className="flex items-center gap-2 text-[var(--lt-accent)] font-medium text-xs">
                                                    <Accessibility className="w-4 h-4" />
                                                    <span>Baño adaptado</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        {hasServiceInfo && (
                        <div className="space-y-2">
                            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">
                                <Check className="w-4 h-4 text-[var(--lt-accent)]" />
                                Servicios
                            </h4>
                            <div className="flex flex-wrap gap-2">
                            {place.resolvedBusinessInfo?.commercial?.priceRange && (
                                <span className="px-3 py-1 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)] rounded-full text-xs font-bold flex items-center gap-1">
                                    <Star className="w-3 h-3" /> {PRICE_RANGE_LABELS[place.resolvedBusinessInfo.commercial.priceRange] || place.resolvedBusinessInfo.commercial.priceRange}
                                </span>
                            )}
                            {place.resolvedBusinessInfo?.commercial?.cuisineTypes?.slice(0, 6).map((type) => (
                                <span key={type} className="px-3 py-1 bg-white/5 text-[var(--lt-text)] border border-white/10 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Utensils className="w-3 h-3" /> {type}
                                </span>
                            ))}
                            {visibleCommercialServices.slice(0, 6).map((service) => (
                                <span key={service} className="px-3 py-1 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3" /> {service}
                                </span>
                            ))}
                            {place.options?.delivery && (
                                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Bike className="w-3 h-3" /> Delivery
                                </span>
                            )}
                            {place.options?.takeout && (
                                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <ShoppingBag className="w-3 h-3" /> Takeaway
                                </span>
                            )}
                            {place.options?.dineIn && (
                                <span className="px-3 py-1 bg-[var(--lt-accent-soft)] text-[var(--lt-accent-2)] border border-[var(--lt-accent-border)] rounded-full text-xs font-bold flex items-center gap-1">
                                    <Utensils className="w-3 h-3" /> Restaurante
                                </span>
                            )}
                            {place.options?.reservable && (
                                <span className="px-3 py-1 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)] rounded-full text-xs font-bold flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Reservas
                                </span>
                            )}
                            {place.options?.servesBreakfast && (
                                <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Coffee className="w-3 h-3" /> Desayuno
                                </span>
                            )}
                            {place.options?.servesLunch && (
                                <span className="px-3 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Utensils className="w-3 h-3" /> Comida
                                </span>
                            )}
                            {place.options?.servesDinner && (
                                <span className="px-3 py-1 bg-slate-500/10 text-slate-300 border border-slate-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Moon className="w-3 h-3" /> Cena
                                </span>
                            )}
                            {(place.options?.servesBeer || place.options?.servesWine) && (
                                <span className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Wine className="w-3 h-3" /> Alcohol
                                </span>
                            )}
                            </div>
                        </div>
                        )}

                        {place.resolvedBusinessInfo?.commercial?.paymentMethods?.length ? (
                            <div className="space-y-2 border-t border-white/5 pt-4">
                                <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">
                                    <CreditCard className="w-4 h-4 text-[var(--lt-accent)]" />
                                    Métodos de pago
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {place.resolvedBusinessInfo.commercial.paymentMethods.map((method) => (
                                        <span key={method} className="px-3 py-1 bg-white/5 text-[var(--lt-text)] border border-white/10 rounded-full text-xs font-bold flex items-center gap-1">
                                            <CreditCard className="w-3 h-3" /> {method}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {hasContactInfo && (
                        <div className="flex flex-col gap-3 border-t border-white/5 pt-4">
                            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">
                                <Globe className="w-4 h-4 text-[var(--lt-accent)]" />
                                Contacto
                            </h4>
                            {place.website && (
                                <a
                                    href={place.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white font-bold text-sm transition-all shadow-lg shadow-[var(--lt-accent-shadow)] group"
                                >
                                    <Globe className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    Visitar sitio web
                                </a>
                            )}
                            {place.phone && (
                                <a
                                    href={`tel:${place.phone}`}
                                    className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-sm transition-all border border-white/10 group"
                                >
                                    <Smartphone className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    Llamar ({place.phone})
                                </a>
                            )}
                            {place.email && (
                                <a
                                    href={`mailto:${place.email}`}
                                    className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-sm transition-all border border-white/10 group"
                                >
                                    <Mail className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    {place.email}
                                </a>
                            )}
                            {place.instagram && (
                                <a
                                    href={instagramHref(place.instagram)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-pink-500/10 hover:bg-pink-500/15 text-pink-200 font-bold text-sm transition-all border border-pink-500/20 group"
                                >
                                    <Instagram className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    Instagram
                                </a>
                            )}
                        </div>
                        )}

                        {hasDeliveryInfo && (
                            <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsDeliveryExpanded((value) => !value)}
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <h4 className="flex items-center gap-2 text-sm font-black text-[var(--lt-text)]">
                                            <Bike className="h-5 w-5 text-emerald-500" />
                                            Delivery y pedidos
                                        </h4>
                                        {deliveryLinks.length > 0 && (
                                            <span className="rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-2 py-0.5 text-[10px] font-black text-[var(--lt-accent)]">
                                                {deliveryLinks.length}
                                            </span>
                                        )}
                                    </div>
                                    <ChevronDown className={`h-4 w-4 text-[var(--lt-text-muted)] transition-transform ${isDeliveryExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {isDeliveryExpanded && (
                                    <div className="mt-3 space-y-3">
                                        {deliveries?.notes && (
                                            <p className="text-xs leading-relaxed text-[var(--lt-text-muted)]">{deliveries.notes}</p>
                                        )}
                                        {deliveryLinks.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                {deliveryLinks.map((link, index) => (
                                                    <a
                                                        key={`${link.provider || 'delivery'}-${index}`}
                                                        href={link.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-4 py-2 text-sm font-black text-[var(--lt-text)] hover:bg-[var(--lt-glass)]"
                                                    >
                                                        <ShoppingBag className="h-4 w-4 text-emerald-500" />
                                                        {link.label || `Pedir en ${deliveryProviderLabel(link.provider)}`}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {hasDietaryInfo && (
                            <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsDietaryExpanded((value) => !value)}
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                    <h4 className="flex items-center gap-2 text-sm font-black text-[var(--lt-text)]">
                                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                                        Alérgenos y dietas
                                    </h4>
                                    <ChevronDown className={`h-4 w-4 text-[var(--lt-text-muted)] transition-transform ${isDietaryExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {isDietaryExpanded && (
                                    <div className="mt-3 space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {dietary?.glutenFreeOptions && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Opciones sin gluten</span>
                                            )}
                                            {dietary?.manyGlutenFreeOptions && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Muchos platos sin gluten</span>
                                            )}
                                            {dietary?.glutenFreeMenu && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Carta sin gluten</span>
                                            )}
                                            {dietary?.vegetarianOptions && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Vegetariano</span>
                                            )}
                                            {dietary?.veganOptions && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Vegano</span>
                                            )}
                                            {dietary?.dairyFreeOptions && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Sin lácteos</span>
                                            )}
                                            {dietary?.nutFreeOptions && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Sin frutos secos</span>
                                            )}
                                            {dietary?.eggFreeOptions && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Sin huevo</span>
                                            )}
                                            {dietary?.allergenMenuAvailable && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Carta de alérgenos</span>
                                            )}
                                            {dietary?.staffCanAdviseAllergens && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Personal informado</span>
                                            )}
                                        </div>
                                        {dietary?.crossContaminationRisk && dietary.crossContaminationRisk !== 'unknown' && (
                                            <p className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3 text-xs font-semibold text-[var(--lt-text)]">
                                                Gluten: {CROSS_CONTAMINATION_LABELS[dietary.crossContaminationRisk] || dietary.crossContaminationRisk}
                                                {dietary.crossContaminationNotes ? ` · ${dietary.crossContaminationNotes}` : ''}
                                            </p>
                                        )}
                                        {dietary?.notes && (
                                            <p className="text-xs leading-relaxed text-[var(--lt-text-muted)]">{dietary.notes}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {hasAccessibilityRichInfo && (
                            <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAccessibilityExpanded((value) => !value)}
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <h4 className="flex items-center gap-2 text-sm font-black text-[var(--lt-text)]">
                                            <Accessibility className="h-5 w-5 text-sky-500" />
                                            Accesibilidad
                                        </h4>
                                        {accessibilityFromGoogleOnly && (
                                            <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-card)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">
                                                Google
                                            </span>
                                        )}
                                    </div>
                                    <ChevronDown className={`h-4 w-4 text-[var(--lt-text-muted)] transition-transform ${isAccessibilityExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {isAccessibilityExpanded && (
                                    <div className="mt-3 space-y-3">
                                        {accessibilityFromGoogleOnly && (
                                            <p className="text-xs leading-relaxed text-[var(--lt-text-muted)]">
                                                Información sin verificar por el negocio. Los datos provienen de Google Maps y pueden estar desactualizados.
                                            </p>
                                        )}
                                        {accessibilityBlocks.filter((block) => block.active.length > 0).map((block) => (
                                            <div key={block.id} className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3">
                                                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">{block.title}</p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {block.active.map((label) => (
                                                        <span key={label} className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">
                                                            {label}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {accessibilityInfo?.notes && (
                                            <p className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3 text-xs leading-relaxed text-[var(--lt-text-muted)]">{accessibilityInfo.notes}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {hasFamilyInfo && (
                            <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsFamilyExpanded((value) => !value)}
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                    <h4 className="flex items-center gap-2 text-sm font-black text-[var(--lt-text)]">
                                        <Baby className="h-5 w-5 text-pink-500" />
                                        Familias
                                    </h4>
                                    <ChevronDown className={`h-4 w-4 text-[var(--lt-text-muted)] transition-transform ${isFamilyExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {isFamilyExpanded && (
                                    <div className="mt-3 space-y-3">
                                        {activeFamilyEntries.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {activeFamilyEntries.map((label) => (
                                                    <span key={label} className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">
                                                        {label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {familyInfo?.notes && (
                                            <p className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3 text-xs leading-relaxed text-[var(--lt-text-muted)]">{familyInfo.notes}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {hasPetInfo && (
                            <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsPetsExpanded((value) => !value)}
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                    <h4 className="flex items-center gap-2 text-sm font-black text-[var(--lt-text)]">
                                        <PawPrint className="h-5 w-5 text-emerald-500" />
                                        Mascotas
                                    </h4>
                                    <ChevronDown className={`h-4 w-4 text-[var(--lt-text-muted)] transition-transform ${isPetsExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {isPetsExpanded && (
                                    <div className="mt-3 space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {(pets?.petFriendly || petOptions?.petFriendly) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Admite mascotas</span>
                                            )}
                                            {(pets?.allowsDogs || petOptions?.allowsDogs) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Admite perros</span>
                                            )}
                                            {(pets?.allowsCats || petOptions?.allowsCats) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Admite gatos</span>
                                            )}
                                            {(pets?.indoorAllowed || petOptions?.indoorAllowed) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Interior permitido</span>
                                            )}
                                            {(pets?.terraceOnly || petOptions?.terraceOnly) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Solo terraza</span>
                                            )}
                                            {(pets?.assistanceDogsOnly || petOptions?.assistanceDogsOnly) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Perros de asistencia</span>
                                            )}
                                            {(pets?.waterBowls || petOptions?.waterBowls) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Cuencos de agua</span>
                                            )}
                                            {pets?.petMenu && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Menú para mascotas</span>
                                            )}
                                            {(pets?.requiresLeash || petOptions?.requiresLeash) && (
                                                <span className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">Correa obligatoria</span>
                                            )}
                                        </div>
                                        {pets?.petPolicy && pets.petPolicy !== 'unknown' && (
                                            <p className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3 text-xs font-semibold text-[var(--lt-text)]">
                                                {PET_POLICY_LABELS[pets.petPolicy] || pets.petPolicy}
                                                {pets.notes ? ` · ${pets.notes}` : ''}
                                            </p>
                                        )}
                                        {(!pets?.petPolicy || pets.petPolicy === 'unknown') && pets?.notes && (
                                            <p className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3 text-xs font-semibold text-[var(--lt-text)]">
                                                {pets.notes}
                                            </p>
                                        )}
                                        {pets?.restrictions?.length ? (
                                            <div className="flex flex-wrap gap-2">
                                                {pets.restrictions.map((restriction) => (
                                                    <span key={restriction} className="rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-1 text-xs font-bold text-[var(--lt-text)]">
                                                        {restriction}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                    </div>

                    {!isBusinessClaimed && (
                        <div className="glass-card p-4 rounded-2xl shadow-lg border border-white/10 opacity-85">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] grid place-items-center shrink-0">
                                    <BriefcaseBusiness className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-bold text-white">¿Gestionas este negocio?</h3>
                                    <p className="mt-1 text-xs text-gray-400">
                                        Solicita acceso para actualizar datos oficiales del lugar cuando se apruebe.
                                    </p>
                                </div>
                            </div>

                            {loadingBusinessClaims ? (
                                <p className="mt-4 text-xs text-gray-500">Comprobando solicitudes...</p>
                            ) : latestBusinessClaim ? (
                                <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-bold text-white">Tu solicitud</span>
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${businessClaimStatusClass[latestBusinessClaim.status]}`}>
                                            {businessClaimStatusLabel[latestBusinessClaim.status]}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-xs text-gray-400 line-clamp-3">{latestBusinessClaim.message}</p>
                                    {latestBusinessClaim.status === 'rejected' && latestBusinessClaim.adminNotes && (
                                        <p className="mt-2 text-xs text-red-300">{latestBusinessClaim.adminNotes}</p>
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => user ? setIsBusinessClaimOpen(true) : undefined}
                                    disabled={!user}
                                    className="mt-4 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-bold text-gray-200 hover:bg-white/10 hover:text-white disabled:opacity-50"
                                >
                                    {user ? 'Reclamar negocio' : 'Inicia sesión para reclamar'}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Left: Content (Tabs) */}
                {/* Order-2 on Mobile -> Renders SECOND. lg:order-first -> Renders LEFT. */}
                <div className="order-2 lg:col-span-8 lg:order-first">
                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar px-1 py-2">
                        <button
                            onClick={() => setActiveTab('reviews')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'reviews'
                                ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <MessageSquare className="w-4 h-4" /> Opiniones ({place.reviews.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('dishes')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'dishes'
                                ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <ListIcon className="w-4 h-4" /> La Carta ({dishes.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab('lists')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'lists'
                                ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <Bookmark className="w-4 h-4" /> Listas ({place.relatedLists?.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab('photos')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'photos'
                                ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <ImageIcon className="w-4 h-4" /> Fotos ({galleryPhotos.length})
                        </button>
                    </div>



                    {activeTab === 'reviews' && (
                        <div className="animate-fade-in">
                            {/* Reviews header with view toggle */}
                            <div className="flex justify-end mb-4">
                                <div className="flex bg-black/20 rounded-xl p-0.5 border border-white/10">
                                    <button
                                        onClick={() => setReviewViewMode('list')}
                                        className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${reviewViewMode === 'list' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                        title="Vista lista"
                                    >
                                        <ListIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setReviewViewMode('full')}
                                        className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${reviewViewMode === 'full' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                        title="Vista detallada"
                                    >
                                        <Rows3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setReviewViewMode('gallery')}
                                        className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${reviewViewMode === 'gallery' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                                        title="Vista galería"
                                    >
                                        <LayoutGrid className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {reviewViewMode === 'full' ? (
                                <div className="grid grid-cols-1 gap-6">
                                    {place.reviews.slice(0, visibleCount).map(review => (
                                        <ReviewCard
                                            key={review.id}
                                            review={review}
                                            reactionConfig={reactionConfig || undefined}
                                            onEdit={handleEditReview}
                                            placeClosedStatus={place.closedStatus}
                                        />
                                    ))}
                                    {visibleCount < place.reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]"></div>
                                        </div>
                                    )}
                                </div>
                            ) : reviewViewMode === 'gallery' ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2">
                                    {place.reviews.slice(0, visibleCount).map(review => {
                                        const typedReview = review as PlaceReview;
                                        const score = typedReview.overallRating || 0;
                                        const scoreColor = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
                                        const photoSrc = typedReview.photoUrl || typedReview.placeMainImage || null;
                                        const isPlaceImg = !typedReview.photoUrl && !!typedReview.placeMainImage;
                                        const isExpanded = expandedReviewId === typedReview.id;

                                        if (isExpanded) {
                                            return (
                                                <div id={`expanded-review-${typedReview.id}`} key={typedReview.id} className="col-span-3 sm:col-span-4 lg:col-span-5 scroll-mt-24 mb-4 animate-fade-in flex flex-col">
                                                    <button
                                                        onClick={() => setExpandedReviewId(null)}
                                                        className="self-center mb-3 flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 text-gray-200 hover:text-white text-sm font-semibold rounded-full transition-all border border-[var(--lt-accent-border)] shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                                                        aria-label="Plegar reseña"
                                                    >
                                                        <ChevronUp className="w-4 h-4" />
                                                        <span>Cerrar reseña</span>
                                                    </button>
                                                    <ReviewCard
                                                        review={review}
                                                        reactionConfig={reactionConfig || undefined}
                                                        onEdit={handleEditReview}
                                                        placeClosedStatus={place.closedStatus}
                                                    />
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={typedReview.id}
                                                onClick={() => setExpandedReviewId(typedReview.id)}
                                                className="group relative aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer border border-[var(--lt-bg)] hover:border-[var(--lt-accent-border)] transition-colors"
                                            >
                                                {photoSrc ? (
                                                    <ProgressiveImage
                                                        src={photoSrc}
                                                        alt={typedReview.authorName || ''}
                                                        containerClassName="w-full h-full"
                                                        className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${isPlaceImg ? 'opacity-40 saturate-50' : ''}`}
                                                        fallback={
                                                            <div className="w-full h-full bg-gradient-to-br from-[var(--lt-card-strong)] to-[var(--lt-bg)] flex items-center justify-center">
                                                                <MessageSquare className="w-6 h-6 text-gray-600" />
                                                            </div>
                                                        }
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-[var(--lt-card-strong)] to-[var(--lt-bg)] flex items-center justify-center">
                                                        <MessageSquare className="w-6 h-6 text-gray-600" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                                                    <p className="text-[10px] sm:text-xs text-white font-bold line-clamp-1 leading-tight">{typedReview.authorName || 'Anónimo'}</p>
                                                </div>
                                                <div className={`absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full ${scoreColor} flex items-center justify-center shadow-lg`}>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-white">{score.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {visibleCount < place.reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center col-span-3 sm:col-span-4 lg:col-span-5">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]"></div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {place.reviews.slice(0, visibleCount).map(review => (
                                        <ReviewCardList
                                            key={review.id}
                                            review={review}
                                            onEdit={handleEditReview}
                                            placeClosedStatus={place.closedStatus}
                                            hidePlaceName
                                        />
                                    ))}
                                    {visibleCount < place.reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]"></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'dishes' && (
                        <div className="animate-fade-in">
                            {dishes && dishes.length > 0 ? (
                                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                                    {/* Menu header */}
                                    <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
                                        <Utensils className="w-5 h-5 text-[var(--lt-accent)]" />
                                        <span className="font-bold text-white tracking-wide text-sm uppercase">La Carta</span>
                                        <span className="ml-auto text-xs text-gray-500">{dishes.length} platos</span>
                                    </div>
                                    <div className="divide-y divide-white/5">
                                        {dishes.map((dish, idx) => {
                                            const isTop = dish.avg >= 8.5 && idx < 3;
                                            const scoreColor = dish.avg >= 8 ? 'text-emerald-400' : dish.avg >= 6 ? 'text-amber-400' : 'text-red-400';
                                            return (
                                                <Link
                                                    key={idx}
                                                    to={`/group/${placeId}/${encodeURIComponent(dish.name)}`}
                                                    className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 hover:bg-white/5 transition-colors group"
                                                >
                                                    {/* Rank */}
                                                    <span className="text-xs font-mono text-gray-600 w-4 shrink-0 text-right">{idx + 1}</span>

                                                    {/* Photo thumbnail */}
                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-800 overflow-hidden shrink-0">
                                                        {dish.photo ? (
                                                            <ProgressiveImage
                                                                src={dish.photo}
                                                                alt={dish.name}
                                                                containerClassName="w-full h-full"
                                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                                fallback={
                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                        <Utensils className="w-4 h-4 text-gray-600" />
                                                                    </div>
                                                                }
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Utensils className="w-4 h-4 text-gray-600" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Name + meta */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-semibold text-white group-hover:text-[var(--lt-accent)] transition-colors text-sm sm:text-base truncate">{dish.name}</span>
                                                            {isTop && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">★ Top</span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-500">{dish.count} {dish.count === 1 ? 'opinión' : 'opiniones'}</span>
                                                    </div>

                                                    {/* Score */}
                                                    <span className={`text-base sm:text-lg font-black font-mono ${scoreColor} shrink-0`}>{dish.avg.toFixed(1)}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-10 text-gray-500">
                                    No hay suficientes datos para mostrar la carta.
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'lists' && (
                        <div className="space-y-8 animate-fade-in">
                            {(() => {
                                const mainLists = (place.relatedLists?.filter(l => !l.parentListId) || []) as RelatedList[];
                                const subLists = (place.relatedLists?.filter(l => !!l.parentListId) || []) as RelatedList[];

                                if (mainLists.length === 0 && subLists.length === 0) {
                                    return (
                                        <div className="py-10 text-center text-gray-500 border border-dashed border-white/10 rounded-xl">
                                            Este lugar aún no ha sido añadido a otras listas públicas.
                                        </div>
                                    );
                                }

                                return (
                                    <>
                                        {mainLists.length > 0 && (
                                            <div>
                                                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                                    <ListIcon className="w-5 h-5 text-[var(--lt-accent)]" />
                                                    Listas ({mainLists.length})
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {mainLists.map((list) => (
                                                        <Link key={list.id} to={`/list/${list.id}`} className="block group">
                                                            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl overflow-hidden hover:border-[var(--lt-accent-border)] transition-all h-full flex flex-col">
                                                                <div className="h-32 bg-gray-800 relative">
                                                                    {list.photoUrl ? (
                                                                        <ProgressiveImage
                                                                            src={list.photoUrl}
                                                                            alt={list.name}
                                                                            containerClassName="w-full h-full"
                                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                                            fallback={
                                                                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                                    <ListIcon className="w-10 h-10 text-gray-600" />
                                                                                </div>
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                            <ListIcon className="w-10 h-10 text-gray-600" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="p-4 flex-1 flex flex-col justify-between">
                                                                    <div>
                                                                        <h3 className="text-white font-bold text-lg mb-1 truncate">{list.name}</h3>
                                                                        <p className="text-gray-500 text-xs line-clamp-2">{list.description}</p>
                                                                    </div>
                                                                    <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                        {/* Hiding Author as requested */}
                                                                        <span className="text-xs text-[var(--lt-accent)] font-medium group-hover:underline">Ver Lista</span>
                                                                        <span className="text-xs text-gray-500">{list.itemCount || 0} lugares</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {subLists.length > 0 && (
                                            <div>
                                                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                                    <div className="p-1 bg-[var(--lt-accent-soft)] rounded text-[var(--lt-accent-2)]"><ListIcon className="w-4 h-4" /></div>
                                                    Sublistas ({subLists.length})
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {subLists.map((list) => (
                                                        <Link key={list.id} to={`/list/${list.id}`} className="block group">
                                                            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl overflow-hidden hover:border-[var(--lt-accent-border)] transition-all h-full flex flex-col relative">
                                                                <div className="h-32 bg-gray-800 relative">
                                                                    {list.photoUrl ? (
                                                                        <ProgressiveImage
                                                                            src={list.photoUrl}
                                                                            alt={list.name}
                                                                            containerClassName="w-full h-full"
                                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                                            fallback={
                                                                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                                    <ListIcon className="w-10 h-10 text-gray-600" />
                                                                                </div>
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                            <ListIcon className="w-10 h-10 text-gray-600" />
                                                                        </div>
                                                                    )}
                                                                    <div className="absolute top-2 right-2 p-1 bg-black/50 rounded backdrop-blur-md">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--lt-accent-2)] bg-[var(--lt-accent-soft)] px-2 py-0.5 rounded">Sublista</span>
                                                                    </div>
                                                                </div>
                                                                <div className="p-4 flex-1 flex flex-col justify-between">
                                                                    <div>
                                                                        <h3 className="text-white font-bold text-lg mb-1 truncate">{list.name}</h3>
                                                                        <p className="text-gray-500 text-xs line-clamp-2">{list.description}</p>
                                                                    </div>
                                                                    <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                        {/* Hiding Author */}
                                                                        <span className="text-xs text-[var(--lt-accent-2)] font-medium group-hover:underline">Ver Sublista</span>
                                                                        <span className="text-xs text-gray-500">{list.itemCount || 0} lugares</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )
                    }

                    {
                        activeTab === 'photos' && (
                            <div className="animate-fade-in">
                                {galleryItems.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {galleryItems.map((photo, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    setLightboxIndex(idx);
                                                    setIsLightboxOpen(true);
                                                }}
                                                className="aspect-square rounded-xl overflow-hidden bg-gray-800 cursor-pointer group relative border border-white/5 hover:border-[var(--lt-accent-border)] transition-all"
                                            >
                                                <ProgressiveImage
                                                    src={photo.url}
                                                    alt="Lugar"
                                                    containerClassName="w-full h-full"
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                    fallback={
                                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                            <ImageIcon className="w-6 h-6 text-gray-600" />
                                                        </div>
                                                    }
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                    <div className="bg-black/50 backdrop-blur-sm p-2 rounded-full text-white">
                                                        <ZoomIn className="w-5 h-5" />
                                                    </div>
                                                </div>
                                                {photo.caption && (
                                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 py-2">
                                                        <p className="text-[11px] text-white font-semibold line-clamp-2">{photo.caption}</p>
                                                    </div>
                                                )}
                                                {photo.source === 'place' && (
                                                    <span className="absolute left-2 top-2 rounded-full bg-[var(--lt-accent)] px-2 py-0.5 text-[9px] font-bold text-white shadow">
                                                        Lugar
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-16 text-center bg-[var(--lt-card-strong)] rounded-xl border border-dashed border-white/10">
                                        <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                        <h3 className="text-white font-bold">Sin fotos</h3>
                                        <button
                                            onClick={() => setIsPlacePhotoUploadOpen(true)}
                                            className="mt-4 px-4 py-2 rounded-xl bg-[var(--lt-accent)] text-white text-sm font-bold"
                                        >
                                            Subir fotos
                                        </button>
                                        <p className="text-gray-500 text-sm">Aún no hay fotos de este lugar.</p>
                                    </div>
                                )}
                            </div>
                        )
                    }

                    <Lightbox
                        isOpen={isLightboxOpen}
                        onClose={() => setIsLightboxOpen(false)}
                        images={galleryPhotos}
                        initialIndex={lightboxIndex}
                    />
                </div >
            </main >

            {isReservationOpen && reservationEmbedUrl && (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) setIsReservationOpen(false);
                    }}
                >
                    <div className="flex h-[min(780px,92vh)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[var(--lt-card-strong)] shadow-2xl">
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                            <div className="min-w-0">
                                <h3 className="truncate text-base font-black text-[var(--lt-text)]">Reserva mesa</h3>
                                <p className="text-xs text-[var(--lt-text-muted)]">{providerLabel(reservations?.provider)} · {place.name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {reservationFallbackUrl && reservationFallbackUrl !== reservationEmbedUrl && (
                                    <a
                                        href={reservationFallbackUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-[var(--lt-text)]"
                                    >
                                        <ExternalLink className="mr-1.5 h-4 w-4" />
                                        Abrir
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsReservationOpen(false)}
                                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-[var(--lt-text)]"
                                    aria-label="Cerrar reservas"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <iframe
                            src={reservationEmbedUrl}
                            title={`Reservas en ${place.name}`}
                            className="h-full w-full flex-1 bg-white"
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
                            onError={openReservationFallback}
                        />
                    </div>
                </div>
            )}

            <SaveToArchiveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                item={{
                    itemId: place.placeId,
                    type: 'place',
                    name: place.name,
                    subtitle: place.address,
                    route: `/place/${place.placeId}`,
                    photoUrl: place.photoUrl || undefined
                }}
            />

            <PlacePhotoUploadModal
                isOpen={isPlacePhotoUploadOpen}
                placeId={place.placeId}
                placeName={place.name}
                user={user}
                onClose={() => setIsPlacePhotoUploadOpen(false)}
                onUploaded={() => {
                    refresh();
                    setActiveTab('photos');
                }}
            />

            <BusinessClaimModal
                isOpen={isBusinessClaimOpen}
                user={user}
                placeId={place.placeId}
                placeName={place.name}
                placeAddress={place.address}
                onClose={() => setIsBusinessClaimOpen(false)}
                onCreated={(claim) => {
                    setBusinessClaims((prev) => [{ ...claim, userId: user?.uid || '', proofs: claim.proofs || [] } as BusinessClaim, ...prev]);
                }}
            />

            {/* Review Creation Flow */}
            {/* Direct access to Form - internal list selection if needed */}
            {
                isFlowOpen && (
                    <AddReviewForm
                        listId={selectedListId}
                        onListChange={setSelectedListId}
                        prefillPlaceId={place.placeId}
                        prefillItemName={selectedDishName || undefined}
                        editReviewId={editingReviewId || undefined}
                        lockList={false}
                        onClose={() => {
                            setIsFlowOpen(false);
                            setSelectedListId(null);
                            setSelectedDishName(null);
                            setEditingReviewId(null);
                        }}
                        onSuccess={() => {
                            setIsFlowOpen(false);
                            setSelectedListId(null);
                            setSelectedDishName(null);
                            // Maybe refresh reviews? Realtime updates handle it.
                            if (refresh) refresh();
                        }}
                        suggestedListIds={suggestedListIds}
                    />
                )
            }
            {/* Share Modal */}
            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                title={`Compartir ${place.name}`}
                place={place}
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetId={place.placeId}
                targetName={place.name}
                targetType="place"
            />
        </div >
    );
};
