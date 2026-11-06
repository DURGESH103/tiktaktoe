import { describe, expect, it } from "vitest";
import { absSquare, distinctMoves, HOME, initialState, legalMoves, move, roll, YARD, type Color, type LudoState } from "./engine";

/** A state with chosen token positions; red to roll unless said otherwise. */
function at(tokens: Partial<Record<Color, number[]>>, extra: Partial<LudoState> = {}): LudoState {
  const colors = Object.keys(tokens) as Color[];
  return { ...initialState(colors), tokens: structuredClone(tokens), ...extra };
}

describe("entering on a 6", () => {
  it("tokens in the yard need a 6; a non-6 with everyone home passes the turn", () => {
    const s = initialState(["red", "yellow"]);
    const r = roll(s, 4);
    expect(r.events.map((e) => e.type)).toEqual(["roll", "no_moves"]);
    expect(r.state).toMatchObject({ turn: "yellow", phase: "roll", sixes: 0 });
  });

  it("a 6 brings a token out to its start square and gives another roll", () => {
    const r = roll(initialState(["red", "yellow"]), 6);
    expect(r.state.tokens.red).toEqual([0, YARD, YARD, YARD]);
    expect(r.state).toMatchObject({ turn: "red", phase: "roll", sixes: 1 });
  });

  it("Quick mode starts with one token already out", () => {
    expect(initialState(["red", "blue"], "quick").tokens.blue).toEqual([0, YARD, YARD, YARD]);
  });
});

describe("three 6s in a row", () => {
  it("the third 6 loses the turn and nothing moves", () => {
    let s = at({ red: [10, YARD, YARD, YARD], yellow: [YARD, YARD, YARD, YARD] });
    s = roll(s, 6).state; // choice: token 0 or bring one out
    s = move(s, 0).state;
    s = roll(s, 6).state;
    s = move(s, 0).state;
    expect(s).toMatchObject({ turn: "red", sixes: 2 });
    const third = roll(s, 6);
    expect(third.events.map((e) => e.type)).toEqual(["roll", "three_sixes"]);
    expect(third.state.tokens.red).toEqual([22, YARD, YARD, YARD]);
    expect(third.state).toMatchObject({ turn: "yellow", sixes: 0 });
  });

  it("a non-6 resets the count", () => {
    let s = at({ red: [10, 20, YARD, YARD], yellow: [YARD, YARD, YARD, YARD] }, { sixes: 2 });
    s = roll(s, 3).state;
    expect(s.sixes).toBe(0);
  });
});

describe("captures and safe squares", () => {
  it("landing on an opponent sends it home and gives an extra roll", () => {
    // Yellow p=2 is square 28; red p=27 → 28 with a 1.
    const s = at({ red: [27, YARD, YARD, YARD], yellow: [2, YARD, YARD, YARD] });
    const r = roll(s, 1);
    const m = r.events.find((e) => e.type === "move");
    expect(m).toMatchObject({ to: 28, captured: [{ color: "yellow", token: 0, from: 2 }], extra: true });
    expect(r.state.tokens.yellow).toEqual([YARD, YARD, YARD, YARD]);
    expect(r.state).toMatchObject({ turn: "red", phase: "roll", sixes: 0 });
  });

  it("captures every opponent token on that square", () => {
    const s = at({ red: [27, YARD, YARD, YARD], yellow: [2, 2, YARD, YARD], blue: [YARD, YARD, YARD, YARD] });
    expect(roll(s, 1).state.tokens.yellow).toEqual([YARD, YARD, YARD, YARD]);
  });

  it("start and star squares are safe", () => {
    expect(absSquare("yellow", 0)).toBe(26);
    // Red p=25 + 1 → square 26 = yellow's start: safe, both stay.
    const onStart = roll(at({ red: [25, YARD, YARD, YARD], yellow: [0, YARD, YARD, YARD] }), 1);
    expect(onStart.state.tokens.yellow).toEqual([0, YARD, YARD, YARD]);
    // Square 34 is a star (yellow p=8, red p=34).
    const onStar = roll(at({ red: [33, YARD, YARD, YARD], yellow: [8, YARD, YARD, YARD] }), 1);
    expect(onStar.state.tokens.yellow).toEqual([8, YARD, YARD, YARD]);
    expect(onStar.state.turn).toBe("yellow"); // no capture → no extra roll
  });

  it("home-column tokens can't be captured (they're off the shared loop)", () => {
    expect(absSquare("red", 51)).toBeNull();
  });
});

describe("reaching home", () => {
  it("needs the exact roll", () => {
    const s = at({ red: [53, YARD, YARD, YARD], yellow: [YARD, YARD, YARD, YARD] });
    expect(legalMoves(s, "red", 4)).toEqual([]);
    expect(roll(s, 4).events.map((e) => e.type)).toEqual(["roll", "no_moves"]);
    expect(legalMoves(s, "red", 3)).toEqual([0]);
  });

  it("a token reaching home gives an extra roll", () => {
    const r = roll(at({ red: [53, 10, YARD, YARD], yellow: [YARD, YARD, YARD, YARD] }), 3);
    expect(r.state.phase).toBe("move"); // two choices: token 0 home, or token 1
    const m = move(r.state, 0);
    expect(m.events[0]).toMatchObject({ to: HOME, extra: true });
    expect(m.state).toMatchObject({ turn: "red", phase: "roll" });
  });
});

describe("finishing order", () => {
  it("a player who finishes is placed and skipped; the game ends when one player is left", () => {
    const s = at({ red: [56, 56, 56, 55], green: [56, 56, 56, 55], yellow: [10, YARD, YARD, YARD] });
    let r = roll(s, 1); // red's last token home
    expect(r.state.placements).toEqual(["red"]);
    expect(r.events[1]).toMatchObject({ done: true, extra: false });
    expect(r.state.turn).toBe("green");
    r = roll(r.state, 1); // green finishes → only yellow left → game over
    expect(r.state).toMatchObject({ finished: true, placements: ["red", "green", "yellow"] });
  });

  it("finished players are skipped in turn order", () => {
    const s = at({ red: [56, 56, 56, 56], green: [10, YARD, YARD, YARD], yellow: [20, YARD, YARD, YARD] }, { placements: ["red"], turn: "yellow" });
    expect(roll(s, 2).state.turn).toBe("green");
  });
});

describe("auto-move", () => {
  it("one legal move is played automatically", () => {
    const r = roll(at({ red: [10, YARD, YARD, YARD], yellow: [YARD, YARD, YARD, YARD] }), 4);
    expect(r.events.map((e) => e.type)).toEqual(["roll", "move"]);
    expect(r.state.tokens.red![0]).toBe(14);
  });

  it("tokens on the same spot count as one choice (a 6 with everyone in the yard)", () => {
    const s = initialState(["red", "yellow"]);
    expect(legalMoves(s, "red", 6)).toEqual([0, 1, 2, 3]);
    expect(distinctMoves(s, "red", 6)).toEqual([0]);
    expect(roll(s, 6).events.map((e) => e.type)).toEqual(["roll", "move"]);
  });

  it("two different choices wait for the player", () => {
    const r = roll(at({ red: [10, 20, YARD, YARD], yellow: [YARD, YARD, YARD, YARD] }), 2);
    expect(r.state).toMatchObject({ phase: "move", dice: 2 });
    expect(() => move(r.state, 2)).toThrow("illegal move"); // yard token can't move on a 2
  });
});
