import { HOME, YARD, type Color } from "../engine";
import { tokenPoint, type Pt } from "./board";

/** Seconds per square when a token hops along the track. */
export const HOP_S = 0.12;
/** Seconds a captured token takes to fly back to its yard. */
export const KNOCK_S = 0.45;

export type TokenMotion =
  /** Hops square by square: `path` = every square from where it was to where it lands. */
  | { kind: "hop"; path: Pt[]; delay: number; toHome: boolean }
  /** Knocked back to the yard once the capturing token has landed (`delay`). */
  | { kind: "knock"; from: Pt; to: Pt; delay: number };

type Tokens = Partial<Record<Color, number[]>>;

/**
 * Works out how each token got from `prev` to `next` (two consecutive game states): forward moves hop
 * along the path, tokens sent back to the yard are knocked back after the mover lands. Anything else
 * (a new game, a jump we can't explain) gets no motion and simply glides into place.
 * `delay` holds every motion back (e.g. until the dice has finished tumbling).
 */
export function planMotion(prev: Tokens, next: Tokens, colors: readonly Color[], delay = 0): Record<string, TokenMotion> {
  const out: Record<string, TokenMotion> = {};
  let landed = delay;
  const knocked: { key: string; from: Pt; to: Pt }[] = [];
  for (const c of colors) {
    (next[c] ?? []).forEach((b, i) => {
      const a = prev[c]?.[i];
      if (a === undefined || a === b) return;
      const key = `${c}-${i}`;
      if (b === YARD && a !== HOME) {
        knocked.push({ key, from: tokenPoint(c, a, i), to: tokenPoint(c, YARD, i) });
      } else if (b > a) {
        const squares = a === YARD ? [YARD, 0] : Array.from({ length: b - a + 1 }, (_, k) => a + k);
        out[key] = { kind: "hop", path: squares.map((p) => tokenPoint(c, p, i)), delay, toHome: b === HOME };
        landed = Math.max(landed, delay + (squares.length - 1) * HOP_S);
      }
    });
  }
  // A knock-back without a visible capturer (e.g. a leaver's tokens) just waits for the shared delay.
  for (const k of knocked) out[k.key] = { kind: "knock", from: k.from, to: k.to, delay: landed };
  return out;
}

/** When the last motion in a plan ends (s), e.g. to time the capture / home sounds. */
export function landingTime(plan: Record<string, TokenMotion>): { hop: number; knock: number | null } {
  let hop = 0;
  let knock: number | null = null;
  for (const m of Object.values(plan)) {
    if (m.kind === "hop") hop = Math.max(hop, m.delay + (m.path.length - 1) * HOP_S);
    else knock = Math.max(knock ?? 0, m.delay);
  }
  return { hop, knock };
}
