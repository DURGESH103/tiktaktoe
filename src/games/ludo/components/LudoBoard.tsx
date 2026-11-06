"use client";

import { motion, useReducedMotion, type TargetAndTransition, type Transition } from "framer-motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HOME, LAST_LOOP, SAFE_SQUARES, START, YARD, type Color, type LudoState } from "../engine";
import { COLOR_DARK, COLOR_HEX, COLOR_LIGHT, HOME_COLUMN, LOOP, tokenPoint, YARD_ORIGIN, type Pt } from "../lib/board";
import { HOP_S, KNOCK_S, planEnd, planMotion, type TokenMotion } from "../lib/motion";

const COLORS = ["red", "green", "yellow", "blue"] as const;

// The board keeps its own palette in both themes, like a real board (white squares, grey lines).
const SQUARE = "#ffffff";
const LINE = "#a3a9b5";
const STAR = "#7c8494";
const EDGE = "#1f2433";

/** Map-pin token, drawn around (0, 0) = the middle of its square; the tip rests just below it. */
const PIN = "M0 0.3 C-0.1 0.17 -0.3 0.02 -0.3 -0.2 A0.3 0.3 0 1 1 0.3 -0.2 C0.3 0.02 0.1 0.17 0 0.3Z";

/** Home-column entrance square (p = 50) and the arrow direction into the column. */
const ARROW: Record<Color, number> = { red: 0, green: 90, yellow: 180, blue: 270 }; // degrees: → ↓ ← ↑

const SPRING: Transition = { type: "spring", stiffness: 260, damping: 26 };

/** The SVG viewBox: the 15×15 board plus a small margin inside the border. */
const V0 = -0.42;
const VS = 15.84;
const pct = (cells: number) => `${(cells / VS) * 100}%`;
/** A box `size` cells wide with its top-left corner at board point (x, y). */
const box = (x: number, y: number, size: number) => ({ left: pct(x - V0), top: pct(y - V0), width: pct(size), height: pct(size) });
/** A one-cell box at the board's (0, 0) cell; moved around with translate(pc(x), pc(y)). */
const CELL = box(0, 0, 1);
/** Translate (in % of a one-cell box) that centres it on board point v (cell centres are at .5). */
const pc = (v: number) => `${((v - 0.5) * 100).toFixed(2)}%`;
const REST = { scaleX: 1, scaleY: 1 };
/** Reduced motion: moves fade in over this long instead of hopping. */
const REDUCED_S = 0.3;

type Tokens = LudoState["tokens"];
/** What the board shows: token positions, and how each token got there. */
type View = { tokens: Tokens; plan: Record<string, TokenMotion> };
type Target = {
  animate: TargetAndTransition;
  transition: Transition;
  /** Landing squash (hops only). */
  squash?: { animate: TargetAndTransition; transition: Transition };
  motion?: TokenMotion;
};

/**
 * The 15×15 board as SVG (crisp at any size), classic style: framed yards with nests, white track
 * squares, coloured start squares and home columns, entrance arrows and a four-colour centre.
 * Tokens are 3D map pins that hop square by square; a captured token is knocked back to its yard
 * once the capturer lands ("Kill!"), and a token reaching home sparkles. Tokens the current player
 * can move bounce, with a pulsing ring and a big tap area; the rest dim while a choice is pending.
 * Mount it with `key={game.id}` so a new game doesn't animate from the old one.
 */
