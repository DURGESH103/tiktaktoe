"use client";

import { motion, type TargetAndTransition, type Transition } from "framer-motion";
import { memo, useMemo, useState } from "react";
import { HOME, LAST_LOOP, SAFE_SQUARES, START, YARD, type Color, type LudoState } from "../engine";
import { COLOR_HEX, HOME_COLUMN, LOOP, tokenPoint, YARD_ORIGIN, type Pt } from "../lib/board";
import { HOP_S, KNOCK_S, planMotion, type TokenMotion } from "../lib/motion";

const R = 0.36; // token radius (cells)

// The board keeps its own palette in both themes, like a real board (light squares, grey lines).
const BOARD_BG = "#f8fafc";
const SQUARE = "#ffffff";
const LINE = "#cbd5e1";
const STAR = "#94a3b8";
const RING = "#111827";

const SPRING: Transition = { type: "spring", stiffness: 260, damping: 26 };

/**
 * The 15×15 board as SVG (crisp at any size). Tokens hop square by square along the track, a captured
 * token is knocked back to its yard once the capturer lands, and tokens that reach home glow. The ones
 * the current player can move pulse and are tappable. `movable` = token indexes of `movableColor`.
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

  // Group tokens by square so several on one square are drawn side by side.
  const placed = state.colors.flatMap((c) => (state.tokens[c] ?? []).map((p, i) => ({ c, i, p, pt: tokenPoint(c, p, i) })));
  const byCell = new Map<string, typeof placed>();
  for (const t of placed) {
    const k = `${t.pt.x},${t.pt.y}`;
    byCell.set(k, [...(byCell.get(k) ?? []), t]);
  }

  // Animation targets, rebuilt only when positions change (stable objects, so re-renders never restart a hop).
  const layout = placed.map((t) => {
    const group = byCell.get(`${t.pt.x},${t.pt.y}`)!;
    const n = group.length;
    const shift = n > 1 && t.p !== YARD ? offset(group.indexOf(t), n) : { x: 0, y: 0 };
    return { key: `${t.c}-${t.i}`, x: t.pt.x + shift.x, y: t.pt.y + shift.y, scale: n > 1 && t.p !== YARD ? 0.72 : 1, pt: t.pt };
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
            ys.push((p.y + q.y) / 2 - 0.3);
            sc.push(1.3);
          }
          xs.push(last ? l.x : p.x);
          ys.push(last ? l.y : p.y);
          sc.push(last ? l.scale : 1);
        });
        out[l.key] = { animate: { x: xs, y: ys, scale: sc }, transition: { duration: (m.path.length - 1) * HOP_S, ease: "linear", delay: m.delay }, motion: m };
      } else {
        // Knocked back: flies up and over to its yard.
        out[l.key] = {
          animate: { x: [m.from.x, (m.from.x + l.x) / 2, l.x], y: [m.from.y, Math.min(m.from.y, l.y) - 2, l.y], scale: [1, 1.8, 1] },
          transition: { duration: KNOCK_S, ease: "easeOut", delay: m.delay },
          motion: m,
        };
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutKey stands for `layout`
  }, [layoutKey, track.plan]);
  // Tokens on the move are drawn last, on top of the others.
  const hopping = (t: (typeof placed)[number]) => Number(targets[`${t.c}-${t.i}`]?.motion?.kind === "hop");
  const order = [...placed].sort((a, b) => hopping(a) - hopping(b));
  const bursts = Object.entries(track.plan).filter((e): e is [string, Extract<TokenMotion, { kind: "knock" }>] => e[1].kind === "knock");

  return (
    <div className="mx-auto aspect-square w-full max-w-[min(94vw,30rem)]" style={maxSize ? { maxWidth: maxSize } : undefined}>
      <svg viewBox="0 0 15 15" className="h-full w-full touch-manipulation select-none rounded-3xl shadow-xl" role="img" aria-label="Ludo board">
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
              initial={false}
              animate={target?.animate}
              transition={target?.transition}
              onClick={canMove ? () => onMove(t.i) : undefined}
              style={{ cursor: canMove ? "pointer" : "default" }}
              aria-hidden
            >
              {canMove && (
                <motion.circle
                  r={R + 0.12}
                  fill="none"
                  stroke={RING}
                  strokeWidth={0.09}
                  animate={{ scale: [1, 1.25, 1], opacity: [0.9, 0.3, 0.9] }}
                  transition={{ duration: 1.1, repeat: Infinity }}
                />
              )}
              {/* Bigger invisible hit area (≈ a whole cell) for fingers. */}
              {canMove && <circle r={0.55} fill="transparent" />}
              <circle r={R} fill={COLOR_HEX[t.c]} stroke="white" strokeWidth={0.07} />
              <circle r={R * 0.42} fill="white" fillOpacity={0.55} />
              {t.p === HOME && (
                // Home: a warm glow that flares up as the token arrives, then breathes.
                <motion.circle
                  r={R + 0.3}
                  fill="#fde047"
                  initial={m?.kind === "hop" && m.toHome ? { opacity: 0 } : false}
                  animate={{ opacity: [0.85, 0.4, 0.85] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: m?.kind === "hop" ? m.delay + (m.path.length - 1) * HOP_S : 0 }}
                />
              )}
              {t.p === HOME && <circle r={R + 0.06} fill="none" stroke="#fde68a" strokeWidth={0.06} />}
            </motion.g>
          );
        })}
        {/* Capture: a burst where the token was hit, as the capturer lands. */}
        {bursts.map(([k, b]) => (
          <motion.circle
            key={`burst-${k}-${b.from.x}-${b.from.y}`}
            cx={b.from.x}
            cy={b.from.y}
            fill="none"
            stroke="#f97316"
            strokeWidth={0.14}
            initial={{ r: 0.2, opacity: 0 }}
            animate={{ r: [0.3, 1.5], opacity: [1, 0] }}
            transition={{ duration: 0.5, delay: b.delay, ease: "easeOut" }}
            aria-hidden
          />
        ))}
      </svg>
      <p className="sr-only">
        {state.colors
          .map((c) => `${names[c] ?? c} (${c}): ${(state.tokens[c] ?? []).map((p) => describe(c, p)).join(", ")}`)
          .join(". ")}
      </p>
    </div>
  );
}

