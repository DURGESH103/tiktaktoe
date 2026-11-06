import { describe, expect, it } from "vitest";
import { HOME, YARD } from "../engine";
import { tokenPoint } from "./board";
import { HOP_S, landingTime, planMotion } from "./motion";

const colors = ["red", "yellow"] as const;

describe("planMotion", () => {
  it("hops square by square, one keyframe per square", () => {
    const plan = planMotion({ red: [3, -1, -1, -1] }, { red: [7, -1, -1, -1] }, ["red"]);
    expect(plan["red-0"]).toEqual({ kind: "hop", path: [3, 4, 5, 6, 7].map((p) => tokenPoint("red", p, 0)), delay: 0, toHome: false });
    expect(Object.keys(plan)).toEqual(["red-0"]);
  });

  it("leaving the yard hops from the yard spot onto the start square", () => {
    const plan = planMotion({ red: [YARD, -1, -1, -1] }, { red: [0, -1, -1, -1] }, ["red"]);
    expect(plan["red-0"]).toMatchObject({ kind: "hop", path: [tokenPoint("red", YARD, 0), tokenPoint("red", 0, 0)] });
  });

  it("a capture knocks the victim home only after the capturer lands", () => {
    // Red moves 5 → 10 (yellow's token sits on red's square 10).
    const plan = planMotion({ red: [5, -1, -1, -1], yellow: [36, -1, -1, -1] }, { red: [10, -1, -1, -1], yellow: [YARD, -1, -1, -1] }, colors, 0.6);
    expect(plan["red-0"]).toMatchObject({ kind: "hop", delay: 0.6 });
    expect(plan["yellow-0"]).toEqual({ kind: "knock", from: tokenPoint("yellow", 36, 0), to: tokenPoint("yellow", YARD, 0), delay: 0.6 + 5 * HOP_S });
    expect(landingTime(plan)).toEqual({ hop: 0.6 + 5 * HOP_S, knock: 0.6 + 5 * HOP_S });
  });

  it("flags a token reaching home", () => {
    const plan = planMotion({ red: [53, 56, 56, 56] }, { red: [HOME, 56, 56, 56] }, ["red"]);
    expect(plan["red-0"]).toMatchObject({ kind: "hop", toHome: true });
  });

  it("no motion for unchanged tokens or a reset (new game)", () => {
    expect(planMotion({ red: [4, 8, -1, -1] }, { red: [4, 8, -1, -1] }, ["red"])).toEqual({});
    expect(planMotion({ red: [HOME, HOME, 30, 2] }, { red: [-1, -1, -1, -1] }, ["red"])).toMatchObject({
      "red-2": { kind: "knock" },
      "red-3": { kind: "knock" },
    });
    expect(planMotion({ red: [HOME, 1, 1, 1] }, { red: [-1, 1, 1, 1] }, ["red"])).toEqual({});
  });
});
