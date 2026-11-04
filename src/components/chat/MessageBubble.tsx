"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import type { ChatMessage } from "@/hooks/useRoomChat";
import { timeLabel } from "@/lib/format";
import { maskProfanity } from "@/lib/profanity";
import type { Player } from "@/types/db";

const FAIL_LABEL: Record<string, string> = {
  RATE_LIMITED: "Too fast",
  NOT_SET_UP: "Chat not set up",
  NETWORK: "Offline",
  ROOM_CLOSED: "Room closed",
};

/**
 * One chat bubble. Text is rendered as a React text node (escaped, never HTML) and
 * passed through the bad-word filter for whoever is reading it.
 */
export function MessageBubble({
  message,
  mine,
  sender,
  onRetry,
}: {
  message: Pick<ChatMessage, "body" | "created_at" | "status" | "error" | "errorDetail" | "key">;
  mine: boolean;
  sender?: Pick<Player, "name" | "avatar" | "color">;
  onRetry?: (key: string) => void;
}) {
  const failed = message.status === "failed";
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 34 }}
      className={clsx("flex items-end gap-2", mine ? "flex-row-reverse" : "flex-row")}
    >
      {!mine && <AvatarBadge avatar={sender?.avatar ?? "❔"} color={sender?.color ?? "slate"} size="xs" className="mb-5" />}
      <div className={clsx("flex max-w-[78%] flex-col gap-1", mine ? "items-end" : "items-start")}>
        <p
          className={clsx(
            "whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug [overflow-wrap:anywhere]",
            mine
              ? "rounded-2xl rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white"
              : "rounded-2xl rounded-bl-md bg-fg/[0.08] text-fg",
            failed && "opacity-60",
          )}
        >
          <span className="sr-only">{mine ? "You" : (sender?.name ?? "Opponent")}: </span>
          {maskProfanity(message.body)}
        </p>
        <span className="px-1 text-[11px] text-muted">
          {timeLabel(message.created_at)}
          {mine && message.status === "sending" && " · Sending…"}
          {mine && message.status === "sent" && " · Sent"}
        </span>
        {mine && failed && (
          <button
            type="button"
            onClick={() => onRetry?.(message.key)}
            className="-mt-3 min-h-12 rounded-lg px-2 text-xs font-semibold text-danger hover:underline"
          >
            {FAIL_LABEL[message.error ?? ""] ?? "Failed"} — tap to retry
          </button>
        )}
        {mine && failed && process.env.NODE_ENV === "development" && message.errorDetail && (
          // Dev-only diagnostics: the raw Supabase error, so problems are obvious while testing.
          <code className="-mt-2 max-w-full break-all px-1 text-[10px] leading-tight text-danger/80">{message.errorDetail}</code>
        )}
      </div>
    </motion.li>
  );
}
