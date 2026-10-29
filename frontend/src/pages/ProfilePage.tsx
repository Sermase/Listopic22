import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUserProfile, type UserProfileEntity } from "../hooks/useUserProfile";
import { useBackToClose, useSheetDismiss } from '../hooks/useSheetDismiss';
import { computeTasteMatch } from "../utils/tasteMatch";
import { TastePassport } from "../components/profile/TastePassport";
import { useLists } from "../hooks/useLists";
import { useReviews } from "../hooks/useReviews";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useAppConfig } from "../context/AppConfigContext";
import {
  Settings,
  Calendar,
  List as ListIcon,
  Star,
  UserPlus,
  UserCheck,
  MessageCircle,
  MapPin as MapPinIcon,
  Bug,
  Flag,
  MoreVertical,
  Loader2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Sparkles,
  Share2,
  X,
  Grid3X3,
  AlignJustify,
  Clock,
  TrendingUp,
  HeartHandshake,
} from "lucide-react";
import { ReportModal } from "../components/ReportModal";
import { EditProfileSheet } from "../components/settings/EditProfileSheet";
import {
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "../firebase";
import { updateProfile } from "firebase/auth";
import { ReviewCard } from "../components/ReviewCard";
import { LazyAddReviewForm as AddReviewForm, LazyShareModal as ShareModal } from "../components/lazy";
import { FullMapModal } from "../components/map/FullMapModal";
import { Skeleton } from "../components/Skeleton";
import { FastAverageColor } from "fast-average-color";
import { ChatService } from "../services/ChatService";
import { FollowingSection } from "../components/profile/FollowingSection";
import { ProgressiveImage } from "../components/ProgressiveImage";
import { BadgeDisplay } from "../components/profile/BadgeDisplay";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  documentId,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
} from "firebase/firestore";
import { FollowersSection } from "../components/profile/FollowersSection";
import ProfileStatsTab from "../components/profile/ProfileStatsTab";
import { SignInToSee } from "../components/profile/SignInToSee";
import { ProfileStatCard } from "../components/ProfileStatCard";
import { ReviewGalleryGrid } from "../components/ReviewGalleryGrid";
import {
  buildGamificationMetrics,
  getLevelInfo,
  normalizeEarnedBadgeIds,
} from "../utils/gamification";
import { buildPublicRouteUrl } from "../utils/publicUrl";
import { getSelectedProfileReviewListId, selectProfileReviewResults } from "../utils/profileReviewFilter";
import { EntityHero } from "../components/EntityHero";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useToast } from "../context/ToastContext";
import { compareByRank } from "../lib/scoring";
import { haptic } from '../utils/haptics';

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
  uniquePlacesCount: number;
  reviewsWithPhotoCount: number;
  reviewPhotosCount: number;
  placePhotosCount: number;
  // Map of listId to stats
  statsByList: Record<
    string,
    {
      listId: string;
      listName: string;
      reviewsCount: number;
      averageRating: number;
    }
  >;
  /** Todas las Listas con alguna reseña (con o sin nota): alimenta el filtro. */
  reviewedLists: Record<string, { listId: string; listName: string; reviewsCount: number }>;
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

type DetailsModalTab = "lists" | "following" | "followers" | "stats" | "level";
const DETAILS_TAB_ORDER: DetailsModalTab[] = ["stats", "followers", "level", "following", "lists"];

const EMPTY_ADVANCED_STATS: AdvancedProfileStats = {
  totalReviews: 0,
  averageRating: 0,
  ratedListsCount: 0,
  uniquePlacesCount: 0,
  reviewsWithPhotoCount: 0,
  reviewPhotosCount: 0,
  placePhotosCount: 0,
  statsByList: {},
  reviewedLists: {},
};

const collectReviewedLists = (
  reviews: Array<Record<string, unknown>>,
  namesById: Record<string, string> = {},
): AdvancedProfileStats["reviewedLists"] => {
  const out: AdvancedProfileStats["reviewedLists"] = {};
  reviews.forEach((review) => {
    const listId = typeof review.listId === "string" ? review.listId.trim() : "";
    if (!listId) return;
    const name = namesById[listId]
      || (typeof review.listName === "string" && review.listName.trim() ? review.listName.trim() : "Lista");
    const current = out[listId] || { listId, listName: name, reviewsCount: 0 };
    current.reviewsCount += 1;
    out[listId] = current;
  });
  return out;
};

const getErrorCode = (error: unknown): string | null => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const candidate = (error as { code?: unknown }).code;
    return typeof candidate === "string" ? candidate : null;
  }
  return null;
};

