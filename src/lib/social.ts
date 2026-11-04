import { relativeTime } from "@/lib/format";
import type { GameType, HeadToHeadRecord, PublicPlayer } from "@/types/db";

/** What a player broadcasts on the shared presence channel. Offline = not present at all. */
export type PresenceState = "online" | "away" | "in_game";
export type FriendStatus = PresenceState | "offline";
/** The relationship as I see it (mirrors _relation() in the 0007 migration). */
export type Relation = "self" | "friends" | "requested" | "incoming" | "blocked" | "none";

export interface FriendEntry {
  player: PublicPlayer;
  since: string;
  last_seen_at: string | null;
  head_to_head: HeadToHeadRecord;
}
export interface RequestEntry {
  player: PublicPlayer;
  at: string;
}
export interface FriendsData {
  friends: FriendEntry[];
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
  blocked: RequestEntry[];
}

export type ChallengeStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled";
export interface Challenge {
  id: string;
  game_type?: GameType;
  direction: "in" | "out";
  other: PublicPlayer;
  status: ChallengeStatus;
  room_code: string | null;
  created_at: string;
  expires_at: string;
  server_now: string;
}

export function relationFor(handle: string, data: FriendsData | null, myHandle?: string): Relation {
  if (handle === myHandle) return "self";
  if (!data) return "none";
  const has = (list: { player: PublicPlayer }[]) => list.some((x) => x.player.handle === handle);
  if (has(data.friends)) return "friends";
  if (has(data.outgoing)) return "requested";
  if (has(data.incoming)) return "incoming";
  if (has(data.blocked)) return "blocked";
  return "none";
}

const RANK: Record<FriendStatus, number> = { online: 0, away: 1, in_game: 2, offline: 3 };

/** Online first, then away, then in a game, then offline (most recently seen first); ties by name. */
export function sortFriends(friends: FriendEntry[], statusOf: (handle: string) => FriendStatus): FriendEntry[] {
  return [...friends].sort((a, b) => {
    const sa = statusOf(a.player.handle);
    const sb = statusOf(b.player.handle);
    if (RANK[sa] !== RANK[sb]) return RANK[sa] - RANK[sb];
    if (sa === "offline") {
      const ta = a.last_seen_at ? Date.parse(a.last_seen_at) : 0;
      const tb = b.last_seen_at ? Date.parse(b.last_seen_at) : 0;
      if (ta !== tb) return tb - ta;
    }
    return a.player.name.localeCompare(b.player.name);
  });
}

export function statusLabel(status: FriendStatus, lastSeen: string | null, now = Date.now()): string {
  if (status === "online") return "Online";
  if (status === "away") return "Away";
  if (status === "in_game") return "In a game";
  return lastSeen ? `Last seen ${relativeTime(lastSeen, now)}` : "Offline";
}

/** Friends can be challenged when they're online or away (tab in the background), not offline or mid-game. */
export const canChallenge = (status: FriendStatus) => status === "online" || status === "away";

/**
 * Seconds left on a pending challenge. `clockOffsetMs` = server time − this device's time,
 * so both phones count down the same 60 seconds even if their clocks differ.
 */
export function secondsLeft(c: Pick<Challenge, "expires_at">, clockOffsetMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(c.expires_at) - (now + clockOffsetMs)) / 1000));
}
