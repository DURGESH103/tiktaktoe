"use client";

import { motion, type TargetAndTransition, type Transition } from "framer-motion";
import { memo, useMemo, useState } from "react";
import { HOME, LAST_LOOP, SAFE_SQUARES, START, YARD, type Color, type LudoState } from "../engine";
import { COLOR_DARK, COLOR_HEX, COLOR_LIGHT, HOME_COLUMN, LOOP, tokenPoint, YARD_ORIGIN, type Pt } from "../lib/board";
import { HOP_S, KNOCK_S, planMotion, type TokenMotion } from "../lib/motion";

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
  // How tokens got here from the previous state. Derived during render (only when the tokens change);
  // plans of tokens that haven't moved since are kept, so a hop already under way isn't cut short.
  const [track, setTrack] = useState(() => ({ tokens: state.tokens, plan: {} as Record<string, TokenMotion> }));
  if (track.tokens !== state.tokens) {
    if (JSON.stringify(track.tokens) === JSON.stringify(state.tokens)) setTrack({ ...track, tokens: state.tokens });
    else {
      const kept = Object.fromEntries(
        Object.entries(track.plan).filter(([k]) => {
          const [c, i] = k.split("-") as [Color, string];
          return track.tokens[c]?.[+i] === state.tokens[c]?.[+i];
        }),
      );
      setTrack({ tokens: state.tokens, plan: { ...kept, ...planMotion(track.tokens, state.tokens, state.colors, delay) } });
    }
  }

  // Group tokens by square so several on one square are all visible (smaller, offset, "×3" badge).
  const placed = state.colors.flatMap((c) => (state.tokens[c] ?? []).map((p, i) => ({ c, i, p, pt: tokenPoint(c, p, i) })));
  const byCell = new Map<string, typeof placed>();
  for (const t of placed) {
    const k = `${t.pt.x},${t.pt.y}`;
    byCell.set(k, [...(byCell.get(k) ?? []), t]);
  }
  const stacks = [...byCell.values()].filter((g) => g.length > 2 && g[0].p !== YARD);

  // Animation targets, rebuilt only when positions change (stable objects, so re-renders never restart a hop).
  const layout = placed.map((t) => {
    const group = byCell.get(`${t.pt.x},${t.pt.y}`)!;
    const n = group.length;
    const shift = n > 1 && t.p !== YARD ? offset(group.indexOf(t), n) : { x: 0, y: 0 };
    return { key: `${t.c}-${t.i}`, x: t.pt.x + shift.x, y: t.pt.y + shift.y, scale: n > 1 && t.p !== YARD ? 0.7 : 1, pt: t.pt };
  });
  const layoutKey = JSON.stringify(layout);
  const targets = useMemo(() => {
    const out: Record<string, { animate: TargetAndTransition; transition: Transition; motion?: TokenMotion }> = {};
    for (const l of layout) {
      const m = track.plan[l.key];
      const end = m?.kind === "hop" ? m.path.at(-1) : m?.to;
      if (!m || !end || end.x !== l.pt.x || end.y !== l.pt.y) {
        out[l.key] = { animate: { x: l.x, y: l.y, scale: l.scale }, transition: SPRING };
      } else if (m.kind === "hop") {
        // Square, lifted midpoint, square, …: the token rises and drops on every square.
        const xs: number[] = [];
        const ys: number[] = [];
        const sc: number[] = [];
        m.path.forEach((p, k) => {
          const last = k === m.path.length - 1;
          if (k > 0) {
            const q = m.path[k - 1];
            xs.push((p.x + q.x) / 2);
            ys.push((p.y + q.y) / 2 - 0.35);
            sc.push(1.25);
          }
          xs.push(last ? l.x : p.x);
          ys.push(last ? l.y : p.y);
          sc.push(last ? l.scale : 1);
        });
        out[l.key] = { animate: { x: xs, y: ys, scale: sc }, transition: { duration: (m.path.length - 1) * HOP_S, ease: "linear", delay: m.delay }, motion: m };
      } else {
        // Knocked back: flies up and over to its yard, spinning.
        out[l.key] = {
          animate: { x: [m.from.x, (m.from.x + l.x) / 2, l.x], y: [m.from.y, Math.min(m.from.y, l.y) - 2.5, l.y], scale: [1, 1.9, 1], rotate: [0, 360, 720] },
          transition: { duration: KNOCK_S, ease: "easeOut", delay: m.delay },
          motion: m,
        };
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutKey stands for `layout`
  }, [layoutKey, track.plan]);
  // Tokens on the move (and the ones you can move) are drawn last, on top of the others.
  const rank = (t: (typeof placed)[number]) =>
    targets[`${t.c}-${t.i}`]?.motion?.kind === "hop" ? 2 : t.c === movableColor && movable.includes(t.i) ? 1 : 0;
  const order = [...placed].sort((a, b) => rank(a) - rank(b));
  const choosing = movableColor !== null && movable.length > 0;
  const plan = Object.entries(track.plan);

  return (
    <div className="mx-auto aspect-square w-full" style={maxSize ? { maxWidth: maxSize } : undefined}>
      <svg viewBox="-0.12 -0.12 15.24 15.24" className="h-full w-full touch-manipulation select-none drop-shadow-xl" role="img" aria-label="Ludo board">
        <defs>
          {COLORS.map((c) => (
            <radialGradient key={c} id={`pin-${c}`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor={COLOR_LIGHT[c]} />
              <stop offset="0.5" stopColor={COLOR_HEX[c]} />
              <stop offset="1" stopColor={COLOR_DARK[c]} />
            </radialGradient>
          ))}
        </defs>
        <StaticBoard turnColor={turnColor} />
        {order.map((t) => {
          const key = `${t.c}-${t.i}`;
          const target = targets[key];
          const m = target?.motion;
          const canMove = t.c === movableColor && movable.includes(t.i);
          return (
            <motion.g
              key={key}
              data-token={key}
              data-pos={t.p}
              data-motion={m?.kind}
              data-movable={canMove || undefined}
              initial={false}
              animate={target?.animate}
              transition={target?.transition}
              onClick={canMove ? () => onMove(t.i) : undefined}
              style={{ cursor: canMove ? "pointer" : "default" }}
              opacity={choosing && !canMove ? 0.5 : 1}
              aria-hidden
            >
              {t.p === HOME && (
                // Home: a warm glow that flares up as the token arrives, then breathes.
                <motion.circle
                  r={0.62}
                  fill="#fde047"
                  initial={m?.kind === "hop" && m.toHome ? { opacity: 0 } : false}
                  animate={{ opacity: [0.85, 0.35, 0.85] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: m?.kind === "hop" ? m.delay + (m.path.length - 1) * HOP_S : 0 }}
                />
              )}
              {canMove && (
                <>
                  <motion.circle
                    r={0.5}
                    fill="none"
                    stroke="white"
                    strokeWidth={0.1}
                    animate={{ scale: [0.85, 1.2, 0.85], opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <motion.circle
                    r={0.5}
                    fill="none"
                    stroke={EDGE}
                    strokeWidth={0.05}
                    animate={{ scale: [0.85, 1.2, 0.85], opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  {/* Big invisible tap area (≥ 40 px on a phone) for fingers. */}
                  <circle r={0.9} fill="transparent" />
                </>
              )}
              <motion.g animate={canMove ? { y: [0, -0.2, 0] } : { y: 0 }} transition={canMove ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}>
                <Pin c={t.c} />
              </motion.g>
            </motion.g>
          );
        })}
        {stacks.map((g) => {
          const pt = g[0].pt;
          return (
            <g key={`stack-${pt.x}-${pt.y}`} transform={`translate(${pt.x + 0.34} ${pt.y - 0.42})`} aria-hidden pointerEvents="none">
              <circle r={0.26} fill={EDGE} stroke="white" strokeWidth={0.05} />
              <text y={0.09} textAnchor="middle" fontSize={0.26} fontWeight={800} fill="white">
                ×{g.length}
              </text>
            </g>
          );
        })}
        {/* Capture: a burst and "Kill!" where the token was hit, as the capturer lands. */}
        {plan.map(([k, m]) =>
          m.kind === "knock" ? (
            <g key={`kill-${k}-${m.from.x}-${m.from.y}`} transform={`translate(${m.from.x} ${m.from.y})`} pointerEvents="none" aria-hidden>
              <motion.circle
                fill="none"
                stroke="#f97316"
                strokeWidth={0.16}
                initial={{ r: 0.2, opacity: 0 }}
                animate={{ r: [0.3, 1.6], opacity: [1, 0] }}
                transition={{ duration: 0.5, delay: m.delay, ease: "easeOut" }}
              />
              <motion.text
                y={-0.7}
                textAnchor="middle"
                fontSize={0.95}
                fontWeight={900}
                fill="#fff"
                stroke="#dc2626"
                strokeWidth={0.12}
                paintOrder="stroke"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.25, 1, 1] }}
                transition={{ duration: 1.1, delay: m.delay, times: [0, 0.2, 0.75, 1] }}
              >
                Kill!
              </motion.text>
            </g>
          ) : m.toHome ? (
            // Home: sparkles burst out of the centre.
            <g key={`spark-${k}`} transform="translate(7.5 7.5)" pointerEvents="none" aria-hidden>
              {Array.from({ length: 10 }, (_, j) => {
                const a = (j / 10) * Math.PI * 2;
                return (
                  <motion.polygon
                    key={j}
                    points={starPoints({ x: 0, y: 0 }, 0.22, 0.09)}
                    fill={j % 2 ? "#fde047" : "#ffffff"}
                    stroke="#f59e0b"
                    strokeWidth={0.03}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                    animate={{ x: Math.cos(a) * 1.8, y: Math.sin(a) * 1.8, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
                    transition={{ duration: 0.8, delay: m.delay + (m.path.length - 1) * HOP_S, ease: "easeOut" }}
                  />
                );
              })}
            </g>
          ) : null,
        )}
      </svg>
      <p className="sr-only">
        {state.colors
          .map((c) => `${names[c] ?? c} (${c}): ${(state.tokens[c] ?? []).map((p) => describe(c, p)).join(", ")}`)
          .join(". ")}
      </p>
    </div>
  );
}

/** A 3D-looking map pin: soft shadow, base ring, shaded body, white cap with a highlight. */
const Pin = memo(function Pin({ c }: { c: Color }) {
  return (
    <g transform="scale(1.3)">
      <ellipse cx={0} cy={0.33} rx={0.27} ry={0.09} fill="#000" opacity={0.3} />
      <ellipse cx={0} cy={0.29} rx={0.19} ry={0.07} fill={COLOR_DARK[c]} stroke="white" strokeWidth={0.04} />
      <path d={PIN} fill={`url(#pin-${c})`} stroke={COLOR_DARK[c]} strokeWidth={0.04} />
      <circle cx={0} cy={-0.2} r={0.13} fill="white" />
      <circle cx={0} cy={-0.2} r={0.06} fill={COLOR_HEX[c]} />
      <ellipse cx={-0.13} cy={-0.33} rx={0.07} ry={0.045} fill="white" opacity={0.75} transform="rotate(-30 -0.13 -0.33)" />
    </g>
  );
});

/** Spread up to 4 tokens sharing a square. */
function offset(k: number, n: number): Pt {
  const d = 0.2;
  const spots: Pt[][] = [[], [{ x: 0, y: 0 }], [{ x: -d, y: 0 }, { x: d, y: 0 }], [{ x: -d, y: -d }, { x: d, y: -d }, { x: 0, y: d }]];
  const four = [{ x: -d, y: -d }, { x: d, y: -d }, { x: -d, y: d }, { x: d, y: d }];
  return (n <= 3 ? spots[n] : four)[k % 4] ?? { x: 0, y: 0 };
}

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

/** Everything that doesn't move. Memoised: it only re-renders when the turn changes (yard glow). */
const StaticBoard = memo(function StaticBoard({ turnColor }: { turnColor: Color | null }) {
  const startOf = new Map(COLORS.map((c) => [START[c], c]));
  const entrance = new Map(COLORS.map((c) => [(START[c] + LAST_LOOP) % 52, c]));
  return (
    <g>
      <rect x={-0.06} y={-0.06} width={15.12} height={15.12} rx={0.35} fill={SQUARE} stroke={EDGE} strokeWidth={0.12} />
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
      {/* Yards: thick coloured frame, white inner square, four coloured nests. The current player's glows. */}
      {COLORS.map((c) => {
        const o = YARD_ORIGIN[c];
        const on = c === turnColor;
        return (
          <g key={c}>
            <rect x={o.x} y={o.y} width={6} height={6} fill={COLOR_HEX[c]} stroke={EDGE} strokeWidth={0.04} />
            <rect x={o.x + 0.9} y={o.y + 0.9} width={4.2} height={4.2} rx={0.3} fill={SQUARE} stroke={COLOR_DARK[c]} strokeWidth={0.06} />
            {on && (
              <motion.rect
                x={o.x + 0.25}
                y={o.y + 0.25}
                width={5.5}
                height={5.5}
                rx={0.4}
                fill="none"
                stroke="white"
                strokeWidth={0.22}
                animate={{ opacity: [0.95, 0.25, 0.95] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
            {[0, 1, 2, 3].map((i) => {
              const pt = tokenPoint(c, YARD, i);
              return (
                <g key={i}>
                  <circle cx={pt.x} cy={pt.y} r={0.68} fill={COLOR_HEX[c]} stroke={COLOR_DARK[c]} strokeWidth={0.06} />
                  <circle cx={pt.x} cy={pt.y} r={0.5} fill="none" stroke="white" strokeOpacity={0.45} strokeWidth={0.05} />
                </g>
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
    </g>
  );
});
