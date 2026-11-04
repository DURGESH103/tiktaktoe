"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Player } from "@/types/db";
import { categoryLabel, knowsBetter, TITLES } from "../lib/compat";
import type { CoupleSession, Lang } from "../types";
import { HeartBurst } from "./HeartBurst";

/** End of a Compatibility Test: server-calculated %, title, who knows whom better, points. */
export function CompatSummary({
  session,
  playerX,
  playerO,
  lang,
  onPlayAgain,
  onBack,
}: {
  session: CoupleSession;
  playerX?: Player;
  playerO?: Player;
  lang: Lang;
  onPlayAgain: () => void;
  onBack: () => void;
}) {
  const pct = session.compat_pct ?? 0;
  const result = session.result ?? { x_correct: 0, o_correct: 0, same_answers: 0, title: "still_learning" as const };
  const title = TITLES[result.title];
  const better = knowsBetter(result);
  const n = session.total_rounds;
  const count = useMotionValue(0);
  const shown = useTransform(count, (v) => `${Math.round(v)}%`);
  useEffect(() => {
    const c = animate(count, pct, { duration: 1.2, ease: "easeOut" });
    return () => c.stop();
  }, [count, pct]);

  const r = 54;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col gap-4">
      <HeartBurst />
      <GlassCard className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-muted">{categoryLabel(session.category, lang)} · Compatibility</p>
        <div className="relative grid h-36 w-36 place-items-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 128 128" aria-hidden>
            <circle cx="64" cy="64" r={r} fill="none" strokeWidth="10" className="stroke-fg/10" />
            <motion.circle
              cx="64"
              cy="64"
              r={r}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              stroke="url(#compat-grad)"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
            <defs>
              <linearGradient id="compat-grad" x1="0" x2="1">
                <stop offset="0" stopColor="#f43f5e" />
                <stop offset="1" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <motion.span className="font-display text-4xl font-black tabular-nums" aria-label={`${pct} percent compatible`}>
            {shown}
          </motion.span>
        </div>
        <motion.h2 initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.9, type: "spring", stiffness: 260, damping: 14 }} className="font-display text-3xl font-bold">
          {title.label}
        </motion.h2>
        <p className="text-muted">{title.blurb[lang]}</p>
      </GlassCard>

      <GlassCard className="flex flex-col gap-3 p-5">
        <h3 className="font-display font-semibold">Who knows who better?</h3>
        <div className="grid grid-cols-2 gap-3 text-center">
          {(
            [
              [playerX, result.x_correct, playerO],
              [playerO, result.o_correct, playerX],
            ] as const
          ).map(([p, correct, other], i) => (
            <div key={i} className="flex flex-col items-center gap-1 rounded-2xl bg-fg/[0.04] p-3">
              {p && <AvatarBadge avatar={p.avatar} color={p.color} size="sm" />}
              <span className="font-display text-2xl font-bold tabular-nums">
                {correct}/{n}
              </span>
              <span className="text-xs text-muted">
                {p?.name ?? "—"} guessed {other?.name ?? "—"}&apos;s answers
              </span>
            </div>
          ))}
        </div>
        <p className="text-center font-semibold">
          {better === "tie"
            ? "You know each other equally well! 🤝"
            : `${(better === "X" ? playerX : playerO)?.name ?? "Someone"} knows ${(better === "X" ? playerO : playerX)?.name ?? "their partner"} better 👀`}
        </p>
        <p className="text-center text-sm text-muted">
          {result.same_answers} of {n} answers matched · <strong className="text-fg">+{session.points} points</strong>
        </p>
      </GlassCard>

      <Button variant="romance" size="lg" onClick={onPlayAgain}>
        Play again 💘
      </Button>
      <Button variant="ghost" onClick={onBack}>
        Back to modes
      </Button>
    </div>
  );
}
