import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, MapPin, List as ListIcon, Plus, X, Camera, Bookmark, Share2, Flag, Image as ImageIcon, ZoomIn, LayoutGrid, Rows3, ChevronUp } from 'lucide-react';
import { Lightbox } from '../components/Lightbox';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { NonPonderableGauge } from '../components/NonPonderableGauge';
import { ReportModal } from '../components/ReportModal';
import { ReviewCard } from '../components/ReviewCard';
import { ReviewCardList } from '../components/ReviewCardList';
import { AddReviewForm } from '../components/AddReviewForm';
import { SaveToArchiveModal } from '../components/SaveToArchiveModal';
import { ShareModal } from '../components/ShareModal';
import { PlacePhotoPlaceholder } from '../components/PlacePhotoPlaceholder';
import { type ReviewEntity } from '../hooks/useListDetails';
import { firstUsablePlaceImage } from '../utils/placeImages';
import { buildPublicRouteUrl } from '../utils/publicUrl';
import { EntityHero } from '../components/EntityHero';

// Helper for Criteria Colors
const getScoreColor = (score: number) => {
    if (score >= 9) return 'from-emerald-400 to-emerald-600';
    if (score >= 7) return 'from-indigo-400 to-indigo-600';
    if (score >= 5) return 'from-yellow-400 to-yellow-600';
    return 'from-red-400 to-red-600';
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
    const navigate = useNavigate();
    const decodedName = decodeURIComponent(itemName || '');

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

    // Navigation Context
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const fromListId = searchParams.get('listId');

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
        try {
            console.log("Fetching Group Data for:", { placeId, decodedName });

            // 1. Fetch Place Details First to get authoritative Name
            const pSnap = await getDoc(doc(db, 'places', placeId));
            let fetchedPlaceName = '';
            let placeData: any = null;
            if (pSnap.exists()) {
                placeData = pSnap.data();
                fetchedPlaceName = placeData.name;
                setPlaceName(fetchedPlaceName);
                if (placeData.city) setPlaceCity(placeData.city);
                setPlaceClosedStatus(placeData.closedStatus || null);
                setUnavailableItems(placeData.unavailableItems || []);
            }

            const [publicListsSnap, followingListsSnap, ownListsSnap] = await Promise.all([
                getDocs(query(collection(db, 'lists'), where('isPublic', '==', true), limit(60))),
                user ? getDocs(query(collection(db, 'users', user.uid, 'followingLists'), limit(60))) : Promise.resolve(null),
                user ? getDocs(query(collection(db, 'lists'), where('userId', '==', user.uid), limit(40))) : Promise.resolve(null)
            ]);

            const ownListSet = new Set(ownListsSnap ? ownListsSnap.docs.map((d) => d.id) : []);
            const candidateListIds = Array.from(new Set([
                ...publicListsSnap.docs.map((d) => d.id),
                ...(followingListsSnap ? followingListsSnap.docs.map((d) => d.id) : []),
                ...(ownListsSnap ? ownListsSnap.docs.map((d) => d.id) : [])
            ])).slice(0, 80);

            const reviewsByList = await Promise.all(candidateListIds.map(async (candidateListId) => {
                try {
                    const listReviewsSnap = await getDocs(
                        query(collection(db, 'lists', candidateListId, 'reviews'), where('placeId', '==', placeId), limit(25))
                    );
                    return listReviewsSnap.docs.map((reviewDoc) => ({
                        id: reviewDoc.id,
                        ...(reviewDoc.data() as any),
                        listId: candidateListId
                    } as ReviewEntity));
                } catch (error: any) {
                    if (error?.code !== 'permission-denied') {
                        console.warn(`Error loading group reviews for list ${candidateListId}`, error);
                    }
                    return [] as ReviewEntity[];
                }
            }));

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

            let rootReviews: ReviewEntity[] = [];
            try {
                const rootSnap = await getDocs(
                    query(collection(db, 'reviews'), where('placeId', '==', placeId), limit(120))
                );
                rootReviews = rootSnap.docs
                    .map((reviewDoc) => ({
                        id: reviewDoc.id,
                        ...(reviewDoc.data() as any)
                    } as ReviewEntity))
                    .filter((review) => canViewReview(review));
            } catch (error: any) {
                if (error?.code !== 'permission-denied') {
                    console.warn('Error loading root reviews for group page', error);
                }
            }

            const reviewMap = new Map<string, ReviewEntity>();
            for (const review of rootReviews) {
                const resolvedListId = review.listId || (review as any).parentListId || '';
                reviewMap.set(`${resolvedListId || 'unknown'}:${review.id}`, {
                    ...review,
                    listId: resolvedListId
                });
            }
            for (const listReviews of reviewsByList) {
                for (const review of listReviews) {
                    if (!canViewReview(review)) continue;
                    const resolvedListId = review.listId || (review as any).parentListId || '';
                    reviewMap.set(`${resolvedListId || 'unknown'}:${review.id}`, {
                        ...review,
                        listId: resolvedListId
                    });
                }
            }

            const allPlaceReviews = Array.from(reviewMap.values());
            console.log("Group query candidate reviews:", allPlaceReviews.length);

            // Robust normalization for filtering
            const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const targetName = normalize(decodedName);
            const normalizedPlaceName = normalize(fetchedPlaceName);

            const feats: ReviewEntity[] = allPlaceReviews
                .filter(r => {
                    if (r.itemName) {
                        return normalize(r.itemName) === targetName;
                    }
                    // If review has no item name, it belongs to the Place.
                    // Include it ONLY if the current Group Page IS the Place Page (TargetName == PlaceName)
                    return normalizedPlaceName === targetName;
                })
                .sort((a: any, b: any) => toMillis(b.createdAt) - toMillis(a.createdAt));

            console.log("Group query filtered matches:", feats.length);

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
            setLoading(false);
        }
    }, [placeId, decodedName, user?.uid]); // Dependencies for callback

    useEffect(() => {
        fetchData();
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
        setSelectedListId(lockedListId);
        setIsFlowOpen(true);
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

                const [nestedSnap, rootByListSnap, rootByParentSnap] = await Promise.all([
                    getDocs(collection(db, 'lists', primaryId, 'reviews')).catch(() => null),
                    getDocs(query(collection(db, 'reviews'), where('listId', '==', primaryId))).catch(() => null),
                    getDocs(query(collection(db, 'reviews'), where('parentListId', '==', primaryId))).catch(() => null)
                ]);

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

                append(rootByListSnap);
                append(rootByParentSnap);
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
                <div className="h-[40vh] min-h-[300px] bg-white/5 animate-hero-from-left" />
                <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 relative z-10">
                    <div className="h-10 bg-white/10 rounded w-2/3 mb-3" />
                    <div className="h-5 bg-white/5 rounded w-1/3 mb-8" />
                    <div className="flex gap-4 mb-8">
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                        <div className="h-16 w-24 bg-white/10 rounded-xl" />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="aspect-square bg-white/5 rounded-lg" />
                        ))}
                    </div>
                </div>
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
        <div className="min-h-screen bg-[var(--lt-bg)] pb-20">
            {/* Hero */}
            <EntityHero
                imageUrl={stats?.mainPhoto}
                alt={decodedName}
                ready={heroReady}
                onImageLoad={() => setHeroReady(true)}
                fallback={<PlacePhotoPlaceholder variant="group" />}
            >

                        {/* Title & Place Info */}
                        <div className="lt-entity-hero-title flex-1">
                            <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-white mb-2 leading-tight line-clamp-2">{decodedName}</h1>
                            {placeClosedStatus && (
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold mb-2 border ${placeClosedStatus === 'permanently_closed'
                                    ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                    }`}>
                                    ⚠ {placeClosedStatus === 'permanently_closed' ? 'Cerrado permanentemente' : 'Cerrado temporalmente'}
                                </div>
                            )}
                            {unavailableItems.includes(decodedName) && (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold mb-2 border bg-gray-500/20 border-gray-500/40 text-gray-300 ml-2">
                                    ✕ No disponible actualmente
                                </div>
                            )}
                            <Link to={`/place/${placeId}`} className="text-lg md:text-xl text-[var(--lt-accent)] hover:text-white flex items-center gap-2 font-medium transition-colors">
                                <MapPin className="w-5 h-5 opacity-70 shrink-0" />
                                <span className="underline decoration-indigo-500/30 underline-offset-4">{placeName || 'Lugar Desconocido'}</span>
                            </Link>
                        </div>

                        {/* Ratings & Stats Row */}
                        {stats && (
                            <div className="flex flex-col items-start md:items-end gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Rating Bubble */}
                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 backdrop-blur-md">
                                        <div className="text-lg leading-none">{stats.avg.toFixed(1)}</div>
                                    </div>

                                    {/* Count Bubble */}
                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-white/10 border border-white/10 text-white backdrop-blur-md">
                                        <MessageSquare className="w-4 h-4 text-[var(--lt-accent)]" />
                                        <span>{stats.count}</span>
                                    </div>

                                    {/* Add Review Button */}
                                    <button
                                        onClick={openAddReviewFlow}
                                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 hover:scale-105 transition-all ml-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>Añadir Reseña</span>
                                    </button>
                                </div>

                                {/* Tags Row */}
                                {stats.tags && stats.tags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 mt-2 md:justify-end">
                                        {stats.tags.map(tag => (
                                            <span key={tag} className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/90 text-xs font-medium backdrop-blur-md">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
            </EntityHero>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8 flex flex-col lg:grid lg:grid-cols-12 gap-8">

                <div className="order-1 lg:col-span-4 lg:order-last space-y-6">

                    {/* Actions Row */}
                    <div className="bg-[var(--lt-card-strong)] p-3 rounded-xl border border-white/10 grid grid-cols-3 gap-3">
                        <button
                            onClick={() => setIsSaveModalOpen(true)}
                            className="lt-secondary-action bg-[var(--lt-card)] hover:bg-[var(--lt-card-strong)] text-gray-200 hover:text-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all border border-white/5 group"
                        >
                            <Bookmark className="w-6 h-6 group-hover:scale-110 transition-transform text-[var(--lt-accent)]" />
                            <span className="text-xs font-bold tracking-wide">GUARDAR</span>
                        </button>

                        <button
                            onClick={() => setIsShareModalOpen(true)}
                            className="lt-secondary-action bg-[var(--lt-card)] hover:bg-[var(--lt-card-strong)] text-gray-200 hover:text-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all border border-white/5 group"
                        >
                            <Share2 className="w-6 h-6 group-hover:scale-110 transition-transform text-[var(--lt-accent)]" />
                            <span className="text-xs font-bold tracking-wide">COMPARTIR</span>
                        </button>

                        <button
                            onClick={() => setShowReportModal(true)}
                            className="lt-report-action bg-[var(--lt-card)] hover:bg-red-500/10 text-[var(--lt-text)] hover:text-red-500 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all border border-white/5 hover:border-red-500/25 group"
                        >
                            <Flag className="w-6 h-6 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold tracking-wide">REPORTAR</span>
                        </button>
                    </div>

                    {/* 1. Detailed Stats (Refactored) */}
                    {stats && (stats.ponderable.length > 0 || stats.nonPonderable.length > 0) && (
                        <div className="bg-[var(--lt-card-strong)] rounded-xl border border-white/10 p-5">
                            <h3 className="font-bold text-white border-b border-white/5 pb-2 text-sm uppercase tracking-wider mb-4 flex justify-between items-center">
                                <span>Puntuaciones</span>
                            </h3>

                            {/* Ponderable (Charts) */}
                            <div className="space-y-4">
                                {stats.ponderable.map((c, i) => {
                                    const listAvg = listStats?.[c.key];
                                    return (
                                        <div key={c.key}>
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-gray-400 text-xs font-medium">{c.label}</span>
                                                <div className="flex items-center gap-2">
                                                    {listAvg && (
                                                        <span className="text-[10px] text-gray-500 font-mono" title={`Media de la lista: ${listAvg.toFixed(1)}`}>
                                                            (L: {listAvg.toFixed(1)})
                                                        </span>
                                                    )}
                                                    <span className="text-emerald-400 font-bold font-mono text-sm">{c.avg.toFixed(1)}</span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                                                {/* List Avg Marker */}
                                                {listAvg && (
                                                    <div
                                                        className="absolute top-0 bottom-0 w-1 bg-white/40 z-10 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
                                                        style={{ left: `${Math.min(listAvg * 10, 100)}%` }}
                                                    />
                                                )}
                                                <div
                                                    className={`h-full rounded-full bg-gradient-to-r ${getScoreColor(c.avg)}`}
                                                    style={{ width: `${c.avg * 10}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Non-Ponderable (Gauges) */}
                            {stats.nonPonderable.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-white/5">
                                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Otros Detalles</h4>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                        {stats.nonPonderable.map((c) => (
                                            <NonPonderableGauge key={c.key} score={c.avg} label={c.label} size={70} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2. Lists */}
                    {listsDetails.length > 0 && (
                        <div className="bg-[var(--lt-card-strong)] rounded-xl border border-white/10 p-5">
                            <h3 className="font-bold text-white border-b border-white/5 pb-2 text-sm uppercase tracking-wider mb-4">
                                Listas Relacionadas
                            </h3>
                            <div className="space-y-3">
                                {listsDetails.slice(0, 5).map((l: any) => (
                                    <Link key={l.id} to={`/list/${l.id}`} className="block group">
                                        <div className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/5">
                                            {/* Thumbnail */}
                                            <div className={`w-12 h-12 shrink-0 rounded overflow-hidden flex items-center justify-center transition-colors bg-gray-800`}>
                                                {l.photoUrl ? (
                                                    <ProgressiveImage
                                                        src={l.photoUrl}
                                                        alt={l.name}
                                                        containerClassName="w-full h-full"
                                                        className="w-full h-full object-cover"
                                                        fallback={
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <ListIcon className={`w-5 h-5 ${l.parentListId ? 'text-[var(--lt-accent-2)]' : 'text-gray-500'}`} />
                                                            </div>
                                                        }
                                                    />
                                                ) : (
                                                    <ListIcon className={`w-5 h-5 ${l.parentListId ? 'text-[var(--lt-accent-2)]' : 'text-gray-500'}`} />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={`font-bold text-sm truncate transition-colors ${l.parentListId ? 'text-[var(--lt-accent-2)] group-hover:text-[var(--lt-accent-2)]' : 'text-gray-200 group-hover:text-[var(--lt-accent)]'}`}>
                                                        {l.name}
                                                    </div>
                                                    {l.parentListId && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lt-accent-soft)] text-[var(--lt-accent-2)] uppercase tracking-wide font-bold">Sub</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate mt-0.5">
                                                    {l.itemCount ? `${l.itemCount} lugares` : 'Ver lista'}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Content (Left) */}
                <div className="order-2 lg:col-span-8 lg:order-first">

                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar px-1 py-2">
                        <button
                            onClick={() => setGroupActiveTab('reviews')}
                            className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${groupActiveTab === 'reviews'
                                ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                }`}
                        >
                            <MessageSquare className="w-4 h-4" /> Opiniones ({reviews.length})
                        </button>
                        {stats && stats.photos.length > 0 && (
                            <button
                                onClick={() => setGroupActiveTab('photos')}
                                className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-all whitespace-nowrap ${groupActiveTab === 'photos'
                                    ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10'
                                    }`}
                            >
                                <ImageIcon className="w-4 h-4" /> Fotos ({stats.photos.length})
                            </button>
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
                                        className="aspect-square rounded-xl overflow-hidden cursor-pointer bg-gray-800 relative group border border-white/10"
                                    >
                                        <ProgressiveImage
                                            src={url}
                                            alt={`Foto ${i}`}
                                            containerClassName="w-full h-full"
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            fallback={
                                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                    <ImageIcon className="w-6 h-6 text-gray-600" />
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

                        {/* Reviews Header */}
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

                        {/* Reviews Grid */}
                        {reviews.length > 0 ? (
                            reviewViewMode === 'full' ? (
                                <div className="grid grid-cols-1 gap-8 animate-fade-in">
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
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2 animate-fade-in">
                                    {reviews.slice(0, visibleCount).map(review => {
                                        const score = review.overallRating || 0;
                                        const scoreColor = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
                                        const photoSrc = review.photoUrl || (review as any).placeMainImage || null;
                                        const isPlaceImg = !review.photoUrl && !!(review as any).placeMainImage;
                                        const isExpanded = expandedReviewId === review.id;

                                        if (isExpanded) {
                                            return (
                                                <div id={`expanded-review-${review.id}`} key={review.id} className="col-span-3 sm:col-span-4 lg:col-span-5 scroll-mt-24 mb-4 animate-fade-in flex flex-col">
                                                    <button
                                                        onClick={() => setExpandedReviewId(null)}
                                                        className="self-center mb-3 flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 text-gray-200 hover:text-white text-sm font-semibold rounded-full transition-all border border-[var(--lt-accent-border)] shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
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
                                                className="group relative aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer border border-[var(--lt-bg)] hover:border-[var(--lt-accent-border)] transition-colors"
                                            >
                                                {photoSrc ? (
                                                    <ProgressiveImage
                                                        src={photoSrc}
                                                        alt={(review as any).authorName || ''}
                                                        containerClassName="w-full h-full"
                                                        className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${isPlaceImg ? 'opacity-40 saturate-50' : ''}`}
                                                        fallback={
                                                            <div className="w-full h-full bg-gradient-to-br from-indigo-900/40 to-gray-900 flex items-center justify-center">
                                                                <MessageSquare className="w-6 h-6 text-gray-600" />
                                                            </div>
                                                        }
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-indigo-900/40 to-gray-900 flex items-center justify-center">
                                                        <MessageSquare className="w-6 h-6 text-gray-600" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                                                    <p className="text-[10px] sm:text-xs text-white font-bold line-clamp-1 leading-tight">{(review as any).authorName || 'Anónimo'}</p>
                                                </div>
                                                <div className={`absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full ${scoreColor} flex items-center justify-center shadow-lg`}>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-white">{score.toFixed(1)}</span>
                                                </div>
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
                            <div className="p-8 bg-[var(--lt-card-strong)] rounded-xl border border-white/10 text-center animate-fade-in">
                                <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-white mb-2">Sé el primero en opinar</h3>
                                <p className="text-gray-400 mb-6 text-sm">Nadie ha escrito una reseña detallada sobre este plato aún.</p>
                                <button
                                    onClick={openAddReviewFlow}
                                    className="px-6 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white rounded-full font-bold transition-all shadow-lg shadow-[var(--lt-accent-shadow)]"
                                >
                                    Añadir Reseña
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
                    score: stats?.avg,
                    reviewCount: stats?.count,
                    criteriaStats: stats
                        ? [...stats.ponderable, ...stats.nonPonderable]
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
