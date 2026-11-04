/** Fixed reaction set: receivers drop anything else, so a tampered client can't send arbitrary text. */
export const REACTIONS = [
  { emoji: "😂", label: "laughing" },
  { emoji: "🔥", label: "fire" },
  { emoji: "😎", label: "cool" },
  { emoji: "😭", label: "crying" },
  { emoji: "👏", label: "clapping" },
  { emoji: "😡", label: "angry" },
  { emoji: "🤝", label: "handshake" },
  { emoji: "GG", label: "good game" },
] as const;

export type ReactionEmoji = (typeof REACTIONS)[number]["emoji"];

export const isReaction = (v: unknown): v is ReactionEmoji => REACTIONS.some((r) => r.emoji === v);
export const reactionLabel = (e: ReactionEmoji) => REACTIONS.find((r) => r.emoji === e)!.label;

/** At most one reaction per second from me. */
export const SEND_COOLDOWN_MS = 1000;

/**
 * Sliding-window limiter for incoming events: at most `max` per `windowMs` per sender.
 * Defaults allow ~1/s with a little slack for network jitter. Returns true when the event should be shown.
 */
export function createRateLimiter(max = 2, windowMs = 1900) {
  const seen = new Map<string, number[]>();
  return (sender: string, now = Date.now()): boolean => {
    const recent = (seen.get(sender) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      seen.set(sender, recent);
      return false;
    }
    recent.push(now);
    seen.set(sender, recent);
    return true;
  };
}
