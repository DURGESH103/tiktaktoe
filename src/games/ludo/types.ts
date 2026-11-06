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
