import { describe, expect, it } from "vitest";
import { SAFE_SQUARES, START } from "../engine";
import { HOME_COLUMN, LOOP, tokenPoint } from "./board";

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const adjacent = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1 || (Math.abs(a.x - b.x) === 1 && Math.abs(a.y - b.y) === 1);

describe("board geometry", () => {
  it("the loop has 52 distinct squares, each next to the one before (it's a closed path)", () => {
    expect(LOOP).toHaveLength(52);
    expect(new Set(LOOP.map(key)).size).toBe(52);
    LOOP.forEach((p, i) => expect(adjacent(p, LOOP[(i + 1) % 52]), `square ${i}`).toBe(true));
  });

  it("start squares sit next to their yard's arm", () => {
    expect(LOOP[START.red]).toEqual({ x: 1.5, y: 6.5 });
    expect(LOOP[START.green]).toEqual({ x: 8.5, y: 1.5 });
    expect(LOOP[START.yellow]).toEqual({ x: 13.5, y: 8.5 });
    expect(LOOP[START.blue]).toEqual({ x: 6.5, y: 13.5 });
  });

  it("each colour's last loop square leads into its home column, which leads to the centre", () => {
    for (const c of ["red", "green", "yellow", "blue"] as const) {
      expect(adjacent(tokenPoint(c, 50, 0), tokenPoint(c, 51, 0)), c).toBe(true);
      const col = HOME_COLUMN[c];
      expect(col).toHaveLength(5);
      for (let i = 1; i < 5; i++) expect(adjacent(col[i - 1], col[i])).toBe(true);
      const last = col[4];
      expect(last.x >= 5 && last.x <= 10 && last.y >= 5 && last.y <= 10, c).toBe(true);
    }
  });

  it("home columns don't overlap the loop; star squares are on the loop", () => {
    const loop = new Set(LOOP.map(key));
    for (const col of Object.values(HOME_COLUMN)) for (const p of col) expect(loop.has(key(p))).toBe(false);
    expect(SAFE_SQUARES.every((s) => s >= 0 && s < 52)).toBe(true);
  });

  it("yard tokens get four separate spots", () => {
    expect(new Set([0, 1, 2, 3].map((i) => key(tokenPoint("blue", -1, i)))).size).toBe(4);
  });
});
