"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Reaction } from "@/hooks/useGameRoom";
import { REACTIONS, SEND_COOLDOWN_MS, type ReactionEmoji } from "@/lib/reactions";

/** Renders a reaction: an emoji, or "GG" as a small text badge. */
export function ReactionGlyph({ emoji, className }: { emoji: ReactionEmoji; className?: string }) {
  if (emoji === "GG")
    return (
      <span className={clsx("rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 px-1.5 font-display font-black leading-tight text-white", className)}>
        GG
      </span>
    );
  return <span className={className}>{emoji}</span>;
}

/**
 * Row of reaction buttons (48px each, scrolls sideways on narrow phones).
 * Cools down for a second after each send so nobody can spam.
 */
export function ReactionBar({ onReact }: { onReact: (e: ReactionEmoji) => void }) {
  const [cooling, setCooling] = useState(false);

  useEffect(() => {
    if (!cooling) return;
    const t = setTimeout(() => setCooling(false), SEND_COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [cooling]);

  return (
    <div className="glass mx-auto w-full max-w-[min(92vw,26rem)] overflow-hidden rounded-full">
      <div
        role="group"
        aria-label="Send a reaction"
        className="flex snap-x gap-0.5 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {REACTIONS.map(({ emoji, label }) => (
          <motion.button
            key={emoji}
            type="button"
            aria-label={`Send ${label} reaction`}
            aria-disabled={cooling}
            onClick={() => {
              if (cooling) return;
              setCooling(true);
              onReact(emoji);
            }}
            whileTap={cooling ? undefined : { scale: 1.3 }}
            className={clsx(
              "grid h-12 w-12 shrink-0 snap-start place-items-center rounded-full text-2xl transition-[opacity,background-color]",
              cooling ? "opacity-40" : "hover:bg-fg/[0.08]",
            )}
          >
            <ReactionGlyph emoji={emoji} className={emoji === "GG" ? "text-sm" : undefined} />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/**
 * Floating reactions over the player cards: each one pops out of the sender's avatar
 * (mine on the left card, the opponent's on the right) and drifts up.
 */
export function ReactionLayer({ reactions, me }: { reactions: Reaction[]; me: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden>
      <AnimatePresence>
        {reactions.map((r) => {
          const mine = r.from === me;
          // Stable per-reaction sideways drift so re-renders don't make it jump.
          const drift = ((parseInt(r.id.slice(-3), 10) || 0) % 30) - 15;
          return (
            <motion.span
              key={r.id}
              className="absolute top-1/2 -mt-6 text-4xl drop-shadow-lg"
              style={{ [mine ? "left" : "right"]: "6%" }}
              initial={{ opacity: 0, y: 0, scale: 0.3 }}
              animate={{ opacity: [0, 1, 1, 0], y: [0, -10, -60, -90], x: drift, scale: [0.3, 1.5, 1.15, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
            >
              <ReactionGlyph emoji={r.emoji} className={r.emoji === "GG" ? "text-xl" : undefined} />
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
