import React, { useMemo, useState } from "react";
import { Award, Lock, Sparkles } from "lucide-react";
import { useBadges } from "../../hooks/useBadges";
import { cn } from "../../lib/utils";
import {
  getBadgeProgress,
  getBadgePublicDescription,
  getBadgeXpReward,
  type GamificationMetrics,
} from "../../utils/gamification";

interface BadgeDisplayProps {
  earnedBadgeIds?: string[];
  showEmpty?: boolean;
  variant?: "compact" | "showcase" | "detailed";
  showLocked?: boolean;
  metrics?: GamificationMetrics;
  className?: string;
}

const renderBadgeFace = (
  badge: { imageUrl?: string; name: string; icon?: string },
  className: string,
) => {
  if (badge.imageUrl) {
    return <img src={badge.imageUrl} alt={badge.name} className={className} />;
  }

  if (badge.icon) {
    return <span className={className}>{badge.icon}</span>;
  }

  return <Award className={className} />;
};

export const BadgeDisplay: React.FC<BadgeDisplayProps> = ({
  earnedBadgeIds = [],
  showEmpty = false,
  variant = "compact",
  showLocked = false,
  metrics,
  className,
}) => {
  const { badges, loading } = useBadges();
  const [selectedShowcaseBadgeId, setSelectedShowcaseBadgeId] = useState<string | null>(null);

  const earnedSet = useMemo(
    () => new Set(earnedBadgeIds.filter((badgeId) => typeof badgeId === "string" && badgeId.trim().length > 0)),
    [earnedBadgeIds],
  );

  const orderedBadges = useMemo(() => {
    const activeBadges = badges.filter((badge) => badge.active !== false);
    const visibleBadges = showLocked
      ? activeBadges
      : activeBadges.filter((badge) => earnedSet.has(badge.id));

    return [...visibleBadges].sort((a, b) => {
      const earnedDelta = Number(earnedSet.has(b.id)) - Number(earnedSet.has(a.id));
      if (earnedDelta !== 0) return earnedDelta;

      const thresholdDelta = (a.threshold || 0) - (b.threshold || 0);
      if (thresholdDelta !== 0) return thresholdDelta;

      return a.name.localeCompare(b.name, "es");
    });
  }, [badges, earnedSet, showLocked]);

  const selectedShowcaseBadge = useMemo(
    () => orderedBadges.find((badge) => badge.id === selectedShowcaseBadgeId) || null,
    [orderedBadges, selectedShowcaseBadgeId],
  );

  if (loading) {
    return null;
  }

  if (orderedBadges.length === 0) {
    if (!showEmpty) return null;

    return (
      <div className={cn("text-sm text-gray-500", className)}>
        Sin medallas todavia
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        {orderedBadges.map((badge) => (
          <div
            key={badge.id}
            className="group relative flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#24180d] via-[#3a2612] to-[#6a390d] shadow-[0_10px_30px_rgba(245,158,11,0.12)]"
            title={`${badge.name}: ${getBadgePublicDescription(badge)}`}
          >
            {renderBadgeFace(
              badge,
              badge.imageUrl
                ? "h-7 w-7 object-contain"
                : badge.icon
                  ? "text-xl"
                  : "h-5 w-5 text-amber-100",
            )}
            <div className="pointer-events-none absolute -bottom-2 left-1/2 h-3 w-7 -translate-x-1/2 rounded-b-full bg-amber-950/70 blur-[1px]" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "showcase") {
    return (
      <div className={cn("space-y-4", className)}>
        <div
          className="flex flex-wrap items-start justify-center gap-4 md:gap-5"
        >
          {orderedBadges.map((badge) => {
            const isSelected = selectedShowcaseBadge?.id === badge.id;

            return (
              <button
                key={badge.id}
                type="button"
                onClick={() => setSelectedShowcaseBadgeId((current) => (
                  current === badge.id ? null : badge.id
                ))}
                className="flex w-[104px] flex-col items-center text-center"
              >
                <div
                  className={cn(
                    "flex h-20 w-20 items-center justify-center rounded-full border bg-gradient-to-br shadow-[0_18px_38px_rgba(217,119,6,0.35)] ring-4 transition-all",
                    isSelected
                      ? "border-amber-100/40 from-[#f8d26c] via-[#d9961f] to-[#8f4a06] ring-amber-300/20 scale-[1.03]"
                      : "border-amber-100/30 from-[#f8d26c] via-[#d9961f] to-[#8f4a06] ring-amber-500/10 hover:scale-[1.02]",
                  )}
                >
                  {renderBadgeFace(
                    badge,
                    badge.imageUrl
                      ? "h-10 w-10 object-contain"
                      : badge.icon
                        ? "text-3xl"
                        : "h-8 w-8 text-white",
                  )}
                </div>
                <div className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-amber-200">
                  {badge.name}
                </div>
              </button>
            );
          })}
        </div>

        {selectedShowcaseBadge && (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-200">
              {selectedShowcaseBadge.name}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-gray-300">
              {getBadgePublicDescription(selectedShowcaseBadge)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3 md:grid-cols-2", className)}>
      {orderedBadges.map((badge) => {
        const isEarned = earnedSet.has(badge.id);
        const progress = metrics
          ? getBadgeProgress(badge, metrics, earnedBadgeIds)
          : null;

        return (
          <article
            key={badge.id}
            className={cn(
              "rounded-2xl border p-4 transition-colors",
              isEarned
                ? "border-amber-400/30 bg-gradient-to-br from-[#1d140b] via-[#22160d] to-[#302010]"
                : "border-white/10 bg-[var(--lt-card-strong)]/70",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border",
                  isEarned
                    ? "border-amber-300/30 bg-gradient-to-br from-[#f8d26c] via-[#d9961f] to-[#8f4a06] text-white"
                    : "border-white/10 bg-black/20 text-gray-500",
                )}
              >
                {renderBadgeFace(
                  badge,
                  badge.imageUrl
                    ? "h-8 w-8 object-contain"
                    : badge.icon
                      ? "text-2xl"
                      : "h-6 w-6",
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black uppercase tracking-wide text-white">
                    {badge.name}
                  </h4>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      isEarned
                        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                        : "border-white/10 bg-white/5 text-gray-400",
                    )}
                  >
                    {isEarned ? (
                      <>
                        <Sparkles className="h-3 w-3" />
                        Ganada
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" />
                        Pendiente
                      </>
                    )}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-200">
                    +{getBadgeXpReward(badge)} XP
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  {getBadgePublicDescription(badge)}
                </p>
              </div>
            </div>

            {progress && progress.isTrackable && progress.progressLabel && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-400">
                  <span>{progress.metricLabel}</span>
                  <span>{progress.progressLabel}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/30">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      isEarned
                        ? "bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500"
                        : "bg-gradient-to-r from-indigo-400 to-cyan-400",
                    )}
                    style={{ width: `${Math.max(progress.ratio * 100, isEarned ? 100 : 8)}%` }}
                  />
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
