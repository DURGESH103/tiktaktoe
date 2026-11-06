// Ludo rules engine: pure functions, no I/O. The phone uses it for previews and the tests use it;
// the server (SQL functions _ludo_roll/_ludo_move in migration 0015) is the final authority and
// mirrors this file exactly — supabase/tests/ludo-parity.test.ts plays random games through both.
//
// Token position p, counted from the token's own start square:
//   -1        in the yard
//   0 … 50    on the shared 52-square loop (absolute square = (START[color] + p) % 52)
//   51 … 55   in the colour's home column
//   56        home (finished)

export const COLORS = ["red", "green", "yellow", "blue"] as const;
export type Color = (typeof COLORS)[number];

export const YARD = -1;
export const LAST_LOOP = 50;
export const HOME = 56;
export const START: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
/** Start squares and the four stars (8 squares after each start). */
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

export type Phase = "roll" | "move";

export interface LudoState {
  /** Colours in turn order (seat order). */
  colors: Color[];
  tokens: Partial<Record<Color, number[]>>;
  turn: Color;
  phase: Phase;
  /** The roll waiting to be used (phase "move"); null while rolling. */
  dice: number | null;
  /** Sixes rolled in a row this turn (three in a row lose the turn). */
  sixes: number;
  /** Finishing order. The last player is added when the game ends. */
  placements: Color[];
  finished: boolean;
}

export interface Capture {
  color: Color;
  token: number;
  from: number;
}

export type LudoEvent =
  | { type: "roll"; color: Color; dice: number }
  | { type: "three_sixes"; color: Color }
  | { type: "no_moves"; color: Color }
  | { type: "move"; color: Color; token: number; from: number; to: number; captured: Capture[]; extra: boolean; done: boolean };

export interface Step {
  state: LudoState;
  events: LudoEvent[];
}

export function initialState(colors: Color[], mode: "classic" | "quick" = "classic"): LudoState {
  const tokens: Partial<Record<Color, number[]>> = {};
  for (const c of colors) tokens[c] = mode === "quick" ? [0, YARD, YARD, YARD] : [YARD, YARD, YARD, YARD];
  return { colors: [...colors], tokens, turn: colors[0], phase: "roll", dice: null, sixes: 0, placements: [], finished: false };
}

/** Square on the shared loop, or null in the yard / home column / home. */
export function absSquare(color: Color, p: number): number | null {
  return p >= 0 && p <= LAST_LOOP ? (START[color] + p) % 52 : null;
}

export const isSafe = (square: number) => SAFE_SQUARES.includes(square);

export function canMove(p: number, dice: number): boolean {
  return p === YARD ? dice === 6 : p < HOME && p + dice <= HOME;
}

/** Token indexes that can move with this roll. */
export function legalMoves(state: LudoState, color: Color, dice: number): number[] {
  return (state.tokens[color] ?? []).flatMap((p, i) => (canMove(p, dice) ? [i] : []));
}

/** Distinct choices: tokens on the same spot (e.g. all in the yard) are one choice. */
export function distinctMoves(state: LudoState, color: Color, dice: number): number[] {
  const seen = new Set<number>();
  return legalMoves(state, color, dice).filter((i) => {
    const p = state.tokens[color]![i];
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

function nextColor(state: LudoState, from: Color): Color {
  const n = state.colors.length;
  const i = state.colors.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const c = state.colors[(i + k) % n];
    if (!state.placements.includes(c)) return c;
  }
  return from;
}

function passTurn(state: LudoState): LudoState {
  return { ...state, turn: nextColor(state, state.turn), phase: "roll", dice: null, sixes: 0 };
}

const clone = (s: LudoState): LudoState => ({
  ...s,
  colors: [...s.colors],
  placements: [...s.placements],
  tokens: Object.fromEntries(Object.entries(s.tokens).map(([c, t]) => [c, [...t!]])),
});

/** The current player rolls `dice` (1–6). Handles three sixes, no legal move, and auto-move. */
export function roll(state: LudoState, dice: number): Step {
  if (state.finished || state.phase !== "roll") throw new Error("not rolling");
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) throw new Error("bad dice");
  const color = state.turn;
  const events: LudoEvent[] = [{ type: "roll", color, dice }];
  const sixes = dice === 6 ? state.sixes + 1 : 0;
  if (sixes === 3) {
    events.push({ type: "three_sixes", color });
    return { state: passTurn(state), events };
  }
  const s: LudoState = { ...clone(state), phase: "move", dice, sixes };
  const choices = distinctMoves(s, color, dice);
  if (choices.length === 0) {
    events.push({ type: "no_moves", color });
    return { state: passTurn(s), events };
  }
  if (choices.length === 1) {
    const step = move(s, choices[0]);
    return { state: step.state, events: [...events, ...step.events] };
  }
  return { state: s, events };
}

/** The current player moves token `token` with the pending roll. */
export function move(state: LudoState, token: number): Step {
  if (state.finished || state.phase !== "move" || state.dice == null) throw new Error("not moving");
  const color = state.turn;
  const dice = state.dice;
  const s = clone(state);
  const mine = s.tokens[color]!;
  const from = mine[token];
  if (from === undefined || !canMove(from, dice)) throw new Error("illegal move");
  const to = from === YARD ? 0 : from + dice;
  mine[token] = to;

  const captured: Capture[] = [];
  const square = absSquare(color, to);
  if (square !== null && !isSafe(square)) {
    for (const c of s.colors) {
      if (c === color) continue;
      s.tokens[c]!.forEach((q, i) => {
        if (absSquare(c, q) === square) {
          captured.push({ color: c, token: i, from: q });
          s.tokens[c]![i] = YARD;
        }
      });
    }
  }

  const done = mine.every((p) => p === HOME);
  if (done) s.placements.push(color);
  const extra = !done && (dice === 6 || captured.length > 0 || to === HOME);
  const events: LudoEvent[] = [{ type: "move", color, token, from, to, captured, extra, done }];

  const remaining = s.colors.filter((c) => !s.placements.includes(c));
  if (remaining.length <= 1) {
    s.placements.push(...remaining);
    return { state: { ...s, phase: "roll", dice: null, sixes: 0, finished: true }, events };
  }
  if (extra) return { state: { ...s, phase: "roll", dice: null, sixes: dice === 6 ? s.sixes : 0 }, events };
  return { state: passTurn({ ...s, dice: null }), events };
}
