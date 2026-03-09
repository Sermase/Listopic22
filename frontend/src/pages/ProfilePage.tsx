import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { useLists } from '../hooks/useLists';
import { useReviews } from '../hooks/useReviews';
import { useFilters } from '../context/FilterContext'; // Import Filter Context
import { useAppConfig } from '../context/AppConfigContext';
import { Settings, Calendar, Users as UsersIcon, List as ListIcon, Star, UserPlus, UserCheck, MessageCircle, Power, MapPin as MapPinIcon, Bug, Flag, MoreVertical, Loader2, ChevronDown, BarChart3, Sparkles, Share2, X } from 'lucide-react';
import { ReportModal } from '../components/ReportModal';
import { doc, setDoc, deleteDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { signOut, updateProfile } from 'firebase/auth';
import { ReviewCard } from '../components/ReviewCard';
import { AddReviewForm } from '../components/AddReviewForm';
import { ShareModal } from '../components/ShareModal';
import { ChatService } from '../services/ChatService';
import { FollowingSection } from '../components/profile/FollowingSection';
import { BadgeDisplay } from '../components/profile/BadgeDisplay';
import { collection, collectionGroup, query, where, getDocs, documentId, orderBy, limit, startAfter } from 'firebase/firestore';
import { isUsernameValid } from '../utils/username';
import {
    isUserProfileServiceError,
    updateUserProfilePreferences,
} from '../services/UserProfileService';

interface ListRatingStats {
    listId: string;
    listName: string;
    reviewsCount: number;
    averageRating: number;
}

interface AdvancedProfileStats {
    totalReviews: number;
    averageRating: number;
    ratedListsCount: number;
    perList: ListRatingStats[];
}

interface FavoriteReviewSummary {
    id: string;
    placeId: string;
    listId: string;
    listName: string;
    itemName: string;
    placeName: string;
    photoUrl: string;
    score: number;
}

const EMPTY_ADVANCED_STATS: AdvancedProfileStats = {
    totalReviews: 0,
    averageRating: 0,
    ratedListsCount: 0,
    perList: [],
};

export const ProfilePage: React.FC = () => {
    const { user } = useAuth();
    const appConfig = useAppConfig();
    const navigate = useNavigate();
    const { userId: paramUserId } = useParams<{ userId: string }>();
    const [activeTab, setActiveTab] = useState<'lists' | 'reviews' | 'following' | 'stats'>('reviews');
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [preferencesTab, setPreferencesTab] = useState<'user' | 'search'>('user');
    const [editRange, setEditRange] = useState<string>('50'); // Default to 50 if undefined
    const [editUsername, setEditUsername] = useState('');
    const [editDisplayName, setEditDisplayName] = useState('');
    const [editName, setEditName] = useState('');
    const [editSurnames, setEditSurnames] = useState('');
    const [editLocation, setEditLocation] = useState('');
    const [editBio, setEditBio] = useState('');
    const [savingPreferences, setSavingPreferences] = useState(false);
    const [preferencesError, setPreferencesError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isFlowOpen, setIsFlowOpen] = useState(false);
    const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
    const [editingListId, setEditingListId] = useState<string | null>(null);
    const [reviewViewMode, setReviewViewMode] = useState<'full' | 'minimal'>('full');
    const [reviewSortMode, setReviewSortMode] = useState<'recent' | 'top_rated'>('recent');
    const [expandedReviewIds, setExpandedReviewIds] = useState<string[]>([]);
    const [listSubTab, setListSubTab] = useState<'followed_lists' | 'followed_sublists' | 'created_sublists'>('followed_lists');
    const [statsListSort, setStatsListSort] = useState<'reviews_desc' | 'rating_desc'>('reviews_desc');
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [statsLoadedUserId, setStatsLoadedUserId] = useState<string | null>(null);
    const [advancedStats, setAdvancedStats] = useState<AdvancedProfileStats>(EMPTY_ADVANCED_STATS);
    const [favoriteReview, setFavoriteReview] = useState<FavoriteReviewSummary | null>(null);

    const handleEditReview = (review: any) => {
        setEditingReviewId(review.id);
        setEditingListId(review.listId || null);
        setIsFlowOpen(true);
    };

    const openPreferencesModal = (tab: 'user' | 'search' = 'user') => {
        setPreferencesTab(tab);
        setPreferencesError(null);
        setIsEditing(true);
    };

    // Determine target user ID
    const targetUserId = paramUserId || user?.uid;
    const isOwnProfile = user?.uid === targetUserId;

    useEffect(() => {
        setStatsLoadedUserId(null);
        setStatsError(null);
        setAdvancedStats(EMPTY_ADVANCED_STATS);
        setFavoriteReview(null);
    }, [targetUserId]);

    // Hooks
    const { profile, loading: loadingProfile, error: errorProfile } = useUserProfile(targetUserId);
    const { lists: ownedLists, loading: loadingLists } = useLists('recent', targetUserId, isOwnProfile); // Pass isOwnProfile to include private
    const { reviews: fetchedReviews, loading: loadingReviews, refresh: refreshReviews, fetchMore, hasMore, loadingMore } = useReviews({ type: 'recent', userId: targetUserId });
    const [localReviews, setLocalReviews] = useState<any[]>([]);

    // Infinite Scroll Effect (Must be after useReviews)
    const loadMoreRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (activeTab !== 'reviews' || loadingReviews) return;
        const target = loadMoreRef.current;
        if (!target) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loadingMore) {
                fetchMore();
            }
        }, { threshold: 0.1 });

        observer.observe(target);
        return () => observer.disconnect();
    }, [activeTab, hasMore, loadingMore, loadingReviews, localReviews.length, fetchMore]);

    // Additional List States
    const [followedLists, setFollowedLists] = useState<any[]>([]);
    const [loadingExtraLists, setLoadingExtraLists] = useState(false);

    // Derived Lists
    const subCreatedLists = ownedLists.filter(l => !!l.parentListId);

    const mainFollowedLists = followedLists.filter(l => !l.parentListId);
    const subFollowedLists = followedLists.filter(l => !!l.parentListId);
    const profileListsCount = mainFollowedLists.length + subFollowedLists.length + subCreatedLists.length;

    // Fetch Followed Lists
    useEffect(() => {
        if (!targetUserId) return;

        const fetchExtra = async () => {
            setLoadingExtraLists(true);
            try {
                // Followed Lists (From 'followingLists' subcollection)
                const qFollowed = query(collection(db, 'users', targetUserId, 'followingLists'));
                const snapFollowed = await getDocs(qFollowed);

                if (!snapFollowed.empty) {
                    const followedIds = snapFollowed.docs.map(d => d.id);
                    // Fetch full details for the first 20 to check isPublic/parentListId
                    // Firestore 'in' query supports max 10/30 depending on version. 10 safe.
                    // We'll batch or just fetch individual if few.
                    const chunks = [];
                    for (let i = 0; i < followedIds.length; i += 10) {
                        chunks.push(followedIds.slice(i, i + 10));
                    }

                    let allFollowedDetails: any[] = [];
                    for (const chunk of chunks) {
                        try {
                            // Only fetch PUBLIC lists to avoid permission errors.
                            // If a user follows a private list, it won't be shown here, which is standard behavior
                            // unless we implement a specific 'sharedWithMe' check.
                            const qDetails = query(
                                collection(db, 'lists'),
                                where(documentId(), 'in', chunk),
                                where('isPublic', '==', true)
                            );
                            const capsShot = await getDocs(qDetails);
                            allFollowedDetails.push(...capsShot.docs.map(d => ({ id: d.id, ...d.data() })));
                        } catch (chunkError) {
                            console.warn("Error fetching chunk of lists", chunkError);
                        }
                    }

                    // Filter Privacy
                    // If viewing another profile, only show their followed lists if those lists are PUBLIC.
                    // Private lists followed by someone else shouldn't be exposed details unless viewer has access.
                    // We'll stick to isPublic == true.
                    // Also filter out any that failed to fetch (deleted).
                    const validFollowed = allFollowedDetails.filter(l => l.isPublic || (user && (l.userId === user.uid || l.editors?.includes(user.uid))));
                    setFollowedLists(validFollowed);
                } else {
                    setFollowedLists([]);
                }

            } catch (e) {
                console.error("Error fetching extra lists", e);
            } finally {
                setLoadingExtraLists(false);
            }
        };

        fetchExtra();
    }, [targetUserId, user]);

    useEffect(() => {
        if (fetchedReviews) {
            setLocalReviews(fetchedReviews);
        }
    }, [fetchedReviews]);

    useEffect(() => {
        if (!targetUserId) return;
        if (statsLoadedUserId === targetUserId) return;

        let cancelled = false;

        const loadAdvancedStats = async () => {
            setStatsLoading(true);
            setStatsError(null);
            try {
                const pageSize = 200;
                const maxReviews = 3000;
                const allReviews: Array<Record<string, any>> = [];
                let cursor: any = null;

                while (allReviews.length < maxReviews) {
                    const constraints: any[] = [
                        where('userId', '==', targetUserId),
                        orderBy('createdAt', 'desc'),
                    ];

                    if (cursor) {
                        constraints.push(startAfter(cursor));
                    }

                    constraints.push(limit(pageSize));

                    const pageSnapshot = await getDocs(query(collectionGroup(db, 'reviews'), ...constraints));
                    if (pageSnapshot.empty) break;

                    const pageRows = pageSnapshot.docs
                        .map((reviewDoc): Record<string, any> | null => {
                            const pathSegments = reviewDoc.ref.path.split('/');
                            const isCanonicalListReviewPath =
                                pathSegments.length === 4 &&
                                pathSegments[0] === 'lists' &&
                                pathSegments[2] === 'reviews';

                            if (!isCanonicalListReviewPath) {
                                return null;
                            }

                            const reviewData = reviewDoc.data() as Record<string, any>;
                            const inferredListId = typeof reviewData.listId === 'string' && reviewData.listId.trim().length > 0
                                ? reviewData.listId
                                : reviewDoc.ref.parent.parent?.id || '';

                            return {
                                id: reviewDoc.id,
                                ...reviewData,
                                listId: inferredListId,
                            };
                        })
                        .filter(Boolean) as Array<Record<string, any>>;

                    allReviews.push(...pageRows);
                    cursor = pageSnapshot.docs[pageSnapshot.docs.length - 1];

                    if (pageSnapshot.size < pageSize) break;
                }

                const dedupedReviewsMap = new Map<string, Record<string, any>>();
                allReviews.forEach((review) => {
                    const listId = typeof review.listId === 'string' ? review.listId.trim() : '';
                    if (!listId) return;
                    const key = `${listId}:${review.id}`;
                    if (!dedupedReviewsMap.has(key)) {
                        dedupedReviewsMap.set(key, review);
                    }
                });
                const canonicalReviews = Array.from(dedupedReviewsMap.values());

                const listIds = Array.from(
                    new Set(
                        canonicalReviews
                            .map((review) => typeof review.listId === 'string' ? review.listId : '')
                            .filter((listId) => listId.length > 0)
                    )
                );

                const listNamesById: Record<string, string> = {};
                for (let i = 0; i < listIds.length; i += 10) {
                    const chunk = listIds.slice(i, i + 10);
                    try {
                        const listSnapshot = await getDocs(query(collection(db, 'lists'), where(documentId(), 'in', chunk)));
                        listSnapshot.docs.forEach((listDoc) => {
                            const listData = listDoc.data() as Record<string, any>;
                            if (typeof listData.name === 'string' && listData.name.trim().length > 0) {
                                listNamesById[listDoc.id] = listData.name.trim();
                            }
                        });
                    } catch (listError) {
                        console.warn('Error loading list names for stats chunk', listError);
                    }
                }

                let totalScore = 0;
                let scoredReviewsCount = 0;
                const perListMap = new Map<string, { listName: string; reviewsCount: number; totalScore: number }>();
                let favoriteCandidate: Record<string, any> | null = null;
                let favoriteCandidateDate = 0;

                const getCreatedAtMillis = (value: any): number => {
                    if (!value) return 0;
                    if (typeof value?.toDate === 'function') {
                        try {
                            return value.toDate().getTime();
                        } catch {
                            return 0;
                        }
                    }
                    if (typeof value?.seconds === 'number') return value.seconds * 1000;
                    if (value instanceof Date) return value.getTime();
                    if (typeof value === 'string' || typeof value === 'number') {
                        const parsed = new Date(value).getTime();
                        return Number.isFinite(parsed) ? parsed : 0;
                    }
                    return 0;
                };

                canonicalReviews.forEach((review) => {
                    const numericScore = typeof review.overallRating === 'number'
                        ? review.overallRating
                        : Number(review.overallRating);
                    const hasScore = Number.isFinite(numericScore);

                    if (hasScore) {
                        totalScore += numericScore;
                        scoredReviewsCount += 1;

                        const reviewDate = getCreatedAtMillis(review.createdAt);
                        if (!favoriteCandidate || numericScore > Number(favoriteCandidate.overallRating) || (
                            numericScore === Number(favoriteCandidate.overallRating) && reviewDate > favoriteCandidateDate
                        )) {
                            favoriteCandidate = review;
                            favoriteCandidateDate = reviewDate;
                        }
                    }

                    const listId = typeof review.listId === 'string' ? review.listId.trim() : '';
                    if (!listId || !hasScore) return;

                    const fallbackListName = listNamesById[listId]
                        || (typeof review.listName === 'string' && review.listName.trim().length > 0 ? review.listName.trim() : 'Lista');
                    const current = perListMap.get(listId) || {
                        listName: fallbackListName,
                        reviewsCount: 0,
                        totalScore: 0,
                    };

                    current.reviewsCount += 1;
                    current.totalScore += numericScore;

                    if (!current.listName && fallbackListName) {
                        current.listName = fallbackListName;
                    }

                    perListMap.set(listId, current);
                });

                const perList = Array.from(perListMap.entries())
                    .map(([listId, value]) => ({
                        listId,
                        listName: value.listName || 'Lista',
                        reviewsCount: value.reviewsCount,
                        averageRating: value.reviewsCount > 0 ? value.totalScore / value.reviewsCount : 0,
                    }))
                    .sort((a, b) => {
                        if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
                        return b.averageRating - a.averageRating;
                    });

                if (!cancelled) {
                    const favoriteCandidateData = favoriteCandidate as Record<string, any> | null;
                    const favoritePlaceNameRaw = favoriteCandidateData && typeof favoriteCandidateData.placeName === 'string'
                        ? favoriteCandidateData.placeName.trim()
                        : '';
                    const favoritePlaceAddressRaw = favoriteCandidateData && typeof favoriteCandidateData.placeAddress === 'string'
                        ? favoriteCandidateData.placeAddress.trim()
                        : '';
                    const favoritePlaceName = favoritePlaceNameRaw
                        || (favoritePlaceAddressRaw ? favoritePlaceAddressRaw.split(',')[0].trim() : '');
                    const favorite: FavoriteReviewSummary | null = favoriteCandidateData
                        ? {
                            id: String(favoriteCandidateData.id || ''),
                            placeId: typeof favoriteCandidateData.placeId === 'string' ? favoriteCandidateData.placeId : '',
                            listId: String(favoriteCandidateData.listId || ''),
                            listName: listNamesById[String(favoriteCandidateData.listId || '')]
                                || (typeof favoriteCandidateData.listName === 'string' ? favoriteCandidateData.listName : 'Lista'),
                            itemName: typeof favoriteCandidateData.itemName === 'string' ? favoriteCandidateData.itemName : 'Elemento',
                            placeName: favoritePlaceName,
                            photoUrl: typeof favoriteCandidateData.photoUrl === 'string' ? favoriteCandidateData.photoUrl : '',
                            score: Number(favoriteCandidateData.overallRating) || 0,
                        }
                        : null;

                    setAdvancedStats({
                        totalReviews: scoredReviewsCount,
                        averageRating: scoredReviewsCount > 0 ? totalScore / scoredReviewsCount : 0,
                        ratedListsCount: perList.length,
                        perList,
                    });
                    setFavoriteReview(favorite);
                    setStatsLoadedUserId(targetUserId);
                }
            } catch (error) {
                console.error('Error loading advanced profile stats', error);
                if (!cancelled) {
                    setStatsError('No se pudieron cargar las estadisticas.');
                }
            } finally {
                if (!cancelled) {
                    setStatsLoading(false);
                }
            }
        };

        void loadAdvancedStats();

        return () => {
            cancelled = true;
        };
    }, [targetUserId, statsLoadedUserId]);

    const handleDeleteReview = (id: string) => {
        setLocalReviews(prev => prev.filter(r => r.id !== id));
        setExpandedReviewIds(prev => prev.filter(reviewId => reviewId !== id));
        setStatsLoadedUserId(null);
    };

    const toggleReviewExpanded = (reviewId: string) => {
        setExpandedReviewIds((prev) =>
            prev.includes(reviewId)
                ? prev.filter((id) => id !== reviewId)
                : [...prev, reviewId]
        );
    };

    const getScoreBubbleClass = (score: number) => {
        if (score >= 7) return 'from-emerald-500 to-teal-500';
        if (score >= 5) return 'from-yellow-400 to-orange-500';
        return 'from-red-500 to-pink-500';
    };

    const formatReviewDate = (value: any) => {
        if (!value) return '';

        let date: Date | null = null;
        if (typeof value?.toDate === 'function') {
            try {
                date = value.toDate();
            } catch {
                date = null;
            }
        } else if (value instanceof Date) {
            date = value;
        } else if (typeof value?.seconds === 'number') {
            date = new Date(value.seconds * 1000);
        } else if (typeof value === 'string' || typeof value === 'number') {
            date = new Date(value);
        }

        if (!date || Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    };

    const formatStatRating = (value: number) => {
        if (!Number.isFinite(value)) return '-';
        return value.toFixed(2);
    };

    const getReviewCreatedAtMillis = (value: any): number => {
        if (!value) return 0;
        if (typeof value?.toDate === 'function') {
            try {
                return value.toDate().getTime();
            } catch {
                return 0;
            }
        }
        if (typeof value?.seconds === 'number') return value.seconds * 1000;
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'string' || typeof value === 'number') {
            const parsed = new Date(value).getTime();
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    };

    const displayedReviewsCount = statsLoadedUserId === targetUserId
        ? advancedStats.totalReviews
        : (profile?.reviewsCount || 0);

    const sortedProfileReviews = useMemo(() => {
        const base = [...localReviews];
        if (reviewSortMode === 'top_rated') {
            return base.sort((a, b) => {
                const scoreA = typeof a.overallRating === 'number' ? a.overallRating : Number(a.overallRating) || 0;
                const scoreB = typeof b.overallRating === 'number' ? b.overallRating : Number(b.overallRating) || 0;
                if (scoreB !== scoreA) return scoreB - scoreA;
                return getReviewCreatedAtMillis(b.createdAt) - getReviewCreatedAtMillis(a.createdAt);
            });
        }

        return base.sort((a, b) => getReviewCreatedAtMillis(b.createdAt) - getReviewCreatedAtMillis(a.createdAt));
    }, [localReviews, reviewSortMode]);

    const sortedStatsPerList = useMemo(() => {
        const base = [...advancedStats.perList];
        if (statsListSort === 'rating_desc') {
            return base.sort((a, b) => {
                if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
                return b.reviewsCount - a.reviewsCount;
            });
        }

        return base.sort((a, b) => {
            if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
            return b.averageRating - a.averageRating;
        });
    }, [advancedStats.perList, statsListSort]);

    const favoriteGroupLink = useMemo(() => {
        if (!favoriteReview) return '#';
        if (favoriteReview.placeId) {
            const encodedItemName = encodeURIComponent(favoriteReview.itemName || 'item');
            const listQuery = favoriteReview.listId ? `?listId=${encodeURIComponent(favoriteReview.listId)}` : '';
            return `/group/${favoriteReview.placeId}/${encodedItemName}${listQuery}`;
        }
        if (favoriteReview.listId) return `/list/${favoriteReview.listId}`;
        return '#';
    }, [favoriteReview]);

    const renderMinimalListRows = (lists: any[], emptyMessage: string, showSubBadge: boolean) => {
        if (lists.length === 0) {
            return (
                <div className="py-10 text-center border border-dashed border-white/10 rounded-xl bg-white/5">
                    <p className="text-gray-500 text-sm">{emptyMessage}</p>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                {lists.map((list) => {
                    const listImage = list.mainImageUrl || list.photoUrl || '';
                    return (
                        <Link
                            key={list.id}
                            to={`/list/${list.id}`}
                            className="group flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-[#151b2e]/70 hover:border-indigo-500/40 hover:bg-white/5 transition-all"
                        >
                            <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-gray-800">
                                {listImage ? (
                                    <img src={listImage} alt={list.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                                        <ListIcon className="w-5 h-5" />
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-white truncate">{list.name || 'Lista'}</div>
                                <div className="text-[11px] text-gray-400 truncate">
                                    {list.itemCount || 0} lugares
                                    {list.description ? ` - ${list.description}` : ''}
                                </div>
                            </div>

                            {showSubBadge && (
                                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase tracking-wide">
                                    Sub
                                </span>
                            )}
                        </Link>
                    );
                })}
            </div>
        );
    };

    // Check Follow Status
    useEffect(() => {
        if (!user || isOwnProfile || !targetUserId) return;

        const checkFollow = async () => {
            const docRef = doc(db, 'users', user.uid, 'following', targetUserId);
            const snap = await getDoc(docRef);
            setIsFollowing(snap.exists());
        };
        checkFollow();
    }, [user, targetUserId, isOwnProfile]);

    useEffect(() => {
        if (!profile) return;
        setEditUsername((profile.username || '').trim());
        setEditDisplayName((profile.displayName || profile.username || '').trim());
        setEditName((profile.name || '').trim());
        setEditSurnames((profile.surnames || '').trim());
        setEditLocation((profile.location || profile.residence || '').trim());
        setEditBio((profile.bio || '').trim());
    }, [profile]);

    useEffect(() => {
        if (profile?.defaultDistanceKm) {
            setEditRange(String(profile.defaultDistanceKm));
        }
    }, [profile]);

    // Image Upload Handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const processFile = async (file: File) => {
        if (!user) return;
        if (!file.type.startsWith('image/')) {
            alert("Solo se permiten archivos de imagen");
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert("La imagen no debe superar los 5MB");
            return;
        }

        setUploading(true);
        try {
            const storageRef = ref(storage, `profile_images/${user.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            await setDoc(doc(db, 'users', user.uid), {
                photoUrl: downloadURL
            }, { merge: true });

            // Reload to show changes (simple approach)
            window.location.reload();
        } catch (error) {
            console.error("Error uploading image:", error);
            alert("Error al subir la imagen");
        } finally {
            setUploading(false);
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const { setRange } = useFilters(); // Get setRange from context

    const savePreferences = async () => {
        if (!user) return;
        const profileUsername = (profile?.username || '').trim();
        const canEditUsername = !isUsernameValid(profileUsername);
        const nextUsername = editUsername.trim();
        if (canEditUsername && !isUsernameValid(nextUsername)) {
            setPreferencesError('Debes definir un username válido: sin espacios, máximo 18 caracteres y único.');
            return;
        }

        setSavingPreferences(true);
        setPreferencesError(null);
        try {
            const val = parseInt(editRange, 10);
            const safeDistance = isNaN(val) ? 50 : val;
            const newRange = safeDistance >= 999999 ? null : safeDistance;

            const result = await updateUserProfilePreferences({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoUrl: user.photoURL,
            }, {
                username: canEditUsername ? nextUsername : undefined,
                displayName: editDisplayName,
                name: editName,
                surnames: editSurnames,
                location: editLocation,
                bio: editBio,
                defaultDistanceKm: safeDistance,
            });

            // Update session too if generic
            // And CRUCIALLY update the context immediately so the UI reflects it without reload
            sessionStorage.removeItem('sessionRange');
            setRange(newRange);

            if (user.displayName !== result.displayName) {
                await updateProfile(user, { displayName: result.displayName });
            }

            setIsEditing(false);
            window.location.reload();
        } catch (err) {
            console.error("Error saving preferences:", err);
            if (isUserProfileServiceError(err)) {
                setPreferencesError(err.message);
            } else {
                setPreferencesError('Error al guardar preferencias');
            }
        } finally {
            setSavingPreferences(false);
        }
    };

    const handleMessage = async () => {
        if (!user || !targetUserId) return;
        try {
            const chatId = await ChatService.createPrivateChat(user.uid, targetUserId);
            navigate(`/chats/${chatId}`);
        } catch (error) {
            console.error("Error creating chat:", error);
        }
    };

    const handleFollowToggle = async () => {
        if (!user || !targetUserId) return;
        setFollowLoading(true);
        try {
            const followingRef = doc(db, 'users', user.uid, 'following', targetUserId);
            // We do NOT write to the target user's 'followers' collection nor update their counts client-side.
            // This is now handled by the backend trigger 'onUserFollowingWrite' in 'functions/modules/social.js'
            // to ensure security and consistency.

            if (isFollowing) {
                // 1. Unfollow (Trigger delete)
                await deleteDoc(followingRef);
                setIsFollowing(false);
            } else {
                // 1. Follow (Trigger create)
                await setDoc(followingRef, {
                    uid: targetUserId,
                    followedAt: new Date(),
                    // Optional: Store snapshot for optimistic feed rendering
                    displayName: profile?.displayName || profile?.username,
                    photoUrl: profile?.photoUrl
                });
                setIsFollowing(true);
            }
        } catch (error) {
            console.error("Follow error:", error);
            alert("Error al seguir/dejar de seguir. Inténtalo de nuevo.");
            setIsFollowing(!isFollowing); // Revert optimistic UI if failed
        } finally {
            setFollowLoading(false);
        }
    };

    if (!targetUserId) {
        return (
            <div className="min-h-screen pt-40 px-4 text-center text-gray-400">
                Debes iniciar sesión para ver tu perfil.
            </div>
        );
    }

    if (loadingProfile) {
        return (
            <div className="min-h-screen pt-32 text-center text-gray-500">
                Cargando perfil...
            </div>
        );
    }

    if (errorProfile || !profile) {
        return (
            <div className="min-h-screen pt-40 px-4 text-center">
                <div className="text-2xl text-white font-bold mb-4">Perfil no encontrado</div>
                <p className="text-gray-400">El usuario que buscas no existe o ha sido eliminado.</p>
            </div>
        );
    }

    const profileShareUrl = `${window.location.origin}/profile/${targetUserId}`;
    const profileShareTitle = profile.displayName || profile.username || 'Perfil';
    const profileShareSubtitle = profile.username ? `@${profile.username}` : '';
    const profileShareText = `Mira este perfil en Listopic: ${profileShareTitle}`;
    const hasLockedUsername = isUsernameValid((profile.username || '').trim());

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20">
            {/* Header / Banner */}
            <div className={`h-64 relative bg-gradient-to-b from-indigo-900/40 to-[#0b1021] ${profile.photoUrl ? 'bg-cover bg-center' : ''}`} style={profile.photoUrl ? { backgroundImage: `linear-gradient(to bottom, rgba(11,16,33,0.3), #0b1021), url(${profile.photoUrl})` } : {}}>
                <div className="absolute inset-0 bg-[#0b1021]/60 blur-xl"></div>
                <div className="absolute inset-0 bg-[#0b1021]/60 blur-xl"></div>
                {/* Removed top-right buttons from here */}
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 relative -mt-32 z-10">
                {/* TOP SECTION: Avatar + Identity + Desktop Actions */}
                <div className="flex flex-row items-center md:items-start gap-4 md:gap-8 mb-4">
                    {/* Avatar (Left) */}
                    <div className="group relative shrink-0">
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-70 blur-md group-hover:opacity-100 transition duration-500 animate-blob mix-blend-screen" />
                        <div className="relative w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-[#0b1021] p-1.5 md:p-2">
                            <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden border-[3px] border-[#0b1021] shadow-2xl relative">
                                <img
                                    src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName || profile.username || 'User'}`}
                                    alt={profile.username}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Identity (Right of Avatar) */}
                    <div className="flex-1 min-w-0 pb-0 md:pb-0 flex flex-col justify-start">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="min-w-0 md:flex-1 md:pr-4">
                                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight break-words line-clamp-2">
                                    {profile.displayName || profile.username || 'Usuario'}
                                </h1>
                                {profile.username && (
                                    <p className="text-sm sm:text-base md:text-lg text-indigo-400 font-normal truncate mt-1">
                                        @{profile.username}
                                    </p>
                                )}
                            </div>

                            <div className="hidden md:flex shrink-0 flex-col items-end gap-3">
                                <div className="flex items-center gap-2">
                                    {isOwnProfile ? (
                                        <>
                                            {((Array.isArray(profile.userType) && profile.userType.includes('jefe')) || profile.userType === 'jefe') && (
                                                <Link to="/developer" className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                                                    <Bug className="w-5 h-5" />
                                                </Link>
                                            )}
                                            <button onClick={() => openPreferencesModal('user')} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                                                <Settings className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => setIsShareModalOpen(true)} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors" title="Compartir perfil">
                                                <Share2 className="w-5 h-5" />
                                            </button>
                                            <button onClick={async () => { await signOut(auth); navigate('/login'); }} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                                <Power className="w-5 h-5" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleFollowToggle}
                                                disabled={followLoading}
                                                className={`px-6 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${isFollowing
                                                    ? 'bg-[#151b2e] border border-white/20 text-white hover:border-red-500 hover:text-red-500'
                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
                                                    }`}
                                            >
                                                {isFollowing ? <><UserCheck className="w-4 h-4" /> Siguiendo</> : <><UserPlus className="w-4 h-4" /> Seguir</>}
                                            </button>
                                            <button
                                                onClick={handleMessage}
                                                className="px-4 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-white hover:bg-white/10 transition-colors shadow-lg"
                                            >
                                                <MessageCircle className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => setIsShareModalOpen(true)}
                                                className="px-4 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors shadow-lg"
                                                title="Compartir perfil"
                                            >
                                                <Share2 className="w-5 h-5" />
                                            </button>

                                            <div className="relative">
                                                <button
                                                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                                                    className="px-3 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                                >
                                                    <MoreVertical className="w-5 h-5" />
                                                </button>
                                                {isMenuOpen && (
                                                    <div className="absolute right-0 mt-2 w-48 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden animate-fade-in z-50 origin-top-right">
                                                        <button
                                                            onClick={() => { setIsMenuOpen(false); setShowReportModal(true); }}
                                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                                                        >
                                                            <Flag className="w-4 h-4" /> Reportar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {appConfig.showProfileFavoriteBadge && favoriteReview && (
                                    <Link
                                        to={favoriteGroupLink}
                                        className="group w-[220px] flex items-center gap-2 p-2 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-indigo-500/10 hover:border-amber-300/60 hover:from-amber-400/20 hover:to-indigo-400/20 transition-all"
                                        title="Abrir favorito en pagina de grupo"
                                    >
                                        <div className="relative w-11 h-11 shrink-0">
                                            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-amber-300/60 shadow-lg bg-gray-800">
                                                {favoriteReview.photoUrl ? (
                                                    <img src={favoriteReview.photoUrl} alt={favoriteReview.itemName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                                                        <ListIcon className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-gradient-to-r ${getScoreBubbleClass(favoriteReview.score)} text-white text-[9px] font-black flex items-center justify-center border border-[#0b1021] shadow-lg`}>
                                                {favoriteReview.score.toFixed(1)}
                                            </div>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="text-[9px] uppercase tracking-widest text-amber-200 font-bold flex items-center gap-1">
                                                <Sparkles className="w-2.5 h-2.5" /> Favorito
                                            </div>
                                            <div className="text-xs font-extrabold text-white truncate">{favoriteReview.itemName}</div>
                                            {favoriteReview.placeName && (
                                                <div className="text-[11px] text-indigo-200 truncate">{favoriteReview.placeName}</div>
                                            )}
                                            <div className="text-[10px] text-gray-300 truncate">{favoriteReview.listName}</div>
                                        </div>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {appConfig.showProfileFavoriteBadge && favoriteReview && (
                    <div className="md:hidden mb-4 flex justify-end">
                        <Link
                            to={favoriteGroupLink}
                            className="group w-full sm:w-auto sm:max-w-md flex items-center gap-2 p-2 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-indigo-500/10 hover:border-amber-300/60 hover:from-amber-400/20 hover:to-indigo-400/20 transition-all"
                            title="Abrir favorito en pagina de grupo"
                        >
                            <div className="relative w-11 h-11 shrink-0">
                                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-amber-300/60 shadow-lg bg-gray-800">
                                    {favoriteReview.photoUrl ? (
                                        <img src={favoriteReview.photoUrl} alt={favoriteReview.itemName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                                            <ListIcon className="w-4 h-4" />
                                        </div>
                                    )}
                                </div>
                                <div className={`absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-gradient-to-r ${getScoreBubbleClass(favoriteReview.score)} text-white text-[9px] font-black flex items-center justify-center border border-[#0b1021] shadow-lg`}>
                                    {favoriteReview.score.toFixed(1)}
                                </div>
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="text-[9px] uppercase tracking-widest text-amber-200 font-bold flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5" /> Favorito
                                </div>
                                <div className="text-xs font-extrabold text-white truncate">{favoriteReview.itemName}</div>
                                {favoriteReview.placeName && (
                                    <div className="text-[11px] text-indigo-200 truncate">{favoriteReview.placeName}</div>
                                )}
                                <div className="text-[10px] text-gray-300 truncate">{favoriteReview.listName}</div>
                            </div>
                        </Link>
                    </div>
                )}

                {/* BIO + MOBILE ACTIONS + STATS */}
                <div className="space-y-6 md:space-y-8">
                    {/* Bio */}
                    {profile.bio && (
                        <p className="text-gray-400 text-sm max-w-2xl leading-relaxed">
                            {profile.bio}
                        </p>
                    )}

                    {/* MOBILE ACTIONS */}
                    <div className="md:hidden flex items-center gap-3">
                        {isOwnProfile ? (
                            <div className="flex items-center gap-2 w-full">
                                {((Array.isArray(profile.userType) && profile.userType.includes('jefe')) || profile.userType === 'jefe') && (
                                    <Link to="/developer" className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-indigo-400">
                                        <Bug className="w-5 h-5" />
                                    </Link>
                                )}
                                <button onClick={() => openPreferencesModal('user')} className="flex-1 p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 text-sm font-bold">
                                    Editar Perfil
                                </button>
                                <button onClick={() => setIsShareModalOpen(true)} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300">
                                    <Share2 className="w-5 h-5" />
                                </button>
                                <button onClick={async () => { await signOut(auth); navigate('/login'); }} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 text-red-400">
                                    <Power className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 w-full">
                                <button
                                    onClick={handleFollowToggle}
                                    disabled={followLoading}
                                    className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${isFollowing
                                        ? 'bg-[#151b2e] border border-white/20 text-white'
                                        : 'bg-indigo-600 text-white'
                                        }`}
                                >
                                    {isFollowing ? 'Siguiendo' : 'Seguir'}
                                </button>
                                <button
                                    onClick={handleMessage}
                                    className="px-4 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-white shadow-lg"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setIsShareModalOpen(true)}
                                    className="px-3 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 shadow-lg"
                                >
                                    <Share2 className="w-5 h-5" />
                                </button>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                                        className="px-3 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-400"
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                    {isMenuOpen && (
                                        <div className="absolute right-0 mt-2 w-48 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl py-1 z-50">
                                            <button
                                                onClick={() => { setIsMenuOpen(false); setShowReportModal(true); }}
                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 flex items-center gap-2"
                                            >
                                                <Flag className="w-4 h-4" /> Reportar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* DASHBOARD CARD: STATS + LEVEL BENTO */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        {/* Stats Grid */}
                        <div className="col-span-2 md:col-span-4 grid grid-cols-4 gap-2 md:gap-4 mb-2">
                            {[
                                { label: 'Seguidores', value: profile.followersCount || 0 },
                                { label: 'Reseñas', value: displayedReviewsCount },
                                { label: 'Usuarios', value: profile.followingUsersCount || profile.followingCount || 0, icon: UsersIcon },
                                { label: 'Listas', value: profile.followingListsCount || 0, icon: ListIcon }
                            ].map((stat, i) => (
                                <div key={i} className="glass-card flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl md:rounded-2xl transition hover:scale-105 duration-300 shadow-sm border border-white/5">
                                    <span className="text-white font-display font-bold text-lg md:text-3xl mb-1">{stat.value}</span>
                                    <span className="text-[9px] md:text-xs text-gray-400 uppercase tracking-wider text-center flex flex-col md:flex-row items-center gap-1">
                                        {stat.icon && <stat.icon className="w-3 h-3 md:w-4 md:h-4 mb-0.5 md:mb-0" />}
                                        {stat.label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Level Bar (Bento full width span) */}
                        {(() => {
                            const xp = profile.xp || 0;
                            const level = Math.floor(Math.sqrt(xp / 50)) + 1;
                            const nextLevelXp = 50 * Math.pow(level, 2);
                            const currentLevelBaseXp = 50 * Math.pow(level - 1, 2);
                            const progress = Math.min(100, Math.max(0, ((xp - currentLevelBaseXp) / (nextLevelXp - currentLevelBaseXp)) * 100));

                            return (
                                <div className="col-span-2 md:col-span-4 glass-card p-4 md:p-6 flex items-center gap-3 relative overflow-hidden border-indigo-500/20 bg-gradient-to-r from-[#151b2e] to-indigo-900/30">
                                    {/* Level Badge inside Level Card */}
                                    <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center font-bold text-white text-lg shadow-[0_4px_16px_rgba(245,158,11,0.4)] border border-white/20 z-10">
                                        {level}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-end mb-1.5">
                                            <span className="text-[10px] font-bold text-gray-400 tracking-wider">NIVEL {level}</span>
                                            <span className="text-[10px] text-amber-500 font-mono font-bold">{Math.floor(xp)} / {nextLevelXp} XP</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* BADGES SECTION */}
                    {profile.badges && profile.badges.length > 0 && (
                        <div className="pt-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Star className="w-3 h-3 text-amber-500" /> Medallas
                            </h3>
                            <BadgeDisplay earnedBadgeIds={profile.badges?.map((b: any) => typeof b === 'string' ? b : b.id) || []} />
                        </div>
                    )}

                    {profile.createdAt && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            Miembro desde {new Date((profile.createdAt as any).seconds * 1000).getFullYear()}
                        </div>
                    )}
                </div>


                {/* Preferences Modal */}
                {isEditing && isOwnProfile && (
                    <div
                        className="fixed inset-0 z-[130] flex items-stretch md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
                        onClick={() => !savingPreferences && setIsEditing(false)}
                    >
                        <div
                            className="w-full h-full md:h-[88vh] md:max-h-[88vh] md:max-w-3xl rounded-none md:rounded-2xl border-0 md:border border-white/10 bg-[#151b2e] shadow-none md:shadow-2xl overflow-hidden flex flex-col"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="sticky top-0 z-20 px-4 md:px-5 py-3 md:py-4 border-b border-white/10 bg-[#151b2e] flex items-center justify-between">
                                <div>
                                    <h3 className="text-white font-bold text-lg">Preferencias de perfil</h3>
                                    <p className="text-xs text-gray-400 mt-1">Configura datos del usuario y ajustes de busqueda.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !savingPreferences && setIsEditing(false)}
                                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="px-4 md:px-5 pt-4">
                                <div className="inline-flex rounded-xl border border-white/10 bg-[#0f1424] p-1">
                                    <button
                                        type="button"
                                        onClick={() => setPreferencesTab('user')}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === 'user'
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-gray-300 hover:text-white'
                                            }`}
                                    >
                                        Usuario
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPreferencesTab('search')}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === 'search'
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-gray-300 hover:text-white'
                                            }`}
                                    >
                                        Busqueda
                                    </button>
                                </div>
                            </div>

                            <div className="px-4 md:px-5 py-4 space-y-6 overflow-y-auto flex-1">
                                {preferencesTab === 'user' && (
                                    <>
                                        <div>
                                            <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                                                <UsersIcon className="w-4 h-4 text-indigo-400" /> Perfil publico
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="md:col-span-2">
                                                    <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">
                                                        {hasLockedUsername ? 'Username (bloqueado)' : 'Username (obligatorio)'}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editUsername}
                                                        onChange={(e) => setEditUsername(e.target.value)}
                                                        disabled={hasLockedUsername}
                                                        className={`w-full border rounded-lg px-3 py-2 ${hasLockedUsername
                                                            ? 'bg-black/40 border-white/10 text-gray-400 cursor-not-allowed'
                                                            : 'bg-black/20 border-amber-400/40 text-white outline-none focus:border-indigo-500'
                                                            }`}
                                                        placeholder="Sin espacios, maximo 18 caracteres"
                                                    />
                                                    <p className="text-[11px] text-amber-300 mt-2">
                                                        {hasLockedUsername
                                                            ? 'El username no se puede cambiar una vez guardado. Maximo 18 caracteres y sin espacios.'
                                                            : 'Tu username actual no es valido. Debes guardarlo ahora y quedara bloqueado cuando sea correcto.'
                                                        }
                                                    </p>
                                                </div>

                                                <div>
                                                    <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">Display Name</label>
                                                    <input
                                                        type="text"
                                                        value={editDisplayName}
                                                        onChange={(e) => setEditDisplayName(e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
                                                        placeholder="Visible publicamente"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">Nombre</label>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
                                                        placeholder="Opcional"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">Apellidos</label>
                                                    <input
                                                        type="text"
                                                        value={editSurnames}
                                                        onChange={(e) => setEditSurnames(e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
                                                        placeholder="Opcional"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">Lugar</label>
                                                    <input
                                                        type="text"
                                                        value={editLocation}
                                                        onChange={(e) => setEditLocation(e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
                                                        placeholder="Opcional"
                                                    />
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">Biografia</label>
                                                    <textarea
                                                        value={editBio}
                                                        onChange={(e) => setEditBio(e.target.value)}
                                                        rows={4}
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500 resize-y"
                                                        placeholder="Opcional"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                                                <UsersIcon className="w-4 h-4 text-indigo-400" /> Avatar
                                            </h4>
                                            <div className="flex flex-col gap-4">
                                                <div className="flex gap-4">
                                                    <button
                                                        onClick={async () => {
                                                            if (!user?.photoURL) return;
                                                            try {
                                                                await setDoc(doc(db, 'users', user!.uid), {
                                                                    photoUrl: user!.photoURL
                                                                }, { merge: true });
                                                                window.location.reload();
                                                            } catch (e) {
                                                                console.error("Error setting Google photo", e);
                                                            }
                                                        }}
                                                        className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${profile.photoUrl === user?.photoURL
                                                            ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500'
                                                            : 'bg-black/20 border-white/10 hover:border-white/30'
                                                            }`}
                                                    >
                                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                                                            {user?.photoURL ? (
                                                                <img src={user.photoURL} alt="Google" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full bg-gray-700"></div>
                                                            )}
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-300">Google</span>
                                                    </button>

                                                    <div
                                                        className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all relative overflow-hidden group ${profile.photoUrl !== user?.photoURL
                                                            ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500'
                                                            : 'bg-black/20 border-white/10 hover:border-white/30'
                                                            } ${dragActive ? 'border-dashed border-indigo-400 bg-indigo-500/10' : ''}`}
                                                        onDragEnter={handleDrag}
                                                        onDragLeave={handleDrag}
                                                        onDragOver={handleDrag}
                                                        onDrop={handleDrop}
                                                        onClick={() => document.getElementById('file-upload')?.click()}
                                                    >
                                                        <input
                                                            type="file"
                                                            id="file-upload"
                                                            className="hidden"
                                                            accept="image/*"
                                                            onChange={(e) => e.target.files && e.target.files[0] && processFile(e.target.files[0])}
                                                        />

                                                        {uploading ? (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                                            </div>
                                                        ) : null}

                                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 grayscale group-hover:grayscale-0 transition-all">
                                                            <img src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName}`} alt="Custom" className="w-full h-full object-cover" />
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-300">
                                                            {dragActive ? 'Suelta aqui' : 'Personal'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-gray-400 text-xs uppercase font-bold">O arrastra tu imagen aqui</label>
                                                    <p className="text-[10px] text-gray-500">
                                                        Haz clic en "Personal" o arrastra una imagen para subirla. Max 5MB.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {preferencesTab === 'search' && (
                                    <div>
                                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                                            <Settings className="w-4 h-4 text-indigo-400" /> Preferencias de busqueda
                                        </h4>
                                        <div className="flex flex-col gap-2 max-w-sm">
                                            <label className="text-gray-400 text-xs uppercase font-bold">Rango de distancia por defecto</label>
                                            <div className="flex items-center gap-3">
                                                <select
                                                    value={editRange}
                                                    onChange={(e) => setEditRange(e.target.value)}
                                                    className="bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500 w-full"
                                                >
                                                    <option value="1">1 km</option>
                                                    <option value="2">2 km</option>
                                                    <option value="5">5 km</option>
                                                    <option value="10">10 km</option>
                                                    <option value="50">50 km</option>
                                                    <option value="100">100 km</option>
                                                    <option value="500">500 km</option>
                                                    <option value="999999">Sin limite</option>
                                                </select>
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-1">Este rango se aplicara automaticamente cuando inicies nueva sesion.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 md:px-5 py-4 border-t border-white/10 bg-[#12182c] space-y-3">
                                {preferencesError && (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-[11px] text-red-200">
                                        {preferencesError}
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => !savingPreferences && setIsEditing(false)}
                                        disabled={savingPreferences}
                                        className="px-3 py-2 text-xs font-bold rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={savePreferences}
                                        disabled={savingPreferences}
                                        className="px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2 min-w-[150px]"
                                    >
                                        {savingPreferences && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Guardar preferencias
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {/* Tabs Navigation (Floating Island Style) */}
                <div className="flex justify-start md:justify-center mb-10 overflow-x-auto pb-4 hide-scrollbar">
                    <div className="inline-flex items-center bg-[#151b2e]/60 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-inner min-w-max gap-1">
                        <button
                            onClick={() => setActiveTab('reviews')}
                            className={`relative px-4 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'reviews'
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg scale-105'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <Star className="w-4 h-4" /> Reseñas ({displayedReviewsCount})
                        </button>
                        <button
                            onClick={() => setActiveTab('lists')}
                            className={`relative px-4 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'lists'
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg scale-105'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <ListIcon className="w-4 h-4" /> Listas ({profileListsCount})
                        </button>
                        <button
                            onClick={() => setActiveTab('following')}
                            className={`relative px-4 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'following'
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg scale-105'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <UserCheck className="w-4 h-4" /> Siguiendo ({profile.followingCount || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab('stats')}
                            className={`relative px-4 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'stats'
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg scale-105'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <BarChart3 className="w-4 h-4" /> Estadísticas
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="min-h-[300px]">
                    {activeTab === 'reviews' && (
                        <>
                            {loadingReviews ? (
                                <div className="py-20 text-center text-gray-500">Cargando reseñas...</div>
                            ) : sortedProfileReviews.length === 0 ? (
                                <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-xl">
                                    <p className="text-gray-500">No hay reseñas recientes.</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="inline-flex rounded-xl border border-white/10 bg-[#151b2e]/70 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setReviewSortMode('recent')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${reviewSortMode === 'recent'
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'text-gray-300 hover:text-white'
                                                    }`}
                                            >
                                                Recientes
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReviewSortMode('top_rated')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${reviewSortMode === 'top_rated'
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'text-gray-300 hover:text-white'
                                                    }`}
                                            >
                                                Mejor valoradas
                                            </button>
                                        </div>
                                        <div className="inline-flex rounded-xl border border-white/10 bg-[#151b2e]/70 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setReviewViewMode('full')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${reviewViewMode === 'full'
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'text-gray-300 hover:text-white'
                                                    }`}
                                            >
                                                Completa
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReviewViewMode('minimal')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${reviewViewMode === 'minimal'
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'text-gray-300 hover:text-white'
                                                    }`}
                                            >
                                                Minimalista
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-2">
                                        {reviewViewMode === 'full' ? (
                                            sortedProfileReviews.map(review => (
                                                <ReviewCard key={review.id} review={review} onDelete={handleDeleteReview} onEdit={handleEditReview} />
                                            ))
                                        ) : (
                                            sortedProfileReviews.map(review => {
                                                const score = typeof review.overallRating === 'number' ? review.overallRating : 0;
                                                const itemLabel = review.itemName || 'Elemento sin nombre';
                                                const placeLabel = review.placeName || 'Lugar';
                                                const cityLabel = review.placeCity || review.placeAddress || 'Sin ciudad';
                                                const listLabel = review.listName || 'Sin lista';
                                                const reviewDate = formatReviewDate(review.createdAt);
                                                const isExpanded = expandedReviewIds.includes(review.id);
                                                const thumbnail = review.photoUrl || review.placeMainImage || '';

                                                return (
                                                    <div key={review.id} className="rounded-xl border border-white/10 bg-[#151b2e]/70 overflow-hidden">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleReviewExpanded(review.id)}
                                                            className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
                                                        >
                                                            <div className="min-w-0 flex items-center gap-3 text-left flex-1">
                                                                <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-gray-800">
                                                                    {thumbnail ? (
                                                                        <img src={thumbnail} alt={itemLabel} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">
                                                                            Sin foto
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-bold text-white truncate">{itemLabel}</div>
                                                                    <div className="text-xs text-indigo-300 truncate">{placeLabel}</div>
                                                                    <div className="text-[11px] text-gray-400 truncate">{cityLabel} • {listLabel}</div>
                                                                    {reviewDate && (
                                                                        <div className="text-[10px] text-gray-500 truncate mt-0.5 flex items-center gap-1">
                                                                            <Calendar className="w-3 h-3" />
                                                                            {reviewDate}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="shrink-0 flex items-center gap-2">
                                                                <div className={`w-11 h-11 rounded-full bg-gradient-to-r ${getScoreBubbleClass(score)} text-white font-black text-sm flex items-center justify-center shadow-lg`}>
                                                                    {score.toFixed(1)}
                                                                </div>
                                                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                            </div>
                                                        </button>

                                                        {isExpanded && (
                                                            <div className="px-2 pb-2">
                                                                <ReviewCard review={review} onDelete={handleDeleteReview} onEdit={handleEditReview} />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Infinite Scroll Trigger */}
                                    {hasMore && (
                                        <div ref={loadMoreRef} className="flex justify-center pt-8 pb-4">
                                            {loadingMore ? (
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                            ) : (
                                                <div className="h-4 w-full" /> // Invisible trigger
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'lists' && (
                        <>
                            {loadingLists || loadingExtraLists ? (
                                <div className="py-20 text-center text-gray-500">Cargando listas...</div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setListSubTab('followed_lists')}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === 'followed_lists'
                                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                                                }`}
                                        >
                                            Listas seguidas ({mainFollowedLists.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setListSubTab('followed_sublists')}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === 'followed_sublists'
                                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                                                }`}
                                        >
                                            Sublistas seguidas ({subFollowedLists.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setListSubTab('created_sublists')}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === 'created_sublists'
                                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                                                }`}
                                        >
                                            Sublistas creadas ({subCreatedLists.length})
                                        </button>
                                    </div>

                                    {listSubTab === 'followed_lists' && renderMinimalListRows(
                                        mainFollowedLists,
                                        'No sigues listas principales.',
                                        false
                                    )}

                                    {listSubTab === 'followed_sublists' && renderMinimalListRows(
                                        subFollowedLists,
                                        'No sigues sublistas.',
                                        true
                                    )}

                                    {listSubTab === 'created_sublists' && renderMinimalListRows(
                                        subCreatedLists,
                                        'No has creado sublistas todavia.',
                                        true
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'stats' && (
                        <>
                            {statsLoading ? (
                                <div className="py-20 text-center text-gray-500">Cargando estadisticas...</div>
                            ) : statsError ? (
                                <div className="py-10 px-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
                                    {statsError}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
                                            <div className="text-[11px] uppercase tracking-wider text-gray-400">Media global</div>
                                            <div className="text-3xl font-black text-white mt-1">{formatStatRating(advancedStats.averageRating)}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
                                            <div className="text-[11px] uppercase tracking-wider text-gray-400">Resenas analizadas</div>
                                            <div className="text-3xl font-black text-white mt-1">{advancedStats.totalReviews}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
                                            <div className="text-[11px] uppercase tracking-wider text-gray-400">Listas valoradas</div>
                                            <div className="text-3xl font-black text-white mt-1">{advancedStats.ratedListsCount}</div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 overflow-hidden">
                                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-white">Media por lista</h3>
                                            <span className="text-[11px] text-gray-400">Resenas y valoracion media</span>
                                        </div>
                                        <div className="px-4 py-2 border-b border-white/10">
                                            <div className="inline-flex rounded-lg border border-white/10 bg-[#0f1424] p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setStatsListSort('reviews_desc')}
                                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${statsListSort === 'reviews_desc'
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'text-gray-300 hover:text-white'
                                                        }`}
                                                >
                                                    Mas resenas
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setStatsListSort('rating_desc')}
                                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${statsListSort === 'rating_desc'
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'text-gray-300 hover:text-white'
                                                        }`}
                                                >
                                                    Mejor valoradas
                                                </button>
                                            </div>
                                        </div>
                                        {sortedStatsPerList.length === 0 ? (
                                            <div className="py-10 text-center text-gray-500 text-sm">No hay datos de valoracion por lista.</div>
                                        ) : (
                                            <div className="divide-y divide-white/10">
                                                {sortedStatsPerList.map((listStat) => (
                                                    <Link
                                                        key={listStat.listId}
                                                        to={`/list/${listStat.listId}`}
                                                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-bold text-white truncate">{listStat.listName}</div>
                                                            <div className="text-[11px] text-gray-400">{listStat.reviewsCount} resenas</div>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <div className="text-xs text-gray-400">Media</div>
                                                            <div className="text-lg font-black text-indigo-300">{formatStatRating(listStat.averageRating)}</div>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'following' && (
                        <FollowingSection targetUserId={targetUserId} />
                    )}
                </div>
            </div>


            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                title={`Compartir perfil de ${profileShareTitle}`}
                url={profileShareUrl}
                text={profileShareText}
                shareEntity={{
                    type: 'profile',
                    id: targetUserId,
                    title: profileShareTitle,
                    subtitle: profileShareSubtitle,
                    route: `/profile/${targetUserId}`,
                    url: profileShareUrl,
                    imageUrl: profile.photoUrl || undefined,
                }}
            />
            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetId={targetUserId!}
                targetName={profile.displayName || profile.username || 'Usuario'}
                targetType="user"
                itemName="Perfil de Usuario"
            />
            {isFlowOpen && (
                <AddReviewForm
                    listId={editingListId}
                    editReviewId={editingReviewId || undefined}
                    onClose={() => {
                        setIsFlowOpen(false);
                        setEditingReviewId(null);
                        setEditingListId(null);
                    }}
                    onSuccess={() => {
                        refreshReviews();
                        setStatsLoadedUserId(null);
                        setIsFlowOpen(false);
                        setEditingReviewId(null);
                        setEditingListId(null);
                    }}
                />
            )}
        </div >
    );
};

