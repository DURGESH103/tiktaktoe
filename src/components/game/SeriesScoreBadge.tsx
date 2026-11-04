"use client";

import { AnimatePresence, motion } from "framer-motion";

/** Compact "3 : 2" series score between the two player chips, with draws underneath. */
export function SeriesScoreBadge({
  mine,
  theirs,
  draws,
  myName,
  oppName,
}: {
  mine: number;
  theirs: number;
  draws: number;
  myName: string;
  oppName: string;
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center px-1"
      role="status"
      aria-label={`Series: ${myName} ${mine}, ${oppName} ${theirs}, draws ${draws}`}
    >
      <div className="flex items-center gap-1 font-display text-xl font-bold tabular-nums" aria-hidden>
        <Num value={mine} />
        <span className="text-muted">:</span>
        <Num value={theirs} />
      </div>
      <span className="text-[11px] leading-none text-muted" aria-hidden>
        {draws} {draws === 1 ? "draw" : "draws"}
      </span>
    </div>
  );
}

function Num({ value }: { value: number }) {
  return (
    <span className="relative inline-grid min-w-[1ch] overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
