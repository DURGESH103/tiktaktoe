"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import type { ChallengeResult, CoupleSession, DeckResult } from "../types";
import { HeartBurst } from "./HeartBurst";

/** End of a Questions or Challenges session (Compatibility has its own CompatSummary). */
export function SessionSummary({ session, onPlayAgain, onBack }: { session: CoupleSession; onPlayAgain: () => void; onBack: () => void }) {
  const challenge = session.mode === "challenges" ? (session.result as ChallengeResult | null) : null;
  const deck = session.mode === "questions" ? (session.result as DeckResult | null) : null;

  return (
    <div className="flex flex-col gap-4">
      <HeartBurst />
      <GlassCard className="flex flex-col items-center gap-3 p-6 text-center">
        <motion.span initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 12 }} className="text-6xl" aria-hidden>
          {challenge ? "🏅" : "💬"}
        </motion.span>
        {challenge ? (
          <>
            <h2 className="font-display text-3xl font-bold">+{session.points} points</h2>
            <p className="text-muted">
              {challenge.completed} done · {challenge.failed} not quite · {challenge.skipped} skipped
            </p>
            <p className="rounded-full bg-accent/15 px-4 py-1 font-semibold text-accent" aria-label={`Challenge streak ${challenge.streak}`}>
              🔥 Challenge streak: {challenge.streak}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl font-bold">{deck?.cards ?? session.total_rounds} cards together</h2>
            <p className="text-muted">Fun → Deep → Future. Thanks for really talking 💞</p>
          </>
        )}
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
