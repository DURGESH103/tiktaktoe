// The TypeScript engine (phone previews, unit tests) and the SQL engine (server, final authority)
// must agree on every state and every event. Random games and random positions, played through both.
import { beforeAll, describe, expect, it } from "vitest";
import { COLORS, HOME, initialState, legalMoves, move, roll, type Color, type LudoState } from "../../src/games/ludo/engine";
import { createDb } from "./db";

type Db = Awaited<ReturnType<typeof createDb>>;
let t: Db;

/** Small deterministic PRNG, so a failure can be replayed. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

async function sqlRoll(s: LudoState, d: number) {
  return (await t.db.query<{ r: { state: LudoState; events: unknown[] } }>("select public._ludo_roll($1::jsonb, $2) as r", [JSON.stringify(s), d])).rows[0].r;
}
async function sqlMove(s: LudoState, tok: number) {
  return (await t.db.query<{ r: { state: LudoState; events: unknown[] } }>("select public._ludo_move($1::jsonb, $2) as r", [JSON.stringify(s), tok])).rows[0].r;
}

beforeAll(async () => {
  t = await createDb();
});

describe("TypeScript ↔ SQL engine parity", () => {
  it("initial states match for every table size and mode", async () => {
    for (const colors of [["red", "yellow"], ["red", "green", "yellow"], [...COLORS]] as Color[][]) {
      for (const mode of ["classic", "quick"] as const) {
        const sql = (await t.db.query<{ s: LudoState }>("select public._ludo_initial($1::text[], $2) as s", [colors, mode])).rows[0].s;
        expect(sql).toEqual(initialState(colors, mode));
      }
    }
  });

  it("full random games: every state and event matches", async () => {
    let steps = 0;
    let finished = 0;
    for (let game = 0; game < 14; game++) {
      const r = rng(1000 + game);
      const n = 2 + (game % 3);
      const colors = COLORS.filter((_, i) => (n === 2 ? i % 2 === 0 : i < n)) as Color[];
      let s = initialState(colors, game % 2 ? "quick" : "classic");
      for (let i = 0; i < 2500 && !s.finished; i++, steps++) {
        if (s.phase === "roll") {
          const d = r() < 0.3 ? 6 : 1 + Math.floor(r() * 6); // extra 6s exercise entries and triples
          const ts = roll(s, d);
          const sq = await sqlRoll(s, d);
          expect(sq, `game ${game} step ${i} roll ${d}`).toEqual(ts);
          s = ts.state;
        } else {
          const tok = pick(r, legalMoves(s, s.turn, s.dice!));
          const ts = move(s, tok);
          const sq = await sqlMove(s, tok);
          expect(sq, `game ${game} step ${i} move ${tok}`).toEqual(ts);
          s = ts.state;
        }
      }
      if (s.finished) finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(10); // most games are played to the very end
    expect(steps).toBeGreaterThan(3000);
  }, 180_000);

  it("random positions × every roll: captures, safe squares, exact home, three sixes", async () => {
    const r = rng(42);
    for (let k = 0; k < 250; k++) {
      const n = 2 + (k % 3);
      const colors = [...COLORS].slice(0, n) as Color[];
      const tokens: Partial<Record<Color, number[]>> = {};
      for (const c of colors) {
        // Crowd the board so tokens often meet: positions clustered in a band, some in the yard/home.
        const base = Math.floor(r() * 40);
        tokens[c] = [0, 1, 2, 3].map(() => (r() < 0.2 ? -1 : r() < 0.1 ? HOME : Math.min(HOME, base + Math.floor(r() * 16))));
      }
      const placements = colors.filter((c) => tokens[c]!.every((p) => p === HOME));
      const live = colors.filter((c) => !placements.includes(c));
      if (live.length < 2) continue;
      const s: LudoState = { ...initialState(colors), tokens, placements, turn: pick(r, live), sixes: Math.floor(r() * 3) };
      for (let d = 1; d <= 6; d++) {
        const ts = roll(s, d);
        expect(await sqlRoll(s, d), `position ${k} roll ${d}`).toEqual(ts);
        if (ts.state.phase === "move") {
          for (const tok of legalMoves(ts.state, ts.state.turn, d)) {
            expect(await sqlMove(ts.state, tok), `position ${k} roll ${d} move ${tok}`).toEqual(move(ts.state, tok));
          }
        }
      }
    }
  }, 180_000);
});
