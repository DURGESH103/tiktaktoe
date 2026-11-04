import { describe, expect, it } from "vitest";
import type { Game, Winner } from "@/types/db";
import { boardAt, toEntries, type RoomWithGames } from "./history";

const ME = "me";
let n = 0;
const game = (winner: Winner | null, endedAt: string, status: Game["status"] = "finished"): Game => ({
  id: `g${++n}`,
  room_id: "r",
  round: n,
  board: ".........",
  starting_turn: "X",
  current_turn: null,
  status,
  winner,
  winning_line: null,
  moves: [],
  started_at: endedAt,
  ended_at: status === "playing" ? null : endedAt,
});
const room = (id: string, x: string, o: string | null, games: Game[]): RoomWithGames => ({
  id,
  code: id.toUpperCase().padEnd(5, "Z"),
  player_x: x,
  player_o: o,
  games,
});

describe("toEntries", () => {
  it("maps results from my seat, skips unfinished rounds, newest first", () => {
    const rooms = [
      room("a", ME, "bob", [game("X", "2026-01-01T10:00:00Z"), game("O", "2026-01-02T10:00:00Z"), game(null, "2026-01-03T00:00:00Z", "playing")]),
      room("b", "amy", ME, [game("O", "2026-01-05T10:00:00Z"), game("draw", "2026-01-04T10:00:00Z"), game(null, "2026-01-06T00:00:00Z", "abandoned")]),
    ];
    const out = toEntries(rooms, ME);
    expect(out.map((e) => [e.opponentId, e.myMark, e.result])).toEqual([
      ["amy", "O", "win"],
      ["amy", "O", "draw"],
      ["bob", "X", "loss"],
      ["bob", "X", "win"],
    ]);
  });

  it("ignores rooms I'm not in", () => {
    expect(toEntries([room("c", "x1", "x2", [game("X", "2026-01-01T00:00:00Z")])], ME)).toEqual([]);
  });
});

describe("boardAt", () => {
  const moves = [
    { cell: 4, mark: "X" as const, at: "" },
    { cell: 0, mark: "O" as const, at: "" },
    { cell: 8, mark: "X" as const, at: "" },
  ];
  it("replays moves up to a step", () => {
    expect(boardAt(moves, 0)).toBe(".........");
    expect(boardAt(moves, 1)).toBe("....X....");
    expect(boardAt(moves, 3)).toBe("O...X...X");
    expect(boardAt(moves, 99)).toBe("O...X...X");
  });
});
