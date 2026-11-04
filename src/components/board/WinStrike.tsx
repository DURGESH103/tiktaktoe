"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Mark } from "@/types/db";

// Cell centres in a 300×300 box. The overlay sits inside the board padding, so with
// symmetric gaps each cell centre lands on 1/6, 3/6, 5/6 of the width.
const center = (i: number) => ({ x: 50 + (i % 3) * 100, y: 50 + Math.floor(i / 3) * 100 });
const OVERSHOOT = 34;

/** Animated line drawn through the winning three cells. */
export function WinStrike({ line, mark }: { line: number[]; mark: Mark }) {
  const reduce = useReducedMotion();
  const a = center(line[0]);
  const b = center(line[2]);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = ((b.x - a.x) / len) * OVERSHOOT;
  const dy = ((b.y - a.y) / len) * OVERSHOOT;
  const color = `rgb(var(--${mark === "X" ? "x" : "o"}))`;

  return (
    <svg viewBox="0 0 300 300" className="pointer-events-none absolute inset-2 sm:inset-3" aria-hidden>
      <motion.line
        x1={a.x - dx}
        y1={a.y - dy}
        x2={b.x + dx}
        y2={b.y + dy}
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: reduce ? 0 : 0.3, duration: reduce ? 0 : 0.45, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
