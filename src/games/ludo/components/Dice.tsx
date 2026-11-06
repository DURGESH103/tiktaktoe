"use client";

import clsx from "clsx";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** Where each face sits on the cube, and the cube rotation that brings it to the front. */
const FACES: Record<number, { place: (half: number) => string; show: { x: number; y: number } }> = {
  1: { place: (h) => `translateZ(${h}px)`, show: { x: 0, y: 0 } },
  6: { place: (h) => `rotateY(180deg) translateZ(${h}px)`, show: { x: 0, y: 180 } },
  3: { place: (h) => `rotateY(90deg) translateZ(${h}px)`, show: { x: 0, y: -90 } },
  4: { place: (h) => `rotateY(-90deg) translateZ(${h}px)`, show: { x: 0, y: 90 } },
  2: { place: (h) => `rotateX(90deg) translateZ(${h}px)`, show: { x: -90, y: 0 } },
  5: { place: (h) => `rotateX(-90deg) translateZ(${h}px)`, show: { x: 90, y: 0 } },
};
export const ROLL_MS = 700;

/** Next resting rotation: always forward, with a couple of full turns on the way (a real tumble). */
function tumbleTo(from: { x: number; y: number }, value: number) {
  const up = (a: number, turns: number, face: number) => Math.ceil(a / 360) * 360 + turns * 360 + face;
  const f = FACES[value]?.show ?? FACES[1].show;
  return { x: up(from.x, 2, f.x), y: up(from.y, 1, f.y) };
}

/**
 * A 3D die (CSS cube, white with rounded corners and black pips). It tumbles and shakes for ~700 ms
 * whenever a new roll arrives (`rollKey` changes), so every player sees the same roll. Your own roll
 * starts spinning the moment you tap (`rolling`) and lands on the server's value when it arrives.
 * Only your own die is a button; the others are pictures.
 */
