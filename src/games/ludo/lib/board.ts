import { HOME, LAST_LOOP, START, YARD, type Color } from "../engine";

/** A point on the 15×15 board, in cell units (x = column, y = row; cell centres are at .5). */
export interface Pt {
  x: number;
  y: number;
}

const cell = (row: number, col: number): Pt => ({ x: col + 0.5, y: row + 0.5 });
const run = (cells: [number, number][]) => cells.map(([r, c]) => cell(r, c));
const range = (a: number, b: number) => (a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Array.from({ length: a - b + 1 }, (_, i) => a - i));

/**
 * The shared 52-square loop, clockwise, starting at red's start square (row 6, col 1).
 * Red top-left, green top-right, yellow bottom-right, blue bottom-left.
 */
export const LOOP: Pt[] = [
  ...run(range(1, 5).map((c) => [6, c])), //  0–4   red arm, rightwards
  ...run(range(5, 0).map((r) => [r, 6])), //  5–10  up the left side of the top arm
  ...run([[0, 7]]), //                          11
  ...run(range(0, 5).map((r) => [r, 8])), // 12–17  green arm, downwards (green starts at 13)
  ...run(range(9, 14).map((c) => [6, c])), // 18–23
  ...run([[7, 14]]), //                         24
  ...run(range(14, 9).map((c) => [8, c])), // 25–30 yellow arm, leftwards (yellow starts at 26)
  ...run(range(9, 14).map((r) => [r, 8])), // 31–36
  ...run([[14, 7]]), //                         37
  ...run(range(14, 9).map((r) => [r, 6])), // 38–43 blue arm, upwards (blue starts at 39)
  ...run(range(5, 0).map((c) => [8, c])), // 44–49
  ...run([[7, 0]]), //                          50
  ...run([[6, 0]]), //                          51
];

/** Home columns (p = 51 … 55), leading into the centre. */
export const HOME_COLUMN: Record<Color, Pt[]> = {
  red: run(range(1, 5).map((c) => [7, c])),
  green: run(range(1, 5).map((r) => [r, 7])),
  yellow: run(range(13, 9).map((c) => [7, c])),
  blue: run(range(13, 9).map((r) => [r, 7])),
};

/** Top-left corner of each 6×6 yard. */
export const YARD_ORIGIN: Record<Color, Pt> = {
  red: { x: 0, y: 0 },
  green: { x: 9, y: 0 },
  yellow: { x: 9, y: 9 },
  blue: { x: 0, y: 9 },
};

/** Where finished tokens sit: inside the colour's triangle in the centre. */
const HOME_SPOT: Record<Color, Pt> = {
  red: { x: 6.75, y: 7.5 },
  green: { x: 7.5, y: 6.75 },
  yellow: { x: 8.25, y: 7.5 },
  blue: { x: 7.5, y: 8.25 },
};

/** Board point for a token at progress p (token index picks its yard spot). */
export function tokenPoint(color: Color, p: number, token: number): Pt {
  if (p === YARD) {
    const o = YARD_ORIGIN[color];
    return { x: o.x + (token % 2 ? 4 : 2), y: o.y + (token < 2 ? 2 : 4) };
  }
  if (p <= LAST_LOOP) return LOOP[(START[color] + p) % 52];
  if (p < HOME) return HOME_COLUMN[color][p - LAST_LOOP - 1];
  return HOME_SPOT[color];
}

export const COLOR_HEX: Record<Color, string> = { red: "#ef4444", green: "#10b981", yellow: "#f59e0b", blue: "#0ea5e9" };
