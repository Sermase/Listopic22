import type { Badge } from "../hooks/useBadges";
import type { UserProfileEntity } from "../hooks/useUserProfile";

const DEFAULT_BADGE_XP_REWARD = 50;

const toSafeNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toNonEmptyString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

export interface LevelInfo {
  xp: number;
  level: number;
  currentLevelBaseXp: number;
  nextLevelXp: number;
  remainingXp: number;
  progressPercent: number;
}

export interface GamificationMetrics {
  xp: number;
  level: number;
  reviewsCount: number;
  photosCount: number;
  placeCount: number;
  listsCount: number;
  followersCount: number;
  followingCount: number;
}

export interface BadgeProgress {
  current: number;
  target: number | null;
  ratio: number;
  progressLabel: string | null;
  metricLabel: string | null;
  isTrackable: boolean;
}

export const getLevelFromXp = (xpValue: unknown): number => {
  const xp = toSafeNumber(xpValue);
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / 50)) + 1;
};

export const getLevelInfo = (
  xpValue: unknown,
  explicitLevel?: unknown,
): LevelInfo => {
  const xp = Math.max(0, toSafeNumber(xpValue));
  const derivedLevel = getLevelFromXp(xp);
  const explicit = toSafeNumber(explicitLevel);
  const level = explicit > 0 ? Math.max(explicit, derivedLevel) : derivedLevel;
  const currentLevelBaseXp = 50 * Math.pow(level - 1, 2);
  const nextLevelXp = 50 * Math.pow(level, 2);
  const range = Math.max(1, nextLevelXp - currentLevelBaseXp);
  const progressPercent = Math.min(
    100,
    Math.max(0, ((xp - currentLevelBaseXp) / range) * 100),
  );

  return {
    xp,
    level,
    currentLevelBaseXp,
    nextLevelXp,
    remainingXp: Math.max(0, nextLevelXp - xp),
    progressPercent,
  };
};

export const normalizeEarnedBadgeIds = (
  rawBadges?: UserProfileEntity["badges"],
): string[] => {
  if (!Array.isArray(rawBadges)) return [];

  const normalized = rawBadges
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object" && "id" in entry) {
        return toNonEmptyString((entry as { id?: unknown }).id);
      }
      return "";
    })
    .filter((badgeId) => badgeId.length > 0);

  return Array.from(new Set(normalized));
};

export const getBadgePublicDescription = (badge: Badge): string => {
  return (
    toNonEmptyString(badge.descriptionPublic) ||
    toNonEmptyString(badge.description) ||
    "Medalla de Listopic"
  );
};

const getListsCountFromProfile = (profile?: UserProfileEntity | null): number => {
  if (!profile) return 0;
  const listCount = toSafeNumber(profile.listCount);
  if (listCount > 0) return listCount;

  const listsCount = toSafeNumber(profile.listsCount);
  if (listsCount > 0) return listsCount;

  return (
    toSafeNumber(profile.publicListsCount) +
    toSafeNumber(profile.privateListsCount)
  );
};

export const getBadgeXpReward = (badge?: Partial<Badge> | null): number => {
  const xpReward = toSafeNumber(badge?.xpReward);
  return xpReward > 0 ? xpReward : DEFAULT_BADGE_XP_REWARD;
};

export const buildGamificationMetrics = (
  profile?: UserProfileEntity | null,
  overrides?: Partial<
    Pick<GamificationMetrics, "reviewsCount" | "photosCount" | "placeCount" | "listsCount">
  >,
): GamificationMetrics => {
  const levelInfo = getLevelInfo(profile?.xp, profile?.level);

  return {
    xp: levelInfo.xp,
    level: levelInfo.level,
    reviewsCount:
      overrides?.reviewsCount ?? Math.max(0, toSafeNumber(profile?.reviewsCount)),
    photosCount:
      overrides?.photosCount ?? Math.max(0, toSafeNumber(profile?.photosCount)),
    placeCount:
      overrides?.placeCount ??
      Math.max(0, toSafeNumber(profile?.reviewedPlacesCount)),
    listsCount:
      overrides?.listsCount ?? Math.max(0, getListsCountFromProfile(profile)),
    followersCount: Math.max(0, toSafeNumber(profile?.followersCount)),
    followingCount: Math.max(
      0,
      toSafeNumber(profile?.followingUsersCount) || toSafeNumber(profile?.followingCount),
    ),
  };
};

export const getBadgeProgress = (
  badge: Badge,
  metrics: GamificationMetrics,
  earnedBadgeIds: string[] = [],
): BadgeProgress => {
  const threshold = Math.max(0, toSafeNumber(badge.threshold));
  const isEarned = earnedBadgeIds.includes(badge.id);

  const buildTrackedProgress = (
    current: number,
    metricLabel: string,
  ): BadgeProgress => {
    const safeCurrent = Math.max(0, current);
    if (threshold <= 0) {
      return {
        current: safeCurrent,
        target: null,
        ratio: isEarned ? 1 : 0,
        progressLabel: null,
        metricLabel,
        isTrackable: false,
      };
    }

    return {
      current: safeCurrent,
      target: threshold,
      ratio: Math.min(1, safeCurrent / threshold),
      progressLabel: `${Math.min(safeCurrent, threshold)}/${threshold}`,
      metricLabel,
      isTrackable: true,
    };
  };

  switch (badge.type) {
    case "review_count":
      return buildTrackedProgress(metrics.reviewsCount, "resenas");
    case "photo_count":
      return buildTrackedProgress(metrics.photosCount, "resenas con foto");
    case "place_count":
      return buildTrackedProgress(metrics.placeCount, "lugares valorados");
    case "lists_count":
      return buildTrackedProgress(metrics.listsCount, "listas creadas");
    case "followers_count":
      return buildTrackedProgress(metrics.followersCount, "seguidores");
    case "following_count":
      return buildTrackedProgress(metrics.followingCount, "usuarios seguidos");
    case "level_reached":
      return buildTrackedProgress(metrics.level, "nivel");
    default:
      return {
        current: isEarned ? 1 : 0,
        target: null,
        ratio: isEarned ? 1 : 0,
        progressLabel: null,
        metricLabel: null,
        isTrackable: false,
      };
  }
};
