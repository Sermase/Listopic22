import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { collection, collectionGroup, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, MapPin, List as ListIcon, Plus, X, Camera, Bookmark, Share2, Flag, Image as ImageIcon, ZoomIn, LayoutGrid, Rows3, ChevronUp, ChevronRight, Star, BarChart3 } from 'lucide-react';
import { MarqueeText } from '../components/ui/MarqueeText';
import { scoreBadgeStyle } from '../lib/scoreScale';
import { Lightbox } from '../components/Lightbox';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { NonPonderableGauge } from '../components/NonPonderableGauge';
import { ReportModal } from '../components/ReportModal';
import { ReviewCard } from '../components/ReviewCard';
import { ReviewCardList } from '../components/ReviewCardList';
import { LazyAddReviewForm as AddReviewForm, LazyShareModal as ShareModal } from '../components/lazy';
import { SaveToArchiveModal } from '../components/SaveToArchiveModal';
import { PlacePhotoPlaceholder } from '../components/PlacePhotoPlaceholder';
import { type ReviewEntity } from '../hooks/useListDetails';
import { firstUsablePlaceImage } from '../utils/placeImages';
import { buildPublicRouteUrl } from '../utils/publicUrl';
import { EntityHero } from '../components/EntityHero';
import { ElementRanks } from '../components/ElementRanks';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { itemNameKey, resolvePlaceItemByName, reviewItemId, type PlaceItemLike } from '../lib/placeItems';

import { scoreBadge, scoreTextColor } from '../lib/scoreScale';
import { FeaturedQuote } from '../components/FeaturedQuote';
import { HelpTip } from '../components/HelpTip';
import { compareByUseful } from '../lib/reviewOrder';


// react-router ya entrega el parámetro decodificado: un segundo decode rompe
// con nombres como «100% ternera». Se mantiene por enlaces doblemente codificados.
const safeDecode = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    return 0;
};


