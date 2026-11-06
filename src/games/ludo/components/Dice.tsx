"use client";

import clsx from "clsx";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

const SIZE = 64; // px
const HALF = SIZE / 2;
/** Where each face sits on the cube, and the cube rotation that brings it to the front. */
const FACES: Record<number, { place: string; show: { x: number; y: number } }> = {
  1: { place: `translateZ(${HALF}px)`, show: { x: 0, y: 0 } },
  6: { place: `rotateY(180deg) translateZ(${HALF}px)`, show: { x: 0, y: 180 } },
  3: { place: `rotateY(90deg) translateZ(${HALF}px)`, show: { x: 0, y: -90 } },
  4: { place: `rotateY(-90deg) translateZ(${HALF}px)`, show: { x: 0, y: 90 } },
  2: { place: `rotateX(90deg) translateZ(${HALF}px)`, show: { x: -90, y: 0 } },
  5: { place: `rotateX(-90deg) translateZ(${HALF}px)`, show: { x: 90, y: 0 } },
};
export const ROLL_MS = 600;

/** Next resting rotation: always forward, with a couple of full turns on the way (a real tumble). */
function tumbleTo(from: { x: number; y: number }, value: number) {
  const up = (a: number, turns: number, face: number) => Math.ceil(a / 360) * 360 + turns * 360 + face;
  const f = FACES[value]?.show ?? FACES[1].show;
  return { x: up(from.x, 2, f.x), y: up(from.y, 1, f.y) };
}

/**
 * A 3D die (CSS cube). It tumbles for ~600 ms each time a new roll arrives (`rollKey` changes), so
 * every player sees the same roll; while your own roll is on its way to the server it wobbles.
 * A button when it's your roll.
 */
export function Dice({
  value,
  rollKey,
  rolling,
  canRoll,
  onRoll,
  color,
}: {
  value: number | null;
  /** Changes on every new roll (e.g. the game's seq when its last events include a roll). */
  rollKey: number | null;
  /** My roll request is in flight. */
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
  color: string;
}) {
  const reduce = useReducedMotion();
  // Rotation derived from the latest roll; recomputed during render only when a new roll arrives.
  const [spin, setSpin] = useState(() => ({ key: rollKey, value, rot: tumbleTo({ x: 0, y: 0 }, value ?? 1), animate: false }));
  if (spin.key !== rollKey || (spin.value !== value && value !== null)) {
    setSpin({ key: rollKey, value, rot: tumbleTo(spin.rot, value ?? 1), animate: spin.key !== rollKey });
  }

  return (
    <motion.button
      type="button"
      onClick={canRoll && !rolling ? onRoll : undefined}
      aria-disabled={!canRoll || rolling}
      aria-label={rolling ? "Rolling…" : canRoll ? "Roll the dice" : value ? `Last roll: ${value}` : "Dice"}
      whileTap={canRoll ? { scale: 0.92 } : undefined}
      className={clsx(
        "relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl ring-4 transition-shadow [perspective:320px]",
        canRoll && !rolling ? "ring-[color:var(--die-ring)] shadow-[0_0_24px_var(--die-ring)]" : "ring-transparent",
      )}
      style={{ "--die-ring": color } as React.CSSProperties}
    >
      {/* Wobble while my roll is in flight (its own element, so it can never be left running). */}
      <motion.div
        key={rolling ? "wobble" : "still"}
        animate={rolling && !reduce ? { rotate: [0, -12, 10, -6, 0], y: [0, -4, 0] } : { rotate: 0, y: 0 }}
        transition={rolling ? { duration: 0.4, repeat: Infinity } : { duration: 0.1 }}
        style={{ width: SIZE, height: SIZE, transformStyle: "preserve-3d" }}
      >
        <motion.div
          data-testid="dice-cube"
          data-value={value ?? ""}
          initial={false}
          animate={{ rotateX: spin.rot.x, rotateY: spin.rot.y }}
          transition={spin.animate && !reduce ? { duration: ROLL_MS / 1000, ease: [0.2, 0.7, 0.3, 1] } : { duration: 0 }}
          className="relative"
          style={{ width: SIZE, height: SIZE, transformStyle: "preserve-3d" }}
        >
          {Object.entries(FACES).map(([v, f]) => (
            <div
              key={v}
              className="absolute inset-0 grid place-items-center rounded-xl border border-slate-200 bg-white shadow-[inset_0_0_10px_rgba(0,0,0,0.12)] [backface-visibility:hidden]"
              style={{ transform: f.place }}
            >
              <Face value={value ? Number(v) : null} />
            </div>
          ))}
        </motion.div>
      </motion.div>
    </motion.button>
  );
}

function Face({ value }: { value: number | null }) {
  return (
    <svg viewBox="0 0 3 3" className="h-12 w-12" aria-hidden>
      {(PIPS[value ?? 0] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x + 0.5} cy={y + 0.5} r={0.3} fill={value === 1 ? "#dc2626" : "#1f2937"} />
      ))}
      {!value && (
        <text x={1.5} y={1.95} textAnchor="middle" fontSize={1.3} fill="#9ca3af">
          ?
        </text>
      )}
    </svg>
  );
}
