import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useParams, Link, useLocation as useRouterLocation, useNavigate } from 'react-router-dom';
import { Map as MapIcon, List as ListIcon, Plus, Heart, SlidersHorizontal, Clock, Search, ChevronDown, Store, Lock, Share2, ChevronRight, Edit3, ArrowLeft, MoreVertical, X, LayoutGrid, Trophy, SearchX } from 'lucide-react';
import { MarqueeText } from '../components/ui/MarqueeText';
import { useListDetails } from '../hooks/useListDetails';
import { useUserProfile } from '../hooks/useUserProfile';
import { ListItemCard } from '../components/ListItemCard';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { LazyMapView as MapView, LazyAddReviewForm as AddReviewForm, LazyShareModal as ShareModal } from '../components/lazy';
import { FilterModal } from '../components/FilterModal';
import { ShareListModal } from '../components/ShareListModal';
import { SublistsModal } from '../components/SublistsModal';
import { EditListModal } from '../components/EditListModal';
import { useAuth } from '../context/AuthContext';
import { getExpandedRangeValue, useFilters } from '../context/FilterContext';
import { useLike } from '../hooks/useLike';
import { useLocation } from '../hooks/useLocation';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { buildShareCriteriaGroups } from '../utils/shareCriteria';
import { buildPublicRouteUrl } from '../utils/publicUrl';
import { EntityHero } from '../components/EntityHero';
import { SponsoredItemsCarousel } from '../components/business/SponsoredItemsCarousel';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { useAppConfig } from '../context/AppConfigContext';
import { usePreferences } from '../context/PreferencesContext';
import { HelpTip } from '../components/HelpTip';
import { compareElementsByRank, isScoreValue, reviewScoreForList } from '../lib/scoring';
import { elementKey } from '../lib/listElements';
import { scoreBadgeStyle } from '../lib/scoreScale';
import { useStoredChoice } from '../hooks/useStoredChoice';
import { AREA_STORAGE_KEY, buildAreaOptions, contextualRanks, decodeArea, distanceLabel, encodeArea, geoAreaLabel, inferUserGeo, localAreaOptions, matchesArea, primaryContextRank, type GeoFields, type ListArea } from '../lib/geoAreas';
import { exploreSearchUrl } from '../lib/searchZones';
import { AreaSelect } from '../components/AreaSelect';
import { recordListVisit } from '../lib/searchLandingStorage';

export interface FilterState {
    minRating: number;
    hasPhoto: boolean;
    glutenFree: boolean;
    petFriendly: boolean;
    visited: boolean;
    accessibility: Record<string, boolean>;
    criteriaMin: Record<string, number>;
}

function normalizeFilterToken(value: unknown) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function hasGlutenFreeTag(tags: unknown) {
    return (Array.isArray(tags) ? tags : []).some(tag => {
        const normalized = normalizeFilterToken(tag);
        return normalized === 'sin gluten'
            || normalized === 'gluten free'
            || normalized === 'gluten-free'
            || normalized.includes('sin gluten')
            || normalized.includes('gluten free')
            || normalized.includes('gluten-free')
            || normalized.includes('celiaco')
            || normalized.includes('celiaca')
            || normalized.includes('celiac');
    });
}

function hasLactoseFreeTag(tags: unknown) {
    return (Array.isArray(tags) ? tags : []).some(tag => {
        const normalized = normalizeFilterToken(tag);
        return normalized.includes('sin lactosa') || normalized.includes('lactose free') || normalized.includes('lactose-free');
    });
}

function hasVeganTag(tags: unknown) {
    return (Array.isArray(tags) ? tags : []).some(tag => normalizeFilterToken(tag).includes('vegan'));
}

function hasVegetarianTag(tags: unknown) {
    return (Array.isArray(tags) ? tags : []).some(tag => {
        const normalized = normalizeFilterToken(tag);
        return normalized.includes('vegetarian') || normalized.includes('vegan') || normalized.includes('vegetal');
    });
}

function isClosedPlaceStatus(value: unknown) {
    const normalized = normalizeFilterToken(value);
    return normalized === 'permanently_closed'
        || normalized === 'temporarily_closed'
        || normalized === 'closed_permanently'
        || normalized === 'closed_temporarily';
}

function extractAccessibilityKeys(...values: unknown[]) {
    const keys = new Set<string>();
    values.forEach(value => {
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (typeof item === 'string' && item.trim()) keys.add(item.trim());
            });
            return;
        }
        if (value && typeof value === 'object') {
            Object.entries(value as Record<string, unknown>).forEach(([key, enabled]) => {
                if (enabled === true || enabled === 'true') keys.add(key);
                // Consta que no (Google o el local): «no:clave». Sirve a «Mis preferencias».
                else if (enabled === false) keys.add(`no:${key}`);
            });
        }
    });
    return Array.from(keys).sort();
}

/** «Mis preferencias» de movilidad: fuera solo lo que consta que no es accesible. */
function lacksAccessibility(keys: string[] | undefined, wanted: readonly string[]) {
    return wanted.some(key => keys?.includes(`no:${key}`) && !keys.includes(key));
}

function extractPetKeys(...values: unknown[]) {
    const keys = new Set<string>();
    values.forEach(value => {
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (typeof item === 'string' && item.trim()) keys.add(item.trim());
            });
            return;
        }
        if (value && typeof value === 'object') {
            Object.entries(value as Record<string, unknown>).forEach(([key, enabled]) => {
                if (enabled === true || enabled === 'true') keys.add(key);
            });
        }
    });
    return Array.from(keys).sort();
}

function hasPetFriendlySignal(petOptions: string[] | undefined) {
    return Boolean(petOptions?.some(key => ['petFriendly', 'allowsDogs', 'allowsCats', 'indoorAllowed', 'terraceOnly'].includes(key)));
}

function toFiniteNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getReviewReactionScore(review: any): number {
    const counts = review?.reactionCounts;
    if (counts && typeof counts === 'object') {
        return Object.values(counts).reduce<number>((total, value) => total + toFiniteNumber(value), 0);
    }

    const reactions = review?.reactions;
    if (reactions && typeof reactions === 'object') {
        const values = Object.values(reactions);
        const numericTotal = values.reduce<number>((total, value) => total + toFiniteNumber(value), 0);
        return numericTotal > 0 ? numericTotal : values.length;
    }

    return toFiniteNumber(review?.likes);
}

function getPrimaryReviewPhoto(review: any): string | null {
    const candidates: unknown[] = [];
    if (Array.isArray(review?.photoUrls)) candidates.push(...review.photoUrls);
    if (Array.isArray(review?.photos)) candidates.push(...review.photos);
    candidates.push(review?.photoUrl);

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return null;
}

const DEFAULT_LIST_FILTERS: FilterState = {
    minRating: 0,
    hasPhoto: false,
    glutenFree: false,
    petFriendly: false,
    visited: false,
    accessibility: {},
    criteriaMin: {},
};

