"use client";

import { motion } from "framer-motion";
import { memo } from "react";
import { HOME, LAST_LOOP, SAFE_SQUARES, START, YARD, type Color, type LudoState } from "../engine";
import { COLOR_HEX, HOME_COLUMN, LOOP, tokenPoint, YARD_ORIGIN, type Pt } from "../lib/board";

const R = 0.36; // token radius (cells)

// The board keeps its own palette in both themes, like a real board (light squares, grey lines).
const BOARD_BG = "#f8fafc";
const SQUARE = "#ffffff";
const LINE = "#cbd5e1";
const STAR = "#94a3b8";
const RING = "#111827";

/**
 * The 15×15 board as SVG (crisp at any size). Tokens slide to their square; the ones the current
 * player can move pulse and are tappable. `movable` = token indexes of `movableColor`.
 */
export function LudoBoard({
  state,
  turnColor,
  movableColor,
  movable,
  onMove,
  names,
}: {
  state: LudoState;
  turnColor: Color | null;
  movableColor: Color | null;
  movable: number[];
  onMove: (token: number) => void;
  names: Partial<Record<Color, string>>;
}) {
  // Group tokens by square so several on one square are drawn side by side.
  const placed = state.colors.flatMap((c) => (state.tokens[c] ?? []).map((p, i) => ({ c, i, p, pt: tokenPoint(c, p, i) })));
  const byCell = new Map<string, typeof placed>();
  for (const t of placed) {
    const k = `${t.pt.x},${t.pt.y}`;
    byCell.set(k, [...(byCell.get(k) ?? []), t]);
  }

  return (
    <div className="mx-auto aspect-square w-full max-w-[min(94vw,30rem)]">
      <svg viewBox="0 0 15 15" className="h-full w-full touch-manipulation select-none rounded-3xl shadow-xl" role="img" aria-label="Ludo board">
        <StaticBoard turnColor={turnColor} />
        {placed.map((t) => {
          const group = byCell.get(`${t.pt.x},${t.pt.y}`)!;
          const n = group.length;
          const k = group.indexOf(t);
          const shift = n > 1 && t.p !== YARD ? offset(k, n) : { x: 0, y: 0 };
          const scale = n > 1 && t.p !== YARD ? 0.72 : 1;
          const canMove = t.c === movableColor && movable.includes(t.i);
          return (
            <motion.g
              key={`${t.c}-${t.i}`}
              initial={false}
              animate={{ x: t.pt.x + shift.x, y: t.pt.y + shift.y, scale }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
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
              {t.p === HOME && <circle r={R + 0.06} fill="none" stroke="#fde68a" strokeWidth={0.06} />}
            </motion.g>
          );
        })}
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
