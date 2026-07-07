import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme, type ThemeId } from "../context/ThemeContext";
import { useUserProfile, type UserProfileEntity } from "../hooks/useUserProfile";
import { computeTasteMatch } from "../utils/tasteMatch";
import { TastePassport } from "../components/profile/TastePassport";
import { useLists } from "../hooks/useLists";
import { useReviews } from "../hooks/useReviews";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useFilters } from "../context/FilterContext"; // Import Filter Context
import { useAppConfig } from "../context/AppConfigContext";
import {
  Settings,
  Calendar,
  Users as UsersIcon,
  List as ListIcon,
  Star,
  UserPlus,
  UserCheck,
  MessageCircle,
  Power,
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
  Palette,
  Check,
  HeartHandshake,
} from "lucide-react";
import { ReportModal } from "../components/ReportModal";
import {
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, listAll, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, auth, storage, functions } from "../firebase";
import { signOut, updateProfile } from "firebase/auth";
import { ReviewCard } from "../components/ReviewCard";
import { AddReviewForm } from "../components/AddReviewForm";
import { ShareModal } from "../components/ShareModal";
import { Skeleton } from "../components/Skeleton";
import { FastAverageColor } from "fast-average-color";
import { ChatService } from "../services/ChatService";
import { FollowingSection } from "../components/profile/FollowingSection";
import { ProgressiveImage } from "../components/ProgressiveImage";
import { BadgeDisplay } from "../components/profile/BadgeDisplay";
import { MapView } from "../components/MapView";
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
import { isUsernameValid } from "../utils/username";
import {
  isUserProfileServiceError,
  updateUserProfilePreferences,
  propagateAuthorFieldsToReviews,
} from "../services/UserProfileService";
import { FollowersSection } from "../components/profile/FollowersSection";
import ProfileStatsTab from "../components/profile/ProfileStatsTab";
import { ProfileStatCard } from "../components/ProfileStatCard";
import { ReviewGalleryGrid } from "../components/ReviewGalleryGrid";
import {
  buildGamificationMetrics,
  getLevelInfo,
  normalizeEarnedBadgeIds,
} from "../utils/gamification";
import { buildPublicRouteUrl } from "../utils/publicUrl";
import { EntityHero } from "../components/EntityHero";

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

const EMPTY_ADVANCED_STATS: AdvancedProfileStats = {
  totalReviews: 0,
  averageRating: 0,
  ratedListsCount: 0,
  uniquePlacesCount: 0,
  reviewsWithPhotoCount: 0,
  reviewPhotosCount: 0,
  placePhotosCount: 0,
  statsByList: {},
};

const getErrorCode = (error: unknown): string | null => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const candidate = (error as { code?: unknown }).code;
    return typeof candidate === "string" ? candidate : null;
  }
  return null;
};

const getProfileUploadErrorMessage = (error: unknown): string => {
  const code = getErrorCode(error);

  if (code === "storage/unauthorized" || code === "permission-denied") {
    return "No tienes permisos para cambiar la foto de perfil. Cierra sesión, vuelve a entrar e inténtalo de nuevo.";
  }
  if (code === "storage/retry-limit-exceeded" || code === "storage/canceled" || code === "storage/unknown") {
    return "La subida se interrumpió por conexión o por un bloqueo temporal. Cambia de red y vuelve a intentarlo.";
  }
  if (code === "storage/quota-exceeded") {
    return "No hay espacio disponible para guardar la foto de perfil ahora mismo. Inténtalo más tarde.";
  }

  return code
    ? `No se pudo subir la foto de perfil (error: ${code}). Inténtalo de nuevo.`
    : "No se pudo subir la foto de perfil. Inténtalo de nuevo.";
};

const getProfileSaveErrorMessage = (error: unknown): string => {
  const code = getErrorCode(error);

  if (code === "permission-denied") {
    return "La foto se ha subido, pero no se pudo guardar en tu perfil por permisos de Firestore.";
  }

  return code
    ? `La foto se ha subido, pero no se pudo guardar en tu perfil (error: ${code}).`
    : "La foto se ha subido, pero no se pudo guardar en tu perfil.";
};

const getImageExtension = (file: File): string => {
  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
  };

  if (extensionByType[file.type]) return extensionByType[file.type];

  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  return nameExtension && /^[a-z0-9]+$/.test(nameExtension) ? nameExtension : "jpg";
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