export const ListPage: React.FC = () => {
    const { listTitlePlaceFirst } = useAppConfig();
    const { listId } = useParams<{ listId: string }>();
    const routerLocation = useRouterLocation();
    const navigate = useNavigate();
    const [sortMode, setSortMode] = useState<'rating' | 'newest' | 'oldest' | 'count'>('rating');
    const { list, reviews, sublists, loading, error } = useListDetails(listId);
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();

    // OG meta tags for social sharing (WhatsApp, iMessage, etc.)
    useEffect(() => {
        if (!list) return;
        const title = `${list.name} — Listopic`;
        document.title = title;
        const setMeta = (prop: string, content: string) => {
            let el = document.querySelector(`meta[property="${prop}"]`);
            if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
            el.setAttribute('content', content);
        };
        setMeta('og:title', title);
        setMeta('og:description', (list as any).description || `${list.reviewCount} reseñas · ${list.name}`);
        setMeta('og:url', window.location.href);
        setMeta('og:type', 'website');
        const img = (list as any).thumbnailUrl || (list as any).mainImageUrl || (list as any).photoUrl || (list as any).coverUrl || (list as any).imageUrl;
        if (img) setMeta('og:image', img);
        return () => { document.title = 'Listopic'; };
    }, [list]);
    // «Tus listas de siempre» en Buscar: solo en este navegador, una vez por lista abierta.
    const visitedListId = list?.id;
    useEffect(() => {
        if (!list || !visitedListId) return;
        recordListVisit({ id: visitedListId, name: list.name, coverUrl: list.thumbnailUrl || list.mainImageUrl || list.photoUrl || list.coverUrl || list.imageUrl });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visitedListId]);
    const { profile: currentUserProfile } = useUserProfile(user?.uid);
    const isJefe = Boolean(currentUserProfile && (
        (Array.isArray(currentUserProfile.userType) && currentUserProfile.userType.includes('jefe')) ||
        currentUserProfile.userType === 'jefe'
    ));
    const { location, calculateDistance, requestLocation } = useLocation();

    // Can manage (edit/permissions): jefe always; for sublists also the owner
    const canManageList = user && (list?.parentListId ? list.userId === user.uid : isJefe);

    const canAddReview = useMemo(() => {
        if (!list) return false;
        if (list.isPublic && (list as any).publicAccess === 'writer') return true;
        if (!user) return false;
        if (list.userId === user.uid) return true;           // owner
        if (list.editors?.includes(user.uid)) return true;  // editor/collaborator (UID)
        return false;
    }, [user, list]);

    const [filters, setFilters] = useState<FilterState>(DEFAULT_LIST_FILTERS);
    // Vista (Ranking / Mosaico) y agrupación: se recuerdan en este navegador.
    // Ranking por defecto (clave nueva para que todos empiecen ahí).
    const [viewMode, setViewMode] = useStoredChoice('listopic_list_view_v2', ['list', 'gallery'] as const, 'list');
    const [groupingMode, setGroupingMode] = useStoredChoice('listopic_list_grouping', ['place', 'dish'] as const, 'dish');

    // Check for editId param
    const queryParams = new URLSearchParams(routerLocation.search);
    const editId = queryParams.get('editId');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingReviewId, setEditingReviewId] = useState<string | undefined>(editId || undefined);

    // Update state if URL changes (e.g. navigation back/forward)
    React.useEffect(() => {
        const q = new URLSearchParams(routerLocation.search);
        const Eid = q.get('editId');
        if (Eid) {
            if (!user) {
                openAuthPrompt('editar una reseña');
                return;
            }
            setEditingReviewId(Eid);
            setIsAddModalOpen(true);
        }
    }, [openAuthPrompt, routerLocation.search, user]);

    const handleOpenAddReview = () => {
        if (!user) {
            openAuthPrompt('añadir una reseña');
            return;
        }
        setIsAddModalOpen(true);
    };

    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isPublicShareModalOpen, setIsPublicShareModalOpen] = useState(false);
    const [isSublistsModalOpen, setIsSublistsModalOpen] = useState(false);
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
    const [isEditListModalOpen, setIsEditListModalOpen] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    const overflowBtnRef = useRef<HTMLButtonElement>(null);
    const dropdownPortalRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);


    // Range State from Context
    const { range, setRange } = useFilters();

    // Zona: «cerca» (radio de distancia, lo de siempre) o ciudad/provincia/CCAA/España.
    // Se recuerda en este navegador; filtra por igual Ranking, Mosaico y Mapa.
    const [area, setArea] = useState<ListArea>(() => {
        try { return decodeArea(localStorage.getItem(AREA_STORAGE_KEY)); } catch { return { kind: 'near' }; }
    });
    useEffect(() => {
        try { localStorage.setItem(AREA_STORAGE_KEY, encodeArea(area)); } catch { /* opcional */ }
    }, [area]);

    const handleAreaSelect = (value: string) => {
        if (value.startsWith('r:')) {
            const raw = value.slice(2);
            setArea({ kind: 'near' });
            setRange(raw === 'all' ? null : Number(raw));
            if (raw !== 'all' && !location) requestLocation();
            return;
        }
        setArea(decodeArea(value));
    };

    // Ensure location is requested if a range is active, to prevent showing ALL items by default
    useEffect(() => {
        if (area.kind === 'near' && range !== null && !location) {
            requestLocation();
        }
    }, [range, location, area.kind]);

    // list.likes might be undefined initially, defaulting to 0
    const { isLiked, likeCount, toggleLike } = useLike(listId || '', list?.likes || 0);

    // Filter & Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [showUnavailable, setShowUnavailable] = useState(false);

    // User role filters
    const [showBotReviews, setShowBotReviews] = useState(false);
    const [criticOnly, setCriticOnly] = useState(false);
    const [authorRolesMap, setAuthorRolesMap] = useState<Map<string, string[]>>(new Map());

    useEffect(() => {
        if (!reviews.length) return;
        const uids = [...new Set(reviews.map(r => r.userId || (r as any).authorId).filter(Boolean))];
        if (!uids.length) return;

        const fetchRoles = async () => {
            const map = new Map<string, string[]>();
            // Batch in groups of 10 (Firestore limit per 'in' query)
            const chunks: string[][] = [];
            for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
            for (const chunk of chunks) {
                try {
                    // Uno a uno; si falla una lectura, solo se pierde ese autor
                    // (con Promise.all se perdía el bloque y los bots contaban).
                    await Promise.allSettled(chunk.map(async uid => {
                        const snap = await getDoc(doc(db, 'publicProfiles', uid));
                        if (snap.exists()) {
                            const ut = snap.data().userType ?? [];
                        const roles = Array.isArray(ut) ? ut : [ut];
                            map.set(uid, roles);
                        }
                    }));
                } catch (e) {
                    // non-blocking
                }
            }
            setAuthorRolesMap(map);
        };

        fetchRoles();
    }, [reviews]);

    // Parent List Name (for Sublists)
    const [parentListName, setParentListName] = useState<string | null>(null);
    useEffect(() => {
        const fetchParentName = async () => {
            if (list?.parentListId) {
                try {
                    const snap = await getDoc(doc(db, 'lists', list.parentListId));
                    if (snap.exists()) {
                        setParentListName(snap.data().name);
                    }
                } catch (e) {
                    console.error("Error fetching parent list name", e);
                }
            }
        };
        fetchParentName();
    }, [list?.parentListId]);


    // --- Aggregation Logic (Ranked List View & Map Data) ---
    // Filtros de autor (bots / solo críticos): mismos para ranking y mapa.
    const visibleReviews = useMemo(() => reviews.filter(r => {
        const uid = r.userId || (r as any).authorId;
        const roles = authorRolesMap.get(uid) ?? [];
        const isBot = roles.includes('bot');
        const isCritico = roles.includes('critico');
        if (isBot && !showBotReviews) return false;
        if (criticOnly && !isCritico) return false;
        return true;
    }), [reviews, authorRolesMap, showBotReviews, criticOnly]);

    const groupedItems = useMemo(() => {
        if (!visibleReviews.length) return [];

        const groups: Record<string, {
            id: string;
            name: string;
            placeId?: string;
            placeName?: string;
            placeCity?: string;
            geo: GeoFields;
            placeAddress?: string;
            photoUrl?: string;
            reviewPhotoUrl?: string;
            placeMainImage?: string;
            totalRating: number;
            count: number;
            criteriaSums: Record<string, number>;
            criteriaCounts: Record<string, number>;
            placeClosedStatus?: string | null;
            accessibilityOptions: string[];
            petOptions: string[];
            lat?: number;
            lng?: number;
            latestReviewAt: number; // Timestamp for sorting
            userHasReviewed: boolean;
            items: { name: string; score: number }[];
            photoMaxReactions: number;
            photoBestReviewAt: number;
            maxScore: number; // Track max score for the pin
            allTags: string[]; // For consensus calculation
            aptOk: string[];
            tags: string[]; // Final consensus tags
        }> = {};

        visibleReviews.forEach(review => {
            // En la Lista madre, las reseñas de Minilista cuentan solo con sus criterios.
            // Sin nota no puntúa ni cuenta (igual que en Buscar: lib/listElements).
            const reviewScore = reviewScoreForList(review, list).score;
            if (reviewScore === null) return;
            // Misma clave que la ficha y Buscar: sitio + nombre sin tildes ni signos.
            const key = elementKey(review, groupingMode === 'dish' ? 'dish' : 'place');

            if (!groups[key]) {
                const itemName = review.itemName ? review.itemName : (review.placeName || 'Elemento sin nombre');
                groups[key] = {
                    id: key,
                    name: groupingMode === 'dish' ? itemName : (review.placeName || itemName),
                    placeId: review.placeId,
                    placeName: review.placeName,
                    placeCity: review.placeCity,
                    geo: { city: review.placeCity, province: review.placeProvince, region: review.placeRegion, country: review.placeCountry },
                    placeAddress: review.placeAddress,
                    photoUrl: undefined,
                    totalRating: 0,
                    count: 0,
                    criteriaSums: {},
                    criteriaCounts: {},
                    latestReviewAt: 0,
                    userHasReviewed: false,
                    items: [],
                    photoMaxReactions: -1,
                    photoBestReviewAt: 0,
                    maxScore: 0,
                    allTags: [],
                    aptOk: [],
                    tags: [],
                    placeClosedStatus: review.placeClosedStatus || null,
                    accessibilityOptions: extractAccessibilityKeys(
                        review.accessibilityOptions,
                        review.accessibility,
                        review.placeAccessibilityOptions,
                        review.placeAccessibility
                    ),
                    petOptions: extractPetKeys(
                        review.petOptions,
                        review.pets,
                        review.placePetOptions,
                        review.placePets
                    ),
                };
            }

            const g = groups[key];
            g.totalRating += reviewScore;
            g.count += 1;

            if (reviewScore > g.maxScore) {
                g.maxScore = reviewScore;
            }

            if (user && (review.userId === user.uid || review.authorId === user.uid)) {
                g.userHasReviewed = true;
            }

            g.items.push({
                name: review.itemName || 'Elemento',
                score: reviewScore
            });

            // Handle Review Time for sorting
            const createdAt = review.createdAt as any;
            let reviewTime = 0;
            if (createdAt?.toMillis) {
                reviewTime = createdAt.toMillis();
            } else if (createdAt instanceof Date) {
                reviewTime = createdAt.getTime();
            } else if (createdAt) {
                reviewTime = new Date(createdAt).getTime();
            }
            if (reviewTime > g.latestReviewAt) {
                g.latestReviewAt = reviewTime;
            }

            // Handle Photo: review photos always win over place photos.
            const reviewPhoto = getPrimaryReviewPhoto(review);
            const reactionScore = getReviewReactionScore(review);
            if (reviewPhoto && (
                reactionScore > g.photoMaxReactions ||
                (reactionScore === g.photoMaxReactions && reviewTime > g.photoBestReviewAt)
            )) {
                g.photoMaxReactions = reactionScore;
                g.photoBestReviewAt = reviewTime;
                g.reviewPhotoUrl = reviewPhoto;
                g.photoUrl = reviewPhoto;
            }
            if (review.placeMainImage && !g.placeMainImage) g.placeMainImage = review.placeMainImage;

            // Handle Criteria
            if (review.scores) {
                Object.entries(review.scores).forEach(([k, v]) => {
                    if (!isScoreValue(v)) return;
                    g.criteriaSums[k] = (g.criteriaSums[k] || 0) + v;
                    g.criteriaCounts[k] = (g.criteriaCounts[k] || 0) + 1;
                });
            }

            // Handle Tags
            if (review.tags && Array.isArray(review.tags)) {
                g.allTags.push(...review.tags);
            }
            if (review.userTags && Array.isArray(review.userTags)) {
                g.allTags.push(...review.userTags);
            }
            (review.aptOk || []).forEach((key) => { if (!g.aptOk.includes(key)) g.aptOk.push(key); });

            extractAccessibilityKeys(
                review.accessibilityOptions,
                review.accessibility,
                review.placeAccessibilityOptions,
                review.placeAccessibility
            ).forEach(key => {
                if (!g.accessibilityOptions.includes(key)) g.accessibilityOptions.push(key);
            });
            extractPetKeys(
                review.petOptions,
                review.pets,
                review.placePetOptions,
                review.placePets
            ).forEach(key => {
                if (!g.petOptions.includes(key)) g.petOptions.push(key);
            });

            if ((!g.lat || !g.lng) && review.lat && review.lng) {
                g.lat = review.lat;
                g.lng = review.lng;
            }
        });

        // Finalize Groups (Averages + Tags Consensus)
        return Object.values(groups).map(g => {
            const criteriaAverages: Record<string, number> = {};
            const allowedCriteria = list?.criteriaDefinition ? Object.keys(list.criteriaDefinition) : null;

            Object.keys(g.criteriaSums).forEach(k => {
                if (allowedCriteria && !allowedCriteria.includes(k)) return;
                // Media entre quienes puntuaron ese criterio (no entre todas las reseñas).
                criteriaAverages[k] = g.criteriaSums[k] / (g.criteriaCounts[k] || 1);
            });

            // 50% Rule for Tags
            const tagCounts: Record<string, number> = {};
            g.allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
            const minThreshold = Math.ceil(g.count / 2);
            /* Logic: "Al menos en la mitad". So >= g.count / 2.
               Math.ceil(20/2) = 10. 15/20 >= 10 -> OK. 2/20 >= 10 -> No.
               Math.ceil(1/2) = 1. 1/1 >= 1 -> OK.
            */
            const consensusTags = Object.entries(tagCounts)
                .filter(([_, count]) => count >= minThreshold)
                .map(([tag]) => tag).sort();

            return {
                ...g,
                photoUrl: g.photoUrl || g.placeMainImage,
                avgRating: g.totalRating / g.count,
                reviewCount: g.count,
                items: g.items.sort((a, b) => b.score - a.score),
                criteriaAverages,
                criteriaDefinition: list?.criteriaDefinition,
                tags: consensusTags // Use calculated tags
            };
        }).sort((a, b) => {
            if (sortMode === 'rating') {
                // Ranking único (lib/scoring): una reseña suelta no basta para
                // encabezar; a igualdad, más reseñas y luego la clave (como Buscar).
                return compareElementsByRank({ id: a.id, average: a.avgRating, count: a.reviewCount }, { id: b.id, average: b.avgRating, count: b.reviewCount });
            }
            if (sortMode === 'count') {
                return b.reviewCount - a.reviewCount;
            }
            if (sortMode === 'newest' || sortMode === 'oldest') {
                const diff = b.latestReviewAt - a.latestReviewAt;
                return sortMode === 'newest' ? diff : -diff;
            }
            return 0;
        });
    }, [visibleReviews, list, groupingMode, sortMode, user]);

    // Unique Tags for Filter UI
    const availableGroupTags = useMemo(() => {
        const set = new Set<string>();
        groupedItems.forEach(g => (g.allTags || g.tags).forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [groupedItems]);

    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // «Mis preferencias» (dieta) se aplican solas; se pueden quitar solo en esta lista.
    const { prefs } = usePreferences();
    type PrefFilterKey = 'glutenFree' | 'lactoseFree' | 'vegetarian' | 'vegan' | 'stepFree' | 'accessibleRestroom' | 'petFriendly';
    const [ignoredDiet, setIgnoredDiet] = useState<Partial<Record<PrefFilterKey, boolean>>>({});
    const prefOn = (key: PrefFilterKey) => prefs[key] && !ignoredDiet[key];
    const dietGluten = filters.glutenFree || prefOn('glutenFree');
    const dietVeg = prefOn('vegetarian');
    const dietVegan = prefOn('vegan');
    const dietLactose = prefOn('lactoseFree');
    const petsWanted = filters.petFriendly || prefOn('petFriendly');
    const needsStepFree = prefOn('stepFree');
    const needsRestroom = prefOn('accessibleRestroom');
    const mobilityNeeds = useMemo(() => [
        ...(needsStepFree ? ['wheelchairAccessibleEntrance'] : []),
        ...(needsRestroom ? ['wheelchairAccessibleRestroom'] : []),
    ], [needsStepFree, needsRestroom]);
    const PREF_CHIP_LABELS: Record<PrefFilterKey, string> = {
        glutenFree: '🌾 Sin gluten', lactoseFree: '🥛 Sin lactosa', vegetarian: '🥦 Vegetariano', vegan: '🌱 Vegano',
        stepFree: '♿ Sin escalones', accessibleRestroom: '♿ Baño adaptado', petFriendly: '🐾 Mascotas',
    };
    const activeDietChips = (Object.keys(PREF_CHIP_LABELS) as PrefFilterKey[])
        .filter(prefOn)
        .map((key) => ({ key, label: PREF_CHIP_LABELS[key] }));

    // Cuántos filtros hay activos (el botón lo enseña; ordenar no cuenta).
    const activeFilterCount = [
        filters.minRating > 0,
        filters.hasPhoto,
        filters.glutenFree,
        filters.petFriendly,
        filters.visited,
        selectedTags.length > 0,
        Object.values(filters.accessibility || {}).some(Boolean),
        Object.values(filters.criteriaMin || {}).some((v) => v > 0),
        showBotReviews,
        criticOnly,
        groupingMode === 'place',
        showUnavailable,
    ].filter(Boolean).length;

    // Filtros de cada Lista: se recuerdan en este navegador para la próxima vez.
    const prefsKey = listId ? `listopic_list_prefs:${listId}` : null;
    const [prefsLoadedFor, setPrefsLoadedFor] = useState<string | null>(null);
    useEffect(() => {
        if (!prefsKey) return;
        // Cada Lista empieza de cero (React reutiliza la página al saltar de una a otra).
        let raw: unknown = null;
        try { raw = JSON.parse(localStorage.getItem(prefsKey) || 'null'); } catch { /* sin almacenamiento */ }
        const saved = (raw && typeof raw === 'object' ? raw : {}) as {
            filters?: Partial<FilterState>; sortMode?: typeof sortMode; selectedTags?: unknown;
            showBotReviews?: unknown; criticOnly?: unknown; showUnavailable?: unknown;
        };
        setFilters({ ...DEFAULT_LIST_FILTERS, ...(saved.filters && typeof saved.filters === 'object' ? saved.filters : {}) });
        setSortMode(saved.sortMode && ['rating', 'newest', 'oldest', 'count'].includes(saved.sortMode) ? saved.sortMode : 'rating');
        setSelectedTags(Array.isArray(saved.selectedTags) ? saved.selectedTags.filter((t: unknown) => typeof t === 'string') : []);
        setShowBotReviews(saved.showBotReviews === true);
        setCriticOnly(saved.criticOnly === true);
        setShowUnavailable(saved.showUnavailable === true);
        setPrefsLoadedFor(prefsKey);
    }, [prefsKey]);
    useEffect(() => {
        if (!prefsKey || prefsLoadedFor !== prefsKey) return;
        try {
            localStorage.setItem(prefsKey, JSON.stringify({ filters, sortMode, selectedTags, showBotReviews, criticOnly, showUnavailable }));
        } catch { /* opcional */ }
    }, [prefsKey, prefsLoadedFor, filters, sortMode, selectedTags, showBotReviews, criticOnly, showUnavailable]);

    // Filter Items
    // Filter Items by Tag
    // Contexto local: solo radios y la ciudad, comunidad y país donde está la
    // persona (deducidos del sitio más cercano). Otras zonas, en Buscar.
    // Si la zona guardada no es de aquí, vuelve a «cerca».
    const userGeo = useMemo(
        () => inferUserGeo(location, groupedItems.map(item => ({ ...item.geo, lat: item.lat, lng: item.lng }))),
        [location, groupedItems],
    );
    const areaOptions = useMemo(
        () => localAreaOptions(buildAreaOptions(groupedItems.map(item => item.geo)), userGeo),
        [groupedItems, userGeo],
    );
    const effectiveArea = useMemo<ListArea>(() => {
        if (area.kind === 'near') return area;
        return areaOptions[area.kind].some(option => option.value === area.value) ? area : { kind: 'near' };
    }, [area, areaOptions]);
    // Buscar se abre en esta Lista y con la zona elegida aquí (desde ella se cambia).
    const exploreInSearch = useCallback(() => {
        if (!listId) return;
        navigate(exploreSearchUrl({
            listId,
            listName: list?.name || '',
            zone: effectiveArea.kind === 'near' ? null : { level: effectiveArea.kind, value: effectiveArea.value },
        }));
    }, [listId, list?.name, navigate, effectiveArea]);

    // Puesto con contexto («#3 en Valladolid»), con la misma función que la ficha del sitio.
    const contextRanksById = useMemo(() => contextualRanks(
        groupedItems
            .filter(item => !isClosedPlaceStatus(item.placeClosedStatus))
            .map(item => ({ id: item.id, average: item.avgRating, count: item.reviewCount, ...item.geo })),
    ), [groupedItems]);

    const filteredByTagItems = useMemo(() => {
        if (selectedTags.length === 0) return groupedItems;
        return groupedItems.filter(item => (item.allTags || item.tags).some(t => selectedTags.includes(t)));
    }, [groupedItems, selectedTags]);



    // Map Specific Data - Always grouped by Place, always has Items list
    const mapItems = useMemo(() => {
        if (!visibleReviews.length) return [];
        const placeGroups: Record<string, {
            id: string;
            placeId: string;
            name: string;
            lat?: number;
            lng?: number;
            photoUrl?: string;
            maxScore: number;
            items: { name: string; score: number }[];
            allTags: string[];
            aptOk: string[];
            accessibilityOptions: string[];
            petOptions: string[];
            reviewsCount: number;
            placeClosedStatus?: string | null;
            geo: GeoFields;
        }> = {};

        visibleReviews.forEach(review => {
            if (!review.placeId) return; // Skip items without placeId for map
            const reviewScore = reviewScoreForList(review, list).score ?? 0;

            if (!placeGroups[review.placeId]) {
                placeGroups[review.placeId] = {
                    id: review.placeId,
                    placeId: review.placeId,
                    name: review.placeName || review.itemName,
                    lat: review.lat,
                    lng: review.lng,
                    photoUrl: review.placeMainImage || review.photoUrl,
                    maxScore: 0,
                    items: [],
                    allTags: [],
                    aptOk: [],
                    accessibilityOptions: extractAccessibilityKeys(
                        review.accessibilityOptions,
                        review.accessibility,
                        review.placeAccessibilityOptions,
                        review.placeAccessibility
                    ),
                    petOptions: extractPetKeys(
                        review.petOptions,
                        review.pets,
                        review.placePetOptions,
                        review.placePets
                    ),
                    reviewsCount: 0,
                    placeClosedStatus: review.placeClosedStatus || null,
                    geo: { city: review.placeCity, province: review.placeProvince, region: review.placeRegion, country: review.placeCountry },
                };
            }

            const g = placeGroups[review.placeId];
            // Accumulate Items
            g.items.push({ name: review.itemName, score: reviewScore });
            g.reviewsCount++;
            if (Array.isArray(review.tags)) g.allTags.push(...review.tags);
            if (Array.isArray(review.userTags)) g.allTags.push(...review.userTags);
            (review.aptOk || []).forEach((key) => { if (!g.aptOk.includes(key)) g.aptOk.push(key); });
            extractAccessibilityKeys(
                review.accessibilityOptions,
                review.accessibility,
                review.placeAccessibilityOptions,
                review.placeAccessibility
            ).forEach(key => {
                if (!g.accessibilityOptions.includes(key)) g.accessibilityOptions.push(key);
            });
            extractPetKeys(
                review.petOptions,
                review.pets,
                review.placePetOptions,
                review.placePets
            ).forEach(key => {
                if (!g.petOptions.includes(key)) g.petOptions.push(key);
            });

            if (reviewScore > g.maxScore) {
                g.maxScore = reviewScore;
            }

            // Ensure coords
            if ((!g.lat || !g.lng) && review.lat && review.lng) {
                g.lat = review.lat;
                g.lng = review.lng;
            }

            // Ensure photo (naive)
            if (!g.photoUrl && (review.placeMainImage || review.photoUrl)) {
                g.photoUrl = review.placeMainImage || review.photoUrl;
            }
        });

        // Format for MapView
        return Object.values(placeGroups).map(g => ({
            ...g,
            rating: g.maxScore, // Override rating for Pin Color with Max Score
            items: g.items.sort((a, b) => b.score - a.score) // Sort items descending
        }));
    }, [visibleReviews, list]);

    // --- Filtering Logic ---
    // --- Filtering Logic ---
    const filteredItemsAll = useMemo(() => {
        let result = filteredByTagItems;

        // 1. Apply Smart Filters
        if (filters.minRating > 0) {
            result = result.filter(item => item.avgRating >= filters.minRating);
        }
        if (filters.hasPhoto) {
            result = result.filter(item => !!item.photoUrl);
        }
        if (dietGluten) {
            result = result.filter(item => hasGlutenFreeTag(item.allTags || item.tags) || item.aptOk.includes('glutenFree'));
        }
        if (dietVeg) {
            result = result.filter(item => hasVegetarianTag(item.allTags || item.tags) || item.aptOk.includes('vegetarian') || item.aptOk.includes('vegan'));
        }
        if (dietVegan) {
            result = result.filter(item => hasVeganTag(item.allTags || item.tags) || item.aptOk.includes('vegan'));
        }
        if (dietLactose) {
            result = result.filter(item => hasLactoseFreeTag(item.allTags || item.tags) || item.aptOk.includes('lactoseFree'));
        }
        if (mobilityNeeds.length > 0) {
            result = result.filter(item => !lacksAccessibility(item.accessibilityOptions, mobilityNeeds));
        }
        if (petsWanted) {
            result = result.filter(item => hasPetFriendlySignal(item.petOptions));
        }
        if (filters.visited) {
            result = result.filter(item => item.userHasReviewed);
        }
        const selectedAccessibility = Object.entries(filters.accessibility || {})
            .filter(([, enabled]) => enabled)
            .map(([key]) => key);
        if (selectedAccessibility.length > 0) {
            result = result.filter(item => selectedAccessibility.every(key => item.accessibilityOptions?.includes(key)));
        }
        if (Object.keys(filters.criteriaMin).length > 0) {
            result = result.filter(item => {
                return Object.entries(filters.criteriaMin).every(([critKey, minScore]) => {
                    const score = item.criteriaAverages?.[critKey] || 0;
                    return score >= minScore;
                });
            });
        }

        // Filter permanently closed places (unless toggle enabled)
        if (!showUnavailable) {
            result = result.filter(item => !isClosedPlaceStatus(item.placeClosedStatus));
        }

        // 2. Apply Search
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(lowerQ) ||
                (item.placeName && item.placeName.toLowerCase().includes(lowerQ))
            );
        }

        // 3. Zona: ciudad/provincia/CCAA/España, o radio de distancia («cerca»)
        if (effectiveArea.kind !== 'near') {
            result = result.filter(item => matchesArea(item.geo, effectiveArea));
        } else if (range !== null && location) {
            result = result.filter(item => {
                if (!item.lat || !item.lng) return false;
                const dist = calculateDistance(item.lat, item.lng);
                return dist !== null && dist <= range;
            });
        } else if (range !== null && !location) {
            // If range is active but no location, maybe show nothing or keep all?
            // Usually keeping all is confusing if user wants filtering. 
            // But usually requestLocation should have triggered.
            // We'll optimistically keep them or filter if we strictly want radius.
            // Let's filter nothing until location is found (user should see prompt).
        }

        return result;
    }, [filteredByTagItems, searchQuery, filters, range, location, showUnavailable, effectiveArea, dietGluten, dietVeg, dietVegan, dietLactose, petsWanted, mobilityNeeds]);

    const filteredMapItems = useMemo(() => {
        // Filter mapItems based on the SAME criteria as the list (or at least search/range)
        // Since mapItems are aggregated differently, we might need to filter differently.
        // Simplest approach: If mapItem's placeID is present in ANY of the filteredItemsAll, keep it?
        // Or re-apply filters (Search, Range, Rating).

        let result = mapItems;

        // Hide permanently closed places from map
        if (!showUnavailable) {
            result = result.filter(item => !isClosedPlaceStatus(item.placeClosedStatus));
        }

        if (filters.minRating > 0) {
            // Check if maxScore meets it? Or average? Assuming Max Score for now as it's the pin rating.
            result = result.filter(item => item.maxScore >= filters.minRating);
        }

        if (filters.hasPhoto) {
            result = result.filter(item => !!item.photoUrl);
        }
        if (dietGluten) {
            result = result.filter(item => hasGlutenFreeTag(item.allTags) || item.aptOk.includes('glutenFree'));
        }
        if (dietVeg) {
            result = result.filter(item => hasVegetarianTag(item.allTags) || item.aptOk.includes('vegetarian') || item.aptOk.includes('vegan'));
        }
        if (dietVegan) {
            result = result.filter(item => hasVeganTag(item.allTags) || item.aptOk.includes('vegan'));
        }
        if (dietLactose) {
            result = result.filter(item => hasLactoseFreeTag(item.allTags) || item.aptOk.includes('lactoseFree'));
        }
        if (mobilityNeeds.length > 0) {
            result = result.filter(item => !lacksAccessibility(item.accessibilityOptions, mobilityNeeds));
        }
        if (petsWanted) {
            result = result.filter(item => hasPetFriendlySignal(item.petOptions));
        }
        const selectedAccessibility = Object.entries(filters.accessibility || {})
            .filter(([, enabled]) => enabled)
            .map(([key]) => key);
        if (selectedAccessibility.length > 0) {
            result = result.filter(item => selectedAccessibility.every(key => item.accessibilityOptions?.includes(key)));
        }

        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(lowerQ)
            ); // Map items are places, so searching by name is usually enough. Items names are also in the 'items' array if we wanted deep search.
        }

        if (effectiveArea.kind !== 'near') {
            result = result.filter(item => matchesArea(item.geo, effectiveArea));
        } else if (range !== null && location) {
            result = result.filter(item => {
                if (!item.lat || !item.lng) return false;
                const dist = calculateDistance(item.lat, item.lng);
                return dist !== null && dist <= range;
            });
        }

        return result;
    }, [mapItems, searchQuery, filters, range, location, showUnavailable, effectiveArea, dietGluten, dietVeg, dietVegan, dietLactose, petsWanted, mobilityNeeds]);

    const hasListMapCandidates = useMemo(() => {
        return mapItems.some((item: any) => !!item?.lat && !!item?.lng);
    }, [mapItems]);

    useEffect(() => {
        if (!isMapOpen) return;
        if (loading) return;
        if (effectiveArea.kind !== 'near' || range === null || !location) return;
        if (!hasListMapCandidates) return;
        if (filteredMapItems.length > 0) return;

        const nextRange = getExpandedRangeValue(range);
        if (nextRange !== range) {
            setRange(nextRange);
        }
    }, [isMapOpen, loading, range, location, hasListMapCandidates, filteredMapItems.length, setRange, effectiveArea.kind]);

    // Close actions overflow menu when clicking outside
    useEffect(() => {
        if (!isActionsMenuOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const insideBtn = actionsMenuRef.current?.contains(target);
            const insidePortal = dropdownPortalRef.current?.contains(target);
            if (!insideBtn && !insidePortal) {
                setIsActionsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isActionsMenuOpen]);

    // Pagination
    const PAGE_SIZE = 24;
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const filteredItems = useMemo(() => {
        return filteredItemsAll.slice(0, visibleCount);
    }, [filteredItemsAll, visibleCount]);

    // Virtual scrolling for list view
    const listViewRef = useRef<HTMLDivElement>(null);
    const parentOffsetRef = useRef(0);
    useLayoutEffect(() => {
        parentOffsetRef.current = listViewRef.current?.offsetTop ?? 0;
    });
    const listVirtualizer = useWindowVirtualizer({
        count: filteredItems.length,
        estimateSize: () => 130,
        overscan: 4,
        scrollMargin: parentOffsetRef.current,
    });

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + PAGE_SIZE);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--lt-bg)] pt-safe-24 px-4 max-w-4xl mx-auto animate-pulse" aria-busy="true">
                {/* List header */}
                <div className="h-8 w-2/5 bg-[var(--lt-skeleton-base)] rounded-lg mb-3" />
                <div className="h-4 w-3/5 bg-[var(--lt-skeleton-base)] rounded mb-2" />
                <div className="h-4 w-1/4 bg-[var(--lt-skeleton-base)] rounded mb-8" />
                {/* Stats row */}
                <div className="flex gap-3 mb-8">
                    <div className="h-8 w-20 bg-[var(--lt-skeleton-base)] rounded-full" />
                    <div className="h-8 w-20 bg-[var(--lt-skeleton-base)] rounded-full" />
                    <div className="h-8 w-20 bg-[var(--lt-skeleton-base)] rounded-full" />
                </div>
                {/* Item cards */}
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex gap-3 h-32 bg-[var(--lt-card)] border border-[var(--lt-border)] rounded-2xl overflow-hidden">
                            <div className="w-28 h-full bg-[var(--lt-skeleton-base)] shrink-0" />
                            <div className="flex-1 p-3 space-y-2">
                                <div className="h-5 bg-[var(--lt-skeleton-base)] rounded w-3/4" />
                                <div className="h-3 bg-[var(--lt-skeleton-base)] rounded w-1/2" />
                                <div className="h-3 bg-[var(--lt-skeleton-base)] rounded w-1/3" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || !list) {
        if (error === 'private') {
            return (
                <div className="min-h-screen pt-safe-40 px-4 text-center">
                    <div className="bg-[var(--lt-card-strong)] border border-[var(--lt-border)] rounded-3xl p-8 max-w-md mx-auto shadow-xl">
                        <div className="w-14 h-14 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-7 h-7 text-[var(--lt-accent)]" />
                        </div>
                        {/* Firestore no distingue «no existe» de «no tienes permiso»: se dice tal cual. */}
                        <h2 className="text-2xl font-display font-bold text-[var(--lt-text)] mb-2">Lista no disponible</h2>
                        <p className="text-[var(--lt-text-muted)] mb-6">
                            No existe o es privada y no tienes permiso para verla.
                            {!user && <> Si es tuya, <Link to="/login" className="text-[var(--lt-accent)] font-semibold hover:underline">inicia sesión</Link>.</>}
                        </p>
                        <Link to="/search" style={{ backgroundImage: 'var(--lt-accent-grad)' }} className="lt-on-accent inline-flex items-center gap-2 px-6 py-3 bg-[var(--lt-accent)] font-bold rounded-full shadow-lg shadow-[var(--lt-accent-shadow)] hover:opacity-90 transition-opacity">
                            <Search className="w-4 h-4" />
                            Explorar otras listas
                        </Link>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen pt-safe-40 px-4 text-center">
                <div className="bg-[var(--lt-card-strong)] border border-[var(--lt-border)] rounded-3xl p-8 max-w-md mx-auto shadow-xl">
                    <h2 className="text-2xl font-display font-bold text-[var(--lt-text)] mb-2">No se ha podido cargar la Lista</h2>
                    <p className="text-[var(--lt-text-muted)] mb-6">Revisa tu conexión e inténtalo otra vez.</p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <button type="button" onClick={() => window.location.reload()} className="lt-on-accent px-5 py-2.5 bg-[var(--lt-accent)] font-bold rounded-full shadow-lg shadow-[var(--lt-accent-shadow)]">
                            Reintentar
                        </button>
                        <Link to="/search" className="px-5 py-2.5 border border-[var(--lt-border-strong)] text-[var(--lt-text)] font-bold rounded-full">
                            Ir a Buscar
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Por qué no se ve nada: Lista sin reseñas, búsqueda, zona o filtros.
    const areaFiltering = effectiveArea.kind !== 'near' || range !== null;
    const emptyReason: 'none' | 'search' | 'area' | 'filters' = reviews.length === 0
        ? 'none'
        : searchQuery ? 'search'
        : groupedItems.length > 0 && areaFiltering ? 'area'
        : 'filters';
    const emptyMessage = {
        none: 'Todavía no hay reseñas en esta Lista.',
        search: 'No hay resultados para tu búsqueda.',
        area: effectiveArea.kind !== 'near'
            ? `No hay nada en ${geoAreaLabel(effectiveArea.kind, effectiveArea.value)}.`
            : `No hay nada ${range !== null ? distanceLabel(range).toLowerCase() : 'cerca'}.`,
        filters: 'Ningún elemento cumple los filtros elegidos.',
    }[emptyReason];

    const listShareUrl = buildPublicRouteUrl(`/list/${list.id}`);
    const listTypeLabel = list.parentListId ? 'Minilista' : 'Lista';
    const listShareSubtitle = list.parentListId && parentListName
        ? `${listTypeLabel} de ${parentListName}`
        : listTypeLabel;
    const listShareImage = list.thumbnailUrl || list.mainImageUrl || list.photoUrl || list.coverUrl || list.imageUrl || undefined;
    const listShareImages = Array.from(new Set([
        listShareImage,
        ...reviews.flatMap((review) => [
            ...(review.photoUrls || []),
            review.photoUrl,
            review.placeMainImage,
        ]),
    ].filter((value): value is string => Boolean(value))));
    const listShareCriteria = buildShareCriteriaGroups(list.criteriaAverages, list.criteriaDefinition);
    // Zona elegida al compartir: la tarjeta dice «las mejores» de esa zona y su top sale de ahí.
    const listShareScope = effectiveArea.kind !== 'near'
        ? `en ${geoAreaLabel(effectiveArea.kind, effectiveArea.value)}`
        : range !== null && location
            ? `${distanceLabel(range).toLowerCase()}${userGeo?.city ? `, en ${userGeo.city}` : ''}`
            : undefined;
    const listShareItems = listShareScope ? filteredItemsAll : groupedItems;
    // El top 3 de la tarjeta va siempre por nota, aunque la lista se vea en otro orden.
    const listShareTop = [...listShareItems]
        .sort((a, b) => compareElementsByRank({ id: a.id, average: a.avgRating, count: a.reviewCount }, { id: b.id, average: b.avgRating, count: b.reviewCount }))
        .slice(0, 3)
        .map((item) => ({
            title: item.name,
            subtitle: groupingMode === 'dish' ? [item.placeName, item.placeCity].filter(Boolean).join(' · ') : item.placeCity,
            score: item.avgRating,
            imageUrl: item.reviewPhotoUrl || item.photoUrl || item.placeMainImage,
        }));

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-20 transition-colors duration-300">
            {/* Hero Section */}
            <EntityHero
                imageUrl={listShareImage}
                alt={list.name}
                className="h-[40vh] min-h-[300px] transition-all duration-700"
                fallback={(
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-[var(--lt-bg)] to-[var(--lt-bg)]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_26%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.08),transparent_24%)] opacity-60"></div>
                    </div>
                )}
                topSlot={list.parentListId ? (
                    <Link
                        to={`/list/${list.parentListId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {parentListName || 'Lista principal'}
                    </Link>
                ) : null}
            >
                <div className="lt-entity-hero-title w-full">

                    {/* Title & description */}
                    <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-bold text-[var(--lt-hero-title)] leading-tight mb-1">
                        {list.name}
                    </h1>
                    {list.description && (
                        <p className="text-[var(--lt-hero-text)] text-sm sm:text-base max-w-2xl line-clamp-2 leading-relaxed mb-3">
                            {list.description}
                        </p>
                    )}

                    {/* Status pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${list.parentListId ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-accent-2)]' : 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-accent)]'}`}>
                            {list.parentListId ? 'Minilista' : 'Lista'}
                        </span>
                        {groupedItems.length > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--lt-card-strong-alpha)] border border-[var(--lt-border)] text-[var(--lt-text-muted)] text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm" title="Elementos en toda la Lista">
                                {groupedItems.length} {groupedItems.length === 1 ? 'elemento' : 'elementos'}
                            </span>
                        )}
                        {/* Public/private only shown on sublists (user-owned) or to jefe */}
                        {(list.parentListId || isJefe) && (
                            list.isPublic ? (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--lt-success-soft)] border border-[var(--lt-success)]/30 text-[var(--lt-success)] text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Pública</span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--lt-danger-soft)] border border-[var(--lt-danger)]/30 text-[var(--lt-danger)] text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> Privada
                                </span>
                            )
                        )}
                        {/* Role pill — only on sublists */}
                        {list.parentListId && (
                            user?.uid === list.userId ? (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--lt-warning-soft)] border border-[var(--lt-warning)]/30 text-[var(--lt-warning)] text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Propietario</span>
                            ) : user && list.editors?.includes(user.uid) ? (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-[var(--lt-accent-2)] text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Editor</span>
                            ) : user && (list as any).publicAccess === 'writer' ? (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-[var(--lt-accent)] text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">Colaborador</span>
                            ) : null
                        )}
                    </div>

                    {/* Bottom action bar */}
                    <div className="flex items-center justify-between gap-3">

                        {/* Left: author (sublists) + likes */}
                        <div className="flex items-center gap-2 min-w-0">
                            {list.parentListId && (
                                <Link
                                    to={`/profile/${list.userId}`}
                                    className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10 hover:bg-black/50 transition-colors shrink-0"
                                >
                                    <div className="lt-on-accent w-4 h-4 rounded-full bg-[var(--lt-accent)] flex items-center justify-center text-[9px] font-bold shrink-0">
                                        {list.authorName?.[0]?.toUpperCase() ?? '?'}
                                    </div>
                                    <MarqueeText text={list.authorName || 'Usuario'} className="text-xs font-medium text-white/85 max-w-[110px]" />
                                </Link>
                            )}
                            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10 text-pink-400 text-xs font-bold shrink-0">
                                <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                                <span>{likeCount}</span>
                            </div>
                        </div>

                        {/* Right: actions */}
                        <div className="flex items-center gap-2 shrink-0">

                            {/* Primary CTA: Add Review */}
                            {canAddReview && (
                                <button
                                    onClick={handleOpenAddReview}
                                    className="lt-on-accent flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-sm font-bold rounded-full shadow-lg shadow-emerald-500/25 transition-all active:scale-95"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Valorar</span>
                                </button>
                            )}

                            {/* Desktop: secondary actions inline */}
                            <div className="hidden md:flex items-center gap-2">
                                {(!user || list.userId !== user.uid) && (
                                    <button onClick={toggleLike} className={`px-3 py-2 text-sm font-bold rounded-xl border flex items-center gap-1.5 transition-all ${isLiked ? 'border-white/20 text-white hover:border-pink-500 hover:text-pink-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                                        <Heart className={`w-4 h-4 ${isLiked ? 'fill-current text-pink-400' : ''}`} />
                                        {isLiked ? 'Guardada' : 'Guardar'}
                                    </button>
                                )}
                                {!list.parentListId && (
                                    <button onClick={() => setIsSublistsModalOpen(true)} className="px-3 py-2 bg-[var(--lt-accent-soft)] hover:bg-[var(--lt-accent)]/20 text-[var(--lt-accent)] border border-[var(--lt-accent-border)] text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all">
                                        <ListIcon className="w-4 h-4" />
                                        Minilistas
                                        {sublists && sublists.length > 0 && (
                                            <span className="bg-[var(--lt-accent-soft)] px-1.5 py-0.5 rounded text-[10px] border border-[var(--lt-accent-border)] text-[var(--lt-accent)]">{sublists.length}</span>
                                        )}
                                    </button>
                                )}
                                <button onClick={() => setIsPublicShareModalOpen(true)} className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-xl border border-white/10 flex items-center gap-1.5 transition-all">
                                    <Share2 className="w-4 h-4" /> Compartir
                                </button>
                                {canManageList && (
                                    <>
                                        <button onClick={() => setIsShareModalOpen(true)} className="px-3 py-2 bg-[var(--lt-accent-soft)] hover:bg-[var(--lt-accent)]/20 text-[var(--lt-accent)] text-sm font-bold rounded-xl border border-[var(--lt-accent-border)] flex items-center gap-1.5 transition-all">
                                            <Lock className="w-4 h-4" /> Permisos
                                        </button>
                                        <button onClick={() => setIsEditListModalOpen(true)} className="px-3 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-[var(--lt-accent-shadow)]">
                                            <Edit3 className="w-4 h-4" /> Editar
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Mobile: overflow menu — fixed position to escape hero stacking context */}
                            <div className="md:hidden relative" ref={actionsMenuRef}>
                                <button
                                    ref={overflowBtnRef}
                                    onClick={() => {
                                        if (!isActionsMenuOpen && overflowBtnRef.current) {
                                            const rect = overflowBtnRef.current.getBoundingClientRect();
                                            setDropdownPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                                        }
                                        setIsActionsMenuOpen(v => !v);
                                    }}
                                    aria-label={isActionsMenuOpen ? 'Cerrar acciones' : 'Más acciones'}
                                    className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white hover:bg-black/60 transition-colors"
                                >
                                    {isActionsMenuOpen ? <X className="w-5 h-5" /> : <MoreVertical className="w-5 h-5" />}
                                </button>

                                {isActionsMenuOpen && dropdownPosition && createPortal(
                                    <div ref={dropdownPortalRef} className="fixed w-56 bg-[var(--lt-card-strong)] border border-[var(--lt-border-strong)] rounded-2xl shadow-2xl overflow-hidden p-1 z-[9999]"
                                        style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
                                    >
                                        {(!user || list.userId !== user.uid) && (
                                            <button
                                                onClick={() => { toggleLike(); setIsActionsMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-[var(--lt-text)] hover:bg-[var(--lt-glass)] transition-colors text-left"
                                            >
                                                <Heart className={`w-4 h-4 shrink-0 ${isLiked ? 'fill-current text-pink-400' : ''}`} />
                                                {isLiked ? 'Quitar de guardados' : 'Guardar lista'}
                                            </button>
                                        )}
                                        {!list.parentListId && (
                                            <button
                                                onClick={() => { setIsSublistsModalOpen(true); setIsActionsMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-[var(--lt-text)] hover:bg-[var(--lt-glass)] transition-colors text-left"
                                            >
                                                <ListIcon className="w-4 h-4 shrink-0 text-[var(--lt-accent)]" />
                                                Minilistas
                                                {sublists && sublists.length > 0 && (
                                                    <span className="ml-auto bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] text-[10px] font-bold px-1.5 py-0.5 rounded-full">{sublists.length}</span>
                                                )}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setIsPublicShareModalOpen(true); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-[var(--lt-text)] hover:bg-[var(--lt-glass)] transition-colors text-left"
                                        >
                                            <Share2 className="w-4 h-4 shrink-0 text-[var(--lt-accent-2)]" />
                                            Compartir
                                        </button>
                                        {canManageList && (
                                            <>
                                                <button
                                                    onClick={() => { setIsShareModalOpen(true); setIsActionsMenuOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-[var(--lt-text)] hover:bg-[var(--lt-glass)] transition-colors text-left"
                                                >
                                                    <Lock className="w-4 h-4 shrink-0 text-[var(--lt-accent)]" />
                                                    Permisos
                                                </button>
                                                <button
                                                    onClick={() => { setIsActionsMenuOpen(false); setIsEditListModalOpen(true); }}
                                                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-[var(--lt-text)] hover:bg-[var(--lt-glass)] transition-colors"
                                                >
                                                    <Edit3 className="w-4 h-4 shrink-0 text-[var(--lt-warning)]" />
                                                    Editar lista
                                                </button>
                                            </>
                                        )}
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </EntityHero>

            {/* Map Collapsible */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 relative -mt-8 sm:-mt-12 z-40">
                <div className="glass-card rounded-2xl overflow-hidden transition-all duration-300 shadow-2xl border border-[var(--lt-border)]">
                    <div className="w-full p-2.5 pl-3 flex items-center justify-between text-[var(--lt-text)] bg-[var(--lt-card-strong-alpha)]">
                        <button
                            onClick={() => setIsMapOpen(!isMapOpen)}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0"
                        >
                            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                <MapIcon className="w-3.5 h-3.5" />
                            </span>
                            <span className="font-display font-bold text-sm whitespace-nowrap">Mapa<span className="hidden sm:inline"> de la Lista</span></span>
                        </button>

                        <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0 flex-1 ml-2">
                            <AreaSelect
                                value={effectiveArea.kind === 'near' ? `r:${range ?? 'all'}` : encodeArea(effectiveArea)}
                                range={range}
                                options={areaOptions}
                                onChange={handleAreaSelect}
                                onExplore={exploreInSearch}
                            />

                            <button
                                aria-label={isMapOpen ? 'Ocultar mapa' : 'Ver mapa'}
                                onClick={() => setIsMapOpen(!isMapOpen)}
                                className="flex items-center justify-center gap-1 h-8 min-w-8 px-1.5 rounded-full text-xs font-bold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-[var(--lt-glass)] transition-colors whitespace-nowrap shrink-0"
                            >
                                <span className="hidden sm:inline">{isMapOpen ? 'Ocultar' : 'Ver mapa'}</span>
                                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMapOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className={`transition-all duration-500 ease-in-out ${isMapOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="h-[400px] w-full relative z-0">
                            {/* Con una zona (ciudad, comunidad, país) el mapa encuadra sus sitios, no el radio. */}
                            {isMapOpen && <MapView items={filteredMapItems} mode="list" range={effectiveArea.kind === 'near' ? range : null} />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sublists Viewer - Moved to Header */}


            {/* Content List */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">

                {/* Platos destacados de esta lista (Business Pro, sorteo por unidades) */}
                <SponsoredItemsCarousel listId={listId} className="mb-6" />

                {/* Modern Toolbar */}
                <div className="sticky top-20 z-30 mb-8 mx-auto max-w-4xl">
                    <div className="bg-[var(--lt-card-strong-alpha)] backdrop-blur-xl border border-[var(--lt-border)] rounded-2xl shadow-2xl p-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 transition-colors duration-300 hover:border-[var(--lt-border-strong)]">

                        {/* Search & Count */}
                        <div className="flex items-center flex-1 w-full gap-2 px-1">
                            <div className="relative flex-1 group/search rounded-xl bg-[var(--lt-glass)] border border-[var(--lt-border)] focus-within:border-[var(--lt-accent-border)] px-3 py-2 transition-colors">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--lt-text-muted)] group-focus-within/search:text-[var(--lt-accent)] transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Buscar en esta lista..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-transparent border-none p-0 pl-6 text-sm text-[var(--lt-text)] placeholder:text-[var(--lt-text-muted)] focus:ring-0 focus:outline-none transition-colors"
                                />
                            </div>
                            <div className="text-xs min-w-[2rem] text-center px-2.5 py-1.5 rounded-full text-[var(--lt-accent)] font-bold bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex-shrink-0" title="Elementos visibles">
                                {filteredItemsAll.length}
                            </div>
                        </div>

                        {/* Barra de herramientas: cada botón dice lo que hace */}
                        <div className="flex items-center gap-1.5 w-full sm:w-auto">
                            {/* Un solo botón de filtros: todo lo demás vive en la hoja */}
                            <button
                                type="button"
                                onClick={() => setIsFilterModalOpen(true)}
                                aria-label={activeFilterCount > 0 ? `Filtros (${activeFilterCount} activos)` : 'Filtros'}
                                className={`h-11 flex items-center gap-1.5 px-3 rounded-xl border text-sm font-bold transition-colors active:scale-95 motion-reduce:active:scale-100 ${activeFilterCount > 0
                                    ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-accent)]'
                                    : 'bg-[var(--lt-glass)] border-[var(--lt-border)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                Filtros
                                {activeFilterCount > 0 && (
                                    <span className="min-w-[1.25rem] rounded-full bg-[var(--lt-accent)] px-1 text-[11px] leading-5 lt-on-accent">{activeFilterCount}</span>
                                )}
                            </button>

                            {/* Vista: Ranking o Mosaico (el mapa va en su panel) */}
                            <div role="group" aria-label="Vista" className="ml-auto flex-shrink-0 flex bg-[var(--lt-glass)] rounded-xl p-0.5 border border-[var(--lt-border)]">
                                {([
                                    { mode: 'list' as const, label: 'Ranking', icon: <ListIcon className="w-3.5 h-3.5" /> },
                                    { mode: 'gallery' as const, label: 'Fotos', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
                                ]).map(({ mode, label, icon }) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setViewMode(mode)}
                                        aria-pressed={viewMode === mode}
                                        className={`h-11 min-w-[3.25rem] px-1.5 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${viewMode === mode ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                    >
                                        {icon}
                                        <span className="text-[10px] font-semibold leading-none">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mis preferencias activas: siempre a la vista, para que nadie piense que faltan sitios */}
                {activeDietChips.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
                        {activeDietChips.map((chip) => (
                            <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] py-1 pl-3 pr-1 text-xs font-bold text-[var(--lt-text)]">
                                {chip.label}
                                <button type="button" onClick={() => setIgnoredDiet((prev) => ({ ...prev, [chip.key]: true }))} aria-label={`Quitar ${chip.label} en esta lista`} className="rounded-full px-1.5 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">✕</button>
                            </span>
                        ))}
                        <Link to="/preferencias" className="text-xs font-semibold text-[var(--lt-text-muted)] hover:text-[var(--lt-accent)]">Mis preferencias</Link>
                        <HelpTip topic="preferencias" />
                    </div>
                )}

                {filteredItemsAll.length > 0 && (
                    <div className="mb-3 px-1 min-w-0">
                        <h2 className="flex items-center gap-2 text-base md:text-xl font-display font-bold leading-tight text-[var(--lt-text)]">
                            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                {sortMode === 'rating' ? <Trophy className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            </span>
                            <span className="truncate">
                                {sortMode === 'rating' ? 'El ranking' : sortMode === 'count' ? 'Los más valorados' : sortMode === 'newest' ? 'Lo último' : 'Los primeros'}
                            </span>
                            <HelpTip topic="nota" />
                        </h2>
                        <p className="mt-0.5 truncate text-xs text-[var(--lt-text-muted)] font-medium" aria-live="polite">
                            {filteredItemsAll.length} {filteredItemsAll.length === 1 ? 'elemento' : 'elementos'}
                            {sortMode === 'rating' && ` · puestos ${effectiveArea.kind !== 'near'
                                ? `en ${geoAreaLabel(effectiveArea.kind, effectiveArea.value)}`
                                : range !== null ? distanceLabel(range).toLowerCase() : 'en toda la Lista'}`}
                        </p>
                    </div>
                )}
                <div className="animate-fade-in">
                    {filteredItems.length > 0 ? (
                        <>
                            {viewMode === 'gallery' ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                                    {filteredItems.map((item, idx) => {
                                        // El puesto solo tiene sentido ordenando por nota.
                                        const rank = sortMode === 'rating' ? idx + 1 : undefined;
                                        const score = item.avgRating;
                                        const primaryName = groupingMode === 'dish' ? (item.placeName || item.name) : item.name;
                                        const secondaryName = groupingMode === 'dish' ? item.name : undefined;
                                        const reviewPhoto = (item as any).reviewPhotoUrl;
                                        const placeImg = (item as any).placeMainImage;
                                        const photoSrc = reviewPhoto || placeImg || null;
                                        const isPlaceImg = !reviewPhoto && !!placeImg;
                                        const href = item.placeId
                                            ? groupingMode === 'dish'
                                                ? `/group/${item.placeId}/${encodeURIComponent(item.name)}?listId=${listId}`
                                                : `/place/${item.placeId}`
                                            : null;
                                        const cardContent = (
                                            <>
                                                {photoSrc ? (
                                                    <ProgressiveImage
                                                        src={photoSrc}
                                                        alt={primaryName}
                                                        containerClassName="w-full h-full"
                                                        className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${isPlaceImg ? 'opacity-70 saturate-[0.6]' : ''}`}
                                                        fallback={
                                                            <div className="w-full h-full bg-[var(--lt-card-strong)] flex items-center justify-center">
                                                                <Store className="w-8 h-8 text-[var(--lt-text-muted)] opacity-50" />
                                                            </div>
                                                        }
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, var(--lt-accent-soft), transparent 70%)', backgroundColor: 'var(--lt-card-strong)' }}>
                                                        <Store className="w-8 h-8 text-[var(--lt-text-muted)] opacity-50" />
                                                    </div>
                                                )}
                                                {/* Gradient overlay */}
                                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2.5 pb-2 pt-8">
                                                    <MarqueeText as="h3" text={primaryName} className="text-xs sm:text-sm text-white font-bold leading-tight" />
                                                    {secondaryName && (
                                                        <MarqueeText text={secondaryName} className="text-[10px] sm:text-[11px] text-gray-300 font-medium leading-tight mt-0.5" />
                                                    )}
                                                </div>
                                                {/* Score bubble top-right */}
                                                <div className="absolute top-2 right-2 h-7 min-w-[2.25rem] px-1.5 rounded-full flex items-center justify-center shadow-lg" style={scoreBadgeStyle(score)}>
                                                    <span className="text-[11px] font-bold tabular-nums">{score.toFixed(1)}</span>
                                                </div>
                                                {/* Rank badge top-left */}
                                                {rank !== undefined && (
                                                    <div className={`absolute top-2 left-2 h-6 min-w-6 px-1.5 rounded-full flex items-center justify-center shadow-lg text-[10px] font-bold ${rank === 1 ? 'bg-amber-400 text-black' : rank === 2 ? 'bg-gray-300 text-black' : rank === 3 ? 'bg-amber-700 lt-on-accent' : 'bg-black/55 backdrop-blur-sm border border-white/15 lt-on-accent'}`}>
                                                        {rank <= 3 ? rank : `#${rank}`}
                                                    </div>
                                                )}
                                            </>
                                        );
                                        const cardClass = "lt-media-card group relative isolate block aspect-[4/5] sm:aspect-square bg-[var(--lt-card-strong)] rounded-2xl overflow-hidden cursor-pointer border border-[var(--lt-border)] hover:border-[var(--lt-accent-border)] transition-colors shadow-lg";
                                        return href ? (
                                            <Link key={item.id} to={href} className={cardClass} data-element-key={item.id}>{cardContent}</Link>
                                        ) : (
                                            <div key={item.id} className={cardClass} data-element-key={item.id}>{cardContent}</div>
                                        );
                                    })}
                                </div>
                            ) : (
                            <div
                                ref={listViewRef}
                                className="rounded-2xl overflow-hidden border border-[var(--lt-border)] bg-[var(--lt-card)] shadow-lg"
                                style={{ position: 'relative', height: `${listVirtualizer.getTotalSize()}px` }}
                            >
                                {listVirtualizer.getVirtualItems().map((virtualRow) => (
                                    <div
                                        key={filteredItems[virtualRow.index].id}
                                        data-index={virtualRow.index}
                                        ref={listVirtualizer.measureElement}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            transform: `translateY(${virtualRow.start - listVirtualizer.options.scrollMargin}px)`,
                                        }}
                                        className={virtualRow.index > 0 ? 'border-t border-[var(--lt-border)]' : ''}
                                    >
                                        <ListItemCard
                                            item={filteredItems[virtualRow.index]}
                                            rank={sortMode === 'rating' ? virtualRow.index + 1 : undefined}
                                            elementKey={filteredItems[virtualRow.index].id}
                                            contextRankLabel={primaryContextRank(contextRanksById.get(filteredItems[virtualRow.index].id), effectiveArea, filteredItemsAll.length)?.label}
                                            isGrid={false}
                                            groupingMode={groupingMode}
                                            listId={listId}
                                            placeFirst={listTitlePlaceFirst}
                                        />
                                    </div>
                                ))}
                            </div>
                            )}

                            {/* Load More Button */}
                            {visibleCount < filteredItemsAll.length && (
                                <div className="mt-8 text-center">
                                    <button
                                        onClick={handleLoadMore}
                                        className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[var(--lt-accent-soft)] hover:opacity-80 border border-[var(--lt-accent-border)] rounded-full text-sm text-[var(--lt-accent)] font-bold transition-opacity"
                                    >
                                        Ver más <span className="font-medium opacity-75">· quedan {filteredItemsAll.length - visibleCount}</span>
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center px-6 py-12 bg-[var(--lt-card)] rounded-3xl border border-dashed border-[var(--lt-border-strong)]">
                            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-[var(--lt-accent)]">
                                {emptyReason === 'none' ? <Trophy className="w-6 h-6" /> : <SearchX className="w-6 h-6" />}
                            </div>
                            <p className="text-[var(--lt-text)] font-display font-bold text-base mb-1">
                                {emptyMessage}
                            </p>
                            <p className="text-xs text-[var(--lt-text-muted)] mb-4">
                                {emptyReason === 'none' ? 'El podio está libre. Alguien tendrá que estrenarlo.' : 'Prueba a quitar algún filtro o a ampliar la zona.'}
                            </p>
                            {emptyReason === 'area' && (
                                <button
                                    type="button"
                                    onClick={() => handleAreaSelect('r:all')}
                                    className="mb-1 px-4 py-2 rounded-full text-sm bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-[var(--lt-accent)] font-bold"
                                >
                                    Ver toda la Lista
                                </button>
                            )}
                            {canAddReview && emptyReason === 'none' && (
                                <button
                                    onClick={handleOpenAddReview}
                                    style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                                    className="lt-on-accent inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--lt-accent)] text-sm font-bold shadow-lg shadow-[var(--lt-accent-shadow)] hover:opacity-90 transition-opacity"
                                >
                                    ¡Añade la primera reseña!
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Add Modal */}
            {
                isAddModalOpen && listId && (
                    <AddReviewForm
                        listId={listId}
                        editReviewId={editingReviewId}
                        lockList={true} // Always lock list on ListPage
                        onClose={() => {
                            setIsAddModalOpen(false);
                            setEditingReviewId(undefined);
                            // Clear param without reload
                            window.history.replaceState({}, '', `/list/${listId}`);
                        }}
                        onSuccess={() => { setIsAddModalOpen(false); setEditingReviewId(undefined); }}
                    />
                )
            }

            {/* Share Modal */}
            {
                isShareModalOpen && list && user && list.userId === user.uid && (
                    <ShareListModal
                        isOpen={isShareModalOpen}
                        onClose={() => setIsShareModalOpen(false)}
                        listId={listId!}
                        listName={list.name}
                        currentGuests={list.guests || []}
                        currentEditors={list.editors || []}
                        ownerId={list.userId}
                        onUpdate={() => {
                            // No reload needed for UI, but if we want to refresh 'list' data in background we can.
                            // For now, we rely on local Modal state updates.
                            // window.location.reload() 
                        }}
                    />
                )
            }

            <ShareModal
                isOpen={isPublicShareModalOpen}
                onClose={() => setIsPublicShareModalOpen(false)}
                title={`Compartir ${list.name}`}
                url={listShareUrl}
                text={`Mira esta ${list.parentListId ? 'minilista' : 'lista'} en Listopic: ${list.name}`}
                shareEntity={{
                    type: list.parentListId ? 'sublist' : 'list',
                    id: list.id,
                    title: list.name,
                    subtitle: listShareSubtitle,
                    route: `/list/${list.id}`,
                    url: listShareUrl,
                    imageUrl: listShareImage,
                    imageUrls: listShareImages,
                    score: list.averageRating || list.avgScore,
                    reviewCount: list.reviewCount,
                    authorId: list.userId,
                    authorName: list.authorName,
                    criteriaStats: listShareCriteria.ponderable,
                    nonPonderableStats: listShareCriteria.nonPonderable,
                    rankItems: listShareTop,
                    elementCount: listShareItems.length,
                    scopeLabel: listShareScope,
                }}
            />

            {/* Sublists Modal (Only for Main Lists) */}
            {
                isSublistsModalOpen && sublists && !list.parentListId && (
                    <SublistsModal
                        isOpen={isSublistsModalOpen}
                        onClose={() => setIsSublistsModalOpen(false)}
                        sublists={sublists}
                        listId={list.id}
                        listName={list.name}
                        parentCriteria={list.criteriaDefinition}
                        parentScoringWeights={list.scoringWeights}
                        parentIsPublic={list.isPublic === true || list.visibility === 'public'}
                        parentTags={list.availableTags}
                    />
                )
            }

            {/* Edit List Modal */}
            {isEditListModalOpen && listId && (
                <EditListModal
                    listId={listId}
                    onClose={() => setIsEditListModalOpen(false)}
                    onSaved={() => navigate(0)}
                    onDeleted={() => navigate(list?.parentListId ? `/list/${list.parentListId}` : '/')}
                />
            )}

            <FilterModal
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                filters={filters}
                setFilters={setFilters}
                criteriaDefinition={list?.criteriaDefinition}
                sortMode={sortMode}
                setSortMode={setSortMode}
                availableTags={availableGroupTags}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
                showUnavailable={showUnavailable}
                setShowUnavailable={setShowUnavailable}
                showBotReviews={showBotReviews}
                setShowBotReviews={setShowBotReviews}
                criticOnly={criticOnly}
                setCriticOnly={setCriticOnly}
                groupByPlace={groupingMode === 'place'}
                setGroupByPlace={(v) => setGroupingMode(v ? 'place' : 'dish')}
                resultCount={filteredItemsAll.length}
            />
        </div >
    );
};
