import type { LudoEvent, LudoState } from "./engine";

export type LudoColor = "red" | "green" | "yellow" | "blue";
export type LudoMode = "classic" | "quick";

/** ludo_rooms row */
export interface LudoSettings {
  room_id: string;
  max_players: 2 | 3 | 4;
  mode: LudoMode;
}

/** room_players row (only Ludo uses it) */
export interface LudoSeat {
  room_id: string;
  player_id: string;
  seat: 0 | 1 | 2 | 3;
  color: LudoColor;
  ready: boolean;
  joined_at: string;
  left_at: string | null;
}

/** ludo_games row (state follows src/games/ludo/engine.ts). */
export interface LudoGameRow {
  id: string;
  room_id: string;
  status: "playing" | "finished" | "abandoned";
  mode: LudoMode;
  /** colour → player id */
  seats: Partial<Record<LudoColor, string>>;
  state: LudoState;
  last_roll: number | null;
  last_events: LudoEvent[];
  /** Bumped by every roll/move; actions send the one they saw (double taps are refused). */
  seq: number;
  started_at: string;
  ended_at: string | null;
  /** Turn clock (server time): 20 s to roll, then 20 s to move; 1.5 s for players marked away. */
  turn_started_at: string | null;
  turn_deadline: string | null;
  /** Consecutive timeouts per colour, and colours being auto-played. */
  timeouts: Partial<Record<LudoColor, number>>;
  away: LudoColor[];
}
