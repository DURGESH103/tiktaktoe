import { describe, expect, it } from "vitest";
import { seriesScore, type RoundResult } from "./series";

const r = (round: number, winner: RoundResult["winner"], status: RoundResult["status"] = "finished"): RoundResult => ({
  round,
  winner,
  status,
});

describe("seriesScore", () => {
  it("is all zeros for no rounds", () => {
    expect(seriesScore([])).toEqual({ X: 0, O: 0, draws: 0 });
  });

  it("counts wins per mark and draws", () => {
    expect(seriesScore([r(1, "X"), r(2, "O"), r(3, "X"), r(4, "draw"), r(5, "X")])).toEqual({ X: 3, O: 1, draws: 1 });
  });

  it("ignores rounds still playing or abandoned", () => {
    expect(seriesScore([r(1, "X"), r(2, null, "playing"), r(3, null, "abandoned")])).toEqual({ X: 1, O: 0, draws: 0 });
  });
});
