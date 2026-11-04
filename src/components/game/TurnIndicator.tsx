"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import type { Mark } from "@/types/db";

export function TurnIndicator({ text, tone }: { text: string; tone: Mark | "neutral" | "win" }) {
  return (
    <div className="flex h-12 items-center justify-center" aria-live="polite" aria-atomic>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={clsx(
            "rounded-full px-5 py-2 font-display text-lg font-semibold",
            tone === "X" && "bg-x/15 text-x",
            tone === "O" && "bg-o/15 text-o",
            tone === "win" && "bg-gradient-to-r from-violet-600 to-pink-600 text-white",
            tone === "neutral" && "bg-fg/10 text-fg",
          )}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
