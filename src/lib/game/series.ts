import type { GameStatus, Winner } from "@/types/db";

export interface RoundResult {
  round: number;
  status: GameStatus;
  winner: Winner | null;
}

export interface SeriesScore {
  X: number;
  O: number;
  draws: number;
}

/** Tallies finished rounds. Marks are fixed per player for the whole series, so X wins = player_x wins. */
export function seriesScore(results: Iterable<RoundResult>): SeriesScore {
  const score: SeriesScore = { X: 0, O: 0, draws: 0 };
  for (const r of results) {
    if (r.status !== "finished" || !r.winner) continue;
    if (r.winner === "draw") score.draws++;
    else score[r.winner]++;
  }
  return score;
}
