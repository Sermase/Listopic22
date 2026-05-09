const REVIEW_NOTIFICATION_TYPES = new Set([
  "like",
  "review_like",
  "comment",
  "review_comment",
]);

const BUSINESS_NOTIFICATION_TYPES = new Set([
  "business_claim_reviewed",
  "business_assigned",
  "business_claim_submitted",
]);

const getUrlParam = (link: unknown, param: string): string | null => {
  if (typeof link !== "string" || !link) return null;

  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://listopic.app";
    const url = new URL(link, origin);
    return url.searchParams.get(param);
  } catch {
    return null;
  }
};

export const getNotificationLink = (
  notification: Record<string, any>,
  currentUserId?: string | null,
): string => {
  const type = String(notification.type || "");
  const link = typeof notification.link === "string" ? notification.link : "";

  if (REVIEW_NOTIFICATION_TYPES.has(type)) {
    const reviewId =
      notification.reviewId ||
      notification.targetReviewId ||
      getUrlParam(link, "reviewId");

    if (reviewId && currentUserId) {
      return `/profile/${currentUserId}?tab=reviews&reviewId=${encodeURIComponent(reviewId)}`;
    }

    if (link) return link;
    if (currentUserId) return `/profile/${currentUserId}?tab=reviews`;
  }

  if (type === "follow" || type === "new_follower") {
    const followerId = notification.fromUserId || notification.senderId || notification.userId;
    return followerId ? `/profile/${encodeURIComponent(followerId)}` : link || "#";
  }

  if (BUSINESS_NOTIFICATION_TYPES.has(type)) {
    return "/businesses";
  }

  if (notification.placeId) {
    return `/place/${encodeURIComponent(notification.placeId)}`;
  }

  if (notification.listId) {
    return `/list/${encodeURIComponent(notification.listId)}`;
  }

  if (type === "level_up" || type === "badge_earned") {
    return currentUserId ? `/profile/${currentUserId}` : link || "#";
  }

  return link || "#";
};
