import React from "react";
import { Award, Gift, Lock, Sparkles } from "lucide-react";
import { Modal } from "../ui/Modal";
import { THEMES } from "../../context/ThemeContext";
import type { Badge } from "../../hooks/useBadges";
import { cn } from "../../lib/utils";
import { getBadgePublicDescription, getBadgeXpReward, isSecretBadge } from "../../utils/gamification";

/** Cuándo se ganó (users.badgeDates): Timestamp de Firestore, fecha o milisegundos. */
export type BadgeDateValue = { toDate?: () => Date; seconds?: number } | Date | number | null | undefined;

const RARITY: Record<string, string> = { common: "Común", rare: "Rara", epic: "Épica" };

const toDate = (value: BadgeDateValue): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  return null;
};

interface BadgeInfoModalProps {
  badge: Badge | null;
  earned: boolean;
  earnedAt?: BadgeDateValue;
  onClose: () => void;
}

export const BadgeInfoModal: React.FC<BadgeInfoModalProps> = ({ badge, earned, earnedAt, onClose }) => {
  if (!badge) return null;
  const secret = isSecretBadge(badge) && !earned;
  const theme = THEMES.find((t) => t.unlock?.badge === badge.id);
  const date = toDate(earnedAt);
  const how = earned
    ? (badge.description?.trim() || getBadgePublicDescription(badge))
    : secret
      ? "Es una medalla secreta. Sigue usando Listopic y quizá te la encuentres."
      : getBadgePublicDescription(badge);

  return (
    <Modal isOpen onClose={onClose} title={badge.name} onTop>
      <div className="flex flex-col items-center text-center">
        <div
          className={cn(
            "flex h-24 w-24 items-center justify-center rounded-full border text-4xl",
            earned
              ? "border-amber-100/30 bg-gradient-to-br from-[#f8d26c] via-[#d9961f] to-[#8f4a06] shadow-[0_18px_38px_rgba(217,119,6,0.35)]"
              : "border-[var(--lt-border)] bg-black/20 grayscale",
          )}
        >
          {secret ? "❔" : badge.imageUrl ? <img src={badge.imageUrl} alt="" className="h-12 w-12 object-contain" /> : badge.icon || <Award className="h-10 w-10 text-white" />}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] font-bold uppercase tracking-wide">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", earned ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-[var(--lt-border)] text-[var(--lt-text-muted)]")}>
            {earned ? <Sparkles className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {earned ? "Ganada" : "Pendiente"}
          </span>
          {isSecretBadge(badge) && <span className="rounded-full border border-[var(--lt-border)] px-2 py-0.5 text-[var(--lt-text-muted)]">Secreta</span>}
          {!secret && badge.rarity && RARITY[badge.rarity] && <span className="rounded-full border border-[var(--lt-border)] px-2 py-0.5 text-[var(--lt-text-muted)]">{RARITY[badge.rarity]}</span>}
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">{earned ? "Cómo la ganaste" : "Cómo se gana"}</dt>
          <dd className="mt-1 leading-relaxed text-[var(--lt-text)]">{how}</dd>
        </div>
        {earned && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">Cuándo</dt>
            <dd className="mt-1 text-[var(--lt-text)]">
              {date ? date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "Hace tiempo (antes de que guardáramos la fecha)"}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">Premio</dt>
          <dd className="mt-1 flex items-center gap-2 text-[var(--lt-text)]">
            <Gift className="h-4 w-4 shrink-0 text-[var(--lt-accent)]" />
            {secret ? "Sorpresa" : `+${getBadgeXpReward(badge)} XP${theme ? ` y el tema ${theme.label}` : ""}`}
          </dd>
        </div>
      </dl>
    </Modal>
  );
};
