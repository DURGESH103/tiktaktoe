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
      animate={rolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.1, 1] } : { rotate: 0, scale: 1 }}
      transition={rolling ? { duration: 0.5, repeat: Infinity, ease: "linear" } : { type: "spring", stiffness: 300, damping: 18 }}
      className={clsx(
        "relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white shadow-lg ring-4 transition-shadow",
        canRoll && !rolling ? "ring-[color:var(--die-ring)] shadow-[0_0_24px_var(--die-ring)]" : "ring-transparent",
      )}
      style={{ "--die-ring": color } as React.CSSProperties}
    >
      <svg viewBox="0 0 3 3" className="h-14 w-14" aria-hidden>
        {(PIPS[value ?? 0] ?? []).map(([x, y], i) => (
          <circle key={i} cx={x + 0.5} cy={y + 0.5} r={0.3} fill="#1f2937" />
        ))}
        {!value && <text x={1.5} y={1.95} textAnchor="middle" fontSize={1.3} fill="#9ca3af">?</text>}
      </svg>
    </motion.button>
  );
}