const normalizeStoragePath = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("gs://")) {
    return trimmed.replace(/^gs:\/\/[^/]+\//, "");
  }

  const storageObjectMatch = trimmed.match(/\/o\/([^?]+)/);
  if (storageObjectMatch?.[1]) {
    try {
      return decodeURIComponent(storageObjectMatch[1]);
    } catch {
      return storageObjectMatch[1];
    }
  }

  return trimmed;
};

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { openAuthPrompt } = useAuthPrompt();
  const appConfig = useAppConfig();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const focusedReviewId = searchParams.get("reviewId");
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<
    "lists" | "reviews" | "following" | "stats"
  >("reviews");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFlowOpen, setIsFlowOpen] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [reviewViewMode, setReviewViewMode] = useState<"full" | "gallery">(
    "gallery",
  );
  // El mapa se abre a pantalla completa; al abrirlo se cargan todas las reseñas (y se quedan).
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapWantsAll, setMapWantsAll] = useState(false);
  const [reviewListFilter, setReviewListFilter] = useState<string>("all");
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  useBackToClose(isAvatarModalOpen, () => setIsAvatarModalOpen(false));
  const [reviewSortMode, setReviewSortMode] = useState<"recent" | "top_rated">(
    "recent",
  );
  const [expandedReviewIds, setExpandedReviewIds] = useState<string[]>([]);
  const [listSubTab, setListSubTab] = useState<
    "followed_lists" | "followed_sublists" | "created_sublists"
  >("followed_lists");
  const [statsListSort, setStatsListSort] = useState<
    "reviews_desc" | "rating_desc"
  >("reviews_desc");
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoadedUserId, setStatsLoadedUserId] = useState<string | null>(
    null,
  );
  const [advancedStats, setAdvancedStats] =
    useState<AdvancedProfileStats>(EMPTY_ADVANCED_STATS);
  const [favoriteReview, setFavoriteReview] =
    useState<FavoriteReviewSummary | null>(null);
  const [ownAffinityReviews, setOwnAffinityReviews] = useState<any[]>([]);
  const [affinityLoading, setAffinityLoading] = useState(false);

  // Details Modal State
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const detailsRef = useSheetDismiss(() => setIsDetailsModalOpen(false), isDetailsModalOpen);
  const [detailsModalTab, setDetailsModalTab] =
    useState<DetailsModalTab>("stats");
  useBodyScrollLock(isAvatarModalOpen || isEditing || isDetailsModalOpen);

  const handleEditReview = (review: any) => {
    setEditingReviewId(review.id);
    setEditingListId(review.listId || null);
    setIsFlowOpen(true);
  };

  // Deslizar a izquierda o derecha en el detalle cambia de pestaña (mismo orden que arriba).
  const tabSwipeRef = useRef<{ x: number; y: number } | null>(null);
  const onDetailsTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Lo que ya se desplaza de lado (carruseles) se queda su gesto.
    tabSwipeRef.current = target.closest(".overflow-x-auto, [data-no-tab-swipe]") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onDetailsTouchEnd = (e: React.TouchEvent) => {
    const start = tabSwipeRef.current;
    tabSwipeRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setDetailsModalTab((current) => {
      const i = DETAILS_TAB_ORDER.indexOf(current);
      const next = DETAILS_TAB_ORDER[i + (dx < 0 ? 1 : -1)];
      return next ?? current;
    });
  };

  const openDetailsModal = (tab: DetailsModalTab) => {
    setDetailsModalTab(tab);
    setIsDetailsModalOpen(true);
  };

  // Seguidores, seguidos y Listas seguidas solo se leen con sesión (reglas):
  // se cierra el detalle para que el aviso de acceso quede delante.
  const promptSignInFromDetails = (action: string) => {
    setIsDetailsModalOpen(false);
    openAuthPrompt(action);
  };

  // Determine target user ID
  const targetUserId = paramUserId || user?.uid;
  const isOwnProfile = user?.uid === targetUserId;

  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [heroProfileReady, setHeroProfileReady] = useState(false);
  const [failedProfilePhotoUrl, setFailedProfilePhotoUrl] = useState<string | null>(null);
  const [profileStoragePhotoUrl, setProfileStoragePhotoUrl] = useState<string | null>(null);

  // Hooks need to be before effects
  const {
    profile: rawProfile,
    loading: loadingProfile,
    error: errorProfile,
  } = useUserProfile(targetUserId);
  const { lists: ownedLists, loading: loadingLists } = useLists(
    "recent",
    targetUserId,
    isOwnProfile,
  );

  useEffect(() => {
    setStatsLoadedUserId(null);
    setStatsError(null);
    setAdvancedStats(EMPTY_ADVANCED_STATS);
    setFavoriteReview(null);
    setIsDetailsModalOpen(false);
    setDetailsModalTab("stats");
    setIsAvatarModalOpen(false);
    setDominantColor(null);
    setFailedProfilePhotoUrl(null);
    setProfileStoragePhotoUrl(null);
  }, [targetUserId]);

  // Ordenar por nota solo es correcto con todas las reseñas cargadas: se
  // piden en páginas de 100 (máximo de las reglas) hasta agotarlas.
  const loadAllReviews = reviewSortMode === "top_rated" || mapWantsAll;
  const {
    reviews: fetchedReviews,
    loading: baseLoadingReviews,
    refresh: refreshReviews,
    fetchMore: fetchMoreBaseReviews,
    hasMore: hasMoreBaseReviews,
    loadingMore: loadingMoreBaseReviews,
  } = useReviews({ type: "recent", userId: targetUserId, limit: loadAllReviews ? 100 : reviewViewMode === "gallery" ? 10 : 3 });
  const selectedReviewListId = getSelectedProfileReviewListId(reviewListFilter);
  const filteredReviewQuery = useReviews({
    type: "recent",
    userId: targetUserId,
    listId: selectedReviewListId,
    limit: loadAllReviews ? 100 : reviewViewMode === "gallery" ? 20 : 10,
    enabled: Boolean(selectedReviewListId),
  });
  const isReviewListFilterActive = Boolean(selectedReviewListId);
  const fetchMore = isReviewListFilterActive ? filteredReviewQuery.fetchMore : fetchMoreBaseReviews;
  const hasMore = isReviewListFilterActive ? filteredReviewQuery.hasMore : hasMoreBaseReviews;
  const loadingMore = isReviewListFilterActive ? filteredReviewQuery.loadingMore : loadingMoreBaseReviews;
  const loadingReviews = isReviewListFilterActive ? filteredReviewQuery.loading : baseLoadingReviews;
  const [localReviews, setLocalReviews] = useState<any[]>([]);

  // Infinite Scroll Effect (Must be after useReviews)
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  // Refs so the observer callback always reads the latest values without
  // needing to re-create the observer. fetchMoreRef avoids the observer
  // effect depending on `fetchMore` (which changes reference every render).
  const hasMoreRef = React.useRef(hasMore);
  const isFetchingRef = React.useRef(false); // synchronous guard against double-fire
  const fetchMoreRef = React.useRef(fetchMore);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { fetchMoreRef.current = fetchMore; }, [fetchMore]);
  // Reset synchronous guard when the load finishes.
  useEffect(() => { if (!loadingMore) isFetchingRef.current = false; }, [loadingMore]);

  useEffect(() => {
    if (activeTab !== "reviews" || loadingReviews) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !isFetchingRef.current) {
          isFetchingRef.current = true; // block synchronously before any re-render
          fetchMoreRef.current();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
    // fetchMore intentionally omitted — we access it via fetchMoreRef
    // localReviews.length > 0 ensures the observer re-runs once reviews populate the DOM.
    // hasMore/loadingMore: the trigger remounts when hasMore toggles, and a new
    // observer re-checks it if it is still visible after a page loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadingReviews, localReviews.length > 0, hasMore, loadingMore, isReviewListFilterActive]);

  useEffect(() => {
    if (!loadAllReviews || loadingReviews || loadingMore || !hasMore) return;
    fetchMore();
  }, [loadAllReviews, loadingReviews, loadingMore, hasMore, fetchMore]);

  // Additional List States
  const [followedLists, setFollowedLists] = useState<any[]>([]);
  const [loadingExtraLists, setLoadingExtraLists] = useState(false);

  // Derived Lists
  const subCreatedLists = ownedLists.filter((l) => !!l.parentListId);

  const mainFollowedLists = followedLists.filter((l) => !l.parentListId);
  const subFollowedLists = followedLists.filter((l) => !!l.parentListId);
  const profileListsCount =
    mainFollowedLists.length + subFollowedLists.length + subCreatedLists.length;

  // Fetch Followed Lists
  useEffect(() => {
    if (!targetUserId) return;

    const fetchExtra = async () => {
      setLoadingExtraLists(true);
      try {
        // Followed Lists (From 'followingLists' subcollection). Las reglas solo
        // dejan leerla con sesión iniciada: sin sesión no se pide (evita el error).
        if (!user) {
          setFollowedLists([]);
          return;
        }
        const qFollowed = query(
          collection(db, "users", targetUserId, "followingLists"),
        );
        const snapFollowed = await getDocs(qFollowed);

        if (!snapFollowed.empty) {
          const followedIds = snapFollowed.docs.map((d) => d.id);
          // Fetch full details for the first 20 to check isPublic/parentListId
          // Firestore 'in' query supports max 10/30 depending on version. 10 safe.
          // We'll batch or just fetch individual if few.
          const chunks = [];
          for (let i = 0; i < followedIds.length; i += 10) {
            chunks.push(followedIds.slice(i, i + 10));
          }

          const allFollowedDetails: any[] = [];
          for (const chunk of chunks) {
            try {
              // Only fetch PUBLIC lists to avoid permission errors.
              // If a user follows a private list, it won't be shown here, which is standard behavior
              // unless we implement a specific 'sharedWithMe' check.
              const qDetails = query(
                collection(db, "lists"),
                where(documentId(), "in", chunk),
                where("isPublic", "==", true),
              );
              const capsShot = await getDocs(qDetails);
              allFollowedDetails.push(
                ...capsShot.docs.map((d) => ({ id: d.id, ...d.data() })),
              );
            } catch (chunkError) {
              console.warn("Error fetching chunk of lists", chunkError);
            }
          }

          // Filter Privacy
          // If viewing another profile, only show their followed lists if those lists are PUBLIC.
          // Private lists followed by someone else shouldn't be exposed details unless viewer has access.
          // We'll stick to isPublic == true.
          // Also filter out any that failed to fetch (deleted).
          const validFollowed = allFollowedDetails.filter(
            (l) =>
              l.isPublic ||
              (user &&
                (l.userId === user.uid || l.editors?.includes(user.uid))),
          );
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
      setStatsLoadedUserId(null);
    }
  }, [fetchedReviews]);

  useEffect(() => {
    if (!focusedReviewId || requestedTab !== "reviews") return;
    setActiveTab("reviews");
    setReviewListFilter("all");
    setReviewViewMode("gallery");
    setExpandedReviewIds((prev) =>
      prev.includes(focusedReviewId) ? prev : [focusedReviewId],
    );
  }, [focusedReviewId, requestedTab]);

  useEffect(() => {
    if (!focusedReviewId || loadingReviews || loadingMore) return;
    if (localReviews.some((review) => review.id === focusedReviewId)) return;
    if (!hasMore) return;
    fetchMore();
  }, [focusedReviewId, localReviews, loadingReviews, loadingMore, hasMore, fetchMore]);

  useEffect(() => {
    if (!focusedReviewId || activeTab !== "reviews") return;
    if (!localReviews.some((review) => review.id === focusedReviewId)) return;

    const timeoutId = window.setTimeout(() => {
      document
        .getElementById(`profile-review-${focusedReviewId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [focusedReviewId, activeTab, localReviews, expandedReviewIds]);

  useEffect(() => {
    if (!appConfig.showProfileAffinity || isOwnProfile || !user?.uid || !targetUserId) {
      setOwnAffinityReviews([]);
      setAffinityLoading(false);
      return;
    }

    let cancelled = false;
    const fetchOwnAffinityReviews = async () => {
      setAffinityLoading(true);
      try {
        const snap = await getDocs(query(
          collectionGroup(db, "reviews"),
          where("userId", "==", user.uid),
          limit(80),
        ));
        if (cancelled) return;
        setOwnAffinityReviews(snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          listId: (d.data() as any).listId || d.ref.parent.parent?.id,
        })));
      } catch (error) {
        if (getErrorCode(error) !== "permission-denied") {
          console.warn("[ProfilePage] Error fetching affinity reviews:", error);
        }
        if (!cancelled) setOwnAffinityReviews([]);
      } finally {
        if (!cancelled) setAffinityLoading(false);
      }
    };

    fetchOwnAffinityReviews();
    return () => {
      cancelled = true;
    };
  }, [appConfig.showProfileAffinity, isOwnProfile, targetUserId, user?.uid]);

  const reviewAuthorFallback = useMemo(() => {
    for (const review of localReviews) {
      const reviewAny = review as Record<string, unknown>;
      const reviewUserId = reviewAny.userId || reviewAny.authorId;
      if (reviewUserId && reviewUserId !== targetUserId) continue;

      const displayName =
        typeof reviewAny.authorName === "string" && reviewAny.authorName.trim()
          ? reviewAny.authorName.trim()
          : "";
      const photoUrl =
        typeof reviewAny.authorPhoto === "string" && reviewAny.authorPhoto.trim()
          ? reviewAny.authorPhoto.trim()
          : typeof reviewAny.authorPhotoUrl === "string" && reviewAny.authorPhotoUrl.trim()
            ? reviewAny.authorPhotoUrl.trim()
            : "";

      if (displayName || photoUrl) return { displayName, photoUrl };
    }
    return { displayName: "", photoUrl: "" };
  }, [localReviews, targetUserId]);

  useEffect(() => {
    const rawProfileAny = rawProfile as (UserProfileEntity & Record<string, unknown>) | null;
    const storagePath = normalizeStoragePath(rawProfileAny?.photoStoragePath);

    if (!storagePath) {
      setProfileStoragePhotoUrl(null);
      return;
    }

    let cancelled = false;
    getDownloadURL(ref(storage, storagePath))
      .then((url) => {
        if (!cancelled) setProfileStoragePhotoUrl(url);
      })
      .catch((error) => {
        console.warn("ProfilePage: could not resolve profile photo storage path", error);
        if (!cancelled) setProfileStoragePhotoUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [rawProfile]);

  const profile = useMemo<UserProfileEntity | null>(() => {
    if (!rawProfile) return null;
    const rawProfileAny = rawProfile as UserProfileEntity & Record<string, unknown>;
    const ownAuthDisplayName = isOwnProfile ? user?.displayName?.trim() || "" : "";
    const ownAuthPhotoUrl = isOwnProfile ? user?.photoURL?.trim() || "" : "";
    const fullName = [rawProfile.name, rawProfile.surnames].filter(Boolean).join(" ").trim();
    const currentPhotoUrl = rawProfile.photoUrl?.trim() || "";
    const storagePhotoUrl = profileStoragePhotoUrl?.trim() || "";
    const shouldPreferStoragePhoto =
      storagePhotoUrl && (!currentPhotoUrl || currentPhotoUrl.includes("googleusercontent.com"));
    const legacyPhotoUrl =
      typeof rawProfileAny.photoURL === "string" && rawProfileAny.photoURL.trim()
        ? rawProfileAny.photoURL.trim()
        : typeof rawProfileAny.avatarUrl === "string" && rawProfileAny.avatarUrl.trim()
          ? rawProfileAny.avatarUrl.trim()
          : "";

    return {
      ...rawProfile,
      displayName:
        rawProfile.displayName ||
        rawProfile.username ||
        fullName ||
        reviewAuthorFallback.displayName ||
        ownAuthDisplayName,
      photoUrl:
        (shouldPreferStoragePhoto ? storagePhotoUrl : "") ||
        currentPhotoUrl ||
        legacyPhotoUrl ||
        storagePhotoUrl ||
        reviewAuthorFallback.photoUrl ||
        ownAuthPhotoUrl,
    };
  }, [isOwnProfile, profileStoragePhotoUrl, rawProfile, reviewAuthorFallback.displayName, reviewAuthorFallback.photoUrl, user?.displayName, user?.photoURL]);

  useEffect(() => {
    if (!isOwnProfile || !user || !targetUserId || !rawProfile) return;

    const patch: Record<string, unknown> = {};
    const rawProfileAny = rawProfile as UserProfileEntity & Record<string, unknown>;
    const rawPhotoUrl = rawProfile.photoUrl?.trim() || "";
    const storagePhotoUrl = profileStoragePhotoUrl?.trim() || "";
    const legacyPhotoUrl = typeof rawProfileAny.photoURL === "string" ? rawProfileAny.photoURL.trim() : "";
    const nextPhotoUrl = storagePhotoUrl || rawPhotoUrl || legacyPhotoUrl || user.photoURL?.trim() || "";
    const nextDisplayName = rawProfile.displayName || user.displayName?.trim() || "";

    if ((!rawPhotoUrl || (storagePhotoUrl && rawPhotoUrl !== storagePhotoUrl)) && nextPhotoUrl) {
      patch.photoUrl = nextPhotoUrl;
    }
    if (!rawProfile.displayName && nextDisplayName) patch.displayName = nextDisplayName;
    if (!Object.keys(patch).length) return;

    void setDoc(
      doc(db, "users", targetUserId),
      { ...patch, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((error) => {
      console.warn("ProfilePage: could not repair missing profile identity fields", error);
    });
    if (storagePhotoUrl && user.photoURL !== storagePhotoUrl) {
      void updateProfile(user, { photoURL: storagePhotoUrl }).catch((error) => {
        console.warn("ProfilePage: could not repair auth profile photo", error);
      });
    }
  }, [isOwnProfile, profileStoragePhotoUrl, rawProfile, targetUserId, user]);

  useEffect(() => {
    const photoUrl = profile?.photoUrl?.trim();
    if (!photoUrl || photoUrl === failedProfilePhotoUrl) {
      setDominantColor(null);
      return;
    }

    // Google account avatars can rate-limit repeated anonymous image probes.
    // We still render them as avatars, but we do not use them for color sampling.
    if (photoUrl.includes('googleusercontent.com')) {
      setDominantColor(null);
      return;
    }

    let cancelled = false;
    const fac = new FastAverageColor();
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      fac.getColorAsync(img)
        .then((color) => {
          if (!cancelled) setDominantColor(color.rgba);
        })
        .catch((e) => {
          console.log("FAC Error:", e);
        });
    };
    img.onerror = () => {
      if (!cancelled) {
        setDominantColor(null);
      }
    };
    img.src = photoUrl;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [failedProfilePhotoUrl, profile?.photoUrl]);

  useEffect(() => {
    if (!targetUserId) return;
    if (!isOwnProfile && baseLoadingReviews) return;
    if (statsLoadedUserId === targetUserId) return;

    let cancelled = false;

    const getCreatedAtMillis = (value: any): number => {
      if (!value) return 0;
      if (typeof value?.toDate === "function") {
        try {
          return value.toDate().getTime();
        } catch {
          return 0;
        }
      }
      if (typeof value?.seconds === "number") return value.seconds * 1000;
      if (value instanceof Date) return value.getTime();
      if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const getReviewPhotoUrls = (review: Record<string, any>): string[] => {
      const urls = new Set<string>();
      const addPhoto = (photo: unknown) => {
        if (typeof photo !== "string") return;
        const trimmed = photo.trim();
        if (trimmed) urls.add(trimmed);
      };

      addPhoto(review.photoUrl);
      if (Array.isArray(review.photoUrls)) review.photoUrls.forEach(addPhoto);
      if (Array.isArray(review.photos)) review.photos.forEach(addPhoto);
      if (Array.isArray(review.images)) review.images.forEach(addPhoto);

      return Array.from(urls);
    };

    const buildStatsFromReviews = (
      reviews: Array<Record<string, any>>,
      options: { placePhotosCount?: number } = {},
    ) => {
      let totalScore = 0;
      let scoredReviewsCount = 0;
      let reviewsWithPhotoCount = 0;
      let reviewPhotosCount = 0;
      const perListMap = new Map<
        string,
        { listName: string; reviewsCount: number; totalScore: number }
      >();
      const uniquePlaceIds = new Set<string>();
      let favoriteCandidate: Record<string, any> | null = null;
      let favoriteCandidateDate = 0;

      reviews.forEach((review) => {
        const rawScore = review.overallRating ?? review.rating ?? review.avgRating;
        const numericScore = typeof rawScore === "number" ? rawScore : Number(rawScore);
        const hasScore = typeof rawScore !== "undefined" && rawScore !== null && !Number.isNaN(numericScore);
        const placeId = typeof review.placeId === "string" ? review.placeId.trim() : "";
        if (placeId) uniquePlaceIds.add(placeId);

        const reviewPhotoUrls = getReviewPhotoUrls(review);
        if (reviewPhotoUrls.length > 0) {
          reviewsWithPhotoCount += 1;
          reviewPhotosCount += reviewPhotoUrls.length;
        }

        if (hasScore) {
          totalScore += numericScore;
          scoredReviewsCount += 1;
          const reviewDate = getCreatedAtMillis(review.createdAt);
          if (
            !favoriteCandidate ||
            numericScore > Number(favoriteCandidate.overallRating) ||
            (numericScore === Number(favoriteCandidate.overallRating) && reviewDate > favoriteCandidateDate)
          ) {
            favoriteCandidate = review;
            favoriteCandidateDate = reviewDate;
          }
        }

        const listId = typeof review.listId === "string" ? review.listId.trim() : "";
        if (!listId || !hasScore) return;
        const fallbackListName =
          typeof review.listName === "string" && review.listName.trim().length > 0
            ? review.listName.trim()
            : "Lista";
        const current = perListMap.get(listId) || {
          listName: fallbackListName,
          reviewsCount: 0,
          totalScore: 0,
        };
        current.reviewsCount += 1;
        current.totalScore += numericScore;
        perListMap.set(listId, current);
      });

      const perList = Array.from(perListMap.entries())
        .map(([listId, value]) => ({
          listId,
          listName: value.listName || "Lista",
          reviewsCount: value.reviewsCount,
          averageRating: value.reviewsCount > 0 ? value.totalScore / value.reviewsCount : 0,
        }))
        .sort((a, b) => {
          if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
          return b.averageRating - a.averageRating;
        });

      const statsByList = perList.reduce((acc, curr) => {
        acc[curr.listId] = curr;
        return acc;
      }, {} as Record<string, ListRatingStats>);

      const favoriteCandidateData = favoriteCandidate as Record<string, any> | null;
      const favoritePlaceNameRaw =
        favoriteCandidateData && typeof favoriteCandidateData.placeName === "string"
          ? favoriteCandidateData.placeName.trim()
          : "";
      const favoritePlaceAddressRaw =
        favoriteCandidateData && typeof favoriteCandidateData.placeAddress === "string"
          ? favoriteCandidateData.placeAddress.trim()
          : "";
      const favoritePlaceName =
        favoritePlaceNameRaw ||
        (favoritePlaceAddressRaw ? favoritePlaceAddressRaw.split(",")[0].trim() : "");
      const favorite: FavoriteReviewSummary | null = favoriteCandidateData
        ? {
          id: String(favoriteCandidateData.id || ""),
          placeId: typeof favoriteCandidateData.placeId === "string" ? favoriteCandidateData.placeId : "",
          listId: String(favoriteCandidateData.listId || ""),
          listName: typeof favoriteCandidateData.listName === "string" ? favoriteCandidateData.listName : "Lista",
          itemName: typeof favoriteCandidateData.itemName === "string" ? favoriteCandidateData.itemName : "Elemento",
          placeName: favoritePlaceName,
          photoUrl: typeof favoriteCandidateData.photoUrl === "string" ? favoriteCandidateData.photoUrl : "",
          score: Number(favoriteCandidateData.overallRating) || 0,
        }
        : null;

      return {
        stats: {
          totalReviews: scoredReviewsCount,
          averageRating: scoredReviewsCount > 0 ? totalScore / scoredReviewsCount : 0,
          ratedListsCount: perList.length,
          uniquePlacesCount: uniquePlaceIds.size,
          reviewsWithPhotoCount,
          reviewPhotosCount,
          placePhotosCount: options.placePhotosCount || 0,
          statsByList,
          reviewedLists: collectReviewedLists(reviews),
        },
        favorite,
      };
    };

    const loadAdvancedStats = async () => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        // Las reglas limitan las consultas de reseñas a 100 por página y, en el
        // perfil de otra persona, solo permiten leer sus reseñas públicas. Se
        // leen todas (no solo las del mosaico) para que las estadísticas y el
        // filtro por Listas cuenten lo que hay de verdad.
        const pageSize = 100;
        const viewingOwnStats = user?.uid === targetUserId;
        const maxReviews = viewingOwnStats ? 3000 : 1000;
        const allReviews: Array<Record<string, any>> = [];
        let cursor: any = null;

        while (allReviews.length < maxReviews) {
          const constraints: any[] = viewingOwnStats
            ? [where("userId", "==", targetUserId), orderBy("createdAt", "desc")]
            : [
              where("visibility", "==", "public"),
              where("userId", "==", targetUserId),
              orderBy("createdAt", "desc"),
            ];

          if (cursor) {
            constraints.push(startAfter(cursor));
          }

          constraints.push(limit(pageSize));

          const pageSnapshot = await getDocs(
            query(collectionGroup(db, "reviews"), ...constraints),
          );
          if (pageSnapshot.empty) break;

          const pageRows = pageSnapshot.docs
            .map((reviewDoc): Record<string, any> | null => {
              const pathSegments = reviewDoc.ref.path.split("/");
              // Accept canonical subcollection path (lists/{listId}/reviews/{id})
              // and legacy root collection path (reviews/{id})
              const isValidPath =
                (pathSegments.length === 4 &&
                  pathSegments[0] === "lists" &&
                  pathSegments[2] === "reviews") ||
                (pathSegments.length === 2 &&
                  pathSegments[0] === "reviews");

              if (!isValidPath) {
                return null;
              }

              const reviewData = reviewDoc.data() as Record<string, any>;
              const inferredListId =
                typeof reviewData.listId === "string" &&
                  reviewData.listId.trim().length > 0
                  ? reviewData.listId
                  : reviewDoc.ref.parent.parent?.id || "";

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
          const listId =
            typeof review.listId === "string" ? review.listId.trim() : "";
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
              .map((review) =>
                typeof review.listId === "string" ? review.listId : "",
              )
              .filter((listId) => listId.length > 0),
          ),
        );

        const listNamesById: Record<string, string> = {};
        for (let i = 0; i < listIds.length; i += 10) {
          const chunk = listIds.slice(i, i + 10);
          try {
            const listSnapshot = await getDocs(
              query(collection(db, "lists"), where(documentId(), "in", chunk)),
            );
            listSnapshot.docs.forEach((listDoc) => {
              const listData = listDoc.data() as Record<string, any>;
              if (
                typeof listData.name === "string" &&
                listData.name.trim().length > 0
              ) {
                listNamesById[listDoc.id] = listData.name.trim();
              }
            });
          } catch (listError) {
            console.warn("Error loading list names for stats chunk", listError);
          }
        }

        let totalScore = 0;
        let scoredReviewsCount = 0;
        let reviewsWithPhotoCount = 0;
        let reviewPhotosCount = 0;
        const perListMap = new Map<
          string,
          { listName: string; reviewsCount: number; totalScore: number }
        >();
        const uniquePlaceIds = new Set<string>();
        let favoriteCandidate: Record<string, any> | null = null;
        let favoriteCandidateDate = 0;

        let placePhotosCount = 0;
        if (targetUserId === user?.uid) {
          try {
            const placePhotosSnapshot = await getDocs(
              query(
                collectionGroup(db, "photos"),
                where("userId", "==", targetUserId),
                limit(3000),
              ),
            );
            placePhotosCount = placePhotosSnapshot.docs.filter((photoDoc) => {
              const pathSegments = photoDoc.ref.path.split("/");
              return pathSegments.length === 4 &&
                pathSegments[0] === "places" &&
                pathSegments[2] === "photos";
            }).length;
          } catch (placePhotosError) {
            console.warn("Error loading user place photo stats", placePhotosError);
          }
        }

        canonicalReviews.forEach((review) => {
          const rawScore = review.overallRating ?? review.rating ?? review.avgRating;
          const numericScore = typeof rawScore === "number" ? rawScore : Number(rawScore);
          const hasScore = typeof rawScore !== "undefined" && rawScore !== null && !Number.isNaN(numericScore);
          const placeId =
            typeof review.placeId === "string" ? review.placeId.trim() : "";

          if (placeId) {
            uniquePlaceIds.add(placeId);
          }

          const reviewPhotoUrls = getReviewPhotoUrls(review);
          if (reviewPhotoUrls.length > 0) {
            reviewsWithPhotoCount += 1;
            reviewPhotosCount += reviewPhotoUrls.length;
          }

          if (hasScore) {
            totalScore += numericScore;
            scoredReviewsCount += 1;

            const reviewDate = getCreatedAtMillis(review.createdAt);
            if (
              !favoriteCandidate ||
              numericScore > Number(favoriteCandidate.overallRating) ||
              (numericScore === Number(favoriteCandidate.overallRating) &&
                reviewDate > favoriteCandidateDate)
            ) {
              favoriteCandidate = review;
              favoriteCandidateDate = reviewDate;
            }
          }

          const listId =
            typeof review.listId === "string" ? review.listId.trim() : "";
          if (!listId || !hasScore) return;

          const fallbackListName =
            listNamesById[listId] ||
            (typeof review.listName === "string" &&
              review.listName.trim().length > 0
              ? review.listName.trim()
              : "Lista");
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
            listName: value.listName || "Lista",
            reviewsCount: value.reviewsCount,
            averageRating:
              value.reviewsCount > 0
                ? value.totalScore / value.reviewsCount
                : 0,
          }))
          .sort((a, b) => {
            if (b.reviewsCount !== a.reviewsCount)
              return b.reviewsCount - a.reviewsCount;
            return b.averageRating - a.averageRating;
          });

        const statsByList = perList.reduce((acc, curr) => {
          acc[curr.listId] = curr;
          return acc;
        }, {} as Record<string, any>);

        if (!cancelled) {
          const favoriteCandidateData = favoriteCandidate as Record<
            string,
            any
          > | null;
          const favoritePlaceNameRaw =
            favoriteCandidateData &&
              typeof favoriteCandidateData.placeName === "string"
              ? favoriteCandidateData.placeName.trim()
              : "";
          const favoritePlaceAddressRaw =
            favoriteCandidateData &&
              typeof favoriteCandidateData.placeAddress === "string"
              ? favoriteCandidateData.placeAddress.trim()
              : "";
          const favoritePlaceName =
            favoritePlaceNameRaw ||
            (favoritePlaceAddressRaw
              ? favoritePlaceAddressRaw.split(",")[0].trim()
              : "");
          const favorite: FavoriteReviewSummary | null = favoriteCandidateData
            ? {
              id: String(favoriteCandidateData.id || ""),
              placeId:
                typeof favoriteCandidateData.placeId === "string"
                  ? favoriteCandidateData.placeId
                  : "",
              listId: String(favoriteCandidateData.listId || ""),
              listName:
                listNamesById[String(favoriteCandidateData.listId || "")] ||
                (typeof favoriteCandidateData.listName === "string"
                  ? favoriteCandidateData.listName
                  : "Lista"),
              itemName:
                typeof favoriteCandidateData.itemName === "string"
                  ? favoriteCandidateData.itemName
                  : "Elemento",
              placeName: favoritePlaceName,
              photoUrl:
                typeof favoriteCandidateData.photoUrl === "string"
                  ? favoriteCandidateData.photoUrl
                  : "",
              score: Number(favoriteCandidateData.overallRating) || 0,
            }
            : null;

          setAdvancedStats({
            totalReviews: scoredReviewsCount,
            averageRating:
              scoredReviewsCount > 0 ? totalScore / scoredReviewsCount : 0,
            ratedListsCount: perList.length,
            uniquePlacesCount: uniquePlaceIds.size,
            reviewsWithPhotoCount,
            reviewPhotosCount,
            placePhotosCount,
            statsByList,
            reviewedLists: collectReviewedLists(canonicalReviews, listNamesById),
          });
          setFavoriteReview(favorite);
          setStatsLoadedUserId(targetUserId);
        }
      } catch (error) {
        const code = getErrorCode(error);
        if (!cancelled) {
          if (!isOwnProfile) {
            // Perfil ajeno: si la lectura completa falla, lo que haya cargado.
            console.warn("Profile stats: full read failed, using loaded reviews", error);
            const { stats, favorite } = buildStatsFromReviews(localReviews as Array<Record<string, any>>);
            setAdvancedStats({
              ...stats,
              totalReviews: stats.totalReviews || profile?.reviewsCount || profile?.reviewCount || 0,
            });
            setFavoriteReview(favorite);
            setStatsLoadedUserId(targetUserId);
            setStatsError(null);
          } else if (code === "permission-denied") {
            setAdvancedStats({
              ...EMPTY_ADVANCED_STATS,
              totalReviews: profile?.reviewsCount || profile?.reviewCount || localReviews.length || 0,
            });
            setFavoriteReview(null);
            setStatsLoadedUserId(targetUserId);
            setStatsError(null);
          } else {
            console.error("Error loading advanced profile stats", error);
            setStatsError("No se pudieron cargar las estadisticas.");
          }
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
  }, [isOwnProfile, baseLoadingReviews, localReviews.length, profile?.reviewCount, profile?.reviewsCount, targetUserId, statsLoadedUserId, user?.uid]);

  const handleDeleteReview = (id: string) => {
    setLocalReviews((prev) => prev.filter((r) => r.id !== id));
    setExpandedReviewIds((prev) => prev.filter((rid) => rid !== id));
    setExpandedReviewIds((prev) => prev.filter((reviewId) => reviewId !== id));
    setStatsLoadedUserId(null);
  };

  const toggleReviewExpanded = (reviewId: string) => {
    setExpandedReviewIds((prev) =>
      prev.includes(reviewId)
        ? prev.filter((id) => id !== reviewId)
        : [...prev, reviewId],
    );
  };

  const getScoreBubbleClass = (score: number) => {
    if (score >= 7) return "from-emerald-500 to-teal-500";
    if (score >= 5) return "from-yellow-400 to-orange-500";
    return "from-red-500 to-pink-500";
  };

  const formatReviewDate = (value: any) => {
    if (!value) return "";

    let date: Date | null = null;
    if (typeof value?.toDate === "function") {
      try {
        date = value.toDate();
      } catch {
        date = null;
      }
    } else if (value instanceof Date) {
      date = value;
    } else if (typeof value?.seconds === "number") {
      date = new Date(value.seconds * 1000);
    } else if (typeof value === "string" || typeof value === "number") {
      date = new Date(value);
    }

    if (!date || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatStatRating = (value: number) => {
    if (!Number.isFinite(value)) return "-";
    return value.toFixed(2);
  };

  const getReviewCreatedAtMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toDate === "function") {
      try {
        return value.toDate().getTime();
      } catch {
        return 0;
      }
    }
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const levelInfo = useMemo(
    () => getLevelInfo(profile?.xp, profile?.level),
    [profile?.level, profile?.xp],
  );

  const earnedBadgeIds = useMemo(
    () => normalizeEarnedBadgeIds(profile?.badges),
    [profile?.badges],
  );

  const gamificationMetrics = useMemo(
    () =>
      buildGamificationMetrics(profile, {
        reviewsCount:
          statsLoadedUserId === targetUserId
            ? advancedStats.totalReviews
            : undefined,
        photosCount:
          statsLoadedUserId === targetUserId
            ? advancedStats.reviewPhotosCount + advancedStats.placePhotosCount
            : undefined,
        placeCount:
          statsLoadedUserId === targetUserId
            ? advancedStats.uniquePlacesCount
            : undefined,
      }),
    [advancedStats, profile, statsLoadedUserId, targetUserId],
  );

  const displayedReviewsCount =
    statsLoadedUserId === targetUserId
      ? advancedStats.totalReviews
      : profile?.reviewsCount || profile?.reviewCount || 0;

  const profileStatCards = useMemo(
    () => [
      {
        id: "stats" as DetailsModalTab,
        label: "Reseñas",
        value: displayedReviewsCount,
        accent: "default" as const,
      },
      {
        id: "followers" as DetailsModalTab,
        label: "Seguidores",
        value: profile?.followersCount || 0,
        accent: "default" as const,
      },
      {
        id: "level" as DetailsModalTab,
        label: "Nivel",
        value: levelInfo.level,
        accent: "level" as const,
      },
      {
        id: "following" as DetailsModalTab,
        label: "Siguiendo",
        value: profile?.followingUsersCount || profile?.followingCount || 0,
        accent: "default" as const,
      },
      {
        id: "lists" as DetailsModalTab,
        label: "Listas",
        value: profileListsCount,
        accent: "default" as const,
      },
    ],
    [
      displayedReviewsCount,
      levelInfo.level,
      profile?.followersCount,
      profile?.followingCount,
      profile?.followingUsersCount,
      profileListsCount,
    ],
  );

  const sortedProfileReviews = useMemo(() => {
    const filteredReviews = selectProfileReviewResults(
      reviewListFilter,
      localReviews,
      filteredReviewQuery.reviews,
    );

    const base = [...filteredReviews];
    if (reviewSortMode === "top_rated") {
      return base.sort((a, b) => {
        const scoreA =
          typeof a.overallRating === "number"
            ? a.overallRating
            : Number(a.overallRating) || 0;
        const scoreB =
          typeof b.overallRating === "number"
            ? b.overallRating
            : Number(b.overallRating) || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (
          getReviewCreatedAtMillis(b.createdAt) -
          getReviewCreatedAtMillis(a.createdAt)
        );
      });
    }

    return base.sort(
      (a, b) =>
        getReviewCreatedAtMillis(b.createdAt) -
        getReviewCreatedAtMillis(a.createdAt),
    );
  }, [filteredReviewQuery.reviews, localReviews, reviewSortMode, reviewListFilter]);
  // Memorizado: si cambia en cada render, el mapa vuelve a encuadrar y rehace sus chinchetas.
  const profileMapItems = useMemo(() => sortedProfileReviews.map(r => ({
    ...r,
    lat: r.placeLat || r.lat || r.location?.latitude || r.coordinates?.latitude,
    lng: r.placeLng || r.lng || r.location?.longitude || r.coordinates?.longitude
  })), [sortedProfileReviews]);

  // Todas las Listas del perfil (lectura completa) más las del mosaico, por si
  // hay alguna recién creada que aún no está en las estadísticas.
  const availableListsForFilter = useMemo(() => {
    const listMap = new Map<string, { id: string; name: string; count: number | null }>();
    if (statsLoadedUserId === targetUserId) {
      Object.values(advancedStats.reviewedLists || {}).forEach((l) => {
        listMap.set(l.listId, { id: l.listId, name: l.listName, count: l.reviewsCount });
      });
    }
    localReviews.forEach((r) => {
      const listId = typeof r.listId === "string" ? r.listId.trim() : "";
      if (listId && !listMap.has(listId)) {
        listMap.set(listId, { id: listId, name: r.listName || "Lista", count: null });
      }
    });
    return Array.from(listMap.values())
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name, "es"));
  }, [localReviews, advancedStats.reviewedLists, statsLoadedUserId, targetUserId]);

  const sortedStatsPerList = useMemo(() => {
    const base = Object.values(advancedStats.statsByList || {});
    if (statsListSort === "rating_desc") {
      // Ranking único (lib/scoring).
      return base.sort((a, b) =>
        compareByRank({ average: a.averageRating, count: a.reviewsCount }, { average: b.averageRating, count: b.reviewsCount }));
    }

    return base.sort((a, b) => {
      if (b.reviewsCount !== a.reviewsCount)
        return b.reviewsCount - a.reviewsCount;
      return b.averageRating - a.averageRating;
    });
  }, [advancedStats.statsByList, statsListSort]);

  const favoriteGroupLink = useMemo(() => {
    if (!favoriteReview) return "#";
    if (favoriteReview.placeId) {
      const encodedItemName = encodeURIComponent(
        favoriteReview.itemName || "item",
      );
      const listQuery = favoriteReview.listId
        ? `?listId=${encodeURIComponent(favoriteReview.listId)}`
        : "";
      return `/group/${favoriteReview.placeId}/${encodedItemName}${listQuery}`;
    }
    if (favoriteReview.listId) return `/list/${favoriteReview.listId}`;
    return "#";
  }, [favoriteReview]);

  // Match de sabor: solo hay porcentaje si ambos habéis valorado los mismos
  // lugares (computeTasteMatch devuelve null sin coincidencias reales).
  const affinitySummary = useMemo(() => {
    if (!appConfig.showProfileAffinity || isOwnProfile || ownAffinityReviews.length === 0 || localReviews.length === 0) {
      return null;
    }

    const match = computeTasteMatch(ownAffinityReviews, localReviews);
    if (!match) return null;

    return {
      score: match.score,
      reason: match.reason,
      sharedListsCount: 0,
      sharedPlacesCount: match.sharedPlaces,
      sharedCategoriesCount: 0,
      similarRatings: match.sharedItems,
    };
  }, [appConfig.showProfileAffinity, isOwnProfile, localReviews, ownAffinityReviews]);

  const renderMinimalListRows = (
    lists: any[],
    emptyMessage: string,
    showSubBadge: boolean,
  ) => {
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
          const listImage = list.thumbnailUrl || list.mainImageUrl || list.photoUrl || list.coverUrl || list.imageUrl || "";
          return (
            <Link
              key={list.id}
              to={`/list/${list.id}`}
              className="group flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-[var(--lt-card-strong)]/70 hover:border-[var(--lt-accent-border)] hover:bg-white/5 transition-all"
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-gray-800">
                {listImage ? (
                  <ProgressiveImage
                    src={listImage}
                    alt={list.name}
                    containerClassName="w-full h-full"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    <ListIcon className="w-5 h-5" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">
                  {list.name || "Lista"}
                </div>
                <div className="text-[11px] text-gray-400 truncate">
                  {list.itemCount || 0} sitios
                  {list.description ? ` - ${list.description}` : ""}
                </div>
              </div>

              {showSubBadge && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)] font-bold uppercase tracking-wide">
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
      const docRef = doc(db, "users", user.uid, "following", targetUserId);
      const snap = await getDoc(docRef);
      setIsFollowing(snap.exists());
    };
    checkFollow();
  }, [user, targetUserId, isOwnProfile]);

  const handleMessage = async () => {
    if (!user) {
      openAuthPrompt("enviar un mensaje");
      return;
    }
    if (!targetUserId) return;
    try {
      const chatId = await ChatService.createPrivateChat(
        user.uid,
        targetUserId,
      );
      navigate(`/chats/${chatId}`);
    } catch (error) {
      console.error("Error creating chat:", error);
    }
  };

  const handleFollowToggle = async () => {
    if (!user) {
      openAuthPrompt("seguir este perfil");
      return;
    }
    if (!targetUserId) return;
    haptic('medium');
    setFollowLoading(true);

    // Optimistic update: cambia el estado antes de esperar Firestore
    const prevState = isFollowing;
    setIsFollowing(!prevState);

    try {
      const followingRef = doc(
        db,
        "users",
        user.uid,
        "following",
        targetUserId,
      );
      // We do NOT write to the target user's 'followers' collection nor update their counts client-side.
      // This is now handled by the backend trigger 'onUserFollowingWrite' in 'functions/modules/social.js'
      // to ensure security and consistency.

      if (prevState) {
        await deleteDoc(followingRef);
      } else {
        await setDoc(followingRef, {
          uid: targetUserId,
          followedAt: new Date(),
          displayName: profile?.displayName || profile?.username,
          photoUrl: profile?.photoUrl,
        });
      }
    } catch (error) {
      console.error("Follow error:", error);
      showToast({ variant: "error", message: "No se pudo actualizar el seguimiento. Inténtalo de nuevo." });
      setIsFollowing(prevState); // Revert
    } finally {
      setFollowLoading(false);
    }
  };

  if (!targetUserId) {
    return (
      <div className="min-h-screen pt-safe-40 px-4 text-center text-gray-400">
        Debes iniciar sesión para ver tu perfil.
      </div>
    );
  }

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[var(--lt-bg)] pb-20">
        <div className="h-56 sm:h-64 relative bg-[var(--lt-bg)]">
          <Skeleton className="w-full h-full opacity-30" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative -mt-[7.5rem] sm:-mt-32 z-10">
          <div className="flex flex-row items-center md:items-start gap-3 md:gap-8 mb-3 md:mb-4">
            <div className="relative w-20 h-20 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-[var(--lt-bg)] p-1.5 md:p-2 shrink-0">
              <Skeleton className="w-full h-full rounded-full border-[3px] border-[var(--lt-bg)]" />
            </div>
            <div className="flex-1 mt-0 sm:mt-4 md:mt-12 flex flex-col gap-2">
              <Skeleton className="w-48 h-8 rounded-lg" />
              <Skeleton className="w-32 h-5 rounded-md" />
            </div>
          </div>
          <div className="flex gap-4 mt-6">
            <Skeleton className="w-16 h-12 rounded-lg" />
            <Skeleton className="w-16 h-12 rounded-lg" />
            <Skeleton className="w-16 h-12 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (errorProfile || !profile) {
    return (
      <div className="min-h-screen pt-safe-40 px-4 text-center">
        <div className="text-2xl text-white font-bold mb-4">
          Perfil no encontrado
        </div>
        <p className="text-gray-400 mb-6">
          El usuario que buscas no existe o ha sido eliminado.
        </p>
        <Link
          to="/search?type=users"
          className="inline-flex px-5 py-2 rounded-lg bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-[var(--lt-text)] font-bold"
        >
          Buscar personas
        </Link>
      </div>
    );
  }

  const profileShareUrl = buildPublicRouteUrl(`/profile/${targetUserId}`);
  const profileShareTitle = profile.displayName || profile.username || "Perfil";
  const profileShareSubtitle = profile.username ? `@${profile.username}` : "";
  const profileShareText = `Mira este perfil en Listopic: ${profileShareTitle}`;
  const profileFallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || profile.username || "User")}&background=374151&color=fff`;
  const usableProfilePhotoUrl = profile.photoUrl && profile.photoUrl !== failedProfilePhotoUrl ? profile.photoUrl : "";
  const profileAvatarSrc = usableProfilePhotoUrl || profileFallbackAvatar;

  return (
    <div className="min-h-screen bg-[var(--lt-bg)] pb-20">
      {/* Header / Banner */}
      <EntityHero
        imageUrl={usableProfilePhotoUrl}
        alt={profile.displayName || profile.username || ''}
        ready={heroProfileReady}
        onImageLoad={() => setHeroProfileReady(true)}
        onImageError={() => setFailedProfilePhotoUrl(usableProfilePhotoUrl)}
        className="h-[40vh] min-h-[300px] after:absolute after:inset-x-0 after:-bottom-1 after:z-20 after:h-4 after:bg-[var(--lt-bg)]"
        fallback={(
          <div className="absolute inset-0"
            style={{ background: dominantColor ? `linear-gradient(to bottom, ${dominantColor}, var(--lt-bg))` : 'linear-gradient(to bottom, rgba(49,46,129,0.4), var(--lt-bg))' }} />
        )}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative -mt-[7.5rem] sm:-mt-32 z-10">
        {/* TOP SECTION: Avatar + Identity + Desktop Actions */}
        <div className="flex flex-row items-center md:items-start gap-3 md:gap-8 mb-3 md:mb-4">
          {/* Avatar (Left) */}
          <div className="group relative shrink-0 cursor-pointer" onClick={() => setIsAvatarModalOpen(true)}>
            {(() => {
              const types: string[] = Array.isArray(profile.userType) ? profile.userType : (profile.userType ? [profile.userType] : []);
              const isJefe = types.includes('jefe');
              const isCritico = types.includes('critico');
              const isBot = types.includes('bot');

              if (isJefe || isCritico || isBot) {
                const gradient = isJefe
                  ? 'from-emerald-400 via-green-400 to-teal-400'
                  : isCritico
                    ? 'from-yellow-400 via-amber-400 to-orange-400'
                    : 'from-slate-300 via-gray-300 to-zinc-400';
                return <div className={`absolute -inset-1 rounded-full bg-gradient-to-r ${gradient} opacity-70 blur-md group-hover:opacity-100 transition duration-500 animate-blob mix-blend-screen`} />;
              }

              return (
                <div className="absolute -inset-1 rounded-full">
                  {/* Capa base: siempre visible, se atenúa cuando llega el color dominante */}
                  <div
                    className="absolute inset-0 rounded-full blur-md animate-blob mix-blend-screen"
                    style={{
                      backgroundColor: 'rgb(139, 92, 246)',
                      opacity: dominantColor ? 0.35 : 0.7,
                      transition: 'opacity 2s ease-in-out',
                    }}
                  />
                  {/* Capa dominante: entra suavemente y pulsa en bucle */}
                  <div
                    className="absolute inset-0 rounded-full blur-md mix-blend-screen"
                    style={{
                      backgroundColor: dominantColor || 'transparent',
                      animation: dominantColor ? 'halo-pulse 3.5s ease-in-out infinite' : 'none',
                      opacity: dominantColor ? undefined : 0,
                      transition: 'opacity 2s ease-in-out',
                    }}
                  />
                </div>
              );
            })()}
            <div className="relative w-20 h-20 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-[var(--lt-bg)] p-1.5 md:p-2">
              <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden border-[3px] border-[var(--lt-bg)] shadow-2xl relative">
                <ProgressiveImage
                  src={profileAvatarSrc}
                  alt={profile.username}
                  containerClassName="w-full h-full"
                  className="w-full h-full object-cover"
                  fallback={<img src={profileFallbackAvatar} alt={profile.username} className="w-full h-full object-cover" />}
                  onError={() => {
                    if (usableProfilePhotoUrl) setFailedProfilePhotoUrl(usableProfilePhotoUrl);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Identity (Right of Avatar) */}
          <div className="flex-1 min-w-0 pb-0 md:pb-0 flex flex-col justify-start">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="min-w-0 md:flex-1 md:pr-4">
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-white leading-tight break-words line-clamp-2">
                  {profile.displayName || profile.username ||
                    ([profile.name, profile.surnames].filter(Boolean).join(' ')) ||
                    "Usuario"}
                </h1>
                {profile.username && (
                  <p className="text-sm sm:text-base md:text-lg text-[var(--lt-accent)] font-normal truncate mt-1">
                    @{profile.username}
                  </p>
                )}
                {appConfig.showProfileAffinity && !isOwnProfile && affinitySummary && (
                  <button
                    type="button"
                    onClick={() => openDetailsModal("stats")}
                    className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-pink-300/25 bg-pink-500/10 px-2.5 py-1 text-[11px] font-black text-pink-100 hover:border-pink-300/50 hover:bg-pink-500/20 transition-colors"
                    title={affinitySummary.reason}
                  >
                    <HeartHandshake className="w-3.5 h-3.5" />
                    {affinitySummary.score}% afinidad
                  </button>
                )}
                {appConfig.showProfileAffinity && !isOwnProfile && affinityLoading && !affinitySummary && (
                  <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Calculando afinidad
                  </div>
                )}
              </div>

              <div className="hidden md:flex shrink-0 flex-col items-end gap-3">
                <div className="flex items-center gap-2">
                  {isOwnProfile ? (
                    <>
                      {((Array.isArray(profile.userType) &&
                        profile.userType.includes("jefe")) ||
                        profile.userType === "jefe") && (
                          <Link
                            to="/developer"
                            className="p-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-[var(--lt-accent)] hover:bg-[var(--lt-accent)]/10 transition-colors"
                          >
                            <Bug className="w-5 h-5" />
                          </Link>
                        )}
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-sm font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        Editar perfil
                      </button>
                      <button
                        aria-label="Compartir perfil"
                        onClick={() => setIsShareModalOpen(true)}
                        className="p-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-gray-300 hover:text-[var(--lt-accent)] hover:bg-[var(--lt-accent)]/10 transition-colors"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                      <Link
                        to="/preferencias"
                        aria-label="Preferencias"
                        className="p-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Settings className="w-5 h-5" />
                      </Link>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleFollowToggle}
                        disabled={followLoading}
                        className={`px-6 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${isFollowing
                          ? "bg-[var(--lt-card-strong)] border border-white/20 text-white hover:border-red-500 hover:text-red-500"
                          : "bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white shadow-[var(--lt-accent-shadow)]"
                          }`}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck className="w-4 h-4" /> Siguiendo
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" /> Seguir
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleMessage}
                        className="px-4 py-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-white hover:bg-white/10 transition-colors shadow-lg"
                      >
                        <MessageCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setIsShareModalOpen(true)}
                        className="px-4 py-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-gray-300 hover:text-[var(--lt-accent)] hover:bg-[var(--lt-accent)]/10 transition-colors shadow-lg"
                        title="Compartir perfil"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>

                      <div className="relative">
                        <button
                          aria-label="Más opciones"
                          onClick={() => setIsMenuOpen(!isMenuOpen)}
                          className="px-3 py-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {isMenuOpen && (
                          <div className="absolute right-0 mt-2 w-48 bg-[var(--lt-card-strong)] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden animate-fade-in z-50 origin-top-right">
                            <button
                              onClick={() => {
                                setIsMenuOpen(false);
                                if (!user) openAuthPrompt("reportar este perfil");
                                else setShowReportModal(true);
                              }}
                              className="lt-report-action w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
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
                          <ProgressiveImage
                            src={favoriteReview.photoUrl}
                            alt={favoriteReview.itemName}
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <ListIcon className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div
                        className={`absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-gradient-to-r ${getScoreBubbleClass(favoriteReview.score)} text-white text-[9px] font-black flex items-center justify-center border border-[var(--lt-bg)] shadow-lg`}
                      >
                        {favoriteReview.score.toFixed(1)}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] uppercase tracking-widest text-amber-300 font-bold flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> Favorito
                      </div>
                      <div className="text-xs font-extrabold text-[var(--lt-text)] truncate">
                        {favoriteReview.itemName}
                      </div>
                      {favoriteReview.placeName && (
                        <div className="text-[11px] text-[var(--lt-accent)] truncate">
                          {favoriteReview.placeName}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-300 truncate">
                        {favoriteReview.listName}
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {appConfig.showProfileFavoriteBadge && favoriteReview && (
          <div className="md:hidden mb-3 flex justify-end">
            <Link
              to={favoriteGroupLink}
              className="group w-full sm:w-auto sm:max-w-md flex items-center gap-2 p-2 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-indigo-500/10 hover:border-amber-300/60 hover:from-amber-400/20 hover:to-indigo-400/20 transition-all"
              title="Abrir favorito en pagina de grupo"
            >
              <div className="relative w-11 h-11 shrink-0">
                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-amber-300/60 shadow-lg bg-gray-800">
                  {favoriteReview.photoUrl ? (
                    <ProgressiveImage
                      src={favoriteReview.photoUrl}
                      alt={favoriteReview.itemName}
                      containerClassName="w-full h-full"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <ListIcon className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div
                  className={`absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-gradient-to-r ${getScoreBubbleClass(favoriteReview.score)} text-white text-[9px] font-black flex items-center justify-center border border-[var(--lt-bg)] shadow-lg`}
                >
                  {favoriteReview.score.toFixed(1)}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[9px] uppercase tracking-widest text-amber-300 font-bold flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Favorito
                </div>
                <div className="text-xs font-extrabold text-[var(--lt-text)] truncate">
                  {favoriteReview.itemName}
                </div>
                {favoriteReview.placeName && (
                  <div className="text-[11px] text-[var(--lt-accent)] truncate">
                    {favoriteReview.placeName}
                  </div>
                )}
                <div className="text-[10px] text-gray-300 truncate">
                  {favoriteReview.listName}
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* BIO + MOBILE ACTIONS + STATS */}
        <div className="space-y-4 md:space-y-8">
          {/* Bio */}
          {profile.bio && (
            <p className="text-gray-400 text-sm max-w-2xl leading-relaxed">
              {profile.bio}
            </p>
          )}

          {/* MOBILE ACTIONS */}
          <div className="md:hidden flex items-center gap-2.5">
            {isOwnProfile ? (
              <div className="flex items-center gap-2 w-full">
                {((Array.isArray(profile.userType) &&
                  profile.userType.includes("jefe")) ||
                  profile.userType === "jefe") && (
                    <Link
                      to="/developer"
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-[var(--lt-accent)]"
                    >
                      <Bug className="w-4 h-4" />
                    </Link>
                  )}
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex h-10 flex-1 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 px-3 text-[13px] font-bold text-gray-300"
                >
                  Editar perfil
                </button>
                <button
                  aria-label="Compartir perfil"
                  onClick={() => setIsShareModalOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-gray-300"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <Link
                  to="/preferencias"
                  aria-label="Preferencias"
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-gray-300"
                >
                  <Settings className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <button
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-all shadow-lg ${isFollowing
                    ? "bg-[var(--lt-card-strong)] border border-white/20 text-white"
                    : "bg-[var(--lt-accent)] text-white"
                    }`}
                >
                  {isFollowing ? "Siguiendo" : "Seguir"}
                </button>
                <button
                  onClick={handleMessage}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-white shadow-lg"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsShareModalOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-gray-300 shadow-lg"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-gray-400"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-[var(--lt-card-strong)] border border-white/10 rounded-xl shadow-2xl py-1 z-50">
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          if (!user) openAuthPrompt("reportar este perfil");
                          else setShowReportModal(true);
                        }}
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

          <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
            {profileStatCards.map((stat) => (
              <ProfileStatCard
                key={stat.id}
                label={stat.label}
                value={stat.value}
                accent={stat.accent}
                levelProgressPercent={levelInfo.progressPercent}
                onClick={() => openDetailsModal(stat.id)}
              />
            ))}
          </div>

        </div>

        {/* Ficha del perfil al tocar la foto: foto grande, datos y medallas */}
        {isAvatarModalOpen && profile && createPortal(
          <div
            className="fixed inset-0 z-[2147483000] lt-mobile-overlay overflow-y-auto bg-black/85 backdrop-blur-md animate-page-fade"
            onClick={() => setIsAvatarModalOpen(false)}
          >
            <div
              className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
            >
              <div
                className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--lt-card-strong)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Fondo de color del tema detrás de la foto */}
                <div
                  className="absolute inset-x-0 top-0 h-36 opacity-80"
                  style={{ background: 'linear-gradient(135deg, var(--lt-accent), var(--lt-accent-2, var(--lt-accent)))' }}
                />
                <div className="absolute inset-x-0 top-20 h-16 bg-gradient-to-b from-transparent to-[var(--lt-card-strong)]" />
                <button
                  aria-label="Cerrar"
                  onClick={() => setIsAvatarModalOpen(false)}
                  className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/30 p-2 text-white/90 backdrop-blur hover:bg-black/50"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="relative flex flex-col items-center px-5 pt-10 text-center">
                  <div
                    className="rounded-full p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
                    style={{ background: 'linear-gradient(135deg, var(--lt-accent), var(--lt-accent-2, var(--lt-accent)))' }}
                  >
                    <div className="h-44 w-44 overflow-hidden rounded-full border-4 border-[var(--lt-card-strong)] bg-gray-700 md:h-52 md:w-52">
                      <ProgressiveImage
                        src={profileAvatarSrc}
                        alt={profile.username}
                        containerClassName="w-full h-full"
                        className="w-full h-full object-cover"
                        fallback={<img src={profileFallbackAvatar} alt={profile.username} className="w-full h-full object-cover" />}
                        onError={() => {
                          if (usableProfilePhotoUrl) setFailedProfilePhotoUrl(usableProfilePhotoUrl);
                        }}
                      />
                    </div>
                  </div>
                  <h3 className="mt-4 text-2xl font-black text-[var(--lt-text)]">{profile.displayName || profile.username}</h3>
                  {profile.displayName && profile.username && (
                    <p className="text-sm text-[var(--lt-text-muted)]">@{profile.username}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-200">Nivel {levelInfo.level}</span>
                    {profile.createdAt && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[var(--lt-text-muted)]">
                        <Calendar className="h-3.5 w-3.5" />
                        Desde {new Date((profile.createdAt as any).seconds * 1000).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative mt-5 grid grid-cols-3 gap-2 px-5">
                  {profileStatCards.filter((stat) => stat.id !== 'level' && stat.id !== 'following').map((stat) => (
                    <button
                      key={stat.id}
                      type="button"
                      onClick={() => {
                        setIsAvatarModalOpen(false);
                        openDetailsModal(stat.id);
                      }}
                      className="rounded-2xl border border-white/10 bg-white/5 py-3 transition-colors hover:bg-white/10"
                    >
                      <span className="block text-xl font-black text-[var(--lt-text)]">{stat.value}</span>
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">{stat.label}</span>
                    </button>
                  ))}
                </div>

                <div className="relative mt-5 border-t border-white/10 px-5 pb-5 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
                      🏅 Medallas · {earnedBadgeIds.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAvatarModalOpen(false);
                        openDetailsModal("level");
                      }}
                      className="text-xs font-bold text-[var(--lt-accent)] hover:underline"
                    >
                      Ver todas
                    </button>
                  </div>
                  <BadgeDisplay
                    earnedBadgeIds={earnedBadgeIds}
                    earnedDates={profile?.badgeDates}
                    showEmpty
                    variant="compact"
                    className="justify-center"
                  />
                  <p className="mt-3 text-center text-[11px] text-[var(--lt-text-muted)]">Toca una medalla para ver cómo se ganó.</p>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Preferences Modal */}
        {isOwnProfile && <EditProfileSheet isOpen={isEditing} onClose={() => setIsEditing(false)} profile={profile} />}

        {/* Main Content (Reviews are always visible below stats) */}
        <div className="mt-5 space-y-5 md:mt-8 md:space-y-6">
          {/* STICKY REVIEWS HEADER */}
          <div className="sticky top-14 md:top-16 z-30 bg-[var(--lt-bg)]/90 backdrop-blur-md border-b border-white/10 py-2.5 -mx-4 px-4 sm:-mx-6 sm:px-6 mb-4 md:mb-6 rounded-t-3xl sm:rounded-none">
            <div className="flex items-center justify-between gap-2 w-full min-w-0">

              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <div className="inline-flex rounded-xl border border-white/10 bg-[var(--lt-card-strong)]/70 p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setReviewSortMode("recent")}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${reviewSortMode === "recent"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                    title="Recientes"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewSortMode("top_rated")}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${reviewSortMode === "top_rated"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                    title="Mejor valoradas"
                  >
                    <TrendingUp className="w-4 h-4" />
                  </button>
                </div>

                <div className="inline-flex rounded-xl border border-white/10 bg-[var(--lt-card-strong)]/70 p-1 min-w-0 max-w-[130px] sm:max-w-[200px]">
                  <select
                    value={reviewListFilter}
                    onChange={(e) => setReviewListFilter(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-gray-300 px-2 py-1 outline-none focus:ring-0 cursor-pointer w-full min-w-0 truncate"
                  >
                    <option value="all" className="bg-[var(--lt-card-strong)] text-white">Listas</option>
                    {availableListsForFilter.map(list => (
                      <option key={list.id} value={list.id} className="bg-[var(--lt-card-strong)] text-white">
                        {list.count !== null ? `${list.name} (${list.count})` : list.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">

                <div className="inline-flex rounded-xl border border-white/10 bg-[var(--lt-card-strong)]/70 p-1">
                  <button
                    type="button"
                    title="Vista completa"
                    onClick={() => setReviewViewMode("full")}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${reviewViewMode === "full"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Vista galería"
                    onClick={() => setReviewViewMode("gallery")}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${reviewViewMode === "gallery"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Vista mapa"
                    aria-label="Ver en el mapa"
                    onClick={() => { setIsMapOpen(true); setMapWantsAll(true); }}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${isMapOpen
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    <MapPinIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loadingReviews ? (
            reviewViewMode === "gallery" ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="aspect-square relative overflow-hidden rounded-md sm:rounded-lg">
                    <Skeleton className="w-full h-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-[var(--lt-card-strong)] rounded-2xl border border-white/5 overflow-hidden p-4 sm:p-5 flex gap-4">
                    <Skeleton className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-3 py-1">
                      <Skeleton className="h-5 sm:h-6 w-3/4 rounded" />
                      <Skeleton className="h-4 w-1/2 rounded" />
                      <Skeleton className="h-10 w-full mt-2 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : sortedProfileReviews.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-xl">
              <p className="text-gray-500">No hay reseñas recientes.</p>
            </div>
          ) : (
            <>
              {reviewViewMode === "gallery" ? (
                <ReviewGalleryGrid
                  reviews={sortedProfileReviews}
                  expandedReviewIds={expandedReviewIds}
                  setExpandedReviewIds={setExpandedReviewIds}
                  onDelete={handleDeleteReview}
                  onEdit={handleEditReview}
                />
              ) : (
                <div className="space-y-4">
                  {sortedProfileReviews.map((review: any) => (
                    <div id={`profile-review-${review.id}`} key={review.id} className="scroll-mt-24">
                      <ReviewCard
                        review={review}
                        onDelete={handleDeleteReview}
                        onEdit={handleEditReview}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Infinite Scroll Trigger */}
              {hasMore && (
                <div
                  ref={loadMoreRef}
                  className="flex justify-center pt-8 pb-4"
                >
                  {loadingMore ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]"></div>
                  ) : (
                    <div className="h-4 w-full" /> // Invisible trigger
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Profile Details Modal */}
      {
        isDetailsModalOpen && createPortal(
          <div
            className="fixed inset-0 z-[2147483000] lt-mobile-overlay flex items-stretch md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm animate-page-fade"
            onClick={() => setIsDetailsModalOpen(false)}
          >
            <div
              ref={detailsRef}
              className="w-full h-full md:h-[88vh] md:max-h-[88vh] md:max-w-2xl rounded-none md:rounded-3xl border-0 md:border border-white/10 bg-[var(--lt-card-strong)] shadow-none md:shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-50 px-4 md:px-5 py-3 md:py-4 border-b border-white/10 bg-[var(--lt-card-strong)] flex items-center justify-between shadow-lg" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
                <h3 className="text-white font-bold text-lg">Detalle del perfil</h3>
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Tabs */}
              <div
                className="sticky z-40 flex overflow-x-auto hide-scrollbar border-b border-white/10 bg-[var(--lt-card-strong)] shadow-lg"
                style={{ top: 'calc(max(0.75rem, env(safe-area-inset-top)) + 3.25rem)' }}
              >
                <button
                  onClick={() => setDetailsModalTab("stats")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 flex items-center gap-2 ${detailsModalTab === "stats" ? "border-[var(--lt-accent-border)] text-[var(--lt-accent)]" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  <BarChart3 className="w-4 h-4" /> Reseñas
                </button>
                <button
                  onClick={() => setDetailsModalTab("followers")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${detailsModalTab === "followers" ? "border-[var(--lt-accent-border)] text-[var(--lt-accent)]" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  Seguidores
                </button>
                <button
                  onClick={() => setDetailsModalTab("level")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${detailsModalTab === "level" ? "border-amber-500 text-amber-300" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  Nivel
                </button>
                <button
                  onClick={() => setDetailsModalTab("following")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${detailsModalTab === "following" ? "border-[var(--lt-accent-border)] text-[var(--lt-accent)]" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  Siguiendo
                </button>
                <button
                  onClick={() => setDetailsModalTab("lists")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${detailsModalTab === "lists" ? "border-[var(--lt-accent-border)] text-[var(--lt-accent)]" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  Listas
                </button>
              </div>

              {/* Modal Content */}
              <div
                className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--lt-bg)] flex flex-col"
                onTouchStart={onDetailsTouchStart}
                onTouchEnd={onDetailsTouchEnd}
              >
                {detailsModalTab === "stats" && (
                  <>
                    {appConfig.showTastePassport && isOwnProfile && (
                      <TastePassport reviews={localReviews} />
                    )}
                    {appConfig.showProfileAffinity && !isOwnProfile && affinitySummary && (
                      <div className="lt-affinity-card mb-4 rounded-2xl border border-pink-300/20 bg-gradient-to-r from-pink-500/10 via-fuchsia-500/10 to-indigo-500/10 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="lt-affinity-title flex items-center gap-2 text-sm font-black text-white">
                              <HeartHandshake className="w-4 h-4 text-pink-200" />
                              Afinidad contigo
                            </div>
                            <p className="lt-affinity-reason mt-1 text-xs font-semibold text-gray-300">{affinitySummary.reason}</p>
                          </div>
                          <div className="text-right">
                            <div className="lt-affinity-score text-3xl font-black text-pink-100">{affinitySummary.score}%</div>
                            <div className="lt-affinity-match text-[10px] font-bold uppercase tracking-wide text-pink-200/70">match</div>
                          </div>
                        </div>
                        <div className="lt-affinity-meta mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-gray-300 sm:grid-cols-4">
                          <div className="lt-affinity-chip rounded-xl bg-black/20 px-3 py-2">{affinitySummary.sharedPlacesCount} sitio{affinitySummary.sharedPlacesCount === 1 ? '' : 's'} en común</div>
                          <div className="lt-affinity-chip rounded-xl bg-black/20 px-3 py-2">{affinitySummary.similarRatings} plato{affinitySummary.similarRatings === 1 ? '' : 's'} compartido{affinitySummary.similarRatings === 1 ? '' : 's'}</div>
                        </div>
                      </div>
                    )}
                    <ProfileStatsTab
                      statsLoading={statsLoading}
                      statsError={statsError}
                      advancedStats={advancedStats}
                      sortedStatsPerList={sortedStatsPerList}
                      statsListSort={statsListSort}
                      onSortChange={setStatsListSort}
                      formatStatRating={formatStatRating}
                      onCloseModal={() => setIsDetailsModalOpen(false)}
                    />
                  </>
                )}

                {detailsModalTab === "level" && (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-[2rem] border border-amber-400/20 bg-gradient-to-br from-[#24160b] via-[#3a210f] to-[#5f310d] p-5 md:p-6">
                      <div className="flex flex-col gap-5">
                        <div className="flex items-center gap-4">
                          {/* Dynamic gold-fill level box */}
                          <div
                            className="relative flex h-20 w-20 items-center justify-center rounded-[1.75rem] border overflow-hidden shrink-0 transition-all duration-1000"
                            style={{
                              borderColor: `hsla(${38 + (levelInfo.progressPercent / 100) * 8}, ${70 + (levelInfo.progressPercent / 100) * 30}%, ${58 - (levelInfo.progressPercent / 100) * 12}%, ${Math.max(0.15, levelInfo.progressPercent / 100 * 0.5)})`,
                              boxShadow: `0 16px 36px hsla(${38 + (levelInfo.progressPercent / 100) * 8}, ${70 + (levelInfo.progressPercent / 100) * 30}%, ${58 - (levelInfo.progressPercent / 100) * 12}%, ${Math.max(0.1, levelInfo.progressPercent / 100 * 0.25)}), inset 0 0 20px hsla(38, 80%, 50%, ${levelInfo.progressPercent / 100 * 0.08})`,
                            }}
                          >
                            {/* Gold fill from bottom */}
                            <div
                              className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
                              style={{
                                height: `${levelInfo.progressPercent}%`,
                                background: `linear-gradient(0deg, hsl(${38 + (levelInfo.progressPercent / 100) * 8}, ${70 + (levelInfo.progressPercent / 100) * 30}%, ${58 - (levelInfo.progressPercent / 100) * 12}%) 0%, hsla(${38 + (levelInfo.progressPercent / 100) * 8}, ${70 + (levelInfo.progressPercent / 100) * 30}%, ${73 - (levelInfo.progressPercent / 100) * 12}%, 0.6) 100%)`,
                                boxShadow: `0 -4px 20px hsla(38, 80%, 50%, ${levelInfo.progressPercent / 100 * 0.4})`,
                              }}
                            />
                            {/* Level number overlay */}
                            <span
                              className="relative z-10 text-3xl font-black drop-shadow-md transition-colors duration-1000"
                              style={{
                                color: levelInfo.progressPercent > 50
                                  ? 'hsl(38, 20%, 10%)'
                                  : 'hsl(38, 60%, 83%)',
                              }}
                            >
                              {levelInfo.level}
                            </span>
                          </div>
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-100/75">
                              Nivel actual
                            </div>
                            <div className="mt-2 text-3xl font-black text-white">
                              Nivel {levelInfo.level}
                            </div>
                            <div className="mt-1 text-sm text-amber-100/80">
                              {levelInfo.xp} XP totales
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.22em] text-amber-100/75">
                          <span>Progreso hasta el siguiente nivel</span>
                          <span>
                            {levelInfo.xp} / {levelInfo.nextLevelXp} XP
                          </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-black/30">
                          <div
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                              width: `${levelInfo.progressPercent}%`,
                              background: `linear-gradient(90deg, hsl(${38 + (levelInfo.progressPercent / 100) * 8}, ${50 + (levelInfo.progressPercent / 100) * 20}%, ${68 - (levelInfo.progressPercent / 100) * 8}%) 0%, hsl(${38 + (levelInfo.progressPercent / 100) * 8}, ${70 + (levelInfo.progressPercent / 100) * 30}%, ${58 - (levelInfo.progressPercent / 100) * 12}%) 100%)`,
                              boxShadow: `0 0 12px hsla(38, 80%, 50%, ${Math.max(0.2, levelInfo.progressPercent / 100 * 0.5)})`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)]/70 p-4">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          Reseñas que cuentan
                        </div>
                        <div className="mt-2 text-3xl font-black text-white">
                          {gamificationMetrics.reviewsCount}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)]/70 p-4">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          Reseñas con foto
                        </div>
                        <div className="mt-2 text-3xl font-black text-white">
                          {gamificationMetrics.photosCount}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)]/70 p-4">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          Sitios valorados
                        </div>
                        <div className="mt-2 text-3xl font-black text-white">
                          {gamificationMetrics.placeCount}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)]/70 p-4 md:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h4 className="text-lg font-black text-white">
                          Medallas y requisitos
                        </h4>
                        <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-100">
                          {earnedBadgeIds.length} ganadas
                        </div>
                      </div>

                      <BadgeDisplay
                        earnedBadgeIds={earnedBadgeIds}
                  earnedDates={profile?.badgeDates}
                        metrics={gamificationMetrics}
                        showLocked
                        variant="detailed"
                      />
                    </div>
                  </div>
                )}

                {detailsModalTab === "lists" && (
                  <>
                    {loadingLists || loadingExtraLists ? (
                      <div className="space-y-3 pt-4">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="flex gap-4 p-3 bg-[var(--lt-card-strong)] rounded-xl border border-white/5 items-center">
                            <Skeleton className="w-12 h-12 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-2">
                              <Skeleton className="w-2/3 h-5 rounded-md" />
                              <Skeleton className="w-1/3 h-4 rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setListSubTab("followed_lists")}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === "followed_lists"
                              ? "bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                          >
                            Listas seguidas{user ? ` (${mainFollowedLists.length})` : ""}
                          </button>
                          <button
                            type="button"
                            onClick={() => setListSubTab("followed_sublists")}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === "followed_sublists"
                              ? "bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                          >
                            Minilistas seguidas{user ? ` (${subFollowedLists.length})` : ""}
                          </button>
                          <button
                            type="button"
                            onClick={() => setListSubTab("created_sublists")}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === "created_sublists"
                              ? "bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                          >
                            Minilistas creadas ({subCreatedLists.length})
                          </button>
                        </div>

                        {!user && listSubTab !== "created_sublists" && (
                          <SignInToSee
                            what="las Listas que sigue"
                            onSignIn={() => promptSignInFromDetails("ver las Listas que sigue")}
                          />
                        )}

                        {user && listSubTab === "followed_lists" &&
                          renderMinimalListRows(
                            mainFollowedLists,
                            "No sigues listas principales.",
                            false,
                          )}

                        {user && listSubTab === "followed_sublists" &&
                          renderMinimalListRows(
                            subFollowedLists,
                            "No sigues minilistas.",
                            true,
                          )}

                        {listSubTab === "created_sublists" &&
                          renderMinimalListRows(
                            subCreatedLists,
                            "No has creado minilistas todavía.",
                            true,
                          )}
                      </div>
                    )}
                  </>
                )}

                {detailsModalTab === "following" && !user && (
                  <SignInToSee
                    what="a quién sigue"
                    onSignIn={() => promptSignInFromDetails("ver a quién sigue")}
                  />
                )}

                {detailsModalTab === "following" && user && (
                  <FollowingSection
                    targetUserId={targetUserId}
                    onNavigateToProfile={() => {
                      setIsDetailsModalOpen(false);
                      setDetailsModalTab("stats");
                    }}
                  />
                )}

                {detailsModalTab === "followers" && !user && (
                  <SignInToSee
                    what="sus seguidores"
                    onSignIn={() => promptSignInFromDetails("ver sus seguidores")}
                  />
                )}

                {detailsModalTab === "followers" && user && (
                  <FollowersSection
                    targetUserId={targetUserId}
                    onNavigateToProfile={() => {
                      setIsDetailsModalOpen(false);
                      setDetailsModalTab("stats");
                    }}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      }
      <FullMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        title={isOwnProfile ? "Tu mapa" : `Mapa de ${profile.username || profileShareTitle}`}
        subtitle={`${sortedProfileReviews.length} ${sortedProfileReviews.length === 1 ? "reseña" : "reseñas"}${hasMore ? " (cargando más…)" : ""}`}
        items={profileMapItems}
      />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={`Compartir perfil de ${profileShareTitle}`}
        url={profileShareUrl}
        text={profileShareText}
        shareEntity={{
          type: "profile",
          id: targetUserId,
          title: profileShareTitle,
          subtitle: profileShareSubtitle,
          route: `/profile/${targetUserId}`,
          url: profileShareUrl,
          imageUrl: profile.photoUrl || undefined,
          imageUrls: profile.photoUrl ? [profile.photoUrl] : [],
          profileStats: [
            { key: "level", label: "Nivel", value: levelInfo.level },
            { key: "reviews", label: "Reseñas", value: gamificationMetrics.reviewsCount },
            { key: "photos", label: "Fotos", value: gamificationMetrics.photosCount },
            { key: "places", label: "Sitios", value: gamificationMetrics.placeCount },
            { key: "lists", label: "Listas", value: profileListsCount },
            { key: "followers", label: "Seguidores", value: profile.followersCount || 0 },
          ],
        }}
      />
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={targetUserId!}
        targetName={profile.displayName || profile.username || "Usuario"}
        targetType="user"
        itemName="Perfil de Usuario"
        targetOwnerId={targetUserId!}
      />
      {
        isFlowOpen && (
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
        )
      }
    </div >
  );
};


