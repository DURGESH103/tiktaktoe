import type { Game, Mark, Move, Result, Room } from "@/types/db";

export type { Result };

/** One finished round, from the viewing player's point of view. */
export interface HistoryEntry {
  gameId: string;
  roomId: string;
  roomCode: string;
  round: number;
  myMark: Mark;
  opponentId: string | null;
  result: Result;
  board: string;
  winningLine: number[] | null;
  moves: Move[];
  startedAt: string;
  endedAt: string;
}

export type RoomWithGames = Pick<Room, "id" | "code" | "player_x" | "player_o"> & { games: Game[] };

const byNewest = (a: HistoryEntry, b: HistoryEntry) =>
  b.endedAt.localeCompare(a.endedAt) || b.round - a.round;

/**
 * Flattens rooms → finished rounds for `me` (newest first) for the match list and replays.
 * Abandoned or live rounds are skipped. Stats and head-to-head come from the server (get_my_stats).
 */
export function toEntries(rooms: RoomWithGames[], me: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const room of rooms) {
    const myMark: Mark | null = room.player_x === me ? "X" : room.player_o === me ? "O" : null;
    if (!myMark) continue;
    const opponentId = myMark === "X" ? room.player_o : room.player_x;
    for (const g of room.games ?? []) {
      if (g.status !== "finished" || !g.winner) continue;
      out.push({
        gameId: g.id,
        roomId: room.id,
        roomCode: room.code,
        round: g.round,
        myMark,
        opponentId,
        result: g.winner === "draw" ? "draw" : g.winner === myMark ? "win" : "loss",
        board: g.board,
        winningLine: g.winning_line,
        moves: g.moves,
        startedAt: g.started_at,
        endedAt: g.ended_at ?? g.started_at,
      });
    }
  }
  return out.sort(byNewest);
}

/** Board string after the first `step` moves (0 = empty board). */
export function boardAt(moves: Move[], step: number): string {
  const cells = Array<string>(9).fill(".");
  for (const m of moves.slice(0, Math.max(0, step))) cells[m.cell] = m.mark;
  return cells.join("");
}

const CELL_NAMES = ["top-left", "top", "top-right", "left", "centre", "right", "bottom-left", "bottom", "bottom-right"];
export const cellName = (cell: number) => CELL_NAMES[cell] ?? `cell ${cell}`;
