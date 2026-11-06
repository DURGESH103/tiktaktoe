export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_CLOSED"
  | "ROOM_NOT_ACTIVE"
  | "GAME_NOT_FOUND"
  | "GAME_NOT_PLAYING"
  | "NOT_YOUR_TURN"
  | "CELL_TAKEN"
  | "INVALID_CELL"
  | "NO_PROFILE"
  | "NOT_AUTHENTICATED"
  | "MESSAGE_EMPTY"
  | "MESSAGE_TOO_LONG"
  | "RATE_LIMITED"
  | "INVALID_MESSAGE"
  | "PLAYER_NOT_FOUND"
  | "CANNOT_FRIEND_SELF"
  | "CANNOT_CHALLENGE_SELF"
  | "BLOCKED"
  | "NO_PENDING_REQUEST"
  | "NOT_FRIENDS"
  | "CHALLENGE_NOT_FOUND"
  | "MEMORY_NOT_RESOLVED"
  | "INVALID_PHOTO"
  | "MEMORY_NOT_FOUND"
  | "PHOTO_TOO_BIG"
  | "PHOTO_UPLOAD_FAILED"
  | "GAME_STARTED"
  | "TOO_MANY_PLAYERS"
  | "NOT_HOST"
  | "ALREADY_IN_ROOM"
  | "INVALID_OPTIONS"
  | "NOT_SET_UP"
  | "NETWORK"
  | "UNKNOWN";

const KNOWN = new Set<string>([
  "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_CLOSED", "ROOM_NOT_ACTIVE", "GAME_NOT_FOUND",
  "GAME_NOT_PLAYING", "NOT_YOUR_TURN", "CELL_TAKEN", "INVALID_CELL", "NO_PROFILE",
  "NOT_AUTHENTICATED", "MESSAGE_EMPTY", "MESSAGE_TOO_LONG", "RATE_LIMITED", "INVALID_MESSAGE",
  "PLAYER_NOT_FOUND", "CANNOT_FRIEND_SELF", "CANNOT_CHALLENGE_SELF", "BLOCKED", "NO_PENDING_REQUEST", "NOT_FRIENDS",
  "CHALLENGE_NOT_FOUND", "MEMORY_NOT_RESOLVED", "INVALID_PHOTO", "MEMORY_NOT_FOUND",
  "GAME_STARTED", "TOO_MANY_PLAYERS", "NOT_HOST", "ALREADY_IN_ROOM", "INVALID_OPTIONS",
]);

// PostgREST / Postgres codes meaning "this table or function doesn't exist" — i.e. a migration hasn't been run.
const MISSING_SCHEMA = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

/** Maps a Supabase/PostgREST error (our functions raise bare codes) to an ErrorCode. */
export function toErrorCode(err: unknown): ErrorCode {
  const msg = typeof err === "object" && err && "message" in err ? String(err.message) : String(err);
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  if (KNOWN.has(msg)) return msg as ErrorCode;
  if (MISSING_SCHEMA.has(code)) return "NOT_SET_UP";
  if (/fetch|network|Failed to fetch|timeout/i.test(msg)) return "NETWORK";
  return "UNKNOWN";
}

/** Short one-line description of a Supabase error for dev-mode diagnostics, e.g. "PGRST202 · Could not find the function…". */
export function errorDetail(err: unknown): string {
  if (!err || typeof err !== "object") return String(err ?? "no response");
  const e = err as { code?: string; message?: string; details?: string; hint?: string };
  const text = [e.code, e.message, e.hint].filter(Boolean).join(" · ");
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

export const ERROR_COPY: Record<ErrorCode, { title: string; body: string }> = {
  ROOM_NOT_FOUND: { title: "Room not found", body: "Double-check the code. Codes are 5 letters and numbers." },
  ROOM_FULL: { title: "Room is full", body: "Two friends are already playing here. Start your own game instead." },
  ROOM_CLOSED: { title: "Game has ended", body: "This room was closed. Start a new game to play again." },
  ROOM_NOT_ACTIVE: { title: "Game isn't active", body: "This room is no longer accepting moves." },
  GAME_NOT_FOUND: { title: "Game not found", body: "We couldn't find that game." },
  GAME_NOT_PLAYING: { title: "Round is over", body: "This round has already finished." },
  NOT_YOUR_TURN: { title: "Not your turn", body: "Wait for your friend to move." },
  CELL_TAKEN: { title: "Cell taken", body: "That square is already filled." },
  INVALID_CELL: { title: "Invalid move", body: "That move isn't allowed." },
  NO_PROFILE: { title: "Set up your profile", body: "Pick a name and avatar first." },
  NOT_AUTHENTICATED: { title: "Signing you in…", body: "Please try again in a moment." },
  MESSAGE_EMPTY: { title: "Empty message", body: "Type something first." },
  MESSAGE_TOO_LONG: { title: "Too long", body: "Messages can be up to 200 characters." },
  RATE_LIMITED: { title: "Slow down", body: "You're going a bit fast. Wait a moment and try again." },
  INVALID_MESSAGE: { title: "Couldn't send", body: "Please try again." },
  PLAYER_NOT_FOUND: { title: "Player not found", body: "Check the friend code and try again." },
  CANNOT_FRIEND_SELF: { title: "That's you!", body: "You can't add yourself as a friend." },
  CANNOT_CHALLENGE_SELF: { title: "That's you!", body: "Challenge a friend instead." },
  BLOCKED: { title: "Not available", body: "You can't interact with this player." },
  NO_PENDING_REQUEST: { title: "Request not found", body: "It may have been cancelled or already answered." },
  NOT_FRIENDS: { title: "Not friends", body: "You can only challenge friends." },
  CHALLENGE_NOT_FOUND: { title: "Challenge not found", body: "It may have expired." },
  MEMORY_NOT_RESOLVED: { title: "Vote first", body: "Both of you tap “We matched” or “Different” before moving on." },
  INVALID_PHOTO: { title: "Photo problem", body: "That photo couldn't be attached. Try another one." },
  MEMORY_NOT_FOUND: { title: "Memory not found", body: "It may already have been deleted." },
  PHOTO_TOO_BIG: { title: "Photo too big", body: "Photos must be under 2 MB. Try a smaller one or a screenshot." },
  PHOTO_UPLOAD_FAILED: { title: "Upload failed", body: "The photo didn't upload. Check your connection and try again." },
  GAME_STARTED: { title: "Game already started", body: "This table is already playing. Start your own game instead." },
  TOO_MANY_PLAYERS: { title: "Too many players", body: "More people are seated than that table size allows." },
  NOT_HOST: { title: "Host only", body: "Only the host can change the table." },
  ALREADY_IN_ROOM: { title: "Already here", body: "They're already at this table." },
  INVALID_OPTIONS: { title: "Invalid option", body: "Pick 2, 3 or 4 players and Classic or Quick." },
  NOT_SET_UP: { title: "Not set up yet", body: "This feature isn't set up on the server yet. A database migration needs to be run." },
  NETWORK: { title: "You're offline", body: "Check your connection and try again." },
  UNKNOWN: { title: "Something went wrong", body: "Please try again." },
};
