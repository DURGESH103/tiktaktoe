import type { GameType } from "@/types/db";

/** The games in the hub. Tic-Tac-Toe stays first. */
export const GAMES: Record<GameType, { name: string; short: string; emoji: string; tagline: string }> = {
  tictactoe: { name: "Tic-Tac-Toe", short: "Tic-Tac-Toe", emoji: "❌⭕", tagline: "Classic, fast, a little competitive." },
  couple: { name: "Couple Challenge 💞", short: "Couple Challenge", emoji: "💞", tagline: "How well do you know each other?" },
  ludo: { name: "Ludo 🎲", short: "Ludo", emoji: "🎲", tagline: "2–4 players. Roll, race, capture!" },
};

export const GAME_ORDER: GameType[] = ["tictactoe", "couple", "ludo"];

/** URL of a room for its game. Unknown/missing types are Tic-Tac-Toe (rooms created before game types existed). */
export function roomPath(code: string, gameType: GameType | null | undefined): string {
  if (gameType === "couple") return `/couple/${code}`;
  if (gameType === "ludo") return `/ludo/${code}`;
  return `/game/${code}`;
}
