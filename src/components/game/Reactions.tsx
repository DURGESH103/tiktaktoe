"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
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
export function ReactionBar({
  onReact,
  scrollHint = false,
}: {
  onReact: (e: ReactionEmoji) => void;
  /**
   * Compact (36px buttons, so all eight fit on most phones). When they don't all fit, the right edge
   * fades with a "›" until you've scrolled to the end, so it's clear there are more.
   */
  scrollHint?: boolean;
}) {
  const [cooling, setCooling] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!cooling) return;
    const t = setTimeout(() => setCooling(false), SEND_COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [cooling]);

  const checkMore = useCallback(() => {
    const el = rowRef.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    if (!scrollHint || !rowRef.current) return;
    checkMore();
    const ro = new ResizeObserver(checkMore);
    ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, [scrollHint, checkMore]);

  return (
    <div className="glass relative mx-auto w-full max-w-[min(92vw,26rem)] overflow-hidden rounded-full">
      <div
        ref={rowRef}
        role="group"
        aria-label="Send a reaction"
        onScroll={scrollHint ? checkMore : undefined}
        className={clsx(
          "flex snap-x overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          scrollHint ? "gap-0" : "gap-0.5",
          scrollHint && more && "[mask-image:linear-gradient(to_right,#000_calc(100%-3.5rem),transparent)]",
        )}
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
              "grid shrink-0 snap-start place-items-center rounded-full transition-[opacity,background-color]",
              scrollHint ? "h-9 w-9 text-xl" : "h-12 w-12 text-2xl",
              cooling ? "opacity-40" : "hover:bg-fg/[0.08]",
            )}
          >
            <ReactionGlyph emoji={emoji} className={emoji === "GG" ? "text-sm" : undefined} />
          </motion.button>
        ))}
      </div>
      {scrollHint && more && (
        <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg font-bold text-fg/50">
          ›
        </span>
      )}
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
