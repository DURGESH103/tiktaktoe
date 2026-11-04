export type Mark = "X" | "O";
export type CellValue = Mark | null;
export type RoomStatus = "waiting" | "playing" | "abandoned";
export type GameType = "tictactoe" | "couple";
export type GameStatus = "playing" | "finished" | "abandoned";
export type Winner = Mark | "draw";

export interface Player {
  id: string;
  /** Random public id used in /u/<handle> profile links. */
  handle: string;
  name: string;
  avatar: string;
  color: string;
  created_at: string;
}

export interface Room {
  id: string;
  code: string;
  player_x: string;
  player_o: string | null;
  status: RoomStatus;
  /** Added in migration 0009; missing on rows read by older code, so treat undefined as tictactoe. */
  game_type?: GameType;
  created_at: string;
  updated_at: string;
}

export interface Move {
  cell: number;
  mark: Mark;
  at: string;
}

export interface Game {
  id: string;
  room_id: string;
  round: number;
  /** 9 chars, row-major: "X", "O" or "." */
  board: string;
  starting_turn: Mark;
  current_turn: Mark | null;
  status: GameStatus;
  winner: Winner | null;
  winning_line: number[] | null;
  moves: Move[];
  started_at: string;
  ended_at: string | null;
}

export type Result = "win" | "loss" | "draw";

/** A player as exposed publicly: no auth id, only the random public handle. */
export interface PublicPlayer {
  handle: string;
  name: string;
  avatar: string;
  color: string;
}

/** Server-calculated stats (see _player_stats in the 0005 migration). */
export interface PlayerStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number | null;
  current_streak: { result: Result; count: number } | null;
  current_win_streak: number;
  best_win_streak: number;
}

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  last_played_at: string | null;
}

export interface PublicProfile {
  player: PublicPlayer & { member_since: string };
  is_me: boolean;
  stats: PlayerStats;
  head_to_head: HeadToHeadRecord | null;
  recent: { opponent: PublicPlayer | null; result: Result; ended_at: string; moves: number }[];
}

export interface MyStats {
  stats: PlayerStats;
  head_to_head: (HeadToHeadRecord & { opponent: PublicPlayer })[];
}

/** Link-preview data for a room (get_room_invite). */
export interface RoomInvite {
  host: PublicPlayer | null;
  status: RoomStatus;
  is_full: boolean;
  game_type?: GameType;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
  client_id: string;
  created_at: string;
}