export const GroupPage: React.FC = () => {
    const { placeId, itemName } = useParams<{ placeId: string; itemName: string }>();
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const navigate = useNavigate();
    const decodedName = safeDecode(itemName || '');

    // Redirect if no item name
    useEffect(() => {
        if (!itemName && placeId) {
            navigate(`/place/${placeId}`, { replace: true });
        }
    }, [itemName, placeId, navigate]);

    const [heroReady, setHeroReady] = useState(false);
    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [placeName, setPlaceName] = useState('');
    const [placeCity, setPlaceCity] = useState('');
    const [placeClosedStatus, setPlaceClosedStatus] = useState<string | null>(null);
    const [unavailableItems, setUnavailableItems] = useState<string[]>([]);
    const [primaryListCriteria, setPrimaryListCriteria] = useState<any[]>([]); // New: Store definition for ordering
    const [loading, setLoading] = useState(true);
    // El sitio no existe en Listopic (enlace roto o inventado).
    const [placeMissing, setPlaceMissing] = useState(false);

    // Navigation Context
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const fromListId = searchParams.get('listId');
    // Para conservar ?listId=… al redirigir un nombre antiguo al canónico.
    const searchRef = React.useRef(location.search);
    useEffect(() => {
        searchRef.current = location.search;
    }, [location.search]);
    // Elementos de la carta del sitio (solo se leen si el nombre no casa con ninguna reseña).
    const placeItemsRef = React.useRef<{ placeId: string; items: PlaceItemLike[] } | null>(null);
    // Un solo salto por navegación: nunca se encadenan redirecciones.
    const justRedirectedRef = React.useRef(false);
    // Cuenta las cargas: una que ya no es la vigente (otro nombre o página) no redirige.
    const fetchSeqRef = React.useRef(0);

    // Logic for "Valorar"
    const [isFlowOpen, setIsFlowOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

    // Lightbox
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);

    // View mode for reviews
    const [reviewViewMode, setReviewViewMode] = useState<'list' | 'full' | 'gallery'>('list');
    const [groupActiveTab, setGroupActiveTab] = useState<'reviews' | 'photos'>('reviews');
    const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
    const [showListAvg, setShowListAvg] = useState(false);

    // Infinite Scroll
    const [visibleCount, setVisibleCount] = useState(4);
    const loadMoreRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => prev + 5);
            }
        }, { threshold: 0.1 });

        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [reviews, visibleCount]);

    useEffect(() => {
        if (!expandedReviewId) return;
        requestAnimationFrame(() => {
            document
                .getElementById(`expanded-review-${expandedReviewId}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [expandedReviewId]);

    const handleEditReview = (review: ReviewEntity) => {
        setEditingReviewId(review.id);
        setIsFlowOpen(true);
    };

    const fetchData = React.useCallback(async () => {
        if (!placeId || !decodedName) return;
        setLoading(true);
        let redirecting = false;
        const seq = ++fetchSeqRef.current;
        const alreadyRedirected = justRedirectedRef.current;
        justRedirectedRef.current = false;
        try {

            // 1. Fetch Place Details First to get authoritative Name
            const pSnap = await getDoc(doc(db, 'places', placeId));
            let fetchedPlaceName = '';
            let placeData: any = null;
            setPlaceMissing(!pSnap.exists());
            if (pSnap.exists()) {
                placeData = pSnap.data();
                fetchedPlaceName = placeData.name;
                setPlaceName(fetchedPlaceName);
                if (placeData.city) setPlaceCity(placeData.city);
                setPlaceClosedStatus(placeData.closedStatus || null);
                setUnavailableItems(placeData.unavailableItems || []);
            }

            const ownListsSnap = user
                ? await getDocs(query(collection(db, 'lists'), where('userId', '==', user.uid), limit(40)))
                : null;
            const ownListSet = new Set(ownListsSnap ? ownListsSnap.docs.map((d) => d.id) : []);

            const canViewReview = (review: any) => {
                if (review.visibility !== 'private') return true;
                if (!user) return false;
                const reviewListId = (typeof review.listId === 'string' && review.listId)
                    || (typeof review.parentListId === 'string' && review.parentListId)
                    || '';
                return review.userId === user.uid
                    || review.authorId === user.uid
                    || review.ownerId === user.uid
                    || (reviewListId ? ownListSet.has(reviewListId) : false);
            };

            // Una sola query pública de collection group sobre
            // lists/{listId}/reviews. La página es navegable sin sesión.
            const reviewMap = new Map<string, ReviewEntity>();
            try {
                const reviewsSnap = await getDocs(
                    query(
                        collectionGroup(db, 'reviews'),
                        where('placeId', '==', placeId),
                        where('visibility', '==', 'public'),
                        limit(100),
                    )
                );
                reviewsSnap.docs.forEach((reviewDoc) => {
                    const data = reviewDoc.data() as any;
                    const pathParts = reviewDoc.ref.path.split('/');
                    const resolvedListId = (pathParts[0] === 'lists' ? pathParts[1] : '')
                        || data.listId || data.parentListId || '';
                    const review = { id: reviewDoc.id, ...data, listId: resolvedListId } as ReviewEntity;
                    if (!canViewReview(review)) return;
                    reviewMap.set(reviewDoc.id, review);
                });
            } catch (error: any) {
                if (error?.code !== 'permission-denied') {
                    console.warn('Error loading reviews for group page', error);
                }
            }

            const allPlaceReviews = Array.from(reviewMap.values());

            // Misma comparación que la agrupación de las Listas («Bravás!» = «bravas»).
            const targetName = itemNameKey(decodedName);
            const isPlaceGroup = Boolean(fetchedPlaceName) && itemNameKey(fetchedPlaceName) === targetName;

            let feats: ReviewEntity[] = allPlaceReviews.filter(r => {
                if (r.itemName) {
                    return itemNameKey(r.itemName) === targetName;
                }
                // If review has no item name, it belongs to the Place.
                // Include it ONLY if the current Group Page IS the Place Page (TargetName == PlaceName)
                return isPlaceGroup;
            });

            // Ninguna reseña con ese nombre: puede ser un nombre antiguo (renombre,
            // fusión) o el oficial de un elemento cuyas reseñas aún no ha
            // reescrito el servidor. Se resuelve contra la carta del sitio.
            if (feats.length === 0 && !isPlaceGroup && pSnap.exists()) {
                let placeItems = placeItemsRef.current?.placeId === placeId ? placeItemsRef.current.items : null;
                if (!placeItems) {
                    try {
                        const itemsSnap = await getDocs(collection(db, 'places', placeId, 'items'));
                        placeItems = itemsSnap.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }) as PlaceItemLike);
                    } catch (error) {
                        console.warn('Error loading place items for group page', error);
                        placeItems = [];
                    }
                    placeItemsRef.current = { placeId, items: placeItems };
                }
                const item = resolvePlaceItemByName(placeItems, decodedName);
                const canonicalName = typeof item?.canonicalName === 'string' ? item.canonicalName.trim() : '';
                if (item && canonicalName && itemNameKey(canonicalName) !== targetName && !alreadyRedirected
                    && seq === fetchSeqRef.current) {
                    // Los enlaces y favoritos con el nombre antiguo siguen funcionando.
                    redirecting = true;
                    justRedirectedRef.current = true;
                    navigate(`/group/${placeId}/${encodeURIComponent(canonicalName)}${searchRef.current}`, { replace: true });
                    return;
                }
                if (item) {
                    // Reseñas enlazadas al elemento (movidas antes del nuevo modelo o
                    // con el nombre anterior a un renombre).
                    feats = allPlaceReviews.filter(r => Boolean(r.itemName) && reviewItemId(r) === item.id);
                }
            }

            feats.sort(compareByUseful((r: any) => toMillis(r.createdAt)));


            // --- Enrichment: Users & Lists (FIX for missing names) ---
            const userIds = [...new Set(feats.map(r => r.userId || r.authorId).filter(Boolean))] as string[];
            const usersMap: Record<string, any> = {};

            if (userIds.length > 0) {
                await Promise.all(userIds.slice(0, 20).map(async (uid) => {
                    try {
                        const userSnap = await getDoc(doc(db, 'publicProfiles', uid));
                        if (userSnap.exists()) {
                            usersMap[uid] = userSnap.data();
                        }
                    } catch (e) { console.warn("Failed enrich user", uid); }
                }));
            }

            const listIds = [...new Set(feats.map(r => r.listId).filter(Boolean))] as string[];
            const listsMap: Record<string, any> = {};

            if (listIds.length > 0) {
                await Promise.all(listIds.slice(0, 20).map(async (lid) => {
                    try {
                        const lSnap = await getDoc(doc(db, 'lists', lid));
                        if (lSnap.exists()) {
                            listsMap[lid] = lSnap.data();
                        }
                    } catch (e) { console.warn("Failed enrich list", lid); }
                }));
            }

            // Apply Enrichment
            const enriched = feats.map(r => {
                const uid = r.userId || r.authorId;
                const user = uid ? usersMap[uid] : null;
                const listData = r.listId ? listsMap[r.listId] : undefined;
                return {
                    ...r,
                    authorName: user?.username || user?.displayName || user?.name || r.authorName || 'Anónimo',
                    authorPhoto: user?.photoUrl || user?.photoURL || r.authorPhoto,
                    listName: listData?.name || r.listName,
                    criteriaDefinition: listData?.criteriaDefinition || r.criteriaDefinition,
                    tags: (r as any).userTags || r.tags || [],
                    // Enrich Place Data
                    placeMainImage: firstUsablePlaceImage(placeData?.userPhotoUrl, placeData?.mainImageUrl, placeData?.photos),
                    placeName: placeData?.name || r.placeName,
                    placeCity: placeData?.city || (r as any).placeCity
                };
            });

            setReviews(enriched);

        } catch (error) {
            console.error("Error fetching group data", error);
        } finally {
            // Al redirigir al nombre canónico se sigue cargando con el nuevo nombre.
            if (!redirecting) setLoading(false);
        }
    }, [placeId, decodedName, user?.uid, navigate]); // Dependencies for callback

    useEffect(() => {
        fetchData();
        return () => {
            fetchSeqRef.current += 1;
        };
    }, [fetchData]);

    // Aggregate Stats (Overall + Criteria) - REFACTORED to use Primary List Order
    const stats = useMemo(() => {
        if (!reviews.length) return null;

        let totalRating = 0;
        const criteriaSums: Record<string, number> = {};
        const criteriaCounts: Record<string, number> = {};
        const labels: Record<string, string> = {};
        const tagCounts: Record<string, number> = {};

        reviews.forEach(r => {
            totalRating += (r.overallRating || 0);

            // Aggregate Criteria
            if (r.scores) {
                Object.entries(r.scores).forEach(([k, v]) => {
                    criteriaSums[k] = (criteriaSums[k] || 0) + v;
                    criteriaCounts[k] = (criteriaCounts[k] || 0) + 1;

                    // Try to get label from review if not yet found
                    if (!labels[k] && r.criteriaDefinition) {
                        if (Array.isArray(r.criteriaDefinition)) {
                            const found = r.criteriaDefinition.find((c: any) => c.id === k);
                            if (found) labels[k] = found.label;
                        } else {
                            labels[k] = r.criteriaDefinition[k]?.label;
                        }
                    }
                    if (!labels[k]) labels[k] = k; // Fallback
                });
            }

            // Aggregate Tags
            const tags = (r as any).userTags || r.tags || [];
            if (Array.isArray(tags)) {
                tags.forEach((t: string) => {
                    if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
            }
        });

        const avg = totalRating / reviews.length;

        // Process Criteria using PRIMARY LIST ORDER if available
        const orderedCriteria: { key: string, label: string, avg: number, count: number, isPonderable: boolean, step: number }[] = [];
        const processedKeys = new Set();
        const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

        // 1. Add keys from Primary List in order
        if (primaryListCriteria.length > 0) {
            primaryListCriteria.forEach(pc => {
                const k = pc.id;
                if (criteriaCounts[k]) { // Only if we have data for it
                    orderedCriteria.push({
                        key: k,
                        label: pc.label || labels[k] || k, // Prefer primary list label
                        avg: criteriaSums[k] / criteriaCounts[k],
                        count: criteriaCounts[k],
                        isPonderable: pc.ponderable !== false && pc.isPonderable !== false,
                        step: pc.step || 0.1
                    });
                    processedKeys.add(k);
                }
            });
        }

        // 2. Add remaining keys (orphaned or from other lists)
        Object.keys(criteriaSums)
            .sort((a, b) => collator.compare(labels[a] || a, labels[b] || b))
            .forEach(k => {
                if (!processedKeys.has(k)) {
                    orderedCriteria.push({
                        key: k,
                        label: labels[k] || k,
                        avg: criteriaSums[k] / criteriaCounts[k],
                        count: criteriaCounts[k],
                        isPonderable: true, // Default to true if unknown
                        step: 0.1
                    });
                }
            });

        // Split into Ponderable / Non-Ponderable
        const ponderable = orderedCriteria.filter(c => c.isPonderable);
        const nonPonderable = orderedCriteria.filter(c => !c.isPonderable);

        // Process Tags (50% Rule)
        const minThreshold = Math.ceil(reviews.length / 2);
        const consensusTags = Object.entries(tagCounts)
            .filter(([_, count]) => count >= minThreshold)
            .map(([tag]) => tag).sort();

        // Collect Photos
        const photos = reviews.flatMap((r) => {
            if (Array.isArray(r.photoUrls) && r.photoUrls.length > 0) return r.photoUrls;
            return r.photoUrl ? [r.photoUrl] : [];
        }).filter(Boolean) as string[];

        return {
            avg,
            count: reviews.length,
            mainPhoto: photos[0] || null,
            photos,
            ponderable,
            nonPonderable,
            tags: consensusTags
        };
    }, [reviews, primaryListCriteria]);

    // Aggregate Lists
    const relatedLists = useMemo(() => {
        return [...new Set(reviews.map(r => r.listId).filter(Boolean))];
    }, [reviews]);

    const lockedListId = fromListId || relatedLists[0] || null;

    const openAddReviewFlow = () => {
        if (!user) {
            openAuthPrompt('añadir una reseña');
            return;
        }
        setSelectedListId(lockedListId);
        setIsFlowOpen(true);
    };

    const openSaveModal = () => {
        if (!user) {
            openAuthPrompt('guardar este elemento');
            return;
        }
        setIsSaveModalOpen(true);
    };

    const openReportModal = () => {
        if (!user) {
            openAuthPrompt('reportar este elemento');
            return;
        }
        setShowReportModal(true);
    };

    const [listsDetails, setListsDetails] = useState<{ id: string, name: string, author: string, parentListId?: string }[]>([]);

    // List Comparison States
    const [listStats, setListStats] = useState<Record<string, number> | null>(null);
    const [primaryListName, setPrimaryListName] = useState('');

    // Fetch Details for Related Lists
    useEffect(() => {
        const fetchListDetails = async () => {
            const details: any[] = [];
            for (const lid of relatedLists.slice(0, 5)) {
                try {
                    const s = await getDoc(doc(db, 'lists', lid));
                    if (s.exists()) {
                        const d = s.data();
                        details.push({
                            id: lid,
                            name: d.name,
                            author: d.authorName,
                            parentListId: d.parentListId,
                            photoUrl: d.photoUrl || d.mainImageUrl || d.thumbnailUrl || d.coverUrl || d.imageUrl || undefined
                        });
                    }
                } catch (e) {
                    console.warn("Failed to load related list details", { listId: lid, error: e });
                }
            }
            setListsDetails(details);
        };
        if (relatedLists.length > 0) fetchListDetails();
    }, [relatedLists]);

    // Fetch Stats for Primary Comparison List
    useEffect(() => {
        const fetchListStats = async () => {
            if (relatedLists.length === 0) return;
            const primaryId = relatedLists[0]; // Pick the first list

            try {
                // Get List Name & Definition
                const lSnap = await getDoc(doc(db, 'lists', primaryId));
                if (lSnap.exists()) {
                    const data = lSnap.data();
                    setPrimaryListName(data.name);

                    // Extract Criteria Definition (Array vs Map)
                    let criteriaDef: any[] = [];
                    if (data.criteriaDefinition) {
                        if (Array.isArray(data.criteriaDefinition)) {
                            criteriaDef = data.criteriaDefinition;
                        } else {
                            const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
                            criteriaDef = Object.keys(data.criteriaDefinition)
                                .sort((a, b) => {
                                    const labelA = data.criteriaDefinition[a]?.label || a;
                                    const labelB = data.criteriaDefinition[b]?.label || b;
                                    return collator.compare(labelA, labelB);
                                })
                                .map(k => ({
                                    id: k,
                                    ...data.criteriaDefinition[k]
                                }));
                        }
                    }
                    setPrimaryListCriteria(criteriaDef);
                }

                const isPrimaryOwner = !!(user && lSnap.exists() && lSnap.data().userId === user.uid);
                const canUseForStats = (review: any) => {
                    if (review.visibility !== 'private') return true;
                    if (!user) return false;
                    return isPrimaryOwner
                        || review.userId === user.uid
                        || review.authorId === user.uid
                        || review.ownerId === user.uid;
                };

                // Solo reseñas públicas y con límite: leer la subcolección entera no
                // escala y, si la lista contiene alguna privada, las reglas deniegan
                // la consulta completa a quien no es el dueño.
                const nestedSnap = await getDocs(query(
                    collection(db, 'lists', primaryId, 'reviews'),
                    where('visibility', '==', 'public'),
                    limit(300),
                )).catch(() => null);

                const reviewMap = new Map<string, ReviewEntity>();
                const append = (snap: any) => {
                    if (!snap) return;
                    snap.docs.forEach((reviewDoc: any) => {
                        const data = reviewDoc.data() as any;
                        const review = {
                            id: reviewDoc.id,
                            ...data,
                            listId: data.listId || primaryId
                        } as ReviewEntity;
                        if (!canUseForStats(review)) return;
                        reviewMap.set(reviewDoc.id, review);
                    });
                };

                append(nestedSnap);
                const lReviews = Array.from(reviewMap.values());

                if (lReviews.length === 0) return;

                const avgs: Record<string, number> = {};
                const counts: Record<string, number> = {};

                lReviews.forEach(r => {
                    if (r.scores) {
                        Object.entries(r.scores).forEach(([k, v]) => {
                            avgs[k] = (avgs[k] || 0) + v;
                            counts[k] = (counts[k] || 0) + 1;
                        });
                    }
                });

                Object.keys(avgs).forEach(k => {
                    avgs[k] = avgs[k] / (counts[k] || 1);
                });

                setListStats(avgs);

            } catch (e) {
                console.error("Error fetching comparison stats", e);
            }
        };
        fetchListStats();
    }, [relatedLists, user?.uid]);


    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--lt-bg)] animate-pulse">
                <div className="h-[40vh] min-h-[300px] bg-[var(--lt-card)] animate-hero-from-left" />
                <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 relative z-10">
                    <div className="h-10 bg-[var(--lt-card-strong)] rounded-xl w-2/3 mb-3" />
                    <div className="h-5 bg-[var(--lt-card)] rounded-lg w-1/3 mb-8" />
                    <div className="flex gap-3 mb-8">
                        <div className="h-16 flex-1 bg-[var(--lt-card-strong)] rounded-2xl" />
                        <div className="h-16 flex-1 bg-[var(--lt-card-strong)] rounded-2xl" />
                        <div className="h-16 flex-1 bg-[var(--lt-card-strong)] rounded-2xl" />
                    </div>
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-28 bg-[var(--lt-card)] border border-[var(--lt-border)] rounded-2xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Sin sitio y sin reseñas: no hay nada que enseñar (ni que valorar).
    if (placeMissing && reviews.length === 0) {
        return (
            <div className="min-h-screen pt-safe-32 px-4 text-center bg-[var(--lt-bg)]">
                <span className="w-16 h-16 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex items-center justify-center mx-auto mb-4">
                    <MapPin className="w-8 h-8 text-[var(--lt-accent)]" />
                </span>
                <h2 className="text-xl md:text-2xl font-display font-bold text-[var(--lt-text)] mb-2">Elemento no encontrado</h2>
                <p className="text-[var(--lt-text-muted)] mb-6 max-w-sm mx-auto text-sm">
                    Este enlace no lleva a ningún sitio de Listopic. Puede que lo hayan borrado o que el enlace esté incompleto.
                </p>
                <Link to="/search" className="inline-flex px-5 py-2.5 rounded-xl text-sm font-bold lt-on-accent shadow-lg shadow-[var(--lt-accent-shadow)] hover:opacity-90 transition-opacity" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>
                    Volver a buscar
                </Link>
            </div>
        );
    }



    const handleDeleteReview = (deletedId: string) => {
        // 1. Remove locally
        const updated = reviews.filter(r => r.id !== deletedId);
        setReviews(updated);

        // 2. Refresh stats? (Handled by useMemo)

        // 3. Redirect if empty
        if (updated.length === 0) {
            // Try to find where to go.
            // If we came from a list (URL param), go back there.
            // If not, try to use the deleted review's listId.
            const lastReview = reviews.find(r => r.id === deletedId);
            const targetListId = fromListId || lastReview?.listId;

            if (targetListId) {
                navigate(`/list/${targetListId}`);
            } else {
                // Fallback: Go to place page or home
                navigate(`/place/${placeId}`);
            }
        }
    };

    const groupRoute = `/group/${placeId}/${encodeURIComponent(decodedName)}`;
    const groupShareUrl = buildPublicRouteUrl(groupRoute);

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-20">
            {/* Hero */}
            <EntityHero
                imageUrl={stats?.mainPhoto}
                alt={decodedName}
                ready={heroReady}
                onImageLoad={() => setHeroReady(true)}
                fallback={<PlacePhotoPlaceholder compact variant="group" />}
            >

                        {/* Title & Place Info */}
                        <div className="lt-entity-hero-title flex-1">
                            <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-[var(--lt-hero-title)] mb-2 leading-tight line-clamp-2">{decodedName}</h1>
                            {placeClosedStatus && (
                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mb-2 mr-2 border backdrop-blur-md ${placeClosedStatus === 'permanently_closed'
                                    ? 'bg-[var(--lt-danger-soft)] border-[var(--lt-danger)]/40 text-[var(--lt-danger)]'
                                    : 'bg-[var(--lt-warning-soft)] border-[var(--lt-warning)]/40 text-[var(--lt-warning)]'
                                    }`}>
                                    ⚠ {placeClosedStatus === 'permanently_closed' ? 'Cerrado permanentemente' : 'Cerrado temporalmente'}
                                </div>
                            )}
                            {unavailableItems.includes(decodedName) && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mb-2 border backdrop-blur-md bg-[var(--lt-glass)] border-[var(--lt-border-strong)] text-[var(--lt-text-muted)]">
                                    ✕ No disponible actualmente
                                </div>
                            )}
                            <Link to={`/place/${placeId}`} className="group/place inline-flex max-w-full items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1 bg-[var(--lt-glass)] border border-[var(--lt-border-strong)] backdrop-blur-md text-sm md:text-base text-[var(--lt-text)] font-semibold hover:border-[var(--lt-accent-border)] transition-colors">
                                <span className="w-6 h-6 rounded-full bg-[var(--lt-accent-soft)] flex items-center justify-center shrink-0">
                                    <MapPin className="w-3.5 h-3.5 text-[var(--lt-accent)]" />
                                </span>
                                <MarqueeText text={placeName || 'Lugar Desconocido'} className="min-w-0" />
                                {placeCity && <span className="hidden sm:inline shrink-0 text-xs font-medium text-[var(--lt-text-muted)]">· {placeCity}</span>}
                                <ChevronRight className="w-4 h-4 shrink-0 text-[var(--lt-text-muted)] group-hover/place:text-[var(--lt-accent)] transition-colors" />
                            </Link>
                        </div>

                        {/* Nota del elemento y acción principal en una fila; etiquetas debajo */}
                        {stats && (
                            <div className="flex flex-col items-stretch gap-2 md:items-end">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="flex min-w-0 items-center gap-2 pl-1 pr-3 py-1 rounded-full text-sm font-bold border border-[var(--lt-border-strong)] bg-[var(--lt-glass)] backdrop-blur-md text-[var(--lt-text)]"
                                        title="Media de las reseñas de este elemento en sus Listas."
                                    >
                                        <span className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-full" style={scoreBadgeStyle(stats.avg)}>
                                            <Star className="w-3.5 h-3.5 fill-current" aria-hidden />
                                            {stats.avg.toFixed(1)}
                                        </span>
                                        <span className="truncate text-xs font-semibold text-[var(--lt-text-muted)]">
                                            {stats.count} {stats.count === 1 ? 'reseña' : 'reseñas'}
                                        </span>
                                    </span>
                                    <button
                                        onClick={openAddReviewFlow}
                                        className="ml-auto shrink-0 px-4 py-2 lt-on-accent text-sm font-bold rounded-xl shadow-lg shadow-[var(--lt-accent-shadow)] flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all md:ml-2"
                                        style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>Valorar</span>
                                    </button>
                                </div>

                                {stats.tags && stats.tags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                        {stats.tags.map(tag => (
                                            <span key={tag} className="px-2.5 py-0.5 rounded-full bg-[var(--lt-glass)] border border-[var(--lt-border-strong)] text-[var(--lt-text)] text-xs font-medium backdrop-blur-md">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
            </EntityHero>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 relative z-20 -mt-8 sm:-mt-12 flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8">

                <div className="order-1 lg:col-span-4 lg:order-last space-y-4 sm:space-y-6">

                    {/* Puesto principal y, en pequeño, los más amplios */}
                    {placeId && (
                        <ElementRanks
                            placeId={placeId}
                            itemName={decodedName}
                            listIds={lockedListId ? [lockedListId, ...relatedLists.filter((id) => id !== lockedListId)] : relatedLists}
                            listNames={Object.fromEntries(listsDetails.map((l) => [l.id, l.name]))}
                        />
                    )}

                    {/* Acciones: pequeñas, en una fila */}
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={openSaveModal} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--lt-border)] bg-[var(--lt-card)] px-3 text-xs font-bold text-[var(--lt-text)] transition-colors hover:border-[var(--lt-accent-border)]">
                            <Bookmark className="h-4 w-4 text-[var(--lt-accent)]" /> Guardar
                        </button>
                        <button type="button" onClick={() => setIsShareModalOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--lt-border)] bg-[var(--lt-card)] px-3 text-xs font-bold text-[var(--lt-text)] transition-colors hover:border-[var(--lt-accent-border)]">
                            <Share2 className="h-4 w-4 text-[var(--lt-accent)]" /> Compartir
                        </button>
                        <button type="button" onClick={openReportModal} aria-label="Reportar" title="Reportar" className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--lt-text-muted)] transition-colors hover:bg-[var(--lt-danger-soft)] hover:text-[var(--lt-danger)]">
                            <Flag className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Una frase de la gente, antes de las notas */}
                    <FeaturedQuote reviews={reviews} onSeeAll={() => document.getElementById('resenas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

                    {/* 1. Detailed Stats (Refactored) */}
                    {stats && (stats.ponderable.length > 0 || stats.nonPonderable.length > 0) && (
                        <section className="bg-[var(--lt-card-strong)] rounded-2xl border border-[var(--lt-border)] p-4 sm:p-5">
                            <div className="mb-4">
                                <h3 className="flex items-center gap-2 text-base md:text-lg font-display font-bold leading-tight text-[var(--lt-text)]">
                                    <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                        <BarChart3 className="w-3.5 h-3.5" />
                                    </span>
                                    Puntuaciones
                                    <HelpTip topic="criterios" />
                                </h3>
                                {listStats && primaryListName && (
                                    <button
                                        type="button"
                                        onClick={() => setShowListAvg((v) => !v)}
                                        aria-pressed={showListAvg}
                                        className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                                    >
                                        <span className="inline-block w-1 h-3 rounded-full bg-[var(--lt-text-muted)] opacity-60 shrink-0" aria-hidden />
                                        <span className="truncate">{showListAvg ? `La marca es la media de «${primaryListName}»` : `Comparar con «${primaryListName}»`}</span>
                                    </button>
                                )}
                            </div>

                            {/* Ponderable (Charts) */}
                            <div className="space-y-4">
                                {stats.ponderable.map((c, i) => {
                                    const listAvg = showListAvg ? listStats?.[c.key] : undefined;
                                    return (
                                        <div key={c.key}>
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-[var(--lt-text-muted)] text-xs font-semibold">{c.label}</span>
                                                <div className="flex items-center gap-2">
                                                    {listAvg && (
                                                        <span className="text-[10px] text-[var(--lt-text-muted)]" title="Media de este criterio en toda la lista">
                                                            media lista {listAvg.toFixed(1)}
                                                        </span>
                                                    )}
                                                    <span className="font-bold tabular-nums text-sm" style={{ color: scoreTextColor(c.avg) }}>{c.avg.toFixed(1)}</span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-[var(--lt-border)] rounded-full overflow-hidden relative">
                                                {/* List Avg Marker */}
                                                {listAvg && (
                                                    <div
                                                        className="absolute top-0 bottom-0 w-1 rounded-full bg-[var(--lt-text-muted)] opacity-70 z-10"
                                                        style={{ left: `${Math.min(listAvg * 10, 100)}%` }}
                                                    />
                                                )}
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${c.avg * 10}%`, backgroundColor: scoreBadge(c.avg).bg }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Non-Ponderable (Gauges) */}
                            {stats.nonPonderable.length > 0 && (
                                <div className="mt-5 pt-4 border-t border-[var(--lt-border)]">
                                    <h4 className="text-xs font-bold text-[var(--lt-text-muted)] mb-3">Otros detalles</h4>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                        {stats.nonPonderable.map((c) => (
                                            <NonPonderableGauge key={c.key} score={c.avg} label={c.label} size={70} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* 2. Lists */}
                    {listsDetails.length > 0 && (
                        <section className="bg-[var(--lt-card-strong)] rounded-2xl border border-[var(--lt-border)] p-4 sm:p-5">
                            <h3 className="mb-3 flex items-center gap-2 text-base md:text-lg font-display font-bold leading-tight text-[var(--lt-text)]">
                                <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                    <ListIcon className="w-3.5 h-3.5" />
                                </span>
                                En estas listas
                            </h3>
                            <div className="space-y-1">
                                {listsDetails.slice(0, 5).map((l: any) => (
                                    <Link key={l.id} to={`/list/${l.id}`} className="block group">
                                        <div className="flex items-center gap-3 p-2 -mx-2 rounded-xl transition-colors border border-transparent hover:bg-[var(--lt-card)] hover:border-[var(--lt-border)]">
                                            {/* Thumbnail */}
                                            <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-[var(--lt-accent-soft)] border border-[var(--lt-border)]">
                                                {l.photoUrl ? (
                                                    <ProgressiveImage
                                                        src={l.photoUrl}
                                                        alt={l.name}
                                                        containerClassName="w-full h-full"
                                                        className="w-full h-full object-cover"
                                                        fallback={
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <ListIcon className={`w-5 h-5 ${l.parentListId ? 'text-[var(--lt-accent-2)]' : 'text-[var(--lt-accent)]'}`} />
                                                            </div>
                                                        }
                                                    />
                                                ) : (
                                                    <ListIcon className={`w-5 h-5 ${l.parentListId ? 'text-[var(--lt-accent-2)]' : 'text-[var(--lt-accent)]'}`} />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <MarqueeText
                                                        text={l.name || 'Lista'}
                                                        className={`min-w-0 font-bold text-sm transition-colors ${l.parentListId ? 'text-[var(--lt-accent-2)]' : 'text-[var(--lt-text)] group-hover:text-[var(--lt-accent)]'}`}
                                                    />
                                                    {l.parentListId && (
                                                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--lt-accent-soft)] text-[var(--lt-accent-2)] uppercase tracking-wide font-bold">Sub</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-[var(--lt-text-muted)] truncate mt-0.5">
                                                    {l.itemCount ? `${l.itemCount} lugares` : 'Ver lista'}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 shrink-0 text-[var(--lt-text-muted)] group-hover:text-[var(--lt-accent)] transition-colors" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* Main Content (Left) */}
                <div id="resenas" className="order-2 lg:col-span-8 lg:order-first scroll-mt-24">

                    {/* Cabecera de sección: pestañas y vista en una fila (las pestañas ya titulan la sección) */}
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex min-w-0 gap-1 p-1 rounded-full bg-[var(--lt-card)] border border-[var(--lt-border)] overflow-x-auto hide-scrollbar">
                            <button
                                onClick={() => setGroupActiveTab('reviews')}
                                className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-full flex items-center gap-1.5 transition-all whitespace-nowrap ${groupActiveTab === 'reviews'
                                    ? 'lt-on-accent shadow-md shadow-[var(--lt-accent-shadow)]'
                                    : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'
                                    }`}
                                style={groupActiveTab === 'reviews' ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}
                            >
                                <MessageSquare className="w-3.5 h-3.5" /> Reseñas ({reviews.length})
                            </button>
                            {stats && stats.photos.length > 0 && (
                                <button
                                    onClick={() => setGroupActiveTab('photos')}
                                    className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-full flex items-center gap-1.5 transition-all whitespace-nowrap ${groupActiveTab === 'photos'
                                        ? 'lt-on-accent shadow-md shadow-[var(--lt-accent-shadow)]'
                                        : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'
                                        }`}
                                    style={groupActiveTab === 'photos' ? { backgroundImage: 'var(--lt-accent-grad)' } : undefined}
                                >
                                    <ImageIcon className="w-3.5 h-3.5" /> Fotos ({stats.photos.length})
                                </button>
                            )}
                        </div>
                        {groupActiveTab === 'reviews' && reviews.length > 0 && (
                            <div className="flex shrink-0 bg-[var(--lt-card)] rounded-full p-1 border border-[var(--lt-border)]">
                                <button
                                    onClick={() => setReviewViewMode('list')}
                                    className={`h-7 w-7 flex items-center justify-center rounded-full transition-all ${reviewViewMode === 'list' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                    title="Vista lista"
                                    aria-label="Vista lista"
                                >
                                    <ListIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setReviewViewMode('full')}
                                    className={`h-7 w-7 flex items-center justify-center rounded-full transition-all ${reviewViewMode === 'full' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                    title="Vista detallada"
                                    aria-label="Vista detallada"
                                >
                                    <Rows3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setReviewViewMode('gallery')}
                                    className={`h-7 w-7 flex items-center justify-center rounded-full transition-all ${reviewViewMode === 'gallery' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                    title="Vista galería"
                                    aria-label="Vista galería"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Photos Tab */}
                    {groupActiveTab === 'photos' && stats && stats.photos.length > 0 && (
                        <div className="animate-fade-in">
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                                {stats.photos.map((url, i) => (
                                    <div
                                        key={i}
                                        onClick={() => { setLightboxIndex(i); setIsLightboxOpen(true); }}
                                        className="aspect-square rounded-2xl overflow-hidden cursor-pointer bg-[var(--lt-card)] relative group border border-[var(--lt-border)]"
                                    >
                                        <ProgressiveImage
                                            src={url}
                                            alt={`Foto ${i}`}
                                            containerClassName="w-full h-full"
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            fallback={
                                                <div className="w-full h-full flex items-center justify-center bg-[var(--lt-card)]">
                                                    <ImageIcon className="w-6 h-6 text-[var(--lt-text-muted)] opacity-50" />
                                                </div>
                                            }
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <ZoomIn className="w-6 h-6 text-white drop-shadow-md" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Lightbox
                                isOpen={isLightboxOpen}
                                onClose={() => setIsLightboxOpen(false)}
                                images={stats.photos}
                                initialIndex={lightboxIndex}
                            />
                        </div>
                    )}

                    {/* Reviews Tab */}
                    {groupActiveTab === 'reviews' && (<>

                        {/* Reviews Grid */}
                        {reviews.length > 0 ? (
                            reviewViewMode === 'full' ? (
                                <div className="grid grid-cols-1 gap-4 animate-fade-in">
                                    {reviews.slice(0, visibleCount).map(review => (
                                        <ReviewCard key={review.id} review={review} onDelete={handleDeleteReview} onEdit={handleEditReview} placeClosedStatus={placeClosedStatus || undefined} />
                                    ))}
                                    {visibleCount < reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]"></div>
                                        </div>
                                    )}
                                </div>
                            ) : reviewViewMode === 'gallery' ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2 animate-fade-in">
                                    {reviews.slice(0, visibleCount).map(review => {
                                        const score = review.overallRating || 0;
                                        const photoSrc = review.photoUrl || (review as any).placeMainImage || null;
                                        const isPlaceImg = !review.photoUrl && !!(review as any).placeMainImage;
                                        const isExpanded = expandedReviewId === review.id;

                                        if (isExpanded) {
                                            return (
                                                <div id={`expanded-review-${review.id}`} key={review.id} className="col-span-3 sm:col-span-4 lg:col-span-5 scroll-mt-24 mb-4 animate-fade-in flex flex-col">
                                                    <button
                                                        onClick={() => setExpandedReviewId(null)}
                                                        className="self-center mb-3 flex items-center gap-2 px-4 py-1.5 bg-[var(--lt-accent-soft)] hover:opacity-80 text-[var(--lt-accent)] text-sm font-bold rounded-full transition-opacity border border-[var(--lt-accent-border)]"
                                                        aria-label="Plegar reseña"
                                                    >
                                                        <ChevronUp className="w-4 h-4" />
                                                        <span>Cerrar reseña</span>
                                                    </button>
                                                    <ReviewCard review={review} onDelete={handleDeleteReview} onEdit={handleEditReview} placeClosedStatus={placeClosedStatus || undefined} />
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={review.id}
                                                onClick={() => setExpandedReviewId(review.id)}
                                                className="lt-media-card group relative aspect-square bg-[var(--lt-card)] rounded-2xl overflow-hidden cursor-pointer border border-[var(--lt-border)] hover:border-[var(--lt-accent-border)] transition-colors"
                                            >
                                                {photoSrc ? (
                                                    <ProgressiveImage
                                                        src={photoSrc}
                                                        alt={(review as any).authorName || ''}
                                                        containerClassName="w-full h-full"
                                                        className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${isPlaceImg ? 'opacity-40 saturate-50' : ''}`}
                                                        fallback={
                                                            <div className="w-full h-full bg-[var(--lt-accent-soft)] flex items-center justify-center">
                                                                <MessageSquare className="w-6 h-6 text-[var(--lt-accent)] opacity-60" />
                                                            </div>
                                                        }
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-[var(--lt-accent-soft)] flex items-center justify-center">
                                                        <MessageSquare className="w-6 h-6 text-[var(--lt-accent)] opacity-60" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2 pb-1.5 pt-6">
                                                    <MarqueeText text={(review as any).authorName || 'Anónimo'} className="block text-[10px] sm:text-xs text-white font-bold leading-tight" />
                                                </div>
                                                <span
                                                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-bold tabular-nums shadow-lg"
                                                    style={scoreBadgeStyle(score)}
                                                >
                                                    {score.toFixed(1)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {visibleCount < reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center col-span-3 sm:col-span-4 lg:col-span-5">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]"></div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 animate-fade-in">
                                    {reviews.slice(0, visibleCount).map(review => (
                                        <ReviewCardList
                                            key={review.id}
                                            review={review}
                                            onDelete={handleDeleteReview}
                                            onEdit={handleEditReview}
                                            placeClosedStatus={placeClosedStatus || undefined}
                                            hidePlaceName
                                        />
                                    ))}
                                    {visibleCount < reviews.length && (
                                        <div ref={loadMoreRef} className="py-4 flex justify-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]"></div>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <div className="p-6 sm:p-8 bg-[var(--lt-card-strong)] rounded-3xl border border-dashed border-[var(--lt-border-strong)] text-center animate-fade-in">
                                <span className="w-14 h-14 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex items-center justify-center mx-auto mb-4">
                                    <MessageSquare className="w-7 h-7 text-[var(--lt-accent)]" />
                                </span>
                                <h3 className="text-lg font-display font-bold text-[var(--lt-text)] mb-1.5">Sé el primero en opinar</h3>
                                <p className="text-[var(--lt-text-muted)] mb-5 text-sm max-w-xs mx-auto">Nadie ha escrito una reseña detallada sobre este plato aún.</p>
                                <button
                                    onClick={openAddReviewFlow}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 lt-on-accent rounded-xl text-sm font-bold transition-opacity hover:opacity-90 shadow-lg shadow-[var(--lt-accent-shadow)]"
                                    style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                                >
                                    <Plus className="w-4 h-4" /> Valorar
                                </button>
                            </div>
                        )}
                    </>)}
                </div>
            </main>

            {/* Modals */}
            {
                isFlowOpen && (
                    <AddReviewForm
                        listId={selectedListId || lockedListId}
                        onListChange={setSelectedListId}
                        prefillPlaceId={placeId}
                        prefillItemName={decodedName}
                        editReviewId={editingReviewId || undefined}
                        lockList={!!(selectedListId || lockedListId)} // Always lock when group is associated to a concrete list
                        onClose={() => {
                            setIsFlowOpen(false);
                            setSelectedListId(null);
                            setEditingReviewId(null);
                        }}
                        onSuccess={() => fetchData()}
                    />
                )
            }

            <SaveToArchiveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                item={{
                    itemId: `${placeId}_${decodedName}`, // Composite ID for group
                    type: 'group',
                    name: decodedName,
                    subtitle: placeName,
                    route: groupRoute,
                    photoUrl: stats?.mainPhoto || undefined,
                    placeId: placeId
                }}
            />

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                title={`Compartir ${decodedName}`}
                text={`Mira lo que dicen sobre ${decodedName} en ${placeName}!`}
                url={groupShareUrl}
                shareEntity={{
                    type: 'group',
                    id: `${placeId}_${decodedName}`,
                    title: decodedName,
                    subtitle: placeName || 'Grupo',
                    route: groupRoute,
                    url: groupShareUrl,
                    imageUrl: stats?.mainPhoto || undefined,
                    imageUrls: stats?.photos || [],
                    score: stats?.avg,
                    reviewCount: stats?.count,
                    criteriaStats: stats
                        ? stats.ponderable
                            .slice(0, 6)
                            .map((criterion) => ({
                                key: criterion.key,
                                label: criterion.label,
                                score: criterion.avg,
                                count: criterion.count,
                            }))
                        : [],
                    nonPonderableStats: stats
                        ? stats.nonPonderable
                            .slice(0, 6)
                            .map((criterion) => ({
                                key: criterion.key,
                                label: criterion.label,
                                score: criterion.avg,
                                count: criterion.count,
                            }))
                        : [],
                    referenceCriteriaStats: listStats
                        ? [...stats?.ponderable || [], ...stats?.nonPonderable || []]
                            .slice(0, 6)
                            .map((criterion) => ({
                                key: criterion.key,
                                label: criterion.label,
                                score: listStats[criterion.key] || 0,
                            }))
                            .filter((criterion) => Number.isFinite(criterion.score) && criterion.score > 0)
                        : [],
                    referenceLabel: primaryListName || 'Media de la lista',
                    tags: stats?.tags,
                    city: placeCity || undefined,
                }}
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetId={`${placeId}_${decodedName}`}
                targetName={decodedName}
                itemName={placeName}
                targetType="group"
            />
        </div >
    );
};
