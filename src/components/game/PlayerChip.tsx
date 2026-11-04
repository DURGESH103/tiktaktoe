"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import type { PresenceStatus } from "@/hooks/useOpponentPresence";
import type { Mark, Player } from "@/types/db";

const PRESENCE: Record<PresenceStatus, { dot: string; label: string }> = {
  connecting: { dot: "bg-muted/60", label: "Connecting" },
  online: { dot: "bg-ok", label: "Online" },
  away: { dot: "bg-warn", label: "Away" },
  left: { dot: "bg-danger", label: "Offline" },
};

/** Player card above the board. With `onOpenProfile` it becomes a button that opens their profile. */
export function PlayerChip({
  player,
  mark,
  isMe,
  active,
  presence,
  align = "left",
  onOpenProfile,
  hideMark = false,
}: {
  player?: Player;
  mark: Mark;
  isMe: boolean;
  active: boolean;
  presence?: PresenceStatus;
  align?: "left" | "right";
  onOpenProfile?: () => void;
  /** Games without X/O (Couple Challenge) hide the mark. */
  hideMark?: boolean;
}) {
  const p = presence ? PRESENCE[presence] : null;
  const Root = onOpenProfile ? "button" : "div";
  return (
    <Root
      {...(onOpenProfile && {
        type: "button" as const,
        onClick: onOpenProfile,
        "aria-label": `${player?.name ?? "Opponent"}${hideMark ? "" : `, playing ${mark}`}${p ? `, ${p.label.toLowerCase()}` : ""}. View profile`,
      })}
      className={clsx(
        "relative flex min-w-0 flex-1 items-center gap-2 rounded-3xl p-2 sm:gap-3 sm:p-3",
        align === "right" && "flex-row-reverse text-right",
        onOpenProfile && "transition-colors hover:bg-fg/[0.04] active:scale-[0.98]",
      )}
    >
      {active && (
        <motion.span
          layoutId="turn-glow"
          aria-hidden
          className={clsx("absolute inset-0 rounded-3xl ring-2", mark === "X" ? "bg-x/10 ring-x/50" : "bg-o/10 ring-o/50")}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <span className="relative">
        {player ? (
          <AvatarBadge avatar={player.avatar} color={player.color} size="chip" />
        ) : (
          <span className="block h-10 w-10 rounded-full bg-fg/10 motion-safe:animate-pulse sm:h-12 sm:w-12" />
        )}
        {p && (
          <span
            className={clsx("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-bg transition-colors", p.dot)}
            aria-hidden
          />
        )}
      </span>
      <span className="relative min-w-0">
        <span className="block truncate text-[15px] font-semibold leading-tight">{player?.name ?? "…"}</span>
        <span
          className={clsx(
            "flex items-center gap-1 whitespace-nowrap text-xs text-muted sm:text-sm",
            align === "right" && "justify-end",
          )}
        >
          {!hideMark && <span className={clsx("font-display text-sm font-bold", mark === "X" ? "text-x" : "text-o")}>{mark}</span>}
          <span className="truncate">
            {!hideMark && "· "}
            {isMe ? "You" : (p?.label ?? "")}
          </span>
        </span>
      </span>
    </Root>
  );
}