const cleanupPreviousProfileImages = async (userId: string, currentStoragePath: string) => {
  const profileFolders = ["profile_images", "profile-photos"];

  const folderCleanups = profileFolders.map(async (folder) => {
    const folderRef = ref(storage, `${folder}/${userId}`);
    const result = await listAll(folderRef);
    const staleItems = result.items.filter((item) => item.fullPath !== currentStoragePath);

    if (staleItems.length === 0) return;

    const deletions = await Promise.allSettled(staleItems.map((item) => deleteObject(item)));
    deletions.forEach((deletion, index) => {
      if (deletion.status === "rejected") {
        console.warn("ProfilePage: could not delete stale profile image", staleItems[index].fullPath, deletion.reason);
      }
    });
  });

  const results = await Promise.allSettled(folderCleanups);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn("ProfilePage: could not list profile image folder", profileFolders[index], result.reason);
    }
  });
};

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { theme: activeTheme, setTheme: applyTheme, themes: availableThemes } = useTheme();
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
  const [preferencesTab, setPreferencesTab] = useState<"user" | "search" | "appearance" | "delete" | "notifications">(
    "user",
  );
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    new_message: true,
    new_follower: true,
    review_comment: true,
    review_like: true,
    list_follow: true,
    level_up: true,
    badge_earned: true,
  });
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [deleteKeepReviews, setDeleteKeepReviews] = useState<boolean | null>(null);
  const [deleteKeepSublists, setDeleteKeepSublists] = useState<boolean | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editRange, setEditRange] = useState<string>("50"); // Default to 50 if undefined
  const [editMapLayer, setEditMapLayer] = useState<string>("standard");
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editName, setEditName] = useState("");
  const [editSurnames, setEditSurnames] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editBio, setEditBio] = useState("");
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
  const [reviewViewMode, setReviewViewMode] = useState<"full" | "gallery" | "map">(
    "gallery",
  );
  const [reviewListFilter, setReviewListFilter] = useState<string>("all");
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
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
  const [detailsModalTab, setDetailsModalTab] =
    useState<DetailsModalTab>("stats");
  useBodyScrollLock(isAvatarModalOpen || isEditing || isDetailsModalOpen);

  const handleEditReview = (review: any) => {
    setEditingReviewId(review.id);
    setEditingListId(review.listId || null);
    setIsFlowOpen(true);
  };

  const openPreferencesModal = (tab: "user" | "search" | "appearance" | "delete" | "notifications" = "user") => {
    setPreferencesTab(tab);
    setPreferencesError(null);
    setIsEditing(true);
    if (profile?.notificationPreferences) {
      setNotifPrefs(prev => ({ ...prev, ...profile.notificationPreferences }));
    }
  };

  const openDetailsModal = (tab: DetailsModalTab) => {
    setDetailsModalTab(tab);
    setIsDetailsModalOpen(true);
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

  const {
    reviews: fetchedReviews,
    loading: loadingReviews,
    refresh: refreshReviews,
    fetchMore,
    hasMore,
    loadingMore,
  } = useReviews({ type: "recent", userId: targetUserId, limit: reviewViewMode === "gallery" ? 10 : 3 });
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
    // localReviews.length > 0 ensures the observer re-runs once reviews populate the DOM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadingReviews, localReviews.length > 0]);

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
        // Followed Lists (From 'followingLists' subcollection)
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
    if (!isOwnProfile && loadingReviews) return;
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
        },
        favorite,
      };
    };

    const loadAdvancedStats = async () => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        if (!isOwnProfile) {
          const { stats, favorite } = buildStatsFromReviews(localReviews as Array<Record<string, any>>);
          if (!cancelled) {
            setAdvancedStats({
              ...stats,
              totalReviews: stats.totalReviews || profile?.reviewsCount || profile?.reviewCount || 0,
            });
            setFavoriteReview(favorite);
            setStatsLoadedUserId(targetUserId);
          }
          return;
        }

        const pageSize = 200;
        const maxReviews = 3000;
        const allReviews: Array<Record<string, any>> = [];
        let cursor: any = null;

        while (allReviews.length < maxReviews) {
          const constraints: any[] = [
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
          });
          setFavoriteReview(favorite);
          setStatsLoadedUserId(targetUserId);
        }
      } catch (error) {
        const code = getErrorCode(error);
        if (!cancelled) {
          if (code === "permission-denied") {
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
  }, [isOwnProfile, loadingReviews, localReviews.length, profile?.reviewCount, profile?.reviewsCount, targetUserId, statsLoadedUserId, user?.uid]);

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
    const filteredReviews =
      reviewListFilter === "all"
        ? localReviews
        : localReviews.filter((r) => r.listId === reviewListFilter);

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
  }, [localReviews, reviewSortMode, reviewListFilter]);

  const availableListsForFilter = useMemo(() => {
    const listMap = new Map();
    localReviews.forEach((r) => {
      const listId = typeof r.listId === "string" ? r.listId.trim() : "";
      if (listId) {
        const listName = r.listName || "Lista";
        if (!listMap.has(listId)) {
          listMap.set(listId, listName);
        }
      }
    });
    return Array.from(listMap.entries()).map(([id, name]) => ({ id, name }));
  }, [localReviews]);

  const sortedStatsPerList = useMemo(() => {
    const base = Object.values(advancedStats.statsByList || {});
    if (statsListSort === "rating_desc") {
      return base.sort((a, b) => {
        if (b.averageRating !== a.averageRating)
          return b.averageRating - a.averageRating;
        return b.reviewsCount - a.reviewsCount;
      });
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
                  {list.itemCount || 0} lugares
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

  useEffect(() => {
    if (!profile) return;
    setEditUsername((profile.username || "").trim());
    setEditDisplayName((profile.displayName || profile.username || "").trim());
    setEditName((profile.name || "").trim());
    setEditSurnames((profile.surnames || "").trim());
    setEditLocation((profile.location || profile.residence || "").trim());
    setEditBio((profile.bio || "").trim());
  }, [profile]);

  useEffect(() => {
    if (profile?.defaultDistanceKm) {
      setEditRange(String(profile.defaultDistanceKm));
    }
    if ((profile as any)?.mapLayerPreference) {
      setEditMapLayer((profile as any).mapLayerPreference);
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
    if (!file.type.startsWith("image/")) {
      alert("Solo se permiten archivos de imagen");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      alert("La imagen no debe superar los 5MB");
      return;
    }

    setUploading(true);
    try {
      const extension = getImageExtension(file);
      const storagePath = `profile_images/${user.uid}/${Date.now()}.${extension}`;
      const storageRef = ref(storage, storagePath);
      let downloadURL = "";

      try {
        await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
        downloadURL = await getDownloadURL(storageRef);
      } catch (error) {
        console.error("Profile photo upload failed:", error);
        alert(getProfileUploadErrorMessage(error));
        return;
      }

      try {
        await setDoc(
          doc(db, "users", user.uid),
          {
            photoUrl: downloadURL,
            photoStoragePath: storagePath,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        console.error("Profile photo profile save failed:", error);
        alert(getProfileSaveErrorMessage(error));
        return;
      }

      void updateProfile(user, { photoURL: downloadURL }).catch((error) => {
        console.warn("ProfilePage: could not update auth profile photo", error);
      });

      void propagateAuthorFieldsToReviews(user.uid, { authorPhoto: downloadURL }).catch((error) => {
        console.warn("ProfilePage: could not propagate profile photo to reviews", error);
      });
      await cleanupPreviousProfileImages(user.uid, storagePath);
      setFailedProfilePhotoUrl(null);

      // Reload to show changes (simple approach)
      window.location.reload();
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("No se pudo cambiar la foto de perfil. Inténtalo de nuevo.");
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
    const profileUsername = (profile?.username || "").trim();
    const canEditUsername = !isUsernameValid(profileUsername);
    const nextUsername = editUsername.trim();
    if (canEditUsername && !isUsernameValid(nextUsername)) {
      setPreferencesError(
        "Debes definir un username válido: sin espacios, máximo 18 caracteres y único.",
      );
      return;
    }

    setSavingPreferences(true);
    setPreferencesError(null);
    try {
      const val = parseInt(editRange, 10);
      const safeDistance = isNaN(val) ? 50 : val;
      const newRange = safeDistance >= 999999 ? null : safeDistance;

      const result = await updateUserProfilePreferences(
        {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoUrl: user.photoURL,
        },
        {
          username: canEditUsername ? nextUsername : undefined,
          displayName: editDisplayName,
          name: editName,
          surnames: editSurnames,
          location: editLocation,
          bio: editBio,
          defaultDistanceKm: safeDistance,
          mapLayerPreference: editMapLayer,
          notificationPreferences: notifPrefs,
        },
      );

      // Update session too if generic
      // And CRUCIALLY update the context immediately so the UI reflects it without reload
      sessionStorage.removeItem("sessionRange");
      setRange(newRange);
      localStorage.setItem("listopic_map_layer", editMapLayer);

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
        setPreferencesError("Error al guardar preferencias");
      }
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      const deleteOwnAccount = httpsCallable(functions, "deleteOwnAccount");
      await deleteOwnAccount({
        keepReviews: deleteKeepReviews === true,
        keepSublists: deleteKeepSublists === true,
      });
      await signOut(auth).catch(() => undefined);

      navigate("/");
    } catch (err: any) {
      console.error("Error deleting account:", err);
      if (err?.code === "functions/unauthenticated") {
        setDeleteError("Por seguridad, necesitas volver a iniciar sesión antes de eliminar tu cuenta.");
      } else if (err?.code === "auth/requires-recent-login") {
        setDeleteError("Por seguridad, necesitas volver a iniciar sesión antes de eliminar tu cuenta. Cierra sesión, vuelve a entrar y repite el proceso.");
      } else {
        setDeleteError("Error al eliminar la cuenta. Inténtalo de nuevo o contáctanos en istaricore@gmail.com");
      }
      setDeletingAccount(false);
    }
  };

  const handleMessage = async () => {
    if (!user || !targetUserId) return;
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
    if (!user || !targetUserId) return;
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
      alert("Error al seguir/dejar de seguir. Inténtalo de nuevo.");
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
        <p className="text-gray-400">
          El usuario que buscas no existe o ha sido eliminado.
        </p>
      </div>
    );
  }

  const profileShareUrl = buildPublicRouteUrl(`/profile/${targetUserId}`);
  const profileShareTitle = profile.displayName || profile.username || "Perfil";
  const profileShareSubtitle = profile.username ? `@${profile.username}` : "";
  const profileShareText = `Mira este perfil en Listopic: ${profileShareTitle}`;
  const hasLockedUsername = isUsernameValid((profile.username || "").trim());
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
                        onClick={() => openPreferencesModal("user")}
                        className="p-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Settings className="w-5 h-5" />
                      </button>
                      <button
                        aria-label="Compartir perfil"
                        onClick={() => setIsShareModalOpen(true)}
                        className="p-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-gray-300 hover:text-[var(--lt-accent)] hover:bg-[var(--lt-accent)]/10 transition-colors"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={async () => {
                          await signOut(auth);
                          navigate("/login");
                        }}
                        className="p-2.5 rounded-xl bg-[var(--lt-card-strong)] border border-white/10 text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Power className="w-5 h-5" />
                      </button>
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
                                setShowReportModal(true);
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
                      <div className="text-[9px] uppercase tracking-widest text-amber-200 font-bold flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> Favorito
                      </div>
                      <div className="text-xs font-extrabold text-white truncate">
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
                <div className="text-[9px] uppercase tracking-widest text-amber-200 font-bold flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Favorito
                </div>
                <div className="text-xs font-extrabold text-white truncate">
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
                  onClick={() => openPreferencesModal("user")}
                  className="flex h-10 flex-1 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 px-3 text-[13px] font-bold text-gray-300"
                >
                  Editar Perfil
                </button>
                <button
                  onClick={() => setIsShareModalOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-gray-300"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => {
                    await signOut(auth);
                    navigate("/login");
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lt-card-strong)] border border-white/10 text-red-400"
                >
                  <Power className="w-4 h-4" />
                </button>
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
                          setShowReportModal(true);
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

        {/* Avatar Enlarged Modal with "Miembro desde" */}
        {isAvatarModalOpen && profile && createPortal(
          <div
            className="fixed inset-0 z-[2147483000] lt-mobile-overlay flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-page-fade"
            onClick={() => setIsAvatarModalOpen(false)}
          >
            <button
              aria-label="Cerrar"
              onClick={() => setIsAvatarModalOpen(false)}
              className="fixed right-4 md:right-6 p-3 text-white/70 hover:text-white transition-colors bg-black/50 hover:bg-black/70 rounded-full z-[2147483001] border border-white/10"
              style={{ top: 'calc(env(safe-area-inset-top) + 5rem)' }}
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative flex w-full max-w-2xl flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
              <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full bg-[var(--lt-bg)] p-2 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
                <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden border-4 border-[var(--lt-bg)]">
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

              <div className="w-full rounded-[2rem] border border-white/10 bg-[var(--lt-card-strong)]/70 p-5 md:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-200">
                    Medallas
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAvatarModalOpen(false);
                      openDetailsModal("level");
                    }}
                    className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20 transition-colors"
                  >
                    Ver nivel
                  </button>
                </div>

                <BadgeDisplay
                  earnedBadgeIds={earnedBadgeIds}
                  showEmpty
                  variant="showcase"
                />
              </div>

              {profile.createdAt && (
                <div className="flex items-center gap-2 text-sm text-gray-400 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                  <Calendar className="w-4 h-4" />
                  Miembro desde{" "}
                  {new Date((profile.createdAt as any).seconds * 1000).getFullYear()}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* Preferences Modal */}
        {isEditing && isOwnProfile && createPortal(
          <div
            className="fixed inset-0 z-[10000] lt-mobile-overlay flex items-start md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm animate-page-fade"
            onClick={() => !savingPreferences && setIsEditing(false)}
          >
            <div
              className="w-full h-[100dvh] md:h-[88vh] md:max-h-[88vh] md:max-w-3xl rounded-none md:rounded-2xl border-0 md:border border-white/10 bg-[var(--lt-card-strong)] shadow-none md:shadow-2xl overflow-hidden flex flex-col"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-20 px-4 md:px-5 py-3 md:py-4 border-b border-white/10 bg-[var(--lt-card-strong)] flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
                <div>
                  <h3 className="text-white font-bold text-lg">
                    Preferencias de perfil
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Configura datos del usuario y ajustes de busqueda.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !savingPreferences && setIsEditing(false)}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 md:px-5 pt-4 overflow-x-auto">
                <div className="inline-flex min-w-max rounded-xl border border-white/10 bg-[var(--lt-bg-deep)] p-1">
                  <button
                    type="button"
                    onClick={() => setPreferencesTab("user")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "user"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    Usuario
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesTab("search")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "search"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    Busqueda
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesTab("notifications")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "notifications"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    Notificaciones
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesTab("appearance")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "appearance"
                      ? "bg-[var(--lt-accent)] text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    Apariencia
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesTab("delete")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "delete"
                      ? "bg-red-600 text-white"
                      : "text-red-400 hover:text-red-300"
                      }`}
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              <div className="px-4 md:px-5 py-4 space-y-6 overflow-y-auto flex-1">
                {preferencesTab === "user" && (
                  <>
                    <div>
                      <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                        <UsersIcon className="w-4 h-4 text-[var(--lt-accent)]" /> Perfil
                        publico
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">
                            {hasLockedUsername
                              ? "Username (bloqueado)"
                              : "Username (obligatorio)"}
                          </label>
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            disabled={hasLockedUsername}
                            className={`w-full border rounded-lg px-3 py-2 ${hasLockedUsername
                              ? "bg-black/40 border-white/10 text-gray-400 cursor-not-allowed"
                              : "bg-black/20 border-amber-400/40 text-white outline-none focus:border-[var(--lt-accent-border)]"
                              }`}
                            placeholder="Sin espacios, maximo 18 caracteres"
                          />
                          <p className="text-[11px] text-amber-300 mt-2">
                            {hasLockedUsername
                              ? "El username no se puede cambiar una vez guardado. Maximo 18 caracteres y sin espacios."
                              : "Tu username actual no es válido. Debes guardarlo ahora y quedará bloqueado cuando sea correcto."}
                          </p>
                        </div>

                        <div>
                          <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-[var(--lt-accent-border)]"
                            placeholder="Visible publicamente"
                          />
                        </div>

                        <div>
                          <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">
                            Nombre
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-[var(--lt-accent-border)]"
                            placeholder="Opcional"
                          />
                        </div>

                        <div>
                          <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">
                            Apellidos
                          </label>
                          <input
                            type="text"
                            value={editSurnames}
                            onChange={(e) => setEditSurnames(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-[var(--lt-accent-border)]"
                            placeholder="Opcional"
                          />
                        </div>

                        <div>
                          <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">
                            Lugar
                          </label>
                          <input
                            type="text"
                            value={editLocation}
                            onChange={(e) => setEditLocation(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-[var(--lt-accent-border)]"
                            placeholder="Opcional"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-gray-400 text-xs uppercase font-bold block mb-1.5">
                            Biografia
                          </label>
                          <textarea
                            value={editBio}
                            onChange={(e) => setEditBio(e.target.value)}
                            rows={4}
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-[var(--lt-accent-border)] resize-y"
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                        <UsersIcon className="w-4 h-4 text-[var(--lt-accent)]" /> Avatar
                      </h4>
                      <div className="flex flex-col gap-4">
                        <div className="flex gap-4">
                          <button
                            onClick={async () => {
                              if (!user?.photoURL) return;
                              try {
                                await setDoc(
                                  doc(db, "users", user!.uid),
                                  {
                                    photoUrl: user!.photoURL,
                                  },
                                  { merge: true },
                                );
                                window.location.reload();
                              } catch (e) {
                                console.error("Error setting Google photo", e);
                              }
                            }}
                            className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${profile.photoUrl === user?.photoURL
                              ? "bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent)]"
                              : "bg-black/20 border-white/10 hover:border-white/30"
                              }`}
                          >
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                              {user?.photoURL ? (
                                <img
                                  src={user.photoURL}
                                  alt="Google"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-700"></div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-gray-300">
                              Google
                            </span>
                          </button>

                          <div
                            className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all relative overflow-hidden group ${profile.photoUrl !== user?.photoURL
                              ? "bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent)]"
                              : "bg-black/20 border-white/10 hover:border-white/30"
                              } ${dragActive ? "border-dashed border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]" : ""}`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() =>
                              document.getElementById("file-upload")?.click()
                            }
                          >
                            <input
                              type="file"
                              id="file-upload"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) =>
                                e.target.files &&
                                e.target.files[0] &&
                                processFile(e.target.files[0])
                              }
                            />

                            {uploading ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                              </div>
                            ) : null}

                            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 grayscale group-hover:grayscale-0 transition-all">
                              <ProgressiveImage
                                src={profileAvatarSrc}
                                alt="Custom"
                                containerClassName="w-full h-full"
                                className="w-full h-full object-cover"
                                fallback={<img src={profileFallbackAvatar} alt="Custom" className="w-full h-full object-cover" />}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-300">
                              {dragActive ? "Suelta aqui" : "Personal"}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-gray-400 text-xs uppercase font-bold">
                            O arrastra tu imagen aqui
                          </label>
                          <p className="text-[10px] text-gray-500">
                            Haz clic en "Personal" o arrastra una imagen para
                            subirla. Max 5MB.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {preferencesTab === "search" && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                        <Settings className="w-4 h-4 text-[var(--lt-accent)]" />{" "}
                        Preferencias de busqueda
                      </h4>
                      <div className="flex flex-col gap-2 max-w-sm">
                        <label className="text-gray-400 text-xs uppercase font-bold">
                          Rango de distancia por defecto
                        </label>
                        <div className="flex items-center gap-3">
                          <select
                            value={editRange}
                            onChange={(e) => setEditRange(e.target.value)}
                            className="bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-[var(--lt-accent-border)] w-full"
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
                        <p className="text-[10px] text-gray-500 mt-1">
                          Este rango se aplicara automaticamente cuando inicies
                          nueva sesión.
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                        <MapPinIcon className="w-4 h-4 text-[var(--lt-accent)]" /> Capa de mapa preferida
                      </h4>
                      <div className="grid grid-cols-2 gap-2 max-w-sm">
                        {([
                          { id: 'standard', label: 'Estándar', emoji: '🗺️' },
                          { id: 'light', label: 'Claro', emoji: '☀️' },
                          { id: 'dark', label: 'Oscuro', emoji: '🌑' },
                          { id: 'satellite', label: 'Satelital', emoji: '🛰️' },
                        ] as const).map((layer) => (
                          <button
                            key={layer.id}
                            type="button"
                            onClick={() => setEditMapLayer(layer.id)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${editMapLayer === layer.id
                              ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white'
                              : 'bg-black/20 border-white/10 text-gray-300 hover:border-[var(--lt-accent-border)] hover:text-white'
                              }`}
                          >
                            <span className="text-base">{layer.emoji}</span>
                            {layer.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">
                        Se aplicará automáticamente cada vez que abras el mapa.
                      </p>
                    </div>
                  </div>
                )}

                {preferencesTab === "notifications" && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">Elige qué notificaciones quieres recibir.</p>
                    {[
                      { key: "new_message", label: "Mensajes nuevos" },
                      { key: "new_follower", label: "Nuevos seguidores" },
                      { key: "review_comment", label: "Comentarios en tus reseñas" },
                      { key: "review_like", label: "Likes en tus reseñas" },
                      { key: "list_follow", label: "Alguien sigue una lista tuya" },
                      { key: "level_up", label: "Subidas de nivel" },
                      { key: "badge_earned", label: "Medallas desbloqueadas" },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-sm text-gray-300">{label}</span>
                        <button
                          type="button"
                          onClick={() => setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }))}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                            notifPrefs[key] !== false ? "bg-[var(--lt-accent)]" : "bg-white/10"
                          }`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                            notifPrefs[key] !== false ? "translate-x-5" : "translate-x-0"
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {preferencesTab === "appearance" && (
                  <div className="space-y-5">
                    <div>
                      <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                        <Palette className="w-4 h-4 text-[var(--lt-accent)]" />
                        Tema de la interfaz
                      </h4>
                      <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                        Cambia la paleta de colores de toda la aplicación. Se aplica al instante y se sincroniza entre tus dispositivos.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {availableThemes.map((t) => {
                          const isActive = activeTheme === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => { void applyTheme(t.id as ThemeId); }}
                              aria-pressed={isActive}
                              className={`relative group rounded-2xl overflow-hidden border text-left transition-all duration-200 ${isActive
                                ? "border-[var(--lt-accent-border)] ring-2 ring-[var(--lt-accent)]"
                                : "border-white/10 hover:border-white/30"
                                }`}
                            >
                              {/* Preview strip */}
                              <div
                                className="h-24 relative overflow-hidden"
                                style={{ background: t.preview.bg }}
                              >
                                <div
                                  className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-2xl opacity-70"
                                  style={{ background: t.preview.accent }}
                                />
                                <div
                                  className="absolute -bottom-10 -left-8 w-32 h-32 rounded-full blur-2xl opacity-50"
                                  style={{ background: t.preview.accent2 }}
                                />
                                <div className="absolute inset-0 p-3 flex flex-col justify-between">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shadow-lg"
                                      style={{ background: `linear-gradient(135deg, ${t.preview.accent}, ${t.preview.accent2})` }}
                                    >
                                      L
                                    </div>
                                    <span className="text-[11px] font-bold tracking-tight" style={{ color: t.preview.text }}>
                                      Listopic
                                    </span>
                                  </div>
                                  <div className="flex gap-1.5">
                                    <div
                                      className="h-5 w-14 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                      style={{ background: `linear-gradient(135deg, ${t.preview.accent}, ${t.preview.accent2})` }}
                                    >
                                      Todos
                                    </div>
                                    <div
                                      className="h-5 w-14 rounded-full border flex items-center justify-center text-[9px] font-bold"
                                      style={{
                                        background: t.preview.card,
                                        borderColor: 'rgba(255,255,255,0.08)',
                                        color: t.preview.text,
                                      }}
                                    >
                                      Cafés
                                    </div>
                                  </div>
                                </div>
                                {isActive && (
                                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/95 text-[var(--lt-accent)] flex items-center justify-center shadow-lg">
                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                  </div>
                                )}
                              </div>
                              {/* Label */}
                              <div className="px-3 py-2.5 bg-[var(--lt-bg-deep)]">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-white text-sm font-bold">{t.label}</span>
                                  <span className="text-[9px] uppercase tracking-wider text-gray-500 truncate">
                                    {t.mood}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1 leading-snug line-clamp-2">
                                  {t.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-4">
                        Tu preferencia se guarda en tu cuenta: la verás igual al entrar desde otro dispositivo.
                      </p>
                    </div>
                  </div>
                )}

                {preferencesTab === "delete" && (
                  <div className="space-y-5">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                      <p className="text-red-300 text-sm leading-relaxed">
                        <span className="font-bold text-white">Esta acción es irreversible.</span> Tu cuenta y todos tus datos serán eliminados permanentemente. Revisa las opciones antes de continuar.
                      </p>
                    </div>

                    {/* Razón */}
                    <div>
                      <label className="text-gray-400 text-xs uppercase font-bold block mb-2">¿Por qué te vas?</label>
                      <div className="space-y-2">
                        {[
                          "Ya no uso la app",
                          "Quiero empezar desde cero",
                          "Problemas de privacidad",
                          "La app no cubre mis necesidades",
                          "Otras razones",
                          "Prefiero no decirlo",
                        ].map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => setDeleteReason(reason)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${deleteReason === reason
                              ? "bg-red-600/20 border-red-500/50 text-white"
                              : "bg-black/20 border-white/10 text-gray-300 hover:border-white/20 hover:text-white"
                              }`}
                          >
                            {reason}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reseñas */}
                    <div>
                      <label className="text-gray-400 text-xs uppercase font-bold block mb-1">¿Mantener tus reseñas de forma anónima?</label>
                      <p className="text-gray-500 text-xs mb-2">Si dices que sí, tus reseñas quedarán en la app sin asociarse a ningún usuario.</p>
                      <div className="flex gap-2">
                        {([true, false] as const).map((val) => (
                          <button
                            key={String(val)}
                            type="button"
                            onClick={() => setDeleteKeepReviews(val)}
                            className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-colors ${deleteKeepReviews === val
                              ? val ? "bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-white" : "bg-red-600/20 border-red-500/50 text-white"
                              : "bg-black/20 border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                              }`}
                          >
                            {val ? "Sí, mantenerlas" : "No, eliminarlas"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sublistas */}
                    <div>
                      <label className="text-gray-400 text-xs uppercase font-bold block mb-1">¿Mantener tus sublistas?</label>
                      <p className="text-gray-500 text-xs mb-2">Si dices que sí, tus sublistas quedarán en la app sin autor.</p>
                      <div className="flex gap-2">
                        {([true, false] as const).map((val) => (
                          <button
                            key={String(val)}
                            type="button"
                            onClick={() => setDeleteKeepSublists(val)}
                            className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-colors ${deleteKeepSublists === val
                              ? val ? "bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-white" : "bg-red-600/20 border-red-500/50 text-white"
                              : "bg-black/20 border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                              }`}
                          >
                            {val ? "Sí, mantenerlas" : "No, eliminarlas"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Confirmación */}
                    <div>
                      <label className="text-gray-400 text-xs uppercase font-bold block mb-2">Escribe ELIMINAR para confirmar</label>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="ELIMINAR"
                        className="w-full bg-black/20 border border-red-500/30 rounded-lg text-white px-3 py-2 outline-none focus:border-red-500 placeholder:text-gray-600"
                      />
                    </div>

                    {deleteError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-[11px] text-red-200">
                        {deleteError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="px-4 md:px-5 py-4 border-t border-white/10 bg-[var(--lt-card-strong)] space-y-3">
                {preferencesTab !== "delete" && preferencesError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-[11px] text-red-200">
                    {preferencesError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => !savingPreferences && !deletingAccount && setIsEditing(false)}
                    disabled={savingPreferences || deletingAccount}
                    className="px-3 py-2 text-xs font-bold rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                  {preferencesTab === "delete" ? (
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={
                        deletingAccount ||
                        !deleteReason ||
                        deleteKeepReviews === null ||
                        deleteKeepSublists === null ||
                        deleteConfirmText !== "ELIMINAR"
                      }
                      className="px-3 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2 min-w-[150px]"
                    >
                      {deletingAccount && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      Eliminar mi cuenta
                    </button>
                  ) : preferencesTab === "appearance" ? (
                    <span className="text-[11px] text-gray-500 italic">
                      Los cambios de tema se aplican al instante.
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={savePreferences}
                      disabled={savingPreferences}
                      className="px-3 py-2 text-xs font-bold rounded-lg bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-60 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2 min-w-[150px]"
                    >
                      {savingPreferences && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      Guardar preferencias
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

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
                        {list.name}
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
                    onClick={() => setReviewViewMode("map")}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${reviewViewMode === "map"
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
            ) : reviewViewMode === "map" ? (
              <div className="h-[500px] w-full rounded-2xl overflow-hidden border border-white/10 relative">
                <Skeleton className="w-full h-full" />
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
              {reviewViewMode === "map" ? (
                <div className="h-[500px] w-full rounded-2xl overflow-hidden border border-white/10 relative z-0">
                  <MapView
                    items={sortedProfileReviews.map(r => ({
                      ...r,
                      lat: r.placeLat || r.lat || r.location?.latitude || r.coordinates?.latitude,
                      lng: r.placeLng || r.lng || r.location?.longitude || r.coordinates?.longitude
                    }))}
                    mode="global"
                    range={null}
                  />
                </div>
              ) : reviewViewMode === "gallery" ? (
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
              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--lt-bg)] flex flex-col">
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
                          Lugares valorados
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
                            Listas seguidas ({mainFollowedLists.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setListSubTab("followed_sublists")}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === "followed_sublists"
                              ? "bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                          >
                            Sublistas seguidas ({subFollowedLists.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setListSubTab("created_sublists")}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === "created_sublists"
                              ? "bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                          >
                            Sublistas creadas ({subCreatedLists.length})
                          </button>
                        </div>

                        {listSubTab === "followed_lists" &&
                          renderMinimalListRows(
                            mainFollowedLists,
                            "No sigues listas principales.",
                            false,
                          )}

                        {listSubTab === "followed_sublists" &&
                          renderMinimalListRows(
                            subFollowedLists,
                            "No sigues sublistas.",
                            true,
                          )}

                        {listSubTab === "created_sublists" &&
                          renderMinimalListRows(
                            subCreatedLists,
                            "No has creado sublistas todavía.",
                            true,
                          )}
                      </div>
                    )}
                  </>
                )}

                {detailsModalTab === "following" && (
                  <FollowingSection
                    targetUserId={targetUserId}
                    onNavigateToProfile={() => {
                      setIsDetailsModalOpen(false);
                      setDetailsModalTab("stats");
                    }}
                  />
                )}

                {detailsModalTab === "followers" && (
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


