import { describe, expect, it } from "vitest";
import type { LudoSeat } from "../types";
import { activeSeats, allowedSeats, startState } from "./seats";

const seat = (n: 0 | 1 | 2 | 3, ready: boolean, left = false): LudoSeat => ({
  room_id: "r",
  player_id: `p${n}`,
  seat: n,
  color: (["red", "green", "yellow", "blue"] as const)[n],
  ready,
  joined_at: "2026-01-01T00:00:00Z",
  left_at: left ? "2026-01-01T00:01:00Z" : null,
});

describe("allowedSeats", () => {
  it("2 players sit opposite (red/yellow); 3 and 4 fill clockwise", () => {
    expect(allowedSeats(2)).toEqual([0, 2]);
    expect(allowedSeats(3)).toEqual([0, 1, 2]);
    expect(allowedSeats(4)).toEqual([0, 1, 2, 3]);
  });
});

describe("startState", () => {
  it("needs at least two players", () => {
    expect(startState([seat(0, true)])).toEqual({ ok: false, reason: "Waiting for at least one more player" });
  });
  it("needs everyone ready", () => {
    expect(startState([seat(0, true), seat(1, false), seat(2, false)]).reason).toBe("Waiting for 2 players to be ready");
    expect(startState([seat(0, true), seat(2, true)]).ok).toBe(true);
  });
  it("ignores people who left", () => {
    expect(startState([seat(0, true), seat(1, false, true), seat(2, true)]).ok).toBe(true);
    expect(activeSeats([seat(2, true), seat(0, true), seat(1, false, true)]).map((s) => s.seat)).toEqual([0, 2]);
  });
});
