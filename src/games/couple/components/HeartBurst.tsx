"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { Portal } from "@/components/ui/Portal";

const HEARTS = ["💖", "💕", "💗", "💓", "💞", "❤️"];

/** Couple Challenge's celebration: hearts floating up the screen. Nothing for reduced motion. */
export function HeartBurst({ count = 26 }: { count?: number }) {
  const reduce = useReducedMotion();
  const hearts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        emoji: HEARTS[i % HEARTS.length],
        left: Math.random() * 100,
        size: 18 + Math.random() * 26,
        delay: Math.random() * 0.9,
        drift: (Math.random() - 0.5) * 80,
        duration: 2.4 + Math.random() * 1.6,
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <Portal>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[55] overflow-hidden">
        {hearts.map((h) => (
          <motion.span
            key={h.id}
            className="absolute bottom-[-3rem]"
            style={{ left: `${h.left}%`, fontSize: h.size }}
            initial={{ y: 0, opacity: 0, scale: 0.6 }}
            animate={{ y: "-110vh", x: h.drift, opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{ duration: h.duration, delay: h.delay, ease: "easeOut", times: [0, 0.1, 0.8, 1] }}
          >
            {h.emoji}
          </motion.span>
        ))}
      </div>
    </Portal>
  );
}
