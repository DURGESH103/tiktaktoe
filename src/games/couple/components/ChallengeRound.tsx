"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TypingDots } from "@/components/chat/ChatPanel";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Player } from "@/types/db";
import { questionText } from "../lib/compat";
import { CHALLENGE_POINTS, timerLeft, turnSeat } from "../lib/deck";
import type { CoupleQuestion, CoupleRound, CoupleSession, Lang } from "../types";

interface Props {
  session: CoupleSession;
  round: CoupleRound;
  question: CoupleQuestion;
  playerX?: Player;
  playerO?: Player;
  me: string;
  lang: Lang;
  busy: boolean;
  onStartTimer: () => void;
  onComplete: (done: boolean) => void;
  onConfirm: (ok: boolean) => void;
  onNext: () => void;
}

/**
 * One challenge: the performer starts the timer, then taps Done or Skip; the partner confirms.
 * Turns alternate each round (odd: player X, even: player O), same as on the server.
 */
export function ChallengeRound({ session, round, question, playerX, playerO, me, lang, busy, onStartTimer, onComplete, onConfirm, onNext }: Props) {
  const performer = turnSeat(round.idx) === "X" ? playerX : playerO;
  const partner = performer === playerX ? playerO : playerX;
  const mine = performer?.id === me;
  const duration = question.duration_secs ?? 60;
  const [now, setNow] = useState(() => Date.now());
  const running = !!round.timer_started_at && !round.outcome;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  const left = timerLeft(round.timer_started_at, duration, now);
  const last = session.current_round >= session.total_rounds;
  const resolved = round.outcome === "completed" || round.outcome === "failed" || round.outcome === "skipped";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Challenge {session.current_round} of {session.total_rounds}
        </span>
        <span className="font-semibold text-fg">+{session.points} pts</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={round.id} initial={{ opacity: 0, rotateX: -20, y: 20 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
          <GlassCard className="flex flex-col items-center gap-4 p-6 text-center">
            <span className="flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">
              {performer && <AvatarBadge avatar={performer.avatar} color={performer.color} size="xs" />}
              {mine ? "Your challenge!" : `${performer?.name ?? "Partner"}'s challenge`}
            </span>
            <p className="font-display text-2xl font-bold leading-snug">{questionText(question, lang)}</p>
            <TimerRing left={left} total={duration} active={running} />
          </GlassCard>
        </motion.div>
      </AnimatePresence>

      {/* Controls depend on whose turn it is and how far the challenge has got. */}
      {!round.timer_started_at && !round.outcome &&
        (mine ? (
          <div className="flex flex-col gap-2">
            <Button variant="romance" size="lg" loading={busy} onClick={onStartTimer}>
              Start timer ⏱
            </Button>
            <Button variant="ghost" onClick={() => onComplete(false)} disabled={busy}>
              Skip this one
            </Button>
          </div>
        ) : (
          <Waiting text={`Waiting for ${performer?.name ?? "your partner"} to start`} player={performer} />
        ))}

      {running &&
        (mine ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => onComplete(false)}>
              Skip
            </Button>
            <Button variant="romance" size="lg" loading={busy} onClick={() => onComplete(true)}>
              Done ✅
            </Button>
          </div>
        ) : (
          <p role="status" className="text-center font-semibold">
            {left > 0 ? `${performer?.name ?? "Your partner"} is on it… cheer them on! 📣` : "Time's up! Waiting for them to finish."}
          </p>
        ))}

      {round.outcome === "claimed" &&
        (mine ? (
          <Waiting text={`Waiting for ${partner?.name ?? "your partner"} to confirm`} player={partner} />
        ) : (
          <GlassCard className="flex flex-col gap-3 p-5 text-center">
            <p className="font-display text-lg font-semibold">Did {performer?.name ?? "they"} really do it?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" disabled={busy} onClick={() => onConfirm(false)}>
                Not quite 🙈
              </Button>
              <Button variant="romance" size="lg" loading={busy} onClick={() => onConfirm(true)} data-autofocus>
                Yes, done! 👏
              </Button>
            </div>
          </GlassCard>
        ))}

      {resolved && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col gap-3">
          <p
            role="status"
            className={clsx(
              "rounded-2xl p-3 text-center font-semibold",
              round.outcome === "completed" ? "bg-ok/15 text-ok" : round.outcome === "failed" ? "bg-danger/10 text-danger" : "bg-fg/[0.06] text-muted",
            )}
          >
            {round.outcome === "completed" && `Challenge complete! +${CHALLENGE_POINTS} points 🎉`}
            {round.outcome === "failed" && "Not quite this time — next one!"}
            {round.outcome === "skipped" && "Skipped. No worries!"}
          </p>
          <Button variant="romance" size="lg" loading={busy} onClick={onNext}>
            {last ? "See results 💞" : "Next challenge →"}
          </Button>
        </motion.div>
      )}
    </div>
  );
}

function Waiting({ text, player }: { text: string; player?: Player }) {
  return (
    <GlassCard className="flex items-center justify-center gap-3 p-4" role="status" aria-live="polite">
      {player && <AvatarBadge avatar={player.avatar} color={player.color} size="sm" />}
      <span className="flex items-center gap-2 font-semibold">
        {text} <TypingDots />
      </span>
    </GlassCard>
  );
}

function TimerRing({ left, total, active }: { left: number; total: number; active: boolean }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const urgent = active && left <= 5;
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="6" className="stroke-fg/10" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke={urgent ? "rgb(var(--danger))" : "rgb(var(--accent))"}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - left / total)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <span className={clsx("font-display text-2xl font-bold tabular-nums", urgent && "text-danger")} aria-label={`${left} seconds left`}>
        {left}s
      </span>
    </div>
  );
}
