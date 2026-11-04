import { describe, expect, it } from "vitest";
import { applyMove, getOutcome, parseBoard, serializeBoard, WIN_LINES } from "./logic";

const b = (s: string) => parseBoard(s.replace(/\s/g, ""));

describe("parseBoard / serializeBoard", () => {
  it("round-trips", () => {
    const s = "X.O..X.O.";
    expect(serializeBoard(parseBoard(s))).toBe(s);
  });
  it("rejects malformed boards", () => {
    expect(() => parseBoard("XO")).toThrow();
    expect(() => parseBoard("XXXXXXXXA")).toThrow();
  });
});

describe("getOutcome", () => {
  it("returns null for an empty board", () => {
    expect(getOutcome(b("........."))).toBeNull();
  });

  it("returns null for an in-progress board", () => {
    expect(getOutcome(b("XO. .X. ..O"))).toBeNull();
  });

  it.each(WIN_LINES.map((line) => [line]))("detects X winning on line %j", (line) => {
    const board = parseBoard(".........");
    for (const i of line) board[i] = "X";
    expect(getOutcome(board)).toEqual({ winner: "X", line });
  });

  it("detects O wins", () => {
    expect(getOutcome(b("XXO XO. O..")))
      .toEqual({ winner: "O", line: [2, 4, 6] });
  });

  it("detects a draw on a full board with no line", () => {
    expect(getOutcome(b("XOX XOO OXX"))).toEqual({ winner: "draw", line: null });
  });

  it("prefers a win over a draw when the last move fills the board", () => {
    expect(getOutcome(b("XOX OXO OXX"))?.winner).toBe("X");
  });

  it("does not treat three empty cells as a win", () => {
    expect(getOutcome(b("... XOX OXO"))).toBeNull();
  });
});

describe("applyMove", () => {
  it("places a mark without mutating the input", () => {
    const start = b(".........");
    const next = applyMove(start, 4, "X");
    expect(next[4]).toBe("X");
    expect(start[4]).toBeNull();
  });
  it("rejects occupied and out-of-range cells", () => {
    expect(() => applyMove(b("X........"), 0, "O")).toThrow("Cell taken");
    expect(() => applyMove(b("........."), 9, "O")).toThrow("Invalid cell");
    expect(() => applyMove(b("........."), -1, "O")).toThrow("Invalid cell");
  });
});