export function Dice({
  value,
  rollKey,
  rolling = false,
  canRoll = false,
  onRoll,
  active,
  size = 48,
  label,
  color,
  owner,
}: {
  value: number | null;
  /** Changes on every new roll by this player. */
  rollKey: number | null;
  /** My roll request is in flight. */
  rolling?: boolean;
  canRoll?: boolean;
  /** Set for your own die (makes it a button). */
  onRoll?: () => void;
  /** It's this player's turn (the others' dice are greyed out). */
  active: boolean;
  size?: number;
  /** Accessible name for someone else's die, e.g. "Priya's dice". */
  label?: string;
  color: string;
  /** Colour name, for tests. */
  owner: string;
}) {
  const reduce = useReducedMotion();
  const [start] = useState(() => tumbleTo({ x: 0, y: 0 }, value ?? 1));
  // All motion is transforms on motion values (no re-renders while it rolls).
  const rx = useMotionValue(start.x);
  const ry = useMotionValue(start.y);
  const lift = useMotionValue(0); // px above the table (negative = up)
  const shake = useMotionValue(0);
  // The shadow stays on the table: smaller and lighter while the die is in the air.
  const shadowScale = useTransform(lift, [-16, 0], [0.55, 1]);
  const shadowOpacity = useTransform(lift, [-16, 0], [0.15, 0.35]);
  const st = useRef({ key: rollKey, value, spinning: false, anims: [] as AnimationPlaybackControls[] });

  useEffect(() => {
    const s = st.current;
    const stop = () => {
      s.anims.forEach((a) => a.stop());
      s.anims = [];
    };
    if (rolling && !reduce) {
      // Tap → it jumps up and spins at once (no waiting); the landing below takes over when the
      // server's result arrives.
      if (!s.spinning) {
        stop();
        s.spinning = true;
        s.anims = [
          animate(rx, rx.get() + 7200, { duration: 9, ease: "linear" }),
          animate(ry, ry.get() + 5040, { duration: 9, ease: "linear" }),
          animate(lift, -14, { duration: 0.15, ease: "easeOut" }),
          animate(shake, [0, -2, 2, 0], { duration: 0.25, repeat: Infinity }),
        ];
      }
      return;
    }
    if (s.key !== rollKey || s.spinning) {
      // A new roll: tumble (or finish my spin) and land on its face with a little bounce.
      const wasSpinning = s.spinning;
      stop();
      s.spinning = false;
      s.key = rollKey;
      s.value = value;
      const t = tumbleTo({ x: rx.get(), y: ry.get() }, value ?? 1);
      if (reduce) {
        rx.set(t.x);
        ry.set(t.y);
        lift.set(0);
        shake.set(0);
        return;
      }
      const duration = wasSpinning ? 0.5 : ROLL_MS / 1000;
      const ease = [0.2, 0.75, 0.3, 1] as const;
      s.anims = [
        animate(rx, t.x, { duration, ease }),
        animate(ry, t.y, { duration, ease }),
        wasSpinning
          ? animate(lift, [lift.get(), -14, 0, -4, 0], { duration, times: [0, 0.5, 0.78, 0.9, 1], ease: "easeInOut" })
          : animate(lift, [0, -16, -12, 0, -4, 0], { duration, times: [0, 0.25, 0.55, 0.78, 0.9, 1], ease: "easeInOut" }),
        animate(shake, [shake.get(), -3, 3, -1, 0], { duration: duration * 0.6 }),
      ];
    } else if (value !== null && s.value !== value) {
      // Caught up without seeing the roll (e.g. after a reconnect): just show it.
      s.value = value;
      stop();
      const t = tumbleTo({ x: rx.get(), y: ry.get() }, value);
      rx.set(t.x);
      ry.set(t.y);
    }
  }, [rolling, rollKey, value, reduce, rx, ry, lift, shake]);
  useEffect(() => () => st.current.anims.forEach((a) => a.stop()), []);

  // Your turn, not rolled yet: an idle "ready" die ("?" faces) with a gentle wiggle.
  const ready = canRoll && !rolling;
  const half = size / 2;
  const cube = (
    <div className="relative" style={{ width: size, height: size + 6 }}>
      <motion.span
        aria-hidden
        className="absolute bottom-0 left-[10%] h-[7px] w-[80%] rounded-[50%] bg-[radial-gradient(closest-side,#000,transparent)]"
        style={{ scale: shadowScale, opacity: shadowOpacity }}
      />
      <motion.div
        animate={ready && !reduce ? { rotate: [0, -7, 7, -4, 4, 0] } : { rotate: 0 }}
        transition={ready ? { duration: 0.9, repeat: Infinity, repeatDelay: 1.1 } : { duration: 0.2 }}
        style={{ x: shake, y: lift, width: size, height: size, perspective: size * 5 }}
        className="relative"
      >
        <motion.div
          data-testid="dice-cube"
          data-color={owner}
          data-value={value ?? ""}
          style={{ rotateX: rx, rotateY: ry, width: size, height: size, transformStyle: "preserve-3d" }}
          className="relative"
        >
          {Object.entries(FACES).map(([v, f]) => (
            <div
              key={v}
              className="absolute inset-0 grid place-items-center rounded-[22%] border border-slate-300 bg-gradient-to-br from-white to-slate-100 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.12)] [backface-visibility:hidden]"
              style={{ transform: f.place(half) }}
            >
              <Face value={ready ? null : value ? Number(v) : 0} />
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );

  const box = clsx(
    "relative grid shrink-0 place-items-center rounded-2xl transition-[opacity,filter,box-shadow]",
    // Other players' dice (and yours when it isn't your turn) show the last roll faintly.
    active ? "opacity-100" : "opacity-40 grayscale",
  );
  const boxStyle = { width: size + 8, height: size + 10, "--die-ring": color } as React.CSSProperties;

  if (!onRoll) {
    return (
      <div role="img" aria-label={`${label ?? "Dice"}${value ? `: last roll ${value}` : ""}`} className={box} style={boxStyle}>
        {cube}
      </div>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={canRoll && !rolling ? onRoll : undefined}
      aria-disabled={!canRoll || rolling}
      aria-label={rolling ? "Rolling…" : canRoll ? "Roll the dice" : value ? `Dice — last roll ${value}` : "Dice"}
      whileTap={canRoll ? { scale: 0.9 } : undefined}
      className={clsx(box, canRoll && !rolling && "shadow-[0_0_0_3px_var(--die-ring),0_0_20px_var(--die-ring)]")}
      style={boxStyle}
    >
      {cube}
    </motion.button>
  );
}

/** A face: its pips; 0 = no roll yet (one faint pip); null = ready to roll ("?"). */
function Face({ value }: { value: number | null }) {
  return (
    <svg viewBox="0 0 3 3" className="h-[78%] w-[78%]" aria-hidden>
      {value === null ? (
        <text x={1.5} y={2.05} textAnchor="middle" fontSize={1.6} fontWeight={800} fill="#64748b">
          ?
        </text>
      ) : (
        (PIPS[value || 1] ?? []).map(([x, y], i) => <circle key={i} cx={x + 0.5} cy={y + 0.5} r={0.29} fill={value ? "#111827" : "#cbd5e1"} />)
      )}
    </svg>
  );
}

/** Tiny static die face (recent rolls, e.g. the sixes rolled so far this turn). */
export function MiniDie({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <svg viewBox="0 0 3 3" className={clsx("h-3.5 w-3.5 rounded-[3px] bg-white", warn ? "ring-2 ring-danger" : "ring-1 ring-slate-300")} aria-hidden>
      {(PIPS[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x + 0.5} cy={y + 0.5} r={0.32} fill="#111827" />
      ))}
    </svg>
  );
}
