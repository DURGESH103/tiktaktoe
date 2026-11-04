"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { Player } from "@/types/db";
import { questionText } from "../lib/compat";
import { LEVELS, levelLabel, turnSeat, type Level } from "../lib/deck";
import type { CoupleQuestion, CoupleRound, CoupleSession, Lang } from "../types";

const SWIPE_PX = 90;

/**
 * Conversation deck: one card at a time, Fun → Deep → Future. The asker alternates;
 * both answer out loud (or in chat), then swipe the card away or tap Next. No score.
 */
export function QuestionsDeck({
  session,
  round,
  question,
  playerX,
  playerO,
  me,
  lang,
  busy,
  onNext,
}: {
  session: CoupleSession;
  round: CoupleRound;
  question: CoupleQuestion;
  playerX?: Player;
  playerO?: Player;
  me: string;
  lang: Lang;
  busy: boolean;
  onNext: () => void;
}) {
  const asker = turnSeat(round.idx) === "X" ? playerX : playerO;
  const myTurn = asker?.id === me;
  const level = (question.level ?? "fun") as Level;
  const last = session.current_round >= session.total_rounds;
  // First card of a new level gets a small "level up" banner.
  const newLevel = round.idx > 1 && (round.idx - 1) % 4 === 0;

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_PX || info.velocity.x < -600) onNext();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Card {session.current_round} of {session.total_rounds}
        </span>
        <span className="flex gap-1" aria-hidden>
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <span key={l} className={l === level ? "opacity-100" : "opacity-30"}>
              {LEVELS[l].emoji}
            </span>
          ))}
        </span>
      </div>

      <AnimatePresence>
        {newLevel && (
          <motion.p key={`lvl-${round.id}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="self-center rounded-full bg-accent/15 px-4 py-1 text-sm font-semibold text-accent">
            Level up: {levelLabel(level, lang)}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Card stack: the current card on top, two ghost cards behind it. */}
      <div className="relative h-[19rem]">
        <div aria-hidden className="glass absolute inset-x-6 top-4 h-full rounded-4xl opacity-40" />
        <div aria-hidden className="glass absolute inset-x-3 top-2 h-full rounded-4xl opacity-70" />
        <AnimatePresence initial={false} mode="popLayout">
          <motion.article
            key={round.id}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, x: -320, rotate: -12, transition: { duration: 0.3 } }}
            whileDrag={{ rotate: -4 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            aria-roledescription="card"
            aria-label={`${levelLabel(level, lang)} card ${session.current_round} of ${session.total_rounds}`}
            className="glass absolute inset-0 flex cursor-grab touch-pan-y flex-col justify-between rounded-4xl bg-gradient-to-br from-rose-500/15 via-bg/80 to-pink-500/10 p-6 active:cursor-grabbing"
          >
            <span className="self-start rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">{levelLabel(level, lang)}</span>
            <p className="font-display text-2xl font-bold leading-snug">{questionText(question, lang)}</p>
            <p className="text-sm text-muted">
              {myTurn ? "You ask this one — then both answer out loud or in chat." : `${asker?.name ?? "Your partner"} asks — then both answer.`}
            </p>
          </motion.article>
        </AnimatePresence>
      </div>

      <p className="text-center text-xs text-muted">Swipe the card left or tap Next.</p>
      <Button variant="romance" size="lg" loading={busy} onClick={onNext}>
        {last ? "Finish 💞" : "Next card →"}
      </Button>
    </div>
  );
}
