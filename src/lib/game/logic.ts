import type { CellValue, Mark, Winner } from "@/types/db";

export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export type Board = CellValue[];

export interface Outcome {
  winner: Winner;
  line: readonly number[] | null;
}

/** Parses the 9-char DB board ("X", "O", ".") into cells. */
export function parseBoard(s: string): Board {
  if (!/^[XO.]{9}$/.test(s)) throw new Error(`Invalid board: ${s}`);
  return [...s].map((c) => (c === "." ? null : (c as Mark)));
}

export function serializeBoard(board: Board): string {
  return board.map((c) => c ?? ".").join("");
}

/** Returns the winner (with its line), "draw" for a full board, or null while play continues. */
export function getOutcome(board: Board): Outcome | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return { winner: v, line };
  }
  if (board.every((c) => c !== null)) return { winner: "draw", line: null };
  return null;
}

export function applyMove(board: Board, cell: number, mark: Mark): Board {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new Error("Invalid cell");
  if (board[cell] !== null) throw new Error("Cell taken");
  const next = board.slice();
  next[cell] = mark;
  return next;
}

export const other = (m: Mark): Mark => (m === "X" ? "O" : "X");
