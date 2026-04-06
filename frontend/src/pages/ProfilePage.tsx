import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUserProfile } from "../hooks/useUserProfile";
import { useLists } from "../hooks/useLists";
import { useReviews } from "../hooks/useReviews";
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
  BarChart3,
  Sparkles,
  Share2,
  X,
  Grid3X3,
  AlignJustify,
  Clock,
  TrendingUp,
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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../firebase";
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
} from "firebase/firestore";
import { isUsernameValid } from "../utils/username";
import {
  isUserProfileServiceError,
  updateUserProfilePreferences,
  propagateAuthorFieldsToReviews,
} from "../services/UserProfileService";
import { FollowersSection } from "../components/profile/FollowersSection";
import {
  buildGamificationMetrics,
  getLevelInfo,
  normalizeEarnedBadgeIds,
} from "../utils/gamification";

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
  statsByList: {},
};

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const appConfig = useAppConfig();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams<{ userId: string }>();
  const [activeTab, setActiveTab] = useState<
    "lists" | "reviews" | "following" | "stats"
  >("reviews");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [preferencesTab, setPreferencesTab] = useState<"user" | "search">(
    "user",
  );
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

  // Details Modal State
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsModalTab, setDetailsModalTab] =
    useState<DetailsModalTab>("stats");

  const handleEditReview = (review: any) => {
    setEditingReviewId(review.id);
    setEditingListId(review.listId || null);
    setIsFlowOpen(true);
  };

  const openPreferencesModal = (tab: "user" | "search" = "user") => {
    setPreferencesTab(tab);
    setPreferencesError(null);
    setIsEditing(true);
  };

  const openDetailsModal = (tab: DetailsModalTab) => {
    setDetailsModalTab(tab);
    setIsDetailsModalOpen(true);
  };

  // Determine target user ID
  const targetUserId = paramUserId || user?.uid;
  const isOwnProfile = user?.uid === targetUserId;

  const [dominantColor, setDominantColor] = useState<string | null>(null);

  // Hooks need to be before effects
  const {
    profile,
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
  }, [targetUserId]);

  useEffect(() => {
    if (profile?.photoUrl) {
      const fac = new FastAverageColor();
      // Use crossOrigin anonymous to avoid canvas tainting for Firebase Storage images
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = profile.photoUrl;

      img.onload = () => {
        fac.getColorAsync(img)
          .then((color) => {
            setDominantColor(color.rgba);
          })
          .catch((e) => {
            console.log("FAC Error:", e);
          });
      };
    }
  }, [profile?.photoUrl]);

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

          let allFollowedDetails: any[] = [];
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
        const perListMap = new Map<
          string,
          { listName: string; reviewsCount: number; totalScore: number }
        >();
        const uniquePlaceIds = new Set<string>();
        let favoriteCandidate: Record<string, any> | null = null;
        let favoriteCandidateDate = 0;

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

        const reviewHasPhoto = (review: Record<string, any>): boolean => {
          const singlePhoto =
            typeof review.photoUrl === "string" && review.photoUrl.trim().length > 0;
          const photoArray =
            Array.isArray(review.photos) &&
            review.photos.some(
              (photo: unknown) =>
                typeof photo === "string" && photo.trim().length > 0,
            );
          const imagesArray =
            Array.isArray(review.images) &&
            review.images.some(
              (photo: unknown) =>
                typeof photo === "string" && photo.trim().length > 0,
            );

          return singlePhoto || photoArray || imagesArray;
        };

        canonicalReviews.forEach((review) => {
          const rawScore = review.overallRating ?? review.rating ?? review.avgRating;
          const numericScore = typeof rawScore === "number" ? rawScore : Number(rawScore);
          const hasScore = typeof rawScore !== "undefined" && rawScore !== null && !Number.isNaN(numericScore);
          const placeId =
            typeof review.placeId === "string" ? review.placeId.trim() : "";

          if (placeId) {
            uniquePlaceIds.add(placeId);
          }

          if (reviewHasPhoto(review)) {
            reviewsWithPhotoCount += 1;
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
            statsByList,
          });
          setFavoriteReview(favorite);
          setStatsLoadedUserId(targetUserId);
        }
      } catch (error) {
        console.error("Error loading advanced profile stats", error);
        if (!cancelled) {
          setStatsError("No se pudieron cargar las estadisticas.");
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
            ? advancedStats.reviewsWithPhotoCount
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
      : profile?.reviewsCount || 0;

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
              className="group flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-[#151b2e]/70 hover:border-indigo-500/40 hover:bg-white/5 transition-all"
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
      const storageRef = ref(
        storage,
        `profile_images/${user.uid}/${Date.now()}_${file.name}`,
      );
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await setDoc(
        doc(db, "users", user.uid),
        {
          photoUrl: downloadURL,
        },
        { merge: true },
      );

      propagateAuthorFieldsToReviews(user.uid, { authorPhoto: downloadURL });

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
      <div className="min-h-screen pt-40 px-4 text-center text-gray-400">
        Debes iniciar sesión para ver tu perfil.
      </div>
    );
  }

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[#0b1021] pb-20">
        <div className="h-56 sm:h-64 relative bg-[#0b1021]">
          <Skeleton className="w-full h-full opacity-30" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative -mt-[7.5rem] sm:-mt-32 z-10">
          <div className="flex flex-row items-center md:items-start gap-3 md:gap-8 mb-3 md:mb-4">
            <div className="relative w-20 h-20 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-[#0b1021] p-1.5 md:p-2 shrink-0">
              <Skeleton className="w-full h-full rounded-full border-[3px] border-[#0b1021]" />
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
      <div className="min-h-screen pt-40 px-4 text-center">
        <div className="text-2xl text-white font-bold mb-4">
          Perfil no encontrado
        </div>
        <p className="text-gray-400">
          El usuario que buscas no existe o ha sido eliminado.
        </p>
      </div>
    );
  }

  const profileShareUrl = `${window.location.origin}/profile/${targetUserId}`;
  const profileShareTitle = profile.displayName || profile.username || "Perfil";
  const profileShareSubtitle = profile.username ? `@${profile.username}` : "";
  const profileShareText = `Mira este perfil en Listopic: ${profileShareTitle}`;
  const hasLockedUsername = isUsernameValid((profile.username || "").trim());

  return (
    <div className="min-h-screen bg-[#0b1021] pb-20">
      {/* Header / Banner */}
      <div
        className={`h-56 sm:h-64 relative bg-gradient-to-b from-indigo-900/40 to-[#0b1021] ${profile.photoUrl ? "bg-cover bg-center" : ""}`}
        style={{
          backgroundImage: profile.photoUrl
            ? `linear-gradient(to bottom, ${dominantColor ? `rgba(${dominantColor.split(',').slice(0, 3).join(',')}, 0.3)` : 'rgba(11,16,33,0.3)'}, #0b1021), url(${profile.photoUrl})`
            : dominantColor ? `linear-gradient(to bottom, ${dominantColor}, #0b1021)` : undefined,
        }}
      >
        <div className="absolute inset-0 bg-[#0b1021]/30 blur-xl"></div>
        {/* Removed top-right buttons from here */}
      </div>

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
            <div className="relative w-20 h-20 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-[#0b1021] p-1.5 md:p-2">
              <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden border-[3px] border-[#0b1021] shadow-2xl relative">
                <ProgressiveImage
                  src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName || profile.username || "User"}`}
                  alt={profile.username}
                  containerClassName="w-full h-full"
                  className="w-full h-full object-cover"
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
                  <p className="text-sm sm:text-base md:text-lg text-indigo-400 font-normal truncate mt-1">
                    @{profile.username}
                  </p>
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
                            className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                          >
                            <Bug className="w-5 h-5" />
                          </Link>
                        )}
                      <button
                        onClick={() => openPreferencesModal("user")}
                        className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Settings className="w-5 h-5" />
                      </button>
                      <button
                        aria-label="Compartir perfil"
                        onClick={() => setIsShareModalOpen(true)}
                        className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={async () => {
                          await signOut(auth);
                          navigate("/login");
                        }}
                        className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
                          ? "bg-[#151b2e] border border-white/20 text-white hover:border-red-500 hover:text-red-500"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
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
                          aria-label="Más opciones"
                          onClick={() => setIsMenuOpen(!isMenuOpen)}
                          className="px-3 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {isMenuOpen && (
                          <div className="absolute right-0 mt-2 w-48 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden animate-fade-in z-50 origin-top-right">
                            <button
                              onClick={() => {
                                setIsMenuOpen(false);
                                setShowReportModal(true);
                              }}
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
                        className={`absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-gradient-to-r ${getScoreBubbleClass(favoriteReview.score)} text-white text-[9px] font-black flex items-center justify-center border border-[#0b1021] shadow-lg`}
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
                        <div className="text-[11px] text-indigo-200 truncate">
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
                  className={`absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-gradient-to-r ${getScoreBubbleClass(favoriteReview.score)} text-white text-[9px] font-black flex items-center justify-center border border-[#0b1021] shadow-lg`}
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
                  <div className="text-[11px] text-indigo-200 truncate">
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
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#151b2e] border border-white/10 text-indigo-400"
                    >
                      <Bug className="w-4 h-4" />
                    </Link>
                  )}
                <button
                  onClick={() => openPreferencesModal("user")}
                  className="flex h-10 flex-1 items-center justify-center rounded-lg bg-[#151b2e] border border-white/10 px-3 text-[13px] font-bold text-gray-300"
                >
                  Editar Perfil
                </button>
                <button
                  onClick={() => setIsShareModalOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#151b2e] border border-white/10 text-gray-300"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => {
                    await signOut(auth);
                    navigate("/login");
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#151b2e] border border-white/10 text-red-400"
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
                    ? "bg-[#151b2e] border border-white/20 text-white"
                    : "bg-indigo-600 text-white"
                    }`}
                >
                  {isFollowing ? "Siguiendo" : "Seguir"}
                </button>
                <button
                  onClick={handleMessage}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#151b2e] border border-white/10 text-white shadow-lg"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsShareModalOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#151b2e] border border-white/10 text-gray-300 shadow-lg"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#151b2e] border border-white/10 text-gray-400"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl py-1 z-50">
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
              <button
                key={stat.id}
                type="button"
                onClick={() => openDetailsModal(stat.id)}
                className={`group relative flex min-h-[78px] sm:min-h-[108px] min-w-0 flex-col items-center justify-center rounded-2xl border px-1.5 py-2 text-center transition-all hover:-translate-y-0.5 sm:px-3 sm:py-3 ${stat.accent === "level"
                  ? "overflow-hidden border-amber-400/35 bg-[#110804] shadow-[0_18px_40px_rgba(245,158,11,0.18)]"
                  : "border-white/10 bg-[#151b2e]/80 hover:border-indigo-400/35 hover:bg-[#19213a]"
                  }`}
              >
                {stat.accent === "level" && (
                  <>
                    {/* Unfilled vessel: subtle warm amber tint over the whole card */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{ background: 'rgba(160, 100, 20, 0.10)' }}
                    />
                    {/* Filled liquid rising from bottom */}
                    <div
                      className="pointer-events-none absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
                      style={{
                        height: `${levelInfo.progressPercent}%`,
                        background: `linear-gradient(0deg, hsl(28, 55%, 20%) 0%, hsl(35, 60%, 32%) 60%, hsl(40, 65%, 40%) 100%)`,
                        boxShadow: `0 -2px 10px hsla(38, 60%, 35%, 0.30)`,
                      }}
                    />
                  </>
                )}
                <span
                  className={`relative z-10 text-[9px] sm:text-[10px] font-black uppercase leading-tight tracking-[0.14em] sm:tracking-[0.22em] ${stat.accent === "level"
                    ? "text-amber-200/95"
                    : "text-gray-500 group-hover:text-gray-300"
                    }`}
                  style={stat.accent === "level" ? { textShadow: '0 1px 4px rgba(0,0,0,0.9)' } : undefined}
                >
                  {stat.label}
                </span>

                <div className="relative z-10 mt-2 min-w-0 w-full">
                  <div
                    className="text-base font-black leading-none text-white sm:text-2xl md:text-3xl"
                    style={stat.accent === "level" ? { textShadow: '0 1px 6px rgba(0,0,0,0.9)' } : undefined}
                  >
                    {stat.value}
                  </div>
                </div>
              </button>
            ))}
          </div>

        </div>

        {/* Avatar Enlarged Modal with "Miembro desde" */}
        {isAvatarModalOpen && profile && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={() => setIsAvatarModalOpen(false)}
          >
            <div className="relative flex w-full max-w-2xl flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
              <button
                aria-label="Cerrar"
                onClick={() => setIsAvatarModalOpen(false)}
                className="absolute -top-12 right-0 md:-right-12 p-3 text-white/50 hover:text-white transition-colors bg-black/20 hover:bg-black/40 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full bg-[#0b1021] p-2 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
                <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden border-4 border-[#0b1021]">
                  <ProgressiveImage
                    src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName || profile.username || "User"}`}
                    alt={profile.username}
                    containerClassName="w-full h-full"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="w-full rounded-[2rem] border border-white/10 bg-[#151b2e]/70 p-5 md:p-6">
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
          </div>
        )}

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

              <div className="px-4 md:px-5 pt-4">
                <div className="inline-flex rounded-xl border border-white/10 bg-[#0f1424] p-1">
                  <button
                    type="button"
                    onClick={() => setPreferencesTab("user")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "user"
                      ? "bg-indigo-600 text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    Usuario
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesTab("search")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "search"
                      ? "bg-indigo-600 text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                  >
                    Busqueda
                  </button>
                </div>
              </div>

              <div className="px-4 md:px-5 py-4 space-y-6 overflow-y-auto flex-1">
                {preferencesTab === "user" && (
                  <>
                    <div>
                      <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                        <UsersIcon className="w-4 h-4 text-indigo-400" /> Perfil
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
                              : "bg-black/20 border-amber-400/40 text-white outline-none focus:border-indigo-500"
                              }`}
                            placeholder="Sin espacios, maximo 18 caracteres"
                          />
                          <p className="text-[11px] text-amber-300 mt-2">
                            {hasLockedUsername
                              ? "El username no se puede cambiar una vez guardado. Maximo 18 caracteres y sin espacios."
                              : "Tu username actual no es valido. Debes guardarlo ahora y quedara bloqueado cuando sea correcto."}
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
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
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
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
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
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
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
                            className="w-full bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500"
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
                              ? "bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500"
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
                              ? "bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500"
                              : "bg-black/20 border-white/10 hover:border-white/30"
                              } ${dragActive ? "border-dashed border-indigo-400 bg-indigo-500/10" : ""}`}
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
                                src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName}`}
                                alt="Custom"
                                containerClassName="w-full h-full"
                                className="w-full h-full object-cover"
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
                        <Settings className="w-4 h-4 text-indigo-400" />{" "}
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
                        <p className="text-[10px] text-gray-500 mt-1">
                          Este rango se aplicara automaticamente cuando inicies
                          nueva sesion.
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                        <MapPinIcon className="w-4 h-4 text-indigo-400" /> Capa de mapa preferida
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
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-black/20 border-white/10 text-gray-300 hover:border-indigo-500/50 hover:text-white'
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
                    {savingPreferences && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Guardar preferencias
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content (Reviews are always visible below stats) */}
        <div className="mt-5 space-y-5 md:mt-8 md:space-y-6">
          {/* STICKY REVIEWS HEADER */}
          <div className="sticky top-14 md:top-16 z-30 bg-[#0b1021]/90 backdrop-blur-md border-b border-white/10 py-2.5 -mx-4 px-4 sm:-mx-6 sm:px-6 mb-4 md:mb-6 rounded-t-3xl sm:rounded-none">
            <div className="flex items-center justify-between gap-2 w-full min-w-0">

              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <div className="inline-flex rounded-xl border border-white/10 bg-[#151b2e]/70 p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setReviewSortMode("recent")}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${reviewSortMode === "recent"
                      ? "bg-indigo-600 text-white"
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
                      ? "bg-indigo-600 text-white"
                      : "text-gray-300 hover:text-white"
                      }`}
                    title="Mejor valoradas"
                  >
                    <TrendingUp className="w-4 h-4" />
                  </button>
                </div>

                <div className="inline-flex rounded-xl border border-white/10 bg-[#151b2e]/70 p-1 min-w-0 max-w-[130px] sm:max-w-[200px]">
                  <select
                    value={reviewListFilter}
                    onChange={(e) => setReviewListFilter(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-gray-300 px-2 py-1 outline-none focus:ring-0 cursor-pointer w-full min-w-0 truncate"
                  >
                    <option value="all" className="bg-[#151b2e] text-white">Listas</option>
                    {availableListsForFilter.map(list => (
                      <option key={list.id} value={list.id} className="bg-[#151b2e] text-white">
                        {list.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">

                <div className="inline-flex rounded-xl border border-white/10 bg-[#151b2e]/70 p-1">
                  <button
                    type="button"
                    title="Vista completa"
                    onClick={() => setReviewViewMode("full")}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center ${reviewViewMode === "full"
                      ? "bg-indigo-600 text-white"
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
                      ? "bg-indigo-600 text-white"
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
                      ? "bg-indigo-600 text-white"
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
                  <div key={i} className="bg-[#151b2e] rounded-2xl border border-white/5 overflow-hidden p-4 sm:p-5 flex gap-4">
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
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2">
                  {sortedProfileReviews.map((review: any) => {
                    const firstPhoto = review.photoUrls?.[0] || review.photoUrl || review.photos?.[0] || null;
                    const isPlaceImage = !firstPhoto && !!review.placeMainImage;
                    const photoUrl = firstPhoto || review.placeMainImage || null;
                    const score =
                      typeof review.overallRating === "number"
                        ? review.overallRating
                        : Number(review.overallRating) || 0;
                    const isExpanded = expandedReviewIds.includes(review.id);

                    if (isExpanded) {
                      return (
                        <div
                          key={review.id}
                          className="col-span-3 md:col-span-4 lg:col-span-5 bg-[#151b2e] rounded-xl border border-indigo-500/50 mb-2 shadow-2xl animate-fade-in"
                        >
                          <div className="flex justify-end px-3 pt-2">
                            <button
                              onClick={() => setExpandedReviewIds([])}
                              className="p-1.5 bg-black/40 hover:bg-black/70 rounded-full text-gray-400 hover:text-white transition-colors"
                              title="Cerrar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <ReviewCard
                            review={review}
                            onDelete={handleDeleteReview}
                            onEdit={handleEditReview}
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={review.id}
                        onClick={() => {
                          setExpandedReviewIds((prev) =>
                            prev.includes(review.id)
                              ? []
                              : [review.id],
                          );
                        }}
                        className="group relative aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer border border-[#0b1021] hover:border-indigo-500 transition-colors"
                      >
                        {photoUrl ? (
                          <>
                            <ProgressiveImage
                              src={photoUrl}
                              alt={review.placeName || review.itemName || "Lugar"}
                              containerClassName="w-full h-full"
                              className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${isPlaceImage ? 'opacity-40 saturate-50' : ''}`}
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                              <p className="text-[10px] sm:text-xs text-white font-bold line-clamp-1 leading-tight drop-shadow-md">
                                {review.placeName || review.itemName || "Lugar"}
                              </p>
                              {review.itemName && review.itemName !== review.placeName && (
                                <p className="text-[9px] sm:text-[10px] text-gray-400 line-clamp-1 leading-tight mt-0.5">
                                  {review.itemName}
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br from-[#151b2e] to-[#0b1021]">
                            <span className="text-[10px] sm:text-xs font-bold text-gray-300 line-clamp-1">
                              {review.placeName || review.itemName || "Lugar"}
                            </span>
                            {review.itemName && review.itemName !== review.placeName && (
                              <span className="text-[9px] text-gray-500 line-clamp-1 w-full mt-0.5">
                                {review.itemName}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        <div
                          className={`absolute top-1 right-1 sm:top-2 sm:right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r ${getScoreBubbleClass(
                            score,
                          )} text-white font-black text-[10px] sm:text-xs flex items-center justify-center shadow-lg border border-[#0b1021]`}
                        >
                          {score.toFixed(1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedProfileReviews.map((review: any) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      onDelete={handleDeleteReview}
                      onEdit={handleEditReview}
                    />
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
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
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
        isDetailsModalOpen && (
          <div
            className="fixed inset-0 z-[140] flex items-stretch md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsDetailsModalOpen(false)}
          >
            <div
              className="w-full h-full md:h-[88vh] md:max-h-[88vh] md:max-w-2xl rounded-none md:rounded-3xl border-0 md:border border-white/10 bg-[#151b2e] shadow-none md:shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-20 px-4 md:px-5 py-3 md:py-4 border-b border-white/10 bg-[#151b2e] flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Detalle del perfil</h3>
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="flex overflow-x-auto hide-scrollbar border-b border-white/10 bg-[#12182c]">
                <button
                  onClick={() => setDetailsModalTab("stats")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 flex items-center gap-2 ${detailsModalTab === "stats" ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  <BarChart3 className="w-4 h-4" /> Reseñas
                </button>
                <button
                  onClick={() => setDetailsModalTab("followers")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${detailsModalTab === "followers" ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-400 hover:text-white"}`}
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
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${detailsModalTab === "following" ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  Siguiendo
                </button>
                <button
                  onClick={() => setDetailsModalTab("lists")}
                  className={`px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${detailsModalTab === "lists" ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-400 hover:text-white"}`}
                >
                  Listas
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0b1021] flex flex-col">
                {detailsModalTab === "stats" && (
                  <>
                    {statsLoading ? (
                      <div className="py-20 text-center text-gray-500">
                        Cargando estadísticas...
                      </div>
                    ) : statsError ? (
                      <div className="py-10 px-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
                        {statsError}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
                            <div className="text-[11px] uppercase tracking-wider text-gray-400">
                              Media global
                            </div>
                            <div className="text-3xl font-black text-white mt-1">
                              {formatStatRating(advancedStats.averageRating)}
                            </div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
                            <div className="text-[11px] uppercase tracking-wider text-gray-400">
                              Reseñas analizadas
                            </div>
                            <div className="text-3xl font-black text-white mt-1">
                              {advancedStats.totalReviews}
                            </div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
                            <div className="text-[11px] uppercase tracking-wider text-gray-400">
                              Listas valoradas
                            </div>
                            <div className="text-3xl font-black text-white mt-1">
                              {advancedStats.ratedListsCount}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 overflow-hidden">
                          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white">
                              Media por lista
                            </h3>
                            <span className="text-[11px] text-gray-400">
                              Reseñas y valoración media
                            </span>
                          </div>
                          <div className="px-4 py-2 border-b border-white/10">
                            <div className="inline-flex rounded-lg border border-white/10 bg-[#0f1424] p-1">
                              <button
                                type="button"
                                onClick={() => setStatsListSort("reviews_desc")}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${statsListSort === "reviews_desc"
                                  ? "bg-indigo-600 text-white"
                                  : "text-gray-300 hover:text-white"
                                  }`}
                              >
                                Más reseñas
                              </button>
                              <button
                                type="button"
                                onClick={() => setStatsListSort("rating_desc")}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${statsListSort === "rating_desc"
                                  ? "bg-indigo-600 text-white"
                                  : "text-gray-300 hover:text-white"
                                  }`}
                              >
                                Mejor valoradas
                              </button>
                            </div>
                          </div>
                          {sortedStatsPerList.length === 0 ? (
                            <div className="py-10 text-center text-gray-500 text-sm">
                              No hay datos de valoración por lista.
                            </div>
                          ) : (
                            <div className="divide-y divide-white/10">
                              {sortedStatsPerList.map((listStat) => (
                                <Link
                                  key={listStat.listId}
                                  to={`/list/${listStat.listId}`}
                                  onClick={() => setIsDetailsModalOpen(false)}
                                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-bold text-white truncate">
                                      {listStat.listName}
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                      {listStat.reviewsCount} reseñas
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <div className="text-xs text-gray-400">
                                      Media
                                    </div>
                                    <div className="text-lg font-black text-indigo-300">
                                      {formatStatRating(listStat.averageRating)}
                                    </div>
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
                      <div className="rounded-2xl border border-white/10 bg-[#151b2e]/70 p-4">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          Reseñas que cuentan
                        </div>
                        <div className="mt-2 text-3xl font-black text-white">
                          {gamificationMetrics.reviewsCount}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#151b2e]/70 p-4">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          Reseñas con foto
                        </div>
                        <div className="mt-2 text-3xl font-black text-white">
                          {gamificationMetrics.photosCount}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#151b2e]/70 p-4">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          Lugares valorados
                        </div>
                        <div className="mt-2 text-3xl font-black text-white">
                          {gamificationMetrics.placeCount}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#151b2e]/70 p-4 md:p-5">
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
                          <div key={i} className="flex gap-4 p-3 bg-[#151b2e] rounded-xl border border-white/5 items-center">
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
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                          >
                            Listas seguidas ({mainFollowedLists.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setListSubTab("followed_sublists")}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === "followed_sublists"
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                          >
                            Sublistas seguidas ({subFollowedLists.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setListSubTab("created_sublists")}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${listSubTab === "created_sublists"
                              ? "bg-indigo-600 border-indigo-500 text-white"
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
          </div>
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