export function LudoBoard({
  state,
  turnColor,
  movableColor,
  movable,
  onMove,
  names,
  delay = 0,
  maxSize,
}: {
  state: LudoState;
  turnColor: Color | null;
  movableColor: Color | null;
  movable: number[];
  onMove: (token: number) => void;
  names: Partial<Record<Color, string>>;
  /** Hold new motion back (s), e.g. while the dice is still tumbling for the same update. */
  delay?: number;
  /** Cap the board's size (px), e.g. to fit above the chat sheet. */
  maxSize?: number;
}) {
  // What's on screen lags the game state on purpose: each update is queued and shown once the
  // previous one has finished animating, so a quick opponent (or auto-play) never makes tokens skip.
  // `plan` says how each token got to where it's shown; plans of tokens that haven't moved since
  // are kept, so their (stable) animation targets don't restart.
  const reduce = useReducedMotion();
  const [view, setView] = useState<View>(() => ({ tokens: state.tokens, plan: {} }));
  const viewRef = useRef(view);
  const queue = useRef<{ tokens: Tokens; delay: number; at: number }[]>([]);
  const lastQueued = useRef(state.tokens);
  const busyUntil = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const colorsRef = useRef(state.colors);
  colorsRef.current = state.colors;
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;

  const pump = useCallback(function pump() {
    timer.current = undefined;
    const item = queue.current.shift();
    if (!item) return;
    const cur = viewRef.current;
    let next: View;
    if (JSON.stringify(cur.tokens) === JSON.stringify(item.tokens)) next = { ...cur, tokens: item.tokens };
    else {
      const kept = Object.fromEntries(
        Object.entries(cur.plan).filter(([k]) => {
          const [c, i] = k.split("-") as [Color, string];
          return cur.tokens[c]?.[+i] === item.tokens[c]?.[+i];
        }),
      );
      // The dice delay counts from when the update arrived, not from when it's shown.
      const fresh = planMotion(cur.tokens, item.tokens, colorsRef.current, Math.max(0, item.delay - (Date.now() - item.at) / 1000));
      next = { tokens: item.tokens, plan: { ...kept, ...fresh } };
      busyUntil.current = Date.now() + (reduceRef.current ? REDUCED_S : planEnd(fresh)) * 1000;
    }
    viewRef.current = next;
    setView(next);
    if (queue.current.length) timer.current = setTimeout(pump, Math.max(0, busyUntil.current - Date.now()));
  }, []);

  useEffect(() => {
    if (state.tokens === lastQueued.current) return;
    lastQueued.current = state.tokens;
    queue.current.push({ tokens: state.tokens, delay, at: Date.now() });
    if (!timer.current) timer.current = setTimeout(pump, Math.max(0, busyUntil.current - Date.now()));
  }, [state.tokens, delay, pump]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      timer.current = undefined;
    },
    [],
  );
  const tokens = view.tokens;

  // Group tokens by square. One colour on a square: drawn as one token with a "×2" badge. Several
  // colours (a safe square): each colour shrinks to 60% in its own slot, so all stay visible.
  // Finished tokens line up small inside their colour's triangle.
  const placed = state.colors.flatMap((c) => (tokens[c] ?? []).map((p, i) => ({ c, i, p, pt: tokenPoint(c, p, i) })));
  const byCell = new Map<string, typeof placed>();
  for (const t of placed) {
    if (t.p === YARD || t.p === HOME) continue;
    const k = `${t.pt.x},${t.pt.y}`;
    byCell.set(k, [...(byCell.get(k) ?? []), t]);
  }
  const badges: { key: string; x: number; y: number; n: number; small: boolean }[] = [];
  const spot = new Map<string, { x: number; y: number; scale: number }>();
  for (const [k, group] of byCell) {
    const colors = [...new Set(group.map((t) => t.c))];
    const { pt } = group[0];
    colors.forEach((c, slot) => {
      const shift = colors.length === 1 ? { x: 0, y: 0 } : SLOTS[colors.length === 2 ? 0 : 1][slot];
      const at = { x: pt.x + shift.x, y: pt.y + shift.y, scale: colors.length === 1 ? 1 : 0.56 };
      const mine = group.filter((t) => t.c === c);
      for (const t of mine) spot.set(`${t.c}-${t.i}`, at);
      if (mine.length > 1) badges.push({ key: `${k}-${c}`, n: mine.length, small: colors.length > 1, x: at.x + (colors.length > 1 ? 0.17 : 0.3), y: at.y - (colors.length > 1 ? 0.2 : 0.3) });
    });
  }
  const homeCount = Object.fromEntries(state.colors.map((c) => [c, (tokens[c] ?? []).filter((p) => p === HOME).length])) as Record<Color, number>;
  for (const c of state.colors) {
    let k = 0;
    (tokens[c] ?? []).forEach((p, i) => p === HOME && spot.set(`${c}-${i}`, { ...HOME_ROW[c](k++, homeCount[c]), scale: 0.5 }));
  }

  // Animation targets, rebuilt only when positions change (stable objects, so re-renders never restart a hop).
  const layout = placed.map((t) => {
    const at = spot.get(`${t.c}-${t.i}`) ?? { ...t.pt, scale: 1 };
    return { key: `${t.c}-${t.i}`, x: at.x, y: at.y, scale: at.scale, pt: t.pt };
  });
  const scaleOf = Object.fromEntries(layout.map((l) => [l.key, l.scale]));
  const layoutKey = JSON.stringify(layout);
  // Everything animates transforms only (translate/scale of HTML layers above the static board, in %
  // of a one-cell box), so the browser never repaints the board and it stays smooth on slow phones.
  const targets = useMemo(() => {
    const out: Record<string, Target> = {};
    for (const l of layout) {
      const m = view.plan[l.key];
      const end = m?.kind === "hop" ? m.path.at(-1) : m?.to;
      if (!m || !end || end.x !== l.pt.x || end.y !== l.pt.y) {
        out[l.key] = { animate: { x: pc(l.x), y: pc(l.y), scale: l.scale }, transition: SPRING };
      } else if (reduce) {
        // Reduced motion: no hops, just fade in at the new square.
        out[l.key] = { animate: { x: pc(l.x), y: pc(l.y), scale: l.scale, opacity: [0.15, 1] }, transition: { duration: 0, opacity: { duration: REDUCED_S, delay: m.delay } }, motion: m };
      } else if (m.kind === "hop") {
        // One square per HOP_S, easing in and out of each square, with an arc up and down (y) and a
        // little lift (scale) mid-air; a squash on landing. Out of the yard: a higher pop.
        const n = m.path.length - 1;
        const pop = m.fromYard;
        const lift = pop ? 0.9 : 0.38;
        const xs = m.path.map((p, k) => (k === n ? l.x : p.x));
        const ys: number[] = [];
        const sc: number[] = [];
        m.path.forEach((p, k) => {
          if (k > 0) {
            const q = m.path[k - 1];
            // Into home: a flat glide (no arc) while it shrinks into place.
            const glide = m.toHome && k === n;
            ys.push((p.y + q.y) / 2 - (glide ? 0 : lift));
            sc.push(glide ? (1 + l.scale) / 2 : pop ? 1.35 : 1.15);
          }
          ys.push(k === n ? l.y : p.y);
          sc.push(k === n ? l.scale : 1);
        });
        const duration = n * HOP_S;
        out[l.key] = {
          animate: { x: xs.map(pc), y: ys.map(pc), scale: sc },
          transition: {
            delay: m.delay,
            x: { duration, ease: "easeInOut", delay: m.delay },
            y: { duration, ease: ys.slice(1).map((_, k) => (k % 2 ? "easeIn" : "easeOut")), delay: m.delay },
            scale: { duration, ease: "easeInOut", delay: m.delay },
          },
          squash: {
            animate: { scaleX: [1, 1.18, 0.94, 1], scaleY: [1, 0.8, 1.06, 1] },
            transition: { duration: 0.28, delay: m.delay + duration - 0.02, ease: "easeOut" },
          },
          motion: m,
        };
      } else {
        // Captured: slides smoothly back to its nest once the attacker has landed.
        out[l.key] = {
          animate: { x: [pc(m.from.x), pc(l.x)], y: [pc(m.from.y), pc(l.y)], scale: [1, 0.85, l.scale] },
          transition: { duration: KNOCK_S, ease: "easeInOut", delay: m.delay },
          motion: m,
        };
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutKey stands for `layout`
  }, [layoutKey, view.plan, reduce]);
  // Tokens on the move (and the ones you can move) are drawn on top of the others.
  const rank = (t: (typeof placed)[number]) =>
    targets[`${t.c}-${t.i}`]?.motion?.kind === "hop" ? 3 : t.c === movableColor && movable.includes(t.i) ? 2 : 1;
  const choosing = movableColor !== null && movable.length > 0;
  const plan = Object.entries(view.plan);

  return (
    <div
      className="relative mx-auto aspect-square w-full touch-manipulation select-none rounded-[3%] shadow-xl [container-type:inline-size]"
      style={maxSize ? { maxWidth: maxSize } : undefined}
    >
      {/* The board itself never changes (it's drawn once); everything that moves is in the layer above. */}
      <StaticBoard />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* The current player's yard glows. */}
        {turnColor && (
          <motion.div
            key={turnColor}
            className="absolute rounded-[7%] border-white"
            style={{ ...box(YARD_ORIGIN[turnColor].x + 0.25, YARD_ORIGIN[turnColor].y + 0.25, 5.5), borderWidth: `${(0.22 / VS) * 100}cqw` }}
            animate={{ opacity: [0.95, 0.25, 0.95] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
        {placed.map((t) => {
          const key = `${t.c}-${t.i}`;
          const target = targets[key];
          const m = target?.motion;
          const canMove = t.c === movableColor && movable.includes(t.i);
          const scale = scaleOf[key] ?? 1;
          return (
            <motion.div
              key={key}
              data-token={key}
              data-pos={t.p}
              data-motion={m?.kind}
              data-movable={canMove || undefined}
              className="absolute will-change-transform"
              style={{ ...CELL, zIndex: rank(t), opacity: choosing && !canMove && t.p !== HOME ? 0.5 : 1, cursor: canMove ? "pointer" : "default" }}
              initial={false}
              animate={target?.animate}
              transition={target?.transition}
              onClick={canMove ? () => onMove(t.i) : undefined}
            >
              {t.p === HOME && (
                // Home: a warm glow that flares up as the token arrives, then breathes.
                <motion.div
                  className="absolute -inset-[12%] rounded-full bg-[radial-gradient(circle,#fde047_0%,#fde04799_45%,transparent_70%)]"
                  initial={m?.kind === "hop" && m.toHome ? { opacity: 0 } : false}
                  animate={{ opacity: [0.95, 0.45, 0.95] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: m?.kind === "hop" ? m.delay + (m.path.length - 1) * HOP_S : 0 }}
                />
              )}
              {canMove && (
                <>
                  <motion.svg
                    viewBox="-0.5 -0.5 1 1"
                    className="absolute inset-0 h-full w-full overflow-visible"
                    animate={{ scale: [0.85, 1.2, 0.85], opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <circle r={0.46} fill="none" stroke="white" strokeWidth={0.1} />
                    <circle r={0.46} fill="none" stroke={EDGE} strokeWidth={0.04} />
                  </motion.svg>
                  {/* Big invisible tap area (≥ 40 px on a phone, whatever the token's size). On a mixed
                      stack your own movable token is drawn on top, so a tap there picks yours. */}
                  <span
                    className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ width: `${180 / scale}%`, height: `${180 / scale}%` }}
                  />
                </>
              )}
              <motion.div
                className="absolute inset-0"
                animate={canMove ? { y: ["0%", "-12%", "0%"] } : { y: "0%" }}
                transition={canMove ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
              >
                {/* Landing squash, around the pin's tip. */}
                <motion.div className="absolute inset-0" animate={target?.squash?.animate ?? REST} transition={target?.squash?.transition} style={{ originY: 0.95 }}>
                  <Pin c={t.c} />
                </motion.div>
              </motion.div>
            </motion.div>
          );
        })}
        {badges.map((b) => (
          <span
            key={b.key}
            className="absolute z-10 grid place-items-center rounded-full border-white bg-[#1f2433] font-extrabold leading-none text-white"
            style={{ ...box(b.x - (b.small ? 0.13 : 0.2), b.y - (b.small ? 0.13 : 0.2), b.small ? 0.26 : 0.4), borderWidth: "0.25cqw", fontSize: `${b.small ? 1.05 : 1.5}cqw` }}
          >
            ×{b.n}
          </span>
        ))}
        {/* Finished count in each colour's triangle. */}
        {state.colors.map(
          (c) =>
            homeCount[c] > 0 && (
              <span
                key={`home-${c}`}
                className="absolute z-10 grid place-items-center font-extrabold leading-none text-white"
                style={{ ...box(HOME_LABEL[c].x - 0.5, HOME_LABEL[c].y - 0.5, 1), fontSize: "2.1cqw", textShadow: `0 0 2px ${COLOR_DARK[c]}, 0 0 2px ${COLOR_DARK[c]}, 0 0 3px ${COLOR_DARK[c]}` }}
              >
                {homeCount[c]}/4
              </span>
            ),
        )}
        {plan.map(([k, m]) =>
          m.kind === "knock" ? (
            // Capture: a burst and "Kill!" where the token was hit, as the attacker lands.
            <div key={`kill-${k}-${m.from.x}-${m.from.y}`} className="absolute z-20" style={{ ...CELL, transform: `translate(${pc(m.from.x)}, ${pc(m.from.y)})` }}>
              <motion.svg
                viewBox="-0.5 -0.5 1 1"
                className="absolute inset-0 h-full w-full overflow-visible"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0.6, 3.2], opacity: [1, 0] }}
                transition={{ duration: 0.5, delay: m.delay, ease: "easeOut" }}
              >
                <circle r={0.45} fill="none" stroke="#f97316" strokeWidth={0.1} />
              </motion.svg>
              <motion.span
                className="absolute left-1/2 top-[-90%] -translate-x-1/2 whitespace-nowrap font-black leading-none text-white"
                style={{ fontSize: "6cqw", WebkitTextStroke: "0.5cqw #dc2626", paintOrder: "stroke fill" }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.25, 1, 1] }}
                transition={{ duration: 1.1, delay: m.delay, times: [0, 0.2, 0.75, 1] }}
              >
                Kill!
              </motion.span>
            </div>
          ) : m.toHome ? (
            // Home: sparkles burst out of the centre.
            <div key={`spark-${k}`} className="absolute z-20" style={{ ...CELL, transform: `translate(${pc(7.5)}, ${pc(7.5)})` }}>
              {Array.from({ length: 10 }, (_, j) => {
                const a = (j / 10) * Math.PI * 2;
                return (
                  <motion.svg
                    key={j}
                    viewBox="-0.5 -0.5 1 1"
                    className="absolute inset-[20%] overflow-visible"
                    initial={{ x: "0%", y: "0%", opacity: 0, scale: 0.4 }}
                    animate={{ x: `${Math.cos(a) * 300}%`, y: `${Math.sin(a) * 300}%`, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
                    transition={{ duration: 0.8, delay: m.delay + (m.path.length - 1) * HOP_S, ease: "easeOut" }}
                  >
                    <polygon points={starPoints({ x: 0, y: 0 }, 0.45, 0.18)} fill={j % 2 ? "#fde047" : "#ffffff"} stroke="#f59e0b" strokeWidth={0.06} />
                  </motion.svg>
                );
              })}
            </div>
          ) : null,
        )}
      </div>
      <p className="sr-only">
        {state.colors
          .map((c) => `${names[c] ?? c} (${c}): ${(state.tokens[c] ?? []).map((p) => describe(c, p)).join(", ")}`)
          .join(". ")}
      </p>
    </div>
  );
}

/** A 3D-looking map pin (fills a one-cell box): soft shadow, base ring, shaded body, white cap with a highlight. */
const Pin = memo(function Pin({ c }: { c: Color }) {
  return (
    <svg viewBox="-0.5 -0.5 1 1" className="absolute inset-0 h-full w-full overflow-visible">
      {/* Fits inside its square: about one cell tall in all, tip near the bottom-centre. */}
      <g transform="translate(0 0.04) scale(1.08)">
        <ellipse cx={0} cy={0.33} rx={0.27} ry={0.08} fill="#000" opacity={0.3} />
        <ellipse cx={0} cy={0.29} rx={0.19} ry={0.07} fill={COLOR_DARK[c]} stroke="white" strokeWidth={0.04} />
        <path d={PIN} fill={`url(#pin-${c})`} stroke={COLOR_DARK[c]} strokeWidth={0.04} />
        <circle cx={0} cy={-0.2} r={0.13} fill="white" />
        <circle cx={0} cy={-0.2} r={0.06} fill={COLOR_HEX[c]} />
        <ellipse cx={-0.13} cy={-0.33} rx={0.07} ry={0.045} fill="white" opacity={0.75} transform="rotate(-30 -0.13 -0.33)" />
      </g>
    </svg>
  );
});

/** Slots inside a square for several colours: two side by side, or a 2×2 grid. */
const SLOTS: Pt[][] = [
  [{ x: -0.24, y: 0 }, { x: 0.24, y: 0 }],
  [{ x: -0.24, y: -0.22 }, { x: 0.24, y: -0.22 }, { x: -0.24, y: 0.24 }, { x: 0.24, y: 0.24 }],
];

/** Finished tokens: the k-th of n, in a row centred inside the colour's triangle. */
const HOME_ROW: Record<Color, (k: number, n: number) => Pt> = {
  red: (k, n) => ({ x: 6.42, y: 7.5 + (k - (n - 1) / 2) * 0.42 }),
  green: (k, n) => ({ x: 7.5 + (k - (n - 1) / 2) * 0.42, y: 6.42 }),
  yellow: (k, n) => ({ x: 8.58, y: 7.5 + (k - (n - 1) / 2) * 0.42 }),
  blue: (k, n) => ({ x: 7.5 + (k - (n - 1) / 2) * 0.42, y: 8.58 }),
};
const HOME_LABEL: Record<Color, Pt> = { red: { x: 7, y: 7.5 }, green: { x: 7.5, y: 7.02 }, yellow: { x: 8, y: 7.5 }, blue: { x: 7.5, y: 8.02 } };

export function describe(c: Color, p: number): string {
  if (p === YARD) return "in the yard";
  if (p === HOME) return "home";
  if (p > LAST_LOOP) return `${p - LAST_LOOP} into the home column`;
  return `square ${((START[c] + p) % 52) + 1}`;
}

function starPoints(at: Pt, outer: number, inner: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${at.x + r * Math.cos(a)},${at.y + r * Math.sin(a)}`;
  }).join(" ");
}

/**
 * Everything that doesn't move, drawn once (memoised, no props, nothing animated inside), plus the
 * token gradients the pins use.
 */
const StaticBoard = memo(function StaticBoard() {
  const startOf = new Map(COLORS.map((c) => [START[c], c]));
  const entrance = new Map(COLORS.map((c) => [(START[c] + LAST_LOOP) % 52, c]));
  return (
    <svg viewBox={`${V0} ${V0} ${VS} ${VS}`} className="absolute inset-0 h-full w-full" role="img" aria-label="Ludo board">
      <defs>
        {COLORS.map((c) => (
          <radialGradient key={c} id={`pin-${c}`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor={COLOR_LIGHT[c]} />
            <stop offset="0.5" stopColor={COLOR_HEX[c]} />
            <stop offset="1" stopColor={COLOR_DARK[c]} />
          </radialGradient>
        ))}
      </defs>
      <rect x={-0.36} y={-0.36} width={15.72} height={15.72} rx={0.5} fill={SQUARE} stroke={EDGE} strokeWidth={0.12} />
      {/* Track squares: white, grey grid lines; start squares in their colour (safe: white star). */}
      {LOOP.map((p, i) => {
        const startColor = startOf.get(i);
        return (
          <rect
            key={i}
            x={p.x - 0.5}
            y={p.y - 0.5}
            width={1}
            height={1}
            fill={startColor ? COLOR_HEX[startColor] : SQUARE}
            stroke={LINE}
            strokeWidth={0.035}
          />
        );
      })}
      {SAFE_SQUARES.map((s) => {
        const start = startOf.has(s);
        return (
          <polygon
            key={s}
            points={starPoints(LOOP[s], 0.36, 0.16)}
            fill="none"
            stroke={start ? "white" : STAR}
            strokeWidth={0.06}
            strokeLinejoin="round"
          />
        );
      })}
      {COLORS.map((c) =>
        HOME_COLUMN[c].map((p, i) => (
          <rect key={`${c}${i}`} x={p.x - 0.5} y={p.y - 0.5} width={1} height={1} fill={COLOR_HEX[c]} stroke={LINE} strokeWidth={0.035} />
        )),
      )}
      {/* Arrows at each home column's entrance (→ ↓ ← ↑). */}
      {[...entrance].map(([sq, c]) => {
        const p = LOOP[sq];
        return (
          <polygon
            key={`arrow-${c}`}
            points="-0.3,-0.12 0.08,-0.12 0.08,-0.28 0.34,0 0.08,0.28 0.08,0.12 -0.3,0.12"
            fill={COLOR_HEX[c]}
            stroke={COLOR_DARK[c]}
            strokeWidth={0.03}
            transform={`translate(${p.x} ${p.y}) rotate(${ARROW[c]})`}
          />
        );
      })}
      {/* Yards: thick coloured frame, white inner square, four nests. */}
      {COLORS.map((c) => {
        const o = YARD_ORIGIN[c];
        return (
          <g key={c}>
            <rect x={o.x} y={o.y} width={6} height={6} fill={COLOR_HEX[c]} stroke={EDGE} strokeWidth={0.04} />
            <rect x={o.x + 0.9} y={o.y + 0.9} width={4.2} height={4.2} rx={0.3} fill={SQUARE} stroke={COLOR_DARK[c]} strokeWidth={0.06} />
            {[0, 1, 2, 3].map((i) => {
              const pt = tokenPoint(c, YARD, i);
              return (
                // Nests are faint rings, so only real tokens look solid (an empty yard looks empty).
                <circle key={i} cx={pt.x} cy={pt.y} r={0.62} fill="none" stroke={COLOR_HEX[c]} strokeOpacity={0.45} strokeWidth={0.09} />
              );
            })}
          </g>
        );
      })}
      {/* Centre home: four triangles in the yard colours. */}
      <polygon points="6,6 6,9 7.5,7.5" fill={COLOR_HEX.red} stroke={EDGE} strokeWidth={0.04} />
      <polygon points="6,6 9,6 7.5,7.5" fill={COLOR_HEX.green} stroke={EDGE} strokeWidth={0.04} />
      <polygon points="9,6 9,9 7.5,7.5" fill={COLOR_HEX.yellow} stroke={EDGE} strokeWidth={0.04} />
      <polygon points="6,9 9,9 7.5,7.5" fill={COLOR_HEX.blue} stroke={EDGE} strokeWidth={0.04} />
    </svg>
  );
});
