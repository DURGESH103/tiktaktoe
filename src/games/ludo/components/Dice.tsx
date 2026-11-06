"use client";

import clsx from "clsx";
import { motion } from "framer-motion";

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** The die. A button when it's your roll; tumbles while the server rolls. */
export function Dice({
  value,
  rolling,
  canRoll,
  onRoll,
  color,
}: {
  value: number | null;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
  color: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={canRoll && !rolling ? onRoll : undefined}
      aria-disabled={!canRoll || rolling}
      aria-label={rolling ? "Rolling…" : canRoll ? "Roll the dice" : value ? `Last roll: ${value}` : "Dice"}
      whileTap={canRoll ? { scale: 0.92 } : undefined}
      className={clsx(
        "relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white shadow-lg ring-4 transition-shadow",
        canRoll && !rolling ? "ring-[color:var(--die-ring)] shadow-[0_0_24px_var(--die-ring)]" : "ring-transparent",
      )}
      style={{ "--die-ring": color } as React.CSSProperties}
    >
      {/* Only the face spins, and the spinning face is its own element (removed when the roll ends),
          so the button never moves and a spin can't be left running. */}
      {rolling ? (
        <motion.span key="spin" className="grid" animate={{ rotate: 360 }} transition={{ duration: 0.45, repeat: Infinity, ease: "linear" }}>
          <Face value={value} />
        </motion.span>
      ) : (
        <motion.span key={`still-${value}`} className="grid" initial={{ scale: 0.7, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 380, damping: 16 }}>
          <Face value={value} />
        </motion.span>
      )}
    </motion.button>
  );
}

function Face({ value }: { value: number | null }) {
  return (
    <svg viewBox="0 0 3 3" className="h-14 w-14" aria-hidden>
      {(PIPS[value ?? 0] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x + 0.5} cy={y + 0.5} r={0.3} fill="#1f2937" />
      ))}
      {!value && (
        <text x={1.5} y={1.95} textAnchor="middle" fontSize={1.3} fill="#9ca3af">
          ?
        </text>
      )}
    </svg>
  );
}
