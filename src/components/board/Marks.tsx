"use client";

import { motion } from "framer-motion";

const draw = (delay = 0) => ({
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { delay, duration: 0.28, ease: "easeOut" as const }, opacity: { delay, duration: 0.01 } },
  },
});

/** X drawn as two animated strokes. */
export function XMark({ className }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className={className}
      initial="hidden"
      animate="visible"
      aria-hidden
      style={{ filter: "drop-shadow(0 0 10px rgb(var(--x) / 0.55))" }}
    >
      <motion.path d="M26 26 L74 74" stroke="rgb(var(--x))" strokeWidth="12" strokeLinecap="round" fill="none" variants={draw(0)} />
      <motion.path d="M74 26 L26 74" stroke="rgb(var(--x))" strokeWidth="12" strokeLinecap="round" fill="none" variants={draw(0.16)} />
    </motion.svg>
  );
}

/** O drawn as one animated stroke, starting from the top. */
export function OMark({ className }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className={className}
      initial="hidden"
      animate="visible"
      aria-hidden
      style={{ filter: "drop-shadow(0 0 10px rgb(var(--o) / 0.55))" }}
    >
      <motion.circle
        cx="50"
        cy="50"
        r="25"
        stroke="rgb(var(--o))"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
        transform="rotate(-90 50 50)"
        variants={draw(0)}
      />
    </motion.svg>
  );
}