/** Spread up to 4 tokens sharing a square. */
function offset(k: number, n: number): Pt {
  const d = 0.22;
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

/** Everything that doesn't move. Memoised: it only re-renders when the turn changes (corner glow). */
const StaticBoard = memo(function StaticBoard({ turnColor }: { turnColor: Color | null }) {
  const colors = ["red", "green", "yellow", "blue"] as const;
  const startOf = new Map(colors.map((c) => [START[c], c]));
  return (
    <g>
      <rect width={15} height={15} rx={0.6} fill={BOARD_BG} />
      {/* Track squares */}
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
            fillOpacity={startColor ? 0.85 : 1}
            stroke={LINE}
            strokeWidth={0.03}
          />
        );
      })}
      {SAFE_SQUARES.filter((s) => !startOf.has(s)).map((s) => (
        <Star key={s} at={LOOP[s]} />
      ))}
      {colors.map((c) =>
        HOME_COLUMN[c].map((p, i) => (
          <rect key={`${c}${i}`} x={p.x - 0.5} y={p.y - 0.5} width={1} height={1} fill={COLOR_HEX[c]} fillOpacity={0.75} stroke={LINE} strokeWidth={0.03} />
        )),
      )}
      {/* Yards (the current player's corner glows) */}
      {colors.map((c) => {
        const o = YARD_ORIGIN[c];
        const on = c === turnColor;
        return (
          <g key={c}>
            <rect x={o.x + 0.1} y={o.y + 0.1} width={5.8} height={5.8} rx={0.6} fill={COLOR_HEX[c]} />
            {on && (
              <motion.rect
                x={o.x + 0.1}
                y={o.y + 0.1}
                width={5.8}
                height={5.8}
                rx={0.6}
                fill="none"
                stroke="white"
                strokeWidth={0.18}
                animate={{ opacity: [0.9, 0.35, 0.9] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
            <rect x={o.x + 1} y={o.y + 1} width={4} height={4} rx={0.5} fill={SQUARE} />
            {[0, 1, 2, 3].map((i) => {
              const pt = tokenPoint(c, YARD, i);
              return <circle key={i} cx={pt.x} cy={pt.y} r={0.5} fill={COLOR_HEX[c]} fillOpacity={0.25} />;
            })}
          </g>
        );
      })}
      {/* Centre home: four triangles */}
      <polygon points="6,6 6,9 7.5,7.5" fill={COLOR_HEX.red} />
      <polygon points="6,6 9,6 7.5,7.5" fill={COLOR_HEX.green} />
      <polygon points="9,6 9,9 7.5,7.5" fill={COLOR_HEX.yellow} />
      <polygon points="6,9 9,9 7.5,7.5" fill={COLOR_HEX.blue} />
    </g>
  );
});

function Star({ at }: { at: Pt }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.16 : 0.36;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${at.x + r * Math.cos(a)},${at.y + r * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={pts} fill={STAR} />;
}
