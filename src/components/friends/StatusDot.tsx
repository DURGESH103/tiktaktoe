import clsx from "clsx";
import type { FriendStatus } from "@/lib/social";

const COLORS: Record<FriendStatus, string> = {
  online: "bg-ok",
  away: "bg-warn",
  in_game: "bg-accent",
  offline: "bg-muted/50",
};

/** Small live status dot, positioned on an avatar's corner by the parent. */
export function StatusDot({ status, className }: { status: FriendStatus; className?: string }) {
  return <span aria-hidden className={clsx("h-3.5 w-3.5 rounded-full ring-2 ring-bg transition-colors duration-300", COLORS[status], className)} />;
}
