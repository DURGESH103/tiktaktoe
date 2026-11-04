import { describe, expect, it } from "vitest";
import { levelLabel, timerLeft, turnSeat } from "./deck";

describe("turnSeat", () => {
  it("alternates X (odd rounds) and O (even rounds), like the server", () => {
    expect([1, 2, 3, 4, 5].map(turnSeat)).toEqual(["X", "O", "X", "O", "X"]);
  });
});

describe("timerLeft", () => {
  const start = "2026-01-01T12:00:00Z";
  const t0 = Date.parse(start);
  it("shows the full time before the timer starts", () => {
    expect(timerLeft(null, 60, t0)).toBe(60);
  });
  it("counts down and stops at zero", () => {
    expect(timerLeft(start, 60, t0)).toBe(60);
    expect(timerLeft(start, 60, t0 + 15_400)).toBe(45);
    expect(timerLeft(start, 30, t0 + 31_000)).toBe(0);
  });
});

describe("levelLabel", () => {
  it("labels deck levels in either language", () => {
    expect(levelLabel("deep", "en")).toBe("Deep 💭");
    expect(levelLabel("deep", "hi")).toBe("Gehri baatein 💭");
    expect(levelLabel(null, "en")).toBe("");
  });
});
